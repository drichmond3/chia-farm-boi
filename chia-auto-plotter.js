const PlottingService = require("./chia-plotting-service");
const { prompt, sleep, isPositive, log, listFilesInDirectory, runCommand } = require("./command-line-utils");
const { getDriveUniqueId, findTemporaryDrives } = require("./windows-chia-utils");

const LOG_FILE = `./auto_plotter/${Date.now()}.log`;
const service = new PlottingService();

let PLOTTING_DELAY_IN_MINUTES = 25;
let MAX_RETRY_ATTEMPTS = 2;
let CORE_COUNT = 10;
let MAX_THREADS_PER_SSD = 10;

let knownDrives = ['E:', 'C:']; //boot drive and it's partition
let plotsInProgress = {};

let main = async ()=>{
	const ssdCount = (await findTemporaryDrives()).length;
	const MAX_CONCURRENT_THREADS = Math.min(CORE_COUNT, MAX_THREADS_PER_SSD * ssdCount);

	log("Beginning chia auto plotter");
	console.log("Beginning chia auto plotter");
	service.execute(PLOTTING_DELAY_IN_MINUTES, MAX_CONCURRENT_THREADS);
  repl(); //The only thread allowed to print to std out.
}

let repl = async ()=>{
  while(true){
    console.log("available commands: plot, status, config");
    let command = await prompt("");
    if(command == "plot"){
      await driveDiscovery();
    } else if(command == "status"){
      await printStatus();
    } else if(command == "config"){
      await updateConfig();
    }
    await sleep(500);
  }
}

let driveDiscovery = async ()=> {
	let drivesToSkip = await getDrivesToSkip();
	let commandsByPlottableDrives = await service.buildPlotCommandsForAvailableDrives(drivesToSkip, MAX_THREADS_PER_SSD);
	if(commandsByPlottableDrives){
		for(unixDeviceFile in commandsByPlottableDrives){
			let {commands, logDirectory, plotCount} = commandsByPlottableDrives[unixDeviceFile];
			let resp = await prompt(`New Drive ${unixDeviceFile} found. Do you want to plot here?`,100000,'y');
			if(isPositive(resp)){
				await plotToDrive(unixDeviceFile, commands, logDirectory, plotCount);
        console.log("Logs found " + logDirectory);
			}
		}
	}
  if(!commandsByPlottableDrives || Object.keys(commandsByPlottableDrives) == 0){
    console.log("No new drives found. Use 'status' to view ongoing drive plots");
  }
}

let printStatus = async ()=> {
  let response = {};
  for(drive in plotsInProgress){
    let drivePlottingData = plotsInProgress[drive];
    let logs = (await listFilesInDirectory(drivePlottingData.logDirectory)).filter(name=>name.includes(".log"));

    let findPhaseCount = (log)=>runCommand(`type ${log} findstr "Starting phase"`).split(/\r?\n/).length;
    let completedPhases = logs.reduce((findPhaseCount), 0);
    let remainingPhases = drivePlottingData.plotCount*4 - completedPhases;

    let timeSpentInMilliseconds = drivePlottingData.startTime ? Date.now() - drivePlottingData.startTime : 0;
    let timeReaminingInMilliseconds = completedPhases ? timeSpentInMilliseconds* remainingPhases / completedPhases : 0;

    response[drive] = {
      totalPlots: drivePlottingData.plotCount,
      timeSpentInHours: timeSpentInMilliseconds/1000/60/60,
      timeRemaining: timeReaminingInMilliseconds/1000/60/60,
    }
  }
  console.log(response);
}

let updateConfig = async ()=>{
  PLOTTING_DELAY_IN_MINUTES = parseInt(await prompt(`PLOTTING_DELAY_IN_MINUTES [${PLOTTING_DELAY_IN_MINUTES}]`)) || PLOTTING_DELAY_IN_MINUTES;
  MAX_RETRY_ATTEMPTS = parseInt(await prompt(`MAX_RETRY_ATTEMPTS [${MAX_RETRY_ATTEMPTS}]`)) || MAX_RETRY_ATTEMPTS;
  CORE_COUNT = parseInt(await prompt(`CORE_COUNT [${CORE_COUNT}]`)) || CORE_COUNT;
  MAX_THREADS_PER_SSD = parseInt(await prompt(`MAX_THREADS_PER_SSD [${MAX_THREADS_PER_SSD}]`)) || MAX_THREADS_PER_SSD;
}

let retryThread = async ()=>{

	while(true){
		log("Top of retry thread");
		let keysToDelete = [];
		for(unixDeviceFile in plotsInProgress){
			const drivePlot = plotsInProgress[unixDeviceFile];
			if(drivePlot.failureFlag && drivePlot.commandsLeft.length == 0){
				if(drivePlot.failureCount >= MAX_RETRY_ATTEMPTS){
					log(`Drive ${unixDeviceFile} had failed plots again. Max retry count has been exceeded removing drive from retry list.`);
					log("The following commands failed");
					log(drivePlot.failedCommands);
					keysToDelete.push(unixDeviceFile);
				}
				log(`adding drive ${unixDeviceFile} with failed plots to retry pool. This is retry number ${drivePlot.failureCount + 1}`);
				drivePlot.failureFlag = false;
				drivePlot.retryFlag = true;
				drivePlot.failureCount = drivePlot.failureCount + 1;
			}
		}
		keysToDelete.forEach(unixDeviceFile=>delete plotsInProgess[unixDeviceFile]);
		await sleep(1 * 60 * 1000);
	}
}

let getDrivesToSkip = async ()=>{
	let driveToUniqueId = {};
	for(unixDeviceFile in plotsInProgress){
		driveToUniqueId[unixDeviceFile] = await getDriveUniqueId(unixDeviceFile);
	}

	let inProgressDrives = [...Object.keys(plotsInProgress).filter(driveKey=>plotsInProgress[driveKey].retryFlag == false)]
	let verifiedInProgressDrives = inProgressDrives.filter(drive=>driveToUniqueId[drive] == plotsInProgress[drive].uniqueId);
	return [...knownDrives, ...verifiedInProgressDrives]; 
}

let plotToDrive = async (unixDeviceFile, commands, logDirectory, plotCount)=>{
	let driveUniqueId = await getDriveUniqueId(unixDeviceFile);
	plotsInProgress[unixDeviceFile] = plotsInProgress[unixDeviceFile] || {
		uniqueId: driveUniqueId,
		failureCount: -1	
	};
	plotsInProgress[unixDeviceFile] = {
		...plotsInProgress[unixDeviceFile], 
		failureFlag: false,
		retryFlag: false,
		commandsLeft: {},
		originalCommands: {},
		failedCommands: {},
    logDirectory,
    plotCount,
    startTime: null
	}
	let start = ()=>plotsInProgress[unixDeviceFile].startTime = Date.now();

	commands.forEach((command)=>{
		commandId = uuid();
		let success = buildCommandCallback(unixDeviceFile, commandId);
		let failure = buildCommandFailureCallback(unixDeviceFile, commandId);

		plotsInProgress[unixDeviceFile].commandsLeft[commandId] = command;
		plotsInProgress[unixDeviceFile].originalCommands[commandId] = command;
		service.addCommandToExecute(command, start, success, failure);
	});
}

let buildCommandCallback = (unixDeviceFileName, commandId) => {
	return ()=>{
		delete plotsInProgress[unixDeviceFileName].commandsLeft[commandId];	
	}
}

let buildCommandFailureCallback = (unixDeviceFileName, commandId) => {
	return (error, stdError)=>{
		let drivePlots = plotsInProgress[unixDeviceFileName];
		drivePlots.failureFlag = true;
		delete drivePlots.commandsLeft[commandId]; 
		drivePlots.failedCommands.push(drivePlots.originalCommands[commandId]);

		log("!!!!!!!!!Unexpected Error!!!!!!!!!");
		log("The following command has failed. System will retry once remaining plots are finished" + command);
	}

}

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}


//Run the auto-plotter
main();

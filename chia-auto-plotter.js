const PlottingService = require("./chia-plotting-service");
const { prompt, sleep, isPositive, log, runCommand, getHostname, uuid } = require("./command-line-utils");
const { getDriveUniqueId, createDirectory, findPlottableDrives, countCompletedPlots, getDriveFreeSpace } = require("./chia-utils");
var nodemailer = require('nodemailer');

let {
	PLOTTING_DELAY_IN_MINUTES, 
	MAX_RETRY_ATTEMPTS, 
	CORE_COUNT, 
	KNOWN_DRIVES, 
	MAIL_FROM_ADDRESS, 
	MAIL_TO_ADDRESS, 
	MAIL_PASSWORD, 
	TEMPORARY_DRIVES, 
	LOG_DIRECTORY
} = require("./config.json");

const { unmount } = require("./windows-chia-utils");

const LOG_FILE = `${LOG_DIRECTORY}/${Date.now()}.log`;

let service = null;

let plotsInProgress = {};

let main = async ()=>{
	log("Beginning chia auto plotter");
	console.log("Beginning chia auto plotter");
	console.log("Max concurrent threads " + CORE_COUNT);
	service = new PlottingService(TEMPORARY_DRIVES, PLOTTING_DELAY_IN_MINUTES, CORE_COUNT);
	service.execute(PLOTTING_DELAY_IN_MINUTES, CORE_COUNT);
	repl();
	cleanupThread();
}

let repl = async ()=>{
  while(true){
    console.log("available commands: plot, status, config, auto");
    let command = await prompt("");
    if(command == "plot"){
      let drivesFound = await driveDiscovery();
      if(!drivesFound){
        console.log("No new drives found. Use 'status' to view ongoing drive plots");
      }
    } else if(command == "status"){
      await printStatus();
    } else if(command == "config"){
      await updateConfig();
    } else if(command == "auto"){
    	await autoDiscoverRepl();
    }
    PLOT_QUESTION_TIMER = undefined;
    await sleep(500);
  }
}

let autoDiscoverRepl = async ()=>{
	let autoDiscover = true;
	const infoMessage = "type stop to cancel auto-discovery...";
	console.log(infoMessage);
	while(autoDiscover){
		try{
			let command = await prompt("", 5000, "plot");
			if(command == "plot"){
				await driveDiscovery(1000);
			} else if(command == "stop"){
				return true;
			} else {
				console.log(infoMessage);
			}
		}
		catch(e){
			log(e);
			e && e.message && log(e.message);
			e && e.stackTrace && log(e.stackTrace);
		}
	}
}
let driveDiscovery = async (questionTimeout)=> {
	let drivesToSkip = await getDrivesToSkip();
	let plottableDrives = await findPlottableDrives(drivesToSkip);
	if(plottableDrives){
		for(let driveIndex in plottableDrives){
			let {drive : unixDeviceFile, freeSpace, location} = plottableDrives[driveIndex];
			let resp = await prompt(`New Drive ${unixDeviceFile} found. Do you want to plot here?`,questionTimeout,'y');
			if(isPositive(resp)){
				await plotToDrive(unixDeviceFile, LOG_DIRECTORY, location);
			}
		}
	}
	return plottableDrives && plottableDrives.length > 0;
}

let printStatus = async ()=> {
	let response = {};
	const PLOT_SIZE = 108;
	for(let drive in plotsInProgress){
		let drivePlottingData = plotsInProgress[drive];
		let completedPlots = await countCompletedPlots(drivePlottingData.logDirectory);
		let timeSpentInMilliseconds = drivePlottingData.startTime ? Date.now() - drivePlottingData.startTime : 0;

		let plotRate = completedPlots / timeSpentInMilliseconds;
		let freeSpace = await getDriveFreeSpace(drive);
		let remainingPlots = freeSpace / PLOT_SIZE;

		let timeRemainingInMilliseconds = remainingPlots / plotRate;
		let timeRemainingInHours = timeRemainingInMilliseconds / 1000 / 60 / 60;
		let timeSpentInHours = timeSpentInMilliseconds / 1000 / 60 / 60;
		response[drive] = {
			completedPlots,
			remainingPlots,
			plotRate,
			spaceToFill: freeSpace + " GB",
			timeSpentInHours,
			timeRemainingInHours,
			threads: service.getThreadCountForDrive(drivePlottingData.location)

		}
	}
	console.log(response);
}

let updateConfig = async ()=>{
	PLOTTING_DELAY_IN_MINUTES = parseInt(await prompt(`PLOTTING_DELAY_IN_MINUTES [${PLOTTING_DELAY_IN_MINUTES}]`)) || PLOTTING_DELAY_IN_MINUTES;
	MAX_RETRY_ATTEMPTS = parseInt(await prompt(`MAX_RETRY_ATTEMPTS [${MAX_RETRY_ATTEMPTS}]`)) || MAX_RETRY_ATTEMPTS;
	CORE_COUNT = parseInt(await prompt(`CORE_COUNT [${CORE_COUNT}]`)) || CORE_COUNT;

	service.updateCpuThreadLimit(CORE_COUNT);
	service.updateDelay(PLOTTING_DELAY_IN_MINUTES);
}

let cleanupThread = async ()=>{
	while(true){
		for(let unixDeviceFile in plotsInProgress){
			const drivePlot = plotsInProgress[unixDeviceFile];
			if(drivePlot.failureCount >= MAX_RETRY_ATTEMPTS && drivePlot.failed == false){
				let message = `drive  ${unixDeviceFile} at ${drivePlot.location} has exceeded the maximum number of allowed failure plots. Manual override required to continue retrying.`;
				log("--------------------------------------------------------------------------");
				log(message);
				log("--------------------------------------------------------------------------");
				sendNotification(`${getHostname()}'s Drive ${drivePlot.location} Failed`, message);
				drivePlot.failed = true
				drivePlot.finalized = true;
				service.removeDrive(drivePlot.location);
			}
		}
		await sleep(20000);
	}
}

let completeDrivePlot = (unixDeviceFile)=>{
	const drivePlot = plotsInProgress[unixDeviceFile];
	if(!drivePlot.finalized){
		let message = `Drive ${unixDeviceFile} completed successfully`;
		let subject = `Plotting Notification on ${getHostname()}`;
		sendNotification(subject, message);
		service.removeDrive(drivePlot.location);
		unmount(unixDeviceFile);
		drivePlot.finalized = true;
	}
}

let sendNotification = (subject, message)=>{
	log("Sending a notification email '" + message + "'");
	let transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: MAIL_FROM_ADDRESS,
			pass: MAIL_PASSWORD
		}
	});

	let mailOptions = {
		from: MAIL_FROM_ADDRESS,
		to: MAIL_TO_ADDRESS,
		subject: subject,
		message: message
	};

	transporter.sendMail(mailOptions, function(error, info){
		if (error) {
			log(error.message);
		}
	});
}

let getDrivesToSkip = async ()=>{
	let driveToUniqueId = {};
	for(let unixDeviceFile in plotsInProgress){
		driveToUniqueId[unixDeviceFile] = await getDriveUniqueId(unixDeviceFile);
	}

	let inProgressDrives = [...Object.keys(plotsInProgress)]
	let verifiedInProgressDrives = inProgressDrives.filter(drive=>driveToUniqueId[drive] == plotsInProgress[drive].uniqueId);
	return [...KNOWN_DRIVES, ...verifiedInProgressDrives]; 
}

let plotToDrive = async (unixDeviceFile, baseLogDirectory, location)=>{
	try{
		log( `Plotting to ${unixDeviceFile} at ${location}` );
		let driveUniqueId = await getDriveUniqueId(unixDeviceFile);
		let cleanedDriveName = location.substring(location.lastIndexOf("/")).replace(":","");
		let logDirectory = baseLogDirectory + cleanedDriveName;
		createDirectory(logDirectory);
		plotsInProgress[unixDeviceFile] = {
			uniqueId: driveUniqueId,
			location,
			logDirectory,
			startTime: null,
			failureCount: 0,
			failed: false,
			finalized: false
		}
		let start = ()=>plotsInProgress[unixDeviceFile].startTime = Date.now();
		let success = buildCommandCallback(unixDeviceFile);
		let failure = buildCommandFailureCallback(unixDeviceFile);
		service.addDestinationDrive(location, logDirectory, start, success, failure);
	} catch(e){
		log(e);
	}
}

let buildCommandCallback = (unixDeviceFileName, commandId) => {
	return ()=>{
		completeDrivePlot(unixDeviceFile);
	}
}

let buildCommandFailureCallback = (unixDeviceFileName, commandId) => {
	return ()=>{
		try{
			plotsInProgress[unixDeviceFileName].failureCount++;
		} catch(e){
			log(e.message);
			log(e.stackTrace);
		}
	}

}


//Run the auto-plotter
main();

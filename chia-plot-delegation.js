const plotter = require("./chia-plotter.js");
const {log} = require("./chia-utils");

let buildPlottingCommandsForDrive = async(driveData, ssds, MAX_THREADS_PER_SSD) =>{
  const logDirectory = `logs/${Date.now()}`;
	let commandsAndPlotsBySSD = await _buildPlottingCommandsForDrive(driveData, ssds, MAX_THREADS_PER_SSD, logDirectory);
  let nextStep =  buildAlternatingSSDCommands(commandsAndPlotsBySSD, logDirectory);
  return nextStep;
}
let _buildPlottingCommandsForDrive = async (driveData, ssds, MAX_THREADS_PER_SSD, logDirectory) => {
	//only consider the maximum space that can be used with our max thread limitation.
	log("Building commands for drive " + driveData.location);
	ssds.forEach((ssd)=>ssd.freeSpace = Math.floor(MAX_THREADS_PER_SSD*.25, ssd.freeSpace));
	let commandsAndLogsBySSD = {};
	let totalSpaceToFill = driveData.freeSpace.replace(/[^\d.-]/g,'')/1000;
	let totalSSDSpace = ssds.reduce((total,ssd)=>total + ssd.freeSpace, 0);

  for(let ssdIndex = 0; ssdIndex < ssds.length; ssdIndex++){
		let ssd = ssds[ssdIndex];
		let maxThreads = Math.floor(MAX_THREADS_PER_SSD, ssd.freeSpace/.25);
		let sectionSpace = totalSpaceToFill * (ssd.freeSpace/totalSSDSpace);
	  	console.log(`--------SSD ${ssd} is responsible for filling ${sectionSpace} TB, and will run ${maxThreads} threads in parallel`);
		const {commands, plotCount} = await plotter({
			hardDriveSpace: sectionSpace,
			maxConcurrency: maxThreads,
			temporaryDrive: ssd.location,
			destinationDrive: driveData.location,
     			logDirectory
		});
		commandsAndLogsBySSD[ssdIndex] = {commands, plotCount};
	}
	return commandsAndLogsBySSD;
}

let buildAlternatingSSDCommands = (commandsAndPlotsBySSD, logDirectory)=> {
	commands = [];
	lastSize = -1;
  const plotCount = Object.keys(commandsAndPlotsBySSD).reduce((total,ssd)=>commandsAndPlotsBySSD[ssd].plotCount + total, 0);
	while(commands.length != lastSize){
		lastSize = commands.length;
		for(let ssdIndex in commandsAndPlotsBySSD){
			commandsAndPlotsBySSD[ssdIndex].commands.length &&
			commands.push(commandsAndPlotsBySSD[ssdIndex].commands.splice(0,1)[0]);
  	}
	}
	return {commands, logDirectory, plotCount};
}

module.exports = buildPlottingCommandsForDrive;

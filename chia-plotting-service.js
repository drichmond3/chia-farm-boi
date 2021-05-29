const buildPlottingCommandsForDrive = require ("./chia-plot-delegation");
const {findPlottableDrives, sleep, generatePlotCommand} = require('./chia-utils');
const { exec } = require('child_process');
const { log } = require('./command-line-utils');
const SSDManager = require('./ssd-manager');

const KNOWN_DRIVES = ['/dev/sdb2', '/dev/sdb1'];
const PLOT_SIZE = .1089 //measured in terabytes

module.exports = class PlottingService {
	constructor(ssds){
		this._running = false;
		this._ssds = ssds;
		this._ssdManagers = ssds.map(ssd=> new SSDManager(ssd.location, ssd.freeSpace/PLOT_SIZE));
		this._destinationDrives = [];
		this._executionId = 0;
	}

	async execute(delayInMinutes, cpuThreadLimit) {
		this._running = true;
		let sleepTimeInMilliseconds = delayInMinutes * 60 * 1000;
		while(this._running) {
			await sleep(10*1000);
			let ssdManager = Object.keys(this._ssdManagers).find(ssdLocation=>(
				this._ssdManagers[ssdLocation].isFull;
			));
			let destination = this._destinationDrives.find(this._getProjectedSpace(drive.location) > 150);
			if(!ssdManager || !destination){
				continue;
			}

			let executionId = this._getExecutionId();
			let logFile = destination.logDirectory + "/" + executionId + ".log";
			ssdManager.plot(destination.location, logFile, executionId); 
			
			await sleep(sleepTimeInMilliseconds);
		}
	}

	_getExecutionId(){
		this._executionId++;
		return this._executionId;
	}

	_getProjectedSpace(location){
		let projectedSpace = getDriveFreeSpace(location) - this._ssdManagers.reduce((total,manager)=>total+manager.getThreadCountForDrive(location),0)*PLOT_SIZE*1000;
		console.log("Projected freespace for drive " + location + " is " + projectedSpace + " GB");
	}

	addDestinationDrive(location, logDirectory){
		if(!(location in this._destinationDrives)){
			this._destinationDrives.push({location, logDirectory}); 
		}
		else {
			log("Ignoring duplicate destination directory " + location);
		}
	}
}

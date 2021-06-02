const buildPlottingCommandsForDrive = require ("./chia-plot-delegation");
const {findPlottableDrives, sleep, generatePlotCommand, getDriveFreeSpace} = require('./chia-utils');
const { exec } = require('child_process');
const { log } = require('./command-line-utils');
const SSDManager = require('./ssd-manager');

const KNOWN_DRIVES = ['/dev/sdb2', '/dev/sdb1'];
const PLOT_SIZE = .1089 //measured in terabytes
const SSD_PLOT_SIZE = .25;
const FULL_SPACE_GB = 110;

module.exports = class PlottingService {
	constructor(ssds, delayInMinutes, cpuThreadLimit){
		this._running = false;
		this._ssds = ssds;
		this._ssdManagers = ssds.map(ssd=> new SSDManager(ssd.location, parseInt(ssd.freeSpace/SSD_PLOT_SIZE)));
		this._destinationDrives = [];
		this._executionId = 0;
		this._delayInMinutes = delayInMinutes;
		this._cpuThreadLimit = cpuThreadLimit;
	}

	async execute() {
		this._running = true;
		while(this._running) {
			if(this._cpuThreadLimit <= this._ssdManagers.reduce((total, manager)=>total + manager.threadCount, 0)){
				await sleep(10*1000);
				continue;	
			}
			let ssdManagerLocation = Object.keys(this._ssdManagers).find(ssdLocation=>(
				this._ssdManagers[ssdLocation].isFull == false
			));
			let destination = undefined;
			for(let driveIndex in this._destinationDrives){
				const drive = this._destinationDrives[driveIndex];
				const spaceRemaining = await this._getProjectedSpace(drive.location)
				if(spaceRemaining > FULL_SPACE_GB){
					destination = drive;
					break;
				}
			}

			if(!ssdManagerLocation || !destination){
				await sleep(10*1000);
				continue;
			}
			let ssdManager = this._ssdManagers[ssdManagerLocation];

			let executionId = this._getExecutionId();
			let logFile = destination.logDirectory + "/" + executionId + ".log";
			let location = destination.location;
			log(`Drive ${location} | Free Space ${await getDriveFreeSpace(location)} GB | Threads ${this.getThreadCountForDrive(location)} |` +
				` In Progress ${this.getThreadCountForDrive(location)*PLOT_SIZE*1000} GB | Unallocated Space ${(await this._getProjectedSpace(location))}`);

			ssdManager.plot(destination.location, logFile, executionId, {success: this._onPlotSuccess.bind(this, destination), failure: destination.callback.failure}); 
			destination.callback.start()
			let sleepTimeInMilliseconds = this._delayInMinutes * 60 * 1000;
			await sleep(sleepTimeInMilliseconds);
		}
	}

	addDestinationDrive(location, logDirectory, start, success, failure){
		start = start || (()=>{});
		failure = failure || (()=>{});
		success = success || (()=>{});
		if(!(location in this._destinationDrives)){
			this._destinationDrives.push({location, logDirectory, callback : {start, success, failure}}); 
		}
		else {
			log("Ignoring duplicate destination directory " + location);
		}
	}

	updateCpuThreadLimit(cpuThreadLimit){
		this._cpuThreadLimit = cpuThreadLimit;
	}

	updateDelay(delayInMinutes){
		this._delayInMinutes = delayInMinutes
	}

	getThreadCountForDrive(location){
		return this._ssdManagers.reduce((total,manager)=>total+manager.getThreadCountForDrive(location),0);
	}

	removeDrive(location){
		let driveIndexToRemove = this._destinationDrives.findIndex(drive=>drive.location == location);
		if(driveIndexToRemove >=0){
			this._destinationDrives.splice(driveIndexToRemove, 1);
			log("Removing drive from plotting service: " + location);
		}
	}

	async _onPlotSuccess(drive){
		let freeSpace = await getDriveFreeSpace(drive.location);
		log(`Completed plot for ${drive.location}, ${freeSpace} GB remaining`);
		if(freeSpace <= FULL_SPACE_GB){
			drive.callback.success();
		}
	}

	_getExecutionId(){
		this._executionId++;
		return this._executionId;
	}

	async _getProjectedSpace(location){
		let projectedSpace = (await getDriveFreeSpace(location)) - this.getThreadCountForDrive(location)*PLOT_SIZE*1000;
		return projectedSpace;
	}

}

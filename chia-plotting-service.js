const buildPlottingCommandsForDrive = require ("./chia-plot-delegation");
const {findPlottableDrives, sleep, generatePlotCommand} = require('./chia-utils');
const { exec } = require('child_process');
const { log } = require('./command-line-utils');
const SSDManager = require('./ssd-manager');

const KNOWN_DRIVES = ['/dev/sdb2', '/dev/sdb1'];
const PLOT_SIZE = .1089 //measured in terabytes

module.exports = class PlottingService {
	constructor(ssds, delayInMinutes, cpuThreadLimit){
		this._running = false;
		this._ssds = ssds;
		this._ssdManagers = ssds.map(ssd=> new SSDManager(ssd.location, ssd.freeSpace/PLOT_SIZE));
		this._destinationDrives = [];
		this._executionId = 0;
		this._delayInMinutes = delayInMinutes;
		this._cpuThreadLimit = cpuThreadLimit;
	}

	async execute() {
		this._running = true;
		while(this._running) {
			await sleep(10*1000);
			if(this._cpuThreadLimit <= this._ssdManagers.reduce((total, manager)=>total + manager.threadCount, 0)){
				continue;	
			}
			let ssdManager = Object.keys(this._ssdManagers).find(ssdLocation=>(
				this._ssdManagers[ssdLocation].isFull == false;
			));
			let destination = this._destinationDrives.find(this._getProjectedSpace(drive.location) > 130);
			if(!ssdManager || !destination){
				continue;
			}

			let executionId = this._getExecutionId();
			let logFile = destination.logDirectory + "/" + executionId + ".log";
			ssdManager.plot(destination.location, logFile, executionId, {success: _onPlotSuccess.bind(this, destination), failure: destination.callback.failure}); 
			destination.callback.start()

			let sleepTimeInMilliseconds = this._delayInMinutes * 60 * 1000;
			await sleep(sleepTimeInMilliseconds);
		}
	}

	addDestinationDrive(location, logDirectory, start, success, failure){
		start = start || ()=>{};
		failure = failure || ()=>{};
		success = success || ()=>{};
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

	_onPlotSuccess(drive){
		if(getDriveFreeSpace(drive.location) <= 130){
			drive.callback.success();
		}
	}

	_getExecutionId(){
		this._executionId++;
		return this._executionId;
	}

	_getProjectedSpace(location){
		let projectedSpace = getDriveFreeSpace(location) - getThreadCountForDrive(location)*PLOT_SIZE*1000;
		console.log("Projected freespace for drive " + location + " is " + projectedSpace + " GB");
	}

}

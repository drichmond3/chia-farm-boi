const {generatePlotCommand} = require('./chia-utils');
const {runCommand} = require('./command-line-utils');
module.exports = class SSDManager{

	constructor(ssd, maxThreads)
	{
		this._ssd = ssd;
		this._inProgress = {};
		this._maxThreads = maxThreads;
	}

	async plot(destinationDrive, logFile, id){
		try{
			this._inProgress[destinationDrive] = this._inProgress[destinationDrive] || {};
			this._inProgress[destinationDrive].push(id);
			let command = generatePlotCommand({temporaryDrive : ssd, destinationDrive, logFile});
			await runCommand(command)
		}
		catch(e){
			log("Plotting to drive " + destinationDrive + " from ssd " + ssd + " failed.");
			log(e.message);
			log(e.stackTrace);
		}
		finally{
			this._inProgress.splice(this._inProgress.indexOf(id), 1);	
		}
	}

	getThreadCountForDrive(drive){
		return this._inProgress[drive].length;
	}

	get isFull(){
		return this.threadCount >= this._maxThreads;
	}

	get threadCount(){
		return Object.keys(this._inProgress).reduce((total,drive)=>total+this._inProgress[drive].length);
	}
}

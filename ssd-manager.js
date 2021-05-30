const {generatePlotCommand} = require('./chia-utils');
const {runCommand, log, sleep} = require('./command-line-utils');
module.exports = class SSDManager{

	constructor(ssd, maxThreads)
	{
		this._ssd = ssd;
		this._inProgress = {};
		this._maxThreads = parseInt(maxThreads);
		log(`new ssd manager ${ssd} with ${maxThreads} threads`);
	}

	async plot(destinationDrive, logFile, id, callbacks){
		let command = undefined;
		try{
			this._inProgress[destinationDrive] = this._inProgress[destinationDrive] || [];
			this._inProgress[destinationDrive].push(id);
			command = generatePlotCommand({temporaryDrive : this._ssd, destinationDrive, logFile});
			log(`Plotting to ${destinationDrive} on ${this._ssd} using this command: ${command}`);
			await runCommand(command);
			callbacks.success();
		}
		catch(e){
			log("Plotting to drive " + destinationDrive + " from ssd " + this._ssd + " failed.");
			log("Failed to execute command " + command);
			log(e.message);
			log(e.stackTrace);
			callbacks.failure();
		}
		finally{
			this._inProgress[destinationDrive].splice(this._inProgress[destinationDrive].indexOf(id), 1);	
		}
	}

	getThreadCountForDrive(drive){
		return this._inProgress[drive] ? this._inProgress[drive].length : 0;
	}

	get isFull(){
		return this.threadCount >= this._maxThreads;
	}

	get threadCount(){
		return Object.keys(this._inProgress).reduce((total,drive)=>total+this._inProgress[drive].length, 0);
	}
}

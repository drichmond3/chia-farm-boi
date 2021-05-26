const buildPlottingCommandsForDrive = require ("./chia-plot-delegation");
const {findPlottableDrives, findTemporaryDrives, sleep} = require('./chia-utils');
const { exec } = require('child_process');
const { log } = require('./command-line-utils');

const KNOWN_DRIVES = ['/dev/sdb2', '/dev/sdb1'];

module.exports = class PlottingService {
	constructor(){
		this._commandsToExecute = []; //{command:"bla bla", success:()=>{}, failure:()=>{}}
		this._running = false;
		this._activeThreadCount = 0;
	}

	async executeSingleCommand (command){
		log("Executing " + command);
		return new Promise((resolve, reject)=>{
			exec(command,{},(error, stdout, stderr) => {
				if(error){
					//let caller know so they can retry if they want.
					reject({error, stderr});
				}
				resolve(stdout);
			});
		});
	}

	async mockExecuteSingleCommand(command){
		log("In Test Mode: Executing " + command);
		console.log(command);
		return new Promise((resolve, reject)=>{
			exec(command,{},(error, stdout, stderr) => {
				sleep(1000).then(resolve);
			});
		});
	}

	async execute( delayInMinutes, maxConcurrentThreads) {
		this._running = true;
		let sleepTimeInMilliseconds = delayInMinutes * 60 * 1000;
		while(this._running) {
			if(this._commandsToExecute.length <= 0 || this._activeThreadCount >= maxConcurrentThreads){
				await sleep(10000);
				continue;
			}
			let commandData = this._commandsToExecute.splice(0,1)[0];
			let command = commandData.command;

			this.mockExecuteSingleCommand(command)
				.then(commandData.success)
				.catch(commandData.failure)
			commandData.start();
			this._activeThreadCount++;
			await sleep(sleepTimeInMilliseconds);
		}
	}

	addCommandToExecute(command, start, successCallback, failureCallback){
		this._commandsToExecute.push({
			command,
			start,
			success : (stdout)=>{
				log("Thread completed");
				this._activeThreadCount--;
				successCallback(stdout)
			},
			failure : (error, stderror)=>{ 
				log("Thread errored out!");
				log(error);
				log(stderror);
				this._activeThreadCount--;
				failureCallback(error, stderror)
			}
		});
	}

	async buildPlotCommandsForAvailableDrives(drivesToIgnore, MAX_THREADS_PER_SSD){
		const plottableDrives = await findPlottableDrives(drivesToIgnore);
		const ssds = await findTemporaryDrives();
	
		let commandsAndLogsPerDrive = {};
		for(let driveDataIndex in plottableDrives){
			const driveData = plottableDrives[driveDataIndex];
			let commandsAndLogs = await buildPlottingCommandsForDrive(driveData, ssds, MAX_THREADS_PER_SSD);
			commandsAndLogsPerDrive[driveData.drive] = commandsAndLogs;
		}
		console.log(commandsAndLogsPerDrive);
		return commandsAndLogsPerDrive;
	}
}

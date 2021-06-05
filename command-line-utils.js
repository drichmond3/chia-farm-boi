const readline = require('readline');
const {exec} = require("child_process");
const fs = require('fs');
const {LOG_DIRECTORY} = require("./config.json");
const os = require("os");

function sleep(millis) {
	return new Promise(resolve => setTimeout(resolve, millis));
}

function prompt(query, timeout, defaultValue) {
	let completed = false;
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise(resolve => {
		if(timeout){
			setTimeout(()=>{
				if(!completed){
					completed = true;
					rl.close();
					resolve(defaultValue);
				}
			}, timeout);
		}
		rl.question(query, ans => {
			if(!completed){
				completed = true;
				rl.close();
				resolve(ans);
			}
		});
	});
}

let runCommand = async (command)=>{
  return new Promise((resolve, reject)=>{
		exec(command, {}, (error, stdout, stderr) => {
			if(error) {
				reject(error);
			}
			resolve(stdout);
		});
	});
}

let print = async function(logFile, message){
  fs.appendFile(logFile, message + "\r\n", function (err) {
    if (err) throw err;
  });
}

function isPositive(input) {
	return input && input.toLowerCase().includes('y');
}

function getHostname(){
  return os.hostname();
}

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

const LOG_FILE = `${LOG_DIRECTORY}/auto_plotter/${Date.now()}.log`;

exports.sleep = sleep;
exports.prompt = prompt;
exports.isPositive = isPositive;
exports.log = (message)=>print(LOG_FILE, message);
exports.runCommand = runCommand;
exports.getHostname = getHostname;


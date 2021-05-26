const readline = require('readline');
const {exec} = require("child_process");
const fs = require('fs');

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
					print(LOG_FILE, "\r\nENDING EARLY DUE TO TIMEOUT OF " + timeout);
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


let listFilesInDirectory = async(directory) =>{
  let rawDirectories = await runCommand("dir /b");
  if(rawDirectories){
    return rawDirectories.split(/\r?\n/);
  }
  return [];
}


const LOG_FILE = `auto_plotter/${Date.now()}.log`;

exports.sleep = sleep;
exports.prompt = prompt;
exports.isPositive = isPositive;
exports.log = (message)=>print(LOG_FILE, message);
exports.listFilesInDirectory = listFilesInDirectory;
exports.runCommand = runCommand;

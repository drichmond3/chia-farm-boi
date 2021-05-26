const readline = require('readline');
const { exec } = require('child_process');
const { log } = require('./command-line-utils');

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

let _generatePlotterCommands = async (options) =>{
    let {maxConcurrency, plotCount, temporaryDrive, destinationDrive, logDirectory} = options
    let response = [];
    if(temporaryDrive == destinationDrive){
      log("\r\nDestination drive cannot be the same as the temporary drive",temporaryDrive, destinationDrive);
      throw new Error("TemporaryDrive == DestinationDrive not allowed");
    }
    let remainingPlots = plotCount;
    for(let threadCount = 0; threadCount < maxConcurrency; threadCount ++){
        let remainingThreads = maxConcurrency - threadCount;
        let repeatCount = Math.ceil(remainingPlots/remainingThreads);
        remainingPlots -= repeatCount;

        let command = `mkdir -p ${logDirectory} && cd /home/darrien/chia-blockchain/ && . ./activate && chia plots create -k 32 -b 3500 -u 128 -t "${temporaryDrive}" -d "${destinationDrive}" -n ${repeatCount} -r 4 -f b984301b7be7f37a0065de2796199f1b447a3ad462361403319bca5f365fbe201948e016382442f90fe499beeda55ea2 -p a97f014049ad33483eac1cea250b07351dbc65fd58c067cb49e743413761ce35dce88d96acc4ceb1e78e0273fbe634aa`
        command += ` > ${logDirectory}${temporaryDrive.substring(temporaryDrive.lastIndexOf("/")) + '_' + threadCount}.log`;
	response.push(command);
    }
    return response;
}

let runAlone = async ()=>{
    const hardDriveLetter = await askQuestion("What's the letter of the hard drive?");
    const hardDriveSpace = await askQuestion("How many TB does this hard drive have free?");
    const maxConcurrency = await askQuestion("How many plots should be made in parallel? [Leave blank for 5]") || 5;
    const sleepTimeInMinutes = await askQuestion("Delay in minutes between parallel threads? [Leave blank for 30 minutes]") || 30;
    startPlotter();
}

let generatePlotterCommands = async (options)=>{
    const {hardDriveSpace, maxConcurrency, temporaryDrive, destinationDrive, logDirectory} = options;
    const PLOT_SIZE = .10887742;
    const rawPlotCount = hardDriveSpace * 1.0/PLOT_SIZE; //Remember, 101.4 GiB = 108.87GB
    const plotCount = Math.floor(rawPlotCount);

    //console.log(options);
    return {
      commands: await _generatePlotterCommands({maxConcurrency, plotCount, temporaryDrive, destinationDrive, logDirectory}),
      plotCount: plotCount
    }
}
module.exports = generatePlotterCommands; 

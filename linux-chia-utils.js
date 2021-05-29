const {exec} = require("child_process");
const {log} = require("./command-line-utils");
const {runCommand} = require("./command-line-utils");

let findPlottableDrives = async (drivesToIgnore)=>{
	let parsedDriveData = await getDriveData();
	let response = parsedDriveData.filter(data=>!drivesToIgnore.includes(data.drive));
	return response;
}

let getDriveData = async ()=>{
	const rawDriveList = await new Promise((resolve, reject)=>{
		const command = `df -B G | grep "/dev/sd"`
        	exec(command,{},(error, stdout, stderr) => {
                	if(error) {log(error); resolve("");}
                	return resolve(stdout.trim());
        	})
	});
	let driveDataArray = rawDriveList.split(/\r?\n/).map(data=>data.split(/\s+/));
	let parsedDriveData = driveDataArray.map(data=>({
        	drive:data[0],
        	freeSpace: data[3],
        	location: data.splice(5).join(" ")
	}));
	return parsedDriveData;
}

let getDriveUniqueId = async (unixDeviceFileName) =>{
	return new Promise( async (resolve, reject)=>{
		const command = `sudo blkid | grep UUID= | grep "${unixDeviceFileName}"`
		const stdout = await runCommand(command);
		let uuidString = stdout.substring(stdout.indexOf("UUID="), stdout.indexOf('TYPE="'));
		let uuid = uuidString.split("=")[1].replace('"',"").trim();
		resolve(uuid);
	});
}

let getDriveFreeSpace = async (driveLocation) =>{
	let driveData = await getDriveData().filter(drive=>drive.location == driveLocation);
	console.log("Free space on " + driveLocation + " is " + driveData.freeSpace + " GB");
	return driveData.freeSpace;
}

let listFilesInDirectory = async(directory) =>{
  let rawDirectories = await runCommand("ls -1");
  if(rawDirectories){
    return rawDirectories.split(/\r?\n/);
  }
  return [];
}

let unmount = async(unixDeviceFile) =>{
  await runCommand(`eject ${unixDeviceFile}`);
}

let generatePlotCommand = (options)=>{
  let {temporaryDrive, destinationDrive, logFile, executionId} = options
  let command = `mkdir -p /home/darrien/chia-blockchain/${logDirectory} && cd /home/darrien/chia-blockchain/ && . ./activate && chia plots create -k 32 -b 3500 -u 128 -t "${temporaryDrive}" -d "${destinationDrive}" -n 1 -r 4 -f b984301b7be7f37a0065de2796199f1b447a3ad462361403319bca5f365fbe201948e016382442f90fe499beeda55ea2 -p a97f014049ad33483eac1cea250b07351dbc65fd58c067cb49e743413761ce35dce88d96acc4ceb1e78e0273fbe634aa`
  command += ` >> ${logFile}`;
  return command;
}

function sleep(millis) {
	return new Promise(resolve => setTimeout(resolve, millis));
}

/*Notes when adding a new m2 nvme drive: 
 * 1) find drive with sudo fdisk -l | grep "Disk /dev/nvme"
 * 2) partition drive with sudo gdisk /dev/**drive name**
 * 	- type in n for new partition
 * 	- 1 for the number
 * 	- accept all the remaining defaults by pressing enter on each line. 
 * 	- Next command is press w to write. Then done.
 * 3) format partition with sudo mkfs.ext4 /dev/**insert drive name WITH A 1 AT THE END ex: ske1**
 * 4) edit file used to load drive on boot with sudo vim /etc/fstab
 * 	- add line at the end for new drive. example: /dev/ske1 /mnt/nvme0 ext4 defaults 0 0
 * 5) sudo mkdir **mount location. in example above it's /mnt/nvme0**
 * 6) mount all the drives in the fstab file with sudo mount -a
 * 7) check you work with df -h
 */



/*Notes when adding a new external drive:
 * 1) find drive with sudo fdisk -l | grep /dev/sd
 * 2) partition drive with sudo gdisk /dev/**drive name**
 *      - type in n for new partition
 *      - 1 for the number
 *      - accept all the remaining defaults by pressing enter on each line.
 *      - Next command is press w to write. Then done.
 * 3) format partition with sudo mkfs -t ntfs /dev/**insert drive name WITH A 1 AT THE END ex: ske1**
 * 4) edit file used to load drive on boot with sudo vim /etc/fstab
 *      - add line at the end for new drive. example: /dev/ske1 /mnt/nvme0 ntfs defaults 0 0
 * 5) sudo mkdir **mount location. in example above it's /mnt/nvme0**
 * 6) mount all the drives in the fstab file with sudo mount -a
 * 7) check you work with df -h
 */

exports.findPlottableDrives = findPlottableDrives;
exports.listFilesInDirectory = listFilesInDirectory;
exports.sleep = sleep;
exports.getDriveUniqueId = getDriveUniqueId;
exports.unmount = unmount;
exports.generatePlotCommand = generatePlotCommand;
exports.getDriveFreeSpace = getDriveFreeSpace;

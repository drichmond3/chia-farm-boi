const {runCommand} = require("./command-line-utils");

let findPlottableDrives = async (drivesToIgnore)=>{
	const driveDataArray = await _getDriveData();
	let parsedDriveData = driveDataArray.map(data=>({
        	drive:data.location,
        	freeSpace: data.freeSpace,
        	location: data.location
	}));

	let response = parsedDriveData.filter(data=>!drivesToIgnore.includes(data.drive));
	return response;
}

let _getDriveData = async ()=>{
	let command = "wmic Volume Get DeviceID, DriveLetter, FreeSpace";
	let rawData = await runCommand(command);
	let driveByLine = rawData.split(/\r?\n/);
	driveByLine.splice(0,1);
	let parsedDriveData = driveByLine.map(line=>line.split(/\s+/));
	parsedDriveData = parsedDriveData.filter(data=>data.length >= 3 && data[0] && data[1] && data[2])
	return parsedDriveData.map(data=>{return {
		uuid: data[0].trim(),
		location: data[1].trim(),
		freeSpace: (data[2]/1024/1024/1024) + "" //BYTE to GIGABYTE
	}})
}

let getDriveFreeSpace = async (driveLocation) =>{
	return new Promise(async (resolve, reject)=>{
		let driveData = (await _getDriveData()).filter(drive=>drive.location == driveLocation);
		resolve(driveData[0].freeSpace);
	});
}

let getDriveUniqueId = async (driveLocation) =>{
	return new Promise(async (resolve, reject)=>{
		let driveData = (await _getDriveData()).filter(drive=>drive.location == driveLocation);
		resolve(driveData[0].uuid);
	});
}

let listFilesInDirectory = async(directory) =>{
  let rawDirectories = await runCommand("dir /b");
  if(rawDirectories){
    return rawDirectories.split(/\r?\n/);
  }
  return [];
}

let unmount = async(drive) =>{
  //await runCommand(`mountvol ${drive}\\ /p`);
}

let createDirectory = async (directory) =>{
	await runCommand(`md ${directory}`).catch((e)=>{log(`Failed to create directory ${directory}`)});
	await runCommand(`rmdir /S ${directory}`);
}

let generatePlotCommand = (options)=>{
  let {temporaryDrive, destinationDrive, logDirectory, repeatCount, threadCount} = options
  logDirectory = logDirectory.replace("/","\\").replace(":","");
  let command = `chia plots create -k 32 -b 3500 -u 128 -t "${temporaryDrive}" -d "${destinationDrive}" -n ${repeatCount} -r 4 -f b984301b7be7f37a0065de2796199f1b447a3ad462361403319bca5f365fbe201948e016382442f90fe499beeda55ea2 -p a97f014049ad33483eac1cea250b07351dbc65fd58c067cb49e743413761ce35dce88d96acc4ceb1e78e0273fbe634aa`
  command += ` >> ${logDirectory}\\${temporaryDrive.substring(temporaryDrive.lastIndexOf("/")).replace(":","") + '_' + threadCount}.log`;
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
exports.getDriveFreeSpace = getDriveFreeSpace;
exports.sleep = sleep;
exports.getDriveUniqueId = getDriveUniqueId;
exports.listFilesInDirectory = listFilesInDirectory;
exports.unmount = unmount
exports.generatePlotCommand = generatePlotCommand;
exports.createDirectory = createDirectory;

const {exec} = require("child_process");
const {log} = require("./command-line-utils");

let findPlottableDrives = async (drivesToIgnore)=>{
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
        	location: data[5]
	}));

	let response = parsedDriveData.filter(data=>!drivesToIgnore.includes(data.drive));
	return response;
}

/**
 * Use sudo fdisk -l | grep /dev/nvme
 * to find more drives
 */
let findTemporaryDrives = async ()=>{
	return [
		{location:"/mnt/nvme0", freeSpace:3.40},
		{location:"/mnt/nvme1", freeSpace:0.87},
                {location:"/mnt/nvme2", freeSpace:1.80}];
}

let getDriveUniqueId = async (unixDeviceFileName) =>{
	return new Promise((resolve, reject)=>{
		const command = `sudo blkid | grep UUID= | grep "${unixDeviceFileName}"`
		exec(command, {}, (error, stdout, stderr) => {
			if(error) {
				reject(error);
			}
			let uuidString = stdout.substring(stdout.indexOf("UUID="), stdout.indexOf('TYPE="'));
			let uuid = uuidString.split("=")[1].replace('"',"").trim();
			resolve(uuid);
		});
	});
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
exports.findTemporaryDrives = findTemporaryDrives;
exports.sleep = sleep;
exports.getDriveUniqueId = getDriveUniqueId;

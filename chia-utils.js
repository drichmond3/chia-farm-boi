
const LINUX = "linux";
const windows = "win32";

module.exports = (process.platform == LINUX) ? require("./linux-chia-utils") : require("./windows-chia-utils");

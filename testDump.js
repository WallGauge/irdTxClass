var irTransmitter =     require('./irdClass.js');
var package =           require('./package.json');

const deviceAddress = 1;
const calibration = [[0,0],[25,155],[50,310],[75,460],[100,620]];


var irTX = new irTransmitter(deviceAddress, calibration);


var pVer = package.version;
console.log('class ver = '+ pVer);

console.log('dumping queue ' + deviceAddress);
irTX.cmdQueueDump()





var irTransmitter =     require('./irdClass.js');
var package =           require('./package.json');

const deviceAddress = 170;                                          // 170 = broadcast address (all gauges withing range will respond)
const calibration = [[0,0],[25,155],[50,310],[75,460],[100,620]];   // This is a generic calibration table from 0 to 100


var irTX = new irTransmitter(deviceAddress, calibration);


var pVer = package.version;
console.log('class ver = '+ pVer);

console.log('adding value of 50 to command queue to be sent to gauge with the address of ' + deviceAddress);
irTX.sendValue(50);
var valToSend = 1;
setInterval(function(){
    if(valToSend == 100){
        valToSend = 1;
    } else {
        valToSend++
    }
    console.log('Adding value of' + valToSend + ' to command queue to be sent to gauge with the address of ' + deviceAddress);
    irTX.sendValue(valToSend);
}, 600000);



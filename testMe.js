var irTransmitter =     require('./irdClass.js');
var package =           require('./package.json');

var deviceAddress = 170;                                          // 170 = broadcast address (all gauges withing range will respond)
const calibration = [[0,0],[25,155],[50,310],[75,460],[100,620]];   // This is a generic calibration table from 0 to 100

if(process.argv.length == 3){
    var deviceAddress = process.argv[2];

    console.log('device address ovride on command line to:' + deviceAddress);

}

console.log('Creating irdClass for device address: '+ deviceAddress);
var irTX = new irTransmitter(deviceAddress, calibration);


var pVer = package.version;
console.log('class ver = '+ pVer);

console.log('adding value of 50% to command queue to be sent to gauge with the address of ' + deviceAddress);
if(irTX.isServerConncted()){
    irTX.sendValue(50);
} else {
    console.log('Server not connected yet...')
}

var valToSend = 0;
setInterval(function(){
    if(valToSend == 100){
        valToSend = 1;
    } else {
        valToSend = valToSend + 10;
    }
    console.log('Adding value of' + valToSend + '% to command queue to be sent to gauge with the address of ' + deviceAddress);
    irTX.sendValue(valToSend);
}, 300000);



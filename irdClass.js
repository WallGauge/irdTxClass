var net = require('net');
var serverCfg = require('./serverConfig.json');

const logPrefix = 'irdClass.js | ';

var ipcPath = serverCfg.serverPathForUNIX;
//var ipcPath = serverCfg.serverPathForWindows;
var stream = {};
var serverConnected = false;

const hardwarePwmBcmPin = 18;
const modulationFreq = 33000;
const calibration = [[0, 0], [25, 155], [50, 310], [75, 460], [100, 620]];

const rgaugeDfltCmds = {
    Check_Battery_Voltage: 0,
    Reset: 1,
    Zero_Needle: 2,
    Set_Gauge_Address: 3,
    Set_Wake_duration: 4,
    Set_Sleep_duration: 5,
    Start_sleep_in_seconds: 6,
    Set_Raw_Stepper_Value: 8,
    Set_Raw_Value_awake: 9,
    Led_on: 10,
    Identifify: 15
}

class irTx {
    /**
     * This class is used to submit gauge data to the irdTxServer over a UNIX domain socket.  The socket path is set in the ./serverConfig.json file.
     * The irdTxServer that receives this data will place the command into a broadcast queue and manages the packet from there. 
     * 
     * Required fields for construction:
     * deviceAddress: This is the address the battery powered wall gauge will respond to. 
     * calibrationTable: Each gauge type has a unique calibration table to match raw stepper values to the gauge face. 
     * This table must be passed to this class during construction. See testMe.js for an example.
     * 
     * @param {number} deviceAddress The wall gauges pre-programed address from 0 to 255.  170 is broadcast address.
     * @param {array} calibrationTable Array of display values and corresponding raw stepper values for gauge face.
     * @param {number} frq defaults to 33000.  This is the modulation frequency used by the infrared receiver in the gauge.
     * @param {number} pin defaults to 18. This is the pin that is connected to the infra red LED circuit using BCM numbering schema.
     * @param {object} dftCmds defaults to the rgaugeDfltCmds object that contains of commands and corresponding command number.
     */
    constructor(deviceAddress = 1, calibrationTable = calibration, frq = modulationFreq, pin = hardwarePwmBcmPin, dftCmds = rgaugeDfltCmds) {
        this._pwmPin = pin;
        this._modFrequency = frq;
        this._cmdList = dftCmds;
        this._deviceAddress = deviceAddress;
        this._calibrationTable = calibrationTable;
        this._lastEncodedComnmand = 0;
        connectToServer();
    }

    /** Sends value (on gauge face) to irdTxServer for transmission to gauge.
     * This method converts the value passed to it to a raw stepper value based on this gauge's calibration table.
     * It will then encasplate the raw stepper value into a command packet and submit it to the irdTxServer over UNIX domain socket for transmission. 
     * The irdTxServer will place this command packet in a broadcast queue and retransmit it every second unitl a timeout or another value is sent.
     * If a new gauge value is sent before the previous command times out it will be deleted out of the broadcast queue before the new value is sent. 
     * 
     * @param {number} valueToSend value on gauge face to move the gauge needle to.
     */
    sendValue(valueToSend) {
        var rawValue = getCalibratedValue(valueToSend, this._calibrationTable);
        var valueAsCmd = this.encodeCmd(this._cmdList.Set_Raw_Stepper_Value, rawValue);
        if (this._lastEncodedComnmand != 0) {
            this._cmdQueueRemove(this._lastEncodedComnmand);
        };
        this._cmdQueueAdd(valueAsCmd);
        this._lastEncodedComnmand = valueAsCmd;
        console.debug('Added gauge value = ' + valueToSend + ', as raw = ' + rawValue + ', for device address = ' + this._deviceAddress + ', as command = ' + valueAsCmd + ' to command queue.');
    };

    /** removes the last value sent to the irdTxServer from its transmit queue
     */
    removeLastValue() {
        if (this._lastEncodedComnmand != 0) {
            this._cmdQueueRemove(this._lastEncodedComnmand);
            this._lastEncodedComnmand = 0;
        };
    };

    /** sends an encoded command to irdTxServer
     * This method must be passed an encoded gauge command that can be beamed buy the irdTxServer.
     * An encoded command inclueds gague address, command and command value.
     * Use the encodeCmd method to create an encoded value to pass this method. 
     * Removes previous encoded command before sending the new one.
     *
     * @param {number} cmdToSend encoded command from encodeCmd method.
     */
    sendEncodedCmd(cmdToSend) {
        if (this._lastEncodedComnmand != 0) {
            this._cmdQueueRemove(this._lastEncodedComnmand);
        };
        if (cmdToSend != 0) {
            this._cmdQueueAdd(cmdToSend);
            console.debug('Added gauge command for device address = ' + this._deviceAddress + ', as command = ' + cmdToSend + ' to command queue.');
        } else {
            console.debug('sendEndodedCmd called with value = 0 skipping server tx.');
        };
        this._lastEncodedComnmand = cmdToSend;
    };

    /** returns an encoded command as an integer 
     * Creates a single packet (integer number) that can be beamed directly to a battery powered gague.
     * Use sendEncodeCmd method to send this value to the irdTxServer for transmission. 
     * 
     * @param {number} cmdNum = (0 to 15) see this._cmdList for a list of commands
     * @param {number} value = (0 to 4095) value for the command. If the command = 8 then this will be the raw stepper value to move to
     * @param {number} address = (0 to 255) address of the battery powered gauge
     */
    encodeCmd(cmdNum = 0, value = 0, address = this._deviceAddress) {
        if (value < 0 || value > 4095) {
            console.debug('rGaugeEncode called with invalid value = ' + value);
            return 0;
        };
        if (cmdNum < 0 || cmdNum > 15) {
            console.debug('rGaugeEncode called with invalid cmdNum = ' + cmdNum);
            return 0;
        };
        if (address < 0 || address > 255) {
            console.debug('rGaugeEncode called with invalid address = ' + address);
            return 0;
        };

        var x = 0;
        var y = cmdNum;
        for (var i = 0; i < 4; i++) {                              // bits 1 - 4 hold the command, range = 0 to 15
            x = x << 1;
            x = x + (y & 1);
            y = y >> 1;
        };
        var y = value;
        for (var i = 0; i < 12; i++) {                             // bits 5 - 15 hold the data value, range = 0 to 4095
            x = x << 1;
            x = x + (y & 1);
            y = y >> 1;
        };
        var y = address;
        for (var i = 0; i < 8; i++) {                              // bits 17 - 24 = address of device, range = 0 to 255
            x = x << 1;
            x = x + (y & 1);
            y = y >> 1;
        };
        var y = address;
        for (var i = 0; i < 8; i++) {                              // bits 25 - 32 = not of device address
            x = x << 1;
            x = x + (~y & 1);
            y = y >> 1;
        };
        var adnMask = x;
        return x;
    };

    /** Returns true if irdTxServer is connected.
     * 
     */
    isServerConncted() {
        return serverConnected;
    };

    _cmdQueueAdd(encodedCommand, txCount = 14, modFreq = this._modFrequency, pwmPin = this._pwmPin) {
        var cmdAsStr = JSON.stringify({ cmd: 'addCmd', encodedCommand: encodedCommand, txCount: txCount, modFreq: modFreq, pwmPin: pwmPin });
        stream.write(cmdAsStr);
    };

    _cmdQueueRemove(encodedCommandToRemove) {
        var cmdAsStr = JSON.stringify({ cmd: 'removeCmd', encodedCommand: encodedCommandToRemove });
        stream.write(cmdAsStr);
    };

    _cmdQueueClear() {
        console.debug('sending new cmdQueueClear to irdServer.');
        var cmdAsStr = JSON.stringify({ cmd: 'clearCmdQueue' });
        stream.write(cmdAsStr);
    };

    _cmdQueueDump() {
        console.debug('sending new cmdQueueDump to irdServer.');
        var cmdAsStr = JSON.stringify({ cmd: 'dumpCmdQueue' });
        stream.write(cmdAsStr);
    };
};

function getCalibratedValue(intVal = 0, calibrationTable = [[0, 0], [50, 250]]) {
    var cTable = calibrationTable;

    if (intVal < cTable[0][0]) { return cTable[0][1]; }
    if (intVal > cTable[cTable.length - 1][0]) { return cTable[cTable.length - 1][1]; }
    var lowIndex = findLowIndex(intVal, cTable);
    var highIndex = findHighIndex(intVal, cTable);
    if (lowIndex == highIndex) {
        return cTable[lowIndex][1];
    } else {
        var range = cTable[highIndex][0] - cTable[lowIndex][0];
        var ticsPerValue = (cTable[highIndex][1] - cTable[lowIndex][1]) / range;
        var xFloat = ((intVal - cTable[lowIndex][0]) * ticsPerValue) + cTable[lowIndex][1];
        return Math.round(xFloat);
    }
}

function findHighIndex(target, calibrationTable = [[0, 0], [50, 250]]) {
    var cTable = calibrationTable;
    for (i = 0; i < cTable.length; i++) {
        if (cTable[i][0] >= target) {
            return i;
        }
    }
}

function findLowIndex(target, calibrationTable = [[0, 0], [50, 250]]) {
    var cTable = calibrationTable;
    for (i = cTable.length - 1; i > -1; i--) {
        if (cTable[i][0] <= target) {
            return i;
        }
    }
}

/*
    Stream setup for irTxServer over UNIX IPC 
*/
function connectToServer() {
    console.debug('Conneting to infrared tx server on IPC path ' + ipcPath);
    stream = net.connect(ipcPath);

    stream.on('data', function (dtaFromServer) {
        var dta = dtaFromServer.toString();
        switch (dta) {
            case '__disconnect':
                serverConnected = false;
                console.warn('irdTxServer issued a disconnect!!');
                process.exit(0);
                break;

            case '__connected':
                serverConnected = true;
                console.debug('irdTxServer connected!');
                break;

            default:
                console.warn('Received an unknown command from irdTxServer:');
                console.debug(dta);
                break;
        }
    });

    stream.on('error', function (err) {
        serverConnected = false;
        console.error('Error with connection to irdTxServer. Detail follows:', err);
        return reconnectServer();
    })
}

function reconnectServer() {
    var secToReconnect = 15;
    console.debug('Reconnectiong server in ' + secToReconnect + ' seconds.');
    setTimeout(function () {
        connectToServer();
    }, secToReconnect * 1000);
}

module.exports = irTx;

function logit(txt = '') {
    logit(logPrefix + txt)
};
var net =           require('net');
var cp =            require('child_process');
var serverCfg =     require('./serverConfig.json');

var ipcPath = serverCfg.serverPathForUNIX;
//var ipcPath = serverCfg.serverPathForWindows;
var stream = {};
var serverConnected = false;

const hardwarePwmBcmPin = 18;
const modulationFreq = 33000;
const calibration = [[0,0],[25,155],[50,310],[75,460],[100,620]];

const rgaugeDfltCmds = {
    Check_Battery_Voltage   :0,
    Reset                   :1,
    Zero_Needle             :2,
    Set_Gauge_Address       :3,
    Set_Wake_duration       :4,
    Set_Sleep_duration      :5,
    Start_sleep_in_seconds  :6,
    Set_Raw_Stepper_Value   :8,
    Identifify              :15
}

connectToServer();

//Class Setup
class irTx{
    constructor(deviceAddress = 1, calibrationTable = calibration, frq = modulationFreq, pin = hardwarePwmBcmPin, dftCmds = rgaugeDfltCmds){
        this._pwmPin = pin;
        this._modFrequency = frq;
        this._cmdList = dftCmds;
        this._deviceAddress = deviceAddress;
        this._calibrationTable = calibrationTable;
        this._lastEncodedComnmand = 0;
    }

    sendValue(valueToSend){
        var rawValue = getCalibratedValue(valueToSend, this._calibrationTable);
        var valueAsCmd = this.encodeCmd(this._cmdList.Set_Raw_Stepper_Value, rawValue);
        if(this._lastEncodedComnmand != 0){
            //console.log('recevied new command, removing previous command first');
            this._cmdQueueRemove(this._lastEncodedComnmand);
        };
        this._cmdQueueAdd(valueAsCmd);
        this._lastEncodedComnmand = valueAsCmd;
        console.log('Added gauge value = ' + valueToSend + ', as raw = '+ rawValue +', for device address = ' + this._deviceAddress +', as command = ' + valueAsCmd + ' to command queue.');
    };

    sendEncodedCmd(cmdToSend){
        if(this._lastEncodedComnmand != 0){
            //console.log('recevied new command, removing previous command first');
            this._cmdQueueRemove(this._lastEncodedComnmand);
        };
        if(cmdToSend != 0){
            this._cmdQueueAdd(cmdToSend);
            console.log('Added gauge command for device address = ' + this._deviceAddress +', as command = ' + cmdToSend + ' to command queue.');
        }else {
            console.log('sendEndodedCmd called with value = 0 skipping server tx.');
        };

        this._lastEncodedComnmand = cmdToSend;
        
    };

    encodeCmd(cmdNum = 0, value = 0, address = this._deviceAddress){
        if(value < 0 || value > 4095){
          console.log('rGaugeEncode called with invalid value = ' + value);
          return 0;
        };
        if(cmdNum < 0 || cmdNum > 15){
          console.log('rGaugeEncode called with invalid cmdNum = ' + cmdNum);
          return 0;
        };
        if(address < 0 || address > 255){
          console.log('rGaugeEncode called with invalid address = ' + address);
          return 0;
        };
      
        var x = 0;
        var y = cmdNum;
        for (var i=0; i < 4; i++){                              // bits 1 - 4 hold the command, range = 0 to 16
          x = x << 1;    
          x = x + (y & 1);
          y = y >> 1;
        };
        var y = value;
        for (var i=0; i < 12; i++){                             // bits 5 - 15 hold the data value, range = 0 to 4095
          x = x << 1;    
          x = x + (y & 1);
          y = y >> 1;
        };
        var y = address;
        for (var i=0; i < 8; i++){                              // bits 17 - 24 = address of device, range = 0 to 255
          x = x << 1;    
          x = x + (y & 1);
          y = y >> 1;
        };        
        var y = address;
        for (var i=0; i < 8; i++){                              // bits 25 - 32 = not of device address
          x = x << 1;    
          x = x + (~y & 1);
          y = y >> 1;
        };
        var adnMask = x;
        return x;
    };

    
    isServerConncted(){
        return serverConnected;
    };
      
    _cmdQueueAdd(encodedCommand, txCount = 14, modFreq = this._modFrequency, pwmPin = this._pwmPin){
        //console.log('sending new cmdQueueAdd to irdServer.');
        var cmdAsStr = JSON.stringify({cmd:'addCmd', encodedCommand:encodedCommand, txCount:txCount, modFreq:modFreq, pwmPin:pwmPin});
        stream.write(cmdAsStr);
    };

    _cmdQueueRemove(encodedCommandToRemove){
        //console.log('sending new cmdQueueRemove to irdServer.');
        var cmdAsStr = JSON.stringify({cmd:'removeCmd', encodedCommand:encodedCommandToRemove});
        stream.write(cmdAsStr);
    };

    _cmdQueueClear(){
        console.log('sending new cmdQueueClear to irdServer.');
        var cmdAsStr = JSON.stringify({cmd:'clearCmdQueue'});
        stream.write(cmdAsStr);
    };

    _cmdQueueDump(){
        console.log('sending new cmdQueueDump to irdServer.');
        var cmdAsStr = JSON.stringify({cmd:'dumpCmdQueue'});
        stream.write(cmdAsStr);
    };
};

function getCalibratedValue(intVal=0, calibrationTable=[[0,0],[50,250]]){ 
    var cTable = calibrationTable;

    if (intVal < cTable[0][0]){return cTable[0][1];}
    if (intVal > cTable[cTable.length-1][0]){return cTable[cTable.length-1][1];}
    var lowIndex = findLowIndex(intVal, cTable);
    var highIndex = findHighIndex(intVal, cTable);
    if (lowIndex == highIndex){
        return cTable[lowIndex][1];
    } else {
        var range = cTable[highIndex][0] - cTable[lowIndex][0];    
        var ticsPerValue = (cTable[highIndex][1] - cTable[lowIndex][1]) / range;
        var xFloat = ((intVal - cTable[lowIndex][0]) * ticsPerValue) + cTable[lowIndex][1];
        return Math.round(xFloat);   
    }
}

function findHighIndex(target, calibrationTable=[[0,0],[50,250]]) {
    var cTable = calibrationTable;
    for (i=0; i < cTable.length; i++){
        if (cTable[i][0] >= target){
            return i;
        }
    }
}

function findLowIndex(target, calibrationTable=[[0,0],[50,250]]) {
    var cTable = calibrationTable;
    for (i=cTable.length - 1; i > -1; i--){
        if (cTable[i][0] <= target){
            return i;
        }
    }
}

/*
    Stream setup for irTxServer over UNIX IPC 
*/
function connectToServer(){
    console.log('Conneting to infrared tx server on IPC path ' + ipcPath);
    stream = net.connect(ipcPath);

    stream.on('data', function(dtaFromServer){
        var dta = dtaFromServer.toString();
        switch(dta){
            case '__disconnect':
                serverConnected = false;
                console.log('irdTxServer issued a disconnect!!')
                process.exit(0);
                break;

            case '__connected':
                serverConnected = true;
                console.log('irdTxServer connected!');
                break;

            default:
                console.log('Received an unknown command from irdTxServer:');
                console.log(dta);
                break;
        }
    });

    stream.on('error', function(err){
        serverConnected = false;
        console.log('Error with connection to irdTxServer. Detail follows:');
        console.log(err);
        console.log('check server and try again');
        return reconnectServer();
    })
}

function reconnectServer(){
    var secToReconnect = 15;
    console.log('Reconnectiong server in ' + secToReconnect + ' seconds.');
    setTimeout(function(){
        connectToServer();
    }, secToReconnect * 1000);
}

module.exports = irTx;
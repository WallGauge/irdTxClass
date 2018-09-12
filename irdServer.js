var net =       require('net');
var cp =        require('child_process');
var serverCfg = require('./serverConfig.json');

//var ipcPath = '\\\\.\\pipe\\.irdServer';
var ipcPath = serverCfg.serverPath;

var hardwarePwmBcmPin = 18;
var modulationFreq = 33000;
var txCmdQueueTimer = '';
var cmdQueue = [];

startCmdQueue();

// docs:  https://nodejs.org/api/net.html
var server = net.createServer(function(stream) {
    stream.on('data', function(cmdAsString) {     
      var mObj = JSON.parse(cmdAsString);        
      var commandToCall = mObj.cmd || 'No Method Object';
      switch(commandToCall){
        case 'addCmd':
            console.log('addCmd(' + mObj.encodedCommand + ', ' + mObj.txCount + ', ' + mObj.modFreq + ', ' + mObj.pwmPin +')');
            addCmd(mObj.encodedCommand, mObj.txCount, mObj.modFreq, mObj.pwmPin);
            break;
        case 'clearCmdQueue':
            console.log('clearCmdQueue received by server');
            clearCmdQueue();
            break;
        case 'dumpCmdQueue':
            console.log('dumpCmdQueue received by server');
            dumpCmdQueue();
            break;
        case 'removeCmd':
            console.log('removeCmd received for command: ' + mObj.encodedCommand);
            removeCmd(mObj.encodedCommand);
            break;

        default:
            console.log('irdServer received message object', cmdAsString.toString());
            console.log('Message from client: called with unknown command ->' + commandToCall + '<-');
      }
    });

    stream.on('end', function() {
      console.log('session end');
      //server.close();
    });
});

console.log('Starting server on ' + ipcPath);
server.listen(ipcPath);
console.log('opened server on', server.address());

function removeCmd(encodedCommand){
    console.log('removeCmd called with ' + encodedCommand);
    var locIndex = -1
    cmdQueue.forEach(function(item, indx){
        if(item[0]==encodedCommand){
            locIndex = indx;
        }        
    });

    if(locIndex != -1){
        console.log('Deleting '+ encodedCommand +' at cmdQueue['+ locIndex +'].');
        cmdQueue.splice(locIndex,1);
    }
}

function addCmd(encodedCommand = 0, txCount = 2, modFreq = modulationFreq, pwmPin = hardwarePwmBcmPin){
    if (encodedCommand == 0){
        console.log('ERR addCmd called with missing encodedCommand');
        return;
    }
    cmdQueue.push([encodedCommand,txCount,modFreq,pwmPin]);
}

function clearCmdQueue(){
    console.log('IR command queue cleard');
    cmdQueue = [];
}

function dumpCmdQueue(){
    cmdQueue.forEach(function(item){
        console.log('encoded cmd = '+ item[0] + ', tx count = '+item[1]+', freq = '+item[2]+', PWM pin = '+ item[3]);        
    });
}

// local functions
function startCmdQueue(){
    if(txCmdQueueTimer == ''){
    console.log('Starting txCmdQueue...')
    txCmdQueueTimer = setInterval(function(){sendQueueNow();}, 30000);
    } else {
    console.log('txCmdQueue already running.  Skipping.');
    }
}

function sendQueueNow(){
    var counter = 1
    cmdQueue.forEach(function(item, index){
        if(item[1] > 0){
            item[1] = item[1] - 1;
            setTimeout(function(cmdToSend = item[0]){                         // in repeatDuration (seconds) stop cmdTimer
                tx(cmdToSend, hardwarePwmBcmPin, modulationFreq)
            }, counter * 1000);
        } else {
            item.splice(index,0)
        } 
        counter = counter + 1                                               // Set counter + 2 to allow space for double transmission of packets
    });
}

function tx(encodedCommand, pwmPin, modFrequency){
    var d = new Date();
    console.log('['+ d.getHours() +':'+ d.getMinutes() + ':'+ d.getSeconds() +'] Transmitting CMD ' + encodedCommand + ', on hardware pin ' + pwmPin + ', at ' + modFrequency + 'Hz.' )
    //cp.execSync('./C/irTx '+encodedCommand +' ' + pwmPin + ' ' + modFrequency);    
}
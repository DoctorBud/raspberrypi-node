////////////////////////////////////////////////////////////////////////
// Ricart-Agrawala algorithm
//
// I'm taking some liberties with the original algorithm by reinterpreting the RD array as a list of
// Sites corresponding to deferred Requests, rather than a fixed-size array of length (num PIDs).
//
// I'm also having a Site's PID be it's 'host:port' string.
//
// This file initializes the following services:
//   - HTTP for the purpose of WebUI
//   - HTTP for the purpose of REST API
//   - Discovery
//
// This file is also responsible for maintaining the state of a Site for the purposes
// of the algorithm. We will be using the terminology and description from:
//    [Distributed Computing: Principles, Algorithms, and Systems](http://www.cambridge.org/us/academic/subjects/engineering/communications-and-signal-processing/distributed-computing-principles-algorithms-and-systems)
// as guidance in implementing the algorithm.
//

// Dependencies
var Path = require('path');
var Util = require('util');
var Discovery = require('./server-discovery.js');
var FS = require('fs');

// Test Harness Configuration
// Not part of the algorithm, but needed to set up the distributed environment
// and participants list.

var configDiscoveryDelay = 2000;
var configNumTests = 3;
var configGapTimeLow = 100;
var configGapTimeHigh = 2000;
var configWorkTimeLow = 2000;
var configWorkTimeHigh = 5000;
var configCleanupDelay = 5000;
var configSyncLog = 'sharedLog.txt';


// All my State is living up here at the top of file because
// I'm still in wild-editing mode and don't know where stuff will end up.
// Eventually, I'll tight-scope everything.

var myHost = null;
var myPort = null;
var myPID = null;

var numTestsRemaining = 0;

//
// State vars for the RA Algorithm
//
var participantsChosen = false;
var participatingNodes = null;  // List of PIDs discovered before Lockout
                              // Each PID is a URI http://host:port
var RD = [];  // Request-Deferred array (I'm just using a list of PIDs)
var TS = 0;   // Lamport-style logical clock, incremented to T+1 upon a request with TS T.
var observedTS = 0;   // Lamport-style logical clock, incremented to T+1 upon a request with TS T.

var numPendingREPLY = 0;

var stateINIT =     'INIT   ';
var stateGAP =      'GAP    ';
var stateREQUEST =  'REQUEST';
var stateWORK =     'WORK   ';
var stateLEAVE =    'LEAVE  ';
var stateCLEANUP =  'CLEANUP';
var state = stateINIT;


function buildPID(host, port) {
  return 'http://' + host + ':' + port;
}

//
// Synchronous logging to a shared log file (configSyncLog)
//

function padRight(str, len) {
  str = String(str);
  var padLength = len - str.length + 1;
  var result = (padLength > 0) ?
                  str + (Array(padLength).join(' ')) :
                  str;
  return result;
}

// console.log('padRight("hello", 10)=', padRight("hello", 10));
// process.exit();

function syncLog() {  // uses 'arguments'
  var args = Array.prototype.slice.call(arguments, 0);
  var header = '[' + state + ' TS: ' + padRight(TS, 3) + ' ' + myPID + ']';
  var paddedHeader = padRight(header, 40);
  var data = paddedHeader + '   ' + args.join('  ');
  FS.appendFileSync(configSyncLog, data + '\n');
  console.log(data);
}


// Random delay (ms) in interval [low,high]
function randomDelay(low, high) {
  var result = Math.floor(low + Math.random() * (high - low));
  return result;
}



var request = require('request');

function handleRequestResponse(error, response, body) {
  if (error || response.statusCode != 200) {
    syncLog('    handleRequestResponse ERROR', error, response, body);
  }
}


function broadcastREQUEST() {
  syncLog('broadcastREQUEST');

  for (var i = 0; i < participatingNodes.length; ++i) {
    var site = participatingNodes[i];
    if (site === myPID) {
      syncLog('  INHIBIT broadcastREQUEST to SELF:', url);
    }
    else {
      var url = site + '/REQUEST';
      syncLog('  broadcastREQUEST to ', url);

      var options = {
          url:      url,
          method:   'GET',
          headers:  {
                        'User-Agent':       'Super Agent/0.0.1',
                        'Content-Type':     'application/x-www-form-urlencoded'
                    },
          qs:       {'senderTS': TS, 'senderPID': myPID}
      };

      request(options, handleRequestResponse);
    }
  }
}


function sendREPLY(targetID) {
  syncLog('sendREPLY(', targetID, ')');

  var site = targetID;
  var url = site + '/REPLY';
  syncLog('  sendREPLY to ', url);

  var options = {
      url:      url,
      method:   'GET',
      headers:  {
                    'User-Agent':       'Super Agent/0.0.1',
                    'Content-Type':     'application/x-www-form-urlencoded'
                },
      qs:       {'senderTS': 0, 'senderPID': 0}
  };

  request(options, handleRequestResponse);
}



function broadcastRD() {
  syncLog('broadcastRD', RD);

  for (var i = 0; i < RD.length; ++i) {
    var site = RD[i];
    var url = site + '/REPLY';
    syncLog('  REPLY to RD[' + i + ']', url);

    var options = {
        url:      url,
        method:   'GET',
        headers:  {
                      'User-Agent':       'Super Agent/0.0.1',
                      'Content-Type':     'application/x-www-form-urlencoded'
                  },
        qs:       {'senderTS': TS, 'senderPID': myPID}
    };

    request(options, handleRequestResponse);
  }
}


function handleREQUEST(msg) {
  syncLog('handleREQUEST:', msg.path, ' TS:', msg.query.senderTS, ' ID:', msg.query.senderPID);
  observedTS = Math.max(observedTS, msg.query.senderTS);
  var requestingOrWorking = (state === stateREQUEST) || (state === stateWORK);
  if (requestingOrWorking &&
      ((msg.query.senderTS > TS) ||
       ((msg.query.senderTS === TS) && (msg.query.senderPID > myPID)))) {
    RD.push(msg.query.senderPID);
  }
  else {
    sendREPLY(msg.query.senderPID);
  }
}


function handleREPLY(msg) {
  syncLog('handleREPLY:', msg.path, ' TS:', msg.query.senderTS, ' ID:', msg.query.senderPID);
  observedTS = Math.max(observedTS, msg.query.senderTS);

  --numPendingREPLY;
  if (state != stateREQUEST) {
    syncLog(' handleREPLY ERROR... Not in stateREQUEST');
  }
  else if (numPendingREPLY <= 0) {
    enterStateWORK();
  }
}



function enterStateCLEANUP() {
  syncLog('enterStateCLEANUP', configCleanupDelay);
  state = stateCLEANUP;
  setTimeout(
    function () {
      syncLog('CLEANUP complete... Exiting process');
      process.exit();
    }, configCleanupDelay);
}


var configDebugLock = 'debug.lock';

function debugLockEnable() {
  if (FS.existsSync(configDebugLock)) {
    syncLog('debugLockEnable ERROR lock already exists');
    process.exit();
  }
  else {
    FS.mkdirSync(configDebugLock);
  }
}


function debugLockDisable() {
  if (!FS.existsSync(configDebugLock)) {
    syncLog('debugLockEnable ERROR lock does not exist');
    process.exit();
  }
  else {
    FS.rmdirSync(configDebugLock);
  }
}

function enterStateLEAVE() {
  syncLog('enterStateLEAVE');

  state = stateLEAVE;
  debugLockDisable();

  broadcastRD();
  numTestsRemaining--;
  if (numTestsRemaining > 0) {
    enterStateGAP();
  }
  else {
    syncLog('Testing Complete');
    enterStateCLEANUP();
  }
}


function enterStateWORK() {
  var workTime = randomDelay(configWorkTimeLow, configWorkTimeHigh);
  syncLog('enterStateWORK', 'workTime', workTime);

  state = stateWORK;
  debugLockEnable();
  setTimeout(
    function () {
      enterStateLEAVE();
    }, workTime);
}



function enterStateREQUEST() {
  syncLog('enterStateREQUEST');

  //
  // Prepare the RD array, which will begin accumulating deferred
  // requests
  //

  RD = [];
  TS = observedTS + 1;
  numPendingREPLY = participatingNodes.length - 1;

  //
  // Hack in case we are the only node.
  //
  if (numPendingREPLY === 0) {
    syncLog('  INHIBIT broadcastREQUEST for degenerate single-node case');
    enterStateWORK();
  }
  else {
    //
    // We can't do work until we Enter the CS
    // So we have to async the work part using a continuation
    //
    state = stateREQUEST;
    broadcastREQUEST();
  }
}



function enterStateGAP() {
  var delayTime = randomDelay(configGapTimeLow, configGapTimeHigh);
  syncLog('enterStateGAP', 'delayTime', delayTime);
  state = stateGAP;

  setTimeout(
    function () {
      enterStateREQUEST();
    }, delayTime);
}


//
// We'll perform configNumTests sequences of:
//    GAP (random delay before requesting anything)
//    REQUEST
//    WORK (after algorithm permits entry into CS, delay a random amount)
//    LEAVE (and notify other participants).
//
function beginSimulation() {
  syncLog('beginSimulation... configNumTests:', configNumTests);
  numTestsRemaining = configNumTests;
  TS = 0;
  enterStateGAP();
}

function participantsChanged(nodeList) {
  if (participantsChosen) {
    syncLog('participantsChanged IGNORED. Discover is LOCKED');
  }
  else {
    // Update participatingNodes
    var sortedList = nodeList.slice();
    sortedList.sort(
      function(left, right) {
        return left.advertisement.myPort > right.advertisement.myPort;
      });
    participatingNodes = sortedList.map(
      function(element) {
        var advertisement = element.advertisement;
        var pid = buildPID(advertisement.myHost, advertisement.myPort);
        return pid;
      });
  }
};

////////////////////////////////////////////////////////////////////////
// WebUI and API Stuff


var Hapi = require('hapi');
var server = new Hapi.Server();

server.views({
  engines: {
    html: require('handlebars')
  },
  isCached: false,    // Useful when using livereload
  path: __dirname     // Path.join(__dirname, 'client')
});

// Declare the connection BEFORE the routes
//  To use an explicit port...   server.connection({ port: 8000 });
server.connection();

//
// STATUS, REQUEST, REPLY Routes
//

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        var context = {
            host:   myHost,
            port:   myPort,
            pid:    myPID,
            nodes:  participatingNodes
        };

        reply.view('STATUS', context);
    }});

server.route({
    method: 'GET',
    path: '/REQUEST',
    handler: function (request, reply) {
        handleREQUEST(request);
        reply.view('REQUEST');
    }});

server.route({
    method: 'GET',
    path: '/REPLY',
    handler: function (request, reply) {
        handleREPLY(request);
        reply.view('REPLY');
    }});


//
// Main Server Startup
//
server.start(function () {
  var ip = require('ip');
  myHost = ip.address();
  myPort = server.info.port;
  myPID = buildPID(myHost, myPort);
  syncLog('Server started at: ' + myPID);

  syncLog('### Discovery Initiated for ', configDiscoveryDelay, 'ms');

  Discovery.startDiscovery(myHost, myPort, participantsChanged);

  setTimeout(
    function () {
      participantsChosen = true;
      syncLog('### Discovery Complete and Locked. Participant list is:');

      for (var i = 0; i < participatingNodes.length; ++i) {
        syncLog('   [', i, '] ', participatingNodes[i]);
      }

      beginSimulation();
    }, configDiscoveryDelay ); // Wait 10secs to open all processes.
});


// Javascript Debugging (uncomment and move before server.start to use):
//
// syncLog('randomDelay(0, 1000)', randomDelay(0, 1000));
// syncLog('randomDelay(1000, 2000)', randomDelay(1000, 2000));
// syncLog('randomDelay(0, 5000)', randomDelay(0, 5000));
// syncLog('randomDelay(5000, 100000)', randomDelay(5000, 100000));
// process.exit();



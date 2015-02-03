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

var configDiscoveryDelay = 10000;
var configNumTests = 3;
var configGapTimeLow = 100;
var configGapTimeHigh = 2000;
var configWorkTimeLow = 2000;
var configWorkTimeHigh = 5000;


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

var entryREQUESTed = false;
var numPendingREPLY = 0;

var stateINIT = 0;
var stateGAP = 1;
var stateREQUEST = 2;
var stateWORKING = 3;
var state = stateINIT;


function buildPID(host, port) {
  return 'http://' + host + ':' + port;
}

//
// Synchronous logging to a shared log file (log.txt)
//

var syncLogFile = 'log.txt';
function syncLog() {  // uses 'arguments'
  var args = Array.prototype.slice.call(arguments, 0);
  var data = '[' + myPID + ']\n  ' + Util.format(args);
  FS.appendFileSync(syncLogFile, data + '\n');
  console.log(data);
}


// Random delay (ms) in interval [low,high]
function randomDelay(low, high) {
  var result = Math.floor(low + Math.random() * (high - low));
  return result;
}


function workLeave() {
  var workTime = randomDelay(configWorkTimeLow, configWorkTimeHigh);
  syncLog('Work', workTime);
  setTimeout(
    function () {
      syncLog('Leave');
      numTestsRemaining--;
      if (numTestsRemaining > 0) {
        enterStateGAP();
      }
      else {
        syncLog('Testing Complete');
        process.exit();
      }
    }, workTime);
}

var request = require('request');

function handleRequestResponse(error, response, body) {
  if (error || response.statusCode != 200) {
    syncLog('    handleRequestResponse ERROR', error, response, body);
  }
}

function sendREQUEST() {
  syncLog('sendREQUEST');
  entryREQUESTed = true;
  numPendingREPLY = participatingNodes.length - 1;

  for (var i = 0; i < participatingNodes.length; ++i) {
    var site = participatingNodes[i];
    var url = site + '/REQUEST';
    syncLog('  sendREQUEST to ', url);

    var options = {
        url:      url,
        method:   'GET',
        headers:  {
                      'User-Agent':       'Super Agent/0.0.1',
                      'Content-Type':     'application/x-www-form-urlencoded'
                  },
        qs:       {'senderTS': 0, 'senderID': site}
    };

    request(options, handleRequestResponse);
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
      qs:       {'senderTS': 0, 'senderID': 0}
  };

  request(options, handleRequestResponse);
}

function handleREQUEST(msg) {
  syncLog('handleREQUEST:', msg.path, ' TS:', msg.query.senderTS, ' ID:', msg.query.senderID);
  sendREPLY(msg.query.senderID);
}

function handleREPLY(msg) {
  --numPendingREPLY;
  syncLog('handleREPLY:', msg.path, ' TS:', msg.query.senderTS, ' ID:', msg.query.senderID, ' PENDING:', numPendingREPLY);
  if (numPendingREPLY <= 0) {
    workLeave();
  }
}


function enterStateREQUEST() {
  syncLog('enterStateREQUEST');

  //
  // Prepare the RD array, which will begin accumulating deferred
  // requests
  // .... TBD

  state = stateREQUEST;

  //
  // We can't do work until we Enter the CS
  // So we have to async the work part using a continuation
  //
  sendREQUEST();
}



function enterStateGAP() {
  syncLog('enterStateGAP');
  var delayTime = randomDelay(configGapTimeLow, configGapTimeHigh);
  syncLog('delay', delayTime);
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



//
// This file initializes the following services:
//   - HTTP for the purpose of WebUI
//   - HTTP for the purpose of REST API
//   - Discovery
//
// This file is also responsible for maintaining the state of a Site for the purposes
// of the election algorithm. We will be using the terminology and description from:
//    [Distributed Computing: Principles, Algorithms, and Systems](http://www.cs.uic.edu/~ajayk/Chapter9.pdf)
// and:
//    [WikiPedia](http://en.wikipedia.org/wiki/Ricart–Agrawala_algorithm)
// as guidance in implementing the algorithm.
//

var myHost = null;
var myPort = null;


//
// Synchronous logging to a shared log file
//

var fs = require('fs');
var util = require('util');

var syncLogFile = 'log.txt';
function syncLog() {  // uses 'arguments'
  var args = Array.prototype.slice.call(arguments, 0);
  var data = '[' + myHost + ':' + myPort + '] ' + util.format(args);
  fs.appendFileSync(syncLogFile, data + '\n');
  console.log(data);
}


//
// requestCounter is not part of the RA alg. It's just for animation purposes.
// The logicalClock might eventually supplant this.
//
var requestCounter = 0;
var backgroundColors = ['pink', 'lightsalmon', 'lightyellow', 'lightgreen', 'lightblue', 'plum'];


//
// Set up the WebUI/REST server
//

var Hapi = require('hapi');
var Path = require('path');
var Util = require('util');

var server = new Hapi.Server();
var c = server.connection();  // Uncomment to force port to 8000... { port: 8000 });


////////////////////////////////////////////////////////////////////////
// Discovery and self-identification
//
var serverDiscovery = require('./server-discovery.js');

var discoveryLocked = false;
var discoveredNodes = [];

function updateNodeList(nodeList) {
  var sortedList = nodeList.slice();
  sortedList.sort(
    function(left, right) {
      return left.advertisement.myPort > right.advertisement.myPort;
    });
  var result = sortedList.map(
    function(element) {
      var advertisement = element.advertisement;
      var url = 'http://' + advertisement.myHost + ':' + advertisement.myPort;
      console.log('map:', advertisement);
      return url;
    });
  return result;
}

server.networkChange = function (nodeList) {
  if (discoveryLocked) {
    syncLog('networkChange IGNORED. Discover is LOCKED');
  }
  else {
    discoveredNodes = updateNodeList(nodeList);
  }
};
////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////
// WebUI Stuff

server.views({
  engines: {
    html: require('handlebars')
  },

  isCached: false,    // Useful when using livereload

  path: __dirname // Path.join(__dirname, 'client')
});

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        var colorIndex = (requestCounter % backgroundColors.length);
        var context = {
            host: myHost,
            port: myPort,
            nodes: discoveredNodes,
            backgroundColor: backgroundColors[colorIndex]
        };
        requestCounter++;

        reply.view('client', context);
    }});

server.route({
    method: 'GET',
    path: '/{filename*}',
    handler: function (request, reply) {
        //console.log('GET /{filename*}', request.path);

        return reply.file('.' + request.path);
    }
});

////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////
// Ricart-Agrawala algorithm
//
// I'm taking some liberties with the original algorithm by reinterpreting the RD array as a list of
// Sites corresponding to deferred Requests, rather than a fixed-size array of length (num PIDs).
//
// I'm also having a Site's PID be it's 'host:port' string.
//

//
// State vars for the RA Algorithm
//
var RD = [];  // Request-Deferred array (I'm just using a list of PIDs)
var TS = 0;   // Lamport-style logical clock, incremented to T+1 upon a request with TS T.
var numTests = 0;

var entryREQUESTed = false;
var numPendingREPLY = 0;

function randomDelay(low, high) {
  var result = Math.floor(low + Math.random() * (high - low));

  return result;
}


function workLeave() {
  var workTime = randomDelay(1000, 5000);
  syncLog('Work', workTime);
  setTimeout(
    function () {
      syncLog('Leave');
      numTests--;
      if (numTests > 0) {
        delayEnterWorkLeave();
      }
      else {
        syncLog('Testing Complete');
        process.exit();
      }
    }, workTime);
}

var request = require('request');

function sendREQUEST() {
  syncLog('sendREQUEST');
  entryREQUESTed = true;
  numPendingREPLY = discoveredNodes.length - 1;

  function handleResponse(error, response, body) {
    if (error || response.statusCode != 200) {
      syncLog('    SENT sendREQUEST to ', site, ' RESPONSE:', response.body);
    }
  }

  for (var i = 0; i < discoveredNodes.length; ++i) {
    var site = discoveredNodes[i];
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

    request(options, handleResponse);
  }
}

function sendREPLY(targetID) {
  syncLog('sendREPLY(', targetID, ')');

  function handleResponse(error, response, body) {
    if (error || response.statusCode != 200) {
      syncLog('    SENT sendREPLY to ', site, ' RESPONSE:', response.body);
    }
  }

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

  request(options, handleResponse);
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


function enterWorkLeave() {
  syncLog('enterWorkLeave');

  //
  // We can't do work until we Enter the CS
  // So we have to async the work part using a continuation
  //
  sendREQUEST();
}



function delayEnterWorkLeave() {
  syncLog('delayEnterWorkLeave');
  var delayTime = randomDelay(100, 2000);
  syncLog('delay', delayTime);

  setTimeout(
    function () {
        enterWorkLeave();
    }, delayTime);
}


function testRA() {
  syncLog('testRA');
  numTests = 1;
  delayEnterWorkLeave();
}


//
// Routes that handle RA Messages
//

server.route({
    method: 'GET',
    path: '/REQUEST',
    handler: function (request, reply) {
        var colorIndex = (requestCounter % backgroundColors.length);
        var context = {
            host: myHost,
            port: myPort,
            nodes: discoveredNodes,
            backgroundColor: backgroundColors[colorIndex]
        };

        handleREQUEST(request);
        reply.view('ACK', context);
    }});

server.route({
    method: 'GET',
    path: '/REPLY',
    handler: function (request, reply) {
        var colorIndex = (requestCounter % backgroundColors.length);
        var context = {
            host: myHost,
            port: myPort,
            nodes: discoveredNodes,
            backgroundColor: backgroundColors[colorIndex]
        };

        handleREPLY(request);
        reply.view('ACK', context);
    }});


server.start(function () {
  myHost = server.info.host;
  var ip = require('ip');
  myHost = ip.address();
  myPort = server.info.port;

  myURI = 'http://' + myHost + ':' + myPort;

  syncLog('Server started at: ' + myURI);

  // syncLog('randomDelay(0, 1000)', randomDelay(0, 1000));
  // syncLog('randomDelay(1000, 2000)', randomDelay(1000, 2000));
  // syncLog('randomDelay(0, 5000)', randomDelay(0, 5000));
  // syncLog('randomDelay(5000, 100000)', randomDelay(5000, 100000));
  // process.exit();

  var discoveryDelay = 5000;
  syncLog('### Discovery Initiated for ', discoveryDelay, 'ms');

  serverDiscovery.startDiscovery(myHost, myPort, server.networkChange);

  setTimeout(
    function () {
      discoveryLocked = true;
      syncLog('### Discovery Complete and Locked. Site list is:');

      for (var i = 0; i < discoveredNodes.length; ++i) {
        syncLog('   [', i, '] ', discoveredNodes[i]);
      }

      testRA();
    }, discoveryDelay ); // Wait 10secs to open all processes.


  // On MacOSX, enable auto-open of the browser.
  if (process.platform === 'darwin') {
    var exec = require('child_process').exec;
    var myCmd = 'open -g http://' + myHost + ':' + myPort;
    exec(myCmd,  function (error, stdout, stderr) {
        if (error !== null) {
          syncLog('exec error: ' + error);
        }
    });
  }
});


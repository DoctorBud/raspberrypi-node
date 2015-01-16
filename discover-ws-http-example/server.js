//
// This file initializes the following services:
//   - HTTP for the purpose of WebUI
//   - HTTP/WebSocket for the purpose of live interaction/logging
//   - HTTP for the purpose of REST API
//   - Task Server
//   - Discovery


var myHost = null;
var myPort = null;
var wsPort = null;
var myTimer = null;

var serverDiscovery = require('./server-discovery.js');
var serverWebsocket = require('./server-websocket.js');
var serverTask = require('./server-task.js');


//
// Set up the WebUI/REST server
//

var Hapi = require('hapi');
var Path = require('path');
var Util = require('util');

var server = new Hapi.Server();
var c = server.connection();  // Uncomment to force port to 8000... { port: 8000 });

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
        var context = {
            host: myHost,
            port: myPort,
            wsPort: (myPort + 1),
            livereloadPort: (myPort + 2)
        };

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


var discoveryWS = null;
var discoveredNodes = [];

function sortNodeList(nodeList) {
  var sortedList = nodeList.slice();
  sortedList.sort(
    function(left, right)
    {
      console.log('left:', left);
      console.log('right:', right);
      return left.advertisement.myPort > right.advertisement.myPort;
    });
  return sortedList;
}

server.networkChange = function (nodeList) {
  discoveredNodes = sortNodeList(nodeList);
  if (discoveryWS) {
    discoveryWS.send(JSON.stringify(
      {
        msgType: 'discovery',
        nodeList: discoveredNodes
      }));
  }
  else {
    //console.log('networkChange unable to send. discoveryWS closed');
  }
};


server.start(function () {
    myHost = server.info.host;
    var ip = require('ip');
    myHost = ip.address();
    myPort = server.info.port;
    wsPort = myPort + 1;

    // console.log('server.info', Util.inspect(server.info));
    // console.log('myHost', myHost, ' myPort', myPort, ' wsPort', wsPort);
    myURI = 'http://' + myHost + ':' + myPort;

    console.log('Server started at: ' + myURI);

    serverDiscovery.startDiscovery(myHost, myPort, server.networkChange);

    serverWebsocket.startWS(myHost, wsPort,
      (function (ws) {
        discoveryWS = ws;
        server.networkChange(discoveredNodes);
        serverTask.startTask(ws);
        }),
      (function (ws) {
        serverTask.stopTask();
        }));


    // On MacOSX, enable livereload and auto-open of the browser.
    // Livereload disabled due to use of nodemon (see README.md)

    if (process.platform === 'darwin') {
      var livereload = require('livereload2');
      livereloadServer = livereload.createServer(
        {
          port: wsPort + 1
        });
      livereloadServer.watch(__dirname);

      var exec = require('child_process').exec;
      var myCmd = 'open http://' + myHost + ':' + myPort;
      exec(myCmd,  function (error, stdout, stderr) {
          console.log('stdout: ' + stdout);
          if (error !== null) {
            console.log('exec error: ' + error);
          }
      });
    }
});
console.log('\n\n\nRESTART\n\n\n');


//
// This file initializes the following services:
//   - HTTP for the purpose of WebUI
//   - HTTP for the purpose of REST API
//   - Discovery


var myHost = null;
var myPort = null;
var myTimer = null;

var serverDiscovery = require('./server-discovery.js');


//
// Set up the WebUI/REST server
//

var Hapi = require('hapi');
var Path = require('path');
var Util = require('util');

var server = new Hapi.Server();
var c = server.connection();  // Uncomment to force port to 8000... { port: 8000 });

var discoveryWS = null;
var discoveredNodes = [];

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
            nodes: discoveredNodes
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

    myURI = 'http://' + myHost + ':' + myPort;

    console.log('Server started at: ' + myURI);

    serverDiscovery.startDiscovery(myHost, myPort, server.networkChange);


    // On MacOSX, enable auto-open of the browser.

    if (process.platform === 'darwin') {
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


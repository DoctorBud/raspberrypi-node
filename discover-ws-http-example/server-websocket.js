
//
// Set up WebSocket server
//

var WebSocketServer = null;
var ws = null;
var wss = null;

function startWS(myHost, wsPort, onConnection, onClose) {
  WebSocketServer = require('ws').Server;
  wss = new WebSocketServer({port: wsPort});

  wss.on('connection', function (newWS) {
      ws = newWS;
      exports.ws = ws;  // Yes, not proper require() usage. Work in progress
      onConnection(ws);
      ws.on('message', function (message) {
          console.log('received: %s', message);
      });
      ws.on('close', function () {
          onClose();
          ws = null;
      });
  });

}

exports.startWS = startWS;

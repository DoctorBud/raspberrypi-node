
//
// Set up the Discovery mechanism
//
// Note: multicast does not work on MacOSX, so the default broadcast mechanism
//      is used. Multicast would be more efficient and well-behaved from a network
//      perspective, so I should eventually get it working.
//

var Discover = require('node-discover');

function startDiscovery(myHost, myPort, networkChange) {
  //
  // I found this very useful:
  //  https://delog.wordpress.com/2014/11/15/ip-multicasting/
  //

  var c = Discover(
          {
            // address: myHost,
            multicast: '224.0.0.1'    // Special multitask address
          },
          function (err) {
              //console.log('\n-----\nDiscover c.me:', c.me, ' err:', err);
          });

  // Let our peers know about us
  c.advertise({myHost : myHost,
               myPort : myPort
              });

  var nodeList = [c.me];
  networkChange(nodeList);

  c.on("added", function (obj) {
      // console.log('Node added:', obj.advertisement);
      // console.log(' here are all the nodes:');

      var nodeList = [c.me];

      c.eachNode(function (node) {
          console.log(node.advertisement);
          nodeList.push(node);
      });

      networkChange(nodeList);
  });

  c.on("removed", function (obj) {
      console.log('Node removed:', obj.advertisement);
      console.log(' here are all the nodes:');
      var nodeList = [c.me];
      c.eachNode(function (node) {
          console.log(node.advertisement);
          nodeList.push(node);
      });
      networkChange(nodeList);
  });
}

// exports.nodeList = nodeList;
exports.startDiscovery = startDiscovery;

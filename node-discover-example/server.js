var Discover = require('node-discover');

var ip = require('ip');
myHost = ip.address();
myPid = process.pid;

var useMulticast = true;
var d = null;

if (useMulticast) {
    //
    // I found this very useful:
    //  https://delog.wordpress.com/2014/11/15/ip-multicasting/
    //

    d = Discover(
            {
              // address: myHost,
              multicast: '224.0.0.1'    // Special multitask address
            },
            function (err) {
                console.log('\n-----\nDiscover d.me:', d.me, ' err:', err);
            });
}
else {
    d = Discover();
}

// Let our peers know about us
d.advertise({
                myHost : myHost,
                myPid : myPid
            });


d.on("promotion", function () {
    /*
     * Launch things this master process should do.
     *
     * For example:
     *  - Monitior your redis servers and handle failover by issuing slaveof
     *    commands then notify other node instances to use the new master
     *  - Make sure there are a certain number of nodes in the cluster and
     *    launch new ones if there are not enough
     *  - whatever
     *
     */

    console.log("\n-----\nI was promoted to a master: ", d.me);
});

d.on("demotion", function () {
    /*
     * End all master specific functions or whatever you might like.
     *
     */

    console.log("\n-----\nI was demoted from being a master: ", d.me);
});

d.on("added", function (obj) {
    console.log("\n-----\nA new node has been added: ", obj);
});

d.on("removed", function (obj) {
    console.log("\n-----\nA node has been removed: ", obj);
});

d.on("master", function (obj) {
    /*
     * A new master process has been selected
     *
     * Things we might want to do:
     *  - Review what the new master is advertising use its services
     *  - Kill all connections to the old master
     */

    console.log("\n-----\nA new master is in control: ", obj);
});


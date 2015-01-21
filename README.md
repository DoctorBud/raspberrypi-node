## raspberrypi-node - RaspberryPi, NodeJS, Websockets and More

This repo contains a NodeJS application (`discover-ws-http-example`) that is designed to act as a server to be installed on small devices such as RaspberryPi, as well as being able to run on any Unix-based system capable of NodeJS. This work was originally intended for a Software Engineering class I assisted at University of Oregon. The class goal was to explore and implement different distributed system and software engineering principles by using RaspberryPi nodes as the primary computing engines.

The basic class involves small teams of students solving various problems by assembling a network of Raspberry Pis, each of which runs a NodeJS server. The rPis perform tasks, update their displays, and communicate with each other to implement distributed algorithms.


### Components

- node-discover-example - A UI-less nodeJS application based upon the node-discover README example.
- simple-discover-ui - Extends the above with a HapiJS-served UI using browser polling.
- discover-ws-http-example - Fancy Bootstrap/AngularJS UI with live updates via WebSockets.
- pitft-pygame - Unrelated to the above, this is an example of how to use a RaspberryPi equipped with a PiTFT LCD (from Adafruit) to display and receive touch events. I could not find a suitable NodeJS equivalent.

### Features of discover-ws-http-example

The application provided here is a skeleton of a full application, with only enough code to handle the following:

- Serving up a UI and REST API over HTTP
- Providing an AngularJS-based UI that can identify a node, its services, and its neighbors.
- Providing a simple discovery mechanism so that other nodes running this same stack can detect eah other.
- Provides a WebSocket channel to support the UI. This is primarily to allow debugging and bidirectional communication between an rPi node and its WebUI. WebSockets are not used for inter-pi communication at this time.
- Simple examples of service invocation and background tasking.

### Quickstart Guide

#### Mac/Linux

```
cd raspberrypi-node/discover-ws-http-example/
npm install
node server.js
```

On a Mac, this should result in your web browser being opened and will also initiate a backend task that does nothing other than updating `taskState` and `taskCounter`. As these values update, the client will display the new values.

On a Linux box, you will need to point your browser at `localhost:<port>`, where `port` is printed by `server.js` at startup.

In another terminal window, start another instance of the app with `node server.js` and a unique port will be chosen for the UI and WebSocket channels. Each node will *discover* the other and display it.


#### Windows

Not supported by me. Some of this might work, but I don't really think about Windows unless I'm being paid to.


### Constraints and Goals

I've spent some time evaluating various techs to come up with a set of libraries and tools that will install and run effectively on the rPi without requiring excessive installation time or dependencies.

 One constraint has been that the *distributed system* aspect is implemented in NodeJS, with the option of initiating and monitoring Python-based *tasks*. I've tried to choose a minimal set of technology to achieve this goal while still allowing the following capabilities:

- No database required, yet able to work with one if necessary for a particular homework problem.
- Ability to serve both UI and API HTTP requests.
- Ability to send (via POST or GET) messages to other rPis.
- Avoid inclusion of third-party libraries into the source repo, instead relying on package management (`npm` or `bower`) to pull libraries. This allows the repo to only contain source code relevant to the course and homework problems.
- If `npm` is sufficient, then avoid the use of `bower`.
- Ensure a rapid development cycle so that edit-save-refresh and edit-save-restart are easy. I use `livereload2` to achieve this for front-end editing, and `nodemon` for back-end editing.

#### Non-goals

The mini-apps built with this stack are designed to encourage *distributed algorithm* and *Internet of Things* experimentation, and are intended to be prototypes. Optimizations such as `grunt` or `gulp`-based minification of assets are not desired, since they potentially slow down experimentation and increase the amount of source files needed.


### Backend Tech

The rPis are running Raspbian, a Debian variant. Most of the necessary Unix software can be installed via `apt-get`. However, there is no convenient package distribution for recent NodeJS versions, so part of the configuration of the rPi includes building NodeJS v 0.10 on the rPi. This takes some time.

#### npm (Node Package Manager)

I use the following `package.json` file to enable `npm` to pull third-party libraries to the rPi node; this includes both backend components (e.g., `hapi.js`) and frontend components (e.g., AngularJS). By using (abusing?) npm to install frontend components, I can dodge the use of `bower`, which would add unnecessary complexity, tooling and source files. To create a *production* application, it would be necessary to eventually adopt `bower` or perhaps use `Browserify` to minify frontend assets.

`package.json` contents:

```
    "angular": "^1.3.36",
    "angular-bootstrap-npm": "^0.12.2",
    "bootstrap": "^3.3.1",
    "handlebars": "^2.0.0",
    "hapi": "^8.0.0",
    "ip": "^0.3.2",
    "livereload2": "^1.0.1",
    "node-discover": "0.0.14",
    "ws": "^0.6.3"
```


#### Hapi.js

I chose to use `Hapi.js` instead of raw NodeJS for my webserver needs. Hapi seems to be a more modern and flexible framework than Express, which is more popular. Express vs Hapi in NodeJS reminds me of Flask vs Django in Python; both Hapi and Flask seem more appropriate for lightweight API servers implementing microservices.

#### node-discover

Not a perfect library, but convenient for allowing rPi nodes to advertise and discover services and each other. There is a forked repo, `node-discovery`, which doesn't work as well for me.

#### ws

The `ws` package makes it easier to serve up Websockets from the NodeJS server.

#### handlebars

The `handlebars` templating system is being used (via `hapi.js`) to enable server-side template expansion prior to delivering pages to a browser. Because handlebars uses `{{}}` as delimiters, and this appears to not be overrideable, I ended up telling AngularJS to use `{[]}` as its delimiters, so that my AngularJS expressions can be interpreted on the client.

#### nodemon

The `nodemon` tool allows a NodeJS program to *watch* project files and be automatically restarted when one of these changes. This helps speed up backend development by easing and automating the edit-save-restart-test cycle when messing with the NodeJS files on the server.

To install:
```
npm install -g nodemon
```

To use:
```
cd hw1			# Homework1 or whichever app dir is appropriate
nodemon -V -e js,html,css server.js
```
For client-side rapid development, I recommend not using `nodemon` (just use `node` instead), and enabling the LiveReload mechanism (enabled by default at this time) to allow for edit-save-autorefresh.

### Frontend tech

#### AngularJS

I like `AngularJS` for prototyping web applications. It's pretty easy to incorporate and use for small applications. Critics of AngularJS point out that it may not scale to large or complex applications, but for the purpose of this course, it seems ideal.

I'm overriding the default `{{}}` AngularJS interpolation to not conflict with handlebars (see above).


#### ui-bootstrap

The `ui-bootstrap` package is a set of AngularJS code and directives that is intended to be used with Twitter Bootstrap 3.0 CSS. I like to use `ui-bootstrap` because it supports most of the capabilities of jQuery-based Bootstrap without requiring jQuery. I try to avoid using jQuery where possible, since I believe it encourages difficult-to-maintain code.

#### LiveReload2

Similar in function to `nodemon`, LiveReload2 consists of a client and server library that together allow a developer to cause a browser to reload a page whenever the server detects a change in a relevant source file. LiveReload2 is currently enabled in this stack. If you use `nodemon`, then you may wish to disable LiveReload2 since it will result in unnecessary refreshes.










var express = require('express');
var bodyParser = require('body-parser');
var config = require('./config.json');
var http = require('http');
var EventEmitter = require("events").EventEmitter;
var jsonPath = require('JSONPath');
var os = require("os");

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

var buildCallback = function(emitter) {
	var callback = function(response) {
		response.setEncoding('utf8');

		var data = '';
		response.on('data', function (chunk) {
			data += chunk;
		});

		response.on('end', function () {
			emitter.data = data;
			emitter.emit('update');
		});
	};
	return callback;
};

var buildPostOptions = function(path, post_data) {
	return {
		hostname: config.dockerHostName,
		port: config.dockerPort,
		path: path,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	};
};

var buildGetOptions = function(path) {
	return 	{
		hostname: config.dockerHostName,
		port: config.dockerPort,
		path: path,
		method: 'GET'
	};
};

// Generic heartbeat endpoint
app.get('/', function(req, res) {
  res.type('text/plain');
  res.statusCode = 200;
  res.send('OK');
});

// List Servers
// List of server information required for interacting with and
// displaying status of server
app.get('/servers', function(req, res) {
	res.type('application/json');

	var responseVal = new EventEmitter();
	http.request(buildGetOptions('/containers/json?all=1'), buildCallback(responseVal)).end();

	responseVal.on('update', function () {
		var responseObjects = [];

		var hostName = os.hostname();
		var serverList = jsonPath.eval(JSON.parse(responseVal.data), '$.*');
		
		serverList.forEach(function(server) {
			var responseObj = {
				'Hostname': hostName,
				'Port': jsonPath.eval(server, '$.Ports.*.PublicPort')[0],
				'RequestedBy': jsonPath.eval(server, '$.Names.[0]')[0], // provided by a label later
				'Status' : jsonPath.eval(server, '$.Status')[0],
				'ID': jsonPath.eval(server, '$.Id')[0]
			};
			responseObjects.push(responseObj);
		});
		res.json(responseObjects);
	});
});


// Request Server
// Determine if a server can be started and start if it can
app.post('/servers', function(req, res) {
	if(!req.body.requestedBy) {
		res.statusCode = 400;
		return res.send('Error 400: Bad request.');
	}

	// Get all of the servers, to determine if this person already has an active server
	// If they do not, and we have not reached the maximum number of servers, create a new one
	// The user IP will be used to show the requester.
	// Will have to test this on multiple computers in the network.
	// This can eventually be replaced by LDAP
	var responseVal = new EventEmitter();
	http.request(buildGetOptions('/containers/json?all=1'), buildCallback(responseVal)).end();

	responseVal.on('update', function () {
		var responseObjects = [];
		var userIP = req.socket.remoteAddress;
		var hostName = os.hostname();
		var serverList = jsonPath.eval(JSON.parse(responseVal.data), '$.*');
		
		serverList.forEach(function(server) {
			var responseObj = {
				'Hostname': hostName,
				'Port': jsonPath.eval(server, '$.Ports.*.PublicPort')[0],
				'RequestedBy': jsonPath.eval(server, '$.Names.[0]')[0], // provided by a label later
				'Status' : jsonPath.eval(server, '$.Status')[0],
				'ID': jsonPath.eval(server, '$.Id')[0]
			};
			responseObjects.push(responseObj);
		});

		var ports = [];
		responseObjects.forEach(function(server) {
			if(server.Port != undefined) {
				ports.push(server.Port);
			}

			if (server.RequestedBy == userIP) {
				res.statusCode = 403;
				return res.send('Error 403: User already has an active server.');
			}
		});

		if (ports.length <= (config.maxPort-config.minPort)) {
			ports.sort();

			var nextAvailPort = config.minPort;
			for(i = 0; i < ports.length; i++) {
				if(ports[i] != (config.minPort + i)) {
					nextAvailPort = (config.minPort + i);
					break;
				} else if ((i+1) >= ports.length) {
					nextAvailPort = (config.minPort + (i + 1));
					break;
				}
			}

			var post_data = JSON.stringify({
				"ExposedPorts": {
					"8080/tcp": {}
				},
				"HostConfig": {
					"PortBindings": {
						"8080/tcp": [
							{
								"HostPort": "" + nextAvailPort
							}
						]
					}
				},
				"Image": "phusion/baseimage:latest",
				"Labels": {
					"requestedBy": userIP
				}
			});

			var createServerHandler = new EventEmitter();
			var createServerReq = http.request(buildPostOptions('/containers/create'), buildCallback(createServerHandler));
			createServerReq.write(post_data);
			createServerReq.end();

			createServerHandler.on('update', function () {
				var responseObjects = [];
				var newServerId = jsonPath.eval(JSON.parse(createServerHandler.data), '$.Id')[0];
				res.type('application/json')
				var responseObj = {
					'ID': newServerId
				};

				// Start the server
				var startServerHandler = new EventEmitter();
				var startServerReq = http.request(buildPostOptions('/containers/' + newServerId + '/start'), buildCallback(startServerHandler));
				startServerReq.write(post_data);
				startServerReq.end();

				startServerHandler.on('update', function () {
					res.json(responseObj);
				});
			});
		} else {
			res.statusCode = 403;
			return res.send('Error 403: Maximum number of servers has been reached.');
		}
	});
});


// Relinquish Server
// Stops and deletes the container
app.delete('/servers/:id', function(req, res) {
	if(!req.params.id /*|| (we don't have this resource)*/) {
		res.statusCode = 404;
		return res.send('Error 404: resource not found');
	}

	res.type('text/plan');
	res.send('Server ' + req.params.id + ' has been relinquished.');
});

app.listen(process.env.PORT || 4730);

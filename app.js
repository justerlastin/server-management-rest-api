var express = require('express');
var bodyParser = require('body-parser');
var config = require('./config.json');
var http = require('http');
var EventEmitter = require("events").EventEmitter;
var jsonPath = require('JSONPath');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

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

	var responseObjects = []
	var responseObj = {
		'Hostname':'TSERVER',
		'Port':'8081',
		'RequestedBy':'tester',
		'ID':'0928312nkpo12309u123npoi1239u123123poojpojsdf'
	};
	responseObjects.push(responseObj);

	var options = {
		host: config.dockerHost,
		path: '/containers/json'
	};

	var responseVal = new EventEmitter();
	responseVal.on('update', function () {
    		results = responseVal.data;
	});

	var callback = function(response) {
		var str = '';
	 
		response.on('data', function (chunk) {
			str += chunk;
		});

		response.on('end', function () {
			responseVal.data = str;
			responseVal.emit('update');
		});
	};

	http.request("http://" + config.dockerHost + "/containers/json", callback).end();

	responseVal.on('update', function () {
                // This is where I create an object from the JSON
		// Then i can parse out what I want from it and return the results
                console.log("Json evaluated: " + jsonPath.eval(responseVal.data, '$.*'));
       		res.json(responseVal.data); 
	});
});

// Request Server
// Determine if a server can be started and start if it can
app.post('/servers', function(req, res) {
	if(!req.body.requestedBy) {
		res.statusCode = 400;
		return res.send('Error 400: Bad request.');
	}

	res.type('application/json');

	var responseObj = {
		'ID': '23123ojpojsdf0928312nkpo12309u123npoi1239u1'
	};

	res.json(responseObj);
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

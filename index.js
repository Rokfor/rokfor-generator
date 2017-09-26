/**
 *  Rokfor Generator
 *  ----------------
 *
 *  Listens to incoming requests
 *  Generates a PDF based upon templates  
 *
 **/

"use strict";

var config     = require('./config/config.js'),
    q          = require("q"),
    express    = require('express'),
    bodyParser = require('body-parser'),
    fs         = require('fs'),
    Log        = require('log'),
    log        = new Log(config.loglevel, fs.createWriteStream('my.log')),
    generator  = require('./lib/generator.js')(config, log),
    app        = express(),
    jsonParser = bodyParser.json(),
    port       = process.env.PORT || config.pollport;

const version = 1.1;


app.post('/:projectname', jsonParser, function (req, res) {
  generator.run(req.params.projectname, req.body);
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({application: "Rokfor Generator", version: version, status: "ok"})); 
});

app.get('/',function(req,res)
{
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({application: "Rokfor Generator", version: version})); 
});

 
app.listen(port, function () {
  log.info("* starting Rokfor -> Writer Sync...")
  log.info(`  - Listening on Port ${port}`)
});


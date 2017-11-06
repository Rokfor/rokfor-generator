/**
 *  Rokfor Generator
 *  ----------------
 *
 *  Listens to incoming requests
 *  Generates a PDF based upon templates  
 *
 **/

"use strict";

const version = 0.9;

var config     = require('./config/config.js'),
    q          = require("q"),
    express    = require('express'),
    bodyParser = require('body-parser'),
    fs         = require('fs'),
    Log        = require('log'),
    log        = new Log(config.loglevel, fs.createWriteStream('my.log')),
    slack      = require('./lib/slack.js')(config, log),
    generator  = require('./lib/generator.js')(config, log, slack),
    git        = require('./lib/git.js')(config, log, slack),
    ghwebhook  = require('express-github-webhook'),
    app        = express(),
    jsonParser = bodyParser.json(),
    port       = process.env.PORT || config.pollport;

// Github hooking

var github = ghwebhook({ path: '/github/webhook', secret: config.github_secret });
app.use(bodyParser.json());
app.use(github);
github.on('push', function (repo, data) {
  git.clone(repo, data.repository.clone_url);
});

// Gitlab hooking

app.post('/gitlab/webhook', jsonParser, function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (
    req.headers['x-gitlab-token'] === config.gitlab_secret
    && req.body.object_kind === "push"
    ) {
    git.clone(req.body.repository.name, req.body.repository.git_ssh_url);
    res.send(JSON.stringify({application: "Rokfor Generator", version: version, status: "ok"})); 
  } 
  else {
    res.send(JSON.stringify({application: "Rokfor Generator", version: version, status: "error"})); 
  }
});

app.post('/generate/:projectname', jsonParser, function (req, res) {
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


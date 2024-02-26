/**
 *  Rokfor Generator
 *  ----------------
 *
 *  Command Line Utility.
 *  Runs the generator locally.
 *
 **/

"use strict";

// Import the dotenv package
require('dotenv').config();
const plugin = process.env.PLUGIN;
const url = process.env.URL;
const passes = process.env.PASSES || 1;
const issueId = parseInt(process.env.ISSUE_ID, 10); // Convert ISSUE_ID to an integer


var config     = require('./config/config.js'),
    fs         = require('fs'),
    Log        = require('log'),
    log        = new Log(config.loglevel, fs.createWriteStream('my.log')),
    slack      = require('./lib/slack.js')(config, log),
    pkg        = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const version = pkg.version;


const createIssue = function(projectname, issue, instance) {
  const configuration = 
    { 
        CallbackUrl  : `http://${instance}/api/exporter`,
        Passes       : passes,
        Issue        : issue
    }
  let generator  = require('./lib/generator.js')(config, log, slack);
  generator.runLocal(projectname, configuration);
};


console.log(`Rokfor Generator CLI:`);
console.log(`Plugin: ${plugin}`);
console.log(`URL: ${url}`);
console.log(`Issue ID: ${issueId}`);


createIssue(
  plugin,
  issueId,
  url
)

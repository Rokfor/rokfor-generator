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
const issueId = process.env.ISSUE_ID ? parseInt(process.env.ISSUE_ID, 10) : null; // Convert ISSUE_ID to an integer
const contributionId = process.env.CONTRIBUTION_ID ? parseInt(process.env.CONTRIBUTION_ID, 10) : null
const runner = process.env.RUNNER || 1;

var config     = require('./config/config.js'),
    fs         = require('fs'),
    Log        = require('log'),
    log        = new Log(config.loglevel, fs.createWriteStream('my.log')),
    slack      = require('./lib/slack.js')(config, log),
    pkg        = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const version = pkg.version;


const createIssue = function(projectname, issue, contribution, instance) {
  const configuration = 
    { 
        CallbackUrl  : `http://${instance}/api/exporter`,
        Passes       : passes,
        Issue        : issue,
        Contribution : contribution
    }
  let generator = require('./lib/generator.js')(config, log, slack)

  generator.runLocal(projectname, configuration);

};




const createIssue_v2 = function(projectname, issue, contribution, instance) {
  const payload = issue 
    ? {issue: issue} 
    : contribution
      ? {data: contribution}
      : null
  if (payload === null) {
    console.log(`\x1b[32m[RUNNER]\x1b[0m Issue Id or Contribution Id must be set in .env`)
  }
  const configuration = 
    { 
      callback    : `http://${instance}/api/exporter/callback/0`,
      id          : 0,
      payload     : payload,
      passes      : passes
    }
  let generator = require('./lib/generator_v2.js')(config, log, slack)
  generator.runLocal(projectname, configuration);

};

if (runner === 1)
  createIssue(
    plugin,
    issueId,
    contributionId,
    url
  )
else
  createIssue_v2(
    plugin,
    issueId,
    contributionId,
    url
  )
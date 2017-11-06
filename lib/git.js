
module.exports = function(config, log, slack) {

  /* Central Data Structure */

  const 
      workdir     = __dirname + '/../templates';
      q           = require("q"),
      fs          = require('fs'),
      path        = require('path'),
      git         = require('simple-git')(workdir);

  log.info(`  - GIT: Setting up in ${workdir}`)

  module.clone = function(name, repo) {
    log.info(`  - Starting to clone ${repo} as ${name}`)
    git.silent(true).clone(repo, name, [], function(err,res){
      if (err) {
        log.error(`  - Error Cloning... Try pull ${err}`)
        require('simple-git')(workdir + '/' + name).pull(function(err, succ){
          if (err) {
            log.error(`  - Error Pulling ${repo}: ${err}`)
          }
          else {
            log.info(`  - Pulled ${repo}`);            
            slack.notify(`ROKFOR GENERATOR: Pulled ${repo}`)
          }
        });
      }
      else {
        log.info(`  - Cloned ${repo}`);
        slack.notify(`ROKFOR GENERATOR: Cloned ${repo}`)
      }
    });
  }

  return module;
}
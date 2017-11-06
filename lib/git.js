
module.exports = function(config, log) {

  /* Central Data Structure */

  const 
      workdir     = __dirname + '/../templates';
      q           = require("q"),
      fs          = require('fs'),
      path        = require('path'),
      git         = require('simple-git')(workdir);

  log.info(`  - GIT: Setting up in ${workdir}`)

  module.clone = function(name, repo) {
    log.info(`  - Starting to clone ${repo}`)
    git.silent(true).clone(repo, name, [], function(err,res){
      if (err) {
        require('simple-git')(workdir + '/' + name).pull(function(err, succ){
          if (err) {
            log.error(`  - Error Pulling ${repo}: ${err}`)
          }
          else {
            log.info(`  - Pulled ${repo}`);            
          }
        });
      }
      else {
        log.info(`  - Cloned ${repo}`);
      }
    });
  }

  return module;
}
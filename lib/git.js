
module.exports = function(config, log) {

  /* Central Data Structure */

  const 
      q           = require("q"),
      fs          = require('fs'),
      path        = require('path'),
      git         = require('simple-git')(__dirname + '/templates');


  module.clone = function(name, repo) {
    log.info(`  - Starting to clone ${repo}`)
    git.silent(true).clone(repo, name, [], function(err,res){
      if (err) {
        require('simple-git')(__dirname + '/templates/' + name).pull(function(err, succ){
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
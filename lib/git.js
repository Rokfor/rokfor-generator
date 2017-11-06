
module.exports = function(config, log, slack) {

  /* Central Data Structure */

  const 
      workdir     = __dirname + '/../templates',
      git         = require('simple-git')(workdir),
      url         = require('url').URL;

  log.info(`  - GIT: Setting up in ${workdir}`)

  module.clone = function(name, repo, mode) {
    var myURL = new url(repo);
    if (mode === "github") {
      if (config.github.password) 
        myURL.password = config.github.password;
      if (config.github.user) 
        myURL.username = config.github.user; 
    }
    if (mode === "gitlab") {
      if (config.gitlab.password) 
        myURL.password = config.gitlab.password;
      if (config.gitlab.user) 
        myURL.username = config.gitlab.user; 
    }
    log.info(`  - Starting to clone ${repo} as ${name}`)
    git.silent(true).clone(myURL.href, name, [], function(err,res){
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
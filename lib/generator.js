
module.exports = function(config, log) {

  var module = {},
      q      = require("q");

  module.initialize = function(project, params) {
    /*var deferred = q.defer();
    blabla.then(function(data) {
      deferred.resolve(data);
    });
    return deferred.promise;*/
    log.info(`  - Incoming Project ${project}`)
  	console.log(params);
  }
  
  return module;
}
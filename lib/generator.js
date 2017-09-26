
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
 

  module.post = function() {

{
  "Status": "Complete",
  "Url"   : {"Cover":"http://www.example.com/aaaadf.pdf", "Inside":"http://www.example.com/aaaadf.pdf"},
  "Pages" : 4000,
  "Token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsImp0aSI6InJmNTljYTBiOTBkYTgyMTcuNzY1Mjc1OTYifQ.eyJpc3MiOiJsb2NhbGhvc3Q6ODA4MCIsImF1ZCI6ImxvY2FsaG9zdDo4MDgwIiwianRpIjoicmY1OWNhMGI5MGRhODIxNy43NjUyNzU5NiIsImlhdCI6MTUwNjQxMzQ1NiwibmJmIjoxNTA2NDEzNDU2LCJ1aWQiOjI2LCJleHAiOjE1MDY0OTk4NTZ9.W3Qs-8PiKhaWHJuU7Dy1xbyk6tBy8knxokmBZISX6oQ"
}
    
  }

  return module;
}
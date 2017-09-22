
module.exports = {
  api : {
    "endpoint" : '',      // Rokfor API Endpoint (Ending on /api/)
    "user"     : '',      // Rokfor API User (needs root level)
    "rwkey"    : '',      // Rokfor R/W Key for JWT Creation
    "rokey"    : '',      // Rokfor R/O Key
  },
  pollport    : 8888,     // Listener Port for Route Hook Callbacks
  loglevel    : 'debug'
}

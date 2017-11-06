module.exports = {
  api : {
    "endpoint"  : '',      // Rokfor API Endpoint (Ending on /api/)
    "user"      : '',      // Rokfor API User (needs root level)
    "rwkey"     : '',      // Rokfor R/W Key for JWT Creation
    "rokey"     : '',      // Rokfor R/O Key
  },
  github        : {
    secret      : 'token-defined-in-webhook'
  }
  gitlab        : {
    user        : '',
    password    : '',
    secret      : 'token-defined-in-webhook'
  }
  pollport      : 8888,     // Listener Port for Route Hook Callbacks
  loglevel      : 'debug',
  s3_aws_key    : '',
  s3_aws_secret : '',
  s3_aws_region : '',
  s3_aws_bucket : '',
  download      : 'http://provider/bucket',
  slack_hook    : ''
}
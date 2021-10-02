module.exports = {
  api : [
    {
      "endpoint" : '',
      "user"      : '',      // Rokfor API User (needs root level)
      "rwkey"     : '',      // Rokfor R/W Key for JWT Creation
      "rokey"     : ''
    }
  ],
  github        : {
    secret      : 'token-defined-in-webhook'
  },
  gitlab        : {
    ssh         : true,
    user        : '',
    password    : '',
    secret      : 'token-defined-in-webhook'
  },
  latex         : {
    cmd         : 'lualatex',
    bibtexCMD   : 'biber',
  },
  pollport      : 8888,     // Listener Port for Route Hook Callbacks
  loglevel      : 'debug',
  s3_aws_key    : '',
  s3_aws_secret : '',
  s3_aws_region : '',
  s3_aws_bucket : '',
  download      : 'http://provider/bucket',
  slack_hook    : ''
}

module.exports = function(config, log, slack) {

  /* Central Data Structure */

  const 
      q           = require("q"),
      unirest     = require("unirest"),
      nj          = require('nunjucks'),
      temp        = require('temp'),
      fs          = require('fs'),
      path        = require('path'),
      exec        = require('child_process').exec,
      latex       = require('node-latex'),
      pdfinfo     = require('pdfinfojs'),
      s3          = require('@monolambda/s3'),
      templatedir = '../templates/',
      workdir     = '../tmp',
      njsettings = {
        autoescape: true,
        tags: {
          blockStart: '<%',
          blockEnd: '%>',
          variableStart: '<$',
          variableEnd: '$>',
          commentStart: '<#',
          commentEnd: '#>'
        }
      };

  temp.track();


  const s3client = s3.createClient({
    s3Options: {
      accessKeyId: config.s3_aws_key,
      secretAccessKey: config.s3_aws_secret,
      region: config.s3_aws_region
    },
  });

  /* utils is passed to controller callbacks in templates */

  var utils = require('./utils.js')(config, log, slack);


  module.escapeJSON = function(string) {
    return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
      // Escape all characters not included in SingleStringCharacters and
      // DoubleStringCharacters on
      // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
      switch (character) {
        case '"':
        case "'":
        case '\\':
          return '\\' + character
        // Four possible LineTerminator characters need to be escaped:
        case '\n':
          return '\\n'
        case '\r':
          return '\\r'
        case '\u2028':
          return '\\u2028'
        case '\u2029':
          return '\\u2029'
      }
    })
  }


  module.run = function(project, params) {
    log.info(`  - Incoming Project ${project}`)
    utils.gdata   = {
      name:      project,
      id:        params.ProcessId,
      token:     params.Token,
      callback:  params.CallbackUrl,
      config:    params.Configuration, 
      selection: params.Selection,
      files:     {},
      fileinfo:  {}
    };

    module.processing().then(function(success){
      module.creator().then(function(success){
        module.callback(success).then(function(err){
          log.info(`  - POST Rokfor Result: ${err}`)
          slack.notify(`ROKFOR GENERATOR: Generated ${project}`)
        });  
      }, 
      function(error) {
        module.callback(false, error).then(function(err){
          log.info(`  - POST Rokfor Result: ${err}`)
          slack.notify(`ROKFOR GENERATOR: Error ${project}`)
        });  
      });
    }, 
    function(error) {
      log.info(`  - POST Token not valid: ${err}`)
      slack.notify(`ROKFOR GENERATOR: Token not valid for ${project}`)
    })
  }

  module.creator = function() {
    var deferred = q.defer();
    delete require.cache[require.resolve(`${templatedir}${utils.gdata.name}/config.js`)];
    var plugin   = require(`${templatedir}${utils.gdata.name}/config.js`);
    const texsettings = {
      inputs: path.resolve(path.join(__dirname + '/' + templatedir + utils.gdata.name, 'extensions')),
      fonts: path.resolve(path.join(__dirname + '/' + templatedir + utils.gdata.name, 'fonts')),
      passes: 3,
      cmd: 'xelatex',
      errorLogs: path.join(__dirname + '/' + templatedir + utils.gdata.name, 'error.log'),
      args: [
        '-halt-on-error',
        '-shell-escape',
        '-enable-write18'
      ]
    };

    Object.keys(plugin).forEach(async function(output,index) {
      var outputconfig = plugin[output];
      var tex          = [];
      for (var i = 0, len = outputconfig.length; i < len; i++) {
        var page = outputconfig[i];
        var data = {};
        try {
          data = await page.controller(utils);
        }
        catch(err) {
          log.error(`  - Error in Callback Controller for Plugin ${output}`)
          slack.notify(`ROKFOR GENERATOR: Error in Callback ${output}: ${err}`)
          return;
        }
        data._utils = utils;
        log.info(`  - Nunjuck Path:  ${__dirname + '/' + templatedir + utils.gdata.name}`)
        nj.configure(__dirname + '/' + templatedir + utils.gdata.name, njsettings);
        tex.push(nj.render(page.template, data));
      }
      temp.mkdir('pdfcreator', function(err, dirPath) {
        var outputPath = path.join(dirPath, 'input.pdf')
        const oStream  = fs.createWriteStream(outputPath);
        const lStream  = latex(tex.join("\n"), texsettings);
        lStream.on('error', function(err) {
          log.info(`  - Error Creating PDF ${err}`)
          return deferred.reject(err);
        })
        lStream.pipe(oStream);
        oStream.on('error', function(err) {
          log.info(`  - Error Creating PDF ${err}`)
          return deferred.reject(err);
        })
        oStream.on('finish', function () {
          try {
            let pdf = new pdfinfo(outputPath);
            utils.gdata.fileinfo[output] = pdf.getInfoSync();
          }
          catch(err) {
            log.info(`  - Error getting PDF INFO`)
            return deferred.reject('PDFINFO Failed');
          }

          var d = new Date();
          var r = Math.round(Math.random() * 1000);
          var uploadName = utils.gdata.name + "_" + d.getTime() + "_" + r + ".pdf";
          var uploader = s3client.uploadFile({
            localFile: outputPath,
            s3Params: {
              Bucket: config.s3_aws_bucket,
              Key: uploadName,
              ACL: "public-read"
            },
          });

          uploader.on('error', function(err) {
            return deferred.reject(`Upload Failed...${err}`);
          });

          uploader.on('end', function() {
            fs.unlink(outputPath);
            log.info(`  - Uploaded PDF to:  ${config.download + "/" + uploadName}`)
            utils.gdata.files[output] = config.download + "/" + uploadName;
            if (Object.keys(utils.gdata.files).length == Object.keys(plugin).length) {
              log.info(`  - Distilled all Files`) 
              deferred.resolve(true);
            }
          });




        });
      });
    });

    return deferred.promise;
  }


   module.processing = function() {
    var deferred = q.defer();
    var payload = {
          "Status": "Processing",
          "Token" : utils.gdata.token
    }
    log.info(`  - POST Rokfor:  ${utils.gdata.callback}`)
    var req = unirest("POST", utils.gdata.callback);
    req
      .headers({
        "Content-Type": "application/json"
      })
      .type("json")
      .send(payload)
      .end(function (res) {
        if (res.body.Error) {
          deferred.resolve(res.body.Error);
        }
        else {
          deferred.resolve(res.body.Success);
        }
      });
    return deferred.promise;
  } 
 

  module.callback = function(success, errormessage) {
    var deferred = q.defer();
    var payload;
    var err = {Error: module.escapeJSON(errormessage || "")};
    if (utils.gdata.files && success) {
      payload = {
          "Status": "Complete",
          "Url"   : utils.gdata.files,
          "Pages" : utils.gdata.fileinfo,
          "Token" : utils.gdata.token
      }
    }
    else {
      payload = {
          "Status": "Error",
          "Pages" : err,
          "Token" : utils.gdata.token
      }
    }

    log.info(`  - POST Rokfor:  ${utils.gdata.callback}`)
    var req = unirest("POST", utils.gdata.callback);
    req
      .headers({
        "Content-Type": "application/json"
      })
      .type("json")
      .send(payload)
      .end(function (res) {
        if (res.body.Error) {
          deferred.resolve(res.body.Error);
        }
        else {
          deferred.resolve(res.body.Success);
        }
      });

    return deferred.promise;
  }

  return module;
}
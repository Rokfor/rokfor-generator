
module.exports = function(config, log) {

  /* Central Data Structure */

  module.gdata   = {};
  
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
    module.gdata   = {
      name:      project,
      id:        params.ProcessId,
      token:     params.Token,
      callback:  params.CallbackUrl,
      config:    params.Configuration, 
      selection: params.Selection,
      files:     {},
      fileinfo:  {}
    };
    module.creator().then(function(success){
      module.callback(success).then(function(err){
        log.info(`  - POST Rokfor Result: ${err}`)
      });  
    }, 
    function(error) {
      log.info(`  *** ERROR: ${error}`)
      module.callback(false, error).then(function(err){
        log.info(`  - POST Rokfor Result: ${err}`)
      });  
    });
  }

  module.creator = function() {
    var deferred = q.defer();
    delete require.cache[require.resolve(`${templatedir}${module.gdata.name}/config.js`)];
    var plugin   = require(`${templatedir}${module.gdata.name}/config.js`);
    const texsettings = {
      inputs: path.resolve(path.join(__dirname + '/' + templatedir + module.gdata.name, 'extensions')),
      fonts: path.resolve(path.join(__dirname + '/' + templatedir + module.gdata.name, 'fonts')),
      passes: 3,
      cmd: 'xelatex',
      errorLogs: path.join(__dirname + '/' + templatedir + module.gdata.name, 'error.log')
    };

    Object.keys(plugin).forEach(function(output,index) {
      var outputconfig = plugin[output];
      var tex          = [];
      for (var i = 0, len = outputconfig.length; i < len; i++) {
        var page = outputconfig[i];
        var data = page.controller(module);
        log.info(`  - Nunjuck Path:  ${__dirname + '/' + templatedir + module.gdata.name}`)
        nj.configure(__dirname + '/' + templatedir + module.gdata.name, njsettings);
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
            module.gdata.fileinfo[output] = pdf.getInfoSync();
          }
          catch(err) {
            log.info(`  - Error getting PDF INFO`)
            return deferred.reject('PDFINFO Failed');
          }

          console.log(outputPath);

          var d = new Date();
          var uploadName = module.gdata.name + "_" + d.getTime() + ".pdf";
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
            log.info(`  - Upload PDF to:  ${config.download + "/" + uploadName}`)
            module.gdata.files[output] = config.download + "/" + uploadName;
            if (Object.keys(module.gdata.files).length == Object.keys(plugin).length) {
              log.info(`  - Distilled all Files`) 
              deferred.resolve(true);
            }
          });




        });
      });
    });

    return deferred.promise;
  }
 

  module.callback = function(success, errormessage) {
    var deferred = q.defer();
    var payload;
    var err = {Error: module.escapeJSON(errormessage || "")};
    if (module.gdata.files && success) {
      payload = {
          "Status": "Complete",
          "Url"   : module.gdata.files,
          "Pages" : module.gdata.fileinfo,
          "Token" : module.gdata.token
      }
    }
    else {
      payload = {
          "Status": "Error",
          "Pages" : err,
          "Token" : module.gdata.token
      }
    }

    log.info(`  - POST Rokfor:  ${module.gdata.callback}`)
    var req = unirest("POST", module.gdata.callback);
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
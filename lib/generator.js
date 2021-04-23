
module.exports = function(config, log, slack) {

  var module = {};

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
      fse         = require('fs-extra'),
      s3          = require('@monolambda/s3'),
      templatedir = '../templates/',
      workdir     = '../tmp',
      njsettings = {
        autoescape: false,
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

  var utils = require('./utils.js')(log, slack);

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


  module.asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }

  module.run = function(project, params) {
    log.info(`  - Incoming Project ${project}`)
    utils.gdata   = {
      name:      project,
      id:        params.ProcessId,
      callback:  params.CallbackUrl,
      config:    params.Configuration, 
      selection: params.Selection,
      files:     {},
      fileinfo:  {}
    };

    module.jwt_token = params.Token;

    // Set Up Api Configuration

    var apiconfig = false;
    config.api.forEach(function(_apiconfig) {
      if (utils.gdata.callback.indexOf(_apiconfig.endpoint) !== -1) {
        apiconfig = _apiconfig;
      }
    })
    if (!apiconfig) {
      log.info(`  - Configuration not found ${utils.gdata.callback}`)
      slack.notify(`ROKFOR GENERATOR: Configuration not found for api ${utils.gdata.callback}`)
      return false;
    }
    if (!utils.gdata.callback) {
      log.info(`  - Configuration incomplete`)
      slack.notify(`ROKFOR GENERATOR: Configuration incomplete`)
      return false;
    }
    utils.setApi(apiconfig);



    module.processing().then(
      success => {

        utils.getRf(`${utils.gdata.selection.Mode}/${utils.gdata.selection.Value}`, {status:'both'}).then(
          success => {
            module.projectname = "";
            if (utils.gdata.selection.Mode === 'chapters')
              module.projectname = success.Chapters[0].Name;
            if (utils.gdata.selection.Mode === 'issues')
              module.projectname = success.Issues[0].Name;
            if (utils.gdata.selection.Mode === 'contribution')
              module.projectname = success.Contribution.Name;
            log.info(`  - GET INITIAL SELECTION: ${module.projectname}`)
            module.creator().then(
              success => {
                module.callback(success).then(function(err){
                  log.info(`  - POST Rokfor Result: ${err}`)
                  slack.notify(`ROKFOR GENERATOR: Generated ${project}`)
                });  
              }, 
              error => {
                module.callback(false, error).then(function(err){
                  log.info(`  - POST Rokfor Result: ${err}`)
                  slack.notify(`ROKFOR GENERATOR: Error ${project}`)
                });  
              }
            )
          },
          error => {
            log.info(`  - GET INITIAL FAILED`)
          },          
        )
      },
      error => {
        log.info(`  - POST Token not valid: ${error}`)
        slack.notify(`ROKFOR GENERATOR: Token not valid for ${project}`)
      }
    );
  }

  module.creator = function() {
    var deferred = q.defer();
    delete require.cache[require.resolve(`${templatedir}${utils.gdata.name}/config.js`)];
    var plugin   = require(`${templatedir}${utils.gdata.name}/config.js`);


    var _pluginNames = Object.keys(plugin);
    var _pluginCount = 0;

    var _recursion = function() {
      module.subcreator(plugin, _pluginNames[_pluginCount], _pluginCount).then(
        success => {

          if (Object.keys(utils.gdata.files).length == Object.keys(plugin).length) {
            log.info(`  - Distilled all Files`) 
            deferred.resolve(true);
          }
          else {
            _pluginCount++;
            _recursion();
          }
          
        }, 
        error => {
          return deferred.reject(error);
        }
      );
    }

    _recursion();

    return deferred.promise;
  }

  module.subcreator = async function(plugin, output, index) {
    var deferred = q.defer();
    var texsettings = {
      inputs: path.resolve(path.join(__dirname + '/' + templatedir + utils.gdata.name, 'extensions')),
      fonts: path.resolve(path.join(__dirname + '/' + templatedir + utils.gdata.name, 'fonts')),
      passes: 3,
      makeindex: true,
      bibtex: false,
      bibtexDB: "",
      indexStyle: plugin[output].index || false,
      cmd: 'xelatex',
      errorLogs: path.join(__dirname + '/' + templatedir + utils.gdata.name, 'error.log'),
      args: [
        '-halt-on-error',
        '-shell-escape',
        '-enable-write18'
      ]
    };

    log.info(`  - Starting PDFCREATOR ${output}`);
    var outputconfig = plugin[output].pages;
    var tex          = [];
    var keepTexFile  = false;
    for (var i = 0, len = outputconfig.length; i < len; i++) {
      var page = outputconfig[i];
      var data = {};
      try {
        data = await page.controller(utils);
      }
      catch(err) {
        log.error(`  - Error in Callback Controller for Plugin ${output}`);
        log.error(err);
        return deferred.reject(err);
      }
      log.info(`  - Nunjuck Path:  ${__dirname + '/' + templatedir + utils.gdata.name}`)
      nj.configure(__dirname + '/' + templatedir + utils.gdata.name, njsettings);
      if (page.template !== false) {
        tex.push(nj.render(page.template, data));
      }
      if (data && data.Literature && typeof data.Literature === 'string' && data.Literature.length > 0) {
        texsettings.bibtex = true;
        texsettings.bibtexDB = data.Literature;
      }
      if (data && data.keepTexFile) {
        keepTexFile = data.keepTexFile;
      }
    }
    temp.mkdir('pdfcreator', function(err, dirPath) {
      var outputPath = path.join(dirPath, 'output.pdf')
      if (keepTexFile == true) {
        let _texPath = temp.mkdirSync('tex_files');
        let _texFile  = path.join(_texPath, 'out.tex');
        fs.writeFileSync(_texFile, tex.join("\n"));
      }
      const oStream  = fs.createWriteStream(outputPath);
      const lStream  = latex(tex.join("\n"), texsettings);
      lStream.on('error', function(err) {
        log.info(`  - Error Converting Tex to PDF ${err.substr(0,255)}`);
        return deferred.reject(err.substr(0,255));
      })
      lStream.on('finish', function() {
        log.info(`  - Finished Converting Tex to PDF`);
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
          utils.gdata.fileinfo[output].project = module.projectname;
        }
        catch(err) {
          log.info(`  - Error getting PDF INFO`)
          return deferred.reject('PDFINFO Failed');
        }

        var d = new Date();
        var r = Math.round(Math.random() * 1000);
        var uploadName = (module.projectname ? module.projectname.replace(/[^a-zA-Z0-9]/g, '_') : utils.gdata.name) + "_" + d.getTime() + "_" + r + ".pdf";
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
          fs.unlinkSync(outputPath);
          //fs.unlinkSync(texFile);
          log.info(`  - Uploaded PDF to:  ${config.download + "/" + uploadName}`)
          utils.gdata.files[output] = config.download + "/" + uploadName;
          fse.removeSync(dirPath)

          for (var i = 0, len = outputconfig.length; i < len; i++) {
            var page = outputconfig[i];
            if (page.callback) {
              try {
                page.callback(utils);
              }
              catch(err) {
                log.error(`  - Error in Callback Function for Plugin ${output}`);
                log.error(err);
              }
            }
          }

          deferred.resolve(true);
        });
      });

    });

    return deferred.promise;
  }


  module.processing = function() {
    log.info(`  - Validate Token`)
    return new Promise(
        function (resolve, reject) {
          var req = unirest("POST", utils.gdata.callback);
          req
            .headers({
              "Content-Type": "application/json"
            })
            .type("json")
            .send({"Status": "Processing", "Token" : module.jwt_token})
            .end(function (res) {
              if (res.body.Success === 'ok') {
                log.info(`  - Token valid`)
                resolve(res.body.Success);
              }
              else {
                log.info(`  - Token not valid`)          
                reject('token not valid');
              }
            });
        }
    );
  } 
 

  module.callback = function(success, errormessage) {
    var deferred = q.defer();
    var payload;
    errormessage = errormessage || "";
    var err = {Error: module.escapeJSON(errormessage)};
    if (utils.gdata.files && success) {
      payload = {
          "Status": "Complete",
          "Url"   : utils.gdata.files,
          "Pages" : utils.gdata.fileinfo,
          "Token" : module.jwt_token
      }
    }
    else {
      payload = {
          "Status": "Error",
          "Pages" : err,
          "Token" : module.jwt_token
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
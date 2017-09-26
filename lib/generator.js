
module.exports = function(config, log) {

  var module      = {},
      q           = require("q"),
      unirest     = require("unirest"),
      nj          = require('nunjucks'),
      temp        = require('temp'),
      fs          = require('fs'),
      path        = require('path'),
      exec        = require('child_process').exec,
      templatedir = '../templates/',
      workdir     = '../tmp';

  temp.track();

  var gdata   = {};

  var njsettings = {
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

  module.run = function(project, params) {
    log.info(`  - Incoming Project ${project}`)
    gdata   = {
      name:      project,
      id:        params.ProcessId,
      token:     params.Token,
      callback:  params.CallbackUrl,
      config:    params.Configuration, 
      selection: params.Selection,
      files:     {}
    };
    module.creator().then(function(err){
      module.store().then(function(err){
        log.info(`  - POST Rokfor Result: ${err}`)
      });  
    });
  }

  module.creator = function() {
    var deferred = q.defer();
    delete require.cache[require.resolve(`${templatedir}${gdata.name}/config.js`)];
    var plugin   = require(`${templatedir}${gdata.name}/config.js`);
    var tex      = [];
    for (var i = 0, len = plugin.pages.length; i < len; i++) {
      var page = plugin.pages[i];
      var data = page.controller(module);
      log.info(`  - Nunjuck Path:  ${__dirname + '/' + templatedir + gdata.name}`)
      nj.configure(__dirname + '/' + templatedir + gdata.name, njsettings);
      tex.push(nj.render(page.template, data));
    }


    temp.mkdir('pdfcreator', function(err, dirPath) {
      var inputPath = path.join(dirPath, 'input.tex')
      fs.writeFile(inputPath, tex.join("\n"), function(err) {
        if (err) throw err;
        process.chdir(dirPath);
        exec("pdflatex '" + inputPath + "'", function(err) {
          if (err) throw err;
          exec("open '" + path.join(dirPath, 'input.pdf') + "'");
          log.info(`  - Wrote PDF to:  ${path.join(dirPath, 'input.pdf')}`)
          gdata.files['FILE'] = 'file://' + path.join(dirPath, 'input.pdf');
          deferred.resolve(true)
        });
      });
    });
    return deferred.promise;
  }
 

  module.store = function() {
    var deferred = q.defer();
    if (gdata.files) {
      log.info(`  - POST Rokfor:  ${gdata.callback}`)
      var req = unirest("POST", gdata.callback);
      req
        .headers({
          "Content-Type": "application/json"
        })
        .type("json")
        .send({
          "Status": "Complete",
          "Url"   : gdata.files,
          "Pages" : 4000,
          "Token" : gdata.token
        })
        .end(function (res) {
          if (res.body.Error) {
            deferred.resolve(res.body.Error);
          }
          else {
            deferred.resolve(res.body.Success);
          }
        });
    }
    return deferred.promise;
  }

  return module;
}
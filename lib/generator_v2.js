module.exports = function(config, log, slack) {

  var module = {};

  /* Central Data Structure */

  const 
      q           = require("q"),
      unirest     = require("unirest"),
      nj          = require('nunjucks'),
      temp        = require('temp'),
      fs          = require('fs'),
      fsp         = require('node:fs/promises'),
      path        = require('path'),
      exec        = require('child_process').exec,
      latex       = require('node-latex'),
      typst       = require('@myriaddreamin/typst-ts-node-compiler'),
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
  
  const { execFileSync } = require('child_process');

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

  function clearRequireCacheInDir(dir) {
    if (!fs.existsSync(dir)) {
      log.info(`  - Cache dir not existing: ${dir}`);
      return;
    }

    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);

      if (fs.statSync(fullPath).isDirectory()) {
        // recursively clear subdirectories
        clearRequireCacheInDir(fullPath);
      } else if (fullPath.endsWith('.js')) {
        try {
          const resolved = require.resolve(fullPath);
          delete require.cache[resolved];
          log.info(`  - Cleared cache: ${fullPath}`);
        } catch (err) {
          log.info(`  - Could not clear: ${fullPath}`);
        }
      }
    }
  }

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

  module.run = async function(project, params, token) {
    log.info(`\x1b[32m[RUNNER]\x1b[0m Incoming Project ${project}`)
    utils.gdata   = {
      ...params,
      files:     {},
      fileinfo:  {},
      name: project
    };

    module.jwt_token = token;

    // Set Up Api Configuration
    const getHostname = (url) => {
      // use URL constructor and return hostname
      return new URL(url).hostname;
    }

    var apiconfig = false;
    config.api.forEach(function(_apiconfig) {
      if (getHostname(_apiconfig.endpoint) == getHostname(utils.gdata.callback)) {
        apiconfig = _apiconfig;
      }
    })
    if (!apiconfig) {
      log.info(`\x1b[31m[CONFIG]\x1b[0m  not found ${utils.gdata.callback}`)
      slack.notify(`ROKFOR GENERATOR: Configuration not found for api ${utils.gdata.callback}`)
      return false;
    }
    if (!utils.gdata.callback) {
      log.info(`\x1b[31m[CONFIG]\x1b[0m incomplete`)
      slack.notify(`ROKFOR GENERATOR: Configuration incomplete`)
      return false;
    }
    utils.setApi(apiconfig);

    if (module.local_only !== true) {
      try {
          await module.callback(false, 'check token', true)
      } catch (e) {
          log.info(`\x1b[32m[Post]\x1b[0m Token not valid: ${error}`)
          slack.notify(`ROKFOR GENERATOR: Token not valid for ${project}`)
          return
      }
    }

    utils.gdata.initialdata = {
      ids: [],
      mode: ""
    }

    if (params.payload.issue) {
        utils.gdata.initialdata.ids = [params.payload.issue]
        utils.gdata.initialdata.mode = 'issues'
    }
    if ((params.exporter?.issues ?? []).length > 0) {
        utils.gdata.initialdata.ids = [...ids,...params.exporter.issues.map(i => i.id)]
        utils.gdata.initialdata.mode = 'issues'
    }
    if (params.payload.chapter) {
        utils.gdata.initialdata.ids = [params.payload.chapter]
        utils.gdata.initialdata.mode = 'chapters'
    }
    if ((params.exporter?.chapters ?? []).length > 0) {
        utils.gdata.initialdata.ids = [...ids, ...params.exporter.chapters.map(i => i.id)]
        utils.gdata.initialdata.mode = 'chapters'
    }
    if (params.payload.data) {
        utils.gdata.initialdata.ids = [params.payload.data]
        utils.gdata.initialdata.mode = 'collection'
    }
    
    try {
        utils.gdata.initialdata.data = await utils.getRf_v2(utils.gdata.initialdata.mode, {where: {id: {$in: utils.gdata.initialdata.ids}}});
        module.projectname = (utils.gdata.initialdata.data.items ?? utils.gdata.initialdata.data)[0]?.name || undefined;
        if (module.projectname === undefined) {
          throw('Empty data received')
        }
    } catch (e) {
        log.info(`\x1b[31m[ERROR]\x1b[0m Inital Selection not loading: ${e}`)
        slack.notify(`ROKFOR GENERATOR: Inital Selection not loading: ${e}`)
        return
    }

    log.info(`\x1b[32m[GET]\x1b[0m  INITIAL SELECTION: ${module.projectname}`) 
    
    try {
        const success = await module.creator()
        const res = await module.callback(success)
        log.info(`\x1b[32m[SUCCESS]\x1b[0m  Rokfor Result: ${success}`)
        slack.notify(`ROKFOR GENERATOR: Generated ${project}`)
    }
    catch (error) {
        const res = await module.callback(false, error)
        log.info(`\x1b[31m[ERROR]\x1b[0m  Rokfor Error: ${res}`)
        slack.notify(`ROKFOR GENERATOR: Error ${project}`)
    }    
  }

  module.runLocal = async (project, params) => {
    log.info = log.error = console.log
    log.info(`🚀 Rokfor Generator CLI:`);
    log.info(`✅ Plugin: ${project}`);
    log.info(`🌍 URL: ${params.callback}`);
    log.info(`📕 Issue ID: ${params.payload.issue}`);
    log.info(`📄 Contribution ID: ${params.payload.data}`);
    module.local_only = true
    module.passes = params.passes || 4
    await module.run(project, params, "")
  }
  module.pdfutils = {
    trim(string) {
      return string.replace(/^\s*|\s*$/g, '');
    },

    slugify(text) {
      text = text.replace(/[^-a-zA-Z0-9,&\s]+/ig, '');
      text = text.replace(/-/g, '_');
      text = text.replace(/\s/g, '_');
      return text;
    },

    parse(data) {
      const ret = {};
      const lines = data.split(/\r\n|\r|\n/g);

      for (let i = 0; i < lines.length - 2; i++) {
        const line = lines[i];
        const tup = line.split(': ');
        if (tup.length === 2) {
          ret[
            module.pdfutils.slugify(tup[0]).toLowerCase()
          ] = module.pdfutils.trim(tup[1]);
        }
      }
      return ret;
    }
  };


  module.creator = async function() {
    log.info(utils.engineSettings)
    clearRequireCacheInDir(`${templatedir}${utils.gdata.name}`);
    var plugin  = require(`${templatedir}${utils.gdata.name}/config.js`);
    var _pluginNames = Object.keys(plugin);
    var _pluginCount = 0;
    var _recursion = async function() {
        try {
            await module.subcreator(plugin[_pluginNames[_pluginCount]], _pluginNames[_pluginCount], _pluginCount)
            if (Object.keys(utils.gdata.files).length == Object.keys(plugin).length) {
                log.info(`\x1b[31m[PDF]\x1b[0m  Distilled all Files`) 
                return true
            }
            else {
                _pluginCount++;
                return await _recursion();
            }
        } catch (error) {
          return false
        }
    }
    return await _recursion();
  }

  module.postProcess = function(outputPath, output, deferred, dirPath, outputconfig) {
    log.info(`\x1b[31m[POST]\x1b[0m  ${output}`)
    if (module.local_only === true) {
      fs.mkdirSync(path.join(utils.engineSettings.workspace, '.output'), { recursive: true });
      const target = path.join(utils.engineSettings.workspace, '.output', 'output.pdf')
      log.info(`💿 save ${target}`)
      fs.copyFileSync(outputPath, target);
      return deferred.reject('PDFINFO Local Exit');
    }

    try {
      let data = module.pdfutils.parse(execFileSync('pdfinfo', [outputPath]).toString('utf8'));
      utils.gdata.fileinfo[output] = data;
      utils.gdata.fileinfo[output].project = module.projectname;
    }
    catch(err) {
      log.info(`\x1b[31m[PDF]\x1b[0m  Error getting info ${err}`)
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
      log.info(`\x1b[31m[S3]\x1b[0m ${output} uploaded:  ${config.download + "/" + uploadName}`)
      utils.gdata.files[output] = config.download + "/" + uploadName;
      fse.removeSync(dirPath)
      //fse.removeSync(utils.downloadPath)
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
  }

  module.subcreator = async function(configuration, pagename) {

    utils.engineSettings = {
      workspace: __dirname + '/' + templatedir + utils.gdata.name
    }

    utils.downloadPath = path.join(__dirname + '/' + templatedir + utils.gdata.name, '.downloads')

    utils.texsettings = {
      inputs: path.resolve(path.join(utils.engineSettings.workspace, 'extensions')),
      fonts: path.resolve(path.join(utils.engineSettings.workspace, 'fonts')),
      passes: module.local_only === true ? module.passes : 4,
      makeindex: true,
      bibtex: false,
      bibtexCMD: config.latex.bibtexCMD || 'biber',
      bibtexDB: "",
      indexStyle: configuration.index || false,
      cmd: config.latex.cmd || 'lualatex',
      errorLogs: path.join(utils.engineSettings.workspace, 'error.log'),
      args: [
        '-halt-on-error',
        '-shell-escape',
        '-enable-write18'
      ],
      extension: "tex"
    };
    
    utils.typstsettings = {
      bibtex: false,
      bibtexDB: "",
      extension: "typ",
      fontArgs: [
        { fontPaths: [ path.join(utils.engineSettings.workspace, '/fonts') ] }
      ]
    };

    var deferred = q.defer();
    var engine = utils.getEngine()
    utils.engineSettings = engine == 'latex'
      ? {...utils.engineSettings, ...utils.texsettings}
      : {...utils.engineSettings, ...utils.typstsettings}
    
    log.info(`\x1b[32m[PDF]\x1b[0m Starting ${pagename}`);
    var sourceFile          = [];
    var keepSourceFile  = false;
    for (var i = 0, len = configuration.pages.length; i < len; i++) {
      var page = configuration.pages[i];
      var data = {};
      try {
        data = await page.controller(utils);
      }
      catch(err) {
        log.error(`  \x1b[32m[PDF]\x1b[0m Error in Callback Controller ${pagename}`);
        log.error(err);
        return deferred.reject(err);
      }
      nj.configure(__dirname + '/' + templatedir + utils.gdata.name, njsettings);
      if (page.template !== false) {
        try {
          sourceFile.push(nj.render(page.template, data));
          log.info(`\x1b[32m[PDF]\x1b[0m Nunjuck Path:  ${page.template}`)
        } catch (e) {
          log.info(`  \x1b[32m[PDF]\x1b[0m Nunjuck Render Error:  ${e}`)
          return deferred.reject(e);
        }
      }
      if (data && data.Literature && typeof data.Literature === 'string' && data.Literature.length > 0) {
        utils.engineSettings.bibtex = true;
        utils.engineSettings.bibtexDB = data.Literature;
      }
      if (data && (data.keepTexFile || data.keepTypstFile || configuration.keepSourceFile)) {
        keepSourceFile = true;
      }
    }
    const sourcFileComplete = sourceFile.join("\n")
    const dirPath = temp.mkdirSync('pdfcreator')
    var outputPath = path.join(dirPath, 'output.pdf')

    if (module.local_only)
      fs.mkdirSync(path.join(utils.engineSettings.workspace, '.output'), { recursive: true });



    if (keepSourceFile == true) {
      let _sourceFile = path.join(`${utils.engineSettings.workspace}`, '.output')
      log.info(`\x1b[31m[${engine}]\x1b[0m  Stored in ${_sourceFile}/output.${utils.engineSettings.extension}`);
      fs.mkdirSync(_sourceFile, { recursive: true });
      await fsp.writeFile(`${_sourceFile}/output.${utils.engineSettings.extension}`, sourcFileComplete);
    }


    // Latex Specific
    if (engine === 'latex') {
      const oStream  = fs.createWriteStream(outputPath);
      const lStream  = latex(sourcFileComplete, utils.engineSettings);
      lStream.on('error', function(err) {
        let _msg = `[LATEX ERROR] ${err}`;
        log.info(`- ${_msg.substr(0, 255)}`);
        return deferred.reject(_msg.substr(0, 255).replace("\n", " "));
      })
      lStream.on('finish', function() {
        log.info(`- Finished Converting Tex to PDF`);
      })
      lStream.pipe(oStream);
      
      oStream.on('error', function(err) {
        log.info(`- Error Creating PDF ${err}`)
        return deferred.reject(err);
      })
      
      oStream.on('finish', function () {
        module.postProcess(outputPath, pagename, deferred, dirPath, configuration.pages)
      });
    }
    else if (engine === 'typst') {
      try {
        const $typst = typst.NodeCompiler.create({
          workspace: utils.engineSettings.workspace,
          fontArgs: utils.engineSettings.fontArgs
        })
        log.info(`[${engine}] Set up paths`)
        log.info(`[${engine}] Workspace: ${utils.engineSettings.workspace}`)
        log.info(`[${engine}] Fonts: ${utils.engineSettings.fontArgs[0].fontPaths}`)
        const buffer = await $typst.pdf({
          mainFileContent: sourcFileComplete,
        });
        await fsp.writeFile(outputPath, buffer);
        if (configuration.postprocess) {
          try {
            await configuration.postprocess(outputPath, utils);
          }
          catch(err) {
            log.error(`  - Error in Postprocess Function`);
            log.error(err);
          }
        }
        module.postProcess(outputPath, pagename, deferred, dirPath, configuration.pages)
      } catch (e) {
        log.info(`[${engine}] Error`, e)
        return deferred.reject(e);
      }

    }
    else {
      log.info(`  - Error Engine unknown`)
      return deferred.reject(err);
    }

    return deferred.promise;
  }

  module.callback = function(success, errormessage, isProcess) {
    if (module.local_only === true) {
      return 'Local Run only, no callback'
    }
    log.info(`  - POST Rokfor:  ${utils.gdata.callback}`)
    var deferred = q.defer();
    var payload;
    payload = success === true
        ? {
            "configvalue": 2,
            "file"   : utils.gdata.files ?? {},
            "fileinfo" : utils.gdata.fileinfo ?? {}
        }
        : {
          "configvalue": isProcess ? 1 : 0,
          "file": {},
          "fileinfo" : {[isProcess ? 'Process' : 'Error']: module.escapeJSON(errormessage || "")}
        }

    var req = unirest("POST", utils.gdata.callback);
    req
      .headers({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${module.jwt_token}`
      })
      .type("json")
      .send(payload)
      .end(function (res) {
        if (res.body.status === 'ok') {
          deferred.resolve(true);
        } 
        else {
          deferred.resolve(false);
        }
      });
    return deferred.promise;
  }

  return module;
}

module.exports = function(log, slack) {

  /* Central Data Structure */

  const 
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer');

  
  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: new TexRenderer(),
    failOnUnsupported: false,
    // requires \usepackage{ulem}
    delRenderer: TexRenderer.delImpl,
    // requires \usepackage{hyperref}
    linkRenderer: TexRenderer.linkImpl,
    // requires \usepackage{graphicx}
    imageRenderer: TexRenderer.imageImpl
  });


  var api = {};

  /* Connector is passed to controller callbacks in templates */

  module.gdata =  {};

  module.setApi = function(_api) {
    api = _api;
  }

  module.md2Tex =  function(string, levelStyles) {
    marked.setOptions({
      levelStyles: (typeof levelStyles === "array" || typeof levelStyles === "object") ? levelStyles : false
    });
    // Remove \\n
    string = string.replace(/[^\\]\\\n/g,"\n");
    // Remove multiple Backslashes
    string = string.replace(/[\\]{2,}/g,"\\");
    return marked(string);
  }

  module.texEscape = function(text) {
    // some characters have special meaning in TeX
    //     \ & % $ # _ { } ~ ^
    return text
      .replace(/\\/g, '\\textbackslashtemporary')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\\textbackslashtemporary/g, '\\textbackslash{}')
      .replace(/\]/g, '{]}')
      .replace(/\[/g, '{[}')
      .replace(/\&/g, '\\&')
      .replace(/%/g,  '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g,  '\\#')
      .replace(/\_/g, '\\_')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  module.img2Tex =  function(img) {
    var count = 0;
    var images = [];
    img.forEach(function(i){
      var d = new Date();
      var r = Math.round(Math.random() * 1000);
      var localfile = d.getTime() + "_" + r;
      images.push({
        remote: i.Files.Original.substr(0,2)=="//" ? "http:" + i.Files.Original :  i.Files.Original,
        local: localfile + path.extname(i.Files.Original),
        captions: i.Captions
      })
      count++;
    })
    return images;
  }

  module.getRf = function(url, params) {
    params = params || {};
    var req = unirest("GET", `${api.endpoint}${url}`);
    log.info(`  - GET ${api.endpoint}${url}`)
    return new Promise((resolve, reject) => {
      req
        .headers({
          "content-type": "application/json",
          "authorization": `Bearer ${api.rokey}`
        })
        .query(params)
        .end(function (res) {
          if (res.error) {
            log.error(`Connector Call Failed: ${res.error}`);
            slack.notify(`ROKFOR GENERATOR: Generated ${res.body}`)
            reject(res.body)
          }
          else {
            resolve(res.body);
          }
        });
    });
  }

  return module;
}
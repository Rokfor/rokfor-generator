module.exports = function(config, log) {

  /* Central Data Structure */

  const 
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer');


  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: new TexRenderer()
  });

  /* Connector is passed to controller callbacks in templates */

  module.gdata =  {};

  module.md2Tex =  function(string) {
    return marked(string);
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
    var req = unirest("GET", `${config.api.endpoint}${url}`);
    log.info(`  - GET ${config.api.endpoint}${url}`)
    return new Promise((resolve, reject) => {
      req
        .headers({
          "content-type": "application/json",
          "authorization": `Bearer ${config.api.rokey}`
        })
        .query(params)
        .end(function (res) {
          if (res.error) {
            log.error(`Connector Call Failed: ${res.error}`);
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
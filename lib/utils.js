module.exports = function(log, slack) {

  /* Central Data Structure */

  const 
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer');


  var linkImpl = function (href, title, text) {
    // Requires url package 
    if (text == null || text == href) {
      if (href !== null)  href  = module.texEscape(href.replace(/\\/g, ""));      
      return ' \\url{' + href + '} ';
    }
    // Requires href package 
    if (href !== null)  href  = module.texEscape(href.replace(/\\/g, ""));
    if (title !== null) title = module.texEscape(title);//.replace(/\\/g, "");
    if (text !== null)  text  = module.texEscape(text.replace(/\\/g, ""));//.replace(/\\/g, "");
    return ' \\href{' + href + '}{' + text + '} ';
  };

  var imageImpl = function (href, title, text) {
    let d = new Date();
    let r = Math.round(Math.random() * 1000);
    let NEWLINE = '\r\n';
    let localfile = d.getTime() + "_" + r + ".jpg";
    return [
      NEWLINE,
      '\\placeimage{' + href + '}{' + localfile + '}{' + text + '}',
    ].join(NEWLINE) + NEWLINE;
  };
 
  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: new TexRenderer(),
    failOnUnsupported: false,
    // requires \usepackage{ulem}
    delRenderer: TexRenderer.delImpl,
    // requires \usepackage{hyperref}
    linkRenderer: linkImpl,
    // requires \usepackage{graphicx}
    imageRenderer: imageImpl
  });


  var api = {};

  /* Connector is passed to controller callbacks in templates */

  module.gdata =  {};

  module.setApi = function(_api) {
    api = _api;
  }

  module.md2Tex =  function(string, levelStyles) {


    var preformats = [];

    var postformatting = function(text) {
      text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
        return preformats[x * 1];
      });
      return text;
    }

    
    var preformatting = function(text) {
      text = text.replace(/\\\n/g, '\n');
      text = text.replace(/\\\[fn:(.*?)\\\]/g, function myFunction(_, x){
        console.log(`hier-${x}-there`)
        let _index = preformats.push(`\\footnote{${marked(x.trim())}}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\\\[footnote:(.*?)\\\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\footnote{${marked(x.trim())}}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\[in:(.*?)\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\index{${u.texEscape(x.trim())}}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\\\[index:(.*?)\\\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\index{${u.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\\\[mark:(.*?)\\\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\label{${u.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\\\[reference:(.*?)\\\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\pageref{${u.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      text = text.replace(/\\\[description:(.*?)\\\]/g, function myFunction(_, x){
        let _index = preformats.push('\\begin{description}' + 
        x.replace(/\\\{(.*?)\\\}/g, function myFunction(_, x){return '\\item[{' + marked(x.trim()) + '}]';}) + 
        '\\end{description}');
        return `---preformatter---${(_index-1)}-`;              
      });/*
      text = text.replace(/\[jpg:(.*?)\]/g, function myFunction(_, x){
        let d = new Date();
        let r = Math.round(Math.random() * 1000);
            let _x = x.match(/\{(.*?)\}/g);
            let localfile = d.getTime() + "_" + r + ".jpg";
            let _index = preformats.push(`\\placeimage${_x[1]}{${localfile}}${_x[0]}`)
        return `---preformatter---${(_index-1)}-`;
      });*/
      return text;
    }


    marked.setOptions({
      levelStyles: (typeof levelStyles === "array" || typeof levelStyles === "object") ? levelStyles : false
    });
    // New Lines are a little bit inconsistent in the markdown worlds
    // We just strip of a backslash before a new line, it's mostly from an editor
    // and super rarely deliberately made
    //_tex = _tex.replace(/\\textbackslash \\\\/g, '\\\\');
    return postformatting(marked(preformatting(string)));
  }

  module.texEscape = function(text) {
    // some characters have special meaning in TeX
    //     \ & % $ # _ { } ~ ^
    return text
      .replace(/\\\\/g, '\n')
      .replace(/\\/g,   '\\textbackslash ')
      .replace(/\n\n/g, '\\par ')
      .replace(/\n/g,   '\\\\ ')
      .replace(/\{/g,   '\\{')
      .replace(/\}/g,   '\\}')
      .replace(/\]/g,   '{]}')
      .replace(/\[/g,   '{[}')
      .replace(/\&/g,   '\\&')
      .replace(/%/g,    '\\%')
      .replace(/\$/g,   '\\$')
      .replace(/#/g,    '\\#')
      .replace(/\_/g,   '\\_')
      .replace(/~/g,    '\\textasciitilde{}')
      .replace(/\^/g,   '\\textasciicircum{}')
      .replace(/„/g,    '\\quotedblbase{}')
      .replace(/“/g,    '\\textquotedblleft{}')
      .replace(/”/g,    '\\textquotedblright{}')
      .replace(/“/g,    '``')
      .replace(/”/g,    '\'\'')
      .replace(/’/g, '\\textquoteright{}')
      .replace(/´/g, '\\textasciiacute{}')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/"/g,     '\\textquotedbl{}')
      .replace(/—/g,     '\\textemdash{}')
      .replace(/–/g,     '\\textendash{}')
      .replace(/→/g,  '\\textrightarrow{}')
      .replace(/↑/g,  '\\textuparrow{}')
      .replace(/↓/g,  '\\textdownarrow{}')
      .replace(/←/g,  '\\textleftarrow{}');
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
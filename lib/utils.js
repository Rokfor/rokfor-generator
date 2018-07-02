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
    
    // This is very quirky. Better check the mime type on the remote file.
    // Before Piping it thru convert.

    let d = new Date();
    let r = Math.round(Math.random() * 1000);
    let NEWLINE = '\r\n';
    let localfile = d.getTime() + "_" + r;
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
      text = text.replace(/----force-new-line---/g, '\\- \\\\ ');
      return text;
    }

    
    var preformatting = function(text) {

      // New Lines are a little bit inconsistent in the markdown worlds
      // We just strip of a backslash before a new line, it's mostly from an editor
      // and super rarely deliberately made

      text = text.replace(/\\\n/g, '----force-new-line---');

      // PDF: [pdf:url|page|fg]

      text = text.replace(/\\?\[pdf:(.*?)\\?\]/g, function myFunction(_, x){

        let _sa  = x.toString().split("|");
        let href = _sa[0];
        let page = _sa[1] || 1;
        let bg   = _sa[2] || 1;


        let r = Math.round(Math.random() * 1000);
        let d = new Date();
        let localfile = d.getTime() + "_" + r + ".pdf";

        let _index = preformats.push(`\\placepdf{${href}}{${localfile}}{${page}}{${bg}}`)
        return `---preformatter---${(_index-1)}-`;              
      });

      // Footnotes: [fn:] or [footnote:]

      text = text.replace(/\\?\[(fn|footnote):(.*?)\\?\]/g, function myFunction(_, func, x){
        let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
        return `---preformatter---${(_index-1)}-`;              
      });

      // Index: [in:] or [index:]

      text = text.replace(/\\?\[(in|index):(.*?)\\?\]/g, function myFunction(_, func, x){
        let _index = preformats.push(`\\index{${module.texEscape(x.trim())}}`)
        return `---preformatter---${(_index-1)}-`;              
      });

      // Mark: [mark:]

      text = text.replace(/\\?\[mark:(.*?)\\?\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\label{${module.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });

      // Language: [language:]

      text = text.replace(/\\?\[language:(.*?)\\?\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\selectlanguage{${x.trim()}}`);
        return `---preformatter---${(_index-1)}-`;              
      });      

      // Page Reference (pointing to Mark): [reference:]

      text = text.replace(/\\?\[reference:(.*?)\\?\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\pageref{${module.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });

      // Description List: 
      // [description:
      //  {Item 1} Text
      //  {Item 2} Text
      // ]

      text = text.replace(/\\\[description:([\S\s]*?)\\\]/gm, function myFunction(_, x){
        let _index = preformats.push('\\begin{description}' + 
        x.replace(/\{(.*?)\}/g, function myFunction(_, x){return '\\item[{' + marked(x.trim()).replace(/\\par /, '') + '}]';}) + 
        '\\end{description}');
        return `---preformatter---${(_index-1)}-`;              
      });

      return text;
    }


    marked.setOptions({
      levelStyles: (typeof levelStyles === "array" || typeof levelStyles === "object") ? levelStyles : false
    });

    return postformatting(marked(preformatting(string)));
  }

  module.texEscape = function(text) {
    return TexRenderer.texEscape(text);
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
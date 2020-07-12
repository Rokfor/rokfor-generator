module.exports = function(log, slack) {

  /* Central Data Structure */

  const 
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer'),
      webcapture  = require('capture-website'),
      puppeteer   = require('puppeteer'),
      nj          = require('nunjucks');

  // Export some Libraries 

  module.webcapture = webcapture;
  module.puppeteer  = puppeteer;
  module.nj         = nj;
  module.log        = log;

 // ------------------------------------------------------------------
 // Configure Markdown Renderer
 // Renderer: Latex-Markdown
 // linkImpl: Function to render links
 // imageImpl: Function to render images
 // ------------------------------------------------------------------

  var linkImpl = function (href, title, text) {
    if (text == null || text == href) {
      if (href !== null)  href  = module.texEscape(href.replace(/\\/g, ""));      
      return ' \\url{' + href + '} ';
    }
    if (href !== null)  href  = module.texEscape(href.replace(/\\/g, ""));
    if (title !== null) title = module.texEscape(title);//.replace(/\\/g, "");
    if (text !== null)  text  = module.texEscape(text.replace(/\\/g, ""));//.replace(/\\/g, "");
    return ' \\href{' + href + '}{' + text + '} ';
  };


  // ------------------------------------------------------------------
  // Image Implementation leaves most work to latex. It just substitutes
  // an image tag with a function \placeimage{imagurl}{localfilename}{caption}
  //
  // Sample Implementation in LaTex:
  //
  // \newcommand*{\grabto}[2]{      % macro grabto(remote, local): downloads and converts a file
  //    \IfFileExists{#2}{}{
  //        \immediate\write18{wget -O #2 "\detokenize{#1}"; convert -flatten -colorspace gray -density 300 #2 #2.jpg}
  //    }
  // }
  // \newcommand*{\placeimage}[3]{  % macro placeimage(remote, local, captions): places an image 
  // \grabto{#1}{#2}%
  // \begin{figure}%
  // 	 \noindent%
  //   \begin{minipage}[c][1\textheight]{1\textwidth}%
  // 	   \centering%
  // 	   \includegraphics[width=1\textwidth,height=0.8\textheight,keepaspectratio]{#2.jpg}%
  // 	   \setcapmargin[0mm]{0mm}%
  // 	   \caption*{\centering\smallfont #3}%
  // 	 \end{minipage}%
  // \end{figure}%
  // }
  // ------------------------------------------------------------------

  var imageImpl = function (href, title, text) {
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
    delRenderer: TexRenderer.delImpl,
    verbatimRenderer: TexRenderer.verbatimImpl,
    linkRenderer: linkImpl,
    imageRenderer: imageImpl
  });


  var api = {};

  /* Connector is passed to controller callbacks in templates */

  module.gdata =  {};

  module.setApi = function(_api) {
    api = _api;
  }

  module.md2Tex =  function(string, levelStyles, renderImpl) {

    /* 
     * Dynamically Change Render Implementations from Template, if renderImpl is set 
     */ 
    renderImpl = renderImpl || {};

    var preformats = [];

    var postformatting = function(text) {
      text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
        return preformats[x * 1];
      });
      text = text.replace(/----force-new-line---/g, '\\- \\\\ ');
      text = text.replace(/----soft-hyphen---/g, '\\-');
      text = text.replace(/----force-space---/g, '\\hspace*{0.5ex} ');
      return text;
    }

    
    var preformatting = function(text) {

      // Soft Hyphen
      text = text.replace(/\u00AD/g, '----soft-hyphen---');

      // force space
      text = text.replace(/\\~/g, '----force-space---');

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
      
      // Latex: [latex:]

      text = text.replace(/\\?\[latex:(.*?)\\?\]/g, function myFunction(_, x){
        let _index = preformats.push(x.replace(/\\\\/g, '\\'));
        return `---preformatter---${(_index-1)}-`;              
      }); 

      // No Indent: [indent:hang|nohang]

      text = text.replace(/\\?\[indent:(.*?)\\?\]/g, function myFunction(_, x){
        let _type = x.trim();
        let _index;
        if (_type == 'hang') {
          _index = preformats.push(`\\noindent\\setlength{\\hangindent}{\\parindent} `);
        }
        else {
          _index = preformats.push(`\\noindent `);
        }
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

      text = text.replace(/\\\[description:([\S\s]*?)\\\]\s*/gm, function myFunction(_, x){
        // Convert everything from Markdown to TEX
        let t_string = marked(x);
        // Create \item[{}], respecting the now double quoted curly brackets
        let _index = preformats.push(
          '\\begin{description}' + 
          t_string.replace(/\\\{(.*?)\\\}/g, function myFunction(_, x){
            return '\\item[{' + x.trim().replace(/\\par /, '') + '}]';
          }) +
          '\\end{description}\\par\\noindent '
        );

        return `---preformatter---${(_index-1)}-`;              
      });

      return text;
    }


    marked.setOptions({
      levelStyles: (typeof levelStyles === "array" || typeof levelStyles === "object") ? levelStyles : false
    });
    if (renderImpl.delImpl) {
      marked.setOptions({
        delRenderer: renderImpl.delImpl
      });
    }
    if (renderImpl.verbatimImpl) {
      marked.setOptions({
        verbatimRenderer: renderImpl.verbatimImpl
      });
    }
    if (renderImpl.linkImpl) {
      marked.setOptions({
        linkRenderer: renderImpl.linkImpl
      });
    }
    if (renderImpl.imageImpl) {
      marked.setOptions({
        imageRenderer: renderImpl.imageImpl
      });
    }


    return postformatting(marked(preformatting(string)));
  }

  module.htmlUnescape = function(html) {
    return TexRenderer.htmlUnescape(html);
  }

  module.texEscape = function(text) {
    var preformats = [];
    var postformatting = function(text) {
      text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
        return preformats[x * 1];
      });
      text = text.replace(/----force-new-line---/g, '\\- \\\\ ');
      text = text.replace(/----soft-hyphen---/g, '\\-');
      text = text.replace(/----force-space---/g, '\\hspace*{0.5ex} ');
      return text;
    }
    var preformatting = function(text) {
      text = text.replace(/\u00AD/g, '----soft-hyphen---');
      text = text.replace(/\\\n/g, '----force-new-line---'); 
      text = text.replace(/\\~/g, '----force-space---');
     
      // Latex: [latex:]
      text = text.replace(/\\?\[latex:(.*?)\\?\]/g, function myFunction(_, x){
        let _index = preformats.push(x);
        return `---preformatter---${(_index-1)}-`;              
      }); 
      return text;
    }
    return postformatting(TexRenderer.texEscape(preformatting(text)));
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
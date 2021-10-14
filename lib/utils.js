module.exports = function(log, slack) {

  /* Central Data Structure */

  const 
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer'),
      webcapture  = require('capture-website'),
      puppeteer   = require('puppeteer'),
      temp        = require('temp'),
      fs          = require('fs'),
      proc        = require('child_process'),
      nj          = require('nunjucks');

  // Export some Libraries 

  module.webcapture = webcapture;
  module.puppeteer  = puppeteer;
  module.nj         = nj;
  module.log        = log;
  module.downloadPath = temp.mkdirSync('download_files');
  
  var download = async function(url, dest) {
    if (fs.existsSync(dest) === false) {
      proc.execFileSync('curl', ['--silent', '-L', url, '-o', dest], {encoding: 'utf8', maxBuffer: Infinity});
    }
  }

  var guid = () => {
    let s4 = () => {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

 // ------------------------------------------------------------------
 // Configure Markdown Renderer
 // Renderer: Latex-Markdown
 // linkImpl: Function to render links
 // imageImpl: Function to render images
 // ------------------------------------------------------------------

  var linkImpl = function (href, title, text) {
    module.log.error(`Link Implementation: ${href}, ${title}, ${text}`);
    if ((typeof href === "string" && href) && (!text || text == href)) {
      href  = module.texEscape(href.replace(/\\/g, ""));      
      return ' \\url{' + href + '} ';
    }
    if (typeof href === "string" && href)  href  = module.texEscape(href.replace(/\\/g, ""));
    if (typeof title === "string" && title) title = module.texEscape(title);//.replace(/\\/g, "");
    if (typeof text === "string" && text)  text  = module.texEscape(text.replace(/\\/g, ""));//.replace(/\\/g, "");
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
    let NEWLINE = '\r\n';
    let suffix = href.split('.').pop();
    let escapedFile = href.replace(/[\W_]+/g,"");
    let localfile = `${escapedFile}.${suffix}`;
    return [
      NEWLINE,
      '\\placeimage{' + href + '}{' + localfile + '}{' + text + '}{' + title + '}',
    ].join(NEWLINE) + NEWLINE;
  };

  var verbatimImpl = function (code, lang, escaped) {
    let NEWLINE = '\r\n';
    return [
      '\\begin{verbatim}',
      TexRenderer.htmlUnescape(code),
      '\\end{verbatim}'
    ].join(NEWLINE) + NEWLINE;
  };
 
  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: new TexRenderer(),
    failOnUnsupported: false,
    delRenderer: TexRenderer.delImpl,
    verbatimRenderer: verbatimImpl,
    linkRenderer: linkImpl,
    imageRenderer: imageImpl
  });


  var api = {};

  /* Connector is passed to controller callbacks in templates */

  module.gdata =  {};

  module.setApi = function(_api) {
    api = _api;
  }

  module.resolveAttachements = async function(contributionId, index, forceAltImage) {
    var d = await module.getRf(`contribution/${contributionId}`, {status:'published', flat: 'true'})
    if (d.Attachements && d.Attachements[index] && d.Attachements[index].Original) {
      let source = d.Attachements[index]
      let altattachements = d.AttachementsAlternate
      if (forceAltImage === true) {
        let _key = source.Captions[2]
        if (altattachements && altattachements.length) {
          altattachements.forEach(_aa => {
            if (_aa.Captions === _key) {
              source = _aa;
            }
          })
        }
      }
      let suffix = source.Original.split('.').pop();
      source.localfile = path.join(module.downloadPath, `${guid()}.${suffix}`);
      download(source.Original, source.localfile)      
      return source;
    }
    return false;
  }

  module.md2Tex =  function(string, options = {}) {

    let levelStyles = (typeof options.levelStyles === "array" || typeof options.levelStyles === "object") ? options.levelStyles : false
    let renderImpl = options.renderImpl || {}
    let attachements = options.attachements || false
    let altattachements = options.altattachements || false 
    let issue = options.issue || {}
    let settings = options.settings ||{} 
    let docName = options.docName || ""
    let docId = options.docId || ""


    var preformats = [];

    var postformatting = function(text) {
      text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
        return preformats[x * 1];
      });
      text = text.replace(/ ----force-new-line--- /g, '\\- \\protect\\\\ ');
      text = text.replace(/----force-new-line---/g, '\\- \\protect\\\\ '); // If any of these exist...
      text = text.replace(/----soft-hyphen---/g, '\\-');
      text = text.replace(/----force-space---/g, '\\hspace*{0.5em}');
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
  
      text = text.replace(/\\\\\\\\\n/g, ' ----force-new-line--- ');  // Conditional Line break, end of line
      text = text.replace(/\\\n/g, ' ----force-new-line--- ');        // Normal shift-enter (end of line)
      text = text.replace(/\\\\\\\\/g, ' ----force-new-line--- ');    // Conditional Line break within Line

  
      // v.2 Elements / component style
  
      // Language
      text = text.replace(/::: language\{language="(.*?)"\}::[\S\s]*?:::/gm, function myFunction(_, x){
        let _index = preformats.push(`\\selectlanguage{${x.trim()}}`);
        return `---preformatter---${(_index-1)}-`;              
      });       
      // Regular Footnote
      /*text = text.replace(/\n\n::: footnote ::([\S\s]*?):::\n\n/gm, function myFunction(_, x){
        let t_string = postformatting(marked.parseInline(preformatting(x.trim())));
        let _index = preformats.push(`\\footnote{${t_string}} `)
        //let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      // Footnote after Footnote (without \n\n)
      text = text.replace(/::: footnote ::([\S\s]*?):::\n\n/gm, function myFunction(_, x){
        let t_string = postformatting(marked.parseInline(preformatting(x.trim())));
        let _index = preformats.push(`\\footnote{${t_string}} `)
        //let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
        return `---preformatter---${(_index-1)}-`;              
      });*/
      // End Footnotes (without \n\n)
      text = text.replace(/\n\n::: footnote ::([\S\s]*?):::/gm, function myFunction(_, x){
        let t_string = postformatting(marked.parseInline(preformatting(x.trim())));
        let _index = preformats.push(`\\footnote{${t_string}} `)
        //let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
        return `---preformatter---${(_index-1)}-`;              
      });      
      // Latex
      text = text.replace(/::: latex ::([\S\s]*?):::/gm, function myFunction(_, x){
        let _index = preformats.push(x.replace(/\\\\/g, '\\'));
        return `---preformatter---${(_index-1)}-`;             
      });
      // Comment
      text = text.replace(/::: comment ::([\S\s]*?):::/gm, function myFunction(_, x){
        let _index = preformats.push('');
        return `---preformatter---${(_index-1)}-`;             
      }); 
      // Alternate Paragraph
      text = text.replace(/::: paragraphalternate ::([\S\s]*?):::/gm, function myFunction(_, x){
        let t_string = postformatting(marked(preformatting(x)));
        let _index = preformats.push(
          '\\begin{paragraphalternate}\n' + 
          t_string +
          '\n\\end{paragraphalternate} '
        );
        return `---preformatter---${(_index-1)}-`;             
      });            
  
      // Marks (v2)
  
      // Bibliography
      text = text.replace(/:bibliography\[(.*?)?\]\{post="(.*?)" pre="(.*?)" reference="(.*?)"\}/g, function myFunction(_, func, post, pre, reference){
        let _index = preformats.push(`\\cite[${pre}][${post}]{${reference}}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      // Index: [in:] or [index:]
      text = text.replace(/:index\[(.*?)?\]/g, function myFunction(_, x){
        let _index = preformats.push(`\\index{${marked.parseInline(x.trim())}}${marked.parseInline(x.trim())}`)
        return `---preformatter---${(_index-1)}-`;              
      });
      // Mark: [mark:]
      text = text.replace(/:mark\[(.*?)?\]\{reference="(.*?)"\}/g, function myFunction(_, __, x){
        let _index = preformats.push(`\\label{${module.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      // Page Reference (pointing to Mark): [reference:]
      text = text.replace(/:reference\[(.*?)?\]\{reference="(.*?)"\}/g, function myFunction(_, __, x){
        let _index = preformats.push(`\\pageref{${module.texEscape(x.trim())}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      // Image Reference (pointing to placeimage): [reference:]
      text = text.replace(/:imagereference\[(.*?)?\]\{reference="(.*?)"\}/g, function myFunction(_, __, x){
        let _parts = x.trim().split('-');
        let _index = preformats.push(`\\ref{${module.texEscape(`${_parts[0]}-${_parts.pop()}`)}}`);
        return `---preformatter---${(_index-1)}-`;              
      });
      // DL DD
      // 
      if (text.match(/:   ([\S\s]*?)\n\n/gm)) {
        let _lines = text.split(/\n\n/);
        let _last = false;
        let _begintag = false;
        let _addedItem = false;
        for (let index = _lines.length - 1; index >= 0; index--) {
          let _line = _lines[index];
          if (_last) {
            _begintag = false;
            if (_lines[index - 1].match(/:   ([\S\s]*?)/g) === null && index > 0) {
              _begintag = preformats.push('\\begin{description}\n\n');
              _addedItem = false;
            }
            let _index = preformats.push(
              `\\item[${marked.parseInline(_line)}] ${marked.parseInline(_last.trim())}`
            );
            _lines[index] = `${_begintag ? `---preformatter---${(_begintag-1)}-` : ''}---preformatter---${(_index-1)}-`;
            _addedItem = !_begintag;
          }
  
          if (_line.match(/:   ([\S\s]*?)/g)) {
            if (!_addedItem) {
              let _index = preformats.push('\\end{description}');
              _lines[index] = `---preformatter---${(_index-1)}-`;
            }
            else {
              _lines.splice(index, 1);
            }
            _last = _line.replace(/:   ([\S\s]*?)/g, function myFunction(_, x){
              return x;
            })
          } 
          else {
            _last = false;
          }
        }
        text = _lines.join("\n\n");
      }
      // Attachements
      text = text.replace(/([ \n]*)\{\{Attachements:(.*?)\}\}([ \n]*)/g, function myFunction(_, s1, x, s2){
          try {
              if (x > 0) {
                  x--;
                  if (attachements && attachements.Content[x] && attachements.Content[x].Files) {
                      let source = attachements.Content[x].Files.Original;
                      let sizes = attachements.Content[x].Sizes;
                      if (issue.ForceAltImages === true) {
                        let _key = attachements.Content[x].Captions[2]
                        if (altattachements && altattachements.Content && altattachements.Content.length) {
                          altattachements.Content.forEach(_aa => {
                            if (_aa.Captions === _key) {
                              source = _aa.Files.Original
                              sizes = _aa.Sizes;
                            }
                          })
                        }
                      }
                      
                      let suffix = source.split('.').pop();
                      let localfile = path.join(module.downloadPath, `${guid()}.${suffix}`);
                      download(source, localfile)
                      
                      let s = settings.size1 ? 1 :
                                        settings.size2 ? 2 :
                                          settings.size3 ? 3 : 0;

                      let  _landscape  = sizes === false ? 'auto' :
                                          (sizes[0] > sizes[1] ? 'landscape' : 'portrait');
                      

                      let _index = preformats.push(`\\placeoriginal{${source}}{${localfile}}{${module.texEscape(attachements.Content[x].Captions[0])}}{${s}}{${_landscape}}{${module.texEscape(attachements.Content[x].Captions[1])}}{${docId}-${x+1}}`)
                      let _before = s1.match(/\n/) ? '\n\n ' : '';
                      let _after  = s2.match(/\n/) ? '\n\n ' : '';

                      return `${_before}${_before == '' && (s1 != '' || s2 != '') ? ' ' : ''}---preformatter---${(_index-1)}-${_after}`;   
                  }    
              }
          }
          catch(err) {
              let _index = preformats.push('')
              return `---preformatter---${(_index-1)}-`;                    
          }
      })
      // Footnotes: [fn:] or [footnote:]
      text = text.replace(/:fn\[([\S\s]*?)?(?<!\\)\]/g, function myFunction(_, x){
        let t_string = postformatting(marked.parseInline(preformatting(x.trim())));
        let _index = preformats.push(`\\footnote{${t_string}} `)
        return `---preformatter---${(_index-1)}-`;              
      });
      /**********************************************************************************
       * LEGACY PROCESSORS
       */
  
      // PDF: [pdf:url|page|fg]
      text = text.replace(/\\?\[pdf:(.*?)\\?\]/g, function myFunction(_, x){
  
        let _sa  = x.toString().split("|");
        let href = _sa[0];
        let page = _sa[1] || 1;
        let bg   = _sa[2] || 1;

        let suffix = href.split('.').pop();
        let escapedFile = href.replace(/[\W_]+/g,"");
        let localfile = `${escapedFile}.${suffix}`;
  
        let _index = preformats.push(`\\placepdf{${href}}{${localfile}}{${page}}{${bg}}`)
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
      levelStyles: levelStyles
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
      text = text.replace(/ ----force-new-line--- /g, '\\- \\protect\\\\ ');
      text = text.replace(/----soft-hyphen---/g, '\\-');
      text = text.replace(/----force-space---/g, '\\hspace*{0.5ex} ');
      return text;
    }
    var preformatting = function(text) {
      text = text.replace(/\u00AD/g, '----soft-hyphen---');
      text = text.replace(/\\\n/g, ' ----force-new-line--- '); 
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
      let remote = i.Files.Original.substr(0,2)=="//" ? "http:" + i.Files.Original :  i.Files.Original;
      let suffix = remote.split('.').pop();
      let escapedFile = remote.replace(/[\W_]+/g,"");
      let localfile = `${escapedFile}.${suffix}`;
      
      images.push({
        remote: remote,
        local: localfile,
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
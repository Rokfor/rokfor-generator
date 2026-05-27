
module.exports = function(log, slack) {

  /* Central Data Structure */

  const 
      crypto      = require("crypto"),
      unirest     = require("unirest"),
      path        = require('path'),
      marked      = require('marked'),
      TexRenderer = require('marked-tex-renderer'),
      md2typst    = require('./markdown-to-typst-enhanced'),
      webcapture  = require('capture-website'),
      puppeteer   = require('puppeteer'),
      temp        = require('temp'),
      fs          = require('fs'),
      proc        = require('child_process'),
      nj          = require('nunjucks'),
      { PDFDocument } = require('pdf-lib'),
      fsp         = require('node:fs/promises');

  // Export some Libraries 
  module.PDFDocument = PDFDocument;
  module.fsp = fsp;
  module.webcapture = webcapture;
  module.puppeteer  = puppeteer;
  module.nj         = nj;
  module.log        = log;
  let _downloadPath = false;
  Object.defineProperty(module, 'downloadPath', {
    get() {
      if (_downloadPath === false) {
        throw('Download Path not set')
      }
      return _downloadPath;
    },
    set(value) {
      _downloadPath = value;
      if (_downloadPath && !fs.existsSync(_downloadPath)) {
        fs.mkdirSync(_downloadPath, { recursive: true });
      }
    },
    configurable: true,
    enumerable: true
  });

  module.marked     = marked;
  
  var download = async function(url, dest) {
    if (fs.existsSync(dest) === false) {
      proc.execFileSync('curl', ['--silent', '-L', url, '-o', dest], {encoding: 'utf8', maxBuffer: Infinity});
      log.info(`\x1b[32m[DOWNLOAD]\x1b[0m ${url} → ${dest}`)
    } else {
      log.info(`\x1b[32m[DOWNLOAD]\x1b[0m  Skipped ${url}`)
    }
    return dest 
  }

  var downloadConvert = function(url, dest) {
    if (fs.existsSync(`${dest}.jpg`) === false) {
      proc.execFileSync('curl', ['--silent', '-L', url, '-o', dest], {encoding: 'utf8', maxBuffer: Infinity});
      proc.execFileSync('convert',['-flatten', '-colorspace', 'gray', '-density', '300', dest, `${dest}.jpg`], {encoding: 'utf8', maxBuffer: Infinity});
      log.info(`\x1b[32m[DOWNLOAD]\x1b[0m ${url} → ${dest}.jpg`)
    } else {
      log.info(`\x1b[32m[DOWNLOAD]\x1b[0m  Skipped: ${url}`)
    }
    return `${dest}.jpg`
  }




  var getMD5Hash = (input) => {
    const hashFunc = crypto.createHash('md5');   // you can also sha256, sha512 etc
    hashFunc.update(input);
    const _md5 = hashFunc.digest('hex');  
    return _md5;
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

  var decodeHtmlEntities = (encodedStr) => {
    // A simple map of HTML entities to their decoded equivalents
    const htmlEntities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': ' ',
      '&copy;': '©',
      '&reg;': '®',
      // Add more as needed
    };

    // Use a regular expression to replace entities in the string
    return encodedStr.replace(/&[a-zA-Z0-9#]+;/g, match => htmlEntities[match] || match);
  }

  var linkImpl = function (href, title, text) {
    if ((typeof href === "string" && href) && (!text || text.replace(/\\/g, "") == decodeHtmlEntities(href.replace(/\\/g, "")))) {
      // return href as \url{href} if there is no description
      if (!text) {
        href  = module.texEscape(href.replace(/\\/g, ""));      
        return '\\url{' + href + '}';
      }
      // return text as \url{text} if href is the same as text
      else {
        text  = module.texEscape(text.replace(/\\/g, ""));      
        return '\\url{' + text + '}';
      }
    }
    // continue here for \hrefs with {href} and {text}
    if (typeof href === "string" && href)  href  = module.texEscape(href.replace(/\\/g, ""));
    if (typeof title === "string" && title) title = module.texEscape(title);//.replace(/\\/g, "");
    if (typeof text === "string" && text)  text  = module.texEscape(text.replace(/\\/g, ""));//.replace(/\\/g, "");
    return '\\href{' + href + '}{' + text + '}';
  };


  // ------------------------------------------------------------------
  // Image Implementation leaves most work to latex. It just substitutes
  // an image tag with a function \placeimage{imagurl}{localfilename}{caption}
  //
  // Sample Implementation in LaTex:
  //
  // \newcommand*{\placeimage}[3]{  % macro placeimage(remote, local, captions): places an image 
  // \begin{figure}%
  // 	 \noindent%
  //   \begin{minipage}[c][1\textheight]{1\textwidth}%
  // 	   \centering%
  // 	   \includegraphics[width=1\textwidth,height=0.8\textheight,keepaspectratio]{#2}%
  // 	   \setcapmargin[0mm]{0mm}%
  // 	   \caption*{\centering\smallfont #3}%
  // 	 \end{minipage}%
  // \end{figure}%
  // }
  // ------------------------------------------------------------------

  var imageImpl = function (href, title, text) {
    let NEWLINE = '\r\n';
    let suffix = href.split('.').pop().split('?')[0];
    let localfile = path.join(module.downloadPath, `${getMD5Hash(href)}.${suffix}`);
    let jpg = downloadConvert(href, localfile)
    return [
      NEWLINE,
      '\\placeimage{' + jpg + '}{' + jpg + '}{' + marked.parseInline(text || '') + '}{' + marked.parseInline(title || '') + '}',
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

  module.getEngine = () => api.engine || 'latex'
  
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
      source.localfile = path.join(module.downloadPath, `${getMD5Hash(source.Original)}.${suffix}`);
      download(`${source.Original}?backend=true`, source.localfile)      
      return source;
    }
    return false;
  }


  module.resolveRemoteImages_v2 = (data, key, options) => {
    options = options || {}
    options.relative = options.relative ?? true
    options.selection = options.selection ?? false
    if (data?.[key] && data?.[key]?.data?.length && data?.[key]?.data.length > 0) {
      for (let index = 0; index < data[key].data.length; index++) {
        if (index === options.selection ||  options.selection === false) {
          const source = data[key].data[index]; 
          const suffix = source.src.split('.').pop();
          const localfile = path.join(module.downloadPath, `${getMD5Hash(source.src)}.${suffix}`);
          if (download(`${source.src}?backend=true`, localfile)) {
            data[key].data[index].localfile = options.relative
              ? path.relative(module.engineSettings.workspace, localfile)
              : localfile
          } else {
            log.info(`\x1b[32m[DOWNLOAD]\x1b[0m failed: ${source.src}`)
          }
        }
      }
    }
  }

  module.resolveEmbeddedImages_v2 = (data, key, language, field, replacement, options) => {
    options = options || {}
    options.relative = options.relative ?? true
    replacement = replacement ?? `<!--raw-typst #figure(image("{{image-path}}", width: 100%), caption: "{{caption-text}}") -->`
    let text = language === false ? data?.[key]?.data ?? undefined :  data?.[key]?.data?.[language] ?? undefined

    if (text !== undefined) {
      // Attachements
      const regex = new RegExp(`\\{\\{${field}:(.*?)\\}\\}`, 'g')
      text = text.replace(regex, function myFunction(_, x){
        x = parseInt(x) - 1 // {{Attachement}} Syntax starts with 1
        if (x >= 0 && data[field].data &&  data[field].data[x]) {
          // Localize remote image x
          options.selection = x
          // this is now populated: data[field]?.Content[x]?.localfile
          module.resolveRemoteImages_v2(data, field, options)
          // set embedded flag, so we can track it probably on a different location as "embedded"
          data[field].data[x].isEmbedded = true
          return replacement
                    .replace('{{image-path}}', data[field].data[x].localfile)
                    .replace('{{caption-text}}', language === false ? data[field]?.data?.[x]?.captions : data[field]?.data?.[x]?.captions[language])
        }
      })
      if (language === false) {
        data[key].data = text
      } else {
        data[key].data[language] = text
      }
    }
  }



  module.resolveRemoteImages = (data, key, options) => {
    options = options || {}
    options.relative = options.relative ?? true
    options.selection = options.selection ?? false
    if (data[key]?.Content && data[key].Content?.length && data[key].Content.length > 0) {
      for (let index = 0; index < data[key].Content.length; index++) {
        if (index === options.selection ||  options.selection === false) {
          const source = data[key].Content[index].Files; 
          const suffix = source.Original.split('.').pop();
          const localfile = path.join(module.downloadPath, `${getMD5Hash(source.Original)}.${suffix}`);
          if (download(`${source.Original}?backend=true`, localfile)) {
            data[key].Content[index].localfile = options.relative
              ? path.relative(module.engineSettings.workspace, localfile)
              : localfile
          } else {
            log.info(`\x1b[32m[DOWNLOAD]\x1b[0m failed: ${source.Original}`)
          }
        }
      }
    }
  }

  module.resolveEmbeddedImages = (data, key, language, field, replacement, options) => {
    options = options || {}
    options.relative = options.relative ?? true
    replacement = replacement ?? `<!--raw-typst #figure(image("{{image-path}}", width: 100%), caption: "{{caption-text}}") -->`
    let text = language === false ? data[key]?.Content :  data[key]?.Content?.[language]
    if (text !== undefined) {
      // Attachements
      const regex = new RegExp(`\\{\\{${field}:(.*?)\\}\\}`, 'g')
      text = text.replace(regex, function myFunction(_, x){
        x = parseInt(x) - 1 // {{Attachement}} Syntax starts with 1
        if (x >= 0 && data[field]?.Content &&  data[field]?.Content[x]?.Files) {
          // Localize remote image x
          options.selection = x
          // this is now populated: data[field]?.Content[x]?.localfile
          module.resolveRemoteImages(data, field, options)
          // set embedded flag, so we can track it probably on a different location as "embedded"
          data[field].Content[x].isEmbedded = true
          return replacement
                    .replace('{{image-path}}', data[field].Content[x].localfile)
                    .replace('{{caption-text}}', language === false ? data[field]?.Content[x]?.Captions : data[field]?.Content[x]?.Captions[language])
        }
      })
      if (language === false) {
        data[key].Content = text
      } else {
        data[key].Content[language] = text
      }
    }
  }

  module.resolveMarkdownImages = (data, key, language, replacement, options) => {
    options = options || {}
    options.relative = options.relative ?? true
    replacement = replacement ?? `<!--raw-typst #figure(image("{{image-path}}", width: 100%), caption: "{{caption-text}}") -->`
    let text = language === false ? data[key]?.Content :  data[key]?.Content?.[language]
    if (text !== undefined) {
      // Attachements
      const regex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
      text = text.replace(regex, function(match, altText, url, title) {

        const suffix = url.split('.').pop();
        const localfile = path.join(module.downloadPath, `${getMD5Hash(url)}.${suffix}`);
        if (download(url, localfile)) {
          const finalPath = options.relative
            ? path.relative(module.engineSettings.workspace, localfile)
            : localfile
          return replacement
            .replace('{{image-path}}', finalPath)
            .replace('{{caption-text}}', altText)
        } else {
          log.info(`\x1b[32m[DOWNLOAD]\x1b[0m failed: ${url}`)
        }
        return ''
      });
      if (language === false) {
        data[key].Content = text
      } else {
        data[key].Content[language] = text
      }
    }
  }

  /**
 * Comprehensive Markdown to Typst converter with proper escaping
 * @param {string} markdown - The Markdown text to convert
 * @returns {string} - The converted Typst code
 */

  module.escapeMD = (text) => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/#/g, '\\#')
      .replace(/\$/g, '\\$')
      .replace(/@/g, '\\@');
  }

  // Characters with markup meaning in Typst content mode. Escape every
  // match with a leading backslash. Used by `txt2Typst` (whole field) and
  // by `md2Typst`'s `[in:xxx]` directive (per-term).
  const TYPST_CONTENT_ESCAPE_RE = /[\\*_#$@`<\[\]]/g
  module.escapeTypstContent = (text) => text.replace(TYPST_CONTENT_ESCAPE_RE, '\\$&')

  module.md2Typst = function(data, key, language, imageMacro) {

    let result = language === false ? (data[key].data ?? undefined) :  data[key]?.data?.[language] ?? undefined
    if (result == undefined) return
    // Markdown hard line breaks ("\" at EOL) defeat the converter's
    // line-based emphasis matching (an italic span crossing such a break is
    // left unconverted, which in Typst means it renders as bold). Replace
    // them with a plain-ASCII token before conversion so emphasis is
    // recognised, then restore them as Typst linebreaks afterwards.
    const HARD_BREAK_TOKEN = 'RFHARDLINEBREAKRF'
    // Custom inline directives are typed `[<prefix>:xxx]` in the markdown
    // source and emitted as `#<command>[xxx]` in the Typst output.
    // Add more entries to this map to support further directives.
    //   • `[in:xxx]` → `#index[xxx]`    (in-dexter entry)
    //   • `[fn:xxx]` → `#footnote[xxx]` (Typst footnote)
    const DIRECTIVE_COMMANDS = { in: 'index', fn: 'footnote' }
    // We stash the raw term in `directiveTerms` and leave a numeric,
    // alphanumeric-only token in the markdown source so the
    // markdown→Typst converter cannot mangle the term (which may contain
    // `#`, `$`, `[`, `@`, `\`, … — all of which have meaning in both
    // markdown and Typst). After conversion we swap the tokens back and
    // escape each term via `escapeTypstContent`.
    const DIRECTIVE_TOKEN_PREFIX = 'RFDIRECTIVETOKEN'
    const DIRECTIVE_TOKEN_SUFFIX = 'RFDIRECTIVETOKENEND'
    const directiveTerms = []
    // CommonMark autolinks (`<http://…>`, `<https://…>`, `<mailto:…>`,
    // `<ftp://…>`) become `#link("…")` in Typst. We tokenise them before
    // conversion for the same reason we tokenise directives: the
    // markdown→Typst converter escapes `#$@` and would mangle any inline
    // `#link(...)` we tried to emit from inside it, and URLs may legally
    // contain `#` / `@` fragments.
    const AUTOLINK_TOKEN_PREFIX = 'RFAUTOLINKTOKEN'
    const AUTOLINK_TOKEN_SUFFIX = 'RFAUTOLINKTOKENEND'
    const autolinkUrls = []
    if (typeof result === 'string') {
      result = result.replace(/\\\r?\n/g, HARD_BREAK_TOKEN)
      // The `\\?` on each side absorbs markdown-style escaped brackets
      // (`\[in:xxx\]`) so a stray `\` does not end up next to the
      // `#<command>[...]` we later emit — which would otherwise print as
      // e.g. `\#index[xxx\\]` in the Typst source.
      const directiveKeys = Object.keys(DIRECTIVE_COMMANDS).join('|')
      const directiveRe = new RegExp(`\\\\?\\[(${directiveKeys}):([^\\]]+?)\\\\?\\]`, 'g')
      result = result.replace(directiveRe, (_match, prefix, term) => {
        const idx = directiveTerms.length
        directiveTerms.push({ prefix, term })
        return `${DIRECTIVE_TOKEN_PREFIX}${idx}${DIRECTIVE_TOKEN_SUFFIX}`
      })
      // Same tokenise-now / substitute-later trick for autolinks.
      result = result.replace(
        /<((?:https?|ftp|mailto):[^>\s]+)>/g,
        (_match, url) => {
          const idx = autolinkUrls.length
          autolinkUrls.push(url)
          return `${AUTOLINK_TOKEN_PREFIX}${idx}${AUTOLINK_TOKEN_SUFFIX}`
        }
      )
    }
    const m = new md2typst(download, module.downloadPath, module.engineSettings.workspace, imageMacro)
    let converted = m.convert(result)
    if (typeof converted === 'string') {
      converted = converted.replace(new RegExp(HARD_BREAK_TOKEN, 'g'), ' \\\n')
      converted = converted.replace(
        new RegExp(`${DIRECTIVE_TOKEN_PREFIX}(\\d+)${DIRECTIVE_TOKEN_SUFFIX}`, 'g'),
        (_match, idx) => {
          const { prefix, term } = directiveTerms[parseInt(idx, 10)]
          const command = DIRECTIVE_COMMANDS[prefix]
          return `#${command}[${module.escapeTypstContent(term)}]`
        }
      )
      converted = converted.replace(
        new RegExp(`${AUTOLINK_TOKEN_PREFIX}(\\d+)${AUTOLINK_TOKEN_SUFFIX}`, 'g'),
        (_match, idx) => {
          // Escape characters with syntactic meaning inside a Typst
          // double-quoted string literal. URLs rarely contain either,
          // but better safe than sorry.
          const url = autolinkUrls[parseInt(idx, 10)]
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
          return `#link("${url}")`
        }
      )
    }
    if (language === false) {
      data[key].data = converted
    } else {
      data[key].data[language] = converted
    }
    return converted

}

  module.txt2Typst = function(data, key, language) {

    let result = language === false ? (data[key].data ?? undefined) :  data[key]?.data?.[language] ?? undefined
    if (result == undefined) return
    const converted = module.escapeTypstContent(result)
    if (language === false) {
      data[key].data = converted
    } else {
      data[key].data[language] = converted
    }
    return converted

}

  module.md2Tex =  function(string, options = {}) {

    let levelStyles = (typeof options.levelStyles === "array" || typeof options.levelStyles === "object") ? options.levelStyles : false
    let renderImpl = options.renderImpl || {}
    let attachements = options.attachements || false
    let altattachements = options.altattachements || false 
    let issue = options.issue || {}
    let settings = options.settings ||{} 
    let docName = options.docName || ""
    let docSort = options.docSort || ""
    let docId = options.docId || ""
    let spaceAfterFootnote = options.disableSpaceAfterFootnote === true ? "" : " " // Default: Add Space after a footnote.


    var preformats = [];

    var postformatting = function(text) {
      text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
        return preformats[x * 1];
      });
      text = text.replace(/ ----force-new-line--- /g, '\\- \\protect\\\\ ');
      text = text.replace(/----force-new-line---/g, '\\- \\protect\\\\ '); // If any of these exist...
      text = text.replace(/----soft-hyphen---/g, '\\-');
      text = text.replace(/----force-space---/g, '\\hspace*{0.5em}');
      text = text.replace(/----non-breaking-space---/g, '~');

      return text;
    }
  
  var preformatting = function(text) {
      
      // Non Breaking Space
      text = text.replace(/\u00A0/g, '----non-breaking-space---');
      
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
        let _index = preformats.push(`\\footnote{${t_string}}${spaceAfterFootnote}`)
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
      // Extra Link : [extra:]
      text = text.replace(/:extra\[(.*?)?\]\{id="(.*?)"\}/g, function myFunction(_, __, x){
        let _index = preformats.push(`\\extralink{${docSort}}{${parseInt(x)}}`);
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

      // const regex = /\{\{Attachements:(.*?)\}\}(?:\s*\{\{Attachements:(.*?)\}\})+/g;
      // console.log(text.match(regex))
      // Todo: replace attachement with a modifier, check for the modifier. i.e. Attachements:_x instead of Attachements:x
      text = text.replace(/\{\{Attachements:(.*?)\}\}(?:\s*\{\{Attachements:(.*?)\}\})+/g, function myFunction(_, s1){
        return _.replace(/\{\{Attachements:(\d+)\}\}/g, (match, p1) => `{{Attachements:*${p1}}}`);
      })

      // Attachements
      text = text.replace(/([ \n]*)\{\{Attachements:(.*?)\}\}([ \n]*)/g, function myFunction(_, s1, x, s2){
          let adjacent = settings.noadjacent == true ? true : false;
          try {
              if (x.charAt(0) === '*') {
                // Enable adjacent mode if noadjacent is not enabled
                adjacent = true;
                x = x.substr(1)
              }
              x = parseInt(x)
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
                      let localfile = path.join(module.downloadPath, `${getMD5Hash(source)}.${suffix}`);
                      download(`${source}?backend=true`, localfile)
                      
                      let s = settings.size1 ? 1 :
                                        settings.size2 ? 2 :
                                          settings.size3 ? 3 : 0;

                      let  _landscape  = sizes === false ? 'auto' :
                                          (sizes[0] > sizes[1] ? 'landscape' : 'portrait');

                      if (attachements.Content[x].Captions[4] && attachements.Content[x].Captions[4] != 'false') {
                        adjacent = attachements.Content[x].Captions[4]
                      }
                      let _caption = (attachements.Content[x].Captions[0] || "").normalize('NFC')
                      let _lof = (attachements.Content[x].Captions[1] || "").normalize('NFC')
                      let _index = preformats.push(`\\placeoriginal{${source}}{${localfile}}{${marked.parseInline(_caption)}}{${s}}{${_landscape}}{${marked.parseInline(_lof)}}{${docId}-${x+1}}{${adjacent}}{${settings.nocaptiondefault}}`)
                      let _before = s1.match(/\n/) ? '\n\n ' : '';
                      let _after  = s2.match(/\n/) ? '\n\n ' : '';

                      return `${_before}${_before == '' && (s1 != '' || s2 != '') ? ' ' : ''}---preformatter---${(_index-1)}-${_after}`;   
                  }    
              }
          }
          catch(err) {
              log.info(`\x1b[32m[ATTACHEMENT]\x1b[0m Error: ${err}`)
              let _index = preformats.push('')
              return `---preformatter---${(_index-1)}-`;                    
          }
      })
      // Footnotes: [fn:] or [footnote:]
      text = text.replace(/:fn\[([\S\s]*?)?(?<!\\)\]/g, function myFunction(_, x){
        x = x || 'no footnote text - please correct'
        let t_string = postformatting(marked.parseInline(preformatting(x.trim())));
        let _index = preformats.push(`\\footnote{${t_string}}${spaceAfterFootnote}`)
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
        let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}${spaceAfterFootnote}`)
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
      text = text.replace(/----non-breaking-space---/g, '~');
      return text;
    }
    var preformatting = function(text) {
      text = text.replace(/\u00AD/g, '----soft-hyphen---');
      text = text.replace(/\u00A0/g, '----non-breaking-space---');
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
    log.info(`\x1b[32m[GET]\x1b[0m ${api.endpoint}${url}`)
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


  module.getRf_v2 = function(url, params) {
    params = params || {};
    params.meta = true
    const fullUrl = `${api.endpoint}/${url}?query=${JSON.stringify(params)}`
    log.info(`\x1b[32m[GET]\x1b[0m ${fullUrl}`)
    return new Promise((resolve, reject) => {
      unirest('GET', fullUrl)
        .headers({
          "content-type": "application/json",
          "authorization": `Bearer ${api.rokey}`
        })
        .end(function (res) {
          if (res.error) {
            log.error(`\x1b[31m[ERROR]\x1b[0m Connector Call Failed: ${res.body}`);
            slack.notify(`ROKFOR GENERATOR: Generated ${res.body}`)
            reject(res.body)
          }
          else {
            resolve(res.body);
          }
        });
    })
  } 
  return module;
}

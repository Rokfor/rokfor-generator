let preformats = [];

marked      = require('marked'),
TexRenderer = require('marked-tex-renderer')

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


module = {
    texEscape: function(e) {return e}
}

attachements = `{
    "Id": 18325,
    "Content": [
        {
            "Files": {
                "Thumbnail": "https://writer.rokfor.ch/asset/4077/18325/1618316619_glasbausteine.jpg-thmb.jpg",
                "Original": "https://writer.rokfor.ch/asset/4077/18325/1618316619_glasbausteine.jpg",
                "Resized": [
                    "https://writer.rokfor.ch/asset/4077/18325/1618316619_glasbausteine.jpg-preview0.jpg",
                    "https://writer.rokfor.ch/asset/4077/18325/1618316619_glasbausteine.jpg-preview1.jpg",
                    "https://writer.rokfor.ch/asset/4077/18325/1618316619_glasbausteine.jpg-preview2.jpg"
                ]
            },
            "Captions": [
                "Edit Caption",
                "Uploader: urs Time: Tue Apr 13 2021 12:24:22 GMT+0000 (Coordinated Universal Time)"
            ],
            "Parsed": [
                "Edit Caption",
                "Uploader: urs Time: Tue Apr 13 2021 12:24:22 GMT+0000 (Coordinated Universal Time)"
            ],
            "Sizes": {
                "0": 1280,
                "1": 960,
                "2": 2,
                "3": "width=1280 height=960",
                "bits": 8,
                "channels": 3,
                "mime": "image/jpeg"
            }
        }
    ]
}`;

attachements = JSON.parse(attachements);

var postformatting = function(text) {
    text = text.replace(/---preformatter---(.*?)-/g, function myFunction(_, x){
      return preformats[x * 1];
    });
    text = text.replace(/----force-new-line---/g, '\\- \\\\ ');
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

    text = text.replace(/\\\n/g, '----force-new-line---');


    // v.2 Elements / component style

    // Language
    text = text.replace(/::: language\{language="(.*?)"\}::[\S\s]*?:::/gm, function myFunction(_, x){
      let _index = preformats.push(`\\selectlanguage{${x.trim()}}`);
      return `---preformatter---${(_index-1)}-`;              
    });       
    // Footnote
    text = text.replace(/::: footnote ::([\S\s]*?):::/gm, function myFunction(_, x){
      let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
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
      let _index = preformats.push(`\\citep[${pre}][${post}]{${reference}}`)
      return `---preformatter---${(_index-1)}-`;              
    });
    // Footnotes: [fn:] or [footnote:]
    text = text.replace(/:fn\[([\S\s]*?)?\]/g, function myFunction(_, x){
      let _index = preformats.push(`\\footnote{${marked(x.trim()).replace(/\\par /, '')}}`)
      return `---preformatter---${(_index-1)}-`;              
    });
    // Index: [in:] or [index:]
    text = text.replace(/:index\[(.*?)?\]/g, function myFunction(_, x){
      let _index = preformats.push(`\\index{${module.texEscape(x.trim())}}`)
      return `---preformatter---${(_index-1)}-`;              
    });
    // Mark: [mark:]
    text = text.replace(/:mark\[(.*?)?\]/g, function myFunction(_, x){
      let _index = preformats.push(`\\label{${module.texEscape(x.trim())}}`);
      return `---preformatter---${(_index-1)}-`;              
    });
    // Page Reference (pointing to Mark): [reference:]
    text = text.replace(/:reference\[(.*?)?\]/g, function myFunction(_, x){
      let _index = preformats.push(`\\pageref{${module.texEscape(x.trim())}}`);
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
            `\\item{${module.texEscape(_line)}} ${module.texEscape(_last.trim())}`
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

    text = text.replace(/\{\{Attachements :(.*?)\}\}/g, function myFunction(_, x){
        try {
            if (x > 0) {
                x--;
                if (attachements && attachements.Content[x] && attachements.Content[x].Files) {
                    let r = Math.round(Math.random() * 1000);
                    let d = new Date();
                    let localfile = d.getTime() + "_" + r + ".pdf";
                    let _index = preformats.push(`\\placepdf{${attachements.Content[x].Files.Original}}{${localfile}}{${module.texEscape(attachements.Content[x].Captions[0])}}`)
                    return `---preformatter---${(_index-1)}-`;   
                }    
            }
        }
        catch(err) {
            let _index = preformats.push('')
            return `---preformatter---${(_index-1)}-`;                    
        }
    })

    /**********************************************************************************
     * LEGACY PROCESSORS
     */

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


let _test = `
BEGIN OF TEST

1

:   1b

2

:   2b

3

:   3b

TEXT

1

:   1b

2

:   2b

3

:   3b

TEXT

::: footnote ::
FOOTNOTE BLOCK

:::

::: latex ::
LATEX BLOCK

:::

::: comment ::
COMMENT BLOCK

:::

::: paragraphalternate ::
ALTERNATE STYLE BLOCK

this can also include a 

::: language{language="french"}::
french
:::

Language Tag

:::

:index[index]

:mark[MARKER]

:reference[marker]

:fn[inline Footnote]

:bibliography[ahu61, pre, post]{post="post" pre="pre" reference="ahu61"}

::: language{language="arabic"}::
arabic
:::

END OF TEXT

{{Attachements :1}}
`;

console.log(postformatting(preformatting(_test)));
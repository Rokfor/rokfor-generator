/**
 * Enhanced Markdown to Typst Converter
 * Handles more edge cases and provides better output
 */

const crypto = require('crypto');
const path = require('path');

class MarkdownToTypstConverter {

  constructor (download, downloadPath, workspace, imageMacro) {
    this.download = download
    this.downloadPath = downloadPath
    this.workspace = workspace
    this.imageMacro = imageMacro
  }

  getMD5Hash (input) {
    const hashFunc = crypto.createHash('md5');   // you can also sha256, sha512 etc
    hashFunc.update(input);
    const _md5 = hashFunc.digest('hex');  
    return _md5;
  }

  convert(markdown) {
    let lines = markdown.split('\n');
    let result = [];
    let state = {
      inCodeBlock: false,
      codeBlockLang: '',
      inList: false,
      lastWasEmpty: false
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headers with trailing \: collect continuation lines into a heading() call
      const headerMatch = !state.inCodeBlock && line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch && headerMatch[2].trimEnd().endsWith('\\')) {
        const level = headerMatch[1].length;
        let parts = [headerMatch[2].trimEnd().slice(0, -1).trim()];
        while (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine === '') break;
          i++;
          if (nextLine.endsWith('\\')) {
            parts.push(nextLine.slice(0, -1).trim());
          } else {
            parts.push(nextLine);
            break;
          }
        }
        const text = parts.map(p => this.convertInline(p)).join(' \\ ');
        result.push(`#heading(level: ${level})[${text}]`);
        continue;
      }

      const processed = this.processLine(line, state);

      if (processed !== null) {
        result.push(processed);
      }
    }
    
    return result.join('\n');
  }
  
  processLine(line, state) {
    // Code blocks
    if (line.trim().startsWith('```')) {
      if (!state.inCodeBlock) {
        state.codeBlockLang = line.trim().slice(3).trim();
        state.inCodeBlock = true;
        return '```' + state.codeBlockLang;
      } else {
        state.inCodeBlock = false;
        return '```';
      }
    }
    
    if (state.inCodeBlock) {
      return line;
    }
    
    // Empty lines
    if (line.trim() === '') {
      state.inList = false;
      state.lastWasEmpty = true;
      return '';
    }
    
    state.lastWasEmpty = false;
    
    // Headers (ATX style) - require space after # per CommonMark spec
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = this.convertInline(headerMatch[2]);
      return '='.repeat(level) + ' ' + text;
    }
    
    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      return '\n#hrule\n';
    }
    
    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      const indent = Math.floor(ulMatch[1].length / 2);
      const content = this.convertInline(ulMatch[2]);
      state.inList = true;
      return '  '.repeat(indent) + '- ' + content;
    }
    
    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      const indent = Math.floor(olMatch[1].length / 2);
      const content = this.convertInline(olMatch[2]);
      state.inList = true;
      return '  '.repeat(indent) + '+ ' + content;
    }
    
    // Blockquote
    if (line.trim().startsWith('>')) {
      const content = line.replace(/^>\s*/, '');
      return '#quote(block: true)[' + this.convertInline(content) + ']';
    }
    
    // Table detection (basic)
    // if (line.includes('|')) {
    //  return this.convertTableLine(line);
    // }
    
    // Regular paragraph
    state.inList = false;
    return this.convertInline(line);
  }
  
  convertInline(text) {
    if (!text) return text;

    // Handle markdown escaped characters before any conversion
    // so they don't interfere with bold/italic regex matching.
    // The placeholders must not themselves contain `*` or `_`, or the
    // emphasis rules below match across a pair of them.
    text = text.replace(/\\\*/g, '\x00ESCASTERISK\x00');
    text = text.replace(/\\_/g, '\x00ESCUNDERSCORE\x00');

    // Stash inline code spans before any conversion: their contents are
    // literal, so neither the emphasis rules nor the leftover-delimiter
    // escaping below may touch them. Restored verbatim at the end.
    const codeSpans = [];
    text = text.replace(/`([^`]+)`/g, (_match, code) => {
      codeSpans.push(code);
      return `\x00CODESPAN${codeSpans.length - 1}\x00`;
    });

    // Escape special Typst characters before any conversion
    // so that markdown syntax is still intact but literal #, $, @ are safe
    text = text.replace(/([#$@])/g, '\\$1');

    // Images: ![alt](url) or ![alt](url "title")
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt, url, title) => {

      const suffix = url.split('.').pop();
      const localfile = path.join(this.downloadPath, `${this.getMD5Hash(url)}.${suffix}`);
      if (this.download(url, localfile)) {
        const finalPath = path.relative(this.workspace, localfile)
        return this.imageMacro
            .replace('{{image-path}}', finalPath)
            .replace('{{caption-text}}', alt);
      }


    });


    // Links: [text](url) or [text](url "title")
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, text, url, title) => {
      return `#link("${url}")[${text}]`;
    });

    // Emphasis is emitted as `#strong[…]` / `#emph[…]` rather than the
    // `*…*` / `_…_` shorthands. The shorthands only delimit at word
    // boundaries, so intraword markdown emphasis — `s**ystème**`, legal in
    // CommonMark — becomes an "unclosed delimiter" error in Typst. The
    // function forms carry no such rule and are otherwise synonymous.
    // Longest run first: *** before ** before *.
    //
    // The delimiter rules follow CommonMark flanking: a span may not open or
    // close against whitespace (`2 * 3 = 6 *` is arithmetic, not emphasis),
    // and `*` may delimit intraword while `_` may not (so `snake_case_name`
    // stays literal).
    const emphasisRule = (char, count) => {
      const d = char === '*' ? '\\*' : '_';
      const run = d.repeat(count);
      // Underscores additionally may not sit against a word character.
      const [outerBefore, outerAfter] = char === '_'
        ? ['(?<![\\p{L}\\p{N}])', '(?![\\p{L}\\p{N}])']
        : ['', ''];
      return new RegExp(
        `${outerBefore}(?<!${d})${run}(?!${d}|\\s)(.+?)(?<!${d}|\\s)${run}(?!${d})${outerAfter}`,
        'gu'
      );
    };

    for (const char of ['*', '_']) {
      // Bold + Italic: ***text*** or ___text___
      text = text.replace(emphasisRule(char, 3), '#strong[#emph[$1]]');
      // Bold: **text** or __text__
      text = text.replace(emphasisRule(char, 2), '#strong[$1]');
      // Italic: *text* or _text_
      text = text.replace(emphasisRule(char, 1), '#emph[$1]');
    }

    // Strikethrough: ~~text~~
    text = text.replace(/~~(.+?)~~/g, '#strike[$1]');

    // Any `*`/`_` still standing is an unpaired delimiter — a typo in the
    // source, or an apostrophe-style literal. Escape it: unescaped, Typst
    // reads it as an emphasis delimiter and aborts the whole render with
    // "unclosed delimiter", so one stray character in one field would
    // otherwise take down the entire book.
    text = text.replace(/[*_]/g, '\\$&');

    // Restore markdown escaped characters as Typst escapes
    text = text.replace(/\x00ESCASTERISK\x00/g, '\\*');
    text = text.replace(/\x00ESCUNDERSCORE\x00/g, '\\_');

    // Restore inline code spans as Typst raw text, contents untouched
    text = text.replace(/\x00CODESPAN(\d+)\x00/g, (_match, idx) => '`' + codeSpans[parseInt(idx, 10)] + '`');

    return text;
  }
  
  convertTableLine(line) {
    // Basic table support - just passes through for now
    // Full table conversion would require multi-line parsing
    return '// Table: ' + line;
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownToTypstConverter;
}


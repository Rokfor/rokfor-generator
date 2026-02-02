/**
 * Enhanced Markdown to Typst Converter
 * Handles more edge cases and provides better output
 */

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
    
    // Headers (ATX style)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = this.convertInline(headerMatch[2]);
      return '='.repeat(level) + ' ' + text;
    }
    
    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      return '\n#line(length: 100%)\n';
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
    if (line.includes('|')) {
      return this.convertTableLine(line);
    }
    
    // Regular paragraph
    state.inList = false;
    return this.convertInline(line);
  }
  
  convertInline(text) {
    if (!text) return text;
    
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
    
    // Bold: **text** or __text__ (must come before italic)
    text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
    text = text.replace(/__(.+?)__/g, '*$1*');
    
    // Italic: *text* or _text_
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_');
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '_$1_');
    
    // Bold + Italic: ***text*** or ___text___
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*');
    text = text.replace(/___(.+?)___/g, '*_$1_*');
    
    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, '`$1`');
    
    // Strikethrough: ~~text~~
    text = text.replace(/~~(.+?)~~/g, '#strike[$1]');
    
    // Escape special Typst characters if needed
    // text = text.replace(/([#$@])/g, '\\$1');
    
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


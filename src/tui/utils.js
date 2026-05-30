// NOTE: This helper is NOT a complete Unicode terminal layout engine.
// It is CJK-aware and surrogate-pair safe for simple emojis, but full terminal
// wcwidth compliance and ZWJ grapheme clusters are intentionally out of scope.
function visualWidth(ch) {
  const cp = ch.codePointAt(0);
  if (!cp) return 0;
  if (cp >= 0x1100 && (
    cp <= 0x115F ||                    // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0xA4CF) ||  // CJK Radicals, Kangxi, Ideographic Description, CJK Symbols, Hiragana, Katakana, Bopomofo, etc.
    (cp >= 0xA960 && cp <= 0xA97C) ||  // Hangul Jamo Extended-A
    (cp >= 0xAC00 && cp <= 0xD7AF) ||  // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility Ideographs
    (cp >= 0xFE10 && cp <= 0xFE19) ||  // Vertical Forms
    (cp >= 0xFE30 && cp <= 0xFE6F) ||  // CJK Compatibility Forms
    (cp >= 0xFF01 && cp <= 0xFF60) ||  // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||  // Fullwidth Signs
    (cp >= 0x20000 && cp <= 0x2FFFF) || // CJK Unified Ideographs Extension B-F
    (cp >= 0x30000 && cp <= 0x3FFFF)   // CJK Unified Ideographs Extension G-H
  )) return 2;
  return 1;
}

function visualLength(str) {
  let len = 0;
  for (const ch of str) len += visualWidth(ch);
  return len;
}

function fitAnsi(str, width, { align = 'left', ellipsis = false, pad = true } = {}) {
  if (width <= 0) return '';
  let i = 0;
  const items = [];
  let totalVis = 0;
  const chars = Array.from(str);

  while (i < chars.length) {
    if (chars[i] === '\x1b') {
      let j = i;
      while (j < chars.length) {
        const c = chars[j];
        if (j > i && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))) {
          break;
        }
        j++;
      }
      if (j < chars.length) {
        items.push({ isAnsi: true, code: chars.slice(i, j + 1).join(''), width: 0 });
        i = j + 1;
        continue;
      }
    }

    const ch = chars[i];
    const w = visualWidth(ch);
    items.push({ isAnsi: false, char: ch, width: w });
    totalVis += w;
    i++;
  }

  if (totalVis <= width) {
    let body = '';
    for (const item of items) {
      if (item.isAnsi) body += item.code;
      else body += item.char;
    }
    if (str.includes('\x1b') && !body.endsWith('\x1b[0m')) body += '\x1b[0m';

    if (pad) {
      const padAmount = width - totalVis;
      const paddedContent = padAmount > 0 ? ' '.repeat(padAmount) : '';
      return align === 'right' ? paddedContent + body : body + paddedContent;
    }
    return body;
  }

  let targetWidth = width;
  let addDots = false;
  if (ellipsis && width > 3) {
    targetWidth = width - 3;
    addDots = true;
  }

  let currentWidth = 0;
  const keepItems = [];
  for (const item of items) {
    if (item.isAnsi) {
      keepItems.push(item);
    } else {
      if (currentWidth + item.width > targetWidth) {
        break;
      }
      keepItems.push(item);
      currentWidth += item.width;
    }
  }

  let body = '';
  for (const item of keepItems) {
    if (item.isAnsi) body += item.code;
    else body += item.char;
  }

  if (addDots) {
    body += '...';
    currentWidth += 3;
  }

  if (str.includes('\x1b') && !body.endsWith('\x1b[0m')) body += '\x1b[0m';

  if (pad) {
    const padAmount = width - currentWidth;
    const paddedContent = padAmount > 0 ? ' '.repeat(padAmount) : '';
    return align === 'right' ? paddedContent + body : body + paddedContent;
  }
  return body;
}

function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

module.exports = {
  visualWidth,
  visualLength,
  fitAnsi,
  stripAnsi,
};

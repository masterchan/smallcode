// SmallCode — Liquid AI tool-call parser
//
// Liquid AI's LFM2 family (e.g. `lfm2.5-8b-a1b-apex`) emits tool calls using
// a Python-keyword-arg syntax wrapped in `<|tool_call_start|>...<|tool_call_end|>`
// markers. LM Studio passes this through to `message.content` unchanged
// because it does not have a parser configured for Liquid's chat template.
//
// Example raw output observed from `lfm2.5-8b-a1b-apex` via LM Studio:
//
//   <|tool_call_start|>[write_file(path='hello.py', content='def greet(name):\n    return f"Hello, {name}!"')]<|tool_call_end|>
//
// And for multi-call turns:
//
//   <|tool_call_start|>[read_file(path='a.py'), bash(command='ls')]<|tool_call_end|>
//
// This module recognises that template and converts it into the
// OpenAI-style `tool_calls` shape that the rest of the agent loop expects.
//
// Recognised value types inside a kwarg:
//   • Python string literal — single- or double-quoted, with `\n`, `\t`,
//     `\r`, `\\`, `\'`, `\"`, `\xNN`, `\uNNNN` escape sequences
//   • Number (int or float, optional sign)
//   • Boolean (`True`/`False`) and `None`
//   • List `[...]` and dict `{...}` containing the above (best-effort)
//
// Conservative on failure: if any kwarg can't be parsed, we drop the
// whole call rather than guess. The fallback behaviour is the same as
// having no extractor — the bare text is shown to the user.

'use strict';

// Match `<|tool_call_start|>...<|tool_call_end|>` (multiline, non-greedy).
// Tolerant to either pipe placement (`<|...|>` is the documented form,
// but some quants emit `<tool_call_start>` without pipes — accept both).
const LIQUID_BLOCK_RE = /<\|?tool[_\-]?call[_\-]?start\|?>\s*([\s\S]*?)\s*<\|?tool[_\-]?call[_\-]?end\|?>/gi;

/**
 * @param {string} content   Text from `message.content`
 * @returns {{ calls: Array<{name:string, arguments:object}>, ranges: Array<[number,number]> }}
 *   `calls`  — extracted, in document order
 *   `ranges` — [start, end) spans in the original content that should be
 *              stripped after a successful extraction
 */
function parseLiquidToolCalls(content) {
  if (typeof content !== 'string' || !content.includes('tool_call')) {
    return { calls: [], ranges: [] };
  }

  const calls = [];
  const ranges = [];

  for (const match of content.matchAll(LIQUID_BLOCK_RE)) {
    const inner = match[1].trim();
    const parsed = _parseCallList(inner);
    if (parsed.length > 0) {
      for (const c of parsed) calls.push(c);
      ranges.push([match.index, match.index + match[0].length]);
    }
  }

  return { calls, ranges };
}

// ── Internal: parse `[func1(...), func2(...)]` or bare `func(...)` ──────────

function _parseCallList(text) {
  let s = text.trim();
  if (!s) return [];
  // Strip outer brackets if the whole thing is a list (the documented form).
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return [];

  const calls = [];
  let pos = 0;
  while (pos < s.length) {
    // Skip whitespace and optional separating commas between calls.
    while (pos < s.length && /[\s,]/.test(s[pos])) pos++;
    if (pos >= s.length) break;

    const callStart = pos;
    // Grab the function name — identifier chars only.
    const nameMatch = s.slice(pos).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!nameMatch) return [];
    const name = nameMatch[1];
    pos += nameMatch[0].length; // now positioned just inside `(`

    // Walk forward until the matching `)`, respecting nested brackets and
    // quoted strings.
    const argsEnd = _findMatchingParen(s, pos);
    if (argsEnd === -1) return [];
    const argsText = s.slice(pos, argsEnd);
    pos = argsEnd + 1;

    const args = _parseKwargs(argsText);
    if (args == null) return []; // bail out on malformed args
    calls.push({ name, arguments: args });

    // Sanity: prevent infinite loop if regex/pos somehow didn't advance.
    if (pos <= callStart) return calls;
  }
  return calls;
}

// Walk from `start` forward, return index of the matching `)`. -1 if not found.
function _findMatchingParen(s, start) {
  let depth = 1;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      i = _skipString(s, i);
      if (i === -1) return -1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0 && c === ')') return i;
    }
    i++;
  }
  return -1;
}

// Skip a Python-style string starting at `s[start]` (single or double quote).
// Returns index just past the closing quote, or -1 on EOF.
function _skipString(s, start) {
  const quote = s[start];
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === quote) return i + 1;
    i++;
  }
  return -1;
}

// Parse `key=value, key=value, ...` (Python kwargs). Returns plain object,
// or null on parse failure.
function _parseKwargs(text) {
  const out = {};
  let pos = 0;
  while (pos < text.length) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length) break;

    const keyMatch = text.slice(pos).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/);
    if (!keyMatch) return null;
    const key = keyMatch[1];
    pos += keyMatch[0].length;

    const v = _parseValue(text, pos);
    if (!v) return null;
    out[key] = v.value;
    pos = v.next;

    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos < text.length && text[pos] === ',') pos++;
  }
  return out;
}

// Parse a single Python literal starting at `text[pos]`. Returns
// `{ value, next }` or null on failure.
function _parseValue(text, pos) {
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  if (pos >= text.length) return null;
  const c = text[pos];

  if (c === "'" || c === '"') return _parseString(text, pos);
  if (c === '[') return _parseList(text, pos);
  if (c === '{') return _parseDict(text, pos);

  // Identifier-like: True/False/None or a bare keyword we don't accept.
  const idMatch = text.slice(pos).match(/^(True|False|None)\b/);
  if (idMatch) {
    const map = { True: true, False: false, None: null };
    return { value: map[idMatch[1]], next: pos + idMatch[0].length };
  }

  // Number — including scientific notation and signs.
  const numMatch = text.slice(pos).match(/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/);
  if (numMatch) {
    return { value: parseFloat(numMatch[0]), next: pos + numMatch[0].length };
  }

  return null;
}

function _parseString(text, pos) {
  const quote = text[pos];
  let i = pos + 1;
  let out = '';
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      const next = text[i + 1];
      switch (next) {
        case 'n': out += '\n'; i += 2; break;
        case 't': out += '\t'; i += 2; break;
        case 'r': out += '\r'; i += 2; break;
        case '\\': out += '\\'; i += 2; break;
        case "'": out += "'"; i += 2; break;
        case '"': out += '"'; i += 2; break;
        case '0': out += '\0'; i += 2; break;
        case 'a': out += '\x07'; i += 2; break;
        case 'b': out += '\b'; i += 2; break;
        case 'f': out += '\f'; i += 2; break;
        case 'v': out += '\v'; i += 2; break;
        case 'x': {
          const hex = text.slice(i + 2, i + 4);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          } else { out += next; i += 2; }
          break;
        }
        case 'u': {
          const hex = text.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else { out += next; i += 2; }
          break;
        }
        default:
          // Unknown escape — preserve both chars (Python's behaviour for
          // non-recognised escapes is to keep them literal).
          out += '\\' + (next || '');
          i += 2;
      }
      continue;
    }
    if (c === quote) {
      return { value: out, next: i + 1 };
    }
    out += c;
    i++;
  }
  return null; // unterminated
}

function _parseList(text, pos) {
  // Find matching ]
  let depth = 1;
  let i = pos + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === "'" || c === '"') { i = _skipString(text, i); if (i === -1) return null; continue; }
    if (c === '[' || c === '(' || c === '{') depth++;
    else if (c === ']' || c === ')' || c === '}') {
      depth--;
      if (depth === 0 && c === ']') break;
    }
    i++;
  }
  if (depth !== 0) return null;
  const inner = text.slice(pos + 1, i);
  const arr = [];
  let p = 0;
  while (p < inner.length) {
    while (p < inner.length && /\s/.test(inner[p])) p++;
    if (p >= inner.length) break;
    const v = _parseValue(inner, p);
    if (!v) return null;
    arr.push(v.value);
    p = v.next;
    while (p < inner.length && /\s/.test(inner[p])) p++;
    if (p < inner.length && inner[p] === ',') p++;
  }
  return { value: arr, next: i + 1 };
}

function _parseDict(text, pos) {
  // Find matching }
  let depth = 1;
  let i = pos + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === "'" || c === '"') { i = _skipString(text, i); if (i === -1) return null; continue; }
    if (c === '[' || c === '(' || c === '{') depth++;
    else if (c === ']' || c === ')' || c === '}') {
      depth--;
      if (depth === 0 && c === '}') break;
    }
    i++;
  }
  if (depth !== 0) return null;
  const inner = text.slice(pos + 1, i);
  const obj = {};
  let p = 0;
  while (p < inner.length) {
    while (p < inner.length && /\s/.test(inner[p])) p++;
    if (p >= inner.length) break;
    const k = _parseValue(inner, p);
    if (!k || (typeof k.value !== 'string' && typeof k.value !== 'number')) return null;
    p = k.next;
    while (p < inner.length && /\s/.test(inner[p])) p++;
    if (inner[p] !== ':') return null;
    p++;
    const v = _parseValue(inner, p);
    if (!v) return null;
    obj[String(k.value)] = v.value;
    p = v.next;
    while (p < inner.length && /\s/.test(inner[p])) p++;
    if (p < inner.length && inner[p] === ',') p++;
  }
  return { value: obj, next: i + 1 };
}

module.exports = { parseLiquidToolCalls };

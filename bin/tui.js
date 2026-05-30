// SmallCode — Rich TUI Module
// Markdown rendering, syntax highlighting, colored output

const chalk = require('chalk');

const { fitAnsi } = require('../src/tui/utils');

// ─── Markdown-lite renderer (no heavy deps) ──────────────────────────────────

function renderMarkdown(text) {
  if (!text) return '';
  let output = '';
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBuffer = [];

  const lines = text.split('\n');
  for (const line of lines) {
    // Code block start
    if (line.trim().startsWith('```') && !inCodeBlock) {
      inCodeBlock = true;
      codeBlockLang = line.trim().slice(3).trim();
      codeBuffer = [];
      continue;
    }
    // Code block end
    if (line.trim() === '```' && inCodeBlock) {
      inCodeBlock = false;
      output += renderCodeBlock(codeBuffer.join('\n'), codeBlockLang);
      continue;
    }
    // Inside code block
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      output += chalk.bold.cyan(line.slice(4)) + '\n';
    } else if (line.startsWith('## ')) {
      output += chalk.bold.white(line.slice(3)) + '\n';
    } else if (line.startsWith('# ')) {
      output += chalk.bold.whiteBright(line.slice(2)) + '\n';
    }
    // Bold
    else if (line.includes('**')) {
      output += line.replace(/\*\*(.+?)\*\*/g, (_, m) => chalk.bold(m)) + '\n';
    }
    // Inline code
    else if (line.includes('`')) {
      output += line.replace(/`([^`]+)`/g, (_, m) => chalk.yellow(m)) + '\n';
    }
    // List items
    else if (line.match(/^\s*[-*]\s/)) {
      output += chalk.gray('  •') + line.replace(/^\s*[-*]\s/, ' ') + '\n';
    }
    // Numbered lists
    else if (line.match(/^\s*\d+\.\s/)) {
      output += '  ' + line + '\n';
    }
    // Regular text
    else {
      output += line + '\n';
    }
  }

  // Unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    output += renderCodeBlock(codeBuffer.join('\n'), codeBlockLang);
  }

  return output;
}

function renderCodeBlock(code, lang) {
  const border = chalk.gray('  ┌' + '─'.repeat(60));
  const footer = chalk.gray('  └' + '─'.repeat(60));
  const langTag = lang ? chalk.gray(` ${lang}`) : '';
  const lines = code.split('\n').map(l => chalk.gray('  │ ') + highlightLine(l, lang)).join('\n');
  return `${border}${langTag}\n${lines}\n${footer}\n`;
}

function highlightLine(line, lang) {
  // Basic keyword highlighting
  const keywords = {
    js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'new', 'this', 'true', 'false', 'null', 'undefined'],
    ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'new', 'this', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'extends', 'implements'],
    python: ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as', 'True', 'False', 'None', 'with', 'try', 'except', 'raise', 'yield', 'async', 'await', 'self'],
    rust: ['fn', 'let', 'mut', 'struct', 'enum', 'impl', 'pub', 'use', 'mod', 'if', 'else', 'for', 'while', 'match', 'return', 'self', 'true', 'false', 'Some', 'None', 'Ok', 'Err'],
  };

  const langKey = (lang || '').replace('typescript', 'ts').replace('javascript', 'js');
  const kws = keywords[langKey] || keywords.ts; // default to TS

  let highlighted = line;
  // Highlight strings
  highlighted = highlighted.replace(/(["'`])(?:(?!\1).)*\1/g, m => chalk.green(m));
  // Highlight comments
  highlighted = highlighted.replace(/(\/\/.*)$/, m => chalk.gray(m));
  highlighted = highlighted.replace(/(#.*)$/, m => chalk.gray(m));
  // Highlight keywords (word boundary)
  for (const kw of kws) {
    const re = new RegExp(`\\b${kw}\\b`, 'g');
    highlighted = highlighted.replace(re, chalk.magenta(kw));
  }
  // Highlight numbers
  highlighted = highlighted.replace(/\b(\d+)\b/g, m => chalk.cyan(m));

  return highlighted;
}

// ─── Status line ─────────────────────────────────────────────────────────────

function renderStatus(config, historyLen) {
  const w = process.stdout.columns || 80;
  const brandText = 'smallcode';
  const modelText = config.model.name;
  const msgsText = `${historyLen} msgs`;
  const cwdText = process.cwd().split(/[/\\]/).slice(-2).join('/');

  if (w < 40) {
    const brand = chalk.bold.whiteBright(brandText);
    const model = chalk.cyan(modelText);
    const line = `  ${brand} │ ${model}`;
    return fitAnsi(line, w);
  } else if (w < 65) {
    const brand = chalk.bold.whiteBright(brandText);
    const model = chalk.cyan(modelText);
    const msgs = chalk.gray(msgsText);
    const line = `  ${brand} │ ${model} │ ${msgs}`;
    return fitAnsi(line, w);
  } else {
    const brand = chalk.bold.whiteBright(brandText);
    const model = chalk.cyan(modelText);
    const msgs = chalk.gray(msgsText);
    const cwd = chalk.gray(cwdText);
    const line = `  ${brand} │ ${model} │ ${msgs} │ ${cwd}`;
    return fitAnsi(line, w);
  }
}

// ─── Welcome banner ──────────────────────────────────────────────────────────

function renderWelcome(config, graphOk) {
  let version = 'unknown';
  try { version = require('../package.json').version; } catch {}
  const cwd = process.cwd();

  const w = process.stdout.columns || 80;
  if (w < 20) {
    return fitAnsi('  SmallCode TUI', w);
  }
  const cardWidth = Math.max(12, Math.min(w - 4, 76));
  const border = chalk.gray;
  const brand = chalk.bold.whiteBright;
  const accent = chalk.cyan;
  const muted = chalk.gray;

  const topBorder = border('╭' + '─'.repeat(Math.max(0, cardWidth - 2)) + '╮');
  const midBorder = border('├' + '─'.repeat(Math.max(0, cardWidth - 2)) + '┤');
  const botBorder = border('╰' + '─'.repeat(Math.max(0, cardWidth - 2)) + '╯');

  if (cardWidth < 45) {
    // Narrow layout: stacked rows
    const line1 = border('│') + fitAnsi(brand(` SmallCode v${version}`), cardWidth - 2) + border('│');
    const line2 = border('│') + fitAnsi(accent(` Model:    ${config.model.name}`), cardWidth - 2) + border('│');
    const line3 = border('│') + fitAnsi(muted(` Endpoint: ${config.model.baseUrl || 'http://localhost:11434'}`), cardWidth - 2, { ellipsis: true }) + border('│');
    const line4 = border('│') + fitAnsi(chalk.white(` Cwd:      ${cwd} (indexed: ${graphOk ? 'yes' : 'no'})`), cardWidth - 2, { ellipsis: true }) + border('│');
    const line5 = border('│') + fitAnsi(muted(` Hints:    /help /quit /model /memory`), cardWidth - 2) + border('│');

    return [
      '',
      topBorder,
      line1,
      line2,
      line3,
      line4,
      line5,
      botBorder,
      ''
    ].join('\n');
  } else {
    // Wide layout: side-by-side grid
    const titlePart = ` ⚡ SmallCode v${version} `;
    const titleLen = Math.max(0, Math.floor(cardWidth * 0.45));
    const modelLen = Math.max(0, cardWidth - 2 - titleLen - 1);

    const rawModelPart = ` Model: ${config.model.name} `;
    const col1 = fitAnsi(brand(titlePart), titleLen);
    const col2 = fitAnsi(accent(rawModelPart), modelLen, { align: 'right' });
    const line1 = border('│') + col1 + border('│') + col2 + border('│');

    const epPart = ` Endpoint: ${config.model.baseUrl || 'http://localhost:11434'}`;
    const line2 = border('│') + fitAnsi(chalk.gray(epPart), cardWidth - 2, { ellipsis: true }) + border('│');

    const dirPart = ` Cwd: ${cwd} (indexed: ${graphOk ? 'yes' : 'no'})`;
    const line3 = border('│') + fitAnsi(chalk.white(dirPart), cardWidth - 2, { ellipsis: true }) + border('│');

    const hintPart = ` Hints: /help list  │  /model switch  │  /quit exit  │  /mcp servers`;
    const line4 = border('│') + fitAnsi(muted(hintPart), cardWidth - 2) + border('│');

    const hintPart2 = `        /memory project memory  │  /skill manage skills  │  /diff git diff`;
    const line5 = border('│') + fitAnsi(muted(hintPart2), cardWidth - 2) + border('│');

    return [
      '',
      topBorder,
      line1,
      midBorder,
      line2,
      line3,
      midBorder,
      line4,
      line5,
      botBorder,
      ''
    ].join('\n');
  }
}

// ─── Tool indicators ─────────────────────────────────────────────────────────

function toolStart(name) {
  return `  ${chalk.cyan('⚙')} ${fitAnsi(chalk.cyan(name), 14)} │ `;
}

function toolSuccess(msg, ms) {
  return `${chalk.green('✓')} ${chalk.white(msg)} ${chalk.gray('(' + ms + 'ms)')}`;
}

function toolError(msg) {
  return `${chalk.red('✗')} ${chalk.red(msg)}`;
}

function toolEdited(filePath, line, ms) {
  return `${chalk.yellow('✓')} Edited ${chalk.cyan(filePath)}:${chalk.yellow(line)} ${chalk.gray('(' + ms + 'ms)')}`;
}

function toolCreated(filePath, lines, ms) {
  return `${chalk.green('✓')} Created ${chalk.bold.cyan(filePath)} (${lines} lines) ${chalk.gray('(' + ms + 'ms)')}`;
}

function toolUpdated(filePath, lines, ms) {
  return `${chalk.green('✓')} Updated ${chalk.bold.cyan(filePath)} (${lines} lines) ${chalk.gray('(' + ms + 'ms)')}`;
}

function toolBash(cmd, ms) {
  return `${chalk.gray('$')} ${chalk.white(cmd)} ${chalk.gray('(' + ms + 'ms)')}`;
}

function improvementLoop(errors, attempt, max) {
  const border = chalk.gray;
  const prefix = chalk.yellow('  LOOP ⟳') + border('│ ');
  const contPrefix = '        ' + border('│ ');

  const header = chalk.yellow(`${errors.length} error(s) — fix attempt ${attempt}/${max}`);
  const errLines = errors.slice(0, 3).map(e => `${contPrefix}${chalk.red(e)}`).join('\n');
  return `${prefix}${header}\n${errLines}`;
}

function improvementFixed(filePath, attempts) {
  const border = chalk.gray;
  const prefix = chalk.green('  LOOP ✓') + border('│ ');
  return `${prefix}${chalk.cyan(filePath)} — ${chalk.green(`fixed after ${attempts} attempt(s)`)}`;
}

function improvementGaveUp(filePath, max) {
  const border = chalk.gray;
  const prefix = chalk.red('  LOOP ⚠') + border('│ ');
  return `${prefix}${chalk.red(filePath)}: giving up after ${max} fix attempts`;
}

function turnSummary(calls) {
  const border = chalk.gray;
  const prefix = chalk.gray('  INFO  ') + border('│ ');
  return `${prefix}${chalk.gray(`─── ${calls} tool calls this turn ───`)}`;
}

function compacted(removed) {
  const border = chalk.gray;
  const prefix = chalk.gray('  INFO  ') + border('│ ');
  return `${prefix}${chalk.gray(`[compacted ${removed} old messages]`)}`;
}

// ─── Diff display ────────────────────────────────────────────────────────────

function renderDiff(filePath, oldStr, newStr, lineNum) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  if (oldLines.length > 8 && newLines.length > 8) return ''; // Too large

  const border = chalk.gray;
  const prefix = chalk.cyan('  DIFF  ') + border('│ ');
  const contPrefix = '        ' + border('│ ');

  let output = `${prefix}${chalk.cyan(filePath)}:${chalk.yellow(lineNum)}\n`;
  for (const line of oldLines.slice(0, 5)) {
    output += `${contPrefix}${chalk.red('-')} ${chalk.red(line)}\n`;
  }
  if (oldLines.length > 5) {
    output += `${contPrefix}${chalk.gray(`... (${oldLines.length - 5} more)`)}\n`;
  }
  for (const line of newLines.slice(0, 5)) {
    output += `${contPrefix}${chalk.green('+')} ${chalk.green(line)}\n`;
  }
  if (newLines.length > 5) {
    output += `${contPrefix}${chalk.gray(`... (${newLines.length - 5} more)`)}\n`;
  }
  return output.trimEnd();
}

module.exports = {
  renderMarkdown,
  renderCodeBlock,
  renderStatus,
  renderWelcome,
  renderDiff,
  toolStart,
  toolSuccess,
  toolError,
  toolEdited,
  toolCreated,
  toolUpdated,
  toolBash,
  improvementLoop,
  improvementFixed,
  improvementGaveUp,
  turnSummary,
  compacted,
  chalk,
};

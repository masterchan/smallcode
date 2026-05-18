// SmallCode — @file Reference Resolution
// Parse @path mentions in user input and inject file content
// Adapted from OpenCode's reference system (simplified)
//
// Syntax:
//   @src/main.ts          — inject file content
//   @package.json         — inject file content
//   @src/                 — list directory contents
//   @~/config.json        — resolve from home dir

const fs = require('fs');
const path = require('path');
const os = require('os');

// Matches @path but not inside backticks or after word chars
const FILE_REGEX = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g;

/**
 * Parse @file references from user input.
 * Returns the text with references resolved + injected file contents.
 */
function resolveReferences(input, cwd) {
  const matches = [...input.matchAll(FILE_REGEX)];
  if (matches.length === 0) return { text: input, files: [] };

  const files = [];
  const seen = new Set();

  for (const match of matches) {
    const rawPath = match[1];
    if (!rawPath || rawPath.length < 2) continue;
    if (seen.has(rawPath)) continue;
    seen.add(rawPath);

    // Resolve the path
    let resolvedPath;
    if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
      resolvedPath = path.resolve(os.homedir(), rawPath.slice(2));
    } else {
      resolvedPath = path.resolve(cwd, rawPath);
    }

    // Check if it exists
    if (!fs.existsSync(resolvedPath)) continue;

    const stat = fs.statSync(resolvedPath);

    if (stat.isFile()) {
      // Read file content (capped at 10k lines)
      try {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const lines = content.split('\n');
        const truncated = lines.length > 500
          ? lines.slice(0, 500).join('\n') + `\n... (${lines.length - 500} more lines)`
          : content;

        files.push({
          path: rawPath,
          resolvedPath,
          type: 'file',
          content: truncated,
          lines: lines.length,
        });
      } catch {}
    } else if (stat.isDirectory()) {
      // List directory contents
      try {
        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .slice(0, 50)
          .map(e => e.isDirectory() ? `${e.name}/` : e.name);

        files.push({
          path: rawPath,
          resolvedPath,
          type: 'directory',
          content: entries.join('\n'),
          lines: entries.length,
        });
      } catch {}
    }
  }

  return { text: input, files };
}

/**
 * Format resolved files for injection into the conversation.
 * Returns a string to append to the user message.
 */
function formatReferencesForPrompt(files) {
  if (files.length === 0) return '';

  let output = '\n\n--- Referenced files ---\n';
  for (const file of files) {
    if (file.type === 'file') {
      output += `\n📄 ${file.path} (${file.lines} lines):\n\`\`\`\n${file.content}\n\`\`\`\n`;
    } else {
      output += `\n📁 ${file.path}/:\n${file.content}\n`;
    }
  }
  return output;
}

module.exports = { resolveReferences, formatReferencesForPrompt, FILE_REGEX };

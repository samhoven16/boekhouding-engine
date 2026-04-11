#!/usr/bin/env node
/**
 * scripts/symbol-index.js
 *
 * Generates .claude/symbol-index.json — a machine-readable map of every
 * function and top-level const/var declaration in src/*.gs, with file and line.
 *
 * Usage:
 *   npm run index
 *   node scripts/symbol-index.js
 *
 * Output: .claude/symbol-index.json
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC     = path.resolve(__dirname, '../src');
const OUT     = path.resolve(__dirname, '../.claude/symbol-index.json');
const CLAUDE  = path.dirname(OUT);

// Patterns to extract (applied per line)
const PATTERNS = [
  // function declarations: `function foo(` or `async function foo(`
  { re: /^(?:async\s+)?function\s+(\w+)\s*\(/, kind: 'function' },
  // const/var/let at top level (not inside function bodies — heuristic: no leading whitespace beyond 1 space)
  { re: /^(?:const|var|let)\s+(\w+)\s*=/, kind: 'const' },
];

const index = {};  // { symbolName: [{ file, line, kind }] }

const files = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.gs') || f.endsWith('.js'))
  .sort();

for (const file of files) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, kind } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const name = m[1];
        if (!index[name]) index[name] = [];
        index[name].push({ file, line: i + 1, kind });
        break;
      }
    }
  }
}

if (!fs.existsSync(CLAUDE)) fs.mkdirSync(CLAUDE, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(index, null, 2));

const count = Object.keys(index).length;
console.log(`Symbol index: ${count} symbols from ${files.length} files → ${OUT}`);

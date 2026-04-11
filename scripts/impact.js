#!/usr/bin/env node
/**
 * scripts/impact.js
 *
 * Impact analysis: given one or more symbol names, find:
 *   1. Where each is DEFINED (file + line)
 *   2. All files that CALL/REFERENCE each symbol
 *
 * Usage:
 *   node scripts/impact.js <symbolName> [symbolName2 ...]
 *   node scripts/impact.js --def <symbolName>   (definition only)
 *   node scripts/impact.js berekenBtw parseBtwTarief_
 *
 * Examples:
 *   node scripts/impact.js maakJournaalpost_
 *   node scripts/impact.js getSpreadsheet_
 *   node scripts/impact.js berekenBtwAangifte_ getBtwPerMaand_
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC        = path.resolve(__dirname, '../src');
const INDEX_PATH = path.resolve(__dirname, '../.claude/symbol-index.json');

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/impact.js [--def] <symbolName> [symbolName2 ...]');
  process.exit(1);
}

const defOnly = args[0] === '--def';
const symbols = defOnly ? args.slice(1) : args;

if (symbols.length === 0) {
  console.error('Provide at least one symbol name.');
  process.exit(1);
}

// ── Load index ────────────────────────────────────────────────────────────────
let index = {};
if (fs.existsSync(INDEX_PATH)) {
  index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
} else {
  // Build on the fly if not generated yet
  console.warn('Symbol index not found. Run `npm run index` first. Falling back to live grep...\n');
}

// ── Load source files ─────────────────────────────────────────────────────────
const sourceFiles = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.gs') || f.endsWith('.js'))
  .sort()
  .map(f => ({ name: f, src: fs.readFileSync(path.join(SRC, f), 'utf8') }));

// ── Process each symbol ───────────────────────────────────────────────────────
for (const sym of symbols) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SYMBOL: ${sym}`);
  console.log(`${'═'.repeat(60)}`);

  // 1. Definition(s)
  const defs = index[sym] || [];
  if (defs.length > 0) {
    console.log('\n  DEFINED IN:');
    for (const d of defs) {
      console.log(`    src/${d.file}:${d.line}  [${d.kind}]`);
    }
  } else {
    // Fallback: grep for definition
    let found = false;
    for (const { name, src } of sourceFiles) {
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`(?:function|const|var|let)\\s+${sym}\\b`).test(lines[i])) {
          if (!found) { console.log('\n  DEFINED IN:'); found = true; }
          console.log(`    src/${name}:${i + 1}`);
        }
      }
    }
    if (!found) console.log('\n  DEFINED IN: (not found in src/)');
  }

  if (defOnly) continue;

  // 2. Callers / references
  const callerPattern = new RegExp(`\\b${sym}\\s*[\\(\\[]`, 'g');
  const refPattern    = new RegExp(`\\b${sym}\\b`);
  const callers = [];

  for (const { name, src } of sourceFiles) {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (callerPattern.test(line) || (line.includes(sym) && !line.match(/^(?:function|const|var|let)\s/))) {
        callerPattern.lastIndex = 0; // reset regex state
        // Skip the definition line itself
        const isDef = /^(?:async\s+)?function\s+/.test(line.trim()) && line.includes(`function ${sym}`);
        if (!isDef) {
          callers.push({ file: name, line: i + 1, text: line.trim().substring(0, 90) });
        }
      }
    }
  }

  if (callers.length > 0) {
    // Group by file
    const byFile = {};
    for (const c of callers) {
      if (!byFile[c.file]) byFile[c.file] = [];
      byFile[c.file].push(c);
    }

    console.log(`\n  CALLED/REFERENCED IN (${Object.keys(byFile).length} files, ${callers.length} occurrences):`);
    for (const [file, hits] of Object.entries(byFile)) {
      console.log(`\n    src/${file}:`);
      for (const h of hits) {
        console.log(`      :${h.line}  ${h.text}`);
      }
    }
  } else {
    console.log('\n  CALLED/REFERENCED IN: (none found — possibly dead code or entry point)');
  }

  // 3. Change risk assessment
  const fileCount = new Set(callers.map(c => c.file)).size;
  const risk = fileCount >= 8 ? 'CRITICAL' : fileCount >= 4 ? 'HIGH' : fileCount >= 2 ? 'MEDIUM' : 'LOW';
  console.log(`\n  CHANGE RISK: ${risk} (referenced in ${fileCount} file${fileCount !== 1 ? 's' : ''})`);
}

console.log('');

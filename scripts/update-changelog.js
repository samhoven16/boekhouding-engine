#!/usr/bin/env node
/**
 * scripts/update-changelog.js
 *
 * Cycle 88: schrijft website/changelog.json met de 8 meest recente
 * "Cycle N: ..." merge-commits op de huidige branch. Gebruikt voor de
 * "Recente updates"-sectie op de homepage.
 *
 * Output:
 *   { "entries": [
 *       { "date": "2026-06-02", "cycle": 85, "titel": "footer-leefsignaal..." },
 *       ...
 *     ]
 *   }
 *
 * Faalt nooit hard: bij git-fout schrijven we een lege entries-array zodat
 * de homepage gewoon "(geen recente updates)" toont in plaats van te
 * crashen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function git(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch (_) { return ''; }
}

const MAX_ENTRIES = 8;
const raw = git('git log --pretty=format:%cI%x09%s -200');
const entries = [];

for (const line of raw.split('\n')) {
  if (entries.length >= MAX_ENTRIES) break;
  const [iso, ...rest] = line.split('\t');
  const subject = rest.join('\t');
  // Match "Cycle N: ..."  (subject mag #PR-suffix bevatten — die strippen we)
  const m = subject.match(/^Cycle\s+(\d+)\s*:\s*(.+?)(?:\s+\(#\d+\))?$/i);
  if (!m) continue;
  const date = (iso || '').slice(0, 10);
  if (!date) continue;
  entries.push({
    date,
    cycle: parseInt(m[1], 10),
    titel: m[2].trim(),
  });
}

const target = path.resolve(__dirname, '..', 'website', 'changelog.json');
fs.writeFileSync(target, JSON.stringify({ entries }, null, 2) + '\n');
console.log('changelog.json bijgewerkt:', entries.length, 'entries');

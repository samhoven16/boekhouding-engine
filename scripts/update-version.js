#!/usr/bin/env node
/**
 * scripts/update-version.js
 *
 * Cycle 85: schrijft website/version.json met de laatste commit-datum en
 * korte hash. Aangeroepen door de husky pre-commit hook zodat de footer-
 * timestamp altijd matched met de werkelijke deploy.
 *
 * Output:
 *   { "lastUpdate": "2026-06-02", "commit": "abc1234" }
 *
 * Faalt nooit hard: bij git-fout schrijven we een geldige JSON met
 * "unknown"-waardes zodat de site blijft renderen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function git(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch (_) { return ''; }
}

// Laatste commit-datum als ISO-yyyy-MM-dd, hash als 7-char short SHA
const isoDate = git('git log -1 --format=%cI HEAD') || new Date().toISOString();
const date = isoDate.slice(0, 10);
const commit = git('git rev-parse --short=7 HEAD') || 'unknown';

const out = { lastUpdate: date, commit };
const target = path.resolve(__dirname, '..', 'website', 'version.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log('version.json bijgewerkt:', out);

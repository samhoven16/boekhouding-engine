#!/usr/bin/env node
/**
 * scripts/bundle-create.js
 *
 * Tier 2 #7 — release-bottleneck oplossen.
 *
 * Sam draait dit script voor elke release. Het leest src/*.gs, bouwt het
 * UPDATE_BUNDLE-formaat dat updateBundleEndpoint_ verwacht, en print
 * copy-pasteable JSON die in de licence-server ScriptProperty
 * `UPDATE_BUNDLE_<versie>` moet komen. Geen file-writes — voorkomt
 * "ik dacht dat ik 'm al had gedeployed"-foutmodus (zelfde principe als
 * scripts/release-instructions.js).
 *
 * Gebruik:
 *   node scripts/bundle-create.js 2.8.0
 *   node scripts/bundle-create.js 2.8.0 > bundle-2.8.0.json   # optioneel save
 *
 * Output naar stdout: 1 regel "→ kopieer dit naar ScriptProperty
 * UPDATE_BUNDLE_2.8.0", dan het JSON-blok. Logs (stderr): aantal files,
 * totale grootte, hash-prefix voor sanity.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.resolve(__dirname, '..', 'src');

function log(msg) { process.stderr.write(msg + '\n'); }
function fout(msg) { process.stderr.write('FOUT: ' + msg + '\n'); process.exit(1); }

const versie = process.argv[2];
if (!versie) fout('Versie ontbreekt. Gebruik: node scripts/bundle-create.js 2.8.0');
if (!/^[\d]+\.[\d]+\.[\d]+$/.test(versie)) {
  fout('Versie moet X.Y.Z formaat hebben (bijv. 2.8.0). Kreeg: ' + versie);
}

if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) {
  fout('src/ directory niet gevonden op ' + SRC);
}

// Lees alle .gs files in src/. Niet recursief — flat structure is conventie
// (Apps Script ondersteunt geen subdirs).
const entries = fs.readdirSync(SRC)
  .filter((n) => n.endsWith('.gs'))
  .sort();  // deterministische volgorde → reproduceerbare hash

if (entries.length === 0) fout('Geen .gs files gevonden in ' + SRC);

const files = entries.map((naam) => {
  const fp = path.join(SRC, naam);
  const source = fs.readFileSync(fp, 'utf8');
  // Type 'server_js' = wat Apps Script in z'n manifest verwacht voor .gs files.
  // HTML files zouden 'html' krijgen — staan niet in src/ voor deze codebase.
  return { naam: naam.replace(/\.gs$/, ''), source, type: 'server_js' };
});

// Canonical JSON voor hash — zelfde regel als updateBundleEndpoint_ + client
// (`_berekenBundleHash_`): JSON.stringify(files-array) zonder spaties.
const canonical = JSON.stringify(files);
const hash = crypto.createHash('sha256').update(canonical).digest('hex');

const totaalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.source, 'utf8'), 0);

const bundle = {
  files: files,
  generatedAt: new Date().toISOString(),
  // versie komt niet in bundle — die zit in de ScriptProperty-naam
  // (UPDATE_BUNDLE_<versie>) zodat 1 server meerdere versies kan serveren.
};

log('');
log('═══ BUNDLE GENERATED ═══');
log('Versie:              ' + versie);
log('Files:               ' + files.length);
log('Totale source:       ' + totaalBytes.toLocaleString() + ' bytes (' +
  (totaalBytes / 1024).toFixed(1) + ' KB)');
log('SHA-256 (canonical): ' + hash);
log('Generated at:        ' + bundle.generatedAt);
log('');
log('───────────────────────────────────────────────');
log('NEXT STEPS (handmatig, dwingt zelf-controle):');
log('  1. Login licence-server Apps Script project');
log('  2. Project Settings → Script Properties → Add property');
log('  3. Property name:  UPDATE_BUNDLE_' + versie);
log('  4. Property value: paste het JSON-blok hieronder');
log('  5. Save');
log('  6. Test: client menu "📦 Download laatste versie" → vul ' + versie);
log('───────────────────────────────────────────────');
log('');

// Output naar stdout zodat `> bundle-2.8.0.json` werkt voor save.
// Pretty-print voor leesbaarheid in ScriptProperty editor, hash blijft
// gelijk omdat de SERVER opnieuw stringifyt (zonder spaties) bij verify.
process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');

// Sanity: ScriptProperties heeft 9KB-per-key cap. Onze JSON kan groter zijn.
// Waarschuwing als > 8KB (laat 1KB marge voor JSON-overhead bij parse).
const jsonBytes = Buffer.byteLength(JSON.stringify(bundle), 'utf8');
if (jsonBytes > 8 * 1024) {
  log('');
  log('⚠ WAARSCHUWING: bundle is ' + (jsonBytes / 1024).toFixed(1) +
    ' KB; ScriptProperties limiet is 9 KB per key.');
  log('  Optie: chunk bundle in UPDATE_BUNDLE_' + versie + '_1, _2, ...');
  log('  Voor nu: deploy alsnog, test of het werkt.');
}

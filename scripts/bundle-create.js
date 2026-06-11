#!/usr/bin/env node
/**
 * scripts/bundle-create.js
 *
 * Tier 2 #7 — release-bottleneck oplossen.
 *
 * Sam draait dit script voor elke release. Het leest src/*.gs, bouwt het
 * bundle-formaat, en schrijft het naar EEN bestand op schijf
 * (bundle-X.Y.Z.json). Sam upload dat bestand naar Drive, kopieert het
 * Drive-file-id en zet dat in ScriptProperty UPDATE_BUNDLE_<versie>.
 *
 * Waarom geen ScriptProperty-storage zoals tier 2.1 dacht:
 * de codebase is 1.7MB; ScriptProperties heeft 9KB per key + 500KB totaal.
 * Veel individuele files zijn zelf al > 9KB. Drive-file omzeilt beide limits.
 *
 * Server-kant (updateBundleEndpoint_) leest de Drive-file via fileId,
 * parseet de JSON en levert dezelfde API als voorheen aan de client.
 * Klant-kant (haalUpdateBundleOp, voerAutomatischeUpdateUit_) ongewijzigd.
 *
 * Hash = SHA-256 van canonical(files-array). Server berekent 'm opnieuw
 * en vergelijkt met manifest.hash om tampering met de Drive-file te
 * detecteren — zo komt de hash twee keer langs (server + client).
 *
 * Gebruik:
 *   node scripts/bundle-create.js 2.8.0
 *   ls bundle-2.8.0.json   # bestand staat in repo-root
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, 'src');

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

const entries = fs.readdirSync(SRC)
  .filter((n) => n.endsWith('.gs'))
  .sort();
if (entries.length === 0) fout('Geen .gs files gevonden in ' + SRC);

const files = entries.map((naam) => {
  const fp = path.join(SRC, naam);
  const source = fs.readFileSync(fp, 'utf8');
  return { naam: naam.replace(/\.gs$/, ''), source, type: 'server_js' };
});

const canonical = JSON.stringify(files);
const hash = crypto.createHash('sha256').update(canonical).digest('hex');
const totaalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.source, 'utf8'), 0);
const generatedAt = new Date().toISOString();

const bundle = {
  _schema: 'boekhoudbaar/update-bundle/v3-drive',
  versie: versie,
  files: files,
  hash: hash,
  generatedAt: generatedAt,
};

const bundleBestand = path.join(ROOT, 'bundle-' + versie + '.json');
fs.writeFileSync(bundleBestand, JSON.stringify(bundle, null, 2) + '\n');

log('');
log('═══ BUNDLE GENERATED ═══');
log('Versie:              ' + versie);
log('Files:               ' + files.length);
log('Totale source:       ' + totaalBytes.toLocaleString() + ' bytes (' +
  (totaalBytes / 1024).toFixed(1) + ' KB)');
log('SHA-256 (canonical): ' + hash);
log('Generated at:        ' + generatedAt);
log('');
log('Geschreven naar:     ' + bundleBestand);
log('Bestandsgrootte:     ' + Math.round(fs.statSync(bundleBestand).size / 1024) + ' KB');
log('');
log('───────────────────────────────────────────────');
log('NEXT STEPS:');
log('───────────────────────────────────────────────');
log('  1. Upload ' + path.basename(bundleBestand) + ' naar Google Drive');
log('     (folder maakt niet uit — server gebruikt fileId).');
log('  2. Rechtermuisknop → "Share" → "Anyone with the link can VIEW".');
log('     (Sam-only is OK; de licence-server kan zijn eigen Drive ook lezen.)');
log('  3. Kopieer het file-id uit de URL:');
log('     https://drive.google.com/file/d/FILE_ID_HIER/view');
log('  4. Open licence-server Apps Script project → Project Settings →');
log('     Script Properties → Add property:');
log('       Naam:    UPDATE_BUNDLE_' + versie);
log('       Waarde:  het file-id uit stap 3');
log('  5. (Optioneel maar aangeraden) Zet ook deze property:');
log('       Naam:    VERSIE_KRITIEK_VOOR');
log('       Waarde:  ["2.7.0"]  ← versies die deze upgrade moeten zien');
log('  6. Test: klant menu "📦 Download laatste versie" → vul ' + versie);
log('───────────────────────────────────────────────');
log('');

process.stdout.write(bundleBestand + '\n');

/**
 * tests/unit/f-acc-162-csv-corrupt-consistent.test.js
 *
 * RATEL (F-ACC-162, accountant): het accountantspakket leverde
 * 2_Journaalposten_*.csv (rauwe sheet-dump) NAAST 7_Auditfile_*.xaf. De XAF
 * (_bouwXaf40Xml_) sluit CORRUPT-rijen uit (half-geboekt, saldo atomair
 * teruggedraaid); de CSV dumpte ze ongefilterd → een accountant die het
 * journaal in de CSV optelt kreeg een ANDER totaal dan de geleverde auditfile/
 * saldibalans. Twee bestanden in één pakket spreken elkaar tegen.
 *
 * Fix: exporteerAlsCsv_ kreeg een optionele rij-filter; de JP-export sluit nu
 * exact dezelfde CORRUPT-rijen uit als de XAF (Concept/Gestorneerd blijven —
 * die zitten óók in het grootboeksaldo en de XAF).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src/ExportAccountant.gs');
const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'ExportAccountant.gs']);

const NAAM = 'Journaalposten';
const STATUS = 16; // KOL.JP.status

// JP-rij met 17 kolommen; [0]=id [4]=debet [6]=credit [8]=bedrag [16]=status
function jp(id, status) {
  const r = new Array(17).fill('');
  r[0] = id; r[4] = '1300'; r[6] = '8000'; r[8] = 100; r[16] = status;
  return r;
}
function maakSs(rows) {
  const header = new Array(17).fill('').map((_, i) => 'K' + i);
  const grid = [header].concat(rows);
  return { getSheetByName: (n) => (n === NAAM ? { getDataRange: () => ({ getValues: () => grid }) } : null) };
}
const corruptFilter = (rij) =>
  (rij.length > STATUS ? String(rij[STATUS] || '').trim().toUpperCase() : '') !== 'CORRUPT';

describe('F-ACC-162 — JP-CSV sluit CORRUPT uit, consistent met de XAF', () => {
  test('RATEL: CORRUPT-rij valt uit de CSV, committed/Concept/Gestorneerd blijven', () => {
    const ss = maakSs([
      jp('J1', ''),            // committed
      jp('J2', 'Concept'),     // blijft (zit in grootboeksaldo + XAF)
      jp('J3', 'Gestorneerd'), // blijft
      jp('J4', 'CORRUPT'),     // MOET eruit
    ]);
    const csv = ctx.exporteerAlsCsv_(ss, NAAM, corruptFilter);
    expect(csv).toMatch(/J1/);
    expect(csv).toMatch(/J2/);
    expect(csv).toMatch(/J3/);
    expect(csv).not.toMatch(/J4/);            // CORRUPT weg
  });

  test('header blijft altijd staan, ook als alle databody wegvalt', () => {
    const ss = maakSs([jp('JX', 'CORRUPT')]);
    const csv = ctx.exporteerAlsCsv_(ss, NAAM, corruptFilter);
    const regels = csv.split('\n');
    expect(regels[0]).toMatch(/^K0,/);        // header-rij
    expect(csv).not.toMatch(/JX/);
  });

  test('zonder filter (andere sheets) blijft het generieke gedrag: alle rijen', () => {
    const ss = maakSs([jp('J1', ''), jp('J4', 'CORRUPT')]);
    const csv = ctx.exporteerAlsCsv_(ss, NAAM);   // geen filter
    expect(csv).toMatch(/J1/);
    expect(csv).toMatch(/J4/);                 // ongefilterd → CORRUPT blijft
  });

  test('case-insensitief: "corrupt" (kleine letters) wordt óók uitgesloten', () => {
    const ss = maakSs([jp('J1', ''), jp('Jc', 'corrupt')]);
    const csv = ctx.exporteerAlsCsv_(ss, NAAM, corruptFilter);
    expect(csv).not.toMatch(/Jc/);
  });
});

describe('F-ACC-162 — wiring: de JP-export in het pakket geeft de CORRUPT-filter mee', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  test('exporteerAccountantsPakket roept exporteerAlsCsv_ voor JOURNAALPOSTEN met een rij-filter aan', () => {
    const idx = src.indexOf('2. Journaalposten CSV');
    const blok = src.slice(idx, idx + 1000);
    // filter-argument aanwezig + sluit CORRUPT uit via KOL.JP.status
    expect(blok).toMatch(/exporteerAlsCsv_\(\s*ss,\s*SHEETS\.JOURNAALPOSTEN,\s*function/);
    expect(blok).toMatch(/KOL\.JP\.status/);
    expect(blok).toMatch(/!==\s*'CORRUPT'/);
  });
});

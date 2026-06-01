/**
 * tests/unit/cycle51-sheet-access-helper.test.js
 *
 * Cycle 51 — invariants.md MEDIUM-severity: "Sheet access in 20+ functions
 * directly call .getSheetByName().getDataRange() without null guard". Klant
 * die per ongeluk een tabblad verwijderde kreeg cryptische TypeError
 * "Cannot read properties of null".
 *
 * Fix: nieuwe leesSheetVeilig_ helper + 14 conversies (Boekingen,
 * Belastingadvies, GezondheidCheck, Inkoopfacturen, Rapportages).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const utilsSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Utils.gs'), 'utf8');
const FILES = ['Boekingen.gs', 'Belastingadvies.gs', 'GezondheidCheck.gs', 'Inkoopfacturen.gs', 'Rapportages.gs']
  .map((f) => fs.readFileSync(path.resolve(__dirname, '../../src', f), 'utf8'));

describe('CYCLE 51: leesSheetVeilig_ helper + 14 conversies', () => {
  test('Helper is gedefinieerd in Utils.gs', () => {
    expect(utilsSrc).toMatch(/function leesSheetVeilig_\(ss, naam\)/);
  });

  test('Helper retourneert [] bij missing sheet + audit-log', () => {
    expect(utilsSrc).toMatch(/getSheetByName\(naam\)[\s\S]{0,200}return \[\]/);
    expect(utilsSrc).toMatch(/noodLog_\(['"]SHEET_ONTBREEKT['"]/);
  });

  test('Helper try/catch om getDataRange() (defense)', () => {
    expect(utilsSrc).toMatch(/try \{[\s\S]{0,100}getDataRange\(\)[\s\S]{0,200}catch[\s\S]{0,100}noodLog_\(['"]SHEET_READ_FOUT/);
  });

  test('Geen residuele `ss.getSheetByName(SHEETS.X).getDataRange()` patterns in repo', () => {
    FILES.forEach((src) => {
      expect(src).not.toMatch(/ss\.getSheetByName\(SHEETS\.[A-Z_]+\)\.getDataRange\(\)/);
    });
  });

  test('Conversies vermelden CYCLE-51 marker (audit-trail)', () => {
    const count = FILES.reduce((acc, src) => acc + (src.match(/CYCLE-51/g) || []).length, 0);
    expect(count).toBeGreaterThanOrEqual(10);   // ~14 conversies, sommige delen 1 comment
  });
});

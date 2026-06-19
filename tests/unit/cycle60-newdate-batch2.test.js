/**
 * tests/unit/cycle60-newdate-batch2.test.js
 *
 * Cycle 60 — vervolg op cycle 59. 2 resterende bare `new Date(cell)`
 * sites op inkoopfactuur-datum:
 *
 *   - BankImport.gs openInkoop-lijst (bank-match-suggesties datum)
 *   - Boekingen.gs crediteuren-aging (factuurdatum → vervaldatum +30d)
 *
 * String-dated inkoopfacturen (CSV-import) gaven Invalid Date →
 * onjuiste aging in crediteuren-overzicht / verkeerde match-suggesties.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const biSrc  = fs.readFileSync(path.resolve(__dirname, '../../src/BankImport.gs'), 'utf8');
const boSrc  = fs.readFileSync(path.resolve(__dirname, '../../src/Boekingen.gs'), 'utf8');

describe('CYCLE 60: bare new Date(ifData) → parseDatum_ (batch 2)', () => {
  // Kolom-referentie is migratie-agnostisch: literal `[3]` óf de KOL-accessor
  // `[KOL.IF.factuurdatumLeverancier]` (klasse-1-migratie). De intentie — datum
  // gelezen via instanceof-Date-guard + parseDatum_ — blijft identiek.
  const COL = 'ifData\\[i\\]\\[(?:3|KOL\\.IF\\.factuurdatumLeverancier)\\]';

  test('BankImport openInkoop datum gebruikt parseDatum_', () => {
    expect(biSrc).toMatch(new RegExp(COL + ' instanceof Date.*parseDatum_\\(' + COL + '\\)'));
  });

  test('Boekingen crediteuren-aging factuurdatum gebruikt parseDatum_', () => {
    expect(boSrc).toMatch(new RegExp(COL + ' instanceof Date.*parseDatum_\\(' + COL + '\\)', 's'));
  });

  test('Boekingen heeft isNaN-guard op factuurdatum', () => {
    expect(boSrc).toMatch(/factuurdatumGeldig\s*=\s*factuurdatum\s*&&\s*!isNaN\(factuurdatum\.getTime\(\)\)/);
  });

  test('Geen residuele bare `new Date(ifData[...factuurdatum])` (comment-strip)', () => {
    const strip = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const BARE = new RegExp('\\?\\s*new Date\\(' + COL + '\\)\\s*:\\s*null');
    expect(strip(biSrc)).not.toMatch(BARE);
    expect(strip(boSrc)).not.toMatch(BARE);
  });
});

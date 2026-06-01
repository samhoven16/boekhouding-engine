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
  test('BankImport openInkoop datum gebruikt parseDatum_', () => {
    expect(biSrc).toMatch(/ifData\[i\]\[3\] instanceof Date.*parseDatum_\(ifData\[i\]\[3\]\)/);
  });

  test('Boekingen crediteuren-aging factuurdatum gebruikt parseDatum_', () => {
    expect(boSrc).toMatch(/ifData\[i\]\[3\] instanceof Date.*parseDatum_\(ifData\[i\]\[3\]\)/s);
  });

  test('Boekingen heeft isNaN-guard op factuurdatum', () => {
    expect(boSrc).toMatch(/factuurdatumGeldig\s*=\s*factuurdatum\s*&&\s*!isNaN\(factuurdatum\.getTime\(\)\)/);
  });

  test('Geen residuele bare `new Date(ifData[i][3])` (comment-strip)', () => {
    const strip = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(strip(biSrc)).not.toMatch(/\?\s*new Date\(ifData\[i\]\[3\]\)\s*:\s*null/);
    expect(strip(boSrc)).not.toMatch(/\?\s*new Date\(ifData\[i\]\[3\]\)\s*:\s*null/);
  });
});

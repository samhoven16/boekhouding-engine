/**
 * tests/unit/cycle48-xaf-year-filter.test.js
 *
 * Cycle 48 — XafExport jaar-filter werkte alleen op Date-typed cells.
 * String-dated journaalposten (na CSV-import / sheet-export-restore)
 * passeerden silent door zonder year-check → entries van vorige jaren
 * lekten in de XAF voor jaar X → audit-error bij Belastingdienst of
 * accountant die XAF inleest.
 *
 * Round-5: source-pattern test, compact.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/XafExport.gs'), 'utf8');

describe('CYCLE 48: XAF year-filter dekt nu beide datum-paden', () => {
  test('String-pad parsed datum + filter op getFullYear() !== jaar', () => {
    // Sequentiële check: na else { datum = String(...); datumObj = parseDatum_...
    // dan een continue bij jaar-mismatch
    expect(src).toMatch(/parseDatum_\(datum\)[\s\S]{0,400}getFullYear\(\)\s*!==\s*jaar[\s\S]{0,40}continue/);
  });

  test('Date-pad jaar-filter blijft behouden (regressie)', () => {
    expect(src).toMatch(/datum instanceof Date[\s\S]{0,200}datum\.getFullYear\(\)\s*!==\s*jaar[\s\S]{0,40}continue/);
  });

  test('parseDatum_ wordt gebruikt voor string-tolerance (niet bare new Date)', () => {
    expect(src).toMatch(/parseDatum_\(datum\)/);
  });

  test('isNaN-defense op getTime() in string-pad', () => {
    expect(src).toMatch(/isNaN\(datumObj\.getTime\(\)\)/);
  });
});

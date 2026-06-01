/**
 * tests/unit/cycle59-newdate-to-parsedatum.test.js
 *
 * Cycle 59 — bare `new Date(r[X])` op datum-cells crashte stilletjes
 * voor NL-string-dated rijen (`new Date('15-06-2026')` → Invalid Date).
 * 4 sites geconverteerd:
 *
 *   - Triggers.gs YTD-omzet (mijlpaal-banner toont onjuist bedrag)
 *   - Triggers.gs `_berekenWeekOmzet_` (wekelijkse tips-mail)
 *   - Triggers.gs dunning vervaldatum (HERINNERING blijft uit →
 *     debiteuren-saldo loopt op)
 *   - Verkoopfacturen.gs factuurlijst datum + vervaldatum (sorting +
 *     dagenVervallen-display fout)
 *
 * Patroon: `r[X] instanceof Date ? r[X] : parseDatum_(r[X])` +
 * isNaN-getime-guard.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const trigSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');
const vfSrc   = fs.readFileSync(path.resolve(__dirname, '../../src/Verkoopfacturen.gs'), 'utf8');

describe('CYCLE 59: bare new Date(r[X]) → parseDatum_ batch', () => {
  test('Triggers: YTD-omzet-loop gebruikt parseDatum_ op r[2]', () => {
    const idx = trigSrc.indexOf('let ytdOmzetExcl = 0');
    const body = trigSrc.slice(idx, idx + 1000);
    expect(body).toMatch(/r\[2\] instanceof Date.*parseDatum_\(r\[2\]\)/);
    expect(body).toMatch(/!isNaN\(rDatum\.getTime\(\)\)/);
  });

  test('Triggers: _berekenWeekOmzet_-loop gebruikt parseDatum_', () => {
    const idx = trigSrc.indexOf('omzetWeek +=');
    const window = trigSrc.slice(Math.max(0, idx - 500), idx + 200);
    expect(window).toMatch(/parseDatum_\(r\[2\]\)/);
  });

  test('Triggers: dunning-vervaldatum gebruikt parseDatum_ + isNaN-guard', () => {
    const idx = trigSrc.indexOf('const vervaldatum = data[i][3] ?');
    const block = trigSrc.slice(idx, idx + 300);
    expect(block).toMatch(/parseDatum_\(data\[i\]\[3\]\)/);
    expect(block).toMatch(/isNaN\(vervaldatum\.getTime\(\)\)/);
  });

  test('Verkoopfacturen: factuurlijst datum + vervaldatum geconverteerd', () => {
    expect(vfSrc).toMatch(/r\[3\] instanceof Date.*parseDatum_\(r\[3\]\)/);
    expect(vfSrc).toMatch(/r\[2\] instanceof Date.*parseDatum_\(r\[2\]\)/);
  });

  test('Geen residuele bare `new Date(r[2])` of `new Date(r[3])` patterns', () => {
    // Strip comments uit beide files
    const stripComments = (src) =>
      src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const t = stripComments(trigSrc);
    const v = stripComments(vfSrc);
    expect(t).not.toMatch(/\?\s*new Date\(r\[2\]\)\s*:\s*null/);
    expect(t).not.toMatch(/\?\s*new Date\(r\[3\]\)\s*:\s*null/);
    expect(t).not.toMatch(/\?\s*new Date\(data\[i\]\[3\]\)\s*:\s*null/);
    expect(v).not.toMatch(/\?\s*new Date\(r\[2\]\)\s*:\s*null/);
    expect(v).not.toMatch(/\?\s*new Date\(r\[3\]\)\s*:\s*null/);
  });
});

/**
 * tests/unit/cycle61-smartcat-datum.test.js
 *
 * Cycle 61 — SmartCategorisatie auto-match methode 3 (bedrag + datum
 * ±90d) deed bare new Date() op zowel bank-transactie-datum (btData[i][1])
 * als factuur-datum (vfData[j][2]). String-dated rijen (CSV-import van
 * bank óf factuur) → Invalid Date → match-conditie faalde silent →
 * bank-transactie nooit auto-gekoppeld → klant koppelt handmatig.
 *
 * Fix: parseDatum_ + isNaN-guard op beide datums.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/SmartCategorisatie.gs'), 'utf8');
const m3 = src.slice(src.indexOf('Methode 3:'), src.indexOf('Methode 3:') + 1200);

describe('CYCLE 61: SmartCategorisatie methode-3 datum string-tolerance', () => {
  test('Bank-datum gebruikt parseDatum_', () => {
    expect(m3).toMatch(/btRaw instanceof Date.*parseDatum_\(btRaw\)/);
  });

  test('Factuur-datum gebruikt parseDatum_', () => {
    expect(m3).toMatch(/vfRaw instanceof Date.*parseDatum_\(vfRaw\)/);
  });

  test('isNaN-guards op beide (btGeldig + vfDatum.getTime)', () => {
    expect(m3).toMatch(/btGeldig\s*=\s*btDatum\s*&&\s*!isNaN\(btDatum\.getTime\(\)\)/);
    expect(m3).toMatch(/vfDatum\s*&&\s*!isNaN\(vfDatum\.getTime\(\)\)/);
  });

  test('Geen residuele bare new Date(btData[i][1]) / new Date(vfData[j][2])', () => {
    const strip = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(strip).not.toMatch(/\?\s*new Date\(btData\[i\]\[1\]\)\s*:\s*null/);
    expect(strip).not.toMatch(/\?\s*new Date\(vfData\[j\]\[2\]\)\s*:\s*null/);
  });
});

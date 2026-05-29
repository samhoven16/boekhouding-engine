/**
 * tests/unit/cycle39-engagement-datum-string.test.js
 *
 * Cycle 39 — _berekenJaarStats_ in Engagement.gs had dezelfde bug als
 * cycle 38 (EUVerkoop): pure `instanceof Date` filter, string-dated
 * invoices uit CSV-import werden silent geskipped. Gevolg: klant zag
 * onjuiste jaaroverzicht-omzet/kosten/winst.
 *
 * Direct follow-up cycle van cycle 38 — zelfde audit-pattern, een ander
 * call-site. Voorbeeld van retro-improvement: na een patroon-fix in één
 * file checken of het elders staat (vond 2 hits in Engagement.gs).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/Engagement.gs'), 'utf8');

describe('CYCLE 39: Engagement._berekenJaarStats_ datum string-tolerance', () => {
  test('VF-loop gebruikt parseDatum_ ipv puur instanceof Date', () => {
    expect(src).toMatch(/parseDatum_\(ruwDatum\)/);
  });

  test('Beide loops (VF + IF) zijn geconverteerd', () => {
    const count = (src.match(/parseDatum_\(ruwDatum\)/g) || []).length;
    expect(count).toBe(2);
  });

  test('isNaN-defensie na getTime()', () => {
    const count = (src.match(/isNaN\(datum\.getTime\(\)\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('Geen residuele `data\\[i\\]\\[2\\] instanceof Date \\? data\\[i\\]\\[2\\] : null` pattern', () => {
    expect(src).not.toMatch(/data\[i\]\[2\] instanceof Date \? data\[i\]\[2\] : null/);
  });

  test('Geen residuele `data\\[i\\]\\[3\\] instanceof Date \\? data\\[i\\]\\[3\\] : null` pattern', () => {
    expect(src).not.toMatch(/data\[i\]\[3\] instanceof Date \? data\[i\]\[3\] : null/);
  });

  test('Date-passthrough behouden in beide loops', () => {
    const count = (src.match(/\(ruwDatum instanceof Date\)\s*\?\s*ruwDatum/g) || []).length;
    expect(count).toBe(2);
  });
});

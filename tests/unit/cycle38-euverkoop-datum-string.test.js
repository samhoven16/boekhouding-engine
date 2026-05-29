/**
 * tests/unit/cycle38-euverkoop-datum-string.test.js
 *
 * Cycle 38 — controleerOssDrempel_ en genereerIcpRapport_ deden:
 *   const datum = data[i][2] instanceof Date ? data[i][2] : null;
 *
 * String-dated invoices (na CSV-import bv. via cycle 16 bank-import,
 * of na export-restore) werden SILENT geskipped. Klant met EU B2C-
 * verkopen overschreed €10k OSS-drempel zonder waarschuwing →
 * BTW-aangifte-mismatch. ICP-rapport (legaal verplicht per kwartaal)
 * was onvolledig → onjuiste Belastingdienst-rapportage.
 *
 * Fix: parseDatum_ accepteert ook strings + ISO/NL formaten.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/EUVerkoop.gs'), 'utf8');

describe('CYCLE 38: EUVerkoop datum-parsing string-tolerance', () => {
  test('controleerOssDrempel_ gebruikt parseDatum_ ipv puur instanceof Date', () => {
    const startIdx = src.indexOf('function controleerOssDrempel_(');
    const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);
    expect(body).toMatch(/parseDatum_\(ruwDatum\)/);
    // De pure-instanceof check zonder fallback mag niet meer voorkomen
    expect(body).not.toMatch(/data\[i\]\[2\] instanceof Date \? data\[i\]\[2\] : null/);
  });

  test('genereerIcpRapport_ gebruikt parseDatum_ ipv puur instanceof Date', () => {
    const startIdx = src.indexOf('function genereerIcpRapport_(');
    if (startIdx === -1) {
      // functie kan andere naam hebben — check op _Icp_/ICP-pattern
      const idx = src.indexOf("'ICP-rapport'");
      expect(idx).toBeGreaterThan(0);
    }
    // Allebei de loops in EUVerkoop.gs gebruiken nu parseDatum_
    const count = (src.match(/parseDatum_\(ruwDatum\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('Defensieve isNaN-check op getTime() na parse', () => {
    const matches = src.match(/parseDatum_\(ruwDatum\)[\s\S]{0,200}isNaN\(datum\.getTime\(\)\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('Geldig Date-object passthrough (geen onnodig parsen)', () => {
    expect(src).toMatch(/\(ruwDatum instanceof Date\)\s*\?\s*ruwDatum/);
  });

  test('Geen residuele `data\\[i\\]\\[2\\] instanceof Date \\? data\\[i\\]\\[2\\] : null` pattern', () => {
    const matches = src.match(/data\[i\]\[2\] instanceof Date \? data\[i\]\[2\] : null/g) || [];
    expect(matches.length).toBe(0);
  });
});

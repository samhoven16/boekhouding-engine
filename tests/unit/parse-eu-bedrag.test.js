/**
 * tests/unit/parse-eu-bedrag.test.js
 *
 * Regressie-firewall voor de client-side parseEU() helper in NieuweBoeking.gs.
 * Voorheen werd parseFloat gebruikt, wat "75,00" niet kon lezen → totaal bleef
 * €0,00 ondanks ingevulde bedragen. Klant dacht "stuk".
 *
 * Test verifieert via direct extract uit de bron-string dat parseEU bestaat
 * en dat alle EU-formaten correct interpreteert.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('parseEU client-side helper (NieuweBoeking.gs)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'NieuweBoeking.gs'),
    'utf8'
  );

  test('parseEU functie aanwezig in dialog-template', () => {
    expect(src).toMatch(/function parseEU\(v\)/);
  });

  test('parseEU strip euro-teken', () => {
    expect(src).toMatch(/replace\(\/€\/g/);
  });

  test('parseEU detecteert komma als decimaal-separator', () => {
    expect(src).toMatch(/lastIndexOf\(','\)/);
  });

  test('parseEU vervangt parseFloat in submit-data en herbereken', () => {
    // Geen parseFloat meer op factuurregel-velden — alleen parseEU
    const factuurRegelVelden = /var (a|p)=parseFloat\(\(document\.getElementById\('f-r/;
    expect(src).not.toMatch(factuurRegelVelden);
    // parseEU wel aanroepen op factuur-velden
    expect(src).toMatch(/parseEU\(\(document\.getElementById\('f-r/);
  });

  test('REGELS validator gebruikt parseEU voor prijs/bedrag', () => {
    // r1prijs validator
    const factuurRegel = src.match(/factuur:[\s\S]+?r1prijs:[^,}]+/);
    expect(factuurRegel).toBeTruthy();
    expect(factuurRegel[0]).toMatch(/parseEU\(v\)/);
    // kosten bedragIncl validator
    const kostenRegel = src.match(/kosten:[\s\S]+?bedragIncl:[^,}]+/);
    expect(kostenRegel).toBeTruthy();
    expect(kostenRegel[0]).toMatch(/parseEU\(v\)/);
  });

  // ── Functionele tests via vm-evaluatie van parseEU ──────────────────────
  // Extract de functie definitie en eval in een sandbox.
  describe('parseEU output (functioneel)', () => {
    let parseEU;
    beforeAll(() => {
      const match = src.match(/function parseEU\(v\)\s*\{[\s\S]+?\n\}/);
      expect(match).toBeTruthy();
      parseEU = new Function('return ' + match[0])();
    });

    test('null/undefined/leeg → 0', () => {
      expect(parseEU(null)).toBe(0);
      expect(parseEU(undefined)).toBe(0);
      expect(parseEU('')).toBe(0);
    });

    test('plain integer "75" → 75', () => {
      expect(parseEU('75')).toBe(75);
    });

    test('US-formaat "75.00" → 75', () => {
      expect(parseEU('75.00')).toBe(75);
    });

    test('NL-formaat "75,00" → 75 (voorheen: 0!)', () => {
      expect(parseEU('75,00')).toBe(75);
    });

    test('met euro-teken "€75,00" → 75', () => {
      expect(parseEU('€75,00')).toBe(75);
    });

    test('met spatie "€ 75,00" → 75', () => {
      expect(parseEU('€ 75,00')).toBe(75);
    });

    test('NL duizenden + decimaal "1.234,56" → 1234.56', () => {
      expect(parseEU('1.234,56')).toBeCloseTo(1234.56, 2);
    });

    test('US duizenden + decimaal "1,234.56" → 1234.56', () => {
      expect(parseEU('1,234.56')).toBeCloseTo(1234.56, 2);
    });

    test('groot bedrag "€12.345,67" → 12345.67', () => {
      expect(parseEU('€12.345,67')).toBeCloseTo(12345.67, 2);
    });

    test('decimal-only "0,99" → 0.99', () => {
      expect(parseEU('0,99')).toBeCloseTo(0.99, 2);
    });

    test('non-numeric "abc" → 0', () => {
      expect(parseEU('abc')).toBe(0);
    });
  });
});

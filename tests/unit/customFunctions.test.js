/**
 * tests/unit/customFunctions.test.js
 *
 * Tests voor de cel-callable custom functions (=BEREKEN_BTW, =SCHULD_SCHIJF, etc.).
 * Deze functies zijn pure (geen sheet-reads) — eenvoudig te testen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CustomFunctions.gs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['CustomFunctions.gs']); });

  describe('BEREKEN_BTW', () => {
    test('21% tarief berekent 21 over 100', () => {
      expect(ctx.BEREKEN_BTW(100, '21%')).toBe(21);
    });

    test('9% tarief berekent 9 over 100', () => {
      expect(ctx.BEREKEN_BTW(100, '9%')).toBe(9);
    });

    test('full label "21% (hoog)" werkt ook', () => {
      expect(ctx.BEREKEN_BTW(100, '21% (hoog)')).toBe(21);
    });

    test('vrijgesteld → 0', () => {
      expect(ctx.BEREKEN_BTW(100, 'vrijgesteld')).toBe(0);
      expect(ctx.BEREKEN_BTW(100, 'Vrijgesteld')).toBe(0);
    });

    test('verlegd → 0', () => {
      expect(ctx.BEREKEN_BTW(100, 'verlegd')).toBe(0);
      expect(ctx.BEREKEN_BTW(100, 'Verlegd')).toBe(0);
    });

    test('nul-tarief → 0', () => {
      expect(ctx.BEREKEN_BTW(100, '0%')).toBe(0);
    });

    test('niet-numeriek bedrag → 0', () => {
      expect(ctx.BEREKEN_BTW('xx', '21%')).toBe(0);
    });

    test('default tarief is 21% bij undefined', () => {
      expect(ctx.BEREKEN_BTW(100)).toBe(21);
    });

    test('decimaal afronden op 2 decimalen', () => {
      expect(ctx.BEREKEN_BTW(33.33, '21%')).toBe(7);
    });
  });

  describe('BTW_INCLUSIEF / BTW_EXCLUSIEF', () => {
    test('BTW_INCLUSIEF: 100 + 21% = 121', () => {
      expect(ctx.BTW_INCLUSIEF(100, '21%')).toBe(121);
    });

    test('BTW_EXCLUSIEF: 121 / 1.21 = 100', () => {
      expect(ctx.BTW_EXCLUSIEF(121, '21%')).toBe(100);
    });

    test('roundtrip: incl → excl → incl matcht', () => {
      const incl = ctx.BTW_INCLUSIEF(50, '9%');
      expect(ctx.BTW_EXCLUSIEF(incl, '9%')).toBeCloseTo(50, 1);
    });

    test('vrijgesteld: incl == excl', () => {
      expect(ctx.BTW_INCLUSIEF(100, 'vrijgesteld')).toBe(100);
      expect(ctx.BTW_EXCLUSIEF(100, 'vrijgesteld')).toBe(100);
    });
  });

  describe('SCHULD_SCHIJF', () => {
    test('inkomen 0 → 0', () => {
      expect(ctx.SCHULD_SCHIJF(0)).toBe(0);
    });

    // 2026-tarieven (audit 2026-06-12, belastingdienst.nl): schijf 1 t/m
    // 38.883 @ 35,75%, schijf 2 t/m 78.426 @ 37,56%, schijf 3 49,50%.
    test('inkomen 30k (binnen schijf 1) → 35,75%', () => {
      expect(ctx.SCHULD_SCHIJF(30000)).toBeCloseTo(30000 * 0.3575, 0);
    });

    test('inkomen 50k (schijf 2) → grens 38883 + (50000-38883)*0,3756', () => {
      const verwacht = 38883 * 0.3575 + (50000 - 38883) * 0.3756;
      expect(ctx.SCHULD_SCHIJF(50000)).toBeCloseTo(verwacht, 0);
    });

    test('inkomen 100k (schijf 3) bevat alle 3 schijven', () => {
      const verwacht =
        38883 * 0.3575 +
        (78426 - 38883) * 0.3756 +
        (100000 - 78426) * 0.4950;
      expect(ctx.SCHULD_SCHIJF(100000)).toBeCloseTo(verwacht, 0);
    });

    test('negatief inkomen → 0', () => {
      expect(ctx.SCHULD_SCHIJF(-1000)).toBe(0);
    });
  });

  describe('ZZP_NETTO', () => {
    test('positieve winst geeft kleinere netto na IB', () => {
      const netto = ctx.ZZP_NETTO(60000, false);
      expect(netto).toBeLessThan(60000);
      expect(netto).toBeGreaterThan(0);
    });

    test('starter krijgt extra aftrek (hogere netto)', () => {
      const zonder = ctx.ZZP_NETTO(40000, false);
      const met = ctx.ZZP_NETTO(40000, true);
      expect(met).toBeGreaterThanOrEqual(zonder);
    });

    test('winst 0 → 0', () => {
      expect(ctx.ZZP_NETTO(0)).toBe(0);
    });
  });

  describe('BTW_SALDO', () => {
    test('omzet 1000 (21%) - voorbelasting 50 → 160', () => {
      expect(ctx.BTW_SALDO(1000, '21%', 50)).toBe(160);
    });

    test('voorbelasting hoger dan btw-omzet → negatief saldo', () => {
      expect(ctx.BTW_SALDO(100, '21%', 500)).toBe(-479);
    });
  });

  describe('KM_VERGOEDING', () => {
    test('100 km × € 0,23 = € 23', () => {
      expect(ctx.KM_VERGOEDING(100)).toBe(23);
    });

    test('0 km → 0', () => {
      expect(ctx.KM_VERGOEDING(0)).toBe(0);
    });

    test('negatief → 0', () => {
      expect(ctx.KM_VERGOEDING(-50)).toBe(0);
    });
  });

  describe('KOR_GESCHIKT', () => {
    test('omzet 15k → JA', () => {
      expect(ctx.KOR_GESCHIKT(15000)).toMatch(/JA/);
    });

    test('omzet 25k → NEE', () => {
      expect(ctx.KOR_GESCHIKT(25000)).toMatch(/NEE/);
    });

    test('exact 20k → JA (drempel inclusief)', () => {
      expect(ctx.KOR_GESCHIKT(20000)).toMatch(/JA/);
    });
  });

  describe('AFSCHRIJVING_MAAND', () => {
    test('1200 over 5 jaar → 20/maand', () => {
      expect(ctx.AFSCHRIJVING_MAAND(1200, 5, 0)).toBe(20);
    });

    test('met restwaarde 200', () => {
      expect(ctx.AFSCHRIJVING_MAAND(1200, 5, 200)).toBeCloseTo((1200 - 200) / 60, 2);
    });

    test('0 jaar → 0 (deling-door-nul guard)', () => {
      expect(ctx.AFSCHRIJVING_MAAND(1200, 0, 0)).toBe(0);
    });
  });

  describe('WERKDAGEN', () => {
    test('maandag t/m vrijdag = 5 werkdagen', () => {
      const ma = new Date(2026, 0, 5);  // ma 5 jan 2026
      const vr = new Date(2026, 0, 9);  // vr 9 jan 2026
      expect(ctx.WERKDAGEN(ma, vr)).toBe(5);
    });

    test('weekend wordt overgeslagen', () => {
      const za = new Date(2026, 0, 10); // za
      const zo = new Date(2026, 0, 11); // zo
      expect(ctx.WERKDAGEN(za, zo)).toBe(0);
    });

    test('omgekeerde volgorde geeft hetzelfde resultaat', () => {
      const ma = new Date(2026, 0, 5);
      const vr = new Date(2026, 0, 9);
      expect(ctx.WERKDAGEN(vr, ma)).toBe(5);
    });
  });
});

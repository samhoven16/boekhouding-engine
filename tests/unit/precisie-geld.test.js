/**
 * tests/unit/precisie-geld.test.js
 *
 * PRECISIE-RATEL (klasse 9 — geld-exactheid). Bewijst over de invoerruimte dat
 * de geld-primitieven exact en symmetrisch zijn. Borgt de fixes van de
 * precisie-audit 2026-06-19:
 *  - parseBedrag_: US-formaat "1,234.56" werd 1,23 (eerste-komma-bug) → nu 1234,56;
 *    NL-duizendtal "1.000"→1000 blijft (gepind).
 *  - rondBedrag_: symmetrisch (geen cent-schepping bij negatief).
 *  - formatBedrag_: geen "-€ 0,00" voor sub-halve-cent negatief.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');
const ctx = createGasRuntime(['Utils.gs']);

describe('parseBedrag_ — NL én US formaat correct (chokepoint)', () => {
  const cases = [
    ['1,50', 1.5], ['99,99', 99.99],
    ['1.234,56', 1234.56], ['1.000.000,00', 1000000],
    ['1.000', 1000], ['10.000', 10000],          // NL-duizendtal (gepind)
    ['1.23', 1.23], ['10.50', 10.5],             // US dot-decimaal
    ['1,234.56', 1234.56],                       // ← de US-bug: was 1,23
    ['1,234,567.89', 1234567.89],                // ← was 1,23
    ['€ 1.234,56', 1234.56], [' €99,00 ', 99],
    ['-1.234,56', -1234.56],
  ];
  cases.forEach(([inp, exp]) => {
    test(`parseBedrag_(${JSON.stringify(inp)}) = ${exp}`, () => {
      expect(ctx.parseBedrag_(inp)).toBeCloseTo(exp, 2);
    });
  });

  test('round-trip parse→format→parse is stabiel (NL-formaat)', () => {
    for (let cents = 0; cents <= 100000; cents += 137) {
      const euro = cents / 100;
      const heen = ctx.formatBedrag_(euro);
      expect(ctx.parseBedrag_(heen)).toBeCloseTo(euro, 2);
    }
  });
});

describe('rondBedrag_ — exact + symmetrisch', () => {
  test('positief gedrag ongewijzigd (cent-exact)', () => {
    expect(ctx.rondBedrag_(1.005)).toBeCloseTo(1.0, 2);   // float-repr: 1.00499… → 1,00
    expect(ctx.rondBedrag_(2.675)).toBeCloseTo(2.68, 2);
    expect(ctx.rondBedrag_(0.1 + 0.2)).toBeCloseTo(0.3, 2);
  });
  test('symmetrisch: rondBedrag_(-x) === -rondBedrag_(x) (geen cent-schepping)', () => {
    for (let cents = -50000; cents <= 50000; cents += 7) {
      const x = cents / 1000;  // veel .xx5-randen
      expect(ctx.rondBedrag_(-x)).toBe(-ctx.rondBedrag_(x));
    }
  });
  test('som van afgeronde delen blijft op de cent (Σ-deel = geheel)', () => {
    let som = 0;
    for (let i = 0; i < 10000; i++) som = ctx.rondBedrag_(som + 0.01);
    expect(som).toBe(100);   // exact, geen 100.00000000001425-drift
  });
});

describe('formatBedrag_ — geen getekend nul', () => {
  test('sub-halve-cent negatief → "€ 0,00", niet "-€ 0,00"', () => {
    expect(ctx.formatBedrag_(-0.002)).not.toMatch(/-/);
    expect(ctx.formatBedrag_(-0.002)).toMatch(/0,00/);
  });
  test('echt negatief blijft negatief', () => {
    expect(ctx.formatBedrag_(-99)).toMatch(/^-/);
  });
});

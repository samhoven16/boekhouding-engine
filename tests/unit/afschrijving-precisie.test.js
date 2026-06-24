/**
 * tests/unit/afschrijving-precisie.test.js
 *
 * RATEL (bug-klasse 9): afschrijving = saldo × pct × factor was een dubbel-float
 * → cent-drift (10% van €166,85 = €16,685 → €16,68 i.p.v. €16,69; ook 25%/5%).
 * Afschrijving raakt de W&V → IB, dus bindend. berekenAfschrijvingCent_ rekent
 * exact in integer-centen, half-up, voor jaar (factor 1) en maand (1/12).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs']);

// Onafhankelijke integer-cent-referentie.
function trueA(saldo, pct, factor) {
  const sc = Math.round(saldo * 100);
  const e4 = Math.round(pct * 10000);
  const den = factor === 1 ? 10000 : 120000;
  return Math.floor((e4 * sc + den / 2) / den) / 100;
}

describe('klasse 9 — afschrijving exact (geen dubbel-float-drift)', () => {
  test('10% van €166,85 = €16,69 (float gaf €16,68)', () => {
    expect(ctx.berekenAfschrijvingCent_(166.85, 0.10, 1)).toBe(16.69);
  });

  test('25% van €70,82 = €17,71 (float gaf €17,70)', () => {
    expect(ctx.berekenAfschrijvingCent_(70.82, 0.25, 1)).toBe(17.71);
  });

  test('jaar (factor 1) exact over een breed bereik', () => {
    [0.10, 0.20, 0.25, 0.05, 0.3333].forEach((pct) => {
      for (let sc = 1; sc <= 400000; sc += 977) {
        const s = sc / 100;
        expect(ctx.berekenAfschrijvingCent_(s, pct, 1)).toBe(trueA(s, pct, 1));
      }
    });
  });

  test('maand (factor 1/12) exact over een breed bereik', () => {
    [0.10, 0.20, 0.25].forEach((pct) => {
      for (let sc = 1; sc <= 400000; sc += 1313) {
        const s = sc / 100;
        expect(ctx.berekenAfschrijvingCent_(s, pct, 1 / 12)).toBe(trueA(s, pct, 1 / 12));
      }
    });
  });

  test('randgevallen: saldo 0 / pct 0 → 0', () => {
    expect(ctx.berekenAfschrijvingCent_(0, 0.10, 1)).toBe(0);
    expect(ctx.berekenAfschrijvingCent_(1000, 0, 1)).toBe(0);
  });
});

describe('klasse 9 — regelTotaalCent_ (aantal × prijs) exact', () => {
  const ctx2 = createGasRuntime(['Config.gs', 'Utils.gs']);
  function trueLine(aantal, prijs) {
    const aMilli = Math.round(aantal * 1000), pCent = Math.round(prijs * 100);
    return Math.floor((aMilli * pCent + 500) / 1000) / 100;
  }
  test('€0,25 × €19,90 = €4,98 (float gaf €4,97)', () => {
    expect(ctx2.regelTotaalCent_(0.25, 19.90)).toBe(4.98);
  });
  test('exact over een bereik van hoeveelheden × prijzen', () => {
    for (const aq of [1, 2, 3, 5, 10]) {        // 0,25 .. 2,5 (kwart-stappen)
      const aantal = aq / 4;
      for (let pc = 1; pc <= 200000; pc += 311) {
        const prijs = pc / 100;
        expect(ctx2.regelTotaalCent_(aantal, prijs)).toBe(trueLine(aantal, prijs));
      }
    }
  });
});

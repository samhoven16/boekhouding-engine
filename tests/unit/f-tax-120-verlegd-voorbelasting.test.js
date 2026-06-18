/**
 * tests/unit/f-tax-120-verlegd-voorbelasting.test.js
 *
 * F-TAX-120 (BLOKKER) — verlegde inkoop-BTW kwam NIET in de aftrekbare
 * voorbelasting (r5b). berekenBtwAangifte_ telde het verlegde bedrag wél bij
 * r4a (verschuldigd, vloeit in r5a) maar niet bij r5b (aftrek). Gevolg: de
 * ZZP'er droeg de verlegde BTW VÓL af op élke reverse-charge inkoop
 * (Google Ads, SaaS, EU-diensten) → structureel honderden euro's te veel.
 *
 * Correct (bij vol aftrekrecht): r4a == r5b → net kaseffect €0.
 *
 * Ratel: de saldo-assertie (en r5b) faalt zónder de fix (saldo was +btw i.p.v. 0).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const VAN = new Date('2026-01-01');
const TOT = new Date('2026-12-31');

// INKOOPFACTUREN-rij: 19 kolommen, alleen relevante indices gevuld.
function inkoopRij(datum, grondslag, label, btw, status, bijlage) {
  const r = new Array(19).fill('');
  r[3] = datum;       // factuurdatum leverancier (BTW-datumfilter)
  r[8] = grondslag;   // grondslag excl.
  r[9] = label;       // BTW-label
  r[10] = btw;        // BTW-bedrag
  r[12] = status;     // status
  r[18] = bijlage;    // Bijlage URL
  return r;
}

function maakCtx(inkoopRows) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);
  const verkoopData = [new Array(15).fill('h')]; // alleen header → geen omzet
  const inkoopData = [new Array(19).fill('h')].concat(inkoopRows);
  const mk = (data) => ({ getDataRange: () => ({ getValues: () => data }), getLastRow: () => data.length });
  const ss = {
    getSheetByName: (n) => (/inkoop/i.test(n) ? mk(inkoopData) : /verkoop/i.test(n) ? mk(verkoopData) : null),
  };
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx, ss };
}

describe('F-TAX-120 — verlegde inkoop-BTW telt óók als voorbelasting (r5b)', () => {
  test('zuivere verlegde inkoop: r4a == r5b, net saldo €0', () => {
    const { ctx, ss } = maakCtx([
      // €1.000 Google Ads (Ierland), BTW verlegd €210, mét bewijsstuk.
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 210, 'Betaald', 'https://drive/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);

    expect(a.r4a_btw).toBeCloseTo(210, 2);   // verschuldigd (reverse charge)
    expect(a.r5b).toBeCloseTo(210, 2);       // ← aftrek; was 0 zónder de fix
    expect(a.r5a).toBeCloseTo(210, 2);       // r5a bevat r4a_btw
    // De kern: reverse charge bij vol aftrekrecht kost NIETS.
    expect(a.saldo).toBeCloseTo(0, 2);       // ← was +210 zónder de fix
  });

  test('case-insensitive label ("BTW verlegd") werkt identiek', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-04-10'), 500, 'BTW verlegd', 105, 'Betaald', 'https://drive/y'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(a.r5b).toBeCloseTo(105, 2);
    expect(a.saldo).toBeCloseTo(0, 2);
  });

  test('verlegd + normale inkoop sommeren correct in r5b', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 210, 'Betaald', 'https://drive/x'),
      inkoopRij(new Date('2026-03-20'), 100, '21% (hoog)', 21, 'Betaald', 'https://drive/z'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    // r5b = verlegd 210 + normaal 21 = 231
    expect(a.r5b).toBeCloseTo(231, 2);
    // r5a = r4a 210 (alleen verlegd is verschuldigd). saldo = 210 - 231 = -21
    // → €21 teruggave (de normale-inkoop-voorbelasting), reverse charge net €0.
    expect(a.saldo).toBeCloseTo(-21, 2);
  });

  test('verlegde voorbelasting zonder bewijsstuk wordt geflagd (art. 15 Wet OB)', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 210, 'Betaald', ''), // geen bijlage
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(a._r5bZonderBewijsAantal).toBe(1);
    expect(a._r5bZonderBewijsBedrag).toBeCloseTo(210, 2);
    // Aangifte zelf blijft fiscaal correct (aftrek niet stil weggenomen).
    expect(a.r5b).toBeCloseTo(210, 2);
  });
});

/**
 * tests/unit/cycle21-herhalende-input-validatie.test.js
 *
 * Cycle 21 — opslaanHerhalendeKost had drie silent-corruption paden:
 *   1. parseFloat("12,50") → 12 (NL-formaat → komma genegeerd → 50 cent
 *      lost per iteratie, jarenlange drift in audit)
 *   2. parseInt(0) || 100 = 100 (0% zakelijk werd silent 100% zakelijk)
 *   3. parseDatum_("garbage") → vandaag (kost werd direct geboekt ipv
 *      op klant-bedoelde startdatum)
 * Plus géén check op lege naam of bedrag ≤ 0.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  const appended = [];
  const sheet = {
    appendRow: (rij) => { appended.push(rij); },
    getLastRow: () => appended.length + 1,
    getRange: () => ({ setNumberFormat: () => {} }),
  };
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'HerhalendeKosten.gs'], {});
  ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  ctx.maakHerhalendeKostenTab_ = () => sheet;
  let n = 1;
  ctx._volgendHerhalendKostId_ = () => 'HK' + String(n++).padStart(4, '0');
  return { ctx, appended };
}

describe('CYCLE 21: opslaanHerhalendeKost — strict input-validation', () => {
  test('NL bedrag-formaat "12,50" wordt 12.50 (was: 12 via parseFloat)', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'Hosting', bedrag: '12,50', datum: '2026-06-01' });
    expect(appended.length).toBe(1);
    expect(appended[0][3]).toBe(12.50);
  });

  test('NL bedrag met thousands "1.234,56" wordt 1234.56', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'Huur', bedrag: '1.234,56', datum: '2026-06-01' });
    expect(appended[0][3]).toBe(1234.56);
  });

  test('SplitPct = 0 (100% privé) blijft 0 — niet silent 100', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'Privé-tel', bedrag: '50', datum: '2026-06-01', splitPct: 0 });
    expect(appended[0][11]).toBe(0);
  });

  test('SplitPct = "70" wordt 70', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'Tel', bedrag: '50', datum: '2026-06-01', splitPct: '70' });
    expect(appended[0][11]).toBe(70);
  });

  test('SplitPct ontbreekt → 100 (default)', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '50', datum: '2026-06-01' });
    expect(appended[0][11]).toBe(100);
  });

  test('SplitPct > 100 wordt geclamped naar 100', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '50', datum: '2026-06-01', splitPct: 500 });
    expect(appended[0][11]).toBe(100);
  });

  test('Lege naam → throw met klantvriendelijke melding', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanHerhalendeKost({ naam: '', bedrag: '50', datum: '2026-06-01' }))
      .toThrow(/Naam is verplicht/i);
    expect(() => ctx.opslaanHerhalendeKost({ bedrag: '50', datum: '2026-06-01' }))
      .toThrow(/Naam is verplicht/i);
  });

  test('Bedrag ≤ 0 → throw', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '0', datum: '2026-06-01' }))
      .toThrow(/Bedrag/i);
    expect(() => ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '-50', datum: '2026-06-01' }))
      .toThrow(/Bedrag/i);
  });

  test('Bedrag "abc" → throw (niet silent 0)', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: 'abc', datum: '2026-06-01' }))
      .toThrow(/Bedrag/i);
  });

  test('Ongeldige startdatum "garbage" → throw met klantvriendelijke melding', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '50', datum: 'garbage' }))
      .toThrow(/Startdatum/i);
  });

  test('Geldige startdatum NL "01-06-2026" → opgeslagen', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: 'X', bedrag: '50', datum: '01-06-2026' });
    expect(appended[0][6]).toBeInstanceOf(Date);
    expect(appended[0][6].getMonth()).toBe(5);   // juni = 5
    expect(appended[0][6].getDate()).toBe(1);
  });

  test('Naam met whitespace wordt getrimd', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanHerhalendeKost({ naam: '  Hosting  ', bedrag: '50', datum: '2026-06-01' });
    expect(appended[0][1]).toBe('Hosting');
  });

  test('Return-value bevat opgeslagen velden voor caller-feedback', () => {
    const { ctx } = maakCtx();
    const r = ctx.opslaanHerhalendeKost({ naam: 'Hosting', bedrag: '12,50', datum: '2026-06-01' });
    expect(r).toEqual({ id: 'HK0001', naam: 'Hosting', bedrag: 12.50, splitPct: 100 });
  });
});

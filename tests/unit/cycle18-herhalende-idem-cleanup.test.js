/**
 * tests/unit/cycle18-herhalende-idem-cleanup.test.js
 *
 * Cycle 18 — `herhKost_<rijId>_<YYYY-MM-DD>` idempotency-keys accumuleren
 * voor ALTIJD in ScriptProperties. Bij 10 herhalende kosten × 365 dagen ×
 * 5 jaar = ~18.250 keys ≈ 900KB → overschrijdt ScriptProperties-quota
 * (500KB hard limit) → ALLE writes falen silent (factuurnummer-claim,
 * idempotency-guards, settings, etc.). Klant ziet pas een bug zonder
 * duidelijke melding.
 *
 * Fix: dagelijkse cleanup verwijdert keys ouder dan 90 dagen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(initialStore) {
  const store = Object.assign({}, initialStore || {});
  const ctx = createGasRuntime(['HerhalendeKosten.gs'], {
    PropertiesService: {
      getScriptProperties: () => ({
        getKeys: () => Object.keys(store),
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
  });
  return { ctx, store };
}

function dagenGeleden(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('CYCLE 18: cleanupHerhalendeKostenIdempotency_', () => {
  test('Keys ouder dan 90 dagen worden verwijderd', () => {
    const { ctx, store } = maakCtx({
      ['herhKost_HK0001_' + dagenGeleden(120)]: 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(95)]: 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(30)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(2);
    expect(r.behouden).toBe(1);
    expect(Object.keys(store).length).toBe(1);
  });

  test('Recente keys (< 90 dagen) blijven intact', () => {
    const { ctx, store } = maakCtx({
      ['herhKost_HK0001_' + dagenGeleden(1)]: 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(30)]: 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(89)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(0);
    expect(r.behouden).toBe(3);
    expect(Object.keys(store).length).toBe(3);
  });

  test('Toekomstige datums (volgende iteratie) blijven behouden', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureKey = 'herhKost_HK0001_' + future.toISOString().slice(0, 10);
    const { ctx, store } = maakCtx({
      [futureKey]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(0);
    expect(store[futureKey]).toBe('DONE');
  });

  test('Niet-herhKost keys worden NIET aangeraakt', () => {
    const { ctx, store } = maakCtx({
      'volgendFactuurNr': '42',
      'SETUP_DONE': 'true',
      'webhook_idem_xyz': 'cached',
      ['herhKost_HK0001_' + dagenGeleden(120)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(1);
    expect(store.volgendFactuurNr).toBe('42');
    expect(store.SETUP_DONE).toBe('true');
    expect(store.webhook_idem_xyz).toBe('cached');
  });

  test('Custom maxDagen-parameter werkt', () => {
    const { ctx, store } = maakCtx({
      ['herhKost_HK0001_' + dagenGeleden(20)]: 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(40)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_(30);
    expect(r.verwijderd).toBe(1);
    expect(r.behouden).toBe(1);
  });

  test('maxDagen ongeldig (negatief, 0, niet-getal) → default 90', () => {
    const { ctx } = maakCtx({
      ['herhKost_HK0001_' + dagenGeleden(120)]: 'DONE',
    });
    expect(ctx.cleanupHerhalendeKostenIdempotency_(0).verwijderd).toBe(1);
    expect(ctx.cleanupHerhalendeKostenIdempotency_(-5).verwijderd).toBe(0); // al gewist
  });

  test('Lege ScriptProperties → 0/0 zonder crash', () => {
    const { ctx } = maakCtx({});
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(0);
    expect(r.behouden).toBe(0);
  });

  test('Gemixte rijIds verwijderen onafhankelijk van elkaar', () => {
    const { ctx, store } = maakCtx({
      ['herhKost_HK0001_' + dagenGeleden(120)]: 'DONE',
      ['herhKost_HK0002_' + dagenGeleden(120)]: 'DONE',
      ['herhKost_HK0003_' + dagenGeleden(10)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(2);
    expect(r.behouden).toBe(1);
    expect(store['herhKost_HK0003_' + dagenGeleden(10)]).toBe('DONE');
  });

  test('Corrupt key-formaat (geen datum-suffix) wordt overgeslagen', () => {
    const { ctx, store } = maakCtx({
      'herhKost_HK0001_invalid': 'DONE',
      ['herhKost_HK0001_' + dagenGeleden(120)]: 'DONE',
    });
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(1);
    expect(store['herhKost_HK0001_invalid']).toBe('DONE');  // niet verwijderd
  });

  test('Schaal-test: 1000 keys verwerken zonder crash', () => {
    const init = {};
    // 500 unique oude keys (verschillende rijIds × verschillende datums)
    for (let i = 0; i < 500; i++) init['herhKost_HK' + i + '_' + dagenGeleden(120 + i)] = 'DONE';
    // 89 unique recente keys
    for (let i = 0; i < 89; i++) init['herhKost_HK_recent_' + i + '_' + dagenGeleden(i)] = 'DONE';
    const { ctx } = maakCtx(init);
    const r = ctx.cleanupHerhalendeKostenIdempotency_();
    expect(r.verwijderd).toBe(500);
    expect(r.behouden).toBe(89);
  });
});

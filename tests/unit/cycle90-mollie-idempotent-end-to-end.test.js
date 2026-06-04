/**
 * tests/unit/cycle90-mollie-idempotent-end-to-end.test.js
 *
 * Mollie webhook → markeer-betaald → journaalpost moet end-to-end idempotent
 * zijn EN faillible. Voorheen werd de replay-marker gezet vóór de markeer-
 * betaald-poging — als markeer-betaald faalde, blokkeerde de marker Mollie's
 * automatische retry → factuur bleef onbetaald, niemand zag het.
 *
 * Deze test borgt:
 *   1. Bij FAILURE van markeer-betaald: GEEN idempotency-marker → retry werkt
 *   2. Bij SUCCESS: marker gezet in zowel cache als ScriptProperties
 *   3. Replay binnen retentie: silent dupe-success, markeer-betaald niet opnieuw
 *   4. Script-restart (cache leeg, property nog aanwezig): herkend als dupe,
 *      cache wordt opnieuw gewarmd
 *   5. ruimMollieIdempotencyOp_ verwijdert entries > 90 dagen, jongere blijven
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(overrides = {}) {
  const cacheStore = overrides.cacheStore || {};
  const propStore  = overrides.propStore  || {};

  return createGasRuntime(['Mollie.gs'], {
    CacheService: {
      getScriptCache: () => ({
        get:    (k) => (k in cacheStore ? cacheStore[k] : null),
        put:    (k, v, _ttl) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty:    (k) => (k in propStore ? propStore[k] : null),
        setProperty:    (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
        getProperties:  () => Object.assign({}, propStore),
      }),
      getUserProperties: () => ({
        getProperty: () => null,
        setProperty: () => {},
      }),
    },
    safeAuditLog_: jest.fn(),
    __cacheStore: cacheStore,
    __propStore:  propStore,
  });
}

describe('CYCLE 90: Mollie webhook idempotency end-to-end', () => {
  test('isMollieReedsVerwerkt_: false als geen cache én geen property', () => {
    const ctx = maakCtx();
    expect(ctx.isMollieReedsVerwerkt_('tr_abc12345')).toBe(false);
  });

  test('markeerMollieVerwerkt_: zet zowel cache als ScriptProperty', () => {
    const cacheStore = {};
    const propStore  = {};
    const ctx = maakCtx({ cacheStore, propStore });
    ctx.markeerMollieVerwerkt_('tr_abc12345');
    expect(cacheStore['mollie_webhook_tr_abc12345']).toBe('1');
    expect(propStore['mollie_completed_tr_abc12345']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('isMollieReedsVerwerkt_: cache-hit → true', () => {
    const cacheStore = { 'mollie_webhook_tr_xyz999': '1' };
    const ctx = maakCtx({ cacheStore });
    expect(ctx.isMollieReedsVerwerkt_('tr_xyz999')).toBe(true);
  });

  test('isMollieReedsVerwerkt_: cache leeg maar property aanwezig → true + cache opnieuw gewarmd', () => {
    const cacheStore = {};
    const propStore  = { 'mollie_completed_tr_zzz111': new Date().toISOString() };
    const ctx = maakCtx({ cacheStore, propStore });
    expect(ctx.isMollieReedsVerwerkt_('tr_zzz111')).toBe(true);
    expect(cacheStore['mollie_webhook_tr_zzz111']).toBe('1');
  });

  test('isMollieReedsVerwerkt_: lege paymentId → false (geen crash)', () => {
    const ctx = maakCtx();
    expect(ctx.isMollieReedsVerwerkt_('')).toBe(false);
    expect(ctx.isMollieReedsVerwerkt_(null)).toBe(false);
    expect(ctx.isMollieReedsVerwerkt_(undefined)).toBe(false);
  });

  test('ruimMollieIdempotencyOp_: verwijdert entries > 90 dagen, bewaart recente', () => {
    const oud  = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const vers = new Date(Date.now() -  10 * 24 * 60 * 60 * 1000).toISOString();
    const propStore = {
      'mollie_completed_tr_oud1':  oud,
      'mollie_completed_tr_oud2':  oud,
      'mollie_completed_tr_nieuw': vers,
      'andere_property':           'ongerelateerd',
    };
    const ctx = maakCtx({ propStore });
    const res = ctx.ruimMollieIdempotencyOp_();
    expect(res.verwijderd).toBe(2);
    expect(propStore['mollie_completed_tr_oud1']).toBeUndefined();
    expect(propStore['mollie_completed_tr_oud2']).toBeUndefined();
    expect(propStore['mollie_completed_tr_nieuw']).toBe(vers);
    expect(propStore['andere_property']).toBe('ongerelateerd');
  });

  test('ruimMollieIdempotencyOp_: ongeldige timestamp wordt als oud beschouwd → verwijderd', () => {
    const propStore = {
      'mollie_completed_tr_bug':   'niet-een-datum',
      'mollie_completed_tr_recht': new Date().toISOString(),
    };
    const ctx = maakCtx({ propStore });
    const res = ctx.ruimMollieIdempotencyOp_();
    expect(res.verwijderd).toBe(1);
    expect(propStore['mollie_completed_tr_bug']).toBeUndefined();
    expect(propStore['mollie_completed_tr_recht']).toBeDefined();
  });
});

describe('CYCLE 90: webhook-flow markeert NIET bij failure (kern van de fix)', () => {
  function maakWebhookCtx(opts) {
    opts = opts || {};
    const cacheStore = {};
    const propStore  = {};
    const ctx = createGasRuntime(['Mollie.gs'], {
      CacheService: {
        getScriptCache: () => ({
          get:    (k) => (k in cacheStore ? cacheStore[k] : null),
          put:    (k, v) => { cacheStore[k] = v; },
          remove: (k) => { delete cacheStore[k]; },
        }),
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in propStore ? propStore[k] : null),
          setProperty: (k, v) => { propStore[k] = v; },
          deleteProperty: (k) => { delete propStore[k]; },
        }),
        getUserProperties: () => ({
          getProperty: (k) => k === 'MOLLIE_API_KEY' ? 'live_test' : null,
        }),
      },
      // ontsleutelString_ identity (geen versleuteling in test)
      ontsleutelString_: (s) => s,
      // Geen signature-secret → veiligheids-pad wordt overgeslagen
      MOLLIE_WEBHOOK_SECRET_PROP: 'MOLLIE_WEBHOOK_SECRET',
      // Mollie API mock: status 'paid' + metadata
      veiligFetch_: () => ({
        getResponseCode: () => 200,
        getContentText:  () => JSON.stringify({
          status: 'paid',
          metadata: { factuurnummer: opts.factuurnummer || '2026-001' },
        }),
      }),
      // markeer-betaald: of throw of return success
      markeerVerkoopfactuurBetaald: opts.markeerImpl || (() => ({ ok: true })),
      safeAuditLog_: jest.fn(),
      __cacheStore: cacheStore,
      __propStore:  propStore,
    });
    return ctx;
  }

  test('markeer-betaald FAALT → return error, GEEN cache/property marker', () => {
    const ctx = maakWebhookCtx({
      markeerImpl: () => { throw new Error('Journaalpost faalde'); },
    });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_abc12345678' });
    expect(res.succes).toBe(false);
    expect(res.fout).toMatch(/Markeer-betaald faalde/);
    expect(ctx.__cacheStore['mollie_webhook_tr_abc12345678']).toBeUndefined();
    expect(ctx.__propStore['mollie_completed_tr_abc12345678']).toBeUndefined();
  });

  test('markeer-betaald SUCCES → cache én property gezet', () => {
    const ctx = maakWebhookCtx({
      markeerImpl: () => ({ ok: true, bericht: 'Factuur betaald' }),
    });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_def98765432' });
    expect(res.succes).toBe(true);
    expect(res.factuurnummer).toBe('2026-001');
    expect(ctx.__cacheStore['mollie_webhook_tr_def98765432']).toBe('1');
    expect(ctx.__propStore['mollie_completed_tr_def98765432']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('Replay na eerdere succes → dupe-response, markeer-betaald NIET opnieuw aangeroepen', () => {
    const markeerSpy = jest.fn(() => ({ ok: true }));
    const ctx = maakWebhookCtx({ markeerImpl: markeerSpy });
    ctx.verwerkMollieWebhook_({ id: 'tr_repeat999999' });
    expect(markeerSpy).toHaveBeenCalledTimes(1);
    const res2 = ctx.verwerkMollieWebhook_({ id: 'tr_repeat999999' });
    expect(res2.succes).toBe(true);
    expect(res2.dupe).toBe(true);
    expect(markeerSpy).toHaveBeenCalledTimes(1); // NIET opnieuw
  });

  test('Retry na eerdere failure → markeer-betaald wél opnieuw aangeroepen', () => {
    let count = 0;
    const markeerSpy = jest.fn(() => {
      count++;
      if (count === 1) throw new Error('Tijdelijke fout');
      return { ok: true };
    });
    const ctx = maakWebhookCtx({ markeerImpl: markeerSpy });

    const res1 = ctx.verwerkMollieWebhook_({ id: 'tr_retry22222222' });
    expect(res1.succes).toBe(false);

    const res2 = ctx.verwerkMollieWebhook_({ id: 'tr_retry22222222' });
    expect(res2.succes).toBe(true);
    expect(markeerSpy).toHaveBeenCalledTimes(2);
    expect(ctx.__propStore['mollie_completed_tr_retry22222222']).toBeDefined();
  });
});

/**
 * tests/unit/f-scale-142-otp-cleanup.test.js
 *
 * F-SCALE-142 — verlopen OTP-keys (otp_<email> + otp_ts_<email>) werden nooit
 * geveegd voor leads die wel een code aanvroegen maar niet activeerden →
 * ScriptProperties groeit richting het 500KB-quotum → server kan geen nieuwe
 * licenties/OTP's meer wegschrijven (verkoop staat stil). cleanupVerlopenOtpKeys_
 * veegt verlopen codes + oude rate-limit-stempels, idempotent en fail-safe.
 *
 * Ratel: deze asserties falen zónder de functie/fix.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(propStore) {
  const store = propStore || {};
  const ctx = createGasRuntime([CODE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.assign({}, store),
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
  });
  return { ctx, store };
}

const NU = Date.now();

describe('F-SCALE-142 — cleanupVerlopenOtpKeys_', () => {
  test('verlopen code + oude stempel weg; verse code + niet-OTP-key blijven', () => {
    const { ctx, store } = maakCtx({
      'otp_oud@x.nl':    JSON.stringify({ code: '111111', expiry: NU - 30 * 60 * 1000 }),  // 30 min verlopen (>5min marge)
      'otp_ts_oud@x.nl': String(NU - 2 * 3600 * 1000),                                     // 2u oud
      'otp_vers@x.nl':   JSON.stringify({ code: '222222', expiry: NU + 10 * 60 * 1000 }),  // nog 10 min geldig
      'otp_ts_vers@x.nl': String(NU - 5 * 60 * 1000),                                      // 5 min oud
      'BREVO_API_KEY':   'geheim',                                                          // niet-OTP → met rust
    });
    const n = ctx.cleanupVerlopenOtpKeys_();
    expect(n).toBe(2);
    expect(store['otp_oud@x.nl']).toBeUndefined();
    expect(store['otp_ts_oud@x.nl']).toBeUndefined();
    expect(store['otp_vers@x.nl']).toBeDefined();      // verse code blijft
    expect(store['otp_ts_vers@x.nl']).toBeDefined();   // verse stempel blijft
    expect(store['BREVO_API_KEY']).toBe('geheim');     // niet aangeraakt
  });

  test('corrupte otp-JSON wordt opgeruimd (geen crash)', () => {
    const { ctx, store } = maakCtx({ 'otp_bug@x.nl': 'geen-json' });
    const n = ctx.cleanupVerlopenOtpKeys_();
    expect(n).toBe(1);
    expect(store['otp_bug@x.nl']).toBeUndefined();
  });

  test('niets te doen → 0, store ongewijzigd', () => {
    const { ctx, store } = maakCtx({
      'otp_vers@x.nl': JSON.stringify({ code: '333333', expiry: NU + 5 * 60 * 1000 }),
      'PRODUCT_VERSIE': '2.1.0',
    });
    expect(ctx.cleanupVerlopenOtpKeys_()).toBe(0);
    expect(Object.keys(store).length).toBe(2);
  });

  test('drip-trigger roept de OTP-cleanup aan (broncode-borging)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(CODE_GS, 'utf8');
    const fn = src.slice(src.indexOf('function verstuurDripsDagelijks_'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/cleanupVerlopenOtpKeys_\(\)/);
  });
});

/**
 * tests/unit/drip-uit-unsubscribe.test.js
 *
 * Klant-wens: geen ongevraagde recurring mails. De onboarding-drips krijgen:
 *  - een globale kill-switch (DRIPS_ACTIEF='false') voor Sam,
 *  - een per-klant één-klik-afmelding (token-gevalideerd) via ?actie=drip-uit,
 *  - skip in de drip-loop voor afgemelde klanten.
 * Licentie-/activeringsmails lopen apart en blijven komen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function ctxMet(propStore) {
  const store = propStore || {};
  const ctx = createGasRuntime([CODE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getProperties: () => Object.assign({}, store),
      }),
    },
    Utilities: {
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    HtmlService: {
      createHtmlOutput: (h) => ({ _h: h, setTitle() { return this; } }),
    },
  });
  return { ctx, store };
}

const req = (params) => ({ parameter: params || {} });

describe('drip één-klik-afmelding', () => {
  test('_dripToken_ is deterministisch + matcht endpoint-validatie', () => {
    const { ctx } = ctxMet({});
    const a = ctx._dripToken_('Klant@X.nl');
    const b = ctx._dripToken_('klant@x.nl'); // genormaliseerd → zelfde token
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  test('geldig token → afgemeld + dripuit_-flag gezet', () => {
    const { ctx, store } = ctxMet({});
    const email = 'klant@x.nl';
    const res = ctx.dripUitEndpoint_(req({ e: email, t: ctx._dripToken_(email) }));
    expect(res._h).toMatch(/Afgemeld/);
    const flag = Object.keys(store).find((k) => k.indexOf('dripuit_') === 0);
    expect(flag).toBeDefined();
    expect(store[flag]).toBe('1');
  });

  test('ongeldig token → NIET afgemeld (geen sabotage van andermans adres)', () => {
    const { ctx, store } = ctxMet({});
    const res = ctx.dripUitEndpoint_(req({ e: 'klant@x.nl', t: 'FOUT' }));
    expect(res._h).toMatch(/ongeldig/i);
    expect(Object.keys(store).some((k) => k.indexOf('dripuit_') === 0)).toBe(false);
  });

  test('ontbrekende parameters → nette foutpagina, geen flag', () => {
    const { ctx, store } = ctxMet({});
    expect(ctx.dripUitEndpoint_(req({})) ._h).toMatch(/ongeldig/i);
    expect(Object.keys(store).length).toBe(0);
  });
});

describe('drip kill-switch + loop-skip (broncode-borging)', () => {
  const src = fs.readFileSync(CODE_GS, 'utf8');
  const drip = src.slice(src.indexOf('function verstuurDripsDagelijks_'));
  const body = drip.slice(0, drip.indexOf('\nfunction '));

  test('router heeft drip-uit met rate-limit', () => {
    expect(src).toMatch(/actie === 'drip-uit'[^\n]*rateLimit_[^\n]*dripUitEndpoint_/);
  });
  test('globale DRIPS_ACTIEF kill-switch stopt de drip-run', () => {
    expect(body).toMatch(/DRIPS_ACTIEF/);
    expect(body).toMatch(/=== 'false'/);
  });
  test('drip-loop slaat afgemelde klanten over', () => {
    expect(body).toMatch(/dripuit_'\s*\+\s*_rlHash_\(email\)/);
  });
  test('OTP-cleanup draait nog steeds (vóór de kill-switch)', () => {
    expect(body.indexOf('cleanupVerlopenOtpKeys_')).toBeLessThan(body.indexOf('DRIPS_ACTIEF'));
  });
});

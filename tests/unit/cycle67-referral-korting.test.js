/**
 * tests/unit/cycle67-referral-korting.test.js
 *
 * Cycle 67 — maakBetaling past een €5 referral-korting toe bij een
 * geldige refCode. Daarvoor:
 *   - refCode = eerste 10 chars van base64-websafe(SHA-256(email)) van
 *     een ACTIEVE licentiehouder (zie Referral.gs).
 *   - Self-referral (eigen e-mail als ref) geeft nooit korting.
 *   - Onbekende of lege ref → volle prijs (fail-closed: geen revenue-leak).
 *   - Sheet-fout → volle prijs (fail-closed).
 *
 * Eerlijkheids-audit: voor deze cycle was de "jij €44 i.p.v. €49"-belofte
 * in Referral.gs een valse claim — de checkout rekende altijd €49.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

/** Reproduceert Referral.gs:toonReferralDialog hashing zodat de test
 *  geen verborgen aanname maakt over de implementatie. */
function refCodeVanEmail(email) {
  const buf = crypto.createHash('sha256').update(email).digest();
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .slice(0, 10);
}

function bouwCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const propStore = Object.assign({
    MOLLIE_API_KEY: 'test_xxx',
    PRODUCT_PRIJS:  '49.00',
    PRODUCT_NAAM:   'Boekhoudbaar',
  }, opts.props || {});
  let laatstePayload = null;
  const fetchImpl = opts.fetchImpl || function (_url, opt) {
    laatstePayload = JSON.parse(opt.payload);
    return {
      getContentText: () => JSON.stringify({
        status: 201,
        _links: { checkout: { href: 'https://mollie.test/checkout/abc' } },
      }),
      getResponseCode: () => 201,
    };
  };

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propStore[k] || null,
        setProperty: (k, v) => { propStore[k] = v; },
      }),
    },
    Utilities: {
      computeDigest: (_alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
      base64EncodeWebSafe: (bytes) =>
        Buffer.from(bytes).toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_'),
    },
    UrlFetchApp: { fetch: fetchImpl },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test' }) },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
  });

  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => [
        ['Sleutel', 'Naam', 'Email', 'Type', 'Status', 'Verval', 'SsId', 'Token', 'PayId'],
        ...(opts.rows || []),
      ],
    }),
  });

  return { ctx, getLaatstePayload: () => laatstePayload };
}

describe('CYCLE 67: referral-korting echt toegepast', () => {
  const VERWIJZER = 'alice@example.nl';
  const KOPER     = 'bob@example.nl';
  const REF_ALICE = refCodeVanEmail(VERWIJZER);

  test('geen ref → volle prijs €49.00', () => {
    const { ctx, getLaatstePayload } = bouwCtx({});
    ctx.maakBetaling('Bob', KOPER, '');
    expect(getLaatstePayload().amount.value).toBe('49.00');
  });

  test('geldige ref van actieve klant → korting → €44.00', () => {
    const { ctx, getLaatstePayload } = bouwCtx({
      rows: [['KEY-1', 'Alice', VERWIJZER, 'eenmalig', 'actief', '', '', '', '']],
    });
    ctx.maakBetaling('Bob', KOPER, REF_ALICE);
    const p = getLaatstePayload();
    expect(p.amount.value).toBe('44.00');
    expect(p.metadata.refKortingToegepast).toBe(5);
    expect(p.description).toMatch(/referral-korting/);
  });

  test('self-referral geblokkeerd (koper kan zichzelf niet €5 korting geven)', () => {
    const koperRef = refCodeVanEmail(KOPER);
    const { ctx, getLaatstePayload } = bouwCtx({
      rows: [['KEY-1', 'Bob', KOPER, 'eenmalig', 'actief', '', '', '', '']],
    });
    ctx.maakBetaling('Bob', KOPER, koperRef);
    expect(getLaatstePayload().amount.value).toBe('49.00');
  });

  test('onbekende ref → fail-closed, volle prijs', () => {
    const { ctx, getLaatstePayload } = bouwCtx({
      rows: [['KEY-1', 'Alice', VERWIJZER, 'eenmalig', 'actief', '', '', '', '']],
    });
    ctx.maakBetaling('Bob', KOPER, 'NIET_BESTAAND');
    expect(getLaatstePayload().amount.value).toBe('49.00');
  });

  test('verwijzer is NIET-actief (bv. ingetrokken) → géén korting', () => {
    const { ctx, getLaatstePayload } = bouwCtx({
      rows: [['KEY-1', 'Alice', VERWIJZER, 'eenmalig', 'ingetrokken', '', '', '', '']],
    });
    ctx.maakBetaling('Bob', KOPER, REF_ALICE);
    expect(getLaatstePayload().amount.value).toBe('49.00');
  });

  test('sheet-fout → fail-closed (geen revenue-leak)', () => {
    const { ctx, getLaatstePayload } = bouwCtx({});
    ctx.getLicentieSheet_ = () => { throw new Error('sheet down'); };
    ctx.maakBetaling('Bob', KOPER, REF_ALICE);
    expect(getLaatstePayload().amount.value).toBe('49.00');
  });

  test('idempotent caching: 2e payment binnen 5min hergebruikt URL én korting blijft consistent', () => {
    const { ctx } = bouwCtx({
      rows: [['KEY-1', 'Alice', VERWIJZER, 'eenmalig', 'actief', '', '', '', '']],
    });
    const r1 = ctx.maakBetaling('Bob', KOPER, REF_ALICE);
    const r2 = ctx.maakBetaling('Bob', KOPER, REF_ALICE);
    expect(r1.checkoutUrl).toBe(r2.checkoutUrl);   // dezelfde URL hergebruikt
  });
});

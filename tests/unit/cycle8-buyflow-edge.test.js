/**
 * tests/unit/cycle8-buyflow-edge.test.js
 *
 * Buy-flow edge-case-hardening voor licence-server/Code.gs:maakBetaling.
 *
 * Drie nieuwe defenses:
 *   - Max-length klantnaam (200) + email (254 RFC 5321)
 *   - Idempotency tegen dubbel-klik (zelfde email binnen 5 min → cache-URL)
 *   - Rate-limit per email (5/uur) tegen API-spam
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const fetchCalls = [];
  const propStore = Object.assign({
    'MOLLIE_API_KEY': 'test_xxx',
    'PRODUCT_PRIJS': '49.00',
    'PRODUCT_NAAM': 'Boekhoudbaar',
  }, opts.props || {});

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v, ttl) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propStore[k] || null,
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    Utilities: {
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
      getUuid: () => 'mock-uuid-' + Math.random().toString(36),
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        fetchCalls.push({ url, opt });
        if (opts.mollieGooit) throw new Error(opts.mollieGooit);
        return {
          getContentText: () => JSON.stringify(opts.mollieResp || {
            _links: { checkout: { href: 'https://mollie.com/checkout/' + Math.random() } },
          }),
          getResponseCode: () => 200,
        };
      },
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/test/exec' }),
    },
  });
  return { ctx, cacheStore, fetchCalls, propStore };
}

describe('CYCLE 8: maakBetaling — max-length defense', () => {
  test('Klantnaam > 200 tekens → fout zonder Mollie-call', () => {
    const { ctx, fetchCalls } = maakCtx();
    const naam = 'A'.repeat(201);
    const r = ctx.maakBetaling(naam, 'klant@x.nl', '');
    expect(r.fout).toMatch(/te lang/i);
    expect(fetchCalls.length).toBe(0);
  });

  test('Email > 254 tekens → fout zonder Mollie-call', () => {
    const { ctx, fetchCalls } = maakCtx();
    const email = 'a'.repeat(250) + '@x.nl';  // 255 chars
    const r = ctx.maakBetaling('Klant', email, '');
    expect(r.fout).toMatch(/te lang/i);
    expect(fetchCalls.length).toBe(0);
  });

  test('Normale naam + email → succes', () => {
    const { ctx, fetchCalls } = maakCtx();
    const r = ctx.maakBetaling('Klant BV', 'klant@bedrijf.nl', '');
    expect(r.checkoutUrl).toMatch(/mollie/);
    expect(fetchCalls.length).toBe(1);
  });
});

describe('CYCLE 8: maakBetaling — idempotency tegen dubbel-klik', () => {
  test('Tweede call binnen 5min met zelfde email → zelfde checkout-URL, geen tweede Mollie-call', () => {
    const { ctx, fetchCalls } = maakCtx();
    const r1 = ctx.maakBetaling('Klant', 'klant@x.nl', '');
    const r2 = ctx.maakBetaling('Klant', 'klant@x.nl', '');
    expect(r1.checkoutUrl).toBe(r2.checkoutUrl);
    expect(fetchCalls.length).toBe(1);  // niet 2
  });

  test('Andere email → eigen checkout-URL (geen kruisbesmetting)', () => {
    const { ctx, fetchCalls } = maakCtx();
    ctx.maakBetaling('Klant A', 'a@x.nl', '');
    ctx.maakBetaling('Klant B', 'b@x.nl', '');
    expect(fetchCalls.length).toBe(2);
  });

  test('Email-case is genormaliseerd (Klant@X.NL === klant@x.nl)', () => {
    const { ctx, fetchCalls } = maakCtx();
    ctx.maakBetaling('Klant', 'Klant@X.NL', '');
    ctx.maakBetaling('Klant', 'klant@x.nl', '');
    expect(fetchCalls.length).toBe(1);  // beide cases tellen als zelfde idempotency-key
  });
});

describe('CYCLE 8: maakBetaling — rate-limit per email', () => {
  test('5 betalingen binnen uur → 6e wordt geblokkeerd', () => {
    const { ctx, fetchCalls, cacheStore } = maakCtx();
    // Clear cache tussen calls om idempotency NIET te triggeren —
    // we testen rate-limit, niet idempotency. Manueel checkout-URL-cache wissen.
    for (let i = 0; i < 5; i++) {
      const r = ctx.maakBetaling('Klant', 'klant@x.nl', '');
      expect(r.checkoutUrl).toBeTruthy();
      // Wis alleen checkout-URL-cache, niet rate-limit-counter
      Object.keys(cacheStore).forEach((k) => {
        if (k.indexOf('maakBetaling_') === 0 && k.indexOf('rate_') !== 0) delete cacheStore[k];
      });
    }
    const r6 = ctx.maakBetaling('Klant', 'klant@x.nl', '');
    expect(r6.fout).toMatch(/te veel/i);
    expect(fetchCalls.length).toBe(5);  // 6e nooit naar Mollie
  });
});

describe('CYCLE 8: regressie — bestaande validaties blijven werken', () => {
  test('Lege naam → fout (regressie)', () => {
    const { ctx } = maakCtx();
    expect(ctx.maakBetaling('', 'k@x.nl', '').fout).toMatch(/verplicht/i);
  });
  test('Ongeldig email-format → fout (regressie)', () => {
    const { ctx } = maakCtx();
    expect(ctx.maakBetaling('Klant', 'niet-een-email', '').fout).toMatch(/geldig/i);
  });
});

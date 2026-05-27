/**
 * tests/unit/cycle13-herstuur-licentie-endpoint.test.js
 *
 * Klant-self-service: licentie-mail opnieuw versturen op basis van email.
 * Voorheen: alleen owner via editor met sleutel als arg. Nu: publieke
 * endpoint met rate-limit + enumeration-protection.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const propStore = {};
  const mailCalls = [];
  const stuurCalls = [];

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
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    Utilities: {
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    MailApp: { sendEmail: (...a) => mailCalls.push(a) },
  });

  // Mock getLicentieSheet_ — opts.rows is array van [sleutel, naam, email, ...]
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({ getValues: () => [['Sleutel','Naam','Email','Type','Status'], ...(opts.rows || [])] }),
  });
  // Mock stuurLicentiemail_ om calls te tellen
  ctx.stuurLicentiemail_ = (naam, email, sleutel) => stuurCalls.push({ naam, email, sleutel });

  return { ctx, mailCalls, stuurCalls };
}

function body(resp) {
  expect(resp).toBeTruthy();
  return JSON.parse(resp._txt);
}

function req(params) { return { parameter: params || {} }; }

describe('CYCLE 13: herstuurLicentieEndpoint_', () => {
  test('Geldig email + actieve licentie → mail opnieuw verstuurd', () => {
    const { ctx, stuurCalls } = maakCtx({
      rows: [['ABCDE1', 'Klant', 'klant@x.nl', 'Standaard', 'Actief']],
    });
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'klant@x.nl' }));
    expect(body(r).ok).toBe(true);
    expect(stuurCalls.length).toBe(1);
    expect(stuurCalls[0]).toEqual({ naam: 'Klant', email: 'klant@x.nl', sleutel: 'ABCDE1' });
  });

  test('Geen actieve licentie → ZELFDE respons (geen email-enumeration leak)', () => {
    const { ctx, stuurCalls } = maakCtx({ rows: [] });
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'onbekend@x.nl' }));
    expect(body(r).ok).toBe(true);
    expect(body(r).bericht).toMatch(/Als dit e-mailadres/i);
    expect(stuurCalls.length).toBe(0);
  });

  test('Bekend email met INACTIEVE licentie → ZELFDE respons + geen mail', () => {
    const { ctx, stuurCalls } = maakCtx({
      rows: [['ABCDE1', 'Klant', 'klant@x.nl', 'Standaard', 'Bounce']],
    });
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'klant@x.nl' }));
    expect(body(r).ok).toBe(true);
    expect(stuurCalls.length).toBe(0);
  });

  test('Email-case wordt genormaliseerd', () => {
    const { ctx, stuurCalls } = maakCtx({
      rows: [['ABCDE1', 'Klant', 'klant@x.nl', 'Standaard', 'Actief']],
    });
    ctx.herstuurLicentieEndpoint_(req({ email: 'KLANT@X.NL' }));
    expect(stuurCalls.length).toBe(1);
  });

  test('Ongeldig email-format → fout, geen lookup', () => {
    const { ctx, stuurCalls } = maakCtx({ rows: [] });
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'niet-een-email' }));
    expect(body(r).ok).toBe(false);
    expect(stuurCalls.length).toBe(0);
  });

  test('Lege email → fout', () => {
    const { ctx } = maakCtx({ rows: [] });
    const r = ctx.herstuurLicentieEndpoint_(req({}));
    expect(body(r).ok).toBe(false);
  });

  test('Email > 254 chars → fout (defense vs payload-aanval)', () => {
    const { ctx, stuurCalls } = maakCtx({ rows: [] });
    const longEmail = 'a'.repeat(250) + '@x.nl';
    const r = ctx.herstuurLicentieEndpoint_(req({ email: longEmail }));
    expect(body(r).ok).toBe(false);
    expect(stuurCalls.length).toBe(0);
  });

  test('stuurLicentiemail_ throw → klant ziet ZELFDE generieke respons (geen interne errors leaken)', () => {
    const { ctx } = maakCtx({
      rows: [['ABCDE1', 'Klant', 'klant@x.nl', 'Standaard', 'Actief']],
    });
    ctx.stuurLicentiemail_ = () => { throw new Error('Brevo down'); };
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'klant@x.nl' }));
    expect(body(r).ok).toBe(true);
    expect(body(r).bericht).toMatch(/Als dit e-mailadres/i);
  });

  test('Sheet-fout → fail-silent met generieke respons', () => {
    const { ctx } = maakCtx({});
    ctx.getLicentieSheet_ = () => { throw new Error('Sheet locked'); };
    const r = ctx.herstuurLicentieEndpoint_(req({ email: 'klant@x.nl' }));
    expect(body(r).ok).toBe(true);
  });
});

describe('CYCLE 13: doGet routing voor herstuur-licentie', () => {
  const src = fs.readFileSync(CODE_GS, 'utf8');
  test('actie === "herstuur-licentie" dispatched naar endpoint met rate-limit', () => {
    expect(src).toMatch(/actie === ['"]herstuur-licentie['"]/);
    expect(src).toMatch(/rateLimit_\(e,\s*\{[^}]*actie:\s*['"]herstuur-licentie['"][^}]*perEmail:\s*3/);
    expect(src).toMatch(/herstuurLicentieEndpoint_/);
  });
});

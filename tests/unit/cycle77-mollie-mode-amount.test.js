/**
 * tests/unit/cycle77-mollie-mode-amount.test.js
 *
 * Cycle 77 — defense-in-depth op de Mollie-webhook. Naast de bestaande
 * server-side API-callback (die status='paid' bevestigt met onze eigen
 * Bearer-token) moeten we ook:
 *   - de mode controleren (live-key ⇒ live-payment, test-key ⇒ test-payment)
 *   - het bedrag controleren (minimaal PRODUCT_PRIJS − REF_KORTING, currency EUR)
 *
 * Aanvalsscenario zonder deze checks:
 *   Attacker maakt zelf een test-payment van €0,01 op onze Mollie-account
 *   (Mollie staat test-mode toe op elke live-account). Vervolgens POST hij
 *   ?id=tr_dat_id naar onze prod-webhook. De API geeft status='paid' →
 *   we activeren een echte licentie zonder dat er €49 binnenkwam.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const propStore = Object.assign({
    MOLLIE_API_KEY: opts.apiKey || 'live_realkey',
    TEMPLATE_SS_ID: 'SHEET_TEMPLATE_ID',
    PRODUCT_PRIJS: '49.00',
  }, opts.props || {});
  const appendedRows = [];
  const mailCalls = [];

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
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          status: 'paid',
          mode: opts.mode || 'live',
          amount: opts.amount || { value: '49.00', currency: 'EUR' },
          metadata: { naam: 'Test Klant', email: 'klant@example.nl', ref: '' },
        }),
      }),
    },
    Utilities: {
      getUuid: () => '12345678-90ab-cdef-1234-567890abcdef',
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    MailApp: { sendEmail: (...a) => mailCalls.push(a) },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { TEXT: 'text', JSON: 'json' },
    },
  });

  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({ getValues: () => [['Sleutel', 'Naam', 'Email']] }),
    appendRow: (rij) => appendedRows.push(rij),
    getRange: () => ({ setValue: () => {} }),
  });
  ctx.borgExtraKolommen_ = () => {};
  ctx.stuurLicentiemail_ = () => {};

  return { ctx, appendedRows, mailCalls, cacheStore, propStore };
}

describe('CYCLE 77: Mollie webhook mode + bedrag verificatie', () => {
  test('live-key + live-mode + €49 EUR: provisioneert normaal', () => {
    const { ctx, appendedRows } = maakCtx({ apiKey: 'live_xxx', mode: 'live' });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_ok' } });
    expect(appendedRows).toHaveLength(1);
  });

  test('live-key + test-mode betaling: REJECTED (geen provisioning)', () => {
    const { ctx, appendedRows } = maakCtx({ apiKey: 'live_xxx', mode: 'test' });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_fake' } });
    expect(appendedRows).toHaveLength(0);
  });

  test('test-key + test-mode betaling: ACCEPTED (test-omgeving werkt)', () => {
    const { ctx, appendedRows } = maakCtx({ apiKey: 'test_xxx', mode: 'test' });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_testok' } });
    expect(appendedRows).toHaveLength(1);
  });

  test('bedrag €0,01 (te laag): REJECTED', () => {
    const { ctx, appendedRows } = maakCtx({
      apiKey: 'live_xxx', mode: 'live',
      amount: { value: '0.01', currency: 'EUR' },
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_cheap' } });
    expect(appendedRows).toHaveLength(0);
  });

  test('bedrag €44 (referral-korting): ACCEPTED', () => {
    const { ctx, appendedRows } = maakCtx({
      apiKey: 'live_xxx', mode: 'live',
      amount: { value: '44.00', currency: 'EUR' },
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_ref' } });
    expect(appendedRows).toHaveLength(1);
  });

  test('bedrag €43,99 (net onder referral): REJECTED', () => {
    const { ctx, appendedRows } = maakCtx({
      apiKey: 'live_xxx', mode: 'live',
      amount: { value: '43.99', currency: 'EUR' },
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_almostref' } });
    expect(appendedRows).toHaveLength(0);
  });

  test('currency USD: REJECTED (alleen EUR toegestaan)', () => {
    const { ctx, appendedRows } = maakCtx({
      apiKey: 'live_xxx', mode: 'live',
      amount: { value: '49.00', currency: 'USD' },
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_usd' } });
    expect(appendedRows).toHaveLength(0);
  });

  test('PRODUCT_PRIJS in centen (legacy "4900"): self-heal compatible — €49 wordt geaccepteerd', () => {
    // zelfHerstelProductConfig_ zou dit normaal repareren bij doGet, maar de
    // webhook moet defensief omgaan met de oude waarde als die nog niet is
    // gecorrigeerd (zelfde fallback-logica als in maakBetaling/betaalPagina_).
    const { ctx, appendedRows } = maakCtx({
      apiKey: 'live_xxx', mode: 'live',
      props: { PRODUCT_PRIJS: '4900' },
      amount: { value: '49.00', currency: 'EUR' },
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_legacy' } });
    expect(appendedRows).toHaveLength(1);
  });
});

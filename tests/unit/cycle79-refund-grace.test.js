/**
 * tests/unit/cycle79-refund-grace.test.js
 *
 * Cycle 79 — twee gerelateerde fixes:
 *   1. Refund/chargeback-flow in de Mollie-webhook (licentie intrekken
 *      zodra geld terug is)
 *   2. Grace-period (14 dagen) bij verlopen licentie in valideerEndpoint_
 *      zodat klanten niet midden in hun werk worden afgesloten
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakWebhookCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({
    MOLLIE_API_KEY: 'test_key',
    TEMPLATE_SS_ID: 'TPL',
  }, opts.props || {});
  const cacheStore = {};
  const setCalls = [];
  const auditCalls = [];

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
        getContentText: () => JSON.stringify(Object.assign({
          status: 'paid',
          mode: 'test',
          amount: { value: '49.00', currency: 'EUR' },
          metadata: { naam: 'Klant', email: 'k@x.nl' },
        }, opts.betaling || {})),
      }),
    },
    Utilities: {
      getUuid: () => '12345678-90ab-cdef-1234-567890abcdef',
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    MailApp: { sendEmail: () => {} },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { TEXT: 'text', JSON: 'json' },
    },
  });

  // Sheet-mock met PaymentId-kolom (index 8) + Status (index 4).
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => [
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt', 'Inst', 'Aangemaakt', 'PaymentId', 'LaatsteVal'],
        ...(opts.rows || []),
      ],
    }),
    appendRow: () => {},
    getRange: (rij, col) => ({
      setValue: (v) => setCalls.push({ rij, col, v }),
    }),
  });
  ctx.borgExtraKolommen_ = () => {};
  ctx.stuurLicentiemail_ = () => {};
  ctx.schrijfAuditLog_ = (a, d) => auditCalls.push({ a, d });

  return { ctx, setCalls, auditCalls, cacheStore };
}

describe('CYCLE 79: refund-flow', () => {
  test('volledige refund: licentie wordt ingetrokken (status → "Ingetrokken — refund")', () => {
    const { ctx, setCalls } = maakWebhookCtx({
      betaling: { amountRefunded: { value: '49.00', currency: 'EUR' } },
      rows: [['BKHE-1', 'Klant', 'k@x.nl', 'Standaard', 'Actief', '', '', new Date(), 'tr_refund', '']],
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_refund' } });
    const statusWrite = setCalls.find((c) => c.col === 5); // Status-kolom (1-based 5)
    expect(statusWrite).toBeTruthy();
    expect(statusWrite.v).toBe('Ingetrokken — refund');
  });

  test('chargeback: licentie wordt ingetrokken (status → "Ingetrokken — chargeback")', () => {
    const { ctx, setCalls } = maakWebhookCtx({
      betaling: { amountChargedBack: { value: '49.00', currency: 'EUR' } },
      rows: [['BKHE-2', 'X', 'a@b.nl', 'Standaard', 'Actief', '', '', new Date(), 'tr_cb', '']],
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_cb' } });
    const statusWrite = setCalls.find((c) => c.col === 5);
    expect(statusWrite).toBeTruthy();
    expect(statusWrite.v).toBe('Ingetrokken — chargeback');
  });

  test('partiële refund: licentie blijft actief, audit-log waarschuwing', () => {
    const { ctx, setCalls, auditCalls } = maakWebhookCtx({
      betaling: { amountRefunded: { value: '20.00', currency: 'EUR' } },
      rows: [['BKHE-3', 'X', 'a@b.nl', 'Standaard', 'Actief', '', '', new Date(), 'tr_partial', '']],
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_partial' } });
    // Geen Status-overschrijving (col 5)
    const statusWrite = setCalls.find((c) => c.col === 5);
    expect(statusWrite).toBeUndefined();
    // Wel audit-log
    expect(auditCalls.some((c) => /partiële refund/i.test(c.a))).toBe(true);
  });

  test('reeds ingetrokken licentie: geen dubbele update', () => {
    const { ctx, setCalls } = maakWebhookCtx({
      betaling: { amountRefunded: { value: '49.00', currency: 'EUR' } },
      rows: [['BKHE-4', 'X', 'a@b.nl', 'Standaard', 'Ingetrokken — refund', '', '', new Date(), 'tr_dup', '']],
    });
    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_dup' } });
    const statusWrite = setCalls.find((c) => c.col === 5);
    expect(statusWrite).toBeUndefined();
  });

  test('paymentId zonder matching rij: silent no-op (geen crash)', () => {
    const { ctx } = maakWebhookCtx({
      betaling: { amountRefunded: { value: '49.00', currency: 'EUR' } },
      rows: [], // geen matching rij
    });
    expect(() => ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_orphan' } })).not.toThrow();
  });
});

// ─────────────────────────────────────────────
//  GRACE-PERIOD bij valideerEndpoint_
// ─────────────────────────────────────────────

function maakValideerCtx(rows) {
  const propStore = {};
  const cacheStore = {};

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
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
  });

  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => [
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt'],
        ...rows,
      ],
    }),
    getRange: () => ({ setValue: () => {} }),
  });

  return ctx;
}

function parseResp(textOutput) {
  return JSON.parse(textOutput._txt);
}

describe('CYCLE 79: grace-period bij verlopen licentie', () => {
  const NU = new Date();
  const dagen = (n) => new Date(NU.getTime() + n * 86400000);

  test('geen vervaldatum: gewoon geldig (€49-eenmalig)', () => {
    const ctx = maakValideerCtx([['BKHE-A', 'N', 'e', 'Standaard', 'Actief', '']]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-A' } }));
    expect(r.geldig).toBe(true);
    expect(r.waarschuwing).toBeUndefined();
  });

  test('vervaldatum in toekomst: gewoon geldig', () => {
    const ctx = maakValideerCtx([['BKHE-B', 'N', 'e', 'Standaard', 'Actief', dagen(30)]]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-B' } }));
    expect(r.geldig).toBe(true);
    expect(r.waarschuwing).toBeUndefined();
  });

  test('5 dagen verlopen: geldig in grace, met waarschuwing', () => {
    const ctx = maakValideerCtx([['BKHE-C', 'N', 'e', 'Standaard', 'Actief', dagen(-5)]]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-C' } }));
    expect(r.geldig).toBe(true);
    expect(r.waarschuwing).toMatch(/9 dagen/);
  });

  test('14 dagen verlopen (rand): nog binnen grace', () => {
    // exact 14 dagen: dagenVerlopen = 14, grace = 14, dagenResterend = 0
    const ctx = maakValideerCtx([['BKHE-D', 'N', 'e', 'Standaard', 'Actief', dagen(-14)]]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-D' } }));
    expect(r.geldig).toBe(true);
    expect(r.waarschuwing).toMatch(/0 dagen/);
  });

  test('15 dagen verlopen: buiten grace, geldig=false', () => {
    const ctx = maakValideerCtx([['BKHE-E', 'N', 'e', 'Standaard', 'Actief', dagen(-15)]]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-E' } }));
    expect(r.geldig).toBe(false);
    expect(r.fout).toMatch(/verlopen/i);
  });

  test('1 dag verlopen: enkelvoud "1 dag" (geen typo "1 dagen")', () => {
    const ctx = maakValideerCtx([['BKHE-F', 'N', 'e', 'Standaard', 'Actief', dagen(-13)]]);
    const r = parseResp(ctx.valideerEndpoint_({ parameter: { sleutel: 'BKHE-F' } }));
    expect(r.geldig).toBe(true);
    expect(r.waarschuwing).toMatch(/1 dag /);
    expect(r.waarschuwing).not.toMatch(/1 dagen/);
  });
});

/**
 * tests/unit/cycle14-roteer-revoke-hardening.test.js
 *
 * roteerEndpoint_ + revokeEndpoint_ hardening:
 *   - Rate-limit op roteer (brute-force-vector dicht)
 *   - Generieke error-respons (geen err.message-lek)
 *   - Audit-log na succesvolle revoke (security-significant)
 *   - Log van failed admin-token-pogingen
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({}, opts.props || {});
  const cacheStore = {};
  const loggerCalls = [];
  const auditAppends = [];

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
    Utilities: {
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
      getUuid: () => 'aabbccdd-eeff-1122-3344-556677889900',
    },
    Logger: { log: (m) => loggerCalls.push(String(m)) },
    SpreadsheetApp: {
      openById: () => {
        if (opts.geenAuditSheet) return null;
        const auditSheet = {
          appendRow: (row) => auditAppends.push(row),
        };
        return {
          getSheetByName: (n) => (n === 'Revoke-audit' ? auditSheet : null),
          insertSheet: () => auditSheet,
        };
      },
    },
  });

  const HEADER = ['Sleutel', 'Naam', 'Email', 'Type', 'Status'];
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({ getValues: () => [HEADER, ...(opts.rows || [])] }),
    getRange: () => ({ setValue: () => {} }),
    appendRow: () => {},
  });
  return { ctx, loggerCalls, auditAppends, propStore };
}

function body(resp) {
  expect(resp).toBeTruthy();
  return JSON.parse(resp._txt);
}

function req(p) { return { parameter: p || {} }; }

describe('CYCLE 14: roteerEndpoint_ — error-respons hardening', () => {
  test('Sheet-fout → generieke "Interne fout" respons, geen err.message-lek', () => {
    const { ctx, loggerCalls } = maakCtx({});
    ctx.getLicentieSheet_ = () => { throw new Error('Sheet-internal-detail: row 5 col 3'); };
    const r = ctx.roteerEndpoint_(req({ sleutel: 'X', email: 'k@x.nl' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/Interne fout/);
    expect(body(r).fout).not.toMatch(/Sheet-internal-detail/);
    expect(loggerCalls.some((m) => /Sheet-internal-detail/.test(m))).toBe(true);
  });

  test('Sleutel + email niet gevonden → klant-vriendelijke fout (regressie)', () => {
    const { ctx } = maakCtx({ rows: [] });
    const r = ctx.roteerEndpoint_(req({ sleutel: 'X', email: 'k@x.nl' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/niet gevonden/);
  });

  test('Succesvolle rotatie → nieuwe sleutel terug (regressie)', () => {
    const { ctx } = maakCtx({
      rows: [['ABCDE1', 'Klant', 'klant@x.nl', 'Standaard', 'Actief']],
    });
    const r = ctx.roteerEndpoint_(req({ sleutel: 'ABCDE1', email: 'klant@x.nl' }));
    expect(body(r).ok).toBe(true);
    expect(body(r).nieuweSleutel).toBeTruthy();
  });
});

describe('CYCLE 14: revokeEndpoint_ — audit + error-respons hardening', () => {
  test('Geldig admin-token + bestaande sleutel → revoke + audit-log entries', () => {
    const { ctx, loggerCalls, auditAppends } = maakCtx({
      props: { 'ADMIN_REVOKE_TOKEN': 'geheim123', 'LICENTIE_SHEET_ID': 'sheet-id-xxx' },
      rows: [['ABCDE1', 'Klant', 'k@x.nl', 'Standaard', 'Actief']],
    });
    const r = ctx.revokeEndpoint_(req({ sleutel: 'ABCDE1', token: 'geheim123' }));
    expect(body(r).ok).toBe(true);
    // Logger.log capture'd revoke-event
    expect(loggerCalls.some((m) => /Licentie ingetrokken/.test(m))).toBe(true);
    // Revoke-audit sheet kreeg een rij erbij
    expect(auditAppends.length).toBe(1);
    expect(auditAppends[0][2]).toBe('Ingetrokken');  // Status-kolom
  });

  test('Ongeldig admin-token → unauthorized + Logger.log van poging (security-event)', () => {
    const { ctx, loggerCalls } = maakCtx({
      props: { 'ADMIN_REVOKE_TOKEN': 'geheim123' },
    });
    const r = ctx.revokeEndpoint_(req({ sleutel: 'ABCDE1', token: 'wrong' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/Ongeldig admin-token/);
    expect(loggerCalls.some((m) => /unauthorized/.test(m))).toBe(true);
  });

  test('Sheet-fout → generieke fout, geen interne err.message-lek', () => {
    const { ctx, loggerCalls } = maakCtx({
      props: { 'ADMIN_REVOKE_TOKEN': 'geheim' },
    });
    ctx.getLicentieSheet_ = () => { throw new Error('Internal-stack: line 42'); };
    const r = ctx.revokeEndpoint_(req({ sleutel: 'X', token: 'geheim' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/Interne fout/);
    expect(body(r).fout).not.toMatch(/Internal-stack/);
    expect(loggerCalls.some((m) => /Internal-stack/.test(m))).toBe(true);
  });

  test('Audit-sheet ontbreekt → revoke werkt nog (graceful degradation)', () => {
    const { ctx } = maakCtx({
      props: { 'ADMIN_REVOKE_TOKEN': 'geheim', 'LICENTIE_SHEET_ID': 'x' },
      rows: [['ABCDE1', 'K', 'e@x.nl', 'S', 'Actief']],
      geenAuditSheet: true,
    });
    const r = ctx.revokeEndpoint_(req({ sleutel: 'ABCDE1', token: 'geheim' }));
    expect(body(r).ok).toBe(true);
  });
});

describe('CYCLE 14: doGet routing — roteer met rate-limit', () => {
  const src = fs.readFileSync(CODE_GS, 'utf8');
  test('actie "roteer" gewrapt in rateLimit_ met perEmail=3', () => {
    expect(src).toMatch(/actie === ['"]roteer['"][\s\S]{0,200}rateLimit_\(e,[\s\S]{0,150}perEmail:\s*3/);
  });
  test('actie "revoke" GEEN rate-limit (admin-token al constant-time)', () => {
    // revoke route direct naar endpoint zonder rateLimit_-wrap
    expect(src).toMatch(/actie === ['"]revoke['"][\s]*\)\s*return revokeEndpoint_/);
  });
});

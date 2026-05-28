/**
 * tests/unit/cycle15-onboarded-hardening.test.js
 *
 * Cycle 15 — onboardedEndpoint_ hardening.
 *
 * Problemen vóór deze cycle:
 *   1. Geen rate-limit op de publieke `onboarded`-actie. Een aanvaller kon
 *      sleutels brute-forcen tegen onbeperkte snelheid.
 *   2. Een ingetrokken (revoked) of bounce-gemarkeerde licentie kon alsnog
 *      als "onboarded" worden gemarkeerd — verwarrend voor admin-overview
 *      en versluiert misbruik.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const setCalls = [];
  const cacheStore = {};
  const propStore = {};

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
  });

  // Mock getLicentieSheet_
  const header = ['Sleutel','Naam','Email','Type','Status','Datum','SsId','x','y','z','Onboarded op'];
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({ getValues: () => [header, ...(opts.rows || [])] }),
    getLastColumn: () => 11,
    getRange: (row, col) => ({ setValue: (v) => setCalls.push({ row, col, v }) }),
  });
  ctx.ensureOnboardedKolom_ = () => {};
  return { ctx, setCalls };
}

function body(resp) {
  expect(resp).toBeTruthy();
  return JSON.parse(resp._txt);
}

function req(params) { return { parameter: params || {} }; }

// Helper: bouw een licentie-rij met de kolommen die endpoint leest
function row(sleutel, status, ssId, onboarded) {
  return [sleutel, 'Klant', 'k@x.nl', 'Standaard', status, new Date(), ssId || '', '', '', '', onboarded || ''];
}

describe('CYCLE 15: onboardedEndpoint_ — status-actief check', () => {
  test('Actieve licentie + matching ssId → markeert onboarded', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Actief', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(true);
    expect(setCalls.length).toBe(1);
    expect(setCalls[0].col).toBe(11);
  });

  test('Status "Ingetrokken" → fout, geen schrijven', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Ingetrokken', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/niet actief/i);
    expect(setCalls.length).toBe(0);
  });

  test('Status "Bounce" → fout, geen schrijven', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Bounce', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(false);
    expect(setCalls.length).toBe(0);
  });

  test('Lege status → fout (defense-in-depth tegen corrupte rij)', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', '', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(false);
    expect(setCalls.length).toBe(0);
  });

  test('Status "Actief (handmatig)" → wordt geaccepteerd (startsWith-match)', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Actief (handmatig)', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(true);
    expect(setCalls.length).toBe(1);
  });

  test('SsId mismatch → fout (regressietest)', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Actief', 'SS_123', '')],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_ANDERS' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/komt niet overeen/i);
    expect(setCalls.length).toBe(0);
  });

  test('Idempotent: al onboarded → ok:true, already:true, geen overschrijven', () => {
    const { ctx, setCalls } = maakCtx({
      rows: [row('ABCDE1', 'Actief', 'SS_123', new Date('2026-01-01'))],
    });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'ABCDE1', ssId: 'SS_123' }));
    expect(body(r).ok).toBe(true);
    expect(body(r).already).toBe(true);
    expect(setCalls.length).toBe(0);
  });

  test('Onbekende sleutel → fout', () => {
    const { ctx } = maakCtx({ rows: [] });
    const r = ctx.onboardedEndpoint_(req({ sleutel: 'BESTAATNIET', ssId: 'SS_X' }));
    expect(body(r).ok).toBe(false);
    expect(body(r).fout).toMatch(/niet gevonden/i);
  });

  test('Lege sleutel → fout', () => {
    const { ctx } = maakCtx({ rows: [] });
    const r = ctx.onboardedEndpoint_(req({}));
    expect(body(r).ok).toBe(false);
  });
});

describe('CYCLE 15: doGet routing voor onboarded', () => {
  const src = fs.readFileSync(CODE_GS, 'utf8');

  test('actie === "onboarded" gaat door rateLimit_ vóór endpoint', () => {
    expect(src).toMatch(/actie === ['"]onboarded['"][^\n]*rateLimit_\(e,\s*\{[^}]*actie:\s*['"]onboarded['"]/);
  });

  test('Geen dubbele routing-regel voor "onboarded" (geen oude versie blijven staan)', () => {
    const occurrences = src.match(/actie === ['"]onboarded['"]/g) || [];
    expect(occurrences.length).toBe(1);
  });
});

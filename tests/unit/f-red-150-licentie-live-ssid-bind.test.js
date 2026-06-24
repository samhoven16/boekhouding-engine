/**
 * tests/unit/f-red-150-licentie-live-ssid-bind.test.js
 *
 * F-RED-150 (BLOKKER) — licentie-binding was te omzeilen: de client stuurde de
 * OPGESLAGEN ssId-ScriptProperty als installatie-ID mee. Die property is door
 * een knoeier te wissen/spoofen → een kopie stuurde dan een lege/oude
 * installatie en ontweek de server-bind (1 sleutel → oneindig kopieën).
 *
 * Fix: bind op de LIVE spreadsheet-ID (SpreadsheetApp.getActiveSpreadsheet().
 * getId()), die per kopie écht anders is en niet zonder code-herschrijving te
 * vervalsen. Fallback op de property alleen als er geen actieve sheet is.
 *
 * Ratel: de "live-ID wordt meegestuurd"-asserties falen zónder de fix
 * (dan zou de oude/lege opgeslagen ID in de URL staan).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');
const SERVER_URL = 'https://example.com/licence';
const SLEUTEL = 'BKHE-AAAA-BBBB-CCCC';

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({ licentiesleutel: SLEUTEL }, opts.props || {});
  const urls = [];

  const ctx = createGasRuntime([LICENTIE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = String(v); },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
      getUserProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        urls.push(url);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ geldig: true, naam: 'Jan', versie: 'Standaard' }) };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opts.liveSs === null ? null : { getId: () => (opts.liveSs || 'LIVE-NEW') }),
    },
  });
  ctx.getLicentieServerUrl_ = () => SERVER_URL;
  ctx.isEigenaarBypass_ = () => false;
  ctx.parseServerJson_ = (t) => { try { return JSON.parse(t); } catch (_) { return {}; } };
  return { ctx, urls, propStore };
}

function installatieUit(url) {
  const m = String(url).match(/[?&]installatie=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

describe('F-RED-150 — valideer bindt op de live spreadsheet-ID', () => {
  test('stuurt de LIVE-ID mee, niet de opgeslagen (spoofbare) property', () => {
    const { ctx, urls } = maakCtx({ props: { licentieSsId: 'STORED-OLD' }, liveSs: 'LIVE-NEW' });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(installatieUit(urls[0])).toBe('LIVE-NEW');     // ← faalt zónder fix
    expect(urls[0]).not.toMatch(/installatie=STORED-OLD/);
  });

  test('gewiste ssId-property → toch de live-ID (geen lege installatie die de bind ontwijkt)', () => {
    const { ctx, urls } = maakCtx({ props: {}, liveSs: 'LIVE-NEW' }); // geen licentieSsId
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(installatieUit(urls[0])).toBe('LIVE-NEW');     // ← was leeg zónder fix
  });

  test('geen actieve sheet (trigger-context) → fallback op opgeslagen property', () => {
    const { ctx, urls } = maakCtx({ props: { licentieSsId: 'STORED-OLD' }, liveSs: null });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(installatieUit(urls[0])).toBe('STORED-OLD');   // fallback, geen crash
  });

  test('legitieme niet-gekopieerde install: live == opgeslagen → ongewijzigd gedrag', () => {
    const { ctx, urls } = maakCtx({ props: { licentieSsId: 'SAME-ID' }, liveSs: 'SAME-ID' });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(installatieUit(urls[0])).toBe('SAME-ID');
  });
});

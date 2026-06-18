/**
 * tests/unit/f-scale-141-licentie-fallback-server.test.js
 *
 * F-SCALE-141 — de licentieserver is een single-point-of-failure voor de hele
 * klantenbasis. Code-helft van de mitigatie: de client probeert na een falende
 * primaire server een warme-standby (LICENTIE_SERVER_URL_FALLBACK) vóór hij op
 * de offline-grace terugvalt. (De standby-deploy + monitor zijn Sam's infra.)
 *
 * Borgt: fallback wordt gebruikt bij primaire uitval; NIET gebruikt als de
 * primaire server gezond is; en zonder geconfigureerde fallback is het gedrag
 * identiek aan voorheen (één server → offline-grace).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');
const SLEUTEL = 'BKHE-AAAA-BBBB-CCCC';

function okResp(body) {
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
}

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({
    licentiesleutel: SLEUTEL,
    LICENTIE_SERVER_URL: 'https://primary.example/licence',
  }, opts.props || {});
  const urls = [];

  const ctx = createGasRuntime([LICENTIE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = String(v); },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        urls.push(url);
        return (opts.fetchImpl || (() => { throw new Error('down'); }))(url);
      },
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'LIVE' }) },
  });
  ctx.isEigenaarBypass_ = () => false;
  ctx.parseServerJson_ = (t) => { try { return JSON.parse(t); } catch (_) { return {}; } };
  return { ctx, urls, propStore };
}

describe('F-SCALE-141 — warme-standby licentieserver (client-helft)', () => {
  test('primaire server down + standby gezond → standby gebruikt, geldig:true', () => {
    const { ctx, urls, propStore } = maakCtx({
      props: { LICENTIE_SERVER_URL_FALLBACK: 'https://standby.example/licence' },
      fetchImpl: (url) => {
        if (url.indexOf('primary') !== -1) throw new Error('primary down');
        return okResp({ geldig: true, naam: 'Jan', versie: 'Standaard' });
      },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);                          // ← gered door standby
    expect(urls.length).toBe(2);                          // primary, dan standby
    expect(urls[0]).toMatch(/primary/);
    expect(urls[1]).toMatch(/standby/);
    expect(propStore.licentieLaatstGelukt).toBeDefined(); // grace-basis ververst
  });

  test('primaire server gezond → standby NIET geraakt', () => {
    const { ctx, urls } = maakCtx({
      props: { LICENTIE_SERVER_URL_FALLBACK: 'https://standby.example/licence' },
      fetchImpl: () => okResp({ geldig: true, naam: 'Jan', versie: 'Standaard' }),
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(urls.length).toBe(1);                          // alleen primary
    expect(urls[0]).toMatch(/primary/);
  });

  test('geen fallback geconfigureerd → één poging, dan offline-grace (ongewijzigd)', () => {
    const { ctx, urls } = maakCtx({
      props: {}, // geen LICENTIE_SERVER_URL_FALLBACK, geen licentieLaatstGelukt
      fetchImpl: () => { throw new Error('down'); },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(urls.length).toBe(1);                          // geen tweede base
    expect(r.geldig).toBe(false);                         // offline-grace zonder eerdere OK
  });
});

/**
 * tests/unit/cycle82-stale-while-revalidate.test.js
 *
 * Cycle 82 — bounded offline-fallback voor de licentievalidatie.
 *
 * VOORHEEN: bij onbereikbare licence-server viel de validatie eindeloos terug
 * op LICENTIE_PROP_KEY-matching → permanent-down server = permanente "geldig"-
 * verklaring, óók voor ingetrokken sleutels.
 *
 * NU (audit ronde 2, juni 2026): 90 dagen offline-grace gemeten vanaf de
 * laatste SUCCESVOLLE server-call. Was 7 dagen — te kort bij Sam-uitval.
 * Daarna ongeldig met heldere foutmelding. Banner waarschuwt de klant
 * dagelijks vanaf moment dat we offline gaan.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');

const MS_PER_DAG = 86400000;
const SERVER_URL = 'https://example.com/licence';
const SLEUTEL    = 'BKHE-AAAA-BBBB-CCCC';

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({
    licentiesleutel:    SLEUTEL,
    licentieKlantnaam:  'Jan Jansen',
    licentieVersie:     'Standaard',
    licentieSsId:       'ss-1',
  }, opts.props || {});
  const userPropStore = Object.assign({}, opts.userProps || {});
  const toastCalls = [];

  const ctx = createGasRuntime([LICENTIE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = String(v); },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
      getUserProperties: () => ({
        getProperty: (k) => (k in userPropStore ? userPropStore[k] : null),
        setProperty: (k, v) => { userPropStore[k] = String(v); },
        deleteProperty: (k) => { delete userPropStore[k]; },
      }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        const fetchFn = opts.fetchImpl || (() => { throw new Error('Connection refused'); });
        return fetchFn(url);
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ toast: (msg, title, _sec) => toastCalls.push({ msg, title }) }),
    },
  });

  ctx.getLicentieServerUrl_ = () => SERVER_URL;
  ctx.isEigenaarBypass_ = () => false;
  ctx.parseServerJson_ = (t) => { try { return JSON.parse(t); } catch (_) { return {}; } };

  return { ctx, propStore, userPropStore, toastCalls };
}

function okResp(body) {
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify(body),
  };
}

describe('CYCLE 82: bounded stale-while-revalidate', () => {
  test('server bereikbaar + geldig: LICENTIE_LAATST_GELUKT wordt geschreven', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => okResp({ geldig: true, naam: 'Jan', versie: 'Standaard' }),
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(propStore.licentieLaatstGelukt).toBeDefined();
    expect(parseInt(propStore.licentieLaatstGelukt)).toBeGreaterThan(Date.now() - 5000);
  });

  test('server-200 met geldig=false: timestamp NIET bijgewerkt (revoke heeft effect)', () => {
    const { ctx, propStore } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 3 * MS_PER_DAG) },
      fetchImpl: () => okResp({ geldig: false, fout: 'Ingetrokken' }),
    });
    const tsVoor = propStore.licentieLaatstGelukt;
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);
    expect(propStore.licentieLaatstGelukt).toBe(tsVoor);
  });

  test('server onbereikbaar + 3 dagen sinds laatste OK: offline-geldig met dagenResterend=87 (default 90 dagen)', () => {
    const { ctx } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 3 * MS_PER_DAG) },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(r.offline).toBe(true);
    expect(r.dagenSinds).toBe(3);
    expect(r.dagenResterend).toBe(87);
  });

  test('server onbereikbaar + 90 dagen sinds laatste OK: ongeldig (grace verlopen)', () => {
    const { ctx } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 90 * MS_PER_DAG) },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);
    expect(r.fout).toMatch(/90 dagen/);
  });

  test('server onbereikbaar + nooit een succesvolle validatie: ongeldig', () => {
    const { ctx, propStore } = maakCtx({});
    delete propStore.licentieLaatstGelukt;
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);
    expect(r.fout).toMatch(/niet bereikbaar|geverifieerd/i);
  });

  test('server onbereikbaar + andere sleutel in props: ongeldig (geen offline-vervalsing)', () => {
    const { ctx } = maakCtx({
      props: {
        licentiesleutel: 'BKHE-OTHER-SLEUTEL',
        licentieLaatstGelukt: String(Date.now() - 1 * MS_PER_DAG),
      },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);
  });

  test('HTTP 500 met geldige offline-grace: blijft geldig (offline-true)', () => {
    const { ctx } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 2 * MS_PER_DAG) },
      fetchImpl: () => ({ getResponseCode: () => 500, getContentText: () => 'oops' }),
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(r.offline).toBe(true);
    expect(r.dagenResterend).toBe(88);  // 90 - 2 dagen sinds
  });

  test('audit-2: ScriptProperty LICENTIE_GRACE_DAGEN override werkt', () => {
    const { ctx } = maakCtx({
      props: {
        licentieLaatstGelukt: String(Date.now() - 5 * MS_PER_DAG),
        'LICENTIE_GRACE_DAGEN': '14',  // klant-override naar 14 dagen
      },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(true);
    expect(r.dagenResterend).toBe(9);  // 14 - 5
  });

  test('audit-2: override-validatie blokkeert onzin (0 of >3650) → fallback 90', () => {
    const { ctx } = maakCtx({
      props: {
        licentieLaatstGelukt: String(Date.now() - 3 * MS_PER_DAG),
        'LICENTIE_GRACE_DAGEN': '0',
      },
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.dagenResterend).toBe(87);  // default 90 gebruikt
  });
});

describe('CYCLE 82: isLicentieGeldig_ cache-TTL + banner', () => {
  test('online-geldig: cache 24u', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => okResp({ geldig: true, naam: 'Jan', versie: 'Standaard' }),
    });
    ctx.isLicentieGeldig_();
    const cacheTot = parseInt(propStore.licentieCacheGeldigTot);
    const verschil = cacheTot - Date.now();
    expect(verschil).toBeGreaterThan(23 * 3600 * 1000);
    expect(verschil).toBeLessThan(25 * 3600 * 1000);
  });

  test('offline-geldig: cache slechts 1u (snel opnieuw proberen)', () => {
    const { ctx, propStore } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 2 * MS_PER_DAG) },
    });
    ctx.isLicentieGeldig_();
    const cacheTot = parseInt(propStore.licentieCacheGeldigTot);
    const verschil = cacheTot - Date.now();
    expect(verschil).toBeGreaterThan(50 * 60 * 1000);
    expect(verschil).toBeLessThan(70 * 60 * 1000);
  });

  test('offline-geldig: toast-banner wordt getoond', () => {
    const { ctx, toastCalls } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 2 * MS_PER_DAG) },
    });
    ctx.isLicentieGeldig_();
    expect(toastCalls.length).toBe(1);
    expect(toastCalls[0].msg).toMatch(/88 dagen offline-toegang/);  // 90 - 2
  });

  test('offline-geldig met 1 dag resterend: enkelvoud "1 dag"', () => {
    const { ctx, toastCalls } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 89 * MS_PER_DAG) },  // 90 - 89 = 1
    });
    ctx.isLicentieGeldig_();
    expect(toastCalls[0].msg).toMatch(/Nog 1 dag offline-toegang/);
    expect(toastCalls[0].msg).not.toMatch(/1 dagen/);
  });

  test('offline-banner spamt niet binnen dezelfde dag bij gelijke dagenResterend', () => {
    const vandaag = new Date().toISOString().slice(0, 10);
    const { ctx, toastCalls } = maakCtx({
      props: { licentieLaatstGelukt: String(Date.now() - 2 * MS_PER_DAG) },
      userProps: { licentieOfflineBannerLaatst: vandaag + '|88' },  // 90 - 2
    });
    ctx.isLicentieGeldig_();
    expect(toastCalls.length).toBe(0);
  });
});

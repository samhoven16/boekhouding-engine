/**
 * tests/unit/m1-transient-grace-anker-niet-wissen.test.js
 *
 * RATEL (red-team M1) — bug-klasse: een TRANSIENTE serverfout mag het durende
 * offline-grace-anker (LICENTIE_LAATST_GELUKT_KEY) niet vernietigen.
 *
 * valideerLicentieOpServer_ wiste het anker bij ELK 200-antwoord met
 * geldig:false — óók bij rate-limit ('Te veel validatiepogingen') en interne
 * serverfouten ('Interne fout — probeer het later opnieuw'). Beide komen als
 * HTTP 200 binnen (ContentService). Eén tijdelijke serverhik wiste zo het
 * vangnet van een BETALENDE klant; werd de server daarna even onbereikbaar,
 * dan cascadeerde dat naar een harde lockout (90 dagen grace weg).
 *
 * Fix: het anker wordt alléén gewist bij een AUTHORITATIEVE afwijzing
 * (revoke/verlopen/ingetrokken/andere installatie/niet gevonden/bounce),
 * herkend aan server-veld permanent:true óf — backward-compat voor een nog-
 * niet-geüpdate server — aan de stabiele redentekst. Transiente fouten laten
 * het anker staan. De geldig:false wordt nog wél teruggegeven (deze call faalt),
 * maar het vangnet blijft intact voor echte onbereikbaarheid.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');
const MS_PER_DAG = 86400000;
const SERVER_URL = 'https://example.com/licence';
const SLEUTEL = 'BKHE-AAAA-BBBB-CCCC';

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({
    licentiesleutel: SLEUTEL,
    licentieKlantnaam: 'Jan Jansen',
    licentieVersie: 'Standaard',
    licentieSsId: 'ss-1',
    // standaard: een geldig, recent anker (3 dagen oud) dat we willen bewaken
    licentieLaatstGelukt: String(Date.now() - 3 * MS_PER_DAG),
  }, opts.props || {});

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
      fetch: (url) => (opts.fetchImpl || (() => { throw new Error('refused'); }))(url),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ toast: () => {} }) },
  });
  ctx.getLicentieServerUrl_ = () => SERVER_URL;
  ctx.getLicentieServerUrlFallback_ = () => '';
  ctx.isEigenaarBypass_ = () => false;
  ctx.parseServerJson_ = (t) => { try { return JSON.parse(t); } catch (_) { return {}; } };
  return { ctx, propStore };
}

const resp200 = (body) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(body) });

describe('M1 — transiente serverfout wist het grace-anker niet', () => {
  test('RATEL: rate-limit (200, geldig:false) BEHOUDT het anker', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, fout: 'Te veel validatiepogingen. Probeer over een uur opnieuw.' }),
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);                       // deze call faalt nog steeds
    expect(propStore.licentieLaatstGelukt).toBeDefined(); // maar het vangnet blijft
  });

  test('RATEL: interne serverfout (200, geldig:false) BEHOUDT het anker', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, fout: 'Interne fout — probeer het later opnieuw.' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeDefined();
  });

  test('geen-sleutel-fout BEHOUDT het anker (geen oordeel over de licentie)', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, fout: 'Geen sleutel opgegeven.' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeDefined();
  });

  test('onleesbaar 200-antwoord BEHOUDT het anker (niet als revoke behandelen)', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => ({ getResponseCode: () => 200, getContentText: () => 'niet-json' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeDefined();
  });
});

describe('M1 — authoritatieve afwijzing WIST het anker (abuse-closure intact)', () => {
  test('permanent:true (ingetrokken) → anker GEWIST', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, permanent: true, fout: 'Licentie is ingetrokken.' }),
    });
    const r = ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(r.geldig).toBe(false);
    expect(propStore.licentieLaatstGelukt).toBeUndefined();
  });

  test('permanent:true (verlopen) → anker GEWIST', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, permanent: true, fout: 'Licentie is verlopen.' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeUndefined();
  });

  test('backward-compat: OUDE server zonder permanent-veld, "ingetrokken" → anker GEWIST', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, fout: 'Licentie is ingetrokken.' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeUndefined();
  });

  test('backward-compat: "al actief op een andere installatie" → anker GEWIST', () => {
    const { ctx, propStore } = maakCtx({
      fetchImpl: () => resp200({ geldig: false, fout: 'Licentie is al actief op een andere installatie.' }),
    });
    ctx.valideerLicentieOpServer_(SLEUTEL);
    expect(propStore.licentieLaatstGelukt).toBeUndefined();
  });
});

describe('M1 — _isAuthoritatieveAfwijzing_ classificatie', () => {
  const { ctx } = maakCtx({});
  test('permanent:true → authoritatief', () => {
    expect(ctx._isAuthoritatieveAfwijzing_({ geldig: false, permanent: true })).toBe(true);
  });
  test('rate-limit / interne fout → NIET authoritatief', () => {
    expect(ctx._isAuthoritatieveAfwijzing_({ geldig: false, fout: 'Te veel validatiepogingen.' })).toBe(false);
    expect(ctx._isAuthoritatieveAfwijzing_({ geldig: false, fout: 'Interne fout — probeer het later opnieuw.' })).toBe(false);
  });
  test('geldig:true of ontbrekend → NIET authoritatief (nooit wissen bij succes)', () => {
    expect(ctx._isAuthoritatieveAfwijzing_({ geldig: true })).toBe(false);
    expect(ctx._isAuthoritatieveAfwijzing_(null)).toBe(false);
  });
});

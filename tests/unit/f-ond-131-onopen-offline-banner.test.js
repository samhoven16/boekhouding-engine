/**
 * tests/unit/f-ond-131-onopen-offline-banner.test.js
 *
 * F-OND-131 — het onOpen-pad (controleerLicentieEnKopie_) toonde GEEN
 * offline-grace-banner. Alleen isLicentieGeldig_ deed dat. Gevolg: een klant
 * die de sheet opent terwijl de server onbereikbaar is, kreeg geen
 * waarschuwing dat de grace tikt en zou na 90 dagen "ineens" buitengesloten
 * worden. Nu toont ook controleerLicentieEnKopie_ de banner bij offline-grace.
 *
 * Ratel: de "toast getoond"-assertie faalt zónder de fix.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');
const SLEUTEL = 'BKHE-AAAA-BBBB-CCCC';

function maakCtx(valideerResult) {
  const propStore = { licentiesleutel: SLEUTEL, licentieSsId: 'ss-1' };
  const userPropStore = { licentieLastCheck: '0' }; // stale → forceert validatie
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
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => 'ss-1', // matcht licentieSsId → geen kopie-lock
        toast: (msg, title, _sec) => toastCalls.push({ msg, title }),
      }),
    },
  });
  ctx.isEigenaarBypass_ = () => false;
  ctx.valideerLicentieOpServer_ = () => valideerResult;
  return { ctx, toastCalls, userPropStore };
}

describe('F-OND-131 — onOpen toont offline-grace-banner', () => {
  test('offline-grace geldig → banner met resterende dagen in onOpen-pad', () => {
    const { ctx, toastCalls } = maakCtx({ geldig: true, offline: true, dagenResterend: 42 });
    const ok = ctx.controleerLicentieEnKopie_();
    expect(ok).toBe(true);                                  // klant werkt door
    expect(toastCalls.length).toBe(1);                     // ← faalt zónder fix
    expect(toastCalls[0].msg).toMatch(/42 dagen offline-toegang/);
  });

  test('online-geldig (niet offline) → geen banner', () => {
    const { ctx, toastCalls } = maakCtx({ geldig: true });
    const ok = ctx.controleerLicentieEnKopie_();
    expect(ok).toBe(true);
    expect(toastCalls.length).toBe(0);
  });
});

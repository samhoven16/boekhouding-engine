/**
 * tests/unit/verse-kopie-geen-master-alarm.test.js
 *
 * Bug-KLASSE (ontdekt na de watchdog-fix): een verse kopie erft de SHEET-DATA van
 * de master, maar Script Properties (zoals SETUP_DONE) reizen NIET mee. onOpen-
 * checks die geërfde data lezen kunnen daardoor vals alarmeren / master-data lekken
 * / zelfs sluitJaarAf() op master-data draaien. Fix: elke zo'n check gate't op
 * SETUP_DONE. Deze suite bewijst het gedrag (#2 vuurt nu) én sluit de klasse via
 * een contract-test over alle vier de onOpen-checks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG = path.resolve(__dirname, '../../src/Config.gs');
const HITL = path.resolve(__dirname, '../../src/HitlValidatie.gs');

// ── Gedrag: HITL-validatie-toast (vuurt NU bij ≥10 geërfde concept-boekingen) ──
function maakHitlCtx(setupDone) {
  const props = {};
  if (setupDone) props.setupDone = 'true';
  const toasts = [];
  const ctx = createGasRuntime([CONFIG, HITL], {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ toast: (m, t, s) => toasts.push({ m: m, t: t, s: s }) }) },
  });
  ctx._haalConceptBoekingen_ = () => new Array(12).fill({}); // 12 geërfde concept-boekingen van de master
  return { ctx, toasts };
}

describe('Verse kopie krijgt geen vals master-alarm', () => {
  test('HITL: verse kopie (geen SETUP_DONE) + 12 geërfde concept-boekingen → GEEN toast', () => {
    const { ctx, toasts } = maakHitlCtx(false);
    ctx._waarschuwOnvalidered_();
    expect(toasts).toHaveLength(0);
  });

  test('HITL: gesetupte instance + 12 concept-boekingen → wél de toast (functie werkt nog)', () => {
    const { ctx, toasts } = maakHitlCtx(true);
    ctx._waarschuwOnvalidered_();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].t).toMatch(/validatie/i);
  });
});

// ── Contract: élke onOpen-check die geërfde sheet-data leest, gate't op SETUP_DONE ──
describe('Contract: onOpen-checks gaten op SETUP_DONE (klasse-sluiting)', () => {
  const CHECKS = {
    'src/Diagnostiek.gs': 'controleerTriggerWatchdog_',
    'src/DriveStructuur.gs': 'checkJaarwisselingNodig_',
    'src/HitlValidatie.gs': '_waarschuwOnvalidered_',
    'src/Engagement.gs': 'checkJaaroverzichtTrigger_',
  };
  Object.keys(CHECKS).forEach(function(file) {
    const fn = CHECKS[file];
    test(fn + ' bevat een SETUP_DONE-guard bovenaan', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
      const start = src.indexOf('function ' + fn + '(');
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, start + 700); // eerste regels van de functie
      expect(body).toMatch(/getProperty\(PROP\.SETUP_DONE\) !== 'true'\) return/);
    });
  });
});

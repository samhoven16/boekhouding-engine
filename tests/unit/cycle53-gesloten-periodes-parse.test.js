/**
 * tests/unit/cycle53-gesloten-periodes-parse.test.js
 *
 * Cycle 53 — GESLOTEN_PERIODES werd op 3 plekken geparsed; maar 2 ervan
 * (vergrendelPeriode_ tijdens BTW-afsluiten, beheerGeslotenPeriodes menu)
 * hadden GEEN try/catch. Corrupt JSON (half-write bij quota-fail) zou:
 *   - sluitBtwPeriode laten crashen midden in periode-afsluiting
 *   - het ontgrendel-menu onbruikbaar maken
 *
 * Fix: gedeelde _leesGeslotenPeriodes_ helper met self-heal (delete corrupt
 * + return []). Alle 3 sites routeren er nu doorheen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');
const { maakStoreMock } = require('../__helpers__/mocks');

function maakCtx(stored) {
  const store = maakStoreMock(stored ? { GESLOTEN_PERIODES: stored } : {});
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs'], {
    PropertiesService: { getScriptProperties: () => store },
  });
  return { ctx, store };
}

describe('CYCLE 53: _leesGeslotenPeriodes_ self-healing parse', () => {
  test('Geldig JSON-array → geparsed', () => {
    const { ctx } = maakCtx(JSON.stringify([{ van: '2026-01-01', tot: '2026-03-31', label: 'Q1' }]));
    const r = ctx._leesGeslotenPeriodes_();
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('Q1');
  });

  test('Geen property → []', () => {
    const { ctx } = maakCtx(null);
    expect(ctx._leesGeslotenPeriodes_()).toEqual([]);
  });

  test('Corrupt JSON → [] + property gewist (self-heal)', () => {
    const { ctx, store } = maakCtx('{ half geschreven JSON');
    const r = ctx._leesGeslotenPeriodes_();
    expect(r).toEqual([]);
    expect(store.getProperty('GESLOTEN_PERIODES')).toBeNull();   // gewist
  });

  test('Niet-array JSON (bv. object) → [] (defensief)', () => {
    const { ctx } = maakCtx('{"foo":"bar"}');
    expect(ctx._leesGeslotenPeriodes_()).toEqual([]);
  });

  test('Source: alle 3 sites routeren via helper (geen bare JSON.parse(geslotenPeriodes))', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/Boekingen.gs'), 'utf8');
    expect(src).not.toMatch(/JSON\.parse\(geslotenPeriodes\)/);
    const helperCalls = (src.match(/_leesGeslotenPeriodes_\(\)/g) || []).length;
    expect(helperCalls).toBeGreaterThanOrEqual(2);   // vergrendel + beheer (+ maakJournaalpost)
  });
});

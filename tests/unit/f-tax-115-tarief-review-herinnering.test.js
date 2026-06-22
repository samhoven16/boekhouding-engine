/**
 * tests/unit/f-tax-115-tarief-review-herinnering.test.js
 *
 * Ingebouwde herinnering (server → Sam) om de tarieven van het VOLGENDE jaar in
 * te voeren ná Prinsjesdag (3e dinsdag september), zolang ze nog niet centraal
 * klaarstaan. De tarieven zijn centraal pushbaar via de BELASTING_TARIEVEN-
 * ScriptProperty (JSON) zónder code-push; clients halen ze via haalConfigOp_ op.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const ctx = createGasRuntime([CODE_GS]);

const propsMet = (belastingTarievenJson) => ({
  getProperty: (k) => (k === 'BELASTING_TARIEVEN' ? (belastingTarievenJson || null) : null),
});

describe('F-TAX-115 — tarief-review-herinnering', () => {
  test('_prinsjesdag_ = 3e dinsdag van september', () => {
    const p = ctx._prinsjesdag_(2026);
    expect(p.getMonth()).toBe(8);                 // september
    expect(p.getDay()).toBe(2);                   // dinsdag
    expect(p.getDate()).toBeGreaterThanOrEqual(15);
    expect(p.getDate()).toBeLessThanOrEqual(21);  // 3e dinsdag valt altijd 15-21 sept
  });

  test('vóór Prinsjesdag (1 aug) → geen herinnering', () => {
    expect(ctx._tariefReviewHerinnering_(new Date(2026, 7, 1), propsMet(null))).toBeNull();
  });

  test('ná Prinsjesdag (1 okt) zonder volgend-jaar-tarieven → herinnering voor volgend jaar', () => {
    const r = ctx._tariefReviewHerinnering_(new Date(2026, 9, 1), propsMet(null));
    expect(r).not.toBeNull();
    expect(r.jaar).toBe(2027);
    expect(r.tekst).toMatch(/Prinsjesdag/);
    expect(r.tekst).toMatch(/BELASTING_TARIEVEN/);   // wijst naar de centrale push-route
  });

  test('ná Prinsjesdag MET volgend-jaar al in centrale config → geen herinnering meer', () => {
    const cfg = JSON.stringify({ 2027: { IB_SCHIJVEN: [{ tot: 40000, pct: 0.36 }] } });
    expect(ctx._tariefReviewHerinnering_(new Date(2026, 9, 1), propsMet(cfg))).toBeNull();
  });

  test('eind december zonder volgend-jaar → nog steeds herinnering (laatste kans vóór 1-1)', () => {
    const r = ctx._tariefReviewHerinnering_(new Date(2026, 11, 28), propsMet(null));
    expect(r).not.toBeNull();
    expect(r.jaar).toBe(2027);
  });

  test('corrupte BELASTING_TARIEVEN-JSON → faalt niet, herinnert wel', () => {
    const r = ctx._tariefReviewHerinnering_(new Date(2026, 9, 1), propsMet('{niet-json'));
    expect(r).not.toBeNull();
  });
});

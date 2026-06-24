/**
 * tests/unit/f-dur-150-vies-cache-cleanup.test.js
 *
 * F-DUR-150 (langlopend-onderhoud): de VIES-cache schreef één permanente
 * ScriptProperty-key per gevalideerd EU-btw-nummer (`VIES_<nr>`), met een
 * 30-dagen-TTL die alléén bij LEZEN werd toegepast — verlopen entries werden
 * nooit verwijderd. Een EU-gerichte ZZP'er met honderden distinct EU-B2B-klanten
 * accumuleert zo richting de harde 500KB-ScriptProperties-cliff (zelfde klasse
 * als F-SCALE-142/143). `cleanupViesCache_` (dagelijks) ruimt ze nu op.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const EU_GS = path.resolve(__dirname, '../../src/EUVerkoop.gs');
const dagenGeleden = (d) => Date.now() - d * 24 * 60 * 60 * 1000;

function ctxMet(store) {
  return createGasRuntime([EU_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.assign({}, store),
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
  });
}

describe('F-DUR-150 — VIES-cache-cleanup', () => {
  test('verwijdert entries ouder dan de 30d-TTL, houdt verse + andere keys', () => {
    const store = {
      VIES_NL123: JSON.stringify({ ts: dagenGeleden(2), data: { valid: true } }),    // vers
      VIES_DE456: JSON.stringify({ ts: dagenGeleden(45), data: { valid: true } }),   // verlopen
      VIES_FR789: JSON.stringify({ ts: dagenGeleden(31), data: { valid: false } }),  // net verlopen
      emailVerzonden_x: 'DONE:1700000000000',    // andere prefix — niet aanraken
      factuurteller: '42',
    };
    const n = ctxMet(store).cleanupViesCache_();
    expect(n).toBe(2);
    expect(store.VIES_NL123).toBeDefined();
    expect(store.VIES_DE456).toBeUndefined();
    expect(store.VIES_FR789).toBeUndefined();
    expect(store.emailVerzonden_x).toBeDefined();   // andere keys ongemoeid
    expect(store.factuurteller).toBe('42');
  });

  test('corrupte/ts-loze VIES-entry wordt opgeruimd (geen eeuwige lek)', () => {
    const store = { 'VIES_BE000': '{niet-json', 'VIES_IT111': JSON.stringify({ data: {} }) };
    const n = ctxMet(store).cleanupViesCache_();
    expect(n).toBe(2);
    expect(Object.keys(store).length).toBe(0);
  });

  test('lege store → 0 verwijderd, geen crash', () => {
    expect(ctxMet({}).cleanupViesCache_()).toBe(0);
  });
});

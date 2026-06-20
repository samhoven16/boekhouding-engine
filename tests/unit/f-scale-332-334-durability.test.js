/**
 * tests/unit/f-scale-332-334-durability.test.js
 *
 * Langlopend-onderhoud-fixes:
 *  - F-SCALE-332: Gemini-model centraal config-bestuurbaar (model-EOL basisbreed
 *    op te vangen zonder code-push). Behavioral ratel.
 *  - F-SCALE-333: getBelasting_ kopieert het tarief-object vóór de TARIEF_VEROUDERD-
 *    mutatie (geen aliasing-vervuiling van het gedeelde const). Source-borg.
 *  - F-SCALE-334: logies-transitie-waarschuwing alleen in het overgangsjaar 2026
 *    (was `>= 2026` → eeuwig). Source-borg.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('F-SCALE-332 — Gemini-model via centrale config (model-EOL-recovery)', () => {
  function ctxMet(propStore, cfg) {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs'], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in propStore ? propStore[k] : null),
          setProperty: () => {},
        }),
      },
    });
    ctx.haalConfigOp_ = () => cfg;
    return ctx;
  }

  test('geen per-kopie property + central config → config-model wint van de hardcoded default', () => {
    expect(ctxMet({}, { geminiModel: 'gemini-9.9-flash' })._geminiModel_()).toBe('gemini-9.9-flash');
  });
  test('per-kopie GEMINI_MODEL-property wint van de central config (expliciete keuze)', () => {
    expect(ctxMet({ GEMINI_MODEL: 'gemini-eigen' }, { geminiModel: 'gemini-9.9-flash' })._geminiModel_()).toBe('gemini-eigen');
  });
  test('geen property + geen config → hardcoded default (geen crash)', () => {
    const m = ctxMet({}, null)._geminiModel_();
    expect(typeof m).toBe('string');
    expect(m).toMatch(/gemini/i);
  });
});

describe('F-SCALE-333/334 — broncode-borging', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');

  test('F-SCALE-333: getBelasting_ kopieert het tarief-object (Object.assign) vóór de mutatie', () => {
    const fn = src.slice(src.indexOf('function getBelasting_'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    const assignIdx = body.indexOf('const tarieven = Object.assign({}');
    const mutIdx = body.indexOf('tarieven.TARIEF_VEROUDERD = true');
    expect(assignIdx).toBeGreaterThan(-1);          // kopie, geen alias
    expect(mutIdx).toBeGreaterThan(assignIdx);       // mutatie ná de kopie
  });

  test('F-SCALE-334: logies-waarschuwing alleen in 2026, niet >= 2026 (vervalt niet meer)', () => {
    expect(src).toMatch(/isLogiesBedrijf && jaar === 2026/);
    expect(src).not.toMatch(/isLogiesBedrijf && jaar >= 2026/);
    // de 2025-INFO-tak blijft bestaan
    expect(src).toMatch(/isLogiesBedrijf && jaar === 2025/);
  });
});

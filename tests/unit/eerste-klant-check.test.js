/**
 * tests/unit/eerste-klant-check.test.js
 *
 * Smoke-tests voor controleerEersteKlantReady() — de "klant-leveringsklaar" check.
 * Borgt dat alle 12 sub-checks aanwezig blijven en dat de aggregatie-logica
 * correct telt OK / WAARSCHUWING / FOUT.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('controleerEersteKlantReady (EersteKlantCheck.gs)', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'EersteKlantCheck.gs']);
  });

  test('aggregatie: 12 checks worden uitgevoerd', () => {
    // Stub alle dependencies zodat checks een gemixt resultaat geven
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx.PropertiesService.getScriptProperties().getProperty.mockReturnValue('false');

    const r = ctx.controleerEersteKlantReady();
    expect(r.checks.length).toBe(12);
    expect(typeof r.score).toBe('number');
    expect(typeof r.klaar).toBe('boolean');
  });

  test('alles falend → klaar=false, score laag', () => {
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx.PropertiesService.getScriptProperties().getProperty.mockReturnValue(null);

    const r = ctx.controleerEersteKlantReady();
    expect(r.klaar).toBe(false);
    expect(r.score).toBeLessThan(50);
  });

  test('elke check return-shape is { naam, status, bericht }', () => {
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx.PropertiesService.getScriptProperties().getProperty.mockReturnValue(null);

    const r = ctx.controleerEersteKlantReady();
    r.checks.forEach(c => {
      expect(typeof c.naam).toBe('string');
      expect(['OK', 'WAARSCHUWING', 'FOUT']).toContain(c.status);
      expect(typeof c.bericht).toBe('string');
    });
  });

  test('faal op één check stopt rest niet (try-catch isolation)', () => {
    // Maak SpreadsheetApp.getActiveSpreadsheet throwen
    ctx.SpreadsheetApp.getActiveSpreadsheet = jest.fn(() => {
      throw new Error('test scope-fout');
    });
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx.PropertiesService.getScriptProperties().getProperty.mockReturnValue(null);

    expect(() => ctx.controleerEersteKlantReady()).not.toThrow();
  });

  test('score wordt afgerond op gehele percentage', () => {
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx.PropertiesService.getScriptProperties().getProperty.mockReturnValue(null);

    const r = ctx.controleerEersteKlantReady();
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

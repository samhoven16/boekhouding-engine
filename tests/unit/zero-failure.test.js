/**
 * tests/unit/zero-failure.test.js
 *
 * Regressies voor zero-failure hardening:
 *  - parseBedragStrict_  — throw bij invalid (geen silent 0)
 *  - parseDatumStrict_   — throw bij invalid (geen fallback today)
 *  - guillotineCheck_    — stop-en-schedule bij time-cap
 *  - noodLog_            — wegschrijven naar ScriptProperty als laatste-redmiddel
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Zero-failure hardening', () => {

  describe('parseBedragStrict_', () => {
    let ctx;
    beforeAll(() => { ctx = createGasRuntime(['Utils.gs']); });

    test('valid number → numeric', () => {
      expect(ctx.parseBedragStrict_('1.234,56')).toBe(1234.56);
      expect(ctx.parseBedragStrict_('99,95')).toBe(99.95);
      expect(ctx.parseBedragStrict_(50)).toBe(50);
      expect(ctx.parseBedragStrict_(0)).toBe(0);
    });

    test('null/undefined/leeg → throw met veldnaam', () => {
      expect(() => ctx.parseBedragStrict_(null, 'Prijs')).toThrow(/Prijs is leeg/i);
      expect(() => ctx.parseBedragStrict_(undefined)).toThrow(/leeg/i);
      expect(() => ctx.parseBedragStrict_('')).toThrow(/leeg/i);
    });

    test('niet-numerieke string → throw met waarde-context', () => {
      expect(() => ctx.parseBedragStrict_('abc', 'Bedrag')).toThrow(/abc/);
      expect(() => ctx.parseBedragStrict_('hello', 'Veld')).toThrow(/Veld is geen geldig bedrag/i);
    });

    test('NaN/Infinity → throw', () => {
      expect(() => ctx.parseBedragStrict_(NaN)).toThrow(/geen getal/i);
      expect(() => ctx.parseBedragStrict_(Infinity)).toThrow(/geen getal/i);
    });
  });

  describe('parseDatumStrict_', () => {
    let ctx;
    beforeAll(() => { ctx = createGasRuntime(['Utils.gs']); });

    test('geldige NL-datum', () => {
      const d = ctx.parseDatumStrict_('15-04-2026');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2026);
    });

    test('geldige ISO-datum', () => {
      const d = ctx.parseDatumStrict_('2026-04-15');
      expect(d.getFullYear()).toBe(2026);
    });

    test('Date-object passes through', () => {
      const orig = new Date(2025, 5, 1);
      expect(ctx.parseDatumStrict_(orig)).toBe(orig);
    });

    test('leeg → throw', () => {
      expect(() => ctx.parseDatumStrict_('')).toThrow(/leeg/i);
      expect(() => ctx.parseDatumStrict_(null)).toThrow(/leeg/i);
    });

    test('onwaarschijnlijk jaartal → throw', () => {
      // parseDatum_ accepteert dit, maar strict checkt range 1990-huidig+10
      expect(() => ctx.parseDatumStrict_('15-04-1980')).toThrow(/onwaarschijnlijk jaartal/i);
      expect(() => ctx.parseDatumStrict_('15-04-2099')).toThrow(/onwaarschijnlijk jaartal/i);
    });

    test('Invalid-Date object → throw', () => {
      expect(() => ctx.parseDatumStrict_(new Date('garbage'))).toThrow(/ongeldig/i);
    });
  });

  describe('noodLog_', () => {
    test('schrijft entry zonder te crashen', () => {
      const ctx = createGasRuntime(['Utils.gs']);
      // Geen throw bij call
      expect(() => ctx.noodLog_('TEST', 'detail')).not.toThrow();
      expect(() => ctx.noodLog_(null, null)).not.toThrow();
    });
  });

  describe('guillotineCheck_', () => {
    let ctx;
    beforeAll(() => {
      ctx = createGasRuntime(['Utils.gs'], {
        ScriptApp: {
          newTrigger: () => ({
            timeBased: () => ({ after: () => ({ create: () => ({ getUniqueId: () => 't1' }) }) }),
          }),
          getProjectTriggers: () => [],
        },
      });
    });

    test('verstreken < drempel → return false (ga door)', () => {
      const startTs = Date.now() - 1000;  // 1s geleden
      const r = ctx.guillotineCheck_(startTs, 'testTaak', { rij: 5 }, 270000);
      expect(r).toBe(false);
    });

    test('verstreken > drempel → return true (stop)', () => {
      const startTs = Date.now() - 300000;  // 5 min geleden
      const r = ctx.guillotineCheck_(startTs, 'testTaak', { rij: 5 }, 270000);
      expect(r).toBe(true);
    });
  });
});

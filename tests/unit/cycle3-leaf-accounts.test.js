/**
 * tests/unit/cycle3-leaf-accounts.test.js
 *
 * Axiom 8 (leaf accounts only). Pure parent-rekeningen mogen geen
 * directe boekingen krijgen — dat zou dubbel-tellen veroorzaken in
 * categorie-totalen op balans/W&V.
 *
 * Conservatieve scope: alleen 0100/0200/0300 (onbetwiste parents,
 * nergens gebruikt in productiecode). 1400/4100 zijn ambigue (worden
 * actief gebruikt) → alleen audit-log warning, geen throw.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 3: leaf-account validatie', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  describe('Pure parent-rekeningen (0100/0200/0300) → throw', () => {
    test('debet=0100 → InvariantSchending REKENING_NIET_POSTABLE', () => {
      expect(() => ctx.valideerJournaalpostBalans_('0100', '1200', 100))
        .toThrow(/REKENING_NIET_POSTABLE|categorie-header/);
    });

    test('credit=0200 → InvariantSchending REKENING_NIET_POSTABLE', () => {
      expect(() => ctx.valideerJournaalpostBalans_('7990', '0200', 100))
        .toThrow(/REKENING_NIET_POSTABLE|categorie-header/);
    });

    test('debet=0300 → InvariantSchending', () => {
      expect(() => ctx.valideerJournaalpostBalans_('0300', '1200', 100))
        .toThrow(/categorie-header/);
    });

    test('Foutboodschap noemt de specifieke rekening + suggereert sub-rekeningen', () => {
      try { ctx.valideerJournaalpostBalans_('0100', '1200', 100); }
      catch (e) {
        expect(e.code).toBe('REKENING_NIET_POSTABLE');
        expect(e.klantBoodschap).toMatch(/0100/);
        expect(e.klantBoodschap).toMatch(/sub-rekening/);
        expect(e.debugInfo.parent).toBe('0100');
      }
    });
  });

  describe('Echte leaf-rekeningen → géén exception', () => {
    test('debet=0110 (Goodwill), credit=1200 (Bank) → OK', () => {
      expect(() => ctx.valideerJournaalpostBalans_('0110', '1200', 100)).not.toThrow();
    });

    test('debet=0210 (Gebouwen), credit=4000 (Crediteuren) → OK', () => {
      expect(() => ctx.valideerJournaalpostBalans_('0210', '4000', 100)).not.toThrow();
    });

    test('debet=0240 (Computers), credit=1200 → OK', () => {
      expect(() => ctx.valideerJournaalpostBalans_('0240', '1200', 100)).not.toThrow();
    });

    test('debet=7990 (kosten), credit=4000 (crediteuren) → OK', () => {
      expect(() => ctx.valideerJournaalpostBalans_('7990', '4000', 100)).not.toThrow();
    });
  });

  describe('Ambigue parents (1400/4100) → audit-log warning, geen throw', () => {
    let auditCalls;
    beforeEach(() => {
      auditCalls = [];
      ctx.schrijfAuditLog_ = (a, d) => { auditCalls.push({ a, d }); };
    });

    test('debet=4100 (Te betalen BTW) → géén throw, wél audit', () => {
      expect(() => ctx.valideerJournaalpostBalans_('4100', '1100', 100)).not.toThrow();
      const warning = auditCalls.find((c) => /AMBIGU PARENT/.test(c.a));
      expect(warning).toBeTruthy();
      expect(warning.d).toMatch(/4100/);
    });

    test('credit=1400 (Te vorderen BTW) → géén throw, wél audit', () => {
      expect(() => ctx.valideerJournaalpostBalans_('1100', '1400', 100)).not.toThrow();
      const warning = auditCalls.find((c) => /AMBIGU PARENT/.test(c.a));
      expect(warning).toBeTruthy();
      expect(warning.d).toMatch(/1400/);
    });

    test('Specifieke sub-rekening (4110/4120) → géén audit warning', () => {
      ctx.valideerJournaalpostBalans_('4110', '1100', 100);
      ctx.valideerJournaalpostBalans_('4120', '1100', 100);
      const warning = auditCalls.find((c) => /AMBIGU PARENT/.test(c.a));
      expect(warning).toBeFalsy();
    });
  });

  describe('Regressie: bestaande validaties blijven werken', () => {
    test('Lege rekening → JOURNAALPOST_REK_LEEG (niet parent-check)', () => {
      try { ctx.valideerJournaalpostBalans_('', '1200', 100); }
      catch (e) {
        expect(e.code).toBe('JOURNAALPOST_REK_LEEG');
      }
    });

    test('debet === credit → JOURNAALPOST_ZELFDE_REK', () => {
      try { ctx.valideerJournaalpostBalans_('1200', '1200', 100); }
      catch (e) {
        expect(e.code).toBe('JOURNAALPOST_ZELFDE_REK');
      }
    });

    test('Negatief bedrag → JOURNAALPOST_BEDRAG_ONGELDIG', () => {
      try { ctx.valideerJournaalpostBalans_('7990', '1200', -10); }
      catch (e) {
        expect(e.code).toBe('JOURNAALPOST_BEDRAG_ONGELDIG');
      }
    });
  });
});

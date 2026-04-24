/**
 * tests/unit/validaties.test.js
 *
 * Regressietests voor pure validator-functies (Validaties.gs).
 *   - valideerBtwNummer_: NL + 9 digits + B + 2 digits
 *   - valideerIban_: structuur + MOD-97 checksum
 *   - valideerKvkNummer_: precies 8 cijfers
 *   - valideerEmail_: basis-RFC formaat
 *   - valideerPostcode_: NL 1234 AB formaat
 *
 * Belang: deze functies staan aan de userinput-grens. Als iemand
 * per ongeluk een regex breekt kan de hele invoer-flow stuklopen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Validaties.gs', () => {
  let ctx;

  beforeAll(() => {
    ctx = createGasRuntime(['Validaties.gs']);
  });

  // ── BTW-nummer ─────────────────────────────────────────────────────
  describe('valideerBtwNummer_', () => {
    test('geldig NL BTW-nummer → geldig=true', () => {
      expect(ctx.valideerBtwNummer_('NL123456789B01').geldig).toBe(true);
    });

    test('met spaties → geldig (wordt genormaliseerd)', () => {
      expect(ctx.valideerBtwNummer_('NL 1234 56789 B01').geldig).toBe(true);
    });

    test('lowercase → geldig (wordt geüppercased)', () => {
      expect(ctx.valideerBtwNummer_('nl123456789b01').geldig).toBe(true);
    });

    test('leeg → niet geldig', () => {
      const r = ctx.valideerBtwNummer_('');
      expect(r.geldig).toBe(false);
      expect(r.fout).toMatch(/leeg/i);
    });

    test('verkeerd landprefix → niet geldig', () => {
      expect(ctx.valideerBtwNummer_('BE123456789B01').geldig).toBe(false);
    });

    test('te weinig cijfers → niet geldig', () => {
      expect(ctx.valideerBtwNummer_('NL12345B01').geldig).toBe(false);
    });

    test('geen B-suffix → niet geldig', () => {
      expect(ctx.valideerBtwNummer_('NL123456789X01').geldig).toBe(false);
    });
  });

  // ── IBAN ───────────────────────────────────────────────────────────
  describe('valideerIban_', () => {
    test('geldig NL IBAN (MOD-97) → geldig=true', () => {
      expect(ctx.valideerIban_('NL91ABNA0417164300').geldig).toBe(true);
    });

    test('met spaties → geldig', () => {
      expect(ctx.valideerIban_('NL91 ABNA 0417 1643 00').geldig).toBe(true);
    });

    test('leeg → niet geldig', () => {
      expect(ctx.valideerIban_('').geldig).toBe(false);
    });

    test('verkeerd formaat (geen letters na checkdigits) → niet geldig', () => {
      expect(ctx.valideerIban_('NL91!!!!0417164300').geldig).toBe(false);
    });

    test('MOD-97 faal (1 digit gewijzigd) → niet geldig', () => {
      const r = ctx.valideerIban_('NL92ABNA0417164300');
      expect(r.geldig).toBe(false);
    });
  });

  // ── KvK ────────────────────────────────────────────────────────────
  describe('valideerKvkNummer_', () => {
    test('geldig 8-cijferig → geldig=true', () => {
      expect(ctx.valideerKvkNummer_('12345678').geldig).toBe(true);
    });

    test('met spaties → geldig', () => {
      expect(ctx.valideerKvkNummer_('1234 5678').geldig).toBe(true);
    });

    test('7 cijfers → niet geldig', () => {
      expect(ctx.valideerKvkNummer_('1234567').geldig).toBe(false);
    });

    test('9 cijfers → niet geldig', () => {
      expect(ctx.valideerKvkNummer_('123456789').geldig).toBe(false);
    });

    test('letters erin → niet geldig', () => {
      expect(ctx.valideerKvkNummer_('1234567A').geldig).toBe(false);
    });

    test('leeg → niet geldig', () => {
      expect(ctx.valideerKvkNummer_('').geldig).toBe(false);
    });
  });

  // ── Email ──────────────────────────────────────────────────────────
  describe('valideerEmail_', () => {
    test('standaard adres → geldig', () => {
      expect(ctx.valideerEmail_('sam@boekhoudbaar.nl').geldig).toBe(true);
    });

    test('subdomein → geldig', () => {
      expect(ctx.valideerEmail_('user@mail.example.co.uk').geldig).toBe(true);
    });

    test('zonder @ → niet geldig', () => {
      expect(ctx.valideerEmail_('sam.boekhoudbaar.nl').geldig).toBe(false);
    });

    test('zonder TLD → niet geldig', () => {
      expect(ctx.valideerEmail_('sam@boekhoudbaar').geldig).toBe(false);
    });

    test('leeg → niet geldig', () => {
      expect(ctx.valideerEmail_('').geldig).toBe(false);
    });
  });

  // ── Postcode ───────────────────────────────────────────────────────
  describe('valideerPostcode_', () => {
    test('1234 AB → geldig', () => {
      expect(ctx.valideerPostcode_('1234 AB').geldig).toBe(true);
    });

    test('1234AB zonder spatie → geldig', () => {
      expect(ctx.valideerPostcode_('1234AB').geldig).toBe(true);
    });

    test('lowercase → geldig', () => {
      expect(ctx.valideerPostcode_('1234ab').geldig).toBe(true);
    });

    test('alleen cijfers → niet geldig', () => {
      expect(ctx.valideerPostcode_('1234').geldig).toBe(false);
    });

    test('te veel cijfers → niet geldig', () => {
      expect(ctx.valideerPostcode_('12345 AB').geldig).toBe(false);
    });

    test('leeg → niet geldig', () => {
      expect(ctx.valideerPostcode_('').geldig).toBe(false);
    });
  });
});

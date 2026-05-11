/**
 * tests/unit/belasting-overrides.test.js
 *
 * Tests voor klant-override-laag op BELASTING-tarieven. Klant kan vanuit
 * Instellingen-tab tarieven aanpassen wanneer Belastingdienst iets wijzigt
 * na Prinsjesdag. _parseOverrideWaarde_ moet defensief alle edge-cases
 * afhandelen — een typo mag NOOIT de berekening crashen of nullen.
 *
 * Edge cases die getest worden:
 *  - Lege cel (null, undefined, '') → null (= fallback default)
 *  - Numeric direct (Number-type uit sheet) → as-is, na range-check
 *  - String met komma-decimal "0,28" → 0.28
 *  - String met procent-teken "21%" → 0.21
 *  - String met euro-teken "€2,40" → 2.40
 *  - Heel-percentage "21" voor pct-veld → auto-omzetten naar 0.21
 *  - Negatief → reject
 *  - Out-of-range high → reject
 *  - Out-of-range low → reject
 *  - Niet-numeric "abc" → null
 *  - Date-object (sheet kan datum-parse doen) → null
 *  - Infinity/NaN → null
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('_parseOverrideWaarde_ — defensieve parser voor klant-tarief-overrides', () => {
  let ctx;
  let parse;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);
    parse = ctx._parseOverrideWaarde_;
    // schrijfAuditLog_ is een no-op fallback in test-runtime, voorkom Logger-spam
    ctx.schrijfAuditLog_ = () => {};
  });

  const bedragVeld     = { sleutel: 'X', type: 'bedrag',     min: 0,    max: 1000 };
  const kmVeld         = { sleutel: 'KM', type: 'bedrag',    min: 0.01, max: 1.00 };
  const percentageVeld = { sleutel: 'P', type: 'percentage', min: 0,    max: 1.00 };

  describe('lege/ontbrekende waarden → null', () => {
    test('null → null', () => { expect(parse(null, bedragVeld)).toBeNull(); });
    test('undefined → null', () => { expect(parse(undefined, bedragVeld)).toBeNull(); });
    test('lege string → null', () => { expect(parse('', bedragVeld)).toBeNull(); });
    test('whitespace string → null', () => { expect(parse('   ', bedragVeld)).toBeNull(); });
  });

  describe('numeric direct uit sheet', () => {
    test('0.23 → 0.23 (in range)', () => { expect(parse(0.23, kmVeld)).toBeCloseTo(0.23, 5); });
    test('integer 500 → 500 (bedrag in range)', () => { expect(parse(500, bedragVeld)).toBe(500); });
    test('Infinity → null', () => { expect(parse(Infinity, bedragVeld)).toBeNull(); });
    test('NaN → null', () => { expect(parse(NaN, bedragVeld)).toBeNull(); });
  });

  describe('string parsing — NL-formats', () => {
    test('"0,23" (komma) → 0.23', () => { expect(parse('0,23', kmVeld)).toBeCloseTo(0.23, 5); });
    test('"0.23" (punt)  → 0.23', () => { expect(parse('0.23', kmVeld)).toBeCloseTo(0.23, 5); });
    test('"€2,40" → 2.40', () => { expect(parse('€2,40', bedragVeld)).toBeCloseTo(2.40, 5); });
    test('"21%" → 0.21 (percentage stripped)', () => { expect(parse('21%', percentageVeld)).toBeCloseTo(0.21, 5); });
    test('"21,00%" → 0.21', () => { expect(parse('21,00%', percentageVeld)).toBeCloseTo(0.21, 5); });
    test('"  2,40 €  " (whitespace) → 2.40', () => { expect(parse('  2,40 €  ', bedragVeld)).toBeCloseTo(2.40, 5); });
  });

  describe('auto-percentage interpretatie (>1 voor pct-veld)', () => {
    test('"21" voor percentage-veld → 0.21 (heel-procent)', () => {
      expect(parse('21', percentageVeld)).toBeCloseTo(0.21, 5);
    });
    test('21 (number) voor percentage-veld → 0.21', () => {
      expect(parse(21, percentageVeld)).toBeCloseTo(0.21, 5);
    });
    test('"0,21" voor percentage-veld blijft 0.21 (al decimaal)', () => {
      expect(parse('0,21', percentageVeld)).toBeCloseTo(0.21, 5);
    });
    test('AUTO-OMZETTING geldt NIET voor bedrag-velden — "21" voor bedrag-veld blijft 21', () => {
      expect(parse('21', bedragVeld)).toBe(21);
    });
  });

  describe('range-validatie', () => {
    test('negatief → null', () => { expect(parse('-0,23', kmVeld)).toBeNull(); });
    test('boven max → null', () => { expect(parse(1.5, kmVeld)).toBeNull(); });
    test('onder min → null', () => { expect(parse(-1, bedragVeld)).toBeNull(); });
    test('precies op min → toegestaan', () => { expect(parse(0.01, kmVeld)).toBeCloseTo(0.01, 5); });
    test('precies op max → toegestaan', () => { expect(parse(1.00, kmVeld)).toBeCloseTo(1.00, 5); });
    test('percentage 110% (= 1.1) → null', () => { expect(parse('110%', percentageVeld)).toBeNull(); });
  });

  describe('niet-numeric / type-mismatch → null', () => {
    test('alfanumeric "abc" → null', () => { expect(parse('abc', bedragVeld)).toBeNull(); });
    test('Date-object (sheet kan dat geven) → null', () => {
      expect(parse(new Date(), bedragVeld)).toBeNull();
    });
    test('boolean true → null', () => { expect(parse(true, bedragVeld)).toBeNull(); });
    test('object → null', () => { expect(parse({foo:1}, bedragVeld)).toBeNull(); });
  });
});

describe('_leesBelastingOverrides_ — leest Instellingen-tab', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  test('geen Instellingen-tab → leeg object', () => {
    ctx.getInstelling_ = () => null;
    ctx._wisBelastingOverridesCache_();
    const result = ctx._leesBelastingOverrides_();
    expect(result).toEqual({});
  });

  test('één geldige override → object met die sleutel', () => {
    ctx.getInstelling_ = (sleutel) => {
      if (sleutel === 'Tarief: Reiskosten per km (€)') return '0,25';
      return null;
    };
    ctx._wisBelastingOverridesCache_();
    const result = ctx._leesBelastingOverrides_();
    expect(result.REISKOSTEN_PER_KM).toBeCloseTo(0.25, 5);
  });

  test('meerdere overrides → alle aanwezig', () => {
    ctx.getInstelling_ = (sleutel) => {
      if (sleutel === 'Tarief: Reiskosten per km (€)') return '0,25';
      if (sleutel === 'Tarief: Thuiswerk per dag (€)') return '€3,00';
      return null;
    };
    ctx._wisBelastingOverridesCache_();
    const result = ctx._leesBelastingOverrides_();
    expect(result.REISKOSTEN_PER_KM).toBeCloseTo(0.25, 5);
    expect(result.THUISWERK_PER_DAG).toBeCloseTo(3.00, 5);
  });

  test('ongeldige waarde wordt overgeslagen, andere blijven werken', () => {
    ctx.getInstelling_ = (sleutel) => {
      if (sleutel === 'Tarief: Reiskosten per km (€)') return 'abc';  // invalid
      if (sleutel === 'Tarief: Thuiswerk per dag (€)') return '2,40'; // valid
      return null;
    };
    ctx._wisBelastingOverridesCache_();
    const result = ctx._leesBelastingOverrides_();
    expect(result.REISKOSTEN_PER_KM).toBeUndefined();
    expect(result.THUISWERK_PER_DAG).toBeCloseTo(2.40, 5);
  });

  test('cache werkt: tweede call leest niet opnieuw', () => {
    let calls = 0;
    ctx.getInstelling_ = (sleutel) => {
      calls++;
      if (sleutel === 'Tarief: Reiskosten per km (€)') return '0,30';
      return null;
    };
    ctx._wisBelastingOverridesCache_();
    ctx._leesBelastingOverrides_(); // eerste call: leest alle velden
    const callsAfterFirst = calls;
    ctx._leesBelastingOverrides_(); // tweede call: cache-hit, leest niets
    expect(calls).toBe(callsAfterFirst);
  });
});

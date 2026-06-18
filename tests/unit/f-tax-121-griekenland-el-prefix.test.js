/**
 * tests/unit/f-tax-121-griekenland-el-prefix.test.js
 *
 * F-TAX-121 — Griekse BTW-nummers gebruiken per EU-conventie het prefix EL
 * (bv. EL123456789), niet GR. _EU_LANDCODES bevatte alleen GR, dus
 * detecteerEULand_('EL...') gaf null → de levering ontbrak op de ICP-opgaaf
 * (art. 37a Wet OB) → naheffing + verzuimboete bij controle.
 *
 * Ratel: de EL-assertie faalt zónder EL in _EU_LANDCODES.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['EUVerkoop.gs']);

describe('F-TAX-121 — Griekse EL-prefix wordt als EU-land herkend', () => {
  test('EL-BTW-nummer (Grieks) → land herkend (was null)', () => {
    expect(ctx.detecteerEULand_('EL123456789')).toBe('EL');
  });

  test('met spaties + lowercase → genormaliseerd herkend', () => {
    expect(ctx.detecteerEULand_('el 123 456 789')).toBe('EL');
  });

  test('GR als land-veld-fallback blijft werken', () => {
    expect(ctx.detecteerEULand_('', 'GR')).toBe('GR');
  });

  test('andere EU-prefix (DE) ongewijzigd', () => {
    expect(ctx.detecteerEULand_('DE123456789')).toBe('DE');
  });

  test('niet-EU (US) en NL → null', () => {
    expect(ctx.detecteerEULand_('US123456789')).toBeNull();
    expect(ctx.detecteerEULand_('NL123456789B01')).toBeNull();
  });
});

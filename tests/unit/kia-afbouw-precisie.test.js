/**
 * tests/unit/kia-afbouw-precisie.test.js
 *
 * RATEL (bug-klasse 9, precisie): de KIA-afbouw rekende met de float-literal
 * `0.0756`, die niet exact is in IEEE-754. In de afbouwzone gaf dat 275
 * cent-afwijkingen — de aftrek werd telkens €0,01 te LAAG berekend (de klant
 * kreeg minder aftrek dan wettelijk). Voorbeeld: investering €160.334,50 →
 * overschrijding €27.587,50 → €17.986,38 i.p.v. de juiste €17.986,39.
 *
 * De fix gebruikt de exacte breuk (756/10000) met dezelfde round-final-strategie.
 * Deze test faalt op de oude float-berekening.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const B = {
  KIA_MIN: 2901, KIA_MAX: 398236, KIA_PCT: 0.28,
  KIA_VAST_VAN: 71683, KIA_VAST_BEDRAG: 20072,
  KIA_AFBOUW_START: 132747, KIA_AFBOUW_PCT: 0.0756,
};

describe('klasse 9 — KIA-afbouw exact (geen 0.0756-float-drift)', () => {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);

  // Bewezen pure-float-drift-gevallen (zelfde round-final): oud = exact − €0,01.
  const GEVALLEN = [
    [160334.5, 17986.39],
    [160959.5, 17939.14],
    [161584.5, 17891.89],
    [162209.5, 17844.64],
  ];

  GEVALLEN.forEach(([investering, verwacht]) => {
    test(`investering €${investering} → KIA €${verwacht} (exact, niet 1 cent te laag)`, () => {
      expect(ctx.berekenKiaAftrek_(investering, B)).toBe(verwacht);
    });
  });

  test('grenzen ongewijzigd: vlak vóór de afbouwzone = vast bedrag', () => {
    expect(ctx.berekenKiaAftrek_(B.KIA_AFBOUW_START, B)).toBe(20072);
  });

  test('boven KIA_MAX → 0', () => {
    expect(ctx.berekenKiaAftrek_(B.KIA_MAX + 1, B)).toBe(0);
  });
});

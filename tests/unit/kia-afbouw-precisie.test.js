/**
 * tests/unit/kia-afbouw-precisie.test.js
 *
 * RATEL (bug-klasse 9, precisie): de KIA-afbouw rekende met de float-literal
 * `0.0756`. Float-tarieven zijn niet exact in IEEE-754 → de cent-afgeronde
 * aftrek week in ~2000 gevallen 1 cent af van de wiskundig-exacte waarde.
 * De definitieve fix rekent VOLLEDIG in integer-centen (half-up), wiskundig
 * exact: aftrek_cent = round((vast_cent×10000 − tariefE4×overschr_cent)/10000).
 *
 * Let op: een eerdere tussenfix (`756×overschr/10000`) was béter maar nóg niet
 * exact — €87,50 overschrijding gaf €20.065,38 i.p.v. €20.065,39. Die waarde
 * staat hieronder en faalt op zowel de originele float ÁLS de tussenfix.
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
    [132834.50, 20065.39],  // overschrijding €87,50 — faalt op float ÉN op de /10000-tussenfix
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

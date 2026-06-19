/**
 * tests/unit/rond-tarief-cent.test.js
 *
 * RATEL/BORGING (bug-klasse 9): rondTariefCent_ is het chokepoint voor "tarief ×
 * bedrag → cent" dat de float-drift van tarief-constanten (0.0756 / 0.1270 /
 * 0.0526 …) elimineert door volledig in integer-centen te rekenen (half-up).
 * `rondBedrag_(bedrag * tarief)` week in duizenden gevallen 1 cent af; deze
 * helper is wiskundig exact. KIA-afbouw, MKB-winstvrijstelling en de Zvw-bijdrage
 * gebruiken 'm nu.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs']);

// Onafhankelijke integer-cent-referentie (de wiskundig-exacte waarde, half-up).
function trueCent(bedrag, tarief) {
  const bc = Math.round(bedrag * 100);
  const e4 = Math.round(tarief * 10000);
  const N = e4 * bc;
  const c = N >= 0 ? Math.floor((N + 5000) / 10000) : -Math.floor((-N + 5000) / 10000);
  return c / 100;
}

describe('rondTariefCent_ — exacte pct-van-bedrag (klasse 9)', () => {
  test('MKB-geval: €155 × 12,70% = €19,69 (float gaf €19,68)', () => {
    expect(ctx.rondTariefCent_(155, 0.1270)).toBe(19.69);
  });

  test('Zvw-geval: €2.625 × 5,26% = €138,08 (float gaf €138,07)', () => {
    expect(ctx.rondTariefCent_(2625, 0.0526)).toBe(138.08);
  });

  test('exact gelijk aan de integer-cent-referentie over een breed bereik', () => {
    const tarieven = [0.0756, 0.1270, 0.0526, 0.28, 0.455, 0.0944, 0.0485];
    tarieven.forEach((t) => {
      for (let c = 0; c <= 600000; c += 977) {   // steekproef, cent-waardig
        const b = c / 100;
        expect(ctx.rondTariefCent_(b, t)).toBe(trueCent(b, t));
      }
    });
  });

  test('negatief bedrag (creditnota/storno) is symmetrisch', () => {
    expect(ctx.rondTariefCent_(-155, 0.1270)).toBe(-19.69);
  });

  test('nul / ongeldige input → 0', () => {
    expect(ctx.rondTariefCent_(0, 0.21)).toBe(0);
    expect(ctx.rondTariefCent_('x', 0.21)).toBe(0);
  });
});

/**
 * tests/unit/negatief-bedrag-kosten-declaratie.test.js
 *
 * Regressie uit de unieke geld-keuring (metamorfe fuzz + valkuil-probes):
 * berekenBtw retourneert {0,0,0} voor een NIET-positief bedrag. saniteerGetal_
 * clampt een negatief getal NIET, en _verwerkKosten_/_verwerkDeclaratie_ lezen
 * het bedrag uit `raw` — langs de `safe`-clamp (_num(...,0,...)) heen. Een
 * negatieve kosten/declaratie-invoer werd daardoor STIL als €0 geboekt: de kosten
 * verdwenen zonder waarschuwing (onderschatte kosten → foute BTW-aftrek/winst).
 * De factuur-flow weigerde negatief al expliciet; deze handlers nu ook.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  return createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
}

describe('Negatief kosten/declaratie-bedrag wordt geweigerd i.p.v. stil €0', () => {
  test('waaróm de guard nodig is: berekenBtw nult een negatief incl-bedrag stil', () => {
    const ctx = maakCtx();
    expect(ctx.berekenBtw('21%', 0, -100)).toEqual({ excl: 0, btw: 0, incl: 0, tarief: 0.21 });
    // positieve controle: een echt bedrag levert wél de juiste BTW terug
    const ok = ctx.berekenBtw('21%', 0, 121);
    expect(ok.excl).toBeCloseTo(100, 2);
    expect(ok.btw).toBeCloseTo(21, 2);
    expect(ok.incl).toBeCloseTo(121, 2);
  });

  test('_verwerkKosten_ weigert een negatief bedrag (geen stille €0-boeking)', () => {
    const ctx = maakCtx();
    expect(() => ctx._verwerkKosten_({}, { btw: '21%' }, { bedragIncl: -50 }))
      .toThrow(/negatief/i);
  });

  test('_verwerkDeclaratie_ weigert een negatief bedrag', () => {
    const ctx = maakCtx();
    expect(() => ctx._verwerkDeclaratie_({}, { btw: '21%' }, { bedrag: -50 }))
      .toThrow(/negatief/i);
  });
});

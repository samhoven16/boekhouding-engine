/**
 * tests/unit/getbelasting-tarief-cliff.test.js
 *
 * Regressie voor F-OND-024 (tarief-cliff). De bestaande
 * tarief-verouderd-waarschuwing.test.js mockt getBelasting_ weg en test
 * alleen de wáárschuwing. Deze test drijft de ECHTE getBelasting_-logica:
 * zodra het kalenderjaar voorbij de laatst-bekende tarieftabel ligt (Sam
 * stopt met onderhouden, of een nieuw jaar vóór Prinsjesdag), MOET
 * getBelasting_ TARIEF_VEROUDERD=true zetten i.p.v. stil met oude tarieven
 * doorrekenen. Dat is de kern van de "silent drift = boeterisico"-bescherming.
 *
 * Date wordt ge-mockt zodat new Date().getFullYear() een gekozen jaar geeft;
 * de mock delegeert verder naar de echte Date (alle andere methoden intact).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

/** Date-vervanger die new Date().getFullYear() forceert maar verder echt is. */
function vasteJaarDate(jaar) {
  const RealDate = Date;
  function FakeDate(...args) {
    const d = args.length ? new RealDate(...args) : new RealDate();
    d.getFullYear = () => jaar;
    return d;
  }
  FakeDate.now = RealDate.now;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  return FakeDate;
}

function belastingVoorJaar(jaar) {
  // haalConfigOp_ en _leesBelastingOverrides_ blijven undefined (typeof-guard
  // in getBelasting_ slaat ze over) → geen server-override, pure lokale tabel.
  const ctx = createGasRuntime(
    ['Config.gs', 'Utils.gs', 'Belastingadvies.gs'],
    { Date: vasteJaarDate(jaar) },
  );
  return ctx.getBelasting_();
}

describe('getBelasting_ — F-OND-024 tarief-cliff', () => {
  test('jaar ver voorbij de laatst-bekende tabel → TARIEF_VEROUDERD + fallback-bron', () => {
    // 2099 ligt gegarandeerd voorbij elke tarieftabel, nu en in de toekomst.
    const b = belastingVoorJaar(2099);
    expect(b.TARIEF_VEROUDERD).toBe(true);
    expect(String(b.TARIEF_BRON)).toMatch(/fallback/i);
    expect(typeof b.TARIEF_FALLBACK_JAAR).toBe('number');
    // Er worden nog steeds (oude) tarieven teruggegeven zodat de tool werkt,
    // maar mét de vlag zodat de UI-banner + owner-alert afgaan.
    expect(typeof b.ZELFSTANDIGENAFTREK).toBe('number');
  });

  test('bevestigd lopend jaar (2026) → NIET verouderd (vlag is niet altijd-aan)', () => {
    const b = belastingVoorJaar(2026);
    expect(b.TARIEF_VEROUDERD).toBeFalsy();
  });
});

/**
 * tests/unit/creditnota-aangifte-periode.test.js
 *
 * RATEL (BLOCKER, fiscaal): een factuur die in DEZELFDE aangifteperiode wordt
 * gecrediteerd hoort netto €0 omzet/BTW te geven. maakCreditnota zet het
 * origineel op 'Gecrediteerd' ÉN voegt een aparte negatieve rij toe. In
 * berekenBtwAangifte_ werd het origineel geskipt (status === GECREDITEERD) maar
 * de negatieve creditrij wél geteld → netto −origineel → structurele
 * onder-aangifte / onterechte BTW-teruggaaf. Fix: het origineel NIET skippen
 * (origineel + creditnota tellen samen netto naar 0; cross-periode klopt ook
 * want elke rij valt in z'n eigen periode op z'n eigen datum).
 *
 * Deze test faalt op de oude code (skip).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);

function vfRow(datum, exclusief, label, btw, incl, status) {
  const r = new Array(23).fill('');
  r[2] = datum; r[5] = 'Klant BV'; r[9] = exclusief; r[10] = label;
  r[11] = btw; r[12] = incl; r[14] = status;
  return r;
}

function aangifteOver(vfRows, van, tot) {
  const ss = {
    getSheetByName: (n) => {
      const rows = (n === 'Verkoopfacturen')
        ? [new Array(23).fill('hdr'), ...vfRows]
        : [new Array(20).fill('hdr')];   // lege inkoop
      return { getDataRange: () => ({ getValues: () => rows }) };
    },
  };
  return ctx.berekenBtwAangifte_(ss, van, tot);
}

describe('BLOCKER — creditnota in dezelfde periode → netto €0 (geen dubbele aftrek)', () => {
  const Q1van = new Date(2026, 0, 1);
  const Q1tot = new Date(2026, 2, 31, 23, 59, 59);

  test('origineel (Gecrediteerd) + creditnota (Betaald) zelfde kwartaal → r1a netto 0', () => {
    const a = aangifteOver([
      vfRow(new Date(2026, 1, 15), 100, '21% (hoog)', 21, 121, 'Gecrediteerd'),
      vfRow(new Date(2026, 1, 16), -100, '21% (hoog)', -21, -121, 'Betaald'),
    ], Q1van, Q1tot);
    expect(a.r1a_grondslag).toBe(0);
    expect(a.r1a_btw).toBe(0);
  });

  test('alleen een gewone factuur → telt normaal (geen over-correctie)', () => {
    const a = aangifteOver([
      vfRow(new Date(2026, 1, 15), 100, '21% (hoog)', 21, 121, 'Verzonden'),
    ], Q1van, Q1tot);
    expect(a.r1a_grondslag).toBe(100);
    expect(a.r1a_btw).toBe(21);
  });

  test('storno (Gestorneerd, BTW genuld) blijft geskipt — geen telling', () => {
    const a = aangifteOver([
      vfRow(new Date(2026, 1, 15), 100, '21% (hoog)', 0, 100, 'Gestorneerd'),
    ], Q1van, Q1tot);
    expect(a.r1a_grondslag).toBe(0);
    expect(a.r1a_btw).toBe(0);
  });
});

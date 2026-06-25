/**
 * tests/unit/verlegde-inkoop-zonder-btw-flag.test.js
 *
 * Verlegde inkoop (reverse charge) waarvan de zelf-berekende BTW ontbreekt.
 *
 * Bij verlegging factureert de leverancier €0 BTW; de afnemer vult dus geen
 * BTW-bedrag in. De inkooprij komt binnen met btwBedrag=0. berekenBtwAangifte_
 * telt de grondslag wél in rubriek 4a, maar r4a_btw blijft €0 → de verschuldigde
 * verleggings-BTW wordt niet aangegeven (en de aftrek niet geclaimd): onder-aangifte.
 *
 * Gekozen aanpak (fiscaal geverifieerd 2026-06): FLAGGEN, niet stil een tarief
 * aannemen. Het juiste tarief (21% vs 9%) en het aftrek-aandeel (pro-rata/
 * zakelijk%) horen bij data-entry vastgelegd te worden; een stille 21%-aanname
 * op een juridisch aangiftebedrag zou voor pro-rata/vrijgestelde ondernemers een
 * verkeerd bedrag opleveren. Daarom: aangifte ongewijzigd, _verlegdInkoopZonderBtw*
 * gezet, en valideerAangifteVoorIndiening_ toont de waarschuwing vóór indiening.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const VAN = new Date('2026-01-01');
const TOT = new Date('2026-12-31');

// inkooprij: 19 kolommen, alleen de relevante indices gevuld.
function inkoopRij(datum, grondslag, label, btw, status, bijlage) {
  const r = new Array(19).fill('');
  r[3] = datum;       // factuurdatum leverancier (BTW-datumfilter)
  r[8] = grondslag;   // grondslag excl.
  r[9] = label;       // BTW-label
  r[10] = btw;        // BTW-bedrag
  r[12] = status;     // status
  r[18] = bijlage;    // Bijlage URL
  return r;
}

function maakCtx(inkoopRows) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);
  const verkoopData = [new Array(15).fill('h')];                       // alleen header
  const inkoopData = [new Array(19).fill('h')].concat(inkoopRows);
  const mk = (data) => ({ getDataRange: () => ({ getValues: () => data }), getLastRow: () => data.length });
  const ss = {
    getSheetByName: (n) => (/inkoop/i.test(n) ? mk(inkoopData) : /verkoop/i.test(n) ? mk(verkoopData) : null),
  };
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx, ss };
}

describe('Verlegde inkoop zonder zelf-berekende BTW — flag (geen stille tarief-aanname)', () => {
  test('verlegde inkoop met btwBedrag=0 wordt geflagd; r4a_btw/r5b blijven €0', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 0, 'Betaald', 'https://drive/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);

    // Grondslag telt mee in 4a, maar het juridische BTW-bedrag is NIET stil ingevuld.
    expect(a.r4a_grondslag).toBeCloseTo(1000, 2);
    expect(a.r4a_btw).toBeCloseTo(0, 2);
    expect(a.r5b).toBeCloseTo(0, 2);

    // Wél geflagd, met indicatieve 21%-schatting (puur ter oriëntatie).
    expect(a._verlegdInkoopZonderBtwAantal).toBe(1);
    expect(a._verlegdInkoopZonderBtwGrondslag).toBeCloseTo(1000, 2);
    expect(a._verlegdInkoopZonderBtwSchatting21).toBeCloseTo(210, 2);
  });

  test('verlegde inkoop MET ingevuld btwBedrag → geen flag (self-assessment al gedaan)', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 210, 'Betaald', 'https://drive/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);

    // Bestaande F-TAX-120-logica: verschuldigd (4a) én aftrek (5b) = €210, kas-neutraal.
    expect(a.r4a_btw).toBeCloseTo(210, 2);
    expect(a.r5b).toBeCloseTo(210, 2);
    expect(a._verlegdInkoopZonderBtwAantal).toBeUndefined();
  });

  test('gewone (niet-verlegde) inkoop → geen verlegd-flag', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, '21% (hoog)', 210, 'Betaald', 'https://drive/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(a._verlegdInkoopZonderBtwAantal).toBeUndefined();
  });

  test('valideerAangifteVoorIndiening_ meldt de ontbrekende verleggings-BTW (rubriek 4a)', () => {
    const { ctx } = maakCtx([]);
    const issues = ctx.valideerAangifteVoorIndiening_(
      { r5a: 0, r5b: 0, saldo: 0,
        _verlegdInkoopZonderBtwAantal: 1,
        _verlegdInkoopZonderBtwGrondslag: 1000,
        _verlegdInkoopZonderBtwSchatting21: 210 },
      null
    );
    expect(issues.some((s) => /verleg/i.test(s) && /4a/.test(s))).toBe(true);
  });

  test('twee verlegde €0-rijen → aantal=2 en grondslag/schatting sommeren', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 1000, 'Verlegd', 0, 'Betaald', 'https://drive/x'),
      inkoopRij(new Date('2026-04-10'), 500, 'verlegd', 0, 'Betaald', 'https://drive/y'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(a._verlegdInkoopZonderBtwAantal).toBe(2);
    expect(a._verlegdInkoopZonderBtwGrondslag).toBeCloseTo(1500, 2);
    expect(a._verlegdInkoopZonderBtwSchatting21).toBeCloseTo(315, 2);
  });
});

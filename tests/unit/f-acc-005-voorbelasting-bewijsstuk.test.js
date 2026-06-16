/**
 * tests/unit/f-acc-005-voorbelasting-bewijsstuk.test.js
 *
 * F-ACC-005 — voorbelasting (r5b) wordt geclaimd zonder controle op een
 * onderliggend bewijsstuk (art. 15 Wet OB). Gekozen aanpak: FLAGGEN, niet
 * uitsluiten/blokkeren. berekenBtwAangifte_ telt inkooprijen die r5b-
 * voorbelasting claimen zonder Drive-bijlage [18] en zet _r5bZonderBewijs*;
 * de aangifte (r5b/saldo) blijft ongewijzigd. valideerAangifteVoorIndiening_
 * toont de waarschuwing vóór indiening.
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
  r[10] = btw;        // BTW-bedrag (voorbelasting)
  r[12] = status;     // status
  r[18] = bijlage;    // Bijlage URL
  return r;
}

function maakCtx(inkoopRows) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);
  // SHEETS is een const in Config.gs → niet als ctx-property bereikbaar; match
  // daarom op sheetnaam (Verkoopfacturen/Inkoopfacturen) i.p.v. de constante.
  const verkoopData = [new Array(15).fill('h')];                       // alleen header
  const inkoopData = [new Array(19).fill('h')].concat(inkoopRows);
  const mk = (data) => ({ getDataRange: () => ({ getValues: () => data }), getLastRow: () => data.length });
  const ss = {
    getSheetByName: (n) => (/inkoop/i.test(n) ? mk(inkoopData) : /verkoop/i.test(n) ? mk(verkoopData) : null),
  };
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx, ss };
}

describe('F-ACC-005 — flag voorbelasting zonder bewijsstuk', () => {
  test('inkooprij zonder bijlage wordt geflagd; r5b blijft ongewijzigd', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 100, '21% (hoog)', 21, 'Betaald', ''),
      inkoopRij(new Date('2026-03-16'), 200, '21% (hoog)', 42, 'Betaald', 'https://drive.google.com/file/d/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);

    // Berekening NIET aangeraakt: beide rijen tellen volledig mee in r5b.
    expect(a.r5b).toBeCloseTo(63, 2);
    // Alleen de bijlage-loze rij wordt geflagd.
    expect(a._r5bZonderBewijsAantal).toBe(1);
    expect(a._r5bZonderBewijsBedrag).toBeCloseTo(21, 2);
  });

  test('alle inkooprijen met bijlage → geen flag', () => {
    const { ctx, ss } = maakCtx([
      inkoopRij(new Date('2026-03-15'), 100, '21% (hoog)', 21, 'Betaald', 'https://drive/x'),
    ]);
    const a = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(a._r5bZonderBewijsAantal).toBeUndefined();
    expect(a.r5b).toBeCloseTo(21, 2);
  });

  test('valideerAangifteVoorIndiening_ meldt de ontbrekende bewijsstukken', () => {
    const { ctx } = maakCtx([]);
    const issues = ctx.valideerAangifteVoorIndiening_(
      { r5a: 100, r5b: 63, saldo: 37, _r5bZonderBewijsAantal: 1, _r5bZonderBewijsBedrag: 21 },
      null
    );
    expect(issues.some((s) => /bewijsstuk|bijlage|art\. 15/i.test(s))).toBe(true);
  });
});

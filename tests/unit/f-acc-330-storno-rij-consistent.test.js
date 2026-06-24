/**
 * tests/unit/f-acc-330-storno-rij-consistent.test.js
 *
 * RATEL (F-ACC-330, accountant-as): bij storno zette _markeerFactuurGestorneerd_
 * de BTW van de originele factuur op 0 maar liet excl/incl staan → de rij werd
 * intern inconsistent (excl + 0 ≠ incl). Een accountant die de geleverde
 * VF-CSV natelt zag een rij die niet decomponeert (lijkt op een rekenfout);
 * GezondheidCheck flagde 'm bovendien als tarief-mismatch. De aangifte (BTW.gs)
 * én I4 slaan 'gestorneerd' tóch al volledig over, dus het zeroën was overbodig.
 * Deze test borgt dat de originele bedragen blijven staan (consistent) en alleen
 * de status verandert. Faalt zodra iemand het zeroën herintroduceert.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'SheetKolom.gs', 'Utils.gs', 'Boekingen.gs']);
// KOL is een top-level const in SheetKolom.gs; de gas-runtime exposeert consts
// niet als ctx-property (zie contract-sheet-kolom.test.js) → los evalueren.
const kolSrc = fs.readFileSync(path.resolve(__dirname, '../../src/SheetKolom.gs'), 'utf8');
const KOL = (new Function(kolSrc + '\n;return KOL;'))();
const VF = KOL.VF;

function maakSheet(grid, setCalls) {
  return {
    getDataRange: () => ({ getValues: () => grid }),
    getRange: (row, col) => ({ setValue: (v) => setCalls.push({ row, col, v }) }),
  };
}

function maakRij(velden) {
  const r = new Array(20).fill('');
  Object.keys(velden).forEach((k) => { r[VF[k]] = velden[k]; });
  return r;
}

describe('F-ACC-330 — storno laat de factuurrij intern consistent (excl+btw=incl)', () => {
  test('BTW wordt NIET op 0 gezet; alleen de status wordt Gestorneerd', () => {
    const header = new Array(20).fill('').map((_, i) => 'K' + i);
    const rij = maakRij({ factuurnummer: 'F000001', bedragExcl: 100, btwBedrag: 21, bedragIncl: 121, status: '' });
    const grid = [header, rij];
    const setCalls = [];
    // _markeerFactuurGestorneerd_ vraagt eerst de VERKOOPFACTUREN-sheet op en
    // returnt bij een match vóór het inkoop-pad → mock geeft de VF-sheet op de
    // eerste call, null daarna (SHEETS is een const, niet op ctx zichtbaar).
    let calls = 0;
    const ss = { getSheetByName: () => (calls++ === 0 ? maakSheet(grid, setCalls) : null) };

    ctx._markeerFactuurGestorneerd_(ss, 'F000001', 'BK000999');

    // Status → Gestorneerd (kolom 15 = [14]).
    const statusCall = setCalls.find((c) => c.col === VF.status + 1);
    expect(statusCall).toBeTruthy();
    expect(String(statusCall.v)).toBe('Gestorneerd');

    // GEEN enkele setValue(0) op de BTW-kolom (kolom 12 = [11]).
    const btwGezeroet = setCalls.some((c) => c.col === VF.btwBedrag + 1 && Number(c.v) === 0);
    expect(btwGezeroet).toBe(false);

    // De originele bedragen in de grid blijven dus excl+btw=incl.
    expect(rij[VF.bedragExcl] + rij[VF.btwBedrag]).toBe(rij[VF.bedragIncl]);
  });
});

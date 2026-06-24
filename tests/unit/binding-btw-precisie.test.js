/**
 * tests/unit/binding-btw-precisie.test.js
 *
 * RATEL (bug-klasse 9 — BINDENDE BTW). De factuur/uitgave-BTW werd berekend als
 * `rondBedrag_(excl * btwTarief)` met een float-tarief (0.21 / 0.09). Float-
 * representatie maakte de cent-afronding fout in DUIZENDEN gevallen — telkens
 * 1 cent te LAAG. Voorbeeld: excl €21,50 × 21% = €4,515 → de code gaf €4,51
 * i.p.v. de juiste €4,52. Die te lage btwBedrag wordt opgeslagen op de factuur
 * en GESOMMEERD in de BTW-aangifte → structurele onder-afdracht (naheffing +
 * boete-risico). Dit zat in de BINDENDE kern, niet in een advies-schatting.
 *
 * Fix: berekening via `rondTariefCent_` (integer-centen, wiskundig exact). De
 * bestaande tests gebruikten ronde bedragen (€100 → €21) en zagen de bug niet;
 * deze test dekt juist de drift-gevallen + bewaakt de keten (incl = excl + btw).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);

// Onafhankelijke integer-cent-referentie (half-up).
function trueBtw(excl, p) {
  const ec = Math.round(excl * 100);
  return Math.floor((ec * p + 50) / 100) / 100;
}

describe('klasse 9 — BINDENDE BTW exact (geen float-drift in de aangifte)', () => {
  test('€21,50 × 21% = €4,52 (float gaf €4,51 — 1 cent te laag)', () => {
    expect(ctx.berekenBtw('21% (hoog)', 21.50, 0).btw).toBe(4.52);
  });

  test('€21,50 × 9% = €1,94 (float gaf €1,93)', () => {
    expect(ctx.berekenBtw('9% (laag)', 21.50, 0).btw).toBe(1.94);
  });

  test('excl-pad btw == integer-cent-referentie over een breed bereik', () => {
    for (let ec = 1; ec <= 300000; ec += 137) {
      const excl = ec / 100;
      expect(ctx.berekenBtw('21%', excl, 0).btw).toBe(trueBtw(excl, 21));
      expect(ctx.berekenBtw('9%', excl, 0).btw).toBe(trueBtw(excl, 9));
    }
  });

  test('incl == excl + btw exact (journaalpost-balans blijft kloppen)', () => {
    for (let ec = 1; ec <= 200000; ec += 311) {
      const r = ctx.berekenBtw('21%', ec / 100, 0);
      expect(r.incl).toBe(Math.round((r.excl + r.btw) * 100) / 100);
    }
  });
});

describe('klasse 9 — bindende BTW-sites routen via rondTariefCent_ (anti-regressie)', () => {
  const trg = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');
  test('geen rondBedrag_(… * btwTarief) meer; verkoop/uitgave/declaratie via rondTariefCent_', () => {
    expect(trg).not.toMatch(/rondBedrag_\([^)]*\*\s*btwTarief\)/);
    expect((trg.match(/rondTariefCent_\([^)]*btwTarief\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

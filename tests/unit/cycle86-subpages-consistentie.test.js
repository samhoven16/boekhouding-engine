/**
 * tests/unit/cycle86-subpages-consistentie.test.js
 *
 * Cycle 86 — consistentie-sweep over de subpages.
 *
 * De homepage kreeg in cycles 83-84 een eerlijke stem + €49-snij in CTA's
 * en footer-claim. De subpages (vergelijking, over, transparantie, functies)
 * stonden nog op de oude versies. Deze sweep trekt minimaal de mechanische
 * patronen door:
 *
 *   - Nav-CTA: "Kopen · €49" → "Kopen"
 *   - Footer-claim: "Eenmalig €49, geen abonnement." → "Eenmalig betalen,
 *     geen abonnement."
 *
 * Inhoudelijke copy-pass (volledige paragrafen herschrijven) is NIET in
 * deze cycle — dat vereist per pagina kennis van context en doelgroep.
 * Regressie-guard hieronder voorkomt dat de oude patterns sluipen terug.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SUBPAGES = [
  'website/vergelijking/index.html',
  'website/over/index.html',
  'website/transparantie/index.html',
  'website/functies/index.html',
];

function lees(rel) {
  return fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
}

describe('CYCLE 86: nav-CTA op subpages is "Kopen" zonder prijs-suffix', () => {
  SUBPAGES.forEach((rel) => {
    test(rel + ': geen "Kopen · €49" in nav-CTA', () => {
      const html = lees(rel);
      expect(html).not.toMatch(/class="nav-cta">Kopen · €49</);
    });
  });

  SUBPAGES.forEach((rel) => {
    test(rel + ': nav-CTA bevat "Kopen"', () => {
      const html = lees(rel);
      expect(html).toMatch(/class="nav-cta">Kopen<\/a>/);
    });
  });
});

describe('CYCLE 86: footer-claim is consistent met homepage', () => {
  // Niet alle subpages hebben een footer-claim met de eenmalig-zin
  // (transparantie en over hebben kleinere footers). We checken alleen
  // dat ALS de zin er staat, de homepage-consistente versie wordt gebruikt.
  const PAGINAS_MET_CLAIM = [
    'website/vergelijking/index.html',
    'website/functies/index.html',
  ];

  PAGINAS_MET_CLAIM.forEach((rel) => {
    test(rel + ': footer-claim gebruikt "Eenmalig betalen"', () => {
      const html = lees(rel);
      expect(html).toMatch(/Eenmalig betalen, geen abonnement\./);
      expect(html).not.toMatch(/Eenmalig €49, geen abonnement\./);
    });
  });
});

describe('CYCLE 86: positief signaal — eerlijke stem wordt niet ondergraven', () => {
  // Subpages mogen geen marketing-aanjagers introduceren die op de homepage
  // verwijderd zijn (cycle 83-84). Deze guard pakt urgency-trucs in alle
  // subpages, niet alleen homepage.
  SUBPAGES.forEach((rel) => {
    test(rel + ': geen "Early bird" / "eerste 100 klanten" / "Daarna €79"', () => {
      const html = lees(rel);
      expect(html).not.toMatch(/early\s*bird/i);
      expect(html).not.toMatch(/eerste\s+100\s+klanten/i);
      expect(html).not.toMatch(/daarna\s+€\s*79/i);
    });
  });
});

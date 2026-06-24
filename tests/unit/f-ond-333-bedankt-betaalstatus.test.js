/**
 * tests/unit/f-ond-333-bedankt-betaalstatus.test.js
 *
 * F-OND-333 (HOOG) — Mollie krijgt één statische redirectUrl naar /bedankt/
 * zonder betaalstatus, en stuurt de klant daar naartoe bij ÉLKE eindstatus —
 * óók bij afgebroken/mislukt/verlopen. /bedankt zei onvoorwaardelijk "Bedankt!
 * Je product is onderweg" → een klant die niet betaalde denkt dat het gelukt is,
 * wacht op een mail die nooit komt, of betaalt mogelijk dubbel.
 *
 * Fix (status-neutraal, want Mollie geeft de status niet client-side mee): een
 * eerlijke callout die de niet-afgeronde betaling adresseert — "je bent niets
 * kwijt, bestel opnieuw / mail support". Deze ratel borgt dat die callout blijft.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const bedankt = fs.readFileSync(path.resolve(__dirname, '../../website/bedankt/index.html'), 'utf8');

describe('F-OND-333 — /bedankt adresseert ook de niet-afgeronde betaling', () => {
  test('benoemt de afgebroken/mislukte betaling (niet alleen de success-copy)', () => {
    expect(bedankt).toMatch(/niet afgerond|niet gelukt|mislukt|afgebroken/i);
  });

  test('neemt de dubbel-betaal-angst weg (er is niets afgeschreven / niets kwijt)', () => {
    expect(bedankt).toMatch(/niets afgeschreven|niets kwijt/i);
  });

  test('geeft een concrete uitweg: opnieuw bestellen + support', () => {
    expect(bedankt).toMatch(/\/kopen/);
    expect(bedankt).toMatch(/support@boekhoudbaar\.nl/);
  });
});

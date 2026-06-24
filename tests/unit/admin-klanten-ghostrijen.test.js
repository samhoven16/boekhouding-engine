/**
 * tests/unit/admin-klanten-ghostrijen.test.js
 *
 * Regressie uit live test (screenshot): "Boekhoudbaar — beheer" toonde 12 klanten
 * terwijl er 1 echte test-licentie was. Oorzaak: kapotte Dashboard-formules
 * (#REF!), '1'- en lege rijen werden als klant geteld. De oude filter liet een
 * rij door zodra die een '^BKHE-'-prefix OF een email had — te zwak. Nu telt
 * alleen een rij met een VOLLEDIG geldige sleutel (BKHE-XXXX-XXXX-XXXX) als klant,
 * en sheet-foutwaarden in cellen worden geschoond.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

function ctx() {
  return createGasRuntime([path.resolve(__dirname, '../../licence-server/AdminDashboard.gs')], {});
}

// Kolommen: 0=Sleutel 1=Naam 2=Email 3=Type 4=Status … 9=LaatsteValidatie 10=Onboarded 11=Verwijzer
const HEADER = ['Sleutel', 'Naam', 'Email', 'Type', 'Status', '', '', 'Aangemaakt', 'PaymentId', 'LaatsteVal', 'Onboarded', 'Verwijzer'];
const ECHT   = ['BKHE-AB23-CD45-EF67', 'Sam Hoven', 'samhoven@protonmail.com', 'Standaard', 'Actief', '', '', new Date(), 'tr_x', new Date(), '', ''];
const GHOSTS = [
  ['#REF!', '#REF!', '', '', '', '', '', '', '', '', '', ''],            // kapotte Dashboard-formule
  ['1', '1', '', '', '', '', '', '', '', '', '', ''],                    // KPI-getal
  ['', '', '', '', '', '', '', '', '', '', '', ''],                      // lege rij
  ['BKHE-', '#REF!', '', '', '', '', '', '', '', '', '', ''],            // halve sleutel
  ['Totaal klanten', '=COUNTA(A:A)', '', '', '', '', '', '', '', '', '', ''], // KPI-label
];

describe('Admin-klantenlijst negeert ghost-/foutrijen (#REF!, 1, leeg)', () => {
  const c = ctx();

  test('sleutel-validator accepteert alleen BKHE-XXXX-XXXX-XXXX', () => {
    expect(c._isGeldigeLicentieSleutel_('BKHE-AB23-CD45-EF67')).toBe(true);
    ['#REF!', '1', '', 'BKHE-', 'BKHE-AB23', 'Totaal klanten', null, 'bkhe-ab23-cd45-ef67']
      .forEach(function(s) { expect(c._isGeldigeLicentieSleutel_(s)).toBe(false); });
  });

  test('12 rijen incl. rotzooi → exact 1 klant geteld, #REF! verdwenen', () => {
    const data = [HEADER].concat(GHOSTS, GHOSTS, [ECHT]); // header + 10 ghosts + 1 echt = 12
    const r = c._telKlantenUitRijen_(data);
    expect(r.kpis.totaal).toBe(1);
    expect(r.kpis.actief).toBe(1);
    expect(r.klanten).toHaveLength(1);
    expect(r.klanten[0].naam).toBe('Sam Hoven');
    expect(r.klanten[0].email).toBe('samhoven@protonmail.com');
    expect(JSON.stringify(r.klanten)).not.toMatch(/#REF!|#N\/A|#VALUE!/);
  });

  test('foutwaarden in cellen van een GELDIGE rij worden geschoond', () => {
    const vuil = ['BKHE-AB23-CD45-EF67', '#REF!', '#REF!', 'Standaard', 'Actief', '', '', '', '', '', '', ''];
    const r = c._telKlantenUitRijen_([HEADER, vuil]);
    expect(r.kpis.totaal).toBe(1);
    expect(r.klanten[0].naam).toBe('');
    expect(r.klanten[0].email).toBe('');
  });
});

/**
 * tests/unit/moneybird-import-relatie-kolom.test.js
 *
 * RATEL (F-IMP-310): de Moneybird-XAF-import schreef nieuwe RELATIES in een
 * eigen 13-koloms layout (naam→[1], email→[9], telefoon→[10], type→[11]) die
 * NIET overeenkwam met het canonieke RELATIES-schema ([1]=Type, [2]=Naam,
 * [10]=Email; Setup.gs:542 / KOL.REL). Élke uit Moneybird gemigreerde klant
 * kwam dus corrupt binnen: naam-lookup las het adres, de factuur-mail las de
 * telefoon i.p.v. het e-mailadres. Reachable via Menu → "Migreer vanuit
 * Moneybird (XAF-import)".
 *
 * Deze test draait verwerkXafBestand met een mini-XAF (één klant) en eist dat
 * de toegevoegde rij op de juiste KOL.REL-kolommen staat. Faalt zónder de fix.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');
const fs = require('fs');
const path = require('path');

const kolSrc = fs.readFileSync(path.resolve(__dirname, '../../src/SheetKolom.gs'), 'utf8');
// eslint-disable-next-line no-new-func
const KOL = (new Function(kolSrc + '\n;return KOL;'))();

// Minimale XML-Element-shim (namespace-arg genegeerd; XAF heeft één namespace).
function E(naam, tekst, kinderen) {
  return {
    getName: () => naam,
    getText: () => (tekst == null ? '' : String(tekst)),
    getChild: (n) => (kinderen || []).find((c) => c.getName() === n) || null,
    getChildren: (n) => (kinderen || []).filter((c) => c.getName() === n),
  };
}

function bouwXafRoot(klantVelden) {
  const klantKinderen = Object.keys(klantVelden).map((k) => E(k, klantVelden[k]));
  const root = E('auditfile', '', [
    E('company', '', [
      E('customersSuppliers', '', [E('customer', '', klantKinderen)]),
      // bewust geen <transactions> → de verkoopfactuur-loop slaat over
    ]),
  ]);
  root.getNamespace = () => ({});
  return root;
}

function runImport(klantVelden, bestaandeRelaties) {
  const toegevoegd = [];
  const relSheet = {
    getDataRange: () => ({ getValues: () => bestaandeRelaties || [['Relatie ID', 'Type', 'Naam']] }),
    appendRow: (rij) => toegevoegd.push(rij),
  };
  const vfSheet = { getDataRange: () => ({ getValues: () => [[]] }), appendRow: () => {} };
  const ss = {
    getSheetByName: (n) => (n === 'Relaties' ? relSheet : n === 'Verkoopfacturen' ? vfSheet : null),
    getId: () => 'ss-test',
  };
  const root = bouwXafRoot(klantVelden);
  const ctx = createGasRuntime(['MoneybirdImport.gs'], {
    SHEETS: { RELATIES: 'Relaties', VERKOOPFACTUREN: 'Verkoopfacturen' },
    getSpreadsheet_: () => ss,
    saniteer_: (s) => s,                 // identiteit → assert exacte waarden
    rondBedrag_: (n) => n,
    XmlService: { parse: () => ({ getRootElement: () => root }) },
    Utilities: { formatString: (_fmt, n) => String(n) },
    Session: { getActiveUser: () => ({ getEmail: () => 'test@x.nl' }) },
  });
  const xaf = '<?xml version="1.0"?><auditfile>' + 'x'.repeat(120) + '</auditfile>';
  ctx.verwerkXafBestand(xaf);
  return toegevoegd;
}

describe('F-IMP-310 — Moneybird-import schrijft RELATIES op canonieke KOL.REL-kolommen', () => {
  const VELDEN = {
    custName: 'Jan de Vries BV',
    streetAddress: 'Hoofdstraat 1',
    postalCode: '1234 AB',
    city: 'Amsterdam',
    country: 'NL',
    taxRegIdent: 'NL123456789B01',
    email: 'jan@example.nl',
    telephone: '0612345678',
  };

  test('naam → KOL.REL.naam [2], type → [1] (oude bug schreef naam in [1])', () => {
    const [rij] = runImport(VELDEN);
    expect(rij[KOL.REL.naam]).toBe('Jan de Vries BV');
    expect(rij[KOL.REL.type]).toBe('Klant');
    expect(rij[1]).toBe('Klant');                 // niet de naam
    expect(rij[1]).not.toBe('Jan de Vries BV');
  });

  test('email → KOL.REL.email [10], telefoon → [11] (factuur-mail leest [10])', () => {
    const [rij] = runImport(VELDEN);
    expect(rij[KOL.REL.email]).toBe('jan@example.nl');
    expect(rij[KOL.REL.telefoon]).toBe('0612345678');
    expect(rij[KOL.REL.btwNummer]).toBe('NL123456789B01');
    expect(rij[KOL.REL.email]).not.toBe('0612345678'); // oude bug zette telefoon in [10]
  });

  test('adres/postcode/plaats/land op juiste kolommen + actief=Ja', () => {
    const [rij] = runImport(VELDEN);
    expect(rij[KOL.REL.adres]).toBe('Hoofdstraat 1');
    expect(rij[KOL.REL.postcode]).toBe('1234 AB');
    expect(rij[KOL.REL.plaats]).toBe('Amsterdam');
    expect(rij[KOL.REL.land]).toBe('NL');
    expect(rij[KOL.REL.actief]).toBe('Ja');
    expect(rij[KOL.REL.relatieId]).toMatch(/^REL/);
  });

  test('dedup vergelijkt op de Naam-kolom [2]: bestaande klant wordt overgeslagen', () => {
    const bestaand = [
      ['Relatie ID', 'Type', 'Naam'],
      ['REL0001', 'Klant', 'Jan de Vries BV'],   // naam staat (canoniek) in [2]
    ];
    expect(runImport(VELDEN, bestaand).length).toBe(0);
  });
});

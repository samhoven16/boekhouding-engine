/**
 * tests/unit/invariants-bankuitgaven-kolom.test.js
 *
 * RATEL (F-INV-330): detecteerOngekoppeldeBankuitgaven_ las het verkeerde
 * bank-schema — `bedrag = bankData[i][2]` is de OMSCHRIJVING (tekst), niet het
 * bedrag. parseFloat(tekst) = NaN → 0, en `if (bedrag >= 0) continue` sloeg
 * dan ELKE rij over → de controle ("ongekoppelde bank-uitgave") deed stil
 * niets en gaf altijd een lege lijst (vals "alles in orde"-gevoel).
 *
 * De functie heeft (nu) geen callers — latent — maar de bug is echt; na de
 * KOL.BT-migratie leest hij de juiste kolommen. Deze test borgt dat een
 * negatieve, ongekoppelde uitgave wél gevonden wordt. Faalt op de oude code.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');
const fs = require('fs');
const path = require('path');

const kolSrc = fs.readFileSync(path.resolve(__dirname, '../../src/SheetKolom.gs'), 'utf8');
// eslint-disable-next-line no-new-func
const KOL = (new Function(kolSrc + '\n;return KOL;'))();

function sheet(rows) {
  return { getDataRange: () => ({ getValues: () => rows }), getLastRow: () => rows.length };
}

function btRij(velden) {
  const r = new Array(15).fill('');
  r[KOL.BT.transactieId] = velden.id || 'BT1';
  r[KOL.BT.datum]        = velden.datum || new Date('2026-01-15');
  r[KOL.BT.omschrijving] = velden.omschrijving || '';
  r[KOL.BT.bedrag]       = velden.bedrag;
  r[KOL.BT.tegenpartij]  = velden.tegenpartij || '';
  return r;
}

function run(btRows) {
  const ss = {
    getSheetByName: (n) => {
      if (n === 'Banktransacties') return sheet([new Array(15).fill('hdr'), ...btRows]);
      if (n === 'Journaalposten') return sheet([new Array(19).fill('hdr')]);   // leeg
      if (n === 'Inkoopfacturen') return sheet([new Array(20).fill('hdr')]);   // leeg
      return null;
    },
  };
  const ctx = createGasRuntime(['Invariants.gs'], {
    SHEETS: { BANKTRANSACTIES: 'Banktransacties', JOURNAALPOSTEN: 'Journaalposten', INKOOPFACTUREN: 'Inkoopfacturen' },
    parseDatum_: (v) => (v instanceof Date ? v : new Date(v)),
  });
  return ctx.detecteerOngekoppeldeBankuitgaven_(ss);
}

describe('F-INV-330 — detecteerOngekoppeldeBankuitgaven_ leest juiste bank-kolommen', () => {
  test('negatieve, ongekoppelde uitgave wordt gevonden (oude code skipte alles)', () => {
    const verdacht = run([btRij({ bedrag: -100, omschrijving: 'Onbekende uitgave zonder boeking', tegenpartij: 'Mystery BV' })]);
    expect(verdacht.length).toBe(1);
    expect(verdacht[0].bedrag).toBe(-100);
    expect(verdacht[0].omschr).toContain('Onbekende uitgave');
    expect(verdacht[0].tegenpartij).toBe('Mystery BV');
  });

  test('positieve ontvangst wordt NIET geflagd (alleen uitgaven)', () => {
    expect(run([btRij({ bedrag: 250, omschrijving: 'Ontvangst klant' })]).length).toBe(0);
  });

  test('klein bedrag (<5) wordt genegeerd (bankkosten-ruis)', () => {
    expect(run([btRij({ bedrag: -2.5, omschrijving: 'Bankkosten' })]).length).toBe(0);
  });
});

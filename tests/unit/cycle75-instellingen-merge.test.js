/**
 * tests/unit/cycle75-instellingen-merge.test.js
 *
 * Cycle 75 — setup() data-behoud via per-veld MERGE.
 *
 * Voorheen sloeg zetInstellingen_ de re-init volledig over als kolom B >3
 * gevulde waarden had. Die drempel telde óók de default-waarden mee (een verse
 * setup vult ~19 cellen), dus de skip was grillig én een bestaande klant kreeg
 * nooit nieuwe instellingen uit een product-update.
 *
 * Nu: lees bestaande label→waarde en overschrijf een default ALLEEN als de
 * klant dat veld nog niet zelf invulde. Klant-data wint altijd; structuur wordt
 * altijd ververst. Deze test draait de ECHTE zetInstellingen_ met een
 * sheet-mock en controleert de samenvoeging op waarde-niveau.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

/** Chainable sheet-mock: leest uit beginGrid, vangt de hoofd-setValues op. */
function maakSheetMock(beginGrid) {
  const grid = (beginGrid || []).map((r) => r.slice());
  let written = null;
  const chainable = {
    setValues(v) {
      if (v[0] && v[0].length === 2 && v.length > 10) written = v.map((r) => r.slice());
      return this;
    },
    getValues() { return this._sub; },
    setNote() { return this; },
    setBackground() { return this; },
    setFontColor() { return this; },
    setFontWeight() { return this; },
    setFontSize() { return this; },
    setWrap() { return this; },
  };
  return {
    written: () => written,
    getLastRow: () => grid.length,
    getRange(row, col, numRows, numCols) {
      const sub = [];
      for (let i = 0; i < (numRows || 1); i++) {
        const src = grid[(row - 1) + i] || [];
        const r = [];
        for (let k = 0; k < (numCols || 1); k++) {
          r.push(src[(col - 1) + k] !== undefined ? src[(col - 1) + k] : '');
        }
        sub.push(r);
      }
      return Object.assign(Object.create(chainable), { _sub: sub });
    },
    clearContents() {},
    clearFormats() {},
    setRowHeight() {},
    setColumnWidth() {},
    setFrozenRows() {},
  };
}

function runZetInstellingen(beginGrid) {
  const ctx = createGasRuntime(['Config.gs', 'Setup.gs']);
  const sheet = maakSheetMock(beginGrid);
  const audits = [];
  ctx.schrijfAuditLog_ = (actie, det) => audits.push({ actie, det });
  const ss = { getSheetByName: () => sheet };
  ctx.zetInstellingen_(ss);
  return { sheet, audits, written: sheet.written() };
}

/** Zoek kolom-B-waarde bij een label in het weggeschreven grid. */
function waardeVan(written, label) {
  const rij = written.find((r) => String(r[0]).trim() === label);
  return rij ? rij[1] : undefined;
}

describe('CYCLE 75: zetInstellingen_ per-veld merge', () => {
  test('verse sheet → defaults geschreven (Bedrijfsnaam leeg, structuur compleet)', () => {
    const { written } = runZetInstellingen([]);
    expect(written).toBeTruthy();
    expect(waardeVan(written, 'Bedrijfsnaam')).toBe('');
    // Structuur aanwezig: een paar bekende labels.
    expect(waardeVan(written, 'IBAN')).toBeDefined();
    expect(waardeVan(written, 'Factuurprefix')).toBe('F');
  });

  test('klant-data wordt behouden bij re-init (Bedrijfsnaam + IBAN)', () => {
    const begin = [
      ['START HIER — Vul deze velden eenmalig in', 'x'],
      ['', ''],
      ['BEDRIJFSGEGEVENS', ''],
      ['Bedrijfsnaam', 'Jansen Klusbedrijf'],
      ['Adres', 'Hoofdstraat 12'],
      ['IBAN', 'NL99TEST0123456789'],
      ['KvK-nummer', '12345678'],
    ];
    const { written, audits } = runZetInstellingen(begin);
    expect(waardeVan(written, 'Bedrijfsnaam')).toBe('Jansen Klusbedrijf');
    expect(waardeVan(written, 'Adres')).toBe('Hoofdstraat 12');
    expect(waardeVan(written, 'IBAN')).toBe('NL99TEST0123456789');
    expect(waardeVan(written, 'KvK-nummer')).toBe('12345678');
    // Audit meldt hoeveel velden behouden zijn.
    expect(audits.some((a) => /samengevoegd/i.test(a.actie))).toBe(true);
  });

  test('een door de klant gewijzigde default wordt behouden', () => {
    const begin = [
      ['BOEKHOUDINSTELLINGEN', ''],
      ['Standaard BTW tarief', '9% (laag)'],   // afwijkend van default 21%
      ['BTW aangifteperiode', 'Maand'],         // afwijkend van default Kwartaal
    ];
    const { written } = runZetInstellingen(begin);
    expect(waardeVan(written, 'Standaard BTW tarief')).toBe('9% (laag)');
    expect(waardeVan(written, 'BTW aangifteperiode')).toBe('Maand');
  });

  test('nieuwe default-rijen worden toegevoegd, ook als de sheet al data had', () => {
    // Sheet mist 'Factuurprefix' maar heeft wel Bedrijfsnaam → structuur moet
    // worden aangevuld terwijl klant-data behouden blijft.
    const begin = [
      ['Bedrijfsnaam', 'Pietersen BV'],
    ];
    const { written } = runZetInstellingen(begin);
    expect(waardeVan(written, 'Bedrijfsnaam')).toBe('Pietersen BV');
    expect(waardeVan(written, 'Factuurprefix')).toBe('F'); // nieuwe default erbij
  });

  test('sectie-headers blijven op hun (lege) default, niet gecorrumpeerd', () => {
    const begin = [
      ['BEDRIJFSGEGEVENS', ''],
      ['Bedrijfsnaam', 'X BV'],
    ];
    const { written } = runZetInstellingen(begin);
    expect(waardeVan(written, 'BEDRIJFSGEGEVENS')).toBe('');
  });

  test('geen behouden velden (verse sheet) → geen merge-auditregel', () => {
    const { audits } = runZetInstellingen([]);
    expect(audits.some((a) => /samengevoegd/i.test(a.actie))).toBe(false);
  });
});

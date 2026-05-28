/**
 * tests/unit/cycle16-bank-csv-import-hardening.test.js
 *
 * Cycle 16 — verwerkBankCsvImport had twee silent-corruption bugs:
 *   1. Bedrag-parsing stripte ALLE punten → "1234.56" werd 123456 (€123k!)
 *   2. Onparsebare datum viel terug op vandaag → verkeerd kwartaal/aangifte
 * Beide breken zonder foutmelding. Deze cycle vervangt parser + datum-check
 * door strikte varianten en geeft de klant zicht op overgeslagen rijen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  const appendCalls = [];
  const sheetMock = {
    appendRow: (rij) => { appendCalls.push(rij); },
  };
  const ctx = createGasRuntime(
    ['Config.gs', 'Utils.gs', 'Verkoopfacturen.gs'],
    {}
  );
  ctx.getSpreadsheet_ = () => ({
    getSheetByName: (n) => (n === 'Banktransacties' ? sheetMock : null),
  });
  let n = 1;
  ctx.volgendTransactieId_ = () => 'BT' + String(n++).padStart(6, '0');
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx, appendCalls };
}

describe('CYCLE 16: _parseBankBedrag_ — formaat-detectie', () => {
  const { ctx } = maakCtx();
  const p = ctx._parseBankBedrag_;

  test('NL formaat "1234,56" → 1234.56', () => {
    expect(p('1234,56')).toBe(1234.56);
  });

  test('NL formaat met thousands "1.234,56" → 1234.56', () => {
    expect(p('1.234,56')).toBe(1234.56);
  });

  test('US/intl formaat "1234.56" → 1234.56 (was: 123456 — silent €123k-bug)', () => {
    expect(p('1234.56')).toBe(1234.56);
  });

  test('US formaat met thousands "1,234.56" → 1234.56', () => {
    expect(p('1,234.56')).toBe(1234.56);
  });

  test('Negatief NL "-1.234,56" → -1234.56', () => {
    expect(p('-1.234,56')).toBe(-1234.56);
  });

  test('Negatief US "-1,234.56" → -1234.56', () => {
    expect(p('-1,234.56')).toBe(-1234.56);
  });

  test('Met euro-teken "€ 99,00" → 99', () => {
    expect(p('€ 99,00')).toBe(99);
  });

  test('Onparsebaar → NaN (geen silent 0)', () => {
    expect(isNaN(p('abc'))).toBe(true);
    expect(isNaN(p(''))).toBe(true);
    expect(isNaN(p(null))).toBe(true);
  });

  test('Geen decimal-separator "1234" → 1234', () => {
    expect(p('1234')).toBe(1234);
  });
});

describe('CYCLE 16: _parseCsvDatumStrict_ — geen silent vandaag-fallback', () => {
  const { ctx } = maakCtx();
  const d = ctx._parseCsvDatumStrict_;

  test('ISO "2026-03-15" → Date 15 maart 2026', () => {
    const r = d('2026-03-15');
    expect(r).toBeInstanceOf(Date);
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(2);
    expect(r.getDate()).toBe(15);
  });

  test('NL "15-03-2026" → Date 15 maart 2026', () => {
    const r = d('15-03-2026');
    expect(r.getDate()).toBe(15);
    expect(r.getMonth()).toBe(2);
  });

  test('NL met slash "15/03/2026" → Date 15 maart 2026', () => {
    const r = d('15/03/2026');
    expect(r.getDate()).toBe(15);
  });

  test('Onparsebaar formaat "20260315" → null (geen vandaag-fallback)', () => {
    expect(d('20260315')).toBeNull();
  });

  test('Rollover "2026-02-31" → null (strict)', () => {
    expect(d('2026-02-31')).toBeNull();
  });

  test('Lege input → null', () => {
    expect(d('')).toBeNull();
    expect(d(null)).toBeNull();
  });

  test('Reeds Date-object → passthrough', () => {
    const x = new Date(2026, 5, 1);
    expect(d(x)).toBe(x);
  });
});

describe('CYCLE 16: verwerkBankCsvImport — end-to-end gedrag', () => {
  test('Mixed NL/US-bedragen importeren correct', () => {
    const { ctx, appendCalls } = maakCtx();
    const csv = [
      'Datum;Omschrijving;Bedrag',
      '2026-01-15;Klant A;1.234,56',
      '2026-01-16;Klant B;1234.56',
      '2026-01-17;Huur;-1500,00',
    ].join('\n');
    const r = ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(3);
    expect(r.overgeslagen).toBe(0);
    expect(appendCalls[0][3]).toBe(1234.56);
    expect(appendCalls[1][3]).toBe(1234.56);  // was: 123456 (silent €123k-bug)
    expect(appendCalls[2][3]).toBe(-1500);
  });

  test('Rij met onparsebare datum wordt overgeslagen (niet stil naar vandaag)', () => {
    const { ctx, appendCalls } = maakCtx();
    const csv = [
      'Datum;Omschr;Bedrag',
      '20260115;Slecht datumformaat;100,00',  // geen separators → null
      '2026-01-16;Goed;200,00',
    ].join('\n');
    const r = ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(1);
    expect(r.overgeslagen).toBe(1);
    expect(appendCalls.length).toBe(1);
    expect(appendCalls[0][2]).toBe('Goed');
  });

  test('Lege CSV → 0 zonder crash', () => {
    const { ctx, appendCalls } = maakCtx();
    const r = ctx.verwerkBankCsvImport('', ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(0);
    expect(appendCalls.length).toBe(0);
  });

  test('Ontbrekend tabblad Banktransacties → duidelijke fout', () => {
    const { ctx } = maakCtx();
    ctx.getSpreadsheet_ = () => ({ getSheetByName: () => null });
    expect(() => ctx.verwerkBankCsvImport('2026-01-15;X;1,00', ';', { datum: 0, omschr: 1, bedrag: 2 }))
      .toThrow(/Banktransacties ontbreekt/);
  });

  test('Audit-log entry geschreven met import-totalen', () => {
    const { ctx } = maakCtx();
    const csv = '2026-01-15;X;100,00';
    ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    const calls = ctx.schrijfAuditLog_.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('Bank CSV geïmporteerd');
    expect(calls[0][1]).toMatch(/transacties: 1/);
    expect(calls[0][1]).toMatch(/overgeslagen: 0/);
  });

  test('Bedrag = 0 wordt overgeslagen (geen lege transactie)', () => {
    const { ctx, appendCalls } = maakCtx();
    const csv = '2026-01-15;X;0,00';
    const r = ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(0);
    expect(r.overgeslagen).toBe(1);
    expect(appendCalls.length).toBe(0);
  });

  test('Header-row met "Datum" wordt overgeslagen', () => {
    const { ctx, appendCalls } = maakCtx();
    const csv = [
      'Boekingsdatum;Omschrijving;Bedrag',
      '2026-01-15;A;100,00',
    ].join('\n');
    const r = ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(1);
    expect(appendCalls[0][2]).toBe('A');
  });

  test('CRLF line-endings (Windows) werken', () => {
    const { ctx, appendCalls } = maakCtx();
    const csv = '2026-01-15;A;100,00\r\n2026-01-16;B;200,00\r\n';
    const r = ctx.verwerkBankCsvImport(csv, ';', { datum: 0, omschr: 1, bedrag: 2 });
    expect(r.aantal).toBe(2);
    expect(appendCalls.length).toBe(2);
  });
});

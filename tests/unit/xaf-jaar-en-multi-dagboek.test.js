/**
 * tests/unit/xaf-jaar-en-multi-dagboek.test.js
 *
 * C2 — Multi-dagboek splitsing in XAF (Verkoop, Inkoop, Bank, Kas, Memoriaal).
 *      Voorheen één <journal jrnID="ALG" jrnTp="O"> → accountantssoftware
 *      classificeerde dit als "ongestructureerd" en accountant moest
 *      handmatig herclassificeren.
 *
 * C3 — Jaar-parameter op _bouwXafXml_ + exporteerXaf. Voorheen werd altijd
 *      new Date().getFullYear() genomen → accountant kon in maart 2027 geen
 *      XAF over 2026 maken (header zei 2027, alle 2026-rijen werden
 *      uitgefilterd).
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const XAF = fs.readFileSync(path.resolve(__dirname, '../../src/XafExport.gs'), 'utf8');

function ctxBouw() {
  return createGasRuntime(['Config.gs', 'Utils.gs', 'XafExport.gs']);
}

describe('C2: _xafDagboekClassificeer_ — RGS-conforme dagboek-mapping', () => {
  const c = ctxBouw();

  test('"Verkoopdagboek" → V', () => {
    expect(c._xafDagboekClassificeer_('Verkoopdagboek')).toEqual({ id: 'V', type: 'V', desc: 'Verkoopdagboek' });
  });
  test('"Inkoop" → I', () => {
    expect(c._xafDagboekClassificeer_('Inkoop facturen')).toEqual({ id: 'I', type: 'I', desc: 'Inkoopdagboek' });
  });
  test('"Bank SEPA" / "Mollie" / "Tikkie" → B', () => {
    expect(c._xafDagboekClassificeer_('Bank ING').id).toBe('B');
    expect(c._xafDagboekClassificeer_('Mollie payments').id).toBe('B');
    expect(c._xafDagboekClassificeer_('Tikkie').id).toBe('B');
  });
  test('"Kas" / "Kassa" / "Contant" → K', () => {
    expect(c._xafDagboekClassificeer_('Kas').id).toBe('K');
    expect(c._xafDagboekClassificeer_('Kassa').id).toBe('K');
    expect(c._xafDagboekClassificeer_('Contant').id).toBe('K');
  });
  test('"Memoriaal" / "Correctie" / "Herwaardering" → M', () => {
    expect(c._xafDagboekClassificeer_('Memoriaal').id).toBe('M');
    expect(c._xafDagboekClassificeer_('Correctie BTW').id).toBe('M');
  });
  test('Onbekend label → fallback Memoriaal (default)', () => {
    expect(c._xafDagboekClassificeer_('xyz').id).toBe('M');
    expect(c._xafDagboekClassificeer_('').id).toBe('M');
  });
});

describe('C2: _bouwTransactionsXml_ groepeert per dagboek', () => {
  const c = ctxBouw();

  function maakSheet(rows) {
    const HEADER = ['ID', 'Datum', 'Omschr', 'Dagboek', 'Debet', 'DebetNaam', 'Credit', 'CreditNaam', 'Bedrag'];
    const data = [HEADER].concat(rows);
    return {
      getSheetByName: (n) => (n === 'Journaalposten' ? {
        getDataRange: () => ({ getValues: () => data }),
      } : null),
    };
  }

  test('Twee verkoop- + één inkoop- + één bank-transactie → drie <journal> blokken', () => {
    const ss = maakSheet([
      ['B001', new Date(2026, 0, 15), 'Verkoop F1', 'Verkoopdagboek', '1300', 'Deb', '8000', 'Omzet', 100],
      ['B002', new Date(2026, 1, 1),  'Verkoop F2', 'Verkoopdagboek', '1300', 'Deb', '8000', 'Omzet', 200],
      ['B003', new Date(2026, 1, 5),  'Inkoop',     'Inkoopdagboek',  '4000', 'Huur', '1600', 'Cred', 50],
      ['B004', new Date(2026, 1, 10), 'Bank ontv.', 'Bank ING',       '1100', 'Bank', '1300', 'Deb',  100],
    ]);
    const xml = c._bouwTransactionsXml_(ss, 2026);
    // V vóór I vóór B vóór K vóór M
    const idxV = xml.indexOf('<jrnID>V</jrnID>');
    const idxI = xml.indexOf('<jrnID>I</jrnID>');
    const idxB = xml.indexOf('<jrnID>B</jrnID>');
    expect(idxV).toBeGreaterThan(-1);
    expect(idxI).toBeGreaterThan(idxV);
    expect(idxB).toBeGreaterThan(idxI);
    // 2 transacties in V, 1 in I, 1 in B
    const aantalTrV = (xml.slice(idxV, idxI).match(/<transaction>/g) || []).length;
    expect(aantalTrV).toBe(2);
  });

  test('Geen rijen in opgegeven jaar → kommentaar i.p.v. lege journals', () => {
    const ss = maakSheet([
      ['B001', new Date(2025, 0, 15), 'oud', 'Verkoopdagboek', '1300', 'D', '8000', 'O', 100],
    ]);
    const xml = c._bouwTransactionsXml_(ss, 2026);
    expect(xml).toMatch(/Geen journaalposten in jaar 2026/);
  });

  test('Geen multi-dagboek? oude code-pad wordt nooit getrokken (regressie)', () => {
    expect(XAF).not.toMatch(/<jrnID>ALG<\/jrnID>/);
  });
});

describe('C3: _bouwXafXml_ accepteert jaar-parameter', () => {
  const c = ctxBouw();

  function mockSs() {
    return {
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [['h']] }),
        getLastRow: () => 1,
      }),
      getId: () => 'mock',
    };
  }

  test('Met jaar-arg 2026 → <fiscalYear>2026</fiscalYear>', () => {
    const xml = c._bouwXafXml_(mockSs(), 2026);
    expect(xml).toMatch(/<fiscalYear>2026<\/fiscalYear>/);
    expect(xml).toMatch(/<startDate>2026-01-01<\/startDate>/);
    expect(xml).toMatch(/<endDate>2026-12-31<\/endDate>/);
  });

  test('Met jaar-arg 2027 → <fiscalYear>2027</fiscalYear>', () => {
    const xml = c._bouwXafXml_(mockSs(), 2027);
    expect(xml).toMatch(/<fiscalYear>2027<\/fiscalYear>/);
  });

  test('Zonder jaar-arg → default huidig jaar (backwards-compat)', () => {
    const xml = c._bouwXafXml_(mockSs());
    const huidig = new Date().getFullYear();
    expect(xml).toMatch(new RegExp('<fiscalYear>' + huidig + '<\\/fiscalYear>'));
  });

  test('Ongeldige jaar-arg → veilig fallback naar huidig jaar (geen crash)', () => {
    const xml = c._bouwXafXml_(mockSs(), 'kaas');
    const huidig = new Date().getFullYear();
    expect(xml).toMatch(new RegExp('<fiscalYear>' + huidig + '<\\/fiscalYear>'));
  });
});

describe('C3: exporteerXaf accepteert jaar-overschrijving', () => {
  test('Functie-signatuur accepteert jaarOverschrijving-parameter', () => {
    expect(XAF).toMatch(/function exporteerXaf\(jaarOverschrijving\)/);
  });

  test('ExportAccountant.gs geeft het jaar door aan _bouwXafXml_', () => {
    const EA = fs.readFileSync(path.resolve(__dirname, '../../src/ExportAccountant.gs'), 'utf8');
    expect(EA).toMatch(/_bouwXafXml_\(ss,\s*jaar\)/);
  });
});

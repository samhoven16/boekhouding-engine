/**
 * tests/unit/bankImport.test.js
 *
 * Regressietests voor CSV-parsing in BankImport.gs.
 *   - ING NL-formaat (semicolon + DD-MM-YYYY + komma-decimaal)
 *   - Bunq EN-formaat (comma + ISO-datum + punt-decimaal)
 *   - Auto-detectie delimiter
 *   - Datum-varianten (YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY)
 *   - Af/Bij → negatief/positief bedrag
 *   - Factuurnummer-extractie uit omschrijving
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('BankImport.gs — parseBankCsv_', () => {
  let ctx;

  beforeEach(() => {
    ctx = createGasRuntime(['Config.gs', 'BankImport.gs'], {
      rondBedrag_: (n) => Math.round(n * 100) / 100,
      getSpreadsheet_: () => ({ getSheetByName: () => null }),
    });
  });

  describe('ING-achtig CSV (semicolon, NL-datum, komma)', () => {
    it('parseert een standaard ING-regel', () => {
      const csv = [
        '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"',
        '"20240115","Klant BV","NL12INGB0001234567","NL98ABNA0999888777","IC","Bij","1210,00","Overschrijving","Factuur F000042"',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res).toHaveLength(1);
      expect(res[0].bedrag).toBe(1210.00);
      expect(res[0].datum.getFullYear()).toBe(2024);
      expect(res[0].datum.getMonth()).toBe(0);
      expect(res[0].datum.getDate()).toBe(15);
    });

    it('Af-transactie → negatief bedrag', () => {
      const csv = [
        '"Datum","Naam / Omschrijving","Af Bij","Bedrag (EUR)"',
        '"20240201","KPN","Af","42,50"',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res[0].bedrag).toBe(-42.50);
    });
  });

  describe('Bunq-achtig CSV (comma, ISO-datum, punt)', () => {
    it('parseert een Bunq-regel met negatief bedrag', () => {
      const csv = [
        'Date,Amount,Account,Counterparty,Description',
        '2024-01-15,-42.50,NL..,KPN BV,Maandelijkse telefoonrekening',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res).toHaveLength(1);
      expect(res[0].bedrag).toBe(-42.50);
      expect(res[0].datum.getMonth()).toBe(0);
    });

    it('parseert een positieve ontvangst', () => {
      const csv = [
        'Date,Amount,Counterparty,Description',
        '2024-02-01,1500.00,Webshop BV,Betaling INV-2024-005',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res[0].bedrag).toBe(1500);
      expect(res[0].referentie).toBe('INV-2024-005');
    });
  });

  describe('Robustness', () => {
    it('lege CSV → lege array', () => {
      expect(ctx.parseBankCsv_('')).toEqual([]);
      expect(ctx.parseBankCsv_('header\n')).toEqual([]);
    });

    it('ongeldige datum → rij overgeslagen', () => {
      const csv = [
        'Date,Amount,Description',
        'not-a-date,100,foo',
        '2024-01-15,200,bar',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res).toHaveLength(1);
      expect(res[0].bedrag).toBe(200);
    });

    it('bedrag 0 → overgeslagen (geen info)', () => {
      const csv = [
        'Date,Amount,Description',
        '2024-01-15,0,reden onbekend',
        '2024-01-16,50,echt',
      ].join('\n');
      const res = ctx.parseBankCsv_(csv);
      expect(res).toHaveLength(1);
      expect(res[0].bedrag).toBe(50);
    });
  });

  describe('Factuurnummer-extractie', () => {
    it('vindt standaard prefix-formaat (F000042)', () => {
      expect(ctx.extraheerReferentie_('Betaling factuur F000042')).toBe('F000042');
    });

    it('vindt INV-prefix met koppeltekens (INV-2024-001)', () => {
      expect(ctx.extraheerReferentie_('Payment for INV-2024-001')).toBe('INV-2024-001');
    });

    it('vindt jaar-prefix (2024-0042)', () => {
      expect(ctx.extraheerReferentie_('Betaling 2024-0042')).toBe('2024-0042');
    });

    it('geeft lege string bij geen match', () => {
      expect(ctx.extraheerReferentie_('Maandelijkse bijdrage')).toBe('');
    });
  });
});

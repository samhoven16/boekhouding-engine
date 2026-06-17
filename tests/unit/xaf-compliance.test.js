/**
 * tests/unit/xaf-compliance.test.js
 *
 * Auditfile-Compliance test (uit 7-lens audit-prompt).
 *
 * Verifieert dat _bouwXafXml_ output voldoet aan Auditfile Financieel 3.2
 * standaard van de Nederlandse Belastingdienst:
 *   1. XML well-formed (valid markup, geen unescaped chars)
 *   2. Namespace correct (http://www.auditfiles.nl/XAF/3.2)
 *   3. Verplichte secties aanwezig (header, company, generalLedger, transactions)
 *   4. Bedrijfsgegevens (companyName + KvK + BTW) correct ingevuld
 *   5. Per transactie: debet-amount = credit-amount (dubbel-boekhouden)
 *   6. Datum-format ISO 8601
 *   7. Metadata: version + dateCreated + softwareDesc
 *
 * Geen externe XML-parser dependency — eigen mini-checks die strikt
 * genoeg zijn voor compliance-verificatie.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('XAF Auditfile 3.2 — compliance verificatie', () => {
  let ctx;
  let xaf;

  beforeAll(() => {
    // BTW.gs levert parseBtwTarief_ (gebruikt door de <vat>-blokken in XafExport).
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'BTW.gs', 'XafExport.gs']);

    // Mock instellingen
    ctx.getInstelling_ = (k) => {
      if (k === 'Bedrijfsnaam') return 'Test BV';
      if (k === 'KvK-nummer') return '12345678';
      if (k === 'BTW-nummer') return 'NL004384587B39';
      return '';
    };

    // Mock spreadsheet met test-data
    const grootboek = [
      ['Code', 'Naam'],
      ['1300', 'Debiteuren'],
      ['1500', 'Verleende kredieten'],
      ['4100', 'Omzet 21%'],
      ['7000', 'Inkoopwaarde'],
    ];
    // Schema MOET matchen met Setup.gs:zetJournaalpostenHeaders_:
    //   id, datum, omschr, dagboek, debet-rek, debet-naam, credit-rek, credit-naam, bedrag, ...
    const journaal = [
      ['ID', 'Datum', 'Omschr', 'Dagboek', 'Debet', 'DNaam', 'Credit', 'CNaam', 'Bedrag', 'BTW%', 'BTWBedrag'],
      ['JP001', new Date(2026, 0, 15), 'Verkoop fact 001', 'Verkoop', '1300', 'Debiteuren', '4100', 'Omzet 21%', 121.00, '21%', 21.00],
      ['JP002', new Date(2026, 2, 20), 'Inkoop materiaal', 'Inkoop', '7000', 'Inkoopwaarde', '1500', 'Kredieten', 50.00, '21%', 8.68],
    ];
    // Kolomlayout conform .claude/sheet-schemas.md RELATIES:
    // [0]=Relatie ID, [1]=Type, [2]=Naam, [3]=Contactpersoon, [4]=Adres,
    // [5]=Postcode, [6]=Plaats, [7]=Land, [8]=KvK, [9]=BTW, [10]=Email
    const relaties = [
      ['Relatie ID', 'Type', 'Naam', 'Contactpersoon', 'Adres', 'Postcode', 'Plaats', 'Land', 'KvK', 'BTW', 'Email'],
      ['REL0001', 'Klant', 'Klant A', '', 'Straat 1', '1234 AB', 'Adam', 'NL', '87654321', 'NL123456789B01', 'a@klant.nl'],
      ['REL0002', 'Leverancier', 'Lev B', '', 'Weg 2', '5678 CD', 'Rdam', 'NL', '11223344', 'NL987654321B02', 'b@lev.nl'],
    ];

    const mockSheets = {
      'Grootboekschema': grootboek,
      'Journaalposten': journaal,
      'Relaties': relaties,
    };

    const mockSs = {
      getSheetByName: (naam) => {
        if (!mockSheets[naam]) return null;
        return {
          getDataRange: () => ({ getValues: () => mockSheets[naam] }),
        };
      },
    };

    ctx.Utilities = {
      formatDate: (d, tz, fmt) => {
        if (!(d instanceof Date)) return '';
        if (fmt === 'yyyy-MM-dd') return d.toISOString().slice(0, 10);
        if (fmt.indexOf('T') !== -1) return d.toISOString().slice(0, 19);
        return d.toISOString();
      },
    };

    xaf = ctx._bouwXafXml_(mockSs);
  });

  test('XML start met versie-declaratie', () => {
    expect(xaf.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  test('Namespace correct: auditfiles.nl/XAF/3.2', () => {
    expect(xaf).toContain('xmlns="http://www.auditfiles.nl/XAF/3.2"');
    expect(xaf).toContain('version="3.2"');
  });

  test('Root element <auditfile> bestaat en is gesloten', () => {
    expect(xaf).toContain('<auditfile');
    expect(xaf).toContain('</auditfile>');
  });

  test('Verplichte sectie: <header>', () => {
    expect(xaf).toContain('<header>');
    expect(xaf).toContain('</header>');
  });

  test('Header bevat fiscalYear', () => {
    expect(xaf).toMatch(/<fiscalYear>\d{4}<\/fiscalYear>/);
  });

  test('Header bevat curCode EUR', () => {
    expect(xaf).toContain('<curCode>EUR</curCode>');
  });

  test('Header bevat softwareDesc Boekhoudbaar', () => {
    expect(xaf).toContain('<softwareDesc>Boekhoudbaar</softwareDesc>');
  });

  test('Header bevat dateCreated in ISO 8601', () => {
    expect(xaf).toMatch(/<dateCreated>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/dateCreated>/);
  });

  test('Company-sectie bevat bedrijfsnaam', () => {
    expect(xaf).toContain('<companyName>Test BV</companyName>');
  });

  test('Company-sectie bevat KvK companyIdent', () => {
    expect(xaf).toContain('<companyIdent>12345678</companyIdent>');
  });

  test('Company-sectie bevat BTW taxRegIdent', () => {
    expect(xaf).toContain('<taxRegistrationCountry>NL</taxRegistrationCountry>');
    expect(xaf).toContain('<taxRegIdent>NL004384587B39</taxRegIdent>');
  });

  test('Verplichte sectie: <generalLedger>', () => {
    expect(xaf).toContain('<generalLedger>');
    expect(xaf).toContain('</generalLedger>');
  });

  test('Grootboekrekeningen bevatten accID + accDesc + accTp', () => {
    expect(xaf).toContain('<accID>1300</accID>');
    expect(xaf).toContain('<accDesc>Debiteuren</accDesc>');
    expect(xaf).toMatch(/<accTp>[BP]<\/accTp>/);
  });

  test('Verplichte sectie: <transactions>', () => {
    expect(xaf).toContain('<transactions>');
    expect(xaf).toContain('</transactions>');
  });

  test('Per transactie: minstens 1 debet + 1 credit regel (dubbel boekhouden)', () => {
    const debetCount = (xaf.match(/<amntTp>D<\/amntTp>/g) || []).length;
    const creditCount = (xaf.match(/<amntTp>C<\/amntTp>/g) || []).length;
    expect(debetCount).toBeGreaterThan(0);
    expect(creditCount).toBeGreaterThan(0);
    expect(debetCount).toBe(creditCount);  // Per transactie 1D + 1C
  });

  test('Transactie-datum in ISO 8601 yyyy-MM-dd format', () => {
    expect(xaf).toMatch(/<transactionDate>\d{4}-\d{2}-\d{2}<\/transactionDate>/);
  });

  test('Periode-nummer 1-12 voor maand', () => {
    expect(xaf).toMatch(/<periodNumber>\d+<\/periodNumber>/);
  });

  test('customersSuppliers bevat klant A (custSupTp C), geen ongeldige wrappers', () => {
    expect(xaf).toContain('<customersSuppliers>');
    expect(xaf).toContain('<custSupName>Klant A</custSupName>');
    // De vorige <customers>/<suppliers>-wrappers bestaan niet in de XSD.
    expect(xaf).not.toContain('<customers>');
    expect(xaf).not.toContain('<suppliers>');
  });

  test('leverancier B: custSupTp S + commerceNr + eMail (geldige XSD-elementen)', () => {
    expect(xaf).toContain('<custSupName>Lev B</custSupName>');
    expect(xaf).toContain('<custSupTp>S</custSupTp>');
    // KvK via commerceNr (niet het ongeldige custSupCompanyIdent).
    expect(xaf).toContain('<commerceNr>11223344</commerceNr>');
    expect(xaf).not.toContain('custSupCompanyIdent');
    // Email via <eMail> (niet via het ongeldige <contact><contEmail>).
    expect(xaf).toContain('<eMail>b@lev.nl</eMail>');
    expect(xaf).not.toContain('contEmail');
  });

  test('XSD company-volgorde: customersSuppliers → generalLedger → vatCodes → transactions', () => {
    const cs = xaf.indexOf('<customersSuppliers>');
    const gl = xaf.indexOf('<generalLedger>');
    const vc = xaf.indexOf('<vatCodes>');
    const tx = xaf.indexOf('<transactions>');
    expect(cs).toBeGreaterThan(-1);
    expect(cs).toBeLessThan(gl);
    expect(gl).toBeLessThan(vc);
    expect(vc).toBeLessThan(tx);
  });

  test('vatCodes-header definieert de gebruikte NL-tarieven (21/9/0)', () => {
    expect(xaf).toContain('<vatCode><vatID>21</vatID>');
    expect(xaf).toContain('<vatCode><vatID>9</vatID>');
    expect(xaf).toContain('<vatCode><vatID>0</vatID>');
  });

  test('trLine met BTW draagt een <vat>-blok met de 4 verplichte velden', () => {
    expect(xaf).toMatch(/<vat>\s*<vatID>21<\/vatID>\s*<vatPerc>21\.00<\/vatPerc>\s*<vatAmnt>21\.00<\/vatAmnt>\s*<vatAmntTp>C<\/vatAmntTp>\s*<\/vat>/);
  });

  test('vatAmntTp-richting: inkoop = D (input-BTW), verkoop = C (output-BTW)', () => {
    // JP002 = inkoop, BTW 8.68 → D
    expect(xaf).toMatch(/<vatAmnt>8\.68<\/vatAmnt>\s*<vatAmntTp>D<\/vatAmntTp>/);
    // JP001 = verkoop, BTW 21.00 → C
    expect(xaf).toMatch(/<vatAmnt>21\.00<\/vatAmnt>\s*<vatAmntTp>C<\/vatAmntTp>/);
  });

  test('keyref: elke vatID in een trLine/<vat> is gedefinieerd in <vatCodes>', () => {
    const headerIDs = new Set();
    const headerRe = /<vatCode><vatID>([^<]+)<\/vatID>/g;
    let m;
    while ((m = headerRe.exec(xaf)) !== null) headerIDs.add(m[1]);
    const lineRe = /<vat>\s*<vatID>([^<]+)<\/vatID>/g;
    const used = [];
    while ((m = lineRe.exec(xaf)) !== null) used.push(m[1]);
    expect(used.length).toBeGreaterThan(0);
    used.forEach((id) => expect(headerIDs.has(id)).toBe(true));
  });

  test('Bedragen in 2-decimaal format', () => {
    expect(xaf).toMatch(/<amnt>\d+\.\d{2}<\/amnt>/);
  });

  test('XML well-formed: aantal opening-tags = aantal closing-tags voor <transaction>', () => {
    const open = (xaf.match(/<transaction>/g) || []).length;
    const close = (xaf.match(/<\/transaction>/g) || []).length;
    expect(open).toBe(close);
    expect(open).toBe(2);  // 2 test-journaalposten
  });

  test('Geen unescaped & in tekst-velden', () => {
    // Check dat & nooit voorkomt ZONDER ; erna (alle entities zijn &amp; &lt; etc)
    const onverwacht = xaf.match(/&(?![a-z]+;|#\d+;)/g);
    expect(onverwacht).toBeNull();
  });

  test('Geen unescaped < of > in tekst-content (alleen in XML-tags)', () => {
    // Verwijder alle tags, dan mag de tekst geen < of > meer bevatten
    const zonderTags = xaf.replace(/<[^>]+>/g, '');
    expect(zonderTags).not.toMatch(/<|>/);
  });

  test('XAF is geldig UTF-8 (geen mojibake)', () => {
    expect(() => Buffer.from(xaf, 'utf8').toString('utf8')).not.toThrow();
    expect(xaf).not.toContain('Ã©');  // common UTF-8 misinterpretation marker
  });

  test('XAF-size redelijk (>500 bytes, <10MB voor test-data)', () => {
    expect(xaf.length).toBeGreaterThan(500);
    expect(xaf.length).toBeLessThan(10 * 1024 * 1024);
  });
});

// ════════════════════════════════════════════════
//  EXTRA: XSS / injection in klantnaam wordt geescaped
// ════════════════════════════════════════════════
describe('XAF — XSS/injection-bescherming', () => {
  let ctx;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'XafExport.gs']);
  });

  test('Klantnaam met < > & wordt XML-escaped', () => {
    expect(ctx._xafEsc_('Test & "Co" <i>')).toBe('Test &amp; &quot;Co&quot; &lt;i&gt;');
  });

  test('Apostrophe en quote worden geescaped', () => {
    expect(ctx._xafEsc_("O'Brien")).toBe('O&apos;Brien');
  });

  test('Null/undefined → lege string (geen crash)', () => {
    expect(ctx._xafEsc_(null)).toBe('');
    expect(ctx._xafEsc_(undefined)).toBe('');
  });

  test('Number → string-representatie', () => {
    expect(ctx._xafEsc_(123.45)).toBe('123.45');
  });
});

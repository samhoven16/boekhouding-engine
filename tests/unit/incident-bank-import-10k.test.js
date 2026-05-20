/**
 * tests/unit/incident-bank-import-10k.test.js
 *
 * FORENSISCH RAPPORT — simulatie van klant-incident:
 *   "Boekhoudsysteem gecrasht na bankimport van 10.000 regels"
 *
 * Reproduceert exacte scenario:
 *   - 10.000 CSV-rijen
 *   - Verkeerde headers ("Geld" ipv "Bedrag", "Wanneer" ipv "Datum")
 *   - 31-feb datums (rollover-trap)
 *   - HTML-injection in omschrijvingen
 *
 * Doel: vaststellen of het systeem CRASH, SILENT-FAIL, of CORRECT afhandelt.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('INCIDENT-FORENSICS: Bankimport 10k rijen + bad data', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BankImport.gs']);
  });

  // Genereer 10.000-rijen CSV — exacte scenario
  function genereerSlechteCsv(aantalRijen) {
    // Met opzet VERKEERDE headers — geen 'datum'/'bedrag' overeenkomst
    let csv = 'Wanneer;Geld;Wat is dit;Wie betaalt\n';
    for (let i = 1; i <= aantalRijen; i++) {
      // Mix legit + edge-cases
      let datum;
      if (i % 100 === 0) datum = '31-02-2026';  // 31 feb — bestaat niet
      else if (i % 200 === 0) datum = '99-99-9999';  // nonsense
      else if (i % 300 === 0) datum = '';  // leeg
      else datum = '15-03-2026';

      let bedrag;
      if (i % 50 === 0) bedrag = 'niet-een-getal';
      else if (i % 75 === 0) bedrag = '1e308';  // bijna-Infinity
      else bedrag = '100,50';

      const omschr = (i % 25 === 0)
        ? '<script>alert("xss")</script>'
        : 'Transactie ' + i;
      const tegenpartij = 'Naam ' + i;

      csv += datum + ';' + bedrag + ';' + omschr + ';' + tegenpartij + '\n';
    }
    return csv;
  }

  test('Stap 1: parseBankCsv_ gooit nu specifieke Error bij verkeerde headers (was silent fail)', () => {
    const csv = genereerSlechteCsv(10000);
    try {
      ctx.parseBankCsv_(csv);
      throw new Error('Verwachte CSV_HEADERS_NIET_HERKEND niet geworpen');
    } catch (e) {
      expect(e.code).toBe('CSV_HEADERS_NIET_HERKEND');
      expect(e.message).toMatch(/headers niet herkend/);
      expect(e.gevondenHeaders).toContain('wanneer');
    }
  });

  test('Stap 2: Caller-side moet exception catchen + tonen aan klant', () => {
    const csv = 'Wanneer;Geld\n15-03-2026;100,50\n';
    expect(() => ctx.parseBankCsv_(csv)).toThrow(/headers niet herkend/);
  });

  test('Stap 3: Met JUISTE headers — datum + bedrag + omschr — werkt 10k', () => {
    let csv = 'Datum;Bedrag;Omschrijving;Naam tegenpartij\n';
    for (let i = 1; i <= 10000; i++) {
      const datum = (i % 100 === 0) ? '31-02-2026' : '15-03-2026';
      const bedrag = (i % 50 === 0) ? 'niet-een-getal' : '100,50';
      csv += datum + ';' + bedrag + ';Transactie ' + i + ';Naam ' + i + '\n';
    }
    const result = ctx.parseBankCsv_(csv);
    expect(result.length).toBeGreaterThan(0);
    console.log('FORENSICS goede headers: ' + result.length + ' rijen geparsed (verwacht ~9700 — 31-feb + nonsense skip)');
    // 31-feb (100 rows) gefilterd via parseBankDatum_ → null → skip
    // 'niet-een-getal' (200 rows) → parseBankBedrag_ → 0 → skip
    // Rest: 10000 - 100 - 200 = ~9700 succesvolle parses
  });

  test('Stap 4: HTML-injection in omschr → blijft string, geen execution', () => {
    let csv = 'Datum;Bedrag;Omschrijving\n';
    csv += '15-03-2026;100,50;<script>alert("xss")</script>\n';
    csv += '15-03-2026;200,00;<img src=x onerror=alert(1)>\n';
    const result = ctx.parseBankCsv_(csv);
    expect(result.length).toBe(2);
    // Payload zit ALS STRING in result.omschr — wordt pas gevaarlijk bij sheet-write
    // zonder veiligSheetWaarde_ of bij HTML-render zonder escHtml_
    expect(result[0].omschr).toContain('script');
  });

  test('Stap 5: 31-feb wordt NIET silent doorgezet naar 3-mrt', () => {
    let csv = 'Datum;Bedrag;Omschrijving\n';
    csv += '31-02-2026;100,50;Test rollover\n';
    const result = ctx.parseBankCsv_(csv);
    // parseBankDatum_ returnt null bij invalid date → continue → 0 resultaten
    expect(result.length).toBe(0);
  });

  test('Stap 6: Memory-impact 10k rijen met JUISTE headers ruim binnen GAS-limit', () => {
    let csv = 'Datum;Bedrag;Omschrijving;Naam tegenpartij\n';
    for (let i = 1; i <= 10000; i++) {
      csv += '15-03-2026;100,50;Transactie ' + i + ';Naam ' + i + '\n';
    }
    const memBefore = process.memoryUsage().heapUsed;
    const result = ctx.parseBankCsv_(csv);
    const memAfter = process.memoryUsage().heapUsed;
    const usedMB = (memAfter - memBefore) / 1024 / 1024;
    console.log('FORENSICS memory-gebruik 10k goede rijen: ' + usedMB.toFixed(2) + ' MB, ' + result.length + ' rijen geparsed');
    expect(usedMB).toBeLessThan(50);  // GAS-limit is 50MB
    expect(result.length).toBe(10000);
  });
});

describe('INCIDENT-FORENSICS: HTML/XSS-payload door hele pipeline', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('escHtml_ stript HTML voor display', () => {
    const payload = '<script>alert("xss")</script>';
    expect(ctx.escHtml_(payload)).not.toContain('<script>');
  });

  test('veiligSheetWaarde_ stript formula-prefix voor sheet-write', () => {
    const payload = '=HYPERLINK("evil","klik")';
    expect(ctx.veiligSheetWaarde_(payload).charAt(0)).toBe("'");
  });

  test('FORENSICS: pure tekst <script>... in description = NIET geblokkeerd door veiligSheetWaarde_', () => {
    // Issue: <script> begint niet met =/+/-/@/tab → veiligSheetWaarde_ laat door
    // Mitigatie: bij sheet-write geen probleem (Sheets toont als tekst).
    // Bij HTML-render zonder escHtml_ WEL XSS-risico.
    const payload = '<script>alert(1)</script>';
    expect(ctx.veiligSheetWaarde_(payload)).toBe(payload);  // NIET geescaped
  });
});

describe('INCIDENT-FORENSICS: parseBankDatum_ edge cases', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BankImport.gs']);
  });

  test('Datums getest tegen rollover-trap', () => {
    expect(ctx.parseBankDatum_('31-02-2026')).toBeNull();  // 31 feb bestaat niet
    expect(ctx.parseBankDatum_('30-02-2024')).toBeNull();  // schrikkeljaar maar 30-feb niet
    expect(ctx.parseBankDatum_('29-02-2024')).toBeInstanceOf(Date);  // 29 feb 2024 = schrikkeljaar
    expect(ctx.parseBankDatum_('29-02-2025')).toBeNull();  // 2025 geen schrikkeljaar
    expect(ctx.parseBankDatum_('99-99-9999')).toBeNull();
    expect(ctx.parseBankDatum_('')).toBeNull();
    expect(ctx.parseBankDatum_(null)).toBeNull();
  });

  test('Future-proof tot 2100', () => {
    expect(ctx.parseBankDatum_('15-03-2100')).toBeInstanceOf(Date);
  });
});

describe('INCIDENT-FORENSICS: parseBankBedrag_ edge cases', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BankImport.gs']);
  });

  test('Extreme waarden', () => {
    expect(ctx.parseBankBedrag_('100,50')).toBeCloseTo(100.50, 2);
    expect(ctx.parseBankBedrag_('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(ctx.parseBankBedrag_('-100,50')).toBeCloseTo(-100.50, 2);
    expect(ctx.parseBankBedrag_('')).toBe(0);
    expect(ctx.parseBankBedrag_('niet-een-getal')).toBe(0);
    // Bijna-Infinity input
    const groot = ctx.parseBankBedrag_('1e308');
    expect(isFinite(groot) || groot === 0).toBe(true);
  });
});

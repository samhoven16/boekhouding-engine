/**
 * tests/unit/btw-export.test.js
 *
 * Tier 2 #4 — structured BTW-aangifte export. JSON/CSV only — geen XBRL.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const BTW_EXPORT_GS = path.resolve(__dirname, '../../src/BtwExport.gs');
const BTW_GS        = path.resolve(__dirname, '../../src/BTW.gs');
const UTILS_GS      = path.resolve(__dirname, '../../src/Utils.gs');
const CONFIG_GS     = path.resolve(__dirname, '../../src/Config.gs');

function maakCtx(opts) {
  opts = opts || {};
  const aangifte = opts.aangifte || {
    r1a_grondslag: 10000, r1a_btw: 2100,
    r1b_grondslag: 0, r1b_btw: 0,
    r1c_grondslag: 0, r1c_btw: 0,
    r1d: 500,
    r1e_grondslag: 0, r1e_btw: 0,
    r2a: 0,
    r3a_grondslag: 1500, r3a_btw: 0,
    r4a_grondslag: 0, r4a_btw: 0,
    r5a: 2100, r5b: 850, r5c: 1250,
    saldo: 1250,
    r1d_vrijgesteld: 500, r1d_nul: 0,
  };

  return createGasRuntime([CONFIG_GS, UTILS_GS, BTW_EXPORT_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null, setProperty: () => {},
        setProperties: () => {}, deleteProperty: () => {},
      }),
      getUserProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        if (!(d instanceof Date)) return '';
        const y = d.getFullYear(); const m = d.getMonth() + 1; const day = d.getDate();
        return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
      },
      sleep: () => {},
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: () => [],
    },
    SpreadsheetApp: {
      getUi: () => ({ alert: jest.fn(), showModalDialog: jest.fn(), ButtonSet: {} }),
      getActiveSpreadsheet: () => ({ getId: () => 'ss-test' }),
    },
    HtmlService: {
      createHtmlOutput: () => ({
        setWidth: function() { return this; },
        setHeight: function() { return this; },
        setSandboxMode: function() { return this; },
      }),
      SandboxMode: { IFRAME: 'IFRAME' },
    },
    // Override de BTW-berekening met fixed return value
    getSpreadsheet_: () => ({ id: 'ss-test' }),
    berekenBtwAangifte_: jest.fn(() => aangifte),
    safeAuditLog_: jest.fn(),
  });
}

describe('_parsePeriodeKey_ — periode-validatie', () => {
  let ctx;
  beforeAll(() => { ctx = maakCtx(); });

  test('2026-Q1: jan-mrt', () => {
    const r = ctx._parsePeriodeKey_('2026-Q1');
    expect(r.jaar).toBe(2026);
    expect(r.kwartaal).toBe(1);
    expect(r.van.getMonth()).toBe(0);
    expect(r.tot.getMonth()).toBe(2);
  });
  test('2026-Q4: okt-dec', () => {
    const r = ctx._parsePeriodeKey_('2026-Q4');
    expect(r.van.getMonth()).toBe(9);
    expect(r.tot.getMonth()).toBe(11);
  });
  test('ongeldig formaat: null', () => {
    expect(ctx._parsePeriodeKey_('Q1-2026')).toBeNull();
    expect(ctx._parsePeriodeKey_('2026')).toBeNull();
    expect(ctx._parsePeriodeKey_('')).toBeNull();
    expect(ctx._parsePeriodeKey_('2026-Q5')).toBeNull();
  });
});

describe('_toCanonicalExport_ — rubriek-mapping', () => {
  let ctx, exp;
  beforeAll(() => {
    ctx = maakCtx();
    const range = ctx._parsePeriodeKey_('2026-Q1');
    const aangifte = ctx.berekenBtwAangifte_();
    exp = ctx._toCanonicalExport_(aangifte, range);
  });

  test('bevat schema-versie + disclaimer over AWR art. 8', () => {
    expect(exp._schema).toMatch(/btw-export\/v1/);
    expect(exp._disclaimer).toMatch(/GEEN officiele/);
    expect(exp._disclaimer).toMatch(/AWR art\. 8/);
  });

  test('bevat alle Belastingdienst-rubrieken', () => {
    const verwacht = ['r1a','r1b','r1c','r1d','r1e','r2a','r3a','r4a','r5a','r5b','r5c','r5d'];
    verwacht.forEach((code) => {
      expect(exp.rubrieken[code]).toBeDefined();
      expect(typeof exp.rubrieken[code].naam).toBe('string');
    });
  });

  test('r1a met 21%-BTW correct mapped', () => {
    expect(exp.rubrieken.r1a.grondslag).toBe(10000);
    expect(exp.rubrieken.r1a.btw).toBe(2100);
  });

  test('r5d (saldo) klopt met aangifte.saldo', () => {
    expect(exp.rubrieken.r5d.btw).toBe(1250);
  });

  test('r5a/r5b/r5c hebben null grondslag (alleen BTW-totaal)', () => {
    expect(exp.rubrieken.r5a.grondslag).toBeNull();
    expect(exp.rubrieken.r5b.grondslag).toBeNull();
  });

  test('intern: r1d_vrijgesteld vs r1d_nul gescheiden voor pro-rata', () => {
    expect(exp.intern.r1d_vrijgesteld).toBe(500);
    expect(exp.intern.r1d_nul).toBe(0);
  });

  test('rondt op 2 decimalen (geen drijvende-komma fouten)', () => {
    const aangifteRaar = { r1a_grondslag: 10.005, r1a_btw: 2.105 };
    Object.keys(ctx._toCanonicalExport_({ r1a_grondslag: 10.005, r1a_btw: 2.105 },
      { kwartaal: 1, jaar: 2026, van: new Date(2026,0,1), tot: new Date(2026,2,31) })
      .rubrieken).forEach(() => {});
    // Sanity-check via berekend resultaat
    const out = ctx._toCanonicalExport_(aangifteRaar,
      { kwartaal: 1, jaar: 2026, van: new Date(2026,0,1), tot: new Date(2026,2,31) });
    expect(out.rubrieken.r1a.grondslag).toBe(10.01);  // afgerond op 2 dec
    expect(out.rubrieken.r1a.btw).toBe(2.11);
  });
});

describe('_toCsv_ — Excel-compatibele CSV-output', () => {
  let ctx, exp, csv;
  beforeAll(() => {
    ctx = maakCtx();
    const range = ctx._parsePeriodeKey_('2026-Q1');
    exp = ctx._toCanonicalExport_(ctx.berekenBtwAangifte_(), range);
    csv = ctx._toCsv_(exp);
  });

  test('begint met BOM (Excel UTF-8 detection)', () => {
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  test('headers in eerste regel', () => {
    expect(csv).toMatch(/Rubriek;Naam;Grondslag;BTW/);
  });

  test('puntkomma als separator (NL-locale conventie)', () => {
    expect(csv).toMatch(/r1a;"/);
  });

  test('komma als decimaal-separator (NL-conventie)', () => {
    expect(csv).toMatch(/10000/); // hier integers, geen decimals nodig
    // Met decimal:
    const out = ctx._toCanonicalExport_({ r1a_grondslag: 100.50, r1a_btw: 21.10 },
      { kwartaal: 1, jaar: 2026, van: new Date(2026,0,1), tot: new Date(2026,2,31) });
    const csvDec = ctx._toCsv_(out);
    expect(csvDec).toMatch(/100,5/);
    expect(csvDec).toMatch(/21,1/);
  });

  test('CRLF line-endings (Windows/Excel-compat)', () => {
    expect(csv).toMatch(/\r\n/);
  });

  test('elke rubriek krijgt een eigen regel', () => {
    const regels = csv.split('\r\n').filter((r) => r.length > 0);
    expect(regels.length).toBeGreaterThanOrEqual(13); // header + 12 rubrieken
  });
});

describe('berekenBtwExportBestand — formaat-keuze + bestandsnaam', () => {
  test('json formaat: returnt JSON + json-extensie + json mime', () => {
    const ctx = maakCtx();
    const r = ctx.berekenBtwExportBestand('2026-Q1', 'json');
    expect(r.ok).toBe(true);
    expect(r.bestandsnaam).toMatch(/\.json$/);
    expect(r.mime).toBe('application/json');
    expect(() => JSON.parse(r.inhoud)).not.toThrow();
  });

  test('csv formaat: returnt CSV + csv-extensie + csv mime', () => {
    const ctx = maakCtx();
    const r = ctx.berekenBtwExportBestand('2026-Q1', 'csv');
    expect(r.ok).toBe(true);
    expect(r.bestandsnaam).toMatch(/\.csv$/);
    expect(r.mime).toBe('text/csv');
  });

  test('ongeldige periode: ok=false', () => {
    const ctx = maakCtx();
    const r = ctx.berekenBtwExportBestand('invalid', 'json');
    expect(r.ok).toBe(false);
  });
});

describe('Source-level: client-functies hebben GEEN trailing underscore', () => {
  const src = fs.readFileSync(BTW_EXPORT_GS, 'utf8');

  test('toonBtwExportDialog ZONDER trailing underscore', () => {
    expect(src).toMatch(/function toonBtwExportDialog\(/);
    expect(src).not.toMatch(/function toonBtwExportDialog_\(/);
  });
  test('berekenBtwExportPreview ZONDER trailing underscore', () => {
    expect(src).toMatch(/function berekenBtwExportPreview\(/);
  });
  test('berekenBtwExportBestand ZONDER trailing underscore', () => {
    expect(src).toMatch(/function berekenBtwExportBestand\(/);
  });

  test('Menu.gs verwijst naar toonBtwExportDialog', () => {
    const menu = fs.readFileSync(path.resolve(__dirname, '../../src/Menu.gs'), 'utf8');
    expect(menu).toMatch(/'toonBtwExportDialog'/);
  });
});

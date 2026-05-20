/**
 * tests/unit/p29-inkoop-idempotency.test.js
 *
 * P29-FIX (Belastingdienst stress-test):
 * Idempotency-guard voor inkoopfactuur-submit.
 *
 * Voorheen: twee identieke submits (double-click, network-retry) gaven
 * 2× journaalpost + 2× BTW-voorbelasting-claim → naheffing + boete.
 * Nu: CacheService-gebaseerde 5-min dedup-window op signatuur.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('P29: Inkoopfactuur idempotency-signatuur', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Triggers.gs']);
    // Override Utilities.formatDate naar échte ISO-formatter voor de tests —
    // default-mock retourneert hardcoded '01-01-2024' wat ons sig-test sloopt.
    ctx.Utilities.formatDate = (d, _tz, fmt) => {
      if (!(d instanceof Date) || isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      if (fmt === 'yyyy-MM-dd') return y + '-' + mo + '-' + da;
      return y + '-' + mo + '-' + da;
    };
  });

  test('Twee identieke submits → zelfde signatuur (cache-hit)', () => {
    const datum = new Date('2026-03-15T10:00:00');
    const sig1 = ctx._bouwInkoopSig_('SAP SE', datum, 121.00, 'INV-42');
    const sig2 = ctx._bouwInkoopSig_('SAP SE', datum, 121.00, 'INV-42');
    expect(sig1).toBe(sig2);
  });

  test('Whitespace/case-verschillen worden genormaliseerd', () => {
    const datum = new Date('2026-03-15');
    const sig1 = ctx._bouwInkoopSig_('  SAP SE  ', datum, 121.00, 'INV-42');
    const sig2 = ctx._bouwInkoopSig_('sap se', datum, 121.00, 'inv-42');
    expect(sig1).toBe(sig2);
  });

  test('Andere leverancier → andere signatuur', () => {
    const datum = new Date('2026-03-15');
    const sig1 = ctx._bouwInkoopSig_('SAP', datum, 121, 'X');
    const sig2 = ctx._bouwInkoopSig_('Oracle', datum, 121, 'X');
    expect(sig1).not.toBe(sig2);
  });

  test('Verschil van 1 cent → andere signatuur', () => {
    const datum = new Date('2026-03-15');
    const sig1 = ctx._bouwInkoopSig_('SAP', datum, 121.00, '');
    const sig2 = ctx._bouwInkoopSig_('SAP', datum, 121.01, '');
    expect(sig1).not.toBe(sig2);
  });

  test('Andere datum → andere signatuur', () => {
    const sig1 = ctx._bouwInkoopSig_('SAP', new Date('2026-03-15'), 121, 'X');
    const sig2 = ctx._bouwInkoopSig_('SAP', new Date('2026-03-16'), 121, 'X');
    expect(sig1).not.toBe(sig2);
  });

  test('Lege/null leverancier-factuurnr crasht niet', () => {
    const datum = new Date('2026-03-15');
    expect(() => ctx._bouwInkoopSig_('SAP', datum, 121, null)).not.toThrow();
    expect(() => ctx._bouwInkoopSig_('SAP', datum, 121, undefined)).not.toThrow();
    expect(() => ctx._bouwInkoopSig_('SAP', datum, 121, '')).not.toThrow();
  });

  test('Invalid Date → "0000-00-00" placeholder (geen crash)', () => {
    const sig = ctx._bouwInkoopSig_('SAP', new Date('invalid'), 121, 'X');
    expect(sig).toContain('0000-00-00');
  });

  test('Lege bedrag → 0 cents', () => {
    const sig = ctx._bouwInkoopSig_('SAP', new Date('2026-03-15'), 0, 'X');
    expect(sig).toMatch(/_0_/);
  });

  test('NaN bedrag → 0 cents (geen crash)', () => {
    const sig = ctx._bouwInkoopSig_('SAP', new Date('2026-03-15'), NaN, 'X');
    expect(sig).toMatch(/_0_/);
  });

  test('Centen-precisie: 121.005 → 12100 of 12101 (afgerond)', () => {
    const sig = ctx._bouwInkoopSig_('SAP', new Date('2026-03-15'), 121.005, 'X');
    // Math.round(121.005 * 100) = 12100 of 12101 afhankelijk van float
    expect(sig).toMatch(/_1210[01]_/);
  });

  test('Signatuur bevat alle componenten', () => {
    const sig = ctx._bouwInkoopSig_('SAP', new Date('2026-03-15'), 121, 'INV-42');
    expect(sig).toMatch(/^inkoop_/);
    expect(sig).toContain('sap');
    expect(sig).toContain('2026-03-15');
    expect(sig).toContain('12100');
    expect(sig).toContain('inv-42');
  });
});

describe('P29: verwerkUitgavenUitHoofdformulier_ blokkeert dubbele submit', () => {
  let ctx;
  let cacheStore;
  let appendedRows;

  beforeEach(() => {
    cacheStore = {};
    appendedRows = [];

    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Triggers.gs']);
    ctx.CacheService = {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v, _ttl) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    };
    // Mock buitenste dependencies
    ctx.volgendInkoopNummer_ = () => Math.floor(Math.random() * 1000);
    ctx.zoekOfMaakRelatie_ = () => 'L-001';
    ctx.bepaalKostenrekening_ = () => '7990';
    ctx.bepaalBtwVoorbelastingRekening_ = () => '1510';
    ctx.maakJournaalpost_ = jest.fn();
    ctx.bustCache_ = jest.fn();
    ctx.signaleerAfschrijvingskandidaat_ = jest.fn();
    ctx.schrijfAuditLog_ = jest.fn();
    ctx.noodLog_ = jest.fn();
    ctx.meldFataalAanOwner_ = jest.fn();
    ctx.parseBtwTarief_ = (s) => /21/.test(s) ? 0.21 : 0;
    ctx.SpreadsheetApp = {
      flush: jest.fn(),
      getUi: () => ({ alert: jest.fn(), ButtonSet: { OK: 'ok' } }),
    };
    // Mock spreadsheet met inkoop-sheet
    const ifSheet = {
      appendRow: (row) => { appendedRows.push(row); },
      getLastRow: () => appendedRows.length,
    };
    ctx._mockSs = {
      getSheetByName: (naam) => (naam === 'Inkoopfacturen' ? ifSheet : null),
    };
  });

  function payload(extra) {
    return Object.assign({
      'Leveranciernaam': 'SAP SE',
      'Factuurdatum uitgave': '2026-03-15',
      'Bedrag excl. BTW': '100',
      'BTW tarief uitgave': '21% (hoog)',
      'BTW bedrag uitgave': '21',
      'Factuurnummer leverancier': 'INV-42',
      'Categorie kosten': 'Software',
      'Betalingsstatus uitgave': 'Concept',
    }, extra || {});
  }

  test('Eerste submit → success, cache wordt gevuld', () => {
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload());
    expect(appendedRows.length).toBe(1);
    const sig = ctx._bouwInkoopSig_('SAP SE', new Date('2026-03-15'), 121, 'INV-42');
    expect(cacheStore[sig]).toMatch(/^PROCESSING:/);
  });

  test('Tweede identieke submit binnen 5min → throw', () => {
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload());
    expect(() => ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload()))
      .toThrow(/zojuist al geregistreerd/);
    expect(appendedRows.length).toBe(1);  // tweede append NIET gebeurd
  });

  test('Andere leverancier → wel toegestaan', () => {
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload());
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload({ 'Leveranciernaam': 'Oracle' }));
    expect(appendedRows.length).toBe(2);
  });

  test('Ander leverancier-factuurnr → wel toegestaan (klant fixt typo + retry)', () => {
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload());
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload({ 'Factuurnummer leverancier': 'INV-43' }));
    expect(appendedRows.length).toBe(2);
  });

  test('Audit-log entry bij geblokkeerde dubbele', () => {
    ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload());
    try { ctx.verwerkUitgavenUitHoofdformulier_(ctx._mockSs, payload()); } catch (_) {}
    const calls = ctx.schrijfAuditLog_.mock.calls;
    const dubbelLog = calls.find((c) => c[0] && c[0].indexOf('DUBBEL') >= 0);
    expect(dubbelLog).toBeTruthy();
  });
});

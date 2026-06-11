/**
 * tests/unit/cycle35-legacy-formhandlers-datum.test.js
 *
 * Cycle 35 — batch-fix voor 4 form-handlers die `parseDatum_(x) || new Date()`
 * gebruikten. Het probleem: `|| new Date()` was dead code want parseDatum_
 * retourneert nooit falsy — het valt SILENT terug op vandaag bij garbage.
 * Gevolg: factuur met typo-datum landt in vandaag's kwartaal → verkeerde
 * BTW-aangifte.
 *
 * Fix: nieuwe helper _parseFormDatumStrikt_ throw't bij niet-parsebaar
 * formaat + audit-log; lege input → fallback (vandaag) als bedoeld.
 *
 * Eerste test-file die de gedeelde mocks-helpers gebruikt (cycle 34).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Triggers.gs'], {});
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx };
}

describe('CYCLE 35: _parseFormDatumStrikt_ helper', () => {
  test('ISO datum "2026-06-15" → geldige Date', () => {
    const { ctx } = maakCtx();
    const d = ctx._parseFormDatumStrikt_('2026-06-15', 'Factuurdatum');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  test('NL datum "15-06-2026" → geldige Date', () => {
    const { ctx } = maakCtx();
    const d = ctx._parseFormDatumStrikt_('15-06-2026', 'Factuurdatum');
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  test('NL met slash "15/06/2026" → geldige Date', () => {
    const { ctx } = maakCtx();
    const d = ctx._parseFormDatumStrikt_('15/06/2026', 'Factuurdatum');
    expect(d.getMonth()).toBe(5);
  });

  test('Lege input → fallback (vandaag)', () => {
    const { ctx } = maakCtx();
    const d = ctx._parseFormDatumStrikt_('', 'Factuurdatum');
    expect(d).toBeInstanceOf(Date);
    // Zelfde dag als vandaag
    const nu = new Date();
    expect(d.getFullYear()).toBe(nu.getFullYear());
    expect(d.getMonth()).toBe(nu.getMonth());
  });

  test('Lege input + custom fallback → custom', () => {
    const { ctx } = maakCtx();
    const fb = new Date(2020, 0, 1);
    const d = ctx._parseFormDatumStrikt_(null, 'Datum', fb);
    expect(d).toBe(fb);
  });

  test('Garbage "abc" → throw met klant-vriendelijke melding + audit-log', () => {
    const { ctx } = maakCtx();
    expect(() => ctx._parseFormDatumStrikt_('abc', 'Factuurdatum'))
      .toThrow(/Factuurdatum is ongeldig/i);
    expect(ctx.schrijfAuditLog_.mock.calls.length).toBe(1);
    expect(ctx.schrijfAuditLog_.mock.calls[0][0]).toMatch(/Factuurdatum ongeldig/i);
  });

  test('Formaat zonder separators "20260615" → throw', () => {
    const { ctx } = maakCtx();
    expect(() => ctx._parseFormDatumStrikt_('20260615', 'Datum'))
      .toThrow(/ongeldig|formaat/i);
  });

  test('Invalid Date-object → throw', () => {
    const { ctx } = maakCtx();
    expect(() => ctx._parseFormDatumStrikt_(new Date('garbage'), 'Datum'))
      .toThrow(/ongeldig/i);
  });

  test('Geldig Date-object → passthrough', () => {
    const { ctx } = maakCtx();
    const x = new Date(2026, 5, 15);
    expect(ctx._parseFormDatumStrikt_(x, 'Datum')).toBe(x);
  });

  test('Whitespace-only → fallback', () => {
    const { ctx } = maakCtx();
    const d = ctx._parseFormDatumStrikt_('   ', 'Datum');
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  test('Label wordt gebruikt in error-message én audit-log', () => {
    const { ctx } = maakCtx();
    try {
      ctx._parseFormDatumStrikt_('garbage', 'Transactiedatum');
    } catch (e) {
      expect(e.message).toMatch(/Transactiedatum/);
    }
    expect(ctx.schrijfAuditLog_.mock.calls[0][0]).toMatch(/Transactiedatum/);
  });

  test('Default label = "Datum" als veldnaam niet meegegeven', () => {
    const { ctx } = maakCtx();
    expect(() => ctx._parseFormDatumStrikt_('garbage'))
      .toThrow(/^Datum/);
  });
});

describe('CYCLE 35: integratie — 4 call-sites in Triggers.gs', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');

  test('Geen overgebleven `parseDatum_(...) || new Date()` patronen', () => {
    expect(src).not.toMatch(/parseDatum_\(data\[['"][A-Za-z]+datum['"]\]\)\s*\|\|\s*new Date\(\)/);
  });

  // De 4 legacy form-handlers (verwerk*Formulier) zijn verwijderd — ze waren
  // nooit aan een trigger gekoppeld (superseded door het hoofdformulier).
  // De overgebleven call-sites zijn de LIVE paden; die moeten strikt blijven.
  test('_parseFormDatumStrikt_ wordt op alle live data[label]-paden gebruikt', () => {
    const callSites = src.match(/_parseFormDatumStrikt_\(data\[/g) || [];
    expect(callSites.length).toBe(2);   // hoofdformulier-inkomsten + -uitgaven
  });

  test('Live paden gebruiken het Factuurdatum-label strikt', () => {
    expect(src).toMatch(/_parseFormDatumStrikt_\(data\[['"]Factuurdatum['"]\],\s*['"]Factuurdatum['"]\)/);
  });
});

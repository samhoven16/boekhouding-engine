/**
 * tests/unit/cycle74-iban-preflight.test.js
 *
 * Cycle 74 — IBAN/Bedrijfsnaam pre-flight bij facturen.
 *
 * Zonder Bedrijfsnaam toont de factuur-PDF "Ons Bedrijf"; zonder IBAN ontbreekt
 * het betaalblok + SEPA-QR → onbetaalbare factuur die de klant pas merkt na
 * verzending. De dialog-pad had al een check, maar de Google-Form- en API-paden
 * liepen daarlangs heen (ze gaan rechtstreeks naar de chokepoint
 * verwerkInkomstenUitHoofdformulier_).
 *
 * Deze cycle hangt de check als gedeelde helper aan de chokepoint, zodat alle
 * drie de paden gedekt zijn — single source of truth, geen drift.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

function maakCtx(instellingen) {
  // Utils.gs nodig voor isGeldigeIBANMet97Check_ (cycle 76 MOD-97 check).
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
  // getInstelling_ levert de testwaarden.
  ctx.getInstelling_ = (k) => (k in instellingen ? instellingen[k] : '');
  return ctx;
}

// Publieke testvector — MOD-97-geldige IBAN, geen echte rekening.
const VALID_IBAN = 'NL91ABNA0417164300';

describe('CYCLE 74: factuur bedrijfsgegevens pre-flight', () => {
  test('compleet (Bedrijfsnaam + IBAN) → geen fout', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': VALID_IBAN });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).not.toThrow();
  });

  test('IBAN ontbreekt → throw met IBAN in de melding', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP' });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).toThrow(/IBAN/);
  });

  test('Bedrijfsnaam ontbreekt → throw met Bedrijfsnaam in de melding', () => {
    const ctx = maakCtx({ 'Bankrekening op factuur': VALID_IBAN });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).toThrow(/Bedrijfsnaam/);
  });

  test('beide ontbreken → throw noemt allebei', () => {
    const ctx = maakCtx({});
    let bericht = '';
    try { ctx._eisFactuurBedrijfsgegevens_(); } catch (e) { bericht = e.message; }
    expect(bericht).toMatch(/Bedrijfsnaam/);
    expect(bericht).toMatch(/IBAN/);
  });

  test("IBAN-alias 'IBAN' telt ook (niet alleen 'Bankrekening op factuur')", () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', IBAN: VALID_IBAN });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).not.toThrow();
  });

  test('verwerkNieuweBoeking(factuur) blokkeert bij ontbrekende gegevens', () => {
    const ctx = maakCtx({});
    // valideerBoeking mocken zodat we de bedrijfsgegevens-check isoleren.
    ctx.valideerBoeking = () => ({ ok: true });
    expect(() => ctx.verwerkNieuweBoeking('factuur', { klant: 'X', datum: '2026-01-01' }))
      .toThrow(/bedrijfsgegevens ontbreken/);
  });

  test('verwerkNieuweBoeking(kosten) wordt NIET geblokkeerd (geen klant-output)', () => {
    const ctx = maakCtx({});
    ctx.valideerBoeking = () => ({ ok: true });
    // kosten mag door — we mocken de downstream handler zodat de routing slaagt.
    ctx.getSpreadsheet_ = () => ({});
    ctx.saniteer_ = (v) => v;
    ctx._verwerkKosten_ = () => ({ ok: true });
    ctx.schrijfAuditLog_ = () => {};
    expect(() => ctx.verwerkNieuweBoeking('kosten', { omschrijving: 'X', bedrag: 10 }))
      .not.toThrow();
  });
});

describe('CYCLE 74: chokepoint dekt Form/API-paden', () => {
  test('verwerkInkomstenUitHoofdformulier_ roept de gedeelde helper aan', () => {
    const triggers = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
    // De call staat in de chokepoint-functie, vóór de factuur-creatie.
    const idx = triggers.indexOf('function verwerkInkomstenUitHoofdformulier_');
    const body = triggers.slice(idx, idx + 1200);
    expect(body).toMatch(/_eisFactuurBedrijfsgegevens_\(\)/);
  });

  test('de dialog-check gebruikt nu dezelfde helper (geen gedupliceerde logica)', () => {
    const be = fs.readFileSync(path.join(SRC, 'BoekingEngine.gs'), 'utf8');
    // Exact één definitie, en verwerkNieuweBoeking roept de helper aan.
    const defs = (be.match(/function _eisFactuurBedrijfsgegevens_/g) || []).length;
    expect(defs).toBe(1);
    expect(be).toMatch(/if \(type === 'factuur'\) _eisFactuurBedrijfsgegevens_\(\)/);
  });
});

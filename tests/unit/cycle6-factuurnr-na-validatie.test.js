/**
 * tests/unit/cycle6-factuurnr-na-validatie.test.js
 *
 * Axiom 12 — factuurnummers pas claimen NA complete validatie.
 *
 * In verwerkVerkoopfactuurFormulier (backward-compat-flow) werd
 * volgendFactuurnummer_ aangeroepen direct na lege-regels-check, vóór
 * klantnaam/BTW-tarief/totalen waren geverifieerd. Bij fout daarna
 * ontstond een GAT in factuurreeks → art. 35a Wet OB schending +
 * audit-flag bij Belastingdienst-controle.
 *
 * Test broncode-volgorde + lege-klantnaam-reject.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TRIG = path.resolve(__dirname, '../../src/Triggers.gs');

describe('CYCLE 6: factuurnummer-claim volgorde in verwerkVerkoopfactuurFormulier', () => {
  const src = fs.readFileSync(TRIG, 'utf8');

  // Isoleer de relevante functie-body
  const fnStart = src.indexOf('function verwerkVerkoopfactuurFormulier');
  const fnEnd = src.indexOf('\nfunction ', fnStart + 1);
  const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : src.length);

  test('Klantnaam-check staat VÓÓR volgendFactuurnummer_-call', () => {
    const klantCheckPos = fn.indexOf("if (!klantnaam)");
    const factuurNrPos = fn.indexOf('volgendFactuurnummer_()');
    expect(klantCheckPos).toBeGreaterThan(-1);
    expect(factuurNrPos).toBeGreaterThan(-1);
    expect(klantCheckPos).toBeLessThan(factuurNrPos);
  });

  test('BTW-tarief-berekening staat VÓÓR volgendFactuurnummer_-call', () => {
    const btwPos = fn.indexOf('parseBtwTarief_');
    const factuurNrPos = fn.indexOf('volgendFactuurnummer_()');
    expect(btwPos).toBeGreaterThan(-1);
    expect(btwPos).toBeLessThan(factuurNrPos);
  });

  test('totalIncl-validatie (> 0) staat VÓÓR volgendFactuurnummer_-call', () => {
    const totaalCheck = fn.indexOf('totalIncl <= 0');
    const factuurNrPos = fn.indexOf('volgendFactuurnummer_()');
    expect(totaalCheck).toBeGreaterThan(-1);
    expect(totaalCheck).toBeLessThan(factuurNrPos);
  });

  test('Lege-regels-check blijft ook vóór (regressie)', () => {
    const legeCheck = fn.indexOf('regels.length === 0');
    const factuurNrPos = fn.indexOf('volgendFactuurnummer_()');
    expect(legeCheck).toBeLessThan(factuurNrPos);
  });

  test('Throw-meldingen vermelden expliciet "factuurnummer niet geclaimd"', () => {
    // Klant-vriendelijke meldingen die duidelijk maken dat er geen gap is
    expect(fn).toMatch(/factuurnummer niet geclaimd|geen factuurnummer geclaimd/i);
  });

  test('Geen volgendFactuurnummer_ tweemaal aangeroepen in deze functie', () => {
    const matches = fn.match(/volgendFactuurnummer_\(\)/g) || [];
    expect(matches.length).toBe(1);
  });
});

describe('CYCLE 6: andere functie verwerkInkomstenUitHoofdformulier_ heeft hetzelfde patroon (regressie)', () => {
  const src = fs.readFileSync(TRIG, 'utf8');
  const fnStart = src.indexOf('function verwerkInkomstenUitHoofdformulier_');
  const fnEnd = src.indexOf('\nfunction ', fnStart + 1);
  const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : src.length);

  test('Comment "Pas NA validatie nummer claimen" blijft aanwezig', () => {
    expect(fn).toMatch(/Pas NA validatie nummer claimen|na validatie nummer claimen/i);
  });

  test('Regels-loop staat VÓÓR factuurnummer-claim', () => {
    const loopPos = fn.indexOf("regels.length === 0");
    const factuurNrPos = fn.indexOf('volgendFactuurnummer_()');
    expect(loopPos).toBeGreaterThan(-1);
    expect(loopPos).toBeLessThan(factuurNrPos);
  });
});

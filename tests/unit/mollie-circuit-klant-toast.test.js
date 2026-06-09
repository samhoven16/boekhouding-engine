/**
 * tests/unit/mollie-circuit-klant-toast.test.js
 *
 * Go-live blocker #8: Mollie-circuit-open is stil voor klant.
 *
 * Bestaand gedrag (PR #246): bij circuit-OPEN of API-fout retourneert
 * genereerMolliePaymentLink_ netjes null en log naar audit. MAAR: de
 * klant ZIET niets. Factuur gaat de deur uit zonder iDEAL-knop, klant
 * denkt "het werkt", krijgt pas dagen later klacht "geen betaal-knop".
 *
 * Nu: bij elke null-retour ook:
 *   1. Toast in UI ("Factuur X verstuurd, maar Mollie tijdelijk ...")
 *   2. UserProperty MOLLIE_LAATSTE_FAAL met ts/factuur/reden voor
 *      latere traceerbaarheid.
 *
 * Aanpak: bron-grep + GAS-runtime simulatie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'Mollie.gs'), 'utf8');

describe('Mollie.gs — _toonMollieFaalToast_ helper', () => {
  test('Helper functie bestaat', () => {
    expect(bron).toMatch(/function _toonMollieFaalToast_/);
  });

  test('Schrijft UserProperty MOLLIE_LAATSTE_FAAL met ts/factuur/reden', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/setProperty\([\s\S]*['"]MOLLIE_LAATSTE_FAAL['"]/);
    expect(blok).toMatch(/JSON\.stringify\(\{[\s\S]*ts:[\s\S]*factuur:[\s\S]*reden:/);
  });

  test('Toont toast met factuurnummer + reden voor klant-transparantie', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/ss\.toast\(/);
    expect(blok).toMatch(/tijdelijk geen iDEAL/i);
    expect(blok).toMatch(/handmatig overmaken via het IBAN/);
    expect(blok).toMatch(/opnieuw geprobeerd/);
  });

  test('Fail-safe: throwt nooit (webhook/test-context heeft geen UI)', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    // Twee try/catch-blocks: één om property, één om toast
    const catchMatches = blok.match(/} catch \(_\) \{\}/g) || [];
    expect(catchMatches.length).toBeGreaterThanOrEqual(2);
  });

  test('Saniteert input — undefined factuurnummer wordt "?", undefined reden wordt "onbekend"', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/String\(factuurnummer \|\| ['"]?\?['"]?\)/);
    expect(blok).toMatch(/String\(reden \|\| ['"]onbekend['"]\)/);
  });
});

describe('Aanroep-paden — alle 3 null-returns triggeren toast', () => {
  test('Circuit-OPEN-pad (catch eCB) roept helper aan met klant-vriendelijke reden', () => {
    const start = bron.indexOf('function genereerMolliePaymentLink_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    const catchIdx = blok.indexOf('catch (eCB)');
    const helperIdx = blok.indexOf('_toonMollieFaalToast_', catchIdx);
    expect(helperIdx).toBeGreaterThan(catchIdx);
    expect(blok).toMatch(/_toonMollieFaalToast_\(factuur\.factuurnummer, ['"]is tijdelijk niet bereikbaar['"]/);
  });

  test('API-fout-pad (code !== 201) vertaalt HTTP-code naar leesbare reden (geen jargon)', () => {
    const start = bron.indexOf('function genereerMolliePaymentLink_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    // Geen "API-fout 4xx" meer
    expect(blok).not.toMatch(/['"]API-fout ['"] \+ code/);
    // 401/403 → klant weet wat te doen (terug-loop)
    expect(blok).toMatch(/weigert de API-key.*Instellingen/);
    // 422 → onderscheid factuur-data probleem
    expect(blok).toMatch(/factuurgegevens niet geaccepteerd/);
    // 5xx → tijdelijk
    expect(blok).toMatch(/code >= 500[\s\S]*tijdelijk niet bereikbaar/);
  });

  test('Outer catch (onverwachte fout) roept helper aan met leesbare reden', () => {
    const start = bron.indexOf('function genereerMolliePaymentLink_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    // Geen vage "onverwachte fout" meer
    expect(blok).not.toMatch(/['"]onverwachte fout['"]/);
    expect(blok).toMatch(/is niet bereikbaar door een onbekende fout/);
  });
});

describe('Voice-principes — grammaticaal aansluitend op "Mollie {reden}"', () => {
  test('Alle reden-waarden vormen grammaticale zinnen na "Mollie"', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    // Template moet "Mollie " + reden zijn (geen "Mollie is " of "Mollie heeft ")
    expect(blok).toMatch(/Mollie ['"] \+ r/);
    expect(blok).not.toMatch(/Mollie is ['"] \+ r/);
    expect(blok).not.toMatch(/Mollie heeft ['"] \+ r/);
  });

  test('Geen "We" / "wij" personificatie in toast-body', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).not.toMatch(/We proberen/);
    expect(blok).not.toMatch(/Wij proberen/);
    // Passive voice in plaats
    expect(blok).toMatch(/wordt het opnieuw geprobeerd/);
  });

  test('Toast biedt concrete actie aan klant (terug-loop principe)', () => {
    const start = bron.indexOf('function _toonMollieFaalToast_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/handmatig overmaken via het IBAN op de factuur/);
  });
});

describe('Functionele simulatie via GAS-runtime', () => {
  let ctx;
  let setPropertyCalls;
  let toastCalls;

  beforeEach(() => {
    ctx = createGasRuntime(['Mollie.gs']);
    setPropertyCalls = [];
    toastCalls = [];
    ctx.PropertiesService.getUserProperties = jest.fn(() => ({
      setProperty: jest.fn(function(k, v) { setPropertyCalls.push({ k: k, v: v }); }),
      getProperty: jest.fn(() => null),
    }));
    ctx.getSpreadsheet_ = jest.fn(() => ({
      toast: jest.fn(function(msg, title, dur) {
        toastCalls.push({ msg: msg, title: title, dur: dur });
      }),
    }));
  });

  test('Normale aanroep → property + toast worden gezet', () => {
    ctx._toonMollieFaalToast_('F2026-042', 'is tijdelijk niet bereikbaar');
    expect(setPropertyCalls).toHaveLength(1);
    expect(setPropertyCalls[0].k).toBe('MOLLIE_LAATSTE_FAAL');
    const stored = JSON.parse(setPropertyCalls[0].v);
    expect(stored.factuur).toBe('F2026-042');
    expect(stored.reden).toBe('is tijdelijk niet bereikbaar');
    expect(stored.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].title).toMatch(/Tijdelijk geen iDEAL/);
    expect(toastCalls[0].msg).toContain('F2026-042');
    // Grammaticaal correct: "Mollie is tijdelijk niet bereikbaar" (geen "heeft")
    expect(toastCalls[0].msg).toContain('Mollie is tijdelijk niet bereikbaar');
    expect(toastCalls[0].msg).toContain('handmatig overmaken via het IBAN');
  });

  test('Geen spreadsheet-context (webhook) → geen toast, wel property', () => {
    ctx.getSpreadsheet_ = jest.fn(() => null);
    ctx._toonMollieFaalToast_('F2026-042', 'is tijdelijk niet bereikbaar');
    expect(setPropertyCalls).toHaveLength(1);
    expect(toastCalls).toHaveLength(0);
  });

  test('PropertiesService throwt (LIMITED auth) → geen crash, toast nog wel proberen', () => {
    ctx.PropertiesService.getUserProperties = jest.fn(() => {
      throw new Error('LIMITED auth');
    });
    expect(() => ctx._toonMollieFaalToast_('F2026-042', 'is tijdelijk niet bereikbaar')).not.toThrow();
    expect(toastCalls).toHaveLength(1);
  });

  test('Toast.toast throwt → geen crash naar caller', () => {
    ctx.getSpreadsheet_ = jest.fn(() => ({
      toast: jest.fn(() => { throw new Error('toast-fail'); }),
    }));
    expect(() => ctx._toonMollieFaalToast_('F2026-042', 'is tijdelijk niet bereikbaar')).not.toThrow();
    expect(setPropertyCalls).toHaveLength(1);
  });

  test('Undefined factuurnummer → wordt "?" (geen crash, geen "undefined" in toast)', () => {
    ctx._toonMollieFaalToast_(undefined, 'is tijdelijk niet bereikbaar');
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].msg).toContain('? ');
    expect(toastCalls[0].msg).not.toContain('undefined');
  });
});

describe('Anti-regressie: bestaande PR #246 circuit-breaker logic ongewijzigd', () => {
  test('circuitBreaker_ wrap rond Mollie API call blijft bestaan', () => {
    expect(bron).toMatch(/circuitBreaker_\(['"]mollie_api['"]/);
  });

  test('Beide call-sites (GET + POST) gebruiken nog steeds breaker', () => {
    const matches = bron.match(/circuitBreaker_\(['"]mollie_api['"]/g) || [];
    expect(matches.length).toBe(2);
  });
});

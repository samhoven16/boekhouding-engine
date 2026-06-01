/**
 * tests/unit/cycle76-iban-mod97.test.js
 *
 * Cycle 76 — placeholder-IBAN gat dichten.
 *
 * Cycle 74 introduceerde een presence-check ("IBAN niet leeg"). Maar de
 * Setup.gs default was 'NL01ABNA0123456789' — een NIET-LEGE, MOD-97-ONGELDIGE
 * placeholder. Gevolg: een verse klant die zijn IBAN nog niet had aangepast
 * passeerde de pre-flight en kon een factuur sturen met de nep-IBAN.
 *
 * Deze cycle dicht dat gat op twee niveaus:
 *   (a) BRON: Setup.gs default is leeg ('') — geen suggestie meer dat het al
 *       ingevuld zou zijn.
 *   (b) DEFENSE: _eisFactuurBedrijfsgegevens_ controleert nu MOD-97 i.p.v.
 *       alleen presence. Een placeholder of typo wordt actief geweigerd.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

function maakCtx(instellingen) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
  ctx.getInstelling_ = (k) => (k in instellingen ? instellingen[k] : '');
  return ctx;
}

// Publieke MOD-97-geldige testvector (geen echte rekening).
const VALID_IBAN = 'NL91ABNA0417164300';
// De oude Setup.gs default — moet nu worden afgekeurd.
const OUDE_PLACEHOLDER = 'NL01ABNA0123456789';

describe('CYCLE 76: bron-fix — Setup.gs default is leeg', () => {
  test("'Bankrekening op factuur' default-waarde is ''", () => {
    const setup = fs.readFileSync(path.join(SRC, 'Setup.gs'), 'utf8');
    // Match de exacte rij in de instellingen-data-array.
    expect(setup).toMatch(/\['Bankrekening op factuur',\s*''/);
  });

  test('oude placeholder-IBAN staat nergens meer als ACTIEVE default', () => {
    // Match alleen het patroon waarin de placeholder als WAARDE wordt gebruikt:
    //   ['label', 'NL01ABNA…']     (Setup.gs data-array)
    //   key: 'NL01ABNA…'           (object-literal default)
    //   = 'NL01ABNA…'              (variabele-assignment default)
    // Een vermelding in een comment ("voorheen 'NL01ABNA…'") is OK en
    // documenteert juist de historische fix.
    const stripComments = (txt) => txt
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const files = ['Setup.gs', 'Config.gs', 'BoekingEngine.gs', 'Verkoopfacturen.gs', 'Utils.gs'];
    files.forEach((f) => {
      const txt = stripComments(fs.readFileSync(path.join(SRC, f), 'utf8'));
      expect(txt).not.toMatch(new RegExp("'" + OUDE_PLACEHOLDER + "'"));
    });
  });
});

describe('CYCLE 76: defense — pre-flight valideert MOD-97', () => {
  test('geldige MOD-97 IBAN → geen fout', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': VALID_IBAN });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).not.toThrow();
  });

  test('de oude placeholder-IBAN wordt afgekeurd (MOD-97 faalt)', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': OUDE_PLACEHOLDER });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).toThrow(/IBAN.*ongeldig/i);
  });

  test('IBAN met typo (één cijfer verkeerd) wordt afgekeurd', () => {
    // VALID_IBAN met laatste cijfer 0→1 → MOD-97 faalt.
    const typo = VALID_IBAN.slice(0, -1) + '1';
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': typo });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).toThrow(/IBAN.*ongeldig/i);
  });

  test("garbage tekst ('AAA') wordt afgekeurd op format", () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': 'AAA' });
    expect(() => ctx._eisFactuurBedrijfsgegevens_()).toThrow(/IBAN.*ongeldig/i);
  });

  test('foutmelding stuurt naar Instellingen (actiegericht)', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP', 'Bankrekening op factuur': OUDE_PLACEHOLDER });
    let bericht = '';
    try { ctx._eisFactuurBedrijfsgegevens_(); } catch (e) { bericht = e.message; }
    expect(bericht).toMatch(/Instellingen/);
    // GEEN voorbeeld-IBAN tonen — anders herhalen we de copy-paste-trap.
    expect(bericht).not.toMatch(/NL01ABNA0123456789/);
  });

  test('lege IBAN gaat nog steeds via de presence-tak (niet "ongeldig")', () => {
    const ctx = maakCtx({ Bedrijfsnaam: 'Jansen ZZP' });
    let bericht = '';
    try { ctx._eisFactuurBedrijfsgegevens_(); } catch (e) { bericht = e.message; }
    // Presence-melding bevat "ontbreken", niet "ongeldig".
    expect(bericht).toMatch(/ontbreken/);
    expect(bericht).not.toMatch(/MOD-97/);
  });
});

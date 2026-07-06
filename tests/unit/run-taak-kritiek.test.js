/**
 * tests/unit/run-taak-kritiek.test.js
 *
 * D2 — _runTaak_ kreeg een opt.kritiek-flag zodat triggerSelfHeal niet
 * structureel door de budget-cap wordt geskipt bij volle administraties.
 * Cross-PR-audit van vroeger plaatste self-heal aan het einde voor
 * blast-radius (sanitize doet delete+recreate). Gas-runtime-audit wees uit
 * dat 'einde' = wordt geskipt zodra het 4-min-budget op is → silent
 * degradatie van zelf-healende infrastructuur.
 *
 * Compromis: plaatsing aan einde blijft (blast-radius), maar self-heal
 * negeert de budget-cap via opt.kritiek. Inspectie is goedkoop, heal heeft
 * z'n eigen 24u-throttle.
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TRIGGERS = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');

describe('D2: _runTaak_ kritiek-flag negeert budget-skip', () => {
  test('_runTaak_ accepteert een derde "opt"-parameter', () => {
    expect(TRIGGERS).toMatch(/function _runTaak_\(naam,\s*fn,\s*opt\)/);
  });

  test('Budget-check skipt NIET wanneer opt.kritiek=true', () => {
    expect(TRIGGERS).toMatch(/if\s*\(\s*!opt\.kritiek\s*&&[\s\S]*?_huidigDagelijksBudgetStart\s*>\s*0/);
  });

  test('triggerSelfHeal wordt aangeroepen met { kritiek: true }', () => {
    // Zoek de exacte _runTaak_('triggerSelfHeal', ..., {kritiek:true})-call.
    expect(TRIGGERS).toMatch(/_runTaak_\(\s*'triggerSelfHeal'[\s\S]*?\{\s*kritiek:\s*true\s*\}\s*\)/);
  });

  test('herhalendeKosten is kritiek — financiële boeking vooraan, mag niet stil skippen', () => {
    // A-334-decouple: de financiële boeking (verwerkHerhalendeKosten_) is een eigen
    // kritieke taak vooraan; niet langer verstopt in de dure dashboard-render.
    expect(TRIGGERS).toMatch(
      /_runTaak_\(\s*'herhalendeKosten'[\s\S]*?verwerkHerhalendeKosten_\(\);\s*\}\s*,\s*\{\s*kritiek:\s*true\s*\}\s*\)/);
  });

  test('dashboard is NIET (meer) kritiek — de render is cosmetisch/skipbaar (A-334)', () => {
    // De dashboard-call eindigt direct op `vernieuwDashboard(); })` ZONDER kritiek-
    // flag. Re-add van kritiek hier (de hard-cap-regressie) maakt deze test rood.
    expect(TRIGGERS).toMatch(/_runTaak_\(\s*'dashboard'\s*,\s*function\(\)\s*\{\s*vernieuwDashboard\(\);\s*\}\s*\)\s*;/);
  });

  test('dlqRetry is kritiek — draint mislukte factuurmails (omzet, mag niet stil skippen)', () => {
    // Mislukte factuur-/herinneringsmails moeten gedraind worden; stil overslaan
    // = de factuur bereikt de debiteur nooit → klant wordt niet betaald.
    // Anker op dlqVerwerkRetries_() + de afsluitende }, { kritiek: true }) zodat
    // alleen déze call z'n flag de test groen houdt.
    // GEEN losse [\s\S]*? tussen de call-body en de flag: de kritiek-flag MOET
    // direct ná de afsluitende } van déze functie staan, anders zou het reverten
    // van juist deze flag stil matchen op triggerSelfHeal z'n kritiek verderop.
    expect(TRIGGERS).toMatch(
      /_runTaak_\(\s*'dlqRetry'[\s\S]*?dlqVerwerkRetries_\(\);\s*\}\s*,\s*\{\s*kritiek:\s*true\s*\}\s*\)/);
  });

  test('Precies 3 genoemde kritieke taken (regressie: niet rondstrooien)', () => {
    // Spaarzaam-principe blijft: alleen taken die financieel/omzet/infra-kritiek
    // zijn én goedkoop genoeg om de 6-min hard-cap niet te raken. Na budget-
    // overschrijding skippen alle niet-kritieke taken instant, dus deze 3 houden
    // de volle 2-min-marge. Voeg NIET zomaar een vierde toe.
    const matches = TRIGGERS.match(/\{\s*kritiek:\s*true\s*\}/g) || [];
    expect(matches.length).toBe(3);
  });

  test('Functionele simulatie: budget op + kritiek=true → fn wordt uitgevoerd', () => {
    // Klein bron-snippet emuleren — bewijst de logica
    let budgetOverschreden = false;
    const budgetCap = 1000;
    function runTaak(naam, fn, opt) {
      opt = opt || {};
      const elapsed = 5000; // ver voorbij cap
      if (!opt.kritiek && elapsed > budgetCap) {
        budgetOverschreden = true;
        return 'SKIP';
      }
      fn();
      return 'OK';
    }

    let normaleTaakGedraaid = false;
    let kritiekeTaakGedraaid = false;

    expect(runTaak('normaal', () => { normaleTaakGedraaid = true; })).toBe('SKIP');
    expect(normaleTaakGedraaid).toBe(false);

    expect(runTaak('selfheal', () => { kritiekeTaakGedraaid = true; }, { kritiek: true })).toBe('OK');
    expect(kritiekeTaakGedraaid).toBe(true);
    expect(budgetOverschreden).toBe(true); // andere taken zijn wél geskipt
  });
});

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

  test('Geen andere taak heeft kritiek=true (regressie: niet rondstrooien)', () => {
    // Tel exacte kritiek-callsites. Spaarzaam-principe.
    const matches = TRIGGERS.match(/\{\s*kritiek:\s*true\s*\}/g) || [];
    expect(matches.length).toBe(1);
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

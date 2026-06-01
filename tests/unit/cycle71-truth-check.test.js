/**
 * tests/unit/cycle71-truth-check.test.js
 *
 * Cycle 71 — "Truth-Police" audit-sweep. Verifieert dat scripts/truth-check.js
 * géén ghost-handlers vindt: elke addItem(label, 'handler') en elke
 * ScriptApp.newTrigger('handler') verwijst naar een bestaande functie.
 *
 * Dit is de regressie-grens voor de #186/#187-bugklasse: een menu-item of
 * trigger die naar een niet-bestaande functie wijst geeft de klant "Script
 * function not found". Een eerdere ghost (vernieuwHoldingOverzicht in Menu.gs)
 * is in deze cycle verwijderd; deze test voorkomt dat er een nieuwe binnensluipt.
 *
 * We hergebruiken de échte tool-logica (geen kopie) door scripts/truth-check.js
 * als child-process te draaien en op exit-code 0 te asserten.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const TOOL = path.join(ROOT, 'scripts', 'truth-check.js');

describe('CYCLE 71: Truth-Police audit-sweep', () => {
  test('scripts/truth-check.js bestaat en is uitvoerbaar', () => {
    expect(fs.existsSync(TOOL)).toBe(true);
  });

  test('geen ghost menu-items of trigger-handlers (exit 0)', () => {
    let uitvoer = '';
    let exitCode = 0;
    try {
      uitvoer = execFileSync('node', [TOOL], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      exitCode = e.status || 1;
      uitvoer = (e.stdout || '') + (e.stderr || '');
    }
    // Bij een ghost print de tool de regels + exit 1. Toon die output in de
    // failure zodat de ontwikkelaar direct ziet WELKE handler ontbreekt.
    expect({ exitCode, uitvoer }).toEqual({ exitCode: 0, uitvoer: expect.stringContaining('Geen ghost-handlers') });
  });

  test('de verwijderde ghost vernieuwHoldingOverzicht staat niet meer in Menu.gs', () => {
    const menu = fs.readFileSync(path.join(ROOT, 'src', 'Menu.gs'), 'utf8');
    // Mag hooguit in een uitleg-comment voorkomen, niet als addItem-handler.
    expect(menu).not.toMatch(/addItem\([^)]*['"`]vernieuwHoldingOverzicht['"`]/);
  });
});

/**
 * tests/unit/menu-handlers-bestaan.test.js
 *
 * KLASSE-SLUITER: elk menu-item `addItem('label', 'handler')` in Menu.gs moet
 * een bestaande functie `handler` hebben. Een "ghost menu item" (handler bestaat
 * niet) crasht bij klik met "Script function not found" — exact wat er met
 * `vernieuwHoldingOverzicht` gebeurde (zie de comment op Menu.gs:265). Geen test
 * borgde dit; nu wel — een toekomstig spook-item faalt in CI i.p.v. bij de klant.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const menu = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');
const alleSrc = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.gs'))
  .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8'))
  .join('\n');

const handlers = [...menu.matchAll(/addItem\(\s*'[^']+'\s*,\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);

describe('menu-handlers bestaan (geen ghost menu items)', () => {
  test('Menu.gs is gelezen en bevat menu-items', () => {
    expect(handlers.length).toBeGreaterThan(50);
  });

  test('elke addItem-handler heeft een gedefinieerde functie in src/', () => {
    const ontbreekt = [...new Set(handlers)]
      .filter((h) => !new RegExp('function\\s+' + h + '\\s*\\(').test(alleSrc));
    expect(ontbreekt).toEqual([]);   // ghost menu items → klant-crash "Script function not found"
  });
});

/**
 * tests/unit/cycle42-valideer-status-batch.test.js
 *
 * Cycle 42 — valideerEndpoint_ had twee status-bugs:
 *
 *   1. `status === 'ingetrokken'` strict mist 'Ingetrokken — rotatie'
 *      (cycle 31 zet rotated licences op deze status). Gevolg: gerotireerde
 *      sleutel bleef succesvol valideren → klant (of attacker met oude
 *      sleutel) kon spreadsheet blijven gebruiken.
 *
 *   2. Geen check op 'Bounce' status (cycle 32). Klant met onbereikbare
 *      email kon door zonder dat wij hen voor support konden bereiken.
 *
 * Fix: startsWith('ingetrokken') + expliciete bounce-check.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');
const valBody = src.slice(src.indexOf('function valideerEndpoint_('),
                          src.indexOf('\n}\n', src.indexOf('function valideerEndpoint_(')) + 2);

describe('CYCLE 42: valideerEndpoint_ batched status fixes', () => {
  test('Gebruikt startsWith(ingetrokken) ipv strict ===', () => {
    expect(valBody).toMatch(/status\.startsWith\(['"]ingetrokken['"]\)/);
    expect(valBody).not.toMatch(/status\s*===\s*['"]ingetrokken['"]/);
  });

  test('Bounce-status wordt expliciet afgewezen', () => {
    expect(valBody).toMatch(/status\s*===\s*['"]bounce['"]/);
  });

  test('Bounce-melding verwijst klant naar support', () => {
    expect(valBody).toMatch(/bounce[\s\S]{0,200}support@boekhoudbaar/i);
  });

  test('Vervaldatum-check blijft behouden (regressie)', () => {
    expect(valBody).toMatch(/vervaldat\s*<\s*new Date\(\)/);
  });

  test('Status-cell null-safety: `|| \'\'`', () => {
    expect(valBody).toMatch(/data\[i\]\[4\]\s*\|\|\s*['"]['"]/);
  });
});

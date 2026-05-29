/**
 * tests/unit/cycle43-roteer-revoked-lang.test.js
 *
 * Cycle 43 — language mismatch bug: roteerEndpoint_ checkte
 * `indexOf('revoked')` (Engels) maar sheet bevat NL-status 'Ingetrokken'
 * resp. 'Ingetrokken — rotatie' (cycle 31). De check matchte NOOIT.
 *
 * Exploit: een reeds-ingetrokken sleutel kon alsnog door roteerEndpoint_
 * → nieuwe geldige sleutel uitgereikt aan klant wiens licentie was
 * ingetrokken (bv. chargeback, fraude, support-revoke). Bypass.
 *
 * Fix: startsWith('ingetrokken') — matcht 'Ingetrokken' én
 * 'Ingetrokken — rotatie' (consistent met cycles 13/15/29/30/31/32/42).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');
const rotBody = src.slice(src.indexOf('function roteerEndpoint_('),
                          src.indexOf('\n}\n', src.indexOf('function roteerEndpoint_(')) + 2);

describe('CYCLE 43: roteerEndpoint_ status-language fix', () => {
  test('Oude `indexOf(\'revoked\')` is verwijderd (alleen comment mag het noemen)', () => {
    // Comment-context (CYCLE-43 uitleg) mag 'revoked' bevatten, maar code niet.
    const codeOnly = rotBody.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(codeOnly).not.toMatch(/indexOf\(['"]revoked['"]\)/);
  });

  test('Gebruikt startsWith(\'ingetrokken\') (NL)', () => {
    expect(rotBody).toMatch(/startsWith\(['"]ingetrokken['"]\)/);
  });

  test('Null-safety `|| \'\'` op status-cell', () => {
    expect(rotBody).toMatch(/data\[i\]\[statusCol\]\s*\|\|\s*['"]['"]/);
  });

  test('Behoudt klant-melding "Sleutel is al ingetrokken"', () => {
    expect(rotBody).toMatch(/Sleutel is al ingetrokken/);
  });
});

/**
 * tests/unit/cycle57-diagnose-licentie-check.test.js
 *
 * Cycle 57 — diagnoseInstallatie verwees naar `controleerLicentieStatus_`
 * dat NERGENS gedefinieerd is. Resultaat: klant zag in installatie-
 * diagnose altijd "Licentie — check overgeslagen (functie ontbreekt)".
 *
 * Licentie-pad bestaat (Licentie.gs:valideerLicentieOpServer_) maar werd
 * niet aangeroepen. Klant kreeg dus geen feedback over hun licentie-
 * status bij troubleshooting → support-mails met "ik weet niet of mijn
 * licentie werkt".
 *
 * Fix: gebruik valideerLicentieOpServer_(sleutel) met fail-open semantiek
 * (offline = actief uit cache).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/GezondheidCheck.gs'), 'utf8');
const body = src.slice(src.indexOf("check('Licentie'"), src.indexOf("// ── 7. Bedrijfsgegevens"));

describe('CYCLE 57: diagnoseInstallatie licentie-check', () => {
  test('Roept valideerLicentieOpServer_ aan (was: dead controleerLicentieStatus_)', () => {
    expect(body).toContain('valideerLicentieOpServer_');
  });

  test('Sleutel-prop read uit ScriptProperties', () => {
    expect(body).toMatch(/getProperty\(['"]licentiesleutel['"]\)/);
  });

  test('Lege sleutel → klantvriendelijke "GEEN sleutel" melding', () => {
    expect(body).toMatch(/GEEN sleutel/);
    expect(body).toMatch(/activeer via/i);
  });

  test('Offline-modus toont "offline cache" — klant weet status', () => {
    expect(body).toMatch(/r\.offline/);
    expect(body).toMatch(/offline cache/i);
  });

  test('Geen executable controleerLicentieStatus_-call (alleen comment-context mag het noemen)', () => {
    // Strip comments uit body, dan zoek naar de identifier
    const codeOnly = body.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(codeOnly).not.toMatch(/controleerLicentieStatus_\(/);
  });
});

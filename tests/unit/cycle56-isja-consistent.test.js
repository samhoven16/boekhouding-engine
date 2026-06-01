/**
 * tests/unit/cycle56-isja-consistent.test.js
 *
 * Cycle 56 — 6 sites in src/ deden ad-hoc `raw === 'ja' || === 'true' ||
 * === 'yes'` voor klant-instelling-toggles. Inconsistent met de centrale
 * `isJa_()` helper die ook 'y', '1', 'aan', 'on' en boolean-true accepteert.
 *
 * Klant die in Instellingen 'y' of 'aan' typt kreeg op die paden silent
 * "false" terwijl andere paden (Triggers BTW-reminder, herhalende kosten,
 * cycle 8 buy-flow) wél correct interpreteerden. Klant-onbegrepen
 * configuratie = stille feature-deactivatie.
 *
 * Fix: alle 6 sites → isJa_(getInstelling_('…')).
 *
 * Sites:
 *   - Verkoopfacturen.gs KOR regeling actief (factuur PDF KOR-tekst)
 *   - BTW.gs            KOR regeling actief (KOR-grens berekening)
 *   - Belastingadvies.gs KOR regeling actief (KOR-advies)
 *   - Belastingadvies.gs WBSO actief        (WBSO-advies)
 *   - ExportAccountant.gs Email maandrapport
 *   - Triggers.gs        Email tips wekelijks
 *   - Validaties.gs      KOR regeling actief (BTW-nr-validatie)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILES = [
  'src/Verkoopfacturen.gs',
  'src/BTW.gs',
  'src/Belastingadvies.gs',  // 2× (KOR + WBSO)
  'src/ExportAccountant.gs',
  'src/Triggers.gs',
  'src/Validaties.gs',
];

describe('CYCLE 56: isJa_() consistent over alle settings-toggles', () => {
  test('Geen residuele `raw === \'ja\' || === \'true\'`-patroon in genoemde files', () => {
    FILES.forEach((f) => {
      const src = fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
      // Match: variabele-naam gevolgd door " === 'ja' || X === 'true'"
      const matches = src.match(/=== ['"]ja['"]\s*\|\|\s*\w+\s*=== ['"]true['"]/g) || [];
      expect(matches.length).toBe(0);
    });
  });

  test('Elke geconverteerde file roept isJa_(getInstelling_(...)) aan', () => {
    FILES.forEach((f) => {
      const src = fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
      expect(src).toMatch(/isJa_\(getInstelling_\(/);
    });
  });

  test('Utils.gs:isJa_ accepteert het uitgebreide setje (regressie)', () => {
    const util = fs.readFileSync(path.resolve(__dirname, '../../src/Utils.gs'), 'utf8');
    const idx = util.indexOf('function isJa_(');
    const body = util.slice(idx, idx + 600);
    // Accepteert ja/yes/y/true/1/aan/on
    ['ja', 'yes', 'y', 'true', '1', 'aan', 'on'].forEach((token) => {
      expect(body).toMatch(new RegExp(`['"]${token}['"]`));
    });
  });
});

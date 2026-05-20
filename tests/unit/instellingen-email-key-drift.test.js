/**
 * tests/unit/instellingen-email-key-drift.test.js
 *
 * NACHT-SWEEP-FIX: cross-file Instellingen-key drift.
 *
 * Setup.gs:613 schrijft 'Email' als instelling-key. Twee callers lezen
 * onder een andere key (= altijd null) → fallback-pad heeft impact:
 *   - BTWReminder.gs:75 → fallback Session.getActiveUser() (vaak ok maar
 *     verkeerd voor klant met aparte zakelijke email)
 *   - Validaties.gs:186 → fallback ander niet-bestaande key → klant ziet
 *     altijd "email ontbreekt" waarschuwing (false positive)
 *
 * Echte schade: BTW-reminder gaat naar Google-account-email ipv business-
 * email → klant mist deadline → boete €68 minimum.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

function leesBron(naam) {
  return fs.readFileSync(path.join(SRC, naam), 'utf8');
}

describe('Instellingen-key drift: email', () => {
  test('Setup.gs schrijft Instelling onder key "Email"', () => {
    const src = leesBron('Setup.gs');
    expect(src).toMatch(/\['Email',\s*''\]/);
  });

  test('BTWReminder.gs leest dezelfde key als Setup schrijft', () => {
    const src = leesBron('BTWReminder.gs');
    // Verwacht: getInstelling_('Email') voor consistente email-lookup
    expect(src).toMatch(/getInstelling_\(['"]Email['"]\)/);
    // Niet meer: 'E-mailadres' (oude verkeerde key)
    expect(src).not.toMatch(/getInstelling_\(['"]E-mailadres['"]\)/);
  });

  test('Validaties.gs leest dezelfde key als Setup schrijft', () => {
    const src = leesBron('Validaties.gs');
    expect(src).toMatch(/getInstelling_\(['"]Email['"]\)/);
    // Niet meer: 'E-mail' (oude verkeerde key)
    expect(src).not.toMatch(/getInstelling_\(['"]E-mail['"]\)/);
  });

  test('Triggers.gs + ExportAccountant.gs blijven consistent (regressie)', () => {
    const triggers = leesBron('Triggers.gs');
    const exp = leesBron('ExportAccountant.gs');
    // Bestaand patroon: 'Email rapporten naar' als override, fallback 'Email'
    expect(triggers).toMatch(/getInstelling_\(['"]Email rapporten naar['"]\)\s*\|\|\s*getInstelling_\(['"]Email['"]\)/);
    expect(exp).toMatch(/getInstelling_\(['"]Email rapporten naar['"]\)\s*\|\|\s*getInstelling_\(['"]Email['"]\)/);
  });
});

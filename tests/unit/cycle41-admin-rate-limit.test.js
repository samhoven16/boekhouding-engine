/**
 * tests/unit/cycle41-admin-rate-limit.test.js
 *
 * Cycle 41 — adminPaneel_ had GEEN rate-limit. ADMIN_WACHTWOORD-pad in
 * doGet ging direct naar de wachtwoord-check zonder enige throttle.
 * veiligVergelijk_ stopt timing-attacks maar NIET brute-force scanning
 * (attacker probeert 1000s passwords per minuut).
 *
 * Fix: rate-limit wrap (20 pogingen/uur globaal) — voldoende voor klant-
 * typo's, voorkomt mass-scanning.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');

describe('CYCLE 41: adminPaneel_ rate-limit op login', () => {
  test('admin-route gebruikt rateLimit_ als gate vóór adminPaneel_ (behalve noodsleutel-bypass)', () => {
    // Audit 2026-06-09: structuur is van one-liner naar multi-line
    // if-block met noodsleutel-bypass (eerste return = adminPaneel_)
    // + rate-limit + alert-mail + finale adminPaneel_-call.
    const adminStart = src.indexOf("if (actie === 'admin')");
    expect(adminStart).toBeGreaterThan(-1);
    const adminBlok = src.slice(adminStart, adminStart + 1500);
    expect(adminBlok).toMatch(/rateLimit_\(e/);
    expect(adminBlok).toMatch(/_adminNoodsleutelOk_\(e\)/);
    // Bypass mag adminPaneel_ direct returnen (Sam-only pad).
    // Niet-bypass pad moet door rateLimit_ vóór adminPaneel_:
    const idxRate = adminBlok.indexOf('rateLimit_(e');
    const lastPaneelIdx = adminBlok.lastIndexOf('adminPaneel_(e)');
    expect(idxRate).toBeLessThan(lastPaneelIdx);
  });

  test('Rate-limit-config: actie="admin-login", globaal=20, windowMin=60', () => {
    const adminStart = src.indexOf("if (actie === 'admin')");
    const adminBlok = src.slice(adminStart, adminStart + 1500);
    expect(adminBlok).toMatch(/actie:\s*['"]admin-login['"]/);
    expect(adminBlok).toMatch(/globaal:\s*20/);
    expect(adminBlok).toMatch(/windowMin:\s*60/);
  });

  test('Alle adminPaneel_-calls in dispatcher zitten binnen het admin-if-blok', () => {
    // Vóór de helper-defs: 2 toelaatbare hits, beide binnen `if (actie === 'admin')`:
    //   1. Bypass-pad: `if (_adminNoodsleutelOk_(e)) return adminPaneel_(e);`
    //   2. Hoofdpad: na rate-limit `return adminPaneel_(e);`
    const dispatcher = src.slice(0, src.indexOf('function _adminNoodsleutelOk_'));
    const adminStart = dispatcher.indexOf("if (actie === 'admin')");
    const adminEnd   = dispatcher.indexOf("if (actie === 'roteer')", adminStart);
    const buitenBlok = dispatcher.slice(0, adminStart) + dispatcher.slice(adminEnd);
    expect(buitenBlok).not.toMatch(/adminPaneel_\(e\)/);
  });

  test('rateLimit_ helper bestaat in dezelfde file (geen broken-call)', () => {
    expect(src).toMatch(/function rateLimit_\(/);
  });

  test('Andere endpoints behouden hun rate-limits (regressie)', () => {
    expect(src).toMatch(/actie === ['"]aanvraag-otp['"][^\n]*rateLimit_/);
    expect(src).toMatch(/actie === ['"]onboarded['"][^\n]*rateLimit_/);
    expect(src).toMatch(/actie === ['"]roteer['"][^\n]*rateLimit_/);
  });
});

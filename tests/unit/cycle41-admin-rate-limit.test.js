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
  test('admin-route gaat door rateLimit_ ipv directe call', () => {
    expect(src).toMatch(/actie === ['"]admin['"][^\n]*rateLimit_\(e/);
  });

  test('Rate-limit-config: actie="admin-login", globaal=20, windowMin=60', () => {
    expect(src).toMatch(/rateLimit_\(e,\s*\{\s*actie:\s*['"]admin-login['"]/);
    expect(src).toMatch(/rateLimit_\(e,\s*\{[^}]*globaal:\s*20[^}]*\}\)\s*\|\|\s*adminPaneel_/);
    expect(src).toMatch(/rateLimit_\(e,\s*\{[^}]*windowMin:\s*60[^}]*\}\)\s*\|\|\s*adminPaneel_/);
  });

  test('Geen residuele direct adminPaneel_(e) zonder rate-limit-wrap in dispatcher', () => {
    // Match: `actie === 'admin'` op een regel die NIET ook rateLimit_ bevat
    const adminRegels = src.split('\n').filter((l) => /actie === ['"]admin['"]/.test(l));
    adminRegels.forEach((regel) => {
      expect(regel).toMatch(/rateLimit_/);
    });
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

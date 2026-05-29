/**
 * tests/unit/cycle29-otp-status-startswith.test.js
 *
 * Cycle 29 — aanvraagOtpEndpoint_ en activeerOtpEndpoint_ deden strict
 * `=== 'actief'` voor status-check. Andere endpoints
 * (onboardedEndpoint_ uit cycle 15, herstuurLicentieEndpoint_, admin-
 * counters) deden allang `startsWith('actief')` om varianten te
 * accepteren:
 *   - 'Actief (handmatig)'  — owner heeft handmatig licentie gegeven
 *   - 'Actief — trial'      — proefperiode actief
 *   - 'Actief — vervolg'    — verlenging vanuit eerder pakket
 *
 * Door de inconsistentie konden klanten in deze varianten silent geen
 * OTP aanvragen of activeren — kregen 'geen actieve licentie gevonden'.
 *
 * Fix: beide OTP-endpoints gebruiken nu ook startsWith.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 29: OTP endpoints status startsWith-check', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');

  test('aanvraagOtpEndpoint_ gebruikt startsWith(actief)', () => {
    const startIdx = src.indexOf('function aanvraagOtpEndpoint_(');
    const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);
    expect(body).toMatch(/\.toLowerCase\(\)\.startsWith\(['"]actief['"]\)/);
    // De oude strict-vergelijking mag NIET meer voorkomen op data[i][4]
    expect(body).not.toMatch(/String\(data\[i\]\[4\]\)\.toLowerCase\(\) === ['"]actief['"]/);
  });

  test('activeerOtpEndpoint_ gebruikt startsWith(actief)', () => {
    const startIdx = src.indexOf('function activeerOtpEndpoint_(');
    const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);
    expect(body).toMatch(/startsWith\(['"]actief['"]\)/);
    expect(body).not.toMatch(/String\(data\[i\]\[4\]\)\.toLowerCase\(\) !== ['"]actief['"]/);
  });

  test('Andere endpoints (onboard/herstuur/admin) blijven ook startsWith gebruiken — consistentie', () => {
    // onboardedEndpoint_ (cycle 15)
    const ond = src.indexOf('function onboardedEndpoint_(');
    expect(src.slice(ond, ond + 2000)).toMatch(/startsWith\(['"]actief['"]\)/);
    // herstuurLicentieEndpoint_ (cycle 13)
    const her = src.indexOf('function herstuurLicentieEndpoint_(');
    expect(src.slice(her, her + 2500)).toMatch(/startsWith\(['"]actief['"]\)/);
  });

  test('Geen residuele strict === \'actief\' in OTP-pad', () => {
    // Algemene safety: tel alle hits van strict-actief vergelijking
    const matches = src.match(/data\[i\]\[4\]\)?\.toLowerCase\(\)\s*[!=]==\s*['"]actief['"]/g) || [];
    // Brevo-bounce-handler (regel ~2145) gebruikt nog wel strict — die laten
    // we voor nu, maar OTP-pad moet 0 hits hebben binnen functie-bodies.
    const aanvBody = src.slice(src.indexOf('function aanvraagOtpEndpoint_('), src.indexOf('function activeerOtpEndpoint_('));
    const actBody = src.slice(src.indexOf('function activeerOtpEndpoint_('), src.indexOf('function stuurOtpMail_('));
    expect(aanvBody.match(/data\[i\]\[4\]\)?\.toLowerCase\(\)\s*[!=]==\s*['"]actief['"]/)).toBeNull();
    expect(actBody.match(/data\[i\]\[4\]\)?\.toLowerCase\(\)\s*[!=]==\s*['"]actief['"]/)).toBeNull();
  });
});

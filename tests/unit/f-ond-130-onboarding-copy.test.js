/**
 * tests/unit/f-ond-130-onboarding-copy.test.js
 *
 * F-OND-130 — onboarding-copy klopte niet met de echte activatie-flow:
 *  - /bedankt beschreef de mail-link als "directe link naar jouw eigen Sheet"
 *    en plaatste het Google-OAuth-scherm bij "Eerste factuur maken", terwijl
 *    de klant eerst via "Een kopie maken" zijn kopie zet en het OAuth-scherm
 *    al bij het eerste gebruik/activeren ziet.
 *  - de OTP-mail kreeg een tijdsindicatie in het onderwerp zodat hij niet met
 *    de order-mail ("…is klaar — activeer nu") verward wordt.
 *
 * Ratel: deze asserties falen op de oude copy.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

describe('F-OND-130 — /bedankt beschrijft de echte kopie-/OAuth-flow', () => {
  const bedankt = read('website/bedankt/index.html');

  test('noemt de "Een kopie maken"-stap', () => {
    expect(bedankt).toMatch(/Een kopie maken/);
  });

  test('plaatst OAuth niet langer bij "Eerste factuur maken"', () => {
    expect(bedankt).not.toMatch(/bijv\. "Eerste factuur maken"\) vraagt Google/);
  });

  test('maakt duidelijk dat OAuth vóór de eerste factuur komt', () => {
    expect(bedankt).toMatch(/vóór je eerste factuur/i);
  });
});

describe('F-OND-130 — OTP-mail onderscheidbaar van order-mail', () => {
  const code = read('licence-server/Code.gs');

  test('OTP-onderwerp bevat de "15 min geldig"-tijdsindicatie (Brevo + MailApp)', () => {
    const subjects = code.match(/subject: 'Je activeringscode: ' \+ otp \+ ' \(15 min geldig\)[^']*'/g) || [];
    expect(subjects.length).toBeGreaterThanOrEqual(2); // Brevo + MailApp-fallback
  });

  test('order-mail behoudt zijn eigen, andere onderwerp', () => {
    expect(code).toMatch(/Je ' \+ productnm \+ ' is klaar — activeer nu/);
  });
});

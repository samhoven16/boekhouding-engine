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

describe('F-OND-142 — server-bedanktpagina gelijk aan de echte kopie-/OAuth-flow', () => {
  const code = read('licence-server/Code.gs');
  const fn = code.slice(code.indexOf('function bedanktPagina_'), code.indexOf('function bedanktPagina_') + 4200);

  test('noemt de "Een kopie maken"-stap (consistent met /bedankt, F-OND-130)', () => {
    expect(fn).toMatch(/Een kopie maken/);
  });
  test('plaatst OAuth bij eerste gebruik, vóór de eerste factuur', () => {
    expect(fn).toMatch(/vóór je eerste factuur/i);
  });
  test('framet de activatielink niet meer als auto-kopie ("Je klikt op de activatielink" weg)', () => {
    expect(fn).not.toMatch(/Je klikt op de activatielink in de mail/);
  });
  test('noemt de 15-min-geldigheid van de code (consistent met F-OND-141)', () => {
    expect(fn).toMatch(/15 minuten/);
  });
});

describe('F-OND-141 — OTP-dialoog noemt de 15-min-vervaltijd (stap 2)', () => {
  // Klant pauzeerde tussen mail en invoer → code verlopen → frustratie. De mail
  // noemde 15 min wél, de dialoog niet. Nu staat het in de stap-2-banner.
  const licentie = fs.readFileSync(path.resolve(__dirname, '../../src/Licentie.gs'), 'utf8');

  test('stap-2-banner (code-invoer) noemt "15 minuten" geldig', () => {
    const idx = licentie.indexOf('Stap 2: OTP');
    const blok = licentie.slice(idx, idx + 600);
    expect(blok).toMatch(/15 minuten/);
  });
});

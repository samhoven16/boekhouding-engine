/**
 * tests/unit/admin-emails-extra.test.js
 *
 * D4 — Bus-factor 1 verzachten. ADMIN_EMAILS was alleen
 * ['samhoven16@gmail.com'] hardcoded; bij langdurige onbereikbaarheid van
 * de hoofdadmin geen alternatieve admin. Nu: ScriptProperty
 * ADMIN_EMAILS_EXTRA (komma-gescheiden) breidt de lijst uit zonder
 * code-push.
 *
 * Plus: HelpTab.gs documenteert nu de LICENTIE_GRACE_DAGEN-override
 * zodat klanten bij Sam-onbeschikbaarheid niet op dag 91 stilvallen.
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LIC = fs.readFileSync(path.resolve(__dirname, '../../src/Licentie.gs'), 'utf8');
const HELP = fs.readFileSync(path.resolve(__dirname, '../../src/HelpTab.gs'), 'utf8');

describe('D4: ADMIN_EMAILS uitbreidbaar zonder code-push', () => {
  test('ADMIN_EMAILS leest ADMIN_EMAILS_EXTRA uit ScriptProperties', () => {
    expect(LIC).toMatch(/ADMIN_EMAILS_EXTRA/);
    expect(LIC).toMatch(/PropertiesService\.getScriptProperties\(\)\.getProperty\('ADMIN_EMAILS_EXTRA'\)/);
  });

  test('De base-lijst bevat nog steeds de hoofdadmin (regressie)', () => {
    expect(LIC).toMatch(/const base = \['samhoven16@gmail\.com'\]/);
  });

  test('Extras worden case-genormaliseerd, gevalideerd op email-formaat, gededupliceerd', () => {
    // Lees de IIFE-body als bron en check de essentiële guards
    expect(LIC).toMatch(/toLowerCase\(\)/);
    expect(LIC).toMatch(/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$/);
    expect(LIC).toMatch(/base\.indexOf\(m\)\s*===\s*-1/);
  });

  // Functioneel: simuleer de IIFE met verschillende ScriptProperty-waarden
  function bouwAdmins(extraValue) {
    const base = ['samhoven16@gmail.com'];
    try {
      if (extraValue) {
        String(extraValue).split(',').forEach(function(e) {
          const m = String(e || '').trim().toLowerCase();
          if (m && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) && base.indexOf(m) === -1) base.push(m);
        });
      }
    } catch (_) {}
    return base;
  }

  test('Geen ADMIN_EMAILS_EXTRA → alleen base-admin', () => {
    expect(bouwAdmins(null)).toEqual(['samhoven16@gmail.com']);
    expect(bouwAdmins('')).toEqual(['samhoven16@gmail.com']);
  });

  test('Eén extra email → toegevoegd', () => {
    expect(bouwAdmins('mede@oprichter.nl'))
      .toEqual(['samhoven16@gmail.com', 'mede@oprichter.nl']);
  });

  test('Meerdere extras komma-gescheiden + whitespace + caps → genormaliseerd', () => {
    expect(bouwAdmins(' Sam@KOMPANY.NL , accountant@firma.nl '))
      .toEqual(['samhoven16@gmail.com', 'sam@kompany.nl', 'accountant@firma.nl']);
  });

  test('Garbage in extras wordt overgeslagen, geen crash', () => {
    expect(bouwAdmins('valid@x.nl,GARBAGE,,nog-een@y.nl'))
      .toEqual(['samhoven16@gmail.com', 'valid@x.nl', 'nog-een@y.nl']);
  });

  test('Duplicaten worden niet dubbel toegevoegd', () => {
    expect(bouwAdmins('samhoven16@gmail.com,nieuwe@admin.nl'))
      .toEqual(['samhoven16@gmail.com', 'nieuwe@admin.nl']);
  });
});

describe('D4: HelpTab documenteert LICENTIE_GRACE_DAGEN-override', () => {
  test('Sectie "Licentie-server onbereikbaar?" bestaat', () => {
    expect(HELP).toMatch(/Licentie-server onbereikbaar/i);
  });

  test('LICENTIE_GRACE_DAGEN wordt expliciet benoemd', () => {
    expect(HELP).toMatch(/LICENTIE_GRACE_DAGEN/);
  });

  test('Stap-voor-stap-instructie via Apps Script Scripteigenschappen', () => {
    expect(HELP).toMatch(/Apps Script editor/i);
    expect(HELP).toMatch(/Scripteigenschappen/i);
  });

  test('Waarschuwing dat het geen bypass-truc is', () => {
    expect(HELP).toMatch(/geen omzeil-truc|geen bypass/i);
  });
});

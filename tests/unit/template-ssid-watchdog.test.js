/**
 * tests/unit/template-ssid-watchdog.test.js
 *
 * Go-live blocker #7: TEMPLATE_SS_ID owner-alert + watchdog.
 *
 * Was: bestaande hard-guard throwt 500 bij Mollie-webhook als
 * TEMPLATE_SS_ID ontbreekt — Sam pas reactief op de hoogte (na klant
 * heeft betaald). Geen proactief signaal als de prop ontbreekt vóór
 * een aankoop.
 *
 * Nu:
 *   • controleerKritiekeConfig_() pure helper, scheidt CRIT vs WARN
 *   • Daagelijkse statusmail bovenaan rode CRIT-banner + [CRIT] in
 *     subject als prop ontbreekt
 *   • /exec?actie=status endpoint returnt status='crit' + missend-lijst
 *     zodat externe monitor (UptimeRobot/Cloudflare) JSON-alert kan
 *
 * Aanpak: source-grep — license-server draait niet in Node, dus geen
 * GAS-runtime simulatie.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(ROOT, 'licence-server/Code.gs'), 'utf8');

describe('Code.gs — controleerKritiekeConfig_ helper', () => {
  test('Functie bestaat', () => {
    expect(code).toMatch(/function controleerKritiekeConfig_\s*\(\s*\)/);
  });

  test('Onderscheidt CRIT vs WARN niveau (semantisch verschil)', () => {
    const start = code.indexOf('function controleerKritiekeConfig_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/const crit = \[\]/);
    expect(blok).toMatch(/const warn = \[\]/);
    expect(blok).toMatch(/ok:\s*crit\.length === 0/);
  });

  test('CRIT-lijst bevat drie business-stoppers', () => {
    const start = code.indexOf('function controleerKritiekeConfig_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/crit\.push\(['"]TEMPLATE_SS_ID['"]\)/);
    expect(blok).toMatch(/crit\.push\(['"]MOLLIE_API_KEY['"]\)/);
    expect(blok).toMatch(/crit\.push\(['"]ADMIN_WACHTWOORD['"]\)/);
  });

  test('WARN-lijst noemt fallback-mechanisme per item (eerlijk over impact)', () => {
    const start = code.indexOf('function controleerKritiekeConfig_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/BREVO_API_KEY.*MailApp fallback/);
    expect(blok).toMatch(/OWNER_STATUS_EMAIL/);
    expect(blok).toMatch(/VAN_EMAIL/);
  });

  test('Pure read: geen side-effects (geen setProperty / sendEmail / log)', () => {
    const start = code.indexOf('function controleerKritiekeConfig_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).not.toMatch(/setProperty/);
    expect(blok).not.toMatch(/sendEmail/);
    expect(blok).not.toMatch(/safeAuditLog/);
  });
});

describe('Dagelijkse statusmail — CRIT-banner integratie', () => {
  test('Roept controleerKritiekeConfig_ aan vóór mail-versturing', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    const idxCheck = blok.indexOf('controleerKritiekeConfig_');
    const idxSend = blok.indexOf('MailApp.sendEmail');
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxSend).toBeGreaterThan(idxCheck);
  });

  test('Subject krijgt [CRIT] prefix als config niet ok', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/\[CRIT\]/);
    expect(blok).toMatch(/prefix\s*=\s*!config\.ok/);
  });

  test('Rood CRIT-banner bovenaan HTML bij missende kritieke property', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/🚨 KRITIEKE CONFIG ONTBREEKT/);
    expect(blok).toMatch(/#DC2626/);  // rood
    expect(blok).toMatch(/actie vereist/i);
  });

  test('Geel WARN-banner bij niet-kritieke missende properties', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/#FFF8E1/);  // amber
    expect(blok).toMatch(/Niet-kritieke config-warnings/);
  });

  test('Banner-injectie via concat (html = banner + html), niet template-replace', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/html\s*=\s*banner \+ html/);
  });

  test('Return value bevat config voor caller-side observability', () => {
    const start = code.indexOf('function verstuurDagelijkseStatusmail_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/config:\s*config/);
  });
});

describe('Status endpoint — granulaire JSON-output voor externe monitor', () => {
  test('Status veld is "ok" óf "crit" (niet altijd "ok")', () => {
    // Het oude pad was: status: 'ok' hardcoded. Nu dynamisch.
    expect(code).toMatch(/const status = config\.ok \? ['"]ok['"] : ['"]crit['"]/);
  });

  test('JSON-payload bevat granulair config-object met missend + waarschuwingen', () => {
    expect(code).toMatch(/config:\s*\{[\s\S]*ok:\s*config\.ok[\s\S]*missend:\s*config\.crit[\s\S]*waarschuwingen:\s*config\.warn/);
  });

  test('Bestaande boolean-velden (mollie/templateReady/brevo) blijven (back-compat)', () => {
    expect(code).toMatch(/mollie:\s*!!props\.getProperty\(['"]MOLLIE_API_KEY['"]\)/);
    expect(code).toMatch(/templateReady:\s*!!props\.getProperty\(['"]TEMPLATE_SS_ID['"]\)/);
    expect(code).toMatch(/brevo:\s*!!props\.getProperty\(['"]BREVO_API_KEY['"]\)/);
  });

  test('typeof-guard zodat status-endpoint blijft werken als helper ontbreekt (back-compat)', () => {
    expect(code).toMatch(/typeof controleerKritiekeConfig_ === ['"]function['"]/);
  });
});

describe('Functionele simulatie — banner-injectie logic', () => {
  function bouwOnderwerp(configOk, nieuw, actief) {
    const prefix = !configOk ? '[CRIT] ' : '';
    return prefix + '📊 Boekhoudbaar status — 9 jun · ' + nieuw + ' nieuw, ' + actief + ' actief';
  }

  test('Config OK → onderwerp zonder prefix', () => {
    expect(bouwOnderwerp(true, 3, 27)).toBe('📊 Boekhoudbaar status — 9 jun · 3 nieuw, 27 actief');
  });

  test('Config NOT OK → onderwerp met [CRIT] prefix (zichtbaar in inbox)', () => {
    expect(bouwOnderwerp(false, 0, 27)).toMatch(/^\[CRIT\]/);
  });
});

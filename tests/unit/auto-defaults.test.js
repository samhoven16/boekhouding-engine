/**
 * tests/unit/auto-defaults.test.js
 *
 * AutoDefaults.gs — slim invullen van klant-velden die we autonoom kunnen
 * afleiden zonder dat de klant erom hoeft te vragen.
 *
 *   1. Email + Email rapporten naar  →  Session.getActiveUser().getEmail()
 *   2. Webhook API sleutel           →  Random 32-char secret
 *
 * Aanpak: bron-grep + GAS-runtime simulatie via createGasRuntime helper.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const autoBron  = fs.readFileSync(path.join(SRC, 'AutoDefaults.gs'), 'utf8');
const setupBron = fs.readFileSync(path.join(SRC, 'Setup.gs'), 'utf8');

describe('AutoDefaults.gs — bron-hygiëne', () => {
  test('Publieke helper vulSlimmeDefaultsIn_ bestaat', () => {
    expect(autoBron).toMatch(/function vulSlimmeDefaultsIn_/);
  });

  test('Twee velden auto-gevuld: Email + Webhook API sleutel', () => {
    expect(autoBron).toMatch(/['"]Email['"]/);
    expect(autoBron).toMatch(/['"]Email rapporten naar['"]/);
    expect(autoBron).toMatch(/['"]Webhook API sleutel['"]/);
  });

  test('Idempotent: overschrijft nooit bestaande klant-input', () => {
    expect(autoBron).toMatch(/if \(!huidigEmail\)/);
    expect(autoBron).toMatch(/if \(!huidigSecret\)/);
    // Doc-claim ook expliciet vastleggen
    expect(autoBron).toMatch(/Idempotent/);
  });

  test('Default-template-waarde "eigenaar@mijnbedrijf.nl" telt als leeg (anti-stale)', () => {
    expect(autoBron).toMatch(/eigenaar@mijnbedrijf\.nl/);
  });

  test('Webhook-secret = 32 chars, sterk random (UUID-gebaseerd)', () => {
    expect(autoBron).toMatch(/_AUTODEFAULTS_WEBHOOK_LENGTE\s*=\s*32/);
    expect(autoBron).toMatch(/Utilities\.getUuid\(\)/);
  });

  test('Faal-safe: een falende default mag setup() niet breken', () => {
    expect(autoBron).toMatch(/_setStilEnTel_/);
    // Outer try/catch om elke afzonderlijke stap
    const setStart = autoBron.indexOf('function _setStilEnTel_');
    const setBlok = autoBron.slice(setStart, setStart + 500);
    expect(setBlok).toMatch(/try \{[\s\S]+\} catch \(_\) \{/);
  });

  test('Audit-log entry bij elke uitvoering (Belastingdienst-trail)', () => {
    expect(autoBron).toMatch(/safeAuditLog_\(['"]AutoDefaults['"]/);
  });
});

describe('Setup.gs — wiring', () => {
  test('vulSlimmeDefaultsIn_ wordt aangeroepen ná zetInstellingen_', () => {
    const idxInst = setupBron.indexOf('zetInstellingen_(ss);');
    const idxAuto = setupBron.indexOf('vulSlimmeDefaultsIn_');
    expect(idxInst).toBeGreaterThan(-1);
    expect(idxAuto).toBeGreaterThan(-1);
    expect(idxAuto).toBeGreaterThan(idxInst);
  });

  test('Met typeof-guard (back-compat als AutoDefaults.gs zou ontbreken)', () => {
    const start = setupBron.indexOf('Slimme defaults invullen');
    const blok = setupBron.slice(start, start + 600);
    expect(blok).toMatch(/typeof vulSlimmeDefaultsIn_ === ['"]function['"]/);
  });

  test('Wiring ALS stap in de stappen-array (krijgt zelfde error-isolation)', () => {
    const start = setupBron.indexOf('Slimme defaults invullen');
    const rond = setupBron.slice(Math.max(0, start - 50), start + 50);
    expect(rond).toMatch(/\[/);  // is een array-tuple
  });
});

describe('Functionele simulatie via GAS-runtime', () => {
  let ctx;

  function bouwInstellingenMock(initieel) {
    const opslag = Object.assign({}, initieel);
    return {
      opslag: opslag,
      getInstelling_: jest.fn(function(sleutel) { return opslag[sleutel] || ''; }),
      setInstelling_: jest.fn(function(sleutel, waarde) { opslag[sleutel] = waarde; }),
    };
  }

  beforeEach(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'AutoDefaults.gs']);
    ctx.Session = {
      getActiveUser: jest.fn(() => ({ getEmail: jest.fn(() => 'jan@voorbeeld.nl') })),
    };
    ctx.Utilities = ctx.Utilities || {};
    ctx.Utilities.getUuid = jest.fn(() => 'abcdef12-3456-7890-abcd-ef1234567890');
    ctx.safeAuditLog_ = jest.fn();
  });

  test('Lege Instellingen: vult Email + rapporten + secret', () => {
    const mock = bouwInstellingenMock({});
    ctx.getInstelling_  = mock.getInstelling_;
    ctx.setInstelling_  = mock.setInstelling_;
    const rapport = ctx.vulSlimmeDefaultsIn_();
    expect(rapport.ingevuld).toContain('Email');
    expect(rapport.ingevuld).toContain('Email rapporten naar');
    expect(rapport.ingevuld).toContain('Webhook API sleutel');
    expect(mock.opslag['Email']).toBe('jan@voorbeeld.nl');
    expect(mock.opslag['Email rapporten naar']).toBe('jan@voorbeeld.nl');
    expect(mock.opslag['Webhook API sleutel'].length).toBe(32);
  });

  test('Bestaande klant-input wordt NIET overschreven', () => {
    const mock = bouwInstellingenMock({
      'Email': 'al-ingevuld@klant.nl',
      'Webhook API sleutel': 'mijn-eigen-sleutel-blijft-staan',
    });
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    const rapport = ctx.vulSlimmeDefaultsIn_();
    expect(rapport.overgeslagen).toContain('Email (al gevuld)');
    expect(rapport.overgeslagen).toContain('Webhook API sleutel (al gevuld)');
    expect(mock.opslag['Email']).toBe('al-ingevuld@klant.nl');
    expect(mock.opslag['Webhook API sleutel']).toBe('mijn-eigen-sleutel-blijft-staan');
  });

  test('Stale template-default "eigenaar@mijnbedrijf.nl" wordt wel overschreven', () => {
    const mock = bouwInstellingenMock({
      'Email rapporten naar': 'eigenaar@mijnbedrijf.nl',
    });
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    ctx.vulSlimmeDefaultsIn_();
    expect(mock.opslag['Email rapporten naar']).toBe('jan@voorbeeld.nl');
  });

  test('Session niet beschikbaar → email-velden onaangeraakt, secret nog steeds gezet', () => {
    const mock = bouwInstellingenMock({});
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    ctx.Session.getActiveUser = jest.fn(() => { throw new Error('niet beschikbaar'); });
    const rapport = ctx.vulSlimmeDefaultsIn_();
    expect(rapport.ingevuld).not.toContain('Email');
    expect(rapport.ingevuld).toContain('Webhook API sleutel');
    expect(mock.opslag['Email']).toBeUndefined();
  });

  test('Twee opeenvolgende calls → tweede is no-op (idempotent)', () => {
    const mock = bouwInstellingenMock({});
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    ctx.vulSlimmeDefaultsIn_();
    const eerstesleutel = mock.opslag['Webhook API sleutel'];
    const rapport2 = ctx.vulSlimmeDefaultsIn_();
    expect(rapport2.ingevuld).toEqual([]);
    expect(mock.opslag['Webhook API sleutel']).toBe(eerstesleutel);  // identiek
  });

  test('Secret-lengte ALTIJD exact 32 (validatie)', () => {
    const mock = bouwInstellingenMock({});
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    ctx.vulSlimmeDefaultsIn_();
    const secret = mock.opslag['Webhook API sleutel'];
    expect(secret).toMatch(/^[0-9a-f]{32}$/);
  });

  test('Audit-log call met "AutoDefaults"-label', () => {
    const mock = bouwInstellingenMock({});
    ctx.getInstelling_ = mock.getInstelling_;
    ctx.setInstelling_ = mock.setInstelling_;
    ctx.vulSlimmeDefaultsIn_();
    expect(ctx.safeAuditLog_).toHaveBeenCalledWith(
      'AutoDefaults',
      expect.stringMatching(/Ingevuld:/)
    );
  });
});

/**
 * tests/unit/cycle80-btw-validator-art17.test.js
 *
 * Cycle 80 — twee onafhankelijke verbeteringen:
 *   1. valideerAangifteVoorIndiening_  → sanity-check vóór BTW-indiening
 *   2. verwijderEndpoint_              → GDPR Art. 17 pseudonymisering
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const BTW_GS = path.resolve(__dirname, '../../src/BTW.gs');
const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');
const UTILS_GS = path.resolve(__dirname, '../../src/Utils.gs');
const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

// ─────────────────────────────────────────────
//  BTW VALIDATOR
// ─────────────────────────────────────────────

function laadBtwRuntime() {
  return createGasRuntime([CONFIG_GS, BTW_GS]);
}

function leegAangifte() {
  return {
    r1a_grondslag: 0, r1a_btw: 0,
    r1b_grondslag: 0, r1b_btw: 0,
    r1c_grondslag: 0, r1c_btw: 0,
    r1d: 0,
    r1e_grondslag: 0, r1e_btw: 0,
    r5a: 0, r5b: 0, r5c: 0,
    saldo: 0,
  };
}

describe('CYCLE 80: valideerAangifteVoorIndiening_', () => {
  test('alle bedragen nul: signaleert "verkeerde periode"-waarschuwing', () => {
    const ctx = laadBtwRuntime();
    const issues = ctx.valideerAangifteVoorIndiening_(leegAangifte());
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/€0/);
    expect(issues[0]).toMatch(/periode/);
  });

  test('normale aangifte met omzet: geen waarschuwingen', () => {
    const ctx = laadBtwRuntime();
    const a = leegAangifte();
    a.r1a_grondslag = 10000;
    a.r1a_btw = 2100;
    a.r5a = 2100;
    a.r5b = 500;
    a.saldo = 1600;
    expect(ctx.valideerAangifteVoorIndiening_(a)).toEqual([]);
  });

  test('negatieve grondslag 21%: signaleert mogelijke creditnota-fout', () => {
    const ctx = laadBtwRuntime();
    const a = leegAangifte();
    a.r1a_grondslag = -500; // negatief — anomaly
    a.r5a = -105;
    a.saldo = -105;
    const issues = ctx.valideerAangifteVoorIndiening_(a);
    expect(issues.some((i) => /Omzet 21%.*negatief/.test(i))).toBe(true);
  });

  test('>50% afwijking van vorig kwartaal: signaleert dubbel-of-vergeten', () => {
    const ctx = laadBtwRuntime();
    const huidig = leegAangifte();
    huidig.r5a = 5000; huidig.r5b = 200; huidig.saldo = 4800;
    const vorig = leegAangifte();
    vorig.r5a = 1000; vorig.r5b = 100; vorig.saldo = 900;
    const issues = ctx.valideerAangifteVoorIndiening_(huidig, vorig);
    expect(issues.some((i) => /afwijking|wijkt.*af/i.test(i))).toBe(true);
  });

  test('<50% afwijking: geen waarschuwing', () => {
    const ctx = laadBtwRuntime();
    const huidig = leegAangifte();
    huidig.r5a = 1200; huidig.r5b = 100; huidig.saldo = 1100;
    const vorig = leegAangifte();
    vorig.r5a = 1000; vorig.r5b = 100; vorig.saldo = 900;
    expect(ctx.valideerAangifteVoorIndiening_(huidig, vorig)).toEqual([]);
  });

  test('kleine saldo-verschillen (€50 ondergrens): geen afwijking-spam', () => {
    const ctx = laadBtwRuntime();
    const huidig = leegAangifte();
    huidig.r5a = 30; huidig.saldo = 30;
    const vorig  = leegAangifte();
    vorig.r5a = 10; vorig.saldo = 10;  // 200% afwijking maar onder ondergrens
    expect(ctx.valideerAangifteVoorIndiening_(huidig, vorig)).toEqual([]);
  });

  test('geen vorige aangifte beschikbaar: geen afwijking-check', () => {
    const ctx = laadBtwRuntime();
    const a = leegAangifte();
    a.r1a_grondslag = 100000; a.r5a = 21000; a.saldo = 21000;
    expect(ctx.valideerAangifteVoorIndiening_(a, null)).toEqual([]);
  });

  test('null input: graceful fallback met duidelijke melding', () => {
    const ctx = laadBtwRuntime();
    expect(ctx.valideerAangifteVoorIndiening_(null)).toEqual(['Geen aangifte-data beschikbaar.']);
  });
});

// ─────────────────────────────────────────────
//  GDPR ART. 17 — verwijderEndpoint_
// ─────────────────────────────────────────────

function maakVerwijderCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({}, opts.props || {});
  const cacheStore = {};
  const setCalls = [];

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
  });
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => [
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt', 'SsId',
         'Aangemaakt', 'PaymentId', 'LaatsteVal', 'Onboarded', 'Verwijzer'],
        ...(opts.rows || []),
      ],
    }),
    getRange: (rij, col) => ({
      setValue: (v) => setCalls.push({ rij, col, v }),
    }),
  });
  return { ctx, propStore, setCalls };
}

function parseJson(textOutput) { return JSON.parse(textOutput._txt); }

describe('CYCLE 80: verwijderEndpoint_ (GDPR Art. 17)', () => {
  const email = 'klant@example.nl';
  const sleutel = 'BKHE-AAAA-BBBB-CCCC';
  const validOtp = { code: '123456', expiry: Date.now() + 600000 };

  test('correcte OTP + bestaande klant: pseudonymiseert alle PII-kolommen', () => {
    const { ctx, propStore, setCalls } = maakVerwijderCtx({
      props: { ['otp_' + email]: JSON.stringify(validOtp) },
      rows: [[sleutel, 'Jan Jansen', email, 'Standaard', 'Actief', '',
              'ss-id-xyz', new Date(), 'tr_x', new Date(), '', 'refXYZ']],
    });
    const r = parseJson(ctx.verwijderEndpoint_({ parameter: { email, otp: '123456' } }));
    expect(r.ok).toBe(true);

    // Verwacht writes naar kolommen 2, 3, 5, 7, 10, 12
    const cols = setCalls.map((c) => c.col).sort((a, b) => a - b);
    expect(cols).toEqual([2, 3, 5, 7, 10, 12]);

    const naamWrite = setCalls.find((c) => c.col === 2);
    expect(naamWrite.v).toBe('— verwijderd —');
    const emailWrite = setCalls.find((c) => c.col === 3);
    expect(emailWrite.v).toMatch(/anonymized\.local$/);
    const statusWrite = setCalls.find((c) => c.col === 5);
    expect(statusWrite.v).toBe('Verwijderd op verzoek (Art. 17)');
    const ssWrite = setCalls.find((c) => c.col === 7);
    expect(ssWrite.v).toBe('');
    const refWrite = setCalls.find((c) => c.col === 12);
    expect(refWrite.v).toBe('');

    // OTP is opgebruikt en uit props verwijderd
    expect(propStore['otp_' + email]).toBeUndefined();
  });

  test('onbekende e-mail: nette foutmelding, geen writes', () => {
    const { ctx, setCalls } = maakVerwijderCtx({
      props: { ['otp_' + email]: JSON.stringify(validOtp) },
      rows: [], // geen matching klant
    });
    const r = parseJson(ctx.verwijderEndpoint_({ parameter: { email, otp: '123456' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/geen licentie/i);
    expect(setCalls).toEqual([]);
  });

  test('verlopen OTP: weiger + verwijder OTP uit store', () => {
    const expired = { code: '123456', expiry: Date.now() - 60000 };
    const { ctx, propStore } = maakVerwijderCtx({
      props: { ['otp_' + email]: JSON.stringify(expired) },
      rows: [[sleutel, 'X', email, 'Standaard', 'Actief', '', '', new Date(), '', new Date(), '', '']],
    });
    const r = parseJson(ctx.verwijderEndpoint_({ parameter: { email, otp: '123456' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/verlopen/i);
    expect(propStore['otp_' + email]).toBeUndefined();
  });

  test('onjuiste OTP: weiger + OTP blijft (klant mag nog 1 poging)', () => {
    const { ctx, propStore } = maakVerwijderCtx({
      props: { ['otp_' + email]: JSON.stringify(validOtp) },
      rows: [[sleutel, 'X', email, 'Standaard', 'Actief', '', '', new Date(), '', new Date(), '', '']],
    });
    const r = parseJson(ctx.verwijderEndpoint_({ parameter: { email, otp: 'WRONG1' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/onjuist/i);
    expect(propStore['otp_' + email]).toBeDefined(); // klant mag nog
  });

  test('zonder OTP-aanvraag: nette melding (geen crash)', () => {
    const { ctx } = maakVerwijderCtx({ props: {}, rows: [] });
    const r = parseJson(ctx.verwijderEndpoint_({ parameter: { email, otp: '123456' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/vraag eerst/i);
  });

  test('PaymentId blijft ongeschonden (AWR 7-jaars bewaarplicht)', () => {
    const { ctx, setCalls } = maakVerwijderCtx({
      props: { ['otp_' + email]: JSON.stringify(validOtp) },
      rows: [[sleutel, 'X', email, 'Standaard', 'Actief', '', '', new Date(),
              'tr_belangrijk', new Date(), '', '']],
    });
    ctx.verwijderEndpoint_({ parameter: { email, otp: '123456' } });
    // PaymentId is kolom 9 (1-based). Geen write daarop.
    expect(setCalls.find((c) => c.col === 9)).toBeUndefined();
  });
});

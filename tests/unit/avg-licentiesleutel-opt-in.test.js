/**
 * tests/unit/avg-licentiesleutel-opt-in.test.js
 *
 * Red-team #1 vondst (opt-in defense-in-depth): verwijderEndpoint_ kan
 * optioneel een licentiesleutel-match eisen, gestuurd door ScriptProperty
 * AVG_VEREIS_LICENTIESLEUTEL='true'. Default OFF zodat go-live niet wijzigt.
 *
 * Tests dekken:
 *   1. Default (geen ScriptProperty): huidige flow, geen sleutel nodig.
 *   2. Opt-in + correcte sleutel: pseudonymisering werkt.
 *   3. Opt-in + verkeerde sleutel: weiger met diagnostische fout.
 *   4. Opt-in + lege sleutel: weiger met "verplicht"-fout.
 *   5. Client (AccountVerwijderen.gs): stuurt sleutel mee in URL.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

const SLEUTEL = 'BKHE-AAAA-BBBB-CCCC';
const EMAIL = 'klant@example.nl';
const VALID_OTP = { code: '123456', expiry: Date.now() + 600000 };

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign(
    { ['otp_' + EMAIL]: JSON.stringify(VALID_OTP) },
    opts.props || {}
  );
  const setCalls = [];

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {} }),
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
        [SLEUTEL, 'Jan', EMAIL, 'Standaard', 'Actief', '', 'ss-id',
         new Date(), 'tr_x', new Date(), '', ''],
      ],
    }),
    getRange: (rij, col) => ({
      setValue: (v) => setCalls.push({ rij, col, v }),
    }),
  });
  return { ctx, propStore, setCalls };
}

function parseJson(output) { return JSON.parse(output._txt); }

describe('verwijderEndpoint_ — sleutel default OFF (huidig gedrag onveranderd)', () => {
  test('zonder ScriptProperty: verwijdering werkt ZONDER sleutel', () => {
    const { ctx, setCalls } = maakCtx();
    const r = parseJson(ctx.verwijderEndpoint_({
      parameter: { email: EMAIL, otp: '123456' },
    }));
    expect(r.ok).toBe(true);
    expect(setCalls.length).toBeGreaterThan(0);
  });
});

describe('verwijderEndpoint_ — sleutel OPT-IN (AVG_VEREIS_LICENTIESLEUTEL=true)', () => {
  test('opt-in + lege sleutel: weiger met "verplicht"-melding, geen sheet-writes', () => {
    const { ctx, setCalls } = maakCtx({ props: { AVG_VEREIS_LICENTIESLEUTEL: 'true' } });
    const r = parseJson(ctx.verwijderEndpoint_({
      parameter: { email: EMAIL, otp: '123456' },
    }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/verplicht|Licentie-informatie/i);
    expect(setCalls).toEqual([]);
  });

  test('opt-in + correcte sleutel: pseudonymisering uitgevoerd', () => {
    const { ctx, setCalls } = maakCtx({ props: { AVG_VEREIS_LICENTIESLEUTEL: 'true' } });
    const r = parseJson(ctx.verwijderEndpoint_({
      parameter: { email: EMAIL, otp: '123456', sleutel: SLEUTEL },
    }));
    expect(r.ok).toBe(true);
    expect(setCalls.length).toBeGreaterThan(0);
  });

  test('opt-in + verkeerde sleutel: weiger met diagnostische "klopt niet"-fout', () => {
    const { ctx, setCalls } = maakCtx({ props: { AVG_VEREIS_LICENTIESLEUTEL: 'true' } });
    const r = parseJson(ctx.verwijderEndpoint_({
      parameter: { email: EMAIL, otp: '123456', sleutel: 'WRONG-XXXX-YYYY-ZZZZ' },
    }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/klopt niet|Licentie-informatie/i);
    expect(setCalls).toEqual([]);
  });

  test('opt-in + correcte sleutel maar case-insensitief: pseudonymisering werkt', () => {
    const { ctx } = maakCtx({ props: { AVG_VEREIS_LICENTIESLEUTEL: 'true' } });
    const r = parseJson(ctx.verwijderEndpoint_({
      parameter: { email: EMAIL, otp: '123456', sleutel: SLEUTEL.toLowerCase() },
    }));
    expect(r.ok).toBe(true);
  });

  test('niet-true waarde (false, "0"): wordt als OFF behandeld', () => {
    ['false', '0', '', 'nope'].forEach(function(v) {
      const { ctx } = maakCtx({ props: { AVG_VEREIS_LICENTIESLEUTEL: v } });
      const r = parseJson(ctx.verwijderEndpoint_({
        parameter: { email: EMAIL, otp: '123456' },
      }));
      expect(r.ok).toBe(true);
    });
  });
});

describe('AccountVerwijderen.gs (client): stuurt sleutel mee in URL', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/AccountVerwijderen.gs'), 'utf8');

  test('voerAccountVerwijdering bouwt URL met sleutel-parameter', () => {
    expect(src).toMatch(/sleutel.*encodeURIComponent/);
    expect(src).toMatch(/\?actie=verwijder/);
  });

  test('sleutel wordt uit LICENTIE_PROP_KEY (ScriptProperties) gehaald', () => {
    expect(src).toMatch(/LICENTIE_PROP_KEY/);
  });

  test('lege sleutel: parameter wordt weggelaten (geen "&sleutel=")', () => {
    expect(src).toMatch(/sleutel \? '&sleutel=/);
  });
});

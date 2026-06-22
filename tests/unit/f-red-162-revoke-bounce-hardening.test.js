/**
 * tests/unit/f-red-162-revoke-bounce-hardening.test.js
 *
 * Red-team-ronde (2026-06-22) — twee wegen waarlangs een aanvaller of een
 * gelekt/gespooft token een klant kon slopen op de centrale licentieserver:
 *
 *  - F-RED-162 (MIDDEL): Status 'bounce' gaf `permanent:true` → de client wiste
 *    z'n 90-daagse offline-grace-anker en bricktte instant. Een hard-bounce komt
 *    via een webhook (één token) → een gelekt token kon een BETALENDE klant
 *    permanent slopen. Nu non-permanent: de klant rijdt de grace uit.
 *
 * Bron-niveau (de licentieserver draait als apart clasp-project, niet in jest).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const code = fs.readFileSync(CODE_GS, 'utf8');

describe('F-RED-162 — bounce-status brickt niet permanent', () => {
  const bounceRegel = code.split('\n').find((r) => /status === 'bounce'/.test(r));

  test('de bounce-tak bestaat en weigert de licentie (geldig:false)', () => {
    expect(bounceRegel).toBeDefined();
    expect(bounceRegel).toMatch(/geldig:\s*false/);
  });

  test('de bounce-tak zet GEEN permanent:true (geen grace-anker-wipe / instant brick)', () => {
    // ingetrokken/vervaldatum/installatie houden permanent:true; bounce mag dat NIET.
    expect(bounceRegel).not.toMatch(/permanent:\s*true/);
  });

  test('de echt-authoritatieve afwijzing (ingetrokken) houdt WEL permanent:true', () => {
    const ingetrokken = code.split('\n').find((r) => /status\.startsWith\('ingetrokken'\)/.test(r));
    expect(ingetrokken).toMatch(/permanent:\s*true/);   // revoke blijft hard, alleen bounce verzacht
  });
});

describe('F-RED-164 — ADMIN_REVOKE_TOKEN auto-seed (sterk token i.p.v. rate-limit)', () => {
  let n = 0;
  const realUuid = () => '1234abcd-1234-4abc-9def-' + String(++n).padStart(12, '0');  // 36 tekens
  function seedMet(store) {
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in store ? store[k] : null),
          setProperty: (k, v) => { store[k] = String(v); },
          deleteProperty: (k) => { delete store[k]; },
        }),
      },
      Utilities: { getUuid: realUuid },
    });
    ctx.zelfHerstelProductConfig_();
    return store;
  }

  test('seedt een 256-bit token wanneer ADMIN_REVOKE_TOKEN leeg is', () => {
    const store = seedMet({});
    expect(store.ADMIN_REVOKE_TOKEN).toBeDefined();
    expect(store.ADMIN_REVOKE_TOKEN.length).toBeGreaterThan(40);   // twee UUIDs
  });

  test('overschrijft een bewust gezet token NIET (alleen-indien-leeg)', () => {
    const store = seedMet({ ADMIN_REVOKE_TOKEN: 'mijn-eigen-sterke-token' });
    expect(store.ADMIN_REVOKE_TOKEN).toBe('mijn-eigen-sterke-token');
  });
});

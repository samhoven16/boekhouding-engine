/**
 * tests/unit/mega-audit-blockers.test.js
 *
 * Mega-audit 2026-06-18 — geverifieerde BLOKKERs.
 *
 *  F-TAX-130: EUVerkoop las het klant-BTW-nr uit kolom [21] ("Aangemaakt op",
 *    een Date) i.p.v. [7] → detecteerEULand_ kreeg een datum-string → ICP-
 *    opgaaf altijd leeg + OSS-drempel vuurde nooit (art. 37a Wet OB).
 *  F-RED-151: activeerEigenaarLicentie() zette een permanente 10-jaar-bypass
 *    voor ELKE gebruiker; de knop verscheen op elke klant-kopie (owner==user).
 *    Nu alleen voor ADMIN_EMAILS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('F-TAX-130 — EUVerkoop leest BTW-nr uit [7], niet [21]', () => {
  const eu = fs.readFileSync(path.resolve(__dirname, '../../src/EUVerkoop.gs'), 'utf8');
  const fn = (naam) => {
    const s = eu.indexOf('function ' + naam);
    return eu.slice(s, eu.indexOf('\nfunction ', s + 1));
  };
  test('controleerOssDrempel_ gebruikt data[i][7]', () => {
    const b = fn('controleerOssDrempel_');
    expect(b).toMatch(/btwNrKlant = String\(data\[i\]\[7\]/);
    expect(b).not.toMatch(/btwNrKlant = String\(data\[i\]\[21\]/);
  });
  test('genereerIcpRapport gebruikt data[i][7]', () => {
    const b = fn('genereerIcpRapport');
    expect(b).toMatch(/btwNrKlant = String\(data\[i\]\[7\]/);
    expect(b).not.toMatch(/btwNrKlant = String\(data\[i\]\[21\]/);
  });
});

describe('F-RED-151 — eigenaar-bypass alleen voor de beheerder', () => {
  const LICENTIE = path.resolve(__dirname, '../../src/Licentie.gs');
  function ctxMet(userEmail) {
    const store = {};
    const ctx = createGasRuntime([LICENTIE], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in store ? store[k] : null),
          setProperty: (k, v) => { store[k] = String(v); },
          deleteProperty: (k) => { delete store[k]; },
        }),
      },
      Session: { getActiveUser: () => ({ getEmail: () => userEmail }) },
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'SS-LIVE-1', toast() {} }) },
    });
    return { ctx, store };  // ADMIN_EMAILS = ['samhoven16@gmail.com'] (IIFE in Licentie.gs)
  }

  // OWNER_BYPASS_KEY-const wordt door de gas-runtime niet als ctx-property
  // geëxposeerd; gebruik de letterlijke property-naam (zoals cycle82 ook doet).
  const BYPASS_KEY = 'LICENTIE_OWNER_BYPASS';

  test('niet-admin klant → geweigerd, GEEN bypass-key gezet', () => {
    const { ctx, store } = ctxMet('klant@example.com');
    const r = ctx.activeerEigenaarLicentie();
    expect(r && r.ok).toBe(false);
    expect(store[BYPASS_KEY]).toBeUndefined();
  });

  test('admin → bypass mag, key gezet', () => {
    const { ctx, store } = ctxMet('samhoven16@gmail.com');
    ctx.activeerEigenaarLicentie();
    expect(store[BYPASS_KEY]).toBe('true');
  });

  test('activatiedialoog toont de bypass-knop alleen aan een admin (broncode)', () => {
    const src = fs.readFileSync(LICENTIE, 'utf8');
    const dlg = src.slice(src.indexOf('function toonActivatieDialog_'));
    const body = dlg.slice(0, dlg.indexOf('\nfunction '));
    expect(body).toMatch(/ADMIN_EMAILS\.indexOf\(userEmail\)/);
    expect(body).not.toMatch(/ownerEmail === userEmail/);
  });
});

/**
 * tests/unit/admin-herstuur-audit.test.js
 *
 * Pioneer-doorloop (verkoper-kant):
 *  B) "Opnieuw sturen" riep een NIET-bestaande functie aan (herstuurLicentieMail_,
 *     hoofdletter-M-typo) → knop faalde altijd. Nu via de echte stuurLicentiemail_.
 *  C) schrijfAuditLog_ bestond NIET in de licence-server → 19 aanroepen faalden
 *     stil in try/catch → lege audit-belofte. Nu gedefinieerd.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const DASHBOARD_GS = path.resolve(__dirname, '../../licence-server/AdminDashboard.gs');
const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function baseMocks(propStore, cacheStore) {
  return {
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = v; }, remove: (k) => { delete cacheStore[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in propStore ? propStore[k] : null), setProperty: (k, v) => { propStore[k] = v; }, deleteProperty: (k) => { delete propStore[k]; } }) },
    Utilities: { getUuid: () => 'tok-' + (cacheStore.__c = (cacheStore.__c || 0) + 1), computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'SHA_256' }, formatDate: () => '2026-06-24' },
  };
}

describe('B — Admin "Opnieuw sturen" roept de echte mailer aan', () => {
  test('herstuur: stuurLicentiemail_(naam, email, sleutel) + ok', () => {
    const propStore = { ADMIN_WACHTWOORD: 'geheim123' };
    const cacheStore = {};
    const mailCalls = [];
    const ctx = createGasRuntime([CODE_GS, DASHBOARD_GS], baseMocks(propStore, cacheStore));
    ctx.getLicentieSheet_ = () => ({
      getDataRange: () => ({ getValues: () => ([
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt', 'SsId', 'Aangemaakt', 'PaymentId', 'LaatsteVal', 'Onboarded', 'Verwijzer'],
        ['BKHE-AB23-CD45-EF67', 'Jan', 'jan@x.nl', 'Std', 'Actief', '', '', new Date(), 'tr_1', new Date(), '', ''],
      ]) }),
      getRange: () => ({ setValue: () => {} }),
    });
    ctx.stuurLicentiemail_ = (naam, email, sleutel) => { mailCalls.push({ naam: naam, email: email, sleutel: sleutel }); };

    const token = ctx.adminLogin('geheim123').token;
    const r = ctx.adminKlantActie(token, 'jan@x.nl', 'herstuur');
    expect(r.ok).toBe(true);
    expect(mailCalls).toEqual([{ naam: 'Jan', email: 'jan@x.nl', sleutel: 'BKHE-AB23-CD45-EF67' }]);
  });
});

describe('C — schrijfAuditLog_ schrijft echt naar de Audit Log-tab', () => {
  test('appendt [tijd, actie, details]', () => {
    const appended = [];
    const propStore = { LICENTIE_SHEET_ID: 'sheet-id' };
    const cacheStore = {};
    const mocks = baseMocks(propStore, cacheStore);
    mocks.SpreadsheetApp = {
      openById: () => ({
        getSheetByName: () => ({ appendRow: (r) => appended.push(r) }),
        insertSheet: () => ({ appendRow: (r) => appended.push(r) }),
      }),
    };
    const ctx = createGasRuntime([CODE_GS], mocks);
    ctx.schrijfAuditLog_('Test-actie', 'details-x');
    expect(appended).toHaveLength(1);
    expect(appended[0][1]).toBe('Test-actie');
    expect(appended[0][2]).toBe('details-x');
  });
});

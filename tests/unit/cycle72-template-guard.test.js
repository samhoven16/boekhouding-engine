/**
 * tests/unit/cycle72-template-guard.test.js
 *
 * Cycle 72 — "Betaalde toegang"-redding. Zonder TEMPLATE_SS_ID kan de
 * copy-link niet worden opgebouwd. De webhook mag dan NIETS provisioneren en
 * GEEN valse "link volgt binnen 24 uur"-mail sturen: hij moet throwen, zodat
 * doPost een HTTP 500 teruggeeft en Mollie de webhook later opnieuw probeert.
 *
 * Dit voorkomt de duurste bug in de trechter: klant betaalt, krijgt een mail,
 * maar nooit een werkende activatielink — en de idempotency-cache blokkeert
 * daarna élke retry.
 *
 * We testen de ECHTE verwerkMollieWebhook_ + stuurLicentiemail_ uit
 * licence-server/Code.gs (geen kopie), met gemockte Mollie-API + sheet.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const propStore = Object.assign({ MOLLIE_API_KEY: 'test_key' }, opts.props || {});
  const appendedRows = [];
  const mailCalls = [];

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          status: opts.betaalStatus || 'paid',
          // Cycle 77: webhook eist mode + bedrag. test_key → mode 'test',
          // bedrag €49 EUR. Cycle 72 test alleen de template-guard, dus
          // we leveren hier een verder valide payload.
          mode: 'test',
          amount: { value: '49.00', currency: 'EUR' },
          metadata: { naam: 'Test Klant', email: 'klant@example.nl', ref: '' },
        }),
      }),
    },
    Utilities: {
      getUuid: () => '12345678-90ab-cdef-1234-567890abcdef',
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    MailApp: { sendEmail: (...a) => mailCalls.push(a) },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { TEXT: 'text', JSON: 'json' },
    },
  });

  // Sheet-mock: registreert appendRow + levert bestaande rijen.
  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({ getValues: () => [['Sleutel', 'Naam', 'Email'], ...(opts.rows || [])] }),
    appendRow: (rij) => appendedRows.push(rij),
    getRange: () => ({ setValue: () => {} }),
  });
  ctx.borgExtraKolommen_ = () => {};

  return { ctx, appendedRows, mailCalls, cacheStore, propStore };
}

describe('CYCLE 72: TEMPLATE_SS_ID hard-guard in de webhook', () => {
  test('ZONDER template: webhook throwt, niets opgeslagen, geen klant-mail', () => {
    const { ctx, appendedRows, mailCalls, cacheStore } = maakCtx({ props: {} }); // geen TEMPLATE_SS_ID

    expect(() => ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_test123' } }))
      .toThrow(/TEMPLATE_SS_ID ontbreekt/);

    // Cruciaal: niets geprovisioneerd → schone Mollie-retry mogelijk.
    expect(appendedRows).toHaveLength(0);
    expect(cacheStore['mollie_paid_tr_test123']).toBeUndefined();
    // Geen enkele mail naar de klant (de "24 uur"-leugen is weg).
    const klantMails = mailCalls.filter((c) => JSON.stringify(c).includes('klant@example.nl'));
    expect(klantMails).toHaveLength(0);
  });

  test('doPost vertaalt de throw naar een 500 (re-throw, geen 200)', () => {
    const { ctx } = maakCtx({ props: {} });
    // doPost vangt en re-throwt → Apps Script geeft HTTP 500 → Mollie retryt.
    expect(() => ctx.doPost({ parameter: { id: 'tr_test123' }, postData: { type: 'application/x-www-form-urlencoded', contents: 'id=tr_test123' } }))
      .toThrow(/TEMPLATE_SS_ID ontbreekt/);
  });

  test('MET template: webhook provisioneert en stuurt de licentiemail', () => {
    const { ctx, appendedRows } = maakCtx({ props: { TEMPLATE_SS_ID: 'SHEET_TEMPLATE_ID' } });
    const stuurCalls = [];
    ctx.stuurLicentiemail_ = (naam, email, sleutel) => stuurCalls.push({ naam, email, sleutel });

    ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_ok456' } });

    expect(appendedRows).toHaveLength(1);
    expect(appendedRows[0][2]).toBe('klant@example.nl'); // email-kolom
    expect(stuurCalls).toHaveLength(1);
    expect(stuurCalls[0].email).toBe('klant@example.nl');
  });

  test('niet-betaalde status: geen throw, geen provisioning (guard alleen na paid)', () => {
    const { ctx, appendedRows } = maakCtx({ betaalStatus: 'open', props: {} });
    // status !== paid → return vóór de guard; geen throw, niets opgeslagen.
    expect(() => ctx.verwerkMollieWebhook_({ parameter: { id: 'tr_open789' } })).not.toThrow();
    expect(appendedRows).toHaveLength(0);
  });

  test('stuurLicentiemail_ zonder template throwt en stuurt GEEN klant-mail', () => {
    const { ctx, mailCalls } = maakCtx({ props: { VAN_EMAIL: 'sam@boekhoudbaar.nl' } });
    expect(() => ctx.stuurLicentiemail_('Test', 'klant@example.nl', 'BKHE-AAAA-BBBB-CCCC'))
      .toThrow(/TEMPLATE_SS_ID ontbreekt/);
    // Alleen de owner-alert mag eruit; nooit naar de klant.
    const naarKlant = mailCalls.filter((c) => JSON.stringify(c).includes('klant@example.nl') &&
      JSON.stringify(c).toLowerCase().includes('24 uur'));
    expect(naarKlant).toHaveLength(0);
  });

  test('de valse "24 uur"-belofte staat niet meer in de broncode', () => {
    const fs = require('fs');
    const src = fs.readFileSync(CODE_GS, 'utf8');
    expect(src).not.toMatch(/installatie-link volgt binnen 24u/);
    expect(src).not.toMatch(/copy-link binnen 24 uur volgt/);
  });
});

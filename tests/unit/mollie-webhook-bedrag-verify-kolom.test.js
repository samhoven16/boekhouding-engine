/**
 * tests/unit/mollie-webhook-bedrag-verify-kolom.test.js
 *
 * Mollie-webhook bedrag-verificatie las de VERKEERDE VERKOOPFACTUREN-kolommen:
 *   - matchte op [0] (numerieke Factuur-ID) i.p.v. [1] (opgemaakt "F000123",
 *     wat genereerMolliePaymentLink_ in de metadata zet) → nooit een match
 *     → ELKE iDEAL-betaling werd geweigerd met "factuur onbekend".
 *   - las het bedrag uit [6]/[5] (KvK-nr/klantnaam, tekst) i.p.v. [12]
 *     (Bedrag incl. BTW) → bedrag-check vergeleek onzin.
 *
 * Ratel: de happy-path (succes) faalt zónder de fix (geen match op [0]).
 * En de bedrag-check moet nu op [12] zitten, niet op de KvK-kolom.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// VERKOOPFACTUREN-rij (23 kol). [0] numerieke ID, [1] opgemaakt nummer,
// [5] klantnaam, [6] KvK (numeriek-ogende tekst), [12] incl. BTW, [13] betaald.
function vfRij({ id, nummer, klant, kvk, incl, betaald }) {
  const r = new Array(23).fill('');
  r[0] = id;
  r[1] = nummer;
  r[5] = klant;
  r[6] = kvk;
  r[12] = incl;
  r[13] = betaald;
  r[14] = 'Verzonden';
  return r;
}

function maakWebhookCtx(opts) {
  opts = opts || {};
  const cacheStore = {};
  const propStore = {};
  const vfData = [new Array(23).fill('h')].concat(opts.vfRows || []);
  const vfSheet = {
    getDataRange: () => ({ getValues: () => vfData }),
    getLastRow: () => vfData.length,
  };
  const markeerSpy = opts.markeerSpy || jest.fn(() => ({ ok: true, bericht: 'betaald' }));

  // SheetKolom.gs eerst: Mollie's verify-block leest nu via KOL.VF.* (klasse-1-migratie).
  const ctx = createGasRuntime(['SheetKolom.gs', 'Mollie.gs'], {
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
      getUserProperties: () => ({
        getProperty: (k) => (k === 'MOLLIE_API_KEY' ? 'live_test' : null),
      }),
    },
    ontsleutelString_: (s) => s,
    MOLLIE_WEBHOOK_SECRET_PROP: 'MOLLIE_WEBHOOK_SECRET',
    // Config.gs niet geladen → SHEETS-const minimaal injecteren zodat de
    // verify-block (SHEETS.VERKOOPFACTUREN) niet throwt en stil doorvalt.
    SHEETS: { VERKOOPFACTUREN: 'Verkoopfacturen' },
    // SHEETS is niet geladen (alleen Mollie.gs) → getSheetByName geeft altijd
    // de VF-mock, ongeacht de (undefined) naam-arg.
    getSpreadsheet_: () => ({ getSheetByName: () => vfSheet }),
    // Mollie API → 'paid' + metadata + bedrag
    veiligFetch_: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        status: 'paid',
        amount: { value: opts.paymentValue != null ? opts.paymentValue : '121.00' },
        metadata: { factuurnummer: opts.metaNummer || 'F000123', bron: 'boekhoudbaar' },
      }),
    }),
    markeerVerkoopfactuurBetaald: markeerSpy,
    safeAuditLog_: jest.fn(),
    __markeerSpy: markeerSpy,
  });
  return ctx;
}

describe('Mollie webhook — bedrag-verificatie op de juiste VF-kolommen', () => {
  const rij = vfRij({ id: 1, nummer: 'F000123', klant: 'Klant BV', kvk: '12345678', incl: 121.00, betaald: 0 });

  test('betaling voor F000123 à €121 → match op [1], bedrag uit [12] → succes', () => {
    const ctx = maakWebhookCtx({ vfRows: [rij], metaNummer: 'F000123', paymentValue: '121.00' });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_happy00000001' });
    expect(res.succes).toBe(true);          // ← faalde zónder fix (factuur onbekend)
    expect(res.factuurnummer).toBe('F000123');
    expect(ctx.__markeerSpy).toHaveBeenCalledWith('F000123', expect.any(String));
  });

  test('bedrag-check leest [12], niet de KvK-kolom [6]: betaling van €12345678 wordt geweigerd', () => {
    // Een betaling die toevallig gelijk is aan het KvK-nummer mag NIET slagen —
    // dat zou bewijzen dat we nog uit [6] lezen.
    const ctx = maakWebhookCtx({ vfRows: [rij], metaNummer: 'F000123', paymentValue: '12345678.00' });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_kvk000000001' });
    expect(res.succes).toBe(false);
    expect(res.fout).toMatch(/bedrag mismatch/i);
  });

  test('echte bedrag-mismatch (€99 vs €121) wordt nog steeds geweigerd', () => {
    const ctx = maakWebhookCtx({ vfRows: [rij], metaNummer: 'F000123', paymentValue: '99.00' });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_mismatch00001' });
    expect(res.succes).toBe(false);
    expect(res.fout).toMatch(/bedrag mismatch/i);
    expect(ctx.__markeerSpy).not.toHaveBeenCalled();
  });

  test('onbekend factuurnummer → nette weigering (factuur onbekend)', () => {
    const ctx = maakWebhookCtx({ vfRows: [rij], metaNummer: 'F999999', paymentValue: '121.00' });
    const res = ctx.verwerkMollieWebhook_({ id: 'tr_unknown000001' });
    expect(res.succes).toBe(false);
    expect(res.fout).toMatch(/niet gevonden/i);
  });
});

/**
 * tests/unit/dunning-dlq-idempotency.test.js
 *
 * Betalingsherinnering-idempotency bij DLQ-overdracht.
 *
 * Bug: de herinnerings-stapteller (ScriptProperty 'herinneringsStap_<fnr>') werd
 * ALLEEN opgehoogd na een geslaagde MailApp.sendEmail. Faalde de send (bv.
 * Gmail-quota), dan ging het bericht naar de DLQ voor auto-retry, maar de stap
 * bleef op de oude waarde staan. De DLQ leverde de herinnering (alsnog) af ÉN de
 * volgende dagrun zag de stap nog niet-opgehoogd → stuurde dezelfde stap opnieuw
 * → DUBBELE herinnering naar de debiteur.
 *
 * Fix: zodra de herinnering aan de DLQ is overgedragen (gegarandeerde retry),
 * markeren we de stap als verzonden. Alleen als de DLQ-overdracht zélf lukte —
 * anders is er geen vangnet en moet de dagrun het morgen opnieuw proberen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// KOL.VF (SheetKolom.gs): factuurnummer 1, vervaldatum 3, klantId 4, klantnaam 5,
// bedragIncl 12, betaaldBedrag 13, status 14, pdfUrl 19.
function ssMetOverdueFactuur(dagenOver) {
  const verval = new Date(Date.now() - dagenOver * 86400000);
  const row = new Array(20).fill('');
  row[1] = 'F001';
  row[3] = verval;
  row[4] = 'K001';
  row[5] = 'Klant A';
  row[12] = 100;       // bedragIncl
  row[13] = 0;         // betaaldBedrag
  row[14] = 'Verzonden';
  row[19] = '';        // geen pdfUrl → geen attachment-fetch
  const data = [new Array(20).fill('h'), row];
  const sheet = { getLastRow: () => data.length, getDataRange: () => ({ getValues: () => data }) };
  return { getSheetByName: () => sheet };
}

function maakCtx({ sendThrows, dlqThrows }) {
  const store = {};
  const dlqCalls = [];
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs', 'Triggers.gs'], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getKeys: () => Object.keys(store),
      }),
    },
    MailApp: {
      getRemainingDailyQuota: () => 100,
      sendEmail: () => { if (sendThrows) throw new Error('quota op'); },
    },
  });
  // Post-load overrides: deze functies zijn in de .gs-files gedefinieerd en
  // shadowen een pre-load mock, dus na het laden op de ctx zetten.
  ctx.bouwRelatieEmailMap_ = () => ({ K001: 'debiteur@example.com' });
  ctx.getInstelling_ = (k) => (k === 'Bedrijfsnaam' ? 'Test BV' : '');
  ctx.safeAuditLog_ = () => {};
  ctx.guillotineCheck_ = () => false;
  ctx.dlqVoegToe_ = (type, payload, fout) => {
    if (dlqThrows) throw new Error('dlq down');
    dlqCalls.push({ type, payload, fout });
  };
  return { ctx, store, dlqCalls };
}

describe('Dunning idempotency — DLQ-overdracht markeert de stap als verzonden', () => {
  test('send faalt → DLQ-enqueue lukt → stapKey=1 (geen dubbele herinnering volgende dagrun)', () => {
    const { ctx, store, dlqCalls } = maakCtx({ sendThrows: true, dlqThrows: false });
    ctx.stuurAutomatischeBetalingsherinneringen_(ssMetOverdueFactuur(4));
    expect(dlqCalls).toHaveLength(1);
    expect(dlqCalls[0].type).toBe('EMAIL_HERINNERING');
    // Kern van de fix: stap is opgehoogd ondanks de mislukte directe send.
    expect(store['herinneringsStap_F001']).toBe('1');
  });

  test('send faalt → DLQ-enqueue faalt óók → stapKey blijft leeg (geen vangnet → morgen opnieuw)', () => {
    const { ctx, store } = maakCtx({ sendThrows: true, dlqThrows: true });
    ctx.stuurAutomatischeBetalingsherinneringen_(ssMetOverdueFactuur(4));
    // Zonder DLQ-vangnet NIET markeren — anders zou de herinnering definitief
    // verloren gaan zonder dat hij ooit verstuurd is.
    expect(store['herinneringsStap_F001']).toBeUndefined();
  });

  test('send lukt direct → stapKey=1, geen DLQ (regressie: bestaand happy-path)', () => {
    const { ctx, store, dlqCalls } = maakCtx({ sendThrows: false, dlqThrows: false });
    ctx.stuurAutomatischeBetalingsherinneringen_(ssMetOverdueFactuur(4));
    expect(dlqCalls).toHaveLength(0);
    expect(store['herinneringsStap_F001']).toBe('1');
  });
});

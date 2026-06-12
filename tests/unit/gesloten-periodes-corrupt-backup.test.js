/**
 * tests/unit/gesloten-periodes-corrupt-backup.test.js
 *
 * A4 — _leesGeslotenPeriodes_ deed bij corrupt JSON deleteProperty(
 * 'GESLOTEN_PERIODES') → I₈ (afgesloten-periode-immutability) tijdelijk
 * weg → klant kon stilletjes in afgesloten jaar boeken. Geen forensisch
 * spoor om de lock-staat later te herstellen.
 *
 * Fix: backup-vóór-delete naar GESLOTEN_PERIODES_CORRUPT_<ts> + audit-log
 * + owner-alert. Self-heal valt nog steeds open (business mag niet
 * stilvallen) maar het gat is zichtbaar én herstelbaar.
 *
 * Audit 2026-06-12.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(initieleValue) {
  const store = initieleValue !== undefined ? { GESLOTEN_PERIODES: initieleValue } : {};
  const ouderMails = [];
  const auditCalls = [];

  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs'], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getProperties: () => Object.assign({}, store),
      }),
    },
  });
  ctx.schrijfAuditLog_ = (actie, detail) => auditCalls.push([actie, detail]);
  ctx.meldFataalAanOwner_ = (code, msg, ctxObj) => ouderMails.push([code, msg, ctxObj]);
  return { ctx, store, ouderMails, auditCalls };
}

describe('A4: _leesGeslotenPeriodes_ — corrupt JSON wordt geback-upt vóór delete', () => {
  test('Geldig JSON-array → onveranderd door, geen backup, geen alert', () => {
    const v = JSON.stringify([{ jaar: 2025, kwartaal: 4 }]);
    const { ctx, store, ouderMails, auditCalls } = maakCtx(v);
    const r = ctx._leesGeslotenPeriodes_();
    expect(r).toEqual([{ jaar: 2025, kwartaal: 4 }]);
    expect(store.GESLOTEN_PERIODES).toBe(v);
    expect(Object.keys(store).filter((k) => k.startsWith('GESLOTEN_PERIODES_CORRUPT_'))).toHaveLength(0);
    expect(ouderMails).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  test('Geen property gezet → lege array, geen schade', () => {
    const { ctx, ouderMails } = maakCtx();
    expect(ctx._leesGeslotenPeriodes_()).toEqual([]);
    expect(ouderMails).toHaveLength(0);
  });

  test('Corrupt JSON → BACKUP naar GESLOTEN_PERIODES_CORRUPT_<ts> + owner-alert + audit', () => {
    const corrupte = '[{"jaar":2025,"kw'; // half-geschreven
    const { ctx, store, ouderMails, auditCalls } = maakCtx(corrupte);

    const r = ctx._leesGeslotenPeriodes_();
    expect(r).toEqual([]); // self-heal valt open

    // Backup-key bestaat en bevat de exact corrupte waarde
    const backupKeys = Object.keys(store).filter((k) => k.startsWith('GESLOTEN_PERIODES_CORRUPT_'));
    expect(backupKeys).toHaveLength(1);
    expect(store[backupKeys[0]]).toBe(corrupte);

    // Originele key is verwijderd (alleen ná succesvolle backup)
    expect(store.GESLOTEN_PERIODES).toBeUndefined();

    // Owner is gealarmeerd met backupKey in context
    expect(ouderMails).toHaveLength(1);
    expect(ouderMails[0][0]).toBe('GESLOTEN_PERIODES_CORRUPT');
    expect(ouderMails[0][2].backupKey).toBe(backupKeys[0]);
    expect(ouderMails[0][2].backupOk).toBe(true);

    // Audit-log bevat backupKey en handleidingstekst
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0][0]).toBe('GESLOTEN_PERIODES CORRUPT');
    expect(auditCalls[0][1]).toMatch(backupKeys[0]);
    expect(auditCalls[0][1]).toMatch(/reconstructie/i);
  });

  test('Geen-array JSON (bv. object) → behandeld als lege lijst, geen backup', () => {
    // Het oude gedrag voor non-array geldige JSON: gewoon [] — niet als
    // "corrupt" beschouwen. Verifieer dat we daar GEEN backup-spam doen.
    const { ctx, store, ouderMails } = maakCtx('{"jaar":2025}');
    expect(ctx._leesGeslotenPeriodes_()).toEqual([]);
    expect(Object.keys(store).filter((k) => k.startsWith('GESLOTEN_PERIODES_CORRUPT_'))).toHaveLength(0);
    expect(ouderMails).toHaveLength(0);
  });
});

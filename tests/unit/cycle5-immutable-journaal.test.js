/**
 * tests/unit/cycle5-immutable-journaal.test.js
 *
 * Axiom 5 — immutable na commit. In bound-script kan sheet-protection
 * klant (= eigenaar) niet hard blokkeren. Daarom: detectie via onEdit +
 * audit-log met severity + toast + owner-alert.
 *
 * Test schrijfAuditEdit_ met mock e-object voor JOURNAALPOSTEN-edits.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 5: schrijfAuditEdit_ markeert kritieke JOURNAALPOSTEN-edits', () => {
  function maakCtx() {
    const auditRijen = [];
    const toastCalls = [];
    const fataalCalls = [];

    const ctx = createGasRuntime(
      ['Config.gs', 'Utils.gs', 'Triggers.gs'],
      {}
    );
    const auditSheet = {
      appendRow: (rij) => auditRijen.push(rij),
      getLastRow: () => 1 + auditRijen.length,
      getRange: () => ({ getValues: () => [] }),
    };
    ctx._mockSs = {
      getSheetByName: (n) => (n === 'Audit Log' ? auditSheet : null),
      toast: (msg, title, sec) => toastCalls.push({ msg, title, sec }),
    };
    ctx.meldFataalAanOwner_ = (type, msg, ctx_) => fataalCalls.push({ type, msg, ctx_ });
    ctx._trimAuditLog_ = () => {};
    return { ctx, auditRijen, toastCalls, fataalCalls };
  }

  function maakEvent(sheetNaam, a1, oud, nieuw) {
    return {
      range: {
        getSheet: () => ({ getName: () => sheetNaam }),
        getA1Notation: () => a1,
      },
      source: null,  // ingevuld per test
      oldValue: oud,
      value: nieuw,
    };
  }

  test('Edit op JOURNAALPOSTEN kolom I (Bedrag) → KRITIEKE severity + toast + owner-alert', () => {
    const { ctx, auditRijen, toastCalls, fataalCalls } = maakCtx();
    const e = maakEvent('Journaalposten', 'I42', '100', '999');
    e.source = ctx._mockSs;
    ctx.schrijfAuditEdit_(e);
    expect(auditRijen.length).toBe(1);
    expect(auditRijen[0][6]).toBe('KRITIEKE-JOURNAALPOST-WIJZIGING');
    expect(toastCalls.length).toBe(1);
    expect(toastCalls[0].title).toMatch(/Kritieke/);
    expect(fataalCalls.length).toBe(1);
    expect(fataalCalls[0].type).toBe('JOURNAALPOST_MUTATIE');
  });

  test('Edit op JOURNAALPOSTEN kolom E (Debet rekening) → KRITIEK', () => {
    const { ctx, auditRijen, toastCalls } = maakCtx();
    const e = maakEvent('Journaalposten', 'E10', '1100', '8000');
    e.source = ctx._mockSs;
    ctx.schrijfAuditEdit_(e);
    expect(auditRijen[0][6]).toBe('KRITIEKE-JOURNAALPOST-WIJZIGING');
    expect(toastCalls.length).toBe(1);
  });

  test('Edit op JOURNAALPOSTEN kolom B/G/J/K (datum/credit/btw%/btw bedrag) → KRITIEK', () => {
    ['B5', 'G7', 'J9', 'K11'].forEach((a1) => {
      const { ctx, auditRijen } = maakCtx();
      const e = maakEvent('Journaalposten', a1, 'x', 'y');
      e.source = ctx._mockSs;
      ctx.schrijfAuditEdit_(e);
      expect(auditRijen[0][6]).toBe('KRITIEKE-JOURNAALPOST-WIJZIGING');
    });
  });

  test('Edit op JOURNAALPOSTEN kolom C (Omschrijving) → niet-kritiek, gewone cell-edit', () => {
    const { ctx, auditRijen, toastCalls, fataalCalls } = maakCtx();
    const e = maakEvent('Journaalposten', 'C5', 'oud', 'nieuw');
    e.source = ctx._mockSs;
    ctx.schrijfAuditEdit_(e);
    expect(auditRijen[0][6]).toBe('cell-edit');
    expect(toastCalls.length).toBe(0);
    expect(fataalCalls.length).toBe(0);
  });

  test('Edit op andere watch-sheet (Verkoopfacturen) → niet-kritiek', () => {
    const { ctx, auditRijen, toastCalls } = maakCtx();
    const e = maakEvent('Verkoopfacturen', 'I5', '100', '200');
    e.source = ctx._mockSs;
    ctx.schrijfAuditEdit_(e);
    expect(auditRijen[0][6]).toBe('cell-edit');
    expect(toastCalls.length).toBe(0);
  });

  test('Geen wijziging (oud === nieuw) → geen audit', () => {
    const { ctx, auditRijen } = maakCtx();
    const e = maakEvent('Journaalposten', 'I5', '100', '100');
    e.source = ctx._mockSs;
    ctx.schrijfAuditEdit_(e);
    expect(auditRijen.length).toBe(0);
  });
});

/**
 * tests/unit/grootboek-saldo-cache.test.js
 *
 * updateGrootboekSaldo_ las voorheen de HELE GROOTBOEKSCHEMA-sheet per call
 * om één rij te vinden. maakJournaalpost_ doet 2 calls per boeking; de
 * herhalende-kosten-inhaal tot 36 boekingen per regel → honderden
 * full-sheet-reads per trigger-run (6-min-timeoutrisico).
 *
 * Nu: executie-scoped rij-cache (_gbVindRij_), saldo wordt nog steeds VERS
 * gelezen onder de lock. Deze test borgt:
 *   (a) de dubbel-boekhouden-wiskunde is ONGEWIJZIGD voor alle 4 types
 *   (b) de codes-kolom wordt maar één keer gelezen over meerdere calls
 *   (c) onbekende rekening → audit-pad, geen crash, geen write
 *   (d) rekening toegevoegd ná cache-opbouw wordt via rebuild gevonden
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakGbSheet(rows) {
  const data = [['Code', 'Naam', 'Type', 'c3', 'c4', 'Saldo']].concat(rows);
  let kolomReads = 0;
  const sheet = {
    getSheetId: () => 42,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        if (c === 1 && (nc || 1) === 1 && (nr || 1) > 1) kolomReads++;
        const out = [];
        for (let i = 0; i < (nr || 1); i++) {
          const rij = [];
          for (let j = 0; j < (nc || 1); j++) rij.push(data[r - 1 + i] ? data[r - 1 + i][c - 1 + j] : '');
          out.push(rij);
        }
        return out;
      },
      setValue: (v) => { data[r - 1][c - 1] = v; },
    }),
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
  };
  return { sheet, data, kolomReads: () => kolomReads };
}

function maakCtx(gb) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs', 'Boekingen.gs'], {
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  });
  const ss = { getSheetByName: (n) => (n === 'Grootboekschema' ? gb.sheet : null) };
  return { ctx, ss };
}

describe('updateGrootboekSaldo_ — rij-cache met verse saldo-read', () => {
  test('dubbel-boekhouden-wiskunde ongewijzigd voor alle 4 types', () => {
    const gb = maakGbSheet([
      ['1000', 'Bank', 'Actief', '', '', 100],
      ['2000', 'Crediteuren', 'Passief', '', '', 100],
      ['4000', 'Huur', 'Kosten', '', '', 100],
      ['8000', 'Omzet', 'Opbrengst', '', '', 100],
    ]);
    const { ctx, ss } = maakCtx(gb);
    ctx.updateGrootboekSaldo_(ss, '1000', 10, 'debet');   // Actief  debet  → +
    ctx.updateGrootboekSaldo_(ss, '1000', 4, 'credit');   // Actief  credit → −
    ctx.updateGrootboekSaldo_(ss, '2000', 10, 'credit');  // Passief credit → +
    ctx.updateGrootboekSaldo_(ss, '4000', 10, 'debet');   // Kosten  debet  → +
    ctx.updateGrootboekSaldo_(ss, '8000', 10, 'debet');   // Opbrengst debet → −
    expect(gb.data[1][5]).toBe(106);
    expect(gb.data[2][5]).toBe(110);
    expect(gb.data[3][5]).toBe(110);
    expect(gb.data[4][5]).toBe(90);
  });

  test('codes-kolom wordt PRECIES één keer gelezen over meerdere calls (de cache)', () => {
    const gb = maakGbSheet([
      ['1000', 'Bank', 'Actief', '', '', 0],
      ['8000', 'Omzet', 'Opbrengst', '', '', 0],
    ]);
    const { ctx, ss } = maakCtx(gb);
    for (let i = 0; i < 10; i++) {
      ctx.updateGrootboekSaldo_(ss, '1000', 1, 'debet');
      ctx.updateGrootboekSaldo_(ss, '8000', 1, 'credit');
    }
    expect(gb.kolomReads()).toBe(1);
    expect(gb.data[1][5]).toBe(10);
    expect(gb.data[2][5]).toBe(10);
  });

  test('saldo wordt VERS gelezen per call — externe wijziging gaat niet verloren', () => {
    const gb = maakGbSheet([['1000', 'Bank', 'Actief', '', '', 0]]);
    const { ctx, ss } = maakCtx(gb);
    ctx.updateGrootboekSaldo_(ss, '1000', 5, 'debet');
    gb.data[1][5] = 1000; // andere executie schreef tussendoor
    ctx.updateGrootboekSaldo_(ss, '1000', 5, 'debet');
    expect(gb.data[1][5]).toBe(1005); // niet 10 — verse read wint
  });

  test('onbekende rekening → audit-pad, geen write, geen crash', () => {
    const gb = maakGbSheet([['1000', 'Bank', 'Actief', '', '', 50]]);
    const { ctx, ss } = maakCtx(gb);
    const auditCalls = [];
    ctx.schrijfAuditLog_ = (actie, detail) => auditCalls.push([actie, detail]);
    expect(() => ctx.updateGrootboekSaldo_(ss, '9999', 10, 'debet')).not.toThrow();
    expect(gb.data[1][5]).toBe(50);
    expect(auditCalls.some(([a]) => /GROOTBOEK ONBEKEND/i.test(a))).toBe(true);
  });

  test('rekening toegevoegd ná cache-opbouw wordt via rebuild gevonden', () => {
    const gb = maakGbSheet([['1000', 'Bank', 'Actief', '', '', 0]]);
    const { ctx, ss } = maakCtx(gb);
    ctx.updateGrootboekSaldo_(ss, '1000', 1, 'debet'); // cache opgebouwd
    gb.data.push(['1300', 'Debiteuren', 'Actief', '', '', 0]); // setup voegt rekening toe
    ctx.updateGrootboekSaldo_(ss, '1300', 7, 'debet');
    expect(gb.data[2][5]).toBe(7);
  });
});

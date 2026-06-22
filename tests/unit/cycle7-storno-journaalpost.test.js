/**
 * tests/unit/cycle7-storno-journaalpost.test.js
 *
 * Axiom 5 — corrections via storno. maakStornoJournaalpost_ neemt een
 * origineel boekingId en maakt een NIEUWE inverse journaalpost. Origineel
 * blijft staan (immutable). Saldi worden teruggedraaid.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 7: maakStornoJournaalpost_', () => {
  function maakCtx(jpRows) {
    const rows = jpRows || [];
    const HEADER = new Array(20).fill('');
    const all = [HEADER, ...rows];
    const appendCalls = [];
    const jpSheet = {
      appendRow: (rij) => { appendCalls.push(rij); all.push(rij); },
      getLastRow: () => all.length,
      getRange: () => ({ setValue: () => {}, getValue: () => '' }),
      getDataRange: () => ({ getValues: () => all }),
    };
    const ctx = createGasRuntime(
      ['Config.gs', 'Utils.gs', 'Invariants.gs', 'Boekingen.gs'],
      {}
    );
    ctx._mockSs = { getSheetByName: (n) => (n === 'Journaalposten' ? jpSheet : null) };
    // Vervang volgendBoekingId_ deterministisch
    let counter = 100;
    ctx.volgendBoekingId_ = () => 'BK' + String(counter++).padStart(6, '0');
    ctx.updateGrootboekSaldo_ = jest.fn();
    ctx.schrijfAuditLog_ = jest.fn();
    ctx.noodLog_ = jest.fn();
    ctx.meldFataalAanOwner_ = jest.fn();
    return { ctx, appendCalls };
  }

  // Maakt een journaalpost-rij volgens JOURNAALPOSTEN-schema
  function jpRij(boekingId, datum, omschr, debetRek, creditRek, bedrag, ref) {
    const r = new Array(20).fill('');
    r[0] = boekingId; r[1] = datum; r[2] = omschr;
    r[3] = 'Memoriaal';
    r[4] = debetRek; r[6] = creditRek; r[8] = bedrag; r[11] = ref || '';
    return r;
  }

  test('Geldige storno: inverse boeking met debet/credit gewisseld', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 100, 'IK001');
    const { ctx, appendCalls } = maakCtx([orig]);
    const stornoId = ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Correctie verkeerde categorie');
    expect(stornoId).toMatch(/^BK/);
    expect(appendCalls.length).toBe(1);
    const stornoRij = appendCalls[0];
    expect(stornoRij[4]).toBe('1200');  // origineel-credit nu debet
    expect(stornoRij[6]).toBe('7990');  // origineel-debet nu credit
    expect(stornoRij[8]).toBe(100);     // zelfde bedrag
    expect(stornoRij[2]).toMatch(/STORNO BK000007/);
    expect(stornoRij[2]).toMatch(/Correctie/);
  });

  test('Saldi worden teruggedraaid via updateGrootboekSaldo_', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 100, '');
    const { ctx } = maakCtx([orig]);
    ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Correctie');
    // updateGrootboekSaldo_ aangeroepen met '1200' debet + '7990' credit
    const calls = ctx.updateGrootboekSaldo_.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls.map((c) => c.slice(1))).toEqual(expect.arrayContaining([
      ['1200', 100, 'debet'],
      ['7990', 100, 'credit'],
    ]));
  });

  test('Storno is preGevalideerd (geen HITL nodig)', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 100, '');
    const { ctx, appendCalls } = maakCtx([orig]);
    ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Correctie typo');
    const stornoRij = appendCalls[0];
    // Kolom Q (index 16) = Status, moet 'Gevalideerd' zijn
    expect(stornoRij[16]).toBe('Gevalideerd');
  });

  test('Reden < 5 tekens → throw', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'T', '7990', '1200', 100, '');
    const { ctx } = maakCtx([orig]);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'fout'))
      .toThrow(/reden is verplicht/i);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', ''))
      .toThrow(/reden is verplicht/i);
  });

  test('Niet-bestaand boekingId → throw met duidelijke melding', () => {
    const { ctx } = maakCtx([]);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK999999', 'Test correctie'))
      .toThrow(/niet gevonden/);
  });

  test('Dubbele storno → throw (anders zou origineel weer effectief worden)', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 100, '');
    const eerdereStorno = jpRij('BK000010', new Date('2026-02-16'),
      'STORNO BK000007 (origineel 2026-02-15): typo', '1200', '7990', 100, '');
    const { ctx } = maakCtx([orig, eerdereStorno]);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Nogmaals storneren'))
      .toThrow(/al eerder gestorneerd/i);
  });

  test('Audit-log entry geschreven met origineel+storno IDs', () => {
    const orig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 100, '');
    const { ctx } = maakCtx([orig]);
    const stornoId = ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Correctie reden');
    const auditCalls = ctx.schrijfAuditLog_.mock.calls;
    const stornoAudit = auditCalls.find((c) => c[0] === 'STORNO geboekt');
    expect(stornoAudit).toBeTruthy();
    expect(stornoAudit[1]).toMatch(stornoId);
    expect(stornoAudit[1]).toMatch('BK000007');
  });

  test('Lege boekingId → throw', () => {
    const { ctx } = maakCtx([]);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, '', 'Test correctie reden'))
      .toThrow(/origineel boekingId/i);
  });

  test('Origineel met bedrag ≤ 0 → throw (corrupte data, niet storneerbaar)', () => {
    const corruptOrig = jpRij('BK000007', new Date('2026-02-15'), 'Test', '7990', '1200', 0, '');
    const { ctx } = maakCtx([corruptOrig]);
    expect(() => ctx.maakStornoJournaalpost_(ctx._mockSs, 'BK000007', 'Test correctie reden'))
      .toThrow(/bedrag ongeldig/i);
  });
});

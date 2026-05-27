/**
 * tests/unit/cycle2-atomic-journaalpost.test.js
 *
 * Axiom 9 (atomair). maakJournaalpost_ doet 3 separate sheet-writes:
 *   1. appendRow (journaalpost)
 *   2. updateGrootboekSaldo_(debet)
 *   3. updateGrootboekSaldo_(credit)
 *
 * Echte atomic = onmogelijk over 3 sheets zonder externe transactie-store.
 * Best haalbare: compensating action. Als (3) faalt na (2) gelukt: keer (2)
 * om. Bij volledige fail: markeer rij CORRUPT zodat rapportages 'm skippen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 2: maakJournaalpost_ atomic-via-compensating-action', () => {
  function maakCtx(opts) {
    opts = opts || {};
    const appendCalls = [];
    const saldoCalls = [];
    const setValueCalls = [];

    const ctx = createGasRuntime(
      ['Config.gs', 'Utils.gs', 'Invariants.gs', 'Boekingen.gs'],
      {}
    );

    // Mock minimaal: journaalpost-sheet + grootboek-saldo-update
    const jpSheet = {
      appendRow: (rij) => {
        appendCalls.push(rij);
        if (opts.appendGooit) throw new Error(opts.appendGooit);
      },
      getLastRow: () => appendCalls.length + 1,
      getRange: () => ({
        setValue: (v) => setValueCalls.push(v),
      }),
    };
    ctx._mockSs = {
      getSheetByName: (n) => (n === 'Journaalposten' ? jpSheet : null),
    };

    // Override updateGrootboekSaldo_ om controleerbaar te zijn
    let callCount = 0;
    ctx.updateGrootboekSaldo_ = (ss, rek, bedrag, zijde) => {
      callCount++;
      saldoCalls.push({ rek, bedrag, zijde });
      if (opts.creditGooit && callCount === 2) {
        throw new Error(opts.creditGooit);
      }
      if (opts.rollbackGooit && callCount === 3) {
        throw new Error(opts.rollbackGooit);
      }
    };
    ctx.volgendBoekingId_ = () => 'BK000001';
    ctx.valideerInvariantsVoorJournaalpost_ = () => {};
    ctx.schrijfAuditLog_ = jest.fn();
    ctx.noodLog_ = jest.fn();
    ctx.meldFataalAanOwner_ = jest.fn();

    return { ctx, appendCalls, saldoCalls, setValueCalls };
  }

  function geldigeOpt() {
    return { datum: new Date('2026-03-15'), omschr: 'Test', dagboek: 'Memoriaal',
      debet: '7990', credit: '1200', bedrag: 100 };
  }

  test('Happy path: appendRow + debet + credit, geen rollback', () => {
    const { ctx, appendCalls, saldoCalls, setValueCalls } = maakCtx();
    ctx.maakJournaalpost_(ctx._mockSs, geldigeOpt());
    expect(appendCalls.length).toBe(1);
    expect(saldoCalls.length).toBe(2);
    expect(saldoCalls[0]).toEqual({ rek: '7990', bedrag: 100, zijde: 'debet' });
    expect(saldoCalls[1]).toEqual({ rek: '1200', bedrag: 100, zijde: 'credit' });
    expect(setValueCalls.length).toBe(0);  // geen CORRUPT-markering
  });

  test('Credit-saldo gooit → debet wordt teruggedraaid (compensating action)', () => {
    const { ctx, saldoCalls } = maakCtx({ creditGooit: 'sheet locked' });
    expect(() => ctx.maakJournaalpost_(ctx._mockSs, geldigeOpt())).toThrow(/sheet locked/);
    expect(saldoCalls.length).toBe(3);
    // Eerste call: debet '7990' debet
    expect(saldoCalls[0]).toEqual({ rek: '7990', bedrag: 100, zijde: 'debet' });
    // Tweede call: credit '1200' credit — die gooit
    expect(saldoCalls[1]).toEqual({ rek: '1200', bedrag: 100, zijde: 'credit' });
    // Derde call: ROLLBACK van debet (zelfde rekening, omgekeerde zijde)
    expect(saldoCalls[2]).toEqual({ rek: '7990', bedrag: 100, zijde: 'credit' });
    expect(ctx.schrijfAuditLog_).toHaveBeenCalledWith(
      expect.stringMatching(/ATOMIC ROLLBACK/), expect.any(String));
  });

  test('Credit + rollback beide gooien → CORRUPT-markering + owner-alert', () => {
    const { ctx, setValueCalls } = maakCtx({
      creditGooit: 'credit down',
      rollbackGooit: 'rollback down',
    });
    expect(() => ctx.maakJournaalpost_(ctx._mockSs, geldigeOpt())).toThrow(/credit down/);
    // Journaalpost-rij krijgt CORRUPT-status in kolom Q (17)
    expect(setValueCalls).toContain('CORRUPT');
    expect(ctx.noodLog_).toHaveBeenCalledWith(
      'SALDO_CORRUPT', expect.stringMatching(/credit down.*rollback down/));
    expect(ctx.meldFataalAanOwner_).toHaveBeenCalledWith(
      'SALDO_CORRUPT', expect.any(String), expect.objectContaining({
        boekingId: 'BK000001',
        debet: '7990', credit: '1200',
      }));
  });

  test('Debet-saldo gooit als EERSTE → geen rollback nodig (niets uit te keren)', () => {
    const { ctx, saldoCalls } = maakCtx();
    // Sabotage debet-update direct
    ctx.updateGrootboekSaldo_ = jest.fn(() => { throw new Error('debet down'); });
    expect(() => ctx.maakJournaalpost_(ctx._mockSs, geldigeOpt())).toThrow(/debet down/);
    expect(ctx.updateGrootboekSaldo_).toHaveBeenCalledTimes(1);
    // Geen CORRUPT-markering — debet was nog niet doorgevoerd
    expect(ctx.schrijfAuditLog_).not.toHaveBeenCalledWith(
      expect.stringMatching(/ROLLBACK/), expect.any(String));
  });
});

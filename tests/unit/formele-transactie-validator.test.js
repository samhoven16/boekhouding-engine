/**
 * tests/unit/formele-transactie-validator.test.js
 *
 * Issue #123 — P0 accounting core invariant audit, batch 1+2.
 * Elke test hieronder is één acceptatiecriterium uit het issue, letterlijk:
 *
 *   "0.01 imbalance cannot commit."
 *   "Unknown account fails clearly."
 *   "Closed period fails clearly."
 *   "Single-sided bookings are rejected."
 *   "Tests prove these rules."
 *
 * Kern-principe (de quant-regel): alle balansvergelijkingen in GEHELE
 * centen. Geen float-epsilon in de boekhoudkern.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakGbSheet(codes) {
  const data = [['Code', 'Naam', 'Type', 'Cat', 'BW', 'Saldo']]
    .concat(codes.map((c) => [c, 'Rek ' + c, 'Actief', '', 'Balans', 0]));
  return {
    getSheetId: () => 7,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nr || 1); i++) {
          const rij = [];
          for (let j = 0; j < (nc || 1); j++) rij.push(data[r - 1 + i] ? data[r - 1 + i][c - 1 + j] : '');
          out.push(rij);
        }
        return out;
      },
      setValue: () => {},
    }),
    getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
  };
}

function maakCtx(opts) {
  opts = opts || {};
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs', 'Boekingen.gs'], {
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  });
  const gb = opts.geenSchema ? null : maakGbSheet(opts.codes || ['1200', '8000', '4000']);
  const appendCalls = [];
  const jp = {
    appendRow: (rij) => appendCalls.push(rij),
    getLastRow: () => appendCalls.length + 1,
    getRange: () => ({ setValue: () => {}, setNote: () => {} }),
  };
  const ss = {
    getSheetByName: (n) => {
      if (n === 'Grootboekschema') return gb;
      if (n === 'Journaalposten') return jp;
      return null;
    },
  };
  if (opts.jaarAfgesloten) ctx.jaarAlAfgesloten_ = (s, jaar) => jaar === opts.jaarAfgesloten;
  ctx.schrijfAuditLog_ = () => {};
  return { ctx, ss, appendCalls };
}

describe('Issue #123 acceptatie — naarCenten_ (integer-centen-fundament)', () => {
  test('exacte bedragen → integer centen, ook float-ruis zoals 10.10', () => {
    const { ctx } = maakCtx();
    expect(ctx.naarCenten_(10.1)).toBe(1010);
    expect(ctx.naarCenten_('0.01')).toBe(1);
    expect(ctx.naarCenten_(21474836.47)).toBe(2147483647); // > 32-bit grens? nee: exact
  });

  test('bedrag dat niet op de cent valt → geweigerd', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.naarCenten_(10.005)).toThrow(/cent/i);
    expect(() => ctx.naarCenten_('abc')).toThrow(/geen getal/i);
  });
});

describe('Issue #123 acceptatie — valideerTransactieFormeel_', () => {
  test('"0.01 imbalance cannot commit" — 1 cent onbalans → geweigerd', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 10000, creditCents: 0 },
      { rekening: '8000', debetCents: 0, creditCents: 9999 },
    ])).toThrow(/niet in balans.*0\.01/s);
  });

  test('"Single-sided bookings are rejected" — één regel → geweigerd', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 10000, creditCents: 0 },
    ])).toThrow(/debet- én een creditregel/i);
  });

  test('regel die op beide zijden boekt → geweigerd', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 50, creditCents: 50 },
      { rekening: '8000', debetCents: 0, creditCents: 0 },
    ])).toThrow(/precies één zijde/i);
  });

  test('niet-gehele centen in een regel → geweigerd (geen float in de kern)', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 100.5, creditCents: 0 },
      { rekening: '8000', debetCents: 0, creditCents: 100.5 },
    ])).toThrow(/geheel aantal centen/i);
  });

  test('"Unknown account fails clearly" — rekening niet in schema → heldere fout', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '9999', debetCents: 100, creditCents: 0 },
      { rekening: '8000', debetCents: 0, creditCents: 100 },
    ])).toThrow(/9999.*bestaat niet.*NIET uitgevoerd/s);
  });

  test('"Closed period fails clearly" — datum in afgesloten jaar → geweigerd', () => {
    const { ctx, ss } = maakCtx({ jaarAfgesloten: 2025 });
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 100, creditCents: 0 },
      { rekening: '8000', debetCents: 0, creditCents: 100 },
    ], new Date(2025, 5, 15))).toThrow(/2025.*afgesloten/s);
  });

  test('gebalanceerde multi-regel transactie (toekomstige JOURNAL_MUTATIES-vorm) → OK', () => {
    const { ctx, ss } = maakCtx();
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '1200', debetCents: 12100, creditCents: 0 },
      { rekening: '8000', debetCents: 0, creditCents: 10000 },
      { rekening: '4000', debetCents: 0, creditCents: 2100 },
    ])).not.toThrow();
  });

  test('GROOTBOEKSCHEMA-tabblad afwezig → rekening-check overgeslagen (setup/test-omgeving)', () => {
    const { ctx, ss } = maakCtx({ geenSchema: true });
    expect(() => ctx.valideerTransactieFormeel_(ss, [
      { rekening: '9999', debetCents: 100, creditCents: 0 },
      { rekening: '8888', debetCents: 0, creditCents: 100 },
    ])).not.toThrow();
  });
});

describe('Issue #123 integratie — maakJournaalpost_ weigert vóór de write', () => {
  test('onbekende rekening → GEEN journaal-rij (geen zwevende boeking meer)', () => {
    const { ctx, ss, appendCalls } = maakCtx();
    expect(() => ctx.maakJournaalpost_(ss, {
      datum: new Date(), omschr: 'test', debet: '9999', credit: '8000', bedrag: 100,
    })).toThrow(/9999/);
    expect(appendCalls.length).toBe(0); // de kern van de fix: niets geschreven
  });

  test('geldige boeking op bestaande rekeningen → journaal-rij geschreven', () => {
    const { ctx, ss, appendCalls } = maakCtx();
    ctx.maakJournaalpost_(ss, {
      datum: new Date(), omschr: 'test', debet: '1200', credit: '8000', bedrag: 100,
    });
    expect(appendCalls.length).toBe(1);
  });
});

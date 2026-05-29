/**
 * tests/unit/cycle33-prive-input-validate.test.js
 *
 * Cycle 33 — opslaanPriveTransactie had cycle-21's bug op privé-pad:
 *   - parseFloat verloor NL-formaat komma ("12,50" → 12 ipv 12.50)
 *   - data.datum 'garbage' werd silent als Invalid Date in sheet
 *     geschreven → klant zag '#NUM!' bij next open
 *
 * Verwerkt zelfde fix als cycle 21 (HerhalendeKosten).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  const appended = [];
  const noopRange = {};
  const chainMethods = ['setNumberFormat','setFontColor','setValue','setValues','setFontWeight','setBackground','setHorizontalAlignment'];
  chainMethods.forEach((m) => { noopRange[m] = () => noopRange; });
  const sheet = {
    appendRow: (rij) => appended.push(rij),
    getLastRow: () => appended.length + 1,
    getRange: () => noopRange,
  };
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Prive.gs'], {});
  ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  ctx.maakPriveTabbladen_ = () => {};
  return { ctx, appended };
}

describe('CYCLE 33: opslaanPriveTransactie input-validation', () => {
  test('NL-bedrag "12,50" → 12.50 (was: 12)', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanPriveTransactie({ bedrag: '12,50', omschr: 'X', type: 'Inkomst', datum: '2026-06-01' });
    expect(Math.abs(appended[0][3])).toBe(12.50);
  });

  test('NL met thousands "1.234,56" → 1234.56', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanPriveTransactie({ bedrag: '1.234,56', omschr: 'X', type: 'Inkomst', datum: '2026-06-01' });
    expect(Math.abs(appended[0][3])).toBe(1234.56);
  });

  test('Uitgave wordt negatief geboekt', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanPriveTransactie({ bedrag: '50', omschr: 'X', type: 'Uitgave', datum: '2026-06-01' });
    expect(appended[0][3]).toBe(-50);
  });

  test('Garbage datum → throw, niets in sheet', () => {
    const { ctx, appended } = maakCtx();
    expect(() => ctx.opslaanPriveTransactie({ bedrag: '50', omschr: 'X', type: 'Inkomst', datum: 'garbage' }))
      .toThrow(/Datum/i);
    expect(appended.length).toBe(0);
  });

  test('Geldige NL-datum "01-06-2026" → opgeslagen', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanPriveTransactie({ bedrag: '50', omschr: 'X', type: 'Inkomst', datum: '01-06-2026' });
    expect(appended[0][0]).toBeInstanceOf(Date);
    expect(appended[0][0].getMonth()).toBe(5);
  });

  test('Geen datum opgegeven → vandaag (graceful default)', () => {
    const { ctx, appended } = maakCtx();
    ctx.opslaanPriveTransactie({ bedrag: '50', omschr: 'X', type: 'Inkomst' });
    expect(appended[0][0]).toBeInstanceOf(Date);
  });

  test('Lege omschrijving → throw', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanPriveTransactie({ bedrag: '50', omschr: '', type: 'Inkomst', datum: '2026-06-01' }))
      .toThrow(/Omschrijving/i);
  });

  test('Bedrag 0 → throw', () => {
    const { ctx } = maakCtx();
    expect(() => ctx.opslaanPriveTransactie({ bedrag: '0', omschr: 'X', type: 'Inkomst', datum: '2026-06-01' }))
      .toThrow(/bedrag/i);
  });
});

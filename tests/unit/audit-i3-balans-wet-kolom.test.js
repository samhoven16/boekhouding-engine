/**
 * tests/unit/audit-i3-balans-wet-kolom.test.js
 *
 * Regressietest voor AUDIT-vondst F-ACC-001 (= F-INV-005) — de BLOCKER.
 *
 * Bug: _bewijs_I3_balansWet_ (en controleerBalansStrikt_) las kolom [4]
 * (bw = Balans/W&V) en vergeleek met 'Activa'/'Passiva' — waarden die in
 * kolom [4] NOOIT voorkomen (de balans-side staat in kolom [2] = type =
 * Actief/Passief). Daardoor bleven activa=passiva=0 en slaagde de balans-wet
 * I₃ (Activa = Passiva) ALTIJD, ongeacht de werkelijke balans → vals-groen op
 * de kern-controleerbaarheid die het "formele bewijs" belooft.
 *
 * Fix: lees kolom [2] (type), filter op bw==='Balans', map Actief→Activa /
 * Passief→Passiva (Eigen vermogen heeft ook type 'Passief').
 *
 * Deze test FAALT op de oude (gebroken) code en SLAAGT op de fix.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// GROOTBOEKSCHEMA-kolommen (0-based): [0]code [1]naam [2]type [3]cat [4]bw [5]saldo
function mockSsMetGrootboek(rows) {
  const header = ['code', 'naam', 'type', 'cat', 'bw', 'saldo'];
  return {
    getSheetByName: () => ({
      getDataRange: () => ({ getValues: () => [header].concat(rows) }),
    }),
  };
}

describe('F-ACC-001 — _bewijs_I3_balansWet_ leest de juiste kolom (type [2], niet bw [4])', () => {
  let ctx;
  beforeEach(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'FormeelBewijs.gs']);
  });

  test('Detecteert een ECHTE onbalans (Activa ≠ Passiva) → geldig:false', () => {
    const ss = mockSsMetGrootboek([
      ['1100', 'Debiteuren',  'Actief',   'Vlottende activa', 'Balans', 1000],
      ['4000', 'Crediteuren', 'Passief',  'Kortlopend',       'Balans',  900],
      ['8000', 'Omzet',       'Opbrengst','Omzet',            'W&V',    5000], // W&V → genegeerd
    ]);
    const res = ctx._bewijs_I3_balansWet_(ss);
    expect(res.code).toBe('I3');
    // Op de oude code was dit ALTIJD true (activa=passiva=0) — de kern van de BLOCKER.
    expect(res.geldig).toBe(false);
    expect(res.tegenvoorbeeld.activa).toBeCloseTo(1000, 2);
    expect(res.tegenvoorbeeld.passiva).toBeCloseTo(900, 2);
  });

  test('Keurt een sluitende balans goed (Activa = Passiva) → geldig:true', () => {
    const ss = mockSsMetGrootboek([
      ['1100', 'Debiteuren',     'Actief',   'Vlottende activa', 'Balans', 1500],
      ['2000', 'Eigen vermogen', 'Passief',  'Eigen vermogen',   'Balans', 1500],
      ['8000', 'Omzet',          'Opbrengst','Omzet',            'W&V',    9999], // telt niet mee
    ]);
    const res = ctx._bewijs_I3_balansWet_(ss);
    expect(res.geldig).toBe(true);
  });

  test('W&V-rekeningen tellen NIET mee in de balans-wet (alleen bw===Balans)', () => {
    const ss = mockSsMetGrootboek([
      ['8000', 'Omzet',  'Opbrengst', 'Omzet',  'W&V', 5000],
      ['7000', 'Kosten', 'Kosten',    'Kosten', 'W&V', 3000],
    ]);
    const res = ctx._bewijs_I3_balansWet_(ss);
    expect(res.geldig).toBe(true);          // 0 activa = 0 passiva
    expect(res.tegenvoorbeeld).toBeUndefined();
  });
});

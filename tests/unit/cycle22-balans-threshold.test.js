/**
 * tests/unit/cycle22-balans-threshold.test.js
 *
 * Cycle 22 — controleerBalans_ had een drempel van €1: een verschil van
 * €0,99 tussen Activa en Passiva werd silent als "OK" gemarkeerd. Dat is
 * te ruim voor een finance-systeem waar alle journaalposten op €0,01
 * afgerond worden — €0,99 verschil duidt op een ECHTE ontbrekende of
 * foutieve boeking, niet op afronding.
 *
 * Fix: drempel verlaagd naar €0,05 (tolerant genoeg voor floating-point
 * accumulatie, maar niet meer dan dat).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(rijen) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'GezondheidCheck.gs'], {});
  const sheet = {
    getDataRange: () => ({
      getValues: () => [['Code','Naam','Type','Cat','Balans/W&V','Saldo'], ...rijen],
    }),
  };
  ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  return { ctx };
}

describe('CYCLE 22: controleerBalans_ — strikte drempel', () => {
  test('Activa = Passiva exact → OK', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('OK');
  });

  test('Verschil €0,04 (floating-point ruis) → OK', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000.04],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000.00],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('OK');
  });

  test('Verschil €0,99 → WAARSCHUWING (was: OK met drempel €1)', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000.99],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000.00],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('WAARSCHUWING');
    expect(r.bericht).toMatch(/€\s*0,99/);
  });

  test('Verschil precies €0,05 → nog OK (inclusive grens)', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000.05],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000.00],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('OK');
  });

  test('Verschil €0,06 → WAARSCHUWING', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000.06],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000.00],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('WAARSCHUWING');
  });

  test('Groot verschil → WAARSCHUWING met exact bedrag in bericht', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 10000],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 8500],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('WAARSCHUWING');
    expect(r.bericht).toMatch(/1\.500/);
  });

  test('W&V-rijen worden NIET meegeteld (alleen Balans-rijen)', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 1000],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000],
      ['8000','Omzet','Opbrengst','Omzet','W&V', 5000],   // negeren
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.status).toBe('OK');
  });

  test('Bericht legt uit dat het tijdens lopend boekjaar normaal kan zijn', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Actief','Vlottend','Balans', 2000],
      ['2000','Eigen Vermogen','Passief','EV','Balans', 1000],
    ]);
    const r = ctx.controleerBalans_(ctx.getSpreadsheet_());
    expect(r.bericht).toMatch(/lopende boekjaar/i);
    expect(r.bericht).toMatch(/€0,00|0,00/);
  });
});

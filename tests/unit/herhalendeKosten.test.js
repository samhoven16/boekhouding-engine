/**
 * tests/unit/herhalendeKosten.test.js
 *
 * Regressietests voor _addMaandenSafe_ — fix voor JS Date-overflow bug:
 * 31 januari + 1 maand → 31 februari → rolt door naar 3 maart.
 * Monthly bills op 28/29/30/31e zouden zo op verkeerde maand geboekt worden.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('HerhalendeKosten.gs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['HerhalendeKosten.gs']); });

  describe('_addMaandenSafe_', () => {
    test('15 jan + 1 maand → 15 feb', () => {
      const r = ctx._addMaandenSafe_(new Date(2026, 0, 15), 1);
      expect(r.getMonth()).toBe(1);
      expect(r.getDate()).toBe(15);
    });

    test('31 jan + 1 maand → 28 feb (niet 3 maart)', () => {
      const r = ctx._addMaandenSafe_(new Date(2026, 0, 31), 1);
      expect(r.getMonth()).toBe(1);  // februari
      expect(r.getDate()).toBe(28);
    });

    test('31 jan in schrikkeljaar (2024) → 29 feb', () => {
      const r = ctx._addMaandenSafe_(new Date(2024, 0, 31), 1);
      expect(r.getMonth()).toBe(1);
      expect(r.getDate()).toBe(29);
    });

    test('31 maart + 1 maand → 30 april', () => {
      const r = ctx._addMaandenSafe_(new Date(2026, 2, 31), 1);
      expect(r.getMonth()).toBe(3);  // april
      expect(r.getDate()).toBe(30);
    });

    test('31 dec + 1 maand → 31 jan volgend jaar', () => {
      const r = ctx._addMaandenSafe_(new Date(2026, 11, 31), 1);
      expect(r.getFullYear()).toBe(2027);
      expect(r.getMonth()).toBe(0);
      expect(r.getDate()).toBe(31);
    });

    test('15 jan + 12 maanden = jaarlijks', () => {
      const r = ctx._addMaandenSafe_(new Date(2026, 0, 15), 12);
      expect(r.getFullYear()).toBe(2027);
      expect(r.getMonth()).toBe(0);
      expect(r.getDate()).toBe(15);
    });

    test('29 feb (schrikkel) + 12 maanden → 28 feb (niet schrikkel)', () => {
      const r = ctx._addMaandenSafe_(new Date(2024, 1, 29), 12);
      expect(r.getFullYear()).toBe(2025);
      expect(r.getMonth()).toBe(1);
      expect(r.getDate()).toBe(28);
    });

    test('30 nov + 3 maanden → 28/29 feb', () => {
      const r = ctx._addMaandenSafe_(new Date(2025, 10, 30), 3);
      expect(r.getMonth()).toBe(1);  // februari
      expect(r.getDate()).toBe(28);  // 2026 niet schrikkel
    });
  });

  describe('berekenVolgendeDatum_', () => {
    test('Wekelijks → +7 dagen', () => {
      const r = ctx.berekenVolgendeDatum_(new Date(2026, 0, 15), 'Wekelijks');
      expect(r.getDate()).toBe(22);
    });

    test('Kwartaal op 31 jan → 30 april (geen overflow)', () => {
      const r = ctx.berekenVolgendeDatum_(new Date(2026, 0, 31), 'Kwartaal');
      expect(r.getMonth()).toBe(3);
      expect(r.getDate()).toBe(30);
    });

    test('Halfjaarlijks op 31 aug → 28/29 feb volgend jaar', () => {
      const r = ctx.berekenVolgendeDatum_(new Date(2026, 7, 31), 'Halfjaarlijks');
      expect(r.getFullYear()).toBe(2027);
      expect(r.getMonth()).toBe(1);
      expect(r.getDate()).toBe(28);
    });
  });
});

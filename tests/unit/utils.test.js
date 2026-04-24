/**
 * tests/unit/utils.test.js
 *
 * Regressietests voor high-leverage Utils.gs functies.
 * parseBedrag_ wordt door 8+ bestanden aangeroepen; breekt de regex
 * voor duizendtalpunten dan corrupt ALLE bankimports + handmatige
 * boekingen tegelijk. Daarom expliciete edge-case coverage.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Utils.gs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Utils.gs']); });

  describe('rondBedrag_', () => {
    test('rondt af op 2 decimalen', () => {
      expect(ctx.rondBedrag_(1.236)).toBe(1.24);
      expect(ctx.rondBedrag_(1.234)).toBe(1.23);
    });

    test('leeg/null → 0', () => {
      expect(ctx.rondBedrag_(null)).toBe(0);
      expect(ctx.rondBedrag_(undefined)).toBe(0);
      expect(ctx.rondBedrag_('')).toBe(0);
    });

    test('negatieve bedragen correct', () => {
      expect(ctx.rondBedrag_(-1.236)).toBe(-1.24);
    });
  });

  describe('parseBedrag_', () => {
    test('simpele integer-string', () => {
      expect(ctx.parseBedrag_('100')).toBe(100);
    });

    test('NL decimaal met komma', () => {
      expect(ctx.parseBedrag_('1,50')).toBe(1.50);
      expect(ctx.parseBedrag_('99,99')).toBe(99.99);
    });

    test('NL formaat met duizendtalpunt + decimale komma', () => {
      expect(ctx.parseBedrag_('1.234,56')).toBe(1234.56);
      expect(ctx.parseBedrag_('1.000.000,00')).toBe(1000000);
    });

    test('duizendtalpunt zonder decimalen', () => {
      expect(ctx.parseBedrag_('1.000')).toBe(1000);
      expect(ctx.parseBedrag_('10.000')).toBe(10000);
    });

    test('US-style dot als decimaal (geen 3-cijferig volg)', () => {
      expect(ctx.parseBedrag_('1.23')).toBe(1.23);
      expect(ctx.parseBedrag_('10.50')).toBe(10.50);
    });

    test('met euro-teken en spaties', () => {
      expect(ctx.parseBedrag_('€ 1.234,56')).toBe(1234.56);
      expect(ctx.parseBedrag_(' €99,00 ')).toBe(99);
    });

    test('nummer-input (niet string)', () => {
      expect(ctx.parseBedrag_(123.45)).toBe(123.45);
      expect(ctx.parseBedrag_(0)).toBe(0);
    });

    test('ongeldige input → 0', () => {
      expect(ctx.parseBedrag_('abc')).toBe(0);
      expect(ctx.parseBedrag_('')).toBe(0);
      expect(ctx.parseBedrag_(null)).toBe(0);
    });

    test('negatief bedrag', () => {
      expect(ctx.parseBedrag_('-1.234,56')).toBe(-1234.56);
    });
  });

  describe('formatBedrag_', () => {
    test('positief bedrag → € prefix', () => {
      expect(ctx.formatBedrag_(1234.56)).toMatch(/^€/);
      expect(ctx.formatBedrag_(1234.56)).toContain('1.234,56');
    });

    test('negatief bedrag → -€ prefix', () => {
      expect(ctx.formatBedrag_(-99)).toMatch(/^-€/);
    });

    test('nul → €0,00', () => {
      expect(ctx.formatBedrag_(0)).toBe('€0,00');
    });

    test('afrondt op 2 decimalen', () => {
      expect(ctx.formatBedrag_(1.236)).toContain('1,24');
    });
  });

  describe('getKwartaal_', () => {
    test('januari → Q1', () => {
      expect(ctx.getKwartaal_(new Date(2026, 0, 1))).toBe('Q1');
    });
    test('april → Q2', () => {
      expect(ctx.getKwartaal_(new Date(2026, 3, 15))).toBe('Q2');
    });
    test('juli → Q3', () => {
      expect(ctx.getKwartaal_(new Date(2026, 6, 1))).toBe('Q3');
    });
    test('december → Q4', () => {
      expect(ctx.getKwartaal_(new Date(2026, 11, 31))).toBe('Q4');
    });
  });

  describe('isInPeriode_', () => {
    test('datum binnen periode', () => {
      const d = new Date(2026, 3, 15);
      const van = new Date(2026, 3, 1);
      const tot = new Date(2026, 3, 30);
      expect(ctx.isInPeriode_(d, van, tot)).toBe(true);
    });

    test('datum voor periode', () => {
      const d = new Date(2026, 2, 31);
      const van = new Date(2026, 3, 1);
      const tot = new Date(2026, 3, 30);
      expect(ctx.isInPeriode_(d, van, tot)).toBe(false);
    });

    test('datum na periode', () => {
      const d = new Date(2026, 4, 1);
      const van = new Date(2026, 3, 1);
      const tot = new Date(2026, 3, 30);
      expect(ctx.isInPeriode_(d, van, tot)).toBe(false);
    });
  });
});

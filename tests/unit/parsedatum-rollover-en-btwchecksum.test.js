/**
 * tests/unit/parsedatum-rollover-en-btwchecksum.test.js
 *
 * Tests voor P21+P22 uit Belastingdienst stress-test:
 *   - parseDatum_ rollover-detect (was: silent 31-02 → 03-03)
 *   - isGeldigBTWNummer_ mod-11 checksum (was: alleen regex)
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('P22: parseDatum_ rollover-detectie', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Geldige NL-datum 15-03-2026 → correct Date', () => {
    const d = ctx.parseDatum_('15-03-2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);  // maart
    expect(d.getDate()).toBe(15);
  });

  test('Geldige ISO-datum 2026-03-15 → correct Date', () => {
    const d = ctx.parseDatum_('2026-03-15');
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  test('REGRESSIE: "31-02-2026" rolde silent naar 03-03-2026 — nu fallback naar vandaag (NIET silent rollover)', () => {
    const d = ctx.parseDatum_('31-02-2026');
    // Bug: voorheen d.getDate() === 3 && d.getMonth() === 2 (maart, na rollover)
    // Nu: fallback naar new Date() = vandaag → NIET 3 maart 2026
    expect(d.getMonth() === 2 && d.getDate() === 3 && d.getFullYear() === 2026).toBe(false);
  });

  test('REGRESSIE: "31-04-2026" (kwartaal-grens) → geen silent rollover', () => {
    const d = ctx.parseDatum_('31-04-2026');
    // Voorheen rolde naar 01-05-2026 = Q2. Nu vandaag-fallback.
    expect(d.getMonth() === 4 && d.getDate() === 1 && d.getFullYear() === 2026).toBe(false);
  });

  test('29-02-2024 (schrikkeljaar) → geldig', () => {
    const d = ctx.parseDatum_('29-02-2024');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  test('29-02-2025 (geen schrikkeljaar) → geen silent rollover', () => {
    const d = ctx.parseDatum_('29-02-2025');
    // Voorheen rolde naar 01-03-2025. Nu vandaag-fallback.
    expect(d.getMonth() === 2 && d.getDate() === 1 && d.getFullYear() === 2025).toBe(false);
  });

  test('Maand > 12 → fallback naar vandaag (geen rollover-naar-volgend-jaar)', () => {
    const d = ctx.parseDatum_('15-13-2026');
    expect(d.getFullYear() === 2026 && d.getMonth() === 0).toBe(false);
  });

  test('ISO 2026-02-30 → fallback (geen silent 2026-03-02)', () => {
    const d = ctx.parseDatum_('2026-02-30');
    expect(d.getMonth() === 2 && d.getDate() === 2 && d.getFullYear() === 2026).toBe(false);
  });

  test('Date-object input → onveranderd door', () => {
    const original = new Date(2026, 5, 15);
    const d = ctx.parseDatum_(original);
    expect(d).toBe(original);
  });

  test('Lege string → vandaag', () => {
    const d = ctx.parseDatum_('');
    expect(d instanceof Date).toBe(true);
    expect(isNaN(d.getTime())).toBe(false);
  });
});

describe('P21: isGeldigBTWNummer_ format-check', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Eigen Boekhoudbaar BTW NL004384587B39 → format-valide', () => {
    expect(ctx.isGeldigBTWNummer_('NL004384587B39')).toBe(true);
  });

  test('Format-fail: te kort → false', () => {
    expect(ctx.isGeldigBTWNummer_('NL12345')).toBe(false);
  });

  test('Format-fail: BE BTW-nr → false (alleen NL)', () => {
    expect(ctx.isGeldigBTWNummer_('BE0123456789')).toBe(false);
  });

  test('Lege string → false', () => {
    expect(ctx.isGeldigBTWNummer_('')).toBe(false);
    expect(ctx.isGeldigBTWNummer_(null)).toBe(false);
  });

  test('Spaties + lowercase worden genormaliseerd', () => {
    expect(ctx.isGeldigBTWNummer_('nl 004 384 587 b 39')).toBe(true);
  });

  test('Format-fail: B-letter mist', () => {
    expect(ctx.isGeldigBTWNummer_('NL00438458739')).toBe(false);
  });

  test('Format-fail: alleen 8 cijfers ipv 9', () => {
    expect(ctx.isGeldigBTWNummer_('NL00438458B39')).toBe(false);
  });

  // Documentatie-noot: echte validiteit (is dit nummer ECHT uitgegeven?) vereist
  // VIES API-call. Format-only check filtert pure typo's maar laat valide-
  // gevormde-maar-niet-uitgegeven nummers door (bv. NL000000000B00).
  test('"NL000000000B00" passeert format-check (geen mod-11) — VIES vereist voor echtheid', () => {
    expect(ctx.isGeldigBTWNummer_('NL000000000B00')).toBe(true);
  });
});

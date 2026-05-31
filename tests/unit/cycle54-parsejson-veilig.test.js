/**
 * tests/unit/cycle54-parsejson-veilig.test.js
 *
 * Cycle 54 — generic parseJsonVeilig_ helper + route 2 unguarded
 * Engagement-sites (toonAchievementsOverzicht, slaNpsResponseOp). Bij
 * corrupt ScriptProperty (half-write / handmatige edit) crashten die
 * eerder; nu graceful fallback.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 54: parseJsonVeilig_ helper', () => {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs'], {});

  test('Geldig JSON → geparsed', () => {
    expect(ctx.parseJsonVeilig_('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(ctx.parseJsonVeilig_('{"a":1}', null)).toEqual({ a: 1 });
  });

  test('null/undefined/empty → fallback', () => {
    expect(ctx.parseJsonVeilig_(null, [])).toEqual([]);
    expect(ctx.parseJsonVeilig_(undefined, 'x')).toBe('x');
    expect(ctx.parseJsonVeilig_('', [])).toEqual([]);
  });

  test('Corrupt JSON → fallback (geen throw)', () => {
    expect(() => ctx.parseJsonVeilig_('{half', [])).not.toThrow();
    expect(ctx.parseJsonVeilig_('{half', [])).toEqual([]);
  });

  test('Default fallback = null', () => {
    expect(ctx.parseJsonVeilig_('garbage')).toBeNull();
  });
});

describe('CYCLE 54: Engagement-sites geconverteerd', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/Engagement.gs'), 'utf8');

  test('toonAchievementsOverzicht gebruikt parseJsonVeilig_', () => {
    const idx = src.indexOf('function toonAchievementsOverzicht');
    const body = src.slice(idx, idx + 400);
    expect(body).toMatch(/parseJsonVeilig_\(props\.getProperty\(ACHIEVEMENT_PROP\)/);
  });

  test('slaNpsResponseOp gebruikt parseJsonVeilig_', () => {
    const idx = src.indexOf('function slaNpsResponseOp');
    const body = src.slice(idx, idx + 400);
    expect(body).toMatch(/parseJsonVeilig_\(props\.getProperty\(NPS_PROP_RESPONSE\)/);
  });
});

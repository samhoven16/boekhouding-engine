/**
 * tests/unit/cycle78-safe-audit-log.test.js
 *
 * Cycle 78 — `safeAuditLog_` als vervanging voor het 50× herhalend patroon
 * `try { schrijfAuditLog_(...); } catch (_) {}`. schrijfAuditLog_ heeft zelf
 * al een internal try/catch, maar callers wrap_ten "voor de zekerheid" toch
 * nog een keer (defensief tegen ReferenceError). De helper centraliseert dat
 * en haalt 50× boilerplate uit de business-logic.
 *
 * Gedrag: NOOIT crashen.
 *   - schrijfAuditLog_ aanwezig → delegate
 *   - schrijfAuditLog_ niet aanwezig → Logger.log fallback
 *   - schrijfAuditLog_ throwt → silently slikken (audit-log mag NOOIT de
 *     business-operatie breken)
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 78: safeAuditLog_ helper', () => {
  test('delegeert naar schrijfAuditLog_ als die bestaat', () => {
    const ctx = createGasRuntime([path.resolve(__dirname, '../../src/Utils.gs')]);
    ctx.safeAuditLog_('TEST_ACTIE', 'detail-bericht');
    expect(ctx.schrijfAuditLog_).toHaveBeenCalledWith('TEST_ACTIE', 'detail-bericht');
  });

  test('crasht niet als schrijfAuditLog_ throwt', () => {
    const ctx = createGasRuntime([path.resolve(__dirname, '../../src/Utils.gs')], {
      schrijfAuditLog_: jest.fn(() => { throw new Error('audit-sheet locked'); }),
    });
    expect(() => ctx.safeAuditLog_('X', 'Y')).not.toThrow();
  });

  test('valt terug op Logger.log wanneer schrijfAuditLog_ niet bestaat', () => {
    const ctx = createGasRuntime([path.resolve(__dirname, '../../src/Utils.gs')], {
      schrijfAuditLog_: undefined,
    });
    // Forceer ook na bundle dat het undefined is — de prelude in gas-runtime
    // creëert een safeAuditLog_ die alleen schrijfAuditLog_ aanroept als die
    // een function is. Utils.gs definieert de echte versie die Logger.log
    // gebruikt als fallback.
    delete ctx.schrijfAuditLog_;
    ctx.safeAuditLog_('NO_AUDIT', 'fallback-test');
    const logged = ctx.Logger.log.mock.calls.some((c) =>
      String(c[0] || '').includes('AUDIT-FALLBACK') && String(c[0] || '').includes('NO_AUDIT')
    );
    expect(logged).toBe(true);
  });

  test('boilerplate is gemigreerd: geen `try { schrijfAuditLog_(...) } catch (_) {}` single-liners meer', () => {
    const fs = require('fs');
    const glob = require('glob');
    // Single-line patroon zonder nested calls — die zijn allemaal vervangen.
    const SRC_DIR = path.resolve(__dirname, '../../src');
    const files = glob.sync('**/*.gs', { cwd: SRC_DIR });
    const patterns = [];
    files.forEach((f) => {
      const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
      // Single-line patroon zonder nested parens — multi-line wraps blijven
      // (die zijn handmatig werk, niet mechanisch te vervangen).
      const matches = txt.match(/try \{ schrijfAuditLog_\([^()\n]*\); \} catch \(_\) \{\}/g);
      if (matches) patterns.push({ file: f, count: matches.length });
    });
    expect(patterns).toEqual([]);
  });
});

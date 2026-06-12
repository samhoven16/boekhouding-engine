/**
 * tests/unit/tarief-verouderd-waarschuwing.test.js
 *
 * D3 — Bij eerste boeking in een nieuw kalenderjaar zonder bevestigde
 * tarieven moet de klant een prominente waarschuwing krijgen + owner
 * moet gealarmeerd worden. Voorheen zat TARIEF_VEROUDERD alleen als
 * label in het Belastingadvies-tabblad → klant boekte in 2028 stil door
 * met 2026-tarieven (silent drift = boete-risico).
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const TRIG = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');

function maakCtx(opts) {
  opts = opts || {};
  const store = opts.props || {};
  const audit = [];
  const owner = [];
  const toasts = [];

  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs'], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getProperties: () => Object.assign({}, store),
      }),
    },
  });
  ctx.getBelasting_ = () => opts.belasting || {};
  ctx.schrijfAuditLog_ = (a, d) => audit.push([a, d]);
  ctx.meldFataalAanOwner_ = (code, msg, c) => owner.push([code, msg, c]);

  const ss = {
    toast: (msg, titel, dur) => toasts.push({ msg: msg, titel: titel, dur: dur }),
  };

  return { ctx, ss, store, audit, owner, toasts };
}

describe('D3: controleerTariefVerouderdWaarschuwing_ — alleen waarschuwen als verouderd', () => {
  test('Tarieven NIET verouderd → geen actie, geen mail', () => {
    const r = maakCtx({ belasting: { TARIEF_VEROUDERD: false } });
    const res = r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    expect(res.verouderd).toBe(false);
    expect(res.getoond).toBe(false);
    expect(r.audit).toHaveLength(0);
    expect(r.owner).toHaveLength(0);
    expect(r.toasts).toHaveLength(0);
  });

  test('Geen BELASTING → veilig false, geen crash', () => {
    const r = maakCtx({ belasting: null });
    expect(() => r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss)).not.toThrow();
    const res = r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    expect(res.verouderd).toBe(false);
  });

  test('Tarieven VEROUDERD + eerste boeking dit jaar → toast + audit + owner-alert', () => {
    const r = maakCtx({
      belasting: {
        TARIEF_VEROUDERD: true,
        TARIEF_FALLBACK_JAAR: 2026,
        TARIEF_BRON: 'placeholder',
      },
    });
    const res = r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    expect(res.verouderd).toBe(true);
    expect(res.getoond).toBe(true);
    expect(r.toasts).toHaveLength(1);
    expect(r.toasts[0].titel).toMatch(/verouderde tarieven/i);
    expect(r.audit).toHaveLength(1);
    expect(r.audit[0][0]).toBe('Tarieven verouderd');
    expect(r.owner).toHaveLength(1);
    expect(r.owner[0][0]).toBe('TARIEF_VEROUDERD');
  });

  test('Throttle: tweede aanroep zelfde jaar → géén tweede mail/toast', () => {
    const r = maakCtx({
      belasting: { TARIEF_VEROUDERD: true, TARIEF_FALLBACK_JAAR: 2026 },
    });
    r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    expect(r.toasts).toHaveLength(1);
    expect(r.audit).toHaveLength(1);
    expect(r.owner).toHaveLength(1);
  });

  test('Seen-flag wordt VÓÓR de mail gezet (crash tijdens mail → geen herhaal-mail)', () => {
    const r = maakCtx({
      belasting: { TARIEF_VEROUDERD: true, TARIEF_FALLBACK_JAAR: 2026 },
    });
    r.ctx.meldFataalAanOwner_ = () => { throw new Error('mail-systeem down'); };
    expect(() => r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss)).not.toThrow();
    // Tweede aanroep moet niets meer doen (de flag staat al)
    const tweede = r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    expect(tweede.getoond).toBe(false);
  });

  test('Per-jaar throttle: seen-key bevat het jaartal in de naam', () => {
    const r = maakCtx({
      belasting: { TARIEF_VEROUDERD: true, TARIEF_FALLBACK_JAAR: 2026 },
    });
    r.ctx.controleerTariefVerouderdWaarschuwing_(r.ss);
    const huidigJaar = new Date().getFullYear();
    expect(r.store['TARIEF_VEROUDERD_GEZIEN_' + huidigJaar]).toBe('1');
  });
});

describe('D3: Integratie — verwerkHoofdformulier roept de waarschuwing aan', () => {
  test('verwerkHoofdformulier roept controleerTariefVerouderdWaarschuwing_', () => {
    expect(TRIG).toMatch(/controleerTariefVerouderdWaarschuwing_\(ss\)/);
  });

  test('De aanroep zit in een try-catch zodat een fout de boeking niet stopt', () => {
    // Zoek de aanroep en kijk dat de voorafgaande regels try { bevatten
    const idx = TRIG.indexOf('controleerTariefVerouderdWaarschuwing_(ss)');
    expect(idx).toBeGreaterThan(-1);
    const voorContext = TRIG.slice(Math.max(0, idx - 200), idx);
    expect(voorContext).toMatch(/try\s*\{/);
  });
});

/**
 * tests/unit/f-doc-131-btw-assistent-eu-rubrieken.test.js
 *
 * F-DOC-131 — de BTW-aangifte-assistent toonde alleen 1a/1b/1c/5a/5b/5g. Een
 * ZZP'er met EU-/verlegde omzet zag die euro's nergens en kon niet
 * reconciliëren met mijn.belastingdienst.nl (rubriek 1e/2a/3a/4a). Nu worden
 * die rubrieken getoond zodra ze >0 zijn (labels identiek aan de BTW Aangifte-tab).
 *
 * Ratel: de "1e/4a-rij aanwezig"-assertie faalt zónder de fix.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const BTWR_GS = path.resolve(__dirname, '../../src/BTWReminder.gs');

function baseAangifte(extra) {
  return Object.assign({
    r1a_grondslag: 1000, r1a_btw: 210,
    r1b_grondslag: 0, r1b_btw: 0,
    r1c_grondslag: 0, r1c_btw: 0,
    r1e_grondslag: 0, r1e_btw: 0,
    r2a: 0,
    r3a_grondslag: 0, r3a_btw: 0,
    r4a_grondslag: 0, r4a_btw: 0,
    r5a: 210, r5b: 0, saldo: 210,
  }, extra || {});
}

function render(aangifte) {
  let captured = '';
  const kw = {
    naam: 'Q1 2026', kw: 'Q1',
    van: new Date('2026-01-01'), tot: new Date('2026-03-31'),
    deadline: new Date('2026-04-30'),
  };
  const ctx = createGasRuntime([BTWR_GS], {
    SpreadsheetApp: {
      getUi: () => ({ alert: () => {}, showModalDialog: () => {}, ButtonSet: { OK: 1 } }),
    },
    HtmlService: {
      createHtmlOutput: (html) => { captured = html; return { setWidth() { return this; }, setHeight() { return this; }, setSandboxMode() { return this; } }; },
      SandboxMode: { IFRAME: 'iframe' },
    },
  });
  ctx.getSpreadsheet_ = () => ({});
  ctx.huidigeKwartaal_ = () => kw;
  ctx.berekenBtwAangifte_ = () => aangifte;
  ctx.toonBtwAangifteAssistent();
  return captured;
}

describe('F-DOC-131 — assistent toont EU/verlegd-rubrieken', () => {
  test('verlegde omzet (1e) + verlegde inkoop (4a) aanwezig → rijen + sectie getoond', () => {
    const html = render(baseAangifte({
      r1e_grondslag: 5000, r1e_btw: 0,
      r4a_grondslag: 1000, r4a_btw: 210,
    }));
    expect(html).toMatch(/EU &amp; buitenland/);            // ← sectie; faalt zónder fix
    expect(html).toMatch(/>1e</);
    expect(html).toMatch(/Omzet waarbij BTW is verlegd naar de afnemer/);
    expect(html).toMatch(/>4a</);
    expect(html).toMatch(/Inkopen waarbij BTW is verlegd naar jou/);
  });

  test('IC-levering (3a) aanwezig → 3a-rij getoond', () => {
    const html = render(baseAangifte({ r3a_grondslag: 2500 }));
    expect(html).toMatch(/>3a</);
    expect(html).toMatch(/Leveringen binnen de EU \(ICL\)/);
  });

  test('geen EU/verlegd-data → sectie afwezig, binnenland blijft', () => {
    const html = render(baseAangifte());
    expect(html).not.toMatch(/EU &amp; buitenland/);
    expect(html).not.toMatch(/>1e</);
    expect(html).toMatch(/>1a</);   // binnenland blijft gewoon staan
  });
});

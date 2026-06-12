/**
 * tests/unit/tarieven-2026-ssot.test.js
 *
 * B-groep — Belastingdienst.nl-geverifieerde tarieven 2026 (audit 2026-06-12).
 *
 * Probleem dat dit oplost: drievoudige bron-of-truth gaf verschillende
 * waarden per UI-scherm. Klant zag €2.470 in CustomFunctions/Notificaties
 * terwijl Belastingadvies.gs €1.200 toonde.
 *
 * Bronnen (belastingdienst.nl, geverifieerd 2026-06-12):
 *   - Zelfstandigenaftrek 2026: €1.200 (was €2.470 in 2025)
 *   - Startersaftrek 2026:      €2.123
 *   - MKB-winstvrijstelling:    12,70%
 *   - Zvw-premie ZZP:           4,85% (was 5,26% in 2025)
 *   - Zvw max-inkomen:          €79.409
 *   - IB-schijf-1-grens:        €38.883 — tarief 35,75%
 *   - IB-schijf-2-grens:        €78.426 — tarief 37,56%
 *   - IB-schijf-3-tarief:       49,50%
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BEL  = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');
const CF   = fs.readFileSync(path.resolve(__dirname, '../../src/CustomFunctions.gs'), 'utf8');
const NOT  = fs.readFileSync(path.resolve(__dirname, '../../src/Notificaties.gs'), 'utf8');

describe('B-groep: tarieven 2026 SSOT — Belastingadvies.gs hoofdwaarden', () => {
  // Pak de TWEEDE 2026:-blok (BELASTING_PER_JAAR — de tarief-config zelf).
  // Het eerste 2026:-blok is BELASTING_BRONNEN-metadata.
  const tweedeIdx = BEL.indexOf('2026: {', BEL.indexOf('2026: {') + 10);
  const blok2026 = BEL.slice(tweedeIdx, BEL.indexOf('2027: {', tweedeIdx));

  test('Zelfstandigenaftrek 2026 = €1.200', () => {
    expect(blok2026).toMatch(/ZELFSTANDIGENAFTREK:\s*1200\b/);
  });

  test('Startersaftrek 2026 = €2.123', () => {
    expect(blok2026).toMatch(/STARTERSAFTREK:\s*2123\b/);
  });

  test('MKB-winstvrijstelling 2026 = 12,70%', () => {
    expect(blok2026).toMatch(/MKB_WINSTVRIJSTELLING:\s*0\.1270\b/);
  });

  test('Zvw-premie 2026 = 4,85% en max-inkomen €79.409', () => {
    expect(blok2026).toMatch(/ZVW_PCT:\s*0\.0485\b/);
    expect(blok2026).toMatch(/ZVW_MAX_INKOMEN:\s*79409\b/);
  });

  test('IB-schijven 2026: schijf 1 t/m 38.883 @ 35,75%, schijf 2 t/m 78.426 @ 37,56%, schijf 3 49,5%', () => {
    expect(blok2026).toMatch(/tot:\s*38883[\s,]+pct:\s*0\.3575/);
    expect(blok2026).toMatch(/tot:\s*78426[\s,]+pct:\s*0\.3756/);
    expect(blok2026).toMatch(/tot:\s*Infinity[\s,]+pct:\s*0\.495/);
  });

  test('Regressie-guard: geen residuele 2025-waarden in 2026-blok', () => {
    expect(blok2026).not.toMatch(/tot:\s*79137\b/);
    expect(blok2026).not.toMatch(/pct:\s*0\.3582\b/);
  });
});

describe('B-groep: tarieven 2026 in fallback-bronnen — CustomFunctions.gs', () => {
  test('Last-resort snapshot is nu 2026 i.p.v. 2025', () => {
    expect(CF).toMatch(/ZELFSTANDIGENAFTREK:\s*1200\b/);
    expect(CF).toMatch(/ZVW_PCT:\s*0\.0485\b/);
    expect(CF).toMatch(/ZVW_MAX_INKOMEN:\s*79409\b/);
    expect(CF).toMatch(/IB_SCHIJF_1_MAX:\s*38883\b/);
  });

  test('Schijven 2026 correct: 38.883 / 78.426 / 49,5%', () => {
    expect(CF).toMatch(/tot:\s*38883[\s,]+pct:\s*0\.3575/);
    expect(CF).toMatch(/tot:\s*78426[\s,]+pct:\s*0\.3756/);
  });

  test('Geen residuele 2025-waarden: €2.470 / 38441 / 76817 / 5,26%', () => {
    const fnSnippet = CF.slice(CF.indexOf('// Last-resort'), CF.indexOf('// Last-resort') + 1500);
    expect(fnSnippet).not.toMatch(/ZELFSTANDIGENAFTREK:\s*2470/);
    expect(fnSnippet).not.toMatch(/ZVW_PCT:\s*0\.0526/);
    expect(fnSnippet).not.toMatch(/tot:\s*38441/);
    expect(fnSnippet).not.toMatch(/tot:\s*76817/);
  });
});

describe('B-groep: tarieven 2026 in Notificaties.gs', () => {
  test('Fallback zaftrek is 1200 (2026), niet 2470 (2025)', () => {
    expect(NOT).toMatch(/B\.ZELFSTANDIGENAFTREK\)\s*\|\|\s*1200\b/);
    expect(NOT).not.toMatch(/B\.ZELFSTANDIGENAFTREK\)\s*\|\|\s*2470\b/);
  });

  test('Fallback IB-schijf-1-tarief is 0,3575 (35,75%), niet 0,37', () => {
    expect(NOT).toMatch(/\|\|\s*0\.3575\b/);
  });
});

/**
 * tests/unit/btw-classificatie-robust.test.js
 *
 * Regressietests voor BTW-label classificatie hardening in berekenBtwAangifte_.
 *
 * Bug die deze tests voorkomen:
 *   Klant typt "verlegd" (kleine v) of legacy-label "BTW Vrijgesteld" — voorheen
 *   case-sensitive .includes() check miste dit, factuur landde in geen enkele
 *   bucket en VERDWEEN uit r5a totaal. Belastingdienst-aangifte was te laag.
 *   Nu: regex /verlegd/i + onbekende-labels-detectie via _onbekendeLabels.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('berekenBtwAangifte_ — case-insensitive labels (regressie)', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);
  });

  // Helper: bouw mock-spreadsheet met enkel verkoopfacturen-tab gevuld.
  function maakMockSs(vfRijen) {
    const HEADER = new Array(20).fill('');
    const data = [HEADER, ...vfRijen];
    return {
      getSheetByName: jest.fn((naam) => {
        if (naam === 'Verkoopfacturen') {
          return { getDataRange: () => ({ getValues: () => data }) };
        }
        return null;
      }),
    };
  }

  // Verkoopfactuur-rij: kolom-indeling (0-based)
  // [2]=datum, [9]=excl, [10]=btwLabel, [11]=btwBedrag, [14]=status
  function vfRij(datum, excl, label, btw, status = '') {
    const r = new Array(20).fill('');
    r[2] = datum; r[9] = excl; r[10] = label; r[11] = btw; r[14] = status;
    return r;
  }

  const VAN = new Date('2026-01-01');
  const TOT = new Date('2026-03-31');

  test('label "verlegd" (kleine letter) → telt mee in r1e (voorheen: gemist)', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 1000, 'verlegd', 0),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r.r1e_grondslag).toBeCloseTo(1000, 1);
    expect(r._onbekendeOmzet || 0).toBe(0);
  });

  test('label "VRIJGESTELD" (caps) → telt mee in r1d', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 500, 'VRIJGESTELD', 0),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r.r1d).toBeCloseTo(500, 1);
  });

  test('label "Nultarief" (camelcase) → telt mee in r1d', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 750, 'Nultarief', 0),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r.r1d).toBeCloseTo(750, 1);
  });

  test('onbekend label + niet-nul grondslag → flagged via _onbekendeLabels', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 800, 'Belast met 42% (typo)', 336),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r.r1a_grondslag).toBe(0);
    expect(r._onbekendeOmzet).toBeCloseTo(800, 1);
    expect(r._onbekendeLabels).toBeDefined();
    expect(Object.keys(r._onbekendeLabels).length).toBe(1);
  });

  test('verlegd-factuur met BTW-bedrag → r1e_btw vult mee (voorheen: btwBedrag verloren)', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 1000, 'BTW verlegd', 210),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r.r1e_grondslag).toBeCloseTo(1000, 1);
    expect(r.r1e_btw).toBeCloseTo(210, 1);
    expect(r.r5a).toBeCloseTo(210, 1);
  });

  test('GECREDITEERD factuur met onbekend label → niet in onbekend-buckets (skip eerst)', () => {
    const ss = maakMockSs([
      vfRij(new Date('2026-02-01'), 500, 'mystery-label', 0, 'Gecrediteerd'),
    ]);
    const r = ctx.berekenBtwAangifte_(ss, VAN, TOT);
    expect(r._onbekendeOmzet || 0).toBe(0);
  });
});

describe('berekenBtwAangifte_ — r4a reverse-charge inkoop case-insensitive (A2)', () => {
  // Symmetrie-fix: verkoop-zijde matcht /verlegd/i (regel 239), inkoop-zijde
  // deed .includes('Verlegd') met hoofdletter. Klant met label "verlegd"
  // of "VERLEGD" op inkoop kreeg GEEN r4a-buchung → alleen aftrek (r5b),
  // geen afdracht → BTW-aangifte te laag → naheffing bij controle.
  // Audit 2026-06-12.
  const { createGasRuntime } = require('../__helpers__/gas-runtime');
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);

  function maakSs(ifRijen) {
    const HEADER = new Array(20).fill('');
    return {
      getSheetByName: (naam) => {
        if (naam === 'Inkoopfacturen') {
          return { getDataRange: () => ({ getValues: () => [HEADER, ...ifRijen] }) };
        }
        if (naam === 'Verkoopfacturen') {
          return { getDataRange: () => ({ getValues: () => [HEADER] }) };
        }
        return null;
      },
    };
  }

  // Inkoopfactuur-rij: [3]=datum, [8]=excl/grondslag, [9]=btwLabel, [10]=btwBedrag, [12]=status
  function ifRij(datum, grondslag, label, btw) {
    const r = new Array(20).fill('');
    r[3] = datum; r[8] = grondslag; r[9] = label; r[10] = btw;
    return r;
  }

  const VAN = new Date('2026-01-01');
  const TOT = new Date('2026-03-31');

  test('label "Verlegd" (hoofdletter — oude gedrag) → r4a (regressie)', () => {
    const r = ctx.berekenBtwAangifte_(maakSs([ifRij(new Date('2026-02-01'), 1000, 'Verlegd', 210)]), VAN, TOT);
    expect(r.r4a_grondslag).toBeCloseTo(1000, 1);
    expect(r.r4a_btw).toBeCloseTo(210, 1);
  });

  test('label "verlegd" (kleine letter) → r4a (was VOORHEEN gemist → naheffing)', () => {
    const r = ctx.berekenBtwAangifte_(maakSs([ifRij(new Date('2026-02-01'), 1000, 'verlegd', 210)]), VAN, TOT);
    expect(r.r4a_grondslag).toBeCloseTo(1000, 1);
    expect(r.r4a_btw).toBeCloseTo(210, 1);
    // F-TAX-120: verlegde voorbelasting ÍS aftrekbaar (reverse charge) →
    // r5b == r4a_btw, net kaseffect €0. De oude assertie (r5b==0) borgde
    // per ongeluk de bug: de klant droeg de verlegde BTW vól af.
    expect(r.r5b).toBeCloseTo(210, 1);
    expect(r.saldo).toBeCloseTo(0, 1);
  });

  test('label "VERLEGD" (caps) → r4a', () => {
    const r = ctx.berekenBtwAangifte_(maakSs([ifRij(new Date('2026-02-01'), 1000, 'VERLEGD', 210)]), VAN, TOT);
    expect(r.r4a_grondslag).toBeCloseTo(1000, 1);
    expect(r.r4a_btw).toBeCloseTo(210, 1);
  });

  test('label "BTW Verlegd (B2B EU)" → r4a (substring match werkt nog)', () => {
    const r = ctx.berekenBtwAangifte_(maakSs([ifRij(new Date('2026-02-01'), 1000, 'BTW Verlegd (B2B EU)', 210)]), VAN, TOT);
    expect(r.r4a_grondslag).toBeCloseTo(1000, 1);
  });

  test('I₅ axioma blijft sluiten: r5a omvat r4a_btw (geen verschuldigde verloren)', () => {
    const r = ctx.berekenBtwAangifte_(maakSs([ifRij(new Date('2026-02-01'), 1000, 'verlegd', 210)]), VAN, TOT);
    expect(r.r5a).toBeCloseTo(r.r4a_btw, 1);
  });
});

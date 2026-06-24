/**
 * tests/unit/belastingadvies-helpers.test.js
 *
 * Regressietests voor pure helpers in Belastingadvies.gs:
 *   - berekenKiaAftrek_:   4-zone KIA-tabel
 *   - berekenIBProgressief_: progressieve IB Box 1 over schijven
 *
 * Verwachtingen worden uit BELASTING-config gehaald zodat tests
 * jaar-onafhankelijk werken (huidig jaar = current Date().getFullYear()).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Belastingadvies helpers', () => {
  let ctx;
  let B;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);
    B = ctx.getBelasting_();
  });

  describe('KIA-staffel 2026 — officiële waarden (belastingdienst.nl, 2026-06-10)', () => {
    // Absolute pinning náást de config-relatieve tests hieronder: een
    // onbedoelde config-wijziging mag niet stilletjes passeren omdat de
    // relatieve tests meebewegen.
    test('config bevat de definitieve 2026-staffel', () => {
      expect(B.KIA_MIN).toBe(2901);
      expect(B.KIA_VAST_VAN).toBe(71683);
      expect(B.KIA_VAST_BEDRAG).toBe(20072);
      expect(B.KIA_AFBOUW_START).toBe(132747);
      expect(B.KIA_AFBOUW_PCT).toBe(0.0756);
      expect(B.KIA_MAX).toBe(398236);
    });

    test('staffel-randen rekenen conform de officiële tabel', () => {
      expect(ctx.berekenKiaAftrek_(2900, B)).toBe(0);
      expect(ctx.berekenKiaAftrek_(2901, B)).toBeCloseTo(812.28, 2);   // 28%
      expect(ctx.berekenKiaAftrek_(71684, B)).toBeCloseTo(20072, 2);   // vast
      expect(ctx.berekenKiaAftrek_(132746, B)).toBeCloseTo(20072, 2);  // vast
      // afbouw: €20.072 − 7,56% × deel boven €132.747
      expect(ctx.berekenKiaAftrek_(200000, B)).toBeCloseTo(20072 - 0.0756 * (200000 - 132747), 2);
      expect(ctx.berekenKiaAftrek_(398237, B)).toBe(0);                // boven max
    });
  });

  describe('berekenKiaAftrek_ (4-zone KIA-tabel)', () => {
    test('investering 0 → geen KIA', () => {
      expect(ctx.berekenKiaAftrek_(0, B)).toBe(0);
    });

    test('investering onder min → geen KIA', () => {
      expect(ctx.berekenKiaAftrek_(B.KIA_MIN - 100, B)).toBe(0);
    });

    test('investering precies KIA_MIN → 28% × KIA_MIN', () => {
      const verwacht = Math.round(B.KIA_MIN * B.KIA_PCT * 100) / 100;
      expect(ctx.berekenKiaAftrek_(B.KIA_MIN, B)).toBeCloseTo(verwacht, 2);
    });

    test('investering in 28%-zone → 28% × bedrag', () => {
      const inv = B.KIA_MIN + 10000;
      const verwacht = Math.round(inv * B.KIA_PCT * 100) / 100;
      expect(ctx.berekenKiaAftrek_(inv, B)).toBeCloseTo(verwacht, 2);
    });

    test('investering precies KIA_VAST_VAN (boven-rand zone 28%) → ongeveer KIA_VAST_BEDRAG', () => {
      const aftrek = ctx.berekenKiaAftrek_(B.KIA_VAST_VAN, B);
      // KIA_VAST_VAN × 28% ≈ KIA_VAST_BEDRAG, klein verschil door rounding tabel
      expect(aftrek).toBeCloseTo(B.KIA_VAST_VAN * B.KIA_PCT, 2);
    });

    test('investering in vaste-bedrag zone → KIA_VAST_BEDRAG', () => {
      const inv = (B.KIA_VAST_VAN + B.KIA_AFBOUW_START) / 2;
      expect(ctx.berekenKiaAftrek_(inv, B)).toBeCloseTo(B.KIA_VAST_BEDRAG, 2);
    });

    test('investering precies KIA_AFBOUW_START → KIA_VAST_BEDRAG (start afbouw)', () => {
      expect(ctx.berekenKiaAftrek_(B.KIA_AFBOUW_START, B)).toBeCloseTo(B.KIA_VAST_BEDRAG, 2);
    });

    test('investering in afbouwzone → KIA_VAST_BEDRAG − pct × overschrijding', () => {
      const inv = B.KIA_AFBOUW_START + 50000;
      const verwacht = B.KIA_VAST_BEDRAG - B.KIA_AFBOUW_PCT * 50000;
      expect(ctx.berekenKiaAftrek_(inv, B)).toBeCloseTo(verwacht, 2);
    });

    test('investering boven max → geen KIA', () => {
      expect(ctx.berekenKiaAftrek_(B.KIA_MAX + 1000, B)).toBe(0);
    });

    test('investering met string-input → werkt via parseFloat', () => {
      const inv = B.KIA_MIN + 10000;
      const verwacht = Math.round(inv * B.KIA_PCT * 100) / 100;
      expect(ctx.berekenKiaAftrek_(String(inv), B)).toBeCloseTo(verwacht, 2);
    });
  });

  describe('berekenIBProgressief_ (progressief over IB_SCHIJVEN)', () => {
    test('inkomen 0 → IB 0', () => {
      expect(ctx.berekenIBProgressief_(0, B)).toBe(0);
    });

    test('inkomen negatief → IB 0', () => {
      expect(ctx.berekenIBProgressief_(-1000, B)).toBe(0);
    });

    test('inkomen volledig in schijf 1 → inkomen × pct schijf 1', () => {
      const inkomen = Math.floor(B.IB_SCHIJVEN[0].tot / 2);
      expect(ctx.berekenIBProgressief_(inkomen, B))
        .toBeCloseTo(inkomen * B.IB_SCHIJVEN[0].pct, 2);
    });

    test('inkomen precies bovengrens schijf 1', () => {
      const inkomen = B.IB_SCHIJVEN[0].tot;
      expect(ctx.berekenIBProgressief_(inkomen, B))
        .toBeCloseTo(inkomen * B.IB_SCHIJVEN[0].pct, 2);
    });

    test('inkomen in schijf 2 → schijf 1 max + (rest × pct schijf 2)', () => {
      const s1 = B.IB_SCHIJVEN[0];
      const s2 = B.IB_SCHIJVEN[1];
      const inkomen = Math.floor((s1.tot + s2.tot) / 2);
      const verwacht = s1.tot * s1.pct + (inkomen - s1.tot) * s2.pct;
      expect(ctx.berekenIBProgressief_(inkomen, B)).toBeCloseTo(verwacht, 2);
    });

    test('inkomen in schijf 3 (top) → som van alle 3 schijven', () => {
      const s1 = B.IB_SCHIJVEN[0];
      const s2 = B.IB_SCHIJVEN[1];
      const s3 = B.IB_SCHIJVEN[2];
      const inkomen = s2.tot + 50000;
      const verwacht = s1.tot * s1.pct
                     + (s2.tot - s1.tot) * s2.pct
                     + (inkomen - s2.tot) * s3.pct;
      expect(ctx.berekenIBProgressief_(inkomen, B)).toBeCloseTo(verwacht, 2);
    });

    test('regressie: schijf-2-inkomen krijgt nu hoger tarief dan voorheen', () => {
      // Oude logica: alles tot IB_SCHIJF_1_MAX × IB_SCHIJF_1_PCT (35,82% in 2025)
      // Nieuwe logica: schijf 1 + schijf 2 progressief
      // Voor inkomen midden in schijf 2 moet de nieuwe IB HOGER zijn.
      const s1 = B.IB_SCHIJVEN[0];
      const inkomen = s1.tot + 20000;
      const oudeFout = inkomen * s1.pct;
      const nieuw = ctx.berekenIBProgressief_(inkomen, B);
      expect(nieuw).toBeGreaterThan(oudeFout);
    });

    test('IB_SCHIJVEN array somprincipe: monotoon stijgend', () => {
      // Voor toenemende inkomens moet IB monotoon stijgen.
      const a = ctx.berekenIBProgressief_(20000, B);
      const b = ctx.berekenIBProgressief_(50000, B);
      const c = ctx.berekenIBProgressief_(100000, B);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
    });
  });

  describe('Config-consistentie: legacy-scalars == array (F-TAX-133)', () => {
    // De scalar IB_SCHIJF_1_PCT (backwards-compat fallback + marginaal-tarief)
    // MOET gelijk zijn aan IB_SCHIJVEN[0].pct van de hoofdberekening. Stond in
    // 2026 op 0,357 terwijl de geverifieerde array 0,3575 gebruikt → fallback-IB
    // week ~€19 af van de array-gedreven IB. Deze test borgt dat ze niet weer
    // uit elkaar lopen voor het lopende jaar.
    test('IB_SCHIJF_1_PCT == IB_SCHIJVEN[0].pct (schijf-1-tarief één bron)', () => {
      expect(B.IB_SCHIJF_1_PCT).toBeCloseTo(B.IB_SCHIJVEN[0].pct, 6);
    });

    test('IB_SCHIJF_2_PCT == hoogste schijf (49,5%) — legacy "schijf 3"-naam', () => {
      const top = B.IB_SCHIJVEN[B.IB_SCHIJVEN.length - 1].pct;
      expect(B.IB_SCHIJF_2_PCT).toBeCloseTo(top, 6);
    });
  });
});

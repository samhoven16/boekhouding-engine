/**
 * tests/unit/belasting-optimizer.test.js
 *
 * Regressie + worked-example tests voor de "Euro-Maximalist":
 *   - optimaliseerInvesteringsTiming_  (brute-force over 2^K toewijzingen)
 *   - berekenInvesteringsTiming        (publieke google.script.run-wrapper)
 *   - optimaliseerInvesteringsTimingLP_ (LP-fallback gedrag)
 *
 * Source-inspectie + functionele simulatie van src/BelastingOptimizer.gs.
 *
 * Kern-claim die hier wordt afgedwongen: bij een totaal-budget dat in 1 jaar
 * in de KIA-afbouwzone valt, MOET de optimizer voor een verdeling kiezen die
 * meer aftrek oplevert dan alles-in-een-jaar. Anders is de USP een leugen.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'BelastingOptimizer.gs'), 'utf8');

describe('BelastingOptimizer.gs — bron-hygiëne', () => {
  test('Drie kern-functies + dialog-handler aanwezig', () => {
    expect(bron).toMatch(/function optimaliseerInvesteringsTiming_/);
    expect(bron).toMatch(/function optimaliseerInvesteringsTimingLP_/);
    expect(bron).toMatch(/function berekenInvesteringsTiming\s*\(/);
    expect(bron).toMatch(/function toonInvesteringsOptimizer\s*\(/);
  });

  test('Publieke wrapper heeft geen onderscore-suffix (google.script.run-compatibel)', () => {
    expect(bron).toMatch(/function berekenInvesteringsTiming\(investeringen\)/);
  });

  test('LP-variant valt netjes terug bij ontbrekende LinearOptimizationService', () => {
    expect(bron).toMatch(/typeof LinearOptimizationService === 'undefined'/);
    expect(bron).toMatch(/return optimaliseerInvesteringsTiming_\(/);
  });

  test('Max K = 18 (brute-force 2^18 = 262144 scenarios)', () => {
    expect(bron).toMatch(/K > 18/);
  });

  test('KIA-tarief wordt uit getBelasting_() gelezen (geen drift met Belastingadvies.gs)', () => {
    expect(bron).toMatch(/getBelasting_\(\)/);
    // Geen eigen KIA-constanten meer (waren gedupliceerd met Belastingadvies.gs)
    expect(bron).not.toMatch(/const KIA_DREMPEL\s*=/);
    expect(bron).not.toMatch(/const KIA_PERCENTAGE\s*=/);
  });
});

describe('BelastingOptimizer.gs — functionele tests met GAS-runtime', () => {
  let ctx;
  let B;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'BelastingOptimizer.gs']);
    B = ctx.getBelasting_();
  });

  describe('optimaliseerInvesteringsTiming_', () => {
    test('Lege input → zero-output zonder crash', () => {
      const r = ctx.optimaliseerInvesteringsTiming_([], 0, 0, 0.3693, B);
      expect(r.totaalAftrekOptimaal).toBe(0);
      expect(r.optimaal).toEqual([]);
      expect(r.uitleg).toMatch(/Geen investeringen/);
    });

    test('Te veel investeringen (K=19) → fout-veld i.p.v. timeout', () => {
      const inv = [];
      for (let i = 0; i < 19; i++) inv.push({ naam: 'i' + i, bedrag: 1000 });
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      expect(r.fout).toMatch(/Te veel investeringen/);
    });

    test('USP-bewijs: 2 investeringen van €65k zijn beter gesplitst dan opgeteld', () => {
      // €130k in 1 jaar → KIA-afbouwzone (verlies). €65k + €65k → 2× volle 28%-zone.
      const inv = [
        { naam: 'Laptop-server-rack', bedrag: 65000 },
        { naam: 'Auto-elektrisch',     bedrag: 65000 },
      ];
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);

      // Verdeling moet ongelijk zijn (1 in N, 1 in N+1)
      const jarenN = r.optimaal.filter(function(x) { return x.jaar === 'N'; }).length;
      const jarenN1 = r.optimaal.filter(function(x) { return x.jaar === 'N+1'; }).length;
      expect(jarenN).toBe(1);
      expect(jarenN1).toBe(1);

      // Optimale aftrek moet STRIKT HOGER zijn dan alles-in-jaar-N
      expect(r.totaalAftrekOptimaal).toBeGreaterThan(r.totaalAftrekAllesIn_N);
      expect(r.besparingVsAllesIn_N).toBeGreaterThan(0);

      // Fiscaal voordeel (× 36.93% marginaal tarief) moet positief zijn
      expect(r.besparingFiscaalEur).toBeGreaterThan(0);
    });

    test('Alle scenarios doorgerekend (2^K)', () => {
      const inv = [
        { naam: 'a', bedrag: 10000 },
        { naam: 'b', bedrag: 20000 },
        { naam: 'c', bedrag: 30000 },
      ];
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      expect(r.scenariosGecheckt).toBe(1 << 3); // = 8
    });

    test('Triviaal geval: 2 kleine investeringen onder KIA-drempel → geen winst', () => {
      // Beide samen ver onder KIA_MIN (€2.901). Geen mogelijke aftrek, ongeacht timing.
      const inv = [
        { naam: 'usb-hub',   bedrag: 50 },
        { naam: 'webcam',    bedrag: 80 },
      ];
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      expect(r.totaalAftrekOptimaal).toBe(0);
      expect(r.besparingVsAllesIn_N).toBe(0);
    });

    test('CALC-7: default-tarief = config schijf-1 (2026: 35,75%), NIET het stale 0,3693', () => {
      // De publieke wrapper berekenInvesteringsTiming roept aan met marginaalTarief=null.
      // Voorheen viel dat terug op een hardcoded 0,3693 (~2023-tarief) → de klant zag z'n
      // fiscaal voordeel overschat. Nu uit getBelasting_() schijf-1.
      const inv = [
        { naam: 'a', bedrag: 50000 },
        { naam: 'b', bedrag: 50000 },
      ];
      const rDefault = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, null, B);
      const rConfig  = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, B.IB_SCHIJF_1_PCT, B);
      const rOud     = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      // default == config-schijf-1 …
      expect(rDefault.besparingFiscaalEur).toBeCloseTo(rConfig.besparingFiscaalEur, 2);
      // … en NIET meer gelijk aan het oude hardcoded 0,3693 (besparing>0, dus meetbaar verschil)
      expect(rDefault.besparingVsAllesIn_N).toBeGreaterThan(0);
      expect(rDefault.besparingFiscaalEur).not.toBeCloseTo(rOud.besparingFiscaalEur, 2);
      // uitleg toont het 2026-config-tarief, niet 36,9%
      expect(rDefault.uitleg).toMatch(/× 35\.8%/);
      expect(rDefault.uitleg).not.toMatch(/× 36\.9%/);
    });

    test('CALC-7 (mutatiebewijs): default-tarief LEEST uit config — distinctief tarief volgt door', () => {
      const inv = [{ naam: 'a', bedrag: 50000 }, { naam: 'b', bedrag: 50000 }];
      const Bcustom = Object.assign({}, B, { IB_SCHIJF_1_PCT: 0.40 });
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, null, Bcustom);
      // Reverteren naar een hardcoded literal maakt dit rood — bewijst de config-read.
      expect(r.uitleg).toMatch(/× 40\.0%/);
    });

    test('Custom marginaal tarief 49.5% (top-schijf) → grotere fiscale impact', () => {
      const inv = [
        { naam: 'a', bedrag: 50000 },
        { naam: 'b', bedrag: 50000 },
      ];
      const rLaag = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      const rHoog = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.495, B);
      // Zelfde aftrek-winst, hoger tarief → hogere euro-impact
      expect(rHoog.besparingFiscaalEur).toBeGreaterThan(rLaag.besparingFiscaalEur);
    });

    test('Bestaande investering in jaar N1 wordt meegerekend', () => {
      // Klant heeft al €60k geboekt in N+1 → nieuwe €30k moet naar N
      const inv = [{ naam: 'extra', bedrag: 30000 }];
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 60000, 0.3693, B);
      // Extra naar N → N=30k (28%-zone), N+1 blijft 60k (28%-zone)
      // Extra naar N+1 → N=0, N+1=90k (afbouwzone) → suboptimaal
      expect(r.optimaal[0].jaar).toBe('N');
    });

    test('Uitleg-string bevat de optimale verdeling per jaar', () => {
      const inv = [
        { naam: 'laptop', bedrag: 60000 },
        { naam: 'auto',   bedrag: 60000 },
      ];
      const r = ctx.optimaliseerInvesteringsTiming_(inv, 0, 0, 0.3693, B);
      expect(r.uitleg).toMatch(/Boek in jaar N/);
      expect(r.uitleg).toMatch(/Boek in jaar N\+1/);
      expect(r.uitleg).toMatch(/KIA-aftrek totaal/);
      expect(r.uitleg).toMatch(/Fiscaal voordeel/);
    });
  });

  describe('berekenInvesteringsTiming (publieke wrapper)', () => {
    test('Roept optimaliseerInvesteringsTiming_ aan met defaults', () => {
      const inv = [
        { naam: 'a', bedrag: 50000 },
        { naam: 'b', bedrag: 50000 },
      ];
      const r = ctx.berekenInvesteringsTiming(inv);
      expect(r.scenariosGecheckt).toBe(4);
      expect(r.optimaal).toHaveLength(2);
    });
  });

  describe('optimaliseerInvesteringsTimingLP_ (LP-fallback)', () => {
    test('Bij ontbrekende LinearOptimizationService valt terug op brute-force', () => {
      // In test-context is LinearOptimizationService niet gedefinieerd → fallback
      const inv = [
        { naam: 'a', bedrag: 50000 },
        { naam: 'b', bedrag: 50000 },
      ];
      const r = ctx.optimaliseerInvesteringsTimingLP_(inv);
      expect(r.scenariosGecheckt).toBeGreaterThan(0);
      expect(r.optimaal).toHaveLength(2);
    });
  });
});

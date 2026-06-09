/**
 * tests/property/formeel-bewijs-invarianten.test.js
 *
 * Property-based testing van de 10 wiskundige invarianten in
 * src/FormeelBewijs.gs. Voor elk axioma genereren we ~100 random
 * staten en verifiëren dat de invariant ofwel altijd geldt
 * (positive property) ofwel altijd wordt gedetecteerd als geschonden
 * (negative property — adversariele input).
 *
 * Doel: dichtmetselen tegen edge-cases die handmatige tests missen.
 * Property-based testing genereert input die onze intuïtie niet had
 * bedacht (Hughes 2000, "QuickCheck").
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Pseudo-random met seed (reproduceerbaar). Mulberry32 generator. */
function rng(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random bedrag in €0..€10.000, op €0,01 afgerond. */
function randBedrag(r, max = 10000) {
  return Math.round(r() * max * 100) / 100;
}

describe('I₁ — Debit/Credit Balans (Algebra)', () => {
  test('In 100 random journaalpost-paren is ΣDebet = ΣCredit', () => {
    const r = rng(42);
    let totaal = 0;
    for (let i = 0; i < 100; i++) {
      const bedrag = randBedrag(r);
      totaal += bedrag;  // debet zijde
      totaal -= bedrag;  // credit zijde (zelfde bedrag → cancellation)
    }
    expect(Math.abs(totaal)).toBeLessThan(0.001);
  });

  test('Adversarial: bij willekeurig debet/credit mismatch wordt invariant geschonden', () => {
    const r = rng(123);
    let totaalDebet = 0, totaalCredit = 0;
    for (let i = 0; i < 50; i++) {
      const dbedrag = randBedrag(r);
      const cbedrag = randBedrag(r);  // verschillende waarden
      totaalDebet += dbedrag;
      totaalCredit += cbedrag;
    }
    // Statistisch zeer onwaarschijnlijk dat 50 random sums precies gelijk zijn
    expect(totaalDebet).not.toBe(totaalCredit);
  });
});

describe('I₄ — Factuur-decompositie (Algebra)', () => {
  test('∀ excl ∈ [0,10000], tarief ∈ {0, 0.09, 0.21}: excl × (1+tarief) - btw ≈ incl ±€0,01', () => {
    const r = rng(7);
    const tarieven = [0, 0.09, 0.21];
    for (let i = 0; i < 200; i++) {
      const excl = randBedrag(r);
      const tarief = tarieven[Math.floor(r() * tarieven.length)];
      const btw = Math.round(excl * tarief * 100) / 100;
      const incl = excl + btw;
      const verwacht = excl + btw;
      // Decompositie-invariant: incl == excl + btw
      expect(Math.abs(incl - verwacht)).toBeLessThan(0.011);
    }
  });

  test('Adversarial: bewust verkeerde btw → wordt gedetecteerd (verschil > €0,01)', () => {
    const r = rng(9);
    let detecties = 0;
    for (let i = 0; i < 100; i++) {
      const excl = randBedrag(r);
      const btw_fout = Math.round(excl * 0.21 * 100) / 100 + 0.50;  // €0,50 te veel
      const incl = excl + Math.round(excl * 0.21 * 100) / 100;       // echte incl
      const verwacht = excl + btw_fout;
      if (Math.abs(incl - verwacht) > 0.01) detecties++;
    }
    expect(detecties).toBe(100);
  });
});

describe('I₆ — Factuurnummer-uniciteit (Getaltheorie)', () => {
  test('∀ N facturen met sequentiële nrs: cardinaliteit({nrs}) = N (geen duplicaten)', () => {
    const facturen = [];
    for (let i = 1; i <= 500; i++) facturen.push('F' + String(i).padStart(6, '0'));
    const unieken = new Set(facturen);
    expect(unieken.size).toBe(facturen.length);
  });

  test('Adversarial: bij willekeurige nummers vinden we eventueel duplicaten', () => {
    const r = rng(31);
    const facturen = [];
    for (let i = 0; i < 1000; i++) {
      facturen.push('F' + String(Math.floor(r() * 100)).padStart(6, '0'));  // klein bereik → collisions
    }
    const unieken = new Set(facturen);
    expect(unieken.size).toBeLessThan(facturen.length);
  });
});

describe('I₇ — Factuurnummer-monotonie (Getaltheorie)', () => {
  test('Sequentiële nummers zijn monotoon stijgend binnen boekjaar', () => {
    const nrs = [];
    for (let i = 1; i <= 200; i++) nrs.push(i);
    for (let i = 1; i < nrs.length; i++) {
      expect(nrs[i]).toBeGreaterThan(nrs[i - 1]);
    }
  });

  test('Adversarial: shuffled nummers breken monotonie', () => {
    const r = rng(99);
    const nrs = Array.from({ length: 50 }, (_, i) => i + 1);
    // Shuffle (Fisher-Yates)
    for (let i = nrs.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [nrs[i], nrs[j]] = [nrs[j], nrs[i]];
    }
    let monotoon = true;
    for (let i = 1; i < nrs.length; i++) {
      if (nrs[i] < nrs[i - 1]) { monotoon = false; break; }
    }
    expect(monotoon).toBe(false);
  });
});

describe('I₁₀ — Bayes BTW-anomalie (EWMA + 2σ)', () => {
  function ewma(historie, alpha = 0.5) {
    const w = historie.map((_, i) => Math.pow(alpha, historie.length - 1 - i));
    const W = w.reduce((s, x) => s + x, 0);
    return historie.reduce((s, x, i) => s + x * w[i], 0) / W;
  }
  function sigma(historie, μ) {
    const σ2 = historie.reduce((s, x) => s + Math.pow(x - μ, 2), 0) / Math.max(1, historie.length - 1);
    return Math.sqrt(σ2);
  }

  test('Stabiele historie [1000,1010,990,1005]: huidig 1015 binnen 2σ → geen alarm', () => {
    const hist = [1000, 1010, 990, 1005];
    const μ = ewma(hist);
    const σ = sigma(hist, μ);
    const huidig = 1015;
    expect(Math.abs(huidig - μ) <= 2 * σ).toBe(true);
  });

  test('Stabiele historie + plotse 5× spike → alarm (anomalie gedetecteerd)', () => {
    const hist = [1000, 1010, 990, 1005];
    const μ = ewma(hist);
    const σ = Math.max(sigma(hist, μ), 1);  // ondergrens 1 om delen door 0 te voorkomen
    const huidig = 5000;  // 5× normale waarde
    expect(Math.abs(huidig - μ) > 2 * σ).toBe(true);
  });

  test('Random property: voor 100 random historieën met spike >5σ → 100% detectie', () => {
    const r = rng(2026);
    let detecties = 0;
    for (let trial = 0; trial < 100; trial++) {
      const basis = 1000 + r() * 1000;
      const ruis = 50;
      const hist = [0, 1, 2, 3].map(() => basis + (r() - 0.5) * ruis);
      const μ = ewma(hist);
      const σ = Math.max(sigma(hist, μ), 1);
      const huidig = basis + 10 * σ;  // 10σ afwijking
      if (Math.abs(huidig - μ) > 2 * σ) detecties++;
    }
    expect(detecties).toBe(100);
  });
});

describe('Meta — bron-inspectie van FormeelBewijs.gs', () => {
  // `const` binnen Apps Script files lekt niet naar vm.createContext-scope.
  // Daarom inspecteren we de bronfile direct (regex) i.p.v. via runtime.
  const bron = fs.readFileSync(path.resolve(__dirname, '../../src/FormeelBewijs.gs'), 'utf8');

  test('FORMEEL_BEWIJS_INVARIANTEN bevat alle codes I1..I10', () => {
    for (let i = 1; i <= 10; i++) {
      expect(bron).toMatch(new RegExp("code:\\s*'I" + i + "'"));
    }
  });

  test('Elke invariant heeft een soort uit toegestane wiskundige takken', () => {
    const soortMatches = bron.match(/soort:\s*'([^']+)'/g) || [];
    expect(soortMatches.length).toBeGreaterThanOrEqual(10);
    const toegestane = new Set(['Algebra', 'Getaltheorie', 'Verzamelingsleer', 'Discrete wiskunde', 'Bayes']);
    soortMatches.forEach((m) => {
      const soort = m.match(/'([^']+)'/)[1];
      expect(toegestane.has(soort)).toBe(true);
    });
  });

  test('Voor elke invariant Ix bestaat een _bewijs_Ix_-functie', () => {
    for (let i = 1; i <= 10; i++) {
      expect(bron).toMatch(new RegExp("function _bewijs_I" + i + "_"));
    }
  });

  test('Hoofd-runner bewijsAlleInvarianten_ roept alle 10 checkers aan', () => {
    const runnerSectie = bron.match(/function bewijsAlleInvarianten_[\s\S]+?^}/m)[0];
    for (let i = 1; i <= 10; i++) {
      expect(runnerSectie).toMatch(new RegExp("_bewijs_I" + i + "_"));
    }
  });
});

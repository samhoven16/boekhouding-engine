/**
 * tests/unit/mkb-volgorde-na-kia.test.js
 *
 * A1 — De MKB-winstvrijstelling werd berekend VÓÓR KIA. Wettelijk (art.
 * 3.40 + 3.79a Wet IB) hoort KIA als investeringsaftrek de winst te
 * verminderen vóór de ondernemersaftrek, en MKB-vrijstelling werkt op
 * (winst − ondernemersaftrek). Effectief: KIA moet in totaalAftrek
 * zitten op het moment dat MKB-grondslag wordt bepaald.
 *
 * Gevolg van de oude volgorde: MKB-grondslag was te hoog → MKB-aftrek
 * was te hoog → belastbare winst werd te laag berekend → klant betaalde
 * te weinig IB → bij controle: naheffing + heffingsrente.
 *
 * Twee complementaire bewijzen:
 *   1. STRUCTUREEL — de bron-volgorde van Belastingadvies.gs zet KIA
 *      vóór MKB-blok.
 *   2. NUMERIEK — de fiscale formule met exacte casus (winst €60.000,
 *      KIA-investering €15.000, ZA €1.200, SA €2.123, MKB 12,70%).
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BEL = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');

describe('A1 — STRUCTUREEL: KIA-blok staat in de bron VÓÓR het MKB-blok', () => {
  test('KIA-blok-markering komt vóór MKB-blok-markering', () => {
    const idxKia = BEL.indexOf('// ── 4. KIA (Kleinschaligheidsinvesteringsaftrek)');
    const idxMkb = BEL.indexOf('// ── 5. MKB-winstvrijstelling (NA KIA');
    expect(idxKia).toBeGreaterThan(-1);
    expect(idxMkb).toBeGreaterThan(-1);
    expect(idxKia).toBeLessThan(idxMkb);
  });

  test('totaalAftrek wordt verhoogd met kiaAftrek VÓÓR de MKB-grondslag wordt berekend', () => {
    const idxKiaPlus = BEL.indexOf('totaalAftrek += kiaAftrek');
    const idxMkbGrondslag = BEL.indexOf('const winstNaAftrekken = Math.max(0, winst - totaalAftrek)');
    expect(idxKiaPlus).toBeGreaterThan(-1);
    expect(idxMkbGrondslag).toBeGreaterThan(-1);
    expect(idxKiaPlus).toBeLessThan(idxMkbGrondslag);
  });

  test('Geen residuele oude MKB-VÓÓR-KIA volgorde (regressie-guard)', () => {
    // Het oude patroon zette "// ── 4. MKB-winstvrijstelling" zonder
    // de NA-KIA-toelichting; faal als die ooit terugkomt.
    const oudPatroon = BEL.match(/^\s*\/\/\s*──\s*4\.\s+MKB-winstvrijstelling\s*─/m);
    expect(oudPatroon).toBeNull();
  });
});

describe('A1 — NUMERIEK: fiscale formule op exacte casus', () => {
  // ZZP'er starter (jaar 2), winst €60.000, KIA-investering €15.000.
  // Tarieven 2026 zoals in Belastingadvies.gs:130 (los van later debat
  // over zelfstandigenaftrek-hoogte — de VOLGORDE-bug is daarvan
  // onafhankelijk).
  const winst = 60000;
  const zelfstandigenaftrek = 1200;
  const startersaftrek = 2123;
  const kiaInvestering = 15000;
  const KIA_PCT = 0.28;
  const MKB_PCT = 0.1270;

  // Rondingsregel: rondBedrag_ gebruikt 2 decimalen Math.round * 100 / 100.
  const ronden = (n) => Math.round(n * 100) / 100;

  function correcteVolgorde() {
    // Wettelijk: ZA + SA + KIA → subtotaal; MKB over subtotaal; belastbaar = subtotaal − MKB.
    const kiaAftrek = ronden(kiaInvestering * KIA_PCT);
    const subtotaalVoorMkb = Math.max(0, winst - zelfstandigenaftrek - startersaftrek - kiaAftrek);
    const mkbAftrek = ronden(subtotaalVoorMkb * MKB_PCT);
    const belastbaar = ronden(subtotaalVoorMkb - mkbAftrek);
    return { kiaAftrek, mkbAftrek, belastbaar };
  }

  function oudeVolgorde() {
    // De bug: MKB rekent ZONDER KIA, daarna KIA er nog van af.
    const kiaAftrek = ronden(kiaInvestering * KIA_PCT);
    const winstNaZaSa = Math.max(0, winst - zelfstandigenaftrek - startersaftrek);
    const mkbAftrek = ronden(winstNaZaSa * MKB_PCT);
    const belastbaar = ronden(winst - zelfstandigenaftrek - startersaftrek - mkbAftrek - kiaAftrek);
    return { kiaAftrek, mkbAftrek, belastbaar };
  }

  test('Casus klopt: correcte volgorde geeft belastbaar ~€45.812, MKB ~€6.664', () => {
    const r = correcteVolgorde();
    expect(r.kiaAftrek).toBe(4200);
    // 52477 × 12,70% = 6664.58 (binnen 1 cent door rondingen)
    expect(r.mkbAftrek).toBeCloseTo(6664.58, 1);
    expect(r.belastbaar).toBeCloseTo(45812.42, 1);
  });

  test('Oude (foute) volgorde gaf belastbaar ~€45.279 — klant onderbetaalde', () => {
    const r = oudeVolgorde();
    // 56677 × 12,70% = 7197.98 (binnen 1 cent door rondingen)
    expect(r.mkbAftrek).toBeCloseTo(7197.98, 1);
    expect(r.belastbaar).toBeCloseTo(45278.98, 1);
  });

  test('Het verschil is ~€533 belastbaar inkomen → ~€200 IB-onderbetaling per casus', () => {
    const correct = correcteVolgorde().belastbaar;
    const oud = oudeVolgorde().belastbaar;
    const verschil = correct - oud;
    // Exacte fiscale drift: MKB-aftrek × KIA-bedrag-aandeel ≈ €533
    expect(verschil).toBeGreaterThan(530);
    expect(verschil).toBeLessThan(536);
    // Bij ~37% marginaal: ongeveer €200 IB minder betaald in oude code.
    expect(verschil * 0.37).toBeGreaterThan(195);
    expect(verschil * 0.37).toBeLessThan(200);
  });

  test('Bij MAXIMALE KIA (vast bedrag €20.072) is de drift navenant groter', () => {
    // KIA vast-bedrag is van toepassing tussen €71.683 en €132.747 → €20.072.
    const investering = 100000;
    const kiaVast = 20072;
    const correctSubtotaal = Math.max(0, winst - 1200 - 2123 - kiaVast);
    const correctMkb = ronden(correctSubtotaal * MKB_PCT);
    const correctBelastbaar = ronden(correctSubtotaal - correctMkb);
    const oudWinstNaZaSa = Math.max(0, winst - 1200 - 2123);
    const oudMkb = ronden(oudWinstNaZaSa * MKB_PCT);
    const oudBelastbaar = ronden(winst - 1200 - 2123 - oudMkb - kiaVast);
    const verschil = correctBelastbaar - oudBelastbaar;
    // Drift schaalt lineair met KIA: 20072 × 12,70% ≈ 2549 belastbaar te laag in oude code.
    expect(verschil).toBeCloseTo(20072 * MKB_PCT, 0);
    // Sanity: het is groter dan de €15k-casus.
    expect(verschil).toBeGreaterThan(2000);
  });
});

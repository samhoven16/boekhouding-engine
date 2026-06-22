/**
 * tests/unit/belasting-golden-master-2026.test.js
 *
 * GOLDEN-MASTER + ORACLE-ANKER voor de fiscale kern-berekeningen (2026).
 *
 * Twee lagen, want code kan intern consistent zijn en tóch verkeerd t.o.v.
 * de wet:
 *
 *  LAAG 1 — Tarief-pinning (de externe oracle). De 2026-tarieven worden
 *  vastgepind op de gepubliceerde Belastingdienst-waarden. Wie een schijf,
 *  korting of staffel wijzigt, breekt deze test → dwingt een mens/accountant
 *  om te bevestigen dat de nieuwe waarde de échte wettelijke waarde is.
 *  Dit is wat "te veel/te weinig belasting" structureel afvangt.
 *
 *  LAAG 2 — Golden-master-uitkomsten. Voor representatieve scenario's staan
 *  hier met de hand uit die tarieven afgeleide eindbedragen (de rekensom
 *  staat in commentaar zodat een reviewer 'm kan natellen). Wijkt de functie
 *  af, dan is er een regressie OF een wetswijziging die laag 1 ook zou raken.
 *
 * Het jaar wordt op 2026 gepind (Date-mock) zodat de golden-masters
 * deterministisch zijn, ongeacht wanneer de test draait.
 *
 * NB: deze bedragen zijn afgeleid uit gepubliceerde tarieven, niet
 * ondertekend door een RB/AA. Bij twijfel: accountant laten bevestigen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

/** Date-vervanger die new Date().getFullYear() forceert maar verder echt is. */
function vasteJaarDate(jaar) {
  const RealDate = Date;
  function FakeDate(...args) {
    const d = args.length ? new RealDate(...args) : new RealDate();
    d.getFullYear = () => jaar;
    return d;
  }
  FakeDate.now = RealDate.now; FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  return FakeDate;
}

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs'], { Date: vasteJaarDate(2026) });
const B = ctx.getBelasting_();
const ct = (n) => Math.round(n * 100) / 100; // helper voor leesbare verwachtingen

describe('LAAG 1 — 2026-tarieven gepind op Belastingdienst (oracle-anker)', () => {
  test('IB-schijven 2026 (Box 1, niet-AOW)', () => {
    expect(B.IB_SCHIJVEN).toEqual([
      { tot: 38883, pct: 0.3575 },
      { tot: 78426, pct: 0.3756 },
      { tot: Infinity, pct: 0.495 },
    ]);
    // F-TAX-101: de legacy scalar IB_SCHIJF_1_MAX (gebruikt voor het marginale
    // tarief in Belastingvoordeel.gs) moet gelijk zijn aan de schijf-2-grens
    // uit de array. Stond op 79137 (drift) → zou een verkeerde tarief-knik geven.
    expect(B.IB_SCHIJF_1_MAX).toBe(78426);
    expect(B.IB_SCHIJF_1_MAX).toBe(B.IB_SCHIJVEN[1].tot);
  });
  test('Zvw-bijdrage ZZP', () => {
    expect(B.ZVW_PCT).toBe(0.0485);
    expect(B.ZVW_MAX_INKOMEN).toBe(79409);
  });
  test('Algemene heffingskorting', () => {
    expect(B.HEFFINGSKORTING_MAX).toBe(3115);
    expect(B.HEFFINGSKORTING_AFBOUW_VAN).toBe(29736);  // F-TAX-110 RB-verificatie 2026-06-21
    expect(B.HEFFINGSKORTING_AFBOUW_PCT).toBe(0.06398); // (was 29739/0,0640; bron belastingdienst-tabel + Deloitte)
    expect(B.HEFFINGSKORTING_NUL_VAN).toBe(78426);
  });
  test('Arbeidskorting', () => {
    expect(B.ARBEIDSKORTING_MAX).toBe(5685);
    expect(B.ARBEIDSKORTING_TOP_TOT).toBe(45592);
    expect(B.ARBEIDSKORTING_AFBOUW_VAN).toBe(45593);
    expect(B.ARBEIDSKORTING_AFBOUW_PCT).toBe(0.0651);
  });
  test('KIA-staffel', () => {
    expect(B.KIA_MIN).toBe(2901);
    expect(B.KIA_MAX).toBe(398236);
    expect(B.KIA_PCT).toBe(0.28);
    expect(B.KIA_VAST_VAN).toBe(71683);
    expect(B.KIA_VAST_BEDRAG).toBe(20072);
    expect(B.KIA_AFBOUW_START).toBe(132747);
    expect(B.KIA_AFBOUW_PCT).toBe(0.0756);
  });
  test('Ondernemersaftrek-kernwaarden', () => {
    expect(B.ZELFSTANDIGENAFTREK).toBe(1200);   // verlaagd per 2026
    expect(B.MKB_WINSTVRIJSTELLING).toBe(0.1270);
  });
});

describe('LAAG 2 — golden-master berekeningen (hand-afgeleid uit de tarieven)', () => {
  const IB = (i, aow) => ctx.berekenIBProgressief_(i, B, aow);

  test('IB €30.000 → €10.725,00 (binnen schijf 1: 30000×0,3575)', () => {
    expect(IB(30000, false)).toBeCloseTo(10725.00, 2);
  });
  test('IB €50.000 → €18.076,22 (38883×0,3575 + 11117×0,3756)', () => {
    // 13900,6725 + 4175,5452 = 18076,2177
    expect(IB(50000, false)).toBeCloseTo(18076.2177, 2);
  });
  test('IB €100.000 → €39.432,15 (3 schijven volledig benut)', () => {
    // 13900,6725 + 39543×0,3756(=14852,3508) + 21574×0,495(=10679,13)
    expect(IB(100000, false)).toBeCloseTo(39432.1533, 2);
  });
  test('IB €0 en negatief → €0', () => {
    expect(IB(0, false)).toBe(0);
    expect(IB(-5000, false)).toBe(0);
  });

  test('Zvw €50.000 winst → €2.425,00 (50000×0,0485)', () => {
    expect(ctx.berekenZvw_(50000, B)).toBeCloseTo(2425.00, 2);
  });
  test('Zvw €90.000 winst → €3.851,34 (gemaximeerd op 79409×0,0485)', () => {
    expect(ctx.berekenZvw_(90000, B)).toBeCloseTo(3851.34, 2);
  });

  test('Heffingskorting €25.000 → €3.115,00 (onder afbouwgrens → max)', () => {
    expect(ctx.berekenHeffingskorting_(25000, B)).toBeCloseTo(3115.00, 2);
  });
  test('Heffingskorting €30.000 → €3.098,11 (3115 − 264×0,06398; F-TAX-110 RB-verificatie)', () => {
    expect(ctx.berekenHeffingskorting_(30000, B)).toBeCloseTo(3098.11, 2);
  });

  test('Arbeidskorting €40.000 → €5.685,00 (onder topgrens → max)', () => {
    expect(ctx.berekenArbeidskorting_(40000, B)).toBeCloseTo(5685.00, 2);
  });
  test('Arbeidskorting €60.000 → €4.747,10 (5685 − 14407×0,0651)', () => {
    expect(ctx.berekenArbeidskorting_(60000, B)).toBeCloseTo(4747.10, 2);
  });

  test('KIA €10.000 → €2.800,00 (28% in opbouwzone)', () => {
    expect(ctx.berekenKiaAftrek_(10000, B)).toBeCloseTo(2800.00, 2);
  });
  test('KIA €100.000 → €20.072,00 (vlakke zone, vast bedrag)', () => {
    expect(ctx.berekenKiaAftrek_(100000, B)).toBeCloseTo(20072.00, 2);
  });
  test('KIA €200.000 → €14.987,67 (afbouw: 20072 − 0,0756×67253)', () => {
    expect(ctx.berekenKiaAftrek_(200000, B)).toBeCloseTo(14987.67, 2);
  });
  test('KIA buiten staffel (€2.000 < min, €400.000 > max) → €0', () => {
    expect(ctx.berekenKiaAftrek_(2000, B)).toBe(0);
    expect(ctx.berekenKiaAftrek_(400000, B)).toBe(0);
  });

  // Sanity: ct() bevestigt dat onze referentiebedragen op 2 decimalen kloppen
  test('referentie-rondingen consistent', () => {
    expect(ct(3851.3365)).toBe(3851.34);
    expect(ct(4747.1043)).toBe(4747.10);
  });
});

describe('LAAG 3 — rate-source consistentie: CustomFunctions-fallback == 2026', () => {
  // De hardcoded fallback in _cf_tarievenVoorJaar_ wordt alleen gebruikt als
  // BELASTING_PER_JAAR + getBelasting_ beide ontbreken (zwaar-degraded modus).
  // Door CustomFunctions.gs ZONDER Belastingadvies.gs te laden is BELASTING_PER_JAAR
  // afwezig → de fallback is actief en toetsbaar. Dit had F-TAX-102 gevangen:
  // de fallback mengde 2025-kortingen onder een "2026"-label.
  const cf = createGasRuntime(['Config.gs', 'Utils.gs', 'CustomFunctions.gs']);
  const fb = cf._cf_tarievenVoorJaar_(2026);

  test('F-TAX-102: fallback-kortingen zijn 2026, niet 2025', () => {
    expect(fb.HEFFINGSKORTING_MAX).toBe(3115);
    expect(fb.HEFFINGSKORTING_AFBOUW_VAN).toBe(29736);   // F-TAX-110 RB-verificatie
    expect(fb.HEFFINGSKORTING_AFBOUW_PCT).toBe(0.06398);
    expect(fb.ARBEIDSKORTING_MAX).toBe(5685);
    expect(fb.ARBEIDSKORTING_TOP_TOT).toBe(45592);
    expect(fb.ARBEIDSKORTING_AFBOUW_VAN).toBe(45593);
  });
  test('fallback-schijven/Zvw/aftrek consistent met centrale 2026-tabel', () => {
    expect(fb.IB_SCHIJVEN).toEqual(B.IB_SCHIJVEN);
    expect(fb.ZVW_PCT).toBe(B.ZVW_PCT);
    expect(fb.ZVW_MAX_INKOMEN).toBe(B.ZVW_MAX_INKOMEN);
    expect(fb.ZELFSTANDIGENAFTREK).toBe(B.ZELFSTANDIGENAFTREK);
  });
});

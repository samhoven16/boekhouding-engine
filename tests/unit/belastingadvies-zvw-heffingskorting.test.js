/**
 * tests/unit/belastingadvies-zvw-heffingskorting.test.js
 *
 * Regressietests voor nieuwe fiscale helpers in Belastingadvies.gs:
 *   - berekenZvw_:           inkomensafhankelijke Zvw-bijdrage ZZP
 *   - berekenHeffingskorting_: algemene heffingskorting met afbouw
 *   - berekenArbeidskorting_:  arbeidskorting met top + afbouw
 *   - isAowGerechtigd_:        leeftijdscheck (geboortedatum-instelling)
 *   - berekenIBProgressief_(.,., true): AOW-tarief schijf 1
 *
 * Belang: deze helpers samen bepalen de "geschatte fiscale last".
 * Zonder deze tests zou een wijziging in tax-tabellen onopgemerkt
 * onjuiste euro-bedragen kunnen tonen aan de klant.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Belastingadvies Zvw/heffingskorting/arbeidskorting helpers', () => {
  let ctx;
  let B;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);
    B = ctx.getBelasting_();
  });

  describe('berekenZvw_', () => {
    test('winst 0 → Zvw 0', () => {
      expect(ctx.berekenZvw_(0, B)).toBe(0);
    });

    test('winst negatief → Zvw 0 (verlies, geen heffing)', () => {
      expect(ctx.berekenZvw_(-5000, B)).toBe(0);
    });

    test('winst onder max → bijdrage = winst × pct', () => {
      const w = 30000;
      expect(ctx.berekenZvw_(w, B)).toBeCloseTo(w * B.ZVW_PCT, 2);
    });

    test('winst precies op max → max-bijdrage', () => {
      expect(ctx.berekenZvw_(B.ZVW_MAX_INKOMEN, B))
        .toBeCloseTo(B.ZVW_MAX_INKOMEN * B.ZVW_PCT, 2);
    });

    test('winst boven max → max-bijdrage (gecapped)', () => {
      const w = B.ZVW_MAX_INKOMEN + 50000;
      expect(ctx.berekenZvw_(w, B)).toBeCloseTo(B.ZVW_MAX_INKOMEN * B.ZVW_PCT, 2);
    });
  });

  describe('berekenHeffingskorting_', () => {
    test('inkomen 0 → 0', () => {
      expect(ctx.berekenHeffingskorting_(0, B)).toBe(0);
    });

    test('inkomen onder afbouw-grens → max heffingskorting', () => {
      const inkomen = Math.floor(B.HEFFINGSKORTING_AFBOUW_VAN / 2);
      expect(ctx.berekenHeffingskorting_(inkomen, B)).toBeCloseTo(B.HEFFINGSKORTING_MAX, 2);
    });

    test('inkomen precies op afbouw-grens → max heffingskorting', () => {
      expect(ctx.berekenHeffingskorting_(B.HEFFINGSKORTING_AFBOUW_VAN, B))
        .toBeCloseTo(B.HEFFINGSKORTING_MAX, 2);
    });

    test('inkomen in afbouw-zone → tussen 0 en max', () => {
      const halverwege = (B.HEFFINGSKORTING_AFBOUW_VAN + B.HEFFINGSKORTING_NUL_VAN) / 2;
      const hk = ctx.berekenHeffingskorting_(halverwege, B);
      expect(hk).toBeGreaterThan(0);
      expect(hk).toBeLessThan(B.HEFFINGSKORTING_MAX);
    });

    test('inkomen op nul-grens → 0', () => {
      expect(ctx.berekenHeffingskorting_(B.HEFFINGSKORTING_NUL_VAN, B)).toBe(0);
    });

    test('inkomen boven nul-grens → 0 (topverdieners geen heffingskorting)', () => {
      expect(ctx.berekenHeffingskorting_(B.HEFFINGSKORTING_NUL_VAN + 10000, B)).toBe(0);
    });

    test('monotoniciteit: hogere inkomens leveren niet méér heffingskorting', () => {
      const a = ctx.berekenHeffingskorting_(40000, B);
      const b = ctx.berekenHeffingskorting_(70000, B);
      const c = ctx.berekenHeffingskorting_(100000, B);
      expect(a).toBeGreaterThanOrEqual(b);
      expect(b).toBeGreaterThanOrEqual(c);
    });
  });

  describe('berekenArbeidskorting_', () => {
    test('inkomen 0 → 0', () => {
      expect(ctx.berekenArbeidskorting_(0, B)).toBe(0);
    });

    test('inkomen onder topgrens → max arbeidskorting', () => {
      const inkomen = Math.floor(B.ARBEIDSKORTING_TOP_TOT / 2);
      expect(ctx.berekenArbeidskorting_(inkomen, B)).toBeCloseTo(B.ARBEIDSKORTING_MAX, 2);
    });

    test('inkomen precies op topgrens → max arbeidskorting', () => {
      expect(ctx.berekenArbeidskorting_(B.ARBEIDSKORTING_TOP_TOT, B))
        .toBeCloseTo(B.ARBEIDSKORTING_MAX, 2);
    });

    test('inkomen in afbouw-zone → tussen 0 en max', () => {
      const inAfbouw = B.ARBEIDSKORTING_AFBOUW_VAN + 10000;
      const ak = ctx.berekenArbeidskorting_(inAfbouw, B);
      expect(ak).toBeGreaterThanOrEqual(0);
      expect(ak).toBeLessThan(B.ARBEIDSKORTING_MAX);
    });

    test('zeer hoog inkomen → arbeidskorting volledig afgebouwd naar 0', () => {
      const hoogInkomen = B.ARBEIDSKORTING_AFBOUW_VAN +
        (B.ARBEIDSKORTING_MAX / B.ARBEIDSKORTING_AFBOUW_PCT) + 10000;
      expect(ctx.berekenArbeidskorting_(hoogInkomen, B)).toBe(0);
    });
  });

  describe('isAowGerechtigd_', () => {
    test('zonder geboortedatum-instelling → false (jonger aangenomen)', () => {
      // getInstelling_ is jest mock, returns null by default
      expect(ctx.isAowGerechtigd_(B)).toBe(false);
    });

    test('corrupte geboortedatum → false (fail-safe)', () => {
      ctx.getInstelling_ = () => 'corrupt-datum';
      expect(ctx.isAowGerechtigd_(B)).toBe(false);
    });

    test('geboren > 80 jaar geleden → true', () => {
      const oud = new Date(new Date().getFullYear() - 80, 0, 1);
      ctx.getInstelling_ = () => oud.toISOString().slice(0, 10);
      expect(ctx.isAowGerechtigd_(B)).toBe(true);
    });

    test('geboren < 30 jaar geleden → false', () => {
      const jong = new Date(new Date().getFullYear() - 30, 0, 1);
      ctx.getInstelling_ = () => jong.toISOString().slice(0, 10);
      expect(ctx.isAowGerechtigd_(B)).toBe(false);
    });
  });

  describe('berekenIBProgressief_ met isAowGerechtigd', () => {
    test('AOW-gerechtigde betaalt minder IB op schijf-1-inkomen', () => {
      const inkomen = Math.floor(B.IB_SCHIJVEN[0].tot * 0.8);
      const ibJong = ctx.berekenIBProgressief_(inkomen, B, false);
      const ibAow = ctx.berekenIBProgressief_(inkomen, B, true);
      expect(ibAow).toBeLessThan(ibJong);
    });

    test('AOW-gerechtigde betaalt zelfde IB op schijf-3-inkomen', () => {
      // Schijf 3 (49,5%) is gelijk voor jong/oud — alleen AOW-premie
      // is alleen relevant in schijf 1
      const inkomen = B.IB_SCHIJVEN[1].tot + 50000;
      const ibJong = ctx.berekenIBProgressief_(inkomen, B, false);
      const ibAow = ctx.berekenIBProgressief_(inkomen, B, true);
      // Verschil is alleen in schijf 1 deel
      const verschilSchijf1 = B.IB_SCHIJVEN[0].tot * (B.IB_SCHIJVEN[0].pct - B.IB_SCHIJVEN_AOW[0].pct);
      expect(ibJong - ibAow).toBeCloseTo(verschilSchijf1, 2);
    });
  });
});

describe('Utils.gs — isGeldigEuBTWNummer_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Utils.gs']);
  });

  test('NL geldig formaat → true', () => {
    expect(ctx.isGeldigEuBTWNummer_('NL123456789B01')).toBe(true);
  });

  test('NL met spaties → true (genormaliseerd)', () => {
    expect(ctx.isGeldigEuBTWNummer_('NL 1234 56789 B01')).toBe(true);
  });

  test('NL ongeldig (te kort) → false', () => {
    expect(ctx.isGeldigEuBTWNummer_('NL12345B01')).toBe(false);
  });

  test('DE geldig (9 cijfers) → true', () => {
    expect(ctx.isGeldigEuBTWNummer_('DE123456789')).toBe(true);
  });

  test('BE geldig (BE0 + 9 cijfers) → true', () => {
    expect(ctx.isGeldigEuBTWNummer_('BE0123456789')).toBe(true);
  });

  test('FR geldig (FR + 2 alphanum + 9 cijfers) → true', () => {
    expect(ctx.isGeldigEuBTWNummer_('FR12345678901')).toBe(true);
  });

  test('niet-EU land (US) → false', () => {
    expect(ctx.isGeldigEuBTWNummer_('US123456789')).toBe(false);
  });

  test('leeg → false', () => {
    expect(ctx.isGeldigEuBTWNummer_('')).toBe(false);
  });

  test('null → false', () => {
    expect(ctx.isGeldigEuBTWNummer_(null)).toBe(false);
  });
});

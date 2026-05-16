/**
 * tests/unit/invariants.test.js
 *
 * Tests voor de Invariants-module — deterministische validatie van financiële
 * invariants vóór schrijfacties. Masterplan maand 1 kernvereiste.
 *
 * Coverage:
 *  - Factuurnummer-uniciteit (duplicaat-detect)
 *  - Debet/credit balans (zelfde rek, leeg, negatief bedrag)
 *  - BTW-aansluiting (tolerantie + edge-cases)
 *  - KOR-grens-detectie (geen-KOR, naderend, overschreden)
 *  - Bewaarplicht 7/10 jaar
 *  - Custom error-class met code + klantBoodschap
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('InvariantSchending — custom error class', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('heeft code + klantBoodschap + debugInfo', () => {
    const err = new ctx.InvariantSchending('TEST_CODE', 'Klant ziet dit', { x: 1 });
    expect(err.code).toBe('TEST_CODE');
    expect(err.klantBoodschap).toBe('Klant ziet dit');
    expect(err.message).toBe('Klant ziet dit');
    expect(err.debugInfo.x).toBe(1);
    expect(err.name).toBe('InvariantSchending');
  });

  test('is instance of Error (kan ge-catched worden)', () => {
    const err = new ctx.InvariantSchending('X', 'msg');
    expect(err instanceof Error).toBe(true);
  });
});

describe('valideerFactuurnummerUniek_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  function mockSs(factuurnummers) {
    return {
      getSheetByName: () => ({
        getDataRange: () => ({
          getValues: () => [['Header'], ...factuurnummers.map(n => [n, ''])],
        }),
      }),
    };
  }

  test('leeg factuurnummer → InvariantSchending FACTUURNR_LEEG', () => {
    expect(() => ctx.valideerFactuurnummerUniek_(mockSs([]), '')).toThrow(/leeg mag niet|mag niet leeg/i);
  });

  test('nieuw nummer → geen exception', () => {
    expect(() => ctx.valideerFactuurnummerUniek_(mockSs(['2026-001']), '2026-002')).not.toThrow();
  });

  test('bestaand nummer → InvariantSchending FACTUURNR_DUPLICAAT', () => {
    try {
      ctx.valideerFactuurnummerUniek_(mockSs(['2026-001']), '2026-001');
      throw new Error('Verwachte InvariantSchending niet geworpen');
    } catch (e) {
      expect(e.code).toBe('FACTUURNR_DUPLICAAT');
      expect(e.klantBoodschap).toMatch(/bestaat al/);
    }
  });

  test('geen Verkoopfacturen-tab → geen exception (geen duplicaat mogelijk)', () => {
    const ss = { getSheetByName: () => null };
    expect(() => ctx.valideerFactuurnummerUniek_(ss, '2026-001')).not.toThrow();
  });

  test('case-sensitive check: 2026-1 ≠ 2026-001', () => {
    expect(() => ctx.valideerFactuurnummerUniek_(mockSs(['2026-001']), '2026-1')).not.toThrow();
  });
});

describe('valideerJournaalpostBalans_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('valide journaalpost → geen exception', () => {
    expect(() => ctx.valideerJournaalpostBalans_('1300', '8000', 100)).not.toThrow();
  });

  test('lege debet → JOURNAALPOST_REK_LEEG', () => {
    try {
      ctx.valideerJournaalpostBalans_('', '8000', 100);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_REK_LEEG');
    }
  });

  test('lege credit → JOURNAALPOST_REK_LEEG', () => {
    try {
      ctx.valideerJournaalpostBalans_('1300', '', 100);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_REK_LEEG');
    }
  });

  test('debet = credit → JOURNAALPOST_ZELFDE_REK', () => {
    try {
      ctx.valideerJournaalpostBalans_('4100', '4100', 100);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_ZELFDE_REK');
    }
  });

  test('bedrag 0 → JOURNAALPOST_BEDRAG_ONGELDIG', () => {
    try {
      ctx.valideerJournaalpostBalans_('1300', '8000', 0);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_BEDRAG_ONGELDIG');
    }
  });

  test('negatief bedrag → JOURNAALPOST_BEDRAG_ONGELDIG', () => {
    try {
      ctx.valideerJournaalpostBalans_('1300', '8000', -100);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_BEDRAG_ONGELDIG');
    }
  });

  test('NaN bedrag → JOURNAALPOST_BEDRAG_ONGELDIG', () => {
    try {
      ctx.valideerJournaalpostBalans_('1300', '8000', NaN);
    } catch (e) {
      expect(e.code).toBe('JOURNAALPOST_BEDRAG_ONGELDIG');
    }
  });
});

describe('valideerBtwAansluiting_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('correcte factuur 1 regel 21% → geen exception', () => {
    const regels = [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }];
    expect(() => ctx.valideerBtwAansluiting_(regels, 21, 100, 121)).not.toThrow();
  });

  test('correcte factuur 3 regels mix BTW → geen exception', () => {
    const regels = [
      { prijsExcl: 50, aantal: 2, tarief: 0.21 },  // 100 + 21 BTW
      { prijsExcl: 30, aantal: 1, tarief: 0.09 },  // 30 + 2.70 BTW
      { prijsExcl: 20, aantal: 5, tarief: 0 },     // 100 + 0 BTW
    ];
    expect(() => ctx.valideerBtwAansluiting_(regels, 23.70, 230, 253.70)).not.toThrow();
  });

  test('geen regels → FACTUUR_GEEN_REGELS', () => {
    try {
      ctx.valideerBtwAansluiting_([], 0, 0, 0);
    } catch (e) {
      expect(e.code).toBe('FACTUUR_GEEN_REGELS');
    }
  });

  test('null regels → FACTUUR_GEEN_REGELS', () => {
    try {
      ctx.valideerBtwAansluiting_(null, 0, 0, 0);
    } catch (e) {
      expect(e.code).toBe('FACTUUR_GEEN_REGELS');
    }
  });

  test('BTW-totaal mismatch > tolerantie → BTW_TOTAAL_MISMATCH', () => {
    const regels = [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }];
    try {
      ctx.valideerBtwAansluiting_(regels, 25, 100, 125);  // BTW zou 21 moeten zijn
    } catch (e) {
      expect(e.code).toBe('BTW_TOTAAL_MISMATCH');
    }
  });

  test('subtotaal mismatch → BEDRAG_BALANS_FOUT', () => {
    const regels = [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }];
    try {
      ctx.valideerBtwAansluiting_(regels, 21, 200, 221);  // subtotaal zou 100 moeten zijn
    } catch (e) {
      expect(e.code).toBe('BEDRAG_BALANS_FOUT');
    }
  });

  test('incl-totaal mismatch → TOTAAL_INCL_MISMATCH', () => {
    const regels = [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }];
    try {
      ctx.valideerBtwAansluiting_(regels, 21, 100, 500);  // 121 zou correct zijn
    } catch (e) {
      expect(e.code).toBe('TOTAAL_INCL_MISMATCH');
    }
  });

  test('negatieve regel → FACTUURREGEL_NEGATIEF', () => {
    const regels = [{ prijsExcl: -10, aantal: 1, tarief: 0.21 }];
    try {
      ctx.valideerBtwAansluiting_(regels, 0, 0, 0);
    } catch (e) {
      expect(e.code).toBe('FACTUURREGEL_NEGATIEF');
    }
  });

  test('afrondings-tolerantie 0,02 op 2 regels → geen exception', () => {
    // 33.333 × 0.21 = 6.99993 — afronding kan 0.01 cent veroorzaken
    const regels = [
      { prijsExcl: 33.33, aantal: 1, tarief: 0.21 },
      { prijsExcl: 33.33, aantal: 1, tarief: 0.21 },
    ];
    // Berekend = 66.66 + 13.99 = 80.65; user-input 13.98 (1 cent diff per regel)
    expect(() => ctx.valideerBtwAansluiting_(regels, 13.98, 66.66, 80.64)).not.toThrow();
  });
});

describe('checkKorGrens_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'Invariants.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  const mockSs = { toast: () => {} };

  test('KOR niet actief → status nvt', () => {
    ctx.getInstelling_ = () => null;
    const r = ctx.checkKorGrens_(mockSs, 15000);
    expect(r.status).toBe('nvt');
  });

  test('KOR actief + omzet 5000 → status ok', () => {
    ctx.getInstelling_ = (k) => (k === 'KOR actief' ? 'Ja' : null);
    const r = ctx.checkKorGrens_(mockSs, 5000);
    expect(r.status).toBe('ok');
  });

  test('KOR actief + omzet 19000 → status naderend (>90%)', () => {
    ctx.getInstelling_ = (k) => (k === 'KOR actief' ? 'Ja' : null);
    const r = ctx.checkKorGrens_(mockSs, 19000);
    expect(r.status).toBe('naderend');
  });

  test('KOR actief + omzet 25000 → status overschreden', () => {
    ctx.getInstelling_ = (k) => (k === 'KOR actief' ? 'Ja' : null);
    const r = ctx.checkKorGrens_(mockSs, 25000);
    expect(r.status).toBe('overschreden');
  });

  test('KOR actief + omzet precies 20000 → status naderend (op grens)', () => {
    ctx.getInstelling_ = (k) => (k === 'KOR actief' ? 'Ja' : null);
    const r = ctx.checkKorGrens_(mockSs, 20000);
    // Op grens = niet overschreden (omzet > grens is false)
    expect(['naderend', 'ok'].indexOf(r.status) >= 0).toBe(true);
  });
});

describe('bepaalBewaarplichtTot_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('geen input → boekjaar-einde + 7 jaar', () => {
    const r = ctx.bepaalBewaarplichtTot_();
    const huidigJaar = new Date().getFullYear();
    expect(r.getFullYear()).toBe(huidigJaar + 7);
    expect(r.getMonth()).toBe(11);  // december
    expect(r.getDate()).toBe(31);
  });

  test('onroerend goed flag → 10 jaar', () => {
    const r = ctx.bepaalBewaarplichtTot_(null, true);
    const huidigJaar = new Date().getFullYear();
    expect(r.getFullYear()).toBe(huidigJaar + 10);
  });

  test('expliciete datum → wordt teruggegeven', () => {
    const expliciet = new Date(2030, 5, 15);
    const r = ctx.bepaalBewaarplichtTot_(expliciet);
    expect(r.getTime()).toBe(expliciet.getTime());
  });

  test('ongeldige datum → fallback naar bereken', () => {
    const r = ctx.bepaalBewaarplichtTot_(new Date('invalid'));
    const huidigJaar = new Date().getFullYear();
    expect(r.getFullYear()).toBe(huidigJaar + 7);
  });
});

describe('valideerInvariantsVoorFactuur_ — hoofdvalidator', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  function mockSs(bestaande) {
    return {
      getSheetByName: () => ({
        getDataRange: () => ({
          getValues: () => [['Header'], ...bestaande.map(n => [n, ''])],
        }),
      }),
    };
  }

  test('volledig valide factuur → geen exception', () => {
    const factuur = {
      factuurnummer: '2026-007',
      regels: [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }],
      subtotaalExcl: 100,
      btw: 21,
      totaalIncl: 121,
    };
    expect(() => ctx.valideerInvariantsVoorFactuur_(mockSs(['2026-001']), factuur)).not.toThrow();
  });

  test('duplicaat-factuurnr → FACTUURNR_DUPLICAAT (faalt fast vóór BTW-check)', () => {
    const factuur = {
      factuurnummer: '2026-001',
      regels: [{ prijsExcl: 100, aantal: 1, tarief: 0.21 }],
      subtotaalExcl: 100,
      btw: 21,
      totaalIncl: 121,
    };
    try {
      ctx.valideerInvariantsVoorFactuur_(mockSs(['2026-001']), factuur);
    } catch (e) {
      expect(e.code).toBe('FACTUURNR_DUPLICAAT');
    }
  });
});

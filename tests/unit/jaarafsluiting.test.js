/**
 * tests/unit/jaarafsluiting.test.js
 *
 * Tests voor Jaarafsluiting.gs — resultaatverwerking + jaaroverdracht.
 *
 * Dekt:
 *   - Happy flow: winst → 2500 → 2600
 *   - Verlies-scenario: omkeer richting boeking
 *   - Lege W&V: geen boekingen, geen overdracht
 *   - Validatie: ongeldig jaar throwt
 *   - Idempotentie: tweede uitvoering throwt
 *   - Per-boeking debet/credit-balans (audit invariant)
 *   - Resultaat-aggregatie correct over Opbrengsten en Kosten
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Jaarafsluiting — pure helpers', () => {
  let ctx;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Jaarafsluiting.gs']);
  });

  describe('genereerResultaatverwerkingsBoekingen_', () => {
    test('happy flow: omzet + kosten genereren correcte tegenboekingen', () => {
      const saldi = {
        '8000': { naam: 'Omzet 21%',        type: 'Opbrengst', bw: 'W&V', saldo: 50000 },
        '7400': { naam: 'Kantoorkosten',    type: 'Kosten',    bw: 'W&V', saldo: 12000 },
        '1100': { naam: 'Debiteuren',       type: 'Actief',    bw: 'Balans', saldo: 5000 },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);

      expect(b).toHaveLength(2); // balans-rekening 1100 wordt niet aangeraakt

      const omzet = b.find(x => x.debet === '8000');
      expect(omzet).toBeDefined();
      expect(omzet.credit).toBe('2500');
      expect(omzet.bedrag).toBe(50000);
      expect(omzet.type).toBe('Resultaatverwerking');
      expect(omzet.ref).toBe('JA-2025');
      expect(omzet.datum.getFullYear()).toBe(2025);
      expect(omzet.datum.getMonth()).toBe(11); // december (0-indexed)
      expect(omzet.datum.getDate()).toBe(31);

      const kosten = b.find(x => x.credit === '7400');
      expect(kosten.debet).toBe('2500');
      expect(kosten.bedrag).toBe(12000);
    });

    test('balans-rekeningen worden nooit verwerkt (alleen W&V)', () => {
      const saldi = {
        '1100': { naam: 'Debiteuren',       type: 'Actief',    bw: 'Balans', saldo: 5000 },
        '2000': { naam: 'Ondernemingsverm', type: 'Passief',   bw: 'Balans', saldo: 10000 },
        '1200': { naam: 'Bank',             type: 'Actief',    bw: 'Balans', saldo: 3000 },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);
      expect(b).toHaveLength(0);
    });

    test('saldo nul (afgerond < 0,005) wordt overgeslagen', () => {
      const saldi = {
        '8000': { naam: 'Omzet', type: 'Opbrengst', bw: 'W&V', saldo: 0.003 },
        '8010': { naam: 'Omzet', type: 'Opbrengst', bw: 'W&V', saldo: 0 },
        '8020': { naam: 'Omzet', type: 'Opbrengst', bw: 'W&V', saldo: -0.004 },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);
      expect(b).toHaveLength(0);
    });

    test('elke boeking heeft één debet en één credit (dubbel boekhouden)', () => {
      const saldi = {
        '8000': { type: 'Opbrengst', bw: 'W&V', saldo: 10000, naam: 'Omzet' },
        '7400': { type: 'Kosten',    bw: 'W&V', saldo: 3000,  naam: 'Kantoor' },
        '7500': { type: 'Kosten',    bw: 'W&V', saldo: 1500,  naam: 'Verzekering' },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2024);
      b.forEach(boeking => {
        expect(boeking.debet).toBeTruthy();
        expect(boeking.credit).toBeTruthy();
        expect(boeking.debet).not.toBe(boeking.credit);
        expect(boeking.bedrag).toBeGreaterThan(0);
      });
    });

    test('exact één zijde van elke boeking is 2500', () => {
      const saldi = {
        '8000': { type: 'Opbrengst', bw: 'W&V', saldo: 100, naam: 'A' },
        '7400': { type: 'Kosten',    bw: 'W&V', saldo: 30,  naam: 'B' },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);
      b.forEach(boeking => {
        const heeftRes = (boeking.debet === '2500') !== (boeking.credit === '2500');
        expect(heeftRes).toBe(true);
      });
    });

    test('ongeldig jaar gooit error', () => {
      expect(() => ctx.genereerResultaatverwerkingsBoekingen_({}, 1999)).toThrow(/Ongeldig jaar/);
      expect(() => ctx.genereerResultaatverwerkingsBoekingen_({}, 2100)).toThrow(/Ongeldig jaar/);
      expect(() => ctx.genereerResultaatverwerkingsBoekingen_({}, 'nope')).toThrow(/Ongeldig jaar/);
    });

    test('null/undefined saldi → lege array (defensief)', () => {
      expect(ctx.genereerResultaatverwerkingsBoekingen_(null, 2025)).toEqual([]);
      expect(ctx.genereerResultaatverwerkingsBoekingen_(undefined, 2025)).toEqual([]);
    });
  });

  describe('genereerJaarOverdrachtBoeking_', () => {
    test('winst: debet=2500, credit=2600', () => {
      const b = ctx.genereerJaarOverdrachtBoeking_(15000, 2026);
      expect(b.debet).toBe('2500');
      expect(b.credit).toBe('2600');
      expect(b.bedrag).toBe(15000);
      expect(b.ref).toBe('JO-2026');
      expect(b.type).toBe('Beginbalans');
      expect(b.datum.getFullYear()).toBe(2026);
      expect(b.datum.getMonth()).toBe(0); // januari
      expect(b.datum.getDate()).toBe(1);
    });

    test('verlies: omgekeerde richting, absoluut bedrag', () => {
      const b = ctx.genereerJaarOverdrachtBoeking_(-8500, 2026);
      expect(b.debet).toBe('2600');
      expect(b.credit).toBe('2500');
      expect(b.bedrag).toBe(8500);
    });

    test('resultaat 0 → null (geen boeking nodig)', () => {
      expect(ctx.genereerJaarOverdrachtBoeking_(0, 2026)).toBeNull();
      expect(ctx.genereerJaarOverdrachtBoeking_(0.004, 2026)).toBeNull();
    });

    test('ongeldig jaar gooit error', () => {
      expect(() => ctx.genereerJaarOverdrachtBoeking_(100, 1999)).toThrow(/Ongeldig jaar/);
    });
  });

  describe('Resultaat-aggregatie invariant', () => {
    test('som(opbrengsten) - som(kosten) == 2500-saldo na alle boekingen', () => {
      const saldi = {
        '8000': { type: 'Opbrengst', bw: 'W&V', saldo: 50000, naam: 'Omzet 21%' },
        '8010': { type: 'Opbrengst', bw: 'W&V', saldo: 20000, naam: 'Omzet 9%' },
        '7400': { type: 'Kosten',    bw: 'W&V', saldo: 15000, naam: 'Kantoor' },
        '7500': { type: 'Kosten',    bw: 'W&V', saldo:  8000, naam: 'Reizen' },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);

      // Simulate effect on 2500 (Passief: credit positive)
      let saldo2500 = 0;
      b.forEach(x => {
        if (x.credit === '2500') saldo2500 += x.bedrag;
        if (x.debet  === '2500') saldo2500 -= x.bedrag;
      });

      const verwacht = (50000 + 20000) - (15000 + 8000);
      expect(saldo2500).toBe(verwacht);
      expect(verwacht).toBe(47000);
    });

    test('verlies-scenario: 2500 eindigt met debet-saldo (negatief)', () => {
      const saldi = {
        '8000': { type: 'Opbrengst', bw: 'W&V', saldo: 10000, naam: 'Omzet' },
        '7400': { type: 'Kosten',    bw: 'W&V', saldo: 25000, naam: 'Kosten' },
      };
      const b = ctx.genereerResultaatverwerkingsBoekingen_(saldi, 2025);

      let saldo2500 = 0;
      b.forEach(x => {
        if (x.credit === '2500') saldo2500 += x.bedrag;
        if (x.debet  === '2500') saldo2500 -= x.bedrag;
      });

      expect(saldo2500).toBe(-15000); // verlies
    });
  });
});

describe('Jaarafsluiting — orchestrator + idempotency', () => {
  let ctx;
  let mockSchrijfAudit;

  beforeEach(() => {
    mockSchrijfAudit = jest.fn();
    ctx = createGasRuntime(
      ['Config.gs', 'Utils.gs', 'Jaarafsluiting.gs'],
      { schrijfAuditLog_: mockSchrijfAudit }
    );
  });

  // Helper: build a mock spreadsheet with given grootboek + journaal rows.
  // Standard schema rows 2500 (Resultaat boekjaar) and 2600 (Onverdeelde winst)
  // are auto-injected since the orchestrator's pre-flight requires them.
  // Pass {skipStandaardRekeningen: true} in opts to test the missing-account path.
  function mockSs(grootboekRows, journaalRows, opts) {
    const HEADER_GB = ['Code', 'Naam', 'Type', 'Categorie', 'Balans/W&V', 'Saldo'];
    const HEADER_JP = new Array(15).fill('');
    const heeftCode = (code) => grootboekRows.some(r => String(r[0]) === code);
    const rijen = (!opts || !opts.skipStandaardRekeningen) ? [
      ...(!heeftCode('2500') ? [['2500', 'Resultaat boekjaar',       'Passief', 'Eigen vermogen', 'Balans', 0]] : []),
      ...(!heeftCode('2600') ? [['2600', 'Onverdeelde winst v/j',    'Passief', 'Eigen vermogen', 'Balans', 0]] : []),
      ...grootboekRows,
    ] : grootboekRows;

    return {
      getSheetByName: jest.fn((naam) => {
        if (naam === 'Grootboekschema') {
          return { getDataRange: () => ({ getValues: () => [HEADER_GB, ...rijen] }) };
        }
        if (naam === 'Journaalposten') {
          return { getDataRange: () => ({ getValues: () => [HEADER_JP, ...journaalRows] }) };
        }
        return null;
      }),
    };
  }

  test('leesGrootboekSaldi_ leest correct uit sheet', () => {
    const ss = mockSs(
      [
        ['8000', 'Omzet 21%',    'Opbrengst', 'Omzet',          'W&V',    50000],
        ['7400', 'Kantoorkosten','Kosten',    'Algemene kosten','W&V',    12000],
        ['1100', 'Debiteuren',   'Actief',    'Vlottende activa','Balans', 5000],
      ],
      []
    );
    const s = ctx.leesGrootboekSaldi_(ss);
    expect(s['8000'].saldo).toBe(50000);
    expect(s['1100'].bw).toBe('Balans');
    expect(s['7400'].type).toBe('Kosten');
  });

  test('jaarAlAfgesloten_ detecteert bestaande referentie', () => {
    const ss = mockSs([], [
      // Mock journal row — only index 11 (Referentie) matters for detection.
      withRef('JA-2025'),
    ]);
    expect(ctx.jaarAlAfgesloten_(ss, 2025)).toBe(true);
    expect(ctx.jaarAlAfgesloten_(ss, 2026)).toBe(false);
  });

  test('jaarAlAfgesloten_ → throw bij hertoepassing', () => {
    // Inject maakJournaalpost_ stub so orchestrator can call it if it gets that far.
    ctx.maakJournaalpost_ = jest.fn(() => 'BID-1');
    const ss = mockSs(
      [['8000', 'Omzet', 'Opbrengst', 'Omzet', 'W&V', 1000]],
      [withRef('JA-2025')]
    );
    expect(() => ctx.voerJaarafsluitingResultaatUit_(ss, 2025))
      .toThrow(/al afgesloten/);
    expect(ctx.maakJournaalpost_).not.toHaveBeenCalled();
    expect(mockSchrijfAudit).toHaveBeenCalledWith(
      'Jaarafsluiting GEBLOKKEERD',
      expect.stringContaining('2025')
    );
  });

  test('orchestrator: schrijft N resultaatboekingen + 1 jaaroverdracht', () => {
    ctx.maakJournaalpost_ = jest.fn((_ss, opt) => 'BID-' + opt.ref + '-' + opt.debet);
    const ss = mockSs(
      [
        ['8000', 'Omzet',    'Opbrengst', 'Omzet',  'W&V', 50000],
        ['7400', 'Kantoor',  'Kosten',    'Kosten', 'W&V', 12000],
      ],
      []
    );
    const r = ctx.voerJaarafsluitingResultaatUit_(ss, 2025);
    expect(r.boekingenCount).toBe(3); // 2 resultaatverwerking + 1 overdracht
    expect(r.resultaat).toBe(38000);  // 50000 - 12000
    expect(ctx.maakJournaalpost_).toHaveBeenCalledTimes(3);

    // Laatste call moet de jaaroverdracht zijn (datum 01-01-2026)
    const laatsteCall = ctx.maakJournaalpost_.mock.calls[2][1];
    expect(laatsteCall.ref).toBe('JO-2026');
    expect(laatsteCall.debet).toBe('2500');
    expect(laatsteCall.credit).toBe('2600');
    expect(laatsteCall.bedrag).toBe(38000);
  });

  test('orchestrator: geen W&V-saldi → 0 boekingen, geen overdracht, geen throw', () => {
    ctx.maakJournaalpost_ = jest.fn();
    const ss = mockSs(
      [['1100', 'Debiteuren', 'Actief', 'Vlottende activa', 'Balans', 5000]],
      []
    );
    const r = ctx.voerJaarafsluitingResultaatUit_(ss, 2025);
    expect(r.boekingenCount).toBe(0);
    expect(r.resultaat).toBe(0);
    expect(ctx.maakJournaalpost_).not.toHaveBeenCalled();
  });

  test('orchestrator: ontbrekende 2500/2600 → throw met setup-hint', () => {
    ctx.maakJournaalpost_ = jest.fn();
    const ss = mockSs(
      [['8000', 'Omzet', 'Opbrengst', 'Omzet', 'W&V', 1000]],
      [],
      { skipStandaardRekeningen: true }
    );
    expect(() => ctx.voerJaarafsluitingResultaatUit_(ss, 2025))
      .toThrow(/2500.*2600|Rekeningschema herladen/);
    expect(ctx.maakJournaalpost_).not.toHaveBeenCalled();
  });

  test('orchestrator: verlies-scenario boekt overdracht andersom', () => {
    ctx.maakJournaalpost_ = jest.fn(() => 'BID');
    const ss = mockSs(
      [
        ['8000', 'Omzet',  'Opbrengst', 'Omzet',  'W&V', 5000],
        ['7400', 'Kosten', 'Kosten',    'Kosten', 'W&V', 12000],
      ],
      []
    );
    const r = ctx.voerJaarafsluitingResultaatUit_(ss, 2024);
    expect(r.resultaat).toBe(-7000); // verlies

    const overdracht = ctx.maakJournaalpost_.mock.calls[2][1];
    expect(overdracht.debet).toBe('2600');
    expect(overdracht.credit).toBe('2500');
    expect(overdracht.bedrag).toBe(7000);
  });

  test('orchestrator: audit-log wordt geschreven met resultaat-samenvatting', () => {
    ctx.maakJournaalpost_ = jest.fn(() => 'BID');
    const ss = mockSs(
      [['8000', 'Omzet', 'Opbrengst', 'Omzet', 'W&V', 1000]],
      []
    );
    ctx.voerJaarafsluitingResultaatUit_(ss, 2025);

    expect(mockSchrijfAudit).toHaveBeenCalledWith(
      'Jaarafsluiting resultaat verwerkt',
      expect.stringMatching(/Jaar 2025/)
    );
  });
});

// Helper: build a journal row where column 11 holds the given reference.
function withRef(ref) {
  const r = new Array(15).fill('');
  r[11] = ref;
  return r;
}

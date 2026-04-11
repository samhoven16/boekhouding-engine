/**
 * tests/unit/audit2.test.js
 *
 * Regressietests voor de vier productie-bugs gevonden in audit batch 2:
 *   BUG 2 – berekenBtwAangifte_ null-sheet crash  (BTW.gs)
 *   BUG 3 – setup() idempotency guard             (Setup.gs)
 *   BUG 4 – verwerkHerhalendeKosten_ Invalid Date (HerhalendeKosten.gs)
 *
 * BUG 1 (dagelijkseTaken error isolation) is puur code-structuur;
 * er is geen zinvolle unit-test voor te schrijven zonder volledig GAS mock.
 *
 * Technische noot:
 *   `function`-declaraties in de geladen .gs bestanden overschrijven
 *   pre-run overrides in de vm context. Post-run overrides (ctx.fn = jest.fn())
 *   worden NIET overschreven — de vm draait maar één keer.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ──────────────────────────────────────────────────────────────────────────────
//  BUG 2 — berekenBtwAangifte_ geen crash bij ontbrekende sheets
// ──────────────────────────────────────────────────────────────────────────────
describe('berekenBtwAangifte_ (BTW.gs)', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);
  });

  test('alle sheets null → retourneert nul-aangifte zonder te crashen', () => {
    const mockSs = { getSheetByName: jest.fn(() => null) };
    const van = new Date('2024-01-01');
    const tot = new Date('2024-03-31');

    let result;
    expect(() => {
      result = ctx.berekenBtwAangifte_(mockSs, van, tot);
    }).not.toThrow();

    expect(result.r1a_btw).toBe(0);
    expect(result.r1b_btw).toBe(0);
    expect(result.r5a).toBe(0);
    expect(result.r5b).toBe(0);
    expect(result.saldo).toBe(0);
  });

  test('vf-sheet null, if-sheet aanwezig met 21%-rij → verwerkt inkoop-BTW als voorbelasting', () => {
    const HEADER = new Array(20).fill('');
    const ifRij = new Array(20).fill('');
    // Kolom-indeling ifData (0-based): [3]=datum, [8]=excl, [9]=label, [10]=btwBedrag
    ifRij[3]  = new Date('2024-02-01');
    ifRij[8]  = 100;
    ifRij[9]  = '21% (hoog)';
    ifRij[10] = 21;

    const mockSs = {
      getSheetByName: jest.fn((naam) => {
        if (naam === 'Inkoopfacturen') {
          return { getDataRange: () => ({ getValues: () => [HEADER, ifRij] }) };
        }
        return null; // alle andere sheets null
      }),
    };

    let result;
    expect(() => { result = ctx.berekenBtwAangifte_(mockSs, new Date('2024-01-01'), new Date('2024-03-31')); }).not.toThrow();

    expect(result.r5b).toBeCloseTo(21, 1); // voorbelasting
    expect(result.r5a).toBe(0);            // geen verkoopfacturen
    expect(result.saldo).toBeCloseTo(-21, 1); // terug te vorderen
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  BUG 4 — verwerkHerhalendeKosten_ slaat Invalid Date rijen over (geen crash)
// ──────────────────────────────────────────────────────────────────────────────
describe('verwerkHerhalendeKosten_ (HerhalendeKosten.gs)', () => {
  // Kolom-indeling HerhalendeKosten sheet (0-based):
  // [0] ID, [1] naam, [2] omschr, [3] bedrag, [4] n/a, [5] freq,
  // [6] volgendeDatum, [7] kostenrekening, [8] status, [9] auto
  const HEADER = ['ID', 'Naam', 'Omschr', 'Bedrag', 'Incl', 'Freq', 'Volgende', 'Rek', 'Status', 'Auto'];

  function maakCtxMetRijen(rijen) {
    const mockSetValue = jest.fn();
    const mockSheet = {
      getDataRange: jest.fn(() => ({ getValues: jest.fn(() => [HEADER, ...rijen]) })),
      getRange: jest.fn(() => ({ setValue: mockSetValue })),
    };
    const mockSs = { getSheetByName: jest.fn(() => mockSheet) };

    // Laad de runtime; function-declaraties overschrijven pre-run overrides,
    // dus we pasten de afhankelijkheden NA aanmaken van de context aan.
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'HerhalendeKosten.gs']);
    // Post-run overrides: deze worden NIET overschreven door de script-run
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);
    ctx.maakJournaalpost_ = jest.fn();
    ctx.schrijfAuditLog_ = jest.fn();
    return ctx;
  }

  test('rij met ongeldige datum (string) wordt overgeslagen, Logger.log geeft waarschuwing', () => {
    const ctx = maakCtxMetRijen([
      [1, 'Hosting', 'Server', 50, 60, 'Maandelijks', 'onbekend', '7000', 'Actief', 'Nee'],
    ]);

    let result;
    expect(() => { result = ctx.verwerkHerhalendeKosten_(); }).not.toThrow();

    const logCalls = ctx.Logger.log.mock.calls.map(c => c[0]);
    expect(logCalls.some(m => m.includes('ongeldige datum'))).toBe(true);
    expect(result.geboekt).toBe(0);
  });

  test('rij met null datum wordt overgeslagen zonder crash', () => {
    const ctx = maakCtxMetRijen([
      [1, 'Lease', 'Auto', 500, 605, 'Maandelijks', null, '7050', 'Actief', 'Nee'],
    ]);

    let result;
    expect(() => { result = ctx.verwerkHerhalendeKosten_(); }).not.toThrow();
    expect(result.geboekt).toBe(0);
  });

  test('actieve rij met geldige datum gisteren en auto=Ja wordt geboekt', () => {
    const gisteren = new Date();
    gisteren.setDate(gisteren.getDate() - 1);

    const ctx = maakCtxMetRijen([
      [1, 'Huur', 'Kantoor', 1000, 1210, 'Maandelijks', gisteren, '7010', 'Actief', 'Ja'],
    ]);

    const result = ctx.verwerkHerhalendeKosten_();

    expect(result.geboekt).toBe(1);
    expect(ctx.maakJournaalpost_).toHaveBeenCalledTimes(1);
    const args = ctx.maakJournaalpost_.mock.calls[0][1];
    expect(args.bedrag).toBe(1000);
    expect(args.debet).toBe('7010');
  });

  test('inactieve rij wordt altijd overgeslagen, ook als datum verstreken', () => {
    const gisteren = new Date();
    gisteren.setDate(gisteren.getDate() - 1);

    const ctx = maakCtxMetRijen([
      [1, 'Archief', 'Oud abo', 200, 242, 'Maandelijks', gisteren, '7000', 'Inactief', 'Ja'],
    ]);

    const result = ctx.verwerkHerhalendeKosten_();
    expect(result.geboekt).toBe(0);
    expect(ctx.maakJournaalpost_).not.toHaveBeenCalled();
  });

  test('gemengde rijen: ongeldige datum overgeslagen, geldige rij geboekt', () => {
    const gisteren = new Date();
    gisteren.setDate(gisteren.getDate() - 1);

    const ctx = maakCtxMetRijen([
      [1, 'Kapot', 'Slechte datum', 99, 0, 'Maandelijks', 'fout', '7000', 'Actief', 'Ja'],
      [2, 'Huur', 'Kantoor', 1500, 1815, 'Maandelijks', gisteren, '7010', 'Actief', 'Ja'],
    ]);

    const result = ctx.verwerkHerhalendeKosten_();
    expect(result.geboekt).toBe(1); // alleen rij 2 geboekt
    expect(ctx.maakJournaalpost_).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  BUG 3 — setup() idempotency guard
// ──────────────────────────────────────────────────────────────────────────────
describe('setup() idempotency guard (Setup.gs)', () => {
  test('stopt vroeg en roept alertOfLog_ aan als SETUP_DONE al true is', () => {
    // Laad Config + Utils + Setup; post-run overschrijf de afhankelijkheden
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Setup.gs']);

    // PROP.SETUP_DONE = 'setupDone' (zie Config.gs)
    ctx.PropertiesService.getScriptProperties().getProperty
      .mockImplementation(key => key === 'setupDone' ? 'true' : null);

    // Spy op alertOfLog_ (post-run override)
    const mockAlert = jest.fn();
    ctx.alertOfLog_ = mockAlert;

    // Destructieve setup-stappen mogen NIET aangeroepen worden
    ctx.maakTabbladen_          = jest.fn();
    ctx.maakHoofdFormulier_     = jest.fn();
    ctx.zetInstellingen_        = jest.fn();
    ctx.installeelTriggers_     = jest.fn();
    ctx.maakDriveStructuur_     = jest.fn();
    ctx.vernieuwDashboard       = jest.fn();
    ctx.getSpreadsheet_         = jest.fn(() => ({
      getUrl: jest.fn(() => 'https://test'),
      getSheetByName: jest.fn(() => null),
      setActiveSheet: jest.fn(),
    }));

    ctx.setup();

    expect(mockAlert).toHaveBeenCalledTimes(1);
    // alertOfLog_(ui, titel, bericht) — bericht staat op index 2
    expect(mockAlert.mock.calls[0][2]).toMatch(/al geconfigureerd/);
    expect(ctx.maakTabbladen_).not.toHaveBeenCalled();
    expect(ctx.maakHoofdFormulier_).not.toHaveBeenCalled();
    expect(ctx.zetInstellingen_).not.toHaveBeenCalled();
  });

  test('voert setup wél uit als SETUP_DONE niet gezet is', () => {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Setup.gs']);

    // SETUP_DONE NIET aanwezig
    ctx.PropertiesService.getScriptProperties().getProperty
      .mockImplementation(() => null);

    ctx.alertOfLog_ = jest.fn();
    ctx.maakTabbladen_             = jest.fn();
    ctx.verbergTechnischeTabbladen_ = jest.fn();
    ctx.vulGrootboekschema_        = jest.fn();
    ctx.zetInstellingen_           = jest.fn();
    ctx.maakFormuliersTabbladen_   = jest.fn();
    ctx.maakHoofdFormulier_        = jest.fn();
    ctx.installeelTriggers_        = jest.fn();
    ctx.maakDriveStructuur_        = jest.fn();
    ctx.slaDriverLinksOpInInstellingen_ = jest.fn();
    ctx.vernieuwDashboard          = jest.fn();
    ctx.getSpreadsheet_ = jest.fn(() => ({
      getUrl: jest.fn(() => 'https://test'),
      getSheetByName: jest.fn(() => null),
      setActiveSheet: jest.fn(),
    }));

    ctx.setup();

    // Setup-stappen moeten wél aangeroepen zijn
    expect(ctx.maakTabbladen_).toHaveBeenCalledTimes(1);
    expect(ctx.maakHoofdFormulier_).toHaveBeenCalledTimes(1);
  });
});

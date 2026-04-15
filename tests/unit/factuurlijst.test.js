/**
 * tests/unit/factuurlijst.test.js
 *
 * Regressietests voor getFactuurlijstData (Verkoopfacturen.gs).
 *
 * Verifieert:
 *   - pdfUrl wordt gelezen uit r[19] (PDF URL kolom) — NIET uit r[17] (Projectcode).
 *     Zie .claude/sheet-schemas.md. Deze bug was latent omdat de HTML render het
 *     veld niet toonde; met de nieuwe "Verstuur"-knop is het veld wél nodig.
 *   - klantEmail wordt gevuld vanuit RELATIES[10] via klantId in VF[4].
 *   - Ontbreken van RELATIES-tab leidt niet tot crash; klantEmail is dan ''.
 *   - Sortering zet vervallen facturen vooraan.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// Helper: bouw een volledige VF-rij van 23 kolommen volgens sheet-schemas.md
function vfRow(overrides = {}) {
  const r = new Array(23).fill('');
  r[0]  = overrides.id          ?? 1;
  r[1]  = overrides.nr          ?? 'F000001';
  r[2]  = overrides.datum       ?? new Date('2024-01-15');
  r[3]  = overrides.vervaldatum ?? new Date('2024-02-14');
  r[4]  = overrides.klantId     ?? 'REL0001';
  r[5]  = overrides.klantnaam   ?? 'ACME BV';
  r[9]  = overrides.excl        ?? 500;
  r[10] = overrides.btwLabel    ?? '21% (hoog)';
  r[11] = overrides.btw         ?? 105;
  r[12] = overrides.incl        ?? 605;
  r[13] = overrides.betaald     ?? 0;
  r[14] = overrides.status      ?? 'Verzonden';
  r[15] = overrides.betaaldatum ?? '';
  r[17] = overrides.projectcode ?? 'PROJ-X';   // NIET de PDF URL
  r[18] = overrides.notities    ?? '';
  r[19] = overrides.pdfUrl      ?? 'https://drive.google.com/file/d/abc123/view';
  return r;
}

function mockSsMetSheets(sheets) {
  return {
    getSheetByName: jest.fn((naam) => sheets[naam] || null),
  };
}

function sheetMetRijen(rijen) {
  return {
    getDataRange: () => ({ getValues: () => rijen }),
  };
}

describe('getFactuurlijstData (Verkoopfacturen.gs)', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Verkoopfacturen.gs']);
  });

  test('pdfUrl komt uit kolom [19] (PDF URL), niet [17] (Projectcode)', () => {
    const header = new Array(23).fill('');
    const rij = vfRow({
      nr: 'F000042',
      projectcode: 'PROJ-SHOULD-NOT-LEAK',
      pdfUrl: 'https://drive.google.com/file/d/THE-REAL-PDF/view',
    });

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen([header, rij]),
      'Relaties': sheetMetRijen([new Array(19).fill('')]),
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    const result = ctx.getFactuurlijstData();

    expect(result.facturen).toHaveLength(1);
    expect(result.facturen[0].pdfUrl).toBe('https://drive.google.com/file/d/THE-REAL-PDF/view');
    expect(result.facturen[0].pdfUrl).not.toContain('PROJ-SHOULD-NOT-LEAK');
  });

  test('klantEmail wordt opgezocht via RELATIES[10] op basis van klantId', () => {
    const header = new Array(23).fill('');
    const rij = vfRow({ klantId: 'REL0042', klantnaam: 'Testklant' });

    const relatiesHeader = new Array(19).fill('');
    const relatiesRij = new Array(19).fill('');
    relatiesRij[0]  = 'REL0042';
    relatiesRij[2]  = 'Testklant';
    relatiesRij[10] = 'factuur@testklant.nl';

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen([header, rij]),
      'Relaties': sheetMetRijen([relatiesHeader, relatiesRij]),
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    const result = ctx.getFactuurlijstData();

    expect(result.facturen[0].klantEmail).toBe('factuur@testklant.nl');
  });

  test('klantEmail leeg wanneer klantId niet in RELATIES staat', () => {
    const header = new Array(23).fill('');
    const rij = vfRow({ klantId: 'REL-ONBEKEND' });

    const relatiesHeader = new Array(19).fill('');
    const relatiesRij = new Array(19).fill('');
    relatiesRij[0]  = 'REL-ANDERE';
    relatiesRij[10] = 'ander@voorbeeld.nl';

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen([header, rij]),
      'Relaties': sheetMetRijen([relatiesHeader, relatiesRij]),
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    const result = ctx.getFactuurlijstData();
    expect(result.facturen[0].klantEmail).toBe('');
  });

  test('ontbrekende RELATIES-tab crasht niet; klantEmail is leeg', () => {
    const header = new Array(23).fill('');
    const rij = vfRow({ klantId: 'REL0001' });

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen([header, rij]),
      // 'Relaties' ontbreekt bewust
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    let result;
    expect(() => {
      result = ctx.getFactuurlijstData();
    }).not.toThrow();

    expect(result.facturen).toHaveLength(1);
    expect(result.facturen[0].klantEmail).toBe('');
  });

  test('vervallen facturen worden bovenaan gesorteerd', () => {
    const header = new Array(23).fill('');
    const rijBetaald = vfRow({
      nr: 'F000001',
      status: 'Betaald',
      vervaldatum: new Date('2023-01-01'),
    });
    const rijVervallen = vfRow({
      nr: 'F000002',
      status: 'Vervallen',
      vervaldatum: new Date('2023-06-01'),
    });
    const rijOpen = vfRow({
      nr: 'F000003',
      status: 'Verzonden',
      vervaldatum: new Date('2025-12-01'),
    });

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen([header, rijBetaald, rijVervallen, rijOpen]),
      'Relaties': sheetMetRijen([new Array(19).fill('')]),
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    const result = ctx.getFactuurlijstData();
    // Eerste rij moet de vervallen factuur zijn
    expect(result.facturen[0].nr).toBe('F000002');
    expect(result.facturen[0].status).toBe('Vervallen');
  });

  test('tellers matchen de aantallen per status-categorie', () => {
    const header = new Array(23).fill('');
    const rijen = [
      header,
      vfRow({ nr: 'F000001', status: 'Verzonden' }),
      vfRow({ nr: 'F000002', status: 'Vervallen' }),
      vfRow({ nr: 'F000003', status: 'Betaald' }),
      vfRow({ nr: 'F000004', status: 'Deels betaald' }),
    ];

    const mockSs = mockSsMetSheets({
      'Verkoopfacturen': sheetMetRijen(rijen),
      'Relaties': sheetMetRijen([new Array(19).fill('')]),
    });
    ctx.getSpreadsheet_ = jest.fn(() => mockSs);

    const result = ctx.getFactuurlijstData();
    expect(result.tellers.alle).toBe(4);
    expect(result.tellers.open).toBe(2);        // Verzonden + Deels betaald
    expect(result.tellers.vervallen).toBe(1);
    expect(result.tellers.betaald).toBe(1);
  });
});

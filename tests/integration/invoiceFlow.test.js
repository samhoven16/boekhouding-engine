/**
 * tests/integration/invoiceFlow.test.js
 *
 * Integration tests voor verwerkInkomstenUitHoofdformulier_ in Triggers.gs.
 * GAS service calls worden gemockt; de daadwerkelijke business logic draait.
 *
 * Test-scenarios:
 *   1. Geldige factuur → sheet write, PDF gegenereerd, structured result terug
 *   2. Lege factuurregels → gooit Error + schrijft audit log
 *   3. Dubbel factuurnummer → gooit Error (idempotency guard)
 *   4. PDF-fout → factuur blijft in sheet, email niet verzonden, audit log
 *   5. Email-fout → factuur blijft concept, audit log
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Bouw een minimale mock-spreadsheet die voldoet aan wat
 * verwerkInkomstenUitHoofdformulier_ nodig heeft.
 *
 * @param {Array[]} bestaandeRijen  - Rijen al aanwezig in Verkoopfacturen
 *                                    (inclusief header op index 0)
 */
function maakMockSpreadsheet(bestaandeRijen = [['ID', 'Nr']]) {
  const mockRangeSetValue = jest.fn();
  const mockRange = { setValue: mockRangeSetValue };

  const mockSheet = {
    appendRow:    jest.fn(),
    getLastRow:   jest.fn(() => bestaandeRijen.length),
    getRange:     jest.fn(() => mockRange),
    getDataRange: jest.fn(() => ({
      getValues: jest.fn(() => bestaandeRijen),
    })),
  };

  const mockSs = {
    getSheetByName: jest.fn(() => mockSheet),
  };

  return { mockSs, mockSheet, mockRange, mockRangeSetValue };
}

/** Geldige minimale factuurdata die door verwerkInkomstenUitHoofdformulier_ verwerkt kan worden. */
function geldigeFactuurData(overrides = {}) {
  return {
    'Klantnaam':                                'ACME BV',
    'Klant e-mailadres':                        'acme@example.com',
    'Factuurdatum':                             '2024-01-15',
    'Betalingstermijn (dagen)':                 '30',
    'BTW tarief':                               '21% (hoog)',
    'Korting (in €)':                           '0',
    'Notities op factuur':                      '',
    'Projectcode / Referentie':                 '',
    'Factuur direct e-mailen naar klant?':      'Ja',
    'Factuuradres klant':                       'Teststraat 1, Amsterdam',
    'KvK-nummer klant':                         '',
    'BTW-nummer klant':                         '',
    'Regel 1 – Omschrijving':                   'Advies diensten januari',
    'Regel 1 – Aantal':                         '1',
    'Regel 1 – Prijs per eenheid (excl. BTW)':  '500',
    ...overrides,
  };
}

// ── Context setup ─────────────────────────────────────────────────────────────

let ctx;

beforeEach(() => {
  // Verse context per test zodat mocks niet lekken
  ctx = createGasRuntime(
    ['Config.gs', 'Utils.gs', 'BTW.gs', 'BoekingEngine.gs', 'Triggers.gs'],
    {
      // ── Nummering ──────────────────────────────────────────────────────
      volgendFactuurnummer_: jest.fn(() => 1),

      // ── Relatiebeheer ──────────────────────────────────────────────────
      zoekOfMaakRelatie_: jest.fn(() => 'REL0001'),

      // ── Grootboek ──────────────────────────────────────────────────────
      maakJournaalpost_:          jest.fn(),
      bepaalOmzetRekening_:       jest.fn(() => '8000'),
      bepaalBtwVerkoopRekening_:  jest.fn(() => '1510'),

      // ── Instellingen ───────────────────────────────────────────────────
      getInstelling_: jest.fn((sleutel) => {
        const kaart = {
          'Factuurprefix':  'F',
          'Bedrijfsnaam':   'Test BV',
          'Adres':          'Teststraat 1',
          'IBAN':           'NL91ABNA0417164300',
        };
        return kaart[sleutel] || null;
      }),

      // ── PDF & UBL ──────────────────────────────────────────────────────
      // Standaard: PDF genereert zonder fouten
      genereerFactuurPdf_: jest.fn(() => 'https://drive.google.com/file/pdf-test'),
      genereerUBL_:        jest.fn(() => null),

      // ── Email ──────────────────────────────────────────────────────────
      // Standaard: email verstuurd
      stuurFactuurEmailNaarKlant_: jest.fn(() => true),

      // ── Dashboard & fout-email ─────────────────────────────────────────
      vernieuwDashboard: jest.fn(),
      stuurFoutEmail_:   jest.fn(),
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scenario 1 — Geldige factuur
// ─────────────────────────────────────────────────────────────────────────────
describe('verwerkInkomstenUitHoofdformulier_ — geldige factuur', () => {
  test('schrijft rij naar sheet', () => {
    const { mockSs, mockSheet } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(mockSheet.appendRow).toHaveBeenCalledTimes(1);
    const rij = mockSheet.appendRow.mock.calls[0][0];
    expect(rij[5]).toBe('ACME BV');       // klantnaam op positie 5
    expect(rij[9]).toBe(500);             // totalExcl
    expect(rij[12]).toBe(605);            // totalIncl (500 + 21%)
  });

  test('retourneert { ok: true, factuurnummer, pdfUrl, emailVerzonden }', () => {
    const { mockSs } = maakMockSpreadsheet();
    const result = ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(result).toMatchObject({
      ok:             true,
      factuurnummer:  'F000001',
      emailVerzonden: true,
      pdfUrl:         'https://drive.google.com/file/pdf-test',
    });
    expect(typeof result.sheetRij).toBe('number');
  });

  test('genereert PDF', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(ctx.genereerFactuurPdf_).toHaveBeenCalledTimes(1);
  });

  test('verstuurt email wanneer directMailen=Ja en pdfUrl aanwezig', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(ctx.stuurFactuurEmailNaarKlant_).toHaveBeenCalledTimes(1);
    expect(ctx.stuurFactuurEmailNaarKlant_).toHaveBeenCalledWith(
      'acme@example.com',
      'ACME BV',
      'F000001',
      605,              // totalIncl
      expect.any(Date), // vervaldatum
      'https://drive.google.com/file/pdf-test',
      null              // ublUrl (genereerUBL_ retourneert null in mock)
    );
  });

  test('verstuurt GEEN email wanneer directMailen=Nee', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(
      mockSs,
      geldigeFactuurData({ 'Factuur direct e-mailen naar klant?': 'Nee' })
    );
    expect(ctx.stuurFactuurEmailNaarKlant_).not.toHaveBeenCalled();
  });

  test('verstuurt GEEN email wanneer geen e-mailadres', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(
      mockSs,
      geldigeFactuurData({ 'Klant e-mailadres': '' })
    );
    expect(ctx.stuurFactuurEmailNaarKlant_).not.toHaveBeenCalled();
  });

  test('maakt journaalposten aan', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    // Minimaal 1 journaalpost: omzet; bij BTW > 0 ook BTW-post
    expect(ctx.maakJournaalpost_).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scenario 2 — Lege factuurregels
// ─────────────────────────────────────────────────────────────────────────────
describe('verwerkInkomstenUitHoofdformulier_ — lege factuurregels', () => {
  test('gooit Error met duidelijke melding', () => {
    const { mockSs } = maakMockSpreadsheet();
    const legeData = geldigeFactuurData({
      'Regel 1 – Omschrijving':                  '',
      'Regel 1 – Prijs per eenheid (excl. BTW)': '0',
    });
    expect(() => {
      ctx.verwerkInkomstenUitHoofdformulier_(mockSs, legeData);
    }).toThrow(/factuurregels/i);
  });

  test('schrijft NIET naar sheet bij lege regels', () => {
    const { mockSs, mockSheet } = maakMockSpreadsheet();
    const legeData = geldigeFactuurData({ 'Regel 1 – Omschrijving': '' });
    try { ctx.verwerkInkomstenUitHoofdformulier_(mockSs, legeData); } catch (_e) {}
    expect(mockSheet.appendRow).not.toHaveBeenCalled();
  });

  test('verstuurt GEEN email bij lege regels', () => {
    const { mockSs } = maakMockSpreadsheet();
    const legeData = geldigeFactuurData({ 'Regel 1 – Omschrijving': '' });
    try { ctx.verwerkInkomstenUitHoofdformulier_(mockSs, legeData); } catch (_e) {}
    expect(ctx.stuurFactuurEmailNaarKlant_).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scenario 3 — Dubbel factuurnummer (idempotency guard)
// ─────────────────────────────────────────────────────────────────────────────
describe('verwerkInkomstenUitHoofdformulier_ — dubbel factuurnummer', () => {
  test('gooit Error als factuurnummer al in sheet staat', () => {
    // Simuleer: rij met factuurNr=1 bestaat al in sheet
    const { mockSs } = maakMockSpreadsheet([
      ['ID', 'Nr', 'Datum'],          // header
      [1, 'F000001', new Date()],     // bestaande factuur met nr 1
    ]);

    expect(() => {
      ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    }).toThrow(/bestaat al/i);
  });

  test('schrijft NIET naar sheet bij dubbel nummer', () => {
    const { mockSs, mockSheet } = maakMockSpreadsheet([
      ['ID', 'Nr'],
      [1, 'F000001'],
    ]);
    try { ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData()); } catch (_e) {}
    expect(mockSheet.appendRow).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scenario 4 — PDF mislukt
// ─────────────────────────────────────────────────────────────────────────────
describe('verwerkInkomstenUitHoofdformulier_ — PDF mislukt', () => {
  beforeEach(() => {
    ctx.genereerFactuurPdf_ = jest.fn(() => null); // PDF mislukt
  });

  test('factuur staat WEL in sheet (sheet write is al gedaan voor PDF)', () => {
    const { mockSs, mockSheet } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(mockSheet.appendRow).toHaveBeenCalledTimes(1);
  });

  test('email wordt NIET verstuurd als PDF ontbreekt', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(ctx.stuurFactuurEmailNaarKlant_).not.toHaveBeenCalled();
  });

  test('result.pdfUrl is null', () => {
    const { mockSs } = maakMockSpreadsheet();
    const result = ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(result.pdfUrl).toBeNull();
  });

  test('result.emailVerzonden is false', () => {
    const { mockSs } = maakMockSpreadsheet();
    const result = ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(result.emailVerzonden).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Scenario 5 — Email mislukt
// ─────────────────────────────────────────────────────────────────────────────
describe('verwerkInkomstenUitHoofdformulier_ — email mislukt', () => {
  beforeEach(() => {
    ctx.stuurFactuurEmailNaarKlant_ = jest.fn(() => false); // email mislukt
  });

  test('factuur staat in sheet', () => {
    const { mockSs, mockSheet } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(mockSheet.appendRow).toHaveBeenCalledTimes(1);
  });

  test('PDF is gegenereerd', () => {
    const { mockSs } = maakMockSpreadsheet();
    ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(ctx.genereerFactuurPdf_).toHaveBeenCalledTimes(1);
  });

  test('result.emailVerzonden is false', () => {
    const { mockSs } = maakMockSpreadsheet();
    const result = ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(result.emailVerzonden).toBe(false);
  });

  test('result.ok is true (factuur aangemaakt, alleen email mislukt)', () => {
    const { mockSs } = maakMockSpreadsheet();
    const result = ctx.verwerkInkomstenUitHoofdformulier_(mockSs, geldigeFactuurData());
    expect(result.ok).toBe(true);
  });
});

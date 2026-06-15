/**
 * tests/unit/creditnota-uit-factuur.test.js
 *
 * Regressie voor F-DOC-046: de gids beloofde een "Creditnota uit factuur"-knop,
 * maar maakCreditnota was niet aan een menu gekoppeld (0 callers) en kende geen
 * reden-veld of returnwaarde. Na de fix:
 *   - maakCreditnota(factuurNummer, reden) geeft het credit-factuurnummer terug
 *     (of null bij onbekende factuur) zodat de UI-wrapper feedback kan geven;
 *   - de reden komt in de omschrijving van de credit-rij;
 *   - het feitelijke gedrag (vol bedrag, negatieve BTW, storno-posten, origineel
 *     op "Gecrediteerd") blijft geborgd.
 *
 * Harness-keuze: alleen Config.gs (constanten), BoekingEngine.gs (echte saniteer_)
 * en Verkoopfacturen.gs (functie onder test) worden geladen. Alle helpers die in
 * NIET-geladen bestanden leven worden ge-override; zo clobbert een echte definitie
 * de mock niet (de bundel draait als één gedeelde scope).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakMockSheet(rijen) {
  const setValues = [];
  const sheet = {
    appendRow:    jest.fn(),
    getDataRange: () => ({ getValues: () => rijen }),
    getRange:     jest.fn(() => ({ setValue: (v) => setValues.push(v) })),
  };
  return { sheet, setValues };
}

function maakCtx(rijen) {
  const { sheet, setValues } = maakMockSheet(rijen);
  const ctx = createGasRuntime(
    ['Config.gs', 'BoekingEngine.gs', 'Verkoopfacturen.gs'],
    {
      getSpreadsheet_:           jest.fn(() => ({ getSheetByName: () => sheet })),
      getInstelling_:            jest.fn((k) => (k === 'Factuurprefix' ? 'F' : '')),
      volgendFactuurnummer_:     jest.fn(() => 99),
      parseBtwTarief_:           jest.fn(() => 21),
      bepaalOmzetRekening_:      jest.fn(() => '8000'),
      bepaalBtwVerkoopRekening_: jest.fn(() => '1510'),
      maakJournaalpost_:         jest.fn(),
    },
  );
  return { ctx, sheet, setValues };
}

// header (index 0) + 1 factuurrij.
// Kolommen: [1]=factuurnr [9]=excl [10]=btwLabel [11]=btw [12]=incl [14]=status [18]=omschr
function factuurRij() {
  const r = new Array(19).fill('');
  r[0]  = 'ID1';
  r[1]  = 'F2024-001';
  r[9]  = 500;
  r[10] = '21% (hoog)';
  r[11] = 105;
  r[12] = 605;
  r[14] = 'Verzonden';
  return r;
}

describe('maakCreditnota — F-DOC-046 (knop + reden + returnwaarde)', () => {
  test('onbekende factuur → null, geen credit-rij toegevoegd', () => {
    const { ctx, sheet } = maakCtx([new Array(19).fill('h'), factuurRij()]);
    const res = ctx.maakCreditnota('BESTAAT-NIET', 'reden');
    expect(res).toBeNull();
    expect(sheet.appendRow).not.toHaveBeenCalled();
  });

  test('bekende factuur → origineel GECREDITEERD, negatieve credit-rij met reden, twee storno-posten, creditnr terug', () => {
    const { ctx, sheet, setValues } = maakCtx([new Array(19).fill('h'), factuurRij()]);
    const res = ctx.maakCreditnota('F2024-001', 'Verkeerd BTW-nummer EU-klant');

    // returnwaarde = credit-factuurnummer (bevat CN99)
    expect(typeof res).toBe('string');
    expect(res).toContain('CN99');

    // originele factuur op 'Gecrediteerd' gezet
    expect(setValues).toContain('Gecrediteerd');

    // credit-rij: negatieve bedragen + reden + verwijzing in omschrijving
    expect(sheet.appendRow).toHaveBeenCalledTimes(1);
    const credit = sheet.appendRow.mock.calls[0][0];
    expect(credit[9]).toBe(-500);
    expect(credit[11]).toBe(-105);
    expect(credit[12]).toBe(-605);
    expect(String(credit[18])).toContain('Verkeerd BTW-nummer EU-klant');
    expect(String(credit[18])).toContain('F2024-001');

    // storno: omzet-leg + BTW-leg
    expect(ctx.maakJournaalpost_).toHaveBeenCalledTimes(2);
  });

  test('zonder reden → omschrijving zonder "undefined"', () => {
    const { ctx, sheet } = maakCtx([new Array(19).fill('h'), factuurRij()]);
    ctx.maakCreditnota('F2024-001');
    const credit = sheet.appendRow.mock.calls[0][0];
    expect(String(credit[18])).not.toContain('undefined');
    expect(String(credit[18])).toContain('Creditnota voor F2024-001');
  });
});

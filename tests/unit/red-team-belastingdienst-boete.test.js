/**
 * tests/unit/red-team-belastingdienst-boete.test.js
 *
 * RED-TEAM SIMULATIE — attack-vectoren die tot Belastingdienst-boete kunnen
 * leiden. Doel: detecteren VÓÓR aangifte, niet daarna.
 *
 * Scenario's:
 *   1. Boek geboekt met 21% ipv 9% (factuur-flow)
 *   2. Inkoop niet geregistreerd (bank-uitgave zonder boeking)
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('RED-TEAM: checkBtwTariefVerdacht_ — voorkomt onjuiste BTW-aangifte', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs', 'Invariants.gs']);
  });

  test('ATTACK 1: "Boekje XYZ" met 21% → verdacht (zou 9% moeten zijn)', () => {
    const r = ctx.checkBtwTariefVerdacht_('Boekje XYZ', 0.21);
    expect(r).not.toBeNull();
    expect(r.voorgesteldTarief).toBe(0.09);
    expect(r.ernstig).toBe(true);
  });

  test('ATTACK 2: "Restaurant Het Anker" met 21% → verdacht', () => {
    const r = ctx.checkBtwTariefVerdacht_('Restaurant Het Anker', 0.21);
    expect(r).not.toBeNull();
    expect(r.voorgesteldTarief).toBe(0.09);
  });

  test('ATTACK 3: "Tijdschrift Quote" met 21% → verdacht', () => {
    const r = ctx.checkBtwTariefVerdacht_('Tijdschrift Quote', 0.21);
    expect(r).not.toBeNull();
  });

  test('ATTACK 4: Catering 21% → verdacht (laag tarief)', () => {
    const r = ctx.checkBtwTariefVerdacht_('Catering Q4 borrel', 0.21);
    expect(r).not.toBeNull();
  });

  test('ATTACK 5: Theater-kaartje 21% → verdacht', () => {
    const r = ctx.checkBtwTariefVerdacht_('Theaterkaartje', 0.21);
    expect(r).not.toBeNull();
  });

  test('OMGEKEERD: "Software-licentie" met 9% → verdacht (zou 21% moeten)', () => {
    const r = ctx.checkBtwTariefVerdacht_('Software-licentie Q1', 0.09);
    expect(r).not.toBeNull();
    expect(r.voorgesteldTarief).toBe(0.21);
  });

  test('LEGITIEM: webdesign 21% → geen verdenking', () => {
    expect(ctx.checkBtwTariefVerdacht_('Webdesign opdracht', 0.21)).toBeNull();
  });

  test('LEGITIEM: boek 9% → geen verdenking', () => {
    expect(ctx.checkBtwTariefVerdacht_('Boekje XYZ', 0.09)).toBeNull();
  });

  test('LEGITIEM: 0% (vrijgesteld/export) → geen verdenking', () => {
    expect(ctx.checkBtwTariefVerdacht_('Export naar Duitsland', 0)).toBeNull();
  });

  test('EDGE: lege omschrijving → null (geen valse waarschuwing)', () => {
    expect(ctx.checkBtwTariefVerdacht_('', 0.21)).toBeNull();
    expect(ctx.checkBtwTariefVerdacht_(null, 0.21)).toBeNull();
  });

  test('EDGE: omschrijving met laag-keyword in een ander woord → triggers wel', () => {
    // "boekhouding" bevat "boek" — false positive risk maar acceptabel
    // (klant ziet waarschuwing, kan negeren). Veiligheid > false-positives.
    expect(ctx.checkBtwTariefVerdacht_('Boekhouding maand januari', 0.21)).not.toBeNull();
  });
});

describe('RED-TEAM: detecteerOngekoppeldeBankuitgaven_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  function mockSs(bankData, jpData, inkoopData) {
    return {
      getSheetByName: (n) => {
        const data = (n === 'Banktransacties') ? bankData
                   : (n === 'Journaalposten') ? jpData
                   : (n === 'Inkoopfacturen') ? inkoopData
                   : null;
        if (!data) return null;
        return { getDataRange: () => ({ getValues: () => data }) };
      },
    };
  }

  // ECHTE BANKTRANSACTIES-layout (Setup.gs:508 / KOL.BT): 15 kolommen met
  // [1]=Datum, [2]=Omschrijving, [3]=Bedrag, [7]=Tegenpartij. (De oude test
  // gebruikte een 5-koloms fantasie-layout die toevallig bij de bug paste —
  // code én test borgden hetzelfde verkeerde schema, F-INV-330.)
  function btRij(datum, omschr, bedrag, tegenpartij) {
    const r = new Array(15).fill('');
    r[1] = datum; r[2] = omschr; r[3] = bedrag; r[7] = tegenpartij;
    return r;
  }
  const BT_HEADER = new Array(15).fill('hdr');

  test('ATTACK: bank-uitgave €500 zonder gekoppelde inkoopfactuur → DETECTED', () => {
    const bank = [BT_HEADER, btRij(new Date(2026, 0, 15), 'Betaling leverancier ABC', -500, 'ABC BV')];
    const jp = [['ID']];  // geen kosten-boeking
    const ik = [['IF Nr']];  // geen inkoopfacturen
    const verdacht = ctx.detecteerOngekoppeldeBankuitgaven_(mockSs(bank, jp, ik));
    expect(verdacht.length).toBe(1);
    expect(verdacht[0].bedrag).toBe(-500);
    expect(verdacht[0].tegenpartij).toBe('ABC BV');
  });

  test('LEGITIEM: bank-uitgave + gekoppelde kostenboeking → niet verdacht', () => {
    // omschrijving bevat de inkoopfactuur-ref → substring-match koppelt 'm
    const bank = [BT_HEADER, btRij(new Date(2026, 0, 15), 'Betaling IF-2026-001', -500, 'ABC BV')];
    const jp = [
      ['ID', 'Datum', 'Omschr', 'Dagboek', 'Debet', 'DN', 'Credit', 'CN', 'Bedrag', 'BTW%', 'BTW', 'Ref'],
      ['JP1', new Date(2026, 0, 15), 'Inkoop', 'I', '7000', 'Inkoop', '1100', 'Bank', 500, '21%', 105, 'IF-2026-001'],
    ];
    const ik = [['IF Nr'], ['IF-2026-001']];
    const verdacht = ctx.detecteerOngekoppeldeBankuitgaven_(mockSs(bank, jp, ik));
    expect(verdacht.length).toBe(0);
  });

  test('Kleine bankkosten (<€5) worden geskipt', () => {
    const bank = [BT_HEADER, btRij(new Date(2026, 0, 15), 'Bankkosten', -3.50, 'Bank')];
    const verdacht = ctx.detecteerOngekoppeldeBankuitgaven_(mockSs(bank, [['ID']], [['IF']]));
    expect(verdacht.length).toBe(0);
  });

  test('Bank-ontvangsten (positief) worden geskipt', () => {
    const bank = [BT_HEADER, btRij(new Date(2026, 0, 15), 'Klant betaalt', +1000, 'Klant A')];
    const verdacht = ctx.detecteerOngekoppeldeBankuitgaven_(mockSs(bank, [['ID']], [['IF']]));
    expect(verdacht.length).toBe(0);
  });

  test('Cap bij 20 verdachte uitgaven — performance', () => {
    const bank = [BT_HEADER];
    for (let i = 0; i < 50; i++) {
      bank.push(btRij(new Date(2026, 0, i + 1), 'Onbekend ' + i, -100 - i, 'X'));
    }
    const verdacht = ctx.detecteerOngekoppeldeBankuitgaven_(mockSs(bank, [['ID']], [['IF']]));
    expect(verdacht.length).toBeLessThanOrEqual(21);  // cap + 1 due to break
  });
});

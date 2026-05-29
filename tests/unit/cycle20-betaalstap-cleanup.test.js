/**
 * tests/unit/cycle20-betaalstap-cleanup.test.js
 *
 * Cycle 20 — `herinneringsStap_<factuurnr>` ScriptProperties accumuleerden
 * voor altijd. Klant met 200 facturen/jaar krijgt na 5 jaar 1000 keys ≈ 40KB
 * (≈ 8% van de 500KB-quota — niet fataal maar wel druk). Bonus-bug: bij
 * crediteren + opnieuw factureren onder zelfde nummer bleef de oude stap
 * staan → dunning sloeg 1-3 over alsof al verstuurd.
 *
 * Fix: zodra status → BETAALD, deleteProperty('herinneringsStap_' + fnr).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('CYCLE 20: cleanup herinneringsStap_ op BETAALD', () => {
  test('Triggers.gs:markeerBetaling cleanup-pad bevat deleteProperty', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');
    // Pattern: na status setValue, deleteProperty('herinneringsStap_' + fnr)
    expect(src).toMatch(/deleteProperty\('herinneringsStap_'\s*\+\s*fnr\)/);
  });

  test('Verkoopfacturen.gs:markeerVerkoopfactuurBetaald cleanup-pad bevat deleteProperty', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/Verkoopfacturen.gs'), 'utf8');
    expect(src).toMatch(/deleteProperty\('herinneringsStap_'\s*\+\s*factuurnr\)/);
  });

  test('Cleanup wordt aangeroepen na status-BETAALD, niet op DEELS_BETAALD', () => {
    const store = { 'herinneringsStap_F001': '2' };
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs', 'Triggers.gs'], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => store[k] || null,
          setProperty: (k, v) => { store[k] = String(v); },
          deleteProperty: (k) => { delete store[k]; },
          getKeys: () => Object.keys(store),
        }),
      },
    });
    // Mock minimal sheet voor verkoop
    const writes = [];
    const data = [
      ['ID','Fnr','Datum','Verval','KlantId','Klant','','','','','','','TotalIncl','Betaald','Status','Betaaldatum'],
      ['1','F001', new Date(), new Date(), 'K001', 'A', '','','','','','', 100, 0, 'Verzonden', ''],
    ];
    const sheet = {
      getDataRange: () => ({ getValues: () => data }),
      getRange: (r, c) => ({
        setValue: (v) => { writes.push({ r, c, v }); data[r - 1][c - 1] = v; },
      }),
    };
    ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
    ctx.maakJournaalpost_ = jest.fn();
    ctx.rondBedrag_ = (n) => Math.round(n * 100) / 100;

    // Signatuur: (ss, transactieId, ref, bedrag, isOntvangst, datum)
    // Eerste betaling: 60 van 100 → DEELS_BETAALD → cleanup NIET uitgevoerd
    ctx.koppelBankTransactieAanFactuur_(ctx.getSpreadsheet_(), 'BT001', 'F001', 60, true, new Date());
    expect(store['herinneringsStap_F001']).toBe('2');

    // Tweede betaling: 40 → totaal 100 → BETAALD → cleanup uitgevoerd
    ctx.koppelBankTransactieAanFactuur_(ctx.getSpreadsheet_(), 'BT002', 'F001', 40, true, new Date());
    expect(store['herinneringsStap_F001']).toBeUndefined();
  });

  test('Cleanup mist niet als delete throw (best-effort)', () => {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs', 'Triggers.gs'], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: () => null,
          setProperty: () => {},
          deleteProperty: () => { throw new Error('Quota'); },
          getKeys: () => [],
        }),
      },
    });
    const data = [
      ['ID','Fnr','Datum','Verval','KlantId','Klant','','','','','','', 100, 0, 'Verzonden', ''],
      ['1','F002', new Date(), new Date(), 'K001', 'A', '','','','','','', 100, 0, 'Verzonden', ''],
    ];
    const sheet = {
      getDataRange: () => ({ getValues: () => data }),
      getRange: (r, c) => ({ setValue: (v) => { data[r - 1][c - 1] = v; } }),
    };
    ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
    ctx.maakJournaalpost_ = jest.fn();
    ctx.rondBedrag_ = (n) => Math.round(n * 100) / 100;
    // Should NOT throw
    expect(() => ctx.koppelBankTransactieAanFactuur_(ctx.getSpreadsheet_(), 'BT003', 'F002', 100, true, new Date())).not.toThrow();
  });
});

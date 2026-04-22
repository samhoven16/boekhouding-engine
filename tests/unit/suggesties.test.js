/**
 * tests/unit/suggesties.test.js
 *
 * Regressietests voor de context-based suggesties (Suggesties.gs).
 *   - Cooldown-logica: tweede tonen binnen 14 dagen wordt geblokkeerd
 *   - Prioriteit: hoogste prioriteit die matcht wordt getoond, lagere
 *     triggers worden niet getoond in dezelfde refresh
 *   - Kill-switch: SUGGESTIES_UIT=true zorgt dat niets getoond wordt
 *   - Geen-IBAN trigger: korte/lege IBAN → match
 *   - Graceful error-handling: falende conditie-fn crasht niet het geheel
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Suggesties.gs', () => {

  // Helper: maak een sheet-stub die veilig op alle aanroepen reageert
  function maakSsStub() {
    const toastFn = jest.fn();
    const ss = {
      toast: toastFn,
      getSheetByName: jest.fn(() => null),
    };
    return { ss, toastFn };
  }

  function laadRuntime(kpiSnapshot, instellingen) {
    const ctx = createGasRuntime(['Config.gs', 'Suggesties.gs']);
    // Stub dependencies
    ctx.getSpreadsheet_    = jest.fn(() => ctx.__ss);
    ctx.getInstelling_     = jest.fn((label) => (instellingen || {})[label] || '');
    ctx.leesKpiSnapshot_   = jest.fn(() => kpiSnapshot || null);
    ctx.berekenKpiData_    = jest.fn(() => kpiSnapshot || { omzet: 0, kosten: 0, btwTeBetalen: 0 });
    ctx.schrijfAuditLog_   = jest.fn();
    return ctx;
  }

  // ──────────────────────────────────────────────────────────────────
  test('kill-switch: SUGGESTIES_UIT=true → niets getoond', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 0 }, { IBAN: '' });
    ctx.__ss = ss;
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn((k) => k === 'SUGGESTIES_UIT' ? 'true' : null),
    }));

    ctx.checkSuggesties_();

    expect(toastFn).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  test('geen IBAN → bunq-suggestie getoond', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 0 }, { IBAN: '' });
    ctx.__ss = ss;

    ctx.checkSuggesties_();

    expect(toastFn).toHaveBeenCalled();
    const [body, titel] = toastFn.mock.calls[0];
    expect(titel).toMatch(/zakelijke rekening/i);
    expect(body).toMatch(/bunq/i);
    expect(body).toMatch(/samenwerking/i); // disclosure verplicht
  });

  // ──────────────────────────────────────────────────────────────────
  test('IBAN wel ingevuld → bunq-suggestie NIET getoond', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 0 }, { IBAN: 'NL91ABNA0417164300' });
    ctx.__ss = ss;

    ctx.checkSuggesties_();

    // Geen enkele toast met "bunq" erin
    const alleBodies = toastFn.mock.calls.map(c => c[0]).join(' ');
    expect(alleBodies).not.toMatch(/bunq/i);
  });

  // ──────────────────────────────────────────────────────────────────
  test('prioriteit: geen-iban (100) wint van hoge-btw (60) als beide matchen', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ btwTeBetalen: 5000 }, { IBAN: '' });
    ctx.__ss = ss;

    ctx.checkSuggesties_();

    expect(toastFn).toHaveBeenCalledTimes(1);
    const [body] = toastFn.mock.calls[0];
    expect(body).toMatch(/bunq/i); // geen-iban won
    expect(body).not.toMatch(/reserveer BTW/i);
  });

  // ──────────────────────────────────────────────────────────────────
  test('cooldown: tweede aanroep binnen 14 dagen blokkeert suggestie', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 0 }, { IBAN: '' });
    ctx.__ss = ss;

    // UserProperties-store dat onthoudt tussen calls
    const store = {};
    ctx.PropertiesService.getUserProperties = jest.fn(() => ({
      getProperty: jest.fn((k) => store[k] || null),
      setProperty: jest.fn((k, v) => { store[k] = v; }),
      deleteProperty: jest.fn((k) => { delete store[k]; }),
      getProperties: jest.fn(() => ({ ...store })),
    }));

    // Eerste call: moet tonen
    ctx.checkSuggesties_();
    expect(toastFn).toHaveBeenCalledTimes(1);

    // Tweede call direct erna: binnen cooldown → niet tonen
    ctx.checkSuggesties_();
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────────────────
  test('cooldown afgelopen na 15 dagen → suggestie weer getoond', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 0 }, { IBAN: '' });
    ctx.__ss = ss;

    const vijftienDagenGeleden = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const store = {
      'suggestie:geen-iban:laatstGetoond': vijftienDagenGeleden.toISOString(),
    };
    ctx.PropertiesService.getUserProperties = jest.fn(() => ({
      getProperty: jest.fn((k) => store[k] || null),
      setProperty: jest.fn((k, v) => { store[k] = v; }),
      deleteProperty: jest.fn(),
      getProperties: jest.fn(() => ({ ...store })),
    }));

    ctx.checkSuggesties_();
    expect(toastFn).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  test('falende conditie-fn laat andere suggesties nog werken', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ btwTeBetalen: 5000 }, { IBAN: 'NL91ABNA0417164300' });
    ctx.__ss = ss;

    // Sabotage eerste conditie (geen-iban) door getInstelling_ te laten crashen
    ctx.getInstelling_ = jest.fn(() => { throw new Error('boom'); });

    // Moet niet crashen, en de volgende matching-trigger (hoge-btw) moet doorkomen
    expect(() => ctx.checkSuggesties_()).not.toThrow();

    // Omdat de hoge-btw matcht én geen-iban crashde, zou hoge-btw moeten tonen
    expect(toastFn).toHaveBeenCalled();
    const [body] = toastFn.mock.calls[0];
    expect(body).toMatch(/reserveer|btw/i);
  });

  // ──────────────────────────────────────────────────────────────────
  test('geen enkele trigger matcht → geen toast', () => {
    const { ss, toastFn } = maakSsStub();
    const ctx = laadRuntime({ omzet: 100, btwTeBetalen: 0 }, { IBAN: 'NL91ABNA0417164300' });
    ctx.__ss = ss;

    ctx.checkSuggesties_();

    expect(toastFn).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  test('resetSuggestieCooldowns wist alle cooldown-keys', () => {
    const ctx = laadRuntime({}, {});
    const store = {
      'suggestie:geen-iban:laatstGetoond': '2026-01-01',
      'suggestie:veel-openstaand:laatstGetoond': '2026-01-01',
      'ANDERE_PROP': 'behouden',
    };
    ctx.PropertiesService.getUserProperties = jest.fn(() => ({
      getProperty: jest.fn((k) => store[k] || null),
      setProperty: jest.fn((k, v) => { store[k] = v; }),
      deleteProperty: jest.fn((k) => { delete store[k]; }),
      getProperties: jest.fn(() => ({ ...store })),
    }));
    ctx.SpreadsheetApp.getActive = jest.fn(() => ({ toast: jest.fn() }));

    ctx.resetSuggestieCooldowns();

    expect(store['suggestie:geen-iban:laatstGetoond']).toBeUndefined();
    expect(store['suggestie:veel-openstaand:laatstGetoond']).toBeUndefined();
    expect(store['ANDERE_PROP']).toBe('behouden');
  });
});

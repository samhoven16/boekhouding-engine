/**
 * tests/unit/kvkApi.test.js
 *
 * haalDataKvK_ — auto-fill bedrijfsgegevens.
 * - Geen API-key  → return null (geen fout)
 * - Ongeldig nr   → return null (geen API-call)
 * - Cache-hit     → return cached value zonder fetch
 * - 200 response  → parsed result-object
 * - Niet-200      → return null + log
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Utils.gs — haalDataKvK_', () => {

  test('geen API-key → null (geen fetch)', () => {
    const ctx = createGasRuntime(['Utils.gs'], {
      PropertiesService: {
        getUserProperties:   () => ({ getProperty: () => null, setProperty: jest.fn(), deleteProperty: jest.fn() }),
        getScriptProperties: () => ({ getProperty: () => null, setProperty: jest.fn(), deleteProperty: jest.fn() }),
      },
      UrlFetchApp: { fetch: jest.fn() },
    });
    expect(ctx.haalDataKvK_('12345678')).toBeNull();
    expect(ctx.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test('ongeldig KvK-nummer (te kort) → null', () => {
    const ctx = createGasRuntime(['Utils.gs']);
    expect(ctx.haalDataKvK_('123')).toBeNull();
    expect(ctx.haalDataKvK_('')).toBeNull();
    expect(ctx.haalDataKvK_(null)).toBeNull();
    expect(ctx.haalDataKvK_('letters')).toBeNull();
  });

  test('geldige response → parsed object', () => {
    const fakeResponse = {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        resultaten: [{
          handelsnaam: 'Test BV',
          type: 'Besloten Vennootschap',
          adres: { straatnaam: 'Hoofdstraat', huisnummer: '12', postcode: '1234AB', plaats: 'Amsterdam' },
        }],
      }),
    };
    const ctx = createGasRuntime(['Utils.gs'], {
      PropertiesService: {
        getUserProperties:   () => ({ getProperty: () => 'TEST_API_KEY', setProperty: jest.fn(), deleteProperty: jest.fn() }),
        getScriptProperties: () => ({ getProperty: () => null, setProperty: jest.fn(), deleteProperty: jest.fn() }),
      },
      CacheService: { getScriptCache: () => ({ get: () => null, put: jest.fn() }) },
      UrlFetchApp: { fetch: jest.fn(() => fakeResponse) },
    });
    const r = ctx.haalDataKvK_('12345678');
    expect(r).not.toBeNull();
    expect(r.naam).toBe('Test BV');
    expect(r.postcode).toBe('1234AB');
    expect(r.plaats).toBe('Amsterdam');
    expect(r.kvkNummer).toBe('12345678');
    expect(ctx.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
  });

  test('niet-200 response → null', () => {
    const ctx = createGasRuntime(['Utils.gs'], {
      PropertiesService: {
        getUserProperties:   () => ({ getProperty: () => 'KEY', setProperty: jest.fn(), deleteProperty: jest.fn() }),
        getScriptProperties: () => ({ getProperty: () => null, setProperty: jest.fn(), deleteProperty: jest.fn() }),
      },
      CacheService: { getScriptCache: () => ({ get: () => null, put: jest.fn() }) },
      UrlFetchApp: { fetch: jest.fn(() => ({ getResponseCode: () => 404, getContentText: () => 'not found' })) },
    });
    expect(ctx.haalDataKvK_('12345678')).toBeNull();
  });

  test('cache-hit → geen fetch', () => {
    const cached = { naam: 'Cached BV', kvkNummer: '12345678', plaats: 'Utrecht' };
    const fetchMock = jest.fn();
    const ctx = createGasRuntime(['Utils.gs'], {
      PropertiesService: {
        getUserProperties:   () => ({ getProperty: () => 'KEY', setProperty: jest.fn(), deleteProperty: jest.fn() }),
        getScriptProperties: () => ({ getProperty: () => null, setProperty: jest.fn(), deleteProperty: jest.fn() }),
      },
      CacheService: { getScriptCache: () => ({ get: () => JSON.stringify(cached), put: jest.fn() }) },
      UrlFetchApp: { fetch: fetchMock },
    });
    const r = ctx.haalDataKvK_('12345678');
    expect(r.naam).toBe('Cached BV');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

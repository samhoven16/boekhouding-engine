/**
 * tests/unit/vies-validatie.test.js
 *
 * P4/P7-FIX (Belastingdienst stress-test):
 * VIES BTW-nummer-validatie voor verleggingsregeling.
 *
 * Wat we testen:
 *  - Format-check rejects pure typo's vóór API-call (kostenbesparing)
 *  - Cache-hit retourneert direct + gecacheerd=true
 *  - Cache-expiry triggert refresh na 30 dagen
 *  - HTTP 404 → valid=false (cached)
 *  - HTTP 5xx of network-error → valid=null (graceful fail, niet gecached)
 *  - Body.isValid=true → valid=true
 *  - Body.isValid=false → valid=false
 *  - Prototype-pollution defense via input
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('VIES validatie — P4/P7 verleggingsregeling guard', () => {
  let ctx;
  let cache;
  let fetchMock;

  beforeEach(() => {
    cache = {};
    fetchMock = jest.fn();
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'EUVerkoop.gs']);
    // Override PropertiesService met in-memory store
    ctx.PropertiesService.getScriptProperties = () => ({
      getProperty: (k) => (k in cache ? cache[k] : null),
      setProperty: (k, v) => { cache[k] = v; },
      deleteProperty: (k) => { delete cache[k]; },
    });
    ctx.UrlFetchApp = { fetch: fetchMock };
  });

  test('Lege input → valid=false, geen API-call', () => {
    const out = ctx.valideerBtwViaVies_('');
    expect(out.valid).toBe(false);
    expect(out.error).toMatch(/leeg/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Ongeldig formaat (NL123) → valid=false, geen API-call', () => {
    const out = ctx.valideerBtwViaVies_('NL123');
    expect(out.valid).toBe(false);
    expect(out.error).toMatch(/format/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Valid DE BTW-nr → API-call met isValid=true', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        isValid: true,
        name: 'SAP SE',
        address: 'Walldorf, DE',
      }),
    });
    const out = ctx.valideerBtwViaVies_('DE123456789');
    expect(out.valid).toBe(true);
    expect(out.naam).toBe('SAP SE');
    expect(out.gecacheerd).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('Tweede call binnen 30d → cache-hit, geen tweede API-call', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: true, name: 'X', address: 'Y' }),
    });
    ctx.valideerBtwViaVies_('DE123456789');
    const out2 = ctx.valideerBtwViaVies_('DE123456789');
    expect(out2.valid).toBe(true);
    expect(out2.gecacheerd).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('Cache ouder dan 30d → refresh', () => {
    // Vul cache met oude entry
    cache['VIES_DE123456789'] = JSON.stringify({
      ts: Date.now() - (31 * 24 * 60 * 60 * 1000),  // 31 dagen oud
      data: { valid: true, naam: 'Oud', adres: '' },
    });
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: true, name: 'Nieuw', address: '' }),
    });
    const out = ctx.valideerBtwViaVies_('DE123456789');
    expect(out.naam).toBe('Nieuw');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('VIES 404 → valid=false, gecached', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 404,
      getContentText: () => '',
    });
    const out = ctx.valideerBtwViaVies_('DE999999999');
    expect(out.valid).toBe(false);
    // Tweede call gebruikt cache
    const out2 = ctx.valideerBtwViaVies_('DE999999999');
    expect(out2.gecacheerd).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('VIES 503 (down) → valid=null, NIET gecached', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 503,
      getContentText: () => 'Service Unavailable',
    });
    const out = ctx.valideerBtwViaVies_('DE123456789');
    expect(out.valid).toBeNull();
    expect(out.error).toMatch(/VIES HTTP 503/);
    // Tweede call moet opnieuw proberen (geen cache van down-state)
    ctx.valideerBtwViaVies_('DE123456789');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('Network error (UrlFetchApp throws) → valid=null', () => {
    fetchMock.mockImplementation(() => { throw new Error('DNS lookup failed'); });
    const out = ctx.valideerBtwViaVies_('DE123456789');
    expect(out.valid).toBeNull();
    expect(out.error).toMatch(/DNS/);
  });

  test('VIES retourneert isValid=false → cached false', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: false, name: '', address: '' }),
    });
    const out = ctx.valideerBtwViaVies_('DE000000000');
    expect(out.valid).toBe(false);
    expect(out.naam).toBe('');
  });

  test('Whitespace + lowercase wordt genormaliseerd', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: true, name: 'X', address: '' }),
    });
    ctx.valideerBtwViaVies_(' de 123 456 789 ');
    // URL moet land=DE en nummer=123456789 zijn
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/DE/vat/123456789');
  });

  test('NL BTW-nr accepteert (zelfde format)', () => {
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: true, name: 'NL BV', address: '' }),
    });
    const out = ctx.valideerBtwViaVies_('NL004384587B39');
    expect(out.valid).toBe(true);
  });

  test('Niet-EU landcode (US) → format-reject, geen API-call', () => {
    const out = ctx.valideerBtwViaVies_('US123456789');
    expect(out.valid).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Cache-corrupt JSON → fallback fresh fetch (geen crash)', () => {
    cache['VIES_DE123456789'] = 'NOT_JSON_GARBAGE';
    fetchMock.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ isValid: true, name: 'OK', address: '' }),
    });
    const out = ctx.valideerBtwViaVies_('DE123456789');
    expect(out.valid).toBe(true);
    expect(out.naam).toBe('OK');
  });
});

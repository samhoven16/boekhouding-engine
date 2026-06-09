/**
 * tests/unit/healthcheck-hardening.test.js
 *
 * Go-live blocker #6: healthcheck-URL was hardcoded in publieke repo +
 * pingde alleen vanuit samhoven16-account. Sam-uitval = blind voor alle
 * klanten 7+ dagen. Derden konden valse-groene pings sturen.
 *
 * Mitigatie:
 *   • URL wordt nu uit ScriptProperty gelezen (HEALTHCHECK_URL)
 *   • 2e onafhankelijke monitor via HEALTHCHECK_URL_BACKUP
 *   • Fallback naar bestaande URL voor backward compat (migratie-pad)
 *   • Lege string in HEALTHCHECK_URL = opt-out, geen fallback
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const trigBron = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');

describe('Triggers.gs — healthcheck-hardening bron', () => {
  test('Hardcoded URL niet meer in const naam HEALTHCHECK_DAGELIJKSE_TAKEN (verwijderd)', () => {
    expect(trigBron).not.toMatch(/const HEALTHCHECK_DAGELIJKSE_TAKEN\s*=/);
  });

  test('Fallback URL bestaat als private constant voor backward compat', () => {
    expect(trigBron).toMatch(/_HEALTHCHECK_FALLBACK_URL/);
  });

  test('Twee URL-slots: primair + backup', () => {
    expect(trigBron).toMatch(/HEALTHCHECK_URL/);
    expect(trigBron).toMatch(/HEALTHCHECK_URL_BACKUP/);
  });

  test('URL-validatie: alleen http(s) URLs worden geaccepteerd (anti-injection)', () => {
    expect(trigBron).toMatch(/\/\^https\?:\\\/\\\/\//);
  });

  test('Opt-out: lege string = klant heeft bewust geen monitoring (geen fallback)', () => {
    expect(trigBron).toMatch(/=== null && urls\.length === 0/);
  });

  test('Beide ping-momenten gebruiken nu de gedeelde helper _pingAlleHealthchecks_', () => {
    const startCall = trigBron.match(/_pingAlleHealthchecks_\(['"]\/start['"]/);
    const endCall = trigBron.match(/_pingAlleHealthchecks_\(['"]['"]/);
    expect(startCall).toBeTruthy();
    expect(endCall).toBeTruthy();
  });

  test('Helper is fail-open per URL (één falende ping breekt nooit dagelijkseTaken)', () => {
    const start = trigBron.indexOf('function _pingAlleHealthchecks_');
    const eind = trigBron.indexOf('\nfunction ', start + 1);
    const blok = trigBron.slice(start, eind);
    expect(blok).toMatch(/try \{[\s\S]+\} catch \(_\) \{[\s\S]*fail-open/);
    expect(blok).toMatch(/forEach\(/);
  });

  test('Backward compat: bestaande klanten zonder ScriptProperty krijgen fallback', () => {
    const start = trigBron.indexOf('function _getHealthcheckUrls_');
    const eind = trigBron.indexOf('\nfunction ', start + 1);
    const blok = trigBron.slice(start, eind);
    expect(blok).toMatch(/_HEALTHCHECK_FALLBACK_URL/);
  });
});

describe('Functionele simulatie — _getHealthcheckUrls_ gedrag', () => {
  let ctx;

  beforeEach(() => {
    ctx = createGasRuntime(['Triggers.gs']);
  });

  function setProps(map) {
    const data = Object.assign({}, map);
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(function(k) { return data.hasOwnProperty(k) ? data[k] : null; }),
    }));
  }

  test('Geen ScriptProperty gezet → fallback URL', () => {
    setProps({});
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/hc-ping\.com/);
  });

  test('Alleen HEALTHCHECK_URL gezet → 1 URL, geen fallback', () => {
    setProps({ 'HEALTHCHECK_URL': 'https://example.com/ping/abc' });
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toEqual(['https://example.com/ping/abc']);
  });

  test('Beide gezet → 2 URLs (primair + backup, geen fallback)', () => {
    setProps({
      'HEALTHCHECK_URL':        'https://hc-ping.com/klant-x',
      'HEALTHCHECK_URL_BACKUP': 'https://uptimerobot.com/heartbeat/y',
    });
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toEqual([
      'https://hc-ping.com/klant-x',
      'https://uptimerobot.com/heartbeat/y',
    ]);
  });

  test('HEALTHCHECK_URL = lege string (opt-out) → GEEN fallback', () => {
    setProps({ 'HEALTHCHECK_URL': '' });
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toEqual([]);  // klant heeft bewust gekozen
  });

  test('Niet-http URL wordt afgewezen (anti-injection)', () => {
    setProps({ 'HEALTHCHECK_URL': 'javascript:alert(1)' });
    const urls = ctx._getHealthcheckUrls_();
    // String niet leeg + niet null → geen fallback toegevoegd; maar URL ook geen geldige http → leeg
    expect(urls).toEqual([]);
  });

  test('Whitespace om URL heen → getrimd', () => {
    setProps({ 'HEALTHCHECK_URL': '  https://hc-ping.com/x  ' });
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toEqual(['https://hc-ping.com/x']);
  });

  test('PropertiesService throwt → fallback URL', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => {
      throw new Error('LIMITED auth');
    });
    const urls = ctx._getHealthcheckUrls_();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/hc-ping\.com/);
  });
});

describe('Functionele simulatie — _pingAlleHealthchecks_ fail-open', () => {
  let ctx;

  beforeEach(() => {
    ctx = createGasRuntime(['Triggers.gs']);
  });

  test('Pings alle URLs ook als één faalt', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(function(k) {
        if (k === 'HEALTHCHECK_URL')        return 'https://faalt.test/x';
        if (k === 'HEALTHCHECK_URL_BACKUP') return 'https://werkt.test/y';
        return null;
      }),
    }));
    const calls = [];
    ctx.UrlFetchApp = {
      fetch: jest.fn(function(url, opts) {
        calls.push({ url: url, payload: opts.payload });
        if (url.indexOf('faalt') !== -1) throw new Error('netwerk-fail');
        return { getResponseCode: () => 200 };
      }),
    };
    // Mag niet throwen
    expect(() => ctx._pingAlleHealthchecks_('', 'duur_ms=100')).not.toThrow();
    expect(calls.length).toBe(2);  // beide URLs aangesproken
    expect(calls[0].payload).toBe('duur_ms=100');
  });

  test('Suffix /start wordt aan elke URL geplakt', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(function(k) {
        if (k === 'HEALTHCHECK_URL') return 'https://example.com/ping';
        return null;
      }),
    }));
    const calls = [];
    ctx.UrlFetchApp = {
      fetch: jest.fn(function(url) { calls.push(url); return { getResponseCode: () => 200 }; }),
    };
    ctx._pingAlleHealthchecks_('/start', 'host=test');
    expect(calls).toEqual(['https://example.com/ping/start']);
  });

  test('Lege URL-array (opt-out) → geen pings, geen crash', () => {
    ctx.PropertiesService.getScriptProperties = jest.fn(() => ({
      getProperty: jest.fn(function(k) {
        if (k === 'HEALTHCHECK_URL') return '';  // opt-out
        return null;
      }),
    }));
    ctx.UrlFetchApp = { fetch: jest.fn() };
    expect(() => ctx._pingAlleHealthchecks_('', '')).not.toThrow();
    expect(ctx.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });
});

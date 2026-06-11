/**
 * tests/unit/audit-fixes-nacht-pr-2.test.js
 *
 * Tests voor de tweede ronde audit-respons-fixes:
 *   - _hashEmail_ (PII-redactie via SHA-256 truncate)
 *   - _veiligeUpdateUrl_ (domain-allowlist + scheme-check)
 *   - toonHoeUpdateIk cache-spam guard
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ONBOARDING_GS = path.resolve(__dirname, '../../src/Onboarding.gs');
const ACCOUNT_VERWIJDEREN_GS = path.resolve(__dirname, '../../src/AccountVerwijderen.gs');
const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');

function maakCtx(overrides) {
  return createGasRuntime(
    [CONFIG_GS, ONBOARDING_GS, ACCOUNT_VERWIJDEREN_GS],
    Object.assign({
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        computeDigest: (alg, s) => {
          // Mock: deterministische pseudo-hash via simple FNV-achtige polynomial.
          // Verschillende input → verschillende output.
          const str = String(s);
          let h = 2166136261;
          for (let i = 0; i < str.length; i++) {
            h = ((h ^ str.charCodeAt(i)) * 16777619) >>> 0;
          }
          const bytes = [];
          for (let i = 0; i < 32; i++) {
            h = ((h * 31) + i) >>> 0;
            bytes.push(h & 0xff);
          }
          return bytes;
        },
      },
    }, overrides || {})
  );
}

describe('_hashEmail_ — PII-redactie via SHA-256 truncate', () => {
  test('returnt 12-char hex string', () => {
    const ctx = maakCtx();
    const h = ctx._hashEmail_('klant@example.nl');
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  test('zelfde input → zelfde hash (deterministisch)', () => {
    const ctx = maakCtx();
    const h1 = ctx._hashEmail_('klant@example.nl');
    const h2 = ctx._hashEmail_('klant@example.nl');
    expect(h1).toBe(h2);
  });

  test('verschillende input → andere hash', () => {
    const ctx = maakCtx();
    expect(ctx._hashEmail_('klant1@example.nl'))
      .not.toBe(ctx._hashEmail_('klant2@example.nl'));
  });

  test('lege/null input: returnt placeholder, geen crash', () => {
    const ctx = maakCtx();
    expect(typeof ctx._hashEmail_('')).toBe('string');
    expect(typeof ctx._hashEmail_(null)).toBe('string');
    expect(typeof ctx._hashEmail_(undefined)).toBe('string');
  });

  test('crypto-fout: returnt "hash-fail" string', () => {
    const ctx = maakCtx({
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        computeDigest: () => { throw new Error('crypto broken'); },
      },
    });
    expect(ctx._hashEmail_('klant@example.nl')).toBe('hash-fail');
  });
});

describe('_veiligeUpdateUrl_ — domain-allowlist', () => {
  let ctx;
  beforeAll(() => { ctx = maakCtx(); });
  const FALLBACK = 'https://boekhoudbaar.nl/update/';

  test('boekhoudbaar.nl: toegestaan', () => {
    expect(ctx._veiligeUpdateUrl_('https://boekhoudbaar.nl/update/v2.8.0/'))
      .toBe('https://boekhoudbaar.nl/update/v2.8.0/');
  });

  test('subdomain van boekhoudbaar.nl: toegestaan', () => {
    expect(ctx._veiligeUpdateUrl_('https://docs.boekhoudbaar.nl/update/'))
      .toBe('https://docs.boekhoudbaar.nl/update/');
  });

  test('github.com: toegestaan (voor Sam-gist/pages)', () => {
    expect(ctx._veiligeUpdateUrl_('https://github.com/samhoven16/boekhouding-engine/releases'))
      .toBe('https://github.com/samhoven16/boekhouding-engine/releases');
  });

  test('gist.github.com: toegestaan', () => {
    expect(ctx._veiligeUpdateUrl_('https://gist.github.com/samhoven16/abc'))
      .toBe('https://gist.github.com/samhoven16/abc');
  });

  test('phishing-domein (attacker.com): fallback naar default', () => {
    expect(ctx._veiligeUpdateUrl_('https://attacker.com/phish')).toBe(FALLBACK);
  });

  test('look-alike (boekhoudbaar.nl.attacker.com): fallback', () => {
    expect(ctx._veiligeUpdateUrl_('https://boekhoudbaar.nl.attacker.com/x'))
      .toBe(FALLBACK);
  });

  test('http (geen https): fallback', () => {
    expect(ctx._veiligeUpdateUrl_('http://boekhoudbaar.nl/update/'))
      .toBe(FALLBACK);
  });

  test('javascript:-scheme: fallback', () => {
    expect(ctx._veiligeUpdateUrl_('javascript:alert(1)'))
      .toBe(FALLBACK);
  });

  test('data:-URI: fallback', () => {
    expect(ctx._veiligeUpdateUrl_('data:text/html,<script>')).toBe(FALLBACK);
  });

  test('lege string / null / undefined: fallback', () => {
    expect(ctx._veiligeUpdateUrl_('')).toBe(FALLBACK);
    expect(ctx._veiligeUpdateUrl_(null)).toBe(FALLBACK);
    expect(ctx._veiligeUpdateUrl_(undefined)).toBe(FALLBACK);
  });

  test('case-insensitive op host', () => {
    expect(ctx._veiligeUpdateUrl_('https://BOEKHOUDBAAR.NL/update/'))
      .toBe('https://BOEKHOUDBAAR.NL/update/');
  });

  test('URL met query/fragment: blijft behouden', () => {
    expect(ctx._veiligeUpdateUrl_('https://boekhoudbaar.nl/update/?v=2.8#start'))
      .toBe('https://boekhoudbaar.nl/update/?v=2.8#start');
  });
});

describe('toonHoeUpdateIk — cache-spam guard 60s', () => {
  test('eerste call binnen 60s na vorige: cache NIET ge-invalideerd', () => {
    const userPropStore = {
      'toonHoeUpdateIkForceTs': String(Date.now() - 30 * 1000),  // 30s geleden
      'licentieConfigTs': '999',
    };
    const ctx = createGasRuntime(
      [CONFIG_GS, ONBOARDING_GS, ACCOUNT_VERWIJDEREN_GS],
      {
        PropertiesService: {
          getScriptProperties: () => ({
            getProperty: () => null, setProperty: () => {},
            setProperties: () => {}, deleteProperty: () => {},
          }),
          getUserProperties: () => ({
            getProperty: (k) => (k in userPropStore ? userPropStore[k] : null),
            setProperty: (k, v) => { userPropStore[k] = v; },
            deleteProperty: (k) => { delete userPropStore[k]; },
          }),
        },
        HtmlService: {
          createHtmlOutput: () => ({
            setWidth: function() { return this; },
            setHeight: function() { return this; },
            setSandboxMode: function() { return this; },
          }),
          SandboxMode: { IFRAME: 'IFRAME' },
        },
        SpreadsheetApp: {
          getUi: () => ({ showModalDialog: jest.fn(), alert: jest.fn() }),
          getActiveSpreadsheet: () => null,
        },
        haalConfigOp_: () => null,
      }
    );
    ctx.toonHoeUpdateIk();
    expect(userPropStore.licentieConfigTs).toBe('999');  // NIET gewist
  });

  test('eerste call na 60s: cache WEL ge-invalideerd', () => {
    const userPropStore = {
      'toonHoeUpdateIkForceTs': String(Date.now() - 120 * 1000),  // 2 min geleden
      'licentieConfigTs': '999',
    };
    const ctx = createGasRuntime(
      [CONFIG_GS, ONBOARDING_GS, ACCOUNT_VERWIJDEREN_GS],
      {
        PropertiesService: {
          getScriptProperties: () => ({
            getProperty: () => null, setProperty: () => {},
            setProperties: () => {}, deleteProperty: () => {},
          }),
          getUserProperties: () => ({
            getProperty: (k) => (k in userPropStore ? userPropStore[k] : null),
            setProperty: (k, v) => { userPropStore[k] = v; },
            deleteProperty: (k) => { delete userPropStore[k]; },
          }),
        },
        HtmlService: {
          createHtmlOutput: () => ({
            setWidth: function() { return this; },
            setHeight: function() { return this; },
            setSandboxMode: function() { return this; },
          }),
          SandboxMode: { IFRAME: 'IFRAME' },
        },
        SpreadsheetApp: {
          getUi: () => ({ showModalDialog: jest.fn(), alert: jest.fn() }),
          getActiveSpreadsheet: () => null,
        },
        haalConfigOp_: () => null,
      }
    );
    ctx.toonHoeUpdateIk();
    expect(userPropStore.licentieConfigTs).toBeUndefined();  // WEL gewist
  });
});

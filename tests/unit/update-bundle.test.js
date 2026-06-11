/**
 * tests/unit/update-bundle.test.js
 *
 * Tier 2.1: assisted manual update via `update-bundle`-endpoint + client-side
 * fetch + lokale hash-verificatie. Geen auto-write — die komt in tier 2.2.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const UPDATE_BUNDLE_GS = path.resolve(__dirname, '../../src/UpdateBundle.gs');
const LICENTIE_GS      = path.resolve(__dirname, '../../src/Licentie.gs');
const CONFIG_GS        = path.resolve(__dirname, '../../src/Config.gs');
const UTILS_GS         = path.resolve(__dirname, '../../src/Utils.gs');

function maakClientCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({
    LICENTIE_SERVER_URL: 'https://server.example/exec',
    licentiesleutel: 'BKHB-TEST-1234',
    licentieKlantnaam: 'Test Klant',
  }, opts.props || {});
  const fetchMock = opts.fetchMock || jest.fn(() => ({
    getContentText: () => JSON.stringify({ ok: true, versie: '2.8.0', files: [], hash: '' }),
    getResponseCode: () => 200,
  }));

  const ctx = createGasRuntime(
    [CONFIG_GS, UTILS_GS, LICENTIE_GS, UPDATE_BUNDLE_GS],
    {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in propStore ? propStore[k] : null),
          setProperty: (k, v) => { propStore[k] = v; },
          deleteProperty: (k) => { delete propStore[k]; },
          setProperties: (o) => Object.assign(propStore, o),
        }),
        getUserProperties: () => ({
          getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
        }),
      },
      Session: {
        getActiveUser: () => ({ getEmail: () => 'klant@example.nl' }),
      },
      UrlFetchApp: { fetch: fetchMock },
    }
  );
  return { ctx, propStore, fetchMock };
}

describe('haalUpdateBundleOp — client-side fetch + verify', () => {
  test('ongeldig versie-formaat: weiger zonder server-call', () => {
    const { ctx, fetchMock } = maakClientCtx();
    const r = ctx.haalUpdateBundleOp('niet-een-versie');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/versie.*format|formaat/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('geen licentiesleutel: weiger zonder server-call', () => {
    const { ctx, fetchMock } = maakClientCtx({
      props: { LICENTIE_SERVER_URL: 'https://x.example', licentiesleutel: '' },
    });
    const r = ctx.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/licentie/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('geen server-URL: weiger zonder server-call', () => {
    const { ctx, fetchMock } = maakClientCtx({
      props: { LICENTIE_SERVER_URL: '', licentiesleutel: 'BKHB-X' },
    });
    const r = ctx.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/server/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('happy-path: roept update-bundle aan met sleutel + email + versie', () => {
    const bestanden = [{ naam: 'Config.gs', source: 'const X = 1;', type: 'server_js' }];
    // Mock-runtime gebruikt FNV-hash; bereken zelfde hash hier voor hash-match.
    const { ctx } = maakClientCtx();
    const verwachtHash = ctx._berekenBundleHash_(bestanden);
    const { ctx: ctx2, fetchMock } = maakClientCtx({
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({
          ok: true, versie: '2.8.0', files: bestanden, hash: verwachtHash,
        }),
        getResponseCode: () => 200,
      })),
    });
    const r = ctx2.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(true);
    expect(r.versie).toBe('2.8.0');
    expect(r.files).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('actie=update-bundle');
    expect(url).toContain('sleutel=' + encodeURIComponent('BKHB-TEST-1234'));
    expect(url).toContain('email=' + encodeURIComponent('klant@example.nl'));
    expect(url).toContain('versie=2.8.0');
  });

  test('hash-mismatch (tampering): weiger, klant ziet "NIET plakken"', () => {
    const bestanden = [{ naam: 'Code.gs', source: 'malicious', type: 'server_js' }];
    const { ctx, fetchMock } = maakClientCtx({
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({
          ok: true, versie: '2.8.0', files: bestanden, hash: 'verkeerde-hash-van-server',
        }),
        getResponseCode: () => 200,
      })),
    });
    const r = ctx.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/hash|verifi/i);
    expect(r.fout).toMatch(/NIET plakken/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('server returnt fout: pass-through zonder hash-check', () => {
    const { ctx } = maakClientCtx({
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({ ok: false, fout: 'Versie 2.8.0 niet gepubliceerd' }),
        getResponseCode: () => 200,
      })),
    });
    const r = ctx.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet gepubliceerd/);
  });

  test('netwerk-fout: ok=false met fout-prefix', () => {
    const { ctx } = maakClientCtx({
      fetchMock: jest.fn(() => { throw new Error('DNS timeout'); }),
    });
    const r = ctx.haalUpdateBundleOp('2.8.0');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/Netwerkfout/);
  });
});

describe('_berekenBundleHash_ — deterministisch + tamper-detection', () => {
  test('zelfde files → zelfde hash', () => {
    const { ctx } = maakClientCtx();
    const files = [{ naam: 'A.gs', source: 'x', type: 'server_js' }];
    expect(ctx._berekenBundleHash_(files)).toBe(ctx._berekenBundleHash_(files));
  });

  test('verschillende source → andere hash', () => {
    const { ctx } = maakClientCtx();
    expect(ctx._berekenBundleHash_([{ naam: 'A.gs', source: 'x' }]))
      .not.toBe(ctx._berekenBundleHash_([{ naam: 'A.gs', source: 'y' }]));
  });

  test('verschillende file-naam → andere hash', () => {
    const { ctx } = maakClientCtx();
    expect(ctx._berekenBundleHash_([{ naam: 'A.gs', source: 'x' }]))
      .not.toBe(ctx._berekenBundleHash_([{ naam: 'B.gs', source: 'x' }]));
  });

  test('lege array: returnt geldige hash, geen crash', () => {
    const { ctx } = maakClientCtx();
    const h = ctx._berekenBundleHash_([]);
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });
});

describe('Source-code level: client-functies hebben GEEN trailing underscore', () => {
  // Apps Script google.script.run kan trailing-underscore-functies niet aanroepen.
  // Lessen-leren uit AVG-flow near-miss (PR #280): voorkom regressie.
  const src = fs.readFileSync(UPDATE_BUNDLE_GS, 'utf8');

  test('haalUpdateBundleOp gedefinieerd ZONDER trailing underscore', () => {
    expect(src).toMatch(/function haalUpdateBundleOp\(/);
    expect(src).not.toMatch(/function haalUpdateBundleOp_\(/);
  });

  test('toonUpdateBundleDialog gedefinieerd ZONDER trailing underscore', () => {
    expect(src).toMatch(/function toonUpdateBundleDialog\(/);
    expect(src).not.toMatch(/function toonUpdateBundleDialog_\(/);
  });

  test('HTML google.script.run matched function-definitie', () => {
    expect(src).toMatch(/\.haalUpdateBundleOp\(versie\)/);
  });
});

describe('Source-code level: menu-integratie', () => {
  test('Menu.gs verwijst naar toonUpdateBundleDialog', () => {
    const menu = fs.readFileSync(path.resolve(__dirname, '../../src/Menu.gs'), 'utf8');
    expect(menu).toMatch(/'toonUpdateBundleDialog'/);
  });
});

describe('Server-side updateBundleEndpoint_ format check', () => {
  // De server-endpoint zelf is best-tested met integration of een echte
  // licence-server-mock; hier alleen smoke-check dat hij bestaat met de
  // verwachte parameters.
  const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
  const code = fs.readFileSync(CODE_GS, 'utf8');

  test('endpoint geregistreerd in dispatcher', () => {
    expect(code).toMatch(/actie === 'update-bundle'/);
    expect(code).toMatch(/updateBundleEndpoint_\(e\)/);
  });

  test('endpoint vereist sleutel + email + versie', () => {
    expect(code).toMatch(/function updateBundleEndpoint_\(e\)/);
    const fnStart = code.indexOf('function updateBundleEndpoint_(e)');
    const fnEnd = code.indexOf('// ─', fnStart + 100);
    const body = code.slice(fnStart, fnEnd);
    expect(body).toMatch(/sleutel.*verplicht|sleutel.*email.*verplicht/i);
    expect(body).toMatch(/X\.Y\.Z|Ongeldig versie/);
  });

  test('endpoint berekent hash met SHA-256', () => {
    const fnStart = code.indexOf('function updateBundleEndpoint_(e)');
    const fnEnd = code.indexOf('// ─', fnStart + 100);
    const body = code.slice(fnStart, fnEnd);
    expect(body).toMatch(/SHA_256/);
    expect(body).toMatch(/computeDigest/);
  });

  test('endpoint heeft expliciete 15-min expiry', () => {
    const fnStart = code.indexOf('function updateBundleEndpoint_(e)');
    const fnEnd = code.indexOf('// ─', fnStart + 100);
    const body = code.slice(fnStart, fnEnd);
    expect(body).toMatch(/15 \* 60 \* 1000/);
  });
});

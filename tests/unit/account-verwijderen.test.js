/**
 * tests/unit/account-verwijderen.test.js
 *
 * Klant-zijde AVG Art. 17 zelfservice (AccountVerwijderen.gs). Bevat:
 *   - aanvraagVerwijderOtp   (delegeert naar licence-server 'aanvraag-otp')
 *   - voerAccountVerwijdering (delegeert naar licence-server 'verwijder' +
 *      wist lokale licentie-cache bij succes)
 *
 * Server-zijde (verwijderEndpoint_) heeft eigen tests in
 * cycle80-btw-validator-art17.test.js. Hier alleen de client-wrapper.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');
const ACCOUNT_VERWIJDEREN_GS = path.resolve(__dirname, '../../src/AccountVerwijderen.gs');
const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');
const UTILS_GS  = path.resolve(__dirname, '../../src/Utils.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({ LICENTIE_SERVER_URL: 'https://server.example/exec' }, opts.props || {});
  const fetchMock = opts.fetchMock || jest.fn(() => ({
    getContentText: () => JSON.stringify({ ok: true }),
    getResponseCode: () => 200,
  }));

  const ctx = createGasRuntime(
    [CONFIG_GS, UTILS_GS, LICENTIE_GS, ACCOUNT_VERWIJDEREN_GS],
    {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in propStore ? propStore[k] : null),
          setProperty: (k, v) => { propStore[k] = v; },
          deleteProperty: (k) => { delete propStore[k]; },
          setProperties: (obj) => Object.assign(propStore, obj),
        }),
        getUserProperties: () => ({
          getProperty: () => null,
          setProperty: () => {},
          deleteProperty: () => {},
        }),
      },
      UrlFetchApp: { fetch: fetchMock },
    }
  );
  return { ctx, propStore, fetchMock };
}

describe('AccountVerwijderen — aanvraagVerwijderOtp', () => {
  test('lege email: weiger zonder server-call', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.aanvraagVerwijderOtp('');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/ongeldig/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('email zonder @: weiger', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.aanvraagVerwijderOtp('geenAtSign');
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('geen LICENTIE_SERVER_URL geconfigureerd: graceful melding', () => {
    const { ctx, fetchMock } = maakCtx({ props: { LICENTIE_SERVER_URL: '' } });
    const r = ctx.aanvraagVerwijderOtp('klant@example.nl');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/server.*niet geconfigureerd|support/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('happy-path: roept aanvraag-otp aan met url-encoded email', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.aanvraagVerwijderOtp('Klant+tag@example.nl');
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('actie=aanvraag-otp');
    expect(url).toContain('email=' + encodeURIComponent('klant+tag@example.nl'));
  });

  test('netwerk-fout: ok=false met netwerkfout-prefix', () => {
    const { ctx } = maakCtx({
      fetchMock: jest.fn(() => { throw new Error('DNS timeout'); }),
    });
    const r = ctx.aanvraagVerwijderOtp('klant@example.nl');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/netwerk/i);
    expect(r.fout).toMatch(/DNS timeout/);
  });

  test('server returns fout: pass-through', () => {
    const { ctx } = maakCtx({
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({ ok: false, fout: 'Dit e-mailadres is niet bekend als klant.' }),
        getResponseCode: () => 200,
      })),
    });
    const r = ctx.aanvraagVerwijderOtp('onbekend@example.nl');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet bekend/);
  });
});

describe('Regression-guard: google.script.run-aanroepbare functies hebben geen trailing underscore', () => {
  // Apps Script: trailing _ = "private", niet bereikbaar via google.script.run
  // vanuit HtmlService-dialogen. Tests passeren wel zonder onderscheid (ze
  // roepen ctx.fn direct aan). Deze guard voorkomt regressie naar private-
  // naam (heeft in PR #280 commit eeeaa91 tot near-miss geleid).
  const fs = require('fs');
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/AccountVerwijderen.gs'), 'utf8');

  test('aanvraagVerwijderOtp gedefinieerd ZONDER trailing underscore', () => {
    expect(src).toMatch(/function aanvraagVerwijderOtp\(/);
    expect(src).not.toMatch(/function aanvraagVerwijderOtp_\(/);
  });
  test('voerAccountVerwijdering gedefinieerd ZONDER trailing underscore', () => {
    expect(src).toMatch(/function voerAccountVerwijdering\(/);
    expect(src).not.toMatch(/function voerAccountVerwijdering_\(/);
  });
  test('HTML google.script.run aanroep matched function-definitie', () => {
    // De `.aanvraagVerwijderOtp(email)` / `.voerAccountVerwijdering(email, otp)`
    // moeten exact matchen met de gedefinieerde functienamen — anders krijgt
    // klant withFailureHandler in plaats van resultaat.
    expect(src).toMatch(/\.aanvraagVerwijderOtp\(email\)/);
    expect(src).toMatch(/\.voerAccountVerwijdering\(email, otp\)/);
  });
});

describe('AccountVerwijderen — voerAccountVerwijdering', () => {
  test('lege otp: weiger zonder server-call', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.voerAccountVerwijdering('klant@example.nl', '');
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('otp niet 6 cijfers: weiger', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.voerAccountVerwijdering('klant@example.nl', '12345');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/6 cijfers/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('happy-path: lokale licentie-cache wordt gewist na server-OK', () => {
    const { ctx, propStore, fetchMock } = maakCtx({
      props: {
        LICENTIE_SERVER_URL: 'https://server.example/exec',
        licentieCacheGeldigTot: String(Date.now() + 86400000),
      },
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({ ok: true, bericht: 'Klaar.' }),
        getResponseCode: () => 200,
      })),
    });
    expect(propStore.licentieCacheGeldigTot).toBeDefined();
    const r = ctx.voerAccountVerwijdering('klant@example.nl', '123456');
    expect(r.ok).toBe(true);
    expect(propStore.licentieCacheGeldigTot).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('actie=verwijder');
    expect(url).toContain('otp=123456');
  });

  test('server returns fout: cache blijft staan (klant kan retry)', () => {
    const { ctx, propStore } = maakCtx({
      props: {
        LICENTIE_SERVER_URL: 'https://server.example/exec',
        licentieCacheGeldigTot: '99999',
      },
      fetchMock: jest.fn(() => ({
        getContentText: () => JSON.stringify({ ok: false, fout: 'Onjuiste code.' }),
        getResponseCode: () => 200,
      })),
    });
    const r = ctx.voerAccountVerwijdering('klant@example.nl', '999999');
    expect(r.ok).toBe(false);
    expect(propStore.licentieCacheGeldigTot).toBe('99999');
  });

  test('email lowercased + url-encoded', () => {
    const { ctx, fetchMock } = maakCtx();
    ctx.voerAccountVerwijdering('Klant@Example.NL', '123456');
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('email=' + encodeURIComponent('klant@example.nl'));
  });
});

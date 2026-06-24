/**
 * tests/unit/koude-kopie-licentie-activatie.test.js
 *
 * Regressie uit de go-live keuring (onboarding-doorloop): een VERSE klant-kopie
 * heeft GEEN LICENTIE_SERVER_URL-property, want Google kopieert Script Properties
 * NIET mee bij "Maak een kopie" (dat is juist de kopieerbeveiliging). Voorheen gaf
 * getLicentieServerUrl_() dan '' → aanvraagOtp/activeerMetOtp blokkeerden met
 * "Licentieserver niet geconfigureerd" → de klant kwam nooit voorbij het activatie-
 * scherm en kon nooit een factuur maken. Sam zag dit nooit omdat isEigenaarBypass_
 * zijn admin-account doorlaat.
 *
 * Fix: getLicentieServerUrl_() valt terug op een hardcoded default (code reist wél
 * mee met de kopie) bij een AFWEZIGE property, maar laat een EXPLICIET lege string
 * staan zodat bestaande "niet geconfigureerd"-graceful-paden niet breken.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG_GS   = path.resolve(__dirname, '../../src/Config.gs');
const UTILS_GS    = path.resolve(__dirname, '../../src/Utils.gs');
const LICENTIE_GS = path.resolve(__dirname, '../../src/Licentie.gs');

function maakCtx(props, fetchMock) {
  const propStore = Object.assign({}, props || {});
  const ctx = createGasRuntime(
    [CONFIG_GS, UTILS_GS, LICENTIE_GS],
    {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k in propStore ? propStore[k] : null),
          setProperty: (k, v) => { propStore[k] = v; },
          deleteProperty: (k) => { delete propStore[k]; },
          setProperties: (obj) => Object.assign(propStore, obj),
        }),
        getUserProperties: () => ({
          getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
        }),
      },
      UrlFetchApp: {
        fetch: fetchMock || jest.fn(() => ({
          getContentText: () => JSON.stringify({ ok: true }),
          getResponseCode: () => 200,
        })),
      },
    }
  );
  return { ctx, propStore };
}

describe('Verse klant-kopie kan activeren (go-live keuring)', () => {
  test('koude kopie (property AFWEZIG): getter valt terug op hardcoded exec-URL', () => {
    const { ctx } = maakCtx({});            // LICENTIE_SERVER_URL niet in store
    const url = ctx.getLicentieServerUrl_();
    expect(url).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
  });

  test('koude kopie: aanvraagOtp blokkeert NIET, bereikt de server', () => {
    const fetchMock = jest.fn(() => ({
      getContentText: () => JSON.stringify({ ok: true }),
      getResponseCode: () => 200,
    }));
    const { ctx } = maakCtx({}, fetchMock);
    const r = ctx.aanvraagOtp('klant@example.nl');
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('actie=aanvraag-otp');
  });

  test('EXPLICIET lege property behoudt graceful-degradatie (geen regressie)', () => {
    const fetchMock = jest.fn();
    const { ctx } = maakCtx({ LICENTIE_SERVER_URL: '' }, fetchMock);
    const r = ctx.aanvraagOtp('klant@example.nl');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet geconfigureerd/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('gezette property wint van de default (override blijft werken)', () => {
    const { ctx } = maakCtx({ LICENTIE_SERVER_URL: 'https://staging.example/exec' });
    expect(ctx.getLicentieServerUrl_()).toBe('https://staging.example/exec');
  });
});

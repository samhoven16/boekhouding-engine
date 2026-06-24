/**
 * tests/unit/f-doc-161-gemini-fout-nl.test.js
 *
 * RATEL (F-DOC-161, documentatie/customer-voice): scanDocumentMetAI gaf bij een
 * Gemini-fout het RAUWE Engelse bericht ("API key not valid. Please pass a valid
 * API key." / "Resource has been exhausted (e.g. check quota).") rechtstreeks
 * aan de klant terug — onoplosbaar zonder Sam. _geminiFoutNl_ mapt nu op de
 * canonieke status/HTTP-code naar een NL, actuabele melding (zoals Mollie.gs
 * HTTP-codes vertaalt).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
const NL = /handmatig|API-sleutel|limiet|overbelast|toegang|facturering/i;
const GEEN_ENGELS = (s) => {
  expect(s).not.toMatch(/api key not valid/i);
  expect(s).not.toMatch(/resource has been exhausted/i);
  expect(s).not.toMatch(/quota|overloaded|exhausted|unavailable/i);
};

describe('F-DOC-161 — _geminiFoutNl_ vertaalt Gemini-fouten naar klant-NL', () => {
  test('ongeldige API-sleutel (UNAUTHENTICATED / "API key not valid") → NL + actie', () => {
    const a = ctx._geminiFoutNl_({ code: 401, status: 'UNAUTHENTICATED', message: 'API key not valid. Please pass a valid API key.' });
    expect(a).toMatch(/API-sleutel/i);
    expect(a).toMatch(/handmatig/i);
    GEEN_ENGELS(a);
  });

  test('quota op (RESOURCE_EXHAUSTED / 429) → NL "limiet bereikt"', () => {
    const a = ctx._geminiFoutNl_({ code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted (e.g. check quota).' });
    expect(a).toMatch(/limiet/i);
    GEEN_ENGELS(a);
  });

  test('geen toegang/billing (PERMISSION_DENIED / 403) → NL over facturering', () => {
    const a = ctx._geminiFoutNl_({ code: 403, status: 'PERMISSION_DENIED', message: 'Permission denied. Enable billing.' });
    expect(a).toMatch(/toegang|facturering/i);
    GEEN_ENGELS(a);
  });

  test('dienst overbelast (UNAVAILABLE / 503) → NL "even overbelast"', () => {
    const a = ctx._geminiFoutNl_({ code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' });
    expect(a).toMatch(/overbelast/i);
    GEEN_ENGELS(a);
  });

  test('onbekende fout → generieke handmatig-invoeren-hint (geen rauw bericht)', () => {
    const a = ctx._geminiFoutNl_({ code: 418, status: 'WEIRD', message: 'Some totally novel teapot failure' });
    expect(a).toMatch(/handmatig/i);
    expect(a).not.toMatch(/teapot/i);     // rauw bericht lekt niet
  });

  test('alle takken leveren een niet-lege NL-string', () => {
    [{}, { code: 401 }, { status: 'RESOURCE_EXHAUSTED' }, { message: 'overloaded' }].forEach((e) => {
      const a = ctx._geminiFoutNl_(e);
      expect(typeof a).toBe('string');
      expect(a.length).toBeGreaterThan(10);
      expect(a).toMatch(NL);
    });
  });
});

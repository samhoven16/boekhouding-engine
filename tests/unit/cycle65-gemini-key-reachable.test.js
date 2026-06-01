/**
 * tests/unit/cycle65-gemini-key-reachable.test.js
 *
 * Cycle 65 — eerlijkheids-audit: "Upload + AI" bon-scan was onbereikbaar.
 *
 * De AI-scan (scanDocumentMetAI) las GEMINI_API_KEY, maar er was GEEN
 * menu-item om die sleutel te zetten — terwijl de foutmelding klanten
 * naar "Instellingen → Gemini API-sleutel" stuurde (een dood pad).
 * Dat is een valse belofte: een feature die je niet kunt aanzetten.
 *
 * Fix: zetGeminiApiKey() + menu-item toegevoegd; reader ontsleutelt nu,
 * zodat een via de setter (versleuteld) opgeslagen sleutel werkt.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const menuBron = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');

function maakUiMock(antwoord) {
  const Button = { OK: 'OK', CANCEL: 'CANCEL' };
  return {
    Button,
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', OK: 'OK' },
    prompt: () => ({
      getSelectedButton: () => Button.OK,
      getResponseText: () => antwoord,
    }),
    alert: () => {},
  };
}

/** Voorziet de gas-runtime Utilities-mock van de crypto/encoding-functies die
 *  versleutelString_/ontsleutelString_ en scanDocumentMetAI nodig hebben. */
function augmentUtilities(ctx) {
  let uuidTeller = 0;
  ctx.Utilities.getUuid = () => 'uuid-' + (++uuidTeller);
  ctx.Utilities.base64Encode = (s) => Buffer.from(
    Array.isArray(s) ? s : String(s), Array.isArray(s) ? undefined : 'binary'
  ).toString('base64');
  ctx.Utilities.base64Decode = (b64) => Array.from(Buffer.from(String(b64), 'base64'));
  ctx.Utilities.DigestAlgorithm = { SHA_256: 'SHA_256' };
  ctx.Utilities.computeDigest = () => [1, 2, 3, 4];
}

describe('CYCLE 65: AI bon-scan is bereikbaar (geen valse belofte)', () => {
  test('menu wiret zetGeminiApiKey', () => {
    expect(menuBron).toContain("'zetGeminiApiKey'");
    expect(menuBron).toMatch(/Gemini API-key voor bon-scan[\s\S]{0,40}'zetGeminiApiKey'/);
  });

  test('zetGeminiApiKey bestaat en slaat versleuteld op in ScriptProperties', () => {
    const opslag = {};
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs'], {
      SpreadsheetApp: { getUi: () => maakUiMock('AIzaSyTESTKEY1234567890abc') },
    });
    augmentUtilities(ctx);
    ctx.PropertiesService.getScriptProperties = () => ({
      getProperty: (k) => opslag[k] || null,
      setProperty: (k, v) => { opslag[k] = v; },
      deleteProperty: (k) => { delete opslag[k]; },
    });

    ctx.zetGeminiApiKey();

    expect(opslag.GEMINI_API_KEY).toBeDefined();
    expect(opslag.GEMINI_API_KEY).toMatch(/^enc:/);                 // versleuteld
    expect(opslag.GEMINI_API_KEY).not.toContain('AIzaSyTESTKEY');   // niet in klaartekst
    // round-trip: reader moet exact dezelfde sleutel terugkrijgen
    expect(ctx.ontsleutelString_(opslag.GEMINI_API_KEY)).toBe('AIzaSyTESTKEY1234567890abc');
  });

  test('zonder sleutel: foutmelding wijst naar het ECHTE menu-item (niet meer dood pad)', () => {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
    ctx.PropertiesService.getScriptProperties = () => ({ getProperty: () => null });

    const res = ctx.scanDocumentMetAI('x', 'image/jpeg');
    expect(res.fout).toMatch(/niet ingesteld/i);
    expect(res.fout).toMatch(/Gemini API-key voor bon-scan/);  // = exact menu-label
    expect(res.fout).not.toMatch(/Instellingen → Gemini API-sleutel\b\)/); // oude dode tekst weg
  });

  test('met opgeslagen (versleutelde) sleutel komt de scan voorbij de key-gate', () => {
    const opslag = { GEMINI_API_KEY: null };
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs'], {
      SpreadsheetApp: { getUi: () => maakUiMock('AIzaSyVALIDLOOKINGKEY0001') },
    });
    augmentUtilities(ctx);
    ctx.PropertiesService.getScriptProperties = () => ({
      getProperty: (k) => opslag[k] || null,
      setProperty: (k, v) => { opslag[k] = v; },
      deleteProperty: (k) => { delete opslag[k]; },
    });
    ctx.zetGeminiApiKey();

    // Reader mag NIET meer de "niet ingesteld"-fout geven — de sleutel wordt
    // nu ontsleuteld en geaccepteerd. (Downstream fetch is gemockt → andere
    // fout of resultaat, maar in elk geval voorbij de gate.)
    const res = ctx.scanDocumentMetAI('x', 'image/jpeg');
    if (res && res.fout) {
      expect(res.fout).not.toMatch(/niet ingesteld/i);
    }
  });

  test('spraak-invoer gebruikt DEZELFDE versleutelde sleutel (geen enc:-string als key)', () => {
    const opslag = {};
    let gebruikteUrl = null;
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs'], {
      SpreadsheetApp: { getUi: () => maakUiMock('AIzaSyVOICEKEY01234567890') },
      UrlFetchApp: {
        fetch: (url) => {
          gebruikteUrl = url;
          return {
            getContentText: () => JSON.stringify({
              candidates: [{ content: { parts: [{ text: '{"omschr":"test","bedrag":10}' }] } }],
            }),
            getResponseCode: () => 200,
          };
        },
      },
    });
    augmentUtilities(ctx);
    ctx.PropertiesService.getScriptProperties = () => ({
      getProperty: (k) => opslag[k] || null,
      setProperty: (k, v) => { opslag[k] = v; },
      deleteProperty: (k) => { delete opslag[k]; },
    });
    ctx.zetGeminiApiKey();

    const velden = ctx.parseSpraakinvoer('declaratie', 'tien euro lunch');
    // De feature levert velden op (dus de sleutel werd correct ONTSLEUTELD)
    expect(velden).toMatchObject({ omschr: 'test', bedrag: 10 });
    // En de ruwe enc:-string mag NOOIT in de request-URL belanden
    expect(gebruikteUrl).toContain('key=AIzaSyVOICEKEY01234567890');
    expect(gebruikteUrl).not.toContain('enc%3A');
    expect(gebruikteUrl).not.toContain('enc:');
  });
});

/**
 * tests/unit/cycle12-google-warning-preframe.test.js
 *
 * Cycle 12 — website noemde NERGENS de Google "niet-geverifieerde app"-
 * warning die klant bij eerste open ziet. Per prompt verplicht:
 *   "Mention: unverified app warning explained calmly"
 *
 * Zonder pre-frame = conversion-killer: klant koopt, ziet enge Google-
 * waarschuwing, denkt scam, vraagt refund / verdwijnt stil.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const INDEX = path.resolve(__dirname, '../../website/index.html');

describe('CYCLE 12: Google-warning pre-framing op homepage', () => {
  const html = fs.readFileSync(INDEX, 'utf8');

  test('FAQ heeft entry over de niet-geverifieerde-app-warning', () => {
    expect(html).toMatch(/<details[^>]*id="google-warning"/);
    expect(html).toMatch(/niet-geverifieerde app/i);
  });

  test('Uitleg vermeldt waarom de warning verschijnt (geen OAuth-verification)', () => {
    expect(html).toMatch(/OAuth-app-verification|Google.{0,30}verification/i);
  });

  test('Concrete instructie aanwezig: "Geavanceerd" → "Ga naar Boekhoudbaar"', () => {
    expect(html).toMatch(/Geavanceerd/);
    expect(html).toMatch(/Ga naar Boekhoudbaar/);
  });

  test('Source-available GitHub-link genoemd voor extra trust', () => {
    expect(html).toMatch(/github\.com\/samhoven16\/boekhouding-engine/);
  });

  test('Eerlijke toon — geen "altijd veilig"-claim', () => {
    // Forbidden phrasing per prompt: "garandeert", "altijd", "100%"
    const fnStart = html.indexOf('id="google-warning"');
    const fn = html.slice(fnStart, fnStart + 3000);  // FAQ-entry body
    expect(fn).not.toMatch(/100% veilig|gegarandeerd veilig|altijd veilig/i);
  });

  test('Schema.org FAQPage bevat de Google-warning-Q&A (SEO + AI-citations)', () => {
    // JSON-LD moet ook deze vraag bevatten zodat zoekmachines het indexeren
    const jsonStart = html.indexOf('"@type": "FAQPage"');
    const jsonEnd = html.indexOf('}\n    }\n  ]\n}', jsonStart);
    const jsonBlok = html.slice(jsonStart, jsonEnd > 0 ? jsonEnd : jsonStart + 5000);
    expect(jsonBlok).toMatch(/niet-geverifieerde app/i);
    expect(jsonBlok).toMatch(/Geavanceerd/);
  });

  test('Mailto-link voor klanten met twijfels', () => {
    const fnStart = html.indexOf('id="google-warning"');
    const fn = html.slice(fnStart, fnStart + 3000);
    expect(fn).toMatch(/mailto:hallo@boekhoudbaar\.nl/);
  });
});

/**
 * tests/unit/cycle36-hreflang-symmetric.test.js
 *
 * Cycle 36 — website index.html (NL hoofdpagina) had GEEN hreflang-
 * declarations, terwijl /en/index.html ze wél heeft. Google vereist
 * symmetrische hreflang op beide kanten van een talenpaar; asymmetrie =
 * signaal genegeerd = /en/ telde als duplicate content van /, met
 * negatief effect op zowel NL als EN ranking.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const NL = fs.readFileSync(path.resolve(__dirname, '../../website/index.html'), 'utf8');
const EN = fs.readFileSync(path.resolve(__dirname, '../../website/en/index.html'), 'utf8');

describe('CYCLE 36: hreflang symmetrisch op NL + EN homepages', () => {
  test('NL pagina declareert hreflang=nl naar /', () => {
    expect(NL).toMatch(/<link rel="alternate" hreflang="nl" href="https:\/\/www\.boekhoudbaar\.nl\/"\s*\/?>/);
  });

  test('NL pagina declareert hreflang=en naar /en/', () => {
    expect(NL).toMatch(/<link rel="alternate" hreflang="en" href="https:\/\/www\.boekhoudbaar\.nl\/en\/"\s*\/?>/);
  });

  test('NL pagina declareert hreflang=x-default naar /', () => {
    expect(NL).toMatch(/<link rel="alternate" hreflang="x-default" href="https:\/\/www\.boekhoudbaar\.nl\/"\s*\/?>/);
  });

  test('EN pagina blijft hreflang=nl/en/x-default declareren (geen regressie)', () => {
    expect(EN).toMatch(/hreflang="nl"/);
    expect(EN).toMatch(/hreflang="en"/);
    expect(EN).toMatch(/hreflang="x-default"/);
  });

  test('Beide pagina\'s wijzen naar exact dezelfde URLs (symmetrie-check)', () => {
    const nlUrls = (NL.match(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g) || []).sort();
    const enUrls = (EN.match(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g) || []).sort();
    expect(nlUrls.length).toBe(3);
    expect(enUrls.length).toBe(3);
    // Genormaliseerd vergelijken (zelfde URLs in beide clusters)
    const extractUrl = (s) => s.match(/href="([^"]+)"/)[1];
    expect(nlUrls.map(extractUrl).sort()).toEqual(enUrls.map(extractUrl).sort());
  });

  test('Canonical blijft uniek per pagina (geen cross-canonical)', () => {
    expect(NL).toMatch(/<link rel="canonical" href="https:\/\/www\.boekhoudbaar\.nl\/"/);
    expect(EN).toMatch(/<link rel="canonical" href="https:\/\/www\.boekhoudbaar\.nl\/en\/"/);
  });
});

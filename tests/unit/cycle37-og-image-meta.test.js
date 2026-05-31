/**
 * tests/unit/cycle37-og-image-meta.test.js
 *
 * Cycle 37 — website index.html had `og:image` (SVG) zonder begeleidende
 * `og:image:type` metadata. Facebook/LinkedIn vereisen dit voor non-raster
 * og-images, anders renderen ze een lege card. Plus `og:image:alt` ontbrak
 * voor screen-readers in social apps. Zelfde issue op twitter:image.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.resolve(__dirname, '../../website/index.html'), 'utf8');

describe('CYCLE 37: OG/Twitter image metadata', () => {
  test('og:image:type declareert SVG MIME-type', () => {
    expect(HTML).toMatch(/<meta property="og:image:type" content="image\/svg\+xml">/);
  });

  test('og:image:alt is gevuld met beschrijvende tekst', () => {
    expect(HTML).toMatch(/<meta property="og:image:alt" content="[^"]{20,}"/);
  });

  test('twitter:image:alt is gevuld', () => {
    expect(HTML).toMatch(/<meta name="twitter:image:alt" content="[^"]{20,}"/);
  });

  test('og:image:width en og:image:height blijven gedeclareerd (regressie)', () => {
    expect(HTML).toMatch(/<meta property="og:image:width" content="1200">/);
    expect(HTML).toMatch(/<meta property="og:image:height" content="630">/);
  });

  test('og:image:alt en twitter:image:alt zijn consistent', () => {
    const og = HTML.match(/<meta property="og:image:alt" content="([^"]+)"/);
    const tw = HTML.match(/<meta name="twitter:image:alt" content="([^"]+)"/);
    expect(og).toBeTruthy();
    expect(tw).toBeTruthy();
    expect(og[1]).toBe(tw[1]);
  });

  test('Alt-tekst noemt het product + prijs (conversie-relevant)', () => {
    const alt = HTML.match(/<meta property="og:image:alt" content="([^"]+)"/)[1];
    expect(alt).toMatch(/Boekhoudbaar/i);
    expect(alt).toMatch(/€49|49,-|eenmalig/i);
  });
});

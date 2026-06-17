/**
 * tests/unit/cycle46-sitemap-lastmod.test.js
 *
 * Cycle 46 — sitemap.xml had `lastmod=2026-05-08` voor alle URLs maar 8
 * pagina's waren deze week aangepast via cycles 36/37/44 (hreflang +
 * og:image:type + alt). Stale lastmod = search-engines schedulen re-crawl
 * later → SEO-fixes komen langzamer naar voren.
 *
 * Fix: update lastmod naar 2026-05-29 voor de 8 daadwerkelijk gewijzigde
 * pages (homepage, en, demo, functies, vergelijking, faq, over,
 * transparantie). Overige 39 URLs houden hun datum (geen content-
 * verandering = geen valide lastmod-update).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const sitemap = fs.readFileSync(path.resolve(__dirname, '../../website/sitemap.xml'), 'utf8');

const UPDATED_PAGES = [
  'https://www.boekhoudbaar.nl/',
  'https://www.boekhoudbaar.nl/en/',
  'https://www.boekhoudbaar.nl/demo/',
  'https://www.boekhoudbaar.nl/functies/',
  'https://www.boekhoudbaar.nl/vergelijking/',
  'https://www.boekhoudbaar.nl/faq/',
  'https://www.boekhoudbaar.nl/over/',
  'https://www.boekhoudbaar.nl/transparantie/',
];

describe('CYCLE 46: sitemap lastmod refresh op gewijzigde pages', () => {
  UPDATED_PAGES.forEach((url) => {
    test(`${url} heeft nieuwe lastmod 2026-05-29`, () => {
      // Match: <loc>URL</loc> gevolgd door whitespace + <lastmod>2026-05-29</lastmod>
      const escapedUrl = url.replace(/[/]/g, '\\/').replace(/\./g, '\\.');
      const re = new RegExp(`<loc>${escapedUrl}</loc>\\s*<lastmod>2026-05-29</lastmod>`);
      expect(sitemap).toMatch(re);
    });
  });

  test('Niet-gewijzigde pages behouden oude lastmod (geen valse refresh)', () => {
    // Sample-check: /privacy/ was niet aangepast deze week
    expect(sitemap).toMatch(/<loc>https:\/\/www\.boekhoudbaar\.nl\/privacy\/<\/loc>\s*<lastmod>2026-05-08<\/lastmod>/);
  });

  test('Sitemap blijft valide XML-structuur', () => {
    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sitemap).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    // Aantal <url>-blokken: 47 baseline + 5 Trojaans-Paard PR
    // (exact-online-stoppen, zonder-abonnement, e-bh-vs-mb-vs-bb, landing, gratis)
    // + 1 Trojaans-Paard slot (moneybird-alternatief-2026) = 53
    // + 1 /starters/ landing page (positionering ronde 3) = 54
    // + 4 ontbrekende indexeerbare pagina's toegevoegd (#B3 SEO-maximalisatie:
    //   continuiteit, tools/besparing, update, adverteren) = 58
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    expect(urlCount).toBe(58);
  });
});

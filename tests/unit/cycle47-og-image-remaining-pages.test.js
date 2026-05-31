/**
 * tests/unit/cycle47-og-image-remaining-pages.test.js
 *
 * Cycle 47 — sibling-fix #2 van cycle 37/44. Vier resterende sub-pages
 * (gids, bronnen, roadmap, partners) hadden og:image zonder type+alt.
 * Eén compacte test ipv één-per-page (round-5 retro: minder is meer
 * voor mechanische content-fixes).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PAGES = [
  ['website/gids/index.html',     /gidsen/i],
  ['website/bronnen/index.html',  /bronnen|verifieerbaarheid/i],
  ['website/roadmap/index.html',  /roadmap/i],
  ['website/partners/index.html', /partners|affiliates/i],
];

describe('CYCLE 47: og:image:type + alt op 4 resterende sub-pages', () => {
  PAGES.forEach(([file, altPattern]) => {
    test(`${file} heeft type=svg+xml en alt-beschrijving`, () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(html).toContain('<meta property="og:image:type" content="image/svg+xml">');
      const m = html.match(/<meta property="og:image:alt" content="([^"]+)"/);
      expect(m).toBeTruthy();
      expect(m[1].length).toBeGreaterThanOrEqual(20);
      expect(m[1]).toMatch(altPattern);
    });
  });
});

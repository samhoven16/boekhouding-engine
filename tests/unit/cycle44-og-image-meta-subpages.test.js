/**
 * tests/unit/cycle44-og-image-meta-subpages.test.js
 *
 * Cycle 44 — cycle 37 voegde og:image:type + og:image:alt toe aan de NL
 * homepage. Maar 7 sub-pages hadden HETZELFDE issue: og:image zonder
 * type-declaratie. Bij share van bv. /functies/ of /faq/ op Facebook/
 * LinkedIn renderde de card mogelijk leeg.
 *
 * Batch-fix: alle 7 sub-pages (demo, over, faq, functies, transparantie,
 * vergelijking, en/) krijgen nu type + alt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PAGES = [
  { file: 'website/demo/index.html',          type: 'svg+xml', altPattern: /Boekhoudbaar/i },
  { file: 'website/over/index.html',          type: 'jpeg',    altPattern: /Sam Hoven/i },
  { file: 'website/faq/index.html',           type: 'svg+xml', altPattern: /Boekhoudbaar/i },
  { file: 'website/functies/index.html',      type: 'svg+xml', altPattern: /Boekhoudbaar/i },
  { file: 'website/transparantie/index.html',       type: 'svg+xml', altPattern: /Boekhoudbaar/i },
  { file: 'website/vergelijking/index.html',  type: 'svg+xml', altPattern: /Boekhoudbaar/i },
  { file: 'website/en/index.html',            type: 'svg+xml', altPattern: /Boekhoudbaar/i },
];

describe('CYCLE 44: og:image meta op 7 sub-pages', () => {
  PAGES.forEach((p) => {
    describe(p.file, () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../..', p.file), 'utf8');

      test('og:image:type declareert juiste MIME', () => {
        // String-contains check ipv regex — `+` in `svg+xml` is anders regex-special.
        expect(html).toContain(`<meta property="og:image:type" content="image/${p.type}">`);
      });

      test('og:image:alt is gevuld en relevant', () => {
        const m = html.match(/<meta property="og:image:alt" content="([^"]+)"/);
        expect(m).toBeTruthy();
        expect(m[1].length).toBeGreaterThanOrEqual(20);
        expect(m[1]).toMatch(p.altPattern);
      });
    });
  });

  test('Over-pagina krijgt ook twitter:image:alt (had al twitter:image)', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../website/over/index.html'), 'utf8');
    expect(html).toMatch(/<meta name="twitter:image:alt" content="[^"]{10,}"/);
  });

  test('Transparantie krijgt ook twitter:image:alt', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../website/transparantie/index.html'), 'utf8');
    expect(html).toMatch(/<meta name="twitter:image:alt" content="[^"]{10,}"/);
  });

  test('Cycle 37 (homepage) niet teruggedraaid in deze PR', () => {
    // Cycle 37 zit in een parallelle PR. We checken alleen dat deze PR
    // niets weghaalt, niet dat de tags al aanwezig zijn.
    const html = fs.readFileSync(path.resolve(__dirname, '../../website/index.html'), 'utf8');
    expect(html).toContain('<meta property="og:image"');
  });
});

/**
 * tests/unit/cycle49-bedankt-noindex.test.js
 *
 * Cycle 49 — bedanktPagina_ (post-purchase) was indexeerbaar voor
 * search-crawlers. Transactionele pagina's horen niet in Google search.
 * Risico: screenshots / cached versies kunnen lekken via search.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');
const body = src.slice(src.indexOf('function bedanktPagina_('),
                       src.indexOf('\n}\n', src.indexOf('function bedanktPagina_(')) + 2);

describe('CYCLE 49: bedanktPagina_ noindex', () => {
  test('Bevat <meta name="robots" content="noindex,nofollow">', () => {
    expect(body).toContain('<meta name="robots" content="noindex,nofollow">');
  });

  test('Plaatsing in <head> (vóór <title>)', () => {
    const robotsIdx = body.indexOf('name="robots"');
    const titleIdx = body.indexOf('<title>');
    expect(robotsIdx).toBeGreaterThan(0);
    expect(robotsIdx).toBeLessThan(titleIdx);
  });
});

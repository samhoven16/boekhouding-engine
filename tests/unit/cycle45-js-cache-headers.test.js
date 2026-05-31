/**
 * tests/unit/cycle45-js-cache-headers.test.js
 *
 * Cycle 45 — website/_headers had geen cache-rule voor /*.js. consent.js
 * werd op elke pagina-view ingeladen zonder cache-policy → browser default
 * (vaak 0 → opnieuw downloaden bij elke navigatie). Extra bandbreedte +
 * extra Cloudflare-requests.
 *
 * Fix: zelfde patroon als CSS — 1 dag browser, 1 week edge.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HEADERS = fs.readFileSync(path.resolve(__dirname, '../../website/_headers'), 'utf8');

describe('CYCLE 45: /*.js cache-rule', () => {
  test('/*.js rule bestaat in _headers', () => {
    expect(HEADERS).toMatch(/^\/\*\.js$/m);
  });

  test('/*.js krijgt Cache-Control met max-age + s-maxage', () => {
    // Match: /*.js gevolgd door indent + Cache-Control regel
    expect(HEADERS).toMatch(/\/\*\.js\s*\n\s+Cache-Control:\s*public,\s*max-age=\d+,\s*s-maxage=\d+/);
  });

  test('Browser-cache = 1 dag (86400s), edge = 1 week (604800s) — match CSS', () => {
    const m = HEADERS.match(/\/\*\.js\s*\n\s+Cache-Control:\s*public,\s*max-age=(\d+),\s*s-maxage=(\d+)/);
    expect(m).toBeTruthy();
    expect(parseInt(m[1])).toBe(86400);
    expect(parseInt(m[2])).toBe(604800);
  });

  test('/*.css rule blijft bestaan (regressie)', () => {
    expect(HEADERS).toMatch(/\/\*\.css\s*\n\s+Cache-Control:/);
  });

  test('Security-headers blijven onaangetast (regressie)', () => {
    expect(HEADERS).toMatch(/X-Frame-Options:\s*DENY/);
    expect(HEADERS).toMatch(/Strict-Transport-Security:/);
  });
});

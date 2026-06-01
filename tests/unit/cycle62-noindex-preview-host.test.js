/**
 * tests/unit/cycle62-noindex-preview-host.test.js
 *
 * Cycle 62 — Cloudflare Pages middleware die niet-canonieke hosts
 * (*.pages.dev preview-deploys, apex-zonder-www) een noindex-header
 * geeft. Bewezen probleem: <hash>.boekhouding-engine.pages.dev verscheen
 * in search naast www.boekhoudbaar.nl → duplicate content.
 *
 * De middleware is een ES-module (export onRequest). We laden 'm via
 * dynamische evaluatie met een mock next()/Response.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MW_PATH = path.resolve(__dirname, '../../website/functions/_middleware.js');

// Minimale Response/URL-polyfill voor de test-context
function maakResponseClass() {
  return class Response {
    constructor(body, init) {
      this.body = body;
      init = init || {};
      this.status = init.status || 200;
      const h = new Map();
      if (init.headers && typeof init.headers.forEach === 'function') {
        init.headers.forEach((v, k) => h.set(String(k).toLowerCase(), v));
      } else if (init.headers && init.headers._map) {
        init.headers._map.forEach((v, k) => h.set(k, v));
      }
      this.headers = {
        _map: h,
        set: (k, v) => h.set(String(k).toLowerCase(), v),
        get: (k) => (h.has(String(k).toLowerCase()) ? h.get(String(k).toLowerCase()) : null),
        forEach: (fn) => h.forEach(fn),
      };
    }
  };
}

function laadMiddleware() {
  const code = fs.readFileSync(MW_PATH, 'utf8')
    // strip ES-module export-keyword zodat we 't in vm kunnen draaien
    .replace(/export\s+async\s+function\s+onRequest/, 'async function onRequest');
  const sandbox = { Response: maakResponseClass(), URL, module: {}, exports: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;this.__onRequest = onRequest;', sandbox);
  return sandbox.__onRequest;
}

function maakContext(url, opklaarHeaders) {
  const ResponseCls = maakResponseClass();
  return {
    request: { url },
    next: async () => {
      const init = { status: 200, headers: { forEach: () => {} } };
      const r = new ResponseCls('<html></html>', init);
      if (opklaarHeaders) Object.keys(opklaarHeaders).forEach((k) => r.headers.set(k, opklaarHeaders[k]));
      return r;
    },
  };
}

describe('CYCLE 62: noindex-middleware voor niet-canonieke hosts', () => {
  const onRequest = laadMiddleware();

  test('Canonieke host www.boekhoudbaar.nl → GEEN noindex', async () => {
    const r = await onRequest(maakContext('https://www.boekhoudbaar.nl/'));
    expect(r.headers.get('X-Robots-Tag')).toBeNull();
  });

  test('Preview-host *.pages.dev → noindex,nofollow', async () => {
    const r = await onRequest(maakContext('https://350e4a58.boekhouding-engine.pages.dev/'));
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  test('Branch-preview-host → noindex', async () => {
    const r = await onRequest(maakContext('https://fix-cycle60.boekhouding-engine.pages.dev/'));
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  test('Apex zonder www → noindex (vangnet naast redirect)', async () => {
    const r = await onRequest(maakContext('https://boekhoudbaar.nl/'));
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  test('Canonieke host behoudt bestaande headers ongemoeid', async () => {
    const r = await onRequest(maakContext('https://www.boekhoudbaar.nl/', { 'Cache-Control': 'public' }));
    expect(r.headers.get('Cache-Control')).toBe('public');
    expect(r.headers.get('X-Robots-Tag')).toBeNull();
  });

  test('Source declareert canonieke host als constante', () => {
    const src = fs.readFileSync(MW_PATH, 'utf8');
    expect(src).toMatch(/CANONIEKE_HOST\s*=\s*['"]www\.boekhoudbaar\.nl['"]/);
  });

  test('Geen externe calls / tracking in middleware-code (privacy-propositie)', () => {
    const src = fs.readFileSync(MW_PATH, 'utf8');
    // Strip block- en line-comments — woorden als "tracking" mogen in uitleg staan
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\*|^\s*\/\//.test(l)).join('\n');
    expect(codeOnly).not.toMatch(/\bfetch\(|XMLHttpRequest|analytics/i);
  });
});

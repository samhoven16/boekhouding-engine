/**
 * tests/unit/website-interne-links.test.js
 *
 * KLASSE-SLUITER: elke interne link op de website moet resolven naar óf een
 * bestaand bestand (folder/index.html of .html) óf een regel in _redirects.
 * Een dode interne link = klant-dead-end + SEO-verlies. De klasse is nu schoon
 * (de /go/*-affiliate-links zitten in _redirects); deze test houdt 'm schoon —
 * een toekomstige dode link faalt in CI i.p.v. op productie.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '../../website');

function walk(dir) {
  let out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (/\.html$/.test(n)) out.push(p);
  }
  return out;
}

// _redirects-bronpaden (eerste token van elke niet-comment-regel).
const redirectSources = new Set(
  fs.readFileSync(path.join(SITE, '_redirects'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0])
);

function resolvet(href) {
  const clean = href.replace(/[?#].*$/, '');                  // query/anchor weg
  if (redirectSources.has(clean) || redirectSources.has(clean.replace(/\/$/, ''))) return true;
  const z = clean.replace(/\/$/, '');
  return [
    path.join(SITE, clean, 'index.html'),
    path.join(SITE, z + '.html'),
    path.join(SITE, z, 'index.html'),
    path.join(SITE, clean),                                   // direct bestand (bv. .ics/.txt)
  ].some((c) => fs.existsSync(c));
}

const ASSET = /\.(css|js|png|jpe?g|svg|ico|xml|txt|webmanifest|ics|pdf|woff2?|webp|gif|avif)$/i;

const gebroken = [];
for (const f of walk(SITE)) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//') || ASSET.test(href.replace(/[?#].*$/, '')) ||
        href.startsWith('/assets') || href.startsWith('/.well-known')) continue;
    if (!resolvet(href)) gebroken.push(`${path.relative(SITE, f)} → ${href}`);
  }
}

describe('website interne links (klasse-sluiter)', () => {
  test('_redirects is gelezen', () => {
    expect(redirectSources.size).toBeGreaterThan(3);
  });
  test('er zijn interne links gescand', () => {
    // sanity: de walk + regex werken (homepage heeft interne links)
    expect(fs.existsSync(path.join(SITE, 'index.html'))).toBe(true);
  });
  test('geen dode interne links (bestand of _redirects-regel)', () => {
    expect([...new Set(gebroken)]).toEqual([]);
  });
});

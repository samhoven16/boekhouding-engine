/**
 * Cycle 89: CSS-only "levende scroll" animatielaag.
 *
 * Beschermt de drie invariants van deze cycle:
 *   1. website/animations.css bestaat en bevat de drie effect-blokken
 *   2. ALLE HTML pagina's in website/ linken naar /animations.css
 *   3. De CSS respecteert prefers-reduced-motion en gebruikt @supports-gates
 *      zodat browsers zonder scroll-driven animations niet breken
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WEBSITE = path.join(ROOT, 'website');
const CSS_PATH = path.join(WEBSITE, 'animations.css');

function walkHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'functions' || entry.name === 'node_modules') continue;
      out.push(...walkHtml(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

describe('CYCLE 89: CSS-only levende scroll-laag', () => {
  test('website/animations.css bestaat', () => {
    expect(fs.existsSync(CSS_PATH)).toBe(true);
  });

  test('animations.css definieert reveal-on-scroll, nav-shadow, en knop-glow', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/\.reveal-on-scroll\s*\{/);
    expect(css).toMatch(/@keyframes\s+bb-reveal/);
    expect(css).toMatch(/nav\[aria-label="Hoofdnavigatie"\]/);
    expect(css).toMatch(/\[class\*="btn-"\][^{]*:hover/);
  });

  test('animations.css guards scroll-driven animations via @supports', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/@supports\s*\(animation-timeline:\s*view\(\)\)/);
    expect(css).toMatch(/@supports\s*\(animation-timeline:\s*scroll\(\)\)/);
  });

  test('animations.css respecteert prefers-reduced-motion', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  test('elke HTML-pagina in website/ linkt naar /animations.css', () => {
    const pages = walkHtml(WEBSITE);
    expect(pages.length).toBeGreaterThan(40);
    const missing = pages.filter((p) => {
      const html = fs.readFileSync(p, 'utf8');
      return !html.includes('/animations.css');
    });
    expect(missing).toEqual([]);
  });

  test('homepage bevat minstens één reveal-on-scroll opt-in', () => {
    const html = fs.readFileSync(path.join(WEBSITE, 'index.html'), 'utf8');
    expect(html).toMatch(/class="[^"]*reveal-on-scroll/);
  });
});

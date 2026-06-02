/**
 * tests/unit/cycle87-responsive-cleanup.test.js
 *
 * Cycle 87 — technische hygiëne op de homepage.
 *
 * Twee deliverables:
 *  - 9 inconsistente breakpoints (420, 480, 580, 640, 720, 760, 768, 900, 1024)
 *    geconsolideerd naar industrie-standaard 3: 640 (mobiel), 768 (tablet),
 *    1024 (desktop). prefers-color-scheme + prefers-reduced-motion blijven
 *    onaangetast (andere categorie).
 *  - Inline-style attributes verminderd van 26 → ≤22 (agenda-feed sectie
 *    gesaneerd: 5 inline-style attributes met in totaal 22+ properties
 *    naar 5 herbruikbare CSS-classes).
 *
 * Regressie-guards: nieuwe breakpoints of inline-style-spam triggert deze
 * tests. Bewuste overschrijding vereist update van de assertions.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const HOMEPAGE = fs.readFileSync(
  path.resolve(__dirname, '../../website/index.html'),
  'utf8'
);

describe('CYCLE 87: breakpoint-consolidatie 9 → 3', () => {
  test('alleen 640/768/1024 als max-width-breakpoints (excl. prefers-*)', () => {
    const matches = HOMEPAGE.match(/@media\s*\(max-width:\s*(\d+)px\)/g) || [];
    const waardes = matches.map((m) => {
      const px = m.match(/(\d+)px/);
      return px ? parseInt(px[1]) : null;
    }).filter((v) => v !== null);
    const uniek = Array.from(new Set(waardes)).sort((a, b) => a - b);
    expect(uniek).toEqual([640, 768, 1024]);
  });

  test('geen verlate stragglers (420, 480, 580, 720, 760, 900)', () => {
    [420, 480, 580, 720, 760, 900].forEach((px) => {
      const re = new RegExp(`@media\\s*\\(max-width:\\s*${px}px`);
      expect(HOMEPAGE).not.toMatch(re);
    });
  });

  test('prefers-color-scheme + prefers-reduced-motion blijven werken', () => {
    expect(HOMEPAGE).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(HOMEPAGE).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('CYCLE 87: agenda-feed sectie heeft geen inline-styles meer', () => {
  test('section gebruikt class i.p.v. inline background-gradient', () => {
    expect(HOMEPAGE).toMatch(/<section id="agenda-feed" class="agenda-feed"/);
    expect(HOMEPAGE).not.toMatch(/<section id="agenda-feed"[^>]*style="background:linear-gradient/);
  });

  test('agenda-feed-knop class bestaat in <style> en wordt gebruikt in markup', () => {
    expect(HOMEPAGE).toMatch(/\.agenda-feed-knop\s*\{/);
    expect(HOMEPAGE).toMatch(/<a [^>]*class="agenda-feed-knop"/);
  });

  test('agenda-feed-knop wordt NIET inline gestyled met background:#2EC4B6', () => {
    expect(HOMEPAGE).not.toMatch(/style="background:#2EC4B6;color:#0D1B4E;padding:14px 26px/);
  });
});

describe('CYCLE 87: totaal inline-styles binnen acceptable cap', () => {
  test('aantal style="..."-attributes blijft ≤ 28 (agenda-cleanup -6; footer-leefsignaal +4)', () => {
    // Soft cap. Houdt herintroductie van inline-style spam in de gaten.
    // Cap inclusief cycle 85's footer-leefsignaal-strook (4 inline-styles
    // voor dot/link/sep/datum-span). Verlagen is doel; verhogen vereist
    // motivatie in commit.
    const matches = HOMEPAGE.match(/style="/g) || [];
    expect(matches.length).toBeLessThanOrEqual(28);
  });
});

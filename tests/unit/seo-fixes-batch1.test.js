/**
 * tests/unit/seo-fixes-batch1.test.js
 *
 * SEO-fixes batch 1 na seo-strategist + positionering + content-gap audits.
 * Sam's probleem: site alleen vindbaar op exact "boekhoudbaar".
 *
 * Fixes:
 *   1. Homepage H1 keyword-first (was brand-first)
 *   2. Homepage <title>/<meta> met koop-intent keywords
 *   3. Gids-hub block op homepage (internal linking naar 6 koop-intent gidsen)
 *   4. BreadcrumbList schema op /over/, /demo/, /continuiteit/ (misten het)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const home = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');
const over = fs.readFileSync(path.join(ROOT, 'website/over/index.html'), 'utf8');
const demo = fs.readFileSync(path.join(ROOT, 'website/demo/index.html'), 'utf8');
const cont = fs.readFileSync(path.join(ROOT, 'website/continuiteit/index.html'), 'utf8');

describe('Fix #1 — Homepage H1 keyword-first', () => {
  test('H1 bevat "Boekhoudprogramma" + "ZZP" (category keyword vooraan)', () => {
    const m = home.match(/<h1 id="hero-heading">[\s\S]*?<\/h1>/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/Boekhoudprogramma/);
    expect(m[0]).toMatch(/ZZP/);
    expect(m[0]).toMatch(/eenmanszaak/);
  });

  test('H1 noemt niet meer alleen "Boekhouding zonder abonnement in Google Drive"', () => {
    const m = home.match(/<h1 id="hero-heading">[\s\S]*?<\/h1>/);
    expect(m[0]).not.toMatch(/in jouw Google Drive\.<\/h1>/);
  });

  test('Brand-span behouden voor visuele branding (niet verwijderd)', () => {
    expect(home).toMatch(/<span class="hero-brand">Boekhoudbaar<\/span>/);
  });
});

describe('Fix #2 — Homepage title/meta koop-intent keywords', () => {
  test('Title leidt met "Boekhoudprogramma ZZP" (niet met brand)', () => {
    const m = home.match(/<title>([^<]+)<\/title>/);
    expect(m[1]).toMatch(/^Boekhoudprogramma ZZP/);
  });

  test('Title bevat "zonder abonnement" + "€49"', () => {
    const m = home.match(/<title>([^<]+)<\/title>/);
    expect(m[1]).toMatch(/zonder abonnement/);
    expect(m[1]).toMatch(/€49/);
  });

  test('Meta-description bevat "goedkoop" + "eenmanszaak" (koop-intent keywords)', () => {
    const m = home.match(/<meta name="description" content="([^"]+)"/);
    expect(m[1]).toMatch(/[Gg]oedkoop/);
    expect(m[1]).toMatch(/eenmanszaak/);
  });

  test('Meta-description ≤ 200 chars (SEO best practice)', () => {
    const m = home.match(/<meta name="description" content="([^"]+)"/);
    expect(m[1].length).toBeLessThanOrEqual(200);
  });
});

describe('Fix #3 — Gids-hub internal-linking block', () => {
  test('Gids-hub section bestaat met id="gidsen"', () => {
    expect(home).toMatch(/<section id="gidsen" class="gids-hub"/);
  });

  test('Hub linkt naar 6 koop-intent gidsen met beschrijvende anchor', () => {
    const start = home.indexOf('id="gidsen"');
    const eind = home.indexOf('</section>', start);
    const blok = home.slice(start, eind);
    expect(blok).toMatch(/href="\/gids\/btw-aangifte-zzp\/"/);
    expect(blok).toMatch(/href="\/gids\/zelf-boekhouding-doen-zzp\/"/);
    expect(blok).toMatch(/href="\/gids\/moneybird-alternatief-2026\/"/);
    expect(blok).toMatch(/href="\/gids\/aftrekbare-kosten-zzp\/"/);
    expect(blok).toMatch(/href="\/gids\/zelfstandigenaftrek-2026\/"/);
    expect(blok).toMatch(/href="\/gids\/factuur-opstellen-zzp\/"/);
  });

  test('Hub heeft "Bekijk alle 35+ gidsen"-link naar /gids/', () => {
    const start = home.indexOf('id="gidsen"');
    const eind = home.indexOf('</section>', start);
    const blok = home.slice(start, eind);
    expect(blok).toMatch(/href="\/gids\/"[^>]*>Bekijk alle 35\+ gidsen/);
  });

  test('Hub gebruikt class-based styling (geen inline-styles → CYCLE 87 cap)', () => {
    const start = home.indexOf('id="gidsen"');
    const eind = home.indexOf('</section>', start);
    const blok = home.slice(start, eind);
    expect(blok).not.toMatch(/style="/);
  });

  test('Gids-hub CSS-classes gedefinieerd in <style>', () => {
    expect(home).toMatch(/\.gids-hub-grid \{/);
    expect(home).toMatch(/\.gids-hub-kaart \{/);
  });
});

describe('Fix #4 — BreadcrumbList op /over/, /demo/, /continuiteit/', () => {
  test('/over/ heeft BreadcrumbList (was alleen Person)', () => {
    expect(over).toMatch(/"@type":"BreadcrumbList"/);
    expect(over).toMatch(/"name":"Over"/);
  });

  test('/over/ Person heeft nu knowsAbout (E-E-A-T)', () => {
    expect(over).toMatch(/"knowsAbout":\[/);
    expect(over).toMatch(/ZZP-boekhouding/);
  });

  test('/demo/ heeft BreadcrumbList + WebPage (had geen JSON-LD)', () => {
    expect(demo).toMatch(/"@type":"BreadcrumbList"/);
    expect(demo).toMatch(/"@type":"WebPage"/);
    expect(demo).toMatch(/"name":"Demo"/);
  });

  test('/continuiteit/ heeft BreadcrumbList', () => {
    expect(cont).toMatch(/"@type":"BreadcrumbList"/);
    expect(cont).toMatch(/"name":"Continuïteit"/);
  });

  test('Alle 3 breadcrumbs hebben Boekhoudbaar als positie-1 root', () => {
    [over, demo, cont].forEach(function(html) {
      expect(html).toMatch(/"position":1,"name":"Boekhoudbaar","item":"https:\/\/www\.boekhoudbaar\.nl\/"/);
    });
  });
});

describe('Fix #5 — broken FAQ-links + OG-sync (seo-strategist 2e ronde)', () => {
  test('Migratie-FAQ linkt naar BESTAANDE gids-bestanden (geen 404)', () => {
    // Was: /gids/e-boekhouden-alternatief.html + exact-online-alternatief.html (bestaan niet)
    expect(home).not.toMatch(/\/gids\/e-boekhouden-alternatief\.html/);
    expect(home).not.toMatch(/\/gids\/exact-online-alternatief\.html/);
    // Nu: bestaande bestanden via trailing-slash
    expect(home).toMatch(/\/gids\/e-boekhouden-vs-moneybird-vs-boekhoudbaar\//);
    expect(home).toMatch(/\/gids\/exact-online-stoppen-besparing\//);
  });

  test('OG-title + Twitter-title gealigneerd met nieuwe keyword-strategie', () => {
    expect(home).toMatch(/og:title" content="Boekhoudprogramma ZZP zonder abonnement/);
    expect(home).toMatch(/twitter:title" content="Boekhoudprogramma ZZP zonder abonnement/);
  });

  test('Meta-description ≤ 160 chars (ingekort na 2e SEO-ronde)', () => {
    const m = home.match(/<meta name="description" content="([^"]+)"/);
    expect(m[1].length).toBeLessThanOrEqual(160);
  });
});

describe('Anti-regressie: bestaande inline-style cap niet overschreden', () => {
  test('Homepage inline-styles ≤ 28 (CYCLE 87)', () => {
    const matches = home.match(/style="/g) || [];
    expect(matches.length).toBeLessThanOrEqual(28);
  });
});

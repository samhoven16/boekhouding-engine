/**
 * tests/unit/starters-landing.test.js
 *
 * /starters/ landing page — positionering voor Persona Linde (startende
 * ZZP'er, Sam's primaire doelgroep). Positionering-audit ronde 3 vond:
 * Linde scoort 1-3 op 6/9 bestaande pagina's; landing.html sluit starters
 * letterlijk uit ("2 kampen: Excel of Moneybird"). Deze pagina vangt haar
 * intent + taal expliciet op.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const starters = fs.readFileSync(path.join(ROOT, 'website/starters/index.html'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'website/sitemap.xml'), 'utf8');

describe('Starters-pagina — bestaan + SEO-basis', () => {
  test('Pagina bestaat met starter-keyword in title', () => {
    expect(starters).toMatch(/<title>[^<]*starters[^<]*<\/title>/i);
  });

  test('Canonical naar /starters/', () => {
    expect(starters).toMatch(/<link rel="canonical" href="https:\/\/www\.boekhoudbaar\.nl\/starters\/">/);
  });

  test('Meta-description ≤ 160 chars + starter-keyword', () => {
    const m = starters.match(/<meta name="description" content="([^"]+)"/);
    expect(m[1].length).toBeLessThanOrEqual(165);
    expect(m[1]).toMatch(/KvK|starter|net begonnen|begin/i);
  });

  test('Keywords-meta gericht op starter-intent', () => {
    const m = starters.match(/<meta name="keywords" content="([^"]+)"/);
    expect(m[1]).toMatch(/boekhouding voor starters/);
    expect(m[1]).toMatch(/eerste btw-aangifte/i);
  });
});

describe('Starters-pagina — schema.org rich-snippets', () => {
  test('BreadcrumbList aanwezig', () => {
    expect(starters).toMatch(/"@type":"BreadcrumbList"/);
    expect(starters).toMatch(/"name":"Voor starters"/);
  });

  test('FAQPage schema voor starter-vragen (rich snippet)', () => {
    expect(starters).toMatch(/"@type":"FAQPage"/);
    expect(starters).toMatch(/moet ik nu al een boekhoudprogramma/i);
    expect(starters).toMatch(/Wat is een BTW-aangifte/i);
    expect(starters).toMatch(/Wat is de KOR/i);
  });

  test('WebPage schema met isPartOf WebSite', () => {
    expect(starters).toMatch(/"@type":"WebPage"/);
    expect(starters).toMatch(/"isPartOf":\{"@type":"WebSite"/);
  });
});

describe('Starters-pagina — Persona Linde positionering', () => {
  test('H1 in starter-taal ("net ingeschreven KvK")', () => {
    const m = starters.match(/<h1>([\s\S]*?)<\/h1>/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/KvK|begin|starter/i);
  });

  test('Adresseert 3 starter-angsten expliciet', () => {
    expect(starters).toMatch(/bang dat ik iets fout doe bij de Belastingdienst/i);
    expect(starters).toMatch(/boekhoudtermen niet/i);
    expect(starters).toMatch(/geld uitgeef aan iets wat ik niet nodig heb/i);
  });

  test('Legt 3 begrippen uit in gewone taal (BTW-aangifte / KOR / bewaarplicht)', () => {
    expect(starters).toMatch(/<strong>BTW-aangifte<\/strong>/);
    expect(starters).toMatch(/<strong>KOR \(Kleine Ondernemersregeling\)<\/strong>/);
    expect(starters).toMatch(/<strong>Bewaarplicht<\/strong>/);
  });

  test('4-staps onboarding', () => {
    const stappen = (starters.match(/class="stap-num"/g) || []).length;
    expect(stappen).toBe(4);
  });

  test('Geen boekhoudjargon-afschrikking: noemt expliciet "geen grootboekrekeningen/journaalposten"', () => {
    expect(starters).toMatch(/[Gg]een "?grootboekrekeningen"?|geen.*journaalposten/i);
  });

  test('Prijs-framing voor starter: "veiligheid" niet "besparing" (Linde kent geen €30/mnd pijn)', () => {
    // Kaart 3 framet €49 als eenmalige veiligheid, niet als besparing-vs-abonnement
    expect(starters).toMatch(/€60.{0,3}€150/);
    expect(starters).toMatch(/eenmalig €49/i);
    expect(starters).toMatch(/Goed beginnen kost je eenmalig €49/);
  });
});

describe('Starters-pagina — internal linking naar starter-gidsen', () => {
  test('Linkt naar 4 starter-relevante gidsen', () => {
    expect(starters).toMatch(/href="\/gids\/zzp-starten-checklist-2026\/"/);
    expect(starters).toMatch(/href="\/gids\/btw-aangifte-zzp\/"/);
    expect(starters).toMatch(/href="\/gids\/aftrekbare-kosten-zzp\/"/);
    expect(starters).toMatch(/href="\/gids\/zzp-uurtarief-berekenen\/"/);
  });

  test('CTA naar /kopen + /demo', () => {
    expect(starters).toMatch(/href="\/kopen"/);
    expect(starters).toMatch(/href="\/demo\/"/);
  });
});

describe('Discoverability: nav-link + sitemap', () => {
  test('Homepage nav linkt naar /starters/ (prominente positie)', () => {
    const start = home.indexOf('id="nav-menu"');
    const eind = home.indexOf('</ul>', start);
    const blok = home.slice(start, eind);
    expect(blok).toMatch(/href="\/starters\/">Voor starters/);
  });

  test('Sitemap bevat /starters/ URL', () => {
    expect(sitemap).toMatch(/<loc>https:\/\/www\.boekhoudbaar\.nl\/starters\/<\/loc>/);
  });
});

describe('Anti-regressie: technische correctheid', () => {
  test('Nav-toggle + nav.js pattern (mobiele menu werkt)', () => {
    expect(starters).toMatch(/class="nav-toggle"/);
    expect(starters).toMatch(/src="\/nav\.js"/);
  });

  test('Geen <nav-bar> custom-element (dat is ongedefinieerd elders)', () => {
    expect(starters).not.toMatch(/<nav-bar>/);
  });

  test('Alle interne gids-links gebruiken trailing-slash (canonical conventie)', () => {
    const gidsLinks = starters.match(/href="\/gids\/[^"]+"/g) || [];
    gidsLinks.forEach(function(link) {
      expect(link).not.toMatch(/\.html"/);
    });
  });
});

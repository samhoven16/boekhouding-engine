/**
 * tests/unit/go-live-customer-voice-blockers.test.js
 *
 * 3 GO-LIVE blockers gefixt na go-live audit (PR #251 specialist + run
 * via spawned agent op 2026-06-09). Deze tests pinnen de fixes vast
 * zodat een toekomstige marketing-tweak ze niet stilletjes terugdraait.
 *
 *   1. Geld-terug claim op landing.html + demo/ ↔ voorwaarden art.6
 *   2. BYOK-disclosure op pricing-kaart in index.html
 *   3. Factuur-mail aanhef-consistentie (plain ↔ HTML)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const landing  = fs.readFileSync(path.join(ROOT, 'website/landing.html'), 'utf8');
const demo     = fs.readFileSync(path.join(ROOT, 'website/demo/index.html'), 'utf8');
const home     = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');
const voorw    = fs.readFileSync(path.join(ROOT, 'website/voorwaarden/index.html'), 'utf8');
const verkoop  = fs.readFileSync(path.join(ROOT, 'src/Verkoopfacturen.gs'), 'utf8');

describe('Blocker #1 — geld-terug claim ↔ voorwaarden art.6', () => {
  test('landing.html bevat NIET de onvoorwaardelijke "geen vragen"-claim', () => {
    expect(landing).not.toMatch(/30 dagen geld terug.*Geen vragen/i);
    expect(landing).not.toMatch(/Geen vragen.*geld.terug/i);
  });

  test('landing.html bevat de juiste activatie-garantie (7 dagen)', () => {
    expect(landing).toMatch(/activeren niet binnen 7 dagen/);
    expect(landing).toMatch(/href="\/voorwaarden#art6"/);
  });

  test('demo/index.html bevat NIET de "30 dagen geld-terug geen vragen"-claim', () => {
    expect(demo).not.toMatch(/30 dagen geld-terug, geen vragen/);
  });

  test('demo/index.html bevat juiste activatie-garantie + NL "terugbetaling"', () => {
    expect(demo).toMatch(/Activatie-garantie 7 dagen/);
    expect(demo).toMatch(/terugbetaling/);
    expect(demo).not.toMatch(/\brefund\b/);  // geen Engels jargon
  });

  test('Voorwaarden art.6 bevat geen onvoorwaardelijke tevredenheidsgarantie', () => {
    expect(voorw).toMatch(/Geen onbeperkte tevredenheidsgarantie/);
    expect(voorw).toMatch(/Activatie-garantie/);
  });
});

describe('Blocker #2 — BYOK-disclosure op pricing-kaart', () => {
  test('Pricing-kaart noemt expliciet "eigen" Google AI-key', () => {
    // Pak de pricing-section uit index.html
    const start = home.indexOf('AI bonnen-scan');
    expect(start).toBeGreaterThan(-1);
    const blok = home.slice(start, start + 400);
    expect(blok).toMatch(/eigen/);
    expect(blok).toMatch(/gratis/);
  });

  test('Pricing-kaart maakt expliciet dat Boekhoudbaar niet betaalt', () => {
    const start = home.indexOf('AI bonnen-scan');
    const blok = home.slice(start, start + 400);
    expect(blok).toMatch(/Boekhoudbaar betaalt nooit/);
  });

  test('Pricing-kaart noemt setup-tijd zodat klant verwachting heeft', () => {
    const start = home.indexOf('AI bonnen-scan');
    const blok = home.slice(start, start + 400);
    expect(blok).toMatch(/5 min/);
  });
});

describe('Blocker #3 — factuur-mail aanhef-consistentie', () => {
  test('Plain-text body gebruikt "Beste" (niet meer "Hoi")', () => {
    const start = verkoop.indexOf('const tekst =');
    expect(start).toBeGreaterThan(-1);
    const blok = verkoop.slice(start, start + 500);
    expect(blok).toMatch(/Beste \$\{klantnaam\}/);
    expect(blok).not.toMatch(/Hoi \$\{klantnaam\}/);
  });

  test('Plain-text body gebruikt "Met vriendelijke groet" als afsluiting', () => {
    const start = verkoop.indexOf('const tekst =');
    const blok = verkoop.slice(start, start + 600);
    expect(blok).toMatch(/Met vriendelijke groet/);
    expect(blok).not.toMatch(/Bedankt!\\n/);
  });

  test('Plain-text body gebruikt "u ontvangt" (u-vorm consistent met HTML)', () => {
    const start = verkoop.indexOf('const tekst =');
    const blok = verkoop.slice(start, start + 600);
    expect(blok).toMatch(/Bijgaand ontvangt u/);
  });

  test('HTML-body gebruikt ook "Beste" + u-vorm (regressie-bescherming)', () => {
    expect(verkoop).toMatch(/>Beste ' \+ escHtml_\(klantnaam\)/);
    expect(verkoop).toMatch(/Bijgaand ontvangt u factuur/);
  });

  test('Vóór-/Voor-consistentie tussen plain en HTML body', () => {
    // HTML zegt "Vóór" (met accent), plain moet ook "Vóór" zeggen
    const start = verkoop.indexOf('const tekst =');
    const blok = verkoop.slice(start, start + 600);
    expect(blok).toMatch(/Vóór:/);
  });
});

describe('Forward-protection: voice-principes', () => {
  test('Geen "wij"-personificatie van Boekhoudbaar in website-bestanden', () => {
    // Tolerantie: "Wij" mag in voorwaarden (juridisch) maar niet in marketing pages
    const homeBlok = home.slice(0, 5000);  // hero + sub
    expect(homeBlok).not.toMatch(/\bWij denken\b/);
    expect(homeBlok).not.toMatch(/\bons team\b/i);
  });

  test('Geen NL-EN jargon-mix in demo lock-in lijst', () => {
    const start = demo.indexOf('lockin-lijst');
    if (start > -1) {
      const blok = demo.slice(start, start + 1500);
      expect(blok).not.toMatch(/\brefund\b/i);
      expect(blok).not.toMatch(/\bupdate\b/);  // moet "bijwerken" zijn
    }
  });
});

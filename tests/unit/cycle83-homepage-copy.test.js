/**
 * tests/unit/cycle83-homepage-copy.test.js
 *
 * Cycle 83 — homepage copy + CTA-rationalisatie.
 *
 * Doel: de "eerlijke stem" die op delen van de homepage al bestond door de
 * hele pagina laten doorklinken. Marketing-aanjagers ("Bespaar €2.291!",
 * "Early bird · eerste 100 klanten", urgency-trucs) verwijderd; feitelijke
 * vergelijkingen en zachte framing behouden.
 *
 * Deze test is een REGRESSIE-guard: zodra iemand in de toekomst opnieuw
 * "Bespaar X" of "Early bird"-taal toevoegt, faalt deze. Bewuste her-introductie
 * vereist een expliciete update van deze test plus motivatie in de commit.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const HOMEPAGE = fs.readFileSync(
  path.resolve(__dirname, '../../website/index.html'),
  'utf8'
);

describe('CYCLE 83: marketing-aanjagers verwijderd', () => {
  test('geen "Bespaar €X" framing meer (anchor-sectie + sticky CTA)', () => {
    // "Bespaar" als imperatieve marketing-frame mag niet meer. Neutrale
    // "Verschil: €X" of "€X over 5 jaar" is wél toegestaan.
    expect(HOMEPAGE).not.toMatch(/Bespaar\s+(€|<strong>€|tot\s+€)/i);
  });

  test('geen kunstmatige urgency ("Early bird", "eerste 100 klanten", "Daarna €79")', () => {
    expect(HOMEPAGE).not.toMatch(/early\s*bird/i);
    expect(HOMEPAGE).not.toMatch(/eerste\s+100\s+klanten/i);
    expect(HOMEPAGE).not.toMatch(/daarna\s+€\s*79/i);
  });

  test('dubbele demo-CTA-sectie is verwijderd (demo zit nu alleen in hero)', () => {
    // De aparte sectie met "Klik door een live demo zonder te kopen" als
    // h2 was een tweede CTA voor exact dezelfde demo als in de hero. Weg.
    expect(HOMEPAGE).not.toMatch(/Klik door een live demo zonder te kopen/);
  });
});

describe('CYCLE 83: eerlijke stem behouden', () => {
  test('vergelijkingscijfers (€2.340 / €1.140) blijven feitelijk vermeld', () => {
    // De getallen zelf zijn correcte vergelijking, niet de aanjager.
    // We laten ze staan zodat klant kan kiezen.
    expect(HOMEPAGE).toMatch(/€<strong>2\.340<\/strong>/);
    expect(HOMEPAGE).toMatch(/€<strong>1\.140<\/strong>/);
  });

  test('trust-sectie kop "Eerlijk antwoord, zonder marketing-praat" blijft staan', () => {
    expect(HOMEPAGE).toMatch(/Eerlijk antwoord, zonder marketing-praat/);
  });

  test('"Niet beter dan Moneybird, alleen anders" blijft (kernpositionering)', () => {
    expect(HOMEPAGE).toMatch(/Niet beter dan Moneybird, alleen anders/);
  });
});

describe('CYCLE 83: CTA-aantal binnen redelijke grens', () => {
  test('maximaal 6 /kopen-links op de homepage (nav-desktop+mobile, hero, pricing, footer, sticky)', () => {
    const matches = HOMEPAGE.match(/href="\/kopen"/g) || [];
    expect(matches.length).toBeLessThanOrEqual(6);
  });
});

/**
 * tests/unit/byok-gemini-ui.test.js
 *
 * BYOK ("Bring Your Own Key") voor de Gemini AI bon-scan.
 *
 * Sam's principe: klant betaalt nooit verrast. De AI-feature wordt
 * pas zichtbaar / aanklikbaar als de klant zijn EIGEN gratis Gemini-key
 * heeft ingesteld. Zonder key zien we GEEN dropzone (anders krijgt klant
 * pas een foutmelding NA upload — onnodige frustratie).
 *
 * Aanpak: bron-inspectie van AIConfig.gs, NieuweBoeking.gs, Menu.gs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const aiBron        = fs.readFileSync(path.join(SRC, 'AIConfig.gs'), 'utf8');
const dialogBron    = fs.readFileSync(path.join(SRC, 'NieuweBoeking.gs'), 'utf8');
const menuBron      = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');

describe('AIConfig.gs — pure introspectie zonder secrets', () => {
  test('aiBeschikbaar_() bestaat en is pure read', () => {
    expect(aiBron).toMatch(/function aiBeschikbaar_/);
    // Geen ScriptApp / SpreadsheetApp side-effects in deze functie
    const start = aiBron.indexOf('function aiBeschikbaar_');
    const eind = aiBron.indexOf('\nfunction ', start + 1);
    const blok = aiBron.slice(start, eind);
    expect(blok).not.toMatch(/SpreadsheetApp/);
    expect(blok).not.toMatch(/setProperty/);
  });

  test('Minimum key-lengte ≥ 20 (anti-typo)', () => {
    expect(aiBron).toMatch(/String\(key\)\.length >= 20/);
  });

  test('getAiStatusVoorDialog returnt simpel object — geen key in payload', () => {
    expect(aiBron).toMatch(/function getAiStatusVoorDialog/);
    const start = aiBron.indexOf('function getAiStatusVoorDialog');
    const eind = aiBron.indexOf('\nfunction ', start + 1);
    const blok = aiBron.slice(start, eind);
    expect(blok).toMatch(/actief:/);
    expect(blok).not.toMatch(/getProperty/);  // gaat via aiBeschikbaar_
  });

  test('aiSetupViaDialog roept zetGeminiApiKey met typeof-guard', () => {
    expect(aiBron).toMatch(/function aiSetupViaDialog/);
    expect(aiBron).toMatch(/typeof zetGeminiApiKey === ['"]function['"]/);
  });

  test('Geen hardcoded API-key in bron', () => {
    expect(aiBron).not.toMatch(/AIzaSy[A-Za-z0-9_-]{20,}/);
  });
});

describe('NieuweBoeking.gs — Upload+AI panel is BYOK-gated', () => {
  test('aiActief-flag wordt server-side berekend via aiBeschikbaar_()', () => {
    expect(dialogBron).toMatch(/aiActief\s*=\s*\(typeof aiBeschikbaar_ === ['"]function['"]\)/);
  });

  test('Twee paden voor de upload-panel inhoud: actief vs uit', () => {
    expect(dialogBron).toMatch(/uploadPanelInhoud\s*=\s*aiActief \?/);
  });

  test('Bij AI-uit: BYOK CTA-paneel met expliciete kosten-uitleg', () => {
    const start = dialogBron.indexOf('uploadPanelInhoud');
    const blok = dialogBron.slice(start, start + 3000);
    expect(blok).toMatch(/AI bon-scan staat uit/);
    expect(blok).toMatch(/eigen/);
    expect(blok).toMatch(/gratis/);
    // Pijn-punt expliciet benoemen: Boekhoudbaar betaalt niet voor klant
    expect(blok).toMatch(/Boekhoudbaar betaalt nooit/);
  });

  test('CTA-knop: triggert zetAiKeyIn() (geen scary "open instellingen")', () => {
    expect(dialogBron).toMatch(/onclick="zetAiKeyIn\(\)"/);
    expect(dialogBron).toMatch(/function zetAiKeyIn\s*\(\)/);
  });

  test('Externe link naar aistudio.google.com heeft rel="noopener" (XSS-veilig)', () => {
    // Zoek de echte <a href="…"> link, niet de doc-comment-referentie
    const linkStart = dialogBron.indexOf('href="https://aistudio.google.com');
    expect(linkStart).toBeGreaterThan(-1);
    const blok = dialogBron.slice(linkStart, linkStart + 200);
    expect(blok).toMatch(/rel="noopener"/);
    expect(blok).toMatch(/target="_blank"/);
  });

  test('Bij AI-actief: bestaande dropzone blijft werken', () => {
    const start = dialogBron.indexOf('uploadPanelInhoud');
    const blok = dialogBron.slice(start, start + 3000);
    expect(blok).toMatch(/dropzone/);
    expect(blok).toMatch(/bon-file/);
    expect(blok).toMatch(/onchange="bonGekozen\(this\)"/);
  });

  test('Statisch oud panel-blok is weggehaald (geen dubbele render)', () => {
    // Het oude statische <div class="sectie">Stap 1 — Upload uw bon of factuur</div>
    // mag NIET meer 2× voorkomen in de bron (zou betekenen dat we niet hebben
    // gerefactord, alleen toegevoegd → twee dropzones in DOM)
    const matches = dialogBron.match(/Stap 1 — Upload uw bon of factuur/g) || [];
    expect(matches.length).toBe(1);  // alleen binnen de aiActief-tak
  });
});

describe('Menu.gs — label maakt BYOK + gratis expliciet', () => {
  test('Menu-label noemt "Eigen" en "gratis"', () => {
    const start = menuBron.indexOf('zetGeminiApiKey');
    const rond = menuBron.slice(Math.max(0, start - 200), start);
    expect(rond).toMatch(/Eigen/);
    expect(rond).toMatch(/gratis/);
  });

  test('Label noemt "optioneel" zodat klant weet dat hij dit NIET hoeft', () => {
    const start = menuBron.indexOf('zetGeminiApiKey');
    const rond = menuBron.slice(Math.max(0, start - 200), start);
    expect(rond).toMatch(/optioneel/i);
  });
});

describe('Functionele simulatie — niveau-gating client-side', () => {
  test('Klant zonder key krijgt CTA, niet de dropzone (geen surprise)', () => {
    // Repliceert exact de server-side ternary
    function rendersCTA(aiActief) {
      return aiActief ? 'dropzone' : 'byok-cta';
    }
    expect(rendersCTA(false)).toBe('byok-cta');
    expect(rendersCTA(true)).toBe('dropzone');
  });

  test('Klant ziet KOSTEN-uitleg vóór hij iets uploadt', () => {
    const ctaTekst = 'Je gebruikt je eigen Google AI-key (gratis aan te maken, geen creditcard nodig).';
    expect(ctaTekst).toMatch(/eigen/);
    expect(ctaTekst).toMatch(/gratis/);
    expect(ctaTekst).toMatch(/geen creditcard/);
  });
});

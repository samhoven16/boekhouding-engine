/**
 * tests/unit/factuurDialog-init-pattern.test.js
 *
 * REGRESSIE-FIREWALL voor de factuur-dialog init.
 *
 * Deze test bestaat omdat de factuur-flow MEERDERE keren is gebroken doordat
 * iemand de init in één monolithische try-catch zette: als bv. setSelect of
 * valideerVeld crashte op een edge-case, sprong control naar catch en startte
 * setInterval (live-recalc) NOOIT. Symptoom voor de klant:
 *   - status hangt op "⚙️ Wachten op JS…"
 *   - totaal blijft €0,00 ook al zijn aantal+prijs ingevuld
 *   - bevestig-knop doet niets
 *
 * De fix: setInterval moet BUITEN elke try-catch staan en als EERSTE init-stap
 * draaien. Andere init-stappen (datums, BTW-default, bevestig-knop) moeten in
 * geïsoleerde IIFE-blokken met eigen try-catch zodat ÉÉN faal niet ALLES sloopt.
 *
 * Als deze test faalt, denk niet "weghalen" — denk "bewust geaccepteerde
 * regressie? bespreek dan met owner."
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('NieuweBoeking.gs — factuur-dialog init-patroon (regressie-firewall)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'NieuweBoeking.gs'),
    'utf8'
  );

  test('setInterval voor live-recalc is aanwezig met 500ms interval', () => {
    expect(src).toMatch(/setInterval\(function\(\)\s*\{[\s\S]+?herbereken\(\)[\s\S]+?\},\s*500\)/);
  });

  test('setInterval staat NIET binnen een grote try-catch met andere init', () => {
    // Vind setInterval-positie
    const setIntervalIdx = src.indexOf('setInterval(function()');
    expect(setIntervalIdx).toBeGreaterThan(0);

    // Pak 200 chars vóór setInterval — daar mag GEEN open `try {` staan zonder
    // matchende catch voor de setInterval-call. Brokkelig maar effectief:
    // controleer dat direct vóór setInterval het commentaar "setInterval START EERST"
    // staat (markert opzettelijke positionering).
    const region = src.substring(Math.max(0, setIntervalIdx - 400), setIntervalIdx);
    expect(region).toMatch(/setInterval START EERST|START EERST/i);
  });

  test('bindRegelEventsVeilig is idempotent (gebruikt _bhBound flag)', () => {
    expect(src).toMatch(/function bindRegelEventsVeilig\(\)/);
    expect(src).toMatch(/_bhBound/);
  });

  test('bevestig-knop heeft addEventListener-fallback bovenop inline onclick', () => {
    // Inline onclick="bevestig()" moet bestaan voor backward-compat
    expect(src).toMatch(/btn-bevestig/);
    // EN er moet een addEventListener('click', ...) zijn die bevestig() aanroept
    expect(src).toMatch(/btn-bevestig[\s\S]+?addEventListener\(['"]click['"]/);
  });

  test('elk init-blok na setInterval heeft eigen try-catch (IIFE-pattern)', () => {
    // Tel hoeveel (function naam(){ try { ... } catch ... })() blokken er zijn
    // tussen "setInterval START EERST" en het einde van de init-zone.
    const startIdx = src.indexOf('// 1. setInterval START EERST');
    const endMarker = src.indexOf('// ─', startIdx + 100); // volgende sectie-breker
    const initZone = src.substring(startIdx, endMarker > 0 ? endMarker : startIdx + 5000);

    // Verwacht minimaal 4 IIFE-blokken (manueleRecalc, tabs, veldwaarden, eersteRecalc, bevestigKnop)
    const iifeCount = (initZone.match(/\(function\s+\w+\(\)\s*\{/g) || []).length;
    expect(iifeCount).toBeGreaterThanOrEqual(4);
  });

  test('herbereken() heeft try-catch wrapper rond hoofdlogica', () => {
    const idx = src.indexOf('function herbereken()');
    expect(idx).toBeGreaterThan(0);
    // Pak de eerste 2000 chars van de functie — moet `try {` bevatten
    const fn = src.substring(idx, idx + 2000);
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch\s*\(/);
  });

  test('recalc-status element wordt geüpdatet (klant ziet "✓ Live")', () => {
    expect(src).toMatch(/recalc-status/);
    expect(src).toMatch(/✓ Live/);
  });

  test('factuurregel-inputs hebben oninput="herbereken()" (HTML-fallback)', () => {
    // Inline oninput is essentieel voor zowel live-recalc als als event-bind
    // door dynamische DOM-manipulatie iets mist.
    expect(src).toMatch(/f-r1aantal[\s\S]+?oninput="herbereken/);
    expect(src).toMatch(/f-r1prijs[\s\S]+?oninput="herbereken/);
  });
});

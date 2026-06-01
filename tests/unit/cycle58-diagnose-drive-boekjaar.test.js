/**
 * tests/unit/cycle58-diagnose-drive-boekjaar.test.js
 *
 * Cycle 58 — diagnoseInstallatie zocht DRIVE_HOOFDMAP-key op
 * `new Date().getFullYear()` ipv `getBoekjaar_()`. Voor klanten met
 * afwijkend boekjaar (cycle 50 issue) geeft dat false-positive:
 *   ✗ Drive-hoofdmap — geen DRIVE_HOOFDMAP_2027 — run setup opnieuw
 *
 * Terwijl de map gewoon bestaat onder DRIVE_HOOFDMAP_2026. Klant
 * verleid tot resetSetup() — wist triggers + props onnodig.
 *
 * Fix: lookup-keys in volgorde [boekjaar, calendar, calendar-1], met
 * unieke filter. Eerste hit wint. Detail toont (jaar X) als gevonden
 * jaar ≠ boekjaar.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/GezondheidCheck.gs'), 'utf8');
const body = src.slice(src.indexOf("check('Drive-hoofdmap'"), src.indexOf('const fouten = regels.filter'));

describe('CYCLE 58: Drive-hoofdmap lookup gebruikt boekjaar + fallback', () => {
  test('Gebruikt getBoekjaar_() voor primary key', () => {
    expect(body).toMatch(/getBoekjaar_\(\)/);
  });

  test('Probeert ook calendar year als fallback', () => {
    expect(body).toMatch(/new Date\(\)\.getFullYear\(\)/);
  });

  test('Probeert ook vorig jaar (calendar-1) als fallback', () => {
    expect(body).toMatch(/new Date\(\)\.getFullYear\(\)\s*-\s*1/);
  });

  test('Unieke filter zodat zelfde jaar niet twee keer wordt geprobeerd', () => {
    expect(body).toMatch(/new Set\(/);
  });

  test('Toont gevonden-jaar in detail als ≠ boekjaar', () => {
    expect(body).toMatch(/gevondenJaar !==\s*boekjaar/);
  });

  test('Error-melding gebruikt boekjaar (niet calendar) — klant ziet config-jaar', () => {
    expect(body).toMatch(/geen DRIVE_HOOFDMAP_'\s*\+\s*boekjaar/);
  });
});

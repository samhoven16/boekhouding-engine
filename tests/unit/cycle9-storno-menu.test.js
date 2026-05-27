/**
 * tests/unit/cycle9-storno-menu.test.js
 *
 * Cycle 9 — storno-API uit cycle 7 nu via menu bereikbaar.
 * Source-checks dat menu-item + dialog-functie bestaan en correct wire-en.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

describe('CYCLE 9: storno menu-entrypoint', () => {
  test('Menu.gs heeft menu-item voor storno onder Geavanceerd-submenu', () => {
    const menu = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');
    expect(menu).toMatch(/addItem\(['"][^'"]*[Ss]torneren[^'"]*['"],\s*['"]openStornoDialog['"]\)/);
  });

  test('Boekingen.gs heeft openStornoDialog-functie', () => {
    const boekingen = fs.readFileSync(path.join(SRC, 'Boekingen.gs'), 'utf8');
    expect(boekingen).toMatch(/function openStornoDialog\s*\(\)/);
  });

  test('openStornoDialog vraagt boekingId + reden via ui.prompt', () => {
    const boekingen = fs.readFileSync(path.join(SRC, 'Boekingen.gs'), 'utf8');
    const fnStart = boekingen.indexOf('function openStornoDialog');
    const fn = boekingen.slice(fnStart);
    // Twee prompts: boekingId + reden
    const prompts = (fn.match(/ui\.prompt\(/g) || []).length;
    expect(prompts).toBeGreaterThanOrEqual(2);
  });

  test('openStornoDialog roept maakStornoJournaalpost_ aan met (ss, id, reden)', () => {
    const boekingen = fs.readFileSync(path.join(SRC, 'Boekingen.gs'), 'utf8');
    const fnStart = boekingen.indexOf('function openStornoDialog');
    const fn = boekingen.slice(fnStart);
    expect(fn).toMatch(/maakStornoJournaalpost_\(ss,\s*boekingId,\s*reden\)/);
  });

  test('openStornoDialog vangt errors op en toont klant-vriendelijke alert', () => {
    const boekingen = fs.readFileSync(path.join(SRC, 'Boekingen.gs'), 'utf8');
    const fnStart = boekingen.indexOf('function openStornoDialog');
    const fn = boekingen.slice(fnStart);
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/Storno mislukt|ui\.alert.*err/);
  });

  test('Vermeldt expliciet "art. 52 AWR" in succes-melding (compliance-context)', () => {
    const boekingen = fs.readFileSync(path.join(SRC, 'Boekingen.gs'), 'utf8');
    const fnStart = boekingen.indexOf('function openStornoDialog');
    const fn = boekingen.slice(fnStart);
    expect(fn).toMatch(/art\.\s*52\s*AWR/i);
  });
});

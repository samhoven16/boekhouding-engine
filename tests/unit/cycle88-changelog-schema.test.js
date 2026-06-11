/**
 * tests/unit/cycle88-changelog-schema.test.js
 *
 * Cycle 88 — dynamiek + schema-consistentie.
 *
 * Deliverables:
 *   1. scripts/update-changelog.js → website/changelog.json (JSON-array
 *      van laatste "Cycle N: ..." commits, bron voor de homepage-sectie)
 *   2. .husky/pre-commit roept update-changelog.js aan
 *   3. Homepage heeft een "Recente updates" sectie die de JSON rendert
 *   4. Subpages met WebPage-schema (vergelijking, functies) refereren naar
 *      homepage's SoftwareApplication via @id voor cross-page consistentie
 *
 * Geen testimonials of fake counters in deze cycle — alleen toegevoegd als
 * er echte, verifieerbare data is.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

describe('CYCLE 88: changelog.json + update-script', () => {
  test('scripts/update-changelog.js draait zonder error', () => {
    execSync('node scripts/update-changelog.js', { cwd: ROOT, stdio: 'pipe' });
    const raw = fs.readFileSync(path.join(ROOT, 'website/changelog.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(Array.isArray(json.entries)).toBe(true);
  });

  test('elke entry heeft date (yyyy-MM-dd), cycle (nummer), titel (string)', () => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'website/changelog.json'), 'utf8'));
    // In CI is git checkout shallow (depth=1) waardoor de history maar één
    // commit diep is. Entries kan dan leeg zijn — dat is correct gedrag van
    // het script, niet een bug. Per-entry checks alleen draaien als er
    // entries zijn.
    json.entries.forEach((e) => {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof e.cycle).toBe('number');
      expect(typeof e.titel).toBe('string');
      expect(e.titel.length).toBeGreaterThan(0);
    });
  });

  test('maximaal 8 entries (kort houden)', () => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'website/changelog.json'), 'utf8'));
    expect(json.entries.length).toBeLessThanOrEqual(8);
  });

  test('GitHub workflow auto-update-version.yml roept update-changelog.js aan', () => {
    // Verplaatst van pre-commit hook naar main-push workflow om
    // version.json/changelog.json merge-conflicten te voorkomen.
    const wf = fs.readFileSync(
      path.join(ROOT, '.github/workflows/auto-update-version.yml'), 'utf8');
    expect(wf).toMatch(/node scripts\/update-changelog\.js/);
    expect(wf).toMatch(/git add website\/version\.json website\/changelog\.json/);
  });
});

describe('CYCLE 88: homepage "Recente updates"-sectie', () => {
  const HOMEPAGE = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');

  test('section met id="recente-updates" + h2 bestaat', () => {
    expect(HOMEPAGE).toMatch(/<section id="recente-updates"/);
    expect(HOMEPAGE).toMatch(/<h2 id="updates-heading">Recente updates<\/h2>/);
  });

  test('ul met data-updates-lijst placeholder bestaat', () => {
    expect(HOMEPAGE).toMatch(/<ul class="updates-lijst" data-updates-lijst>/);
  });

  test('fetch-script roept /changelog.json aan', () => {
    expect(HOMEPAGE).toMatch(/fetch\('\/changelog\.json'/);
  });

  test('CSS-classes voor .updates-lijst en .update-cycle zitten in <style>', () => {
    expect(HOMEPAGE).toMatch(/\.updates-lijst\s*\{/);
    expect(HOMEPAGE).toMatch(/\.update-cycle\s*\{/);
  });
});

describe('CYCLE 88: schema-cross-page-consistentie', () => {
  test('vergelijking-page WebPage verwijst via @id naar homepage SoftwareApplication', () => {
    const html = fs.readFileSync(path.join(ROOT, 'website/vergelijking/index.html'), 'utf8');
    expect(html).toMatch(/"about":\s*\{\s*"@id":\s*"https:\/\/www\.boekhoudbaar\.nl\/#app"\s*\}/);
  });

  test('functies-page WebPage verwijst via @id naar homepage SoftwareApplication', () => {
    const html = fs.readFileSync(path.join(ROOT, 'website/functies/index.html'), 'utf8');
    expect(html).toMatch(/"about":\s*\{\s*"@id":\s*"https:\/\/www\.boekhoudbaar\.nl\/#app"\s*\}/);
  });

  test('homepage SoftwareApplication @id matched de verwijzingen', () => {
    const html = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');
    expect(html).toMatch(/"@type":\s*"SoftwareApplication"[\s\S]{1,200}"@id":\s*"https:\/\/www\.boekhoudbaar\.nl\/#app"/);
  });
});

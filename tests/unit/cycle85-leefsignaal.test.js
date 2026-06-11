/**
 * tests/unit/cycle85-leefsignaal.test.js
 *
 * Cycle 85 — "het product leeft"-signalen in de footer.
 *
 * Vier deliverables:
 *  - website/version.json bestaat en is valide JSON met lastUpdate + commit
 *  - scripts/update-version.js draait en schrijft zonder errors
 *  - .husky/pre-commit roept update-version.js aan en stage't het resultaat
 *  - homepage-footer bevat een leefsignaal-strook met status-link + timestamp
 *  - /status/ pagina bestaat (was al uitgebreid aanwezig)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

describe('CYCLE 85: version.json + update-script', () => {
  test('website/version.json bestaat en heeft lastUpdate + commit', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'website/version.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof json.commit).toBe('string');
    expect(json.commit.length).toBeGreaterThan(0);
  });

  test('scripts/update-version.js draait zonder error en schrijft geldige JSON', () => {
    execSync('node scripts/update-version.js', { cwd: ROOT, stdio: 'pipe' });
    const raw = fs.readFileSync(path.join(ROOT, 'website/version.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('GitHub workflow auto-update-version.yml roept update-version.js aan', () => {
    // Voorheen liep dit in de pre-commit hook bij ELKE commit; veroorzaakte
    // perpetueel merge-conflict tussen main en PR-branches op version.json.
    // Nu alleen op push naar main via workflow + bot-commit met [skip ci].
    const wf = fs.readFileSync(
      path.join(ROOT, '.github/workflows/auto-update-version.yml'), 'utf8');
    expect(wf).toMatch(/node scripts\/update-version\.js/);
    expect(wf).toMatch(/git add website\/version\.json/);
    expect(wf).toMatch(/\[skip ci\]/);
  });
});

describe('CYCLE 85: footer leefsignaal in homepage', () => {
  const HOMEPAGE = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');

  test('footer bevat status-link naar /status/', () => {
    // De link kan met of zonder trailing slash; minimaal "Systeemstatus" + /status
    expect(HOMEPAGE).toMatch(/href="\/status\/?"[^>]*>Systeemstatus[^<]*operationeel/);
  });

  test('footer bevat data-laatste-update placeholder', () => {
    expect(HOMEPAGE).toMatch(/<span data-laatste-update>—<\/span>/);
  });

  test('footer-script fetcht /version.json', () => {
    expect(HOMEPAGE).toMatch(/fetch\('\/version\.json'/);
  });
});

describe('CYCLE 85: /status/ pagina bestaat', () => {
  test('website/status/index.html is aanwezig', () => {
    const p = path.join(ROOT, 'website/status/index.html');
    expect(fs.existsSync(p)).toBe(true);
    const html = fs.readFileSync(p, 'utf8');
    expect(html).toMatch(/<title>[^<]*[Ss]tatus[^<]*<\/title>/);
  });
});

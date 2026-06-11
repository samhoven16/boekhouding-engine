/**
 * tests/unit/release-instructions.test.js
 *
 * Mitigatie voor sociaal-technisch risico uit STATUS_BUITENAARDS:
 * Sam moet VERSIE_KRITIEK_VOOR bijwerken bij elke kritieke release.
 * Vergeten = klant ziet geen modal = onbewust verkeerde aangifte.
 *
 * Tests dekken zowel de pure logic (genereerInstructies) als de CLI-modus
 * via argv (interactive readline wordt apart manueel getest).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/release-instructions.js');
const { genereerInstructies, leesHuidigeVersie } = require(SCRIPT);

function runCli(args) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8', cwd: ROOT, timeout: 5000,
  });
}

describe('release-instructions — bestaat + executable', () => {
  test('script bestaat', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  test('package.json heeft npm-script "release:check"', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['release:check']).toBe('node scripts/release-instructions.js');
  });

  test('leesHuidigeVersie returnt versie uit Onboarding.gs', () => {
    const v = leesHuidigeVersie();
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('genereerInstructies — normale release', () => {
  test('print PRODUCT_VERSIE + VERSIE_ERNST=normaal + lege VERSIE_KRITIEK_VOOR', () => {
    const out = genereerInstructies({ huidigeVersie: '2.8.0', ernst: 'normaal' });
    expect(out).toMatch(/setProperty\('PRODUCT_VERSIE', '2\.8\.0'\)/);
    expect(out).toMatch(/setProperty\('VERSIE_ERNST', 'normaal'\)/);
    expect(out).toMatch(/setProperty\('VERSIE_KRITIEK_VOOR', '\[\]'\)/);
  });
});

describe('genereerInstructies — kritieke release input-validatie', () => {
  test('lege kritiekVoor → throw met duidelijke melding', () => {
    expect(() => genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: [], toelichting: 'lange genoeg toelichting',
    })).toThrow(/minimaal|zinloos/i);
  });

  test('huidige versie in kritiekVoor → throw (zinloos)', () => {
    expect(() => genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.8.0', '2.7.0'], toelichting: 'lange genoeg toelichting',
    })).toThrow(/zinloos|verwijder/i);
  });

  test('toelichting < 10 chars → throw', () => {
    expect(() => genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.7.0'], toelichting: 'kort',
    })).toThrow(/te kort/i);
  });

  test('toelichting > 200 chars → throw', () => {
    expect(() => genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.7.0'], toelichting: 'x'.repeat(201),
    })).toThrow(/te lang/i);
  });

  test('ernst niet "normaal"/"kritiek" → throw', () => {
    expect(() => genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'extreem',
    })).toThrow(/normaal.*kritiek/i);
  });

  test('lege huidigeVersie → throw', () => {
    expect(() => genereerInstructies({ huidigeVersie: '', ernst: 'normaal' }))
      .toThrow(/verplicht/i);
  });
});

describe('genereerInstructies — kritieke release happy-path', () => {
  test('valide invoer print copy-paste blok met alle 5 properties', () => {
    const out = genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.7.0', '2.6.0'],
      toelichting: 'BTW r1d-classificatie gecorrigeerd na suppletie-bevinding',
    });
    expect(out).toMatch(/setProperty\('PRODUCT_VERSIE', '2\.8\.0'\)/);
    expect(out).toMatch(/setProperty\('VERSIE_ERNST', 'kritiek'\)/);
    expect(out).toMatch(/setProperty\('VERSIE_TOELICHTING'.*r1d/);
    expect(out).toMatch(/setProperty\('VERSIE_INSTRUCTIES_URL'.*boekhoudbaar\.nl/);
    expect(out).toMatch(/setProperty\('VERSIE_KRITIEK_VOOR'.*2\.7\.0.*2\.6\.0/);
  });

  test('default URL = boekhoudbaar.nl/update/', () => {
    const out = genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.7.0'], toelichting: 'BTW-correctie r1d-suppletie',
    });
    expect(out).toContain('https://boekhoudbaar.nl/update/');
  });

  test('custom URL wordt gerespecteerd', () => {
    const out = genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['2.7.0'],
      toelichting: 'BTW-correctie r1d-suppletie',
      instructiesUrl: 'https://github.com/samhoven16/boekhouding-engine/wiki/update',
    });
    expect(out).toContain('github.com/samhoven16');
  });

  test('whitespace in kritiekVoor entries wordt getrimd', () => {
    const out = genereerInstructies({
      huidigeVersie: '2.8.0', ernst: 'kritiek',
      kritiekVoor: ['  2.7.0  ', ' 2.6.0 '],
      toelichting: 'BTW-correctie r1d-suppletie',
    });
    // VERSIE_KRITIEK_VOOR wordt double-stringified (JSON binnen Apps Script
    // string), dus output bevat \"2.7.0\". Check op de getrimde waarden.
    expect(out).toContain('2.7.0');
    expect(out).toContain('2.6.0');
    expect(out).not.toContain('  2.7.0  ');
  });
});

describe('CLI argv-modus — voor scripting + CI', () => {
  test('argv: normaal → exit 0 + output', () => {
    const r = runCli(['normaal']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/setProperty\('VERSIE_ERNST', 'normaal'\)/);
  });

  test('argv: kritiek valide → exit 0', () => {
    // Gebruik oude versies (niet de huidige) om de "zinloos"-guard te vermijden
    const r = runCli(['kritiek', '2.6.0,2.5.0', 'BTW r1d-correctie suppletie 2026']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/setProperty\('VERSIE_ERNST', 'kritiek'\)/);
  });

  test('argv: kritiek zonder kritiekVoor → exit 1', () => {
    const r = runCli(['kritiek', '', 'BTW-correctie lange genoeg tekst']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/minimaal|zinloos/i);
  });

  test('argv: kritiek met huidige versie in kritiekVoor → exit 1', () => {
    const v = leesHuidigeVersie();
    const r = runCli(['kritiek', v + ',2.6.0', 'BTW-correctie suppletie 2026']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/zinloos|verwijder/i);
  });

  test('argv: onbekende eerste arg → exit 1', () => {
    const r = runCli(['onzin']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/normaal.*kritiek/i);
  });
});

describe('release-instructions — schrijft GEEN files (dwingt bewuste Sam-actie)', () => {
  test('CLI run schrijft niets naar disk', () => {
    const before = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' });
    runCli(['normaal']);
    runCli(['kritiek', '2.7.0', 'BTW-correctie suppletie test']);
    const after = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' });
    expect(after).toBe(before);
  });
});

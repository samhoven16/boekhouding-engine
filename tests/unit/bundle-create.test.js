/**
 * tests/unit/bundle-create.test.js
 *
 * Tier 2 #7 — bundle-create script. Smoke + structuur tests; runt het echte
 * script tegen de echte src/ tree zodat regressies meteen zichtbaar zijn.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '../..');
const SCRIPT = path.resolve(ROOT, 'scripts/bundle-create.js');

function runScript(args) {
  args = args || [];
  return execFileSync('node', [SCRIPT].concat(args), { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
function runScriptExpectFail(args) {
  try { execFileSync('node', [SCRIPT].concat(args), { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { return { code: e.status, stderr: String(e.stderr || ''), stdout: String(e.stdout || '') }; }
  throw new Error('expected failure, but command succeeded');
}

describe('bundle-create.js — input-validatie', () => {
  test('zonder versie-arg: exit-code != 0 + nette foutmelding', () => {
    const r = runScriptExpectFail([]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/Versie ontbreekt/);
  });

  test('versie zonder X.Y.Z formaat: exit + nette foutmelding', () => {
    const r = runScriptExpectFail(['nieuwste']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/X\.Y\.Z formaat/);
  });

  test('versie met letters: weiger', () => {
    const r = runScriptExpectFail(['2.8.0-rc1']);
    expect(r.code).not.toBe(0);
  });
});

describe('bundle-create.js — happy path met echte src/ tree', () => {
  let stdout;
  let bundle;
  beforeAll(() => {
    stdout = runScript(['2.8.0']);
    bundle = JSON.parse(stdout);
  });

  test('stdout is valid JSON', () => {
    expect(bundle).toBeTruthy();
  });

  test('bundle bevat files-array + generatedAt', () => {
    expect(Array.isArray(bundle.files)).toBe(true);
    expect(typeof bundle.generatedAt).toBe('string');
    expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('elke file heeft naam, source, type', () => {
    bundle.files.forEach((f) => {
      expect(typeof f.naam).toBe('string');
      expect(f.naam.length).toBeGreaterThan(0);
      expect(typeof f.source).toBe('string');
      expect(f.type).toBe('server_js');
    });
  });

  test('file-namen zijn ZONDER .gs-extensie (Apps Script-conventie)', () => {
    bundle.files.forEach((f) => {
      expect(f.naam).not.toMatch(/\.gs$/);
    });
  });

  test('files-volgorde is alfabetisch (deterministische hash)', () => {
    const namen = bundle.files.map((f) => f.naam);
    const gesorteerd = namen.slice().sort();
    expect(namen).toEqual(gesorteerd);
  });

  test('bundle dekt alle src/*.gs files', () => {
    const srcFiles = fs.readdirSync(path.join(ROOT, 'src'))
      .filter((n) => n.endsWith('.gs')).length;
    expect(bundle.files.length).toBe(srcFiles);
  });
});

describe('bundle-create.js — operator-instructies in stderr', () => {
  let stderr;
  beforeAll(() => {
    try {
      const { stderr: capturedStderr } = require('child_process').spawnSync(
        'node', [SCRIPT, '2.8.0'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      stderr = capturedStderr;
    } catch (e) { stderr = String(e.stderr || ''); }
  });

  test('stderr toont SHA-256 hash voor sanity-check', () => {
    expect(stderr).toMatch(/SHA-256.*[0-9a-f]{64}/);
  });

  test('stderr toont NEXT STEPS lijst voor Sam', () => {
    expect(stderr).toMatch(/NEXT STEPS/);
    expect(stderr).toMatch(/Script Properties/);
    expect(stderr).toMatch(/UPDATE_BUNDLE_2\.8\.0/);
  });

  test('bij grote bundle: stderr waarschuwt over 9KB-cap', () => {
    // Onze codebase is > 8KB dus de waarschuwing moet altijd verschijnen
    expect(stderr).toMatch(/9 KB|chunk/i);
  });
});

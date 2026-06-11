/**
 * tests/unit/bundle-create.test.js
 *
 * Tier 2 #7 — bundle-create script. V3-formaat: schrijft naar bundle-X.Y.Z.json
 * op disk (te groot voor ScriptProperty), Sam upload naar Drive.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '../..');
const SCRIPT = path.resolve(ROOT, 'scripts/bundle-create.js');

function runScript(args) {
  args = args || [];
  return execFileSync('node', [SCRIPT].concat(args), {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
}
function runScriptExpectFail(args) {
  try {
    execFileSync('node', [SCRIPT].concat(args), {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) { return { code: e.status, stderr: String(e.stderr || ''), stdout: String(e.stdout || '') }; }
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
  test('versie met pre-release tags: weiger', () => {
    const r = runScriptExpectFail(['2.8.0-rc1']);
    expect(r.code).not.toBe(0);
  });
});

describe('bundle-create.js — happy path schrijft bundle-bestand', () => {
  const versie = '99.0.0';  // hoog nummer zodat real bundle-*.json's niet conflicteren
  const bundlePad = path.join(ROOT, 'bundle-' + versie + '.json');
  let stdout;
  let bundle;

  afterAll(() => { try { fs.unlinkSync(bundlePad); } catch (_) {} });

  beforeAll(() => {
    try { fs.unlinkSync(bundlePad); } catch (_) {}
    stdout = runScript([versie]);
    bundle = JSON.parse(fs.readFileSync(bundlePad, 'utf8'));
  });

  test('stdout bevat het pad naar het geschreven bestand', () => {
    expect(stdout.trim()).toBe(bundlePad);
  });

  test('bundle-bestand bevat schema, versie, files, hash, generatedAt', () => {
    expect(bundle._schema).toMatch(/update-bundle\/v3-drive/);
    expect(bundle.versie).toBe(versie);
    expect(Array.isArray(bundle.files)).toBe(true);
    expect(typeof bundle.hash).toBe('string');
    expect(bundle.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof bundle.generatedAt).toBe('string');
  });

  test('elke file heeft naam, source, type=server_js', () => {
    bundle.files.forEach((f) => {
      expect(typeof f.naam).toBe('string');
      expect(f.naam.length).toBeGreaterThan(0);
      expect(typeof f.source).toBe('string');
      expect(f.type).toBe('server_js');
    });
  });

  test('file-namen zijn ZONDER .gs-extensie (Apps Script-conventie)', () => {
    bundle.files.forEach((f) => { expect(f.naam).not.toMatch(/\.gs$/); });
  });

  test('files-volgorde is alfabetisch (deterministische hash)', () => {
    const namen = bundle.files.map((f) => f.naam);
    expect(namen).toEqual(namen.slice().sort());
  });

  test('bundle dekt alle src/*.gs files', () => {
    const srcFiles = fs.readdirSync(path.join(ROOT, 'src'))
      .filter((n) => n.endsWith('.gs')).length;
    expect(bundle.files.length).toBe(srcFiles);
  });

  test('hash is SHA-256 van JSON.stringify(files) — reproduceerbaar', () => {
    const crypto = require('crypto');
    const verwacht = crypto.createHash('sha256')
      .update(JSON.stringify(bundle.files)).digest('hex');
    expect(bundle.hash).toBe(verwacht);
  });
});

describe('bundle-create.js — operator-instructies in stderr', () => {
  const versie = '99.0.1';
  const bundlePad = path.join(ROOT, 'bundle-' + versie + '.json');
  let stderr;

  afterAll(() => { try { fs.unlinkSync(bundlePad); } catch (_) {} });

  beforeAll(() => {
    try { fs.unlinkSync(bundlePad); } catch (_) {}
    const r = spawnSync('node', [SCRIPT, versie], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    stderr = r.stderr;
  });

  test('stderr toont SHA-256 hash voor sanity-check', () => {
    expect(stderr).toMatch(/SHA-256.*[0-9a-f]{64}/);
  });

  test('stderr toont Drive-upload instructies', () => {
    expect(stderr).toMatch(/Upload .* naar Google Drive/);
    expect(stderr).toMatch(/file-id/i);
    expect(stderr).toMatch(/UPDATE_BUNDLE_99\.0\.1/);
  });

  test('stderr noemt de optionele VERSIE_KRITIEK_VOOR property', () => {
    expect(stderr).toMatch(/VERSIE_KRITIEK_VOOR/);
  });
});

describe('bundle-create.js — gitignore', () => {
  test('bundle-*.json staat in .gitignore (geen 1.7MB commits)', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/bundle-\*\.json/);
  });
});

/**
 * tests/unit/update-apply.test.js
 *
 * Tier 2.2 — automatische update-installatie. Het gevaarlijkste stuk code in
 * het product (zelf-modificatie), dus de tests dekken vooral de FALEN-paden:
 * kill-switch, lock-contention, backup-fout, PUT-geweigerd, verify-mismatch
 * met rollback, rollback-die-ook-faalt.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const UPDATE_APPLY_GS = path.resolve(__dirname, '../../src/UpdateApply.gs');
const CONFIG_GS       = path.resolve(__dirname, '../../src/Config.gs');

const BUNDLE = {
  ok: true, versie: '2.8.0',
  files: [
    { naam: 'Config', source: 'const NIEUW = 1;', type: 'server_js' },
    { naam: 'Utils',  source: 'function nieuw() {}', type: 'server_js' },
  ],
};

const HUIDIG_PROJECT = {
  files: [
    { name: 'appsscript', type: 'JSON', source: '{"oauthScopes":[]}' },
    { name: 'Dialoog', type: 'HTML', source: '<html></html>' },
    { name: 'Config', type: 'SERVER_JS', source: 'const OUD = 1;' },
    { name: 'Utils',  type: 'SERVER_JS', source: 'function oud() {}' },
  ],
};

/**
 * fetchScript: array van handler-functies per call-volgorde. Elke handler
 * krijgt (url, opts) en returnt {code, body}.
 */
function maakCtx(opts) {
  opts = opts || {};
  let fetchCalls = [];
  const script = opts.fetchScript || [];
  let callIdx = 0;

  const fetchMock = jest.fn((url, fopts) => {
    fetchCalls.push({ url, opts: fopts || {} });
    const handler = script[callIdx] || script[script.length - 1] ||
      (() => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) }));
    callIdx++;
    const r = handler(url, fopts || {});
    return {
      getResponseCode: () => r.code,
      getContentText: () => r.body,
    };
  });

  const backupCalls = [];
  const auditCalls = [];

  const ctx = createGasRuntime([CONFIG_GS, UPDATE_APPLY_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null, setProperty: () => {},
        setProperties: () => {}, deleteProperty: () => {},
      }),
      getUserProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
    ScriptApp: {
      getScriptId: () => 'script-id-test',
      getOAuthToken: () => 'token-test',
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => opts.lockBeschikbaar !== false,
        releaseLock: jest.fn(),
        waitLock: jest.fn(),
      }),
    },
    DriveApp: {
      getFoldersByName: () => ({
        hasNext: () => true,
        next: () => ({
          createFile: jest.fn((naam, inhoud) => {
            if (opts.backupFaalt) throw new Error('Drive quota exceeded');
            backupCalls.push({ naam, inhoud });
            return {};
          }),
          getFiles: () => ({ hasNext: () => false }),
        }),
      }),
      getFolderById: () => { throw new Error('niet-gemockt pad'); },
      createFolder: () => ({ createFile: jest.fn() }),
    },
    UrlFetchApp: { fetch: fetchMock },
    haalConfigOp_: () => (opts.serverConfig !== undefined ? opts.serverConfig : { flags: { auto_apply_update: true } }),
    schrijfAuditLog_: jest.fn((a, d) => auditCalls.push({ a, d })),
  });

  // #4 drive.file: code-backup-map loopt nu via getDriveBackupMap_ (DriveStructuur).
  ctx.getDriveBackupMap_ = () => ({
    createFile: (naam, inhoud) => {
      if (opts.backupFaalt) throw new Error('Drive quota exceeded');
      backupCalls.push({ naam, inhoud });
      return {};
    },
    getFiles: () => ({ hasNext: () => false }),
  });

  return { ctx, fetchMock, fetchCalls, backupCalls, auditCalls };
}

describe('_autoApplyToegestaan_ — kill-switch is fail-CLOSED', () => {
  test('flag expliciet true: toegestaan', () => {
    const { ctx } = maakCtx({ serverConfig: { flags: { auto_apply_update: true } } });
    expect(ctx._autoApplyToegestaan_()).toBe(true);
  });
  test('geen config (server onbereikbaar): UIT', () => {
    const { ctx } = maakCtx({ serverConfig: null });
    expect(ctx._autoApplyToegestaan_()).toBe(false);
  });
  test('config zonder flags: UIT', () => {
    const { ctx } = maakCtx({ serverConfig: { versie: '2.8.0' } });
    expect(ctx._autoApplyToegestaan_()).toBe(false);
  });
  test('flag ontbreekt in flags: UIT', () => {
    const { ctx } = maakCtx({ serverConfig: { flags: { andere_flag: true } } });
    expect(ctx._autoApplyToegestaan_()).toBe(false);
  });
  test('flag expliciet false: UIT', () => {
    const { ctx } = maakCtx({ serverConfig: { flags: { auto_apply_update: false } } });
    expect(ctx._autoApplyToegestaan_()).toBe(false);
  });
});

describe('voerAutomatischeUpdateUit_ — falen-paden', () => {
  test('lege bundle: weiger zonder API-calls', () => {
    const { ctx, fetchMock } = maakCtx();
    const r = ctx.voerAutomatischeUpdateUit_({ files: [] });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('lock bezet (concurrent run): abort met duidelijke melding', () => {
    const { ctx, fetchMock } = maakCtx({ lockBeschikbaar: false });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/andere taak/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('GET huidige code faalt (403): abort, niets gewijzigd', () => {
    const { ctx, fetchCalls } = maakCtx({
      fetchScript: [() => ({ code: 403, body: 'PERMISSION_DENIED' })],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet lezen.*403|403.*Niets gewijzigd/i);
    // Alleen de GET — geen PUT
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].opts.method).toBe('get');
  });

  test('backup naar Drive faalt: abort VOORDAT er iets wijzigt', () => {
    const { ctx, fetchCalls } = maakCtx({
      backupFaalt: true,
      fetchScript: [() => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) })],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/Backup.*mislukt/i);
    expect(r.fout).toMatch(/Niets gewijzigd/i);
    // Alleen GET — de PUT mag nooit zijn gedaan
    expect(fetchCalls.filter((c) => c.opts.method === 'put')).toHaveLength(0);
  });

  test('PUT geweigerd (400): nette fout + backupNaam, geen rollback nodig', () => {
    const { ctx } = maakCtx({
      fetchScript: [
        () => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) }),  // GET
        () => ({ code: 400, body: 'Syntax error in file Config' }),    // PUT
      ],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/geweigerd.*400/i);
    expect(r.backupNaam).toMatch(/^CodeBackup_/);
  });

  test('verify-mismatch: automatische rollback + audit-log', () => {
    const corrupteTerug = { files: [
      { name: 'Config', type: 'SERVER_JS', source: 'iets anders!' },
    ]};
    const { ctx, fetchCalls, auditCalls } = maakCtx({
      fetchScript: [
        () => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) }),   // GET
        () => ({ code: 200, body: '{}' }),                              // PUT (nieuw)
        () => ({ code: 200, body: JSON.stringify(corrupteTerug) }),     // VERIFY GET
        () => ({ code: 200, body: '{}' }),                              // ROLLBACK PUT
      ],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.rolledBack).toBe(true);
    expect(r.fout).toMatch(/Verificatie.*mislukte/i);
    // 4 calls: GET, PUT, VERIFY-GET, ROLLBACK-PUT
    expect(fetchCalls).toHaveLength(4);
    // Rollback-PUT bevat de OUDE files
    const rollbackPayload = JSON.parse(fetchCalls[3].opts.payload);
    expect(rollbackPayload.files.find((f) => f.name === 'Config').source).toBe('const OUD = 1;');
    expect(auditCalls.some((c) => /VERIFY FAILED/.test(c.a))).toBe(true);
  });

  test('verify-mismatch + rollback faalt ook: rolledBack=false + verwijs naar Drive-backup', () => {
    const corrupteTerug = { files: [] };
    const { ctx } = maakCtx({
      fetchScript: [
        () => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) }),
        () => ({ code: 200, body: '{}' }),
        () => ({ code: 200, body: JSON.stringify(corrupteTerug) }),
        () => ({ code: 500, body: 'Internal error' }),                  // ROLLBACK faalt
      ],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(false);
    expect(r.rolledBack).toBe(false);
    expect(r.fout).toMatch(/Rollback faalde/i);
    expect(r.backupNaam).toMatch(/^CodeBackup_/);
  });
});

describe('voerAutomatischeUpdateUit_ — happy path', () => {
  function happyScript() {
    const naApply = { files: [
      { name: 'appsscript', type: 'JSON', source: '{"oauthScopes":[]}' },
      { name: 'Dialoog', type: 'HTML', source: '<html></html>' },
      { name: 'Config', type: 'SERVER_JS', source: 'const NIEUW = 1;' },
      { name: 'Utils',  type: 'SERVER_JS', source: 'function nieuw() {}' },
    ]};
    return [
      () => ({ code: 200, body: JSON.stringify(HUIDIG_PROJECT) }),  // GET
      () => ({ code: 200, body: '{}' }),                             // PUT
      () => ({ code: 200, body: JSON.stringify(naApply) }),          // VERIFY
    ];
  }

  test('geslaagde apply: ok=true + backupNaam + audit-log', () => {
    const { ctx, backupCalls, auditCalls } = maakCtx({ fetchScript: happyScript() });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(true);
    expect(r.backupNaam).toMatch(/^CodeBackup_/);
    expect(backupCalls).toHaveLength(1);
    expect(auditCalls.some((c) => /geïnstalleerd/.test(c.a))).toBe(true);
  });

  test('PUT-payload behoudt manifest (JSON) + HTML van huidig project', () => {
    const { ctx, fetchCalls } = maakCtx({ fetchScript: happyScript() });
    ctx.voerAutomatischeUpdateUit_(BUNDLE);
    const putPayload = JSON.parse(fetchCalls[1].opts.payload);
    const types = putPayload.files.map((f) => f.type);
    expect(types).toContain('JSON');   // manifest behouden → scopes intact
    expect(types).toContain('HTML');   // dialogen behouden
    // Manifest-source is van het HUIDIGE project, niet uit bundle
    const manifest = putPayload.files.find((f) => f.type === 'JSON');
    expect(manifest.source).toBe('{"oauthScopes":[]}');
  });

  test('PUT-payload: SERVER_JS komt volledig uit bundle (oude orphans weg)', () => {
    const projectMetOrphan = { files: HUIDIG_PROJECT.files.concat([
      { name: 'OudeModule', type: 'SERVER_JS', source: 'dood spoor' },
    ])};
    const naApply = { files: [
      { name: 'appsscript', type: 'JSON', source: '{"oauthScopes":[]}' },
      { name: 'Config', type: 'SERVER_JS', source: 'const NIEUW = 1;' },
      { name: 'Utils',  type: 'SERVER_JS', source: 'function nieuw() {}' },
    ]};
    const { ctx, fetchCalls } = maakCtx({
      fetchScript: [
        () => ({ code: 200, body: JSON.stringify(projectMetOrphan) }),
        () => ({ code: 200, body: '{}' }),
        () => ({ code: 200, body: JSON.stringify(naApply) }),
      ],
    });
    const r = ctx.voerAutomatischeUpdateUit_(BUNDLE);
    expect(r.ok).toBe(true);
    const putPayload = JSON.parse(fetchCalls[1].opts.payload);
    expect(putPayload.files.find((f) => f.name === 'OudeModule')).toBeUndefined();
  });
});

describe('_verifieerToegepasteFiles_', () => {
  let ctx;
  beforeAll(() => { ctx = maakCtx().ctx; });

  test('alle bundle-files identiek aanwezig: true', () => {
    const project = [
      { name: 'A', type: 'SERVER_JS', source: 'x' },
      { name: 'B', type: 'SERVER_JS', source: 'y' },
      { name: 'manifest', type: 'JSON', source: '{}' },
    ];
    const bundle = [{ naam: 'A', source: 'x' }, { naam: 'B', source: 'y' }];
    expect(ctx._verifieerToegepasteFiles_(project, bundle)).toBe(true);
  });

  test('source-afwijking: false', () => {
    const project = [{ name: 'A', type: 'SERVER_JS', source: 'GEWIJZIGD' }];
    expect(ctx._verifieerToegepasteFiles_(project, [{ naam: 'A', source: 'x' }])).toBe(false);
  });

  test('file ontbreekt: false', () => {
    expect(ctx._verifieerToegepasteFiles_([], [{ naam: 'A', source: 'x' }])).toBe(false);
  });
});

describe('Source-level checks', () => {
  const src = fs.readFileSync(UPDATE_APPLY_GS, 'utf8');

  test('startAutomatischeUpdate blijft als dormant functie bestaan (re-enable-pad na bundle-signing)', () => {
    expect(src).toMatch(/function startAutomatischeUpdate\(/);
    expect(src).not.toMatch(/function startAutomatischeUpdate_\(/);
  });

  test('Menu.gs biedt GEEN automatische update aan (script.projects verwijderd voor OAuth-verificatie)', () => {
    const menu = fs.readFileSync(path.resolve(__dirname, '../../src/Menu.gs'), 'utf8');
    expect(menu).not.toMatch(/'startAutomatischeUpdate'/);
  });

  test('manifest bevat GEEN script.projects scope (verwijderd voor OAuth-verificatie; self-update dormant)', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/appsscript.json'), 'utf8'));
    expect(manifest.oauthScopes).not.toContain('https://www.googleapis.com/auth/script.projects');
  });

  test('kill-switch is fail-closed: geen isFeatureIngeschakeld_ (fail-open) gebruikt', () => {
    expect(src).not.toMatch(/isFeatureIngeschakeld_\(/);
    expect(src).toMatch(/auto_apply_update.*===.*true/);
  });

  test('tryLock(0) — geen wachten op lock (race-venster vermijden)', () => {
    expect(src).toMatch(/tryLock\(0\)/);
  });
});

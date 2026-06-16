/**
 * tests/unit/backup-email.test.js
 *
 * Tier 2 #5 — cross-account backup-egress via mail.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const BACKUP_EMAIL_GS = path.resolve(__dirname, '../../src/BackupEmail.gs');
const UTILS_GS        = path.resolve(__dirname, '../../src/Utils.gs');
const CONFIG_GS       = path.resolve(__dirname, '../../src/Config.gs');

function maakBackupCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({}, opts.props || {});
  const settings = Object.assign({}, opts.settings || {});
  const mailCalls = [];
  const auditCalls = [];

  const mockNieuwsteFile = opts.backupFile || {
    getName: () => 'NoahArk_Test_2026-06-10.jsonl',
    getSize: () => 1024 * 100,  // 100KB
    getDateCreated: () => new Date('2026-06-10'),
    getAs: () => ({ name: 'NoahArk_Test_2026-06-10.jsonl' }),
    getUrl: () => 'https://drive.google.com/file/d/x',
  };

  const ctx = createGasRuntime([CONFIG_GS, UTILS_GS, BACKUP_EMAIL_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
        setProperties: (o) => Object.assign(propStore, o),
      }),
      getUserProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
    Session: {
      getActiveUser: () => ({
        // Onderscheid expliciet tussen "niet meegegeven" (default) en "leeg".
        getEmail: () => (opts.activeEmail !== undefined ? opts.activeEmail : 'klant@example.nl'),
      }),
    },
    DriveApp: {
      getFoldersByName: () => ({
        hasNext: () => opts.hasBackupFolder !== false,
        next: () => ({
          getFiles: () => {
            let returned = false;
            return {
              hasNext: () => !returned && opts.hasBackupFile !== false,
              next: () => { returned = true; return mockNieuwsteFile; },
            };
          },
          getFilesByName: () => ({ hasNext: () => false }),
        }),
      }),
      getFolderById: () => { throw new Error('mock-only-by-name'); },
      createFolder: () => ({}),
    },
    MailApp: {
      sendEmail: jest.fn((arg1, arg2, arg3) => {
        if (typeof arg1 === 'object') mailCalls.push(arg1);
        else mailCalls.push({ to: arg1, subject: arg2, body: arg3 });
      }),
      getRemainingDailyQuota: () => 50,
    },
    MimeType: { JAVASCRIPT: 'JAVASCRIPT', PLAIN_TEXT: 'PLAIN_TEXT' },
    schrijfAuditLog_: jest.fn((actie, details) => { auditCalls.push({ actie, details }); }),
    // Mock getInstelling_ via Settings-mock op de runtime
    getInstelling_: (naam) => (naam in settings ? settings[naam] : ''),
    setInstelling_: jest.fn(),
    isJa_: (v) => String(v || '').toLowerCase().trim() === 'ja',
    isGeldigEmail_: (e) => String(e || '').indexOf('@') > 0,
  });

  // #4 drive.file: backup-map-resolutie loopt nu via getDriveBackupMap_
  // (DriveStructuur). Mock 'm direct op de in-memory backup-folder, net zoals
  // voorheen DriveApp.getFoldersByName werd gemockt.
  ctx.getDriveBackupMap_ = () => (opts.hasBackupFolder === false ? null : {
    getFiles: () => {
      let returned = false;
      return {
        hasNext: () => !returned && opts.hasBackupFile !== false,
        next: () => { returned = true; return mockNieuwsteFile; },
      };
    },
    getFilesByName: () => ({ hasNext: () => false }),
  });

  return { ctx, propStore, mailCalls, auditCalls };
}

describe('backupEmailIndienNodig_ — throttle + opt-in', () => {
  test('opt-out (default): geen mail, geen audit', () => {
    const { ctx, mailCalls, auditCalls } = maakBackupCtx({ settings: {} });
    ctx.backupEmailIndienNodig_();
    expect(mailCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  test("opt-in + nooit verzonden: stuurt mail + zet timestamp", () => {
    const { ctx, propStore, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
    });
    ctx.backupEmailIndienNodig_();
    expect(mailCalls).toHaveLength(1);
    expect(propStore.backupEmailLaatstTs).toBeDefined();
    expect(parseInt(propStore.backupEmailLaatstTs)).toBeGreaterThan(0);
  });

  test('opt-in + < 7 dagen geleden: geen mail (throttled)', () => {
    const { ctx, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
      props: { backupEmailLaatstTs: String(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });
    ctx.backupEmailIndienNodig_();
    expect(mailCalls).toHaveLength(0);
  });

  test('opt-in + > 7 dagen geleden: stuurt mail', () => {
    const { ctx, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
      props: { backupEmailLaatstTs: String(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    ctx.backupEmailIndienNodig_();
    expect(mailCalls).toHaveLength(1);
  });
});

describe('_verstuurBackupEmail_ — bestand-grootte + email-pad', () => {
  test('happy: kleine file → attachment', () => {
    const { ctx, mailCalls, auditCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
    });
    const r = ctx._verstuurBackupEmail_({ trigger: 'handmatig' });
    expect(r.ok).toBe(true);
    expect(mailCalls).toHaveLength(1);
    expect(mailCalls[0].attachments).toBeDefined();
    expect(mailCalls[0].subject).toMatch(/Boekhoudbaar backup/);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].details).toMatch(/trigger=handmatig/);
  });

  test('grote file (>20MB): geen attachment, Drive-link i.p.v.', () => {
    const grote = {
      getName: () => 'NoahArk_Big_2026-06-10.jsonl',
      getSize: () => 25 * 1024 * 1024,
      getDateCreated: () => new Date('2026-06-10'),
      getAs: () => ({}),
      getUrl: () => 'https://drive.google.com/file/d/BIG',
    };
    const { ctx, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
      backupFile: grote,
    });
    const r = ctx._verstuurBackupEmail_({ trigger: 'handmatig' });
    expect(r.ok).toBe(true);
    expect(mailCalls).toHaveLength(1);
    // Link-modus: positionele args (to, subject, body)
    expect(mailCalls[0].body).toMatch(/drive\.google\.com\/file\/d\/BIG/);
    expect(mailCalls[0].body).toMatch(/te groot om te mailen/);
  });

  test('geen backup-map: returnt nette fout, geen mail', () => {
    const { ctx, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
      hasBackupFolder: false,
    });
    const r = ctx._verstuurBackupEmail_({ trigger: 'handmatig' });
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/backup-map/i);
    expect(mailCalls).toHaveLength(0);
  });

  test('geen NoahArk-file in map: returnt nette fout', () => {
    const { ctx, mailCalls } = maakBackupCtx({
      settings: { 'Backup-email actief': 'Ja' },
      hasBackupFile: false,
    });
    const r = ctx._verstuurBackupEmail_({ trigger: 'handmatig' });
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/NoahArk/);
    expect(mailCalls).toHaveLength(0);
  });
});

describe('_bepaalBackupEmailAdres_ — voorkeur-volgorde', () => {
  test('Instelling "Backup-email adres" wint over alles', () => {
    const { ctx } = maakBackupCtx({
      settings: {
        'Backup-email adres': 'expliciet@example.nl',
        'Email rapporten naar': 'rapport@example.nl',
        'Email': 'email@example.nl',
      },
    });
    expect(ctx._bepaalBackupEmailAdres_()).toBe('expliciet@example.nl');
  });

  test('zonder Instelling: Session.getActiveUser email', () => {
    const { ctx } = maakBackupCtx({
      activeEmail: 'actief@example.nl',
    });
    expect(ctx._bepaalBackupEmailAdres_()).toBe('actief@example.nl');
  });

  test('niets geconfigureerd: null', () => {
    const { ctx } = maakBackupCtx({
      activeEmail: '',
    });
    expect(ctx._bepaalBackupEmailAdres_()).toBeNull();
  });
});

describe('Source-level: client-functies hebben GEEN trailing underscore', () => {
  // stuurBackupEmailNu is menu-aanroepbaar (via google.script.run / Apps Script
  // menu); moet ZONDER underscore. Net als AVG-flow regression-guard.
  const src = fs.readFileSync(BACKUP_EMAIL_GS, 'utf8');

  test('stuurBackupEmailNu ZONDER trailing underscore', () => {
    expect(src).toMatch(/function stuurBackupEmailNu\(/);
    expect(src).not.toMatch(/function stuurBackupEmailNu_\(/);
  });

  test('Menu.gs verwijst naar stuurBackupEmailNu', () => {
    const menu = fs.readFileSync(path.resolve(__dirname, '../../src/Menu.gs'), 'utf8');
    expect(menu).toMatch(/'stuurBackupEmailNu'/);
  });
});

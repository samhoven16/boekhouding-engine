/**
 * gas-runtime.js
 * Simuleert de Google Apps Script uitvoeringsomgeving voor Jest-tests.
 *
 * GAS voert alle .gs bestanden samen in één gedeelde globale scope uit.
 * Dit helper repliceert dat gedrag via Node.js vm.createContext:
 *   - Alle top-level declaraties (function, const, let, var) worden properties
 *     van het context-object — identiek aan GAS shared scope.
 *   - GAS services (SpreadsheetApp, etc.) worden als jest.fn() mocks ingebracht.
 *   - Via `overrides` kan elke test eigen mock-implementaties injecteren.
 *
 * Gebruik:
 *   const { ctx } = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
 *   ctx.valideerBoeking('factuur', {...})   // roept de echte code aan
 *   ctx.SpreadsheetApp.getActiveSpreadsheet  // jest mock
 */
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

/**
 * Maakt een GAS-context aan, laadt de gevraagde bronbestanden en
 * retourneert de context met alle functies en constanten als properties.
 *
 * @param {string[]} files - Bestanden uit src/ laden in opgegeven volgorde
 * @param {Object}   overrides - Extra globals / mock-overschrijvingen
 * @returns {{ ctx: Object, mockAuditLog: jest.fn }}
 */
function createGasRuntime(files, overrides = {}) {
  // ── Basis GAS service mocks ─────────────────────────────────────────────
  const mockGetProperty  = jest.fn(() => null);
  const mockSetProperty  = jest.fn();
  const mockProps = {
    getProperty:    mockGetProperty,
    setProperty:    mockSetProperty,
    setProperties:  jest.fn(),
    deleteProperty: jest.fn(),
  };

  const mockLock = {
    waitLock:    jest.fn(),
    tryLock:     jest.fn(() => true),
    releaseLock: jest.fn(),
  };

  const ctx = {
    // ── Logger ──────────────────────────────────────────────────────────
    Logger: { log: jest.fn() },

    // ── Utilities ───────────────────────────────────────────────────────
    Utilities: {
      formatDate:    jest.fn((_d, _tz, fmt) => {
        // Geeft een herkenbare string terug zodat tests op waarde kunnen controleren
        return fmt ? '01-01-2024' : '';
      }),
      sleep:         jest.fn(),
      newBlob:       jest.fn(() => ({ getAs: jest.fn(() => ({ setName: jest.fn(), name: '' })) })),
      base64Decode:  jest.fn(() => new Uint8Array()),
      // computeDigest / DigestAlgorithm: deterministische FNV-achtige mock zodat
      // code-paden die SHA-256-hashes gebruiken geen TypeError krijgen. Tests die
      // de echte hash-output willen verifiëren moeten dit override-en.
      computeDigest: jest.fn((_alg, s) => {
        const str = String(s);
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
          h = ((h ^ str.charCodeAt(i)) * 16777619) >>> 0;
        }
        const bytes = [];
        for (let i = 0; i < 32; i++) {
          h = ((h * 31) + i) >>> 0;
          bytes.push(h & 0xff);
        }
        return bytes;
      }),
      DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5', SHA_1: 'SHA_1' },
      computeHmacSha256Signature: jest.fn(() => new Uint8Array()),
      getUuid: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
    },

    // ── PropertiesService ───────────────────────────────────────────────
    PropertiesService: {
      getScriptProperties: jest.fn(() => mockProps),
      getUserProperties:   jest.fn(() => mockProps),
    },

    // ── LockService ─────────────────────────────────────────────────────
    LockService: {
      getScriptLock: jest.fn(() => mockLock),
      getUserLock:   jest.fn(() => mockLock),
    },

    // ── Session ─────────────────────────────────────────────────────────
    Session: {
      getActiveUser: jest.fn(() => ({ getEmail: jest.fn(() => 'test@example.com') })),
    },

    // ── SpreadsheetApp (minimale stub) ──────────────────────────────────
    SpreadsheetApp: {
      getActiveSpreadsheet: jest.fn(() => null),
      getUi:                jest.fn(),
      flush:                jest.fn(),
    },

    // ── MailApp ─────────────────────────────────────────────────────────
    MailApp: {
      sendEmail:                  jest.fn(),
      getRemainingDailyQuota:     jest.fn(() => 100),
    },

    // ── DriveApp ────────────────────────────────────────────────────────
    DriveApp: {
      getFoldersByName: jest.fn(() => ({ hasNext: jest.fn(() => false) })),
      createFolder:     jest.fn(() => ({ createFile: jest.fn(() => ({ getUrl: jest.fn(() => 'https://drive.google.com/test') })) })),
      getFileById:      jest.fn(() => ({ getAs: jest.fn(() => ({})), getBlob: jest.fn(() => ({})) })),
    },

    // ── GmailApp ────────────────────────────────────────────────────────
    GmailApp: { sendEmail: jest.fn() },
    MailApp:  { sendEmail: jest.fn() },

    // ── UrlFetchApp ─────────────────────────────────────────────────────
    UrlFetchApp: {
      fetch: jest.fn(() => ({
        getContentText: jest.fn(() => '{}'),
        getResponseCode: jest.fn(() => 200),
      })),
    },

    // ── HtmlService ─────────────────────────────────────────────────────
    HtmlService: {
      createHtmlOutput:         jest.fn(() => ({ setWidth: jest.fn().mockReturnThis(), setHeight: jest.fn().mockReturnThis() })),
      createTemplateFromFile:   jest.fn(),
    },

    // ── Browser / console ───────────────────────────────────────────────
    Browser:  { msgBox: jest.fn() },
    console:  { log: jest.fn(), warn: jest.fn(), error: jest.fn() },

    // ── Node globals die GAS-code soms indirect nodig heeft ─────────────
    Date:    Date,
    Math:    Math,
    JSON:    JSON,
    String:  String,
    Number:  Number,
    parseInt:   parseInt,
    parseFloat: parseFloat,
    isNaN:      isNaN,
    Array:      Array,
    Object:     Object,
    Error:      Error,
    RegExp:     RegExp,

    // ── Audit-log helpers (default no-op stubs) ─────────────────────────
    // Tests die Utils.gs niet expliciet bundelen, hebben toch code-paden
    // die safeAuditLog_/schrijfAuditLog_ aanroepen via cross-file lookup.
    // Default mocks voorkomen ReferenceError; bundelt een test Utils.gs
    // expliciet dan overschrijft de échte implementatie deze stubs.
    schrijfAuditLog_:  jest.fn(),
    auditLog_:         jest.fn(),

    // ── Overschrijvingen van de aanroeper ────────────────────────────────
    ...overrides,
  };

  // ── Laad bronbestanden als één aaneengesloten script ──────────────────
  // Dit simuleert hoe GAS alle .gs bestanden in één gedeelde scope uitvoert.
  //
  // Cycle 78: safeAuditLog_ leeft in Utils.gs maar wordt aangeroepen vanuit
  // veel andere modules. Tests die Utils.gs NIET bundelen krijgen anders een
  // ReferenceError. Deze prelude declareert een default-versie die naar
  // schrijfAuditLog_ doorroept (mirrort productie-gedrag) en met de
  // ctx.schrijfAuditLog_-mock matched zodat assertions blijven werken.
  // Function-declaration hoisting: de echte Utils.gs versie overschrijft
  // deze prelude wanneer Utils.gs wél in `files` zit.
  const prelude = `
function safeAuditLog_(actie, details) {
  try { if (typeof schrijfAuditLog_ === 'function') schrijfAuditLog_(actie, details); } catch (_) {}
}
`;
  const code = prelude + files
    .map(f => {
      const fullPath = path.isAbsolute(f) ? f : path.join(SRC, f);
      return `\n// ── ${path.basename(f)} ──\n` + fs.readFileSync(fullPath, 'utf8');
    })
    .join('\n\n');

  const script = new vm.Script(code, { filename: 'gas-bundle.js' });
  script.runInContext(vm.createContext(ctx));

  return ctx;
}

module.exports = { createGasRuntime };

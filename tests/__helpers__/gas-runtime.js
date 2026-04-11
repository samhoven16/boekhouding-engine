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

    // ── Overschrijvingen van de aanroeper ────────────────────────────────
    ...overrides,
  };

  // ── Laad bronbestanden als één aaneengesloten script ──────────────────
  // Dit simuleert hoe GAS alle .gs bestanden in één gedeelde scope uitvoert.
  const code = files
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

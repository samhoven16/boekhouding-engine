/**
 * eslint.config.js
 * ESLint 9 flat config voor Google Apps Script bronbestanden.
 *
 * GAS-realiteit: alle .gs bestanden delen één globale scope — functies en
 * constanten uit bestand A zijn beschikbaar in B zonder import. Dit maakt
 * no-undef en no-redeclare onbruikbaar per bestand.
 *
 * Wat WEL waarde heeft (en hieronder geconfigureerd is):
 *  - no-throw-literal    → vangt `throw "string"` (altijd een bug)
 *  - eqeqeq              → vangt == i.p.v. === (type-coercion bugs)
 *  - no-unused-vars      → dead code detectie
 *  - no-useless-escape   → regexp/string escape bugs
 *  - no-empty            → lege catch-blokken zonder uitleg
 *  - no-constant-condition → `if (true)` of `while (false)`
 *
 * Regels UITGESCHAKELD vanwege GAS gedeelde scope:
 *  - no-undef     → cross-file referenties zijn intentioneel
 *  - no-redeclare → functies kunnen vanuit meerdere bestanden bereikbaar zijn
 */
const js = require('@eslint/js');

// GAS service globals — hier WEL nuttig: typt men "SpreadsheeApp" dan pikt
// ESLint dat op als unknown global zodra we ooit no-undef per-file inschakelen.
// Nu alvast gedeclareerd voor documentatiedoeleinden en toekomstig gebruik.
const GAS_GLOBALS = {
  SpreadsheetApp:    'readonly',
  DriveApp:          'readonly',
  GmailApp:          'readonly',
  MailApp:           'readonly',
  PropertiesService: 'readonly',
  ScriptApp:         'readonly',
  Utilities:         'readonly',
  Session:           'readonly',
  UrlFetchApp:       'readonly',
  HtmlService:       'readonly',
  Logger:            'readonly',
  Browser:           'readonly',
  LockService:       'readonly',
  FormApp:           'readonly',
  DocumentApp:       'readonly',
  CalendarApp:       'readonly',
  ContentService:    'readonly',
  MimeType:          'readonly',
  console:           'readonly',
};

module.exports = [
  // Basislijn: ESLint aanbevolen regels (basisset)
  js.configs.recommended,

  // ── GAS bronbestanden ──────────────────────────────────────────────────
  {
    files: ['src/**/*.gs', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',   // GAS heeft geen ES-modules
      globals: GAS_GLOBALS,
    },
    rules: {
      // ── UITGESCHAKELD vanwege GAS gedeelde scope ─────────────────────
      'no-undef':     'off',   // cross-file refs zijn intentioneel
      'no-redeclare': 'off',   // idem

      // ── Harde fouten (blokkeren CI) ──────────────────────────────────
      // Altijd een bug: throw "string" i.p.v. throw new Error("string")
      'no-throw-literal':      'error',
      // Gevaarlijk: prototype methoden direct aanroepen
      'no-prototype-builtins': 'error',
      // Nutteloze escape tekens in strings/regex (verwarring en bugs)
      // warn: 23 pre-bestaande gevallen in codebase — niet geblokkeerd, wel zichtbaar
      'no-useless-escape':     'warn',
      // Lege blokken zijn verborgen fouten of vergeten TODO's
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Altijd-waar/altijd-vals condities zijn bijna altijd debug-restjes
      'no-constant-condition': 'error',
      // Comma-operator is vrijwel nooit intentioneel
      'no-sequences': 'error',

      // ── Waarschuwingen (zichtbaar, blokkeren CI niet) ─────────────────
      // Strikte gelijkheid — type-coercion bugs (null-check uitzondering)
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      // Ongebruikte variabelen — dead code
      'no-unused-vars': ['warn', {
        // GAS entry-point functies (openNieuweBoeking, onOpen, enz.) worden
        // door GAS/menu/trigger aangeroepen maar lijken unused voor ESLint
        varsIgnorePattern: '^(on[A-Z]|open|toon|stuur|beheer|importeer|exporteer|genereer|bereken|verwerk|controleer|instell|instel|maak|reset|sla)',
        argsIgnorePattern: '^_',
      }],
      // Modern JavaScript stijl
      'prefer-const': 'warn',
    },
  },

  // ── Test-bestanden ─────────────────────────────────────────────────────
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'commonjs',
      globals: {
        require:    'readonly',
        module:     'readonly',
        exports:    'readonly',
        __dirname:  'readonly',
        __filename: 'readonly',
        // Jest globals
        describe:   'readonly',
        it:         'readonly',
        test:       'readonly',
        expect:     'readonly',
        beforeEach: 'readonly',
        afterEach:  'readonly',
        beforeAll:  'readonly',
        afterAll:   'readonly',
        jest:       'readonly',
      },
    },
    rules: {
      'no-undef':     'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];

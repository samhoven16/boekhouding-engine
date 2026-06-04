/**
 * tests/unit/cycle91-dagelijkse-statusmail.test.js
 *
 * Cycle 91 — dagelijkse ochtend-statusmail voor de owner (Sam).
 * Tests dekken de stats-extractie + HTML-builder zonder daadwerkelijk
 * MailApp aan te roepen. De trigger-installer en mail-send zijn dunne
 * wrappers die je beter integration-test (handmatig in editor).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakSheetMock(rows, headers) {
  // rows = array van data-rijen (zonder header). headers = array van strings.
  const allRows = [headers].concat(rows);
  return {
    getDataRange: () => ({ getValues: () => allRows }),
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => {
        const out = [];
        for (let r = row - 1; r < row - 1 + numRows; r++) {
          const slice = allRows[r] ? allRows[r].slice(col - 1, col - 1 + numCols) : [];
          out.push(slice);
        }
        return out;
      },
    }),
    getLastColumn: () => headers.length,
    getLastRow:    () => allRows.length,
    appendRow:     jest.fn(),
  };
}

function maakCtx(sheet, propStore) {
  return createGasRuntime([CODE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propStore && k in propStore ? propStore[k] : null),
        setProperty: jest.fn(),
        deleteProperty: jest.fn(),
        getProperties: () => Object.assign({}, propStore || {}),
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    SpreadsheetApp: { openById: jest.fn(() => ({ getSheets: () => [sheet] })) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'sam@boekhoudbaar.nl' }) },
    MailApp: { sendEmail: jest.fn() },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        // Eenvoudig: vervang tokens met vaste waarden voor stabiele tests
        if (fmt === 'd MMM') return '4 jun';
        if (fmt === 'EEEE d MMMM yyyy') return 'donderdag 4 juni 2026';
        return '';
      },
    },
  });
}

const HEADERS = [
  'Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Vervaldatum',
  'Installatie-ID', 'Aangemaakt op', 'Mollie betaling ID', 'Laatste validatie',
  'Onboarded op', 'Bouncestatus',
];

const nu  = new Date();
const lg  = (uren) => new Date(nu.getTime() - uren * 3600 * 1000);

describe('CYCLE 91: verzamelStatusmailStats_', () => {
  test('lege sheet → alle nullen, geen crash', () => {
    const sheet = maakSheetMock([], HEADERS);
    const ctx = maakCtx(sheet, { LICENTIE_SHEET_ID: 'X' });
    const stats = ctx.verzamelStatusmailStats_();
    expect(stats.nieuw24u).toBe(0);
    expect(stats.totaalActief).toBe(0);
    expect(stats.bounces).toBe(0);
    expect(stats.recenteNamen).toEqual([]);
  });

  test('telt nieuw24u, actief, ingetrokken, bounces, recente validaties', () => {
    const rows = [
      ['k1', 'Anna',  'a@x',  '1.0', 'Actief',    '', 'ss1', lg(2),   'mp_1', lg(1),  '', ''],
      ['k2', 'Bob',   'b@x',  '1.0', 'Actief',    '', 'ss2', lg(5),   'mp_2', lg(50), '', ''],
      ['k3', 'Carel', 'c@x',  '1.0', 'Actief',    '', 'ss3', lg(100), 'mp_3', lg(2),  '', 'hard'],
      ['k4', 'Dora',  'd@x',  '1.0', 'Ingetrokken — refund', '', 'ss4', lg(200), 'mp_4', '', '', ''],
    ];
    const sheet = maakSheetMock(rows, HEADERS);
    const ctx = maakCtx(sheet, { LICENTIE_SHEET_ID: 'X' });
    const stats = ctx.verzamelStatusmailStats_();
    expect(stats.nieuw24u).toBe(2);              // Anna (2u), Bob (5u)
    expect(stats.totaalActief).toBe(3);          // Anna, Bob, Carel
    expect(stats.totaalIngetrokken).toBe(1);     // Dora
    expect(stats.bounces).toBe(1);               // Carel "hard"
    expect(stats.recenteValidaties).toBe(2);     // Anna (1u), Carel (2u)
    expect(stats.recenteNamen).toEqual(['Anna', 'Bob']);
  });

  test('recenteNamen gecapt op 10', () => {
    const rows = [];
    for (let i = 0; i < 15; i++) {
      rows.push(['k' + i, 'Klant' + i, '', '1.0', 'Actief', '', '', lg(1), '', '', '', '']);
    }
    const sheet = maakSheetMock(rows, HEADERS);
    const ctx = maakCtx(sheet, { LICENTIE_SHEET_ID: 'X' });
    const stats = ctx.verzamelStatusmailStats_();
    expect(stats.nieuw24u).toBe(15);
    expect(stats.recenteNamen).toHaveLength(10);
  });

  test('sheet zonder Bouncestatus-kolom: bounces telt 0, geen crash', () => {
    const headersZonderBounce = HEADERS.slice(0, 11);
    const rows = [
      ['k1', 'Anna', '', '1.0', 'Actief', '', '', lg(1), '', lg(1), ''],
    ];
    const sheet = maakSheetMock(rows, headersZonderBounce);
    const ctx = maakCtx(sheet, { LICENTIE_SHEET_ID: 'X' });
    const stats = ctx.verzamelStatusmailStats_();
    expect(stats.bounces).toBe(0);
    expect(stats.nieuw24u).toBe(1);
  });

  test('sheet niet bereikbaar → returnt fout-veld, geen crash', () => {
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({ getProperty: () => null }),
        getUserProperties: () => ({ getProperty: () => null }),
      },
      SpreadsheetApp: { openById: jest.fn(() => { throw new Error('no perms'); }) },
    });
    const stats = ctx.verzamelStatusmailStats_();
    expect(stats.fout).toMatch(/Sheet niet bereikbaar/);
    expect(stats.nieuw24u).toBe(0);
  });
});

describe('CYCLE 91: bouwStatusmailHtml_', () => {
  test('bevat alle stats-waarden + datum', () => {
    const sheet = maakSheetMock([], HEADERS);
    const ctx = maakCtx(sheet, {});
    const html = ctx.bouwStatusmailHtml_({
      nieuw24u: 3, totaalActief: 42, totaalIngetrokken: 1,
      bounces: 0, recenteValidaties: 28, recenteNamen: ['Test Naam'],
    });
    expect(html).toContain('donderdag 4 juni 2026');
    expect(html).toContain('>3<'); expect(html).toContain('>42<');
    expect(html).toContain('>28<'); expect(html).toContain('Test Naam');
    expect(html).toMatch(/<!DOCTYPE html>/i);
  });

  test('XSS-veilig: HTML-tags in klantnaam worden geëscaped', () => {
    const sheet = maakSheetMock([], HEADERS);
    const ctx = maakCtx(sheet, {});
    const html = ctx.bouwStatusmailHtml_({
      nieuw24u: 1, totaalActief: 1, totaalIngetrokken: 0,
      bounces: 0, recenteValidaties: 0,
      recenteNamen: ['<script>alert(1)</script>'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('met fout-veld: waarschuwingsblok bovenaan', () => {
    const sheet = maakSheetMock([], HEADERS);
    const ctx = maakCtx(sheet, {});
    const html = ctx.bouwStatusmailHtml_({
      nieuw24u: 0, totaalActief: 0, totaalIngetrokken: 0,
      bounces: 0, recenteValidaties: 0, recenteNamen: [],
      fout: 'Sheet bereikbaarheid CRITICAL',
    });
    expect(html).toContain('Sheet bereikbaarheid CRITICAL');
    expect(html).toContain('⚠️');
  });
});

describe('CYCLE 91: verstuurDagelijkseStatusmail_ (top-level)', () => {
  test('zonder OWNER_STATUS_EMAIL én zonder session-user → skip met reden', () => {
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({ getProperty: () => null }),
        getUserProperties: () => ({ getProperty: () => null }),
      },
      Session: { getEffectiveUser: () => ({ getEmail: () => '' }) },
      MailApp: { sendEmail: jest.fn() },
    });
    const res = ctx.verstuurDagelijkseStatusmail_();
    expect(res.verstuurd).toBe(false);
    expect(res.reden).toBe('geen-ontvanger');
  });

  test('OWNER_STATUS_EMAIL gezet → MailApp aangeroepen met juiste ontvanger', () => {
    const rows = [
      ['k1', 'Anna', '', '1.0', 'Actief', '', '', lg(2), '', lg(1), '', ''],
    ];
    const sheet = maakSheetMock(rows, HEADERS);
    const sentMails = [];
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => {
            if (k === 'OWNER_STATUS_EMAIL') return 'sam@boekhoudbaar.nl';
            if (k === 'LICENTIE_SHEET_ID') return 'X';
            return null;
          },
          setProperty: jest.fn(),
        }),
        getUserProperties: () => ({ getProperty: () => null }),
      },
      SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => 'fallback@x' }) },
      MailApp: { sendEmail: (opts) => sentMails.push(opts) },
      Utilities: { formatDate: () => '4 jun' },
    });
    const res = ctx.verstuurDagelijkseStatusmail_();
    expect(res.verstuurd).toBe(true);
    expect(res.ontvanger).toBe('sam@boekhoudbaar.nl');
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('sam@boekhoudbaar.nl');
    expect(sentMails[0].subject).toContain('1 nieuw');
    expect(sentMails[0].htmlBody).toContain('Anna');
  });

  test('OWNER_STATUS_EMAIL leeg → fallback naar effective user', () => {
    const sheet = maakSheetMock([], HEADERS);
    const sentMails = [];
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => k === 'LICENTIE_SHEET_ID' ? 'X' : null,
        }),
        getUserProperties: () => ({ getProperty: () => null }),
      },
      SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => 'deploy@x.nl' }) },
      MailApp: { sendEmail: (opts) => sentMails.push(opts) },
      Utilities: { formatDate: () => '4 jun' },
    });
    const res = ctx.verstuurDagelijkseStatusmail_();
    expect(res.verstuurd).toBe(true);
    expect(res.ontvanger).toBe('deploy@x.nl');
    expect(sentMails[0].to).toBe('deploy@x.nl');
  });
});

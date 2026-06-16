/**
 * tests/unit/cycle70-noah-ark-export.test.js
 *
 * Cycle 70 — Noah's Ark JSONL-snapshot. Dagelijkse platform-onafhankelijke
 * backup naast de xlsx. Pure text, leesbaar door elk programma in 2070.
 *
 * Wat dit test bewijst:
 *  • Output is GELDIGE JSONL (elke regel parseert standalone).
 *  • Manifest-regel bevat schema-versie + lijst van bron-sheets.
 *  • Bron-sheets worden header-driven geserialiseerd (object-properties,
 *    geen array-indices — overleeft schema-wijziging).
 *  • Datums → ISO-8601 (round-trip-stabiel).
 *  • Audit-Log-rijen behouden hun Ketenhash-kolom (cycle 69 reist mee).
 *  • Idempotent: tweede run dezelfde dag schrijft GEEN dubbele file.
 *  • Lege staart-rijen worden overgeslagen (geen vervuiling van miljoenen
 *    null-rijen door Sheets-default-grid).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

/** In-memory sheet met header-rij + data-rijen. */
function maakSheet(naam, headers, rows) {
  const grid = [headers.slice()].concat(rows.map((r) => r.slice()));
  return {
    getName: () => naam,
    getLastRow: () => grid.length,
    getDataRange: () => ({
      getValues: () => grid.map((r) => r.slice()),
    }),
  };
}

/** Minimal in-memory Drive-folder. */
function maakDrive() {
  const files = [];
  const folder = {
    _files: files,
    getFilesByName: (n) => {
      const m = files.filter((f) => f.name === n);
      let i = 0;
      return { hasNext: () => i < m.length, next: () => m[i++] };
    },
    createFile: (name, content, mime) => {
      const f = { name, content, mime, getName: () => name,
        getDateCreated: () => new Date(),
        setTrashed: () => { f._trashed = true; } };
      files.push(f);
      return f;
    },
    getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
    createFolder: () => folder,
    getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; },
  };
  return folder;
}

function maakCtx() {
  const drive = maakDrive();
  const sheetsByName = {};
  const ss = {
    getId: () => 'SS-id-123',
    getSheetByName: (n) => sheetsByName[n] || null,
  };
  const ctx = createGasRuntime(['Config.gs', 'ExportAccountant.gs'], {
    Utilities: {
      formatDate: (_d, _tz, fmt) => {
        if (fmt === 'yyyy-MM-dd') return '2026-06-01';
        return '';
      },
      sleep: () => {},
    },
    DriveApp: {
      getFolderById: () => ({
        getFoldersByName: () => ({ hasNext: () => true, next: () => drive }),
        createFolder: () => drive,
      }),
      getFoldersByName: () => ({ hasNext: () => true, next: () => drive }),
      createFolder: () => drive,
      getRootFolder: () => drive,
    },
    // Helpers die ExportAccountant verwacht maar wij niet vanuit Utils.gs laden:
    getSpreadsheet_: () => ss,
    getInstelling_: (k) => (k === 'Bedrijfsnaam' ? 'TestBV' : ''),
    schrijfAuditLog_: () => {},
    SHEETS_BY_NAME_INTERNAL: sheetsByName, // testhandvat
  });
  // Verbind testhandvat aan ctx-helpers (ctx is een vm-context; nieuwe sheets
  // toevoegen mutateert het object dat ss.getSheetByName via closure leest).
  ctx._drive = drive;
  // #4 drive.file: NoahArk-backup-map loopt nu via getDriveBackupMap_
  // (DriveStructuur). Mock 'm direct op de in-memory Drive-folder.
  ctx.getDriveBackupMap_ = () => drive;
  ctx._addSheet = (s) => { sheetsByName[s.getName()] = s; };
  return ctx;
}

describe('CYCLE 70: Noah\'s Ark JSONL-snapshot', () => {
  test('produceert geldige JSONL met manifest + per-sheet records', () => {
    const ctx = maakCtx();
    ctx._addSheet(maakSheet('Journaalposten',
      ['ID', 'Datum', 'Debet', 'Credit', 'Bedrag'],
      [
        ['J001', new Date('2026-01-15T00:00:00Z'), '1300', '8000', 121.00],
        ['J002', new Date('2026-01-16T00:00:00Z'), '4000', '1300', 50.00],
      ]));
    ctx._addSheet(maakSheet('Relaties',
      ['KvK', 'Naam', 'Adres'],
      [['12345678', 'Klant BV', 'Hoofdstraat 1']]));
    ctx._addSheet(maakSheet('Audit Log',
      ['Tijdstip', 'Gebruiker', 'Tabblad', 'Cel', 'Oude waarde', 'Nieuwe waarde', 'Type', 'Ketenhash'],
      [[new Date('2026-01-15T12:00:00Z'), 'a@b.nl', 'Journaalposten', 'I5', '100', '121', 'KRITIEKE-JOURNAALPOST-WIJZIGING', 'abc123def456']]));

    ctx.maakNoahArkSnapshot_();

    expect(ctx._drive._files).toHaveLength(1);
    const file = ctx._drive._files[0];
    expect(file.name).toBe('NoahArk_TestBV_2026-06-01.jsonl');
    expect(file.mime).toBe('application/x-ndjson');

    // Parse elke regel — moet 100% geldige JSON zijn.
    const regels = file.content.trim().split('\n');
    const parsed = regels.map((r) => JSON.parse(r));

    const manifest = parsed[0];
    expect(manifest._record).toBe('manifest');
    expect(manifest._schema).toBe('noah-ark/v1');
    expect(manifest.bedrijf).toBe('TestBV');
    expect(manifest.sheets).toContain('Journaalposten');
    expect(manifest.sheets).toContain('Audit Log');

    // Journaalposten-header + 2 rijen, Relaties-header + 1 rij, Audit-header + 1 rij = 7 records (plus manifest)
    const headerRecords = parsed.filter((p) => p._record === 'sheet-header');
    expect(headerRecords.map((h) => h.sheet)).toEqual(
      expect.arrayContaining(['Journaalposten', 'Relaties', 'Audit Log']));

    const journaalRijen = parsed.filter((p) => p._record === 'rij' && p.sheet === 'Journaalposten');
    expect(journaalRijen).toHaveLength(2);
    expect(journaalRijen[0].data.ID).toBe('J001');
    expect(journaalRijen[0].data.Bedrag).toBe(121.00);
    // Datum als ISO-8601, niet als sheet-serial of getTime().
    expect(journaalRijen[0].data.Datum).toMatch(/^2026-01-15T/);
  });

  test('Audit-Log Ketenhash-kolom (cycle 69) reist mee in de snapshot', () => {
    const ctx = maakCtx();
    ctx._addSheet(maakSheet('Audit Log',
      ['Tijdstip', 'Gebruiker', 'Tabblad', 'Cel', 'Oude waarde', 'Nieuwe waarde', 'Type', 'Ketenhash'],
      [[new Date('2026-01-15T12:00:00Z'), 'a@b.nl', 'Journaalposten', 'I5', '100', '999',
        'KRITIEKE-JOURNAALPOST-WIJZIGING', 'deadbeefcafe1234']]));

    ctx.maakNoahArkSnapshot_();
    const parsed = ctx._drive._files[0].content.trim().split('\n').map(JSON.parse);
    const auditRij = parsed.find((p) => p._record === 'rij' && p.sheet === 'Audit Log');
    expect(auditRij.data.Ketenhash).toBe('deadbeefcafe1234');
    expect(auditRij.data.Type).toBe('KRITIEKE-JOURNAALPOST-WIJZIGING');
  });

  test('idempotent: tweede run dezelfde dag overschrijft niet en dupliceert niet', () => {
    const ctx = maakCtx();
    ctx._addSheet(maakSheet('Journaalposten', ['ID'], [['J001']]));

    ctx.maakNoahArkSnapshot_();
    ctx.maakNoahArkSnapshot_();

    expect(ctx._drive._files).toHaveLength(1);
  });

  test('lege staart-rijen worden overgeslagen (geen Sheets-grid-vervuiling)', () => {
    const ctx = maakCtx();
    ctx._addSheet(maakSheet('Relaties',
      ['KvK', 'Naam'],
      [
        ['12345678', 'Klant BV'],
        ['', ''],            // lege staart-rij
        ['', ''],
      ]));

    ctx.maakNoahArkSnapshot_();
    const parsed = ctx._drive._files[0].content.trim().split('\n').map(JSON.parse);
    const relatieRijen = parsed.filter((p) => p._record === 'rij' && p.sheet === 'Relaties');
    expect(relatieRijen).toHaveLength(1);
    expect(relatieRijen[0].data.Naam).toBe('Klant BV');
  });

  test('ontbrekend sheet faalt niet — onvoltooide setup overleeft', () => {
    const ctx = maakCtx();
    // Geen sheets toegevoegd: ss.getSheetByName geeft overal null terug.
    expect(() => ctx.maakNoahArkSnapshot_()).not.toThrow();
    expect(ctx._drive._files).toHaveLength(1);
    const parsed = ctx._drive._files[0].content.trim().split('\n').map(JSON.parse);
    // Alleen het manifest — geen sheet-records.
    expect(parsed).toHaveLength(1);
    expect(parsed[0]._record).toBe('manifest');
  });

  test('source-grep: dagelijkseTaken roept noahArk-taak aan met feature-flag-guard', () => {
    const fs = require('fs');
    const triggersSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');
    expect(triggersSrc).toMatch(/_runTaak_\(['"]noahArk['"]/);
    expect(triggersSrc).toMatch(/featureAan_\(['"]noah_ark_export['"]\)/);
    expect(triggersSrc).toMatch(/maakNoahArkSnapshot_\(\)/);

    const utilsSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/Utils.gs'), 'utf8');
    expect(utilsSrc).toMatch(/'noah_ark_export':\s*true/);
  });
});

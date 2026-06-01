/**
 * tests/unit/cycle69-audit-hashketen.test.js
 *
 * Cycle 69 — Hash-keten over het Audit Log (tamper-evidence).
 *
 * Elke audit-rij krijgt in kolom 8 een SHA-256 van (vorige-hash + rij-data).
 * Een achteraf gewijzigde audit-regel breekt de keten; de dagelijkse check
 * verifieerAuditKeten_ detecteert dat.
 *
 * EERLIJK: tamper-EVIDENT, niet tamper-proof — wie de code draait kan de
 * keten herbouwen. Deze test bewijst dus de detectie-eigenschap, niet
 * onkraakbaarheid. We testen de echte functies (geen source-grep) met een
 * echte SHA-256 zodat de keten-wiskunde klopt.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

function sha256Bytes(str) {
  // GAS computeDigest geeft signed bytes (-128..127) terug; repliceer dat
  // zodat de hex-encoder in _auditKetenHash_ exact hetzelfde pad loopt.
  return Array.from(crypto.createHash('sha256').update(String(str), 'utf8').digest())
    .map((b) => (b > 127 ? b - 256 : b));
}

/** Minimale in-memory sheet-mock met appendRow/getRange/getLastRow. */
function maakAuditSheet(beginRijen) {
  const rows = beginRijen ? beginRijen.map((r) => r.slice()) : [];
  return {
    _rows: rows,
    getLastRow() { return rows.length + 1; }, // +1 voor header (rij 1)
    appendRow(rij) { rows.push(rij.slice()); },
    getRange(startRij, startKol, numRij, numKol) {
      return {
        getValue() {
          // 1-based; rij 1 = header → data-index = startRij-2
          return rows[startRij - 2] ? rows[startRij - 2][startKol - 1] : '';
        },
        getValues() {
          const out = [];
          for (let i = 0; i < numRij; i++) {
            const bron = rows[startRij - 2 + i] || [];
            const rij = [];
            for (let k = 0; k < numKol; k++) rij.push(bron[startKol - 1 + k] != null ? bron[startKol - 1 + k] : '');
            out.push(rij);
          }
          return out;
        },
      };
    },
  };
}

function maakCtx() {
  // Echte SHA-256 + formatDate met seconde-precisie, geïnjecteerd via overrides
  // zodat de keten-wiskunde echt klopt (geen stub-hash). Config.gs levert SHEETS.
  return createGasRuntime(['Config.gs', 'Triggers.gs'], {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algo, value) => sha256Bytes(value),
      formatDate: (d) => {
        const dt = d instanceof Date ? d : new Date(d);
        return dt.toISOString().slice(0, 19).replace('T', ' ');
      },
    },
  });
}

/** Schrijf een data-rij met geldige ketenhash, exact zoals schrijfAuditEdit_. */
function appendGeketend(ctx, sheet, rij7) {
  const vorige = ctx._laatsteAuditHash_(sheet);
  const rij = rij7.slice();
  rij.push(ctx._auditKetenHash_(vorige, rij7));
  sheet.appendRow(rij);
}

describe('CYCLE 69: Audit-log hash-keten', () => {
  test('een correct geketende log verifieert als ok', () => {
    const ctx = maakCtx();
    const sheet = maakAuditSheet();
    appendGeketend(ctx, sheet, [new Date('2026-01-01T10:00:00Z'), 'a@b.nl', 'Journaalposten', 'I5', '100', '999', 'KRITIEKE-JOURNAALPOST-WIJZIGING']);
    appendGeketend(ctx, sheet, [new Date('2026-01-02T11:00:00Z'), 'a@b.nl', 'Relaties', 'B3', 'x', 'y', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-01-03T12:00:00Z'), 'c@d.nl', 'Instellingen', 'C2', '0', '1', 'cell-edit']);

    const r = ctx.verifieerAuditKeten_(sheet);
    expect(r.ok).toBe(true);
    // 3 rijen: de eerste is het (niet-verifieerbare) anker, 2 schakels gecheckt.
    expect(r.gecontroleerd).toBe(2);
  });

  test('achteraf wijzigen van een niet-anker data-cel breekt de keten', () => {
    const ctx = maakCtx();
    const sheet = maakAuditSheet();
    appendGeketend(ctx, sheet, [new Date('2026-01-01T10:00:00Z'), 'a@b.nl', 'Journaalposten', 'I5', '100', '999', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-01-02T11:00:00Z'), 'a@b.nl', 'Journaalposten', 'I5', '999', '50', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-01-03T12:00:00Z'), 'a@b.nl', 'Relaties', 'B3', 'x', 'y', 'cell-edit']);

    // Manipulatie: verander de 'nieuwe waarde' van rij 2 (data-index 1) van
    // 50→5000 om een journaalpost-ophoging te verbergen. De opgeslagen hash
    // blijft de oude → de herberekende schakel klopt niet meer.
    sheet._rows[1][5] = '5000';

    const r = ctx.verifieerAuditKeten_(sheet);
    expect(r.ok).toBe(false);
    // Data-index 1 = sheet-rij 3 (1-based, header = rij 1).
    expect(r.gebrokenRij).toBe(3);
  });

  test('legacy-rijen (lege kolom 8) worden overgeslagen, nieuwe keten daarna telt', () => {
    const ctx = maakCtx();
    // Twee oude rijen zonder hash (van vóór cycle 69) + nieuwe geketende rijen.
    const sheet = maakAuditSheet([
      [new Date('2025-01-01T10:00:00Z'), 'oud@x.nl', 'Relaties', 'A1', 'p', 'q', 'cell-edit'],
      [new Date('2025-02-01T10:00:00Z'), 'oud@x.nl', 'Relaties', 'A2', 'r', 's', 'cell-edit'],
    ]);
    // Nieuwe writes ketenen door (vorige hash = '' want laatste rij heeft lege kolom 8).
    appendGeketend(ctx, sheet, [new Date('2026-03-01T10:00:00Z'), 'n@x.nl', 'Journaalposten', 'I9', '0', '500', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-03-02T10:00:00Z'), 'n@x.nl', 'Journaalposten', 'J9', '21', '9', 'cell-edit']);

    const r = ctx.verifieerAuditKeten_(sheet);
    expect(r.ok).toBe(true);
    // 2 legacy-rijen overgeslagen (lege hash); beide nieuwe rijen verifiëren
    // tegen prev='' (writer chainde óók op '' na de laatste legacy-rij).
    expect(r.gecontroleerd).toBe(2);
  });

  test('lege of header-only log is per definitie ok', () => {
    const ctx = maakCtx();
    expect(ctx.verifieerAuditKeten_(maakAuditSheet()).ok).toBe(true);
  });

  test('keten overleeft een trim aan de kop (nieuwe eerste rij wordt anker)', () => {
    const ctx = maakCtx();
    const sheet = maakAuditSheet();
    appendGeketend(ctx, sheet, [new Date('2026-01-01T10:00:00Z'), 'a@b.nl', 'Relaties', 'A1', 'a', 'b', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-01-02T10:00:00Z'), 'a@b.nl', 'Relaties', 'A2', 'c', 'd', 'cell-edit']);
    appendGeketend(ctx, sheet, [new Date('2026-01-03T10:00:00Z'), 'a@b.nl', 'Relaties', 'A3', 'e', 'f', 'cell-edit']);
    // Simuleer _trimAuditLog_: verwijder de oudste rij. De nieuwe kop kan niet
    // tegen z'n (verwijderde) voorganger geverifieerd worden, maar de rest wel.
    sheet._rows.shift();

    const r = ctx.verifieerAuditKeten_(sheet);
    expect(r.ok).toBe(true);
    expect(r.gecontroleerd).toBe(1); // 2 resterende rijen: 1 anker + 1 geverifieerd
  });
});

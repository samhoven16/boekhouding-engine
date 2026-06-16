/**
 * tests/unit/audit-ronde2-tax-clarity.test.js
 *
 * Audit-ronde 2 (3/3) — tax-clarity & overdraagbaarheid:
 *   F-ACC-009  XAF <accTp> (B/P) uit de expliciete Balans/W&V-kolom [4] i.p.v.
 *              een gok op het eerste code-cijfer (custom schema's mis-mapten).
 *   F-TAX-113  lijfrente-jaarruimte op het tabblad krijgt de factor-A-caveat
 *              die de calculator-dialog al heeft (bruto, vóór opgebouwd pensioen).
 *   F-TAX-114  Box 3 forfait/heffingsvrij gemarkeerd als indicatief — de
 *              Box 3-wetgeving 2026 is nog niet definitief.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const advSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');
const priveSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Prive.gs'), 'utf8');

// ── F-ACC-009 — gedrag van _bouwGrootboekXml_ ─────────────────────────────
function bouwXml(rows) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'XafExport.gs']);
  const ss = { getSheetByName: () => ({ getDataRange: () => ({ getValues: () => rows }) }) };
  return ctx._bouwGrootboekXml_(ss);
}
function accTpVoor(xml, id) {
  const m = xml.match(new RegExp('<accID>' + id + '</accID>[\\s\\S]*?<accTp>([BP])</accTp>'));
  return m ? m[1] : null;
}

describe('F-ACC-009 — XAF accTp uit Balans/W&V-kolom [4]', () => {
  const rows = [
    ['Code', 'Naam', 'Type', 'Categorie', 'Balans/W&V', 'Saldo'],
    ['0900', 'Resultaat boekjaar', 'Eigen vermogen', '', 'W&V', 0],   // lage code, W&V
    ['8200', 'Voorraadmutatie', 'Activa', '', 'Balans', 0],           // hoge code, Balans
    ['4500', 'Overige baten', 'Opbrengsten', '', '', 0],              // lege bw → fallback
    ['0100', 'Inventaris', 'Activa', '', 'Balans', 0],                // normaal Balans
  ];
  const xml = bouwXml(rows);

  test('W&V-rekening met lage code → P (oude code-gok gaf B)', () => {
    expect(accTpVoor(xml, '0900')).toBe('P');
  });
  test('Balans-rekening met hoge code → B (oude code-gok gaf P)', () => {
    expect(accTpVoor(xml, '8200')).toBe('B');
  });
  test('lege Balans/W&V-kolom → terugval op code-range-heuristiek (4 → P)', () => {
    expect(accTpVoor(xml, '4500')).toBe('P');
  });
  test('normale balansrekening → B', () => {
    expect(accTpVoor(xml, '0100')).toBe('B');
  });
});

// ── F-TAX-113 — lijfrente factor-A-caveat ─────────────────────────────────
describe('F-TAX-113 — lijfrente-jaarruimte krijgt factor-A-caveat', () => {
  test('adviestekst markeert het als bruto jaarruimte vóór opgebouwd pensioen (factor A)', () => {
    expect(advSrc).toMatch(/factor A/);
    expect(advSrc).toMatch(/v[oó]{1,2}r aftrek van al opgebouwd pensioen/i);
  });
});

// ── F-TAX-114 — Box 3 indicatief-marker ───────────────────────────────────
describe('F-TAX-114 — Box 3 forfait/heffingsvrij gemarkeerd als indicatief', () => {
  test('dialog + toast noemen "indicatief" en "nog niet definitief"', () => {
    expect(priveSrc).toMatch(/indicatief/i);
    expect(priveSrc).toMatch(/nog niet definitief/i);
  });
});

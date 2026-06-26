/**
 * tests/unit/audit-2026-06-26-fixes.test.js
 *
 * Ratel-tests voor de geverifieerde BLOCKER/HOOG-bevindingen uit de
 * integrale audit-ronde 2026-06-26:
 *
 *  - [HOOG]    NieuweBoeking drag&drop-IIFE crashte (`dz` null) voor élke klant
 *              ZONDER Gemini-key (de default) → "Technische fout" op het hoofd-
 *              boekingsscherm. Null-guard toegevoegd.
 *  - [BLOCKER] sluitBtwPeriode boekte naar 4130/4140 (verlegde BTW) die NIET in
 *              STANDAARD_GROOTBOEK stonden → REKENING_ONBEKEND-crash midden in de
 *              afsluiting. Rekeningen toegevoegd + ensure-helper voor oude kopieën.
 *  - [HOOG]    MIA-percentage 45,5% bestaat niet (max 45%; Fiscaal.gs gebruikt al
 *              27/36/45). Constante + teksten gecorrigeerd naar "tot 45%".
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');
const lees = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('Audit 2026-06-26 — dropzone null-crash (NieuweBoeking)', () => {
  const src = lees('NieuweBoeking.gs');
  test('de drag&drop-IIFE heeft een null-guard vóór addEventListener', () => {
    // Anker: getElementById('dropzone') → if (!dz) return → pas dan addEventListener.
    expect(src).toMatch(
      /getElementById\('dropzone'\);\s*\n\s*if\s*\(\s*!dz\s*\)\s*return;[\s\S]*?dz\.addEventListener/);
  });
  test('geen ongeguarde dz.addEventListener direct na de getElementById (regressie)', () => {
    expect(src).not.toMatch(/getElementById\('dropzone'\);\s*\n\s*dz\.addEventListener/);
  });
});

describe('Audit 2026-06-26 — verlegde-BTW-rekeningen 4130/4140', () => {
  test('STANDAARD_GROOTBOEK bevat 4130 én 4140 als Passief/Balans', () => {
    const cfg = lees('Config.gs');
    expect(cfg).toMatch(/code:'4130'[\s\S]{0,120}?type:'Passief'[\s\S]{0,80}?bw:'Balans'/);
    expect(cfg).toMatch(/code:'4140'[\s\S]{0,120}?type:'Passief'[\s\S]{0,80}?bw:'Balans'/);
  });

  test('_zorgGrootboekRekeningBestaat_ voegt een ontbrekende rekening toe (idempotent)', () => {
    const ctx2 = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs']);
    const rijen = [['Code', 'Naam', 'Type', 'Categorie', 'B/W', 'Saldo'],
      ['4100', 'Te betalen BTW', 'Passief', 'Kortlopende schulden', 'Balans', 0]];
    const appended = [];
    const sheet = {
      getDataRange: () => ({ getValues: () => rijen }),
      appendRow: (row) => { appended.push(row); rijen.push(row); },
    };
    const ss = { getSheetByName: () => sheet };
    // 4130 ontbreekt → toegevoegd
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4130')).toBe(true);
    expect(appended).toHaveLength(1);
    expect(String(appended[0][0])).toBe('4130');
    // tweede keer → bestaat al → no-op
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4130')).toBe(false);
    expect(appended).toHaveLength(1);
    // 4100 bestaat al → no-op
    expect(ctx2._zorgGrootboekRekeningBestaat_(ss, '4100')).toBe(false);
  });

  test('sluitBtwPeriode ensure-t 4130/4140 vóór de verlegde boekingen (wiring)', () => {
    const btw = lees('BTW.gs');
    expect(btw).toMatch(/_zorgGrootboekRekeningBestaat_\(ss,\s*'4130'\)/);
    expect(btw).toMatch(/_zorgGrootboekRekeningBestaat_\(ss,\s*'4140'\)/);
    // vóór de eerste verlegde maakJournaalpost_ (debet 4130)
    const idxEnsure = btw.indexOf("_zorgGrootboekRekeningBestaat_(ss, '4130')");
    const idxBoeking = btw.indexOf("debet: '4130'");
    expect(idxEnsure).toBeGreaterThan(-1);
    expect(idxBoeking).toBeGreaterThan(idxEnsure);
  });
});

describe('Audit 2026-06-26 — MIA-percentage (45,5% bestaat niet)', () => {
  const src = lees('Belastingadvies.gs');
  test('MIA_PCT is 0.45, niet het niet-bestaande 0.455', () => {
    expect(src).toMatch(/MIA_PCT:\s*0\.45\b/);
    expect(src).not.toMatch(/MIA_PCT:\s*0\.455/);
  });
  test('geen "45,5%" meer in de MIA-adviesteksten', () => {
    expect(src).not.toMatch(/45,5%/);
  });
  test('Fiscaal.gs blijft de categorische 27/36/45 gebruiken (corroboratie, regressie)', () => {
    const fis = lees('Fiscaal.gs');
    expect(fis).toMatch(/0\.45/);
    expect(fis).not.toMatch(/0\.455/);
  });
});

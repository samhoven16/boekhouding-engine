/**
 * tests/unit/cycle17-grootboek-preserve-klant-rijen.test.js
 *
 * Cycle 17 — vulGrootboekschema_ wiste silent:
 *   1. Klant-toegevoegde rekeningen (bv. 9100 'Eigen kostenpost')
 *   2. Alle saldi van bestaande rekeningen
 *
 * Beide bugs leverden audit-trail-loss zonder waarschuwing. Klant moest
 * achteraf 'Saldi herberekenen' draaien en custom rekeningen handmatig
 * opnieuw aanmaken. Vaak gemerkt pas bij volgende BTW-aangifte.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakSheetMock(rijen) {
  const data = [['Code','Naam','Type','Categorie','Balans/W&V','Saldo'], ...(rijen || [])];
  const writes = [];
  return {
    _writes: writes,
    _data: data,
    clearContents: () => { data.length = 1; /* header blijft */ },
    getDataRange: () => ({ getValues: () => data.slice() }),
    getRange: (r, c, nR, nC) => {
      const range = {
        setValues: (v) => { writes.push({ r, c, nR, nC, v }); for (let i = 0; i < v.length; i++) data[r - 1 + i] = v[i].slice(); return range; },
        setValue:  () => range,
      };
      const chainMethods = ['setNumberFormat','setFontFamily','setFontWeight','setBackground','setFontColor','setFontSize','setHorizontalAlignment','setVerticalAlignment','setBorder','setWrap','setFontStyle','merge','setNote','setDataValidation'];
      chainMethods.forEach((m) => { range[m] = () => range; });
      return range;
    },
    setColumnWidth: () => {},
    setFrozenRows:  () => {},
    getLastRow:     () => data.length,
    getLastColumn:  () => data[0].length,
  };
}

function maakCtx(rijen) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Setup.gs'], {});
  const sheet = maakSheetMock(rijen);
  ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  // zetHeaderRij_ kan via Setup.gs gedefinieerd zijn; mock als safety
  ctx.zetHeaderRij_ = ctx.zetHeaderRij_ || (() => {});
  return { ctx, sheet };
}

describe('CYCLE 17: vulGrootboekschema_ — preserve klant-data', () => {
  test('Eerste-run (lege sheet) → vult alleen standaard-rekeningen', () => {
    const { ctx, sheet } = maakCtx([]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.standaard).toBeGreaterThan(10);   // STANDAARD_GROOTBOEK is groot
    expect(stats.klantBehouden).toBe(0);
    expect(stats.saldiBehouden).toBe(0);
    // Eerste schrijf-actie schrijft alle rijen
    expect(sheet._writes.length).toBeGreaterThan(0);
    const datasetWrite = sheet._writes.find((w) => w.nR > 1);
    expect(datasetWrite).toBeTruthy();
  });

  test('Klant-toegevoegde rekening 9100 wordt behouden bij herladen', () => {
    const { ctx, sheet } = maakCtx([
      ['1100','Debiteuren','Activa','Vlottend','Balans', 0],   // standaard
      ['9100','Reiskosten — bus','Kosten','Reizen','W&V', 250.50],  // klant
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.klantBehouden).toBe(1);
    // Zoek 9100 terug in eind-data
    const found = sheet._data.find((r) => String(r[0]) === '9100');
    expect(found).toBeTruthy();
    expect(found[1]).toBe('Reiskosten — bus');
    expect(found[5]).toBe(250.50);
  });

  test('Saldo van standaard-rekening 1100 = 1234.56 blijft behouden', () => {
    const { ctx, sheet } = maakCtx([
      ['1100','Debiteuren','Activa','Vlottend','Balans', 1234.56],
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.saldiBehouden).toBe(1);
    const rij1100 = sheet._data.find((r) => String(r[0]) === '1100');
    expect(rij1100).toBeTruthy();
    expect(rij1100[5]).toBe(1234.56);
  });

  test('Standaard-naam wordt hersteld als klant hem hernoemd had', () => {
    const { ctx, sheet } = maakCtx([
      ['1100','Klanten','Activa','Vlottend','Balans', 0],   // hernoemd van Debiteuren
    ]);
    ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    const rij1100 = sheet._data.find((r) => String(r[0]) === '1100');
    expect(rij1100).toBeTruthy();
    expect(rij1100[1]).toBe('Debiteuren');   // standaard naam hersteld
  });

  test('Gemixt: klant-rij + saldo-preservation + naam-reset werkt samen', () => {
    const { ctx, sheet } = maakCtx([
      ['1100','Mijn klanten','Activa','Vlottend','Balans', 999.99],   // hernoemd + saldo
      ['9200','Project Acme','Omzet','Project','W&V', 5000],          // klant-rij
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.klantBehouden).toBe(1);
    expect(stats.saldiBehouden).toBe(1);
    const r1100 = sheet._data.find((r) => String(r[0]) === '1100');
    const r9200 = sheet._data.find((r) => String(r[0]) === '9200');
    expect(r1100[5]).toBe(999.99);     // saldo behouden
    expect(r9200).toBeTruthy();         // klant-rij behouden
    expect(r9200[1]).toBe('Project Acme');
  });

  test('Saldo = 0 wordt niet als "behouden" geteld (avoidance van noise)', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Activa','Vlottend','Balans', 0],
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.saldiBehouden).toBe(0);
  });

  test('Corrupte saldo-waarde "abc" → val terug op 0, geen crash', () => {
    const { ctx } = maakCtx([
      ['1100','Debiteuren','Activa','Vlottend','Balans', 'abc'],
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.saldiBehouden).toBe(0);
  });

  test('Klant-rij met lege code wordt overgeslagen (geen junk)', () => {
    const { ctx, sheet } = maakCtx([
      ['','','','','', ''],
      ['9200','Project','Omzet','Project','W&V', 100],
    ]);
    const stats = ctx.vulGrootboekschema_(ctx.getSpreadsheet_());
    expect(stats.klantBehouden).toBe(1);
    const r9200 = sheet._data.find((r) => String(r[0]) === '9200');
    expect(r9200).toBeTruthy();
  });
});

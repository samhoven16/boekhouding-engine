/**
 * tests/unit/formeelbewijs-gezondheid-kolom.test.js
 *
 * RATELS voor twee wrong-column-bugs die de klasse-1-migratie blootlegde in
 * integriteits-/bewijs-controles (beide reachable, beide stil-fout):
 *
 *  F-FB-340  _bewijs_I8_afgeslotenPeriode_ las `data[i][14]` (Notities) als
 *            "aangemaakt op" — de echte kolom is [15]. Notities is nooit een
 *            Date → `aangemaakt instanceof Date` was altijd false → de
 *            anti-backdating-controle (boeking achteraf in gesloten periode)
 *            sloeg ALTIJD over en gaf "geldig". Draait in de bewijs-suite
 *            (checkers.forEach).
 *
 *  F-GC-341  controleerBetalingsIntegriteit_ bouwde bankRefs uit `jpData[i][9]`
 *            (= BTW%), maar matchte die tegen factuurnummers. Referentie is
 *            [11]. Gevolg: bankRefs bevatte nooit factuurnummers → ELKE BETAALD-
 *            factuur werd als "zonder journaalpost" gerapporteerd (vals alarm).
 *
 * Beide tests falen op de oude (verkeerde-kolom) code.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function sheetOf(rows) {
  return { getDataRange: () => ({ getValues: () => rows }) };
}
function jpRij(v) {
  const r = new Array(19).fill('');
  r[0] = v.boekingId || 'BK1';
  r[1] = v.datum || '';
  r[4] = v.debet || '';
  r[6] = v.credit || '';
  r[11] = v.referentie || '';
  r[15] = v.aangemaaktOp || '';
  return r;
}
function vfRij(v) {
  const r = new Array(23).fill('');
  r[1] = v.factuurnummer || '';
  r[14] = v.status || '';
  return r;
}

describe('F-FB-340 — I8 anti-backdating leest aangemaakt-op ([15]), niet Notities ([14])', () => {
  function run(jpRows) {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'FormeelBewijs.gs'], {
      _leesGeslotenPeriodes_: () => [{
        van: new Date(2026, 0, 1), tot: new Date(2026, 0, 31),
        geslotenOp: new Date(2026, 1, 1), label: 'Jan 2026',
      }],
    });
    const ss = { getSheetByName: (n) => (n === 'Journaalposten' ? sheetOf([new Array(19).fill('h'), ...jpRows]) : null) };
    return ctx._bewijs_I8_afgeslotenPeriode_(ss);
  }

  test('boeking met datum in gesloten periode + aangemaakt NA sluiting → schending', () => {
    const res = run([jpRij({ datum: new Date(2026, 0, 15), aangemaaktOp: new Date(2026, 1, 15) })]);
    expect(res.geldig).toBe(false);
    expect(res.tegenvoorbeeld.length).toBeGreaterThan(0);
  });

  test('boeking aangemaakt VÓÓR sluiting → geen schending (geen vals alarm)', () => {
    const res = run([jpRij({ datum: new Date(2026, 0, 15), aangemaaktOp: new Date(2026, 0, 20) })]);
    expect(res.geldig).toBe(true);
  });
});

describe('F-GC-341 — betalings-integriteit matcht op referentie ([11]), niet BTW% ([9])', () => {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'GezondheidCheck.gs']);
  const BETAALD = 'Betaald';  // FACTUUR_STATUS.BETAALD (const niet als ctx-prop zichtbaar)

  function run(jpRows, vfRows) {
    const ss = {
      getSheetByName: (n) => {
        if (n === 'Journaalposten') return sheetOf([new Array(19).fill('h'), ...jpRows]);
        if (n === 'Verkoopfacturen') return sheetOf([new Array(23).fill('h'), ...vfRows]);
        return null;
      },
    };
    return ctx.controleerBetalingsIntegriteit_(ss);
  }

  test('BETAALD-factuur mét gekoppelde 1200→1100-boeking (ref=factuurnr) → OK', () => {
    const res = run(
      [jpRij({ debet: '1200', credit: '1100', referentie: 'F0001' })],
      [vfRij({ factuurnummer: 'F0001', status: BETAALD })],
    );
    expect(res.status).toBe('OK');  // oude code (ref←[9]=BTW%) gaf hier FOUT
  });

  test('BETAALD-factuur ZONDER gekoppelde boeking → FOUT (echte detectie werkt nog)', () => {
    const res = run(
      [jpRij({ debet: '7000', credit: '1100', referentie: 'IETS-ANDERS' })],
      [vfRij({ factuurnummer: 'F0002', status: BETAALD })],
    );
    expect(res.status).toBe('FOUT');
    expect(res.bericht).toContain('F0002');
  });
});

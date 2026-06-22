/**
 * tests/unit/f-acc-331-factuurnummer-gat.test.js
 *
 * RATEL (F-ACC-331, accountant-as): uniciteit + monotonie van factuurnummers
 * dekken GEEN gat na een achteraf verwijderde rij. _detecteerFactuurnummerGaten_
 * vindt ontbrekende nummers in een dichte reeks zodat een controleur-vraag
 * ("waarom ontbreekt 045?") een signaal krijgt — zonder vals alarm op een
 * ander (dun) nummerschema.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/GezondheidCheck.gs'), 'utf8');
const start = src.indexOf('function _detecteerFactuurnummerGaten_');
const eind = src.indexOf('\nfunction ', start + 1);
const fnSrc = src.slice(start, eind);
const detecteer = (new Function(fnSrc + '\n;return _detecteerFactuurnummerGaten_;'))();

function set(arr) { const o = {}; arr.forEach((x) => { o[x] = true; }); return o; }

describe('F-ACC-331 — factuurnummer-gat-detectie', () => {
  test('dichte reeks met één gat → meldt het ontbrekende nummer', () => {
    const gaten = detecteer(set(['F000044', 'F000045', 'F000046', 'F000048']));
    expect(gaten).toContain('F000047');
    expect(gaten).toHaveLength(1);
  });

  test('volledig aaneengesloten reeks → geen gaten', () => {
    expect(detecteer(set(['F000001', 'F000002', 'F000003', 'F000004']))).toEqual([]);
  });

  test('te weinig nummers (<3) → geen uitspraak (geen vals alarm)', () => {
    expect(detecteer(set(['F000044', 'F000046']))).toEqual([]);
  });

  test('dun/ander nummerschema (sprongen) → géén vals alarm', () => {
    expect(detecteer(set(['F000001', 'F005000', 'F009000']))).toEqual([]);
  });

  test('verschillende reeksen (F + CN) vervuilen elkaar niet', () => {
    // F-reeks dicht met gat F2; CN-reeks aaneengesloten.
    const gaten = detecteer(set(['F001', 'F003', 'F004', 'CN01', 'CN02', 'CN03']));
    expect(gaten).toEqual(['F002']);
  });

  test('behoudt zero-padding in de gerapporteerde gaten', () => {
    const gaten = detecteer(set(['INV0010', 'INV0011', 'INV0013']));
    expect(gaten).toContain('INV0012');
  });
});

/**
 * tests/unit/relatie-email-map.test.js
 *
 * bouwRelatieEmailMap_ verving haalRelatieEmail_, dat de hele RELATIES-sheet
 * OPNIEUW las per factuur in de dagelijkse aanmaningen-loop (N×M sheet-reads
 * → 6-min-timeoutrisico bij groei). Nu: één keer lezen, in-memory lookups.
 *
 * Test borgt (a) gedrag-equivalentie met de oude lineaire zoekfunctie en
 * (b) dat de RELATIES-sheet PRECIES ÉÉN keer wordt gelezen — de hele reden
 * voor de refactor.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const TRIGGERS_GS = path.resolve(__dirname, '../../src/Triggers.gs');

function maakRuntime(relatieRows) {
  let getDataRangeCalls = 0;
  const headers = ['ID', 'Naam', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'Email'];
  const allRows = [headers].concat(relatieRows);
  const relatieSheet = {
    getDataRange: () => { getDataRangeCalls++; return { getValues: () => allRows }; },
  };
  const ss = { getSheetByName: (naam) => (naam === 'Relaties' ? relatieSheet : null) };

  const ctx = createGasRuntime([TRIGGERS_GS], {
    SHEETS: { RELATIES: 'Relaties' },
    SpreadsheetApp: {},
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
  });
  return { ctx, ss, getCalls: () => getDataRangeCalls };
}

describe('bouwRelatieEmailMap_ — read-once relatie-email lookup', () => {
  test('mapt id → e-mail uit kolom 10', () => {
    const { ctx, ss } = maakRuntime([
      ['R001', 'Klant A', '', '', '', '', '', '', '', '', 'a@klant.nl'],
      ['R002', 'Klant B', '', '', '', '', '', '', '', '', 'b@klant.nl'],
    ]);
    const map = ctx.bouwRelatieEmailMap_(ss);
    expect(map['R001']).toBe('a@klant.nl');
    expect(map['R002']).toBe('b@klant.nl');
  });

  test('eerste match wint bij dubbele id (gelijk aan oude lineaire zoek)', () => {
    const { ctx, ss } = maakRuntime([
      ['R001', 'Eerste', '', '', '', '', '', '', '', '', 'eerste@x.nl'],
      ['R001', 'Tweede', '', '', '', '', '', '', '', '', 'tweede@x.nl'],
    ]);
    const map = ctx.bouwRelatieEmailMap_(ss);
    expect(map['R001']).toBe('eerste@x.nl');
  });

  test('onbekende id → undefined (caller doet `|| null`)', () => {
    const { ctx, ss } = maakRuntime([
      ['R001', 'Klant A', '', '', '', '', '', '', '', '', 'a@klant.nl'],
    ]);
    const map = ctx.bouwRelatieEmailMap_(ss);
    expect(map['ONBEKEND']).toBeUndefined();
  });

  test('leest de RELATIES-sheet PRECIES ÉÉN keer (de reden voor de refactor)', () => {
    const { ctx, ss, getCalls } = maakRuntime([
      ['R001', 'Klant A', '', '', '', '', '', '', '', '', 'a@klant.nl'],
      ['R002', 'Klant B', '', '', '', '', '', '', '', '', 'b@klant.nl'],
    ]);
    ctx.bouwRelatieEmailMap_(ss);
    expect(getCalls()).toBe(1);
  });

  test('ontbrekend RELATIES-blad → lege map, geen crash', () => {
    const { ctx } = maakRuntime([]);
    const leegSs = { getSheetByName: () => null };
    expect(ctx.bouwRelatieEmailMap_(leegSs)).toEqual({});
  });
});

/**
 * tests/unit/parsedatumstrict-kalender-validatie.test.js
 *
 * Regressie uit de ultieme-stresstest (BROKEN-bevinding A4): parseDatumStrict_
 * accepteerde een ONMOGELIJKE kalenderdatum (29-02-2027) omdat het op parseDatum_
 * leunde, dat zo'n datum STIL terugrolt naar vandaag i.p.v. te falen. Gevolg: een
 * ingetikte spookdatum kon de BTW-aangifteperiode ongemerkt verschuiven (Q1→Q2).
 * De strikte variant moet nu zelf de kalender valideren en gooien.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');
const UTILS_GS  = path.resolve(__dirname, '../../src/Utils.gs');

function maakCtx() {
  return createGasRuntime([CONFIG_GS, UTILS_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
  });
}

describe('parseDatumStrict_ weigert onmogelijke kalenderdatums', () => {
  const ctx = maakCtx();

  test('29-02-2027 (geen schrikkeljaar) → gooit, rolt NIET stil door', () => {
    expect(() => ctx.parseDatumStrict_('29-02-2027', 'Datum')).toThrow(/kalenderdatum|dag\/maand/i);
  });

  test('31-04-2026 (april heeft 30 dagen) → gooit', () => {
    expect(() => ctx.parseDatumStrict_('31-04-2026', 'Datum')).toThrow();
  });

  test('dag 0 en maand 13 → gooit', () => {
    expect(() => ctx.parseDatumStrict_('00-01-2026', 'Datum')).toThrow();
    expect(() => ctx.parseDatumStrict_('15-13-2026', 'Datum')).toThrow();
  });

  test('ISO met onmogelijke dag 2026-02-31 → gooit', () => {
    expect(() => ctx.parseDatumStrict_('2026-02-31', 'Datum')).toThrow();
  });

  test('geldige schrikkeldag 29-02-2028 → geaccepteerd op de juiste datum', () => {
    const d = ctx.parseDatumStrict_('29-02-2028', 'Datum');
    expect(d.getFullYear()).toBe(2028);
    expect(d.getMonth()).toBe(1);   // februari (0-based)
    expect(d.getDate()).toBe(29);
  });

  test('normale dd-mm-jjjj en ISO blijven gewoon werken', () => {
    expect(ctx.parseDatumStrict_('15-04-2026').getDate()).toBe(15);
    const iso = ctx.parseDatumStrict_('2026-04-15');
    expect(iso.getMonth()).toBe(3);
    expect(iso.getDate()).toBe(15);
  });

  test('leeg of onherkenbaar → gooit met duidelijke melding', () => {
    expect(() => ctx.parseDatumStrict_('', 'Factuurdatum')).toThrow(/leeg/i);
    expect(() => ctx.parseDatumStrict_('geen-datum', 'Datum')).toThrow();
  });
});

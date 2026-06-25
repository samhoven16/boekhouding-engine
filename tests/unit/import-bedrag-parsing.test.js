/**
 * tests/unit/import-bedrag-parsing.test.js
 *
 * Product-audit (bank/import-pionier): parseBankBedrag_ las een NL-bedrag ZONDER
 * komma (duizend-punt) als decimaal → "1.500" werd €1,50 i.p.v. €1.500 (1000×
 * fout op bankafschriften). De oude lokale parser viel bij ontbrekende komma terug
 * op "punt = decimaal". Nu delegeert hij naar de canonieke _parseBedragKern_.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG = path.resolve(__dirname, '../../src/Config.gs');
const UTILS = path.resolve(__dirname, '../../src/Utils.gs');
const BANKIMPORT = path.resolve(__dirname, '../../src/BankImport.gs');

function ctx() {
  return createGasRuntime([CONFIG, UTILS, BANKIMPORT], {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  });
}

describe('parseBankBedrag_ — NL duizend-punt zonder komma', () => {
  const c = ctx();
  const cases = [
    ['1.500', 1500],
    ['-1.500', -1500],
    ['1.000.000', 1000000],
    ['12.345.678', 12345678],
    ['1.234,56', 1234.56],   // NL met decimalen
    ['1234.56', 1234.56],    // US
    ['-1234,56', -1234.56],
    ['€ 1.500', 1500],
    ['"-2.000"', -2000],     // geciteerd CSV-veld
    ['', 0],
    ['onleesbaar', 0],
  ];
  cases.forEach(function(pair) {
    test('"' + pair[0] + '" → ' + pair[1], () => {
      expect(c.parseBankBedrag_(pair[0])).toBeCloseTo(pair[1], 2);
    });
  });
});

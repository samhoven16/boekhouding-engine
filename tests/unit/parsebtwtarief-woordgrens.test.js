/**
 * tests/unit/parsebtwtarief-woordgrens.test.js
 *
 * Product-audit (utils-pionier): parseBtwTarief_ gebruikte l.includes('9%'), dat
 * '19%'/'29%' als 9% matchte, en includes('0%') matchte '10%'/'20%' als 0%. Bij
 * import van een afwijkend label (Moneybird/bank/EU) -> verkeerde BTW-rubriek in
 * de aangifte. Nu met woordgrens (\b).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG = path.resolve(__dirname, '../../src/Config.gs');
const UTILS = path.resolve(__dirname, '../../src/Utils.gs');
const BTW = path.resolve(__dirname, '../../src/BTW.gs');

function ctx() {
  return createGasRuntime([CONFIG, UTILS, BTW], {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  });
}

describe('parseBtwTarief_ — woordgrens voorkomt substring-mismatch', () => {
  const c = ctx();
  test('échte labels blijven correct', () => {
    expect(c.parseBtwTarief_('21% (hoog)')).toBe(0.21);
    expect(c.parseBtwTarief_('9% (laag)')).toBe(0.09);
    expect(c.parseBtwTarief_('0% (nultarief)')).toBe(0.00);
    expect(c.parseBtwTarief_('Vrijgesteld')).toBeNull();
    expect(c.parseBtwTarief_('Verlegd')).toBeNull();
  });
  test('afwijkende labels matchen NIET meer fout', () => {
    expect(c.parseBtwTarief_('19%')).not.toBe(0.09);   // was 0.09
    expect(c.parseBtwTarief_('29%')).not.toBe(0.09);   // was 0.09
    expect(c.parseBtwTarief_('10%')).not.toBe(0.00);   // was 0.00
    expect(c.parseBtwTarief_('20%')).not.toBe(0.00);   // was 0.00
  });
});

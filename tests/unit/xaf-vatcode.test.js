/**
 * tests/unit/xaf-vatcode.test.js
 *
 * #2 — XAF 3.2 vatCode per transactieregel. De accountant/Belastingdienst
 * crosschecken r1a/r1b/r5b via de BTW-code per regel in het auditfile.
 * Structuur tegen de officiële XSD (zie docs/xaf-vatcode-buildspec.md):
 *   <vat> binnen <trLine> ná amntTp; <vatCodes> in <company> ná generalLedger.
 *
 * NB: dit borgt het CODE-PATROON. Volledige schema-validatie tegen een echte
 * XAF-parser is de pre-deploy-stap (zie de caveat in de PR).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const xaf = fs.readFileSync(path.resolve(__dirname, '../../src/XafExport.gs'), 'utf8');

describe('XAF vatCode (#2)', () => {
  test('<vat>-blok bevat de 4 verplichte velden', () => {
    expect(xaf).toMatch(/<vat>/);
    expect(xaf).toMatch(/<vatID>/);
    expect(xaf).toMatch(/<vatPerc>/);
    expect(xaf).toMatch(/<vatAmnt>/);
    expect(xaf).toMatch(/<vatAmntTp>/);
  });

  test('vat-blok wordt aan de trLine toegevoegd (ná amntTp)', () => {
    expect(xaf).toMatch(/<amntTp>D<\/amntTp>/);
    expect(xaf).toMatch(/tx \+= _vatXml;/);
  });

  test('vatAmntTp-richting uit dagboek: inkoop=D (input), overig=C (output)', () => {
    expect(xaf).toMatch(/klassificatie\.id === 'I'[\s\S]{0,20}\? 'D' : 'C'/);
  });

  test('<vatCodes>-header staat ná generalLedger en vóór de transactions-sectie', () => {
    const vc = xaf.indexOf('<vatCodes>');
    const gl = xaf.indexOf('<generalLedger>');
    const tx = xaf.indexOf("xml += '    <transactions>");
    expect(vc).toBeGreaterThan(-1);
    expect(vc).toBeGreaterThan(gl);
    expect(vc).toBeLessThan(tx);
  });

  test('keyref: de gebruikte vatIDs (21/9) zijn gedefinieerd in <vatCodes>', () => {
    expect(xaf).toMatch(/<vatCode><vatID>21<\/vatID>/);
    expect(xaf).toMatch(/<vatCode><vatID>9<\/vatID>/);
    // vat-blok-vatID = Math.round(tarief*100) → "21"/"9", matcht de header-codes
    expect(xaf).toMatch(/String\(Math\.round\(_btwTarief \* 100\)\)/);
  });

  test('verlegd/vrijgesteld (tarief null) of 0-bedrag → géén vat-blok', () => {
    expect(xaf).toMatch(/_btwTarief !== null && _btwBedrag > 0/);
  });
});

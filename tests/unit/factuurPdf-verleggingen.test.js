/**
 * tests/unit/factuurPdf-verleggingen.test.js
 *
 * Regressietest: factuur-PDF moet de wettelijk verplichte verleggings-
 * verklaring bevatten zodra BTW-tarief = "Verlegd" (B2B-EU).
 *
 * Zonder deze tekst (art. 12 lid 3 Wet OB / art. 196 EU 2006/112) kan
 * Belastingdienst herziening eisen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VF_SRC = fs.readFileSync(
  path.join(__dirname, '../../src/Verkoopfacturen.gs'),
  'utf8'
);

describe('Verkoopfacturen.gs — verleggings-verklaring op factuur-PDF', () => {

  test('isVerlegd-detectie via /Verlegd/i regex aanwezig', () => {
    expect(VF_SRC).toMatch(/isVerlegd\s*=\s*\/Verlegd\/i\.test\(btwTariefStr\)/);
  });

  test('verleggingsVerklaring HTML wordt opgebouwd voor isVerlegd', () => {
    expect(VF_SRC).toMatch(/const verleggingsVerklaring\s*=\s*isVerlegd/);
  });

  test('bevat wettelijke verwijzing art. 12 lid 3 Wet OB 1968', () => {
    expect(VF_SRC).toMatch(/art\.\s*12\s*lid\s*3\s*Wet OB\s*1968/);
  });

  test('bevat verwijzing naar EU-richtlijn 2006/112/EG art. 196', () => {
    expect(VF_SRC).toMatch(/art\.\s*196\s*EU-richtlijn\s*2006\/112\/EG/);
  });

  test('bevat klant-vriendelijke "BTW verlegd" header in PDF-block', () => {
    expect(VF_SRC).toMatch(/<strong>BTW verlegd<\/strong>/);
  });

  test('verleggingsVerklaring wordt geïnjecteerd in HTML-template ná korVerklaring', () => {
    expect(VF_SRC).toMatch(/\$\{korVerklaring\}\s*\n\s*\$\{verleggingsVerklaring\}/);
  });

  test('niet-verlegd factuur krijgt lege string (geen verklaring zichtbaar)', () => {
    // De ternary moet ': \'\'' eindigen voor niet-verlegd
    expect(VF_SRC).toMatch(/verleggingsVerklaring[^=]*=\s*isVerlegd[\s\S]*?:\s*''/);
  });
});

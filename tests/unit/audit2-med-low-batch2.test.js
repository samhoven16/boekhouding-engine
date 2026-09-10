/**
 * tests/unit/audit2-med-low-batch2.test.js
 *
 * Ronde 2 MED/LOW batch 2 (4 fixes):
 *
 *   1. TARIEF_VEROUDERD UI-banner in Belastingadvies-tab (documentatie MED)
 *   2. ICP r3b detect-logica via EU-buiten-NL BTW-nummer (tax MED)
 *   3. Periode "3 stappen" pre-aankondiging (customer-voice LOW)
 *   4. Top-3 ontbrekende FAQ-items op homepage (documentatie LOW × 3)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const bel = fs.readFileSync(path.join(ROOT, 'src/Belastingadvies.gs'), 'utf8');
const btw = fs.readFileSync(path.join(ROOT, 'src/BTW.gs'), 'utf8');
const boek = fs.readFileSync(path.join(ROOT, 'src/Boekingen.gs'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');

describe('Fix #1 — TARIEF_VEROUDERD UI banner', () => {
  test('genereerBelastingadvies rendert banner als advies.BELASTING_meta.tariefVerouderd', () => {
    expect(bel).toMatch(/advies\.BELASTING_meta && advies\.BELASTING_meta\.tariefVerouderd/);
  });

  test('Banner-tekst noemt jaar + bron + Belastingdienst.nl-controle', () => {
    // Anchor op de banner setValue-tekst zelf
    const start = bel.indexOf('⚠️ Tarieven gebruikt voor');
    expect(start).toBeGreaterThan(-1);
    const blok = bel.slice(start, start + 500);
    expect(blok).toMatch(/Tarieven gebruikt voor/);
    expect(blok).toMatch(/Belastingdienst\.nl/);
  });

  test('Banner-styling rood (#FEE2E2 + #7F1D1D) voor zichtbaarheid', () => {
    const start = bel.indexOf('⚠️ Tarieven gebruikt voor');
    const blok = bel.slice(start, start + 800);
    expect(blok).toMatch(/#FEE2E2/);
    expect(blok).toMatch(/#7F1D1D/);
  });

  test('_berekenBelastingadviesRaw_ retourneert BELASTING_meta met flags', () => {
    expect(bel).toMatch(/BELASTING_meta:\s*\{[\s\S]*?tariefVerouderd: !!BELASTING\.TARIEF_VEROUDERD/);
    expect(bel).toMatch(/tariefBron: BELASTING\.TARIEF_BRON/);
    expect(bel).toMatch(/tariefFallbackJaar: BELASTING\.TARIEF_FALLBACK_JAAR/);
  });
});

describe('Fix #2 — ICP r3b detect-logica', () => {
  test('_isEuBuitenNlBtwNr_ helper bestaat met 26 EU-landen', () => {
    expect(btw).toMatch(/function _isEuBuitenNlBtwNr_/);
    expect(btw).toMatch(/_EU_LANDEN_BTW_PREFIX/);
  });

  test('EU-prefix-lijst bevat alle 26 niet-NL EU landen', () => {
    const expected = ['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','EL','HR','HU','IE','IT','LT','LU','LV','MT','PL','PT','RO','SE','SI','SK'];
    expected.forEach(function(code) {
      expect(btw).toMatch(new RegExp("'" + code + "'"));
    });
  });

  test('Helper retourneert false voor NL prefix (binnenlands)', () => {
    const start = btw.indexOf('function _isEuBuitenNlBtwNr_');
    const eind = btw.indexOf('\nfunction ', start + 1);
    const blok = btw.slice(start, eind);
    expect(blok).toMatch(/if \(prefix === ['"]NL['"]\) return false/);
  });

  test('Helper trimt whitespace + uppercase normalisatie', () => {
    const start = btw.indexOf('function _isEuBuitenNlBtwNr_');
    const eind = btw.indexOf('\nfunction ', start + 1);
    const blok = btw.slice(start, eind);
    expect(blok).toMatch(/replace\(\/\\s\/g, ['"]['"]\)\.toUpperCase\(\)/);
  });

  test('Helper rejecteert te korte BTW-nrs (anti-misclassificatie)', () => {
    const start = btw.indexOf('function _isEuBuitenNlBtwNr_');
    const eind = btw.indexOf('\nfunction ', start + 1);
    const blok = btw.slice(start, eind);
    expect(blok).toMatch(/s\.length < 4/);
  });

  test('berekenBtwAangifte_ detecteert ICP in 0%/nultarief-tak', () => {
    const start = btw.indexOf('btwLabel.includes(\'0%\')');
    const blok = btw.slice(start, start + 1500);
    expect(blok).toMatch(/_isEuBuitenNlBtwNr_\(btwNrKlant\)/);
    expect(blok).toMatch(/aangifte\.r3a_grondslag \+= grondslag/);
  });

  test('ICP-detect logt _icpVereist-array met factuur-details', () => {
    const start = btw.indexOf('btwLabel.includes(\'0%\')');
    const blok = btw.slice(start, start + 1500);
    expect(blok).toMatch(/aangifte\._icpVereist = aangifte\._icpVereist \|\| \[\]/);
    expect(blok).toMatch(/factuurnummer:/);
    expect(blok).toMatch(/klantnaam:/);
    expect(blok).toMatch(/btwNr:/);
    expect(blok).toMatch(/grondslag:/);
  });

  test('Commentaar verwijst naar art. 37a Wet OB', () => {
    const start = btw.indexOf('btwLabel.includes(\'0%\')');
    const blok = btw.slice(start, start + 1500);
    expect(blok).toMatch(/art\. 37a Wet OB/);
    expect(blok).toMatch(/naheffing/i);
  });
});

describe('Fix #3 — Periode-ontgrendel pre-aankondiging', () => {
  test('Intro-dialog bestaat vóór stap 1', () => {
    const start = boek.indexOf('function beheerGeslotenPeriodes');
    const eind = boek.indexOf('\nfunction ', start + 1);
    const blok = boek.slice(start, eind);
    // Anchor op de UI-prompt-string (niet de comment-mention)
    const idxIntro = blok.indexOf("'⚠️ Periode ontgrendelen — uitleg'");
    const idxStap1 = blok.indexOf("'⚠️ Periode ontgrendelen — stap 1 van 3'");
    expect(idxIntro).toBeGreaterThan(-1);
    expect(idxStap1).toBeGreaterThan(-1);
    expect(idxIntro).toBeLessThan(idxStap1);
  });

  test('Intro noemt "3 bevestigingen" met stappen-overzicht', () => {
    const start = boek.indexOf('Periode ontgrendelen — uitleg');
    const blok = boek.slice(start, start + 800);
    expect(blok).toMatch(/3 bevestigingen/);
    expect(blok).toMatch(/intent-check/);
    expect(blok).toMatch(/motivatie/);
    expect(blok).toMatch(/audit-trail/);
  });

  test('Cancel op intro = vroege return (geen ontgrendeling)', () => {
    const start = boek.indexOf('Periode ontgrendelen — uitleg');
    const blok = boek.slice(start, start + 800);
    expect(blok).toMatch(/introOk !== ui\.Button\.YES\) return/);
  });

  test('Verwijst naar art. 52 AWR in intro (consistent met motivatie-prompt)', () => {
    const start = boek.indexOf('Periode ontgrendelen — uitleg');
    const blok = boek.slice(start, start + 800);
    expect(blok).toMatch(/art\. 52 AWR/);
  });
});

describe('Fix #4 — Top-3 ontbrekende FAQ-items', () => {
  test('FAQ "balans-klopt-niet" toegevoegd', () => {
    expect(home).toMatch(/<details id="balans-klopt-niet">/);
    expect(home).toMatch(/Mijn balans klopt niet/);
    expect(home).toMatch(/Top-5 oorzaken/);
  });

  test('FAQ "balans" noemt Gezondheidscheck als troubleshoot-pad', () => {
    const start = home.indexOf('id="balans-klopt-niet"');
    const blok = home.slice(start, start + 3000);
    // F-OND-330: het echte menu-item heet "Gezondheidscheck uitvoeren"
    // (onder Controle & Export), niet "… administratie".
    expect(blok).toMatch(/Gezondheidscheck uitvoeren/);
  });

  test('FAQ "boeking-corrigeren" toegevoegd met 3 scenarios', () => {
    expect(home).toMatch(/<details id="boeking-corrigeren">/);
    const start = home.indexOf('id="boeking-corrigeren"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/credit-nota/);
    // A-352: verwijst naar de ECHTE route (Geavanceerd → Journaalpost storneren),
    // niet meer naar de niet-bestaande "rechtsklik → Storneren".
    expect(blok).toMatch(/Journaalpost storneren/i);
    expect(blok).not.toMatch(/rechtsklik/i);
    expect(blok).toMatch(/Periode ontgrendelen/);
  });

  test('FAQ "boeking-corrigeren" verwijst naar art. 35a Wet OB (factuur niet wissen)', () => {
    const start = home.indexOf('id="boeking-corrigeren"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/art\. 35a Wet OB/);
  });

  test('FAQ "extra-kosten" toegevoegd met expliciete kosten-uitleg', () => {
    expect(home).toMatch(/<details id="extra-kosten">/);
    const start = home.indexOf('id="extra-kosten"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/Mollie/);
    expect(blok).toMatch(/Gemini AI/);
    expect(blok).toMatch(/Google Workspace/);
  });

  test('FAQ "extra-kosten" benadrukt "€49 = eenmalig" (anti-verrassing)', () => {
    const start = home.indexOf('id="extra-kosten"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/€49 = eenmalig/);
    expect(blok).toMatch(/geen abonnement/);
    expect(blok).toMatch(/Boekhoudbaar betaalt NOOIT/);
  });

  test('FAQ "extra-kosten" linkt naar /transparantie/', () => {
    const start = home.indexOf('id="extra-kosten"');
    const blok = home.slice(start, start + 2000);
    expect(blok).toMatch(/href="\/transparantie\/"/);
  });
});

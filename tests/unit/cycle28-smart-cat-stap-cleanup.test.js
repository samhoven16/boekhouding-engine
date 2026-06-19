/**
 * tests/unit/cycle28-smart-cat-stap-cleanup.test.js
 *
 * Cycle 28 — cycle 20 voegde herinneringsStap_<fnr> cleanup toe op:
 *   - Triggers.gs:koppelBankTransactieAanFactuur_ (bank-CSV-match)
 *   - Verkoopfacturen.gs:markeerVerkoopfactuurBetaald (menu)
 *
 * Maar SmartCategorisatie.gs:koppelTransactiesAanFacturenAutomatisch_
 * was over-het-hoofd gezien. Een factuur die via slimme-auto-koppeling
 * betaald wordt hield zijn herinneringsStap_-state → na crediteren +
 * rebillen onder zelfde nummer kreeg klant geen herinnering (ghost-state).
 *
 * Plus: ScriptProperty-accumulatie via deze derde write-pad.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 28: SmartCategorisatie auto-koppel cleanup', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/SmartCategorisatie.gs'), 'utf8');

  test('deleteProperty(herinneringsStap_) aanwezig op BETAALD-pad', () => {
    expect(src).toMatch(/deleteProperty\(['"]herinneringsStap_['"]\s*\+\s*String\(/);
  });

  test('Cleanup zit BINNEN if (nieuwStatus === FACTUUR_STATUS.BETAALD) block', () => {
    const idx = src.indexOf('if (nieuwStatus === FACTUUR_STATUS.BETAALD)');
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/deleteProperty\(['"]herinneringsStap_/);
  });

  test('Cleanup is in try/catch (best-effort)', () => {
    const idx = src.indexOf("deleteProperty('herinneringsStap_'");
    const omgeving = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(omgeving).toMatch(/try\s*\{[\s\S]*deleteProperty\(['"]herinneringsStap_/);
    expect(omgeving).toMatch(/\}\s*catch\s*\(_\)\s*\{\s*\}/);
  });

  test('Cleanup gebruikt vfData[gevondenFactuurRij] factuurnr-kolom', () => {
    // migratie-agnostisch: literal [1] óf KOL.VF.factuurnummer (klasse-1).
    expect(src).toMatch(/deleteProperty\([\s\S]{0,80}vfData\[gevondenFactuurRij\]\[(?:1|KOL\.VF\.factuurnummer)\]/);
  });

  test('DEELS_BETAALD-pad doet GEEN cleanup (alleen op volledig betaald)', () => {
    // Zoek if-block voor DEELS_BETAALD context — cleanup mag daar niet
    // staan want dunning kan nog relevant zijn na partial-pay
    const fout = src.match(/nieuwStatus === FACTUUR_STATUS\.DEELS_BETAALD[\s\S]{0,200}deleteProperty\(['"]herinneringsStap_/);
    expect(fout).toBeNull();
  });
});

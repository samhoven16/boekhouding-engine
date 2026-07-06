/**
 * tests/unit/kol-header-consistency.test.js
 *
 * DANGER-ZONE-RATEL (CLAUDE.md): "Sheet column indices — off-by-one silently
 * corrupts all data rows." De KOL-accessors (SheetKolom.gs) zijn de enige bron
 * van waarheid voor kolom-posities; de headers die Setup.gs (+ enkele modules)
 * schrijven MOETEN exact even breed zijn. Wijkt iemand één van beide af, dan
 * schrijft/leest de code stil naast de juiste kolom.
 *
 * Deze ratel dwingt per tab af: aantal KOL-velden === aantal header-kolommen,
 * EN dat de KOL-indices een gesloten reeks 0..n-1 vormen (geen gaten/dubbel).
 * Mechanisch (source-parse) zodat hij niet kan vals-groenen via een runtime-mock.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const lees = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// Tel string-literals binnen een [ ... ]-blok — trailing-comma-veilig
// (een afsluitende komma telt NIET als extra kolom).
function telHeaderKolommen(arrayBron) {
  const lits = arrayBron.match(/'[^']*'|"[^"]*"/g) || [];
  return lits.length;
}

// Haal de KOL.<KEY>-secties op met hun veld-indices.
function leesKolSecties() {
  const bron = lees('SheetKolom.gs');
  const secties = {};
  const re = /([A-Z_]+):\s*Object\.freeze\(\{([\s\S]*?)\}\)/g;
  let m;
  while ((m = re.exec(bron))) {
    const velden = [...m[2].matchAll(/([A-Za-z0-9_]+):\s*(\d+)/g)].map((x) => +x[2]);
    if (velden.length) secties[m[1]] = velden;
  }
  return secties;
}

// Haal een `const headers = [...]`-array uit een specifieke setter-functie.
function leesHeaderArray(bestand, functieNaam) {
  const bron = lees(bestand);
  const fnIdx = bron.indexOf('function ' + functieNaam);
  if (fnIdx < 0) return null;
  const rest = bron.slice(fnIdx);
  // eerste `[ ... ]` na een `headers`/`setValues([[`-anker binnen de functie
  const m = rest.match(/(?:headers\s*=\s*|setValues\(\[)\s*(\[[\s\S]*?\])/);
  return m ? m[1] : null;
}

const KOL = leesKolSecties();

// (KOL-key → {bestand, setter}) — de tab-headers staan grotendeels in Setup.gs,
// twee tabs worden door hun eigen module gezet.
const MAP = {
  VF: { bestand: 'Setup.gs', setter: 'zetVerkoopfacturenHeaders_' },
  IF: { bestand: 'Setup.gs', setter: 'zetInkoopfacturenHeaders_' },
  BT: { bestand: 'Setup.gs', setter: 'zetBanktransactiesHeaders_' },
  JP: { bestand: 'Setup.gs', setter: 'zetJournaalpostenHeaders_' },
  REL: { bestand: 'Setup.gs', setter: 'zetRelatiesHeaders_' },
  GB: { bestand: 'Setup.gs', setter: 'vulGrootboekschema_' },
  AUDIT: { bestand: 'Setup.gs', setter: 'setupAuditLogSheet_' },
  HK: { bestand: 'HerhalendeKosten.gs', setter: 'maakHerhalendeKostenTab_' },
  TAAK: { bestand: 'Triggers.gs', setter: '_updateTaakStatus_' },
};

describe('KOL ↔ header breedte-consistentie (off-by-one danger zone)', () => {
  test('elke KOL-sectie heeft een gesloten index-reeks 0..n-1 (geen gat/dubbel)', () => {
    const fout = [];
    Object.keys(KOL).forEach((k) => {
      const set = new Set(KOL[k]);
      const max = Math.max(...KOL[k]);
      if (set.size !== KOL[k].length) fout.push(`${k}: dubbele index`);
      else if (max !== KOL[k].length - 1) fout.push(`${k}: max=${max} maar ${KOL[k].length} velden (gat)`);
    });
    expect(fout).toEqual([]);
  });

  Object.keys(MAP).forEach((kolKey) => {
    test(`KOL.${kolKey} (${KOL[kolKey] ? KOL[kolKey].length : '?'}) === header-breedte in ${MAP[kolKey].setter}`, () => {
      expect(KOL[kolKey]).toBeDefined();
      const arr = leesHeaderArray(MAP[kolKey].bestand, MAP[kolKey].setter);
      expect(arr).not.toBeNull();           // setter moet vindbaar zijn (renamed → rood)
      const headerN = telHeaderKolommen(arr);
      expect(headerN).toBe(KOL[kolKey].length);
    });
  });
});

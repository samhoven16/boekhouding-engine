/**
 * tests/unit/contract-sheet-kolom.test.js
 *
 * CONTRACT-GUARD (klasse 1 — sheet-kolom-index). Dwingt af dat:
 *  (a) KOL (src/SheetKolom.gs) intern consistent is (geen dubbele/gaten);
 *  (b) KOL NOOIT uit `.claude/sheet-schemas.md` loopt op de kritieke velden
 *      (juist die welke fiscale/betaal-bugs gaven: BTW-nr, bedragen, status).
 * Wijzigt iemand een kolom in de code maar niet in het schema (of omgekeerd),
 * dan faalt CI — de "verkeerde kolom"-klasse kan niet stil terugkeren.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// KOL is een top-level const in SheetKolom.gs; de gas-runtime exposeert consts
// niet als ctx-property, dus evalueren we het bestand gecontroleerd en pakken KOL.
const kolSrc = fs.readFileSync(path.resolve(__dirname, '../../src/SheetKolom.gs'), 'utf8');
// eslint-disable-next-line no-new-func
const KOL = (new Function(kolSrc + '\n;return KOL;'))();
const schema = fs.readFileSync(path.resolve(__dirname, '../../.claude/sheet-schemas.md'), 'utf8');

// Parse een schema-blok ("## NAAM" … volgende "## ") naar { index: docNaam }.
function parseBlok(kop) {
  const start = schema.indexOf('## ' + kop);
  const eind = schema.indexOf('\n## ', start + 1);
  const blok = schema.slice(start, eind === -1 ? schema.length : eind);
  const map = {};
  blok.split('\n').forEach((regel) => {
    const m = regel.match(/^\[(\d+)\]\s{1,}(\S[^\n]*?)(?:\s{2,}|$)/);
    if (m) map[parseInt(m[1], 10)] = m[2].trim();
  });
  return map;
}

describe('CONTRACT — KOL is intern consistent', () => {
  function checkContig(obj, naam) {
    const idx = Object.values(obj).sort((a, b) => a - b);
    expect(new Set(idx).size).toBe(idx.length);              // geen duplicaten
    idx.forEach((v, i) => expect(v).toBe(i));                 // 0..N-1, geen gaten
  }
  test('VF: 0..22 zonder duplicaat/gat', () => checkContig(KOL.VF, 'VF'));
  test('IF: 0..19 zonder duplicaat/gat', () => checkContig(KOL.IF, 'IF'));
  test('JP: 0..18 zonder duplicaat/gat', () => checkContig(KOL.JP, 'JP'));
  test('GB: 0..5 zonder duplicaat/gat', () => checkContig(KOL.GB, 'GB'));
  test('BT: 0..14 zonder duplicaat/gat', () => checkContig(KOL.BT, 'BT'));
  test('REL: 0..18 zonder duplicaat/gat', () => checkContig(KOL.REL, 'REL'));
  test('HK: 0..11 zonder duplicaat/gat', () => checkContig(KOL.HK, 'HK'));
  test('INST: 0..1 zonder duplicaat/gat', () => checkContig(KOL.INST, 'INST'));
});

describe('CONTRACT — KOL ⇄ sheet-schemas.md (kritieke velden)', () => {
  const VF = parseBlok('VERKOOPFACTUREN');
  const IF = parseBlok('INKOOPFACTUREN');
  const JP = parseBlok('JOURNAALPOSTEN');
  const GB = parseBlok('GROOTBOEKSCHEMA');
  const BT = parseBlok('BANKTRANSACTIES');
  const REL = parseBlok('RELATIES');

  // [KOL-veld, sheet, doc-trefwoord(en) die op die index moeten staan]
  const KRITIEK = [
    [KOL.VF.factuurnummer, VF, /Factuurnummer/i],
    [KOL.VF.btwNrKlant, VF, /BTW-?nr/i],          // de F-TAX-130-bug zat hier
    [KOL.VF.kvkKlant, VF, /KvK/i],
    [KOL.VF.bedragExcl, VF, /excl/i],
    [KOL.VF.btwBedrag, VF, /BTW bedrag/i],
    [KOL.VF.bedragIncl, VF, /incl/i],             // de F-PAY-130-bug zat hier
    [KOL.VF.betaaldBedrag, VF, /Betaald bedrag/i],
    [KOL.VF.status, VF, /Status/i],
    [KOL.VF.aangemaaktOp, VF, /Aangemaakt op/i],  // [21] dat EUVerkoop foutief las
    [KOL.IF.factuurdatumLeverancier, IF, /Factuurdatum leverancier/i],
    [KOL.IF.bedragExcl, IF, /excl/i],
    [KOL.IF.btwBedrag, IF, /BTW bedrag/i],
    [KOL.IF.status, IF, /Status/i],
    [KOL.IF.bijlageUrl, IF, /Bijlage/i],
    [KOL.JP.bedrag, JP, /Bedrag/i],
    [KOL.JP.btwBedrag, JP, /BTW bedrag/i],
    [KOL.JP.debetRekening, JP, /Debet rekening/i],
    [KOL.JP.creditRekening, JP, /Credit rekening/i],
    [KOL.GB.balansWenv, GB, /Balans/i],
    [KOL.GB.saldo, GB, /Saldo/i],
    [KOL.BT.bedrag, BT, /Bedrag/i],
    [KOL.BT.status, BT, /Status/i],
    [KOL.REL.btwNummer, REL, /BTW-?nummer/i],
    [KOL.REL.email, REL, /Email/i],
    [KOL.REL.iban, REL, /IBAN/i],
  ];

  test('doc geparset (sanity)', () => {
    expect(Object.keys(VF).length).toBeGreaterThan(20);
    expect(Object.keys(IF).length).toBeGreaterThan(18);
  });

  KRITIEK.forEach(([index, docMap, patroon]) => {
    test(`index ${index} → doc "${docMap[index]}" matcht ${patroon}`, () => {
      expect(docMap[index]).toBeDefined();
      expect(docMap[index]).toMatch(patroon);
    });
  });
});

describe('CONTRACT — GEEN literal sheet-kolom-index (omgekeerde ban, hele src/)', () => {
  // OMGEKEERDE BAN: i.p.v. een opt-in lijst van gemigreerde bestanden eisen we
  // dat ÉLK `src/*.gs`-bestand schoon is — behalve een expliciete `LEGACY_TODO`.
  // Voordeel: een NIEUW bestand of nieuwe bare index in nog-niet-gemigreerde
  // code wordt direct gevangen; de default is "schoon", schuld is zichtbaar.
  //
  // We bannen de WORTEL-vorm van de klasse: `<rij>[<idx>][<getal>]` — een
  // tweede-dimensie-index als letterlijk getal, ongeacht variabelenaam of
  // lus-variabele. (Named accessor `data[i][KOL.VF.datum]` matcht NIET.)
  // Een regel met `kol-ban-ok` is een ECHTE niet-sheet 2D-array (bv. een
  // browser-API-resultaat) en telt niet mee.
  const LITERAL_KOLOM = /\]\s*\[\s*\d+\s*\]/g;
  const ALLOW = /kol-ban-ok/;
  const SRC_DIR = path.resolve(__dirname, '../../src');

  // Nog niet gemigreerd (bekende schuld). SELF-CLEANING: zodra een bestand
  // schoon is, faalt zijn LEGACY-test → haal het hier weg, dan valt het
  // automatisch onder de "moet schoon"-eis. Zo verschuift de teller alleen
  // de goede kant op en kan de lijst niet stilletjes verouderen.
  const LEGACY_TODO = new Set([
    'BoekingEngine.gs', 'DLQ.gs', 'DataPortability.gs', 'Diagnostiek.gs',
    'FormeelBewijs.gs', 'GezondheidCheck.gs', 'Invariants.gs',
    'Prive.gs', 'Setup.gs', 'SmartCategorisatie.gs',
    'Triggers.gs', 'Utils.gs',
  ]);

  function hitsIn(file) {
    const src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    return src.split('\n')
      .filter((l) => !ALLOW.test(l))
      .join('\n')
      .match(LITERAL_KOLOM) || [];
  }

  const alleGs = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.gs'));

  test('LEGACY_TODO bevat geen al-gemigreerd (of niet-bestaand) bestand', () => {
    LEGACY_TODO.forEach((f) => {
      expect(alleGs.includes(f)).toBe(true);
    });
  });

  alleGs.forEach((f) => {
    if (LEGACY_TODO.has(f)) {
      test(`LEGACY ${f}: heeft nog bare kolom-index (migreer → verwijder uit LEGACY_TODO)`, () => {
        expect(hitsIn(f).length).toBeGreaterThan(0);
      });
    } else {
      test(`${f}: geen literal [..][<getal>] sheet-kolom-index`, () => {
        expect(hitsIn(f)).toEqual([]);
      });
    }
  });
});

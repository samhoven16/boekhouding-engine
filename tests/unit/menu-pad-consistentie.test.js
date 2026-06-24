/**
 * tests/unit/menu-pad-consistentie.test.js
 *
 * KLASSE-SLUITER (F-OND-330 was één instance): elke menupad-verwijzing op de
 * website moet kloppen met het ECHTE menu in src/Menu.gs. Een klant die een
 * pad volgt dat niet bestaat, loopt vast zonder support — en die drift sloop er
 * stelselmatig in (verkeerde top-naam "Boekhouding", niet-bestaande submenu's,
 * verouderde item-namen). Deze test borgt de KLASSE, niet één geval.
 *
 * Regels:
 *   1. Het top-level menu heet altijd "Boekhoudbaar" (nooit "Boekhouding →").
 *   2. De laatste hop (het aangeklikte item) moet prefix-matchen op een echt
 *      menu-item of submenu uit Menu.gs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const menuSrc = fs.readFileSync(path.join(ROOT, 'src/Menu.gs'), 'utf8');

// ── Echt menu uit Menu.gs ──────────────────────────────────────────────
const norm = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/&gt;/g, '>')
  .toLowerCase()
  .replace(/[^a-z0-9& ]+/g, ' ')      // emoji/leestekens weg, & behouden
  .replace(/\s+/g, ' ').trim();

const itemLabels = [...menuSrc.matchAll(/addItem\('([^']+)'/g)].map((m) => norm(m[1]));
const submenuLabels = [...menuSrc.matchAll(/createMenu\('([^']+)'/g)].map((m) => norm(m[1]));
const echteLabels = [...new Set([...itemLabels, ...submenuLabels])].filter(Boolean);

// Een hop "resolvet" als de hop en een echt label elkaar bevatten (afkorting:
// "factuurlijst" ⊂ "factuurlijst openen versturen markeren"; "gemini api key" ⊂
// "eigen gemini api key …"). Niet-bestaande items ("gezondheidscheck
// administratie") matchen geen enkel label → worden gevlagd.
function resolvet(hop) {
  const h = norm(hop);
  if (!h || h.length < 3) return true;   // te kort/leeg → niet beoordelen
  return echteLabels.some((lbl) => lbl.includes(h) || h.includes(lbl));
}

// ── Verzamel menupad-verwijzingen uit de customer-facing website ────────
function websiteBestanden() {
  const out = [];
  (function loop(dir) {
    for (const naam of fs.readdirSync(dir)) {
      const p = path.join(dir, naam);
      const st = fs.statSync(p);
      if (st.isDirectory()) loop(p);
      else if (/\.(html|ics)$/.test(naam)) out.push(p);
    }
  })(path.join(ROOT, 'website'));
  return out;
}

// Hops stoppen bij zin-/clause-grenzen (. ) ( , ; : ") zodat trailing-proza niet
// in de leaf belandt.
const refRe = /(Boekhoudbaar|Boekhouding)(?: ?▾)?((?:\s*(?:→|&rarr;|-&gt;|&gt;)\s*[^<→\n.)(,;:"]{2,45})+)/g;
const splitRe = /\s*(?:→|&rarr;|-&gt;|&gt;)\s*/;

const verwijzingen = [];
for (const file of websiteBestanden()) {
  const txt = fs.readFileSync(file, 'utf8').replace(/&amp;/g, '&');  // "&amp;" → "&" zodat de ; de hop niet afkapt
  let m;
  while ((m = refRe.exec(txt)) !== null) {
    const top = m[1];
    const hops = m[2].split(splitRe).map((s) => s.trim()).filter(Boolean);
    verwijzingen.push({ file: path.relative(ROOT, file), top, leaf: hops[hops.length - 1], raw: (m[0] || '').slice(0, 70) });
  }
}

describe('menupad-consistentie — website ↔ Menu.gs (klasse-sluiter)', () => {
  test('Menu.gs is gelezen en bevat het echte menu', () => {
    expect(echteLabels.length).toBeGreaterThan(50);
    expect(echteLabels).toContain(norm('Nieuwe boeking — factuur, kosten of declaratie'));
  });

  test('er zijn menupad-verwijzingen op de website (anders is de regex stuk)', () => {
    expect(verwijzingen.length).toBeGreaterThan(5);
  });

  test('REGEL 1: elk menupad begint met "Boekhoudbaar" (nooit "Boekhouding")', () => {
    const fout = verwijzingen.filter((v) => v.top !== 'Boekhoudbaar')
      .map((v) => `${v.file}: "${v.raw}…"`);
    expect(fout).toEqual([]);
  });

  test('REGEL 2: de laatste hop matcht een echt menu-item/submenu', () => {
    const fout = verwijzingen.filter((v) => !resolvet(v.leaf))
      .map((v) => `${v.file}: leaf "${v.leaf}" (in "${v.raw}…")`);
    expect(fout).toEqual([]);
  });
});

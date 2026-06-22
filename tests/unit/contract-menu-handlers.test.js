/**
 * tests/unit/contract-menu-handlers.test.js
 *
 * CONTRACT-GUARD (sluit het mechanische, NIET-fuzzy deel van klasse 5 — "UI
 * belooft een niet-bestaande feature"). Elk menu-item `addItem('label',
 * 'handler')` belooft de gebruiker een actie; als `handler` niet bestaat is het
 * een dode knop (klikken → ScriptError → "deze functie bestaat niet"). Deze test
 * enumereert EXHAUSTIEF élke menu-handler in Menu.gs en dwingt af dat de functie
 * écht bestaat in src/. Exact (geen fuzzy copy-matching) → geen vals vertrouwen.
 *
 * Eerlijke grens (gedocumenteerd, bewust NIET via deze test): vrije-tekst
 * menupad-citaten ("Boekhoudbaar → X") en feature-claims in mail/website-copy
 * zijn heterogeen en niet zonder false-positives mechanisch te matchen — die
 * blijven gedekt door de negatieve guards (mega-audit-copy-fixes,
 * audit-ronde3-waarheid-claims, website-belofte-vs-code). De volledige sluiting
 * (menupaden + claims uit één bron genereren) is het geregistreerde structurele
 * werk in bug-class-register klasse 5.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

function gsBestanden() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).map((f) => path.join(SRC, f));
}

// Alle globaal-gedefinieerde functienamen over heel src/.
const functies = new Set();
gsBestanden().forEach((f) => {
  const txt = fs.readFileSync(f, 'utf8');
  [...txt.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\(/g)].forEach((m) => functies.add(m[1]));
});

// Alle menu-handlers (2e arg van addItem) uit Menu.gs.
const menuSrc = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');
const handlers = [...menuSrc.matchAll(/addItem\(\s*'[^']+'\s*,\s*'([a-zA-Z0-9_]+)'\s*\)/g)].map((m) => m[1]);

describe('CONTRACT — elk Boekhoudbaar-menu-item heeft een bestaande handler (klasse 5)', () => {
  test('menu-handlers + functie-definities geparsed (sanity)', () => {
    expect(handlers.length).toBeGreaterThan(50);
    expect(functies.size).toBeGreaterThan(200);
  });

  test('GEEN menu-item dat naar een niet-bestaande functie wijst (dode knop)', () => {
    const dood = handlers
      .filter((h) => !functies.has(h))
      .filter((v, i, a) => a.indexOf(v) === i);
    expect(dood).toEqual([]); // leeg = geen dode menu-knoppen
  });
});

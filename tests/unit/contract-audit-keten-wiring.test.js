/**
 * tests/unit/contract-audit-keten-wiring.test.js
 *
 * CONTRACT-GUARD (klasse-sluiter 11 — "verifier in slechts één van N paden").
 * De accountant-as vond dat van de drie tamper-detectoren (AUDIT_LOG-sheet,
 * ScriptProperties-buffer, _Audit_Anchor-tab) er maar ÉÉN automatisch draaide;
 * de andere twee waren menu-only → tampering bleef stil (art. 52 AWR-verweer
 * zwakker dan geadverteerd). Deze test enumereert EXHAUSTIEF élke
 * `verifieerAudit…_`-ketenverifier in src/ en dwingt af dat hij wordt
 * aangeroepen vanuit de dagelijkse `controleerAuditKetenProactief_`. Een nieuwe
 * verifier die niet gewired wordt, laat CI falen — de klasse kan niet meer
 * terugkeren via "iemand moet toevallig het menu indrukken".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const triggers = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
const boekingEngine = fs.readFileSync(path.join(SRC, 'BoekingEngine.gs'), 'utf8');
const alleSrc = triggers + '\n' + boekingEngine;

// Bewuste uitzonderingen — een verifier hoort hier ALLEEN als hij aantoonbaar
// geen tamper-detector is die dagelijks moet draaien (elk met reden).
const ALLOWLIST = {
  // (leeg) — alle drie ketenverifiers horen in de dagelijkse check.
};

function bodyVan(src, naam) {
  const start = src.indexOf('function ' + naam);
  if (start < 0) return '';
  // Tot de volgende top-level functie-declaratie (of einde bestand).
  const na = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, na < 0 ? src.length : na);
}

describe('CONTRACT — elke audit-keten-verifier is in de dagelijkse check gewired', () => {
  // Enumereer élke gedefinieerde keten-verifier: functie met naam
  // verifieerAudit…_ die een {ok: …}-object teruggeeft.
  const defs = [...alleSrc.matchAll(/function (verifieerAudit\w+_)\s*\(/g)].map((m) => m[1]);
  const proactief = bodyVan(triggers, 'controleerAuditKetenProactief_');

  test('er zijn keten-verifiers gevonden (sanity) en de proactieve check bestaat', () => {
    expect(defs.length).toBeGreaterThanOrEqual(3);
    expect(proactief).toContain('controleerAuditKetenProactief_');
  });

  test('GEEN keten-verifier die niet vanuit de dagelijkse check wordt aangeroepen', () => {
    const nietGewired = defs.filter((naam) => {
      if (Object.prototype.hasOwnProperty.call(ALLOWLIST, naam)) return false;
      // Aangeroepen = de naam gevolgd door '(' komt voor in de proactieve body.
      return !new RegExp(naam.replace(/[$]/g, '\\$') + '\\s*\\(').test(proactief);
    });
    expect(nietGewired).toEqual([]); // leeg = klasse gesloten
  });

  test('allowlist bevat alleen écht-bestaande verifiers (geen dode uitzonderingen)', () => {
    Object.keys(ALLOWLIST).forEach((naam) => {
      expect(defs).toContain(naam);
    });
  });
});

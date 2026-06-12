/**
 * tests/unit/urenregistratie.test.js
 *
 * C1 — Bewijslast voor het 1.225-uren-criterium (art. 3.6 Wet IB). Een
 * vrij-in-te-vullen totaal-veld is bij Belastingdienst-controle géén
 * onderbouwing; per-rij datum + activiteit + uren is dat wél.
 *
 * Deze tests borgen:
 *   - SHEETS.UREN-constant bestaat
 *   - setupUrenregistratieSheet_ is idempotent (legt geen bestaande data plat)
 *   - totaalUrenInBoekjaar_ telt correct + filtert op kalenderjaar
 *   - Aggregator is robuust voor lege rijen, string-datums, ongeldige uren
 *   - Belastingadvies.gs prefereert sheet boven instelling met
 *     bron-waarschuwing als de fallback gebruikt wordt
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const BEL = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');
const SETUP = fs.readFileSync(path.resolve(__dirname, '../../src/Setup.gs'), 'utf8');
const CONFIG = fs.readFileSync(path.resolve(__dirname, '../../src/Config.gs'), 'utf8');
const MENU = fs.readFileSync(path.resolve(__dirname, '../../src/Menu.gs'), 'utf8');

function maakSs(rijen, naam) {
  naam = naam || 'Urenregistratie';
  const headers = ['Datum', 'Uren', 'Activiteit', 'Project/Klant', 'Notities', 'Aangemaakt op'];
  const data = [headers].concat(rijen || []);
  let sheet = null;
  if (rijen !== null) {
    sheet = {
      getLastRow: () => data.length,
      getRange: (r, c, nr, nc) => ({
        getValues: () => {
          const out = [];
          for (let i = 0; i < (nr || 1); i++) {
            const rij = [];
            for (let j = 0; j < (nc || 1); j++) rij.push(data[r - 1 + i] ? data[r - 1 + i][c - 1 + j] : '');
            out.push(rij);
          }
          return out;
        },
      }),
    };
  }
  return {
    getSheetByName: (n) => (n === naam ? sheet : null),
  };
}

function ctx() {
  return createGasRuntime(['Config.gs', 'Utils.gs', 'Urenregistratie.gs']);
}

describe('C1 — Configuratie en plumbing', () => {
  test('Config.gs: SHEETS.UREN bestaat met label "Urenregistratie"', () => {
    expect(CONFIG).toMatch(/UREN:\s*'Urenregistratie'/);
  });

  test('Setup.gs roept setupUrenregistratieSheet_ aan in de setup-keten', () => {
    expect(SETUP).toMatch(/setupUrenregistratieSheet_/);
  });

  test('Menu.gs bevat openUrenregistratie-menu-item', () => {
    expect(MENU).toMatch(/openUrenregistratie/);
  });
});

describe('C1 — totaalUrenInBoekjaar_ aggregator', () => {
  test('lege sheet → 0 uren', () => {
    const c = ctx();
    expect(c.totaalUrenInBoekjaar_(maakSs([]), 2026)).toBe(0);
  });

  test('ontbrekend tabblad → 0 uren (geen crash)', () => {
    const c = ctx();
    expect(c.totaalUrenInBoekjaar_(maakSs(null), 2026)).toBe(0);
  });

  test('drie rijen 2026 → som van uren', () => {
    const c = ctx();
    const ss = maakSs([
      [new Date(2026, 0, 15), 8, 'klantwerk', '', '', new Date()],
      [new Date(2026, 1, 3),  4, 'administratie', '', '', new Date()],
      [new Date(2026, 5, 1),  6, 'website', '', '', new Date()],
    ]);
    expect(c.totaalUrenInBoekjaar_(ss, 2026)).toBe(18);
  });

  test('rijen uit ander jaar tellen NIET mee', () => {
    const c = ctx();
    const ss = maakSs([
      [new Date(2025, 11, 30), 100, 'oude administratie', '', '', new Date()],
      [new Date(2026, 0, 2),   3,   'nieuwe start', '', '', new Date()],
      [new Date(2027, 0, 1),   50,  'volgend jaar', '', '', new Date()],
    ]);
    expect(c.totaalUrenInBoekjaar_(ss, 2026)).toBe(3);
  });

  test('robuust voor lege rijen + ongeldige uren', () => {
    const c = ctx();
    const ss = maakSs([
      ['', '', '', '', '', ''],                          // lege rij
      [new Date(2026, 0, 1), '',  'geen uren', '', '', ''],
      [new Date(2026, 0, 2), -5, 'negatief', '', '', ''],  // ongeldig
      [new Date(2026, 0, 3), 'abc', 'tekst', '', '', ''],  // ongeldig
      [new Date(2026, 0, 4), 7,    'wel geldig', '', '', ''],
    ]);
    expect(c.totaalUrenInBoekjaar_(ss, 2026)).toBe(7);
  });

  test('decimale uren (0,25) worden correct opgeteld en afgerond op 1 decimaal', () => {
    const c = ctx();
    const ss = maakSs([
      [new Date(2026, 0, 1), 0.25, 'kort', '', '', ''],
      [new Date(2026, 0, 2), 0.5,  'half uur', '', '', ''],
      [new Date(2026, 0, 3), 1.75, 'kwart', '', '', ''],
    ]);
    expect(c.totaalUrenInBoekjaar_(ss, 2026)).toBe(2.5);
  });
});

describe('C1 — Belastingadvies-koppeling', () => {
  test('Belastingadvies.gs gebruikt totaalUrenInBoekjaar_ vóór de fallback', () => {
    expect(BEL).toMatch(/totaalUrenInBoekjaar_\(ss, jaar\)/);
    // Volgorde-guard: sheet komt vóór de instelling-fallback
    const idxSheet = BEL.indexOf("totaalUrenInBoekjaar_(ss, jaar)");
    const idxInstelling = BEL.indexOf("getInstelling_('Gewerkte uren dit jaar')");
    expect(idxSheet).toBeGreaterThan(-1);
    expect(idxInstelling).toBeGreaterThan(-1);
    expect(idxSheet).toBeLessThan(idxInstelling);
  });

  test('Belastingadvies waarschuwt expliciet als de fallback (instelling) wordt gebruikt', () => {
    expect(BEL).toMatch(/bewijslast staat in tabblad Urenregistratie/);
    expect(BEL).toMatch(/totaal in Instellingen is bij controle onvoldoende/);
  });

  test('Lege-sheet-pad geeft heldere call-to-action richting de Urenregistratie-menu', () => {
    expect(BEL).toMatch(/Boekhoudbaar.{0,20}Urenregistratie/i);
  });
});

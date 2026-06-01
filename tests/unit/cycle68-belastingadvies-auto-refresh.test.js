/**
 * tests/unit/cycle68-belastingadvies-auto-refresh.test.js
 *
 * Cycle 68 — Belastingadvies-tab wordt 1×/dag automatisch ververst via
 * dagelijkseTaken(). Voorheen alleen handmatig (menu) → "Bijgewerkt: 5 mei"
 * stond stale op het tabblad terwijl klanten geloofden dat het actueel was.
 *
 * Eerlijkheids-audit: het tabblad heet expliciet "Bijgewerkt: <datum>" en
 * toont aftrekposten + deadlines die wettelijke termijnen bevatten (KIA
 * grenzen per jaar, BTW-aangiftedata). Een stale rendering = misleidend.
 *
 * Source-grep volstaat (zelfde patroon als v3-suppletie-proactief.test.js):
 * de wijziging is puur wiring; de daadwerkelijke genereerBelastingadvies()-
 * implementatie heeft eigen tests.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

describe('CYCLE 68: Belastingadvies auto-refresh via dagelijkseTaken', () => {
  const triggersSrc = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');

  test('dagelijkseTaken roept _runTaak_("belastingadvies", ...) aan', () => {
    expect(triggersSrc).toMatch(/_runTaak_\(['"]belastingadvies['"]/);
  });

  test('de taak voert genereerBelastingadvies() uit', () => {
    // Pak de regel met de wiring en check dat de juiste public functie
    // wordt aangeroepen — niet de raw helper, niet de cache-wrapper.
    const regel = triggersSrc.split('\n').find(l =>
      l.includes("_runTaak_('belastingadvies'") || l.includes('_runTaak_("belastingadvies"')
    );
    expect(regel).toBeTruthy();
    expect(regel).toMatch(/genereerBelastingadvies\s*\(\s*\)/);
  });

  test('staat binnen dagelijkseTaken() én ná vernieuwDashboard (volgorde-invariant)', () => {
    const start = triggersSrc.indexOf('function dagelijkseTaken()');
    const eind  = triggersSrc.indexOf('\nfunction ', start + 1);
    const blok  = triggersSrc.slice(start, eind);

    expect(blok).toMatch(/_runTaak_\(['"]belastingadvies['"]/);
    const idxDashboard = blok.indexOf("_runTaak_('dashboard'");
    const idxAdvies    = blok.indexOf("_runTaak_('belastingadvies'");
    expect(idxDashboard).toBeGreaterThan(-1);
    expect(idxAdvies).toBeGreaterThan(idxDashboard);
  });
});

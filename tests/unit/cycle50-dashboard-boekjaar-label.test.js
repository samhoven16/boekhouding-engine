/**
 * tests/unit/cycle50-dashboard-boekjaar-label.test.js
 *
 * Cycle 50 — Dashboard had label-mismatch:
 *   - Header zei "Boekjaar 2026" (calendar via `new Date().getFullYear()`)
 *   - Data toonde rij-getallen voor btwJaar=getBoekjaar_() (klant-config)
 * Voor klanten met afwijkend boekjaar zag het er incoherent uit.
 *
 * Bestrijkt "Dashboard BTW year assumption — UNKNOWN" uit invariants.md.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/Dashboard.gs'), 'utf8');

describe('CYCLE 50: Dashboard labels gebruiken btwJaar ipv calendar', () => {
  test('Header-label gebruikt btwJaar', () => {
    expect(src).toContain('Boekjaar ${btwJaar}');
    expect(src).not.toContain('Boekjaar ${jaar}');
  });

  test('BTW-overzicht-section gebruikt btwJaar', () => {
    expect(src).toContain('BTW OVERZICHT ${btwJaar}');
    expect(src).not.toContain('BTW OVERZICHT ${jaar}');
  });

  test('Chart-titles binnen maakDashboardGrafieken_ blijven `jaar` (parameter = btwJaar door caller)', () => {
    expect(src).toContain('Omzet vs. Kosten ${jaar}');
    expect(src).toContain('Cashflow per maand ${jaar}');
  });

  test('vernieuwDashboard houdt expliciete `btwJaar = getBoekjaar_()`', () => {
    expect(src).toMatch(/const btwJaar = getBoekjaar_\(\)/);
  });
});

/**
 * tests/unit/journaalpost-committed-helpers.test.js
 *
 * Issue #123 batch 3 — Foundation voor PENDING/COMMITTED-lifecycle.
 *
 * Een complete migratie ("alleen COMMITTED beïnvloedt grootboek-saldi")
 * is een breaking change die in een aparte PR moet. Deze foundation
 * introduceert de helpers + één opt-in toepassing in _bewijs_I2_ zodat
 * latere migratie kan landen zonder de huidige werking te breken.
 *
 * Semantiek (zie Invariants.gs):
 *   'Gevalideerd' / 'COMMITTED' → committed
 *   'Concept'                   → pending
 *   leeg/null/undefined          → committed (legacy backwards-compat)
 *   'CORRUPT' / 'GESTORNEERD'   → niet committed (uit aggregatie)
 *
 * Audit 2026-06-12.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function ctxBouw() {
  return createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
}

// Schema: kolom 16 (0-based) = Status (Q in 1-based)
function rij(status) {
  const r = new Array(17).fill('');
  r[16] = status;
  return r;
}

describe('Issue #123 batch 3 — _journaalpostIsCommitted_', () => {
  const c = ctxBouw();

  test('"Gevalideerd" → committed', () => {
    expect(c._journaalpostIsCommitted_(rij('Gevalideerd'))).toBe(true);
    expect(c._journaalpostIsCommitted_(rij('GEVALIDEERD'))).toBe(true);
    expect(c._journaalpostIsCommitted_(rij(' gevalideerd '))).toBe(true);
  });

  test('"COMMITTED" alias → committed', () => {
    expect(c._journaalpostIsCommitted_(rij('COMMITTED'))).toBe(true);
  });

  test('"Concept" → NIET committed (PENDING)', () => {
    expect(c._journaalpostIsCommitted_(rij('Concept'))).toBe(false);
  });

  test('"CORRUPT" / "GESTORNEERD" → NIET committed', () => {
    expect(c._journaalpostIsCommitted_(rij('CORRUPT'))).toBe(false);
    expect(c._journaalpostIsCommitted_(rij('GESTORNEERD'))).toBe(false);
  });

  test('Lege string / null / undefined → committed (LEGACY backwards-compat)', () => {
    expect(c._journaalpostIsCommitted_(rij(''))).toBe(true);
    expect(c._journaalpostIsCommitted_(rij(null))).toBe(true);
    expect(c._journaalpostIsCommitted_(rij(undefined))).toBe(true);
  });

  test('Korte legacy rij (< 17 kolommen) → committed', () => {
    expect(c._journaalpostIsCommitted_(['x', 'y'])).toBe(true);
    expect(c._journaalpostIsCommitted_([])).toBe(true);
  });

  test('Null / undefined-rij → committed (defensive default)', () => {
    expect(c._journaalpostIsCommitted_(null)).toBe(true);
    expect(c._journaalpostIsCommitted_(undefined)).toBe(true);
  });
});

describe('Issue #123 batch 3 — _filterJournaalpostenCommitted_', () => {
  const c = ctxBouw();

  test('Behoudt de header (index 0) altijd', () => {
    const data = [['Header'], rij('Concept'), rij('Gevalideerd')];
    const out = c._filterJournaalpostenCommitted_(data);
    expect(out[0]).toEqual(['Header']);
  });

  test('Filtert PENDING uit; legacy lege rijen blijven (committed)', () => {
    const data = [
      ['Header'],
      rij('Gevalideerd'),
      rij('Concept'),
      rij(''),            // legacy → committed
      rij('CORRUPT'),
      rij('Gevalideerd'),
    ];
    const out = c._filterJournaalpostenCommitted_(data);
    // Header + 3 committed (legacy '' telt mee, Concept en CORRUPT niet)
    expect(out.length).toBe(4);
  });

  test('Lege input → veilig terug', () => {
    expect(c._filterJournaalpostenCommitted_([])).toEqual([]);
    expect(c._filterJournaalpostenCommitted_(null)).toEqual([]);
  });
});

describe('Issue #123 batch 3 — _bewijs_I2_ opt-in alleenCommitted', () => {
  // Bron-grep volstaat: de gedragsverificatie loopt al via de gewone I2-tests.
  const fs = require('fs');
  const path = require('path');
  const FB = fs.readFileSync(path.resolve(__dirname, '../../src/FormeelBewijs.gs'), 'utf8');

  test('_bewijs_I2_grootboekConsistent_ accepteert een opt-parameter', () => {
    expect(FB).toMatch(/function _bewijs_I2_grootboekConsistent_\(ss,\s*opt\)/);
  });

  test('De opt-in modus filtert via _journaalpostIsCommitted_', () => {
    expect(FB).toMatch(/opt\.alleenCommitted[\s\S]{0,200}_journaalpostIsCommitted_/);
  });

  test('Default-modus (geen opt) is BACKWARDS-COMPATIBEL — geen filter', () => {
    // Het oude pad voor CORRUPT/GESTORNEERD-uitsluiting blijft staan.
    expect(FB).toMatch(/status === 'CORRUPT' \|\| status === 'GESTORNEERD'/);
  });
});

/**
 * tests/unit/audit2-med-low-batch1.test.js
 *
 * Ronde 2 MED + LOW batch 1 (5 fixes):
 *
 *   1. Noodsleutel min 24→32 chars (red-team LOW)
 *   2. Post-noodsleutel rate-limit (red-team MED) — anti-unlimited brute-force
 *   3. BTWReminder Triggers.gs:2447 "Uw boekhoudprogramma" (voice LOW)
 *   4. BELASTING_PER_JAAR[2027] placeholder triggert TARIEF_VEROUDERD (langlopend MED)
 *   5. Periode-ontgrendel-historie via GESLOTEN_PERIODES_HISTORIE (accountant LOW)
 *
 * Plus: pre-existing flaky property-test op rondBedrag_ gefixt (float tolerance).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(ROOT, 'licence-server/Code.gs'), 'utf8');
const trig = fs.readFileSync(path.join(ROOT, 'src/Triggers.gs'), 'utf8');
const bel  = fs.readFileSync(path.join(ROOT, 'src/Belastingadvies.gs'), 'utf8');
const boek = fs.readFileSync(path.join(ROOT, 'src/Boekingen.gs'), 'utf8');
const prop = fs.readFileSync(path.join(ROOT, 'tests/property/top5-property-tests.test.js'), 'utf8');

describe('Fix #1 — Noodsleutel min 24→32 chars', () => {
  test('_adminNoodsleutelOk_ controleert ingegeven.length < 32', () => {
    const start = code.indexOf('function _adminNoodsleutelOk_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/ingegeven\.length < 32/);
    expect(blok).not.toMatch(/ingegeven\.length < 24/);
  });

  test('Min 32-check ook op verwacht (server-side anti-misconfig)', () => {
    const start = code.indexOf('function _adminNoodsleutelOk_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/verwacht\.length < 32/);
  });

  test('Commentaar verklaart entropie-rationale (140→192 bits)', () => {
    const start = code.indexOf('function _adminNoodsleutelOk_');
    const eind = code.indexOf('\nfunction ', start + 1);
    const blok = code.slice(start, eind);
    expect(blok).toMatch(/192 bits|140 bits/);
  });
});

describe('Fix #2 — Post-noodsleutel rate-limit (anti unlimited brute-force)', () => {
  test('Bypass-pad gaat door rateLimit_ met "admin-met-noodsleutel"-actie', () => {
    const start = code.indexOf("if (actie === 'admin-legacy')");
    const blok = code.slice(start, start + 1500);
    expect(blok).toMatch(/actie:\s*['"]admin-met-noodsleutel['"]/);
  });

  test('Soepelere globaal-limit 200/uur op bypass (Sam-gebruik OK, anti-brute)', () => {
    const start = code.indexOf("if (actie === 'admin-legacy')");
    const blok = code.slice(start, start + 1500);
    expect(blok).toMatch(/admin-met-noodsleutel[\s\S]*?globaal:\s*200[\s\S]*?windowMin:\s*60/);
  });

  test('Bij bypass-block: return blocked (anti-loop)', () => {
    const start = code.indexOf("if (actie === 'admin-legacy')");
    const blok = code.slice(start, start + 1500);
    expect(blok).toMatch(/const bypassBlocked = rateLimit_/);
    expect(blok).toMatch(/if \(bypassBlocked\) return bypassBlocked/);
  });
});

describe('Fix #3 — BTW deadline mail signature consistency', () => {
  test('Triggers.gs:2447 niet meer "Uw boekhoudprogramma"', () => {
    expect(trig).not.toMatch(/Uw boekhoudprogramma/);
  });

  test('Wel "— Boekhoudbaar" als signature (consistent met andere mails)', () => {
    const start = trig.indexOf('Herinnering: BTW aangifte');
    const blok = trig.slice(start, start + 600);
    expect(blok).toMatch(/Met vriendelijke groet,\\n— Boekhoudbaar/);
  });
});

describe('Fix #4 — BELASTING_PER_JAAR[2027] placeholder triggert TARIEF_VEROUDERD', () => {
  test('2027 heeft placeholder: true flag', () => {
    const start = bel.indexOf('2027: {');
    const blok = bel.slice(start, start + 500);
    expect(blok).toMatch(/placeholder:\s*true/);
  });

  test('Belastingadvies controleert isPlaceholderJaar', () => {
    expect(bel).toMatch(/const isPlaceholderJaar = /);
    expect(bel).toMatch(/BELASTING_PER_JAAR\[jaar\] && BELASTING_PER_JAAR\[jaar\]\.placeholder/);
  });

  test('TARIEF_VEROUDERD wordt gezet bij placeholder OF fallback', () => {
    expect(bel).toMatch(/!heeftJaarTarieven \|\| isPlaceholderJaar/);
  });

  test('TARIEF_BRON differentieert tussen placeholder en fallback', () => {
    expect(bel).toMatch(/placeholder \(['"] \+ jaar/);
    expect(bel).toMatch(/fallback \(['"] \+ laatstBekendJaar/);
  });

  test('TARIEF_FALLBACK_JAAR is correct (jaar bij placeholder, laatstBekend bij fallback)', () => {
    expect(bel).toMatch(/TARIEF_FALLBACK_JAAR = isPlaceholderJaar \? jaar : laatstBekendJaar/);
  });
});

describe('Fix #5 — Periode-ontgrendel-historie behouden', () => {
  test('GESLOTEN_PERIODES_HISTORIE-property wordt bijgehouden', () => {
    expect(boek).toMatch(/GESLOTEN_PERIODES_HISTORIE/);
  });

  test('History-entry bevat label, datums, motivatie, ontgrendelaar', () => {
    const start = boek.indexOf('GESLOTEN_PERIODES_HISTORIE');
    const blok = boek.slice(start, start + 1500);
    expect(blok).toMatch(/label:\s*periode\.label/);
    expect(blok).toMatch(/ontgrendeldOp:\s*new Date\(\)\.toISOString\(\)/);
    expect(blok).toMatch(/ontgrendeldDoor:/);
    expect(blok).toMatch(/motivatie:\s*motivatie\.slice\(0, 400\)/);
  });

  test('Historie wordt ge-append (geen overschrijf)', () => {
    const start = boek.indexOf('GESLOTEN_PERIODES_HISTORIE');
    const blok = boek.slice(start, start + 1500);
    expect(blok).toMatch(/hist\.push\(/);
  });

  test('Historie cap op 15 entries (R3 — 100 overschreed 9KB-prop-limit)', () => {
    // Cap was 100 in R2-batch1 maar 100 × ~450B ≈ 45KB > 9KB-per-property.
    // R3 audit (audit2-r3-fixes.test.js) bracht cap terug naar 15.
    const start = boek.indexOf('GESLOTEN_PERIODES_HISTORIE');
    const blok = boek.slice(start, start + 1500);
    expect(blok).toMatch(/hist\.length > 15/);
    expect(blok).toMatch(/hist\.slice\(hist\.length - 15\)/);
  });

  test('Fail-safe: historie-write mag splice niet blokkeren', () => {
    const start = boek.indexOf('GESLOTEN_PERIODES_HISTORIE');
    const blok = boek.slice(start, start + 2000);
    expect(blok).toMatch(/} catch \(_\) \{ \/\* historie-write mag splice niet/);
  });
});

describe('Property-test flake fix (rondBedrag_)', () => {
  test('Tolerantie schaalt met magnitude (float64 mantissa)', () => {
    expect(prop).toMatch(/absTol = Math\.max\(1e-6, Math\.abs\(out\) \* 1e-12\)/);
  });

  test('Audit-flake seed wordt in commentaar genoemd voor traceerbaarheid', () => {
    expect(prop).toMatch(/seed 1001792640/);
  });
});

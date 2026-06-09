/**
 * tests/unit/audit2-continuiteit.test.js
 *
 * Audit-vondst ronde 2 (langlopend-onderhoud): 3 continuïteit-blockers:
 *
 *   1. LICENTIE_OFFLINE_GRACE_DAGEN = 7 → te kort bij Sam-uitval
 *      Nu: default 90 + ScriptProperty 'LICENTIE_GRACE_DAGEN' override
 *   2. Belastingadvies.gs:250 viel terug op BELASTING_PER_JAAR[2026]
 *      → vanaf 2027 stille verkeerde tarieven. Nu: highest-key fallback
 *      + tarieven.TARIEF_VEROUDERD flag
 *   3. Bus-factor / continuïteitsbelofte ontbrak. Nu: RUNBOOK.md + /continuiteit/
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const licentie = fs.readFileSync(path.join(ROOT, 'src/Licentie.gs'), 'utf8');
const belasting = fs.readFileSync(path.join(ROOT, 'src/Belastingadvies.gs'), 'utf8');

describe('Fix #1 — Licentie grace 7 → 90 dagen + configurable', () => {
  test('Default is 90 dagen (NIET 7)', () => {
    expect(licentie).toMatch(/LICENTIE_OFFLINE_GRACE_DAGEN_DEFAULT\s*=\s*90/);
  });

  test('Helper _licentieGraceDagen_ leest ScriptProperty override', () => {
    expect(licentie).toMatch(/function _licentieGraceDagen_/);
    expect(licentie).toMatch(/getProperty\(['"]LICENTIE_GRACE_DAGEN['"]\)/);
  });

  test('Override-validatie: 1d-10y range (anti-typo + anti-trivial)', () => {
    expect(licentie).toMatch(/v >= 1 && v <= 3650/);
  });

  test('Backward compat: const LICENTIE_OFFLINE_GRACE_DAGEN bestaat nog', () => {
    expect(licentie).toMatch(/const LICENTIE_OFFLINE_GRACE_DAGEN\s*=\s*LICENTIE_OFFLINE_GRACE_DAGEN_DEFAULT/);
  });

  test('Beide call-sites gebruiken nu _licentieGraceDagen_() (niet hardcoded const)', () => {
    expect(licentie).toMatch(/dagenSinds >= _licentieGraceDagen_\(\)/);
    expect(licentie).toMatch(/_licentieGraceDagen_\(\) - dagenSinds/);
  });

  test('Commentaar verklaart audit-redenering + Sam-USP referentie', () => {
    expect(licentie).toMatch(/Sam-onbeschikbaarheid/);
    expect(licentie).toMatch(/morgen stopt/i);
  });
});

describe('Fix #2 — Belastingadvies fallback geeft expliciete waarschuwing', () => {
  test('Fallback gebruikt highest beschikbare jaar (geen hardcoded 2026)', () => {
    expect(belasting).toMatch(/beschikbareJaren/);
    expect(belasting).toMatch(/laatstBekendJaar/);
    expect(belasting).toMatch(/sort\(function\(a, b\) \{ return b - a; \}\)/);
  });

  test('Bij fallback wordt TARIEF_VEROUDERD-flag op tarieven gezet', () => {
    expect(belasting).toMatch(/TARIEF_VEROUDERD = true/);
    // Audit ronde 2 batch-1: ook bij placeholder-jaar (BELASTING_PER_JAAR[2027].placeholder=true)
    // wordt vlag gezet. Expressie nu ternary: isPlaceholderJaar ? jaar : laatstBekendJaar.
    expect(belasting).toMatch(/TARIEF_FALLBACK_JAAR = (isPlaceholderJaar \? jaar : )?laatstBekendJaar/);
    expect(belasting).toMatch(/['"]fallback \(/);  // batch-1: ternary maakt het beide takken
  });

  test('Anti-regressie: heeftJaarTarieven-check intact', () => {
    expect(belasting).toMatch(/const heeftJaarTarieven = !!\(serverTarieven \|\| BELASTING_PER_JAAR\[jaar\]\)/);
  });
});

describe('Fix #3 — RUNBOOK + continuïteit-pagina', () => {
  let runbook;
  let continuiteit;
  beforeAll(() => {
    runbook = fs.readFileSync(path.join(ROOT, 'RUNBOOK.md'), 'utf8');
    continuiteit = fs.readFileSync(path.join(ROOT, 'website/continuiteit/index.html'), 'utf8');
  });

  test('RUNBOOK.md bestaat met dead-man-switch instructies', () => {
    expect(runbook).toMatch(/dead-man-switch/i);
    expect(runbook).toMatch(/30 minuten/);
  });

  test('RUNBOOK noemt alle 5 kritieke ScriptProperties (secrets)', () => {
    ['MOLLIE_API_KEY', 'BREVO_API_KEY', 'TEMPLATE_SS_ID', 'ADMIN_WACHTWOORD', 'ADMIN_NOODSLEUTEL'].forEach(function(s) {
      expect(runbook).toContain(s);
    });
  });

  test('RUNBOOK bevat recovery-pad voor opvolger (Sam-uitval scenarios)', () => {
    expect(runbook).toMatch(/Sam-uitval|opvolger/i);
    expect(runbook).toMatch(/account-recovery/i);
    expect(runbook).toMatch(/LICENTIE_GRACE_DAGEN.*3650|3650.*10 jaar/);
  });

  test('RUNBOOK definieert wat klant ziet bij abandoned-mode', () => {
    expect(runbook).toMatch(/abandoned mode|abandoned-mode/i);
    expect(runbook).toMatch(/Eerste 90 dagen/);
    expect(runbook).toMatch(/Dag 91/);
  });

  test('RUNBOOK heeft operationele invarianten ("wat NOOIT mag")', () => {
    expect(runbook).toMatch(/Mollie API key NOOIT in git/);
    expect(runbook).toMatch(/NOOIT klant-data centraal/);
  });

  test('Continuïteit-pagina bestaat met klant-vriendelijke beloftes', () => {
    expect(continuiteit).toMatch(/<title>Wat als Boekhoudbaar morgen stopt/);
    expect(continuiteit).toMatch(/90 dagen offline-buffer/);
    expect(continuiteit).toMatch(/RUNBOOK/);
  });

  test('Continuïteit-pagina noemt 3 export-paden voor weggaan', () => {
    expect(continuiteit).toMatch(/CSV-export/);
    expect(continuiteit).toMatch(/XAF-export/);
    expect(continuiteit).toMatch(/JSONL-snapshot|Noah's Ark/);
  });

  test('Continuïteit-pagina linkt naar /gids/ voor migratie-info', () => {
    expect(continuiteit).toMatch(/href="\/gids\/"/);
  });

  test('Continuïteit-pagina rel="noopener" op externe GitHub link (XSS-veilig)', () => {
    expect(continuiteit).toMatch(/rel="noopener"/);
  });
});

describe('Functionele simulatie — grace-resolution + tariefjaar-fallback', () => {
  function resolveGrace(prop, defaultVal) {
    const v = parseInt(prop || '', 10);
    if (isFinite(v) && v >= 1 && v <= 3650) return v;
    return defaultVal;
  }

  test('Geen property → default 90', () => {
    expect(resolveGrace(null, 90)).toBe(90);
  });
  test('Property = "180" → 180', () => {
    expect(resolveGrace('180', 90)).toBe(180);
  });
  test('Property = "0" → afgewezen (te laag) → default', () => {
    expect(resolveGrace('0', 90)).toBe(90);
  });
  test('Property = "5000" → afgewezen (te hoog) → default', () => {
    expect(resolveGrace('5000', 90)).toBe(90);
  });
  test('Property = "abc" → afgewezen → default', () => {
    expect(resolveGrace('abc', 90)).toBe(90);
  });

  function highestKey(obj) {
    return Object.keys(obj)
      .map(function(j) { return parseInt(j, 10); })
      .filter(function(j) { return isFinite(j); })
      .sort(function(a, b) { return b - a; })[0];
  }

  test('Tarief-fallback: hoogste jaar wint', () => {
    expect(highestKey({ 2024: {}, 2026: {}, 2025: {} })).toBe(2026);
    expect(highestKey({ 2026: {}, 2027: {}, 2028: {} })).toBe(2028);
  });
});

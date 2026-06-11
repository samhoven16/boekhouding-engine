/**
 * tests/unit/audit2-security-high.test.js
 *
 * Audit-vondsten ronde 2 — 3 HIGH security blockers in 1 PR:
 *
 *   1. src/Mollie.gs:238 — non-constant-time HMAC vergelijking → veiligVergelijkApi_
 *   2. licence-server/Code.gs:50 — admin self-DoS via globaal rate-limit
 *      → noodsleutel-bypass + alert-mail aan owner bij lockout
 *   3. src/BoekingEngine.gs:783 — auditLogBuffer mutable plaintext zonder
 *      hash-chain → SHA256-keten per entry, klant kan recente entries
 *      niet ongemerkt wijzigen
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const mollieBron = fs.readFileSync(path.join(ROOT, 'src/Mollie.gs'), 'utf8');
const codeBron   = fs.readFileSync(path.join(ROOT, 'licence-server/Code.gs'), 'utf8');
const engineBron = fs.readFileSync(path.join(ROOT, 'src/BoekingEngine.gs'), 'utf8');

describe('Fix #1 — Mollie sig constant-time vergelijking', () => {
  test('Plain "!==" vervangen door veiligVergelijkApi_-aanroep', () => {
    const start = mollieBron.indexOf('function verwerkMollieWebhook_');
    const eind = mollieBron.indexOf('\nfunction ', start + 1);
    const blok = mollieBron.slice(start, eind);
    expect(blok).toMatch(/veiligVergelijkApi_\(sig, verwacht\)/);
  });

  test('typeof-guard: fallback bij oude installs zonder helper', () => {
    expect(mollieBron).toMatch(/typeof veiligVergelijkApi_ === ['"]function['"]/);
  });

  test('Lege signature check blijft (anti-bypass)', () => {
    const start = mollieBron.indexOf('function verwerkMollieWebhook_');
    const eind = mollieBron.indexOf('\nfunction ', start + 1);
    const blok = mollieBron.slice(start, eind);
    expect(blok).toMatch(/!sig \|\| !sigOk/);
  });

  test('Audit-log bij sig mismatch (geen silent fail)', () => {
    const start = mollieBron.indexOf('function verwerkMollieWebhook_');
    const eind = mollieBron.indexOf('\nfunction ', start + 1);
    const blok = mollieBron.slice(start, eind);
    expect(blok).toMatch(/safeAuditLog_\(['"]Mollie webhook sig mismatch['"]/);
  });
});

describe('Fix #2 — Admin brute-force lockout: noodsleutel + alert', () => {
  test('_adminNoodsleutelOk_ helper bestaat', () => {
    expect(codeBron).toMatch(/function _adminNoodsleutelOk_/);
  });

  test('Min lengte noodsleutel ≥ 32 chars (anti-trivial-guess, audit-2 verhoogd van 24)', () => {
    const start = codeBron.indexOf('function _adminNoodsleutelOk_');
    const eind = codeBron.indexOf('\nfunction ', start + 1);
    const blok = codeBron.slice(start, eind);
    const minChecks = (blok.match(/length < 32/g) || []).length;
    expect(minChecks).toBeGreaterThanOrEqual(2);  // ingegeven én verwacht
  });

  test('Constant-time vergelijking via veiligVergelijk_', () => {
    const start = codeBron.indexOf('function _adminNoodsleutelOk_');
    const eind = codeBron.indexOf('\nfunction ', start + 1);
    const blok = codeBron.slice(start, eind);
    expect(blok).toMatch(/typeof veiligVergelijk_ === ['"]function['"]/);
    expect(blok).toMatch(/veiligVergelijk_\(ingegeven, verwacht\)/);
  });

  test('Audit-log bij succesvolle noodsleutel-gebruik (Belastingdienst-trail)', () => {
    const start = codeBron.indexOf('function _adminNoodsleutelOk_');
    const eind = codeBron.indexOf('\nfunction ', start + 1);
    const blok = codeBron.slice(start, eind);
    expect(blok).toMatch(/ADMIN_NOODSLEUTEL_GEBRUIKT/);
  });

  test('_meldAdminLockoutAanOwner_ helper bestaat met 1×/uur throttle', () => {
    expect(codeBron).toMatch(/function _meldAdminLockoutAanOwner_/);
    const start = codeBron.indexOf('function _meldAdminLockoutAanOwner_');
    const eind = codeBron.indexOf('\nfunction ', start + 1);
    const blok = codeBron.slice(start, eind);
    expect(blok).toMatch(/60 \* 60 \* 1000/);  // 1u throttle
    expect(blok).toMatch(/ADMIN_LOCKOUT_LAATSTE_ALERT_TS/);
  });

  test('Mail-content bevat noodsleutel-instructie als prop NIET gezet (helpful banner)', () => {
    const start = codeBron.indexOf('function _meldAdminLockoutAanOwner_');
    const eind = codeBron.indexOf('\nfunction ', start + 1);
    const blok = codeBron.slice(start, eind);
    expect(blok).toMatch(/Stel hem in.*24 random/);
  });

  test('doGet-route wires noodsleutel-bypass vóór rate-limit', () => {
    const start = codeBron.indexOf("if (actie === 'admin-legacy')");
    const blok = codeBron.slice(start, start + 800);
    const idxBypass = blok.indexOf('_adminNoodsleutelOk_');
    const idxRateLimit = blok.indexOf('rateLimit_(e');
    expect(idxBypass).toBeGreaterThan(-1);
    expect(idxRateLimit).toBeGreaterThan(-1);
    expect(idxBypass).toBeLessThan(idxRateLimit);
  });

  test('Bij lockout wordt _meldAdminLockoutAanOwner_ aangeroepen', () => {
    const start = codeBron.indexOf("if (actie === 'admin-legacy')");
    const blok = codeBron.slice(start, start + 800);
    expect(blok).toMatch(/_meldAdminLockoutAanOwner_/);
  });
});

describe('Fix #3 — Audit-log hash-chain in schrijfAuditLog_', () => {
  test('Cumulatieve AUDIT_KETEN_HASH ScriptProperty wordt onderhouden', () => {
    const start = engineBron.indexOf('function schrijfAuditLog_');
    const eind = engineBron.indexOf('\nfunction ', start + 1);
    const blok = engineBron.slice(start, eind);
    expect(blok).toMatch(/['"]AUDIT_KETEN_HASH['"]/);
    expect(blok).toMatch(/getProperty\(['"]AUDIT_KETEN_HASH['"]\)/);
    expect(blok).toMatch(/setProperty\(['"]AUDIT_KETEN_HASH['"]/);
  });

  test('SHA-256 hash van (prevHash + entry) per regel', () => {
    const start = engineBron.indexOf('function schrijfAuditLog_');
    const eind = engineBron.indexOf('\nfunction ', start + 1);
    const blok = engineBron.slice(start, eind);
    expect(blok).toMatch(/SHA_256/);
    expect(blok).toMatch(/prevHash \+ ['"]\|['"] \+ entryBase/);
  });

  test('Hash-suffix wordt aan elke entry geappendd (16 chars zichtbaar)', () => {
    const start = engineBron.indexOf('function schrijfAuditLog_');
    const eind = engineBron.indexOf('\nfunction ', start + 1);
    const blok = engineBron.slice(start, eind);
    expect(blok).toMatch(/entryBase \+ ['"] \| ['"] \+ entryHash\.slice\(0, 16\)/);
  });

  test('Fail-safe: hash-fout breekt audit-log niet (degradeert naar unsigned entry)', () => {
    const start = engineBron.indexOf('function schrijfAuditLog_');
    const eind = engineBron.indexOf('\nfunction ', start + 1);
    const blok = engineBron.slice(start, eind);
    expect(blok).toMatch(/if \(entryHash\) \{/);
    // Geen throw als entryHash leeg blijft
  });

  test('Bestaande 100-rij-buffer + 9KB-cap logic intact (anti-regressie)', () => {
    const start = engineBron.indexOf('function schrijfAuditLog_');
    const eind = engineBron.indexOf('\nfunction ', start + 1);
    const blok = engineBron.slice(start, eind);
    expect(blok).toMatch(/regels\.splice\(0, regels\.length - 100\)/);
    expect(blok).toMatch(/auditLogBuffer/);
  });
});

describe('Anti-regressie: bestaande security-controles blijven', () => {
  test('OWASP LLM01 prompt-injection guardrail in scanDocumentMetAI blijft', () => {
    expect(engineBron).toMatch(/KRITIEKE VEILIGHEIDSREGEL/);
  });

  test('saniteer_ blokkeert nog steeds formule-injectie', () => {
    expect(engineBron).toMatch(/\^\[=\+\\-@\\t\\r\]/);
  });

  test('Mollie circuit-breaker uit PR #246 blijft beide call-sites dekken', () => {
    const matches = mollieBron.match(/circuitBreaker_\(['"]mollie_api['"]/g) || [];
    expect(matches.length).toBe(2);
  });
});

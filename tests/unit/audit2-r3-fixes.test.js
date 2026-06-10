/**
 * tests/unit/audit2-r3-fixes.test.js
 *
 * Audit-ronde 3 verificatie vond drie issues die ronde 1+2 misten:
 *
 *   1. GESLOTEN_PERIODES_HISTORIE cap 100 × ~450B = 45KB > 9KB-per-property
 *      → setProperty zou throwen → silent data-loss op historie.
 *      Fix: cap teruggebracht naar 15 (= ~7KB, ruim onder 9KB-limiet).
 *   2. schrijfAuditLog_ tryLock-miss: hash-write ging tóch door buiten lock
 *      → race condition bleef bestaan. Fix: hash-write geskipt als lockHeld
 *      false; entry krijgt 'NOLOCK'-marker zodat verifier het herkent.
 *   3. mailDagelijksAuditAnchor_ AUDIT_ANCHOR_EMAIL is klant-schrijfbare prop
 *      → klant kon ontvanger naar eigen adres zetten → Sam ontvangt nooit.
 *      Fix: hardcoded Sam-fallback ALTIJD in ontvangers-array (dedup als
 *      klant hetzelfde adres invult).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const eng = fs.readFileSync(path.join(ROOT, 'src/BoekingEngine.gs'), 'utf8');
const bok = fs.readFileSync(path.join(ROOT, 'src/Boekingen.gs'), 'utf8');

describe('R3 Fix #1 — GESLOTEN_PERIODES_HISTORIE cap (ScriptProperty 9KB-limiet)', () => {
  test('Cap is 15 (was 100 — overschreed 9KB-per-property)', () => {
    expect(bok).toMatch(/hist\.length > 15/);
    expect(bok).toMatch(/hist\.slice\(hist\.length - 15\)/);
  });

  test('Geen oude cap-100 in slice meer aanwezig in deze sectie', () => {
    // Defensieve check: zorg dat we niet per ongeluk 2 caps tegelijk hebben
    const histSectie = bok.match(/HISTORIE[\s\S]{0,1500}?hist\.slice/);
    expect(histSectie).not.toBeNull();
    expect(histSectie[0]).not.toMatch(/hist\.length > 100/);
  });

  test('Motivatie-comment verwijst naar 9KB-limiet en silent data-loss', () => {
    expect(bok).toMatch(/9KB/);
    expect(bok).toMatch(/silent[ -]data[ -]loss/i);
  });
});

describe('R3 Fix #2 — schrijfAuditLog_ tryLock skip-write op lock-miss', () => {
  test('lockHeld vlag wordt geïntroduceerd', () => {
    expect(eng).toMatch(/let lockHeld = false/);
    expect(eng).toMatch(/lockHeld = lock\.tryLock\(/);
  });

  test('Hash-write zit binnen if (lockHeld) {...}-blok', () => {
    expect(eng).toMatch(/if \(lockHeld\) \{[\s\S]*?AUDIT_KETEN_HASH[\s\S]*?releaseLock/);
  });

  test('NOLOCK-marker op entry wanneer lock niet verkregen', () => {
    expect(eng).toMatch(/NOLOCK/);
    expect(eng).toMatch(/lockHeld\s*\?[\s\S]{0,200}entryHash[\s\S]{0,200}NOLOCK/);
  });
});

// R3 Fix #3 (mailDagelijksAuditAnchor_ Sam-hardcoded fallback) is in de
// ronde-3 VERIFICATIE vervangen: de mail-naar-Sam aanpak brak de privacy-
// belofte, schaalde niet, stierf bij product-abandon en dekte de 7-jaars
// bewaarplicht niet. Vervangen door de append-only sheet-tab. Zie
// tests/unit/audit3-rework.test.js voor de nieuwe dekking.
describe('R3 Fix #3 — mail-anchor is VERVANGEN door sheet-tab', () => {
  test('Oude mail-anchor + hardcoded Sam-adres zijn weg', () => {
    expect(eng).not.toMatch(/function mailDagelijksAuditAnchor_/);
    expect(eng).not.toMatch(/_AUDIT_ANCHOR_SAM_FALLBACK/);
  });
});

describe('R3 — integratie: alle 3 fixes in samenhang', () => {
  test('Alle 3 audit-vondst-comments verwijzen naar "ronde 3"', () => {
    const r3Mentions = (eng.match(/ronde[ -]3/gi) || []).length
      + (bok.match(/ronde[ -]3/gi) || []).length;
    expect(r3Mentions).toBeGreaterThanOrEqual(3);
  });
});

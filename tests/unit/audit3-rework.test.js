/**
 * tests/unit/audit3-rework.test.js
 *
 * Ronde-3 VERIFICATIE-rework. Zes specialist-agents (klantreis, accountant/
 * Belastingdienst, langlopend-onderhoud, documentatie, customer-voice, cross-
 * PR-regressie) vonden dat de audit-trust-anchor uit PR #264/#270 vier
 * fundamentele problemen had. Sam koos twee richtingen:
 *
 *   A. Vervang de mail-naar-Sam door een append-only sheet-tab in de klant
 *      z'n eigen sheet (zelf-verifieerbaar, geen privacy-tegenspraak,
 *      overleeft product-abandon, dekt 7-jaars bewaarplicht).
 *   B. Fix + wire de buffer-verifier: NOLOCK-entries herkennen + koppel hem
 *      aan een menu zodat hij echte dekking biedt.
 *
 * Plus: durable business-event logging (PERIODE_ONTGRENDELD → AUDIT_LOG-sheet),
 * neutrale niet-beschuldigende toon, en een ScriptProperties-grootte-guard.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const eng = fs.readFileSync(path.join(ROOT, 'src/BoekingEngine.gs'), 'utf8');
const trig = fs.readFileSync(path.join(ROOT, 'src/Triggers.gs'), 'utf8');
const bok = fs.readFileSync(path.join(ROOT, 'src/Boekingen.gs'), 'utf8');
const menu = fs.readFileSync(path.join(ROOT, 'src/Menu.gs'), 'utf8');
const cfg = fs.readFileSync(path.join(ROOT, 'src/Config.gs'), 'utf8');
const gez = fs.readFileSync(path.join(ROOT, 'src/GezondheidCheck.gs'), 'utf8');

function blok(bron, fnNaam) {
  const start = bron.indexOf('function ' + fnNaam);
  if (start < 0) return '';
  const eind = bron.indexOf('\nfunction ', start + 1);
  return bron.slice(start, eind < 0 ? bron.length : eind);
}

describe('A — append-only sheet-tab vervangt mail-naar-Sam', () => {
  test('SHEETS.AUDIT_ANCHOR constante bestaat', () => {
    expect(cfg).toMatch(/AUDIT_ANCHOR:\s*'_Audit_Anchor'/);
  });

  test('schrijfDagelijksAuditAnchor_ bestaat; oude mail-functie weg', () => {
    expect(eng).toMatch(/function schrijfDagelijksAuditAnchor_/);
    expect(eng).not.toMatch(/function mailDagelijksAuditAnchor_/);
    expect(eng).not.toMatch(/_AUDIT_ANCHOR_SAM_FALLBACK/);
  });

  test('Geen mail meer + hardcoded Sam-adres nergens in de anchor', () => {
    const b = blok(eng, 'schrijfDagelijksAuditAnchor_');
    expect(b).not.toMatch(/MailApp/);
    expect(b).not.toMatch(/samhoven16@gmail\.com/);
    expect(b).toMatch(/insertSheet/);
    expect(b).toMatch(/appendRow/);
  });

  test('Throttle-datum PAS na geslaagde append (geen stille dood)', () => {
    const b = blok(eng, 'schrijfDagelijksAuditAnchor_');
    expect(b.indexOf('appendRow')).toBeLessThan(b.lastIndexOf('AUDIT_ANCHOR_LAATSTE'));
  });

  test('Tab wordt verborgen + bevat keten-kolommen', () => {
    const b = blok(eng, 'schrijfDagelijksAuditAnchor_');
    expect(b).toMatch(/hideSheet/);
    expect(b).toMatch(/Keten-hash/);
    expect(b).toMatch(/Vorige-hash/);
  });

  test('Wiring in dagelijkseTaken verwijst naar nieuwe functie', () => {
    expect(trig).toMatch(/schrijfDagelijksAuditAnchor_/);
    expect(trig).not.toMatch(/mailDagelijksAuditAnchor_/);
  });

  test('verifieerAuditAnchorSheet_ checkt keten-continuïteit van de tab', () => {
    const b = blok(eng, 'verifieerAuditAnchorSheet_');
    expect(b).toMatch(/AUDIT_ANCHOR/);
    expect(b).toMatch(/gebroken/);
  });
});

describe('B — buffer-verifier herkent NOLOCK + is gewired', () => {
  test('NOLOCK-branch slaat de hash-vergelijking over (continue)', () => {
    const b = blok(eng, 'verifieerAuditChain_');
    expect(b).toMatch(/opgeslagenSuffix === 'NOLOCK'/);
    expect(b).toMatch(/if \(opgeslagenSuffix === 'NOLOCK'\) continue/);
  });

  test('Menu-wrapper toonAuditKetenVerificatie bestaat', () => {
    expect(eng).toMatch(/function toonAuditKetenVerificatie/);
    const b = blok(eng, 'toonAuditKetenVerificatie');
    expect(b).toMatch(/verifieerAuditChain_\(\)/);
    expect(b).toMatch(/verifieerAuditAnchorSheet_\(\)/);
  });

  test('Menu-item is gewired in Menu.gs', () => {
    expect(menu).toMatch(/toonAuditKetenVerificatie/);
  });
});

describe('Durable business-event logging (7-jaars bewaarplicht)', () => {
  test('logBusinessEventNaarAuditSheet_ schrijft naar AUDIT_LOG-sheet met ketenhash', () => {
    const b = blok(trig, 'logBusinessEventNaarAuditSheet_');
    expect(b).toMatch(/SHEETS\.AUDIT_LOG/);
    expect(b).toMatch(/_auditKetenHash_/);
    expect(b).toMatch(/appendRow/);
  });

  test('PERIODE_ONTGRENDELD wordt duurzaam gelogd (centraal via schrijfAuditLog_, F-ACC-001)', () => {
    // Sinds F-ACC-001 geen aparte dual-write meer op de call-site; schrijfAuditLog_
    // routeert legaal-significante events zélf naar de durable AUDIT_LOG-sheet.
    const sa = blok(eng, 'schrijfAuditLog_');
    expect(sa).toMatch(/_isAuditSignificant_\(actie\)/);
    expect(sa).toMatch(/logBusinessEventNaarAuditSheet_\(/);
    // PERIODE_ONTGRENDELD valt onder "significant"
    expect(blok(eng, '_isAuditSignificant_')).toMatch(/ontgrendeld/i);
    // de oude dubbele call op de unlock-site is weg (anders 2 sheet-rijen)
    expect(bok).not.toMatch(/logBusinessEventNaarAuditSheet_\('PERIODE_ONTGRENDELD'/);
  });

  test('Misleidende comment over AuditLog-fallback is gecorrigeerd', () => {
    // De oude claim ("oudere entries staan in AuditLog via schrijfAuditLog_")
    // was onjuist — schrijfAuditLog_ schrijft alleen naar de buffer.
    expect(bok).not.toMatch(/oudere entries staan in AuditLog\s*\n\s*\/\/ via schrijfAuditLog_/);
    expect(bok).toMatch(/DUURZAME 7-jaars vastlegging/);
  });
});

describe('Neutrale, niet-beschuldigende toon (customer-voice)', () => {
  test('"klant heeft chain gereset" is verwijderd uit klant-zichtbare tekst', () => {
    expect(eng).not.toMatch(/klant heeft chain gereset/);
  });

  test('Verificatie-melding noemt onschuldige oorzaken', () => {
    const b = blok(eng, 'toonAuditKetenVerificatie');
    expect(b).toMatch(/herinstallatie|back-up/i);
  });
});

describe('ScriptProperties-grootte pre-flight guard', () => {
  test('diagnoseInstallatie checkt 9KB-per-key + 500KB-totaal', () => {
    expect(gez).toMatch(/ScriptProperties-grootte/);
    expect(gez).toMatch(/8500/);
    expect(gez).toMatch(/460000/);
  });
});

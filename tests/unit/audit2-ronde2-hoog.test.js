/**
 * tests/unit/audit2-ronde2-hoog.test.js
 *
 * Ronde 2 verificatie-audit vond 4 echte HIGH-issues bovenop wat al in
 * PR #258-#263 lag. Deze PR fixt alle vier:
 *
 *   1. BTW r1d split — nultarief telde ten onrechte als vrijgesteld in
 *      pro-rata noemer. Concreet: ZZP'er met EU-export + NL 21% kreeg
 *      40% i.p.v. 100% voorbelasting-aftrek → naheffing-risico.
 *   2. AUDIT_KETEN_HASH zonder LockService → race-condition tussen
 *      dagelijkseTaken en user-actie (PERIODE_ONTGRENDELD).
 *   3. verifieerAuditChain_ ontbrak → hash-chain was symbool-politiek.
 *   4. Externe trust-anchor (mailDagelijksAuditAnchor_) ontbrak → klant
 *      kon zowel buffer als hash resetten zonder spoor.
 *
 * Plus 2 LOW:
 *   5. BelastingOptimizer.gs:14-17 stale doc-comment €19.535/€129.194
 *      → bijgewerkt naar €19.769/€130.744 (aligned met Belastingadvies).
 *   6. /continuiteit/ niet in homepage nav → discoverability win.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const btw = fs.readFileSync(path.join(ROOT, 'src/BTW.gs'), 'utf8');
const eng = fs.readFileSync(path.join(ROOT, 'src/BoekingEngine.gs'), 'utf8');
const trig = fs.readFileSync(path.join(ROOT, 'src/Triggers.gs'), 'utf8');
const opt = fs.readFileSync(path.join(ROOT, 'src/BelastingOptimizer.gs'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'website/index.html'), 'utf8');

describe('Fix #1 — BTW r1d split (pro-rata naheffing-risico)', () => {
  test('r1d_vrijgesteld en r1d_nul worden apart bijgehouden', () => {
    expect(btw).toMatch(/aangifte\.r1d_vrijgesteld = \(aangifte\.r1d_vrijgesteld \|\| 0\) \+ grondslag/);
    expect(btw).toMatch(/aangifte\.r1d_nul = \(aangifte\.r1d_nul \|\| 0\) \+ grondslag/);
  });

  test('r1d totaal blijft samengevoegd voor Belastingdienst-rubriek', () => {
    // Aangifte-formulier label is "0% of vrijgesteld" — output gelijk
    expect(btw).toMatch(/vrijgesteld[\s\S]*?aangifte\.r1d \+= grondslag/);
    expect(btw).toMatch(/nultarief[\s\S]*?aangifte\.r1d \+= grondslag/);
  });

  test('Pro-rata noemer gebruikt ALLEEN r1d_vrijgesteld (niet r1d-totaal)', () => {
    expect(btw).toMatch(/const vrijgesteldeOmzet = aangifte\.r1d_vrijgesteld \|\| 0/);
  });

  test('belasteOmzet bevat r1d_nul + r2a, maar NIET r3a_grondslag (dubbeltelling)', () => {
    expect(btw).toMatch(/\(aangifte\.r1d_nul \|\| 0\)/);
    expect(btw).toMatch(/\(aangifte\.r2a \|\| 0\)/);
    // Cross-PR-regressie (go-live audit): een IC-levering telt al mee via
    // r1d_nul (zelfde factuur); r3a_grondslag óók optellen = dezelfde euro's
    // dubbel in de pro-rata-breuk → te hoge voorbelasting-aftrek.
    const belasteOmzetBlok = btw.slice(btw.indexOf('const belasteOmzet'), btw.indexOf('const vrijgesteldeOmzet'));
    expect(belasteOmzetBlok).not.toMatch(/r3a_grondslag \|\| 0\)\s*[+;]/);
    expect(belasteOmzetBlok).toMatch(/dubbele\s*[\s\S]*telling|dubbel/i);
  });

  test('Commentaar verklaart Wet OB art. 11 + naheffing-risico', () => {
    expect(btw).toMatch(/art\. 11 lid 2 Wet OB|art\. 11 Uitv\.besch/);
    expect(btw).toMatch(/naheffing/i);
  });
});

describe('Fix #2 — AUDIT_KETEN_HASH LockService rond read+write', () => {
  test('LockService.getScriptLock voor read+write atomair', () => {
    const start = eng.indexOf('function schrijfAuditLog_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/LockService\.getScriptLock\(\)/);
    expect(blok).toMatch(/tryLock\(2000\)/);
    expect(blok).toMatch(/lock\.releaseLock\(\)/);
  });

  test('Lock omsluit prevHash-read EN entryHash-write (atomair)', () => {
    const start = eng.indexOf('function schrijfAuditLog_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    const idxLock = blok.indexOf('tryLock');
    const idxRead = blok.indexOf("getProperty('AUDIT_KETEN_HASH')");
    const idxWrite = blok.indexOf("setProperty('AUDIT_KETEN_HASH'");
    const idxRelease = blok.indexOf('releaseLock');
    expect(idxLock).toBeLessThan(idxRead);
    expect(idxWrite).toBeLessThan(idxRelease);
  });
});

describe('Fix #3 — verifieerAuditChain_ functie', () => {
  test('Functie bestaat', () => {
    expect(eng).toMatch(/function verifieerAuditChain_\s*\(\s*\)/);
  });

  test('Returnt { ok, totaal, gebroken, reden }', () => {
    const start = eng.indexOf('function verifieerAuditChain_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/return \{ ok: true/);
    expect(blok).toMatch(/return \{ ok: false/);
    expect(blok).toMatch(/totaal:/);
    expect(blok).toMatch(/gebroken:/);
    expect(blok).toMatch(/reden:/);
  });

  test('Recompute SHA-256 per entry tegen opgeslagen suffix', () => {
    const start = eng.indexOf('function verifieerAuditChain_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/DigestAlgorithm\.SHA_256, prevHash \+ ['"]\|['"] \+ entryBase/);
    expect(blok).toMatch(/computed\.slice\(0, 16\) !== opgeslagenSuffix/);
  });

  test('Detecteert AUDIT_KETEN_HASH mismatch met laatste entry-hash', () => {
    const start = eng.indexOf('function verifieerAuditChain_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/mogelijk reset/);
  });

  test('Fail-safe: verifier-fout returnt structureel resultaat (geen throw)', () => {
    const start = eng.indexOf('function verifieerAuditChain_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/Verifier-fout: ['"] \+ e\.message/);
  });
});

describe('Fix #4 — schrijfDagelijksAuditAnchor_ append-only sheet-tab (R3-rework)', () => {
  // Ronde-3: de mail-naar-Sam aanpak is vervangen door een append-only tab in
  // de klant z'n eigen sheet (privacy, schaal, abandon, 7-jaars bewaarplicht).
  test('Functie bestaat (sheet-tab i.p.v. mail)', () => {
    expect(eng).toMatch(/function schrijfDagelijksAuditAnchor_/);
  });

  test('Oude mail-functie is verwijderd', () => {
    expect(eng).not.toMatch(/function mailDagelijksAuditAnchor_/);
    expect(eng).not.toMatch(/_AUDIT_ANCHOR_SAM_FALLBACK/);
  });

  test('Throttle: max 1× per dag (AUDIT_ANCHOR_LAATSTE property)', () => {
    expect(eng).toMatch(/AUDIT_ANCHOR_LAATSTE['"]?\)/);
    expect(eng).toMatch(/=== vandaag\) return/);
  });

  test('Schrijft naar append-only tab (geen MailApp meer in deze functie)', () => {
    const start = eng.indexOf('function schrijfDagelijksAuditAnchor_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/insertSheet/);
    expect(blok).toMatch(/appendRow/);
    expect(blok).not.toMatch(/MailApp\.sendEmail/);
  });

  test('Throttle-datum wordt PAS na geslaagde append gezet (geen stille dood)', () => {
    const start = eng.indexOf('function schrijfDagelijksAuditAnchor_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    // appendRow staat vóór de setProperty van de throttle-datum
    expect(blok.indexOf('appendRow')).toBeLessThan(blok.lastIndexOf('AUDIT_ANCHOR_LAATSTE'));
  });

  test('Anchor-rij bevat datum + entry-count + keten-hash + vorige-hash', () => {
    const start = eng.indexOf('function schrijfDagelijksAuditAnchor_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/Entry-count/);
    expect(blok).toMatch(/Keten-hash/);
    expect(blok).toMatch(/Vorige-hash/);
  });

  test('Fail-safe: throwt nooit (anchor mag dagelijkseTaken niet breken)', () => {
    const start = eng.indexOf('function schrijfDagelijksAuditAnchor_');
    const eind = eng.indexOf('\nfunction ', start + 1);
    const blok = eng.slice(start, eind);
    expect(blok).toMatch(/} catch \(_\) \{ \/\* anchor mag nooit/);
  });

  test('Wiring: _runTaak_("auditAnchor", ...) in dagelijkseTaken', () => {
    expect(trig).toMatch(/_runTaak_\(['"]auditAnchor['"]/);
    expect(trig).toMatch(/schrijfDagelijksAuditAnchor_/);
    expect(trig).not.toMatch(/mailDagelijksAuditAnchor_/);
  });

  test('auditAnchor staat vóór formeelBewijs (anchor eerst, dan verificatie)', () => {
    const idxAnchor = trig.indexOf("_runTaak_('auditAnchor'");
    const idxBewijs = trig.indexOf("_runTaak_('formeelBewijs'");
    expect(idxAnchor).toBeLessThan(idxBewijs);
  });
});

describe('Fix #5 — BelastingOptimizer.gs doc-comment bijgewerkt', () => {
  test('Doc-comment toont de definitieve 2026-staffel (config-aligned)', () => {
    expect(opt).toMatch(/€20\.072/);
    expect(opt).toMatch(/€132\.74[67]/);
  });

  test('Oude waarden €19.535 + €129.194 zijn weg uit code, behalve in audit-context', () => {
    // Allowed: één referentie in commentaar over de fix zelf
    const refsOud = (opt.match(/€19\.535/g) || []).length;
    expect(refsOud).toBeLessThanOrEqual(1);
  });

  test('Verwijst expliciet naar Belastingadvies.gs als source-of-truth', () => {
    expect(opt).toMatch(/Belastingadvies\.gs KIA_VAST_BEDRAG/);
  });
});

describe('Fix #6 — /continuiteit/ in homepage nav (discoverability)', () => {
  test('nav-menu bevat /continuiteit/ link', () => {
    const start = home.indexOf('id="nav-menu"');
    const eind = home.indexOf('</ul>', start);
    const blok = home.slice(start, eind);
    expect(blok).toMatch(/href="\/continuiteit\/"/);
  });

  test('Link-tekst is "Continuïteit" (met juiste umlaut)', () => {
    const start = home.indexOf('id="nav-menu"');
    const eind = home.indexOf('</ul>', start);
    const blok = home.slice(start, eind);
    expect(blok).toMatch(/>Continuïteit</);
  });
});

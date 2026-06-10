/**
 * Go-live audit 2026-06-10 — regressietests voor de BLOCKER-fixes.
 * Zie .claude/go-live-audit-2026-06-10.md voor de volledige bevindingen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const lees = (f) => fs.readFileSync(path.resolve(__dirname, '../../', f), 'utf8');

describe('B1 — BTW r5d wordt gezet (I₅-verifier leest dit veld)', () => {
  const btw = lees('src/BTW.gs');
  test('berekenBtwAangifte_ zet aangifte.r5d = aangifte.saldo', () => {
    expect(btw).toMatch(/aangifte\.r5d = aangifte\.saldo/);
  });
});

describe('B2 — r5a-invariant telt r3a_btw NIET mee (conform axioma I₅)', () => {
  const btw = lees('src/BTW.gs');
  test('valideerBtwInvariants_ som zonder r3a_btw', () => {
    expect(btw).not.toMatch(/r3a_btw \|\| 0\)/);
  });
});

describe('B4 — dunning-cleanup leest factuurnummer-kolom [1], niet ID-kolom [0]', () => {
  const triggers = lees('src/Triggers.gs');
  test('cleanupHerinneringsStap bouwt actieve-set uit data[i][1]', () => {
    const blok = triggers.slice(
      triggers.indexOf("_runTaak_('cleanupHerinneringsStap'"),
      triggers.indexOf("_runTaak_('cleanupEmailIdem'"));
    expect(blok).toMatch(/String\(data\[i\]\[1\] \|\| ''\)/);
    expect(blok).not.toMatch(/const fnr = String\(data\[i\]\[0\]/);
  });
});

describe('B5 — guillotine maakt geen lekkende self-triggers meer aan', () => {
  const utils = lees('src/Utils.gs');
  test('guillotineCheck_ bevat geen ScriptApp.newTrigger meer', () => {
    const blok = utils.slice(
      utils.indexOf('function guillotineCheck_'),
      utils.indexOf('function guillotineHervat_'));
    expect(blok).not.toMatch(/ScriptApp\.newTrigger/);
  });
  test('guillotineKlaar_ verwijdert gelekte triggers daadwerkelijk', () => {
    const blok = utils.slice(utils.indexOf('function guillotineKlaar_'));
    expect(blok).toMatch(/ScriptApp\.deleteTrigger\(t\)/);
  });
  test('BankImport gebruikt for-loop met break, geen forEach met dode return', () => {
    const bank = lees('src/BankImport.gs');
    const blok = bank.slice(
      bank.indexOf('function verwerkBankImport_('),
      bank.indexOf('function previewBankImport_public'));
    expect(blok).toMatch(/break;/);
    expect(blok).not.toMatch(/transacties\.forEach/);
  });
});

describe('H6 — canonical trigger-lijst dekt week-/maandtriggers + behoudt opt-in', () => {
  const hygiene = lees('src/Hygiene.gs');
  test('stuurWeeklySamenvatting_ en mailMaandrapport in _HYGIENE_VERWACHTE_TRIGGERS', () => {
    expect(hygiene).toMatch(/stuurWeeklySamenvatting_/);
    expect(hygiene).toMatch(/mailMaandrapport/);
  });
  test('controleerBtwDeadline_ wordt bij sanitize behouden (niet gewist)', () => {
    expect(hygiene).toMatch(/_HYGIENE_BEHOUD_HANDLERS/);
    expect(hygiene).toMatch(/controleerBtwDeadline_/);
  });
});

describe('H7 — Fortress slaat append-only audit-tabs over', () => {
  const fortress = lees('src/Fortress.gs');
  test('_fortressSkipSheet_ bestaat en dekt AUDIT_ANCHOR + AUDIT_LOG', () => {
    expect(fortress).toMatch(/function _fortressSkipSheet_/);
    expect(fortress).toMatch(/SHEETS\.AUDIT_ANCHOR/);
    expect(fortress).toMatch(/SHEETS\.AUDIT_LOG/);
  });
  test('vergrendelen én hashen gebruiken de skip-predicate', () => {
    const matches = fortress.match(/_fortressSkipSheet_\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4); // def + 3 call-sites
  });
});

describe('H10 — data-export bereikbaar zonder geldige licentie', () => {
  const menu = lees('src/Menu.gs');
  test('minimaal menu bevat XAF-export, data-export en backup', () => {
    const blok = menu.slice(menu.indexOf('if (!licentieOk)'), menu.indexOf('controleerOnboarding_'));
    expect(blok).toMatch(/exporteerXaf/);
    expect(blok).toMatch(/exporteerAlleData/);
    expect(blok).toMatch(/maakBackup/);
  });
});

describe('H13 — legacy factuurpad gebruikt formatFactuurnummer_ (F000001)', () => {
  const triggers = lees('src/Triggers.gs');
  test('geen string-concat prefix+nr meer voor Factuurnummer-kolom', () => {
    expect(triggers).not.toMatch(/getInstelling_\('Factuurprefix'\) \+ factuurNr/);
  });
});

describe('B7 — gidsen als directory/index.html (canonical = fysieke URL)', () => {
  test('alle gids-canonicals hebben een bijbehorende index.html op schijf', () => {
    const gidsDir = path.resolve(__dirname, '../../website/gids');
    const entries = fs.readdirSync(gidsDir, { withFileTypes: true });
    const losseHtml = entries.filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html');
    expect(losseHtml.map((e) => e.name)).toEqual([]);
    const dirs = entries.filter((e) => e.isDirectory());
    expect(dirs.length).toBeGreaterThanOrEqual(34);
    dirs.forEach((d) => {
      expect(fs.existsSync(path.join(gidsDir, d.name, 'index.html'))).toBe(true);
    });
  });
  test('sitemap gids-URLs matchen de directory-structuur', () => {
    const sitemap = lees('website/sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>https:\/\/www\.boekhoudbaar\.nl\/gids\/([a-z0-9-]+)\/<\/loc>/g)];
    expect(locs.length).toBeGreaterThanOrEqual(34);
    locs.forEach((m) => {
      expect(fs.existsSync(path.resolve(__dirname, '../../website/gids', m[1], 'index.html'))).toBe(true);
    });
  });
});

describe('B8 — geen BV-belofte meer in fit-lijst en schema', () => {
  test('vergelijking: BV expliciet onder "werkt níet voor"', () => {
    const verg = lees('website/vergelijking/index.html');
    expect(verg).not.toMatch(/Kleine BV met 1 administratie/);
    expect(verg).toMatch(/geen VPB-aangifte, DGA-loon of loonadministratie/);
  });
  test('homepage-schema audienceType zonder "kleine BV"', () => {
    const idx = lees('website/index.html');
    expect(idx).not.toMatch(/audienceType.*kleine BV/);
  });
});

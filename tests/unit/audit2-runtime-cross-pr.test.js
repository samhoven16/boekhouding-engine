/**
 * tests/unit/audit2-runtime-cross-pr.test.js
 *
 * Audit-vondsten ronde 2 — 5 GAS-runtime + cross-PR fixes in 1 PR:
 *
 *   1. EmailQuotaGuard: bij niveau OP / resterend <= 2 SKIP de waarschuwings-
 *      mail om laatste quota-slot te reserveren voor herinneringen + facturen
 *   2. SelfHeal step (triggerSelfHeal) verplaatst naar EINDE van
 *      dagelijkseTaken — beperkt blast-radius bij sanitize-recreate fail
 *   3. _pingAlleHealthchecks_ gebruikt nu UrlFetchApp.fetchAll (concurrent)
 *      i.p.v. sequentieel forEach — was 120s budget-burn bij 2 dode URLs
 *   4. markeerVervallenFacturen_ batched via getRangeList i.p.v. per-rij
 *      setValue+setBackground (was 4s overhead bij 5k facturen / 200 hits)
 *   5. cleanupHerinneringsStap nieuwe nachtelijke taak — verwijdert keys
 *      voor facturen > 2 jaar oud (voorkomt ScriptProperties quota-cliff)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const triggers = fs.readFileSync(path.join(ROOT, 'src/Triggers.gs'), 'utf8');
const quota    = fs.readFileSync(path.join(ROOT, 'src/EmailQuotaGuard.gs'), 'utf8');

describe('Fix #1 — EmailQuotaGuard skip bij OP / <=2 resterend', () => {
  test('Skip-pad bestaat met juiste drempel', () => {
    expect(quota).toMatch(/status\.niveau === ['"]OP['"] \|\| status\.resterend <= 2/);
  });

  test('Bij skip wordt idempotency-flag wel gezet (SKIP_QUOTA marker)', () => {
    expect(quota).toMatch(/SKIP_QUOTA/);
    expect(quota).toMatch(/setProperty\(_EMAIL_QUOTA_WAARSCHUWING_PROP, sleutel \+ ['"]:SKIP_QUOTA['"]\)/);
  });

  test('Skip wordt geaudit-logd met reden (resterend slots gereserveerd)', () => {
    expect(quota).toMatch(/safeAuditLog_\(['"]EmailQuota mail-SKIP['"]/);
    expect(quota).toMatch(/gereserveerd voor factuur\/herinnering/);
  });

  test('Skip gebeurt vóór de idempotency-check (volgorde-invariant)', () => {
    const skipIdx = quota.indexOf('SKIP_QUOTA');
    const idemIdx = quota.indexOf('if (laatste === sleutel) return');
    expect(skipIdx).toBeGreaterThan(-1);
    expect(idemIdx).toBeGreaterThan(-1);
    expect(skipIdx).toBeLessThan(idemIdx);
  });
});

describe('Fix #2 — triggerSelfHeal naar einde van dagelijkseTaken', () => {
  test('triggerSelfHeal staat EXACT 1× in dagelijkseTaken', () => {
    const matches = triggers.match(/_runTaak_\(['"]triggerSelfHeal['"]/g) || [];
    expect(matches.length).toBe(1);
  });

  test('triggerSelfHeal staat NA dashboard (laatste-positie)', () => {
    const idxDashboard = triggers.indexOf("_runTaak_('dashboard'");
    const idxSelfHeal  = triggers.indexOf("_runTaak_('triggerSelfHeal'");
    expect(idxDashboard).toBeGreaterThan(-1);
    expect(idxSelfHeal).toBeGreaterThan(idxDashboard);
  });

  test('triggerSelfHeal staat vóór de totaleDuur-aggregatie (= laatste taak)', () => {
    const idxSelfHeal = triggers.indexOf("_runTaak_('triggerSelfHeal'");
    const idxTotaal   = triggers.indexOf('const totaleDuur = Date.now() - dagelijksTotaal0');
    expect(idxSelfHeal).toBeLessThan(idxTotaal);
  });

  test('Commentaar verklaart blast-radius reden', () => {
    expect(triggers).toMatch(/blast-radius/);
    expect(triggers).toMatch(/ALLERLAATSTE/);
  });
});

describe('Fix #3 — _pingAlleHealthchecks_ via fetchAll', () => {
  test('Gebruikt UrlFetchApp.fetchAll voor concurrent requests', () => {
    expect(triggers).toMatch(/UrlFetchApp\.fetchAll\(requests\)/);
  });

  test('Requests-array wordt opgebouwd uit URLs met juiste shape', () => {
    expect(triggers).toMatch(/url: url \+ \(suffix \|\| ['"]['"]\)/);
    expect(triggers).toMatch(/muteHttpExceptions: true/);
    expect(triggers).toMatch(/method: ['"]post['"]/);
  });

  test('Fallback naar sequentieel forEach als fetchAll throwt', () => {
    const start = triggers.indexOf('function _pingAlleHealthchecks_');
    const eind = triggers.indexOf('\nfunction ', start + 1);
    const blok = triggers.slice(start, eind);
    expect(blok).toMatch(/fallback naar sequentieel/i);
    expect(blok).toMatch(/urls\.forEach\(function\(url\)/);
  });

  test('Lege URLs-lijst → vroege return (geen fetch-aanroep)', () => {
    const start = triggers.indexOf('function _pingAlleHealthchecks_');
    const eind = triggers.indexOf('\nfunction ', start + 1);
    const blok = triggers.slice(start, eind);
    expect(blok).toMatch(/urls\.length === 0\) return/);
  });

  test('Commentaar legt 60s vs 120s budget-rationale uit', () => {
    expect(triggers).toMatch(/120s budget verbranden/);
    expect(triggers).toMatch(/concurrent/i);
  });
});

describe('Fix #4 — markeerVervallenFacturen_ batched via getRangeList', () => {
  test('Verzamel-fase: teVervallenRijen-array gebouwd vóór writes', () => {
    expect(triggers).toMatch(/const teVervallenRijen = \[\]/);
  });

  test('Batch-writes via getRangeList i.p.v. per-rij setValue', () => {
    expect(triggers).toMatch(/sheet\.getRangeList\(a1List\)/);
    expect(triggers).toMatch(/rangeList\.setValue\(FACTUUR_STATUS\.VERVALLEN\)/);
    expect(triggers).toMatch(/rangeList\.setBackground\(['"]#FFCDD2['"]\)/);
  });

  test('A1-notation gebruikt kolom O (= kolom 15 status)', () => {
    expect(triggers).toMatch(/['"]O['"] \+ rij/);
  });

  test('Vroege return bij 0 hits → 0 sheet-writes', () => {
    const start = triggers.indexOf('function markeerVervallenFacturen_');
    const eind = triggers.indexOf('\nfunction ', start + 1);
    const blok = triggers.slice(start, eind);
    expect(blok).toMatch(/teVervallenRijen\.length === 0\) return/);
  });

  test('Fallback per-rij loop als getRangeList faalt (oude GAS-versie)', () => {
    const start = triggers.indexOf('function markeerVervallenFacturen_');
    const eind = triggers.indexOf('\nfunction ', start + 1);
    const blok = triggers.slice(start, eind);
    expect(blok).toMatch(/fallback per-rij/i);
    expect(blok).toMatch(/teVervallenRijen\.forEach/);
  });
});

describe('Fix #5 — cleanupHerinneringsStap nieuwe nachtelijke taak', () => {
  test('Nieuwe _runTaak_ stap toegevoegd', () => {
    expect(triggers).toMatch(/_runTaak_\(['"]cleanupHerinneringsStap['"]/);
  });

  test('Cutoff van 2 jaar voor factuur-leeftijd', () => {
    const start = triggers.indexOf("_runTaak_('cleanupHerinneringsStap'");
    const blok = triggers.slice(start, start + 2000);
    expect(blok).toMatch(/2 \* 365 \* 24 \* 60 \* 60 \* 1000/);
    expect(blok).toMatch(/tweeJaarMs/);
  });

  test('Bouwt actieveFacturen-set vóór delete (anti-onterechte verwijdering)', () => {
    const start = triggers.indexOf("_runTaak_('cleanupHerinneringsStap'");
    const blok = triggers.slice(start, start + 2000);
    const idxBouw = blok.indexOf('actieveFacturen');
    const idxDelete = blok.indexOf('deleteProperty');
    expect(idxBouw).toBeGreaterThan(-1);
    expect(idxDelete).toBeGreaterThan(idxBouw);
  });

  test('Audit-log bij verwijdering met count', () => {
    const start = triggers.indexOf("_runTaak_('cleanupHerinneringsStap'");
    const blok = triggers.slice(start, start + 2000);
    expect(blok).toMatch(/schrijfAuditLog_\(['"]cleanupHerinneringsStap['"]/);
    expect(blok).toMatch(/\+ verwijderd \+/);
  });

  test('Fail-safe try/catch zodat cleanup nooit dagelijkseTaken breekt', () => {
    const start = triggers.indexOf("_runTaak_('cleanupHerinneringsStap'");
    const blok = triggers.slice(start, start + 2000);
    expect(blok).toMatch(/} catch \(_\) \{ \/\* fail-safe/);
  });
});

describe('Anti-regressie: bestaande functionaliteit intact', () => {
  test('dagelijkseTaken houdt healthcheck-START en healthcheck-END', () => {
    expect(triggers).toMatch(/_pingAlleHealthchecks_\(['"]\/start['"]/);
    expect(triggers).toMatch(/_pingAlleHealthchecks_\(['"]['"]/);
  });

  test('emailVerzonden cleanup-window 180 dagen blijft', () => {
    expect(triggers).toMatch(/180 \* 24 \* 60 \* 60 \* 1000/);
    expect(triggers).toMatch(/cleanupEmailIdem/);
  });

  test('EmailQuotaGuard normale waarschuwing-mail werkt nog (na skip-check)', () => {
    expect(quota).toMatch(/MailApp\.sendEmail|GmailApp\.sendEmail/);
  });
});

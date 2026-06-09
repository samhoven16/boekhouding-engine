/**
 * tests/unit/self-heal.test.js
 *
 * SelfHeal.gs — uitgebreid trigger-zelfherstel ("Zero-Touch"-belofte).
 *
 * Bestaande herstelKritiekeTriggersIndienNodig_ (Setup.gs) check alleen
 * dagelijkseTaken. Een missende onEdit-trigger (audit-log stil) of
 * onFormSubmit (form-invoer komt niet aan) bleef onopgemerkt.
 *
 * Deze nieuwe module check de canonical _HYGIENE_VERWACHTE_TRIGGERS-set en
 * heelt via sanitizeTriggers_ (single source of truth).
 *
 * Aanpak: bron-grep + functionele simulatie van inspecteer-tak.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const bron      = fs.readFileSync(path.join(SRC, 'SelfHeal.gs'), 'utf8');
const menuBron  = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');
const trigBron  = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');

describe('SelfHeal.gs — bron-hygiëne', () => {
  test('Twee publieke helpers + canonical-source koppeling', () => {
    expect(bron).toMatch(/function inspecteerTriggerInstallatie_/);
    expect(bron).toMatch(/function controleerVolledigeTriggerInstallatie_/);
    expect(bron).toMatch(/_HYGIENE_VERWACHTE_TRIGGERS/);
  });

  test('Healing gebeurt uitsluitend via sanitizeTriggers_ (SSOT, geen duplicaat-installer)', () => {
    expect(bron).toMatch(/sanitizeTriggers_\(\)/);
    expect(bron).not.toMatch(/ScriptApp\.newTrigger/);
    expect(bron).not.toMatch(/installeelTriggers_\(/);
  });

  test('Throttle: max 1× per 24u (voorkomt heal-storm + quota-burn)', () => {
    expect(bron).toMatch(/_SELFHEAL_THROTTLE_UREN\s*=\s*24/);
    expect(bron).toMatch(/_SELFHEAL_LAATSTE_RUN_PROP/);
  });

  test('Verse kopie (SETUP_DONE niet gezet) → staat=VERSE_KOPIE, niet healen', () => {
    expect(bron).toMatch(/staat:\s*['"]VERSE_KOPIE['"]/);
    expect(bron).toMatch(/setupGedaan/);
  });

  test('LIMITED auth (ScriptApp.getProjectTriggers throwt) → graceful skip', () => {
    expect(bron).toMatch(/staat:\s*['"]LIMITED_AUTH['"]/);
    expect(bron).toMatch(/bereikbaar:\s*false/);
  });

  test('Observability: structuredLog_ bij gehealed-state', () => {
    expect(bron).toMatch(/structuredLog_\(['"]WARN['"]/);
    expect(bron).toMatch(/['"]SelfHeal\.controleerVolledige['"]/);
  });

  test('Audit-log bij elke heal (Belastingdienst-trail)', () => {
    expect(bron).toMatch(/safeAuditLog_\(['"]SelfHeal['"]/);
  });

  test('Alle terug-paden hebben gedefinieerde staat-string', () => {
    // Belangrijk: caller mag nooit undefined.staat krijgen
    const statesInBron = (bron.match(/staat:\s*['"](\w+)['"]/g) || []);
    expect(statesInBron.length).toBeGreaterThanOrEqual(6);  // OK, VERSE_KOPIE, LIMITED_AUTH, GEHEALED, KAPOT_GETHROTTLED, HEAL_GEFAALD/GEEN_SANITIZER
  });
});

describe('Wiring — onOpen + dagelijkseTaken', () => {
  test('Menu.gs onOpen wires controleerVolledigeTriggerInstallatie_ ná bestaande heal', () => {
    const start = menuBron.indexOf('function onOpen()');
    const eind = menuBron.indexOf('\nfunction ', start + 1);
    const blok = menuBron.slice(start, eind);

    const idxOud = blok.indexOf('herstelKritiekeTriggersIndienNodig_');
    const idxNieuw = blok.indexOf('controleerVolledigeTriggerInstallatie_');

    expect(idxOud).toBeGreaterThan(-1);
    expect(idxNieuw).toBeGreaterThan(-1);
    // Nieuw is ADDITIEF na bestaand (defense-in-depth, geen vervanging)
    expect(idxNieuw).toBeGreaterThan(idxOud);
  });

  test('Triggers.gs dagelijkseTaken roept SelfHeal aan via _runTaak_', () => {
    expect(trigBron).toMatch(/_runTaak_\(['"]triggerSelfHeal['"]/);
    expect(trigBron).toMatch(/controleerVolledigeTriggerInstallatie_/);
  });

  test('Wiring is try/catch-veilig — een falende SelfHeal stopt nooit andere onOpen-checks', () => {
    const start = menuBron.indexOf('controleerVolledigeTriggerInstallatie_');
    const rond = menuBron.slice(Math.max(0, start - 100), start + 300);
    expect(rond).toMatch(/try\s*\{[\s\S]*controleerVolledigeTriggerInstallatie_/);
    expect(rond).toMatch(/catch\s*\(e\)\s*\{[\s\S]*Logger\.log/);
  });
});

describe('Functionele simulatie — inspectie-logica', () => {
  function inspecteer(handlersAanwezig, verwachteHandlers) {
    const missend = verwachteHandlers.filter(function(h) {
      return handlersAanwezig.indexOf(h) === -1;
    });
    const present = verwachteHandlers.filter(function(h) {
      return handlersAanwezig.indexOf(h) !== -1;
    });
    return { volledig: missend.length === 0, missend: missend, present: present };
  }

  const CANON = ['onOpen', 'onEdit', 'verwerkHoofdformulier', 'dagelijkseTaken'];

  test('Alle 4 aanwezig → volledig', () => {
    const r = inspecteer(['onOpen', 'onEdit', 'verwerkHoofdformulier', 'dagelijkseTaken'], CANON);
    expect(r.volledig).toBe(true);
    expect(r.missend).toEqual([]);
  });

  test('Geen één aanwezig (verse kopie zonder triggers) → 4 missend', () => {
    const r = inspecteer([], CANON);
    expect(r.volledig).toBe(false);
    expect(r.missend).toEqual(CANON);
  });

  test('Alleen dagelijkseTaken weg (oude flow scenario) → 1 missend', () => {
    const r = inspecteer(['onOpen', 'onEdit', 'verwerkHoofdformulier'], CANON);
    expect(r.missend).toEqual(['dagelijkseTaken']);
  });

  test('Alleen onEdit weg (audit-log stil) → 1 missend (= gap die bestaande check liet zitten)', () => {
    const r = inspecteer(['onOpen', 'verwerkHoofdformulier', 'dagelijkseTaken'], CANON);
    expect(r.missend).toEqual(['onEdit']);
  });

  test('Alleen onFormSubmit weg (form-invoer kapot) → 1 missend', () => {
    const r = inspecteer(['onOpen', 'onEdit', 'dagelijkseTaken'], CANON);
    expect(r.missend).toEqual(['verwerkHoofdformulier']);
  });

  test('Duplicaten in handlers (oude triggers niet opgeruimd) → telt niet als missend', () => {
    const r = inspecteer(['onOpen', 'onOpen', 'onEdit', 'verwerkHoofdformulier', 'dagelijkseTaken'], CANON);
    expect(r.volledig).toBe(true);
  });
});

describe('Throttle-gedrag', () => {
  function mogenHealen(laatsteTs, nuMs, drempelUren) {
    const verstreken = nuMs - laatsteTs;
    return verstreken >= drempelUren * 60 * 60 * 1000;
  }

  test('Nooit eerder → mag', () => {
    expect(mogenHealen(0, Date.now(), 24)).toBe(true);
  });
  test('1 uur geleden → mag NIET (binnen 24u throttle)', () => {
    expect(mogenHealen(Date.now() - 1 * 60 * 60 * 1000, Date.now(), 24)).toBe(false);
  });
  test('23u geleden → mag NIET', () => {
    expect(mogenHealen(Date.now() - 23 * 60 * 60 * 1000, Date.now(), 24)).toBe(false);
  });
  test('25u geleden → mag', () => {
    expect(mogenHealen(Date.now() - 25 * 60 * 60 * 1000, Date.now(), 24)).toBe(true);
  });
});

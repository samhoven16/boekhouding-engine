/**
 * tests/unit/audit2-fiscaal-high.test.js
 *
 * Audit-vondst ronde 2 (accountant + Belastingdienst):
 *
 *   1. Periode-ontgrendeling te makkelijk (1 YES-klik) — niet defensible
 *      bij art. 52 AWR-controle. Nu: 3-staps-flow met type-bevestiging +
 *      motivatie ≥ 20 chars + audit-log.
 *   2. I₇ monotonie waarschuwt maar blokkeert niet — TODO-marker in
 *      FormeelBewijs.gs voor vervolg-PR (vereist UI-redesign in
 *      Verkoopfacturen-flow).
 *   3. Inkoopfactuur bijlage-koppeling niet verplicht — TODO-marker in
 *      BTW.gs voor vervolg-PR (vereist berekenBtwAangifte_ uitbreiding).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const boekingen = fs.readFileSync(path.join(ROOT, 'src/Boekingen.gs'), 'utf8');
const bewijs    = fs.readFileSync(path.join(ROOT, 'src/FormeelBewijs.gs'), 'utf8');
const btw       = fs.readFileSync(path.join(ROOT, 'src/BTW.gs'), 'utf8');

describe('Fix #1 — beheerGeslotenPeriodes 3-staps motiveer-flow', () => {
  const start = boekingen.indexOf('function beheerGeslotenPeriodes(');
  const eind = boekingen.indexOf('\nfunction ', start + 1);
  const blok = boekingen.slice(start, eind);

  test('Drie aparte stappen aanwezig (intent + motivatie + samenvatting)', () => {
    expect(blok).toMatch(/stap 1 van 3/);
    expect(blok).toMatch(/stap 2 van 3/);
    expect(blok).toMatch(/stap 3 van 3/);
  });

  test('Stap 1: klant moet EXACT periode-label typen (typo-resistant)', () => {
    expect(blok).toMatch(/Type EXACT de periode-naam/);
    expect(blok).toMatch(/!== periode\.label/);
  });

  test('Mismatch in stap 1 → actie afgebroken, geen ontgrendeling', () => {
    expect(blok).toMatch(/periode-naam kwam niet exact overeen[\s\S]*afgebroken/);
  });

  test('Stap 2: motivatie ≥ 20 chars verplicht', () => {
    expect(blok).toMatch(/min 20 tekens/);
    expect(blok).toMatch(/motivatie\.length < 20/);
    expect(blok).toMatch(/Motivatie te kort/);
  });

  test('Stap 2: motivatie-prompt verwijst naar art. 52 AWR (juridische context)', () => {
    expect(blok).toMatch(/art\. 52 AWR/);
  });

  test('Stap 3: bevestiging toont samenvatting met motivatie-snippet', () => {
    expect(blok).toMatch(/Periode:\s+\$\{periode\.label\}/);
    expect(blok).toMatch(/Motivatie:\s+\$\{motivatie\.slice\(0, 200\)\}/);
  });

  test('Bij succes: schrijfAuditLog_ met PERIODE_ONTGRENDELD + motivatie', () => {
    expect(blok).toMatch(/schrijfAuditLog_\(['"]PERIODE_ONTGRENDELD['"]/);
    expect(blok).toMatch(/motivatie=['"] \+ motivatie/);
  });

  test('Motivatie wordt gecapped op 400 chars in audit-log (ScriptProperties 9KB safety)', () => {
    expect(blok).toMatch(/motivatie\.slice\(0, 400\)/);
  });

  test('Eind-alert noemt AuditLog locatie zodat klant weet waar bewijs staat', () => {
    expect(blok).toMatch(/staat in AuditLog/i);
  });

  test('Cancel op elke stap = geen ontgrendeling (3 ui.Button.OK-check guards)', () => {
    const okChecks = (blok.match(/getSelectedButton\(\) !== ui\.Button\.OK/g) || []).length;
    expect(okChecks).toBeGreaterThanOrEqual(3);  // 3 prompts × cancel-check
  });
});

describe('TODO-markers voor vervolg-PRs (I₇ + bijlage)', () => {
  test('FormeelBewijs.gs heeft TODO over I₇ blokkering in factuur-creatie', () => {
    const start = bewijs.indexOf('function _bewijs_I7_factuurnummerMonotoon_');
    const eind = bewijs.indexOf('\nfunction ', start + 1);
    const blok = bewijs.slice(start, eind);
    expect(blok).toMatch(/TODO audit-ronde 2/);
    expect(blok).toMatch(/blokkeert nu[\s\S]*niet in de factuur-creatie/);
    expect(blok).toMatch(/Belastingdienst/);
  });

  test('BTW.gs heeft TODO over inkoopfactuur bijlage-verificatie', () => {
    expect(btw).toMatch(/TODO audit-ronde 2/);
    expect(btw).toMatch(/Drive-bijlage-link/);
    expect(btw).toMatch(/art\. 15 Wet OB/);
  });
});

describe('Anti-regressie: bestaande gesloten-periode-logic blijft', () => {
  test('_leesGeslotenPeriodes_ self-healing parse blijft aangeroepen', () => {
    const start = boekingen.indexOf('function beheerGeslotenPeriodes(');
    const blok = boekingen.slice(start, start + 500);
    expect(blok).toMatch(/_leesGeslotenPeriodes_\(\)/);
  });

  test('Lege lijst → vroege return met juiste alert', () => {
    const start = boekingen.indexOf('function beheerGeslotenPeriodes(');
    const blok = boekingen.slice(start, start + 800);
    expect(blok).toMatch(/periodes\.length === 0/);
    expect(blok).toMatch(/geen vergrendelde periodes/);
  });

  test('GESLOTEN_PERIODES ScriptProperty wordt nog steeds bijgewerkt na ontgrendeling', () => {
    const start = boekingen.indexOf('function beheerGeslotenPeriodes(');
    const eind = boekingen.indexOf('\nfunction ', start + 1);
    const blok = boekingen.slice(start, eind);
    expect(blok).toMatch(/setProperty\(['"]GESLOTEN_PERIODES['"]/);
  });
});

describe('Functionele simulatie — 3-stap-validatie logic', () => {
  function valideerMotivatie(tekst) {
    const trimmed = String(tekst || '').trim();
    if (trimmed.length < 20) return { ok: false, fout: 'te kort' };
    return { ok: true };
  }

  function valideerLabelMatch(ingegeven, verwacht) {
    return String(ingegeven || '').trim() === verwacht;
  }

  test('Label-match: exacte typo wordt afgewezen', () => {
    expect(valideerLabelMatch('Q4 2025 ', 'Q4 2025')).toBe(true);  // trim
    expect(valideerLabelMatch('q4 2025', 'Q4 2025')).toBe(false);  // case
    expect(valideerLabelMatch('Q4-2025', 'Q4 2025')).toBe(false);  // separator
  });

  test('Motivatie: lengte-grens 20 chars', () => {
    expect(valideerMotivatie('Te kort').ok).toBe(false);
    expect(valideerMotivatie('Precies 20 tekens-x').ok).toBe(false);  // 19
    expect(valideerMotivatie('Precies 20 tekens-xx').ok).toBe(true);  // 20
    expect(valideerMotivatie('Lange uitleg over waarom deze correctie noodzakelijk was na vondst').ok).toBe(true);
  });
});

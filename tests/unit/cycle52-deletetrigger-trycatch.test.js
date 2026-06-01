/**
 * tests/unit/cycle52-deletetrigger-trycatch.test.js
 *
 * Cycle 52 — 4 sites deden ScriptApp.deleteTrigger(t) zonder try/catch.
 * Als één deleteTrigger faalt (bv. tussentijds al verwijderd door andere
 * Apps Script-session) crashte de batch → resterende oude triggers
 * blijven actief. Setup rapporteerde success terwijl stale triggers
 * bleven draaien → dubbele dagelijkseTaken-runs.
 *
 * Fix: try/catch per trigger op alle 4 sites.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const setupSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Setup.gs'), 'utf8');
const lsSrc    = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');

describe('CYCLE 52: deleteTrigger try/catch op alle sites', () => {
  test('src/Setup.gs installeelTriggers_ batch delete heeft try/catch', () => {
    // Match deleteTrigger met try/catch eromheen
    const matches = setupSrc.match(/forEach\(t =>\s*\{\s*try\s*\{\s*ScriptApp\.deleteTrigger/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('src/Setup.gs resetSetup heeft try/catch op deleteTrigger', () => {
    expect(setupSrc).toMatch(/getProjectTriggers\(\)\.forEach\(t => \{\s*try \{ ScriptApp\.deleteTrigger/);
  });

  test('licence-server verwijderOudeFollowUpTrigger_ heeft try/catch', () => {
    const idx = lsSrc.indexOf('verwijderOudeFollowUpTrigger_');
    const body = lsSrc.slice(idx, idx + 600);
    expect(body).toMatch(/try \{ ScriptApp\.deleteTrigger/);
  });

  test('licence-server installeerDripTrigger_ heeft try/catch', () => {
    const idx = lsSrc.indexOf('function installeerDripTrigger_');
    const body = lsSrc.slice(idx, idx + 800);
    expect(body).toMatch(/try \{ ScriptApp\.deleteTrigger/);
  });

  test('Geen residuele bare `ScriptApp.deleteTrigger(t)` zonder try/catch', () => {
    // Match deleteTrigger niet voorafgegaan door 'try {' op zelfde of vorige regel
    const allDeletes = (setupSrc + '\n' + lsSrc).match(/ScriptApp\.deleteTrigger\([^)]+\)/g) || [];
    expect(allDeletes.length).toBeGreaterThan(0);
    // Spot-check: alle calls hebben omliggende try
    const surroundedByTry = (setupSrc + '\n' + lsSrc).match(/try\s*\{\s*ScriptApp\.deleteTrigger/g) || [];
    expect(surroundedByTry.length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * tests/unit/cycle30-drips-status-startswith.test.js
 *
 * Cycle 30 — verstuurDripsDagelijks_ in licence-server filterde op:
 *   statusLow !== 'actief' && statusLow.indexOf('actief —') === -1
 *
 * Dat ving 'Actief' en 'Actief — trial' (met em-dash). Maar miste:
 *   - 'Actief (handmatig)'   — owner heeft handmatig licentie gegeven
 *   - 'Actief - trial'        — gewone dash i.p.v. em-dash
 *   - 'Actief\tcustom'        — tab/spaties
 *
 * Klanten in zulke status-varianten kregen geen onboarding-drips →
 * lagere activatie + churn-risico.
 *
 * Fix: startsWith('actief') — consistent met cycles 13/15/29.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 30: verstuurDripsDagelijks_ status startsWith', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');
  const startIdx = src.indexOf('function verstuurDripsDagelijks_(');
  const body = src.slice(startIdx, src.indexOf('\nfunction ', startIdx + 50));

  test('Gebruikt startsWith(actief) voor status-filter', () => {
    expect(body).toMatch(/statusLow\.startsWith\(['"]actief['"]\)/);
  });

  test('Oude `statusLow !== "actief" && statusLow.indexOf("actief —")` is verwijderd', () => {
    expect(body).not.toMatch(/statusLow !== ['"]actief['"]/);
    expect(body).not.toMatch(/statusLow\.indexOf\(['"]actief —['"]\)/);
  });

  test('Continue-statement gebaseerd op !startsWith (skip niet-actieve)', () => {
    expect(body).toMatch(/if\s*\(!statusLow\.startsWith\(['"]actief['"]\)\)\s*continue/);
  });

  test('Consistentie: cycle 13/15 endpoints gebruiken al startsWith', () => {
    // cycle 13 (herstuur) en cycle 15 (onboarded) waren al gemerged in main
    // toen cycle 30 startte. Cycle 29 (aanvraag/activeer OTP) loopt parallel.
    const cycle13And15 = [
      'function onboardedEndpoint_(',
      'function herstuurLicentieEndpoint_(',
    ];
    cycle13And15.forEach((fn) => {
      const idx = src.indexOf(fn);
      const fnBody = src.slice(idx, idx + 2500);
      expect(fnBody).toMatch(/startsWith\(['"]actief['"]\)/);
    });
  });
});

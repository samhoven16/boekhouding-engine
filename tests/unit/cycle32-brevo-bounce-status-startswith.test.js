/**
 * tests/unit/cycle32-brevo-bounce-status-startswith.test.js
 *
 * Cycle 32 — Brevo bounce-handler (verwerkBrevoBounce_) deed strict
 * `=== 'actief'` voordat hij Status → 'Bounce' zette. Klanten met:
 *   - 'Actief (handmatig)'
 *   - 'Actief — trial'
 *   - 'Actief - vervolg'
 * werden overgeslagen → bleven 'Actief' in de sheet → drip-handler
 * (na cycle 30 met startsWith) bleef mailen → meer bounces → Brevo
 * sender reputation schadig.
 *
 * Fix: startsWith('actief') — consistent met cycles 13/15/29/30.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 32: Brevo bounce-handler status startsWith', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');

  test('verwerkBrevoBounce_ gebruikt startsWith(actief)', () => {
    const idx = src.indexOf('function verwerkBrevoBounce_(');
    const body = src.slice(idx, src.indexOf('\n}\n', idx) + 2);
    expect(body).toMatch(/data\[i\]\[statusCol\][^)]*\)[^)]*\.toLowerCase\(\)\.startsWith\(['"]actief['"]\)/);
  });

  test('Oude `data[i][statusCol]).toLowerCase() === "actief"` is verwijderd', () => {
    const idx = src.indexOf('function verwerkBrevoBounce_(');
    const body = src.slice(idx, src.indexOf('\n}\n', idx) + 2);
    expect(body).not.toMatch(/String\(data\[i\]\[statusCol\]\)\.toLowerCase\(\)\s*===\s*['"]actief['"]/);
  });

  test('Cell-waarde wordt defensief gecast (`|| \'\'` voor null-safety)', () => {
    const idx = src.indexOf('function verwerkBrevoBounce_(');
    const body = src.slice(idx, src.indexOf('\n}\n', idx) + 2);
    expect(body).toMatch(/data\[i\]\[statusCol\]\s*\|\|\s*['"]['"]/);
  });

  test('Bounce-handler blijft alleen op hard-bounce status zetten', () => {
    const idx = src.indexOf('function verwerkBrevoBounce_(');
    const body = src.slice(idx, src.indexOf('\n}\n', idx) + 2);
    expect(body).toMatch(/bounceStatus === ['"]hard['"]/);
  });

  test('Geen residuele strict === \'actief\' in licence-server (na cycles 29/30/32)', () => {
    // De resterende === 'actief' in cycles 29 + 30 zijn parallel — niet in main.
    // We checken hier alleen dat de Brevo-bounce-handler clean is.
    const idx = src.indexOf('function verwerkBrevoBounce_(');
    const body = src.slice(idx, src.indexOf('\n}\n', idx) + 2);
    expect(body).not.toMatch(/\.toLowerCase\(\)\s*===\s*['"]actief['"]/);
  });
});

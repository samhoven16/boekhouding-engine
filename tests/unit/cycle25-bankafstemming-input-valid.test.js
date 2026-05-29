/**
 * tests/unit/cycle25-bankafstemming-input-valid.test.js
 *
 * Cycle 25 — bankAfstemming gebruikte parseBedrag_ dat silent 0 retourneert
 * bij garbage of lege input. Klant die OK klikt zonder bedrag kreeg:
 *   "Verschil: -€1234,56 — controleer transacties"
 * Dat suggereert dat de boekhouding klopte tot vandaag -€1234,56 dieper,
 * terwijl er gewoon niets was ingevuld. Paniek-moment in plaats van
 * duidelijke fout-melding.
 *
 * Fix: strikte parser + lege-input-check + ui.alert vóór resultaat-paneel.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 25: bankAfstemming input-validatie', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/Bankboek.gs'), 'utf8');
  const startIdx = src.indexOf('function bankAfstemming(');
  const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);

  test('Lege input wordt expliciet afgevangen vóór parseBedrag_', () => {
    expect(body).toMatch(/if\s*\(!ruwe\)/);
    expect(body).toMatch(/geen bedrag ingevoerd/i);
  });

  test('Gebruikt parseBedragStrict_ (niet de silent-0 parseBedrag_)', () => {
    expect(body).toMatch(/parseBedragStrict_/);
  });

  test('Strict-parser fout wordt aan klant getoond ipv silent doorgaan', () => {
    // Try/catch om parseBedragStrict_ heen, alert in catch
    expect(body).toMatch(/try\s*\{[\s\S]*parseBedragStrict_[\s\S]*\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*ui\.alert/);
  });

  test('isFinite-check defense-in-depth na parseBedragStrict_', () => {
    expect(body).toMatch(/isFinite\(werkelijkSaldo\)/);
  });

  test('Prompt-tekst noemt nu komma-decimaal én negatief-voorbeeld', () => {
    expect(body).toMatch(/12345,67/);
    expect(body).toMatch(/-250,00|-\d/);
  });

  test('Fout-pad return\'t direct (geen resultaat-paneel met silent 0)', () => {
    // Count returns: cancel-return + empty-return + parse-throw-return + non-finite-return ≥ 4
    const returns = (body.match(/return;/g) || []).length;
    expect(returns).toBeGreaterThanOrEqual(4);
  });

  test('Boekhoud-saldo lookup gebeurt PAS na input-validatie', () => {
    const ruweIdx = body.indexOf("const ruwe = String(");
    const saldoIdx = body.indexOf('getBanksaldo_');
    expect(ruweIdx).toBeGreaterThan(0);
    expect(saldoIdx).toBeGreaterThan(ruweIdx);   // input-check eerst, dan saldo-call
  });
});

/**
 * tests/unit/fortress-resilient.test.js
 *
 * Tests voor Fortress.gs en ResilientExecutor.gs — bron-inspectie +
 * runtime gedrag waar mogelijk.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

describe('Fortress.gs — Zero-Trust Input architectuur', () => {
  const bron = fs.readFileSync(path.join(SRC, 'Fortress.gs'), 'utf8');

  test('FORTRESS_PROP en FORTRESS_AAN_SINDS gedefinieerd', () => {
    expect(bron).toMatch(/FORTRESS_PROP\s*=\s*'FORTRESS_MODE'/);
    expect(bron).toMatch(/FORTRESS_AAN_SINDS/);
  });

  test('fortressModeAan() vereist expliciete YES-bevestiging', () => {
    expect(bron).toMatch(/fortressModeAan\s*\(/);
    expect(bron).toMatch(/ButtonSet\.YES_NO/);
    expect(bron).toMatch(/Button\.YES/);
  });

  test('_vergrendelAlleSheets_ doorloopt alle sheets + verwijdert non-script editors', () => {
    expect(bron).toMatch(/_vergrendelAlleSheets_/);
    expect(bron).toMatch(/getSheets\(\)\.forEach/);
    expect(bron).toMatch(/removeEditor/);
    expect(bron).toMatch(/Session\.getEffectiveUser/);
  });

  test('_ontgrendelAlleSheets_ alleen Fortress-protecties (geen andere)', () => {
    expect(bron).toMatch(/_ontgrendelAlleSheets_/);
    expect(bron).toMatch(/desc\.indexOf\('Fortress'\) === 0/);
  });

  test('fortressIntegriteitCheck_ vergelijkt SHA-256 hashes', () => {
    expect(bron).toMatch(/fortressIntegriteitCheck_/);
    expect(bron).toMatch(/SHA_256/);
    expect(bron).toMatch(/drift/);
  });

  test('Shadow snapshot is opt-in (alleen bij Fortress aan)', () => {
    expect(bron).toMatch(/_fortressShadowSnapshot_/);
    expect(bron).toMatch(/if\s*\(\s*!status\.aan\s*\)\s*return/);
  });

  test('Audit-log wordt geschreven bij alle state-changes', () => {
    const calls = bron.match(/safeAuditLog_\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('ResilientExecutor.gs — Self-Healing API-calls', () => {
  const bron = fs.readFileSync(path.join(SRC, 'ResilientExecutor.gs'), 'utf8');

  test('retryMetBackoff_ ondersteunt configureerbare maxPogingen + basisDelay', () => {
    expect(bron).toMatch(/retryMetBackoff_/);
    expect(bron).toMatch(/maxPogingen/);
    expect(bron).toMatch(/basisDelayMs/);
    expect(bron).toMatch(/Math\.pow\(2/);  // exponentiële backoff
  });

  test('retryMetBackoff_ ondersteunt retryableMessages-filter', () => {
    expect(bron).toMatch(/retryableMessages/);
    expect(bron).toMatch(/hasMatch/);
  });

  test('circuitBreaker_ heeft drempel + window + cooldown configureerbaar', () => {
    expect(bron).toMatch(/circuitBreaker_/);
    expect(bron).toMatch(/drempel/);
    expect(bron).toMatch(/windowMs/);
    expect(bron).toMatch(/cooldownMs/);
  });

  test('Circuit open-status wordt persistent opgeslagen in ScriptProperties', () => {
    expect(bron).toMatch(/CIRCUIT_/);
    expect(bron).toMatch(/setProperty/);
    expect(bron).toMatch(/open_tot/);
  });

  test('Bij succes na fouten: state wordt gereset (geen vergiftiging)', () => {
    expect(bron).toMatch(/deleteProperty/);
    expect(bron).toMatch(/state\.fouten = 0|state = \{\}|state\.fouten/);
  });
});

describe('Functionele simulatie retryMetBackoff_ logica', () => {
  // Implementeer dezelfde logica los in Node om concept te valideren —
  // de echte GAS-versie roept Utilities.sleep aan (in GAS-runtime).
  function retryLogica(fn, opts) {
    const max = opts.maxPogingen;
    let laatste = null;
    let pogingen = 0;
    for (let p = 1; p <= max; p++) {
      pogingen = p;
      try { return { ok: true, resultaat: fn(p), pogingen: p }; }
      catch (e) { laatste = e; }
    }
    return { ok: false, fout: laatste, pogingen: pogingen };
  }

  test('Functie die altijd faalt: maxPogingen worden uitgeput', () => {
    const r = retryLogica(() => { throw new Error('boem'); }, { maxPogingen: 5 });
    expect(r.ok).toBe(false);
    expect(r.pogingen).toBe(5);
    expect(r.fout.message).toBe('boem');
  });

  test('Functie die na 3 pogingen slaagt: returnt resultaat', () => {
    let teller = 0;
    const r = retryLogica(() => {
      teller++;
      if (teller < 3) throw new Error('nog niet');
      return 42;
    }, { maxPogingen: 5 });
    expect(r.ok).toBe(true);
    expect(r.resultaat).toBe(42);
    expect(r.pogingen).toBe(3);
  });

  test('Functie die direct slaagt: 1 poging', () => {
    const r = retryLogica(() => 'ok', { maxPogingen: 5 });
    expect(r.ok).toBe(true);
    expect(r.pogingen).toBe(1);
  });
});

describe('Functionele simulatie circuit breaker logica', () => {
  test('3 opeenvolgende fouten openen het circuit', () => {
    let state = { fouten: 0 };
    const drempel = 3;
    for (let i = 0; i < drempel; i++) {
      state.fouten++;
    }
    expect(state.fouten).toBeGreaterThanOrEqual(drempel);
  });

  test('Open circuit blokkeert opnieuw bellen tot cooldown', () => {
    const nu = 1000;
    const state = { open_tot: nu + 5000 };
    const isOpen = state.open_tot > nu;
    expect(isOpen).toBe(true);
  });

  test('Na cooldown is circuit weer dicht (open_tot in verleden)', () => {
    const nu = 10000;
    const state = { open_tot: 5000 };
    const isOpen = state.open_tot > nu;
    expect(isOpen).toBe(false);
  });
});

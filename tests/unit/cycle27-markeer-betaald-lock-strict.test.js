/**
 * tests/unit/cycle27-markeer-betaald-lock-strict.test.js
 *
 * Cycle 27 — markeerVerkoopfactuurBetaald had `const gotLock = lock.tryLock(30000)`
 * maar checkte het resultaat NIET. Bij lock-timeout liep de functie door
 * zonder bescherming → twee parallelle callers (handmatig + bank-CSV-match)
 * konden beide:
 *   1. Idempotency-check passeren (status = VERZONDEN)
 *   2. Hun eigen journaalpost 1200→1100 boeken
 *   3. = €X dubbel afgeboekt op debiteuren = scheef grootboek
 *
 * Fix: bij tryLock-fail → throw met klantvriendelijke melding.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 27: markeerVerkoopfactuurBetaald strict lock', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/Verkoopfacturen.gs'), 'utf8');
  const startIdx = src.indexOf('function markeerVerkoopfactuurBetaald(');
  const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);

  test('tryLock-resultaat wordt expliciet gecheckt (geen silent door-loop)', () => {
    expect(body).toMatch(/if\s*\(!gotLock\)/);
  });

  test('Bij lock-fail wordt klantvriendelijke fout gegooid', () => {
    expect(body).toMatch(/if\s*\(!gotLock\)\s*\{[\s\S]*?throw new Error\([^)]*bezig/);
  });

  test('Fout-melding bevat "wacht" of "probeer opnieuw"-instructie', () => {
    const m = body.match(/if\s*\(!gotLock\)\s*\{([\s\S]*?)\}/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/probeer opnieuw|wacht/i);
  });

  test('releaseLock blijft conditioneel op gotLock (no-throw als nooit acquired)', () => {
    // Throw bij !gotLock betekent finally-block release alleen draait als gotLock=true
    expect(body).toMatch(/if\s*\(gotLock\)\s*try\s*\{[^}]*releaseLock/);
  });

  test('30s timeout-waarde blijft behouden (geen ongewenste change)', () => {
    expect(body).toMatch(/tryLock\(30000\)/);
  });
});

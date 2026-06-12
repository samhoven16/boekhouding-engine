/**
 * tests/unit/email-verzonden-cleanup.test.js
 *
 * D1 — cleanupEmailIdem was no-op door type-mismatch. Het waarde-formaat
 * is 'DONE' (legacy) of 'DONE:<ts>' (nieuw) of 'PENDING:<ts>'. De oude
 * cleanup deed new Date(value).getTime() → NaN op alle drie → niks werd
 * verwijderd → high-volume klanten raakten de 500KB ScriptProperties-cap
 * binnen 3 jaar.
 *
 * Audit 2026-06-12.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TRIGGERS = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');
const VF      = fs.readFileSync(path.resolve(__dirname, '../../src/Verkoopfacturen.gs'), 'utf8');

describe('D1: emailVerzonden_ idempotency-cleanup', () => {
  test('Schrijver gebruikt nieuw formaat "DONE:<ts>" (niet plain DONE)', () => {
    // Beide schrijver-sites zijn omgezet
    expect(TRIGGERS).toMatch(/setProperty\(emailIdemKey,\s*'DONE:'\s*\+\s*Date\.now\(\)\)/);
    expect(VF).toMatch(/setProperty\(idemKey,\s*'DONE:'\s*\+\s*Date\.now\(\)\)/);
    // En NIET meer plain 'DONE'
    expect(TRIGGERS).not.toMatch(/setProperty\(emailIdemKey,\s*'DONE'\)/);
    expect(VF).not.toMatch(/setProperty\(idemKey,\s*'DONE'\)/);
  });

  test('Lezers checken prefix "DONE" zodat zowel oud als nieuw formaat dubbel-verzending blokkeert', () => {
    // Triggers.gs en Verkoopfacturen.gs gebruiken indexOf('DONE') === 0
    expect(TRIGGERS).toMatch(/reedsVerzonden\.indexOf\('DONE'\)\s*===\s*0/);
    expect(VF).toMatch(/huidigeMarker\.indexOf\('DONE'\)\s*===\s*0/);
  });

  test('Cleanup parseert nu correct: simulatie van de regex op alle drie waarden', () => {
    const RE = /^(?:DONE|PENDING):(\d{10,})$/;
    const nu = Date.now();
    expect(RE.exec('DONE:' + nu)[1]).toBe(String(nu));
    expect(RE.exec('PENDING:' + nu)[1]).toBe(String(nu));
    // legacy plain 'DONE' geen ts → matcht niet → aparte legacy-tak
    expect(RE.exec('DONE')).toBeNull();
    // ongeldig formaat → matcht niet (geen crash)
    expect(RE.exec('GARBAGE')).toBeNull();
    expect(RE.exec('DONE:abc')).toBeNull();
  });

  test('Cleanup-bron checkt zowel legacy plain-DONE als ts-formaat', () => {
    expect(TRIGGERS).toMatch(/cleanupEmailIdem/);
    expect(TRIGGERS).toMatch(/v\s*===\s*'DONE'/);                  // legacy-tak
    expect(TRIGGERS).toMatch(/\(\?:DONE\|PENDING\):/);              // ts-regex aanwezig
    expect(TRIGGERS).toMatch(/ts < cutoffMs/);
  });

  test('Het oude no-op patroon (new Date(value).getTime()) is weg', () => {
    // De bug: new Date('DONE') = NaN → isFinite(NaN)=false → niks weg.
    expect(TRIGGERS).not.toMatch(/new Date\(alle\[k\]\)\.getTime\(\)/);
  });
});

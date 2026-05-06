/**
 * tests/unit/utils-vertaalFout.test.js
 *
 * vertaalFout_ vertaalt raw GAS Error-objecten naar klant-vriendelijke NL.
 * Centraal: ZZP'er ziet GEEN stack-traces of TypeError-meldingen meer.
 * Audit-log behoudt wel de raw message voor support.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('Utils.gs — vertaalFout_', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Utils.gs']); });

  test('rate-limit message → wachten-suggestie', () => {
    const out = ctx.vertaalFout_(new Error('Service invoked too many times for one day'));
    expect(out).toMatch(/Te veel acties|wacht een minuut/i);
    expect(out).not.toMatch(/Service invoked/i);
  });

  test('permission denied → toegang-uitleg', () => {
    const out = ctx.vertaalFout_(new Error('You do not have permission to perform this action'));
    expect(out).toMatch(/Geen toegang/i);
  });

  test('quota exceeded → workspace-suggestie', () => {
    const out = ctx.vertaalFout_(new Error('Quota exceeded for sendEmail'));
    expect(out).toMatch(/limiet bereikt|Workspace/i);
  });

  test('timeout → internet-uitleg', () => {
    const out = ctx.vertaalFout_(new Error('Script timeout: deadline exceeded'));
    expect(out).toMatch(/duurde te lang|controleer je internet/i);
  });

  test('not found → herlaad-suggestie', () => {
    const out = ctx.vertaalFout_(new Error('File not found'));
    expect(out).toMatch(/niet gevonden|herlaad/i);
  });

  test('TypeError leakage → veilige fallback', () => {
    const out = ctx.vertaalFout_(new Error("Cannot read property 'bedrag' of undefined"));
    expect(out).toMatch(/Ongeldige invoer/i);
    expect(out).not.toMatch(/Cannot read property|undefined/i);
  });

  test('null/undefined input → veilige fallback', () => {
    expect(ctx.vertaalFout_(null)).toMatch(/iets mis|probeer opnieuw/i);
    expect(ctx.vertaalFout_(undefined)).toMatch(/iets mis|probeer opnieuw/i);
    expect(ctx.vertaalFout_('')).toMatch(/iets mis|probeer opnieuw/i);
  });

  test('NL business-error blijft behouden', () => {
    // Eigen NL-foutmeldingen (door onze code via throw gegooid) niet vervangen door generic
    const out = ctx.vertaalFout_(new Error('Korting mag niet groter zijn dan totaal regels.'));
    expect(out).toMatch(/Korting/i);
  });
});

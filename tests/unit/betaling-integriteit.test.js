/**
 * tests/unit/betaling-integriteit.test.js
 *
 * Regressie-tests voor compensating-rollback flow in markeerVerkoopfactuurBetaald
 * + controleerBetalingsIntegriteit_ in GezondheidCheck.
 *
 * Het catastrofe-scenario dat we voorkomen:
 *   1. Klant klikt "Markeer betaald"
 *   2. setValue van status BETAALD lukt
 *   3. maakJournaalpost_ throwt (quota / netwerk / corrupt sheet)
 *   4. Factuur staat als BETAALD maar zonder tegenboeking → balans loopt scheef
 *
 * Met compensating rollback: op fail in stap 3 → status terugzetten naar oud.
 * Met integriteit-check: gezondheidscheck detecteert eventuele resterende mismatches.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

describe('controleerBetalingsIntegriteit_ (GezondheidCheck.gs)', () => {
  let ctx;

  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'GezondheidCheck.gs']);
  });

  // Verkoopfactuur-rij: 0=ID, 1=factuurnr, 14=status
  function vfRij(factuurnr, status) {
    const r = new Array(20).fill('');
    r[1] = factuurnr;
    r[14] = status;
    return r;
  }

  // Journaalpost-rij: 4=debet, 6=credit, 9=ref
  function jpRij(debet, credit, ref) {
    const r = new Array(15).fill('');
    r[4] = debet;
    r[6] = credit;
    r[9] = ref;
    return r;
  }

  function maakMockSs(vfRijen, jpRijen) {
    const HEADER = new Array(20).fill('');
    return {
      getSheetByName: jest.fn((naam) => {
        if (naam === 'Verkoopfacturen') {
          return { getDataRange: () => ({ getValues: () => [HEADER, ...vfRijen] }) };
        }
        if (naam === 'Journaalposten') {
          return { getDataRange: () => ({ getValues: () => [HEADER, ...jpRijen] }) };
        }
        return null;
      }),
    };
  }

  test('alle BETAALD-facturen hebben journaalpost → status OK', () => {
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Betaald'), vfRij('F2026-002', 'Betaald')],
      [jpRij('1200', '1100', 'F2026-001'), jpRij('1200', '1100', 'F2026-002')]
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('OK');
    expect(r.bericht).toMatch(/journaalpost/i);
  });

  test('BETAALD factuur zonder journaalpost → status FOUT met factuurnummer', () => {
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Betaald'), vfRij('F2026-002', 'Betaald')],
      [jpRij('1200', '1100', 'F2026-001')]
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('FOUT');
    expect(r.bericht).toMatch(/F2026-002/);
  });

  test('OPEN facturen worden niet meegerekend in check', () => {
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Open'), vfRij('F2026-002', 'Verzonden')],
      []
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('OK');
  });

  test('GECREDITEERD facturen worden niet als BETAALD beoordeeld', () => {
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Gecrediteerd')],
      []
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('OK');
  });

  test('journaalpost met verkeerde rekeningen (geen 1200→1100) → niet als match', () => {
    // bv. iemand boekt handmatig 7000 → 1100 voor zelfde factuur
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Betaald')],
      [jpRij('7000', '1100', 'F2026-001')]  // verkeerde rekeningen
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('FOUT');  // detecteert geen 1200→1100
  });

  test('cap op 10 ontbrekende facturen — voorkomt timeout bij grote SS', () => {
    const vele = [];
    for (let i = 1; i <= 15; i++) {
      vele.push(vfRij('F2026-' + String(i).padStart(3, '0'), 'Betaald'));
    }
    const ss = maakMockSs(vele, []);  // geen journaalposten
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('FOUT');
    // Bericht toont eerste 5 + "(+meer)" indicator
    expect(r.bericht).toMatch(/\+meer/);
  });

  test('null sheets → geen crash, return OK (graceful degradation)', () => {
    const ss = { getSheetByName: jest.fn(() => null) };
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('OK');
    expect(r.bericht).toMatch(/overgeslagen/i);
  });

  test('lege ref op journaalpost wordt niet gematcht', () => {
    const ss = maakMockSs(
      [vfRij('F2026-001', 'Betaald')],
      [jpRij('1200', '1100', '')]  // lege ref
    );
    const r = ctx.controleerBetalingsIntegriteit_(ss);
    expect(r.status).toBe('FOUT');
  });
});

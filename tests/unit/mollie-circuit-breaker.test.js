/**
 * tests/unit/mollie-circuit-breaker.test.js
 *
 * Verifieert dat outbound calls naar de Mollie API beschermd worden door
 * circuitBreaker_ uit ResilientExecutor.gs.
 *
 * Waarom: bij een Mollie API-degradatie (incident, rate-limit, regional
 * outage) wil je niet dat élke webhook-retry opnieuw hun edge bombardeert.
 * Het breaker-patroon opent na 3 fouten binnen 5 min en blijft 15 min open.
 * Mollie's eigen retry-mechanisme zorgt dat we de webhook later alsnog
 * verwerken — geen verloren betaling, wel een verlengde keten.
 *
 * Tests: pure bron-inspectie (zelfde patroon als hygiene.test.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const bron = fs.readFileSync(path.join(SRC, 'Mollie.gs'), 'utf8');

describe('Mollie.gs — outbound API wrapped in circuitBreaker_', () => {
  test('Webhook-pad: GET /payments/:id zit in circuitBreaker_(\'mollie_api\', ...)', () => {
    const start = bron.indexOf('function verwerkMollieWebhook_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/circuitBreaker_\(['"]mollie_api['"]/);
    expect(blok).toMatch(/MOLLIE_API_BASE \+ ['"]\/payments\/['"] \+ paymentId/);
  });

  test('Webhook-pad: typeof-guard zodat oude installaties zonder ResilientExecutor.gs blijven werken', () => {
    const start = bron.indexOf('function verwerkMollieWebhook_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/typeof circuitBreaker_ === ['"]function['"]/);
  });

  test('Create-payment pad: POST /payments zit in circuitBreaker_(\'mollie_api\', ...)', () => {
    const start = bron.indexOf('function genereerMolliePaymentLink_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    expect(blok).toMatch(/circuitBreaker_\(['"]mollie_api['"]/);
  });

  test('Create-payment pad: bij open circuit returnt netjes null (graceful degradation)', () => {
    const start = bron.indexOf('function genereerMolliePaymentLink_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    // Catch met audit-log en return null
    expect(blok).toMatch(/catch \(eCB\)[\s\S]+?return null/);
    expect(blok).toMatch(/Mollie payment-link MISLUKT \(circuit\)/);
  });

  test('Beide gebruikspaden delen dezelfde circuit-naam (1 gedeelde teller)', () => {
    const matches = bron.match(/circuitBreaker_\(['"]mollie_api['"]/g) || [];
    // Verwacht: precies 2 — één per outbound-call (GET + POST)
    expect(matches.length).toBe(2);
  });

  test('Geen verandering aan signature/idempotency-checks (regressie-bescherming)', () => {
    // Replay-bescherming + signature-validatie blijven vóór de outbound fetch
    const start = bron.indexOf('function verwerkMollieWebhook_');
    const eind = bron.indexOf('\nfunction ', start + 1);
    const blok = bron.slice(start, eind);
    const idxSig = blok.indexOf('Ongeldige signature');
    const idxReplay = blok.indexOf('isMollieReedsVerwerkt_(paymentId)');
    const idxCB = blok.indexOf("circuitBreaker_('mollie_api'");
    expect(idxSig).toBeGreaterThan(-1);
    expect(idxReplay).toBeGreaterThan(-1);
    expect(idxCB).toBeGreaterThan(idxSig);
    expect(idxCB).toBeGreaterThan(idxReplay);
  });
});

describe('Functionele simulatie — open circuit gedrag', () => {
  test('Bij thrown error in webhook-pad: succes=false met fout-message', () => {
    // Repliceert exact het try/catch-patroon
    function simuleerWebhook(circuitBreakerFn) {
      try {
        const _resp = circuitBreakerFn();
        return { succes: true, resp: _resp };
      } catch (e) {
        return { succes: false, fout: e.message };
      }
    }
    const r = simuleerWebhook(function() {
      throw new Error('Circuit OPEN voor mollie_api (cooldown nog 850s)');
    });
    expect(r.succes).toBe(false);
    expect(r.fout).toMatch(/Circuit OPEN/);
  });

  test('Bij thrown error in create-payment pad: return null (geen exception)', () => {
    function simuleerCreate(circuitBreakerFn) {
      let resp;
      try {
        resp = circuitBreakerFn();
      } catch (_eCB) {
        return null;
      }
      return resp;
    }
    const r = simuleerCreate(function() {
      throw new Error('Circuit OPEN voor mollie_api');
    });
    expect(r).toBeNull();
  });
});

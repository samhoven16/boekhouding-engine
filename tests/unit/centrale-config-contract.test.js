/**
 * tests/unit/centrale-config-contract.test.js
 *
 * Guard (#1 tarief-feed + #3 emergency-signaal): de centrale config-endpoint
 * van de licentieserver is dé hefboom voor langetermijn-onderhoud — Sam updatet
 * tarieven, het kritieke-update-signaal, feature-flags en een broadcast
 * server-side, zónder dat klanten een nieuwe sheet hoeven te kopiëren.
 *
 * Deze test borgt dat dat delivery-contract (de velden die de client verwacht)
 * niet stilletjes wegvalt bij een refactor. Bron-niveau, want de licentieserver
 * draait als apart clasp-project (niet in de jest-runtime).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');
const client = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');

describe('Centrale config-endpoint levert het volledige delivery-contract', () => {
  const fnStart = code.indexOf('function configEndpoint_(');
  const fn = fnStart >= 0 ? code.slice(fnStart, fnStart + 2200) : '';

  test('configEndpoint_ bestaat en is gerouteerd', () => {
    expect(fnStart).toBeGreaterThan(-1);
    // config gaat nu via een globale rateLimit_-cap vóór configEndpoint_
    // (schaal-bescherming: gedeeld endpoint, geraakt door élke klant-kopie).
    expect(code).toMatch(/actie === 'config'\)[^\n]*configEndpoint_/);
    expect(code).toMatch(/actie === 'config'\)[^\n]*rateLimit_/);
  });

  test('serveert belastingTarieven uit een ScriptProperty (centrale tarief-feed #1)', () => {
    expect(fn).toMatch(/belastingTarieven:/);
    expect(code).toMatch(/BELASTING_TARIEVEN/);
  });

  test('serveert het emergency-update-signaal (#3): ernst + kritiek-voor-lijst', () => {
    expect(fn).toMatch(/versieErnst:/);
    expect(fn).toMatch(/versieKritiekVoor:/);
  });

  test('serveert centrale flags + global broadcast', () => {
    expect(fn).toMatch(/flags:/);
    expect(fn).toMatch(/bericht:/);
  });

  test('serveert de warme-standby-URL uit STANDBY_SERVER_URL (F-SCALE-141b)', () => {
    // Zonder dit veld is de standby-push inert: clients lezen cfg.licentieServerUrlFallback.
    expect(fn).toMatch(/licentieServerUrlFallback:/);
    expect(fn).toMatch(/STANDBY_SERVER_URL/);
  });

  test('serveert het centrale Gemini-model uit GEMINI_MODEL_CENTRAAL (F-SCALE-332)', () => {
    // Zonder dit veld is de model-EOL-recovery inert: _geminiModel_ leest cfg.geminiModel.
    expect(fn).toMatch(/geminiModel:/);
    expect(fn).toMatch(/GEMINI_MODEL_CENTRAAL/);
  });

  test('client (getBelasting_) geeft server-tarieven voorrang op de lokale tabel', () => {
    // serverTarieven || BELASTING_PER_JAAR[jaar] || laatstBekend — server eerst.
    expect(client).toMatch(/serverTarieven\s*\n?\s*\|\|\s*BELASTING_PER_JAAR/);
    expect(client).toMatch(/cfg\.belastingTarieven\[jaar\]/);
  });
});

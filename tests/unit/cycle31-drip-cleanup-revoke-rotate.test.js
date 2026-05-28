/**
 * tests/unit/cycle31-drip-cleanup-revoke-rotate.test.js
 *
 * Cycle 31 — `drip_<sleutel>_<vlag>` ScriptProperties keys werden NIET
 * opgeruimd bij revoke of roteer. Accumulatie: 5 drip-vlaggen × N
 * ooit-bestaande sleutels (revoked + roteerd) = lineaire groei in
 * ScriptProperties tot quota-blow (analoog aan cycle 18 voor
 * herhKost_ keys op klant-side).
 *
 * Fix: nieuwe helper _verwijderDripKeys_(sleutel) wordt aangeroepen
 * vanuit revokeEndpoint_ en roteerEndpoint_.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const src = fs.readFileSync(CODE_GS, 'utf8');

describe('CYCLE 31: _verwijderDripKeys_ helper + integratie', () => {
  test('Helper functie is gedefinieerd', () => {
    expect(src).toMatch(/function _verwijderDripKeys_\(sleutel\)/);
  });

  test('revokeEndpoint_ roept _verwijderDripKeys_ aan op de sleutel', () => {
    const revIdx = src.indexOf('function revokeEndpoint_(');
    const body = src.slice(revIdx, src.indexOf('\n}\n', revIdx) + 2);
    expect(body).toMatch(/_verwijderDripKeys_\(sleutel\)/);
  });

  test('roteerEndpoint_ roept _verwijderDripKeys_ aan op de OUDE sleutel', () => {
    const rotIdx = src.indexOf('function roteerEndpoint_(');
    const body = src.slice(rotIdx, src.indexOf('\n}\n', rotIdx) + 2);
    expect(body).toMatch(/_verwijderDripKeys_\(oudeSleutel\)/);
  });

  test('Helper itereert ScriptProperties keys met juiste prefix', () => {
    expect(src).toMatch(/getKeys\(\)/);
    expect(src).toMatch(/drip_[\s\S]{0,50}\+\s*['"]_['"]/);
  });

  test('Helper is wrapped in try/catch (best-effort)', () => {
    const startIdx = src.indexOf('function _verwijderDripKeys_(');
    const body = src.slice(startIdx, src.indexOf('\n}\n', startIdx) + 2);
    expect(body).toMatch(/try\s*\{[\s\S]*\}\s*catch/);
  });
});

describe('CYCLE 31: end-to-end met mock ScriptProperties', () => {
  function maakCtx() {
    const store = {};
    const ctx = createGasRuntime([CODE_GS], {
      PropertiesService: {
        getScriptProperties: () => ({
          getKeys: () => Object.keys(store),
          getProperty: (k) => store[k] || null,
          setProperty: (k, v) => { store[k] = String(v); },
          deleteProperty: (k) => { delete store[k]; },
        }),
      },
    });
    return { ctx, store };
  }

  test('Verwijdert alle drip_<sleutel>_* keys', () => {
    const { ctx, store } = maakCtx();
    store['drip_ABCDE1_d3'] = 'sent';
    store['drip_ABCDE1_d7'] = 'sent';
    store['drip_ABCDE1_d14'] = 'sent';
    store['drip_OTHERKEY_d3'] = 'sent';   // ander sleutel — moet blijven
    store['notDripKey'] = 'keep';
    const r = ctx._verwijderDripKeys_('ABCDE1');
    expect(r).toBe(3);
    expect(store['drip_ABCDE1_d3']).toBeUndefined();
    expect(store['drip_OTHERKEY_d3']).toBe('sent');
    expect(store['notDripKey']).toBe('keep');
  });

  test('Lege of null sleutel → 0, geen crash', () => {
    const { ctx } = maakCtx();
    expect(ctx._verwijderDripKeys_('')).toBe(0);
    expect(ctx._verwijderDripKeys_(null)).toBe(0);
    expect(ctx._verwijderDripKeys_(undefined)).toBe(0);
  });

  test('Case-insensitive: sleutel "abcde1" wist ook "drip_ABCDE1_*"', () => {
    const { ctx, store } = maakCtx();
    store['drip_ABCDE1_d3'] = 'sent';
    const r = ctx._verwijderDripKeys_('abcde1');
    expect(r).toBe(1);
  });

  test('Geen drip-keys → 0', () => {
    const { ctx, store } = maakCtx();
    store['other_key'] = 'x';
    const r = ctx._verwijderDripKeys_('SLEUTEL');
    expect(r).toBe(0);
  });
});

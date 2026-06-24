/**
 * tests/unit/tarief-veroudering.test.js
 *
 * BORGING (bug-klasse 7 — jaar/tarief hardcoded zonder fallback-vlag). Het
 * mechanisme dat voorkomt dat een klant in 2027+ stil met 2026-tarieven
 * doorrekent (TARIEF_VEROUDERD-detectie + waarschuwing) is compleet, maar mag
 * niet stilletjes regresseren over "tientallen jaren". Deze test vergrendelt:
 *   1. detectie: toekomstig/onbekend én placeholder-jaar → TARIEF_VEROUDERD;
 *      bevestigd huidig jaar → GEEN vals alarm;
 *   2. de drie surfacing-paden zijn gewired (hoofd-boekingsflow + fatale-owner-
 *      melding + detectie-flag).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

// Date-mock: `new Date()` → echte Date met getFullYear() geforceerd op `jaar`.
function nepDate(jaar) {
  const R = Date;
  function F() {
    if (arguments.length === 0) {
      const d = new R();
      d.getFullYear = function () { return jaar; };
      return d;
    }
    return new (Function.prototype.bind.apply(R, [null].concat(Array.prototype.slice.call(arguments))))();
  }
  F.now = R.now; F.parse = R.parse; F.UTC = R.UTC; F.prototype = R.prototype;
  return F;
}

function belastingVoorJaar(jaar) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs'], {
    Date: nepDate(jaar),
    getInstelling_: () => null,     // geen klant-overrides
    haalConfigOp_: () => null,      // geen server-tarieven
  });
  return ctx.getBelasting_();
}

describe('klasse 7 — TARIEF_VEROUDERD-detectie', () => {
  test('toekomstig onbekend jaar (2099) → TARIEF_VEROUDERD + fallback-jaar', () => {
    const b = belastingVoorJaar(2099);
    expect(b.TARIEF_VEROUDERD).toBe(true);
    expect(b.TARIEF_FALLBACK_JAAR).toBeGreaterThan(2024);
  });

  test('placeholder-jaar (2027, wacht op Belastingplan) → TARIEF_VEROUDERD', () => {
    expect(belastingVoorJaar(2027).TARIEF_VEROUDERD).toBe(true);
  });

  test('bevestigd huidig jaar (2026) → GEEN verouderd-vlag (geen vals alarm)', () => {
    expect(belastingVoorJaar(2026).TARIEF_VEROUDERD).toBeFalsy();
  });
});

describe('klasse 7 — verouderings-waarschuwing is gewired (anti-regressie)', () => {
  const adv = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');
  const trg = fs.readFileSync(path.resolve(__dirname, '../../src/Triggers.gs'), 'utf8');

  test('detectie zet de vlag bij fallback én placeholder', () => {
    expect(adv).toMatch(/TARIEF_VEROUDERD = true/);
    expect(adv).toMatch(/isPlaceholderJaar/);
  });

  test('waarschuwing gewired in de hoofd-boekingsflow (niet alleen advies-tab)', () => {
    expect(trg).toMatch(/controleerTariefVerouderdWaarschuwing_\(ss\)/);
    expect(adv).toMatch(/function controleerTariefVerouderdWaarschuwing_/);
  });

  test('owner-melding via de altijd-versturende (fatale) route', () => {
    expect(adv).toMatch(/meldFataalAanOwner_\(\s*['"]TARIEF_VEROUDERD['"]/);
  });
});

/**
 * tests/unit/changelog-versie-sync.test.js
 *
 * Guard (#B4.2): de in-app changelog mag niet achterlopen op HUIDIGE_VERSIE.
 * Drift = klant opent "Wat is er nieuw?" en ziet niets over zijn huidige versie
 * → indruk "product staat stil". Deze test faalt als er voor HUIDIGE_VERSIE
 * geen changelog-entry bestaat, zodat de drift nooit meer ongemerkt terugkomt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const onboarding = fs.readFileSync(path.resolve(__dirname, '../../src/Onboarding.gs'), 'utf8');
const changelog = fs.readFileSync(path.resolve(__dirname, '../../src/Changelog.gs'), 'utf8');

describe('Changelog blijft in sync met HUIDIGE_VERSIE', () => {
  test('HUIDIGE_VERSIE is gedefinieerd in semver-formaat', () => {
    expect(onboarding).toMatch(/HUIDIGE_VERSIE\s*=\s*'\d+\.\d+\.\d+'/);
  });

  test('Voor HUIDIGE_VERSIE bestaat een changelog-entry', () => {
    const m = onboarding.match(/HUIDIGE_VERSIE\s*=\s*'([\d.]+)'/);
    expect(m).not.toBeNull();
    const versie = m[1];
    const re = new RegExp(`versie:\\s*'${versie.replace(/\./g, '\\.')}'`);
    expect(changelog).toMatch(re);
  });
});

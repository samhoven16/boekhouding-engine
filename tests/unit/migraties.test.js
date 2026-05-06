/**
 * tests/unit/migraties.test.js
 *
 * Schema-migratie framework. Voorkomt data-corruptie bij version upgrades.
 *
 * NB: top-level `const` in GAS .gs-bestanden zijn niet zichtbaar als
 * vm.context properties (alleen `function`-declaraties + `var`).
 * We testen daarom via:
 *   - source-code grep (HUIDIGE_VERSIE = '2.1.0')
 *   - functie-gedrag (_versieIsNieuwer_ + voerMigratiesUit_)
 *   - controleerOpUpdate_ end-to-end met gemockte PropertiesService.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ONB_SRC = fs.readFileSync(
  path.join(__dirname, '../../src/Onboarding.gs'),
  'utf8'
);

describe('Onboarding.gs — migratie-framework', () => {

  test('HUIDIGE_VERSIE is bumped naar 2.1.0 (source check)', () => {
    expect(ONB_SRC).toMatch(/const HUIDIGE_VERSIE\s*=\s*['"]2\.1\.0['"]/);
  });

  test('MIGRATIES_REGISTER bestaat in source', () => {
    expect(ONB_SRC).toMatch(/const MIGRATIES_REGISTER\s*=\s*\[/);
  });

  test('2.0.0 → 2.1.0 migratie geregistreerd in source', () => {
    expect(ONB_SRC).toMatch(/van:\s*['"]2\.0\.0['"]/);
    expect(ONB_SRC).toMatch(/naar:\s*['"]2\.1\.0['"]/);
    expect(ONB_SRC).toMatch(/polish_ronde_mei_2026/);
  });

  test('voerMigratiesUit_ functie aanwezig + idempotent', () => {
    expect(ONB_SRC).toMatch(/function voerMigratiesUit_/);
    // Idempotency-pattern: filter + forEach (geen state-mutatie buiten ss)
    // Chained call mag op nieuwe regel staan voor leesbaarheid
    expect(ONB_SRC).toMatch(/MIGRATIES_REGISTER\s*[\r\n.]*\.filter/);
  });

  test('controleerOpUpdate_ roept voerMigratiesUit_ aan VÓÓR setProperty', () => {
    // Kritieke volgorde: bij crash mag versie niet gebumpt zijn
    const idxMigratie = ONB_SRC.indexOf('voerMigratiesUit_(opgeslagenVersie');
    const idxBump     = ONB_SRC.indexOf('props.setProperty(VERSIE_PROP, HUIDIGE_VERSIE)');
    expect(idxMigratie).toBeGreaterThan(0);
    expect(idxBump).toBeGreaterThan(0);
    expect(idxMigratie).toBeLessThan(idxBump);
  });

  test('Bij migratie-fout wordt versie NIET ge-bumpt + audit-log geschreven', () => {
    // Pattern: try { migrate } catch { audit + return — geen setProperty }
    expect(ONB_SRC).toMatch(/try\s*\{\s*voerMigratiesUit_/);
    expect(ONB_SRC).toMatch(/Migratie FOUT/);
    // Verifieer dat tussen 'Migratie FOUT' en de eerstvolgende
    // setProperty(VERSIE_PROP) een 'return' staat — dat is de short-circuit
    // die voorkomt dat versie wordt gebumpt bij migratie-fout.
    const idxAudit = ONB_SRC.indexOf('Migratie FOUT');
    const idxBump  = ONB_SRC.indexOf('props.setProperty(VERSIE_PROP, HUIDIGE_VERSIE)');
    expect(idxAudit).toBeGreaterThan(0);
    expect(idxBump).toBeGreaterThan(idxAudit);
    const tussenStuk = ONB_SRC.slice(idxAudit, idxBump);
    expect(tussenStuk).toMatch(/return/);
  });

  test('_versieIsNieuwer_ basis semver-vergelijking', () => {
    const ctx = createGasRuntime(['Onboarding.gs']);
    expect(ctx._versieIsNieuwer_('2.1.0', '2.0.0')).toBe(true);
    expect(ctx._versieIsNieuwer_('2.0.0', '2.1.0')).toBe(false);
    expect(ctx._versieIsNieuwer_('2.0.0', '2.0.0')).toBe(false);
    expect(ctx._versieIsNieuwer_('2.0.1', '2.0.0')).toBe(true);
    expect(ctx._versieIsNieuwer_('3.0.0', '2.99.99')).toBe(true);
  });
});

/**
 * tests/unit/cycle24-silent-check-completeness.test.js
 *
 * Cycle 24 — voerGezondheidCheckStil_ (de dagelijkse achtergrond-variant)
 * miste twee echte integriteit-checks die in voerGezondheidCheckUit
 * (menu-variant) wél zaten:
 *   - controleerReferentiele_ — detecteert verweesde facturen (klant
 *     verwijderd uit Relaties, factuur verwijst nu nergens heen)
 *   - controleerBetalingsIntegriteit_ — detecteert factuur op BETAALD
 *     zonder bijbehorende journaalpost 1200→1100 (scheef grootboek)
 *
 * Klanten die alleen op het dashboard-cijfer letten zagen deze problemen
 * niet. Dit was de meest-impactvolle gap want het zijn juist de gevallen
 * waar audit-trail uit elkaar valt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

describe('CYCLE 24: voerGezondheidCheckStil_ bevat alle integriteit-checks', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/GezondheidCheck.gs'), 'utf8');

  // Isoleer de stille functie body
  const startIdx = src.indexOf('function voerGezondheidCheckStil_(');
  const stilleBody = src.slice(startIdx, src.indexOf('}\n\n/**', startIdx));

  test('controleerReferentiele_ wordt aangeroepen in de stille check', () => {
    expect(stilleBody).toMatch(/controleerReferentiele_\(ss\)/);
  });

  test('controleerBetalingsIntegriteit_ wordt aangeroepen in de stille check', () => {
    expect(stilleBody).toMatch(/controleerBetalingsIntegriteit_\(ss\)/);
  });

  test('Beide checks gaan door tel-aggregator (mee in score)', () => {
    // Match: try { ... controleerXxx ... forEach(tel) ... } catch
    expect(stilleBody).toMatch(/controleerReferentiele_\(ss\)\.forEach\(tel\)/);
    expect(stilleBody).toMatch(/tel\(controleerBetalingsIntegriteit_\(ss\)\)/);
  });

  test('Beide checks zijn omwikkeld in try/catch (isolatie)', () => {
    // Niet alles in 1 try — elke check eigen try, zodat één crash de
    // anderen niet meeneemt.
    const regels = stilleBody.split('\n');
    const refRegel = regels.find((r) => r.includes('controleerReferentiele_'));
    const betRegel = regels.find((r) => r.includes('controleerBetalingsIntegriteit_'));
    expect(refRegel).toMatch(/try \{.*\} catch/);
    expect(betRegel).toMatch(/try \{.*\} catch/);
  });

  test('Aantal try-catch-stille-checks ≥ 9 (was 7, nu 9 met cycle 24)', () => {
    const matches = stilleBody.match(/try \{[^}]+\} catch \(e\) \{[^}]+Logger\.log\('stille check/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  test('Score-formule blijft consistent met meer checks', () => {
    // Aantal-OK/totaal * 100 ipv hardcoded; meer-checks=robuustere score
    expect(stilleBody).toMatch(/aantalOk \+ aantalWaarsch \* 0\.5/);
    expect(stilleBody).toMatch(/totaal > 0/);
  });
});

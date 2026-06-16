/**
 * tests/unit/jaarafsluiting-integriteit.test.js
 *
 * Audit-ronde 2 — jaarafsluiting & periode-slot-integriteit (art. 52 AWR):
 *   F-ACC-002  KRITIEK-balans blokkeert de jaarafsluiting HARD (geen YES-bypass)
 *              → een niet-sluitende balans kan nooit permanent in het archief.
 *   F-ACC-003  sluitJaarAf registreert het afgesloten jaar als gesloten periode
 *              → de I8-immutability-verifier dekt het jaar via GESLOTEN_PERIODES,
 *                onafhankelijk van de losse (verwijderbare) JA-tag.
 *   F-ACC-004  vergrendelPeriode_ omsluit de read-modify-write met LockService
 *              → geen lost write die een periode-slot geruisloos laat verdwijnen.
 *
 * sluitJaarAf is UI-/Drive-zwaar (ss.copy, ui.alert, Drive-mappen); de borging
 * voor F-ACC-002/003 is daarom source-niveau — zelfde aanpak als de bestaande
 * cycle53-test "alle 3 sites routeren via helper". F-ACC-004 is gedrags-getest.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');
const { maakStoreMock } = require('../__helpers__/mocks');

const boekingenSrc = fs.readFileSync(path.resolve(__dirname, '../../src/Boekingen.gs'), 'utf8');
const driveSrc = fs.readFileSync(path.resolve(__dirname, '../../src/DriveStructuur.gs'), 'utf8');

function maakCtx(stored) {
  const store = maakStoreMock(stored ? { GESLOTEN_PERIODES: stored } : {});
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Boekingen.gs'], {
    PropertiesService: { getScriptProperties: () => store },
  });
  return { ctx, store };
}

describe('F-ACC-004 — vergrendelPeriode_ onder LockService', () => {
  test('schrijft de periode weg en is idempotent (geen dubbele)', () => {
    const { ctx, store } = maakCtx(null);
    const van = new Date(2026, 0, 1);
    const tot = new Date(2026, 11, 31, 23, 59, 59, 999);

    ctx.vergrendelPeriode_(van, tot, 'Jaarafsluiting 2026');
    let p = JSON.parse(store.getProperty('GESLOTEN_PERIODES'));
    expect(p).toHaveLength(1);
    expect(p[0].label).toBe('Jaarafsluiting 2026');

    ctx.vergrendelPeriode_(van, tot, 'Jaarafsluiting 2026'); // exact dezelfde periode
    p = JSON.parse(store.getProperty('GESLOTEN_PERIODES'));
    expect(p).toHaveLength(1);
  });

  test('source: read-modify-write zit BINNEN getScriptLock/waitLock/releaseLock', () => {
    const fn = boekingenSrc.slice(
      boekingenSrc.indexOf('function vergrendelPeriode_'),
      boekingenSrc.indexOf('function beheerGeslotenPeriodes')
    );
    expect(fn).toMatch(/LockService\.getScriptLock\(\)/);
    expect(fn).toMatch(/\.waitLock\(/);
    expect(fn).toMatch(/\.releaseLock\(/);
    // de write moet vóór releaseLock vallen — anders is het geen echte sectie
    expect(fn.indexOf('setProperty')).toBeGreaterThan(-1);
    expect(fn.indexOf('setProperty')).toBeLessThan(fn.indexOf('releaseLock'));
  });
});

describe('F-ACC-003 — sluitJaarAf vergrendelt het afgesloten boekjaar', () => {
  test('roept vergrendelPeriode_ aan voor het volledige huidigJaar (1 jan t/m 31 dec)', () => {
    expect(driveSrc).toMatch(/vergrendelPeriode_\(\s*new Date\(huidigJaar, 0, 1\)/);
    expect(driveSrc).toMatch(/new Date\(huidigJaar, 11, 31, 23, 59, 59, 999\)/);
    expect(driveSrc).toMatch(/'Jaarafsluiting ' \+ huidigJaar/);
  });
});

describe('F-ACC-002 — KRITIEK-balans blokkeert jaarafsluiting hard', () => {
  test('geen YES_NO-bypass meer; alleen OK + harde return + audit-log', () => {
    const i = driveSrc.indexOf("balansCheck.status === 'KRITIEK'");
    expect(i).toBeGreaterThan(-1);
    // exact het KRITIEK-blok, tot aan de archiveer-stap — geen latere dialogen meelezen
    const eind = driveSrc.indexOf('// 1. Archiveer', i);
    const blok = driveSrc.slice(i, eind > i ? eind : i + 1300);
    expect(blok).not.toMatch(/YES_NO/);     // bypass-dialog weg
    expect(blok).not.toMatch(/Button\.YES/); // geen JA-tak meer
    expect(blok).toMatch(/ButtonSet\.OK/);   // alleen bevestigen
    expect(blok).toMatch(/GEBLOKKEERD/);     // durable audit-spoor
    expect(blok).toMatch(/\breturn;/);       // harde stop
  });
});

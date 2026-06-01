/**
 * tests/unit/cycle73-trigger-zelfherstel.test.js
 *
 * Cycle 73 — Atomaire/zelfherstellende trigger-installatie.
 *
 * Een partiële fout in installeelTriggers_ kan `dagelijkseTaken` laten
 * ontbreken terwijl SETUP_DONE tóch op 'true' staat. Dan draait de hele
 * automatisering-ruggengraat (backups, reminders, audit-keten #190, Noah's
 * Ark #191, dashboard) stil door — zonder waarschuwing. De bestaande
 * watchdog ziet dit niet (leest de lege Taakstatus-tab → vroege return).
 *
 * herstelKritiekeTriggersIndienNodig_ detecteert de ontbrekende trigger bij
 * onOpen en herstelt automatisch. Deze test dekt de beslis-logica met een
 * gemockte ScriptApp.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

function maakCtx(opts) {
  opts = opts || {};
  const scriptProps = Object.assign({ setupDone: 'true' }, opts.scriptProps || {});
  const userProps = Object.assign({}, opts.userProps || {});
  const toasts = [];
  const auditLogs = [];

  // Trigger-mock: lijst van handler-namen → objecten met getHandlerFunction.
  const triggerHandlers = (opts.handlers || []).slice();
  let getTriggersThrows = !!opts.getTriggersThrows;

  const ctx = createGasRuntime(['Config.gs', 'Setup.gs'], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => { scriptProps[k] = v; },
      }),
      getUserProperties: () => ({
        getProperty: (k) => (k in userProps ? userProps[k] : null),
        setProperty: (k, v) => { userProps[k] = v; },
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => {
        if (getTriggersThrows) throw new Error('LIMITED auth mode');
        return triggerHandlers.map((h) => ({ getHandlerFunction: () => h }));
      },
    },
  });

  // Spy op installeelTriggers_ (vervang de echte zware installer).
  let installCalls = 0;
  ctx.installeelTriggers_ = () => { installCalls += 1; triggerHandlers.push('dagelijkseTaken'); };
  ctx.schrijfAuditLog_ = (actie, det) => auditLogs.push({ actie, det });
  ctx.getSpreadsheet_ = () => ({ toast: (msg, titel) => toasts.push({ msg, titel }) });

  return {
    ctx,
    getInstallCalls: () => installCalls,
    scriptProps, userProps, toasts, auditLogs,
  };
}

describe('CYCLE 73: zelfherstel kritieke trigger', () => {
  test('dagelijkseTaken ontbreekt + setup klaar → herstelt automatisch', () => {
    const h = maakCtx({ handlers: ['onOpen', 'onEdit'] }); // geen dagelijkseTaken
    h.ctx.herstelKritiekeTriggersIndienNodig_();

    expect(h.getInstallCalls()).toBe(1);
    expect(h.toasts.some((t) => /hersteld/i.test(t.msg))).toBe(true);
    expect(h.auditLogs.some((a) => /zelfherstel/i.test(a.actie))).toBe(true);
    // Throttle-timestamp gezet.
    expect(h.userProps.triggerHerstelTs).toBeTruthy();
  });

  test('dagelijkseTaken aanwezig → geen actie', () => {
    const h = maakCtx({ handlers: ['onOpen', 'onEdit', 'dagelijkseTaken'] });
    h.ctx.herstelKritiekeTriggersIndienNodig_();
    expect(h.getInstallCalls()).toBe(0);
    expect(h.toasts).toHaveLength(0);
  });

  test('setup nog niet voltooid → geen actie (niet interfereren met verse install)', () => {
    const h = maakCtx({ scriptProps: { setupDone: null }, handlers: [] });
    h.ctx.herstelKritiekeTriggersIndienNodig_();
    expect(h.getInstallCalls()).toBe(0);
  });

  test('throttle: recente herstel-poging (<24u) → geen tweede poging', () => {
    const h = maakCtx({
      handlers: ['onOpen'],
      userProps: { triggerHerstelTs: String(Date.now() - 3600 * 1000) }, // 1u geleden
    });
    h.ctx.herstelKritiekeTriggersIndienNodig_();
    expect(h.getInstallCalls()).toBe(0);
  });

  test('throttle verlopen (>24u) → herstelt opnieuw', () => {
    const h = maakCtx({
      handlers: ['onOpen'],
      userProps: { triggerHerstelTs: String(Date.now() - 25 * 3600 * 1000) },
    });
    h.ctx.herstelKritiekeTriggersIndienNodig_();
    expect(h.getInstallCalls()).toBe(1);
  });

  test('LIMITED auth-modus (getProjectTriggers throwt) → stil afvangen, geen throw', () => {
    const h = maakCtx({ getTriggersThrows: true });
    expect(() => h.ctx.herstelKritiekeTriggersIndienNodig_()).not.toThrow();
    expect(h.getInstallCalls()).toBe(0);
  });

  test('onOpen wiret het zelfherstel met typeof-guard', () => {
    const fs = require('fs');
    const menu = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');
    expect(menu).toMatch(/herstelKritiekeTriggersIndienNodig_/);
    expect(menu).toMatch(/typeof herstelKritiekeTriggersIndienNodig_ === 'function'/);
  });
});

/**
 * tests/unit/kritieke-update-notificatie.test.js
 *
 * Severity-aware update-notificatie (Onboarding.gs). Drie scenario's:
 *   1. Server zegt geen nieuwere versie  → niets
 *   2. Server zegt newer + 'normaal'     → toast pad (1×/7 dgn)
 *   3. Server zegt newer + 'kritiek' EN huidige versie in versieKritiekVoor
 *                                        → modal + audit-log + 1×/dag throttle
 *
 * De audit-log is bewijslast voor Sam: na kritieke notificatie moet
 * controleerbaar zijn dat klant op datum X is gewaarschuwd.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ONBOARDING_GS = path.resolve(__dirname, '../../src/Onboarding.gs');
const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');

function maakCtx(cfg, opts) {
  opts = opts || {};
  const userPropStore = Object.assign({}, opts.userProps || {});
  const scriptPropStore = Object.assign(
    { onboarding_voltooid: 'ja', geinstalleerde_versie: '2.7.0' },
    opts.scriptProps || {}
  );

  const showModalDialog = jest.fn();
  const toast = jest.fn();
  const auditLogCalls = [];

  const ctx = createGasRuntime([CONFIG_GS, ONBOARDING_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptPropStore ? scriptPropStore[k] : null),
        setProperty: (k, v) => { scriptPropStore[k] = v; },
        deleteProperty: (k) => { delete scriptPropStore[k]; },
        setProperties: (o) => Object.assign(scriptPropStore, o),
      }),
      getUserProperties: () => ({
        getProperty: (k) => (k in userPropStore ? userPropStore[k] : null),
        setProperty: (k, v) => { userPropStore[k] = v; },
        deleteProperty: (k) => { delete userPropStore[k]; },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ toast: toast }),
      getUi: () => ({ showModalDialog: showModalDialog, alert: jest.fn() }),
    },
    HtmlService: {
      createHtmlOutput: (s) => ({
        _html: s,
        setWidth: function() { return this; },
        setHeight: function() { return this; },
        setSandboxMode: function() { return this; },
      }),
      SandboxMode: { IFRAME: 'IFRAME' },
    },
    // De gas-runtime prelude definieert safeAuditLog_ als delegatie naar
    // schrijfAuditLog_. Mock daarom op schrijfAuditLog_ — anders shadowed de
    // prelude een override op safeAuditLog_.
    schrijfAuditLog_: jest.fn((actie, details) => { auditLogCalls.push({ actie, details }); }),
    haalConfigOp_: () => cfg,
  });

  return { ctx, userPropStore, showModalDialog, toast, auditLogCalls };
}

describe('Severity-aware update-notificatie', () => {
  test('server zegt zelfde versie: geen modal, geen toast', () => {
    const { ctx, showModalDialog, toast } = maakCtx({ versie: '2.7.0' });
    ctx.controleerOpUpdate_();
    expect(showModalDialog).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  test("server: newer + ernst='normaal' → toast, geen modal, geen audit-log", () => {
    const { ctx, showModalDialog, toast, auditLogCalls } = maakCtx({
      versie: '2.8.0', versieErnst: 'normaal',
    });
    ctx.controleerOpUpdate_();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(showModalDialog).not.toHaveBeenCalled();
    expect(auditLogCalls).toEqual([]);
  });

  test("server: ernst='kritiek' maar mijn versie NIET in versieKritiekVoor → toast, geen modal", () => {
    const { ctx, showModalDialog, toast } = maakCtx({
      versie: '2.8.0', versieErnst: 'kritiek',
      versieKritiekVoor: ['2.6.0', '2.5.0'],  // niet '2.7.0'
    });
    ctx.controleerOpUpdate_();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(showModalDialog).not.toHaveBeenCalled();
  });

  test("server: ernst='kritiek' EN mijn versie IN versieKritiekVoor → modal + audit-log", () => {
    const { ctx, showModalDialog, toast, auditLogCalls } = maakCtx({
      versie: '2.8.0', versieErnst: 'kritiek',
      versieKritiekVoor: ['2.7.0', '2.6.0'],
      versieToelichting: 'BTW r1d-classificatie gecorrigeerd',
    });
    ctx.controleerOpUpdate_();
    expect(showModalDialog).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    expect(auditLogCalls).toHaveLength(1);
    expect(auditLogCalls[0].actie).toMatch(/kritieke update/i);
    expect(auditLogCalls[0].details).toMatch(/2\.7\.0/);
    expect(auditLogCalls[0].details).toMatch(/2\.8\.0/);

    // Toelichting moet in de modal-HTML zitten
    const modalHtml = showModalDialog.mock.calls[0][0]._html;
    expect(modalHtml).toMatch(/BTW r1d-classificatie/);
    expect(modalHtml).toMatch(/2\.7\.0/);
    expect(modalHtml).toMatch(/2\.8\.0/);
  });

  test('kritieke modal: throttle 1×/dag — tweede call blijft stil', () => {
    const { ctx, showModalDialog, auditLogCalls } = maakCtx({
      versie: '2.8.0', versieErnst: 'kritiek',
      versieKritiekVoor: ['2.7.0'],
    });
    ctx.controleerOpUpdate_();
    ctx.controleerOpUpdate_();
    expect(showModalDialog).toHaveBeenCalledTimes(1);
    expect(auditLogCalls).toHaveLength(1);
  });

  test('normale toast: throttle 1×/7 dagen', () => {
    const { ctx, toast } = maakCtx({ versie: '2.8.0', versieErnst: 'normaal' });
    ctx.controleerOpUpdate_();
    ctx.controleerOpUpdate_();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  test('haalConfigOp_ ontbreekt: geen crash, geen notification', () => {
    const ctx = createGasRuntime([CONFIG_GS, ONBOARDING_GS], {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (k === 'onboarding_voltooid' ? 'ja' : null),
          setProperty: () => {}, setProperties: () => {}, deleteProperty: () => {},
        }),
        getUserProperties: () => ({
          getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
        }),
      },
    });
    // Geen haalConfigOp_ injected — moet stil falen
    expect(() => ctx.controleerOpUpdate_()).not.toThrow();
  });
});

describe('_isVersieKritiek_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime([CONFIG_GS, ONBOARDING_GS], {}).ctx ||
          createGasRuntime([CONFIG_GS, ONBOARDING_GS]);
  });

  test('lege lijst: nooit kritiek', () => {
    expect(ctx._isVersieKritiek_('2.7.0', [])).toBe(false);
  });

  test('niet-array: nooit kritiek (verdedigend)', () => {
    expect(ctx._isVersieKritiek_('2.7.0', null)).toBe(false);
    expect(ctx._isVersieKritiek_('2.7.0', undefined)).toBe(false);
    expect(ctx._isVersieKritiek_('2.7.0', 'string')).toBe(false);
  });

  test('versie in lijst: true', () => {
    expect(ctx._isVersieKritiek_('2.7.0', ['2.7.0', '2.6.0'])).toBe(true);
  });

  test('versie niet in lijst: false', () => {
    expect(ctx._isVersieKritiek_('2.8.0', ['2.7.0', '2.6.0'])).toBe(false);
  });
});

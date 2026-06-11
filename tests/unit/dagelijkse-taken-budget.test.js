/**
 * tests/unit/dagelijkse-taken-budget.test.js
 *
 * Budget-guard in _runTaak_ (Triggers.gs). Bij langlopende administraties
 * (>5 jaar data) moet de keten op een gegeven moment stoppen i.p.v. de
 * 6-min GAS-cap te raken — anders wordt triggerSelfHeal (laatste taak)
 * stilzwijgend overgeslagen elke dag.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const TRIGGERS_GS = path.resolve(__dirname, '../../src/Triggers.gs');
const CONFIG_GS = path.resolve(__dirname, '../../src/Config.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({}, opts.props || {});
  const auditCalls = [];
  const statusCalls = [];

  const ctx = createGasRuntime([CONFIG_GS, TRIGGERS_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
        setProperties: (o) => Object.assign(propStore, o),
      }),
      getUserProperties: () => ({
        getProperty: () => null, setProperty: () => {}, deleteProperty: () => {},
      }),
    },
    schrijfAuditLog_: jest.fn((actie, details) => { auditCalls.push({ actie, details }); }),
    metricsLog_: jest.fn(),
  });
  ctx._updateTaakStatus_ = jest.fn((naam, status, dur, fout) => {
    statusCalls.push({ naam, status, dur, fout });
  });
  return { ctx, auditCalls, statusCalls };
}

describe('_runTaak_ — budget-guard', () => {
  test('budget niet actief (=0): taak draait altijd', () => {
    const { ctx, statusCalls } = maakCtx();
    ctx._huidigDagelijksBudgetStart = 0;
    const fn = jest.fn();
    ctx._runTaak_('test', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(statusCalls[0].status).toBe('OK');
  });

  test('budget actief, NIET overschreden: taak draait', () => {
    const { ctx, statusCalls } = maakCtx();
    ctx._huidigDagelijksBudgetStart = Date.now();  // net begonnen
    const fn = jest.fn();
    ctx._runTaak_('test', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(statusCalls[0].status).toBe('OK');
  });

  test('budget overschreden: taak wordt overgeslagen + SKIP-status', () => {
    const { ctx, statusCalls } = maakCtx();
    // 5 minuten geleden begonnen, budget = 4 min → overschreden
    ctx._huidigDagelijksBudgetStart = Date.now() - 5 * 60 * 1000;
    const fn = jest.fn();
    ctx._runTaak_('cleanupEmailIdem', fn);
    expect(fn).not.toHaveBeenCalled();
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0].status).toBe('SKIP');
    expect(statusCalls[0].naam).toBe('cleanupEmailIdem');
    expect(statusCalls[0].fout).toMatch(/budget/i);
  });

  test('audit-log alleen bij EERSTE skip per run (niet per overgeslagen taak)', () => {
    const { ctx, auditCalls } = maakCtx();
    ctx._huidigDagelijksBudgetStart = Date.now() - 5 * 60 * 1000;
    const fn = jest.fn();
    ctx._runTaak_('taak1', fn);
    ctx._runTaak_('taak2', fn);
    ctx._runTaak_('taak3', fn);
    expect(fn).not.toHaveBeenCalled();
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].actie).toMatch(/budget overschreden/i);
    expect(auditCalls[0].details).toContain('taak1'); // eerste overgeslagen
  });

  test('budget override via ScriptProperty: lager budget = sneller skippen', () => {
    const { ctx, statusCalls } = maakCtx({
      props: { DAGELIJKSE_TAKEN_BUDGET_MS: '5000' },  // 5 sec
    });
    ctx._huidigDagelijksBudgetStart = Date.now() - 10000;  // 10 sec geleden
    ctx._runTaak_('test', jest.fn());
    expect(statusCalls[0].status).toBe('SKIP');
  });

  test('budget override invalid waarde: fallback naar default', () => {
    const { ctx, statusCalls } = maakCtx({
      props: { DAGELIJKSE_TAKEN_BUDGET_MS: 'invalid' },
    });
    ctx._huidigDagelijksBudgetStart = Date.now();
    ctx._runTaak_('test', jest.fn());
    expect(statusCalls[0].status).toBe('OK');
  });

  test('budget override buiten range (te hoog): fallback', () => {
    const { ctx, statusCalls } = maakCtx({
      props: { DAGELIJKSE_TAKEN_BUDGET_MS: '99999999' },  // 27u — onveilig
    });
    // Budget zou onmogelijk hoog zijn → fallback naar 4 min default
    // We hebben 3 min terug begonnen → onder default, dus task runt
    ctx._huidigDagelijksBudgetStart = Date.now() - 3 * 60 * 1000;
    ctx._runTaak_('test', jest.fn());
    expect(statusCalls[0].status).toBe('OK');
  });
});

describe('_dagelijksBudget_ — bereik-validatie', () => {
  let ctx;
  beforeEach(() => { ctx = maakCtx().ctx; });

  test('default = 4 min als geen override', () => {
    expect(ctx._dagelijksBudget_()).toBe(4 * 60 * 1000);
  });
});

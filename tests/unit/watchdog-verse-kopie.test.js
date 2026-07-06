/**
 * tests/unit/watchdog-verse-kopie.test.js
 *
 * Regressie uit live test: een verse kopie toonde bij de eerste open ten onrechte
 * "⚠️ Triggers stilgevallen?". Oorzaak: de kopie erft de Taakstatus-tijdstempels
 * van de master (laatste run weken geleden), terwijl de kopie z'n eigen taken nog
 * nooit draaide. De "nieuw-klant"-guard (getLastRow<2) miste dit. Nu slaat de
 * watchdog over zolang SETUP_DONE niet gezet is (reist niet mee met een kopie).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CONFIG = path.resolve(__dirname, '../../src/Config.gs');
const UTILS = path.resolve(__dirname, '../../src/Utils.gs');
const DIAG = path.resolve(__dirname, '../../src/Diagnostiek.gs');

function maakCtx(setupDone) {
  const props = {};
  if (setupDone) props.setupDone = 'true';
  const userProps = {};
  const toasts = [];
  const oud = new Date(Date.now() - 1000 * 3600 * 24 * 40); // 40 dagen geleden (geërfd van master)

  const ctx = createGasRuntime([CONFIG, UTILS, DIAG], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
      getUserProperties: () => ({
        getProperty: (k) => (k in userProps ? userProps[k] : null),
        setProperty: (k, v) => { userProps[k] = v; },
      }),
    },
  });
  ctx.getSpreadsheet_ = () => ({
    getSheetByName: (n) => (n === 'Taakstatus' ? {
      getLastRow: () => 2,
      getDataRange: () => ({ getValues: () => [['Taak', 'Laatste run'], ['dagelijkseTaken', oud]] }),
    } : null),
    toast: (msg, titel, sec) => toasts.push({ msg: msg, titel: titel, sec: sec }),
  });
  ctx.safeAuditLog_ = () => {};
  return { ctx, toasts };
}

describe('Trigger-watchdog: geen valse "stilgevallen" op verse kopie', () => {
  test('verse kopie (geen SETUP_DONE) + geërfde 40d-oude Taakstatus → GEEN toast', () => {
    const { ctx, toasts } = maakCtx(false);
    ctx.controleerTriggerWatchdog_();
    expect(toasts).toHaveLength(0);
  });

  test('gesetupte instance + 40d geen run → wél de waarschuwing (watchdog blijft werken)', () => {
    const { ctx, toasts } = maakCtx(true);
    ctx.controleerTriggerWatchdog_();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].titel).toMatch(/stilgevallen/i);
  });
});

/**
 * tests/unit/admin-prijs-test-modus.test.js
 *
 * Admin-paneel: zelfgemaakte ScriptProperty-writers voor PRODUCT_PRIJS +
 * REF_KORTING zodat Sam zonder Apps Script editor de prijs kan wijzigen
 * (bijv. €0.01 voor end-to-end test op live Mollie).
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({ ADMIN_WACHTWOORD: 'geheim123' }, opts.props || {});
  const cacheStore = {};
  const auditCalls = [];

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = v; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propStore ? propStore[k] : null),
        setProperty: (k, v) => { propStore[k] = v; },
        deleteProperty: (k) => { delete propStore[k]; },
      }),
    },
    ContentService: {
      createTextOutput: (txt) => ({
        _txt: txt,
        getContent: () => txt,
        setMimeType() { return this; },
      }),
      MimeType: { JSON: 'json' },
    },
    schrijfAuditLog_: (actie, details) => auditCalls.push({ actie, details }),
  });
  return { ctx, propStore, auditCalls };
}

function parseJson(resp) {
  return JSON.parse(resp.getContent ? resp.getContent() : resp._txt);
}

describe('adminZetPrijsEndpoint_ — bereik + auth', () => {
  test('verkeerd wachtwoord: weigert + geen write', () => {
    const { ctx, propStore } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'fout', prijs: '0.01' },
    }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet ingelogd/i);
    expect(propStore.PRODUCT_PRIJS).toBeUndefined();
  });

  test('happy: prijs 0.01 wordt geschreven als "0.01"', () => {
    const { ctx, propStore, auditCalls } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: '0.01' },
    }));
    expect(r.ok).toBe(true);
    expect(propStore.PRODUCT_PRIJS).toBe('0.01');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].actie).toMatch(/PRODUCT_PRIJS/);
  });

  test('komma-decimaal wordt naar punt geconverteerd', () => {
    const { ctx, propStore } = maakCtx();
    parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: '12,50' },
    }));
    expect(propStore.PRODUCT_PRIJS).toBe('12.50');
  });

  test('onder Mollie minimum: weiger', () => {
    const { ctx } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: '0.005' },
    }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/€0,01.*€999/);
  });

  test('boven plausibel: weiger', () => {
    const { ctx } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: '5000' },
    }));
    expect(r.ok).toBe(false);
  });

  test('niet-numeriek: weiger', () => {
    const { ctx } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: 'gratis' },
    }));
    expect(r.ok).toBe(false);
  });

  test('negatief: weiger', () => {
    const { ctx } = maakCtx();
    const r = parseJson(ctx.adminZetPrijsEndpoint_({
      parameter: { ww: 'geheim123', prijs: '-1' },
    }));
    expect(r.ok).toBe(false);
  });
});

describe('adminTestModusEndpoint_ — preset + restore', () => {
  test('aan=ja: prijs naar 0.01 + REF_KORTING=0', () => {
    const { ctx, propStore, auditCalls } = maakCtx({
      props: { PRODUCT_PRIJS: '49.00' },
    });
    const r = parseJson(ctx.adminTestModusEndpoint_({
      parameter: { ww: 'geheim123', aan: 'ja' },
    }));
    expect(r.ok).toBe(true);
    expect(propStore.PRODUCT_PRIJS).toBe('0.01');
    expect(propStore.REF_KORTING).toBe('0');
    expect(auditCalls.some((c) => /Test-modus AAN/.test(c.actie))).toBe(true);
  });

  test('aan=nee: prijs naar 49.00 + REF_KORTING verwijderd (terug naar default)', () => {
    const { ctx, propStore } = maakCtx({
      props: { PRODUCT_PRIJS: '0.01', REF_KORTING: '0' },
    });
    const r = parseJson(ctx.adminTestModusEndpoint_({
      parameter: { ww: 'geheim123', aan: 'nee' },
    }));
    expect(r.ok).toBe(true);
    expect(propStore.PRODUCT_PRIJS).toBe('49.00');
    expect(propStore.REF_KORTING).toBeUndefined();
  });

  test('verkeerd wachtwoord: weiger', () => {
    const { ctx, propStore } = maakCtx({ props: { PRODUCT_PRIJS: '49.00' } });
    const r = parseJson(ctx.adminTestModusEndpoint_({
      parameter: { ww: 'fout', aan: 'ja' },
    }));
    expect(r.ok).toBe(false);
    expect(propStore.PRODUCT_PRIJS).toBe('49.00');
  });
});

describe('Webhook-validatie respecteert REF_KORTING ScriptProperty', () => {
  // De huidige verwerkMollieWebhook_ heeft veel afhankelijkheden (DriveApp,
  // MailApp, LockService, lock-cache, sheet-data). Source-level check:
  // verifieer dat de prijs + korting NIET meer hardcoded zijn.
  const fs = require('fs');
  const src = fs.readFileSync(CODE_GS, 'utf8');

  test('REF_KORTING wordt uit ScriptProperty gelezen, niet hardcoded', () => {
    // const REF_KORTING = 5; verbieden — moet vervangen door props.getProperty
    expect(src).toMatch(/REF_KORTING.*props.*getProperty\(.REF_KORTING./);
  });

  test('minPrijs gebruikt minimum €0.01 (geen 0 of negatief)', () => {
    expect(src).toMatch(/minPrijs = Math\.max\(0\.01,/);
  });

  test('eindprijs in maakBetaling is geklemd op minimaal €0.01', () => {
    // Zoek de eindprijs-berekening in maakBetaling()
    const idx = src.indexOf('eindprijsRw = refGeldig');
    expect(idx).toBeGreaterThan(-1);
    const blok = src.slice(idx, idx + 400);
    expect(blok).toMatch(/Math\.max\(0\.01,/);
  });
});

describe('Source-level: doPost herkent admin-acties', () => {
  const fs = require('fs');
  const src = fs.readFileSync(CODE_GS, 'utf8');

  test('doPost detecteert actie="admin-..." en routeert naar endpoint', () => {
    expect(src).toMatch(/adminActie\.indexOf\('admin-'\) === 0/);
    expect(src).toMatch(/adminZetPrijsEndpoint_\(e\)/);
    expect(src).toMatch(/adminTestModusEndpoint_\(e\)/);
  });

  test('admin-formulieren in admin-paneel HTML aanwezig', () => {
    expect(src).toMatch(/<input type="hidden" name="actie" value="admin-zet-prijs">/);
    expect(src).toMatch(/<input type="hidden" name="actie" value="admin-test-modus">/);
    expect(src).toMatch(/Test-modus AAN/);
    expect(src).toMatch(/Herstel naar live/);
  });
});

describe('Sandbox-fix: forms + links navigeren naar _top (geen wit scherm)', () => {
  // Apps Script HtmlService draait in een sandbox-iframe. Een form/link
  // zonder target="_top" + expliciete action submit naar de sandbox-URL
  // i.p.v. /exec → wit scherm. Dit was de bug waardoor inloggen wit werd.
  const fs = require('fs');
  const src = fs.readFileSync(CODE_GS, 'utf8');

  test('login-formulier heeft method=get, target=_top en expliciete action', () => {
    const idx = src.indexOf('Beheerpaneel');
    const blok = src.slice(idx - 250, idx + 200);
    expect(blok).toMatch(/method="get"/);
    expect(blok).toMatch(/target="_top"/);
    expect(blok).toMatch(/action="' \+ escHtml_\(execUrl\)/);
  });

  test('login-formulier toont foutmelding bij onjuist wachtwoord (geen stil falen)', () => {
    expect(src).toMatch(/Onjuist wachtwoord/);
  });

  test('alle admin POST-forms hebben target="_top"', () => {
    const matches = src.match(/<form method="post"[^>]*>/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    matches.forEach((m) => { expect(m).toMatch(/target="_top"/); });
  });

  test('bevestigingspagina "terug"-link heeft target="_top"', () => {
    const idx = src.indexOf('Terug naar admin-paneel');
    const blok = src.slice(idx - 250, idx + 50);
    expect(blok).toMatch(/target="_top"/);
  });
});

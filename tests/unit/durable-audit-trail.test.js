/**
 * tests/unit/durable-audit-trail.test.js
 *
 * F-ACC-001 (BLOCKER — art. 52 AWR, 7-jaars bewaarplicht):
 * business-correctie-events (storno, dubbel-blokkade, jaarafsluiting, periode-
 * ontgrendeling, override, rollback, ...) gingen alléén naar de roterende
 * 100-rijen ScriptProperties-buffer en verdampten daarna — een controleur kon
 * het who/what/when van een correctie van 2 jaar terug niet meer reconstrueren.
 * schrijfAuditLog_ routeert nu legaal-significante events óók DUURZAAM naar de
 * AUDIT_LOG-sheet; routine-events (factuur/email aangemaakt) blijven buffer-only
 * (die zijn al reconstrueerbaar uit de data-sheets zelf).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  // GEEN Triggers.gs laden → we injecteren logBusinessEventNaarAuditSheet_ als spy
  // en isoleren zo de routing-beslissing van de sheet-I/O.
  return createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
}

describe('F-ACC-001 — _isAuditSignificant_ classificatie', () => {
  const sig = maakCtx()._isAuditSignificant_;

  test.each([
    'VERKOOPFACTUUR gestorneerd',
    'INKOOPFACTUUR gestorneerd',
    'Factuur DUBBEL geblokkeerd',
    'Email DUBBEL geblokkeerd',
    'BTW aangifte geannuleerd (validatie)',
    'Jaarafsluiting GEBLOKKEERD',
    'Jaarafsluiting AFGEBROKEN',
    'BTW-aangifte ONBEKENDE LABELS',
    'GROOTBOEK ONBEKEND',
    'JOURNAALPOST ATOMIC ROLLBACK',
    'AUDIT_KETEN_GEBROKEN',
    'PERIODE_ONTGRENDELD',
    'Belasting-override REJECT-ambigu',
    'Belasting-tarief gewijzigd door klant',
    'Factuurnummer GAP gedetecteerd',
    'GESLOTEN_PERIODES CORRUPT',
    'BEWAARPLICHT NADERT',
    'Declaratie geweigerd',
  ])('significant → durable: "%s"', (actie) => {
    expect(sig(actie)).toBe(true);
  });

  test.each([
    'Factuur aangemaakt',
    'Factuur in sheet',
    'Email verstuurd',
    'Factuur betaald',
    'BTW auto-gereserveerd',
    'Feedback verstuurd',
    'Formulier ontvangen',
    '',
    null,
  ])('routine → buffer-only: "%s"', (actie) => {
    expect(sig(actie)).toBe(false);
  });
});

describe('F-ACC-001 — schrijfAuditLog_ routeert significante events durable', () => {
  test('significant event → logBusinessEventNaarAuditSheet_ aangeroepen met actie+detail', () => {
    const ctx = maakCtx();
    const calls = [];
    ctx.logBusinessEventNaarAuditSheet_ = (actie, detail) => calls.push({ actie, detail });

    ctx.schrijfAuditLog_('VERKOOPFACTUUR gestorneerd', 'factuur=F2026-1 | reden=fout');
    expect(calls).toHaveLength(1);
    expect(calls[0].actie).toBe('VERKOOPFACTUUR gestorneerd');
    expect(calls[0].detail).toMatch(/factuur=F2026-1/);
  });

  test('routine event → NIET durable (buffer-only)', () => {
    const ctx = maakCtx();
    const calls = [];
    ctx.logBusinessEventNaarAuditSheet_ = (actie, detail) => calls.push({ actie, detail });

    ctx.schrijfAuditLog_('Factuur aangemaakt', 'factuur=F2026-2');
    expect(calls).toHaveLength(0);
  });

  test('re-entrancy-guard: een durable-helper die zélf schrijfAuditLog_ aanroept lust niet', () => {
    const ctx = maakCtx();
    let durableCount = 0;
    ctx.logBusinessEventNaarAuditSheet_ = () => {
      durableCount++;
      // helper die (per ongeluk) zelf weer een significant event audit-logt
      ctx.schrijfAuditLog_('VERKOOPFACTUUR gestorneerd', 're-entry');
    };
    ctx.schrijfAuditLog_('VERKOOPFACTUUR gestorneerd', 'factuur=F2026-3');
    // Zónder guard zou de re-entry opnieuw durable routeren (≥2 of stack-overflow);
    // mét guard: exact één durable-call.
    expect(durableCount).toBe(1);
  });
});

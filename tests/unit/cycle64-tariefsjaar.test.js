/**
 * tests/unit/cycle64-tariefsjaar.test.js
 *
 * Cycle 64 — getBelasting_().TARIEFSJAAR moet het jaar rapporteren dat de
 * ACTIEVE tarieven werkelijk vertegenwoordigen.
 *
 * Regressie: de oude check `tarieven === BELASTING_PER_JAAR[jaar]` werd
 * NOOIT waar op de server-override-route (serverTarieven is een ander
 * object dan de lokale tabel). Daardoor rapporteerde de aanbevolen
 * update-route (server-config) ten onrechte 2026 i.p.v. het echte jaar —
 * waardoor de IB-dialog-header (Prive.gs) en GezondheidCheck een verkeerd
 * belastingjaar toonden.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

/** Date-klasse die `new Date()` (zonder args) op een vast jaar pint. */
function maakDateKlasse(jaar) {
  return class VasteDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(jaar, 5, 1); // 1 juni van het gekozen jaar (lokale tijd)
    }
  };
}

function bouwRuntime(jaar, serverTarievenPerJaar) {
  return createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs'], {
    Date: maakDateKlasse(jaar),
    // getSpreadsheet_ faalt in test → _leesBelastingOverrides_ valt netjes terug op null
    getSpreadsheet_: () => { throw new Error('geen sheet in test'); },
    schrijfAuditLog_: () => {},
    haalConfigOp_: serverTarievenPerJaar
      ? () => ({ belastingTarieven: serverTarievenPerJaar })
      : undefined,
  });
}

describe('CYCLE 64: TARIEFSJAAR weerspiegelt de actieve tarieven', () => {
  test('lokale tabel voor lopend jaar → TARIEFSJAAR = jaar', () => {
    const ctx = bouwRuntime(2026, null);
    expect(ctx.getBelasting_().TARIEFSJAAR).toBe(2026);
  });

  test('server-override voor jaar ZONDER lokale entry → TARIEFSJAAR = dat jaar (niet 2026)', () => {
    // 2030 bestaat niet in BELASTING_PER_JAAR; server levert het wél.
    const serverTar = { 2030: { ZELFSTANDIGENAFTREK: 500, MKB_WINSTVRIJSTELLING: 0.12 } };
    const ctx = bouwRuntime(2030, serverTar);
    const B = ctx.getBelasting_();
    expect(B.TARIEFSJAAR).toBe(2030);          // was vóór de fix: 2026 (bug)
    expect(B.ZELFSTANDIGENAFTREK).toBe(500);   // server-tarief is daadwerkelijk actief
  });

  test('echte fallback: geen server + geen lokale entry → TARIEFSJAAR = 2026', () => {
    const ctx = bouwRuntime(2099, null);
    const B = ctx.getBelasting_();
    expect(B.TARIEFSJAAR).toBe(2026);
    expect(B.TARIEFSJAAR).not.toBe(2099);
  });
});

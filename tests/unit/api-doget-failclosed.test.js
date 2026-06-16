/**
 * tests/unit/api-doget-failclosed.test.js
 *
 * H2 — src/API.gs doGet was NIET fail-closed (asymmetrie met de al-gefixte
 * doPost, F-RED-001). Zonder geconfigureerde 'Webhook API sleutel' (de default
 * na een verse install) gaven ?actie=status/klanten/facturen bedrijfsdata terug
 * zónder enige auth:
 *   - status   → bedrijfsnaam, omzetYTD, nettowinst, openDebiteuren, btwSaldo
 *   - klanten  → volledige debiteurenlijst (naam/e-mail/plaats)
 *   - facturen → omzet per factuur (nr/klant/bedrag/status)
 * Fix: zonder sleutel ALLE doGet-acties weigeren; met sleutel blijft de
 * constant-time validatie afgedwongen.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// Bouwt een runtime met de échte API.gs/Utils.gs en stuurbare instellingen.
// jsonResponse_ wordt overschreven zodat doGet het rauwe object teruggeeft
// (ContentService is niet gemockt in de harness).
function maakCtx(instellingen = {}, opts = {}) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'API.gs']);
  ctx.jsonResponse_  = (obj) => obj;
  ctx.getInstelling_ = (key) =>
    (Object.prototype.hasOwnProperty.call(instellingen, key) ? instellingen[key] : '');
  ctx.safeAuditLog_  = jest.fn();
  ctx.getSpreadsheet_ = () => opts.ss || { getSheetByName: () => null };
  if (opts.kpi) ctx.leesKpiSnapshot_ = () => opts.kpi;
  return ctx;
}

const NIET_GECONFIGUREERD = /niet geconfigureerd/i;

describe('H2 — doGet is fail-closed zonder API-sleutel', () => {
  test.each(['status', 'klanten', 'facturen', undefined])(
    'actie=%s zonder sleutel → geweigerd, geen data gelekt',
    (actie) => {
      const ctx = maakCtx({ /* géén Webhook API sleutel gezet */ });
      const res = ctx.doGet({ parameter: actie ? { actie } : {} });

      expect(res.succes).toBe(false);
      expect(res.fout).toMatch(NIET_GECONFIGUREERD);

      // Harde lek-asserties: geen enkel gevoelig veld in de response.
      expect(res.klanten).toBeUndefined();
      expect(res.facturen).toBeUndefined();
      expect(res.omzetYTD).toBeUndefined();
      expect(res.nettowinst).toBeUndefined();
      expect(res.openDebiteuren).toBeUndefined();
      expect(res.btwSaldo).toBeUndefined();
      expect(res.bedrijf).toBeUndefined();
    }
  );

  test('de weigering wordt ge-audit-logd met de gevraagde actie', () => {
    const ctx = maakCtx({});
    ctx.doGet({ parameter: { actie: 'klanten' } });
    expect(ctx.safeAuditLog_).toHaveBeenCalledWith(
      'API geweigerd',
      expect.stringContaining('klanten')
    );
  });
});

describe('doGet met geconfigureerde sleutel — auth blijft afgedwongen', () => {
  test('verkeerde apikey → geweigerd, geen data', () => {
    const ctx = maakCtx({ 'Webhook API sleutel': 'GEHEIM-XYZ' });
    const res = ctx.doGet({ parameter: { actie: 'status', apikey: 'FOUT' } });

    expect(res.succes).toBe(false);
    expect(res.fout).toMatch(/ongeldige of ontbrekende/i);
    expect(res.omzetYTD).toBeUndefined();
  });

  test('juiste apikey + actie=status → KPI-data komt door (niet over-geblokkeerd)', () => {
    const ctx = maakCtx(
      { 'Webhook API sleutel': 'GEHEIM-XYZ', 'Bedrijfsnaam': 'Testzaak' },
      { kpi: { omzet: 12345, nettowinst: 6789, debiteurenOpen: 100, btwSaldo: 50 } }
    );
    const res = ctx.doGet({ parameter: { actie: 'status', apikey: 'GEHEIM-XYZ' } });

    expect(res.succes).toBe(true);
    expect(res.status).toBe('actief');
    expect(res.omzetYTD).toBe(12345);
    expect(res.bedrijf).toBe('Testzaak');
  });
});

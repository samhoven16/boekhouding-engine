/**
 * tests/unit/cycle26-factuurnr-leeg-check.test.js
 *
 * Cycle 26 — controleerVerkoopfacturen_ flagde facturen ZONDER
 * factuurnummer niet. De check deed `if (nr)` voordat hij meetelde, dus
 * een rij met klant + bedrag maar zonder nummer slipte silent door.
 *
 * NL OB-1968 art. 35 vereist een doorlopend uniek nummer per factuur.
 * Zonder nummer is de factuur formeel ongeldig — Belastingdienst kan
 * BTW-aftrek bij de afnemer weigeren én bij verkoper aanvullingen
 * verlangen.
 *
 * Fix: aparte teller voor `geenNummer`, FOUT-regel als > 0.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(rijen) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'GezondheidCheck.gs'], {});
  const sheet = {
    getDataRange: () => ({
      getValues: () => [
        ['ID','Fnr','Datum','Vervaldatum','KlantId','Klant','','','','','BtwLabel','BtwBdr','TotalIncl','Betaald','Status'],
        ...rijen,
      ],
    }),
  };
  ctx.getSpreadsheet_ = () => ({ getSheetByName: () => sheet });
  return { ctx };
}

function rij(opts) {
  const r = new Array(15).fill('');
  r[0] = opts.id || '';
  r[1] = opts.nr || '';
  r[2] = opts.datum || '';
  r[3] = opts.verval || '';
  r[5] = opts.klant || '';
  r[12] = opts.totaal || 0;
  r[14] = opts.status || '';
  return r;
}

describe('CYCLE 26: controleerVerkoopfacturen_ — ontbrekend nummer', () => {
  test('Factuur zonder nummer → FOUT-regel', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: '', klant: 'Klant A', totaal: 100, status: 'Verzonden' }),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    const ontbrekend = r.find((x) => x.check.includes('Ontbrekend nummer'));
    expect(ontbrekend).toBeTruthy();
    expect(ontbrekend.status).toBe('FOUT');
    expect(ontbrekend.bericht).toMatch(/wettelijk verplicht/i);
  });

  test('Meerdere zonder nummer → telt op', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: '', klant: 'A', totaal: 100 }),
      rij({ id: 'F002', nr: '', klant: 'B', totaal: 200 }),
      rij({ id: 'F003', nr: 'INV-003', klant: 'C', totaal: 300 }),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    const ontbrekend = r.find((x) => x.check.includes('Ontbrekend nummer'));
    expect(ontbrekend).toBeTruthy();
    expect(ontbrekend.bericht).toMatch(/^2/);
  });

  test('Alle facturen met nummer → géén FOUT-regel "Ontbrekend nummer"', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: 'INV-001', klant: 'A', totaal: 100 }),
      rij({ id: 'F002', nr: 'INV-002', klant: 'B', totaal: 200 }),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    expect(r.find((x) => x.check.includes('Ontbrekend nummer'))).toBeUndefined();
    // Wel "Unieke nummers OK"
    const uniek = r.find((x) => x.check.includes('Unieke nummers'));
    expect(uniek).toBeTruthy();
    expect(uniek.status).toBe('OK');
  });

  test('Trailing-blank-rij (geen ID + geen klant + geen bedrag) wordt geskipped', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: 'INV-001', klant: 'A', totaal: 100 }),
      rij({}),   // volledig leeg — geen false-positive
      rij({}),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    expect(r.find((x) => x.check.includes('Ontbrekend nummer'))).toBeUndefined();
  });

  test('Gemixt: ontbrekend nummer EN duplicaat → beide gemeld', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: 'INV-001', klant: 'A', totaal: 100 }),
      rij({ id: 'F002', nr: 'INV-001', klant: 'B', totaal: 200 }),  // duplicaat
      rij({ id: 'F003', nr: '', klant: 'C', totaal: 300 }),          // ontbrekend
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    expect(r.find((x) => x.check.includes('Ontbrekend nummer'))).toBeTruthy();
    expect(r.find((x) => x.check.includes('Duplicaat nummers'))).toBeTruthy();
  });

  test('Geen "Unieke nummers OK"-regel als er ontbrekende nummers zijn', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: '', klant: 'A', totaal: 100 }),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    // Klant zou anders verwarrend "Unieke nummers OK" + "Ontbrekend nummer FOUT" zien
    expect(r.find((x) => x.check.includes('Unieke nummers'))).toBeUndefined();
  });

  test('Factuurnummer met alleen spaties wordt als ontbrekend gezien', () => {
    const { ctx } = maakCtx([
      rij({ id: 'F001', nr: '   ', klant: 'A', totaal: 100 }),
    ]);
    const r = ctx.controleerVerkoopfacturen_(ctx.getSpreadsheet_());
    const ontbrekend = r.find((x) => x.check.includes('Ontbrekend nummer'));
    expect(ontbrekend).toBeTruthy();
  });
});

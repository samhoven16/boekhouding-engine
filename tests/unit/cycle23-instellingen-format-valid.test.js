/**
 * tests/unit/cycle23-instellingen-format-valid.test.js
 *
 * Cycle 23 — controleerInstellingen_ checkte alleen PRESENCE, niet
 * format. Klant kon 'abc' als IBAN typen, '123' als KvK, of een ongeldig
 * BTW-nummer, en de gezondheidscheck zou OK geven. Bij eerstvolgende
 * factuur: PDF zonder SEPA-QR, KvK-API faalt, BTW-aangifte schadig.
 *
 * Fix: voor gevulde velden wordt nu ook format-validatie gedaan via
 * de bestaande valideerIban_/valideerBtwNummer_/valideerKvkNummer_
 * functies. Result: een nieuwe FOUT-regel per ongeldig veld.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx(instellingen) {
  const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Validaties.gs', 'GezondheidCheck.gs'], {});
  ctx.getInstelling_ = (sleutel) => instellingen[sleutel] || '';
  return { ctx };
}

describe('CYCLE 23: controleerInstellingen_ — format-validatie', () => {
  test('Alle velden geldig → géén format-FOUT', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'Mijn BV',
      'BTW-nummer': 'NL123456789B01',
      'KvK-nummer': '12345678',
      'IBAN': 'NL91ABNA0417164300',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const fouten = r.filter((x) => x.status === 'FOUT');
    expect(fouten.length).toBe(0);
    // Verplichte-velden-OK aanwezig
    expect(r.find((x) => x.check.includes('Verplichte velden'))).toBeTruthy();
  });

  test('Ongeldig IBAN "abc" → FOUT-regel toegevoegd', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': 'NL123456789B01',
      'KvK-nummer': '12345678',
      'IBAN': 'abc',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const ibanFout = r.find((x) => x.check.includes('IBAN formaat'));
    expect(ibanFout).toBeTruthy();
    expect(ibanFout.status).toBe('FOUT');
    expect(ibanFout.bericht).toMatch(/geldig IBAN/i);
  });

  test('Ongeldig BTW-nummer "123" → FOUT-regel toegevoegd', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': '123',
      'KvK-nummer': '12345678',
      'IBAN': 'NL91ABNA0417164300',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const btwFout = r.find((x) => x.check.includes('BTW-nummer formaat'));
    expect(btwFout).toBeTruthy();
    expect(btwFout.status).toBe('FOUT');
    expect(btwFout.bericht).toMatch(/formaat/i);
  });

  test('Ongeldig KvK-nummer "abc" → FOUT-regel toegevoegd', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': 'NL123456789B01',
      'KvK-nummer': 'abc',
      'IBAN': 'NL91ABNA0417164300',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const kvkFout = r.find((x) => x.check.includes('KvK-nummer formaat'));
    expect(kvkFout).toBeTruthy();
    expect(kvkFout.status).toBe('FOUT');
  });

  test('Lege IBAN → géén format-fout (presence-check vangt dit al)', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': 'NL123456789B01',
      'KvK-nummer': '12345678',
      'IBAN': '',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const ibanFormatFout = r.find((x) => x.check.includes('IBAN formaat'));
    expect(ibanFormatFout).toBeUndefined();
    // Wel een waarschuwing voor presence
    const ibanWarn = r.find((x) => x.check.includes('IBAN') && x.check.includes('Bankrekening'));
    expect(ibanWarn).toBeTruthy();
    expect(ibanWarn.status).toBe('WAARSCHUWING');
  });

  test('Meerdere ongeldige velden → meerdere FOUT-regels', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': 'invalid',
      'KvK-nummer': 'abc',
      'IBAN': 'def',
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const fouten = r.filter((x) => x.status === 'FOUT');
    expect(fouten.length).toBe(3);
  });

  test('IBAN met MOD-97 fail wordt als FOUT gemarkeerd', () => {
    const { ctx } = maakCtx({
      Bedrijfsnaam: 'X',
      'BTW-nummer': 'NL123456789B01',
      'KvK-nummer': '12345678',
      'IBAN': 'NL00ABNA0000000000',   // format OK maar MOD-97 fail
      'Rechtsvorm': 'Eenmanszaak',
    });
    const r = ctx.controleerInstellingen_();
    const ibanFout = r.find((x) => x.check.includes('IBAN formaat'));
    expect(ibanFout).toBeTruthy();
    expect(ibanFout.status).toBe('FOUT');
  });
});

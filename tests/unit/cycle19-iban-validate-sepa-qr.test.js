/**
 * tests/unit/cycle19-iban-validate-sepa-qr.test.js
 *
 * Cycle 19 — haalSepaQrBase64_ genereerde silent een QR-code met ongeldig
 * IBAN als klant typo had ('NL00ABNA0000000000' bijv.). Klant-van-klant
 * scant met bank-app → "ongeldig betaal-verzoek" → frictie, verwarring,
 * mogelijk verlies van vertrouwen in de factuur.
 *
 * Fix: pre-validate via valideerIban_ (MOD-97) vóór QR-fetch. Bij invalid
 * skip QR + audit-log. Factuur PDF blijft genereren (gracefull degradation).
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

function maakCtx() {
  const fetched = [];
  const ctx = createGasRuntime(['Validaties.gs', 'Verkoopfacturen.gs'], {
    UrlFetchApp: {
      fetch: (url) => {
        fetched.push(url);
        return {
          getResponseCode: () => 200,
          getBlob: () => ({ getContentType: () => 'image/png' }),
          getContent: () => [0xff, 0xd8],
        };
      },
    },
    Utilities: { base64Encode: () => 'FAKEBASE64' },
  });
  ctx.schrijfAuditLog_ = jest.fn();
  return { ctx, fetched };
}

describe('CYCLE 19: haalSepaQrBase64_ valideert IBAN', () => {
  test('Geldig NL IBAN → QR wordt opgehaald', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('NL91ABNA0417164300', 'Mijn BV', 100, 'F001');
    expect(r).toMatch(/^data:image\//);
    expect(fetched.length).toBeGreaterThan(0);
  });

  test('Geldig IBAN met spaties → QR werkt (spaties gestript)', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('NL91 ABNA 0417 1643 00', 'Mijn BV', 100, 'F001');
    expect(r).toMatch(/^data:image\//);
    expect(fetched.length).toBeGreaterThan(0);
  });

  test('Ongeldig IBAN (MOD-97 fail) → null + audit-log + GEEN fetch', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('NL00ABNA0000000000', 'Mijn BV', 100, 'F001');
    expect(r).toBeNull();
    expect(fetched.length).toBe(0);
    expect(ctx.schrijfAuditLog_.mock.calls.length).toBe(1);
    expect(ctx.schrijfAuditLog_.mock.calls[0][0]).toBe('SEPA QR overgeslagen');
    expect(ctx.schrijfAuditLog_.mock.calls[0][1]).toMatch(/ongeldig IBAN/i);
  });

  test('IBAN met te weinig karakters → null', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('NL91AB', 'Mijn BV', 100, 'F001');
    expect(r).toBeNull();
    expect(fetched.length).toBe(0);
  });

  test('IBAN met niet-alfanumeriek karakter → null', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('NL91-ABNA-0417-1643-00', 'Mijn BV', 100, 'F001');
    expect(r).toBeNull();
    expect(fetched.length).toBe(0);
  });

  test('Lege IBAN → null (geen audit, niet ongeldig — gewoon niet ingesteld)', () => {
    const { ctx, fetched } = maakCtx();
    const r = ctx.haalSepaQrBase64_('', 'Mijn BV', 100, 'F001');
    expect(r).toBeNull();
    expect(fetched.length).toBe(0);
    expect(ctx.schrijfAuditLog_.mock.calls.length).toBe(0);
  });

  test('IBAN met onderkast wordt geüpper voor validatie', () => {
    const { ctx, fetched } = maakCtx();
    // Geldig IBAN in onderkast — valideerIban_ doet toUpperCase
    const r = ctx.haalSepaQrBase64_('nl91abna0417164300', 'Mijn BV', 100, 'F001');
    expect(r).toMatch(/^data:image\//);
    expect(fetched.length).toBeGreaterThan(0);
  });

  test('Audit-log bevat eerste 8 tekens van IBAN (geen full-leak)', () => {
    const { ctx } = maakCtx();
    ctx.haalSepaQrBase64_('NL00ABNA0000000000', 'Mijn BV', 100, 'F001');
    const bericht = ctx.schrijfAuditLog_.mock.calls[0][1];
    // Eerst 8 + ellipsis, niet de hele IBAN
    expect(bericht).toMatch(/NL00ABNA…/);
    expect(bericht).not.toMatch(/NL00ABNA0000000000/);
  });

  test('Klant-fail-open: als valideerIban_ ontbreekt, oude gedrag (fetch toch)', () => {
    const { ctx, fetched } = maakCtx();
    // Simuleer ontbrekende validatie-helper
    ctx.valideerIban_ = undefined;
    const r = ctx.haalSepaQrBase64_('NL91ABNA0417164300', 'Mijn BV', 100, 'F001');
    expect(r).toMatch(/^data:image\//);
    expect(fetched.length).toBeGreaterThan(0);
  });
});

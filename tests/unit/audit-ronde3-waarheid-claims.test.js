/**
 * tests/unit/audit-ronde3-waarheid-claims.test.js
 *
 * Go-live audit ronde 3 — belofte-vs-realiteit-drift. Drie klant-/accountant-
 * facing claims beloofden méér dan het product levert. Deze test borgt dat de
 * onjuiste claims niet stil terugkeren (ratel).
 *
 *  - F-VOICE-130: HITL-validatie claimde valse finaliteit ("afgesloten voor de
 *    Belastingdienst / art. 52 AWR-compliant") terwijl validatie niets vergrendelt.
 *  - F-VOICE-131: accountant-export claimde onvoorwaardelijk "compatibel met
 *    Exact Online en Twinfield" terwijl de RGS-mapping ~1/3 dekt.
 *  - F-DOC-130: site beloofde een "read-only delen, auto-vervalt na 30d,
 *    configureerbaar 1-365"-feature die niet in de code bestaat.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

describe('F-VOICE-130 — HITL belooft geen valse finaliteit meer', () => {
  const src = read('src/HitlValidatie.gs');

  test('geen "afgesloten voor de Belastingdienst"-claim', () => {
    expect(src).not.toMatch(/afgesloten voor de Belastingdienst/i);
  });

  test('geen "afgesloten" + "AWR-compliant"-geruststelling', () => {
    expect(src).not.toMatch(/AWR-compliant/i);
  });

  test('legt uit dat de rij bewerkbaar blijft tot periode-afsluiting', () => {
    expect(src).toMatch(/bewerkbaar tot/i);
  });
});

describe('F-VOICE-131 — accountant-export claimt geen onvoorwaardelijke pakket-compat', () => {
  const src = read('src/ExportAccountant.gs');

  test('geen onvoorwaardelijke "compatibel met Exact Online en Twinfield"-claim', () => {
    expect(src).not.toMatch(/compatibel met Exact Online en Twinfield/i);
  });

  test('kwalificeert de RGS-mapping (meest-gebruikte rekeningen, rest handmatig)', () => {
    expect(src).toMatch(/meest-gebruikte rekeningen/i);
  });
});

describe('F-DOC-130 — site belooft geen niet-bestaande auto-revoke-deelflow', () => {
  const faq = read('website/faq/index.html');
  const functies = read('website/functies/index.html');
  const vergelijking = read('website/vergelijking/index.html');

  test('FAQ belooft geen "automatisch ingetrokken" + "configureerbaar 1-365" (incl. JSON-LD)', () => {
    expect(faq).not.toMatch(/automatisch ingetrokken/i);
    expect(faq).not.toMatch(/[Cc]onfigureerbaar 1-365/);
  });

  test('vergelijkingstabel claimt geen "Auto-revoke" als feature', () => {
    expect(vergelijking).not.toMatch(/[Aa]uto-revoke/);
  });

  test('functies belooft geen "verloopt de toegang automatisch"', () => {
    expect(functies).not.toMatch(/verloopt de toegang automatisch/i);
  });

  test('FAQ beschrijft de echte flow: map in eigen Drive + zelf delen', () => {
    expect(faq).toMatch(/eigen Google Drive/i);
    expect(faq).toMatch(/deel je vervolgens zelf/i);
  });
});

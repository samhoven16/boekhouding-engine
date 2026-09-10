/**
 * tests/unit/gratis-test-licentie.test.js
 *
 * Regressie uit live test: bij activeren kreeg de eigenaar "dit e-mailadres is
 * niet bekend als klant" omdat de oude genereerHandmatigeLicentie een sleutel
 * ZONDER e-mail aanmaakte — terwijl de OTP-activatie juist op e-mail zoekt. Nu
 * maakt maakTestLicentieVoor_(email) een geldige, direct OTP-activeerbare licentie.
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx() {
  const appended = [];
  const ctx = createGasRuntime([CODE_GS], {
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    Utilities: {
      getUuid: () => '1234abcd-5678-90ef-1234-567890abcdef',
      computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'SHA_256' }, formatDate: () => '2026-06-24',
    },
  });
  ctx.getLicentieSheet_ = () => ({ appendRow: (row) => appended.push(row) });
  return { ctx, appended };
}

describe('maakTestLicentieVoor_ — gratis, OTP-activeerbare test-licentie', () => {
  test('geldig e-mail → echte BKHE-sleutel + activeerbare rij (email op kolom 2)', () => {
    const { ctx, appended } = maakCtx();
    const r = ctx.maakTestLicentieVoor_('Sam@Test.nl', 'Test');
    expect(r.ok).toBe(true);
    expect(r.sleutel).toMatch(/^BKHE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(r.email).toBe('sam@test.nl');               // genormaliseerd (lowercase/trim)
    expect(appended).toHaveLength(1);
    const row = appended[0];
    expect(row[0]).toBe(r.sleutel);                    // kolom 0 = sleutel
    expect(row[2]).toBe('sam@test.nl');                // kolom 2 = email → OTP-lookup vindt 'm
    expect(row[4]).toBe('Actief');                     // kolom 4 = status
  });

  test('ongeldig e-mail → geweigerd, geen rij aangemaakt', () => {
    const { ctx, appended } = maakCtx();
    const r = ctx.maakTestLicentieVoor_('geenmail', 'Test');
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/ongeldig/i);
    expect(appended).toHaveLength(0);
  });

  test('leeg e-mail → geweigerd', () => {
    const { ctx, appended } = maakCtx();
    expect(ctx.maakTestLicentieVoor_('', 'x').ok).toBe(false);
    expect(appended).toHaveLength(0);
  });
});

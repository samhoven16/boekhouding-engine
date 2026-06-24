/**
 * tests/unit/m2-unsubscribe-licentie-niet-breken.test.js
 *
 * RATEL (red-team M2) — bug-klasse: een MARKETING-voorkeurssignaal mag nooit
 * het BETAALDE product breken.
 *
 * Brevo stuurt bij een afmelding het event 'unsubscribed' en bij een spamklacht
 * 'spam'. Beide stonden in `hardBounceEvents` → bounceStatus='hard' → Status van
 * de actieve licentie werd op 'Bounce' gezet. valideerEndpoint_ (Code.gs ~1016)
 * geeft bij Status 'bounce' geldig:false terug → de licentie van een BETALENDE
 * klant ligt eruit louter omdat-ie zich op de onboarding-mail afmeldde of (veel
 * vaker, denk aan de oma-van-67) de spamknop pakte i.p.v. de afmeldlink.
 *
 * Fix: 'unsubscribed' + 'spam' worden behandeld als de één-klik-afmelding — zet
 * de drip-uit-vlag, laat Status én Bouncestatus met rust. Echte bezorgfouten
 * (hard_bounce / invalid_email / blocked) blijven wél op 'Bounce' zetten.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const TOKEN = 'geheim-webhook-token';

function maakCtx(klanten) {
  const store = { BREVO_WEBHOOK_TOKEN: TOKEN };
  const headers = ['Email', 'Status', 'Bouncestatus', 'Bouncereden'];
  const grid = [headers].concat(klanten.map((k) => [k.email, k.status, '', '']));

  const sheet = {
    getLastColumn: () => grid[0].length,
    getLastRow: () => grid.length,
    // N-M2-1: de drip-uit existence-check leest getDataRange().getValues().
    getDataRange: () => ({ getValues: () => grid }),
    getRange: (r, c, nr, nc) => {
      if (typeof nr === 'number') {
        return { getValues: () => grid.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)) };
      }
      return { setValue: (v) => { grid[r - 1][c - 1] = v; } };
    },
  };

  const ctx = createGasRuntime([CODE_GS], {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getProperties: () => Object.assign({}, store),
      }),
    },
    Utilities: {
      computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  });
  ctx.borgExtraKolommen_ = () => {};        // kolommen staan al in de mock-grid
  ctx.getLicentieSheet_ = () => sheet;
  return { ctx, store, grid };
}

const webhook = (event, email) => ({
  parameter: { token: TOKEN },
  postData: { contents: JSON.stringify({ event, email, reason: 'test', date: '2026-06-19' }) },
});

const statusVan = (grid, email) => {
  const r = grid.find((row) => String(row[0]).toLowerCase() === email.toLowerCase());
  return r ? r[1] : null;
};
const heeftDripUit = (store) =>
  Object.keys(store).some((k) => k.indexOf('dripuit_') === 0 && store[k] === '1');

describe('M2 — marketing-afmelding mag de betaalde licentie niet breken', () => {
  test('RATEL: unsubscribed houdt Status actief (géén Bounce) + zet drip-uit', () => {
    const { ctx, store, grid } = maakCtx([{ email: 'klant@x.nl', status: 'Actief' }]);
    ctx.verwerkBrevoBounce_(webhook('unsubscribed', 'klant@x.nl'));
    expect(statusVan(grid, 'klant@x.nl')).toBe('Actief');   // NIET 'Bounce'
    expect(heeftDripUit(store)).toBe(true);
  });

  test('RATEL: spamklacht (spamknop i.p.v. afmeldlink) houdt licentie intact', () => {
    const { ctx, store, grid } = maakCtx([{ email: 'klant@x.nl', status: 'Actief (handmatig)' }]);
    ctx.verwerkBrevoBounce_(webhook('spam', 'klant@x.nl'));
    expect(statusVan(grid, 'klant@x.nl')).toBe('Actief (handmatig)');
    expect(heeftDripUit(store)).toBe(true);
  });

  test('N-M2-1: unsubscribe voor een NIET-klant → géén dripuit_-key (anti-DoS, F-SCALE-143)', () => {
    const { ctx, store } = maakCtx([{ email: 'klant@x.nl', status: 'Actief' }]);
    ctx.verwerkBrevoBounce_(webhook('unsubscribed', 'vreemde@nergens.nl'));   // staat niet in de sheet
    expect(heeftDripUit(store)).toBe(false);   // geen onbegrensde key-groei via geflood webhook
  });

  test('echte hard_bounce blijft Status op Bounce zetten (géén regressie)', () => {
    const { ctx, store, grid } = maakCtx([{ email: 'dood@x.nl', status: 'Actief' }]);
    ctx.verwerkBrevoBounce_(webhook('hard_bounce', 'dood@x.nl'));
    expect(statusVan(grid, 'dood@x.nl')).toBe('Bounce');
    expect(heeftDripUit(store)).toBe(false);   // bezorgfout ≠ afmelding
  });

  test('invalid_email blijft óók een echte bounce (defensie)', () => {
    const { ctx, grid } = maakCtx([{ email: 'tikfout@x.nl', status: 'Actief' }]);
    ctx.verwerkBrevoBounce_(webhook('invalid_email', 'tikfout@x.nl'));
    expect(statusVan(grid, 'tikfout@x.nl')).toBe('Bounce');
  });

  test("BORGING: 'unsubscribed'/'spam' staan niet meer in de hardBounceEvents-array", () => {
    const src = fs.readFileSync(CODE_GS, 'utf8');
    const idx = src.indexOf('const hardBounceEvents');
    const regel = src.slice(idx, src.indexOf('\n', idx));
    expect(regel).not.toMatch(/unsubscribed/);
    expect(regel).not.toMatch(/spam/);
    expect(regel).toMatch(/hard_bounce/);   // de echte bounces blijven staan
  });
});

/**
 * tests/unit/aanvraag-otp-endpoint.test.js
 *
 * Coverage voor licence-server/Code.gs:aanvraagOtpEndpoint_.
 * Was niet getest — red-team-audit benoemde dit als blocker voor
 * OTP-rate-limit-split-fix (kon niet veilig refactoren zonder coverage).
 *
 * Tests verifiëren:
 *  - email-validatie
 *  - klant-bestaat-check (onbekend = nette fout, geen sheet/property writes)
 *  - per-email 60s rate-limit
 *  - happy-path (OTP gegenereerd + opgeslagen + mail verstuurd)
 *  - globaal-rate-limit pas geteld voor bekende klanten (red-team #2 fix)
 */
'use strict';

const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

function maakCtx(opts) {
  opts = opts || {};
  const propStore = Object.assign({}, opts.props || {});
  const cacheStore = Object.assign({}, opts.cache || {});
  const sentMails = [];
  const stuurOtpMailMock = jest.fn((email, otp) => { sentMails.push({ email, otp }); });

  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v, _ttl) => { cacheStore[k] = v; },
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
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    Utilities: {
      getUuid: () => '12345678-1234-1234-1234-123456789abc',
      computeDigest: (_alg, s) => {
        const bytes = [];
        const str = String(s);
        for (let i = 0; i < 32; i++) bytes.push((str.charCodeAt(i % str.length) + i) & 0xff);
        return bytes;
      },
      DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
    },
  });
  // NA createGasRuntime overschrijven — anders shadow't de real stuurOtpMail_
  // in Code.gs onze mock bij het laden van het bestand.
  ctx.stuurOtpMail_ = stuurOtpMailMock;

  ctx.getLicentieSheet_ = () => ({
    getDataRange: () => ({
      getValues: () => [
        ['Sleutel', 'Naam', 'Email', 'Versie', 'Status', 'Verloopt', 'SsId',
         'Aangemaakt', 'PaymentId', 'LaatsteVal', 'Onboarded', 'Verwijzer'],
        ...(opts.rows || []),
      ],
    }),
  });

  return { ctx, propStore, cacheStore, sentMails, stuurOtpMailMock };
}

function parseJson(textOutput) { return JSON.parse(textOutput._txt); }

const ACTIEVE_KLANT = ['BKHE-AAAA', 'Jan', 'klant@example.nl', 'Standaard',
  'Actief', '', 'ss-id', new Date(), 'tr_x', new Date(), '', ''];

describe('aanvraagOtpEndpoint_ — baseline coverage', () => {
  test('email zonder @: nette fout, geen sheet-read', () => {
    const { ctx, sentMails } = maakCtx({ rows: [] });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'geenAt' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/ongeldig/i);
    expect(sentMails).toEqual([]);
  });

  test('onbekende klant: nette fout, geen mail, geen property-write', () => {
    const { ctx, propStore, sentMails } = maakCtx({ rows: [] });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'onbekend@example.nl' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet bekend/i);
    expect(sentMails).toEqual([]);
    expect(Object.keys(propStore).length).toBe(0);
  });

  test('happy-path: bekende klant krijgt OTP-mail + props opgeslagen', () => {
    const { ctx, propStore, sentMails } = maakCtx({ rows: [ACTIEVE_KLANT] });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'klant@example.nl' } }));
    expect(r.ok).toBe(true);
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].email).toBe('klant@example.nl');
    expect(sentMails[0].otp).toMatch(/^\d{6}$/);
    expect(propStore['otp_klant@example.nl']).toBeDefined();
    expect(propStore['otp_ts_klant@example.nl']).toBeDefined();
  });

  test('per-email rate-limit (60s): tweede aanvraag binnen minuut wordt geweigerd', () => {
    const { ctx, sentMails } = maakCtx({
      rows: [ACTIEVE_KLANT],
      props: { 'otp_ts_klant@example.nl': String(Date.now() - 30000) }, // 30s geleden
    });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'klant@example.nl' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/wacht|minuut/i);
    expect(sentMails).toEqual([]);
  });

  test('per-email rate-limit: na 60s+ mag opnieuw', () => {
    const { ctx, sentMails } = maakCtx({
      rows: [ACTIEVE_KLANT],
      props: { 'otp_ts_klant@example.nl': String(Date.now() - 120000) }, // 2 min geleden
    });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'klant@example.nl' } }));
    expect(r.ok).toBe(true);
    expect(sentMails).toHaveLength(1);
  });

  test('Actief-statussen varianten (Actief, Actief (handmatig), Actief — trial): allen geaccepteerd', () => {
    [['BK1', 'X', 'k1@example.nl', 'V', 'Actief', '', '', new Date(), '', new Date(), '', ''],
     ['BK2', 'X', 'k2@example.nl', 'V', 'Actief (handmatig)', '', '', new Date(), '', new Date(), '', ''],
     ['BK3', 'X', 'k3@example.nl', 'V', 'Actief — trial', '', '', new Date(), '', new Date(), '', '']
    ].forEach((row, i) => {
      const { ctx, sentMails } = maakCtx({ rows: [row] });
      const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: row[2] } }));
      expect({ idx: i, ok: r.ok }).toEqual({ idx: i, ok: true });
      expect(sentMails).toHaveLength(1);
    });
  });

  test('Niet-actieve status (Verwijderd op verzoek): geweigerd', () => {
    const row = ['BK', 'X', 'ex@example.nl', 'V', 'Verwijderd op verzoek (Art. 17)',
                 '', '', new Date(), '', new Date(), '', ''];
    const { ctx } = maakCtx({ rows: [row] });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'ex@example.nl' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/niet bekend/i);
  });
});

describe('aanvraagOtpEndpoint_ — globaal-rate-limit alleen voor BEKENDE klanten (red-team #2 fix)', () => {
  test('globaal-cap raakt onbekende klant: GEEN counter-increment (fix red-team #2)', () => {
    // Aanvraag voor onbekende email mag GEEN bijdrage leveren aan globaal-counter.
    // Zonder fix: 500 fake emails saturen 500/u globaal-cap → legitieme klant
    // krijgt 429 ondanks dat hij echt is.
    const { ctx, cacheStore } = maakCtx({ rows: [] });
    ctx.aanvraagOtpEndpoint_({ parameter: { email: 'fake1@example.nl' } });
    ctx.aanvraagOtpEndpoint_({ parameter: { email: 'fake2@example.nl' } });
    ctx.aanvraagOtpEndpoint_({ parameter: { email: 'fake3@example.nl' } });
    // Verwacht: GEEN aanvraag-otp-bekend counter in cache (onbekende klanten
    // mogen niet bijdragen aan deze bucket).
    const bekendKeys = Object.keys(cacheStore).filter(function(k) {
      return k.indexOf('rl_aanvraag-otp-bekend_g') === 0;
    });
    expect(bekendKeys.length).toBe(0);
  });

  test('globaal-cap bekende klanten: bij overschrijding → 429-achtige fout', () => {
    const { ctx, sentMails } = maakCtx({
      rows: [ACTIEVE_KLANT],
      cache: { 'rl_aanvraag-otp-bekend_g': '500' }, // bucket al vol
    });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'klant@example.nl' } }));
    expect(r.ok).toBe(false);
    expect(r.fout).toMatch(/te veel|wacht/i);
    expect(sentMails).toEqual([]);
  });

  test('globaal-cap onder 500: bekende klant wordt geserveerd + counter ge-incrementeerd', () => {
    const { ctx, cacheStore, sentMails } = maakCtx({
      rows: [ACTIEVE_KLANT],
      cache: { 'rl_aanvraag-otp-bekend_g': '50' },
    });
    const r = parseJson(ctx.aanvraagOtpEndpoint_({ parameter: { email: 'klant@example.nl' } }));
    expect(r.ok).toBe(true);
    expect(sentMails).toHaveLength(1);
    expect(parseInt(cacheStore['rl_aanvraag-otp-bekend_g'])).toBe(51);
  });
});

/**
 * tests/unit/licence-server-ratelimit.test.js
 *
 * V2-FIX (nacht-sweep vermoeden V2): rateLimit_ in licence-server/Code.gs.
 *
 * Oude bug: rate-limit-sleutel kwam uit e.parameter.ip — een door de
 * aanvrager zelf gezette URL-parameter. Apps Script Web Apps exposen geen
 * client-IP. Gevolg:
 *   - mét ?ip=: attacker varieert de waarde → limiet volledig omzeild.
 *   - zónder ?ip=: alle anonymous verkeer deelt één 'anon'-bucket → één
 *     bad actor blokkeert alle nieuwe klanten 60 min (DoS).
 *
 * Nieuwe twee-laags aanpak:
 *   - Laag 1: per-email throttle (e.parameter.email, genormaliseerd + gehasht)
 *   - Laag 2: globale circuit-breaker (ruime cap, raakt normaal verkeer nooit)
 *   - e.parameter.ip wordt volledig genegeerd.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');

/**
 * Bouwt een verse runtime met Code.gs geladen + een in-memory CacheService,
 * ContentService-stub en crypto-echte Utilities.computeDigest.
 */
function maakCtx() {
  const cacheStore = {};
  const putCalls = [];
  const ctx = createGasRuntime([CODE_GS], {
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v, ttl) => { cacheStore[k] = v; putCalls.push({ k, v, ttl }); },
        remove: (k) => { delete cacheStore[k]; },
      }),
    },
    ContentService: {
      createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    Utilities: {
      computeDigest: (_algo, str) =>
        Array.from(crypto.createHash('md5').update(String(str)).digest()),
      DigestAlgorithm: { MD5: 'MD5' },
    },
  });
  return { ctx, cacheStore, putCalls };
}

function req(params) {
  return { parameter: params || {} };
}

/** Parse de JSON uit een _rl429_-respons. */
function body(resp) {
  expect(resp).toBeTruthy();
  return JSON.parse(resp._txt);
}

describe('V2: rateLimit_ — per-email laag', () => {
  test('Eerste request → null (ga door)', () => {
    const { ctx } = maakCtx();
    const r = ctx.rateLimit_(req({ email: 'klant@x.nl' }),
      { actie: 'aanvraag-otp', perEmail: 5, globaal: 500, windowMin: 60 });
    expect(r).toBeNull();
  });

  test('Requests tot de per-email-limiet → null; daarna → 429', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 5, globaal: 500, windowMin: 60 };
    for (let i = 0; i < 5; i++) {
      expect(ctx.rateLimit_(req({ email: 'klant@x.nl' }), opt)).toBeNull();
    }
    const geweigerd = ctx.rateLimit_(req({ email: 'klant@x.nl' }), opt);
    expect(geweigerd).toBeTruthy();
    expect(body(geweigerd).ok).toBe(false);
    expect(body(geweigerd).retryAfterSec).toBe(3600);
  });

  test('Verschillende emails hebben eigen bucket (geen kruisbesmetting)', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 3, globaal: 500, windowMin: 60 };
    for (let i = 0; i < 3; i++) ctx.rateLimit_(req({ email: 'a@x.nl' }), opt);
    // a@x.nl zit nu op de limiet — b@x.nl moet nog gewoon door kunnen
    expect(ctx.rateLimit_(req({ email: 'b@x.nl' }), opt)).toBeNull();
    // a@x.nl blijft geweigerd
    expect(ctx.rateLimit_(req({ email: 'a@x.nl' }), opt)).toBeTruthy();
  });

  test('Email wordt genormaliseerd (case + whitespace) → zelfde bucket', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 2, globaal: 500, windowMin: 60 };
    ctx.rateLimit_(req({ email: 'Klant@X.nl' }), opt);
    ctx.rateLimit_(req({ email: '  klant@x.nl  ' }), opt);
    // Beide tellen voor dezelfde identiteit → 3e is geweigerd
    expect(ctx.rateLimit_(req({ email: 'KLANT@X.NL' }), opt)).toBeTruthy();
  });
});

describe('V2: rateLimit_ — ?ip= wordt genegeerd (kern van de bug)', () => {
  test('Variërende ?ip= omzeilt de per-email-limiet NIET', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 3, globaal: 500, windowMin: 60 };
    // Attacker varieert ?ip= bij elke request — vroeger = nieuwe bucket
    for (let i = 0; i < 3; i++) {
      expect(ctx.rateLimit_(req({ email: 'klant@x.nl', ip: '1.2.3.' + i }), opt)).toBeNull();
    }
    // 4e request, opnieuw ander ?ip= → moet alsnog geweigerd worden
    const r = ctx.rateLimit_(req({ email: 'klant@x.nl', ip: '9.9.9.9' }), opt);
    expect(r).toBeTruthy();
    expect(body(r).ok).toBe(false);
  });

  test('?ip= heeft geen invloed op de globale circuit-breaker', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 999, globaal: 3, windowMin: 60 };
    // 3 requests met telkens ander ip + andere email → globale teller = 3
    ctx.rateLimit_(req({ email: 'a@x.nl', ip: '1' }), opt);
    ctx.rateLimit_(req({ email: 'b@x.nl', ip: '2' }), opt);
    ctx.rateLimit_(req({ email: 'c@x.nl', ip: '3' }), opt);
    // 4e — ander ip mag de globale breaker niet resetten
    const r = ctx.rateLimit_(req({ email: 'd@x.nl', ip: '4' }), opt);
    expect(r).toBeTruthy();
  });

  test('Broncode bevat geen e.parameter.ip-vertrouwen meer (comments uitgezonderd)', () => {
    const src = fs.readFileSync(CODE_GS, 'utf8');
    // Alleen actieve code tellen — comment-regels (uitleg over de oude bug)
    // mogen 'parameter.ip' wél noemen.
    const actieveCode = src.split('\n')
      .filter(regel => {
        const t = regel.trim();
        return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');
    expect(actieveCode).not.toMatch(/parameter\.ip/);
  });
});

describe('V2: rateLimit_ — globale circuit-breaker', () => {
  test('Globale cap blokkeert ook als elke email uniek is', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 999, globaal: 5, windowMin: 60 };
    for (let i = 0; i < 5; i++) {
      expect(ctx.rateLimit_(req({ email: 'uniek' + i + '@x.nl' }), opt)).toBeNull();
    }
    const r = ctx.rateLimit_(req({ email: 'uniek99@x.nl' }), opt);
    expect(r).toBeTruthy();
    expect(body(r).ok).toBe(false);
  });

  test('Request zonder email valt alleen onder globale breaker', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'activeer-otp', perEmail: 5, globaal: 3, windowMin: 60 };
    expect(ctx.rateLimit_(req({}), opt)).toBeNull();
    expect(ctx.rateLimit_(req({}), opt)).toBeNull();
    expect(ctx.rateLimit_(req({}), opt)).toBeNull();
    expect(ctx.rateLimit_(req({}), opt)).toBeTruthy();  // globaal vol
  });
});

describe('V2: rateLimit_ — geweigerde request telt niet mee elders', () => {
  test('Per-email-weigering hoogt de globale teller niet op', () => {
    const { ctx, cacheStore } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 2, globaal: 500, windowMin: 60 };
    ctx.rateLimit_(req({ email: 'a@x.nl' }), opt);   // globaal 1
    ctx.rateLimit_(req({ email: 'a@x.nl' }), opt);   // globaal 2
    ctx.rateLimit_(req({ email: 'a@x.nl' }), opt);   // GEWEIGERD (per-email vol)
    const globaalKey = Object.keys(cacheStore).find(k => k.endsWith('_g'));
    // Globale teller moet 2 zijn, niet 3 — de geweigerde request telde niet mee
    expect(parseInt(cacheStore[globaalKey], 10)).toBe(2);
  });
});

describe('V2: rateLimit_ — robuustheid', () => {
  test('CacheService-storing → fail-open (request gaat door)', () => {
    const cacheStore = {};
    const ctx = createGasRuntime([CODE_GS], {
      CacheService: {
        getScriptCache: () => ({
          get: () => { throw new Error('cache down'); },
          put: () => { throw new Error('cache down'); },
        }),
      },
      ContentService: {
        createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } }),
        MimeType: { JSON: 'json' },
      },
      Utilities: {
        computeDigest: (_a, s) => Array.from(crypto.createHash('md5').update(String(s)).digest()),
        DigestAlgorithm: { MD5: 'MD5' },
      },
    });
    const r = ctx.rateLimit_(req({ email: 'klant@x.nl' }),
      { actie: 'aanvraag-otp', perEmail: 5, globaal: 500, windowMin: 60 });
    expect(r).toBeNull();  // fail-open
  });

  test('Geen opties → geen crash, request gaat door', () => {
    const { ctx } = maakCtx();
    expect(ctx.rateLimit_(req({ email: 'klant@x.nl' }))).toBeNull();
  });

  test('windowMin bepaalt de cache-TTL', () => {
    const { ctx, putCalls } = maakCtx();
    ctx.rateLimit_(req({ email: 'klant@x.nl' }),
      { actie: 'aanvraag-otp', perEmail: 5, globaal: 500, windowMin: 30 });
    // Elke put moet TTL 30×60 = 1800s gebruiken
    expect(putCalls.length).toBeGreaterThan(0);
    putCalls.forEach(c => expect(c.ttl).toBe(1800));
  });

  test('429-respons heeft juiste structuur', () => {
    const { ctx } = maakCtx();
    const opt = { actie: 'aanvraag-otp', perEmail: 1, globaal: 500, windowMin: 60 };
    ctx.rateLimit_(req({ email: 'klant@x.nl' }), opt);
    const r = ctx.rateLimit_(req({ email: 'klant@x.nl' }), opt);
    const b = body(r);
    expect(b.ok).toBe(false);
    expect(typeof b.fout).toBe('string');
    expect(b.fout).toMatch(/wacht/i);
    expect(b.retryAfterSec).toBe(3600);
  });
});

describe('V2: doGet-callers gebruiken de nieuwe signature', () => {
  const src = fs.readFileSync(CODE_GS, 'utf8');

  test('aanvraag-otp roept rateLimit_ met opties-object aan (per-email op router)', () => {
    // Sinds red-team #2 fix: router heeft alleen perEmail (anti-enumeration);
    // globaal is verplaatst naar BINNEN aanvraagOtpEndpoint_ voor BEKENDE klanten,
    // zodat fake-email aanvragen de globale 500/u cap niet kunnen saturen.
    expect(src).toMatch(/aanvraag-otp[^\n]*rateLimit_\(e,\s*\{[^}]*perEmail[^}]*\}\)/);
    // En de globaal-check moet ELDERS in het bestand zitten met de andere
    // actie-naam (aanvraag-otp-bekend), specifiek voor BEKENDE klanten.
    expect(src).toMatch(/actie:\s*['"]aanvraag-otp-bekend['"][^}]*globaal/);
  });

  test('activeer-otp roept rateLimit_ met opties-object aan', () => {
    expect(src).toMatch(/activeer-otp[^\n]*rateLimit_\(e,\s*\{[^}]*perEmail[^}]*globaal[^}]*\}\)/);
  });

  test('Geen oude positionele rateLimit_(e, getal, getal)-aanroep meer', () => {
    expect(src).not.toMatch(/rateLimit_\(e,\s*\d+\s*,\s*\d+\s*\)/);
  });
});

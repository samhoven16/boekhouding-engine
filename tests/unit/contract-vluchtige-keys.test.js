/**
 * tests/unit/contract-vluchtige-keys.test.js
 *
 * CONTRACT-GUARD (bug-klasse 3 — onbegrensde ScriptProperty-keys). Élke
 * dynamische `prefix_<id>`-key die met set/deleteProperty wordt geschreven moet
 * óf via de TTL-chokepoint (`zetVluchtigeKey_`, auto-sweep) lopen, óf op de
 * onderstaande allowlist staan met een geverifieerde reden (gebonden / gesweept
 * / permanent-by-design). Een NIEUWE onbeheerde prefix faalt deze test → de
 * 500KB-cliff kan niet stil terugkeren.
 *
 * Eerlijke grens: deze regex vangt de DOMINANTE vorm (`.setProperty('p_' + x)`).
 * Een exotische computed-prefix kan 'm ontwijken — daarom is de chokepoint de
 * sanctie-route en niet enkel deze enumeratie.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const SRV = path.resolve(__dirname, '../../licence-server');

// prefix → reden waarom er GEEN cliff-risico is (geverifieerd in de code).
const TOEGESTAAN = {
  // ── customer-instance (src/) ──
  'CKPT_':               'gebonden: vaste set taaknamen, gewist via clearCheckpoint_',
  'guillotine_':         'gebonden: vaste set taaknamen, gewist bij voltooiing',
  'bedrijfsLogo_chunk_': 'gebonden: vaste chunk-reeks, verwijderd bij her-upload',
  'herinneringsStap_':   'gesweept: cleanupHerinneringsStap in dagelijkseTaken (>2jr inactief)',
  'mollie_completed_':   'gesweept: ruimMollieIdempotencyOp_ (90d, dagelijkseTaken) — koopproces, niet aanraken',
  // ── licence-server/ ──
  'otp_':                'gesweept: cleanupVerlopenOtpKeys_ (15-min OTP)',
  'otp_ts_':             'gesweept: cleanupVerlopenOtpKeys_',
  'otp_pogingen_':       'gesweept: cleanupVerlopenOtpKeys_',
  'serverFout_':         'gebonden: capped ring-buffer (max 5, schuift)',
  'dripuit_':            'permanent by design: wettelijke opt-out — moet blijven bestaan',
};

function gsBestanden(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).map((f) => path.join(dir, f));
}
function prefixenIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /\.(?:set|delete)Property\(\s*['"]([A-Za-z0-9_]+_)['"]\s*\+/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe('CONTRACT — geen onbeheerde dynamische ScriptProperty-prefix (klasse 3)', () => {
  const alle = [...gsBestanden(SRC), ...gsBestanden(SRV)];
  const gevonden = {};
  alle.forEach((f) => prefixenIn(f).forEach((p) => {
    (gevonden[p] = gevonden[p] || []).push(path.basename(f));
  }));

  test('élke dynamische set/delete-prefix is bekend (chokepoint of allowlist)', () => {
    const onbekend = Object.keys(gevonden).filter((p) => !(p in TOEGESTAAN));
    // Onbekende prefix? → route via zetVluchtigeKey_ (TTL + dagelijkse sweep) óf
    // voeg 'm met geverifieerde reden toe aan TOEGESTAAN hierboven.
    expect(onbekend).toEqual([]);
  });

  test('SUPPLETIE_GEMELD_ is gemigreerd: geen raw set/deleteProperty meer', () => {
    expect(gevonden['SUPPLETIE_GEMELD_']).toBeUndefined();
  });

  test('de geclaimde opruim-mechanismen bestaan ÉN zijn gewired (geen rubber-stamp)', () => {
    const triggers = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
    expect(triggers).toMatch(/_runTaak_\('cleanupHerinneringsStap'/);
    expect(triggers).toMatch(/ruimVluchtigeKeysOp_\(\)/);          // generieke sweep gewired
    const utils = fs.readFileSync(path.join(SRC, 'Utils.gs'), 'utf8');
    expect(utils).toMatch(/function ruimVluchtigeKeysOp_/);
    expect(utils).toMatch(/function zetVluchtigeKey_/);
    const mollie = fs.readFileSync(path.join(SRC, 'Mollie.gs'), 'utf8');
    expect(mollie).toMatch(/function ruimMollieIdempotencyOp_/);
    expect(triggers).toMatch(/ruimMollieIdempotencyOp_\(\)/);     // gewired in dagelijkseTaken
    const server = fs.readFileSync(path.join(SRV, 'Code.gs'), 'utf8');
    expect(server).toMatch(/function cleanupVerlopenOtpKeys_/);
    expect(server).toMatch(/cleanupVerlopenOtpKeys_\(\)/);         // gewired in de cron
  });
});

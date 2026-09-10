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
 * Eerlijke grens: deze regex vangt de DOMINANTE vorm (`.setProperty('p_' + x)`)
 * ÉN — sinds F-SCALE-330 — de variabele-vorm (`idemKey = 'P_' + x;
 * setProperty(idemKey)`) die KIA_MISSER_GEMELD_/BEWAARPLICHT_GEMELD_ eerder lieten
 * ontsnappen. Een exotische computed-prefix kan 'm nog ontwijken — daarom blijft
 * de chokepoint de sanctie-route en niet enkel deze enumeratie.
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
  'otp_verwijder_pogingen_': 'gesweept: cleanupVerlopenOtpKeys_ (otp_-prefix; brute-force-teller verwijder-endpoint)',
  'serverFout_':         'gebonden: capped ring-buffer (max 5, schuift)',
  'dripuit_':            'permanent by design: wettelijke opt-out — moet blijven bestaan',
  // ── F-SCALE-330: variabele-vorm-prefixes die de oude regex ontweken; na
  //    verscherping zichtbaar. Elk geverifieerd bounded/permanent/negligible: ──
  'TARIEF_VEROUDERD_GEZIEN_':  '1/jaar, ~25 bytes — seen-flag per boekjaar (mag niet binnen \'t jaar herhalen); verwaarloosbaar',
  'DRIVE_HOOFDMAP_':           'permanent by design: 1/jaar Drive-map-ID per boekjaar — mag NIET verlopen (anders documenten onvindbaar)',
  'CIRCUIT_':                  'gebonden: vaste set service-namen (circuit-breaker-state, ResilientExecutor)',
  'GESLOTEN_PERIODES_CORRUPT_': 'zeldzame periode-corruptie-backup (forensisch, vóór self-heal-delete) — handmatig op te ruimen na herstel',
};

function gsBestanden(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).map((f) => path.join(dir, f));
}
function prefixenIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  let m;
  // Vorm A — directe literal-prefix in set/deleteProperty.
  const reDirect = /\.(?:set|delete)Property\(\s*['"]([A-Za-z0-9_]+_)['"]\s*\+/g;
  while ((m = reDirect.exec(src)) !== null) out.push(m[1]);
  // Vorm B (F-SCALE-330-lek) — UPPER_SNAKE-prefix toegekend aan een variabele die
  // elders als set/deleteProperty-key wordt gebruikt. Deze vorm (idemKey) ontweek
  // vorm A volledig.
  const reVar = /\b(\w+)\s*=\s*['"]([A-Z][A-Za-z0-9_]*_)['"]\s*\+/g;
  while ((m = reVar.exec(src)) !== null) {
    const naam = m[1];
    const prefix = m[2];
    if (new RegExp('\\.(?:set|delete)Property\\(\\s*' + naam + '\\b').test(src)) out.push(prefix);
  }
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

  test('F-SCALE-330: KIA_MISSER_GEMELD_ + BEWAARPLICHT_GEMELD_ zijn gemigreerd (geen raw/variabele-vorm meer)', () => {
    expect(gevonden['KIA_MISSER_GEMELD_']).toBeUndefined();
    expect(gevonden['BEWAARPLICHT_GEMELD_']).toBeUndefined();
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

/**
 * tests/unit/contract-router-ratelimit.test.js
 *
 * CONTRACT-GUARD (klasse-sluiter, niet instantie). De red-team vond 2× een
 * router-endpoint zonder rate-limit (config, valideer, telemetry → DoS op de
 * gedeelde server). Deze test enumereert EXHAUSTIEF élke `actie === '…'` in
 * doGet en dwingt af dat hij óf rate-limited is, óf bewust op de allowlist
 * staat met reden. Een nieuw endpoint zonder cap laat CI falen — de klasse
 * kan niet meer terugkeren via review-geluk.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CODE_GS = path.resolve(__dirname, '../../licence-server/Code.gs');
const src = fs.readFileSync(CODE_GS, 'utf8');
const doGet = src.slice(src.indexOf('function doGet'), src.indexOf('\nfunction doPost'));

// Bewuste uitzonderingen — elk met reden. Een endpoint hoort hier ALLEEN als
// het aantoonbaar geen schrijf/quota/DoS-risico op de gedeelde server heeft,
// of op een andere manier (auth-token) hard gegate is.
const ALLOWLIST = {
  health: 'read-only health-check, geen schrijf/quota/sheet-read',
  bedankt: 'statische HTML-pagina, geen schrijf/quota',
  admin: 'rendert alleen de niet-ingelogde SPA-shell; login + rate-limit server-side in adminLogin()',
  'admin-zet-prijs': 'vereist ADMIN_WACHTWOORD in body (auth-gated, geen anonieme toegang)',
  'admin-test-modus': 'vereist ADMIN_WACHTWOORD in body (auth-gated)',
  revoke: 'vereist ADMIN_REVOKE_TOKEN (constant-time vergelijk, auth-gated)',
};

function segmentVoor(actie, matches, i) {
  const start = matches[i].index;
  const end = i + 1 < matches.length ? matches[i + 1].index : doGet.length;
  return doGet.slice(start, end);
}

describe('CONTRACT — elke licence-server router-actie is rate-limited of allowlisted', () => {
  const matches = [...doGet.matchAll(/actie === '([^']+)'/g)];

  test('er zijn router-acties gevonden (sanity)', () => {
    expect(matches.length).toBeGreaterThan(8);
  });

  test('GEEN enkele actie zonder rate-limit én zonder allowlist-reden', () => {
    const overtreders = [];
    matches.forEach((m, i) => {
      const actie = m[1];
      const seg = segmentVoor(actie, matches, i);
      const heeftRateLimit = /rateLimit_/.test(seg);
      const allowlisted = Object.prototype.hasOwnProperty.call(ALLOWLIST, actie);
      if (!heeftRateLimit && !allowlisted) overtreders.push(actie);
    });
    expect(overtreders).toEqual([]);  // leeg = klasse gesloten
  });

  test('allowlist bevat alleen écht-bestaande acties (geen dode uitzonderingen)', () => {
    const bestaande = new Set(matches.map((m) => m[1]));
    Object.keys(ALLOWLIST).forEach((a) => {
      expect(bestaande.has(a)).toBe(true);
    });
  });
});

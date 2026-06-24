/**
 * tests/unit/contract-admin-bruteforce-teller.test.js
 *
 * CONTRACT-GUARD (sluit het lek in klasse 2 — "router-endpoint zonder
 * rate-limit"). De red-team-as vond dat klasse-2's bestaande sluiting
 * (contract-router-ratelimit) alleen checkt dát een actie een rate-limit
 * heeft, NIET dat endpoints die hetzelfde geheim (ADMIN_WACHTWOORD) valideren
 * één brute-force-teller delen. Daardoor kon een aanvaller z'n pogingen over
 * losse buckets verdelen (~80/u i.p.v. 20/u) en vuurden twee POST-paden de
 * owner-lockout-alert nooit.
 *
 * Deze test enumereert EXHAUSTIEF élke functie in de licentieserver die
 * ADMIN_WACHTWOORD leest, en dwingt af dat hij de gedeelde teller
 * 'admin_login_pogingen' gebruikt — óf op de allowlist staat als pure
 * vergelijkings-helper (met reden). Een nieuw wachtwoord-validerend endpoint
 * zonder de gedeelde teller laat CI falen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LS = path.resolve(__dirname, '../../licence-server');
const bestanden = {
  'Code.gs': fs.readFileSync(path.join(LS, 'Code.gs'), 'utf8'),
  'AdminDashboard.gs': fs.readFileSync(path.join(LS, 'AdminDashboard.gs'), 'utf8'),
};

// Pure wachtwoord-vergelijkings-helper — geen teller nodig MITS z'n enige
// caller de teller wél heeft. Elk met reden.
const ALLOWLIST = {
  _adminWwOk_: 'pure constant-time vergelijking; de gedeelde brute-force-teller zit in adminLogin (de enige caller)',
  controleerKritiekeConfig_: 'leest het secret alléén om te checken dát het geconfigureerd is (config-volledigheid), authenticeert geen request',
};

const GEDEELDE_TELLER = 'admin_login_pogingen';

function functiesMetSecret(src) {
  const out = [];
  const re = /function (\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  const starts = [];
  while ((m = re.exec(src)) !== null) starts.push({ naam: m[1], index: m.index });
  starts.forEach((s, i) => {
    const eind = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const body = src.slice(s.index, eind);
    if (/getProperty\(\s*['"]ADMIN_WACHTWOORD['"]\s*\)/.test(body)) {
      out.push({ naam: s.naam, body });
    }
  });
  return out;
}

describe('CONTRACT — elke ADMIN_WACHTWOORD-validatie deelt de brute-force-teller', () => {
  const alle = [];
  Object.keys(bestanden).forEach((f) => {
    functiesMetSecret(bestanden[f]).forEach((fn) => alle.push({ bestand: f, ...fn }));
  });

  test('er zijn wachtwoord-validerende functies gevonden (sanity)', () => {
    expect(alle.length).toBeGreaterThanOrEqual(2);
  });

  test('GEEN wachtwoord-check zonder gedeelde teller én zonder allowlist-reden', () => {
    const overtreders = alle
      .filter((fn) => !Object.prototype.hasOwnProperty.call(ALLOWLIST, fn.naam))
      // Compliant = gebruikt de gedeelde teller zélf, óf delegeert naar de
      // ge-unificeerde gate _adminAuthOk_ (die de teller bevat).
      .filter((fn) => fn.body.indexOf(GEDEELDE_TELLER) < 0 && fn.body.indexOf('_adminAuthOk_(') < 0)
      .map((fn) => fn.bestand + ':' + fn.naam);
    expect(overtreders).toEqual([]); // leeg = lek gesloten
  });

  test('de gedeelde teller vuurt de owner-lockout-alert bij overschrijding', () => {
    // Beide teller-gebruikers moeten _meldAdminLockoutAanOwner_ aanroepen.
    alle
      .filter((fn) => fn.body.indexOf(GEDEELDE_TELLER) >= 0)
      .forEach((fn) => {
        expect(fn.body).toContain('_meldAdminLockoutAanOwner_');
      });
  });

  test('allowlist bevat alleen écht-bestaande helpers (geen dode uitzonderingen)', () => {
    const namen = new Set(alle.map((fn) => fn.naam));
    // _adminWwOk_ leest het secret zelf, dus moet in `alle` voorkomen.
    Object.keys(ALLOWLIST).forEach((naam) => {
      expect(namen.has(naam)).toBe(true);
    });
  });
});

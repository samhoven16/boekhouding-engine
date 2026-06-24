/**
 * tests/unit/contract-privileged-auth.test.js
 *
 * CONTRACT-GUARD (sluit klasse 6 — "licentie/security-gate op het verkeerde
 * signaal"). Wortel-patroon: gate op owner==user of een raadbare default i.p.v.
 * een echt secret/identiteit (F-RED-151 eigenaar-bypass, F-RED-152 forgeable
 * drip-token). Deze test dwingt MECHANISCH af dat:
 *   (A) élke privileged licentieserver-endpoint authenticeert via een secret-
 *       gate (_adminAuthOk_/veiligVergelijk_) óf op de AUTH_MODEL-lijst staat met
 *       een geverifieerd capability-model;
 *   (B) geen privileged endpoint z'n auth-beslissing op Session.getActiveUser/
 *       getEffectiveUser baseert (de eigenaar-bypass-klasse);
 *   (C) élk secret met een hardcoded fallback-default geseed wordt in
 *       zelfHerstelProductConfig_ (zodat de raadbare default nooit live is).
 * Een nieuw privileged endpoint dat hiervan afwijkt, laat CI falen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CODE = fs.readFileSync(path.resolve(__dirname, '../../licence-server/Code.gs'), 'utf8');

const SECRET_GATE = /_adminAuthOk_\(|veiligVergelijk_\(/;

// Endpoints met een capability-auth-model i.p.v. een directe secret-vergelijking.
// Elk geverifieerd; een nieuw endpoint hoort hier ALLEEN met geverifieerde reden.
const AUTH_MODEL = {
  verwijderEndpoint_:        'OTP-gated: e.parameter.otp (code naar owner-email) + sleutel-bevestiging',
  roteerEndpoint_:           'capability: vereist kennis van de licentie-sleutel (geheim) + sheet-gebaseerde 2/30d-limiet',
  herstuurLicentieEndpoint_: 'send-to-registered-address-only: mailt de sleutel uitsluitend naar het geregistreerde adres; constante respons (geen email-enumeratie)',
};

function bodyVan(naam) {
  const start = CODE.indexOf('function ' + naam);
  if (start < 0) return '';
  const na = CODE.indexOf('\nfunction ', start + 1);
  return CODE.slice(start, na < 0 ? CODE.length : na);
}

describe('CONTRACT — elke privileged endpoint authenticeert op een echt secret (klasse 6)', () => {
  const privileged = [...CODE.matchAll(/function (admin\w*Endpoint_|revokeEndpoint_|roteerEndpoint_|verwijderEndpoint_|herstuurLicentieEndpoint_)\s*\(/g)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i);

  test('er zijn privileged endpoints gevonden (sanity)', () => {
    expect(privileged.length).toBeGreaterThanOrEqual(5);
  });

  test('(A) elke privileged endpoint heeft een secret-gate of een geverifieerd capability-model', () => {
    const ongegate = privileged.filter((naam) => {
      const body = bodyVan(naam);
      return !SECRET_GATE.test(body) && !Object.prototype.hasOwnProperty.call(AUTH_MODEL, naam);
    });
    expect(ongegate).toEqual([]); // leeg = elke endpoint is gegate
  });

  test('(B) GEEN privileged endpoint gate op Session.getActiveUser/getEffectiveUser (eigenaar-bypass F-RED-151)', () => {
    const overtreders = privileged.filter((naam) => /get(Active|Effective)User\s*\(/.test(bodyVan(naam)));
    expect(overtreders).toEqual([]);
  });

  test('(C) elk secret met hardcoded fallback-default wordt geseed in zelfHerstelProductConfig_ (F-RED-152)', () => {
    const seed = bodyVan('zelfHerstelProductConfig_');
    const re = /getProperty\(\s*'([A-Z_]*(?:TOKEN|SECRET|WACHTWOORD|SLEUTEL)[A-Z_]*)'\s*\)\s*\|\|\s*'[^']+'/g;
    const ongeseeed = [];
    let m;
    while ((m = re.exec(CODE)) !== null) {
      const key = m[1];
      if (seed.indexOf("setProperty('" + key + "'") < 0) ongeseeed.push(key);
    }
    expect(ongeseeed).toEqual([]); // leeg = geen raadbare live-default
  });

  test('AUTH_MODEL-lijst bevat alleen écht-bestaande endpoints (geen dode uitzonderingen)', () => {
    Object.keys(AUTH_MODEL).forEach((naam) => expect(privileged).toContain(naam));
  });
});

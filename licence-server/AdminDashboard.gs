/**
 * AdminDashboard.gs
 *
 * Eén centraal beheer-dashboard voor de hele licentie-server. Vervangt het
 * versnipperde `?actie=admin` + losse endpoints + handmatige ScriptProperty-
 * editing in de Apps Script editor.
 *
 * Architectuur: single-page app binnen HtmlService. De pagina praat met de
 * server via google.script.run (NIET via form-submits — dat veroorzaakte de
 * sandbox-witte-scherm-bug). Alle acties zijn sessie-token-gated.
 *
 * Sessie-model ("alleen deze tab"): login met wachtwoord → server geeft een
 * token (6u geldig in CacheService) → de tab bewaart het in sessionStorage
 * (weg bij tab sluiten) → elke actie stuurt het token mee. Geen wachtwoord
 * meer per klik; geen wachtwoord in de URL.
 *
 * Veiligheid:
 *   - Eén allowlisted config-schema bepaalt wat bewerkbaar is. Geen
 *     willekeurige property-writes mogelijk.
 *   - Per veld een type met validatie (prijs, url, email, json, secret...).
 *   - Secrets worden NOOIT teruggestuurd naar de client (alleen "ingesteld
 *     ja/nee" + laatste 4 tekens).
 *   - Elke wijziging → schrijfAuditLog_.
 */

// ─────────────────────────────────────────────
//  CONFIG-SCHEMA (allowlist) — bron-van-waarheid
// ─────────────────────────────────────────────
/**
 * Elk veld: { key, label, type, categorie, hint?, opties? }
 * type: tekst | prijs | url | email | json | versie | secret | keuze | bedrag
 */
function _adminConfigSchema_() {
  return [
    // ── Prijs & verkoop ──
    { key: 'PRODUCT_PRIJS', label: 'Verkoopprijs (EUR)', type: 'prijs', categorie: 'verkoop',
      hint: 'Bedrag incl. BTW. Test-modus zet dit op €0,01.' },
    { key: 'REF_KORTING', label: 'Referral-korting (EUR)', type: 'bedrag', categorie: 'verkoop',
      hint: 'Korting bij geldige referral. Leeg = standaard €5.' },

    // ── Releases & updates ──
    { key: 'PRODUCT_VERSIE', label: 'Huidige productversie', type: 'versie', categorie: 'releases',
      hint: 'Wat klanten als "laatste versie" zien. Format X.Y.Z.' },
    { key: 'VERSIE_ERNST', label: 'Ernst van de update', type: 'keuze', categorie: 'releases',
      opties: ['normaal', 'kritiek'], hint: 'Kritiek = klant krijgt een modal i.p.v. een toast.' },
    { key: 'VERSIE_KRITIEK_VOOR', label: 'Kritiek voor versies', type: 'json', categorie: 'releases',
      hint: 'JSON-array, bv. ["2.7.0","2.6.0"]. Alleen deze versies zien de kritieke modal.' },
    { key: 'VERSIE_TOELICHTING', label: 'Toelichting bij update', type: 'tekst', categorie: 'releases',
      hint: 'Eén zin: wat is er gewijzigd? Verschijnt in de modal.' },
    { key: 'VERSIE_INSTRUCTIES_URL', label: 'Update-instructies URL', type: 'url', categorie: 'releases',
      hint: 'Standaard https://boekhoudbaar.nl/update/' },
    { key: 'FEATURE_FLAGS', label: 'Feature-flags', type: 'json', categorie: 'releases',
      hint: 'JSON, bv. {"auto_apply_update":true}. Zet auto-update aan/uit.' },
    { key: 'GLOBAL_BERICHT', label: 'Globaal bericht aan klanten', type: 'tekst', categorie: 'releases',
      hint: 'Verschijnt als toast bij openen. Leeg = geen bericht.' },

    // ── Integraties & secrets ──
    { key: 'MOLLIE_API_KEY', label: 'Mollie API-key', type: 'secret', categorie: 'integraties',
      hint: 'live_... of test_... Betaalpagina werkt niet zonder.' },
    { key: 'BREVO_API_KEY', label: 'Brevo API-key', type: 'secret', categorie: 'integraties',
      hint: 'Voor transactionele e-mail. Zonder: fallback naar MailApp.' },
    { key: 'TEMPLATE_SS_ID', label: 'Template spreadsheet-ID', type: 'tekst', categorie: 'integraties',
      hint: 'ID van het master-sjabloon. Zonder: copy-link in klant-mail is leeg.' },
    { key: 'LICENTIE_SHEET_ID', label: 'Licentie-sheet ID', type: 'tekst', categorie: 'integraties',
      hint: 'Waar klantlicenties worden bijgehouden.' },
    { key: 'WEB_APP_EXEC_URL', label: 'Web-app /exec URL', type: 'url', categorie: 'integraties',
      hint: 'Eigen deployment-URL (eindigt op /exec). Voor webhooks.' },

    // ── Bedrijfsgegevens ──
    { key: 'PRODUCT_NAAM', label: 'Productnaam', type: 'tekst', categorie: 'bedrijf' },
    { key: 'VAN_NAAM', label: 'Afzender-naam (e-mail)', type: 'tekst', categorie: 'bedrijf' },
    { key: 'VAN_EMAIL', label: 'Afzender-e-mail', type: 'email', categorie: 'bedrijf' },
    { key: 'SUPPORT_EMAIL', label: 'Support-e-mail', type: 'email', categorie: 'bedrijf' },
    { key: 'OWNER_STATUS_EMAIL', label: 'Owner-alerts e-mail', type: 'email', categorie: 'bedrijf',
      hint: 'Waar systeem-waarschuwingen naartoe gaan.' },
    { key: 'KVK_NUMMER', label: 'KvK-nummer', type: 'tekst', categorie: 'bedrijf' },
    { key: 'BTW_NUMMER', label: 'BTW-nummer', type: 'tekst', categorie: 'bedrijf' },
    { key: 'PRIVACY_URL', label: 'Privacy-pagina URL', type: 'url', categorie: 'bedrijf' },
  ];
}

function _adminSchemaVoorKey_(key) {
  const schema = _adminConfigSchema_();
  for (let i = 0; i < schema.length; i++) {
    if (schema[i].key === key) return schema[i];
  }
  return null;
}

// ─────────────────────────────────────────────
//  SESSIE
// ─────────────────────────────────────────────
const ADMIN_SESSIE_PREFIX = 'admin_sessie_';
const ADMIN_SESSIE_TTL_SEC = 6 * 3600;  // CacheService max = 6u

/**
 * Wachtwoord-check met trim aan beide kanten (geplakte whitespace-tolerantie).
 */
function _adminWwOk_(input) {
  const ww = String(PropertiesService.getScriptProperties().getProperty('ADMIN_WACHTWOORD') || '').trim();
  const inp = String(input || '').trim();
  if (!ww || !inp) return false;
  return veiligVergelijk_(ww, inp);
}

/**
 * google.script.run target: login. Returnt sessie-token bij geldig wachtwoord,
 * anders null. Rate-limited tegen brute-force.
 */
function adminLogin(ww) {
  // Brute-force-bescherming (cycle 41): max 20 login-pogingen per uur, globaal
  // (geen e-mail-context op de admin-login). veiligVergelijk_ stopt timing-
  // attacks maar niet mass-scanning; deze teller wel.
  const cache = CacheService.getScriptCache();
  const teller = parseInt(cache.get('admin_login_pogingen') || '0', 10);
  if (teller >= 20) {
    // Owner krijgt één alert bij lockout (mogelijk aanvals-indicatie).
    try { if (typeof _meldAdminLockoutAanOwner_ === 'function') _meldAdminLockoutAanOwner_(); } catch (_) {}
    return { ok: false, fout: 'Te veel pogingen. Wacht een uur.' };
  }
  cache.put('admin_login_pogingen', String(teller + 1), 3600);

  if (!_adminWwOk_(ww)) {
    return { ok: false, fout: 'Onjuist wachtwoord.' };
  }
  // Geslaagde login wist de pogingen-teller (geen lockout door eerdere typo's).
  try { cache.remove('admin_login_pogingen'); } catch (_) {}
  const token = Utilities.getUuid().replace(/-/g, '');
  cache.put(ADMIN_SESSIE_PREFIX + token, '1', ADMIN_SESSIE_TTL_SEC);
  try { schrijfAuditLog_('Admin-dashboard login', 'sessie gestart'); } catch (_) {}
  return { ok: true, token: token };
}

/**
 * Valideert een sessie-token tegen CacheService. Verlengt de TTL bij gebruik
 * (sliding window) zodat een actieve sessie niet midden in het werk verloopt.
 */
function _adminSessieOk_(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const ok = cache.get(ADMIN_SESSIE_PREFIX + String(token)) === '1';
  if (ok) cache.put(ADMIN_SESSIE_PREFIX + String(token), '1', ADMIN_SESSIE_TTL_SEC);
  return ok;
}

/** Wrapper: gooit een herkenbare fout-respons als de sessie ongeldig is. */
function _adminVereisSessie_(token) {
  if (!_adminSessieOk_(token)) {
    return { ok: false, fout: 'Sessie verlopen — log opnieuw in.', sessieVerlopen: true };
  }
  return null;
}

// ─────────────────────────────────────────────
//  DASHBOARD-DATA (één call vult de hele UI)
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  KLANT-RIJ FILTERING (robuust tegen ghost-/foutrijen)
// ─────────────────────────────────────────────
// Een kapotte Dashboard-formule lekt anders als '#REF!'-klant in het admin-
// overzicht en blaast de '#klanten'-teller op (gezien: 12 i.p.v. 1).
const _SHEET_FOUTWAARDEN_ = ['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#NUM!', '#ERROR!'];

function _isSheetFout_(v) {
  return _SHEET_FOUTWAARDEN_.indexOf(String(v == null ? '' : v).trim().toUpperCase()) !== -1;
}

// Enige bron van waarheid: een echte licentie heeft exact het formaat
// BKHE-XXXX-XXXX-XXXX (zie genereerSleutel_). Alles daarbuiten (#REF!, '1',
// leeg, KPI-labels uit een Dashboard-blad) is GEEN klant.
function _isGeldigeLicentieSleutel_(s) {
  return /^BKHE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(s == null ? '' : s).trim());
}

function _schoonCel_(v) {
  const s = String(v == null ? '' : v).trim();
  return _isSheetFout_(s) ? '' : s;
}

function _veiligeDatum_(v) {
  if (!v) return '';
  try { const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); }
  catch (_) { return ''; }
}

// Pure kern: KPI's + klantenlijst uit ruwe sheet-rijen (data[0] = header).
// Filtert hard op een geldige sleutel zodat ghost-/foutrijen nooit als klant
// meetellen. Getest in tests/unit/admin-klanten-ghostrijen.test.js.
function _telKlantenUitRijen_(data) {
  const kpis = { totaal: 0, actief: 0, onboarded: 0, wachtTemplate: 0 };
  const klanten = [];
  for (let i = 1; i < (data ? data.length : 0); i++) {
    const sleutel = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!_isGeldigeLicentieSleutel_(sleutel)) continue;
    const statusRaw = _schoonCel_(data[i][4]);
    const statusL = statusRaw.toLowerCase();
    kpis.totaal++;
    if (statusL.indexOf('actief') === 0) kpis.actief++;
    if (data[i][10]) kpis.onboarded++;
    if (statusRaw.indexOf('wacht op TEMPLATE') !== -1) kpis.wachtTemplate++;
    klanten.push({
      sleutel: sleutel,
      naam: _schoonCel_(data[i][1]),
      email: _schoonCel_(data[i][2]),
      status: statusRaw,
      onboarded: _veiligeDatum_(data[i][10]),
      laatsteValidatie: _veiligeDatum_(data[i][9]),
    });
  }
  return { kpis: kpis, klanten: klanten };
}

/**
 * google.script.run target: alle data voor de UI in één keer.
 * Secrets worden gemaskeerd (alleen ingesteld-ja/nee + laatste 4 tekens).
 */
function adminData(token) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  const props = PropertiesService.getScriptProperties();

  // Config-waarden per schema, secrets gemaskeerd.
  const config = {};
  _adminConfigSchema_().forEach(function(veld) {
    const raw = props.getProperty(veld.key);
    if (veld.type === 'secret') {
      config[veld.key] = {
        ingesteld: !!raw,
        masker: raw ? ('••••' + String(raw).slice(-4)) : '',
      };
    } else {
      config[veld.key] = { waarde: raw == null ? '' : String(raw) };
    }
  });

  // Health
  const health = {
    template: !!props.getProperty('TEMPLATE_SS_ID'),
    mollie: !!props.getProperty('MOLLIE_API_KEY'),
    brevo: !!props.getProperty('BREVO_API_KEY'),
    mollieMode: (function() {
      const k = props.getProperty('MOLLIE_API_KEY') || '';
      return k.indexOf('live_') === 0 ? 'live' : (k.indexOf('test_') === 0 ? 'test' : '—');
    })(),
  };

  // Test-modus actief?
  const prijsNu = props.getProperty('PRODUCT_PRIJS') || '49.00';
  const testModusAan = (parseFloat(prijsNu) <= 0.01);

  // Klanten + KPI's
  let kpis = { totaal: 0, actief: 0, onboarded: 0, wachtTemplate: 0 };
  let klanten = [];
  try {
    const sheet = getLicentieSheet_();
    const telling = _telKlantenUitRijen_(sheet.getDataRange().getValues());
    kpis = telling.kpis;
    klanten = telling.klanten;
  } catch (e) {
    return { ok: true, config: config, health: health, testModusAan: testModusAan,
      kpis: kpis, klanten: [], klantenFout: 'Licentie-sheet niet leesbaar: ' + e.message,
      schema: _adminConfigSchema_(), productNaam: props.getProperty('PRODUCT_NAAM') || 'Boekhoudbaar' };
  }

  return {
    ok: true,
    config: config,
    schema: _adminConfigSchema_(),
    health: health,
    testModusAan: testModusAan,
    kpis: kpis,
    klanten: klanten,
    productNaam: props.getProperty('PRODUCT_NAAM') || 'Boekhoudbaar',
  };
}

// ─────────────────────────────────────────────
//  CONFIG WIJZIGEN (allowlisted + per-type validatie)
// ─────────────────────────────────────────────
/**
 * google.script.run target: zet één config-veld. Alleen keys uit het schema;
 * validatie per type. Lege waarde verwijdert de property (terug naar default).
 */
function adminZetConfig(token, key, waarde) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  const veld = _adminSchemaVoorKey_(key);
  if (!veld) return { ok: false, fout: 'Onbekend instellingsveld.' };

  const props = PropertiesService.getScriptProperties();
  const ruw = (waarde == null) ? '' : String(waarde).trim();

  // Lege waarde = verwijder (terug naar code-default), behalve voor velden
  // waar leeg gevaarlijk is (sheet-id, mollie-key laten we toe te wissen want
  // dat is een bewuste keuze van de owner).
  if (ruw === '') {
    props.deleteProperty(key);
    try { schrijfAuditLog_('Config gewist', key); } catch (_) {}
    return { ok: true, key: key, waarde: '' };
  }

  // Per-type validatie
  const v = _adminValideerConfig_(veld, ruw);
  if (!v.ok) return v;

  props.setProperty(key, v.waarde);
  try {
    const audit = (veld.type === 'secret') ? '(secret gewijzigd)' : v.waarde;
    schrijfAuditLog_('Config gewijzigd: ' + key, audit);
  } catch (_) {}
  return { ok: true, key: key, waarde: (veld.type === 'secret') ? '••••' + v.waarde.slice(-4) : v.waarde };
}

function _adminValideerConfig_(veld, ruw) {
  // Sheet/Drive-ID-velden: tolereer dat klant een hele URL plakt i.p.v.
  // alleen het ID. Het patroon /d/<id>/ uit Google's URLs eruit halen
  // bespaart hem een cryptische "Illegal spreadsheet id"-fout.
  if (veld.key === 'LICENTIE_SHEET_ID' || veld.key === 'TEMPLATE_SS_ID') {
    const m = ruw.match(/\/d\/([A-Za-z0-9_-]{20,})/);
    if (m) ruw = m[1];
  }
  switch (veld.type) {
    case 'prijs': {
      const n = parseFloat(ruw.replace(',', '.'));
      if (!isFinite(n) || n < 0.01 || n > 999) return { ok: false, fout: 'Prijs moet €0,01 t/m €999,00 zijn.' };
      return { ok: true, waarde: n.toFixed(2) };
    }
    case 'bedrag': {
      const n = parseFloat(ruw.replace(',', '.'));
      if (!isFinite(n) || n < 0 || n > 999) return { ok: false, fout: 'Bedrag moet €0 t/m €999 zijn.' };
      return { ok: true, waarde: String(n) };
    }
    case 'versie':
      if (!/^\d+\.\d+\.\d+$/.test(ruw)) return { ok: false, fout: 'Versie moet X.Y.Z zijn.' };
      return { ok: true, waarde: ruw };
    case 'keuze':
      if (veld.opties.indexOf(ruw) < 0) return { ok: false, fout: 'Ongeldige keuze.' };
      return { ok: true, waarde: ruw };
    case 'json':
      try { JSON.parse(ruw); } catch (_) { return { ok: false, fout: 'Geen geldige JSON.' }; }
      return { ok: true, waarde: ruw };
    case 'url':
      if (!/^https?:\/\//i.test(ruw)) return { ok: false, fout: 'URL moet met http(s):// beginnen.' };
      return { ok: true, waarde: ruw };
    case 'email':
      if (ruw.indexOf('@') < 1) return { ok: false, fout: 'Ongeldig e-mailadres.' };
      return { ok: true, waarde: ruw };
    case 'secret':
    case 'tekst':
    default:
      if (ruw.length > 5000) return { ok: false, fout: 'Waarde te lang.' };
      return { ok: true, waarde: ruw };
  }
}

// ─────────────────────────────────────────────
//  TEST-MODUS (preset: €0,01, geen korting)
// ─────────────────────────────────────────────
function adminZetTestModus(token, aan) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  // F-RED-331 (2e ronde): via de gedeelde chokepoint zodat TEST_MODUS_VERLOOPT
  // óók gezet wordt — anders is de 24u-auto-revert inert voor deze (primaire)
  // dashboard-route en blijft een vergeten €0,01-stand onbeperkt staan.
  const isAan = (aan === true || aan === 'ja' || aan === 'true');
  _zetTestModusPreset_(isAan);
  try {
    schrijfAuditLog_('Test-modus ' + (isAan ? 'AAN' : 'UIT') + ' (dashboard)',
      isAan ? 'prijs=0.01 ref=0 verloopt=+24u' : 'prijs=49.00');
  } catch (_) {}
  return { ok: true, testModusAan: isAan };
}

// ─────────────────────────────────────────────
//  KLANT-ACTIES (intrekken / opnieuw sturen / verwijderen)
// ─────────────────────────────────────────────
/**
 * google.script.run target. actie: 'herstuur' | 'intrekken' | 'verwijderen'.
 * Werkt op de licentie-rij van het opgegeven e-mailadres.
 */
function adminKlantActie(token, email, actie) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false, fout: 'Geen e-mailadres.' };

  const sheet = getLicentieSheet_();
  const data = sheet.getDataRange().getValues();
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2] || '').toLowerCase() === email) { rij = i + 1; break; }
  }
  if (rij === -1) return { ok: false, fout: 'Geen licentie gevonden voor ' + email + '.' };

  if (actie === 'intrekken') {
    sheet.getRange(rij, 5).setValue('Ingetrokken — handmatig via dashboard ' +
      Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd'));
    try { schrijfAuditLog_('Licentie ingetrokken (dashboard)', email.slice(0, 3) + '***'); } catch (_) {}
    return { ok: true, bericht: 'Licentie ingetrokken.' };
  }
  if (actie === 'herstuur') {
    // Hergebruik bestaande herstuur-logica indien aanwezig.
    if (typeof herstuurLicentieMail_ === 'function') {
      try {
        herstuurLicentieMail_(email);
        try { schrijfAuditLog_('Licentie opnieuw verstuurd (dashboard)', email.slice(0, 3) + '***'); } catch (_) {}
        return { ok: true, bericht: 'Licentie-e-mail opnieuw verstuurd.' };
      } catch (e) {
        return { ok: false, fout: 'Versturen mislukt: ' + e.message };
      }
    }
    return { ok: false, fout: 'Herstuur-functie niet beschikbaar op deze server.' };
  }
  if (actie === 'verwijderen') {
    // AVG-pseudonymisering (zelfde kolommen als verwijderEndpoint_).
    sheet.getRange(rij, 2).setValue('— verwijderd —');
    sheet.getRange(rij, 3).setValue('deleted+' + rij + '@anonymized.local');
    sheet.getRange(rij, 5).setValue('Verwijderd op verzoek (dashboard)');
    sheet.getRange(rij, 7).setValue('');
    try {
      const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
        .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 12);
      schrijfAuditLog_('AVG-verwijdering (dashboard)', 'email-hash=' + hash);
    } catch (_) {}
    return { ok: true, bericht: 'Klantgegevens gepseudonymiseerd (factuurnummers blijven 7 jaar bewaard).' };
  }
  return { ok: false, fout: 'Onbekende actie.' };
}

// ─────────────────────────────────────────────
//  SETUP-ACTIES (zodat de code-editor niet meer nodig is)
// ─────────────────────────────────────────────
/**
 * google.script.run target. welke: 'licentie-sheet' | 'brevo-token'.
 */
function adminSetupActie(token, welke) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  if (welke === 'licentie-sheet') {
    return _adminCheckLicentieSheet_();
  }
  if (welke === 'licentie-sheet-aanmaken') {
    if (typeof setupLicentieSheet !== 'function') {
      return { ok: false, fout: 'setupLicentieSheet niet beschikbaar.' };
    }
    try {
      setupLicentieSheet();
      const id = PropertiesService.getScriptProperties().getProperty('LICENTIE_SHEET_ID');
      return { ok: true, bericht: 'Nieuwe licentie-sheet aangemaakt. ID staat ingesteld.',
        nieuweSheetId: id };
    } catch (e) { return { ok: false, fout: e.message }; }
  }
  if (welke === 'licentiebeheer-repareer') {
    if (typeof _repareerLicentieDatabase_ !== 'function') {
      return { ok: false, fout: '_repareerLicentieDatabase_ niet beschikbaar — push de laatste licence-server-code.' };
    }
    try {
      const r = _repareerLicentieDatabase_();
      const delen = [];
      if (r.verplaatst > 0) delen.push(r.verplaatst + ' klant-rij(en) teruggezet naar Licenties-tab');
      if (r.formulesHersteld) delen.push('KPI-formules herschreven');
      if (r.templateOk) delen.push('Master Engine bereikbaar: ' + r.templateNaam);
      else delen.push('⚠ Master Engine NIET bereikbaar — check TEMPLATE_SS_ID');
      if (r.fouten && r.fouten.length) delen.push('Fouten: ' + r.fouten.join(' · '));
      try { schrijfAuditLog_('Licentiebeheer gerepareerd (dashboard)', JSON.stringify(r)); } catch (_) {}
      return { ok: r.templateOk && r.fouten.length === 0, bericht: delen.join(' — '), detail: r };
    } catch (e) { return { ok: false, fout: e.message }; }
  }
  if (welke === 'brevo-token') {
    if (typeof setupBrevoWebhookToken === 'function') {
      try {
        const url = setupBrevoWebhookToken();
        return { ok: true, bericht: url ? ('Brevo-webhook-URL: ' + url) : 'Token aangemaakt — zet eerst WEB_APP_EXEC_URL.' };
      } catch (e) { return { ok: false, fout: e.message }; }
    }
    return { ok: false, fout: 'setupBrevoWebhookToken niet beschikbaar.' };
  }
  return { ok: false, fout: 'Onbekende setup-actie.' };
}

/**
 * Intelligente sheet-check. Drie uitkomsten voor de UI:
 *   ok:'leesbaar'      → groen, X licenties
 *   ok:'leeg'          → groen, nul licenties (verse sheet)
 *   ok:'fout'          → rood, met code: 'geen-id' | 'niet-gevonden' | 'geen-toegang'
 *                       + kandidaten uit jouw Drive om handmatig te kiezen.
 */
function _adminCheckLicentieSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty('LICENTIE_SHEET_ID') || '').trim();
  if (!id) {
    return { ok: 'fout', code: 'geen-id', fout: 'Geen Licentie-sheet ID ingesteld.',
      kandidaten: _zoekLicentieSheetKandidaten_() };
  }
  try {
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheets()[0];
    const rijen = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    return { ok: 'leesbaar', sheetNaam: ss.getName(),
      sheetUrl: ss.getUrl(), licenties: rijen };
  } catch (e) {
    const msg = String(e && e.message || e);
    const code = /not found|ontbreekt/i.test(msg) ? 'niet-gevonden' :
                 (/access|toestemming|denied/i.test(msg) ? 'geen-toegang' : 'fout');
    return { ok: 'fout', code: code, fout: msg,
      kandidaten: _zoekLicentieSheetKandidaten_() };
  }
}

/** Zoek in eigen Drive naar plausibele licentie-sheets. Max 5 resultaten. */
function _zoekLicentieSheetKandidaten_() {
  const lijst = [];
  try {
    const it = DriveApp.searchFiles(
      "mimeType='application/vnd.google-apps.spreadsheet' and " +
      "(title contains 'Licentie' or title contains 'Boekhoudbaar')");
    let n = 0;
    while (it.hasNext() && n < 5) {
      const f = it.next();
      lijst.push({ id: f.getId(), naam: f.getName(), url: f.getUrl() });
      n++;
    }
  } catch (_) {}
  return lijst;
}

// ─────────────────────────────────────────────
//  OBSERVABILITY — health, foutmeldingen, deploy-marker
// ─────────────────────────────────────────────
/**
 * Versie-marker. Bij elke push verhogen; client vergelijkt deze met
 * de waarde die de server retourneert om "code op server is ouder dan main"
 * te detecteren — zodat we de hele zoektocht van vannacht niet hoeven herhalen.
 */
const ADMIN_DASHBOARD_VERSIE = '2026-06-11-F';

/**
 * google.script.run target. Verzamelt de observability-data die op
 * de Overzicht-tab verschijnt. Apart van adminData() om die snel + lichtgewicht
 * te houden; deze call mag rustig wat traag zijn.
 */
function adminObservability(token) {
  const sessieFout = _adminVereisSessie_(token);
  if (sessieFout) return sessieFout;

  const props = PropertiesService.getScriptProperties();
  const now = Date.now();

  // Sheet-status (slimme check uit de licentie-sheet-knop hergebruikt)
  const sheetCheck = _adminCheckLicentieSheet_();

  // Webhook-gezondheid: hoeveel klanten in 7d met PaymentId (= echte Mollie-betaling)?
  let webhook = { ok: true, betalingen7d: 0, fout: null };
  try {
    if (sheetCheck.ok === 'leesbaar' || sheetCheck.ok === 'leeg') {
      const sheet = getLicentieSheet_();
      const data = sheet.getDataRange().getValues();
      const grens = now - 7 * 86400000;
      let betalingen = 0;
      for (let i = 1; i < data.length; i++) {
        const aangemaakt = data[i][7];
        const paymentId = String(data[i][8] || '');
        if (aangemaakt instanceof Date && aangemaakt.getTime() >= grens
            && paymentId && paymentId.indexOf('tr_') === 0) {
          betalingen++;
        }
      }
      webhook.betalingen7d = betalingen;
    }
  } catch (e) { webhook = { ok: false, fout: e.message, betalingen7d: 0 }; }

  // Stille klanten: actief, > 7d geleden ingeschreven, geen validatie in 48u
  let stilleKlanten = { ok: true, aantal: 0, namen: [] };
  try {
    if (sheetCheck.ok === 'leesbaar') {
      const sheet = getLicentieSheet_();
      const data = sheet.getDataRange().getValues();
      const grens48u = now - 48 * 3600 * 1000;
      const grens7d = now - 7 * 86400000;
      let aantal = 0;
      const namen = [];
      for (let i = 1; i < data.length; i++) {
        const status = String(data[i][4] || '').toLowerCase();
        if (status.indexOf('actief') !== 0) continue;
        const aangemaakt = data[i][7];
        if (!(aangemaakt instanceof Date) || aangemaakt.getTime() > grens7d) continue;
        const lv = data[i][9];
        if (!(lv instanceof Date) || lv.getTime() < grens48u) {
          aantal++;
          if (namen.length < 5) namen.push(String(data[i][1] || '—'));
        }
      }
      stilleKlanten = { ok: true, aantal: aantal, namen: namen };
    }
  } catch (e) { stilleKlanten = { ok: false, fout: e.message, aantal: 0, namen: [] }; }

  // Laatste fouten (uit ScriptProperties: serverFouten_<n>)
  const fouten = [];
  for (let i = 1; i <= 5; i++) {
    const raw = props.getProperty('serverFout_' + i);
    if (!raw) continue;
    try { fouten.push(JSON.parse(raw)); } catch (_) {}
  }

  // Assets: directe links naar de drie kernpunten van het systeem
  const assets = { script: null, database: null, template: null, opsMap: null };
  try {
    const scriptId = ScriptApp.getScriptId();
    assets.script = { naam: 'Licentieserver (Apps Script)',
      url: 'https://script.google.com/d/' + scriptId + '/edit' };
  } catch (_) {}
  try {
    const dbId = props.getProperty('LICENTIE_SHEET_ID');
    if (dbId) {
      const dbSs = SpreadsheetApp.openById(dbId);
      assets.database = { naam: 'Licentie-database', url: dbSs.getUrl(), titel: dbSs.getName() };
    }
  } catch (_) {}
  try {
    const tplId = props.getProperty('TEMPLATE_SS_ID');
    if (tplId) {
      const tplSs = SpreadsheetApp.openById(tplId);
      // CRITICAL: check of het template "Anyone with the link" is. Zo niet,
      // krijgen klanten een 404 op de copy-link. Dit was Sam's blocker
      // tijdens de eerste echte test (proton-account kreeg 404).
      let publiekZichtbaar = false;
      try {
        const f = DriveApp.getFileById(tplId);
        const sharingAccess = f.getSharingAccess();
        // ANYONE = iedereen, ANYONE_WITH_LINK = iedereen met de link
        // DOMAIN/DOMAIN_WITH_LINK = alleen Workspace-collega's, PRIVATE = niemand
        publiekZichtbaar = (sharingAccess === DriveApp.Access.ANYONE ||
                            sharingAccess === DriveApp.Access.ANYONE_WITH_LINK);
      } catch (_) {}
      assets.template = {
        naam: 'Master Engine (klant-template)',
        url: tplSs.getUrl(),
        titel: tplSs.getName(),
        publiekZichtbaar: publiekZichtbaar,
        kopieerUrl: 'https://docs.google.com/spreadsheets/d/' + tplId + '/copy',
      };
    }
  } catch (_) {}
  try {
    const opsIt = DriveApp.getFoldersByName('Boekhoudbaar — Operations');
    if (opsIt.hasNext()) {
      const folder = opsIt.next();
      assets.opsMap = { naam: 'Operations-map (alles bij elkaar)', url: folder.getUrl() };
    }
  } catch (_) {}

  // URL-mismatch-check: scant /kopen én /bedankt op hardcoded deployment-URLs
  // en vergelijkt met WEB_APP_EXEC_URL. Voorkomt 'fossiele deployment'-bug
  // (Sam betaalde €49 i.p.v. €0,01 omdat /kopen naar oude deployment wees).
  let kopenCheck = { ok: 'onbekend', huidig: '', mismatches: [], matches: [] };
  try {
    const huidigExec = props.getProperty('WEB_APP_EXEC_URL') || '';
    kopenCheck.huidig = huidigExec;
    if (huidigExec) {
      const huidigId = (huidigExec.match(/macros\/s\/([A-Za-z0-9_-]+)/) || [])[1] || '';
      const paginas = ['kopen', 'bedankt'];
      for (let i = 0; i < paginas.length; i++) {
        const slug = paginas[i];
        try {
          const resp = UrlFetchApp.fetch('https://www.boekhoudbaar.nl/' + slug + '/', {
            muteHttpExceptions: true, followRedirects: true,
          });
          if (resp.getResponseCode() === 200) {
            const html = resp.getContentText();
            const idsGezien = {};
            const re = /script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)/g;
            let m;
            while ((m = re.exec(html))) idsGezien[m[1]] = true;
            const ids = Object.keys(idsGezien);
            ids.forEach(function(id) {
              const eintraag = { pagina: '/' + slug + '/', url: 'https://script.google.com/macros/s/' + id + '/exec' };
              if (id === huidigId) kopenCheck.matches.push(eintraag);
              else kopenCheck.mismatches.push(eintraag);
            });
          }
        } catch (_) {}
      }
      kopenCheck.ok = kopenCheck.mismatches.length === 0 ? 'match' : 'mismatch';
    }
  } catch (e) { kopenCheck = { ok: 'fout', fout: e.message, matches: [], mismatches: [] }; }

  return {
    ok: true,
    dashboardVersie: ADMIN_DASHBOARD_VERSIE,
    sheetCheck: sheetCheck,
    webhook: webhook,
    stilleKlanten: stilleKlanten,
    laatsteFouten: fouten,
    assets: assets,
    kopenCheck: kopenCheck,
    ownerEmail: props.getProperty('OWNER_STATUS_EMAIL') || '',
  };
}

/**
 * Fout-feed: log een server-fout naar ScriptProperties en (throttled 1×/uur
 * per type) mailen naar OWNER_STATUS_EMAIL. Aanroepen vanuit elke catch-blok
 * dat anders stil zou falen. Maakt onverwachte storingen zichtbaar voor Sam.
 *
 * @param {string} categorie  Korte code: 'webhook' | 'config' | 'mail' | ...
 * @param {string} bericht    Mens-leesbare beschrijving
 * @param {Object=} extra     Optionele context (paymentId, sleutel, etc)
 */
function logServerFout_(categorie, bericht, extra) {
  try {
    const props = PropertiesService.getScriptProperties();
    // Schuif op: 1→2, 2→3 ... oudste valt eraf
    for (let i = 5; i > 1; i--) {
      const v = props.getProperty('serverFout_' + (i - 1));
      if (v) props.setProperty('serverFout_' + i, v);
      else props.deleteProperty('serverFout_' + i);
    }
    const entry = {
      ts: new Date().toISOString(),
      categorie: String(categorie || 'onbekend').slice(0, 32),
      bericht: String(bericht || '').slice(0, 500),
      extra: extra || {},
    };
    props.setProperty('serverFout_1', JSON.stringify(entry));

    // Throttled mail: max 1× per uur per categorie
    const mailKey = 'foutMailTs_' + entry.categorie;
    const laatst = parseInt(props.getProperty(mailKey) || '0', 10);
    if (Date.now() - laatst > 3600 * 1000) {
      props.setProperty(mailKey, String(Date.now()));
      const ontvanger = props.getProperty('OWNER_STATUS_EMAIL') || '';
      if (ontvanger) {
        try {
          MailApp.sendEmail({
            to: ontvanger,
            subject: '⚠ Boekhoudbaar server-fout: ' + entry.categorie,
            htmlBody: '<p><strong>' + escHtml_(entry.categorie) + '</strong> — ' +
              escHtml_(entry.bericht) + '</p>' +
              '<p style="font-size:11px;color:#888">Tijdstip: ' + entry.ts + '</p>' +
              (Object.keys(entry.extra).length
                ? '<pre style="background:#f5f5f5;padding:10px;font-size:11px">' +
                  escHtml_(JSON.stringify(entry.extra, null, 2)) + '</pre>'
                : '') +
              '<p style="font-size:11px;color:#888">Volgende soortgelijke fout pas over 1 uur — zo blijft je inbox leefbaar.</p>',
            name: 'Boekhoudbaar Observability',
          });
        } catch (_) {}
      }
    }
  } catch (_) { /* fail-silent: een fout in fout-logging mag nooit een fout in productie maken */ }
}

// ─────────────────────────────────────────────
//  DE SINGLE-PAGE APP (HTML)
// ─────────────────────────────────────────────
/**
 * Entry: aangeroepen vanuit doGet bij ?actie=admin. Rendert de hele SPA.
 * Login + alle acties lopen via google.script.run — geen form-submits, dus
 * geen sandbox-witte-scherm-bug. Wachtwoord wordt onthouden in sessionStorage
 * (alleen deze tab).
 */
function renderAdminDashboard_() {
  const html = HtmlService.createHtmlOutput(_adminDashboardHtml_())
    .setTitle('Boekhoudbaar — Beheer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  return html;
}

function _adminDashboardHtml_() {
  // De HTML is bewust één string; Apps Script HtmlService serveert dit in een
  // sandbox-iframe. Alle server-communicatie via google.script.run.
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<style>
  :root{--blauw:#0D1B4E;--blauw2:#1A2A6B;--accent:#2EC4B6;--bg:#F7F9FC;--rand:#E5EAF2;--grijs:#5F6B7A;--rood:#B91C1C;--groen:#0D7355}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;background:var(--bg);color:#1A1A1A;font-size:14px;-webkit-font-smoothing:antialiased}
  /* Login */
  #login{max-width:380px;margin:80px auto;background:#fff;border:1px solid var(--rand);border-radius:14px;padding:32px}
  #login h1{font-size:20px;color:var(--blauw);margin-bottom:4px}
  #login p{color:var(--grijs);font-size:13px;margin-bottom:20px}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid var(--rand);border-radius:8px;font-size:14px;font-family:inherit;background:#fff}
  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(46,196,182,.18)}
  .btn{background:var(--blauw);color:#fff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit}
  .btn:hover:not(:disabled){background:var(--blauw2)}
  .btn:disabled{background:#94A3B8;cursor:not-allowed}
  .btn-sec{background:#fff;color:var(--blauw);border:1px solid var(--rand);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
  .btn-sec:hover{background:#EEF2F8}
  .btn-rood{background:var(--rood)}.btn-rood:hover:not(:disabled){background:#7F1D1D}
  /* Layout */
  header{background:#fff;border-bottom:1px solid var(--rand);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:10}
  header .merk{font-weight:800;color:var(--blauw);font-size:17px}
  header .merk span{color:var(--accent)}
  .tabs{display:flex;gap:4px;padding:0 16px;background:#fff;border-bottom:1px solid var(--rand);overflow-x:auto;position:sticky;top:60px;z-index:9}
  .tab{padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;color:var(--grijs);border-bottom:2px solid transparent;white-space:nowrap}
  .tab.actief{color:var(--blauw);border-bottom-color:var(--accent)}
  main{max-width:980px;margin:0 auto;padding:24px 16px 80px}
  .paneel{display:none}.paneel.actief{display:block}
  .kaart{background:#fff;border:1px solid var(--rand);border-radius:12px;padding:18px;margin-bottom:16px}
  .kaart h2{font-size:15px;color:var(--blauw);margin-bottom:14px}
  .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  .kpi{background:#fff;border:1px solid var(--rand);border-radius:10px;padding:14px 18px;min-width:110px}
  .kpi .v{font-size:24px;font-weight:800;color:var(--blauw)}
  .kpi .l{font-size:11px;color:var(--grijs);text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .health{display:flex;gap:10px;flex-wrap:wrap}
  .pil{padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .pil.ok{background:#E6F7F4;color:var(--groen)}.pil.nee{background:#FDECEC;color:var(--rood)}
  .veld{margin-bottom:14px}
  .veld label{display:block;font-weight:600;font-size:12px;margin-bottom:4px}
  .veld .hint{font-size:11px;color:var(--grijs);margin-top:3px}
  .veld .rij{display:flex;gap:8px;align-items:flex-start}
  .veld .rij input,.veld .rij select,.veld .rij textarea{flex:1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:var(--blauw);color:#fff;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
  td{padding:8px 10px;border-bottom:1px solid #F0F2F7}
  tr:hover td{background:#FAFBFD}
  .status-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--blauw);color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(13,27,78,.25);display:none;z-index:100;max-width:90%}
  .status-toast.rood{background:var(--rood)}.status-toast.groen{background:var(--groen)}
  .test-banner{background:#FFF8E1;border:1px solid #FFE08A;color:#5A3F00;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .laden{text-align:center;padding:50px;color:var(--grijs)}
  .zoek{margin-bottom:12px}
</style></head><body>

<div id="login">
  <h1>Beheer-dashboard</h1>
  <p>Log één keer in. Je blijft ingelogd zolang dit tabblad open is.</p>
  <div class="veld"><input id="ww" type="password" placeholder="Wachtwoord" autofocus></div>
  <button class="btn" id="loginBtn" style="width:100%">Inloggen</button>
  <p id="loginFout" style="color:var(--rood);margin-top:10px;display:none"></p>
</div>

<div id="app" style="display:none">
  <header>
    <div class="merk">Boekhoud<span>baar</span> — beheer</div>
    <button class="btn-sec" onclick="uitloggen()">Uitloggen</button>
  </header>
  <div class="tabs" id="tabs"></div>
  <main>
    <div id="testBanner"></div>
    <div id="content"><div class="laden">Laden…</div></div>
  </main>
</div>

<div class="status-toast" id="toast"></div>

<script>
  // Versie-marker komt uit ADMIN_DASHBOARD_VERSIE (server-zijde) zodat we
  // browser ↔ server drift kunnen detecteren — voorkomt de "code op server is
  // niet de code uit main"-blindheid van 11-juni.
  window.DASHBOARD_VERSIE_LOKAAL = '` + ADMIN_DASHBOARD_VERSIE + `';
  var TOKEN = sessionStorage.getItem('bhb_admin_token') || null;
  var DATA = null;
  var actieveTab = 'overzicht';
  var TABS = [
    { id:'overzicht', label:'Overzicht' },
    { id:'klanten', label:'Klanten' },
    { id:'verkoop', label:'Prijs & verkoop' },
    { id:'releases', label:'Releases' },
    { id:'integraties', label:'Integraties' },
    { id:'bedrijf', label:'Bedrijf' },
  ];
  var CAT_PER_TAB = { verkoop:'verkoop', releases:'releases', integraties:'integraties', bedrijf:'bedrijf' };

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function toast(t, kleur){ var el=document.getElementById('toast'); el.textContent=t; el.className='status-toast '+(kleur||''); el.style.display='block'; setTimeout(function(){el.style.display='none';},3500); }

  // ── Login ──
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('ww').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
  function doLogin(){
    var ww = document.getElementById('ww').value;
    if(!ww){ return; }
    var btn=document.getElementById('loginBtn'); btn.disabled=true; btn.textContent='Bezig…';
    google.script.run.withSuccessHandler(function(res){
      btn.disabled=false; btn.textContent='Inloggen';
      if(res && res.ok){
        TOKEN=res.token; sessionStorage.setItem('bhb_admin_token', TOKEN);
        document.getElementById('ww').value='';
        startApp();
      } else {
        var f=document.getElementById('loginFout'); f.textContent=(res&&res.fout)||'Mislukt'; f.style.display='block';
      }
    }).withFailureHandler(function(err){
      btn.disabled=false; btn.textContent='Inloggen';
      var f=document.getElementById('loginFout'); f.textContent=(err&&err.message)||'Netwerkfout'; f.style.display='block';
    }).adminLogin(ww);
  }
  function uitloggen(){ TOKEN=null; sessionStorage.removeItem('bhb_admin_token'); document.getElementById('app').style.display='none'; document.getElementById('login').style.display='block'; }

  // ── App-start ──
  function startApp(){
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='block';
    renderTabs();
    laadData();
  }
  function renderTabs(){
    document.getElementById('tabs').innerHTML = TABS.map(function(t){
      return '<div class="tab'+(t.id===actieveTab?' actief':'')+'" data-tab="'+t.id+'">'+t.label+'</div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(el){
      el.addEventListener('click', function(){ actieveTab=el.getAttribute('data-tab'); renderTabs(); render(); });
    });
  }
  function laadData(){
    google.script.run.withSuccessHandler(function(res){
      if(res && res.sessieVerlopen){ uitloggen(); toast('Sessie verlopen — log opnieuw in','rood'); return; }
      if(res && res.ok){ DATA=res; render(); renderTestBanner(); }
      else { document.getElementById('content').innerHTML='<div class="kaart">Fout: '+esc((res&&res.fout)||'onbekend')+'</div>'; }
    }).withFailureHandler(function(err){
      document.getElementById('content').innerHTML='<div class="kaart">Netwerkfout: '+esc(err&&err.message)+'</div>';
    }).adminData(TOKEN);
  }

  function renderTestBanner(){
    var el=document.getElementById('testBanner');
    if(DATA && DATA.testModusAan){
      el.innerHTML='<div class="test-banner"><span><b>⚡ Test-modus actief</b> — verkoopprijs staat op €0,01. Vergeet niet terug te zetten naar live.</span><button class="btn-sec" onclick="zetTestModus(false)">↺ Herstel €49</button></div>';
    } else { el.innerHTML=''; }
  }

  // ── Render per tab ──
  function render(){
    if(!DATA){ return; }
    var c=document.getElementById('content');
    if(actieveTab==='overzicht'){
      c.innerHTML=renderOverzicht();
      laadObservability();
    } else if(actieveTab==='klanten') c.innerHTML=renderKlanten();
    else c.innerHTML=renderConfigTab(CAT_PER_TAB[actieveTab]);
    bindConfigVelden();
    if(actieveTab==='verkoop') bindVerkoop();
    if(actieveTab==='klanten') bindKlanten();
    if(actieveTab==='integraties') bindSetup();
  }

  function bindSetup(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-setup]'), function(btn){
      btn.addEventListener('click', function(){ setupActie(btn.getAttribute('data-setup')); });
    });
  }

  function renderOverzicht(){
    var k=DATA.kpis, h=DATA.health;
    function pil(ok,labelOk,labelNee){ return '<span class="pil '+(ok?'ok':'nee')+'">'+(ok?labelOk:labelNee)+'</span>'; }
    return '<div class="kaart"><h2>Klanten</h2><div class="kpis">'+
      '<div class="kpi"><div class="v">'+k.totaal+'</div><div class="l">Totaal</div></div>'+
      '<div class="kpi"><div class="v">'+k.actief+'</div><div class="l">Actief</div></div>'+
      '<div class="kpi"><div class="v">'+k.onboarded+'</div><div class="l">Onboarded</div></div>'+
      '<div class="kpi"><div class="v" style="color:'+(k.wachtTemplate?'#B91C1C':'#0D1B4E')+'">'+k.wachtTemplate+'</div><div class="l">Wacht op template</div></div>'+
      '</div></div>'+
      '<div class="kaart"><h2>Gezondheid</h2><div class="health">'+
      pil(h.template,'Template OK','Template ontbreekt')+
      pil(h.mollie,'Mollie OK ('+esc(h.mollieMode)+')','Mollie ontbreekt')+
      pil(h.brevo,'Brevo OK','Brevo (fallback MailApp)')+
      '</div></div>'+
      '<div id="obsWrap"><div class="kaart"><div style="color:#5F6B7A;font-size:13px">Observability laden…</div></div></div>';
  }

  function laadObservability(){
    google.script.run.withSuccessHandler(function(o){
      if(!o || o.sessieVerlopen){ if(o&&o.sessieVerlopen) uitloggen(); return; }
      renderObservability(o);
    }).withFailureHandler(function(){}).adminObservability(TOKEN);
  }

  function renderObservability(o){
    var wrap=document.getElementById('obsWrap'); if(!wrap) return;
    var blokken=[];

    // 0) Assets — directe links naar alle Boekhoudbaar-onderdelen
    if(o.assets){
      var a=o.assets;
      function link(item){
        if(!item) return '';
        return '<a class="btn-sec" href="'+esc(item.url)+'" target="_blank" style="margin:4px 6px 4px 0">'+
          esc(item.naam)+(item.titel?' <span style="color:#5F6B7A;font-size:11px">— '+esc(item.titel)+'</span>':'')+
          '</a>';
      }
      // KRITIEKE check: als de Master Engine niet publiek deelbaar is,
      // krijgen klanten een 404 op de copy-link. Sam's eerste echte test
      // liep hier vast.
      var templateAlarm = '';
      if(a.template && a.template.publiekZichtbaar === false){
        templateAlarm =
          '<div style="background:#FDECEC;border:2px solid #B91C1C;border-radius:8px;padding:14px 18px;margin-bottom:14px">'+
          '<strong style="color:#B91C1C;font-size:14px">🚨 Master Engine is NIET deelbaar — klanten krijgen 404</strong>'+
          '<p style="margin:6px 0 8px;font-size:13px;color:#5A1010">Je Master Engine staat op "Beperkt". Nieuwe klanten kunnen er geen kopie van maken — ze zien <em>"Sorry, the file you have requested does not exist"</em> en haken af.</p>'+
          '<p style="margin:0 0 10px;font-size:13px;color:#5A1010"><strong>Fix in 30 seconden:</strong> open Master Engine → rechtsboven <strong>Delen</strong> → onder "Algemene toegang" zet <em>Beperkt</em> op <em>Iedereen met de link</em> (Kijker). Daarna refresh dit dashboard.</p>'+
          '<a href="'+esc(a.template.url)+'" target="_blank" class="btn-rood" style="text-decoration:none;display:inline-block;padding:8px 16px">Open Master Engine om te delen →</a> '+
          '<a href="'+esc(a.template.kopieerUrl)+'" target="_blank" class="btn-sec" style="margin-left:6px">Test copy-link (zou nu 404 zijn)</a>'+
          '</div>';
      } else if(a.template && a.template.publiekZichtbaar === true){
        templateAlarm =
          '<div style="background:#E6F7F4;border:1px solid #2EC4B6;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#0D7355">'+
          '✓ Master Engine is publiek deelbaar — klanten kunnen kopiëren.'+
          '</div>';
      }
      blokken.push('<div class="kaart"><h2>Mijn assets — alles in één klik</h2>'+
        templateAlarm+
        '<p style="font-size:13px;color:#5F6B7A;margin-bottom:10px">Eén Drive-map "Boekhoudbaar — Operations" bevat alle onderdelen. Bewerk altijd via dit dashboard zodat audit-trails kloppen.</p>'+
        '<div>'+link(a.opsMap)+link(a.script)+link(a.database)+link(a.template)+'</div>'+
        '</div>');
    }

    // 1) Deploy-versie: matchen we wat het dashboard hier in de browser denkt?
    var lokaalDV = window.DASHBOARD_VERSIE_LOKAAL;
    var serverDV = o.dashboardVersie || '?';
    var deployOk = (lokaalDV && serverDV && lokaalDV===serverDV);
    blokken.push(
      '<div class="kaart"><h2>Deploy-status</h2>'+
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'+
      '<span class="pil '+(deployOk?'ok':'nee')+'">'+
      (deployOk?'Code op server matched de browser-sessie':
        'Server draait dashboard '+esc(serverDV)+' · browser laadde '+esc(lokaalDV||'?'))+
      '</span>'+
      (deployOk?'':'<button class="btn-sec" onclick="location.reload()">Refresh</button>')+
      '</div>'+
      '<p style="margin:10px 0 0;font-size:12px;color:#5F6B7A">Wijzigt als je een nieuwe versie pusht naar de licentieserver maar de browser-tab nog een oude versie heeft. Refresh lost dat op.</p>'+
      '</div>');

    // 2) Licentie-sheet status
    var sc = o.sheetCheck || {};
    if(sc.ok==='leesbaar'){
      blokken.push('<div class="kaart"><h2>Licentie-sheet</h2><div class="health">'+
        '<span class="pil ok">'+esc(sc.sheetNaam||'OK')+' · '+sc.licenties+' licenties</span>'+
        (sc.sheetUrl?' <a class="btn-sec" href="'+esc(sc.sheetUrl)+'" target="_blank">Open in Drive</a>':'')+
        '</div></div>');
    } else {
      var kand='';
      if(sc.kandidaten && sc.kandidaten.length){
        kand='<p style="margin:10px 0 4px;font-size:13px"><strong>Gevonden in je Drive:</strong></p>'+
          '<ul style="margin:0 0 8px;font-size:13px">'+
          sc.kandidaten.map(function(k){
            return '<li style="margin:4px 0">'+esc(k.naam)+' — <button class="btn-sec" data-pak-sheet="'+esc(k.id)+'">Gebruik deze</button> '+
              '<a href="'+esc(k.url)+'" target="_blank" style="font-size:12px">openen</a></li>';
          }).join('')+'</ul>';
      }
      blokken.push('<div class="kaart"><h2>Licentie-sheet</h2>'+
        '<div class="health"><span class="pil nee">'+esc(sc.fout||'Sheet niet bereikbaar')+'</span></div>'+
        kand+
        '<div style="margin-top:10px"><button class="btn-rood" data-nieuw-sheet="1">Maak een NIEUWE licentie-sheet aan</button> '+
        '<span style="font-size:12px;color:#5F6B7A;margin-left:8px">Bestaande klantgegevens uit een oude sheet komen daarmee niet automatisch terug.</span></div>'+
        '</div>');
    }

    // 2b) Website-URL match-check (/kopen + /bedankt)
    var kc = o.kopenCheck || {};
    if(kc.ok==='mismatch' && kc.mismatches && kc.mismatches.length){
      var mismatchHtml = kc.mismatches.map(function(m){
        return '<li style="margin:6px 0;font-size:13px;color:#5A1010"><strong>'+esc(m.pagina)+'</strong> → '+esc(m.url)+'</li>';
      }).join('');
      blokken.push('<div class="kaart" style="border:2px solid #B91C1C"><h2 style="color:#B91C1C">🚨 Website wijst naar fossiele deployments</h2>'+
        '<p style="font-size:13px;color:#5A1010;margin:4px 0 6px"><strong>Jouw huidige beheer:</strong> '+esc(kc.huidig||'')+'</p>'+
        '<p style="font-size:13px;color:#5A1010;margin:0 0 6px"><strong>Mismatch op deze pagina(\'s):</strong></p>'+
        '<ul style="margin:0 0 10px 22px">'+mismatchHtml+'</ul>'+
        '<p style="font-size:13px;color:#5A1010">Klanten die deze pagina\'s bezoeken landen op een oude/verlaten deployment. Update de URL in de HTML-bestanden en deploy via Cloudflare.</p></div>');
    } else if(kc.ok==='match'){
      blokken.push('<div class="kaart"><h2>Website-URLs (kopen + bedankt)</h2>'+
        '<div class="health"><span class="pil ok">Beide pagina\'s wijzen naar jouw huidige deployment</span></div></div>');
    }

    // 3) Webhook gezondheid
    var w = o.webhook || {};
    blokken.push('<div class="kaart"><h2>Mollie-webhook (laatste 7 dagen)</h2><div class="health">'+
      '<span class="pil '+(w.ok===false?'nee':'ok')+'">'+
      (w.ok===false ? ('Fout: '+esc(w.fout||'')) : (w.betalingen7d+' betalingen verwerkt')) +
      '</span></div>'+
      '<p style="margin:8px 0 0;font-size:12px;color:#5F6B7A">Tel klanten met geldig Mollie-paymentId (tr_…). Nul = óf geen verkoop, óf de webhook is stuk. Check Mollie-dashboard als je toch verkoop verwachtte.</p>'+
      '</div>');

    // 4) Stille klanten
    var s = o.stilleKlanten || {};
    if(s.aantal>0){
      blokken.push('<div class="kaart"><h2>Stille klanten (>48u geen check-in)</h2><div class="health">'+
        '<span class="pil nee">'+s.aantal+' klanten</span></div>'+
        '<p style="font-size:13px;color:#1A1A1A;margin:8px 0 4px">Eerste vijf: '+s.namen.map(esc).join(', ')+'</p>'+
        '<p style="font-size:12px;color:#5F6B7A">Mogelijk: OAuth-revoke, spreadsheet verwijderd, of klant gewoon op vakantie. Wel iets om in de gaten te houden.</p>'+
        '</div>');
    } else {
      blokken.push('<div class="kaart"><h2>Stille klanten</h2><div class="health">'+
        '<span class="pil ok">Iedereen ping recent</span></div></div>');
    }

    // 5) Foutmeld-feed
    if(o.laatsteFouten && o.laatsteFouten.length){
      var rijen=o.laatsteFouten.map(function(f){
        return '<tr><td style="white-space:nowrap;font-family:monospace;font-size:11px">'+esc((f.ts||'').slice(0,16).replace('T',' '))+'</td>'+
          '<td><strong>'+esc(f.categorie||'?')+'</strong></td>'+
          '<td>'+esc(f.bericht||'')+'</td></tr>';
      }).join('');
      blokken.push('<div class="kaart"><h2>Recente server-fouten</h2>'+
        '<div style="overflow-x:auto"><table><thead><tr><th>Tijd</th><th>Type</th><th>Bericht</th></tr></thead><tbody>'+rijen+'</tbody></table></div>'+
        '<p style="font-size:12px;color:#5F6B7A;margin-top:8px">Soortgelijke fouten mailen 1×/uur naar '+esc(o.ownerEmail||'(geen owner-email gezet)')+'.</p>'+
        '</div>');
    }

    wrap.innerHTML = blokken.join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-pak-sheet]'), function(btn){
      btn.addEventListener('click', function(){ pakLicentieSheet(btn.getAttribute('data-pak-sheet')); });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-nieuw-sheet]'), function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('Een nieuwe licentie-sheet aanmaken. Eventuele oude klanten uit de huidige (kapotte) sheet komen NIET terug. Doorgaan?')) return;
        google.script.run.withSuccessHandler(function(r){
          if(r&&r.ok){ toast('Nieuwe sheet aangemaakt','groen'); laadData(); laadObservability(); }
          else toast((r&&r.fout)||'Mislukt','rood');
        }).adminSetupActie(TOKEN, 'licentie-sheet-aanmaken');
      });
    });
  }

  function pakLicentieSheet(id){
    google.script.run.withSuccessHandler(function(r){
      if(r&&r.ok){ toast('Licentie-sheet gekoppeld','groen'); laadObservability(); laadData(); }
      else toast((r&&r.fout)||'Mislukt','rood');
    }).adminZetConfig(TOKEN, 'LICENTIE_SHEET_ID', id);
  }

  function renderKlanten(){
    var rijen = DATA.klanten.map(function(c){
      return '<tr><td>'+esc(c.naam)+'</td><td>'+esc(c.email)+'</td><td>'+esc(c.status)+'</td>'+
        '<td>'+(c.onboarded||'—')+'</td>'+
        '<td style="white-space:nowrap">'+
        '<button class="btn-sec klant-actie" data-email="'+esc(c.email)+'" data-actie="herstuur">Opnieuw sturen</button> '+
        '<button class="btn-sec klant-actie" data-email="'+esc(c.email)+'" data-actie="intrekken">Intrekken</button> '+
        '<button class="btn-sec klant-actie" data-email="'+esc(c.email)+'" data-actie="verwijderen" style="color:#B91C1C">Verwijderen</button>'+
        '</td></tr>';
    }).join('');
    var fout = DATA.klantenFout ? '<div class="kaart" style="color:#B91C1C">'+esc(DATA.klantenFout)+'</div>' : '';
    return fout+'<div class="kaart"><h2>Klanten ('+DATA.klanten.length+')</h2>'+
      '<input class="zoek" id="klantZoek" placeholder="Filter op naam of e-mail…">'+
      '<div style="overflow-x:auto"><table><thead><tr><th>Naam</th><th>E-mail</th><th>Status</th><th>Onboarded</th><th>Acties</th></tr></thead>'+
      '<tbody id="klantBody">'+(rijen||'<tr><td colspan="5" style="color:#5F6B7A">Nog geen klanten.</td></tr>')+'</tbody></table></div></div>';
  }

  function renderConfigTab(categorie){
    var velden = DATA.schema.filter(function(v){ return v.categorie===categorie; });
    var extra='';
    if(categorie==='verkoop'){
      extra='<div class="kaart"><h2>Test-modus</h2><p style="color:#5F6B7A;margin-bottom:12px">Eén klik: zet de prijs op €0,01 en korting op €0 zodat je de hele koop-flow kunt testen op live Mollie.</p>'+
        '<button class="btn" id="testAanBtn">⚡ Test-modus AAN (€0,01)</button> '+
        '<button class="btn-sec" id="testUitBtn">↺ Herstel naar live (€49)</button></div>';
    }
    if(categorie==='integraties'){
      extra='<div class="kaart"><h2>Setup-acties</h2><p style="color:#5F6B7A;margin-bottom:12px">Eenmalige acties die je vroeger in de code-editor moest doen.</p>'+
        '<button class="btn-sec" data-setup="licentie-sheet">Licentie-sheet controleren</button> '+
        '<button class="btn-sec" data-setup="licentiebeheer-repareer">Licentiebeheer repareren</button> '+
        '<button class="btn-sec" data-setup="brevo-token">Brevo-webhook-URL genereren</button>'+
        '<p class="hint" style="margin-top:8px">Repareren: verplaatst klant-rijen die per ongeluk in Dashboard belandden, herstelt #REF!-formules, en test of Master Engine bereikbaar is.</p></div>';
    }
    var veldenHtml = velden.map(function(v){ return renderVeld(v); }).join('');
    return '<div class="kaart"><h2>'+esc(tabLabel(categorie))+'</h2>'+veldenHtml+'</div>'+extra;
  }
  function tabLabel(cat){ for(var i=0;i<TABS.length;i++){ if(CAT_PER_TAB[TABS[i].id]===cat) return TABS[i].label; } return cat; }

  function renderVeld(v){
    var cfg = DATA.config[v.key] || {};
    var huidige = (v.type==='secret') ? '' : (cfg.waarde||'');
    var placeholder = (v.type==='secret' && cfg.ingesteld) ? ('Ingesteld: '+esc(cfg.masker)+' — typ om te wijzigen') : '';
    var inputHtml;
    if(v.type==='keuze'){
      inputHtml='<select data-key="'+v.key+'">'+v.opties.map(function(o){ return '<option value="'+esc(o)+'"'+(o===huidige?' selected':'')+'>'+esc(o)+'</option>'; }).join('')+'</select>';
    } else if(v.type==='json' || (v.type==='tekst' && (v.key==='GLOBAL_BERICHT'||v.key==='VERSIE_TOELICHTING'))){
      inputHtml='<textarea data-key="'+v.key+'" rows="2" placeholder="'+esc(placeholder)+'">'+esc(huidige)+'</textarea>';
    } else {
      var t = (v.type==='secret')?'password':(v.type==='email'?'email':'text');
      inputHtml='<input data-key="'+v.key+'" type="'+t+'" value="'+esc(huidige)+'" placeholder="'+esc(placeholder)+'">';
    }
    return '<div class="veld"><label>'+esc(v.label)+'</label><div class="rij">'+inputHtml+
      '<button class="btn-sec opslaan-veld" data-key="'+v.key+'">Opslaan</button></div>'+
      (v.hint?'<div class="hint">'+esc(v.hint)+'</div>':'')+'</div>';
  }

  function bindConfigVelden(){
    Array.prototype.forEach.call(document.querySelectorAll('.opslaan-veld'), function(btn){
      btn.addEventListener('click', function(){
        var key=btn.getAttribute('data-key');
        var inp=document.querySelector('[data-key="'+key+'"]:not(button)');
        var waarde=inp?inp.value:'';
        btn.disabled=true; btn.textContent='…';
        google.script.run.withSuccessHandler(function(res){
          btn.disabled=false; btn.textContent='Opslaan';
          if(res && res.sessieVerlopen){ uitloggen(); return; }
          if(res && res.ok){ toast('Opgeslagen: '+key,'groen'); if(key==='PRODUCT_PRIJS'||key==='REF_KORTING'){ laadData(); } }
          else { toast((res&&res.fout)||'Mislukt','rood'); }
        }).withFailureHandler(function(err){ btn.disabled=false; btn.textContent='Opslaan'; toast((err&&err.message)||'Netwerkfout','rood'); })
        .adminZetConfig(TOKEN, key, waarde);
      });
    });
  }

  function bindVerkoop(){
    var a=document.getElementById('testAanBtn'), u=document.getElementById('testUitBtn');
    if(a) a.addEventListener('click', function(){ zetTestModus(true); });
    if(u) u.addEventListener('click', function(){ zetTestModus(false); });
  }
  function zetTestModus(aan){
    google.script.run.withSuccessHandler(function(res){
      if(res && res.sessieVerlopen){ uitloggen(); return; }
      if(res && res.ok){ toast(aan?'Test-modus aan — prijs €0,01':'Terug naar live — €49','groen'); laadData(); }
      else { toast((res&&res.fout)||'Mislukt','rood'); }
    }).withFailureHandler(function(err){ toast((err&&err.message)||'Netwerkfout','rood'); })
    .adminZetTestModus(TOKEN, aan);
  }

  function bindKlanten(){
    var zoek=document.getElementById('klantZoek');
    if(zoek) zoek.addEventListener('input', function(){
      var q=zoek.value.toLowerCase();
      Array.prototype.forEach.call(document.querySelectorAll('#klantBody tr'), function(tr){
        tr.style.display = tr.textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none';
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.klant-actie'), function(btn){
      btn.addEventListener('click', function(){
        var email=btn.getAttribute('data-email'), actie=btn.getAttribute('data-actie');
        var bevestig = actie==='verwijderen' ? 'Klantgegevens van '+email+' pseudonymiseren? (factuurnummers blijven 7 jaar bewaard)' :
                       actie==='intrekken' ? 'Licentie van '+email+' intrekken?' : null;
        if(bevestig && !confirm(bevestig)) return;
        btn.disabled=true;
        google.script.run.withSuccessHandler(function(res){
          btn.disabled=false;
          if(res && res.sessieVerlopen){ uitloggen(); return; }
          if(res && res.ok){ toast(res.bericht||'Klaar','groen'); laadData(); }
          else { toast((res&&res.fout)||'Mislukt','rood'); }
        }).withFailureHandler(function(err){ btn.disabled=false; toast((err&&err.message)||'Netwerkfout','rood'); })
        .adminKlantActie(TOKEN, email, actie);
      });
    });
  }

  function setupActie(welke){
    google.script.run.withSuccessHandler(function(res){
      if(res && res.sessieVerlopen){ uitloggen(); return; }
      toast((res&&res.bericht)||(res&&res.fout)||'Klaar', (res&&res.ok)?'groen':'rood');
    }).withFailureHandler(function(err){ toast((err&&err.message)||'Netwerkfout','rood'); })
    .adminSetupActie(TOKEN, welke);
  }

  // ── Auto-login als er nog een geldig token in deze tab staat ──
  if(TOKEN){
    google.script.run.withSuccessHandler(function(res){
      if(res && res.ok){ startApp(); } else { sessionStorage.removeItem('bhb_admin_token'); TOKEN=null; }
    }).withFailureHandler(function(){ sessionStorage.removeItem('bhb_admin_token'); TOKEN=null; }).adminData(TOKEN);
  }
</script></body></html>`;
}

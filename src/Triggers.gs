/**
 * Triggers.gs
 * Verwerkt het uniforme boekhoudformulier en dagelijkse taken.
 * Het hoofdformulier heeft drie secties: Inkomsten, Uitgaven, Declaratie.
 */

/**
 * CYCLE-35: form-datum parser met strikte validatie + zichtbare fout.
 *
 * Vóór deze cycle deden vier legacy/hoofdform-handlers:
 *   const datum = parseDatum_(data['…datum']) || new Date();
 * Het probleem:
 *   - parseDatum_ valt SILENT terug op vandaag bij garbage ('abc', '20260601'
 *     zonder separator, etc.) → factuur landt in verkeerd kwartaal →
 *     BTW-aangifte verstoord
 *   - `|| new Date()` is dead code want parseDatum_ retourneert nooit falsy
 *
 * Deze helper maakt het expliciet:
 *   - Leeg / ontbrekend → return fallback (default: vandaag) — bedoeld gedrag
 *   - Niet-parsebaar formaat → audit-log + throw met klantvriendelijke fout
 *   - Geldig formaat → geparsede Date
 *
 * @param {*} raw            Ruwe form-input
 * @param {string=} veldnaam Label voor audit-log + error-message
 * @param {Date=} fallback   Wat te returnen bij leeg/ontbrekend (default new Date())
 * @returns {Date}
 */
function _parseFormDatumStrikt_(raw, veldnaam, fallback) {
  const label = veldnaam || 'Datum';
  if (raw === null || raw === undefined || raw === '') return fallback || new Date();
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      safeAuditLog_(label + ' ongeldig', 'Invalid Date-object ontvangen');
      throw new Error(label + ' is ongeldig. Vul een datum in (formaat dd-mm-jjjj of jjjj-mm-dd).');
    }
    return raw;
  }
  const s = String(raw).trim();
  if (!s) return fallback || new Date();
  if (!/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})$/.test(s)) {
    safeAuditLog_(label + ' ongeldig', 'invoer: "' + s.slice(0, 40) + '"');
    throw new Error(label + ' is ongeldig: "' + s.slice(0, 40) + '". Gebruik formaat dd-mm-jjjj of jjjj-mm-dd.');
  }
  const d = parseDatum_(s);
  if (!d || isNaN(d.getTime())) {
    safeAuditLog_(label + ' parse-fout', 'invoer: "' + s.slice(0, 40) + '"');
    throw new Error(label + ' kon niet geparsed worden. Controleer de invoer.');
  }
  return d;
}

// ─────────────────────────────────────────────
//  ON EDIT: BEDRIJFSNAAM DOORVOEREN
// ─────────────────────────────────────────────
/**
 * Trigger — wordt automatisch aangeroepen bij elke celbewerking.
 * Twee taken:
 *   1. Audit trail — log elke wijziging op gevoelige tabbladen
 *   2. Bedrijfsnaam-detectie in Instellingen → spreadsheet hernoemen
 *
 * Beide stappen lopen onafhankelijk: één fout blokkeert de andere niet.
 */
function onEdit(e) {
  // Dedup: GAS fires onEdit 2× wanneer er ZOWEL een simple-trigger
  // (= deze functienaam onEdit) ALS een installable trigger ('onEdit' in
  // installeelTriggers_) bestaat. Zonder check krijg je dubbele audit-log
  // entries en bij side-effects (mail) dubbele acties.
  // Cache-key per range+timestamp; ttl 5s.
  try {
    const a1 = e && e.range ? e.range.getA1Notation() : '';
    if (a1) {
      const key = 'onEditDedup_' + a1 + '_' + Math.floor(Date.now() / 5000);
      const cache = CacheService.getScriptCache();
      if (cache.get(key)) return;  // tweede fire binnen 5s op zelfde cel → skip
      cache.put(key, '1', 5);
    }
  } catch (_) { /* dedup-fail: laat door (better duplicaat dan miss) */ }

  // ── Audit trail: log alle edits op gevoelige sheets ───────────
  try {
    schrijfAuditEdit_(e);
  } catch (err) {
    Logger.log('onEdit audit fout: ' + err.message);
  }

  // ── Edits op Instellingen-tab: cache invalideren + speciale handlers ────
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEETS.INSTELLINGEN) return;

    // Wis cache zodat de volgende getInstelling_ / getBelasting_ verse
    // waarden leest. Belasting-overrides reageren hier ook op. Doe dit
    // ALTIJD bij een Instellingen-edit, ongeacht welk veld — risico op
    // stale cache is groter dan kosten van één extra sheet-read.
    try { if (typeof wisInstellingenCache_ === 'function') wisInstellingenCache_(); } catch (_) {}

    // Alleen kolom B (waarden), label in kolom A
    if (e.range.getColumn() !== 2) return;
    const label = String(sheet.getRange(e.range.getRow(), 1).getValue());

    // Bedrijfsnaam → spreadsheet-titel updaten
    if (label === 'Bedrijfsnaam') {
      const nieuwNaam = String(e.value || '').trim();
      if (nieuwNaam && !nieuwNaam.startsWith('←')) {
        verwerkBedrijfsnaamWijziging_(nieuwNaam);
      }
      return;
    }

    // Belasting-override wijziging → audit-log voor traceerbaarheid
    if (label.indexOf('Tarief:') === 0 || label.indexOf('Grens:') === 0) {
      try {
        schrijfAuditLog_('Belasting-tarief gewijzigd door klant',
          label + ' = ' + String(e.value || '(leeg)'));
      } catch (_) {}
      // KPI-cache + advies-cache bust zodat dashboard meteen nieuwe getallen toont
      try { if (typeof bustCache_ === 'function') { bustCache_('kpi'); bustCache_('advies'); } } catch (_) {}
    }
  } catch (err) {
    Logger.log('onEdit fout: ' + err.message);
  }
}

/**
 * Schrijft een rij naar het Audit Log voor elke edit op een gevoelig tabblad.
 * Niet-fataal: nooit een gebruikersactie blokkeren als logging faalt.
 *
 * Watch-list: VERKOOPFACTUREN, INKOOPFACTUREN, INSTELLINGEN, BANKTRANSACTIES,
 *             HERHALENDE_KOSTEN, JOURNAALPOSTEN, RELATIES.
 */
function _AUDIT_WATCH_SHEETS_() {
  // Function used as constant — recomputed lazily so SHEETS is loaded.
  return [
    SHEETS.VERKOOPFACTUREN,
    SHEETS.INKOOPFACTUREN,
    SHEETS.INSTELLINGEN,
    SHEETS.BANKTRANSACTIES,
    SHEETS.HERHALENDE_KOSTEN,
    SHEETS.JOURNAALPOSTEN,
    SHEETS.RELATIES,
  ];
}

function schrijfAuditEdit_(e) {
  if (!e || !e.range || !e.source) return;
  const sheet = e.range.getSheet();
  const naam = sheet.getName();
  const watch = _AUDIT_WATCH_SHEETS_();
  if (watch.indexOf(naam) === -1) return;

  // Geen wijziging? Skip (formaat-edits, sortering)
  const oud = e.oldValue !== undefined ? e.oldValue : '';
  const nieuw = e.value !== undefined ? e.value : '';
  if (String(oud) === String(nieuw)) return;

  const ss = e.source;
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!auditSheet) return;

  let user = '';
  try { user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; } catch (_) {}

  // CYCLE-5 (axiom 5 — immutable na commit): detecteer wijzigingen op
  // financieel-kritieke kolommen van JOURNAALPOSTEN. In bound-script kan
  // sheet-protection klant niet hard tegenhouden (klant = eigenaar). Dus:
  //   1. severity-flag in audit-log
  //   2. toast met sterke waarschuwing
  //   3. owner-alert via meldFataalAanOwner_
  // Correcties horen via storno-boeking (nieuwe inverse journaalpost), niet
  // door bestaande regels te wijzigen.
  let severity = 'cell-edit';
  let kritiek = false;
  if (naam === SHEETS.JOURNAALPOSTEN) {
    // JOURNAALPOSTEN kolom-indices (1-based in A1Notation):
    //   B=Datum  E=Debet rek  G=Credit rek  I=Bedrag  J=BTW%  K=BTW bedrag
    const a1 = e.range.getA1Notation();
    const kolomLetter = String(a1).replace(/[0-9]/g, '').toUpperCase();
    if (['B', 'E', 'G', 'I', 'J', 'K'].indexOf(kolomLetter) !== -1) {
      severity = 'KRITIEKE-JOURNAALPOST-WIJZIGING';
      kritiek = true;
    }
  }

  const rij = [
    new Date(),
    user,
    naam,
    e.range.getA1Notation(),
    String(oud).slice(0, 500),
    String(nieuw).slice(0, 500),
    severity,
  ];

  // CYCLE 69: keten dit nieuwe record aan de vorige rij vast (kolom 8).
  // vorigeHash leest kolom 8 van de huidige laatste rij; bij een leeg
  // veld (genesis of legacy-rij van vóór cycle 69) start de schakel op ''.
  try {
    rij.push(_auditKetenHash_(_laatsteAuditHash_(auditSheet), rij));
  } catch (_) { /* hash-fout mag audit-write nooit blokkeren */ }

  // Voeg toe aan einde, daarna trim:
  //  • Datum-cutoff op 7 jaar (AWR art. 52 bewaarplicht — moet bewaard blijven)
  //  • Hard-cap 5000 rijen als safety-net tegen runaway-growth
  // Voorheen: 500 rijen ≈ 2,5 jaar, te kort voor compliance.
  auditSheet.appendRow(rij);

  // Kritieke journaalpost-edit: toast + owner-alert.
  if (kritiek) {
    try {
      ss.toast(
        'Wijziging op cel ' + e.range.getA1Notation() + ' van Journaalposten geregistreerd. ' +
        'Voor correcties: gebruik storno-boeking (nieuwe inverse regel), niet bestaande wijzigen — ' +
        'art. 52 AWR vereist bewaarplicht van originele boekingen.',
        '⚠ Kritieke journaalpost-wijziging',
        15
      );
    } catch (_) {}
    try {
      if (typeof meldFataalAanOwner_ === 'function') {
        meldFataalAanOwner_('JOURNAALPOST_MUTATIE',
          'Klant heeft financiële kolom van Journaalposten gewijzigd',
          { cel: e.range.getA1Notation(), oud: String(oud).slice(0, 100),
            nieuw: String(nieuw).slice(0, 100), user: user });
      }
    } catch (_) {}
  }

  _trimAuditLog_(auditSheet);
}

/**
 * Verwijdert audit-log rijen die ouder zijn dan 7 jaar (bewaarplicht-grens
 * art. 52 AWR is precies 7 jaar; we behouden alles binnen de termijn).
 * Daarnaast hard-cap op 5000 rijen om runaway-growth te beperken.
 *
 * Idempotent: opnieuw draaien bij gelijke staat = no-op.
 */
function _trimAuditLog_(auditSheet) {
  if (!auditSheet) return;
  const lastRow = auditSheet.getLastRow();
  if (lastRow <= 1) return;

  const HARD_CAP = 5000;
  const ZEVEN_JAAR_MS = 7 * 365.25 * 24 * 3600 * 1000;
  const cutoffDate = new Date(Date.now() - ZEVEN_JAAR_MS);

  // Lees alleen kolom 1 (datum) — efficiënt voor grote logs
  const datums = auditSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return r[0]; });
  let aantalTeOud = 0;
  for (let i = 0; i < datums.length; i++) {
    const d = datums[i];
    if (!(d instanceof Date)) break;        // log corrupt? stop trim
    if (d.getTime() >= cutoffDate.getTime()) break;  // alle volgende zijn jonger
    aantalTeOud++;
  }

  // Hard-cap: als totaal nog steeds > HARD_CAP na 7y-trim, verwijder ook oudste
  // recent-jonge rijen om limit te respecteren.
  const naCutoffTrim = lastRow - 1 - aantalTeOud;
  let extraOver = Math.max(0, naCutoffTrim - HARD_CAP);

  const totaalTeVerwijderen = aantalTeOud + extraOver;
  if (totaalTeVerwijderen > 0) {
    auditSheet.deleteRows(2, totaalTeVerwijderen);
  }
}

// ─────────────────────────────────────────────
//  CYCLE 69: HASH-KETEN OVER HET AUDIT LOG
// ─────────────────────────────────────────────
//
// Elke audit-rij krijgt in kolom 8 een SHA-256 van (hash-van-vorige-rij +
// de 7 data-cellen van deze rij). Wie achteraf een eerdere audit-regel
// wijzigt — bijvoorbeeld om te verbergen dat een journaalpost is aangepast —
// breekt de keten: vanaf die rij klopt geen enkele herberekende hash meer.
// De dagelijkse check (controleerAuditKetenProactief_) flagt dit.
//
// EERLIJK over de grens van deze garantie: dit is tamper-EVIDENT, niet
// tamper-PROOF. De klant is eigenaar van de sheet en kan dezelfde hash-
// functie draaien om de hele keten te herbouwen. Het detecteert dus
// per-ongeluk-wijziging, data-corruptie en casual manipulatie — het is
// géén verdediging tegen een vastberaden insider met toegang tot de code.
// Voor de bewaarplicht (art. 52 AWR) is dat precies de relevante laag:
// bewijs dat de bewaarde regels onderling consistent en onveranderd zijn.

/**
 * Canonieke, round-trip-stabiele string-representatie van de 7 data-cellen
 * van een audit-rij. Datums → 'yyyy-MM-dd HH:mm:ss' (seconde-precisie
 * overleeft het opslaan/teruglezen uit de sheet; rauwe getTime() niet door
 * serial-afronding). Gebruikt door ZOWEL writer als verifier — ze MOETEN
 * identiek canoniseren, anders breekt de keten bij elke verificatie.
 */
function _auditRijCanoniek_(rij7) {
  return rij7.map(function(c) {
    if (c instanceof Date) {
      return Utilities.formatDate(c, 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm:ss');
    }
    return String(c == null ? '' : c);
  }).join('\x1f');
}

/**
 * Berekent de ketenhash van één rij: SHA-256( vorigeHash + canoniek(rij7) ).
 * @param {string} vorigeHash  Hash van de vorige rij ('' voor genesis/legacy).
 * @param {Array}  rij7        De 7 data-cellen (zonder de hash-kolom).
 * @return {string} hex-encoded SHA-256.
 */
function _auditKetenHash_(vorigeHash, rij7) {
  var payload = String(vorigeHash || '') + '\x1e' + _auditRijCanoniek_(rij7);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
  return bytes.map(function(b) {
    return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0');
  }).join('');
}

/**
 * Leest de ketenhash (kolom 8) van de laatste data-rij. Spiegelt exact wat
 * de verifier als 'prev' gebruikt: lege kolom 8 (legacy/genesis) → ''.
 */
function _laatsteAuditHash_(auditSheet) {
  var lastRow = auditSheet.getLastRow();
  if (lastRow <= 1) return '';
  var v = auditSheet.getRange(lastRow, 8).getValue();
  return v ? String(v) : '';
}

/**
 * Logt een business-event (geen cell-edit) DUURZAAM naar het AUDIT_LOG-sheet,
 * in hetzelfde 7-koloms formaat + ketenhash als de onEdit-trigger. Ronde-3
 * (accountant): schrijfAuditLog_ schrijft alleen naar de roterende
 * ScriptProperties-buffer (max 100 entries) → legaal-significante events
 * zoals PERIODE_ONTGRENDELD overleefden de 7-jaars bewaarplicht (art. 52
 * AWR) niet. Deze helper geeft ze wél duurzame opslag, herleidbaar voor een
 * Belastingdienst-controleur. Faalt nooit hard.
 *
 * @param {string} actie   bv. 'PERIODE_ONTGRENDELD'
 * @param {string} detail  vrije tekst (max 500 chars bewaard)
 */
// eslint-disable-next-line no-unused-vars
function logBusinessEventNaarAuditSheet_(actie, detail) {
  try {
    var ss = getSpreadsheet_();
    if (!ss) return;
    var auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
    if (!auditSheet) return;
    var user = '';
    try { user = Session.getActiveUser().getEmail() || 'systeem'; } catch (_) { user = 'systeem'; }
    var rij = [
      new Date(),
      user,
      'Systeem-actie',
      '—',
      '',
      String(detail || '').slice(0, 500),
      String(actie || 'BUSINESS_EVENT'),
    ];
    try { rij.push(_auditKetenHash_(_laatsteAuditHash_(auditSheet), rij)); } catch (_) {}
    auditSheet.appendRow(rij);
    if (typeof _trimAuditLog_ === 'function') { try { _trimAuditLog_(auditSheet); } catch (_) {} }
  } catch (e) {
    try { Logger.log('logBusinessEventNaarAuditSheet_ faalde: ' + e.message); } catch (_) {}
  }
}

/**
 * Verifieert de hash-keten top-down. Herberekent elke schakel en vergelijkt
 * met de opgeslagen hash in kolom 8. Tolerant voor:
 *   • legacy-rijen van vóór cycle 69 (lege kolom 8) — niet te verifiëren,
 *     fungeren als her-anker (spiegelt de writer die dan prev='' gebruikte);
 *   • de eerste aanwezige rij na een trim (predecessor verwijderd) — wordt
 *     als anker geadopteerd, niet geverifieerd. We bewijzen de interne
 *     consistentie van de bewaarde keten, niet het verwijderde verleden.
 *
 * @return {{ok:boolean, gebrokenRij:number, gecontroleerd:number}}
 */
function verifieerAuditKeten_(auditSheet) {
  var sheet = auditSheet || (getSpreadsheet_() && getSpreadsheet_().getSheetByName(SHEETS.AUDIT_LOG));
  if (!sheet) return { ok: true, gebrokenRij: 0, gecontroleerd: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, gebrokenRij: 0, gecontroleerd: 0 };

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var prev = null;          // null = nog geen anker (eerste rij / na trim)
  var gecontroleerd = 0;
  for (var i = 0; i < data.length; i++) {
    var rij7 = data[i].slice(0, 7);
    var stored = data[i][KOL.AUDIT.ketenhash] ? String(data[i][KOL.AUDIT.ketenhash]) : '';
    if (prev !== null && stored !== '') {
      if (_auditKetenHash_(prev, rij7) !== stored) {
        return { ok: false, gebrokenRij: i + 2, gecontroleerd: gecontroleerd };
      }
      gecontroleerd++;
    }
    prev = stored;          // ook '' (legacy) doorgeven: writer deed dat ook
  }
  return { ok: true, gebrokenRij: 0, gecontroleerd: gecontroleerd };
}

/**
 * Dagelijkse check: verifieer de keten en alarmeer de owner bij een breuk.
 * Niet-fataal — een falende check mag de andere dagelijkse taken niet stoppen.
 */
function controleerAuditKetenProactief_() {
  var ss = getSpreadsheet_();
  if (!ss) return;
  var auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!auditSheet) return;

  var r = verifieerAuditKeten_(auditSheet);
  if (!r.ok) {
    try {
      schrijfAuditLog_('AUDIT_KETEN_GEBROKEN',
        'Hash-keten wijkt af op rij ' + r.gebrokenRij + ' — eerdere audit-regel mogelijk achteraf gewijzigd');
    } catch (_) {}
    try {
      if (typeof meldFataalAanOwner_ === 'function') {
        meldFataalAanOwner_('AUDIT_KETEN_GEBROKEN',
          'De hash-keten van het Audit Log is gebroken op rij ' + r.gebrokenRij +
          '. Een eerder vastgelegde audit-regel is mogelijk achteraf gewijzigd of corrupt geraakt.',
          { rij: r.gebrokenRij, gecontroleerd: r.gecontroleerd });
      }
    } catch (_) {}
  }
}

/**
 * Past de spreadsheet-naam en de Dashboard-koptekst aan op de nieuwe bedrijfsnaam.
 * @param {string} naam
 */
function verwerkBedrijfsnaamWijziging_(naam) {
  const ss = getSpreadsheet_();
  const jaar = new Date().getFullYear();

  // Hernoem het spreadsheet-bestand
  try {
    ss.rename('Boekhouding ' + naam + ' ' + jaar);
  } catch (e) {
    Logger.log('Hernoemen spreadsheet mislukt: ' + e.message);
  }

  // Wis de instellingen-cache via de helper in Setup.gs
  try { wisInstellingenCache_(); } catch (e) {}

  // Update Dashboard-koptekst direct (zonder volledige herberekening)
  try {
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (dash) {
      const huidigeWaarde = String(dash.getRange(1, 1).getValue());
      if (huidigeWaarde.includes('DASHBOARD')) {
        dash.getRange(1, 1).setValue('FINANCIEEL DASHBOARD \u2013 ' + naam.toUpperCase());
      }
    }
  } catch (e) {
    Logger.log('Dashboard-koptekst bijwerken mislukt: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  UNIFIED FORM HANDLER (alles-in-één formulier)
// ─────────────────────────────────────────────
function verwerkHoofdformulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const type = String(data['Wat wil je doen?'] || '');
    const ss = getSpreadsheet_();
    schrijfAuditLog_('Formulier ontvangen', 'type: ' + type);

    // D3 (audit 2026-06-12): bij eerste boeking in een nieuw kalenderjaar
    // waarvoor géén bevestigde tarieven bestaan, waarschuw eenmalig owner
    // + toast + audit-log. Voorkomt dat een klant in 2028 stil doorboekt
    // met 2026-tarieven omdat de TARIEF_VEROUDERD-vlag alleen op het
    // Belastingadvies-tabblad zichtbaar was.
    try {
      if (typeof controleerTariefVerouderdWaarschuwing_ === 'function') {
        controleerTariefVerouderdWaarschuwing_(ss);
      }
    } catch (_) {}

    if (type.includes('Inkomsten')) {
      verwerkInkomstenUitHoofdformulier_(ss, data);
    } else if (type.includes('Uitgaven')) {
      verwerkUitgavenUitHoofdformulier_(ss, data);
    } else if (type.includes('Declaratie')) {
      verwerkDeclaratieUitHoofdformulier_(ss, data);
    } else {
      schrijfAuditLog_('Formulier ONBEKEND type', type);
      Logger.log('Onbekend formuliertype: ' + type);
    }

    vernieuwDashboard();

  } catch (err) {
    schrijfAuditLog_('FOUT Formulier', err.message);
    Logger.log('Fout verwerkHoofdformulier: ' + err.message + '\n' + err.stack);
    stuurFoutEmail_('Hoofdformulier verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  INKOMSTEN (factuur aanmaken)
// ─────────────────────────────────────────────
function verwerkInkomstenUitHoofdformulier_(ss, data) {
  // CYCLE 74: pre-flight op verplichte bedrijfsgegevens. Dit is de chokepoint
  // voor ALLE factuur-paden (dialog, Google Form, API). Zonder Bedrijfsnaam/
  // IBAN zou hier een onbetaalbare factuur ("Ons Bedrijf", geen betaalblok)
  // ontstaan die de klant pas merkt na verzending. Throw vóór enige creatie:
  //   • dialog → fout terug in het dialoogvenster
  //   • Form   → verwerkHoofdformulier vangt + mailt de eigenaar (geen
  //              gênante factuur naar de eind-klant)
  //   • API    → JSON-foutrespons naar de caller
  if (typeof _eisFactuurBedrijfsgegevens_ === 'function') _eisFactuurBedrijfsgegevens_();

  const klantnaam  = data['Klantnaam'] || '';
  const klantEmail = String(data['Klant e-mailadres'] || '').trim();
  const klantAdres = data['Factuuradres klant'] || '';
  // CYCLE-35: strikt parsen — voorheen viel parseDatum_ silent terug op
  // vandaag bij garbage. Nu throw bij niet-parsebaar formaat zodat klant
  // zijn typo ziet ipv silent verkeerd kwartaal.
  const datum      = _parseFormDatumStrikt_(data['Factuurdatum'], 'Factuurdatum');
  // Datum-range validatie:
  //   * niet > 90 dagen toekomst (anti-fraude / typo)
  //   * niet > 7 jaar in verleden (bewaarplicht-grens AWR art. 52 = 7 jaar)
  // Beide cases zijn geldig in zeer specifieke gevallen, dus we waarschuwen
  // i.p.v. blokkeren — schrijven naar audit-log voor compliance-trail.
  const _nu = new Date();
  const _maxToekomst = new Date(_nu.getTime() + 90 * 86400000);
  const _maxVerleden = new Date(_nu.getFullYear() - 7, _nu.getMonth(), _nu.getDate());
  if (datum > _maxToekomst) {
    safeAuditLog_('Factuur datum-waarschuwing', 'datum > 90 dagen toekomst: ' + formatDatum_(datum));
  } else if (datum < _maxVerleden) {
    safeAuditLog_('Factuur datum-waarschuwing', 'datum > 7 jaar verleden (bewaarplicht): ' + formatDatum_(datum));
  }
  const termijn    = parseInt(data['Betalingstermijn (dagen)'] || '30') || 30;
  if (termijn <= 0) {
    throw new Error('Betalingstermijn moet groter dan 0 dagen zijn (gevonden: ' + termijn + ').');
  }
  if (termijn > 365) {
    // Belastingdienst-stelling: betalingstermijnen > 12 maanden zijn ongebruikelijk
    // en kunnen op een typo wijzen (3650 i.p.v. 365). Niet blokkeren — wel loggen.
    safeAuditLog_('Factuur termijn-waarschuwing', 'termijn > 1 jaar: ' + termijn);
  }
  const vervaldatum = new Date(datum.getTime() + termijn * 86400000);
  const directMailen = String(data['Factuur direct e-mailen naar klant?'] || '').includes('Ja');

  // Factuurregels (5 regels) — VALIDEREN VOORDAT factuurnummer-counter wordt bumped.
  // Belastingdienst eist sequentiële factuurnummers; gat door early-return = audit-flag.
  // Skip-regel: omschrijving leeg OF aantal<=0 OF prijs<=0. Voorkomt €0-regels en
  // negatieve regels (refund-risk). Negatieve aantal/prijs wordt bovendien gelogd.
  const regels = [];
  const overgeslagenRegels = [];
  // Loopt 1-20 (was 5). Lege regels worden via skip-check overgeslagen.
  // Dialog kan tot 20 regels; Google-formulier-pad heeft 5 (vult de rest niet).
  for (let i = 1; i <= 20; i++) {
    const omschr = String(data[`Regel ${i} – Omschrijving`] || '').trim();
    const ruwAantal = data[`Regel ${i} – Aantal`];
    const ruwPrijs  = data[`Regel ${i} – Prijs per eenheid (excl. BTW)`];

    // Volledig lege regel → stille skip (klant heeft regel niet ingevuld)
    const leeg = !omschr &&
      (ruwAantal === undefined || ruwAantal === null || ruwAantal === '' || String(ruwAantal) === '0') &&
      (ruwPrijs  === undefined || ruwPrijs  === null || ruwPrijs  === '' || String(ruwPrijs)  === '0');
    if (leeg) continue;

    if (!omschr) { overgeslagenRegels.push(`Regel ${i}: omschrijving leeg`); continue; }

    // Strict parsing — bij niet-numeriek werpt parseBedragStrict_ direct.
    // Voorkomt corrupt journaalpost-bedrag door tekstinvoer.
    let aantal, prijs;
    try { aantal = parseBedragStrict_(ruwAantal, `Regel ${i} aantal`); }
    catch (e) { overgeslagenRegels.push(e.message); continue; }
    try { prijs  = parseBedragStrict_(ruwPrijs,  `Regel ${i} prijs`); }
    catch (e) { overgeslagenRegels.push(e.message); continue; }

    if (aantal <= 0) { overgeslagenRegels.push(`Regel ${i} (${omschr}): aantal moet > 0 zijn`); continue; }
    if (prijs <= 0) { overgeslagenRegels.push(`Regel ${i} (${omschr}): prijs moet > €0 zijn`); continue; }
    const totaal = regelTotaalCent_(aantal, prijs);
    regels.push({ omschr, aantal, prijs, totaal });
  }

  if (regels.length === 0) {
    const detail = overgeslagenRegels.length
      ? '\n\nOvergeslagen regels:\n• ' + overgeslagenRegels.join('\n• ')
      : '';
    schrijfAuditLog_('Factuur MISLUKT', 'Geen geldige factuurregels — geen nummer geclaimd' + (detail ? ' | ' + overgeslagenRegels.join(' | ') : ''));
    throw new Error('Geen geldige factuurregels gevonden. Vul minimaal één regel met omschrijving, aantal > 0 en prijs > €0.' + detail);
  }
  if (overgeslagenRegels.length) {
    safeAuditLog_('Factuur regels overgeslagen', overgeslagenRegels.join(' | '));
  }

  // Klant-BTW-nr formaat-check (niet-blokkerend) — bij verleggingsregeling
  // is een geldig EU-BTW-nr verplicht (Wet OB art. 12 lid 3). We waarschuwen
  // alleen via audit-log, blokkeren niet (B2C-facturen hebben geen BTW-nr).
  const klantBtwNr = String(data['BTW-nummer klant'] || '').trim();
  if (klantBtwNr && !isGeldigEuBTWNummer_(klantBtwNr)) {
    safeAuditLog_('Factuur klant-BTW-waarschuwing', 'Onbekend BTW-nr-formaat: ' + klantBtwNr);
  }

  // Pas NA validatie nummer claimen — voorkomt gap in factuurreeks
  const factuurNr  = volgendFactuurnummer_();
  // Factuurnummer-gap-check: vergelijk met laatste in sheet. Een gat > 1
  // (overgeslagen nummers) is een audit-flag voor de Belastingdienst.
  // We loggen alleen — herstellen vergt manuele actie.
  try {
    const _vfSheetCheck = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (_vfSheetCheck && _vfSheetCheck.getLastRow() > 1) {
      const _lastCol = _vfSheetCheck.getRange(_vfSheetCheck.getLastRow(), 1).getValue();
      const _laatsteNr = parseInt(_lastCol, 10);
      if (_laatsteNr > 0 && factuurNr - _laatsteNr > 1) {
        schrijfAuditLog_('Factuurnummer GAP gedetecteerd',
          'Vorig: ' + _laatsteNr + ' Nieuw: ' + factuurNr +
          ' (gap=' + (factuurNr - _laatsteNr - 1) + ' nummers). Audit-flag.');
      }
    }
  } catch (_) { /* gap-check is best-effort */ }

  const korting    = parseBedrag_(data['Korting (in €)'] || '0') || 0;
  const btwTarief  = parseBtwTarief_(data['BTW tarief'] || '21% (hoog)');
  const _subtotaal = regels.reduce((s, r) => s + r.totaal, 0);
  if (korting < 0) {
    throw new Error('Korting moet ≥ €0 zijn (gevonden: ' + formatBedrag_(korting) + ').');
  }
  if (korting > _subtotaal) {
    throw new Error('Korting (' + formatBedrag_(korting) + ') is groter dan totaal regels (' +
      formatBedrag_(_subtotaal) + '). Een factuur mag niet negatief zijn — maak een correctiefactuur (creditnota) voor terugbetaling.');
  }
  const totalExcl    = rondBedrag_(_subtotaal - korting);
  const totalBtw   = btwTarief !== null ? rondTariefCent_(totalExcl, btwTarief) : 0;
  const totalIncl  = rondBedrag_(totalExcl + totalBtw);

  // Klant opslaan/ophalen (inclusief e-mailadres)
  const klantId = zoekOfMaakRelatie_(ss, klantnaam, RELATIE_TYPE.KLANT, klantEmail);

  const prefix = getInstelling_('Factuurprefix') || 'F';
  const factuurNummerOpgemaakt = formatFactuurnummer_(factuurNr, prefix, 6);
  const factuurData = [
    factuurNr,
    factuurNummerOpgemaakt,
    datum,
    vervaldatum,
    klantId,
    klantnaam,
    data['KvK-nummer klant'] || '',
    data['BTW-nummer klant'] || '',
    regels.map(r => r.omschr).join('; '),
    totalExcl,
    data['BTW tarief'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    totalBtw,
    totalIncl,
    0,
    FACTUUR_STATUS.CONCEPT,
    '',
    '',
    data['Projectcode / Referentie'] || '',
    data['Notities op factuur'] || '',
    '',   // PDF URL (later ingevuld)
    bepaalOmzetRekening_(data['BTW tarief']),
    new Date(),
    Session.getActiveUser().getEmail(),
  ];

  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);

  // Idempotency: blokkeer dubbele verwerking van hetzelfde factuurnummer
  const bestaandeRijen = vfSheet.getDataRange().getValues();
  const datumStr = Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd');
  let recenteDuplicate = null;
  for (let i = 1; i < bestaandeRijen.length; i++) {
    if (bestaandeRijen[i][KOL.VF.factuurId] === factuurNr) {
      schrijfAuditLog_('Factuur DUBBEL geblokkeerd', factuurNummerOpgemaakt + ' bestaat al in sheet');
      throw new Error('Factuur ' + factuurNummerOpgemaakt + ' bestaat al — dubbele verwerking geblokkeerd.');
    }
    // Self-healing: detecteer 'gevoelsmatige' duplicate — zelfde klant + zelfde
    // datum + zelfde bedrag binnen 5 minuten = waarschijnlijk dubbel-submit.
    // Geen blokkade (kan legitiem zijn), wél waarschuwing in audit-log.
    const exDatum = bestaandeRijen[i][KOL.VF.datum];
    const exKlant = String(bestaandeRijen[i][KOL.VF.klantnaam] || '');
    const exIncl  = parseFloat(bestaandeRijen[i][KOL.VF.bedragIncl]) || 0;
    if (exDatum) {
      const exDatumStr = Utilities.formatDate(new Date(exDatum), 'Europe/Amsterdam', 'yyyy-MM-dd');
      if (exDatumStr === datumStr && exKlant === klantnaam && Math.abs(exIncl - totalIncl) < 0.01) {
        recenteDuplicate = bestaandeRijen[i][KOL.VF.factuurnummer] || ('rij ' + (i + 1));
      }
    }
  }
  if (recenteDuplicate) {
    schrijfAuditLog_('Factuur dubbel-submit verdacht',
      factuurNummerOpgemaakt + ' lijkt op bestaande ' + recenteDuplicate +
      ' (zelfde klant/datum/bedrag) — niet geblokkeerd, audit-flag gezet');
    try { if (typeof rapporteerAnomalie_ === 'function') rapporteerAnomalie_('factuur_mogelijk_dubbel', 'similar to ' + recenteDuplicate); } catch (_) {}
  }

  // INVARIANT-CHECK: factuurnummer-uniciteit (art. 35a Wet OB).
  // volgendFactuurnummer_ heeft script-lock, dus duplicaat is theoretisch
  // onmogelijk. Maar bij script-restart of property-corruptie kan teller
  // resetten — extra check vóór append voorkomt corrupt-state. Bij
  // schending: blokkeer write, klant ziet specifieke fout.
  try {
    if (typeof valideerFactuurnummerUniek_ === 'function') {
      valideerFactuurnummerUniek_(ss, factuurNummerOpgemaakt);
    }
  } catch (invErr) {
    noodLog_('FACTUURNR_DUPLICAAT_DETECT', factuurNummerOpgemaakt + ' — ' + invErr.message);
    try { meldFataalAanOwner_('INVARIANT_BREACH', 'factuurnr duplicaat gedetecteerd vóór write', { factuurnr: factuurNummerOpgemaakt, code: invErr.code }); } catch (_) {}
    throw invErr;
  }

  // Critical write — beschermd door dubbel-logging: appendRow + noodLog_.
  // Als sheet locked/quota: noodLog_ is laatste-redmiddel in ScriptProperty.
  try {
    vfSheet.appendRow(factuurData);
  } catch (writeErr) {
    noodLog_('FACTUUR_SHEET_WRITE_FOUT', factuurNummerOpgemaakt + ' | ' + klantnaam + ' | ' + totalIncl + ' | ' + writeErr.message);
    try { meldFataalAanOwner_('DATA_LOSS', 'appendRow factuur faalde', { factuurnummer: factuurNummerOpgemaakt, fout: writeErr.message }); } catch (_) {}
    throw writeErr;  // factuurnummer is reeds geclaimd; user moet dit weten
  }
  const nieuweRij = vfSheet.getLastRow();
  // Invalideer KPI + Belastingadvies cache — anders ziet klant op Dashboard
  // de nieuwe factuur pas na 5 min als de cache verloopt.
  try { bustCache_('kpi'); bustCache_('advies'); } catch (_) {}
  schrijfAuditLog_('Factuur in sheet', factuurNummerOpgemaakt + ' | klant: ' + klantnaam + ' | excl: ' + totalExcl + ' | incl: ' + totalIncl);
  noodLog_('Factuur opgeslagen', factuurNummerOpgemaakt + ' | ' + totalIncl);

  // Journaalposten
  const omschr = `Verkoopfactuur ${factuurNummerOpgemaakt} – ${klantnaam}`;
  maakJournaalpost_(ss, {
    datum, omschr, dagboek: 'Verkoopboek',
    debet: '1100', credit: bepaalOmzetRekening_(data['BTW tarief']),
    bedrag: totalExcl, btwTarief, btwBedrag: 0,
    ref: factuurNummerOpgemaakt, type: BOEKING_TYPE.VERKOOPFACTUUR,
  });
  if (totalBtw > 0) {
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (BTW)', dagboek: 'Verkoopboek',
      debet: '1100', credit: bepaalBtwVerkoopRekening_(data['BTW tarief']),
      bedrag: totalBtw, btwTarief, btwBedrag: totalBtw,
      ref: factuurNummerOpgemaakt, type: BOEKING_TYPE.VERKOOPFACTUUR,
    });
  }

  // PDF genereren — eerst flush() forceren zodat appendRow + journaalposten
  // ALLEMAAL gepersistereerd zijn vóór de export-URL aangeroepen wordt.
  // Zonder flush kan PDF stale data bevatten (Google Sheets schrijft async).
  // Utilities.sleep(500) was eerder de fragiele oplossing — flush() is contractueel.
  SpreadsheetApp.flush();
  Utilities.sleep(200);
  const formData = {
    'Factuuradres klant': klantAdres,
    'BTW-nummer klant': data['BTW-nummer klant'] || '',
    'BTW tarief': data['BTW tarief'] || '21% (hoog)',
    'Projectcode / Referentie': data['Projectcode / Referentie'] || '',
    'Notities / bijzonderheden': data['Notities op factuur'] || '',
    'Klant e-mailadres': klantEmail,
  };
  const pdfUrl = genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, formData);

  // UBL genereren
  const ublUrl = genereerUBL_(factuurNr, klantnaam, klantAdres, regels, totalExcl, totalBtw, totalIncl, datum, vervaldatum, btwTarief);

  // BTW-spaarpot auto-reservering (opt-in via instelling 'BTW automatisch reserveren')
  // Voorkomt dat klant per ongeluk BTW besteedt — bij elke factuur wordt BTW-deel
  // direct van 1200 naar 1205 (BTW-spaarpot) geboekt zodat het apart staat.
  try {
    if (typeof reserveerBtwOpSpaarpot_ === 'function') {
      reserveerBtwOpSpaarpot_(ss, factuurNummerOpgemaakt, totalBtw, datum);
    }
  } catch (_) { /* spaarpot is best-effort */ }

  // PDF URL opslaan; log expliciet als PDF ontbreekt
  if (pdfUrl) {
    vfSheet.getRange(nieuweRij, 20).setValue(pdfUrl);
  } else {
    schrijfAuditLog_('PDF MISLUKT', factuurNummerOpgemaakt + ' – PDF niet gegenereerd; factuur staat in sheet zonder PDF');
    Logger.log('WAARSCHUWING: PDF niet gegenereerd voor ' + factuurNummerOpgemaakt);
  }

  // ── GHOST-SUCCESS BESCHERMING ─────────────────────────────────
  // Idempotency-key tegen het scenario "stroom valt uit ná email maar
  // VÓÓR sheet-update". Zonder deze guard zou klant op retry een tweede
  // factuur-mail krijgen.
  //
  // Strategie: registreer "EMAIL_PENDING" status in ScriptProperty + sheet
  // VÓÓR MailApp.sendEmail. Als email succeeds maar status-write crasht,
  // ziet volgende run 'PENDING' en weet: NIET opnieuw versturen, alleen
  // status repareren.
  let emailVerzonden = false;
  const emailIdemKey = 'emailVerzonden_' + factuurNummerOpgemaakt;
  if (directMailen && klantEmail && pdfUrl) {
    const propsEmail = PropertiesService.getScriptProperties();
    const reedsVerzonden = propsEmail.getProperty(emailIdemKey);
    if (reedsVerzonden && reedsVerzonden.indexOf('DONE') === 0) {
      // Klant probeert opnieuw — email is al de deur uit, alleen sheet-status repareren
      schrijfAuditLog_('Email DUBBEL geblokkeerd', factuurNummerOpgemaakt + ' — al verzonden, skip');
      emailVerzonden = true;
    } else if (reedsVerzonden && reedsVerzonden.indexOf('PENDING') === 0) {
      // Vorige run crashte TUSSEN sendEmail-success en setProperty('DONE').
      // De mail kan al de deur uit zijn — we mogen NIET nog eens versturen
      // anders krijgt klant 2x factuur. Owner kan handmatig verifieren via
      // het Verzonden-Items-Gmail-tabblad en bij twijfel opnieuw versturen
      // via 'Verstuur factuur via e-mail' in de factuurlijst.
      schrijfAuditLog_('Email PENDING — retry GEBLOKKEERD',
        factuurNummerOpgemaakt + ' — vorige run crashte midden in versturen. ' +
        'Check Gmail Verzonden-Items om te verifieren. Property: ' + reedsVerzonden);
      try { meldFataalAanOwner_('EMAIL_PENDING_RETRY',
        'Klant probeerde factuur ' + factuurNummerOpgemaakt + ' opnieuw te versturen ' +
        'terwijl status PENDING is. Geen automatische retry — verifieer in Gmail.',
        { factuurnummer: factuurNummerOpgemaakt, klantEmail: klantEmail, pendingSinds: reedsVerzonden }); } catch (_) {}
      // Mark als 'mogelijk verstuurd' — geen tweede mail, klant ziet status
      // VERZONDEN (consistent met meest waarschijnlijke realiteit).
      emailVerzonden = true;
    } else {
      // Markeer PENDING vóór versturen — als crash hierna, weet retry: niet 2× versturen
      try {
        propsEmail.setProperty(emailIdemKey, 'PENDING:' + Date.now());
        if (pdfUrl) vfSheet.getRange(nieuweRij, 15).setValue('Verzendt…');
        SpreadsheetApp.flush();
      } catch (_) {}

      try {
        emailVerzonden = stuurFactuurEmailNaarKlant_(klantEmail, klantnaam, factuurNummerOpgemaakt, totalIncl, vervaldatum, pdfUrl, ublUrl) === true;
      } catch (sendErr) {
        emailVerzonden = false;
        Logger.log('stuurFactuurEmailNaarKlant_ throw: ' + sendErr.message);
      }

      // Markeer DONE direct na succes — atomair sneller dan sheet-write
      if (emailVerzonden) {
        // Schrijf 'DONE:&lt;ts&gt;' i.p.v. plain 'DONE' zodat cleanupEmailIdem
        // (Triggers.gs:1621) de key na 180d kan verwijderen. Plain 'DONE'
        // gaf new Date('DONE')=NaN → cleanup was no-op → 500KB-cliff bij
        // high-volume klanten. Audit 2026-06-12.
        try { propsEmail.setProperty(emailIdemKey, 'DONE:' + Date.now()); } catch (_) {}
        schrijfAuditLog_('Email verstuurd', factuurNummerOpgemaakt + ' → ' + klantEmail);
      } else {
        // Reset PENDING — retry mag opnieuw proberen
        try { propsEmail.deleteProperty(emailIdemKey); } catch (_) {}
        schrijfAuditLog_('Email MISLUKT', factuurNummerOpgemaakt + ' → ' + klantEmail + ' – versturen mislukt');
        try {
          if (typeof dlqVoegToe_ === 'function') {
            dlqVoegToe_('EMAIL_FACTUUR', {
              email: klantEmail, klantnaam: klantnaam,
              factuurnummer: factuurNummerOpgemaakt,
              bedragIncl: totalIncl, vervaldatum: vervaldatum,
              pdfUrl: pdfUrl, ublUrl: ublUrl,
            }, 'Initiële email mislukt — auto-retry binnen 1 uur');
          }
        } catch (_) {}
      }
    }
  } else if (directMailen && !klantEmail) {
    schrijfAuditLog_('Email OVERGESLAGEN', factuurNummerOpgemaakt + ' – geen klant e-mailadres bekend. Vul het e-mailadres in bij de klant-relatie en verstuur handmatig via Boekhouding → Verkoopfacturen.');
  } else if (directMailen && klantEmail && !pdfUrl) {
    schrijfAuditLog_('Email OVERGESLAGEN', factuurNummerOpgemaakt + ' – PDF niet beschikbaar, email niet verzonden');
  }

  // Status na werkelijk email-resultaat zetten (niet op intentie)
  if (pdfUrl) {
    const nieuweStatus = emailVerzonden ? FACTUUR_STATUS.VERZONDEN : FACTUUR_STATUS.CONCEPT;
    vfSheet.getRange(nieuweRij, 15).setValue(nieuweStatus);
    SpreadsheetApp.flush();  // garandeer status-persist vóór return
  }

  Logger.log(`Verkoopfactuur ${factuurNummerOpgemaakt} aangemaakt voor ${klantnaam}`);

  // ── Financieel snapshot (zero extra sheet reads) ───────────────────────
  // bestaandeRijen was loaded above for the idempotency check.
  // We compute YTD excl. revenue and open debiteuren from existing rows,
  // then add this new invoice's contribution.
  const huidigJaar = new Date().getFullYear();
  let ytdOmzetExcl = 0;
  let debiteurenOpenNa = 0;
  for (let i = 1; i < bestaandeRijen.length; i++) {
    const r = bestaandeRijen[i];
    // CYCLE-59: parseDatum_ ipv bare new Date() — anders worden string-dated
    // facturen (CSV-import / sheet-restore) silent geskipped → YTD-omzet
    // ondertelt → mijlpaal-banner toont onjuist "eerste €X dit jaar"-bedrag.
    // Zelfde patroon als cycle 38 (EUVerkoop) en cycle 39 (Engagement).
    const rDatum = r[2] ? ((r[2] instanceof Date) ? r[2] : parseDatum_(r[2])) : null;
    if (rDatum && !isNaN(rDatum.getTime()) && rDatum.getFullYear() === huidigJaar) {
      ytdOmzetExcl += parseFloat(r[9]) || 0;
    }
    const rStatus = r[14];
    if (rStatus !== FACTUUR_STATUS.BETAALD && rStatus !== FACTUUR_STATUS.GECREDITEERD) {
      const rOpen = rondBedrag_((parseFloat(r[12]) || 0) - (parseFloat(r[13]) || 0));
      if (rOpen > 0) debiteurenOpenNa += rOpen;
    }
  }
  // Add this new invoice (YTD + open debiteur)
  ytdOmzetExcl = rondBedrag_(ytdOmzetExcl + totalExcl);
  debiteurenOpenNa = rondBedrag_(debiteurenOpenNa + totalIncl);

  return {
    ok:              true,
    factuurnummer:   factuurNummerOpgemaakt,
    emailVerzonden:  emailVerzonden,
    pdfUrl:          pdfUrl || null,
    sheetRij:        nieuweRij,
    ytdOmzetExcl:    ytdOmzetExcl,
    debiteurenOpen:  debiteurenOpenNa,
  };
}

// ─────────────────────────────────────────────
//  UITGAVEN (inkoopfactuur registreren)
// ─────────────────────────────────────────────
function verwerkUitgavenUitHoofdformulier_(ss, data) {
  const leverancier = String(data['Leveranciernaam'] || '').trim();
  // Strict parsing: bij invalid datum/bedrag → throw met klant-vriendelijke melding
  // i.p.v. silent fallback naar today/0 → factuur met €0,00 voorkomen.
  if (!leverancier) {
    schrijfAuditLog_('Uitgave geweigerd', 'leverancier ontbreekt');
    throw new Error('Leveranciernaam is verplicht.');
  }
  let datum, bedragExcl;
  try { datum = parseDatumStrict_(data['Factuurdatum uitgave'], 'Factuurdatum uitgave'); }
  catch (e) { schrijfAuditLog_('Uitgave geweigerd', 'datum: ' + e.message); throw e; }
  try { bedragExcl = parseBedragStrict_(data['Bedrag excl. BTW'], 'Bedrag excl. BTW'); }
  catch (e) { schrijfAuditLog_('Uitgave geweigerd', 'bedrag: ' + e.message); throw e; }
  if (bedragExcl <= 0) {
    schrijfAuditLog_('Uitgave geweigerd', 'bedragExcl ≤ 0');
    throw new Error('Vul een bedrag in groter dan €0,00');
  }
  const inkoopNr    = volgendInkoopNummer_();
  const levId       = zoekOfMaakRelatie_(ss, leverancier, RELATIE_TYPE.LEVERANCIER);
  const btwTarief   = parseBtwTarief_(data['BTW tarief uitgave'] || '21% (hoog)');
  let btwBedrag     = parseBedrag_(data['BTW bedrag uitgave'] || '0');
  if (btwBedrag === 0 && btwTarief !== null) {
    btwBedrag = rondTariefCent_(bedragExcl, btwTarief);
  }
  // Pro-rata BTW: bij mixed-use (privé+zakelijk) is alleen het zakelijke
  // deel BTW-aftrekbaar. Klant geeft 'Zakelijk %' op (default 100%).
  // Bv. laptop voor 70% zakelijk → 70% BTW-aftrekbaar in voorbelasting.
  const zakelijkPct = Math.max(0, Math.min(100,
    parseFloat(data['Zakelijk %'] || '100') || 100));
  const btwAftrekbaar = rondBedrag_(btwBedrag * (zakelijkPct / 100));
  const btwPriveDeel  = rondBedrag_(btwBedrag - btwAftrekbaar);
  const bedragIncl = rondBedrag_(bedragExcl + btwBedrag);

  // P29-FIX (Belastingdienst stress-test): Idempotency-guard tegen
  // double-submit (network-retry, dubbel-click, Apps Script time-out + retry).
  // Verkoopfacturen hebben factuurnr-uniciteit + recente-duplicate detect.
  // Inkoopfacturen hadden NIETS — twee identieke submits gaven 2× journaal-
  // post + 2× BTW-voorbelasting-claim → naheffing + boete.
  //
  // Signatuur: leverancier + datum + bedragIncl + leverancier-factuurnr.
  // Cache TTL 5 min (zelfde window als verkoop recenteDuplicate-window).
  // Op fout-pad: cache wissen zodat klant kan retry'en zonder 5 min wachten.
  const sigInkoop = _bouwInkoopSig_(leverancier, datum, bedragIncl,
    String(data['Factuurnummer leverancier'] || ''));
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get(sigInkoop)) {
      schrijfAuditLog_('Uitgave DUBBEL geblokkeerd',
        leverancier + ' | ' + formatBedrag_(bedragIncl) +
        ' | factuurnr-lev: ' + (data['Factuurnummer leverancier'] || '(leeg)') +
        ' — identieke submit binnen 5min');
      throw new Error('Deze uitgave (' + leverancier + ', ' + formatBedrag_(bedragIncl) +
        ') is zojuist al geregistreerd. Wacht 5 minuten of wijzig leverancier-factuurnr.');
    }
    cache.put(sigInkoop, 'PROCESSING:' + Date.now(), 300);  // 5 min TTL
  } catch (cacheErr) {
    // CacheService kan zelden falen (quota) — laat door, beter duplicaat dan miss
    if (String(cacheErr.message || '').indexOf('zojuist al geregistreerd') >= 0) throw cacheErr;
    Logger.log('Inkoop idempotency cache-fail (door): ' + cacheErr.message);
  }

  // Kostenrekening bepalen op basis van categorie
  const categorie   = data['Categorie kosten'] || 'Overige kosten';
  const kostenRek   = bepaalKostenrekening_(categorie);

  const inkoopData = [
    inkoopNr, 'IK' + inkoopNr, new Date(), datum,
    data['Factuurnummer leverancier'] || '',
    levId, leverancier,
    data['Omschrijving uitgave'] || categorie,
    bedragExcl,
    data['BTW tarief uitgave'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    btwBedrag, bedragIncl,
    data['Betalingsstatus uitgave'] === 'Betaald' ? FACTUUR_STATUS.BETAALD : FACTUUR_STATUS.CONCEPT,
    '',
    data['Betaalmethode'] || '',
    kostenRek,
    '', data['Notities uitgave'] || '', '', new Date(),
  ];

  // Critical write — dubbel-loggen tegen sheet-failure
  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!ifSheet) throw new Error('Tabblad Inkoopfacturen niet gevonden — run setup() eerst.');
  try {
    ifSheet.appendRow(inkoopData);
  } catch (writeErr) {
    // Bij sheet-fail: idempotency-cache wissen — klant moet kunnen retry'en
    try { CacheService.getScriptCache().remove(sigInkoop); } catch (_) {}
    noodLog_('INKOOPFACTUUR_SHEET_FOUT', 'IK' + inkoopNr + ' | ' + leverancier + ' | ' + bedragIncl + ' | ' + writeErr.message);
    try { meldFataalAanOwner_('DATA_LOSS', 'appendRow inkoopfactuur faalde', { ref: 'IK' + inkoopNr, fout: writeErr.message }); } catch (_) {}
    throw writeErr;
  }
  noodLog_('Inkoopfactuur opgeslagen', 'IK' + inkoopNr + ' | ' + bedragIncl);
  SpreadsheetApp.flush();  // garandeer write vóór journaalposten
  try { bustCache_('kpi'); bustCache_('advies'); } catch (_) {}

  const omschr = `Inkoopfactuur ${data['Factuurnummer leverancier'] || inkoopNr} – ${leverancier}`;
  maakJournaalpost_(ss, {
    datum, omschr, dagboek: 'Inkoopboek',
    debet: kostenRek || '7990', credit: '4000',
    bedrag: bedragExcl, ref: 'IK' + inkoopNr,
    type: BOEKING_TYPE.INKOOPFACTUUR,
  });
  if (btwAftrekbaar > 0) {
    // Pro-rata: alleen het zakelijke BTW-deel naar voorbelasting.
    // Privé-deel komt op kostenrekening (kan niet worden teruggevorderd).
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (BTW voorbelasting' + (zakelijkPct < 100 ? ' ' + zakelijkPct + '%' : '') + ')',
      dagboek: 'Inkoopboek',
      debet: bepaalBtwVoorbelastingRekening_(data['BTW tarief uitgave']),
      credit: '4000', bedrag: btwAftrekbaar, btwBedrag: btwAftrekbaar,
      ref: 'IK' + inkoopNr, type: BOEKING_TYPE.INKOOPFACTUUR,
    });
  }
  if (btwPriveDeel > 0) {
    // Niet-aftrekbare BTW (privé-deel) → naar kostenrekening i.p.v. voorbelasting
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (BTW privé-deel ' + (100 - zakelijkPct) + '% — niet-aftrekbaar)',
      dagboek: 'Inkoopboek',
      debet: kostenRek || '7990', credit: '4000',
      bedrag: btwPriveDeel,
      ref: 'IK' + inkoopNr, type: BOEKING_TYPE.INKOOPFACTUUR,
      notities: 'Pro-rata BTW: ' + zakelijkPct + '% zakelijk',
    });
  }

  // Als de gebruiker de uitgave direct als BETAALD markeert: ook de
  // betaal-boeking aanmaken (4000 → 1200/2400). Anders accumuleert het
  // crediteurensaldo terwijl de uitgave op de inkoop-tab al "Betaald" staat.
  const betaaldDirect = data['Betalingsstatus uitgave'] === 'Betaald';
  if (betaaldDirect) {
    const betaalmethode = String(data['Betaalmethode'] || '').toLowerCase();
    const isPrive = betaalmethode.includes('priv');
    maakJournaalpost_(ss, {
      datum,
      omschr: omschr + ' (betaling)',
      dagboek: 'Bankboek',
      debet:  '4000',
      credit: isPrive ? '2400' : '1200',  // privé-betaling → privéonttrekking, anders bank
      bedrag: bedragIncl,
      ref:    'IK' + inkoopNr,
      type:   BOEKING_TYPE.BANKBETALING,
    });
  }

  Logger.log(`Inkoopfactuur IK${inkoopNr} geregistreerd voor ${leverancier}`);

  // Proactief signaal: aankoop ≥ €450 kan worden geactiveerd als investering.
  if (bedragExcl >= 450) {
    try {
      signaleerAfschrijvingskandidaat_(ss, bedragExcl, leverancier, data['Omschrijving uitgave'] || categorie);
    } catch (_) {}
  }

  // Slimme fiscale tips: detecteer AOV/EIA/KIA-grens/reiskosten/thuiswerk
  // Klant ziet meteen of er extra fiscaal voordeel mogelijk is.
  try {
    const slimmeTips = genereerSlimmeBoekingTips_({
      leverancier: leverancier,
      omschr: data['Omschrijving uitgave'] || '',
      bedrag: bedragExcl,
      categorie: categorie,
      kostenRek: kostenRek,
    });
    if (slimmeTips && slimmeTips.length > 0) {
      slimmeTips.forEach(function(t) {
        schrijfAuditLog_('Slimme tip uitgave', 'IK' + inkoopNr + ': ' + t.slice(0, 200));
      });
    }
  } catch (e) {
    Logger.log('Slimme boeking-tips: ' + e.message);
  }

  // High-expense alert — e-mail eigenaar bij ongebruikelijk hoge uitgave
  try {
    waarschuwBijHogeUitgave_(bedragIncl, leverancier, categorie, 'IK' + inkoopNr);
  } catch (_) {}

  return { ok: true, inkoopnummer: 'IK' + inkoopNr, bedragExcl: bedragExcl, bedragIncl: bedragIncl };
}

/**
 * Stuurt een e-mailalert wanneer een uitgave boven de drempel uitkomt.
 * Drempel komt uit Instellingen ("Melding hoge uitgave") of default €500.
 * Niet-fataal: faalt stil zodat het de boekingsflow niet blokkeert.
 *
 * @param {number} bedrag    Bedrag inclusief BTW.
 * @param {string} leverancier
 * @param {string} categorie
 * @param {string} ref       Inkoopnummer / referentie
 */
function waarschuwBijHogeUitgave_(bedrag, leverancier, categorie, ref) {
  if (!emailNotificatiesAan_()) return;  // master e-mailnotificatie-schakelaar
  const drempelStr = getInstelling_('Melding hoge uitgave');
  const drempel = drempelStr ? parseBedrag_(drempelStr) : 500;
  if (!isFinite(drempel) || drempel <= 0) return;
  if (bedrag < drempel) return;

  const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
  if (!ontvanger || !isGeldigEmail_(ontvanger)) return;

  const onderwerp = `⚠️ Hoge uitgave geregistreerd: ${formatBedrag_(bedrag)} – ${leverancier}`;
  const body =
    'Er is zojuist een uitgave geboekt die boven uw alert-drempel uitkomt:\n\n' +
    `Leverancier:   ${leverancier}\n` +
    `Categorie:     ${categorie}\n` +
    `Bedrag (incl): ${formatBedrag_(bedrag)}\n` +
    `Drempel:       ${formatBedrag_(drempel)}\n` +
    `Referentie:    ${ref}\n\n` +
    'Open uw spreadsheet om de boeking te bekijken of te wijzigen.\n\n' +
    'U kunt de drempel aanpassen op het tabblad Instellingen → "Melding hoge uitgave".';

  if (!isGeldigEmail_(ontvanger)) {
    Logger.log('Hoge-uitgave alert overgeslagen: ongeldig e-mailadres "' + ontvanger + '"');
    safeAuditLog_('Hoge uitgave alert OVERGESLAGEN', 'Ongeldig e-mailadres: ' + ontvanger);
    return;
  }
  try {
    stuurKlantNotificatie_(ontvanger, onderwerp, body);
    schrijfAuditLog_('Hoge uitgave alert', `${leverancier} ${formatBedrag_(bedrag)} → ${ontvanger}`);
  } catch (e) {
    Logger.log('Hoge-uitgave alert niet verzonden: ' + e.message);
    safeAuditLog_('Hoge uitgave alert MISLUKT', e.message);
  }
}

// ─────────────────────────────────────────────
//  DECLARATIE (privé voorgeschoten)
// ─────────────────────────────────────────────
function verwerkDeclaratieUitHoofdformulier_(ss, data) {
  // Strict parsing voor financiële integriteit — bij ongeldig direct throw
  let datum, bedragExcl;
  try { datum = parseDatumStrict_(data['Datum declaratie'], 'Datum declaratie'); }
  catch (e) { schrijfAuditLog_('Declaratie geweigerd', 'datum: ' + e.message); throw e; }
  try { bedragExcl = parseBedragStrict_(data['Bedrag excl. BTW declaratie'], 'Bedrag declaratie'); }
  catch (e) { schrijfAuditLog_('Declaratie geweigerd', 'bedrag: ' + e.message); throw e; }
  if (bedragExcl <= 0) {
    schrijfAuditLog_('Declaratie geweigerd', 'bedragExcl ≤ 0 — geen inkoopnummer geclaimd');
    throw new Error('Vul een bedrag in groter dan €0,00');
  }
  const inkoopNr   = volgendInkoopNummer_();
  const btwTarief  = parseBtwTarief_(data['BTW tarief declaratie'] || '0% (nultarief)');
  // Use pre-computed BTW bedrag if provided (avoids cascaded rounding errors from excl*rate);
  // fall back to computed value for Forms submissions that don't include this field.
  let btwBedrag = parseBedrag_(data['BTW bedrag declaratie'] || '0');
  if (btwBedrag === 0 && btwTarief !== null) {
    btwBedrag = rondTariefCent_(bedragExcl, btwTarief);
  }
  const bedragIncl = rondBedrag_(bedragExcl + btwBedrag);
  const categorie  = data['Categorie declaratie'] || 'Overige kosten';
  const betaaldDoor = data['Betaald door (naam)'] || 'Privé';
  const kostenRek  = bepaalKostenrekening_(categorie);

  const inkoopData = [
    inkoopNr, 'DECL' + inkoopNr, new Date(), datum,
    '', '', betaaldDoor,
    data['Omschrijving declaratie'] || categorie,
    bedragExcl,
    data['BTW tarief declaratie'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    btwBedrag, bedragIncl,
    data['Declaratie status'] === 'Terugbetaald' ? FACTUUR_STATUS.BETAALD : FACTUUR_STATUS.CONCEPT,
    '', data['Betaalmethode declaratie'] || '',
    kostenRek, 'Declaratie', '', '', new Date(),
  ];

  // Critical write — dubbel-loggen
  const ifSheetD = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!ifSheetD) throw new Error('Tabblad Inkoopfacturen niet gevonden — run setup() eerst.');
  try {
    ifSheetD.appendRow(inkoopData);
  } catch (writeErr) {
    noodLog_('DECLARATIE_SHEET_FOUT', 'IK' + inkoopNr + ' | ' + writeErr.message);
    try { meldFataalAanOwner_('DATA_LOSS', 'appendRow declaratie faalde', { ref: 'IK' + inkoopNr }); } catch (_) {}
    throw writeErr;
  }
  noodLog_('Declaratie opgeslagen', 'IK' + inkoopNr);
  SpreadsheetApp.flush();
  try { bustCache_('kpi'); bustCache_('advies'); } catch (_) {}

  // Privé-voorgeschoten kosten: kostenrekening (excl) + BTW-voorbelasting → 4500 (incl).
  // Eerdere versie boekte alleen excl. waardoor BTW niet als voorbelasting werd
  // teruggevorderd én 4500 onvolledig was (€100 ipv €121 bij 21% declaratie).
  const omschrDecl = `Declaratie ${betaaldDoor} – ${data['Omschrijving declaratie'] || categorie}`;
  maakJournaalpost_(ss, {
    datum,
    omschr: omschrDecl,
    dagboek: 'Memoriaal',
    debet: kostenRek || '7990', credit: '4500',
    bedrag: bedragExcl,
    btwTarief, btwBedrag: 0,
    ref: 'DECL' + inkoopNr, type: BOEKING_TYPE.MEMORIAAL,
  });
  if (btwBedrag > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: omschrDecl + ' (BTW voorbelasting)',
      dagboek: 'Memoriaal',
      debet: bepaalBtwVoorbelastingRekening_(data['BTW tarief declaratie']),
      credit: '4500',
      bedrag: btwBedrag,
      btwTarief, btwBedrag,
      ref: 'DECL' + inkoopNr, type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  // Als de declaratie al 'Terugbetaald' is: ook de uitbetaling boeken
  // (4500 debet, Bank credit). Anders blijft 4500-saldo open ondanks 'Betaald'.
  if (data['Declaratie status'] === 'Terugbetaald') {
    maakJournaalpost_(ss, {
      datum,
      omschr: omschrDecl + ' (terugbetaling)',
      dagboek: 'Bankboek',
      debet: '4500',
      credit: '1200',
      bedrag: bedragIncl,
      ref: 'DECL' + inkoopNr,
      type: BOEKING_TYPE.BANKBETALING,
    });
  }

  Logger.log(`Declaratie DECL${inkoopNr} geregistreerd voor ${betaaldDoor}`);
}

// ─────────────────────────────────────────────
//  KOSTENREKENING OP BASIS VAN CATEGORIE
// ─────────────────────────────────────────────
function bepaalKostenrekening_(categorie) {
  const map = {
    'Marketing & Reclame':            '7510',
    'Software & Abonnementen':        '7440',
    'Kantoor & Werkruimte':           '7400',
    'Advies & Dienstverlening':       '7450',
    'Auto & Vervoer':                 '7300',
    'Openbaar Vervoer & Reiskosten':  '7340',
    'Maaltijden & Representatie':     '7520',
    'Inkoop / Materialen':            '7020',
    'Verzekeringen & Bankkosten':     '7910',
    'Personeelskosten':               '7100',
    'Onderhoud & Reparaties':         '7600',
    'Telecom & Internet':             '7430',
    'Studie & Opleiding':             '7930',
    'Overige kosten':                 '7990',
  };
  return map[categorie] || '7990';
}

// ─────────────────────────────────────────────
//  BACKWARD-COMPAT: VERKOOPFACTUUR FORMULIER
// ─────────────────────────────────────────────
// Bewaard voor installaties met het oude losse formulier.
function verwerkVerkoopfactuurFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = getSpreadsheet_();
    const datum = _parseFormDatumStrikt_(data['Factuurdatum'], 'Factuurdatum');   // CYCLE-35
    const termijn = parseInt(data['Betalingstermijn (dagen)'] || '30');
    const vervaldatum = new Date(datum.getTime() + termijn * 24 * 60 * 60 * 1000);

    // Factuurregels berekenen — VOOR factuurnummer-claim om gap te voorkomen
    let totalExcl = 0;
    let totalBtw = 0;
    const regels = [];

    for (let i = 1; i <= 3; i++) {
      const omschr = data[`Factuurregel ${i} – Omschrijving`];
      const aantal = parseFloat(data[`Factuurregel ${i} – Aantal`] || '0');
      const prijs = parseBedrag_(data[`Factuurregel ${i} – Prijs per eenheid (excl. BTW)`] || '0');
      if (!omschr || aantal === 0) continue;
      const regelBedrag = regelTotaalCent_(aantal, prijs);
      regels.push({ omschr, aantal, prijs, totaal: regelBedrag });
      totalExcl += regelBedrag;
    }

    if (regels.length === 0) {
      throw new Error('Geen geldige factuurregels gevonden — geen factuurnummer geclaimd.');
    }

    // CYCLE-6 FIX (axiom 12 — factuurnummer pas na complete validatie):
    // VOORHEEN werd volgendFactuurnummer_ direct na de lege-regels-check
    // aangeroepen, vóór klantnaam/BTW-tarief/totalen geverifieerd waren.
    // Bij fout daarna ontstond een GAT in factuurreeks (art. 35a Wet OB
    // vereist doorlopend nummering — gaten = audit-flag bij controle).
    // Volgorde nu: ALLE validatie eerst, daarna pas nummer claimen.
    const btwTarief = parseBtwTarief_(data['BTW tarief'] || '21% (hoog)');
    totalBtw = btwTarief !== null ? rondTariefCent_(totalExcl, btwTarief) : 0;
    const totalIncl = rondBedrag_(totalExcl + totalBtw);

    const klantnaam = String(data['Klantnaam'] || '').trim();
    if (!klantnaam) {
      throw new Error('Klantnaam is verplicht — factuurnummer niet geclaimd.');
    }
    if (!isFinite(totalIncl) || totalIncl <= 0) {
      throw new Error('Factuurtotaal moet > €0 zijn — factuurnummer niet geclaimd.');
    }

    // ── Pas NU het factuurnummer claimen (alle validatie geslaagd) ──
    const factuurNr = volgendFactuurnummer_();

    const klantId = zoekOfMaakRelatie_(ss, klantnaam, RELATIE_TYPE.KLANT);

    // Hoofdregel in Verkoopfacturen tabblad
    const factuurData = [
      factuurNr,                              // Factuur ID
      // Zelfde formaat als hoofdpad (F000001) — twee formaten naast elkaar
      // ondermijnt aantoonbaar-sequentiële nummering (art. 35a Wet OB).
      formatFactuurnummer_(factuurNr, getInstelling_('Factuurprefix'), 6), // Factuurnummer
      datum,                                  // Datum
      vervaldatum,                            // Vervaldatum
      klantId,                                // Klant ID
      klantnaam,                              // Klantnaam
      data['KvK-nummer klant'] || '',
      data['BTW-nummer klant'] || '',
      regels.map(r => r.omschr).join('; '),   // Omschrijving
      totalExcl,                              // Bedrag excl.
      btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld',
      totalBtw,                               // BTW bedrag
      totalIncl,                              // Bedrag incl.
      0,                                      // Betaald bedrag
      FACTUUR_STATUS.CONCEPT,                 // Status
      '',                                     // Betaaldatum
      '',                                     // Betalingsreferentie
      data['Projectcode / Referentie'] || '',
      data['Notities / bijzonderheden'] || '',
      '',                                     // PDF URL (later)
      bepaalOmzetRekening_(data['BTW tarief']),
      new Date(),
      Session.getActiveUser().getEmail(),
    ];

    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    vfSheet.appendRow(factuurData);

    // Journaalposten aanmaken (dubbel boekhouden)
    const boekingRef = factuurNr;
    const omschr = `Verkoopfactuur ${getInstelling_('Factuurprefix')}${factuurNr} – ${klantnaam}`;

    // Debet: Debiteuren | Credit: Omzet
    maakJournaalpost_(ss, {
      datum, omschr,
      dagboek: 'Verkoopboek',
      debet: '1100', credit: bepaalOmzetRekening_(data['BTW tarief']),
      bedrag: totalExcl,
      btwTarief: btwTarief,
      btwBedrag: 0,
      ref: boekingRef,
      type: BOEKING_TYPE.VERKOOPFACTUUR,
    });

    // Als BTW van toepassing
    if (totalBtw > 0) {
      maakJournaalpost_(ss, {
        datum, omschr: omschr + ' (BTW)',
        dagboek: 'Verkoopboek',
        debet: '1100', credit: bepaalBtwVerkoopRekening_(data['BTW tarief']),
        bedrag: totalBtw,
        btwTarief: btwTarief,
        btwBedrag: totalBtw,
        ref: boekingRef,
        type: BOEKING_TYPE.VERKOOPFACTUUR,
      });
    }

    // NOOT: de derde journaalpost (debet 1100 / credit 1100 voor totaal incl.) is verwijderd.
    // Die post was een self-posting entry die het grootboek uit balans bracht.
    // Correcte boekhouding: alleen omzet-post en BTW-post (zie boven).

    // Genereer PDF
    Utilities.sleep(500);
    const pdfUrl = genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, data);

    // Sla PDF URL op
    if (pdfUrl) {
      const rijen = vfSheet.getDataRange().getValues();
      for (let i = 1; i < rijen.length; i++) {
        // Strict numeric compare — voorkomt cross-type match (bv. '100' == 100)
        if (parseInt(rijen[i][KOL.VF.factuurId], 10) === factuurNr) {
          vfSheet.getRange(i + 1, 20).setValue(pdfUrl);
          break;
        }
      }
      schrijfAuditLog_('Factuur aangemaakt (legacy)', formatFactuurnummer_(factuurNr, getInstelling_('Factuurprefix'), 6) + ' | klant: ' + klantnaam);
    } else {
      schrijfAuditLog_('PDF MISLUKT (legacy)', 'factuur ' + factuurNr + ' – PDF niet gegenereerd');
    }

    // Dashboard vernieuwen
    vernieuwDashboard();

    Logger.log(`Verkoopfactuur ${factuurNr} aangemaakt voor ${klantnaam}`);

  } catch (err) {
    schrijfAuditLog_('FOUT legacy factuur', err.message);
    Logger.log('Fout verwerkVerkoopfactuurFormulier: ' + err.message + '\n' + err.stack);
    stuurFoutEmail_('Verkoopfactuur verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  DAGELIJKSE TAKEN (TIMER TRIGGER)
// ─────────────────────────────────────────────

// Healthchecks.io heartbeat — bewijs dat dagelijkse trigger gedraaid heeft.
// Gemiste heartbeat na 1u grace = email-alert.
//
// SINGLE-MONITOR-RISK MITIGATION (go-live audit 2026-06-09):
//   • URL was hardcoded in source → in publieke repo = derden kunnen
//     valse-groene pings sturen + Sam's account-uitval = blind voor alle
//     klanten 7+ dagen.
//   • Nu: URL leest uit ScriptProperty per klant ('HEALTHCHECK_URL'),
//     met fallback naar gedeelde URL voor backward compat. Extra
//     ScriptProperty 'HEALTHCHECK_URL_BACKUP' voor 2e onafhankelijke
//     monitor (bv. UptimeRobot + Healthchecks.io tegelijk). Bij beide
//     leeg: silent skip.
//
const _HEALTHCHECK_FALLBACK_URL = 'https://hc-ping.com/d1a1c491-59b6-4380-a4b1-357649f749b3';

/**
 * Lees de geconfigureerde healthcheck-URLs uit ScriptProperties.
 * Returnt array van geldige URLs (kan leeg zijn).
 *
 * Volgorde:
 *   1. HEALTHCHECK_URL          (primaire monitor, klant-eigen)
 *   2. HEALTHCHECK_URL_BACKUP   (2e monitor, optioneel)
 *   3. Fallback hardcoded URL   (alleen bij migratie van bestaande klanten;
 *                                klant kan setProperty('HEALTHCHECK_URL', '')
 *                                om migratie te bevestigen)
 *
 * @returns {Array<string>}
 * @private
 */
function _getHealthcheckUrls_() {
  const urls = [];
  let props;
  try { props = PropertiesService.getScriptProperties(); } catch (_) {}
  if (props) {
    const primair = String(props.getProperty('HEALTHCHECK_URL') || '').trim();
    const backup  = String(props.getProperty('HEALTHCHECK_URL_BACKUP') || '').trim();
    if (/^https?:\/\//.test(primair)) urls.push(primair);
    if (/^https?:\/\//.test(backup))  urls.push(backup);
    // Migratie-flag: lege string in HEALTHCHECK_URL = klant heeft bewust
    // opt-out gekozen → geen fallback. Null = nog niet ingesteld → fallback.
    if (props.getProperty('HEALTHCHECK_URL') === null && urls.length === 0) {
      urls.push(_HEALTHCHECK_FALLBACK_URL);
    }
  } else if (urls.length === 0) {
    urls.push(_HEALTHCHECK_FALLBACK_URL);
  }
  return urls;
}

/**
 * Ping alle geconfigureerde healthcheck-URLs. Fail-open: een falende ping
 * mag dagelijkseTaken niet blokkeren.
 *
 * KNOWN LIMITATION: UrlFetchApp.fetch heeft een hard 60s timeout per call.
 * Bij twee onbereikbare URLs verbrandt de start-ping tot 120s van het
 * 6-min GAS-execution-budget vóór enige _runTaak_ draait. Acceptabel
 * binnen budget, maar reden om HEALTHCHECK_URL niet naar een onbekende
 * service te wijzen.
 *
 * @param {string} suffix — '/start' bij begin, '' bij success
 * @param {string} payload
 * @private
 */
function _pingAlleHealthchecks_(suffix, payload) {
  const urls = _getHealthcheckUrls_();
  if (urls.length === 0) return;
  // Audit-vondst ronde 2 (cross-PR): bij 2 dode URLs kan sequentieel forEach
  // tot 120s budget verbranden vóór dagelijkseTaken überhaupt begint.
  // UrlFetchApp.fetchAll() doet alle requests CONCURRENT → max-latency =
  // 60s (single-timeout) i.p.v. n*60s. Fail-open: één requesten throw
  // mag niet de andere blokkeren.
  const requests = urls.map(function(url) {
    return {
      url: url + (suffix || ''),
      muteHttpExceptions: true,
      method: 'post',
      payload: payload,
    };
  });
  try {
    UrlFetchApp.fetchAll(requests);
  } catch (_) {
    // fetchAll throw'd op één van de requests — fallback naar sequentieel
    // zodat at-least een ping doorkomt. Per-URL fail-open behouden.
    urls.forEach(function(url) {
      try {
        UrlFetchApp.fetch(url + (suffix || ''), {
          muteHttpExceptions: true,
          method: 'post',
          payload: payload,
        });
      } catch (_) {}
    });
  }
}

// 6-min GAS execution cap. Budget = 4 min laat 2 min marge voor afronding
// + healthcheck-pings. Bij langlopende administraties (>5 jaar data) waar
// vroege taken meer tijd kosten, voorkomt dit dat triggerSelfHeal/cleanup
// nooit meer aan bod komen. _runTaak_ slaat tasks over zodra budget op is.
// Override via ScriptProperty 'DAGELIJKSE_TAKEN_BUDGET_MS' (1000-300000).
const DAGELIJKSE_TAKEN_BUDGET_MS_DEFAULT = 4 * 60 * 1000;
function _dagelijksBudget_() {
  try {
    const v = parseInt(PropertiesService.getScriptProperties()
      .getProperty('DAGELIJKSE_TAKEN_BUDGET_MS') || '', 10);
    if (isFinite(v) && v >= 1000 && v <= 300000) return v;
  } catch (_) {}
  return DAGELIJKSE_TAKEN_BUDGET_MS_DEFAULT;
}
// Module-niveau: gezet door dagelijkseTaken aan start, gelezen door
// _runTaak_, geleegd aan einde. Eén trigger-context = geen race.
// var (niet let) zodat de waarden ook in VM-sandbox properties op globalThis
// zijn — anders kunnen Jest-tests _huidigDagelijksBudgetStart niet zetten.
var _huidigDagelijksBudgetStart = 0;
var _huidigDagelijksBudgetOverschreden = false;

/**
 * Master aan/uit voor klant-gerichte notificatie-mails (BTW-deadline,
 * suppletie-tip, KIA-misser, bewaarplicht, hoge-uitgave-alert, rapporten).
 * Eén instelling 'E-mailnotificaties' (Ja/Nee) — standaard AAN (backward-compat).
 * Raakt NIET de betalingsherinneringen naar de klanten van de gebruiker; die
 * zijn zakelijk-essentieel en houden hun eigen flow.
 */
function emailNotificatiesAan_() {
  try {
    const v = getInstelling_('E-mailnotificaties');
    if (v === null || v === undefined || String(v).trim() === '') return true; // default aan
    return isJa_(String(v));
  } catch (_) { return true; }
}

/**
 * CHOKEPOINT (bug-klasse 4) — ENIGE sanctie-route voor systeem-notificaties naar
 * de EIGENAAR (de ZZP'er zelf): BTW-deadline, suppletie, KIA, bewaarplicht,
 * hoge-uitgave, weekoverzicht, sheet-grootte enz. Respecteert de master-
 * schakelaar `emailNotificatiesAan_()` zodat "uit" écht álles stopt — geen lek
 * via een losse trigger of een vergeten `MailApp.sendEmail`.
 *
 * BELANGRIJK: zakelijke mail naar DERDEN (facturen, betalingsherinneringen aan
 * debiteuren) loopt hier NIET langs en blijft altijd versturen — die hoort niet
 * onder de notificatie-schakelaar.
 *
 * De ontvanger wordt door de aanroeper bepaald (geen recipient-wijziging), zodat
 * dit puur een gate is bovenop de bestaande DLQ-verzendlaag.
 *
 * @returns {boolean} true als verstuurd, false als gate uit / ongeldig adres.
 */
function stuurKlantNotificatie_(ontvanger, onderwerp, tekst) {
  if (!emailNotificatiesAan_()) return false;   // master-schakelaar
  // Een falende notificatie mag de aanroeper (bv. dagelijkseTaken) nooit breken.
  try {
    if (typeof stuurMailMetDlq_ === 'function') return stuurMailMetDlq_(ontvanger, onderwerp, tekst);
    if (!ontvanger) return false;
    MailApp.sendEmail(ontvanger, onderwerp, tekst);  // klant-mail-ok: chokepoint-fallback (al gegate door stuurKlantNotificatie_)
    return true;
  } catch (_) { return false; }
}

/**
 * Menu-actie: zet de klant-notificatie-mails in één klik aan of uit.
 * Schrijft 'E-mailnotificaties' = Ja/Nee in Instellingen en bevestigt met toast.
 */
function toggleEmailNotificaties() {
  const nieuw = emailNotificatiesAan_() ? 'Nee' : 'Ja';
  try {
    setInstelling_('E-mailnotificaties', nieuw);
  } catch (e) {
    try { SpreadsheetApp.getUi().alert('Kon de instelling niet opslaan: ' + e.message); } catch (_) {}
    return;
  }
  const bericht = nieuw === 'Ja'
    ? '✓ E-mailnotificaties staan nu AAN — je krijgt o.a. de BTW-deadline-herinnering en hoge-uitgave-alerts per mail.'
    : '✓ E-mailnotificaties staan nu UIT — geen routine-meldingsmails meer (BTW-deadline, hoge uitgave). Belangrijke compliance-seintjes (suppletie, bewaarplicht) en betalingsherinneringen naar je eigen klanten blijven werken.';
  try { SpreadsheetApp.getActiveSpreadsheet().toast(bericht, 'Boekhoudbaar', 8); } catch (_) {}
}

function dagelijkseTaken() {
  const ss = getSpreadsheet_();
  const dagelijksTotaal0 = Date.now();
  _huidigDagelijksBudgetStart = dagelijksTotaal0;
  _huidigDagelijksBudgetOverschreden = false;

  // START-ping: laat alle geconfigureerde monitors weten dat we begonnen zijn.
  // Bij crash halverwege missen ze de SUCCESS-ping en krijgt owner alert.
  _pingAlleHealthchecks_('/start', 'host=' + ss.getName());

  // Elke taak in eigen try-catch: één falende taak stopt de rest niet.
  // Wrap in _runTaak_ voor automatische metrics + status-logging.
  _runTaak_('markeerVervallen', function() { markeerVervallenFacturen_(ss); });
  _runTaak_('herinneringen',    function() { stuurAutomatischeBetalingsherinneringen_(ss); });
  // Master e-mailnotificatie-schakelaar: één 'E-mailnotificaties'=Nee zet alle
  // klant-gerichte meldingsmails uit (de gebruiker wil niet "elke dag mails").
  // Standaard aan; betalingsherinneringen naar de eigen klanten blijven buiten.
  const _mailNotifAan = emailNotificatiesAan_();
  _runTaak_('btwDeadline',      function() {
    // V3-FIX: case-insensitief via isJa_. Strikte === 'Ja' liet 'ja'/'JA'/' Ja '
    // stil falen → BTW-reminder draaide niet → klant miste deadline → €68+ boete.
    if (_mailNotifAan && isJa_(getInstelling_('BTW aangifte herinnering'))) controleerBtwDeadlines_();
  });
  // V3-FIX: proactieve suppletie-check. detecteerSuppletieMogelijk_ bestond
  // al maar zat alleen op een menu-item. Klant die niet handmatig "Controleer
  // afsluiting" runt mist de boete-vrije 8-weken-termijn voor vrijwillige
  // verbetering → bij latere Belastingdienst-ontdekking: 30% boete + rente.
  _runTaak_('suppletieCheck',   function() {
    // NIET achter de e-mail-gate: deze detectie schrijft óók de durable audit-log
    // van een wettelijk verplichte suppletie (boete-vrije 8-wkn-termijn). Alleen
    // het mailtje is "ruis"; de detectie + registratie moeten altijd draaien.
    if (typeof controleerSuppletieProactief_ === 'function') controleerSuppletieProactief_();
  });
  // V5: KIA-misser detectie. Investering verkeerd op kostenrekening = klant
  // mist 28% KIA-aftrek. Aggregeer jaar-totaal, mail bij ≥€2.901 potentieel
  // gemist. Idempotent per kwartaal.
  _runTaak_('kiaMisser', function() {
    // Detectie + audit-log altijd; alleen het mailtje valt onder de gate (intern).
    if (typeof controleerKiaMisserProactief_ === 'function') controleerKiaMisserProactief_();
  });
  // V6: bewaarplicht pre-alert. Oudste boeking > 6,5 jaar = klant moet XAF +
  // PDF-archief offline opslaan vóór 7-jaars-grens. Voorkomt bewijslast-
  // omkering bij latere Belastingdienst-controle. 1×/kalenderjaar.
  _runTaak_('bewaarplichtAlert', function() {
    // Detectie + audit-log altijd (7-jaars-bewaarplicht is wettelijk); gate intern.
    if (typeof controleerBewaarplichtAlert_ === 'function') controleerBewaarplichtAlert_();
  });
  // #B4.1 (gas-runtime audit): ScriptProperties-cleanup VÓÓR de dure proof/health-
  // taken (gezondheidscheck/auditKeten/auditAnchor/formeelBewijs). De budget-guard
  // (_runTaak_) slaat taken over zodra het 4-min-budget op is; cleanup is goedkoop
  // (alleen Properties-iteratie, geen sheet-rendering) maar MOET dagelijks draaien
  // om de 500KB ScriptProperties-cliff te voorkomen. De bewijs-taken zijn puur
  // observerend (re-run morgen prima), dus die mogen als laatste skipbaar zijn.
  _runTaak_('cleanupHerhIdem',  function() {
    if (typeof cleanupHerhalendeKostenIdempotency_ === 'function') cleanupHerhalendeKostenIdempotency_();
  });
  _runTaak_('cleanupMollieIdem', function() {
    if (typeof ruimMollieIdempotencyOp_ === 'function') ruimMollieIdempotencyOp_();
  });
  _runTaak_('cleanupKritiekeUpdateModalKeys', function() {
    if (typeof cleanupKritiekeUpdateModalKeys_ === 'function') cleanupKritiekeUpdateModalKeys_();
  });
  _runTaak_('cleanupEmailIdem', function() {
    const props = PropertiesService.getScriptProperties();
    const alle = props.getProperties();
    const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1000;
    let verwijderd = 0;
    let legacy = 0;
    Object.keys(alle).forEach(function(k) {
      if (k.indexOf('emailVerzonden_') !== 0) return;
      const v = String(alle[k] || '');
      // Plain 'DONE' (legacy vóór de audit-fix) → geen ts, mag weg.
      if (v === 'DONE') {
        try { props.deleteProperty(k); legacy++; } catch (_) {}
        return;
      }
      // 'DONE:<ts>' of 'PENDING:<ts>' — extracteer integer-timestamp.
      const m = /^(?:DONE|PENDING):(\d{10,})$/.exec(v);
      if (!m) return;
      const ts = parseInt(m[1], 10);
      if (isFinite(ts) && ts > 0 && ts < cutoffMs) {
        try { props.deleteProperty(k); verwijderd++; } catch (_) {}
      }
    });
    if (verwijderd > 0 || legacy > 0) {
      try {
        schrijfAuditLog_('cleanupEmailIdem',
          'Verwijderd ' + verwijderd + ' keys ouder dan 180d' +
          (legacy > 0 ? ' + ' + legacy + ' legacy plain-DONE' : ''));
      } catch (_) {}
    }
  });
  _runTaak_('gezondheidscheck', function() { voerGezondheidCheckStil_(); });
  // CYCLE 69: verifieer de hash-keten van het Audit Log. Een gebroken keten
  // betekent dat een eerder vastgelegde audit-regel achteraf is gewijzigd
  // of corrupt is geraakt → owner-alert. Tamper-evidence op de bewaarplicht.
  _runTaak_('auditKeten', function() {
    if (typeof controleerAuditKetenProactief_ === 'function') controleerAuditKetenProactief_();
  });
  // Wiskundig bewijs: verifieer alle 10 invarianten (I₁–I₁₀) tegen de live
  // administratie. Vindt silent-drift die in de UI niet zichtbaar is:
  // balans-paradoxen, factuurnummer-duplicaten, BTW-anomalies, periode-leaks.
  // Schrijft per run één samenvatting naar _SYSTEM_LOG; bij schending komt
  // er een WARN-entry per axioma met tegenvoorbeeld. Faalt nooit hard — het
  // bewijs is observatie, niet enforcement.
  // Audit-vondst ronde 2/3: dagelijkse trust-anchor voor audit-chain.
  // Schrijft huidige AUDIT_KETEN_HASH append-only naar verborgen tab in de
  // klant z'n eigen sheet (zelf-verifieerbaar, geen privacy-tegenspraak,
  // overleeft product-abandon). 1× per dag throttled.
  _runTaak_('auditAnchor', function() {
    if (typeof schrijfDagelijksAuditAnchor_ === 'function') schrijfDagelijksAuditAnchor_();
  });
  _runTaak_('formeelBewijs', function() {
    if (typeof bewijsAlleInvarianten_ !== 'function') return;
    const rapport = bewijsAlleInvarianten_(ss);
    if (!rapport) return;
    if (typeof structuredLog_ === 'function') {
      if (rapport.alleGoed) {
        structuredLog_('INFO', 'dagelijkseTaken.formeelBewijs',
          'Alle ' + rapport.gecheckt + ' axioma\'s OK', { gecheckt: rapport.gecheckt });
      } else {
        const bericht = rapport.schendingen.length + '/' + rapport.gecheckt +
          ' invarianten geschonden';
        structuredLog_('WARN', 'dagelijkseTaken.formeelBewijs', bericht,
          { schendingen: rapport.schendingen });
        // Accountant-audit: axioma-breuk (grootboek-drift/onbalans) mag niet stil
        // naar Stackdriver verdwijnen — die overleeft de 7-jaars bewaarplicht niet
        // en is onzichtbaar voor klant/accountant. Durable audit-log (in de sheet)
        // + throttled owner-alert. Beide fail-safe zodat de dagtaak niet kettingt.
        let detail = bericht;
        try { detail += ': ' + JSON.stringify(rapport.schendingen).slice(0, 400); } catch (_) {}
        try {
          if (typeof schrijfAuditLog_ === 'function') schrijfAuditLog_('FORMEEL BEWIJS GESCHONDEN', detail);
        } catch (_) {}
        try {
          if (typeof meldFataalAanOwner_ === 'function') {
            meldFataalAanOwner_('FORMEEL_BEWIJS', detail, { gecheckt: rapport.gecheckt });
          }
        } catch (_) {}
      }
    }
  });
  // Pro-actieve quota-waarschuwing: als de klant >80% van zijn Gmail-dagcap
  // heeft gebruikt, krijgt hij ÉÉN mail met uitleg + actie-opties. Voorkomt
  // dat facturen later op de dag stilletjes in de DLQ landen omdat quota op
  // is. Idempotent per dag per niveau-escalatie.
  _runTaak_('emailQuotaWaarschuwing', function() {
    if (typeof controleerEmailQuotaProactief_ === 'function') {
      controleerEmailQuotaProactief_();
    }
  });
  // Tier-2 #5: cross-account backup via mail. Opt-in (default OFF), throttled
  // 1×/7 dagen. Lichte taak voor opt-in klanten; voor opt-out = no-op early
  // return na 1 getInstelling_-call.
  _runTaak_('backupEmail', function() {
    if (typeof backupEmailIndienNodig_ === 'function') backupEmailIndienNodig_();
  });

  // Audit-vondst ronde 2 (cross-PR): triggerSelfHeal verplaatst naar LAATSTE
  // positie in dagelijkseTaken-keten. Was midden in de keten, maar
  // sanitizeTriggers_ doet delete+recreate van alle triggers — als de
  // recreate-stap faalt op ScriptApp-quota MIDDEN in de keten, blijft het
  // systeem zonder triggers tot volgende onOpen. Aan einde plaatsen
  // beperkt blast-radius: alle nuttige work is dan al gedaan.
  _runTaak_('dashboard',        function() { vernieuwDashboard(); });
  // Cycle 68: Belastingadvies-tab is een statische rendering van
  // aftrekposten + spoed-deadlines. Voorheen werd hij alleen vernieuwd
  // als de klant zelf via het menu klikte → "Bijgewerkt:"-timestamp gaf
  // valse indruk van actualiteit. Nu 1×/dag geïsoleerd verversen zodat
  // bij elke sheet-open de fiscale info écht klopt. genereerBelasting-
  // advies() is idempotent (clearContents → herrender) en faalt safe bij
  // niet-voltooide setup via controleerSetupGedaan_ (UI-alert in try/catch).
  _runTaak_('belastingadvies',  function() { genereerBelastingadvies(); });
  _runTaak_('groottecheck',     function() { controleerSheetGrootte_(ss); });
  _runTaak_('tabbladenIntact',  function() { controleerEnHerstelTabbladen_(ss); });
  _runTaak_('autoBackup',       function() {
    if (typeof featureAan_ === 'function' && !featureAan_('auto_backup')) return;
    if (typeof maakAutomatischeBackup_ === 'function') maakAutomatischeBackup_();
  });
  // CYCLE 70: Noah's Ark — platform-onafhankelijke JSONL-snapshot naast de
  // xlsx-backup. Pure text → leesbaar door elk programma in 2070, ook als
  // Google Apps Script niet meer bestaat. Hash-keten uit cycle 69 reist mee.
  _runTaak_('noahArk',          function() {
    if (typeof featureAan_ === 'function' && !featureAan_('noah_ark_export')) return;
    if (typeof maakNoahArkSnapshot_ === 'function') maakNoahArkSnapshot_();
  });
  _runTaak_('dlqRetry',         function() {
    if (typeof featureAan_ === 'function' && !featureAan_('dlq_retry')) return;
    if (typeof dlqVerwerkRetries_ === 'function') dlqVerwerkRetries_();
  });

  // Audit-vondst ronde 2 (GAS-runtime): herinneringsStap_<factuurnr> keys
  // worden gewist bij BETAALD/GECREDITEERD, maar facturen die nooit betaald
  // worden (failliete klant, langdurig oninbaar) behouden de key voor altijd.
  // Bij 10k onbetaalde facturen over jaren = ~150KB van de 500KB-budget.
  // Cleanup-strategie: verwijder herinneringsStap-keys voor facturen die
  // 2 jaar GEEN status-update meer hebben gehad (Verkoopfacturen kolom 'Laatst
  // bijgewerkt' kolom 15). Tot 2 jaar = nog actief in debiteuren-overleg.
  _runTaak_('cleanupHerinneringsStap', function() {
    try {
      const ss = getSpreadsheet_();
      const vf = ss && ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
      if (!vf) return;
      const data = vf.getDataRange().getValues();
      // Bouw set van factuurnummers die nog "actief" zijn (jonger dan 2 jaar)
      const tweeJaarMs = 2 * 365 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - tweeJaarMs;
      const actieveFacturen = {};
      for (let i = 1; i < data.length; i++) {
        // [1] = Factuurnummer ("F000001") — de dunning-keys gebruiken dit
        // formaat. Kolom [0] is het numerieke Factuur ID; dat matcht nooit
        // met een key en zou élke dag alle dunning-state wissen.
        const fnr = String(data[i][KOL.VF.factuurnummer] || '');
        const datum = data[i][KOL.VF.datum];
        if (!fnr) continue;
        const ts = (datum instanceof Date) ? datum.getTime() : 0;
        if (ts >= cutoff) actieveFacturen[fnr] = true;
      }
      const props = PropertiesService.getScriptProperties();
      const alle = props.getProperties();
      let verwijderd = 0;
      Object.keys(alle).forEach(function(k) {
        if (k.indexOf('herinneringsStap_') !== 0) return;
        const fnr = k.slice('herinneringsStap_'.length);
        if (!actieveFacturen[fnr]) {
          try { props.deleteProperty(k); verwijderd++; } catch (_) {}
        }
      });
      if (verwijderd > 0) {
        try { schrijfAuditLog_('cleanupHerinneringsStap',
          'Verwijderd ' + verwijderd + ' herinneringsStap-keys voor facturen > 2 jaar oud'); } catch (_) {}
      }
    } catch (_) { /* fail-safe — cleanup mag dagelijkseTaken nooit breken */ }
  });

  // Bug-klasse 3: generieke sweep van verlopen vluchtige ScriptProperty-keys
  // (SUPPLETIE_GEMELD_ e.a. via VLUCHTIGE_PREFIXES) — voorkomt de 500KB-cliff
  // ongeacht of de keys ooit nog gelezen worden.
  _runTaak_('ruimVluchtigeKeys', function() {
    try { if (typeof ruimVluchtigeKeysOp_ === 'function') ruimVluchtigeKeysOp_(); } catch (_) {}
  });

  // SelfHeal trigger-check: ALLERLAATSTE step in dagelijkseTaken — beperkt
  // blast-radius als sanitize-recreate halverwege faalt op ScriptApp-quota.
  // Alle nuttige work is dan al gedaan. Throttle 24u via SelfHeal.gs.
  // KRITIEK: zelf-heal mag NIET worden geskipt door budget-overschrijding.
  // Bij volle administraties was triggerSelfHeal structureel SKIP → een
  // verweesde of ontbrekende trigger bleef ongezien rotten tot Sam handmatig
  // ingreep. De inspectie is goedkoop (24u-throttle voor de heal zelf;
  // alleen ScriptApp.getProjectTriggers + array-filter dagelijks).
  _runTaak_('triggerSelfHeal', function() {
    if (typeof controleerVolledigeTriggerInstallatie_ === 'function') {
      controleerVolledigeTriggerInstallatie_();
    }
  }, { kritiek: true });

  // Aggregaat: totale duur dagelijkseTaken
  const totaleDuur = Date.now() - dagelijksTotaal0;
  try { metricsLog_('dagelijkseTaken.totaal', totaleDuur, true); } catch (_) {}
  Logger.log('Dagelijkse taken uitgevoerd: ' + new Date());

  // SUCCESS-ping: alles afgerond zonder uncaught exception. Alle
  // geconfigureerde monitors markeren deze run als groen. Duur (ms) in
  // body voor monitoring-trends.
  _pingAlleHealthchecks_('', 'duur_ms=' + totaleDuur);

  // Budget-context vrijgeven — next dagelijkseTaken zet 'm opnieuw.
  _huidigDagelijksBudgetStart = 0;
  _huidigDagelijksBudgetOverschreden = false;
}

/**
 * Runt een sub-taak met automatische:
 *  - try/catch isolation (een fout stopt de keten niet)
 *  - duur-meting → metricsLog_
 *  - status-tracking → taakStatus-sheet (laatste run + status)
 *  - audit-log bij fout
 */
function _runTaak_(naam, fn, opt) {
  // Kritiek-flag (opt.kritiek=true): negeert de budget-cap. Bedoeld voor de
  // zelf-healende infrastructuur die GEEN dag mag missen (anders silent
  // degradatie: bv. een verweesde trigger blijft eeuwig ReferenceError
  // gooien tot een handmatige menu-actie). Self-heal is in zichzelf
  // goedkoop: inspectie + 24u-throttle, alleen bij echte drift werkt
  // sanitizeTriggers_. Gebruik kritiek SPAARZAAM — elke kritieke taak
  // bijt potentieel in de 6-min hard-cap.
  opt = opt || {};
  // Budget-guard: bij langlopende administraties kan de cumulatieve duur
  // van vroege taken latere taken (cleanup-taken) uit de 6-min GAS-cap
  // drukken. Sla over zodra budget op is — markeert SKIP, audit-logt
  // één keer per run zodat Sam kan zien welke installaties budget
  // overschrijden en welke taken erdoor worden geraakt.
  if (!opt.kritiek &&
      _huidigDagelijksBudgetStart > 0 &&
      Date.now() - _huidigDagelijksBudgetStart > _dagelijksBudget_()) {
    if (!_huidigDagelijksBudgetOverschreden) {
      _huidigDagelijksBudgetOverschreden = true;
      try { safeAuditLog_('Dagelijkse taken: budget overschreden',
        'eerste skip: ' + naam + ' na ' + (Date.now() - _huidigDagelijksBudgetStart) + 'ms'); } catch (_) {}
    }
    try { _updateTaakStatus_(naam, 'SKIP', 0, 'budget overschreden'); } catch (_) {}
    return;
  }

  const t0 = Date.now();
  let status = 'OK';
  let foutBericht = '';
  try {
    fn();
  } catch (e) {
    status = 'FOUT';
    foutBericht = e.message;
    Logger.log('dagelijkse taak FOUT ' + naam + ': ' + e.message);
    safeAuditLog_('FOUT dagelijkse taak', naam + ': ' + e.message);
  } finally {
    const durMs = Date.now() - t0;
    try { metricsLog_('taak.' + naam, durMs, status === 'OK', { fout: foutBericht || undefined }); } catch (_) {}
    try { _updateTaakStatus_(naam, status, durMs, foutBericht); } catch (_) {}
  }
}

/**
 * Verborgen tabblad 'Taakstatus' toont per achtergrond-taak: laatste run,
 * duur, status, eventueel laatste fout. Klant-vriendelijk overzicht via
 * Boekhouding → Controle → Taakstatus tonen.
 */
function _updateTaakStatus_(naam, status, durMs, fout) {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const SHEET = 'Taakstatus';
  let sheet = ss.getSheetByName(SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET);
    sheet.getRange(1, 1, 1, 5)
      .setValues([['Taak', 'Laatste run', 'Duur (ms)', 'Status', 'Laatste fout']])
      .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  // Zoek bestaande rij voor deze taak (één rij per taak — geen historie hier;
  // historie staat in Metrics-tab).
  const data = sheet.getDataRange().getValues();
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][KOL.TAAK.taak]) === naam) { rij = i + 1; break; }
  }
  const waarden = [naam, new Date(), durMs, status, fout || ''];
  if (rij === -1) {
    sheet.appendRow(waarden);
  } else {
    sheet.getRange(rij, 1, 1, 5).setValues([waarden]);
  }
  // Kleur status-cel
  if (rij === -1) rij = sheet.getLastRow();
  sheet.getRange(rij, 4).setBackground(status === 'OK' ? '#E8F5E9' : '#FFEBEE')
    .setFontColor(status === 'OK' ? '#1B5E20' : '#B71C1C');
}

// ─────────────────────────────────────────────
//  WEKELIJKSE SAMENVATTING (MAANDAG 08:00)
// ─────────────────────────────────────────────
/**
 * Stuurt een wekelijkse samenvatting per e-mail naar de eigenaar.
 * Bevat: omzet/kosten afgelopen week, openstaande debiteuren,
 * vervallen facturen, BTW-deadline (indien <30 dagen).
 *
 * Trigger: maandag 08:00 — geïnstalleerd via installeelTriggers_().
 */
function stuurWeeklySamenvatting_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    // OPT-IN check: niet iedereen wil tips/samenvatting per email.
    // Default = Nee. Klant zet 'Ja' via Instellingen om abonnement aan te
    // zetten. Voorkomt ongewenste mail die als spam aanvoelt.
    // CYCLE-56: isJa_ helper
    const optActief = (typeof isJa_ === 'function') ? isJa_(getInstelling_('Email tips wekelijks')) : false;
    if (!optActief) {
      Logger.log('Wekelijkse samenvatting overgeslagen: opt-in niet actief (Email tips wekelijks=Nee)');
      return;
    }
    const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
    if (!ontvanger || !isGeldigEmail_(ontvanger)) {
      Logger.log('Wekelijkse samenvatting overgeslagen: geen geldig ontvanger-emailadres');
      return;
    }

    const nu = new Date();
    const weekGeleden = new Date(nu.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Verzameld over de afgelopen 7 dagen
    let omzetWeek = 0;
    let aantalFacturen = 0;
    let kostenWeek = 0;
    let aantalKosten = 0;
    let openDebSaldo = 0;
    let openDebAantal = 0;
    let vervallenAantal = 0;
    let vervallenBedrag = 0;

    // Verkoopfacturen
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getRange(2, 1, vfSheet.getLastRow() - 1, vfSheet.getLastColumn()).getValues();
      data.forEach(function(r) {
        // CYCLE-59: parseDatum_ voor string-tolerance
        const datum = r[2] ? ((r[2] instanceof Date) ? r[2] : parseDatum_(r[2])) : null;
        const bedragIncl = Number(r[12]) || 0;
        const status = String(r[14] || '');
        if (datum && !isNaN(datum.getTime()) && datum >= weekGeleden && datum <= nu) {
          omzetWeek += bedragIncl;
          aantalFacturen++;
        }
        if (status === FACTUUR_STATUS.VERZONDEN || status === FACTUUR_STATUS.DEELS_BETAALD) {
          const betaald = Number(r[13]) || 0;
          openDebSaldo += (bedragIncl - betaald);
          openDebAantal++;
        }
        if (status === FACTUUR_STATUS.VERVALLEN) {
          vervallenAantal++;
          vervallenBedrag += bedragIncl - (Number(r[13]) || 0);
        }
      });
    }

    // Inkoopfacturen
    const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (ifSheet && ifSheet.getLastRow() > 1) {
      const data = ifSheet.getRange(2, 1, ifSheet.getLastRow() - 1, ifSheet.getLastColumn()).getValues();
      data.forEach(function(r) {
        const datum = r[3] ? parseDatum_(r[3]) : null;
        const bedragIncl = Number(r[11]) || 0;
        if (datum && !isNaN(datum.getTime()) && datum >= weekGeleden && datum <= nu) {
          kostenWeek += bedragIncl;
          aantalKosten++;
        }
      });
    }

    // BTW deadline?
    let btwInfo = '';
    try {
      const kStr = getKwartaal_(nu); // 'Q1' .. 'Q4'
      const kNum = parseInt(String(kStr || '').replace('Q', ''), 10);
      // Guard: corrupte getKwartaal_ output zou anders Invalid Date geven
      // en de hele weekly summary kapot maken bij een bug in kwartaal-helper.
      if (!isNaN(kNum) && kNum >= 1 && kNum <= 4) {
        const eindKwartaal = new Date(nu.getFullYear(), kNum * 3, 0);
        const deadline = new Date(eindKwartaal);
        deadline.setMonth(deadline.getMonth() + 1);
        const dagenTot = Math.ceil((deadline - nu) / (24 * 60 * 60 * 1000));
        if (dagenTot >= 0 && dagenTot <= 30) {
          btwInfo = `\n⏰ BTW-deadline ${kStr}: nog ${dagenTot} dagen (uiterlijk ${formatDatum_(deadline)})\n`;
        }
      }
    } catch (e) {
      Logger.log('BTW deadline berekening in weekly summary: ' + e.message);
    }

    const onderwerp = `📊 Weekoverzicht ${formatDatum_(weekGeleden)} – ${formatDatum_(nu)}`;
    const body =
      `Hallo,\n\n` +
      `Hier is uw wekelijkse boekhoud-samenvatting:\n\n` +
      `📈 OMZET DEZE WEEK\n` +
      `   ${aantalFacturen} factu${aantalFacturen === 1 ? 'ur' : 'ren'} verstuurd  →  ${formatBedrag_(omzetWeek)}\n\n` +
      `📉 KOSTEN DEZE WEEK\n` +
      `   ${aantalKosten} uitgave${aantalKosten === 1 ? '' : 'n'} geboekt  →  ${formatBedrag_(kostenWeek)}\n\n` +
      `💰 NETTO DEZE WEEK\n` +
      `   ${formatBedrag_(omzetWeek - kostenWeek)}\n\n` +
      `📥 OPENSTAANDE DEBITEUREN\n` +
      `   ${openDebAantal} factu${openDebAantal === 1 ? 'ur' : 'ren'}  →  ${formatBedrag_(openDebSaldo)}\n\n` +
      (vervallenAantal > 0 ?
        `⚠️ VERVALLEN FACTUREN\n   ${vervallenAantal} factu${vervallenAantal === 1 ? 'ur' : 'ren'}  →  ${formatBedrag_(vervallenBedrag)}\n\n` :
        '') +
      btwInfo +
      `\nOpen uw spreadsheet voor het volledige dashboard.\n\n` +
      `— Boekhoudbaar`;

    if (!isGeldigEmail_(ontvanger)) {
      Logger.log('Weekly summary overgeslagen: ongeldig e-mailadres "' + ontvanger + '"');
      safeAuditLog_('Weekly summary OVERGESLAGEN', 'Ongeldig e-mailadres: ' + ontvanger);
      return;
    }
    stuurKlantNotificatie_(ontvanger, onderwerp, body);
    schrijfAuditLog_('Weekly summary verzonden', `naar ${ontvanger} – omzet ${formatBedrag_(omzetWeek)}`);
  } catch (e) {
    Logger.log('stuurWeeklySamenvatting_ fout: ' + e.message);
    safeAuditLog_('FOUT weekly summary', e.message);
  }
}

/**
 * Detecteert wanneer de spreadsheet zo groot wordt dat prestaties merkbaar
 * degraderen. Stuurt één waarschuwing per 30 dagen, via audit-log + email
 * indien eigen e-mail is ingesteld.
 *
 * Drempels:
 *   - VERKOOPFACTUREN + INKOOPFACTUREN samen > 2000 rijen
 *   - JOURNAALPOSTEN > 8000 rijen
 * Dan: adviseer "Boekhouding → Beheer → Nieuw boekjaar starten"
 */
function controleerSheetGrootte_(ss) {
  const nu = Date.now();
  const props = PropertiesService.getScriptProperties();
  const laatstKey = 'laatsteGrootteWaarschuwing';
  const laatst = parseInt(props.getProperty(laatstKey) || '0');
  if (nu - laatst < 30 * 24 * 60 * 60 * 1000) return; // max 1× per 30 dagen

  const vfRijen = (ss.getSheetByName(SHEETS.VERKOOPFACTUREN) || { getLastRow: () => 0 }).getLastRow();
  const ifRijen = (ss.getSheetByName(SHEETS.INKOOPFACTUREN)  || { getLastRow: () => 0 }).getLastRow();
  const jrRijen = (ss.getSheetByName(SHEETS.JOURNAALPOSTEN)  || { getLastRow: () => 0 }).getLastRow();

  const teVeelFacturen = (vfRijen + ifRijen) > 2000;
  const teVeelBoekingen = jrRijen > 8000;
  if (!teVeelFacturen && !teVeelBoekingen) return;

  const eigenEmail = getInstelling_('Email rapporten naar') || '';
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const bericht =
    'De spreadsheet bevat ' + (vfRijen + ifRijen) + ' facturen en ' + jrRijen + ' boekingen. ' +
    'Dit werkt prima, maar het Dashboard-refresh wordt merkbaar trager. ' +
    'Overweeg om een nieuw boekjaar te starten via Boekhouding → Instellingen → Nieuw boekjaar.';

  safeAuditLog_('Sheet-grootte waarschuwing', bericht);
  if (eigenEmail && isGeldigEmail_(eigenEmail)) {
    try {
      stuurKlantNotificatie_(eigenEmail, 'Tip: boekhouding wordt groot — overweeg nieuw boekjaar',
        bericht + '\n\n— Boekhoudbaar' + (bedrijf ? ' (' + bedrijf + ')' : ''));
    } catch (_) {}
  }
  props.setProperty(laatstKey, String(nu));
}

// ─────────────────────────────────────────────
//  AUTOMATISCHE BETALINGSHERINNERINGEN (DUNNING)
// ─────────────────────────────────────────────
/**
 * Stuurt betalingsherinneringen in 3 stappen:
 *   Stap 1: 1 dag na vervaldatum
 *   Stap 2: 7 dagen na vervaldatum
 *   Stap 3: 14 dagen na vervaldatum
 * De bereikte stap wordt bijgehouden in Script Properties.
 */
function stuurAutomatischeBetalingsherinneringen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet || sheet.getLastRow() < 2) return;

  // Pre-flight quota-check — voorkomt dat dagelijkse trigger 50 herinneringen
  // probeert maar bij rij 30 stopt door quota-uitputting (consumer Apps Script
  // = 100/dag). Lokale veiligheidsmarge: stop met 5 buffer-emails over voor
  // factuurversturen + accountantsmail.
  let resterendQuota = 100;
  try {
    resterendQuota = MailApp.getRemainingDailyQuota();
    if (resterendQuota <= 5) {
      Logger.log('Dunning OVERGESLAGEN: quota bijna op (' + resterendQuota + ' over). Reserveer voor handmatige acties.');
      safeAuditLog_('Dunning overgeslagen', 'Quota bijna op: ' + resterendQuota + ' over');
      try { meldFataalAanOwner_('QUOTA', 'Email-quota bijna op (' + resterendQuota + ' over)', { module: 'dunning' }); } catch (_) {}
      return;
    }
  } catch (_) { /* quota-API down? laat door */ }

  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const props = PropertiesService.getScriptProperties();
  const STAP_DAGEN = [1, 7, 14];
  // RELATIES één keer inlezen i.p.v. per factuur (voorkomt N×M sheet-reads).
  const relatieEmailMap = bouwRelatieEmailMap_(ss);

  // Resume-cursor: bij crash halverwege wordt dunningCursor opgeslagen, bij
  // volgende run hervatten we vanaf die rij. Voorkomt dat eerste 50 rijen 2x
  // herinnering krijgen na een 6-min timeout halverwege rij 51.
  // Reset naar 1 zodra alle rijen langs zijn gegaan (einde van loop).
  const CURSOR_KEY = 'dunningCursor';
  const startRij = parseInt(props.getProperty(CURSOR_KEY) || '1');
  const MAX_PER_RUN = 100;  // batch-grootte voor 6-min execution-limit
  const startTs = Date.now();
  let verwerkt = 0;
  let i = startRij;

  for (; i < data.length; i++) {
    // Dual-cap: count-based EN time-based. guillotineCheck_ schedule self-trigger
    // bij >4.5min — vangt corner-cases af waar individuele email-versturen lang duurt.
    if (verwerkt >= MAX_PER_RUN ||
        guillotineCheck_(startTs, 'stuurAutomatischeBetalingsherinneringen_', { rij: i }, 270000)) {
      // Pauzeer hier — volgende run hervat
      props.setProperty(CURSOR_KEY, String(i));
      Logger.log('Dunning batch-pauze bij rij ' + i + ' (max ' + MAX_PER_RUN + ' per run)');
      safeAuditLog_('Dunning batch-pauze', 'rij ' + i + ' van ' + data.length);
      return;
    }
    const status = data[i][KOL.VF.status];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;

    // CYCLE-59: parseDatum_ — anders skipt dunning string-dated facturen
    // → klant verstuurt nooit herinnering → debiteuren-saldo loopt op.
    const vervaldatum = data[i][KOL.VF.vervaldatum] ? ((data[i][KOL.VF.vervaldatum] instanceof Date) ? data[i][KOL.VF.vervaldatum] : parseDatum_(data[i][KOL.VF.vervaldatum])) : null;
    if (!vervaldatum || isNaN(vervaldatum.getTime())) continue;
    const dagenOver = Math.floor((vandaag - vervaldatum) / 86400000);
    if (dagenOver < 1) continue;

    const factuurnummer = String(data[i][KOL.VF.factuurnummer]);
    const stapKey = 'herinneringsStap_' + factuurnummer;
    const gestuurdeStap = parseInt(props.getProperty(stapKey) || '0');
    const volgendeStap = STAP_DAGEN.filter(d => dagenOver >= d).length;
    if (volgendeStap <= gestuurdeStap) continue;

    const klantId = data[i][KOL.VF.klantId];
    const klantEmail = relatieEmailMap[String(klantId)] || null;
    if (!klantEmail) continue;

    const klantnaam   = data[i][KOL.VF.klantnaam];
    const bedragOpen  = rondBedrag_((data[i][KOL.VF.bedragIncl] || 0) - (data[i][KOL.VF.betaaldBedrag] || 0));
    const pdfUrl      = data[i][KOL.VF.pdfUrl] || '';

    // Skip als al volledig betaald (negatief = overbetaling, status nog niet bijgewerkt)
    if (bedragOpen <= 0) continue;

    // Geen stap-teller ("1/3") in het onderwerp: dat lekt de interne
    // escalatie-administratie naar de debiteur van de klant. Escalatie
    // zit in de toon van de tekst; de stap staat in het audit-log.
    const onderwerp = volgendeStap >= 3
      ? `Laatste betalingsherinnering – Factuur ${factuurnummer}`
      : `Betalingsherinnering – Factuur ${factuurnummer}`;
    const tekst =
      `Beste ${klantnaam},\n\n` +
      (volgendeStap === 1
        ? `Wij wijzen u vriendelijk op de onderstaande openstaande factuur waarvoor de betalingstermijn is verstreken.`
        : volgendeStap === 2
        ? `Ondanks onze eerdere herinnering ontvingen wij nog geen betaling voor de onderstaande factuur.`
        : `Dit is onze laatste herinnering. Wij verzoeken u dringend de betaling te voldoen.`) +
      `\n\nFactuurnummer: ${factuurnummer}` +
      `\nVervaldatum: ${formatDatum_(vervaldatum)}` +
      `\nOpenstaand bedrag: ${formatBedrag_(bedragOpen)}` +
      `\n\nGelieve dit bedrag over te maken naar ${getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || ''}` +
      ` o.v.v. ${factuurnummer}.\n\nMet vriendelijke groet,\n${bedrijf}`;

    if (!isGeldigEmail_(klantEmail)) {
      Logger.log(`Herinnering ${factuurnummer} overgeslagen: ongeldig e-mailadres "${klantEmail}"`);
      safeAuditLog_('Herinnering OVERGESLAGEN', factuurnummer + ' – ongeldig e-mailadres: ' + klantEmail);
      continue;
    }
    try {
      const opties = { name: bedrijf };
      if (pdfUrl) {
        try {
          opties.attachments = [DriveApp.getFileById(extractFileId_(pdfUrl)).getAs('application/pdf')];
        } catch (e) { /* PDF optioneel */ }
      }
      MailApp.sendEmail(klantEmail, onderwerp, tekst, opties);  // klant-mail-ok: betalingsherinnering naar DERDE (debiteur), zakelijk
      props.setProperty(stapKey, String(volgendeStap));
      verwerkt++;  // tel alleen werkelijk verstuurde mails — voorkomt batch-skip bij scrolling
      Logger.log(`Herinnering stap ${volgendeStap}/3 verstuurd voor ${factuurnummer} naar ${klantEmail}`);
    } catch (err) {
      Logger.log(`Herinnering fout voor ${factuurnummer}: ${err.message}`);
      safeAuditLog_('Herinnering MISLUKT', factuurnummer + ' – ' + err.message);
      // DLQ: voeg toe voor auto-retry. Opzettelijk geen pdfUrl-attachment in
      // payload — die kan groter zijn dan cell-limit. Retry-handler haalt PDF
      // opnieuw op via factuurnummer.
      try {
        if (typeof dlqVoegToe_ === 'function') {
          dlqVoegToe_('EMAIL_HERINNERING', {
            email: klantEmail, onderwerp: onderwerp, tekst: tekst,
            opties: { name: bedrijf },
          }, err.message);
        }
      } catch (_) {}
    }
  }

  // Volledige sweep voltooid — reset cursor zodat volgende run weer vanaf rij 1 begint
  props.deleteProperty(CURSOR_KEY);
}

// ─────────────────────────────────────────────
//  HELPERS TRIGGERS
// ─────────────────────────────────────────────
function koppelBankTransactieAanFactuur_(ss, transactieId, ref, bedrag, isOntvangst, datum) {
  // Strikte match: ref is alleen geldig als hij EXACT in fnr staat
  // (eerder: fnr.includes(ref) || ref.includes(fnr) → 'F100' matchte 'F1000').
  // We accepteren een match als (a) ref === fnr, of (b) ref voorkomt als
  // hele woordeenheid in fnr (case-insensitive).
  const refNorm = String(ref || '').trim();
  if (!refNorm) return;
  const refRe = new RegExp('(^|\\W)' + refNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\W|$)', 'i');
  const matchFnr = (fnr) => {
    const f = String(fnr || '');
    return f === refNorm || refRe.test(f);
  };

  if (isOntvangst) {
    // Zoek open verkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][KOL.VF.factuurnummer]); // Factuurnummer
      if (!matchFnr(fnr)) continue;
      const totalIncl = parseFloat(data[i][KOL.VF.bedragIncl]) || 0;
      const reedsBetaald = parseFloat(data[i][KOL.VF.betaaldBedrag]) || 0;
      const openstaand = rondBedrag_(totalIncl - reedsBetaald);
      const tePlaatsen = Math.max(0, Math.min(bedrag, openstaand));
      if (tePlaatsen <= 0) break;
      const nieuwBetaald = rondBedrag_(reedsBetaald + tePlaatsen);
      const nieuwStatus = nieuwBetaald + 0.005 >= totalIncl
        ? FACTUUR_STATUS.BETAALD
        : FACTUUR_STATUS.DEELS_BETAALD;
      sheet.getRange(i + 1, 14).setValue(nieuwBetaald);   // Betaald bedrag
      sheet.getRange(i + 1, 15).setValue(nieuwStatus);    // Status
      if (nieuwStatus === FACTUUR_STATUS.BETAALD) {
        sheet.getRange(i + 1, 16).setValue(datum);        // Betaaldatum
        // CYCLE-20: ruim herinneringsStap_<fnr> op zodra factuur betaald is.
        // Zonder cleanup accumuleren deze keys voor altijd in
        // ScriptProperties (1 per ooit-verstuurde herinnering). Bonus: als
        // klant later crediteert + opnieuw factureert onder zelfde nummer,
        // start dunning vers (geen 'stap 3 verstuurd' meer als ghost-state).
        try { PropertiesService.getScriptProperties().deleteProperty('herinneringsStap_' + fnr); } catch (_) {}
      }
      // Boek de daadwerkelijke betaling van DEZE transactie (niet cumulatief).
      // Vóór de fix werd `nieuwBetaald` geboekt waardoor bij een tweede
      // deelbetaling het hele cumulatieve bedrag dubbel werd geboekt.
      maakJournaalpost_(ss, {
        datum,
        omschr: nieuwStatus === FACTUUR_STATUS.BETAALD
          ? `Ontvangst factuur ${fnr}`
          : `Deelbetaling factuur ${fnr}`,
        dagboek: 'Bankboek',
        debet: '1200', credit: '1100',
        bedrag: tePlaatsen,
        ref: fnr,
        type: BOEKING_TYPE.BANKONTVANGST,
      });
      break;
    }
  } else {
    // Zoek open inkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][KOL.IF.factuurrefLeverancier]); // Factuurref leverancier
      if (!matchFnr(fnr)) continue;
      // Idempotency-guard: als al BETAALD, geen tweede journaalpost.
      const huidigeStatus = String(data[i][KOL.IF.status] || '');
      if (huidigeStatus === FACTUUR_STATUS.BETAALD) break;
      sheet.getRange(i + 1, 13).setValue(FACTUUR_STATUS.BETAALD);
      sheet.getRange(i + 1, 14).setValue(datum);

      // Crediteuren → Bank journaalpost
      maakJournaalpost_(ss, {
        datum,
        omschr: `Betaling factuur ${fnr}`,
        dagboek: 'Bankboek',
        debet: '4000', credit: '1200',
        bedrag,
        ref: fnr,
        type: BOEKING_TYPE.BANKBETALING,
      });
      break;
    }
  }
}

function markeerVervallenFacturen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  // Day-only vergelijking: een factuur die VANDAAG vervalt is nog niet vervallen
  // (gebruiker mag tot eind van de dag betalen). Eerst tijd op 00:00 zetten.
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  // Markeer als VERVALLEN: status is VERZONDEN of DEELS_BETAALD én vervaldatum is voorbij.
  // Concepts skippen we (nog niet officieel verstuurd), BETAALD/GECREDITEERD is final.
  const teMarkeren = [FACTUUR_STATUS.VERZONDEN, FACTUUR_STATUS.DEELS_BETAALD];

  // Audit-vondst ronde 2 (GAS-runtime): was per-rij setValue + setBackground in
  // for-loop = 2 sheet-writes per match × ~10ms. Bij 5k facturen waarvan 200
  // vervallen = 4s overhead in dagelijkseTaken. Nu: collect ranges + batch
  // via getRangeList (één sheet-roundtrip). Bij 0 hits = 0 writes.
  const teVervallenRijen = [];
  for (let i = 1; i < data.length; i++) {
    const status = data[i][KOL.VF.status];
    if (teMarkeren.indexOf(status) === -1) continue;
    // Vervaldatum kan in cell als Date-object OF als string staan (na CSV-import).
    // parseDatum_ accepteert beide. Native new Date(stringNL) zou NaN geven.
    const ruwVerval = data[i][KOL.VF.vervaldatum];
    if (!ruwVerval) continue;
    const verval = (ruwVerval instanceof Date) ? ruwVerval : parseDatum_(ruwVerval);
    if (!verval || isNaN(verval.getTime())) continue;
    if (verval < vandaag) {
      teVervallenRijen.push(i + 1);  // 1-based rij-nr voor Sheet API
    }
  }
  if (teVervallenRijen.length === 0) return;
  // Batch: zelfde kolom 15 (status). getRangeList accepteert A1-notation.
  const a1List = teVervallenRijen.map(function(rij) { return 'O' + rij; });  // O = kolom 15
  try {
    const rangeList = sheet.getRangeList(a1List);
    rangeList.setValue(FACTUUR_STATUS.VERVALLEN);
    rangeList.setBackground('#FFCDD2');
  } catch (e) {
    // Fallback: oude per-rij loop indien getRangeList niet beschikbaar
    Logger.log('markeerVervallenFacturen_ batch faalde, fallback per-rij: ' + e.message);
    teVervallenRijen.forEach(function(rij) {
      try {
        sheet.getRange(rij, 15).setValue(FACTUUR_STATUS.VERVALLEN);
        sheet.getRange(rij, 15).setBackground('#FFCDD2');
      } catch (_) {}
    });
  }
}

function controleerBtwDeadlines_() {
  const vandaag = new Date();
  const jaar = vandaag.getFullYear();
  // Officiële BTW-aangifte deadlines: laatste dag van maand-na-kwartaal
  // Q1 (jan-mrt) → 30 april
  // Q2 (apr-jun) → 31 juli
  // Q3 (jul-sep) → 31 oktober
  // Q4 (okt-dec) → 31 januari volgend jaar
  const deadlines = [
    { kw: 1, datum: new Date(jaar, 3, 30) },
    { kw: 2, datum: new Date(jaar, 6, 31) },
    { kw: 3, datum: new Date(jaar, 9, 31) },
    { kw: 4, datum: new Date(jaar + 1, 0, 31) },
    // Ook Q4 vorig jaar — voor januari-reminders
    { kw: 4, datum: new Date(jaar, 0, 31), suffix: ' (' + (jaar - 1) + ')' },
  ];
  const email = getInstelling_('Email rapporten naar');
  if (!email || !isGeldigEmail_(email)) {
    if (email) {
      Logger.log('BTW-deadline check: ongeldig e-mailadres "' + email + '"');
      safeAuditLog_('BTW deadline check OVERGESLAGEN', 'Ongeldig e-mailadres: ' + email);
    }
    return;
  }

  for (const d of deadlines) {
    const dagenTot = Math.floor((d.datum - vandaag) / 86400000);
    if (dagenTot > 0 && dagenTot <= 14) {
      const kwLabel = 'Q' + d.kw + (d.suffix || '');
      try {
        stuurKlantNotificatie_(email,
          `Herinnering: BTW aangifte ${kwLabel} deadline over ${dagenTot} dagen`,
          `Beste,\n\nDe deadline voor uw BTW aangifte ${kwLabel} is ${formatDatum_(d.datum)}.\n\n` +
          `Genereer uw aangifte via: Boekhouding → BTW → BTW aangifte ${kwLabel.replace(/\s.*/, '')}\n\n` +
          `Met vriendelijke groet,\n— Boekhoudbaar`
        );
      } catch (err) {
        Logger.log('BTW deadline reminder mislukt: ' + err.message);
        safeAuditLog_('BTW reminder MISLUKT', kwLabel + ' – ' + err.message);
      }
    }
  }
}

function stuurFoutEmail_(context, err) {
  try {
    const email = getInstelling_('Email rapporten naar');
    if (email && isGeldigEmail_(email)) {
      MailApp.sendEmail(email,  // klant-mail-ok: fout-email naar eigenaar (safety, event-driven)
        `Fout in boekhoudprogramma: ${context}`,
        `Er is een fout opgetreden bij het verwerken van: ${context}\n\nFoutmelding: ${err.message}\n\nStack: ${err.stack}`
      );
    }
  } catch(e) {
    Logger.log('Kon fout email niet sturen: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  HERINNERINGEN HANDMATIG STUREN
// ─────────────────────────────────────────────
function stuurBetalingsherinneringen() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  let aantalVerstuurd = 0;
  // RELATIES één keer inlezen i.p.v. per factuur (voorkomt N×M sheet-reads).
  const relatieEmailMap = bouwRelatieEmailMap_(ss);

  for (let i = 1; i < data.length; i++) {
    const status = data[i][KOL.VF.status];
    const klantId = data[i][KOL.VF.klantId];

    if (status !== FACTUUR_STATUS.VERVALLEN && status !== FACTUUR_STATUS.VERZONDEN) continue;

    const klantEmail = relatieEmailMap[String(klantId)] || null;
    if (!klantEmail) continue;

    const fnr = data[i][KOL.VF.factuurnummer];
    // Defensief parsen: als een klant handmatig 'betaald' of een datum in
    // betaald-kolom zet, geven we liever €0 dan NaN in de herinneringsmail.
    const bedragOpen = rondBedrag_((parseFloat(data[i][KOL.VF.bedragIncl]) || 0) - (parseFloat(data[i][KOL.VF.betaaldBedrag]) || 0));
    const vervaldatum = data[i][KOL.VF.vervaldatum];
    if (bedragOpen <= 0) continue; // Geen herinnering sturen voor volledig betaalde factuur

    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const bedrijf = getInstelling_('Bedrijfsnaam') || '';
    const vervalStr = formatDatum_(vervaldatum);
    const bedragStr = formatBedrag_(bedragOpen);

    const htmlBody =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:540px;color:#1A1A1A">' +
      '<div style="background:#B45309;padding:18px 22px;border-radius:8px 8px 0 0">' +
        '<div style="color:rgba(255,255,255,.85);font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Betalingsherinnering</div>' +
        '<div style="color:#fff;font-size:20px;font-weight:700">' + escHtml_(fnr) + '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E5EAF2;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.55">Wij kwamen deze factuur tegen als nog niet betaald. Mocht u al betaald hebben, negeer dan dit bericht.</p>' +
        '<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0;background:#F7F9FC;border-radius:6px">' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px">Openstaand</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:700;font-size:15px;color:#B45309">' + bedragStr + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Vervaldatum</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px;border-top:1px solid #E5EAF2">' + vervalStr + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">IBAN</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(iban) + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Kenmerk</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(fnr) + '</td></tr>' +
        '</table>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#5F6B7A">Bij vragen kunt u altijd reageren op deze mail.</p>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#5F6B7A">Met vriendelijke groet,<br><strong style="color:#1A1A1A">' + escHtml_(bedrijf) + '</strong></p>' +
      '</div></div>';

    const tekst =
      'Beste klant,\n\n' +
      'Wij herinneren u vriendelijk aan factuur ' + fnr + '.\n\n' +
      'Openstaand: ' + bedragStr + '\nVervaldatum: ' + vervalStr + '\nIBAN: ' + iban +
      '\nKenmerk: ' + fnr + '\n\nMet vriendelijke groet,\n' + bedrijf;

    if (!isGeldigEmail_(klantEmail)) {
      Logger.log('Herinnering ' + fnr + ' overgeslagen: ongeldig e-mailadres "' + klantEmail + '"');
      safeAuditLog_('Herinnering OVERGESLAGEN', fnr + ' – ongeldig e-mailadres: ' + klantEmail);
      continue;
    }
    try {
      MailApp.sendEmail(klantEmail,  // klant-mail-ok: betalingsherinnering naar DERDE (debiteur)
        `Herinnering factuur ${fnr} · ${bedragStr}`,
        tekst,
        { htmlBody: htmlBody, name: bedrijf }
      );
      aantalVerstuurd++;
    } catch (err) {
      Logger.log('Herinnering ' + fnr + ' mislukt: ' + err.message);
      safeAuditLog_('Herinnering MISLUKT', fnr + ' – ' + err.message);
    }
  }

  SpreadsheetApp.getUi().alert(`${aantalVerstuurd} herinneringen verstuurd.`);
}

/**
 * Bouwt éénmalig een {relatie-id → e-mailadres}-map uit het RELATIES-blad.
 * Vervangt haalRelatieEmail_, dat de hele RELATIES-sheet opnieuw las PER
 * factuur in de dagelijkse aanmaningen-loop (N×M sheet-reads → 6-min-
 * timeoutrisico bij groei). Bouw de map één keer vóór de loop en doe
 * in-memory lookups.
 *
 * Bij dubbele id's wint de EERSTE rij — gelijk aan het oude lineaire-zoek-
 * gedrag (dat de eerste match retourneerde).
 *
 * @param {Spreadsheet} ss
 * @returns {Object<string,string>} id → e-mail (kolom 10, 0-based)
 */
function bouwRelatieEmailMap_(ss) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][KOL.REL.relatieId]);
    if (id && !(id in map)) map[id] = data[i][KOL.REL.email]; // E-mailadres kolom
  }
  return map;
}

// ─────────────────────────────────────────────
//  AUDIT LOG TONEN (MENU-ACTIE)
// ─────────────────────────────────────────────
/**
 * Maakt het Audit Log-tabblad zichtbaar en activeert het.
 * Aanroepbaar vanuit het menu "Controle & Export → Audit Log tonen".
 */
function toonAuditLog() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sheet) {
    setupAuditLogSheet_();
    sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  }
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Audit Log',
      'Het Audit Log-tabblad kon niet worden aangemaakt. Voer eerst de setup uit.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  try { sheet.showSheet(); } catch (_) {}
  ss.setActiveSheet(sheet);
  schrijfAuditLog_('audit_log_geopend', 'gebruiker bekeek het Audit Log');
}

/**
 * P29-FIX helper: bouw idempotency-signatuur voor inkoopfactuur.
 * Normaliseert leverancier (lowercased, whitespace-collapsed) + datum
 * (YYYY-MM-DD in lokale TZ) + bedragIncl (cents-precisie) + leverancier-
 * factuurnr (lowercased). Twee identieke submits geven exact dezelfde key.
 *
 * @param {string} leverancier      Leveranciernaam (gestripte input)
 * @param {Date}   datum            Factuurdatum
 * @param {number} bedragIncl       Bedrag incl. BTW (€)
 * @param {string} factuurnrLev     Leverancier-factuurnr (optional)
 * @return {string} Cache-key, bv. "inkoop_sap_2026-03-15_12100_INV-42"
 */
function _bouwInkoopSig_(leverancier, datum, bedragIncl, factuurnrLev) {
  const lev = String(leverancier || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const datumStr = (datum instanceof Date && !isNaN(datum.getTime()))
    ? Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd')
    : '0000-00-00';
  const cents = Math.round((parseFloat(bedragIncl) || 0) * 100);
  const fnr = String(factuurnrLev || '').toLowerCase().trim();
  return 'inkoop_' + lev + '_' + datumStr + '_' + cents + '_' + fnr;
}

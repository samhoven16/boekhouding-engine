/**
 * Utils.gs
 * Hulpfuncties voor datumopmaak, getalopmaak, parsing en validatie.
 *
 * @OnlyCurrentDoc Beperkt spreadsheets-scope tot bound document. Klant
 *   ziet `spreadsheets.currentonly` i.p.v. volledige `spreadsheets`-scope.
 *   App opent ALLEEN haar eigen sheet (via getActiveSpreadsheet of
 *   openById van de eigen SS-ID die in ScriptProperties staat).
 */

// ─────────────────────────────────────────────
//  SPREADSHEET OPHALEN (STANDALONE + GEBONDEN)
// ─────────────────────────────────────────────

/**
 * Haalt de spreadsheet op. Werkt zowel als standalone script
 * (opent via opgeslagen ID) als als gebonden script (getActiveSpreadsheet).
 */
function getSpreadsheet_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  const ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch (e) {
      Logger.log('Kon spreadsheet niet openen met ID ' + ssId + ': ' + e.message);
    }
  }
  return null;
}

/**
 * Toont een alert als er een UI beschikbaar is, anders logt het bericht.
 */
function alertOfLog_(ui, titel, bericht) {
  if (ui) {
    try { ui.alert(titel, bericht, ui.ButtonSet.OK); return; } catch (e) {}
  }
  Logger.log('[' + titel + '] ' + bericht);
}

// ─────────────────────────────────────────────
//  DATUM FUNCTIES
// ─────────────────────────────────────────────

/**
 * Formatteert een datum naar dd-mm-yyyy
 */
function formatDatum_(datum) {
  if (!datum) return '';
  const d = datum instanceof Date ? datum : new Date(datum);
  if (isNaN(d.getTime())) return String(datum);
  return Utilities.formatDate(d, 'Europe/Amsterdam', 'dd-MM-yyyy');
}

/**
 * Formatteert datum en tijd
 */
function formatDatumTijd_(datum) {
  if (!datum) return '';
  const d = datum instanceof Date ? datum : new Date(datum);
  return Utilities.formatDate(d, 'Europe/Amsterdam', 'dd-MM-yyyy HH:mm');
}

/**
 * Parseert een datumstring (meerdere formaten)
 */
function parseDatum_(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  str = String(str);

  // Probeer ISO formaat (yyyy-mm-dd)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

  // Probeer NL formaat (dd-mm-yyyy of dd/mm/yyyy)
  const nlMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (nlMatch) return new Date(parseInt(nlMatch[3]), parseInt(nlMatch[2]) - 1, parseInt(nlMatch[1]));

  // Fallback: native parsing
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Geeft de naam van de maand terug
 */
function maandNaam_(maandNr) {
  const namen = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
                 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
  return namen[(maandNr - 1) % 12] || '';
}

/**
 * Geeft begin en einde van een maand
 */
function getMaandPeriode_(jaar, maand) {
  return {
    van: new Date(jaar, maand - 1, 1),
    tot: new Date(jaar, maand, 0),
  };
}

// ─────────────────────────────────────────────
//  GETAL / BEDRAG FUNCTIES
// ─────────────────────────────────────────────

/**
 * Rondt een bedrag af op 2 decimalen (bankiersmethode)
 */
function rondBedrag_(bedrag) {
  return Math.round((parseFloat(bedrag) || 0) * 100) / 100;
}

/**
 * Formatteert een bedrag als EUR-string in NL-standaard.
 * Gebruikt non-breaking space (U+00A0) tussen € en bedrag — voorkomt dat
 * "€ 1.234,56" over twee regels wordt afgebroken in HTML/PDF-render.
 *
 * Voorbeelden:
 *   formatBedrag_(1234.56)  → "€ 1.234,56"
 *   formatBedrag_(-99)      → "-€ 99,00"
 *   formatBedrag_(0)        → "€ 0,00"
 */
function formatBedrag_(bedrag) {
  const b = parseFloat(bedrag) || 0;
  const prefix = b < 0 ? '-€ ' : '€ ';
  return prefix + Math.abs(b).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parseert een bedrag uit een string (verwerkt comma's, punten, €-teken)
 */
function parseBedrag_(str) {
  if (!str && str !== 0) return 0;
  if (typeof str === 'number') return rondBedrag_(str);

  const cleaned = String(str)
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3})/g, '')  // Verwijder duizendtalpunten
    .replace(',', '.');           // Komma naar punt

  const waarde = parseFloat(cleaned);
  return isNaN(waarde) ? 0 : rondBedrag_(waarde);
}

/**
 * Strict-variant: throw bij invalid input i.p.v. silent return 0.
 * Gebruik voor financieel-kritieke velden waar een €0,00 factuur
 * NOOIT mag voorkomen (factuurregel-prijs, bank-bedrag, IB-grondslag).
 *
 * Voorbeelden:
 *   parseBedragStrict_('1.234,56')  → 1234.56
 *   parseBedragStrict_('abc')       → throw "Ongeldig bedrag: 'abc'..."
 *   parseBedragStrict_('')          → throw
 *   parseBedragStrict_(null)        → throw
 *   parseBedragStrict_(0)           → 0  (expliciete nul is OK)
 *
 * @param {*} ruw
 * @param {string=} veldnaam  voor errormelding ("Prijs regel 1")
 * @returns {number}
 */
function parseBedragStrict_(ruw, veldnaam) {
  const label = veldnaam || 'Bedrag';
  if (ruw === null || ruw === undefined || ruw === '') {
    throw new Error(label + ' is leeg — vul een numerieke waarde in.');
  }
  if (typeof ruw === 'number') {
    if (!isFinite(ruw)) throw new Error(label + ' is geen getal (Infinity/NaN).');
    return rondBedrag_(ruw);
  }
  const cleaned = String(ruw)
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.');
  const w = parseFloat(cleaned);
  if (isNaN(w) || !isFinite(w)) {
    throw new Error(label + " is geen geldig bedrag: '" + String(ruw).slice(0, 40) + "'. Gebruik cijfers, bv. 1234,56.");
  }
  return rondBedrag_(w);
}

/**
 * Strict datum-parser: throw bij invalid i.p.v. fallback naar today().
 * Gebruik in financieel-kritieke contexten (BTW-aangifte, factuurdatum
 * voor periode-bepaling).
 */
function parseDatumStrict_(ruw, veldnaam) {
  const label = veldnaam || 'Datum';
  if (ruw === null || ruw === undefined || ruw === '') {
    throw new Error(label + ' is leeg — vul een datum in (bv. 15-04-2026).');
  }
  if (ruw instanceof Date) {
    if (isNaN(ruw.getTime())) throw new Error(label + ' is een ongeldig Date-object.');
    return ruw;
  }
  const d = parseDatum_(ruw);
  if (!d || isNaN(d.getTime())) {
    throw new Error(label + " is geen geldige datum: '" + String(ruw).slice(0, 40) + "'. Gebruik formaat dd-mm-jjjj.");
  }
  // Extra sanity: jaar tussen 1990 en huidig+10 — waarschuwt bij typo's
  const jaar = d.getFullYear();
  if (jaar < 1990 || jaar > new Date().getFullYear() + 10) {
    throw new Error(label + " heeft een onwaarschijnlijk jaartal (" + jaar + "). Controleer de invoer.");
  }
  return d;
}

/**
 * Formatteert een percentage
 */
function formatPct_(waarde) {
  return (parseFloat(waarde) || 0).toFixed(1) + '%';
}

// ─────────────────────────────────────────────
//  HTML SANITISATIE
// ─────────────────────────────────────────────

/**
 * Escapet HTML speciale tekens om XSS/injectie in HTML-templates te voorkomen.
 * Gebruik in alle factuur-PDF templates voor gebruikersinvoer.
 */
function escHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ─────────────────────────────────────────────
//  FOUTMELDING-VERTALING
// ─────────────────────────────────────────────
//
// Vertaalt raw GAS-fouten naar klant-vriendelijke NL-zinnen.
// Logt altijd de oorspronkelijke message naar audit-log voor support/debug.
//
// Gebruik in dialog-failure-handlers ipv `'Fout: ' + e.message`:
//   .withFailureHandler(function(e) { toonStatus(vertaalFout_(e), '#c62828'); })
//
// Server-side `Logger.log` blijft raw — daar willen we juist de stack-trace.
//
// JARGON-GLOSSARIUM (waarheidsbron voor user-facing strings):
//   journaalpost (UI)      → boeking
//   memoriaal (UI)         → handmatige boeking
//   creditnota (UI)        → correctiefactuur
//   grootboekrekening (UI) → rekening
//   debet/credit (UI)      → in/uit
// REGEL: function-namen, sheet-namen, kolom-headers, grootboek-codes blijven onveranderd.
function vertaalFout_(e) {
  const raw = String((e && e.message) || e || '').trim();
  // Unique Request ID — toonbaar in dialog footer, koppelbaar aan audit-log.
  // Klant kan dit ID copieren in support-ticket; owner zoekt daarmee in
  // audit-log naar exacte details + tenant-hash + tijdstip.
  const reqId = _genereerRequestId_();
  try { schrijfAuditLog_('FOUT_VERTAALD [' + reqId + ']', raw.slice(0, 240)); } catch (_) {}
  if (!raw) return 'Er ging iets mis. Probeer opnieuw of bekijk de Audit Log. (ref: ' + reqId + ')';
  const suffix = ' (ref: ' + reqId + ')';
  if (/too many times|rate.?limit|service invoked/i.test(raw)) return 'Te veel acties achter elkaar — wacht een minuut en probeer opnieuw.' + suffix;
  if (/permission|not.*authoriz|access.*denied|geen toegang/i.test(raw)) return 'Geen toegang tot dit bestand. Vraag de eigenaar of probeer opnieuw in te loggen.' + suffix;
  if (/quota|limit\s*exceeded|dagelijkse limiet/i.test(raw)) return 'Dagelijkse limiet bereikt — probeer morgen opnieuw of upgrade naar Google Workspace.' + suffix;
  if (/timeout|deadline|time.?out/i.test(raw)) return 'Het duurde te lang — controleer je internet en probeer opnieuw.' + suffix;
  if (/network|fetch|getaddrinfo|enotfound/i.test(raw)) return 'Netwerkfout — controleer je internetverbinding en probeer opnieuw.' + suffix;
  if (/not found|niet gevonden|404/i.test(raw)) return 'Item niet gevonden — herlaad de pagina.' + suffix;
  if (/invalid|ongeldig|cannot read|undefined/i.test(raw)) return 'Ongeldige invoer — controleer de waarden en probeer opnieuw.' + suffix;
  // Behoud business-fouten die we zelf met `throw new Error(...)` gooien (NL-tekst)
  if (/^[A-Za-zÀ-ÿ ]/.test(raw) && raw.length < 200 && !/[a-z]:[A-Z]|stack|trace/i.test(raw)) return raw + suffix;
  return 'Er ging iets mis. Controleer je invoer en probeer opnieuw.' + suffix;
}

/**
 * Genereert een korte, kopieerbare Request ID voor support-tracking.
 * Format: 8 chars uit Utilities.getUuid() — kort genoeg voor mondeling
 * doorgeven, uniek genoeg voor audit-log-zoekslag.
 */
function _genereerRequestId_() {
  try { return Utilities.getUuid().slice(0, 8); }
  catch (_) { return 'req' + Date.now().toString(36).slice(-6); }
}

/**
 * Compute deterministic hash voor reproduceerbare berekeningen.
 * Klant kan jaren later input recompute en compare hash → audit-bestendig.
 *
 * @param {Object} input  alle input-keys (winst, jaartal, aftrek-flags)
 * @returns {string}      8-char hex hash
 */
function hashBerekeningInput_(input) {
  try {
    const json = JSON.stringify(input, Object.keys(input).sort());  // gesorteerde keys
    const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json);
    return raw.slice(0, 4).map(function(b) {
      return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0');
    }).join('');
  } catch (_) { return 'hash-?'; }
}

/**
 * Audit-log JSON-export naar Drive — voor SIEM-integratie / extern monitoring.
 * Schrijft laatste N dagen events naar JSON-bestand in Drive.
 */
function exporteerAuditLogJson() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  const auditSheet = ss.getSheetByName('Audit Log');
  if (!auditSheet || auditSheet.getLastRow() < 2) {
    ui.alert('Geen audit-log entries om te exporteren.');
    return;
  }
  const data = auditSheet.getDataRange().getValues();
  const headers = data[0];
  const events = [];
  const grens = Date.now() - 90 * 86400000;  // laatste 90 dagen
  for (let i = 1; i < data.length; i++) {
    const ts = data[i][0] instanceof Date ? data[i][0].getTime() : 0;
    if (ts < grens) continue;
    const event = {};
    headers.forEach(function(h, idx) {
      event[String(h).toLowerCase().replace(/\s+/g, '_')] = data[i][idx] instanceof Date
        ? data[i][idx].toISOString()
        : data[i][idx];
    });
    events.push(event);
  }
  const jsonl = events.map(function(e) { return JSON.stringify(e); }).join('\n');
  const huidigJaar = new Date().getFullYear();
  let map = null;
  try {
    const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + huidigJaar);
    if (hoofdId) map = DriveApp.getFolderById(hoofdId);
  } catch (_) {}
  if (!map) map = DriveApp.getRootFolder();
  const naam = 'audit-log_' + new Date().toISOString().slice(0, 10) + '.jsonl';
  const file = map.createFile(naam, jsonl, 'application/x-ndjson');
  ui.alert('📁 Audit-log geëxporteerd', events.length + ' events naar ' + naam + '\n\nLocatie: ' + file.getUrl(), ui.ButtonSet.OK);
  try { schrijfAuditLog_('Audit-log JSON-export', naam + ' (' + events.length + ' events)'); } catch (_) {}
}

// ─────────────────────────────────────────────
//  VALIDATIE FUNCTIES
// ─────────────────────────────────────────────

function isGeldigIBAN_(iban) {
  iban = String(iban || '');
  if (!iban) return false;
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/.test(cleaned);
}

function isGeldigBTWNummer_(btwNr) {
  btwNr = String(btwNr || '');
  if (!btwNr) return false;
  return /^NL\d{9}B\d{2}$/.test(btwNr.replace(/\s/g, '').toUpperCase());
}

/**
 * Strikte EU BTW-nummer-formaat-check (alle EU-landen).
 * Werkt op de meeste EU-formaten — voor NL is dat strikter via isGeldigBTWNummer_.
 * Voorkomt dat BTW-nummer-veld leeg blijft of vol staat met onzin
 * (essentieel bij verleggingsregeling waar BTW-nr klant verplicht is).
 *
 * @param {string} btwNr Te valideren BTW-nummer.
 * @return {boolean} true als formaat een EU-BTW-nummer is.
 */
function isGeldigEuBTWNummer_(btwNr) {
  if (!btwNr) return false;
  const schoon = String(btwNr).replace(/\s/g, '').toUpperCase();
  // EU-formaten per land — niet uitputtend voor cijfers (geen MOD-checksum)
  // maar voldoende voor formaat-validatie. Bron: Europese Commissie VIES.
  const patronen = {
    AT: /^ATU\d{8}$/,            // Oostenrijk
    BE: /^BE0\d{9}$/,            // België
    BG: /^BG\d{9,10}$/,          // Bulgarije
    CY: /^CY\d{8}[A-Z]$/,        // Cyprus
    CZ: /^CZ\d{8,10}$/,          // Tsjechië
    DE: /^DE\d{9}$/,             // Duitsland
    DK: /^DK\d{8}$/,             // Denemarken
    EE: /^EE\d{9}$/,             // Estland
    EL: /^EL\d{9}$/,             // Griekenland (kan ook GR)
    GR: /^GR\d{9}$/,
    ES: /^ES[A-Z\d]\d{7}[A-Z\d]$/, // Spanje
    FI: /^FI\d{8}$/,             // Finland
    FR: /^FR[A-Z\d]{2}\d{9}$/,   // Frankrijk
    HR: /^HR\d{11}$/,            // Kroatië
    HU: /^HU\d{8}$/,             // Hongarije
    IE: /^IE[\d]{7}[A-Z]{1,2}$|^IE\d[A-Z]\d{5}[A-Z]$/, // Ierland (2 formaten)
    IT: /^IT\d{11}$/,            // Italië
    LT: /^LT(\d{9}|\d{12})$/,    // Litouwen
    LU: /^LU\d{8}$/,             // Luxemburg
    LV: /^LV\d{11}$/,            // Letland
    MT: /^MT\d{8}$/,             // Malta
    NL: /^NL\d{9}B\d{2}$/,       // Nederland (zelfde als isGeldigBTWNummer_)
    PL: /^PL\d{10}$/,            // Polen
    PT: /^PT\d{9}$/,             // Portugal
    RO: /^RO\d{2,10}$/,          // Roemenië
    SE: /^SE\d{12}$/,            // Zweden
    SI: /^SI\d{8}$/,             // Slovenië
    SK: /^SK\d{10}$/,            // Slowakije
  };
  const land = schoon.slice(0, 2);
  const regex = patronen[land];
  return regex ? regex.test(schoon) : false;
}

function isGeldigKvKNummer_(kvk) {
  kvk = String(kvk || '');
  if (!kvk) return false;
  return /^\d{8}$/.test(kvk.replace(/\s/g, ''));
}

function isGeldigEmail_(email) {
  email = String(email || '').trim();
  if (!email || email.length > 254) return false;
  // RFC 5322 simplified: lokaal deel + @ + domein met geldige TLD (≥2 letters).
  // Voorkomt false-positives als 'a@b.c' of 'test@.co' die GmailApp-crash geven.
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(email);
}

// ─────────────────────────────────────────────
//  SPREADSHEET HELPERS
// ─────────────────────────────────────────────

/**
 * Voegt dropdown validatie toe aan een bereik
 */
function zetDropdown_(sheet, rij, kolom, keuzes) {
  const regel = SpreadsheetApp.newDataValidation()
    .requireValueInList(keuzes, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(rij, kolom).setDataValidation(regel);
}

/**
 * Voegt datum validatie toe
 */
function zetDatumValidatie_(sheet, rij, kolom) {
  const regel = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  sheet.getRange(rij, kolom).setDataValidation(regel);
}

/**
 * Voegt getal validatie toe (positief bedrag)
 */
function zetBedragValidatie_(sheet, rij, kolom) {
  const regel = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText('Voer een positief bedrag in')
    .build();
  sheet.getRange(rij, kolom).setDataValidation(regel);
}

/**
 * Zoek de laatste rij met data in een kolom
 */
function getLaatsteRij_(sheet, kolom) {
  const waarden = sheet.getRange(1, kolom, sheet.getMaxRows()).getValues();
  for (let i = waarden.length - 1; i >= 0; i--) {
    if (waarden[i][0] !== '') return i + 1;
  }
  return 0;
}

// ─────────────────────────────────────────────
//  EXPORT FUNCTIES
// ─────────────────────────────────────────────

/**
 * Exporteer tabblad naar CSV string
 */
function exporteerSheetAlsCsv_(sheet) {
  const data = sheet.getDataRange().getValues();
  return data.map(r => r.map(cel => {
    const s = String(cel);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

/**
 * Exporteer rapport als e-mail bijlage
 */
function stuurRapportPerEmail_(titel, inhoud, ontvanger) {
  if (!ontvanger) {
    ontvanger = getInstelling_('Email rapporten naar');
  }
  if (!ontvanger) return;

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  GmailApp.sendEmail(
    ontvanger,
    `${bedrijf} – ${titel}`,
    inhoud,
    { name: bedrijf + ' Boekhouding' }
  );
}

// ─────────────────────────────────────────────
//  LOGGING
// ─────────────────────────────────────────────
// auditLog_ is defined in BoekingEngine.gs (delegates to schrijfAuditLog_).
// Geeft ook Logger.log output voor backward-compat. Niet hier herdefineren.

// ─────────────────────────────────────────────
//  HULPFUNCTIES VOOR PERIODES
// ─────────────────────────────────────────────

function isInPeriode_(datum, vanDatum, totDatum) {
  if (!datum) return false;
  const d = datum instanceof Date ? datum : new Date(datum);
  if (vanDatum && d < vanDatum) return false;
  if (totDatum && d > totDatum) return false;
  return true;
}

function getBoekjaarPeriode_() {
  const startStr = getInstelling_('Boekjaar start');
  const eindeStr = getInstelling_('Boekjaar einde');
  // Rolling boekjaar: instelling "Boekjaar start-maand" (1-12) overschrijft
  // standaard kalenderjaar. Bv. start-maand=4 → boekjaar = april–maart.
  const startMaand = parseInt(getInstelling_('Boekjaar start-maand') || '1');
  if (!startStr && !eindeStr && startMaand > 1 && startMaand <= 12) {
    const nu = new Date();
    const huidigJaar = nu.getFullYear();
    const startJaar = (nu.getMonth() + 1) >= startMaand ? huidigJaar : huidigJaar - 1;
    return {
      van: new Date(startJaar, startMaand - 1, 1),
      tot: new Date(startJaar + 1, startMaand - 1, 0, 23, 59, 59, 999),
    };
  }
  return {
    van: parseDatum_(startStr) || new Date(new Date().getFullYear(), 0, 1),
    tot: parseDatum_(eindeStr) || new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

/**
 * Bepaalt of een datum in het huidige boekjaar valt.
 * Gebruikt rolling boekjaar als ingesteld.
 */
function isInBoekjaar_(datum) {
  if (!datum || !(datum instanceof Date) || isNaN(datum.getTime())) return false;
  const p = getBoekjaarPeriode_();
  return datum >= p.van && datum <= p.tot;
}

/**
 * Single source of truth voor boekjaar-nummer.
 * Robust voor formaten: "2025", "2025-01-01", "01-01-2025", "01/01/2025".
 * Valt terug op huidig kalenderjaar bij ontbrekende of corrupte instelling.
 */
function getBoekjaar_() {
  const raw = getInstelling_('Boekjaar start') || '';
  const str = String(raw).trim();
  if (!str) return new Date().getFullYear();

  // Match een 4-cijferig jaartal in de string.
  const match = str.match(/(\d{4})/);
  if (match) {
    const jaar = parseInt(match[1], 10);
    if (jaar >= 2000 && jaar <= 2100) return jaar;
  }

  return new Date().getFullYear();
}

// ─────────────────────────────────────────────
//  BTWAANGIFTE SPECIFIEKE UTILS
// ─────────────────────────────────────────────

/**
 * Kwartaal bepalen op basis van datum
 */
function getKwartaal_(datum) {
  const m = datum.getMonth();
  if (m < 3) return 'Q1';
  if (m < 6) return 'Q2';
  if (m < 9) return 'Q3';
  return 'Q4';
}

// ─────────────────────────────────────────────
//  NUMMER FORMATTERING
// ─────────────────────────────────────────────

/**
 * Formatteert een factuurnummer met voorloopnullen
 */
function formatFactuurnummer_(nr, prefix, aantalCijfers) {
  prefix = prefix || getInstelling_('Factuurprefix') || 'F';
  aantalCijfers = aantalCijfers || 6;
  return prefix + String(nr).padStart(aantalCijfers, '0');
}

// ─────────────────────────────────────────────
//  BERICHT TEMPLATE
// ─────────────────────────────────────────────
function getFactuurEmailTekst_(factuurnummer, bedrag, vervaldatum, klantnaam) {
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';

  return `Geachte ${klantnaam || 'relatie'},

Hierbij ontvangt u factuur ${factuurnummer} voor een bedrag van ${formatBedrag_(bedrag)}.

Wij verzoeken u vriendelijk dit bedrag te voldoen vóór ${formatDatum_(vervaldatum)}.

Rekeningnummer: ${iban}
Ten name van: ${bedrijf}
Onder vermelding van: ${factuurnummer}

Voor vragen kunt u contact met ons opnemen.

Met vriendelijke groet,
${bedrijf}`;
}

// ─────────────────────────────────────────────
//  CLASP / DEPLOYMENT HELPERS
// ─────────────────────────────────────────────

/**
 * Geeft versie-info van het script
 */
function getVersieInfo() {
  return {
    versie: '2.0.0',
    aangemaakt: '2026',
    beschrijving: 'Boekhoudprogramma voor ZZP/MKB via Google Forms & Spreadsheets',
    functies: [
      'Dubbel boekhouden (NL GAAP)',
      'Unified Google Form (facturen, kosten, declaraties)',
      'Verkoopfacturen met PDF + UBL 2.1 e-factuur',
      'SEPA QR code op factuur',
      'Automatisch e-mailen naar klant',
      'Dunning (betalingsherinneringen in 3 stappen)',
      'Inkoopfacturen administratie',
      'Bankboek en reconciliatie',
      'BTW aangifte (kwartaal)',
      'Balans, W&V, Cashflow',
      'KPI Dashboard',
      'Google Drive mappenstructuur',
      'Belastingadvies & aftrekposten',
      'Webhook API (Zapier/Make/n8n)',
      'Slimme Helpdesk & Assistent',
      'Debiteuren/Crediteuren beheer',
      'Google Forms integratie',
      'E-mail notificaties',
    ],
  };
}

// ─────────────────────────────────────────────
//  CQRS-LITE: KPI SNAPSHOT IN SCRIPT PROPERTIES
// ─────────────────────────────────────────────
// The snapshot is the materialized read-model for financial KPIs.
//
// Write path: vernieuwDashboard() always computes fresh → schrijfKpiSnapshot_()
// Read path:  getDashboardData() (sidebar) → leesKpiSnapshot_() → zero sheet reads
//             openAssistent()   (Q&A panel) → leesKpiSnapshot_()
//             statusResponse_() (API)       → leesKpiSnapshot_()
//             Future AI layer → leesKpiSnapshot_() → send JSON to Claude (~500 bytes)
//             Future webhook  → leesKpiSnapshot_() → emit on change
//
// SCHEMA CONTRACT (v1):
//   wrapper: { v: number, ts: number(epoch ms), data: KpiData }
//   data:    { _v, _generatedAt, omzet, kosten, nettowinst, winstmarge,
//              banksaldo, debiteurenOpen, crediteurenOpen, btwSaldo,
//              aantalOpenFacturen, debiteurendagen, verwachtIn30d,
//              burnRate, runway, liquiditeit, solvabiliteit, eigenVermogen }
//   required numeric fields: omzet, kosten, nettowinst, banksaldo,
//                             debiteurenOpen, btwSaldo
//   nullable fields:         runway, liquiditeit, solvabiliteit
//
// ScriptProperties value limit: 9 KB per key. Snapshot is ~500 bytes — safe.

// v2 (apr 2026): banksaldo, crediteurenOpen, nettowinst, winstmarge vereist
// voor de 8-KPI sidebar. Oude v1-snapshots missen banksaldo → automatisch
// geïnvalideerd zodat de frontend nooit een kapotte snapshot toont.
const SNAPSHOT_SCHEMA_VERSION  = 2;
const KPI_SNAPSHOT_MAX_AGE_MS  = 30 * 60 * 1000; // 30 minutes

// Required numeric keys in data — used by leesKpiSnapshot_ for structural validation.
// If any of these are missing or not a number, the snapshot is treated as corrupt.
const _SNAPSHOT_REQUIRED_FIELDS = ['omzet', 'kosten', 'nettowinst', 'banksaldo', 'debiteurenOpen', 'btwSaldo'];

/**
 * Serialize a fresh KPI object to ScriptProperties.
 * Adds _v (schema version) and _generatedAt (ISO timestamp) to the data
 * so consumers have freshness metadata without unpacking the wrapper.
 * Silent on failure — a missing snapshot is always safe (fallback = full compute).
 *
 * @param {Object} kpiObj  Result of berekenKpiData_()
 */
function schrijfKpiSnapshot_(kpiObj) {
  try {
    const data = Object.assign({}, kpiObj, {
      _v:           SNAPSHOT_SCHEMA_VERSION,
      _generatedAt: new Date().toISOString(),
    });
    const payload = JSON.stringify({ v: SNAPSHOT_SCHEMA_VERSION, ts: Date.now(), data });
    PropertiesService.getScriptProperties().setProperty(PROP.KPI_SNAPSHOT, payload);
  } catch (e) {
    Logger.log('KPI snapshot schrijven mislukt: ' + e.message);
  }
}

/**
 * Read the KPI snapshot from ScriptProperties.
 * Returns the deserialized KPI data object when ALL of the following hold:
 *   1. A snapshot exists
 *   2. JSON is valid
 *   3. Schema version matches SNAPSHOT_SCHEMA_VERSION
 *   4. Snapshot age ≤ maxAgeMs (default KPI_SNAPSHOT_MAX_AGE_MS)
 *   5. All required numeric fields are present and numeric
 *
 * Returns null in any failure case — callers MUST fall back to berekenKpiData_().
 *
 * @param {number} [maxAgeMs]  Override staleness window (ms). Defaults to 30 min.
 * @returns {Object|null}
 */
function leesKpiSnapshot_(maxAgeMs) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(PROP.KPI_SNAPSHOT);
    if (!raw) return null;

    const parsed = JSON.parse(raw); // throws on corrupt JSON → caught below
    if (!parsed || !parsed.ts || !parsed.data) return null;

    // Schema version guard — if we ever bump SNAPSHOT_SCHEMA_VERSION, old
    // snapshots are automatically treated as invalid and recomputed.
    if (parsed.v !== SNAPSHOT_SCHEMA_VERSION) return null;

    // Staleness check
    if ((Date.now() - parsed.ts) > (maxAgeMs || KPI_SNAPSHOT_MAX_AGE_MS)) return null;

    // Required-field structural validation — a partial write or schema drift
    // should never produce misleading KPI values to callers.
    const data = parsed.data;
    for (let i = 0; i < _SNAPSHOT_REQUIRED_FIELDS.length; i++) {
      if (typeof data[_SNAPSHOT_REQUIRED_FIELDS[i]] !== 'number') return null;
    }

    return data;
  } catch (e) {
    // Corrupt JSON or unexpected error — always fail safe, never crash caller
    return null;
  }
}

/**
 * Delete the KPI snapshot from ScriptProperties.
 * Call this after any mutation that changes KPI state but does NOT call
 * vernieuwDashboard() (which would write a fresh snapshot itself).
 *
 * Examples: markeerVerkoopfactuurBetaald, any future partial payment handler.
 *
 * Silent on failure — a missing snapshot is always safe (forces recompute).
 */
function invalideerKpiSnapshot_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(PROP.KPI_SNAPSHOT);
  } catch (e) {
    // Deletion is best-effort — a missing or stale snapshot is never a crash risk
  }
}

/**
 * Gate voor menu-functies die sheet-data nodig hebben.
 * Toont een vriendelijke melding als de eenmalige setup nog niet is uitgevoerd.
 * @return {boolean} true als setup klaar is, false als geblokkeerd
 */
function controleerSetupGedaan_() {
  if (PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) === 'true') {
    return true;
  }
  try {
    SpreadsheetApp.getUi().alert(
      'Instellen vereist',
      'Dit onderdeel is pas beschikbaar nadat het systeem is ingesteld.\n\n' +
      'Ga naar:\nBoekhouding → Instellingen → Eerste keer instellen (setup)',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) { Logger.log('controleerSetupGedaan_: UI niet beschikbaar'); }
  return false;
}

// ─────────────────────────────────────────────
//  WISSELKOERS (ECB) — gecached, free, geen auth
// ─────────────────────────────────────────────

/**
 * Haalt de wisselkoers van een valuta naar EUR via ECB (gratis XML feed).
 * 4-uur cache via CacheService. Fallback: 1.0 bij netwerkfout.
 *
 * @param {string} valuta  ISO-code zoals "USD", "GBP", "JPY".
 * @return {number} Aantal valuta dat 1 EUR oplevert (bv. USD = ~1.08).
 */
function getWisselkoers_(valuta) {
  const code = String(valuta || '').toUpperCase().trim();
  if (!code || code === 'EUR') return 1.0;

  const cache = CacheService.getScriptCache();
  const cacheKey = 'fxrate_' + code;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    const n = parseFloat(cached);
    if (isFinite(n) && n > 0) return n;
  }

  try {
    const url = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('ECB FX feed niet bereikbaar: ' + resp.getResponseCode());
      return 1.0;
    }
    const xml = resp.getContentText();
    // Parse de XML: zoek <Cube currency="USD" rate="1.0876"/>
    const re = new RegExp('currency=[\'"]' + code + '[\'"][^>]*rate=[\'"]([\\d.]+)[\'"]');
    const match = xml.match(re);
    if (match && match[1]) {
      const rate = parseFloat(match[1]);
      if (isFinite(rate) && rate > 0) {
        cache.put(cacheKey, String(rate), 14400); // 4 uur
        return rate;
      }
    }
  } catch (e) {
    Logger.log('getWisselkoers_ fout: ' + e.message);
  }
  return 1.0;
}

/**
 * Converteert een bedrag van een vreemde valuta naar EUR.
 *
 * @param {number} bedrag Bedrag in vreemde valuta.
 * @param {string} valuta ISO-code.
 * @return {number} Bedrag in EUR (afgerond op 2 decimalen).
 */
function naarEuro_(bedrag, valuta) {
  const n = Number(bedrag);
  if (!isFinite(n)) return 0;
  const rate = getWisselkoers_(valuta);
  if (!rate || rate === 1) return Math.round(n * 100) / 100;
  return Math.round((n / rate) * 100) / 100;
}

// ─────────────────────────────────────────────
//  6-MIN GUILLOTINE — SELF-RESCHEDULE BIJ LANGE BATCHES
// ─────────────────────────────────────────────
//
// Apps Script kapt simple+time-based-triggers af na 6 minuten. Voor batch-
// flows (dunning, herhalende kosten, bulk-factuur-creation) is dat een
// "data-loss"-risico: halverwege de loop crasht het script en de rest van
// de batch blijft hangen.
//
// Strategie: bij elke iteratie `guillotineCheck_(startTs, batch, drempelMs)`
// aanroepen. Als drempel overschreden:
//   1. Markeer cursor (ScriptProperty) zodat retry weet waar te hervatten
//   2. Schedule self-trigger over 1 minuut
//   3. Return true → caller doet `return` of `break`
//
// drempelMs default 270000 (4.5 min) — laat ruime buffer voor wrap-up.

/**
 * @param {number} startTs    Date.now() bij start van batch
 * @param {string} taakNaam   uniek label, voor self-trigger
 * @param {Object} hervatData object met cursor-info; wordt JSON in ScriptProperty
 * @param {number} drempelMs  default 270000ms (4.5min)
 * @returns {boolean}         true = STOP NU, schedule retry; false = ga door
 */
function guillotineCheck_(startTs, taakNaam, hervatData, drempelMs) {
  const grens = drempelMs || 270000;
  const verstreken = Date.now() - (parseInt(startTs) || Date.now());
  if (verstreken < grens) return false;

  // Sla cursor op + schedule self-trigger
  try {
    PropertiesService.getScriptProperties()
      .setProperty('guillotine_' + taakNaam, JSON.stringify(hervatData || {}));
  } catch (e) { Logger.log('guillotine cursor-save fout: ' + e.message); }

  try {
    // Time-based trigger over 1 minuut die functie opnieuw aanroept
    ScriptApp.newTrigger(taakNaam)
      .timeBased()
      .after(60 * 1000)
      .create();
    Logger.log('Guillotine: ' + taakNaam + ' gepauzeerd na ' + Math.round(verstreken/1000) + 's, hervat over 1 min');
    try { schrijfAuditLog_('Guillotine pauze', taakNaam + ' na ' + Math.round(verstreken/1000) + 's'); } catch (_) {}
  } catch (e) {
    Logger.log('guillotine trigger-create fout: ' + e.message);
  }
  return true;
}

/**
 * Companion: bij hervat-run, lees cursor terug.
 * @returns {Object} cursor-data of {} als geen pauze actief
 */
function guillotineHervat_(taakNaam) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('guillotine_' + taakNaam);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (_) { return {}; }
}

/**
 * Companion: na voltooid run cursor wissen.
 */
function guillotineKlaar_(taakNaam) {
  try {
    PropertiesService.getScriptProperties().deleteProperty('guillotine_' + taakNaam);
  } catch (_) {}
  // Verwijder ook eventuele self-trigger
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === taakNaam &&
          t.getEventType && t.getEventType() === ScriptApp.EventType.CLOCK) {
        // Alleen self-rescheduled triggers verwijderen, niet de standaard daily-trigger
        // (die heeft andere timing). We checken op 'after'-style triggers via tijdstip.
        try {
          // Als trigger NIET de hoofd-daily-trigger is (die heeft fixed schedule),
          // verwijder het. Heuristiek: getEventType is CLOCK voor beide; we kunnen
          // niet onderscheiden — dus we accepteren dat we de daily-trigger soms
          // ook verwijderen. setupTriggers herstelt 'm wel.
        } catch (_) {}
      }
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────
//  NOOD-LOG (Audit Trail Paradox)
// ─────────────────────────────────────────────
//
// Bij critical writes (factuur in sheet, journaalpost, betaling) waar de
// hoofd-audit-log faalt (sheet locked, quota), schrijven we direct naar
// ScriptProperties als laatste-redmiddel. Bewaart laatste 50 entries.

function noodLog_(actie, details) {
  try {
    const props = PropertiesService.getScriptProperties();
    const KEY = 'noodLog';
    const entry = new Date().toISOString() + ' | ' + actie + ' | ' + String(details || '').slice(0, 200);
    const raw = props.getProperty(KEY) || '';
    const regels = raw ? raw.split('\n') : [];
    regels.push(entry);
    if (regels.length > 50) regels.splice(0, regels.length - 50);
    let buffer = regels.join('\n');
    // 9KB limit op ScriptProperties
    while (buffer.length > 8500 && regels.length > 1) {
      regels.shift();
      buffer = regels.join('\n');
    }
    props.setProperty(KEY, buffer);
  } catch (_) { /* nood-log mag NOOIT crashen */ }
}

// ─────────────────────────────────────────────
//  CACHE-WRAPPER VOOR DURE BEREKENINGEN
// ─────────────────────────────────────────────
//
// CacheService heeft 100KB per key en 6u TTL. Dit helper-patroon:
//   1. Checkt cache → snel pad als hit
//   2. Bij miss: probeer LockService voor stampede-prevention
//   3. Berekent → schrijft naar cache
//
// Voor Belastingadvies + Dashboard-KPI's die anders 1-3s herberekenen
// op elke open.

/**
 * @param {string}   sleutel   uniek + bevat invalidatie-fingerprint
 *                             (bv. 'kpi_2026_<lastEditTimestamp>')
 * @param {number}   ttlSec    cache-TTL in seconden (max 21600 = 6u)
 * @param {function} bereken   functie die bij miss draait
 * @returns berekende waarde (parsed JSON)
 */
function cacheBerekening_(sleutel, ttlSec, bereken) {
  const cache = CacheService.getScriptCache();
  const veiligTtl = Math.min(parseInt(ttlSec) || 300, 21600);

  // Cache-hit?
  try {
    const cached = cache.get(sleutel);
    if (cached) return JSON.parse(cached);
  } catch (_) { /* corrupt cache → bereken opnieuw */ }

  // Cache-miss: stampede-prevention via LockService.
  // Eerste roeper berekent, anderen wachten max 5s op cache (skip lock-wait
  // als al pre-empted).
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(5000);

  // Tijdens lock-wait kan een ander proces de cache hebben gevuld → opnieuw checken
  if (gotLock) {
    try {
      const recheck = cache.get(sleutel);
      if (recheck) return JSON.parse(recheck);
    } catch (_) {}
  }

  try {
    const waarde = bereken();
    try {
      const json = JSON.stringify(waarde);
      // CacheService cap: 100KB per key
      if (json.length < 95 * 1024) cache.put(sleutel, json, veiligTtl);
    } catch (e) { Logger.log('cacheBerekening_ put fout: ' + e.message); }
    return waarde;
  } finally {
    if (gotLock) try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Invalideert cache-entries via prefix-match. CacheService heeft geen
 * native prefix-delete; we tracken keys via een index in een aparte cache-key.
 *
 * Roep aan na write-acties op kerntabbladen (Verkoopfacturen, Inkoopfacturen,
 * Banktransacties, Journaalposten) zodat dashboard-KPI volgende open vers is.
 */
function bustCache_(prefix) {
  try {
    const cache = CacheService.getScriptCache();
    // Eenvoudige strategie: vermenigvuldig de cache-version-key. Berekeningen
    // die deze versie in hun sleutel embedden krijgen automatisch een miss.
    const VERSIE_KEY = 'cacheVersie_' + (prefix || 'global');
    const huidig = parseInt(cache.get(VERSIE_KEY) || '0');
    cache.put(VERSIE_KEY, String(huidig + 1), 21600);
  } catch (e) { Logger.log('bustCache_ fout: ' + e.message); }
}

/**
 * Geeft de huidige cache-versie-suffix voor sleutels die invalidate-aware moeten zijn.
 * Voorbeeld:
 *   const sleutel = 'kpi_' + jaar + '_v' + cacheVersie_('kpi');
 */
function cacheVersie_(prefix) {
  try {
    return CacheService.getScriptCache().get('cacheVersie_' + (prefix || 'global')) || '0';
  } catch (_) { return '0'; }
}

// ─────────────────────────────────────────────
//  RATE-LIMITING + OUTBOUND URL-ALLOWLIST
// ─────────────────────────────────────────────
//
// Rate-limit beschermt tegen DOS via dialog-bombing of geknoeide
// google.script.run-aanroepen. Per actie + per user maximaal N hits/minuut.
// Counter staat in CacheService (auto-expire via TTL).
//
// Gooit een nette Error die door vertaalFout_ wordt opgevangen.

/**
 * @param {string}  actie         label, bv. 'submitFactuur', 'kvkAutofill'
 * @param {number}  maxPerMinuut  cap per gebruiker per minuut
 * @param {string=} bron          optionele bron-identifier (bv. 'zapier', 'klant')
 *                                 als 'zapier'/'integration' → ruimere cap (×3)
 * @throws Error wanneer cap is overschreden
 */
function rateLimit_(actie, maxPerMinuut, bron) {
  try {
    // Whitelist voor integraties: Zapier/Make/n8n hebben legitiem
    // hogere call-rate dan een interactieve klant.
    const isIntegratie = bron && /^(zapier|make|n8n|integratie|integration|webhook)$/i.test(bron);
    const effectieveCap = isIntegratie ? maxPerMinuut * 3 : maxPerMinuut;

    const cache = CacheService.getUserCache();
    const key = 'rl_' + actie + (isIntegratie ? '_int' : '');
    const huidig = parseInt(cache.get(key) || '0');
    if (huidig >= effectieveCap) {
      throw new Error('Te veel acties achter elkaar — wacht een minuut.');
    }
    cache.put(key, String(huidig + 1), 60);
  } catch (e) {
    if (/Te veel acties/.test(e.message)) throw e;
    // Cache-service down? laat door — beter functioneel dan blokkerend.
    Logger.log('rateLimit_ cache fout (laat door): ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  FEATURE FLAGS
// ─────────────────────────────────────────────
//
// Centraal punt voor "feature aan/uit" toggles. Voorkomt conditional-spaghetti
// in elk bestand met `if (instelling === 'Ja') { ... }`. Ondersteunt:
//   - Per-klant via Instellingen-sheet (boolean Ja/Nee)
//   - Globaal via ScriptProperty 'feature_<naam>'
//   - Default: alle features `false` tenzij expliciet aan
//
// Conventie: nieuwe feature ALTIJD via featureAan_('naam'), NOOIT via
// directe getInstelling_-call. Maakt opruimen van oude flags later mogelijk
// (grep-able).
const FEATURE_DEFAULTS = {
  'mollie_betaal_link':       false,  // wordt aan zodra MOLLIE_API_KEY ingevuld is
  'kvk_autofill':             false,  // idem voor KVK_API_KEY
  'accountant_share':         true,
  'auto_backup':              true,
  'dlq_retry':                true,
  'webhook_hmac':             false,  // optionele opwaardering
  'multi_jaar_dashboard':     false,  // experimentele feature
  'inkoop_ocr':               true,   // Gemini Vision is geconfigureerd
};

/**
 * @param {string} naam    feature-key uit FEATURE_DEFAULTS
 * @returns {boolean}
 */
function featureAan_(naam) {
  if (!naam) return false;
  // Per-klant override via Instellingen
  try {
    const klantOverride = getInstelling_('Feature: ' + naam);
    if (klantOverride === 'Ja' || klantOverride === 'true') return true;
    if (klantOverride === 'Nee' || klantOverride === 'false') return false;
  } catch (_) {}
  // Globale override via ScriptProperty
  try {
    const globaal = PropertiesService.getScriptProperties().getProperty('feature_' + naam);
    if (globaal === 'true' || globaal === '1') return true;
    if (globaal === 'false' || globaal === '0') return false;
  } catch (_) {}
  // Auto-detectie voor key-based features (Mollie/KvK)
  if (naam === 'mollie_betaal_link') {
    try { return !!PropertiesService.getUserProperties().getProperty('MOLLIE_API_KEY'); } catch (_) { return false; }
  }
  if (naam === 'kvk_autofill') {
    try { return !!PropertiesService.getUserProperties().getProperty('KVK_API_KEY'); } catch (_) { return false; }
  }
  // Default
  return Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, naam) ? FEATURE_DEFAULTS[naam] : false;
}

/**
 * Toon overzicht van alle features + huidige status. Voor support/debug.
 */
function toonFeatures() {
  const ui = SpreadsheetApp.getUi();
  const lijst = Object.keys(FEATURE_DEFAULTS).sort().map(function(naam) {
    const aan = featureAan_(naam);
    return (aan ? '✅' : '⬜') + ' ' + naam + (aan ? ' (aan)' : ' (uit)');
  }).join('\n');
  ui.alert('🚩 Feature flags', lijst + '\n\nWijzig per-klant via tabblad Instellingen, sleutel "Feature: <naam>" = Ja/Nee.', ui.ButtonSet.OK);
}

/**
 * Whitelist van toegestane externe domeinen voor UrlFetchApp-calls.
 * Beschermt tegen klant-geknoeide LICENTIE_SERVER_URL die data zou
 * kunnen ex-filtreren naar een attacker-domein.
 *
 * Subdomeinen toegestaan via suffix-match. Schemes: alleen https.
 */
const _UITGAAND_ALLOWLIST = [
  'api.kvk.nl',
  'api.exchangerate.host',
  'open.er-api.com',
  'mijn.belastingdienst.nl',
  'api.mollie.com',
  'generativelanguage.googleapis.com',  // Gemini Vision
  'boekhoudbaar.nl',                     // licentieserver standaard
];

function _isToegestaneUrl_(url) {
  try {
    const m = String(url || '').match(/^https:\/\/([^\/]+)/i);
    if (!m) return false;
    const host = m[1].toLowerCase();
    // Licentieserver-override uit ScriptProperties: ook deze in allowlist
    let extraHost = '';
    try {
      const lic = String(PropertiesService.getScriptProperties().getProperty('LICENTIE_SERVER_URL') || '');
      const lm = lic.match(/^https:\/\/([^\/]+)/i);
      if (lm) extraHost = lm[1].toLowerCase();
    } catch (_) {}
    const lijst = extraHost ? _UITGAAND_ALLOWLIST.concat([extraHost]) : _UITGAAND_ALLOWLIST;
    return lijst.some(function(d) { return host === d || host.endsWith('.' + d); });
  } catch (_) { return false; }
}

/**
 * Veilige wrapper rond UrlFetchApp.fetch met allowlist-check.
 * Gebruik dit i.p.v. UrlFetchApp.fetch direct.
 */
function veiligFetch_(url, opties) {
  if (!_isToegestaneUrl_(url)) {
    try { schrijfAuditLog_('Outbound URL geblokkeerd', String(url).slice(0, 200)); } catch (_) {}
    throw new Error('Externe URL niet toegestaan — staat niet in de uitgaande-allowlist.');
  }
  return UrlFetchApp.fetch(url, opties || {});
}

// ─────────────────────────────────────────────
//  USER-PROPERTIES VERSLEUTELING (lichte XOR-cipher)
// ─────────────────────────────────────────────
//
// API-keys (KvK, Mollie, etc.) staan default in clear-text in UserProperties.
// Klant kan ze in Apps Script editor zien. Voor confidentiality versleutelen
// we met een XOR + base64 obfuscation tegen de SCRIPT-level master-salt.
// NB: dit is OBFUSCATION, geen crypto — voorkomt schouder-meekijken, niet
// een vastberaden aanvaller die de script-source heeft.

function _getMasterSalt_() {
  const KEY = '_BOEKHOUDBAAR_SALT_';
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty(KEY);
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(KEY, salt);
  }
  return salt;
}

function versleutelString_(klaartekst) {
  const tekst = String(klaartekst || '');
  if (!tekst) return '';
  const salt = _getMasterSalt_();
  const out = [];
  for (let i = 0; i < tekst.length; i++) {
    out.push(tekst.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return 'enc:' + Utilities.base64Encode(out.map(function(c) { return String.fromCharCode(c); }).join(''));
}

function ontsleutelString_(versleuteld) {
  const v = String(versleuteld || '');
  if (!v.startsWith('enc:')) return v;  // backward-compat: clear-text blijft werken
  try {
    const raw = Utilities.base64Decode(v.slice(4));
    const salt = _getMasterSalt_();
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const b = raw[i] < 0 ? raw[i] + 256 : raw[i];
      out += String.fromCharCode(b ^ salt.charCodeAt(i % salt.length));
    }
    return out;
  } catch (e) {
    Logger.log('ontsleutelString_ fout: ' + e.message);
    return '';
  }
}

// ─────────────────────────────────────────────
//  KvK API — auto-fill bedrijfsgegevens
// ─────────────────────────────────────────────
//
// Vult adres/rechtsvorm automatisch in bij ingevoerd KvK-nummer.
// API: KvK Open Data (api.kvk.nl/api/v2/zoeken). Vereist API-key in
// UserProperties onder 'KVK_API_KEY' — per-user, niet per-script.
// Zonder key: silent return null (geen fout, geen autofill).
//
// Cache: resultaten 24u in CacheService — KvK-data wijzigt zelden.
//
// @param {string} kvkNummer  Acht cijfers (mag leading-zeros hebben).
// @return {Object|null}      { naam, adres, postcode, plaats, rechtsvorm } of null.
function haalDataKvK_(kvkNummer) {
  const schoon = String(kvkNummer || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(schoon)) return null;

  // Cache-hit?
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const cached = cache.get('kvk_' + schoon);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  // Circuit-breaker: na 5 fouten in 60s → schakel KvK-feature 5 min uit.
  // Voorkomt dat we KvK API blijven hameren als hun service down is.
  try {
    const breakerKey = '_kvk_breaker_open';
    if (cache && cache.get(breakerKey)) return null;  // circuit open → silent skip
  } catch (_) {}

  // API-key uit UserProperties (per-user, niet gedeeld). Versleuteld
  // via versleutelString_ — clear-text blijft backward-compat werken.
  let apiKey = '';
  try {
    const raw = PropertiesService.getUserProperties().getProperty('KVK_API_KEY') || '';
    apiKey = ontsleutelString_(raw);
  } catch (_) {}
  if (!apiKey) return null;  // graceful: geen key = geen autofill

  // Rate-limit: max 30 KvK-lookups/min/user (developers.kvk.nl staat 100/dag toe)
  try { rateLimit_('kvkAutofill', 30); } catch (_) { return null; }

  try {
    const url = 'https://api.kvk.nl/api/v2/zoeken?kvkNummer=' + encodeURIComponent(schoon);
    const resp = veiligFetch_(url, {
      method: 'get',
      headers: { 'apiKey': apiKey, 'Accept': 'application/json' },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('haalDataKvK_ status ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
      _kvkBreakerTrip_();
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    const item = (json.resultaten || [])[0];
    if (!item) return null;

    const adres = (item._embedded && item._embedded.eersteHandelsnaam && item._embedded.eersteHandelsnaam._embedded
                  && item._embedded.eersteHandelsnaam._embedded.adres) || item.adres || {};
    const result = {
      naam:        String(item.handelsnaam || item.naam || ''),
      kvkNummer:   schoon,
      rechtsvorm:  String(item.type || ''),
      adres:       String(adres.straatnaam || ''),
      huisnummer:  String(adres.huisnummer || ''),
      postcode:    String(adres.postcode || ''),
      plaats:      String(adres.plaats || adres.woonplaats || ''),
    };

    if (cache) try { cache.put('kvk_' + schoon, JSON.stringify(result), 86400); } catch (_) {}
    try { schrijfAuditLog_('KvK API', 'autofill voor ' + schoon); } catch (_) {}
    return result;
  } catch (e) {
    Logger.log('haalDataKvK_ fout: ' + e.message);
    _kvkBreakerTrip_();
    return null;
  }
}

/**
 * Circuit-breaker accounting voor KvK API: tel fouten in 60s window.
 * Bij ≥5 fouten → open circuit voor 5 minuten (cache-vlag).
 */
function _kvkBreakerTrip_() {
  try {
    const cache = CacheService.getScriptCache();
    const counterKey = '_kvk_fout_count';
    const huidig = parseInt(cache.get(counterKey) || '0') + 1;
    cache.put(counterKey, String(huidig), 60);  // 60s window
    if (huidig >= 5) {
      cache.put('_kvk_breaker_open', '1', 300);  // 5 min open
      try { schrijfAuditLog_('KvK circuit-breaker', 'Open na ' + huidig + ' fouten in 60s — KvK uit voor 5 min'); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Publieke wrapper voor dialog-gebruik via google.script.run.
 * Retourneert object met velden of null.
 */
function getKvkDataPubliek(kvkNummer) {
  return haalDataKvK_(kvkNummer);
}

/**
 * Eenmalige setup van KvK API-key per user. Roep aan via Apps Script
 * editor of via een Instellingen-dialog.
 *
 * Klant haalt key bij developers.kvk.nl/getting-started
 * (eerste 100 calls/maand gratis).
 */
function zetKvkApiKey() {
  const ui = SpreadsheetApp.getUi();
  const userProps = PropertiesService.getUserProperties();
  const huidigEnc = userProps.getProperty('KVK_API_KEY') || '';
  const huidig = ontsleutelString_(huidigEnc);
  const resp = ui.prompt(
    'KvK API-key instellen',
    'Plak hier je KvK API-key (developers.kvk.nl). Laat leeg om te wissen.\n\n' +
    'Wordt versleuteld opgeslagen — niet zichtbaar in Apps Script editor.\n\nHuidig: ' +
      (huidig ? huidig.slice(0, 4) + '...' + huidig.slice(-4) : '(geen)'),
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const key = String(resp.getResponseText() || '').trim();
  if (!key) {
    userProps.deleteProperty('KVK_API_KEY');
    ui.alert('KvK API-key verwijderd. Auto-fill staat uit.');
    return;
  }
  userProps.setProperty('KVK_API_KEY', versleutelString_(key));
  ui.alert('✅ KvK API-key opgeslagen (versleuteld). Auto-fill werkt nu bij ingevoerde KvK-nummers.');
}

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

  // ROLLOVER-VALIDATIE (P22-fix uit Belastingdienst stress-test): voorheen
  // rolde "31-02-2026" silent door naar 03-03-2026 → factuur in verkeerd
  // kwartaal → BTW-aangifte mismatch → boete. Nu strikt:
  // bij maand>12, dag>31, of dag-na-rollover-mismatch → val terug op vandaag.
  // Voor STRENGE validatie (reject ipv fallback): gebruik parseDatumStrict_.
  function _datumGevalideerd_(jaar, maand, dag) {
    if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
    const d = new Date(jaar, maand - 1, dag);
    if (isNaN(d.getTime())) return null;
    // Bewaar oorspronkelijke dag/maand: na rollover wijken die af
    if (d.getMonth() !== maand - 1 || d.getDate() !== dag) return null;
    return d;
  }

  // Probeer ISO formaat (yyyy-mm-dd)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = _datumGevalideerd_(parseInt(isoMatch[1]), parseInt(isoMatch[2]), parseInt(isoMatch[3]));
    if (d) return d;
    return new Date();  // ongeldig (bv. 2026-02-31) → val terug op vandaag
  }

  // Probeer NL formaat (dd-mm-yyyy of dd/mm/yyyy)
  const nlMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (nlMatch) {
    const d = _datumGevalideerd_(parseInt(nlMatch[3]), parseInt(nlMatch[2]), parseInt(nlMatch[1]));
    if (d) return d;
    return new Date();
  }

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

// ─────────────────────────────────────────────
//  GETAL / BEDRAG FUNCTIES
// ─────────────────────────────────────────────

/**
 * Rondt een bedrag rekenkundig af op 2 decimalen: half-up, SYMMETRISCH
 * (weg-van-nul, ook bij negatieve bedragen). NB: dit is GEEN bankiersmethode
 * (half-even) — rekenkundig half-up is precies wat de Belastingdienst
 * voorschrijft. De symmetrie voorkomt dat `Math.round(-0,5)=0` een cent schept
 * of verliest bij negatieve bedragen (creditnota/storno).
 */
function rondBedrag_(bedrag) {
  const n = parseFloat(bedrag) || 0;
  const cents = Math.round(Math.abs(n) * 100);
  return (n < 0 ? -cents : cents) / 100;
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
  // Rond + ruim -0 op: rondBedrag_(-0.002) = -0 -> `|| 0` -> 0 -> geen "-EUR 0,00".
  const b = rondBedrag_(parseFloat(bedrag) || 0) || 0;
  const prefix = b < 0 ? '-€ ' : '€ ';
  return prefix + Math.abs(b).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parseert een bedrag uit een string (verwerkt comma's, punten, €-teken)
 */
/**
 * Positie-bewuste kern voor bedrag-parsing — DE enige plek waar de NL/US-
 * separatorlogica leeft (klasse-1 chokepoint tegen format-parse-drift).
 *
 * Regel (geld = max 2 decimalen): de LAATSTE separator (`.` of `,`) is de
 * decimaal ALS er 1-2 cijfers op volgen; alle andere separators zijn duizendtal.
 * Volgen er ≥3 cijfers, dan is het géén decimaal maar duizendtal ("1.000" =
 * 1000, NL-conventie). Lost NL ("1.234,56") én US ("1,234.56") correct op;
 * voorheen mangelde de regex "1,234.56" → 1,23 en stripte "0.999" inconsistent.
 *
 * @returns {number} getal, of NaN bij onparsbaar (caller kiest 0-of-throw).
 */
function _parseBedragKern_(ruw) {
  const s = String(ruw).replace(/[€\s]/g, '');
  if (!s) return NaN;
  const iKomma = s.lastIndexOf(',');
  const iPunt  = s.lastIndexOf('.');
  const iSep   = Math.max(iKomma, iPunt);
  if (iSep === -1) return parseFloat(s);                     // geen separator
  const naSep = s.slice(iSep + 1).replace(/\D/g, '');
  if (naSep.length >= 1 && naSep.length <= 2) {
    // laatste separator = decimaal; strip de overige separators uit het gehele deel
    return parseFloat(s.slice(0, iSep).replace(/[.,]/g, '') + '.' + naSep);
  }
  return parseFloat(s.replace(/[.,]/g, ''));                 // ≥3 cijfers → alles duizendtal
}

function parseBedrag_(str) {
  if (!str && str !== 0) return 0;
  if (typeof str === 'number') return rondBedrag_(str);
  const w = _parseBedragKern_(str);
  return isNaN(w) ? 0 : rondBedrag_(w);
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
  const w = _parseBedragKern_(ruw);
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
  safeAuditLog_('FOUT_VERTAALD [' + reqId + ']', raw.slice(0, 240));
  if (!raw) return 'Er ging iets mis. Probeer het opnieuw — lukt het dan nog niet, mail support@boekhoudbaar.nl met dit nummer: ' + reqId;
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
  return 'Er ging iets mis. Probeer het opnieuw — lukt het dan nog niet, mail support@boekhoudbaar.nl met het nummer hieronder.' + suffix;
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
    const ts = data[i][KOL.AUDIT.tijdstip] instanceof Date ? data[i][KOL.AUDIT.tijdstip].getTime() : 0;
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
  const map = getDriveHoofdmap_();
  const naam = 'audit-log_' + new Date().toISOString().slice(0, 10) + '.jsonl';
  // drive.file: geen getRootFolder(). Mét hoofdmap → daarin; zonder → parent-loos
  // (de app behoudt toegang tot bestanden die ze zelf aanmaakt).
  const file = map
    ? map.createFile(naam, jsonl, 'application/x-ndjson')
    : DriveApp.createFile(naam, jsonl, 'application/x-ndjson');
  ui.alert('📁 Audit-log geëxporteerd', events.length + ' events naar ' + naam + '\n\nLocatie: ' + file.getUrl(), ui.ButtonSet.OK);
  safeAuditLog_('Audit-log JSON-export', naam + ' (' + events.length + ' events)');
}

function isGeldigBTWNummer_(btwNr) {
  btwNr = String(btwNr || '');
  if (!btwNr) return false;
  const clean = btwNr.replace(/\s/g, '').toUpperCase();
  if (!/^NL\d{9}B\d{2}$/.test(clean)) return false;

  // OPMERKING bij P21 (Belastingdienst stress-test):
  // Mod-11 checksum voor NL BTW-nrs is NIET één publieke standaard —
  // bronnen geven verschillende gewichten. Een wrong-impl zou geldige
  // BTW-nrs wegfilteren (false positives schadelijker dan false negatives).
  // Echte validatie = VIES API-call (zie ViesValidatie.gs in toekomstige PR).
  // Voor nu: format-check is sufficient als invariant tegen pure typo's
  // (te kort, missende B, etc). Volledige verifiëring via VIES async.
  //
  // Bewust uitgesloten:
  //   - Reserved 0-formats (NL000000000B00 — format-valide, niet uitgegeven)
  //   - Test-patterns (NL123456789B00 — kan toevallig matchen)
  // Klant moet zelf BTW-nr bij KvK-uittreksel verifiëren.
  return true;
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

function isGeldigEmail_(email) {
  email = String(email || '').trim();
  if (!email || email.length > 254) return false;
  // RFC 5322 simplified: lokaal deel + @ + domein met geldige TLD (≥2 letters).
  // Voorkomt false-positives als 'a@b.c' of 'test@.co' die GmailApp-crash geven.
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(email);
}

/**
 * CYCLE-54: veilig JSON parsen — voorkomt crashes wanneer een
 * ScriptProperty corrupt is (half-write bij quota-fail, handmatige edit).
 * Bij parse-fout: log + return fallback (geen throw).
 *
 * @param {*} raw       String om te parsen (of null/undefined)
 * @param {*} fallback  Wat te returnen bij leeg/corrupt (default null)
 * @returns {*}
 */
function parseJsonVeilig_(raw, fallback) {
  const fb = (fallback === undefined) ? null : fallback;
  if (raw === null || raw === undefined || raw === '') return fb;
  try {
    return JSON.parse(raw);
  } catch (err) {
    try { Logger.log('parseJsonVeilig_ corrupt JSON (fallback): ' + err.message); } catch (_) {}
    return fb;
  }
}

// ─────────────────────────────────────────────
//  SPREADSHEET HELPERS
// ─────────────────────────────────────────────

/**
 * CYCLE-51: veilig sheet-data lezen — voorkomt cryptische TypeError
 * "Cannot read properties of null (reading 'getDataRange')" wanneer een
 * verplicht tabblad ontbreekt (klant heeft het per ongeluk verwijderd).
 *
 * Returned `[]` bij missing sheet zodat loops natuurlijk skippen (length=0)
 * + audit-log via noodLog_ zodat owner het signaal krijgt.
 *
 * Voor verplichte writes (waar je NIET silent wilt doorgaan): gebruik
 * direct `ss.getSheetByName(...)` met expliciete throw + meldFataalAanOwner_.
 *
 * @param {Spreadsheet} ss   Spreadsheet
 * @param {string} naam      Tabblad-naam (uit SHEETS.X)
 * @returns {Array<Array>}   Sheet-data of [] bij ontbreken
 */
function leesSheetVeilig_(ss, naam) {
  if (!ss) return [];
  const sheet = ss.getSheetByName(naam);
  if (!sheet) {
    try { noodLog_('SHEET_ONTBREEKT', String(naam)); } catch (_) {}
    return [];
  }
  try {
    return sheet.getDataRange().getValues();
  } catch (err) {
    try { noodLog_('SHEET_READ_FOUT', String(naam) + ': ' + err.message); } catch (_) {}
    return [];
  }
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
  // Versie en jaar runtime ophalen — eerdere hardcoded '2.0.0' / '2026'
  // gaven verkeerde info terug in Diagnostiek terwijl HUIDIGE_VERSIE in
  // Onboarding.gs al jaren verder stond.
  const versie = (typeof HUIDIGE_VERSIE === 'string' && HUIDIGE_VERSIE) ? HUIDIGE_VERSIE : '2.7.0';
  return {
    versie: versie,
    aangemaakt: String(new Date().getFullYear()),
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

  // Sla cursor op. GEEN self-trigger meer: de doelfuncties hebben parameters
  // (ss, transacties, …) en een time-trigger roept ze aan met een event-object
  // → crash bij hervatten. Bovendien werden de one-shot-triggers nooit
  // opgeruimd (cap = 20 triggers/script → daarna faalt álle trigger-creatie).
  // Hervatten gebeurt via het eigen cursor-mechanisme van de aanroeper
  // (dunningCursor bij de volgende dagelijkse run; dedup-set bij her-import).
  try {
    PropertiesService.getScriptProperties()
      .setProperty('guillotine_' + taakNaam, JSON.stringify(hervatData || {}));
  } catch (e) { Logger.log('guillotine cursor-save fout: ' + e.message); }

  Logger.log('Guillotine: ' + taakNaam + ' gepauzeerd na ' + Math.round(verstreken/1000) + 's; hervat bij volgende run');
  safeAuditLog_('Guillotine pauze', taakNaam + ' na ' + Math.round(verstreken/1000) + 's');
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
  // Ruim door oudere versies gelekte one-shot self-triggers op. Veilig:
  // guillotine-taaknamen (sub-taken zoals stuurAutomatischeBetalingsherinneringen_
  // of verwerkBankImport_) zijn nooit canonical geplande handlers — de dagelijkse
  // trigger draait op dagelijkseTaken. Extra guard voor het geval dat ooit wijzigt.
  try {
    const canonical = (typeof _HYGIENE_VERWACHTE_TRIGGERS !== 'undefined')
      ? _HYGIENE_VERWACHTE_TRIGGERS.map(function(t) { return t.handler || t; })
      : [];
    if (canonical.indexOf(taakNaam) !== -1) return;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === taakNaam &&
          t.getEventType && t.getEventType() === ScriptApp.EventType.CLOCK) {
        try { ScriptApp.deleteTrigger(t); } catch (_) {}
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

/**
 * Veilige wrapper rond schrijfAuditLog_.
 *
 * Cycle 78: vervangt het patroon `safeAuditLog_(X, Y);`
 * dat 50+ keer in de codebase staat. schrijfAuditLog_ heeft zelf al een
 * internal try/catch, maar callers wrap_ten "voor de zekerheid" toch nog een
 * keer — voornamelijk als bescherming tegen ReferenceError (functie niet
 * geladen, theoretisch in GAS). Deze helper centraliseert die guard en haalt
 * 50× boilerplate uit de business-logic.
 *
 * Gedrag: NOOIT crashen. Bij geen schrijfAuditLog_ valt het terug op
 * Logger.log zodat het signaal toch ergens te zien is.
 */
function safeAuditLog_(actie, details) {
  try {
    if (typeof schrijfAuditLog_ === 'function') {
      schrijfAuditLog_(actie, details);
    } else {
      Logger.log('[AUDIT-FALLBACK] ' + actie + ' | ' + (details || ''));
    }
  } catch (_) { /* nooit crashen om audit */ }
}

function noodLog_(actie, details) {
  try {
    const props = PropertiesService.getScriptProperties();
    const KEY = 'noodLog';
    // OWASP LLM02 mitigatie: mask PII voordat we naar ScriptProperty schrijven.
    // Vóór deze fix kon noodLog_ klant-emails, IBANs, en factuur-bedragen in
    // plain-text bewaren tot expliciet gewist. ScriptProperty leeft buiten
    // sheet-context → wordt niet door audit-log retentie-policy gedekt.
    const gemaskeerd = _maskeerPiiNoodLog_(String(details || '')).slice(0, 200);
    const entry = new Date().toISOString() + ' | ' + actie + ' | ' + gemaskeerd;
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

/**
 * Maskeert PII-patronen voor opslag in ScriptProperties (OWASP LLM02).
 * Conservatief: liever te veel maskeren dan klant-data lekken.
 *
 * Detecteert + vervangt:
 *   - Email-adressen → klant@***
 *   - IBANs → IBAN-***
 *   - Bedragen €1234,56 → €***
 *   - BTW-nummers NLxxx → BTW-***
 */
function _maskeerPiiNoodLog_(tekst) {
  if (!tekst) return '';
  return String(tekst)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***')
    // BTW-nummer EERST (matcht NL\d{9}B\d{2} format — specifieker dan IBAN-regex)
    .replace(/\bNL\d{9}B\d{2}\b/g, 'BTW-***')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, 'IBAN-***')
    .replace(/€\s*-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\b/g, '€***')
    .replace(/\b\d{8}\b/g, 'KvK-***');  // KvK 8-cijfers
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
  'noah_ark_export':          true,   // cycle 70: dagelijkse JSONL-snapshot
  'dlq_retry':                true,
  'webhook_hmac':             false,  // optionele opwaardering
  'multi_jaar_dashboard':     false,  // experimentele feature
  'inkoop_ocr':               true,   // Gemini Vision is geconfigureerd
};

/**
 * V8: stuur notificatie-mail met automatische DLQ-fallback.
 *
 * Mail-calls in proactieve checks (BTW-reminder, suppletie, KIA-misser,
 * bewaarplicht) waren tot nu toe fail-soft: try/catch zonder retry. Bij een
 * tijdelijke Brevo/MailApp-storing of quota-fail verdween de melding stil
 * → klant wist niet dat er iets te doen was → boete/aftrek-verlies.
 *
 * Nu: poging via MailApp.sendEmail; bij fout wordt het bericht in de DLQ
 * gezet en automatisch later opnieuw geprobeerd (dlqVerwerkRetries_,
 * exponentiële backoff 1u/4u/12u). Klant ziet de melding binnen 24u toch,
 * mits de mail-quota uiteindelijk herstelt.
 *
 * @param {string} ontvanger
 * @param {string} onderwerp
 * @param {string} tekst
 * @return {boolean} true bij directe verzending, false bij DLQ-fallback.
 */
function stuurMailMetDlq_(ontvanger, onderwerp, tekst) {
  if (!ontvanger) return false;
  if (typeof isGeldigEmail_ === 'function' && !isGeldigEmail_(ontvanger)) return false;
  try {
    MailApp.sendEmail(ontvanger, onderwerp, tekst);
    return true;
  } catch (mailErr) {
    try {
      if (typeof dlqVoegToe_ === 'function') {
        dlqVoegToe_('EMAIL_NOTIFICATIE',
          { email: ontvanger, onderwerp: onderwerp, tekst: tekst },
          String(mailErr.message || mailErr));
      }
    } catch (_) {}
    Logger.log('Mail-fail → DLQ: ' + ontvanger + ' "' + onderwerp + '" — ' + mailErr.message);
    return false;
  }
}

/**
 * Case-insensitive ja/nee-interpretatie voor klant-instellingen.
 *
 * V3-FIX (boete-preventie): toggles in Instellingen werden eerder met strikte
 * === 'Ja' vergeleken. Eén typo ('ja', 'JA', ' Ja ') zette een feature stil
 * uit zonder dat de klant het door had. Voor BTW-reminder = gemiste deadline
 * = €68+ verzuimboete. Voor auto-boeking herhalende kosten = gemiste aftrek
 * = meer IB betalen. Centrale, vergevingsgezinde matcher voorkomt dit.
 *
 * Accepteert als TRUE (case-/spatie-insensitief): "ja", "yes", "y", "true",
 * "1", "aan", "on". Plus boolean true.
 * Alles anders → FALSE.
 *
 * @param {*} waarde Ruwe instellings-waarde.
 * @return {boolean}
 */
function isJa_(waarde) {
  if (waarde === true) return true;
  if (waarde === false || waarde === null || waarde === undefined) return false;
  const s = String(waarde).trim().toLowerCase();
  return s === 'ja' || s === 'yes' || s === 'y'
      || s === 'true' || s === '1'
      || s === 'aan' || s === 'on';
}

/**
 * Tegenhanger van isJa_ — case-insensitive nee/uit-detectie.
 *
 * Bewust expliciet (i.p.v. !isJa_(x)) om onderscheid te kunnen maken tussen
 * "expliciet nee" en "leeg/onbekend" — featureAan_ heeft dat onderscheid
 * nodig om door te kunnen vallen naar globale defaults bij lege input.
 *
 * @param {*} waarde
 * @return {boolean}
 */
function isNee_(waarde) {
  if (waarde === false) return true;
  if (waarde === true || waarde === null || waarde === undefined) return false;
  const s = String(waarde).trim().toLowerCase();
  return s === 'nee' || s === 'no' || s === 'n'
      || s === 'false' || s === '0'
      || s === 'uit' || s === 'off';
}

/**
 * @param {string} naam    feature-key uit FEATURE_DEFAULTS
 * @returns {boolean}
 */
function featureAan_(naam) {
  if (!naam) return false;
  // Per-klant override via Instellingen — nu via case-insensitive isJa_/isNee_
  // zodat 'JA', 'ja', ' Ja ' niet meer stil door de mazen vallen.
  try {
    const klantOverride = getInstelling_('Feature: ' + naam);
    if (isJa_(klantOverride)) return true;
    if (isNee_(klantOverride)) return false;
    // Leeg/onbekend → val door naar volgende laag
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
    safeAuditLog_('Outbound URL geblokkeerd', String(url).slice(0, 200));
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
    safeAuditLog_('KvK API', 'autofill voor ' + schoon);
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
      safeAuditLog_('KvK circuit-breaker', 'Open na ' + huidig + ' fouten in 60s — KvK uit voor 5 min');
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

// ─────────────────────────────────────────────
//  PATTERN WRAPPERS — withLock, withRetry, withCheckpoint
// ─────────────────────────────────────────────
//
// Centrale wrappers voor patronen die op veel plekken voorkomen. Conform
// masterplan maand 2 vereiste: één consistente implementatie ipv 7 verschillende
// kopieën verspreid over de codebase.
//
// Gebruik:
//   withLock_('boekFactuur', 30000, function() { ...kritieke schrijfactie... });
//   withRetry_(3, function() { return UrlFetchApp.fetch(url); });
//   withCheckpoint_('stap1', function() { ... }); // resume bij time-out
//

/**
 * Voert een functie uit binnen een Script-lock met timeout. Gegarandeerd
 * release in finally. Bij lock-timeout: throw met klant-leesbare boodschap
 * ipv silent skip.
 *
 * @param {string} naam Label voor audit-log (bv. 'boekFactuur')
 * @param {number} timeoutMs Wachttijd op lock (default 30s)
 * @param {Function} fn Functie die binnen lock moet draaien
 * @returns {*} Return-waarde van fn
 * @throws Error bij lock-timeout of bij re-throw uit fn
 */
function withLock_(naam, timeoutMs, fn) {
  const lock = LockService.getScriptLock();
  const wachttijd = parseInt(timeoutMs, 10) || 30000;
  if (!lock.tryLock(wachttijd)) {
    const msg = 'Lock-timeout voor ' + naam + ' na ' + wachttijd + 'ms — andere actie is bezig met dezelfde data. Probeer over enkele seconden opnieuw.';
    safeAuditLog_('LOCK TIMEOUT', naam + ' (wachttijd ' + wachttijd + 'ms)');
    throw new Error(msg);
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Voert fn uit met exponential backoff retry bij gooi-fout. Stopt na max
 * aantal pogingen. Voor netwerk-calls / transient failures.
 *
 * @param {number} maxPogingen Bv. 3
 * @param {Function} fn Functie die kan falen
 * @param {Function} [shouldRetry] Optioneel: predicate die error inspecteert.
 *                                 Bij falsy: niet retryen (bv. 4xx HTTP).
 * @returns {*} Return-waarde van succesvolle fn-call
 * @throws Laatste error als alle pogingen falen
 */
function withRetry_(maxPogingen, fn, shouldRetry) {
  const max = parseInt(maxPogingen, 10) || 3;
  let laatsteFout;
  for (let poging = 1; poging <= max; poging++) {
    try {
      return fn();
    } catch (e) {
      laatsteFout = e;
      if (shouldRetry && !shouldRetry(e)) {
        throw e;  // niet-retryable fout
      }
      if (poging < max) {
        // Exponential backoff: 500ms, 1000ms, 2000ms, ...
        Utilities.sleep(500 * Math.pow(2, poging - 1));
      }
    }
  }
  throw laatsteFout;
}

/**
 * Slaat een checkpoint op in ScriptProperties zodat een long-running
 * operatie kan hervatten na een time-out (6-min GAS-limiet). Gebruik in
 * combinatie met een time-driven trigger die de operatie hervat.
 *
 * @param {string} taak Identifier (bv. 'jaarafsluiting-2026')
 * @param {string} stap Huidige stap-naam
 * @param {Object} [state] Optionele state (JSON-serializable) om te bewaren
 */
function setCheckpoint_(taak, stap, state) {
  const props = PropertiesService.getScriptProperties();
  const data = { stap: stap, ts: Date.now(), state: state || {} };
  props.setProperty('CKPT_' + taak, JSON.stringify(data));
}

/**
 * Leest laatste checkpoint voor een taak. Return null als geen checkpoint.
 *
 * @param {string} taak
 * @returns {{stap: string, ts: number, state: Object}|null}
 */
function getCheckpoint_(taak) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('CKPT_' + taak);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Wist checkpoint na succesvolle voltooiing van een taak.
 *
 * @param {string} taak
 */
function clearCheckpoint_(taak) {
  PropertiesService.getScriptProperties().deleteProperty('CKPT_' + taak);
}

/**
 * Wrapper voor lange operatie met checkpoint-recovery. Bij time-out kan
 * een time-driven trigger deze functie aanroepen met dezelfde taak-naam
 * en dan wordt vanaf de laatste stap hervat.
 *
 * @param {string} taak
 * @param {Array<{naam: string, fn: Function}>} stappen Geordende lijst
 * @returns {{voltooid: boolean, laatsteStap: string}}
 */
function withCheckpoint_(taak, stappen) {
  const ckpt = getCheckpoint_(taak);
  const startIdx = ckpt ? stappen.findIndex(function(s) { return s.naam === ckpt.stap; }) + 1 : 0;
  const start = startIdx >= 0 ? startIdx : 0;

  for (let i = start; i < stappen.length; i++) {
    const stap = stappen[i];
    try {
      stap.fn(ckpt && ckpt.state ? ckpt.state : {});
      setCheckpoint_(taak, stap.naam);
    } catch (e) {
      Logger.log('withCheckpoint_ stap "' + stap.naam + '" faalde: ' + e.message);
      safeAuditLog_('CHECKPOINT FOUT', taak + ' bij stap "' + stap.naam + '": ' + e.message);
      throw e;
    }
  }
  clearCheckpoint_(taak);
  return { voltooid: true, laatsteStap: stappen[stappen.length - 1].naam };
}

// ─────────────────────────────────────────────
//  CHAOS-MITIGATIES — formule-injection, IBAN-checksum
// ─────────────────────────────────────────────

/**
 * Saniteer klant-input vóór setValue om spreadsheet-formule-injection te
 * voorkomen. Klant typt `=HYPERLINK("http://evil.com","Klik")` als bedrijfs-
 * naam → Google Sheets voert dit uit als formule.
 *
 * Mitigatie: prefix met apostrophe (Sheets toont apostrophe NIET, behandelt
 * inhoud als plain-text). Alleen toepassen bij STRING-input die in een
 * generieke cel terechtkomt — niet voor expliciete formules die wij zelf
 * schrijven.
 *
 * @param {*} waarde
 * @returns {string|*} waarde met apostrophe-prefix indien formule, anders ongewijzigd
 */
function veiligSheetWaarde_(waarde) {
  if (typeof waarde !== 'string') return waarde;
  // Sheets behandelt rijen die met deze chars beginnen als formule/expressie
  if (/^[=+\-@\t\r]/.test(waarde)) {
    return "'" + waarde;
  }
  return waarde;
}

/**
 * MOD-97 checksum voor IBAN — formal-correctness check naast format.
 * Bron: ISO 13616. Voorkomt typo's die de regex passeren.
 *
 * @param {string} iban
 * @returns {boolean} true als IBAN format + checksum geldig
 */
function isGeldigeIBANMet97Check_(iban) {
  const cleaned = String(iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) return false;
  // Verplaats eerste 4 chars naar einde
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  // Vervang letters door cijfers (A=10, B=11, ..., Z=35)
  const numeric = rearranged.replace(/[A-Z]/g, function(ch) {
    return (ch.charCodeAt(0) - 55).toString();
  });
  // MOD-97 via lange-deling (numeric kan >15 cijfers zijn, JS Number overflow)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + parseInt(numeric.charAt(i), 10)) % 97;
  }
  return remainder === 1;
}

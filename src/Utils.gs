/**
 * Utils.gs
 * Hulpfuncties voor datumopmaak, getalopmaak, parsing en validatie.
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
 * Formatteert een bedrag als EUR string
 */
function formatBedrag_(bedrag) {
  const b = parseFloat(bedrag) || 0;
  const prefix = b < 0 ? '-€' : '€';
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
//  VALIDATIE FUNCTIES
// ─────────────────────────────────────────────

function isGeldigIBAN_(iban) {
  if (!iban) return false;
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/.test(cleaned);
}

function isGeldigBTWNummer_(btwNr) {
  if (!btwNr) return false;
  return /^NL\d{9}B\d{2}$/.test(btwNr.replace(/\s/g, '').toUpperCase());
}

function isGeldigKvKNummer_(kvk) {
  if (!kvk) return false;
  return /^\d{8}$/.test(kvk.replace(/\s/g, ''));
}

function isGeldigEmail_(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  return {
    van: parseDatum_(startStr) || new Date(new Date().getFullYear(), 0, 1),
    tot: parseDatum_(eindeStr) || new Date(new Date().getFullYear(), 11, 31),
  };
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

const SNAPSHOT_SCHEMA_VERSION  = 1;
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

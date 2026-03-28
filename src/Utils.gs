/**
 * Utils.gs
 * Hulpfuncties voor datumopmaak, getalopmaak, parsing en validatie.
 */

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

/**
 * Schrijft een audit log naar properties
 */
function auditLog_(actie, details) {
  const tijdstip = formatDatumTijd_(new Date());
  const gebruiker = Session.getActiveUser().getEmail() || 'systeem';
  Logger.log(`[${tijdstip}] [${gebruiker}] ${actie}: ${details}`);
}

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
    versie: '1.0.0',
    aangemaakt: '2024',
    beschrijving: 'Boekhoudprogramma voor ZZP/MKB via Google Forms & Spreadsheets',
    functies: [
      'Dubbel boekhouden (NL GAAP)',
      'Verkoopfacturen met PDF',
      'Inkoopfacturen administratie',
      'Bankboek en reconciliatie',
      'BTW aangifte (kwartaal)',
      'Balans, W&V, Cashflow',
      'KPI Dashboard',
      'Debiteuren/Crediteuren beheer',
      'Google Forms integratie',
      'E-mail notificaties',
    ],
  };
}

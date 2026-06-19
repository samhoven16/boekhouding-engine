/**
 * EmailDeliverability.gs
 * Bounce-detectie + soft/hard onderscheid + List-Unsubscribe + email-status.
 *
 * GAS GmailApp heeft GEEN native bounce-callback. We detecteren bounces via:
 *  - Reply-To inbox monitoring (DSN-mails: "Mail Delivery Subsystem")
 *  - Foutmelding bij sendEmail (synchronous, per-mail)
 *
 * Wanneer bounce detected:
 *  - Hard-bounce (550/551/553) → markeer Relatie 'email ongeldig'
 *  - Soft-bounce (4xx/421/450) → DLQ retry binnen 24u
 */

const EMAIL_STATUS_GELDIG    = 'OK';
const EMAIL_STATUS_VERDACHT  = 'verdacht';   // soft-bounce ≥1×
const EMAIL_STATUS_ONGELDIG  = 'ongeldig';   // hard-bounce of 3× soft

/**
 * Markeer relatie als 'email ongeldig'. Voorkomt dat dunning blijft sturen
 * naar dood adres.
 *
 * Format Relaties-sheet (kolommen):
 *  [0]ID [1]Naam [2]Type [3]KvK [4]BTW [5]Adres [6]Postcode [7]Plaats
 *  [8]Land [9]Telefoon [10]Email [11]Bankrekening [12]Notities [13]EmailStatus
 *
 * Als kolom 13 niet bestaat → wordt toegevoegd bij eerste gebruik.
 */
function markeerEmailOngeldig_(email, reden) {
  if (!email) return false;
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName('Relaties');
    if (!sheet || sheet.getLastRow() < 2) return false;

    // Zorg dat kolom 14 (EmailStatus) bestaat
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let statusCol = headers.indexOf('Email-status');
    if (statusCol < 0) {
      statusCol = headers.length;
      sheet.getRange(1, statusCol + 1).setValue('Email-status')
        .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
    }

    const data = sheet.getDataRange().getValues();
    const emailLow = String(email).toLowerCase().trim();
    let raken = 0;
    for (let i = 1; i < data.length; i++) {
      const rij = data[i];
      if (String(rij[10] || '').toLowerCase().trim() === emailLow) {
        sheet.getRange(i + 1, statusCol + 1).setValue(EMAIL_STATUS_ONGELDIG)
          .setBackground('#FFCDD2').setFontColor('#B71C1C').setFontWeight('bold');
        raken++;
      }
    }
    safeAuditLog_('Email gemarkeerd ongeldig', email + (reden ? ' — ' + reden : '') + ' (' + raken + ' relaties)');
    return raken > 0;
  } catch (e) {
    Logger.log('markeerEmailOngeldig_ fout: ' + e.message);
    return false;
  }
}

/**
 * Detecteer bounce-type uit error-message of DSN-tekst.
 * @param {string} foutTekst
 * @returns {'hard'|'soft'|null}
 */
function detecteerBounceType_(foutTekst) {
  const t = String(foutTekst || '').toLowerCase();
  // Hard bounces (permanent failure)
  if (/5\d\d|invalid recipient|user.*not found|no such user|550|551|553|recipient address rejected/i.test(t)) {
    return 'hard';
  }
  // Soft bounces (temporary)
  if (/4\d\d|421|450|451|452|temporary|mailbox full|over quota|deferred/i.test(t)) {
    return 'soft';
  }
  return null;
}

/**
 * Menu: toon alle relaties met email-status 'ongeldig' — klant kan ze
 * handmatig bijwerken.
 */
function toonOngeldigeEmailRelaties() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName('Relaties');
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf('Email-status');
  if (statusCol < 0) {
    SpreadsheetApp.getUi().alert('Geen email-status-kolom — er zijn nog geen bounces gedetecteerd.');
    return;
  }
  const data = sheet.getDataRange().getValues();
  const ongeldig = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][statusCol]) === EMAIL_STATUS_ONGELDIG) {
      ongeldig.push((data[i][KOL.REL.naam] || '?') + ' — ' + (data[i][KOL.REL.email] || '?'));
    }
  }
  const ui = SpreadsheetApp.getUi();
  if (ongeldig.length === 0) {
    ui.alert('✅ Geen ongeldige email-adressen', 'Alle relaties hebben werkende email.', ui.ButtonSet.OK);
    return;
  }
  ui.alert('⚠️ Relaties met ongeldig email-adres (' + ongeldig.length + ')',
    ongeldig.join('\n') + '\n\nUpdate deze adressen in tabblad "Relaties" om herinneringen weer te kunnen versturen.',
    ui.ButtonSet.OK);
}

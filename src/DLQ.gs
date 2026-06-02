/**
 * DLQ.gs — Dead Letter Queue voor mislukte achtergrond-acties.
 *
 * Voorbeelden van wat hier kan landen:
 *  - Email-versturen mislukt (factuur, herinnering, accountantsmail)
 *  - Webhook-delivery mislukt (Mollie payment-update)
 *  - PDF-generatie mislukt midden-flow
 *
 * Zonder DLQ verdwijnen mislukte taken in stille fail; met DLQ:
 *  - Verborgen 'DLQ'-tabblad toont per failure: tijdstip, type, payload, fout, retries
 *  - Owner ziet menu → 'DLQ retry' om handmatig te hervaten
 *  - dagelijkseTaken probeert auto-retry max 3× per item
 */

const DLQ_SHEET = 'DLQ';
const DLQ_MAX_RIJEN = 1000;
const DLQ_MAX_RETRIES = 3;

/**
 * Voegt een mislukte taak toe aan de DLQ.
 *
 * @param {string} type      label, bv. 'EMAIL', 'WEBHOOK', 'PDF'
 * @param {Object} payload   alle data nodig voor retry (kleine, JSON-serialiseerbaar)
 * @param {string} foutTekst raw error.message
 */
function dlqVoegToe_(type, payload, foutTekst) {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    let sheet = ss.getSheetByName(DLQ_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(DLQ_SHEET);
      sheet.getRange(1, 1, 1, 7)
        .setValues([['Tijdstip', 'Type', 'Payload (JSON)', 'Fout', 'Retries', 'Status', 'Volgende retry']])
        .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      sheet.hideSheet();
    }
    const payloadStr = (function() {
      try { return JSON.stringify(payload).slice(0, 4000); }
      catch (_) { return '(unserializable)'; }
    })();
    sheet.appendRow([
      new Date(),
      String(type || 'ONBEKEND'),
      payloadStr,
      String(foutTekst || '').slice(0, 500),
      0,                     // retries
      'PENDING',
      new Date(Date.now() + 60 * 60 * 1000),  // eerste retry: +1 uur
    ]);
    // FIFO trim
    const last = sheet.getLastRow();
    if (last > DLQ_MAX_RIJEN + 1) sheet.deleteRows(2, last - DLQ_MAX_RIJEN - 1);

    safeAuditLog_('DLQ added', type + ' | ' + String(foutTekst).slice(0, 100));
  } catch (e) {
    Logger.log('dlqVoegToe_ silent fail: ' + e.message);
  }
}

/**
 * Retry alle PENDING DLQ-items waarvan volgendeRetry < nu.
 * Per item: roep handler op (per type), update status op SUCCES of bump retries.
 * Na DLQ_MAX_RETRIES → status FAILED, geen verdere retry.
 *
 * Geschikt voor _runTaak_ in dagelijkseTaken.
 */
function dlqVerwerkRetries_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    const sheet = ss.getSheetByName(DLQ_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return;

    const data = sheet.getDataRange().getValues();
    const nu = new Date();
    let hervatGeprobeerd = 0;
    let hervatGelukt = 0;

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][5] || '');
      if (status !== 'PENDING') continue;
      const retries = parseInt(data[i][4]) || 0;
      const volgende = data[i][6] instanceof Date ? data[i][6] : new Date(data[i][6]);
      if (isNaN(volgende.getTime()) || volgende > nu) continue;

      hervatGeprobeerd++;
      const type = String(data[i][1] || '');
      let payload = {};
      try { payload = JSON.parse(data[i][2] || '{}'); } catch (_) {}

      let success = false;
      let nieuweFout = '';
      try {
        success = _dlqHandler_(type, payload);
      } catch (e) { nieuweFout = e.message; }

      if (success) {
        sheet.getRange(i + 1, 6).setValue('SUCCES');
        hervatGelukt++;
        safeAuditLog_('DLQ retry succes', type + ' (poging ' + (retries + 1) + ')');
      } else {
        const nieuwRetries = retries + 1;
        sheet.getRange(i + 1, 5).setValue(nieuwRetries);
        if (nieuwRetries >= DLQ_MAX_RETRIES) {
          sheet.getRange(i + 1, 6).setValue('FAILED');
          if (nieuweFout) sheet.getRange(i + 1, 4).setValue(String(nieuweFout).slice(0, 500));
          safeAuditLog_('DLQ FAILED definitief', type + ' na ' + nieuwRetries + ' pogingen');
          try { meldFataalAanOwner_('DLQ_FAILED', type + ' na ' + DLQ_MAX_RETRIES + ' retries opgegeven', { payload: payload }); } catch (_) {}
        } else {
          // Exponential backoff: +1u, +4u, +12u
          const wachtUren = Math.pow(4, nieuwRetries - 1);
          sheet.getRange(i + 1, 7).setValue(new Date(Date.now() + wachtUren * 3600 * 1000));
          if (nieuweFout) sheet.getRange(i + 1, 4).setValue(String(nieuweFout).slice(0, 500));
        }
      }
    }
    if (hervatGeprobeerd > 0) {
      Logger.log('DLQ retry: ' + hervatGelukt + '/' + hervatGeprobeerd + ' gelukt');
    }
  } catch (e) {
    Logger.log('dlqVerwerkRetries_ silent fail: ' + e.message);
  }
}

/**
 * Type-specifieke retry-handler. Returns true bij succes, false bij fail.
 */
function _dlqHandler_(type, payload) {
  switch (String(type).toUpperCase()) {
    case 'EMAIL_FACTUUR':
      // Verwacht payload: { email, klantnaam, factuurnummer, bedragIncl, vervaldatum, pdfUrl }
      if (typeof stuurFactuurEmailNaarKlant_ === 'function') {
        return stuurFactuurEmailNaarKlant_(
          payload.email, payload.klantnaam, payload.factuurnummer,
          payload.bedragIncl, payload.vervaldatum, payload.pdfUrl, payload.ublUrl || null
        ) === true;
      }
      return false;

    case 'EMAIL_HERINNERING':
      // Verwacht payload: { email, onderwerp, tekst, opties }
      try {
        GmailApp.sendEmail(payload.email, payload.onderwerp, payload.tekst, payload.opties || {});
        return true;
      } catch (_) { return false; }

    case 'EMAIL_NOTIFICATIE':
      // V8: proactieve checks (BTW-reminder/suppletie/KIA-misser/bewaarplicht)
      // gebruiken stuurMailMetDlq_ → bij MailApp-fail komt het hier terecht.
      try {
        MailApp.sendEmail(payload.email, payload.onderwerp, payload.tekst);
        return true;
      } catch (_) { return false; }

    default:
      Logger.log('DLQ handler onbekend type: ' + type);
      return false;
  }
}

/**
 * Menu: toon DLQ-overzicht in dialog.
 */
function toonDlqOverzicht() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const sheet = ss.getSheetByName(DLQ_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('🟢 Geen mislukte taken', 'De Dead Letter Queue is leeg.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  // Maak DLQ-tab zichtbaar zodat klant kan inspecteren
  try { sheet.showSheet(); } catch (_) {}
  ss.setActiveSheet(sheet);
}

/**
 * Menu: forceer retry van alle PENDING items (negeert volgende-retry-tijdstip).
 */
function forceerDlqRetry() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const sheet = ss.getSheetByName(DLQ_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Geen items om te hervaten.');
    return;
  }
  // Zet alle PENDING op "volgendeRetry = nu" zodat dlqVerwerkRetries_ ze meeneemt
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]) === 'PENDING') sheet.getRange(i + 1, 7).setValue(new Date());
  }
  dlqVerwerkRetries_();
  SpreadsheetApp.getUi().alert('✅ Forced retry voltooid', 'Bekijk DLQ-tab voor resultaten.', SpreadsheetApp.getUi().ButtonSet.OK);
}

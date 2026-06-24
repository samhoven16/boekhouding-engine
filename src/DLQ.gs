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
// Module-lokale kolom-accessor (DLQ-tab, headers in dlqVoegToe_); zelfde
// principe als KOL maar privé aan deze module (vgl. UREN_KOL).
// eslint-disable-next-line no-unused-vars
const DLQ_KOL = Object.freeze({
  tijdstip: 0, type: 1, payload: 2, fout: 3, retries: 4, status: 5, volgendeRetry: 6,
});
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
      const status = String(data[i][DLQ_KOL.status] || '');
      if (status !== 'PENDING') continue;
      const retries = parseInt(data[i][DLQ_KOL.retries]) || 0;
      const volgende = data[i][DLQ_KOL.volgendeRetry] instanceof Date ? data[i][DLQ_KOL.volgendeRetry] : new Date(data[i][DLQ_KOL.volgendeRetry]);
      if (isNaN(volgende.getTime()) || volgende > nu) continue;

      hervatGeprobeerd++;
      const type = String(data[i][DLQ_KOL.type] || '');
      let payload = {};
      try { payload = JSON.parse(data[i][DLQ_KOL.payload] || '{}'); } catch (_) {}

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
          escaleerDlqFataal_(sheet, ss, type, payload, nieuweFout);
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
        MailApp.sendEmail(payload.email, payload.onderwerp, payload.tekst, payload.opties || {});  // klant-mail-ok: DLQ-retry, replay van reeds-besloten bericht
        return true;
      } catch (_) { return false; }

    case 'EMAIL_NOTIFICATIE':
      // V8: proactieve checks (BTW-reminder/suppletie/KIA-misser/bewaarplicht)
      // gebruiken stuurMailMetDlq_ → bij MailApp-fail komt het hier terecht.
      try {
        MailApp.sendEmail(payload.email, payload.onderwerp, payload.tekst);  // klant-mail-ok: DLQ-retry, replay van reeds-besloten bericht
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
    if (String(data[i][DLQ_KOL.status]) === 'PENDING') sheet.getRange(i + 1, 7).setValue(new Date());
  }
  dlqVerwerkRetries_();
  SpreadsheetApp.getUi().alert('✅ Forced retry voltooid', 'Bekijk DLQ-tab voor resultaten.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Escaleert een definitief gefaalde DLQ-entry via meerdere onafhankelijke
 * kanalen. Sinds CYCLE 92: één kanaal (mail) was onvoldoende — mail-quota
 * kan op zijn op precies het moment dat er veel faalt, of de owner-mail
 * zelf is de gefaalde actie. Vier kanalen, in volgorde van robuustheid:
 *
 *   1. Audit-log (al in calling-site geschreven; hier nogmaals voor zekerheid)
 *   2. ScriptProperty 'DLQ_LAATSTE_FATAAL' — persistente JSON, leesbaar in
 *      Apps Script editor zelfs als sheet onbereikbaar is
 *   3. DLQ-tab zichtbaar maken (showSheet) — gebruiker ziet automatisch een
 *      nieuwe tab in z'n spreadsheet en gaat kijken
 *   4. meldFataalAanOwner_ — best-effort mail-alert, kan zelf falen
 *
 * Kanalen 1-3 zijn quota-vrij en script-restart-bestendig. Kanaal 4 is de
 * meest zichtbare maar minst betrouwbare.
 *
 * Best-effort: elke kanaal-fout wordt apart gevangen. Geen kanaal mag de
 * andere blokkeren.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet  DLQ-sheet (al geopend)
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss  parent spreadsheet
 * @param {string} type       DLQ-type (bv. 'EMAIL_FACTUUR')
 * @param {Object} payload    item-payload (kan gevoelige info bevatten — niet in alert-mail meesturen)
 * @param {string} foutTekst  laatste error-message
 */
function escaleerDlqFataal_(sheet, ss, type, payload, foutTekst) {
  // Kanaal 1 — audit-log nogmaals (cheap, al gedaan in caller)
  try {
    safeAuditLog_('DLQ FATAAL-escalatie', type + ' — ' + String(foutTekst || '(onbekend)').slice(0, 120));
  } catch (_) {}

  // Kanaal 2 — persistente ScriptProperty
  try {
    const props = PropertiesService.getScriptProperties();
    const totaalFailed = telDlqFailed_(sheet);
    props.setProperty('DLQ_LAATSTE_FATAAL', JSON.stringify({
      tijdstip: new Date().toISOString(),
      type: String(type || ''),
      fout: String(foutTekst || '').slice(0, 200),
      totaalFailed: totaalFailed,
    }));
  } catch (_) {}

  // Kanaal 3 — DLQ-tab zichtbaar maken zodat klant 'm niet kan missen
  try { if (sheet && typeof sheet.showSheet === 'function') sheet.showSheet(); } catch (_) {}

  // Kanaal 4 — best-effort mail-alert. Laatste omdat het kan falen.
  try {
    if (typeof meldFataalAanOwner_ === 'function') {
      meldFataalAanOwner_('DLQ_FAILED', type + ' na ' + DLQ_MAX_RETRIES + ' retries opgegeven', { payload: payload });
    }
  } catch (_) {}
}

/**
 * Telt aantal rijen met status FAILED in de DLQ. Goedkoop: één read.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {number}
 */
function telDlqFailed_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const data = sheet.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][DLQ_KOL.status] || '').toUpperCase() === 'FAILED') n++;
  }
  return n;
}

/**
 * Read-only inspectie van de laatste fatale DLQ-escalatie via ScriptProperty.
 * Bedoeld voor support-debugging: ook als de spreadsheet niet bereikbaar is
 * kun je in de editor `Logger.log(JSON.stringify(getDlqLaatsteFataalProp_()))`
 * draaien voor de meest recente staat.
 *
 * @returns {Object|null} { tijdstip, type, fout, totaalFailed } of null
 */
function getDlqLaatsteFataalProp_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('DLQ_LAATSTE_FATAAL');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

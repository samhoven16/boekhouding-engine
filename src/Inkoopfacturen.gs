/**
 * Inkoopfacturen.gs
 * Beheer van inkoopfacturen, betalingen en leveranciersadministratie.
 */

// ─────────────────────────────────────────────
//  INKOOPFACTUUR ALS BETAALD MARKEREN
// ─────────────────────────────────────────────
function markeerInkoopfactuurBetaald() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();

  const resp = ui.prompt(
    'Inkoopfactuur betaald',
    'Voer het interne inkoopnummer in (bijv. IK1):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const zoekNr = resp.getResponseText().trim();
  if (!zoekNr) return;

  // Lock voorkomt race-condition: gelijktijdige "Markeer betaald" + bank-CSV-
  // import op zelfde factuur zou anders 2x journaalpost geven (= dubbel ge-
  // boekte kosten in grootboek → fout BTW-aangifte → boete-risico). 30s
  // timeout: financiële integriteit boven UI-snelheid.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    ui.alert('Andere betaling-actie is bezig — probeer over een paar seconden opnieuw.');
    return;
  }

  try {
    const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (!sheet) { ui.alert('Tabblad Inkoopfacturen niet gevonden — run setup() eerst.'); return; }
    // Re-read NA lock om laatste-stand te zien
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) !== zoekNr && String(data[i][0]) !== zoekNr) continue;

      const bedrag = parseFloat(data[i][11]) || 0;
      if (bedrag <= 0) {
        ui.alert('Inkoopfactuur ' + zoekNr + ' heeft geen geldig bedrag — controleer de rij.');
        return;
      }
      const leverancier = data[i][6];
      const datum = new Date();
      const huidigeStatus = String(data[i][12] || '');

      // Idempotency: voorkom dubbel boeken bij dubbel-klik / Mollie-webhook-retry
      if (huidigeStatus === FACTUUR_STATUS.BETAALD) {
        ui.alert(`Inkoopfactuur ${zoekNr} staat al op BETAALD — geen nieuwe boeking gemaakt.`);
        return;
      }

      // Set status EERST, dan journaalpost. Bij journaalpost-fail: rollback
      // status terug naar origineel zodat factuur niet op BETAALD blijft
      // staan zonder tegenboeking. Zelfde patroon als verkoop-side (PR #90).
      const origineleStatus = huidigeStatus || FACTUUR_STATUS.CONCEPT;
      sheet.getRange(i + 1, 13).setValue(FACTUUR_STATUS.BETAALD);
      sheet.getRange(i + 1, 14).setValue(datum);
      sheet.getRange(i + 1, 15).setValue('1200');
      SpreadsheetApp.flush();

      try {
        maakJournaalpost_(ss, {
          datum,
          omschr: `Betaling inkoop ${zoekNr} – ${leverancier}`,
          dagboek: 'Bankboek',
          debet: '4000',   // Crediteuren
          credit: '1200',  // Bank
          bedrag,
          ref: zoekNr,
          type: BOEKING_TYPE.BANKBETALING,
        });
      } catch (jpFout) {
        // Rollback: status terug naar origineel — anders inkoopfactuur
        // toont BETAALD maar 4000 (crediteuren) blijft openstaan.
        try {
          sheet.getRange(i + 1, 13).setValue(origineleStatus);
          sheet.getRange(i + 1, 14).setValue('');
          sheet.getRange(i + 1, 15).setValue('');
          SpreadsheetApp.flush();
        } catch (rollbackFout) {
          try { schrijfAuditLog_('FATAAL: rollback inkoop-betaald faalde', zoekNr + ' — ' + (rollbackFout && rollbackFout.message)); } catch (_) {}
        }
        try { schrijfAuditLog_('Inkoop betaald → journaalpost FAALDE, rollback uitgevoerd', zoekNr + ' — ' + (jpFout && jpFout.message)); } catch (_) {}
        ui.alert('Markeer-betaald faalde tijdens journaalpost: ' + (jpFout && jpFout.message) + '\n\nFactuur-status is teruggezet. Controleer en probeer opnieuw.');
        return;
      }

      try { schrijfAuditLog_('Inkoop betaald', zoekNr + ' — ' + leverancier + ' ' + formatBedrag_(bedrag)); } catch (_) {}
      try { invalideerKpiSnapshot_(); bustCache_('kpi'); } catch (_) {}
      vernieuwDashboard();
      ui.alert(`Inkoopfactuur ${zoekNr} gemarkeerd als betaald.`);
      return;
    }
    ui.alert('Inkoopfactuur ' + zoekNr + ' niet gevonden.');
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ─────────────────────────────────────────────
//  LEVERANCIERS OVERZICHT
// ─────────────────────────────────────────────
function beheerRelaties() {
  const ss = getSpreadsheet_();
  ss.setActiveSheet(ss.getSheetByName(SHEETS.RELATIES));
}

// ─────────────────────────────────────────────
//  INKOOPFACTUUR VALIDATIE
// ─────────────────────────────────────────────
function valideerInkoopfactuur_(data) {
  const fouten = [];

  if (!data.leverancier) fouten.push('Leveranciernaam is verplicht');
  if (!data.factuurnummer) fouten.push('Factuurnummer leverancier is verplicht');
  if (!data.bedragExcl || data.bedragExcl <= 0) fouten.push('Bedrag excl. BTW moet groter dan 0 zijn');
  if (!data.datum) fouten.push('Factuurdatum is verplicht');

  return fouten;
}

// ─────────────────────────────────────────────
//  INKOOPFACTUREN OVERZICHT (FILTERED)
// ─────────────────────────────────────────────
function toonOpenInkoopfacturen() {
  const ss = getSpreadsheet_();
  const data = leesSheetVeilig_(ss, SHEETS.INKOOPFACTUREN);   // CYCLE-51
  const vandaag = new Date();

  let html = `
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:18px;font-size:12px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;
            box-shadow:0 1px 2px rgba(13,27,78,0.04)}
      th{background:#0D1B4E;color:white;padding:10px 12px;text-align:left;font-weight:600;font-size:11px;letter-spacing:0.3px}
      td{padding:8px 12px;border-bottom:1px solid #E5EAF2}
      tr:last-child td{border-bottom:none}
      tr:nth-child(even) td{background:#F7F9FC}
      .totaal td{font-weight:700;background:#E6F7F4;color:#0D1B4E;border-top:2px solid #2EC4B6}
      .totaal td:nth-child(even){background:#E6F7F4}
      button{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 16px;
             border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
             font-family:inherit;margin-top:12px;transition:background 0.15s}
      button:hover{background:#EEF2F8}
    </style>
    <h3>Open inkoopfacturen</h3>
    <table>
      <tr><th>Datum</th><th>Leverancier</th><th>Factuurref.</th><th>Bedrag incl.</th><th>Status</th></tr>`;

  let totaal = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][12] === FACTUUR_STATUS.BETAALD) continue;
    const bedrag = parseFloat(data[i][11]) || 0;
    totaal += bedrag;
    html += `<tr>
      <td>${formatDatum_(data[i][3])}</td>
      <td>${escHtml_(String(data[i][6] || ''))}</td>
      <td>${escHtml_(String(data[i][4] || ''))}</td>
      <td>${formatBedrag_(bedrag)}</td>
      <td>${escHtml_(String(data[i][12] || ''))}</td>
    </tr>`;
  }

  html += `<tr class="totaal"><td colspan="3">TOTAAL TE BETALEN</td><td>${formatBedrag_(totaal)}</td><td></td></tr>`;
  html += `</table><br><button onclick="google.script.host.close()">Sluiten</button>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(650).setHeight(400).setSandboxMode(HtmlService.SandboxMode.IFRAME),
    'Open inkoopfacturen'
  );
}

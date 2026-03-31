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
  const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === zoekNr || String(data[i][0]) === zoekNr) {
      const bedrag = parseFloat(data[i][11]) || 0;
      const leverancier = data[i][6];
      const datum = new Date();

      sheet.getRange(i + 1, 13).setValue(FACTUUR_STATUS.BETAALD);
      sheet.getRange(i + 1, 14).setValue(datum);
      sheet.getRange(i + 1, 15).setValue('1200'); // Bank zakelijk

      // Journaalpost: Crediteuren → Bank
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

      vernieuwDashboard();
      ui.alert(`Inkoopfactuur ${zoekNr} gemarkeerd als betaald.`);
      return;
    }
  }

  ui.alert('Inkoopfactuur ' + zoekNr + ' niet gevonden.');
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
  const data = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();
  const vandaag = new Date();

  let html = `
    <style>
      body { font-family: Arial, sans-serif; padding: 12px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1A237E; color: white; padding: 6px 8px; text-align: left; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .totaal { font-weight: bold; background: #e8eaf6; }
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
    HtmlService.createHtmlOutput(html).setWidth(650).setHeight(400),
    'Open inkoopfacturen'
  );
}

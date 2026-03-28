/**
 * Menu.gs
 * Aanmaken van het aangepaste menu in Google Spreadsheets.
 */

// ─────────────────────────────────────────────
//  ON OPEN: MENU AANMAKEN
// ─────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Boekhouding')

    // ── Invoer ────────────────────────────────
    .addItem('📋 Boekhouding formulier openen', 'openHoofdFormulier')
    .addSeparator()

    // ── Facturen ──────────────────────────────
    .addSubMenu(ui.createMenu('Facturen')
      .addItem('Factuur handmatig versturen (PDF)', 'stuurVerkoopfactuurPdf')
      .addItem('Betalingsherinneringen nu sturen', 'stuurBetalingsherinneringen')
      .addSeparator()
      .addItem('Debiteuren overzicht vernieuwen', 'vernieuwDebiteurenOverzicht')
      .addItem('Crediteuren overzicht vernieuwen', 'vernieuwCrediteurenOverzicht')
    )

    // ── Bankboek ──────────────────────────────
    .addSubMenu(ui.createMenu('Bankboek')
      .addItem('Bankafschrift importeren (CSV)', 'importeerBankafschrift')
      .addSeparator()
      .addItem('Transacties koppelen aan facturen', 'koppelTransactiesAanFacturen')
    )

    // ── Boekingen ─────────────────────────────
    .addSubMenu(ui.createMenu('Boekingen')
      .addItem('Handmatige journaalpost', 'openJournaalpostFormulier')
      .addItem('Beginbalans invoeren', 'openBeginbalansDialoog')
      .addSeparator()
      .addItem('Afschrijvingen boeken', 'boekAfschrijvingen')
      .addItem('BTW journaalpost sluiten', 'sluitBtwPeriode')
    )

    // ── Belastingadvies ───────────────────────
    .addItem('💡 Belastingadvies & aftrekposten', 'genereerBelastingadvies')
    .addSeparator()

    // ── Rapporten ─────────────────────────────
    .addSubMenu(ui.createMenu('Rapporten')
      .addItem('Dashboard vernieuwen', 'vernieuwDashboard')
      .addSeparator()
      .addItem('Balans genereren', 'genereerBalans')
      .addItem('Winst & Verliesrekening', 'genereerWvRekening')
      .addItem('Cashflow overzicht', 'genereerCashflow')
      .addSeparator()
      .addItem('BTW aangifte berekenen', 'genereerBtwAangifte')
      .addItem('Jaarrekening genereren', 'genereerJaarrekening')
      .addSeparator()
      .addItem('Grootboekkaart exporteren', 'exporteerGrootboekkaart')
    )

    // ── BTW ───────────────────────────────────
    .addSubMenu(ui.createMenu('BTW')
      .addItem('BTW aangifte Q1', 'genereerBtwAangifteQ1')
      .addItem('BTW aangifte Q2', 'genereerBtwAangifteQ2')
      .addItem('BTW aangifte Q3', 'genereerBtwAangifteQ3')
      .addItem('BTW aangifte Q4', 'genereerBtwAangifteQ4')
      .addSeparator()
      .addItem('KOR regeling controle', 'controleerKor')
    )

    // ── Instellingen & Beheer ─────────────────
    .addSeparator()
    .addSubMenu(ui.createMenu('Instellingen & Beheer')
      .addItem('Setup uitvoeren (eerste keer)', 'setup')
      .addSeparator()
      .addItem('Formulier links tonen', 'toonFormulierLinks')
      .addItem('Google Drive mappen tonen', 'toonDriveStructuur')
      .addItem('Nieuw boekjaar aanmaken', 'maakNieuwBoekjaar')
      .addSeparator()
      .addItem('Grootboekschema herladen', 'herlaadGrootboekschema')
      .addItem('Alle rapporten vernieuwen', 'vernieuwAlleRapporten')
      .addSeparator()
      .addItem('Setup resetten', 'resetSetup')
    )

    .addToUi();
}

// ─────────────────────────────────────────────
//  HOOFDFORMULIER OPENEN
// ─────────────────────────────────────────────
function openHoofdFormulier() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_HOOFD_ID);
  if (!formId) {
    SpreadsheetApp.getUi().alert(
      'Formulier niet gevonden',
      'Voer eerst de setup uit via Boekhouding → Instellingen & Beheer → Setup uitvoeren.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  const url = FormApp.openById(formId).getPublishedUrl();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:20px;text-align:center}
      .btn{display:inline-block;background:#1A237E;color:#fff;padding:12px 24px;
           border-radius:6px;text-decoration:none;font-size:14px;margin:8px 0}
      .qr{margin-top:12px;font-size:11px;color:#888}
    </style>
    <h3 style="color:#1A237E">Boekhouding formulier</h3>
    <p>Open op desktop of mobiel:</p>
    <a class="btn" href="${url}" target="_blank">📋 Formulier openen</a>
    <p style="font-size:11px;color:#888;margin-top:12px;word-break:break-all">${url}</p>
    <p class="qr">Tip: stuur deze link naar uzelf voor snelle toegang op uw telefoon.</p>
  `).setWidth(480).setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(html, 'Boekhouding formulier');
}

// Backward-compat voor handmatige journaalpost (nog steeds nuttig)
function openJournaalpostFormulier() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_JOURNAAL_ID);
  if (!formId) {
    openHoofdFormulier();
    return;
  }
  const url = FormApp.openById(formId).getPublishedUrl();
  const html = HtmlService.createHtmlOutput(
    `<p><a href="${url}" target="_blank">📋 Journaalpost formulier openen</a></p>`
  ).setWidth(450).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, 'Journaalpost');
}

// ─────────────────────────────────────────────
//  FORMULIER LINKS TONEN
// ─────────────────────────────────────────────
function toonFormulierLinks() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_HOOFD_ID);
  let url = 'Niet aangemaakt — voer Setup uit';
  if (formId) {
    try { url = FormApp.openById(formId).getPublishedUrl(); }
    catch(e) { url = 'Fout bij ophalen: ' + e.message; }
  }
  const html = `
    <style>body{font-family:Arial,sans-serif;padding:16px} a{color:#1A237E}</style>
    <h3>Boekhouding formulier</h3>
    <p>Gebruik dit ene formulier voor facturen, kosten en declaraties:</p>
    <p><a href="${url}" target="_blank">📋 Formulier openen</a></p>
    <p style="font-size:11px;color:#666;word-break:break-all">${url}</p>
    <p style="font-size:11px;color:#888">Tip: sla de link op als bladwijzer op uw telefoon voor snelle invoer onderweg.</p>
  `;
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(500).setHeight(250),
    'Formulier Link'
  );
}

// ─────────────────────────────────────────────
//  GROOTBOEKSCHEMA HERLADEN
// ─────────────────────────────────────────────
function herlaadGrootboekschema() {
  vulGrootboekschema_(getSpreadsheet_());
  SpreadsheetApp.getUi().alert('Grootboekschema is bijgewerkt.');
}

// ─────────────────────────────────────────────
//  ALLE RAPPORTEN VERNIEUWEN
// ─────────────────────────────────────────────
function vernieuwAlleRapporten() {
  vernieuwDashboard();
  genereerBalans();
  genereerWvRekening();
  genereerCashflow();
  vernieuwDebiteurenOverzicht();
  vernieuwCrediteurenOverzicht();
  SpreadsheetApp.getUi().alert('Alle rapporten zijn bijgewerkt.');
}

// ─────────────────────────────────────────────
//  BEGINBALANS DIALOOG
// ─────────────────────────────────────────────
function openBeginbalansDialoog() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 10px; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 4px 8px; border: 1px solid #ccc; }
      th { background: #1A237E; color: white; }
      input { width: 100%; }
      .btn { background: #1A237E; color: white; padding: 8px 16px; border: none; cursor: pointer; margin-top: 10px; }
    </style>
    <h3>Beginbalans invoeren</h3>
    <p>Gebruik het <b>Journaalpost formulier</b> met dagboek "Beginbalans" om openingssaldi in te voeren.</p>
    <p>Standaard tegenrekening voor beginbalans: <b>2000 – Ondernemingsvermogen</b></p>
    <p><button class="btn" onclick="google.script.run.openJournaalpostFormulier()">Journaalpost formulier openen</button></p>
    <script>
      function closeDialog() { google.script.host.close(); }
    </script>
    <button onclick="closeDialog()" style="margin-top:8px">Sluiten</button>
  `).setWidth(450).setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(html, 'Beginbalans');
}

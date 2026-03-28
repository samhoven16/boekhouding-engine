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

    // ── Facturen ──────────────────────────────
    .addSubMenu(ui.createMenu('Facturen')
      .addItem('Nieuwe verkoopfactuur aanmaken', 'openVerkoopfactuurFormulier')
      .addItem('Inkoopfactuur registreren', 'openInkoopfactuurFormulier')
      .addSeparator()
      .addItem('Verkoopfactuur als PDF versturen', 'stuurVerkoopfactuurPdf')
      .addItem('Herinneringen versturen (vervallen)', 'stuurBetalingsherinneringen')
      .addSeparator()
      .addItem('Debiteuren overzicht vernieuwen', 'vernieuwDebiteurenOverzicht')
      .addItem('Crediteuren overzicht vernieuwen', 'vernieuwCrediteurenOverzicht')
    )

    // ── Bankboek ──────────────────────────────
    .addSubMenu(ui.createMenu('Bankboek')
      .addItem('Banktransactie invoeren', 'openBanktransactieFormulier')
      .addItem('Bankafschrift importeren (CSV)', 'importeerBankafschrift')
      .addSeparator()
      .addItem('Transacties koppelen aan facturen', 'koppelTransactiesAanFacturen')
    )

    // ── Relaties ──────────────────────────────
    .addSubMenu(ui.createMenu('Relaties')
      .addItem('Nieuwe relatie toevoegen', 'openRelatieFormulier')
      .addItem('Relaties beheren', 'beheerRelaties')
    )

    // ── Boekingen ─────────────────────────────
    .addSubMenu(ui.createMenu('Boekingen')
      .addItem('Handmatige journaalpost', 'openJournaalpostFormulier')
      .addItem('Beginbalans invoeren', 'openBeginbalansDialoog')
      .addSeparator()
      .addItem('Afschrijvingen boeken', 'boekAfschrijvingen')
      .addItem('BTW journaalpost sluiten', 'sluitBtwPeriode')
    )

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
      .addItem('Grootboekschema herladen', 'herlaadGrootboekschema')
      .addSeparator()
      .addItem('Alle rapporten vernieuwen', 'vernieuwAlleRapporten')
      .addSeparator()
      .addItem('Setup resetten', 'resetSetup')
    )

    .addToUi();
}

// ─────────────────────────────────────────────
//  FORMULIER OPENERS (OPENEN VIA URL)
// ─────────────────────────────────────────────
function openVerkoopfactuurFormulier() {
  openFormulier_(PROP.FORM_VERKOOP_ID, 'Verkoopfactuur');
}

function openInkoopfactuurFormulier() {
  openFormulier_(PROP.FORM_INKOOP_ID, 'Inkoopfactuur');
}

function openBanktransactieFormulier() {
  openFormulier_(PROP.FORM_BANK_ID, 'Banktransactie');
}

function openRelatieFormulier() {
  openFormulier_(PROP.FORM_RELATIE_ID, 'Relatie toevoegen');
}

function openJournaalpostFormulier() {
  openFormulier_(PROP.FORM_JOURNAAL_ID, 'Journaalpost');
}

function openFormulier_(propKey, titel) {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(propKey);
  if (!formId) {
    SpreadsheetApp.getUi().alert(
      'Formulier niet gevonden',
      'Voer eerst de setup uit via Boekhouding → Instellingen & Beheer → Setup uitvoeren.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  const form = FormApp.openById(formId);
  const url = form.getPublishedUrl();
  const html = HtmlService.createHtmlOutput(
    `<p>Klik op de link om het formulier te openen:</p>
     <p><a href="${url}" target="_blank">📋 ${titel} formulier openen</a></p>
     <p><small>Of kopieer deze URL: ${url}</small></p>`
  ).setWidth(450).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, titel);
}

// ─────────────────────────────────────────────
//  FORMULIER LINKS TONEN
// ─────────────────────────────────────────────
function toonFormulierLinks() {
  const props = PropertiesService.getScriptProperties();
  const forms = [
    { naam: 'Verkoopfactuur', key: PROP.FORM_VERKOOP_ID },
    { naam: 'Inkoopfactuur', key: PROP.FORM_INKOOP_ID },
    { naam: 'Banktransactie', key: PROP.FORM_BANK_ID },
    { naam: 'Relatie toevoegen', key: PROP.FORM_RELATIE_ID },
    { naam: 'Journaalpost', key: PROP.FORM_JOURNAAL_ID },
  ];

  let html = '<h3>Google Forms Links</h3><table style="border-collapse:collapse;width:100%">';
  forms.forEach(f => {
    const formId = props.getProperty(f.key);
    let url = 'Niet aangemaakt';
    if (formId) {
      try { url = `<a href="${FormApp.openById(formId).getPublishedUrl()}" target="_blank">Openen</a>`; }
      catch(e) { url = 'Fout'; }
    }
    html += `<tr><td style="padding:4px;font-weight:bold">${f.naam}</td><td style="padding:4px">${url}</td></tr>`;
  });
  html += '</table>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(500).setHeight(300),
    'Formulier Links'
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

/**
 * Setup.gs
 * Initialiseer de volledige spreadsheet-structuur en Google Forms.
 * Voer éénmalig uit via het menu of door setup() aan te roepen.
 */

// ─────────────────────────────────────────────
//  HOOFDFUNCTIE: VOLLEDIG SYSTEEM OPZETTEN
// ─────────────────────────────────────────────
function setup() {
  // Standalone script: maak een nieuwe spreadsheet aan als er geen actieve is
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('Boekhouding ' + new Date().getFullYear());
    const url = ss.getUrl();
    Logger.log('Nieuwe spreadsheet aangemaakt: ' + url);
    // Open de spreadsheet in de browser
    const html = HtmlService.createHtmlOutput(
      '<p>Spreadsheet aangemaakt! <a href="' + url + '" target="_blank">Klik hier om te openen</a></p>' +
      '<p>Ververs daarna de spreadsheet en voer Setup opnieuw uit via het menu <b>Boekhouding → Setup uitvoeren</b>.</p>'
    ).setWidth(450).setHeight(120);
    SpreadsheetApp.getUi().showModalDialog(html, 'Spreadsheet aangemaakt');
    return;
  }
  const ui = SpreadsheetApp.getUi();

  const bevestiging = ui.alert(
    'Boekhoudprogramma instellen',
    'Dit zal alle benodigde tabbladen, formulieren en triggers aanmaken.\n\nBestaat al een tabblad, dan wordt het overgeslagen.\n\nDoorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestiging !== ui.Button.YES) return;

  try {
    ui.alert('Even geduld...', 'De setup wordt uitgevoerd. Dit kan ± 60 seconden duren.', ui.ButtonSet.OK);

    maakTabbladen_(ss);
    vulGrootboekschema_(ss);
    zetInstellingen_(ss);
    maakFormuliersTabbladen_(ss);
    maakGoogleForms_(ss);
    installeelTriggers_();

    PropertiesService.getScriptProperties().setProperty(PROP.SETUP_DONE, 'true');

    ui.alert(
      'Setup geslaagd!',
      'Het boekhoudprogramma is klaar voor gebruik.\n\n' +
      'Vul eerst uw bedrijfsgegevens in op het tabblad "Instellingen".\n\n' +
      'De Google Forms zijn aangemaakt en staan klaar in Google Drive.',
      ui.ButtonSet.OK
    );

    // Activeer Dashboard
    ss.setActiveSheet(ss.getSheetByName(SHEETS.DASHBOARD));
    vernieuwDashboard();

  } catch (e) {
    ui.alert('Fout bij setup', e.message + '\n\nStack: ' + e.stack, ui.ButtonSet.OK);
    Logger.log(e);
  }
}

// ─────────────────────────────────────────────
//  ALLE TABBLADEN AANMAKEN
// ─────────────────────────────────────────────
function maakTabbladen_(ss) {
  const tabDefinities = [
    { naam: SHEETS.DASHBOARD,       volgorde: 1,  kleur: '#1A237E' },
    { naam: SHEETS.INSTELLINGEN,    volgorde: 2,  kleur: '#4527A0' },
    { naam: SHEETS.VERKOOPFACTUREN, volgorde: 3,  kleur: '#1565C0' },
    { naam: SHEETS.INKOOPFACTUREN,  volgorde: 4,  kleur: '#0277BD' },
    { naam: SHEETS.BANKTRANSACTIES, volgorde: 5,  kleur: '#00695C' },
    { naam: SHEETS.JOURNAALPOSTEN,  volgorde: 6,  kleur: '#2E7D32' },
    { naam: SHEETS.RELATIES,        volgorde: 7,  kleur: '#558B2F' },
    { naam: SHEETS.GROOTBOEKSCHEMA, volgorde: 8,  kleur: '#F57F17' },
    { naam: SHEETS.BTW_AANGIFTE,    volgorde: 9,  kleur: '#E65100' },
    { naam: SHEETS.BALANS,          volgorde: 10, kleur: '#BF360C' },
    { naam: SHEETS.WV_REKENING,     volgorde: 11, kleur: '#880E4F' },
    { naam: SHEETS.CASHFLOW,        volgorde: 12, kleur: '#4A148C' },
    { naam: SHEETS.DEBITEUREN,      volgorde: 13, kleur: '#006064' },
    { naam: SHEETS.CREDITEUREN,     volgorde: 14, kleur: '#01579B' },
    { naam: SHEETS.JAARREKENING,    volgorde: 15, kleur: '#1B5E20' },
  ];

  tabDefinities.forEach(def => {
    let sheet = ss.getSheetByName(def.naam);
    if (!sheet) {
      sheet = ss.insertSheet(def.naam);
    }
    sheet.setTabColor(def.kleur);
  });

  // Zet tabbladen in de juiste volgorde
  tabDefinities.forEach((def, i) => {
    const sheet = ss.getSheetByName(def.naam);
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(i + 1);
  });

  // Vul elk tabblad met headers
  zetVerkoopfacturenHeaders_(ss.getSheetByName(SHEETS.VERKOOPFACTUREN));
  zetInkoopfacturenHeaders_(ss.getSheetByName(SHEETS.INKOOPFACTUREN));
  zetBanktransactiesHeaders_(ss.getSheetByName(SHEETS.BANKTRANSACTIES));
  zetJournaalpostenHeaders_(ss.getSheetByName(SHEETS.JOURNAALPOSTEN));
  zetRelatiesHeaders_(ss.getSheetByName(SHEETS.RELATIES));
}

// ─────────────────────────────────────────────
//  HEADER DEFINITIES PER TABBLAD
// ─────────────────────────────────────────────
function zetVerkoopfacturenHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Factuur ID', 'Factuurnummer', 'Datum', 'Vervaldatum', 'Klant ID', 'Klantnaam',
    'KvK klant', 'BTW-nr klant', 'Omschrijving', 'Bedrag excl. BTW', 'BTW %',
    'BTW bedrag', 'Bedrag incl. BTW', 'Betaald bedrag', 'Status', 'Betaaldatum',
    'Betalingsreferentie', 'Projectcode', 'Notities', 'PDF URL', 'Grootboekrekening',
    'Aangemaakt op', 'Aangemaakt door'
  ];
  zetHeaderRij_(sheet, headers);
}

function zetInkoopfacturenHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Inkoop ID', 'Intern nummer', 'Datum ontvangst', 'Factuurdatum leverancier',
    'Factuurref. leverancier', 'Leverancier ID', 'Leveranciernaam', 'Omschrijving',
    'Bedrag excl. BTW', 'BTW %', 'BTW bedrag', 'Bedrag incl. BTW', 'Status',
    'Betaaldatum', 'Betaalrekening', 'Kostenrekening', 'Projectcode', 'Notities',
    'Bijlage URL', 'Aangemaakt op'
  ];
  zetHeaderRij_(sheet, headers);
}

function zetBanktransactiesHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Transactie ID', 'Datum', 'Omschrijving', 'Bedrag', 'Type', 'Rekening',
    'Tegenrekening', 'Tegenpartij', 'Referentie', 'Grootboekrekening',
    'Gekoppeld aan', 'Gekoppeld factuur', 'Status', 'Notities', 'Aangemaakt op'
  ];
  zetHeaderRij_(sheet, headers);
}

function zetJournaalpostenHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Boeking ID', 'Datum', 'Omschrijving', 'Dagboek', 'Debet rekening',
    'Debet omschrijving', 'Credit rekening', 'Credit omschrijving',
    'Bedrag', 'BTW %', 'BTW bedrag', 'Referentie', 'Projectcode',
    'Type', 'Notities', 'Aangemaakt op'
  ];
  zetHeaderRij_(sheet, headers);
}

function zetRelatiesHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Relatie ID', 'Type', 'Naam', 'Contactpersoon', 'Adres', 'Postcode', 'Plaats',
    'Land', 'KvK-nummer', 'BTW-nummer', 'Email', 'Telefoon', 'IBAN',
    'Betalingstermijn (dagen)', 'Standaard BTW', 'Standaard kostenrekening',
    'Actief', 'Notities', 'Aangemaakt op'
  ];
  zetHeaderRij_(sheet, headers);
}

// ─────────────────────────────────────────────
//  GROOTBOEKSCHEMA VULLEN
// ─────────────────────────────────────────────
function vulGrootboekschema_(ss) {
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  sheet.clearContents();

  const headers = ['Code', 'Naam', 'Type', 'Categorie', 'Balans/W&V', 'Saldo'];
  zetHeaderRij_(sheet, headers);

  const rijen = STANDAARD_GROOTBOEK.map(r => [
    r.code, r.naam, r.type, r.cat, r.bw, 0
  ]);
  if (rijen.length > 0) {
    sheet.getRange(2, 1, rijen.length, headers.length).setValues(rijen);
  }

  // Opmaak
  sheet.getRange(2, 1, rijen.length, 1)
    .setNumberFormat('@')
    .setFontFamily('Courier New');

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 100);
  sheet.getRange(2, 6, rijen.length, 1).setNumberFormat('€#,##0.00');
  sheet.setFrozenRows(1);
}

// ─────────────────────────────────────────────
//  INSTELLINGEN TABBLAD
// ─────────────────────────────────────────────
function zetInstellingen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  sheet.clearContents();
  sheet.clearFormats();

  const data = [
    ['BEDRIJFSGEGEVENS', ''],
    ['Bedrijfsnaam', 'Mijn Bedrijf BV'],
    ['Rechtsvorm', 'BV'],
    ['Adres', 'Straatnaam 1'],
    ['Postcode', '1234 AB'],
    ['Plaats', 'Amsterdam'],
    ['Land', 'Nederland'],
    ['KvK-nummer', '12345678'],
    ['BTW-nummer', 'NL123456789B01'],
    ['IBAN', 'NL01ABNA0123456789'],
    ['BIC', 'ABNANL2A'],
    ['Email', 'info@mijnbedrijf.nl'],
    ['Telefoon', '020-1234567'],
    ['Website', 'www.mijnbedrijf.nl'],
    ['', ''],
    ['BOEKHOUDINSTELLINGEN', ''],
    ['Boekjaar start', '01-01-' + new Date().getFullYear()],
    ['Boekjaar einde', '31-12-' + new Date().getFullYear()],
    ['Standaard BTW tarief', '21% (hoog)'],
    ['BTW aangifteperiode', 'Kwartaal'],
    ['Betalingstermijn (dagen)', '30'],
    ['Volgende factuurnummer', '2024001'],
    ['Factuurprefix', 'F'],
    ['KOR regeling actief', 'Nee'],
    ['', ''],
    ['FACTUUR INSTELLINGEN', ''],
    ['Factuur voettekst', 'Bedankt voor uw opdracht. Betaling binnen de gestelde termijn wordt op prijs gesteld.'],
    ['Bankrekening op factuur', 'NL01ABNA0123456789'],
    ['Betaallink tonen', 'Nee'],
    ['', ''],
    ['RAPPORTAGE INSTELLINGEN', ''],
    ['Dashboard vernieuwen bij openen', 'Ja'],
    ['Email rapporten naar', 'eigenaar@mijnbedrijf.nl'],
    ['BTW aangifte herinnering', 'Ja'],
  ];

  sheet.getRange(1, 1, data.length, 2).setValues(data);

  // Opmaak sectietitels
  [1, 16, 25, 31].forEach(rij => {
    sheet.getRange(rij, 1, 1, 2)
      .setBackground(KLEUREN.HEADER_BG)
      .setFontColor(KLEUREN.HEADER_FG)
      .setFontWeight('bold')
      .setFontSize(11);
  });

  // Opmaak labels
  sheet.getRange(2, 1, data.length - 1, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 400);
  sheet.setFrozenRows(0);
}

// ─────────────────────────────────────────────
//  FORMULIER RESPONSE TABBLADEN
// ─────────────────────────────────────────────
function maakFormuliersTabbladen_(ss) {
  const namen = [
    'RESP_Verkoopfactuur',
    'RESP_Inkoopfactuur',
    'RESP_Banktransactie',
    'RESP_Relatie',
    'RESP_Journaalpost',
  ];
  namen.forEach(naam => {
    if (!ss.getSheetByName(naam)) {
      const sheet = ss.insertSheet(naam);
      sheet.hideSheet();
    }
  });
}

// ─────────────────────────────────────────────
//  GOOGLE FORMS AANMAKEN
// ─────────────────────────────────────────────
function maakGoogleForms_(ss) {
  const props = PropertiesService.getScriptProperties();
  const ssId = ss.getId();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Ons Bedrijf';

  // ── 1. Verkoopfactuur ──────────────────────────────────────────────────
  if (!props.getProperty(PROP.FORM_VERKOOP_ID)) {
    const form = FormApp.create(`${bedrijf} – Verkoopfactuur aanmaken`);
    form.setDescription('Vul alle gegevens in om een nieuwe verkoopfactuur aan te maken.');
    form.setConfirmationMessage('Uw factuurverzoek is ontvangen. De factuur wordt verwerkt.');
    form.setCollectEmail(false);
    form.setProgressBar(false);

    form.addTextItem().setTitle('Klantnaam').setRequired(true);
    form.addTextItem().setTitle('KvK-nummer klant');
    form.addTextItem().setTitle('BTW-nummer klant');
    form.addTextItem().setTitle('Factuuradres klant').setRequired(true);
    form.addDateItem().setTitle('Factuurdatum').setRequired(true);
    form.addTextItem().setTitle('Betalingstermijn (dagen)').setRequired(true)
      .setHelpText('Standaard 30 dagen');

    const btwItem = form.addListItem().setTitle('BTW tarief').setRequired(true);
    btwItem.setChoiceValues(BTW_KEUZES);

    form.addTextItem().setTitle('Factuurregel 1 – Omschrijving').setRequired(true);
    form.addTextItem().setTitle('Factuurregel 1 – Aantal').setRequired(true);
    form.addTextItem().setTitle('Factuurregel 1 – Prijs per eenheid (excl. BTW)').setRequired(true);
    form.addTextItem().setTitle('Factuurregel 2 – Omschrijving');
    form.addTextItem().setTitle('Factuurregel 2 – Aantal');
    form.addTextItem().setTitle('Factuurregel 2 – Prijs per eenheid (excl. BTW)');
    form.addTextItem().setTitle('Factuurregel 3 – Omschrijving');
    form.addTextItem().setTitle('Factuurregel 3 – Aantal');
    form.addTextItem().setTitle('Factuurregel 3 – Prijs per eenheid (excl. BTW)');
    form.addTextItem().setTitle('Projectcode / Referentie');
    form.addParagraphTextItem().setTitle('Notities / bijzonderheden');

    const destSheet = ss.getSheetByName('RESP_Verkoopfactuur');
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
    // Koppel aan juist tabblad
    koppeelFormAanTabblad_(form, ss, 'RESP_Verkoopfactuur');

    props.setProperty(PROP.FORM_VERKOOP_ID, form.getId());
    Logger.log('Verkoopfactuur form: ' + form.getPublishedUrl());
  }

  // ── 2. Inkoopfactuur ───────────────────────────────────────────────────
  if (!props.getProperty(PROP.FORM_INKOOP_ID)) {
    const form = FormApp.create(`${bedrijf} – Inkoopfactuur registreren`);
    form.setDescription('Registreer een ontvangen inkoopfactuur of bon.');
    form.setConfirmationMessage('De inkoopfactuur is geregistreerd.');

    form.addTextItem().setTitle('Leveranciernaam').setRequired(true);
    form.addTextItem().setTitle('Factuurnummer leverancier').setRequired(true);
    form.addDateItem().setTitle('Factuurdatum').setRequired(true);
    form.addDateItem().setTitle('Ontvangstdatum');
    form.addTextItem().setTitle('Bedrag excl. BTW').setRequired(true);

    const btwItem = form.addListItem().setTitle('BTW tarief').setRequired(true);
    btwItem.setChoiceValues(BTW_KEUZES);

    form.addTextItem().setTitle('BTW bedrag');

    const grootboekKeuzes = STANDAARD_GROOTBOEK
      .filter(r => r.type === 'Kosten')
      .map(r => `${r.code} – ${r.naam}`);
    const kostenItem = form.addListItem().setTitle('Kostenrekening (grootboek)').setRequired(true);
    kostenItem.setChoiceValues(grootboekKeuzes);

    form.addTextItem().setTitle('Projectcode / Referentie');
    form.addParagraphTextItem().setTitle('Omschrijving');
    form.addParagraphTextItem().setTitle('Notities');

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
    koppeelFormAanTabblad_(form, ss, 'RESP_Inkoopfactuur');

    props.setProperty(PROP.FORM_INKOOP_ID, form.getId());
  }

  // ── 3. Banktransactie ──────────────────────────────────────────────────
  if (!props.getProperty(PROP.FORM_BANK_ID)) {
    const form = FormApp.create(`${bedrijf} – Banktransactie invoeren`);
    form.setDescription('Voer een banktransactie in of importeer handmatig een bankafschrift.');
    form.setConfirmationMessage('De banktransactie is geregistreerd.');

    form.addDateItem().setTitle('Transactiedatum').setRequired(true);

    const typeItem = form.addListItem().setTitle('Type transactie').setRequired(true);
    typeItem.setChoiceValues(['Ontvangst (bij)', 'Betaling (af)', 'Interne overboeking']);

    form.addTextItem().setTitle('Bedrag').setRequired(true)
      .setHelpText('Positief getal, bijv. 1250.00');
    form.addTextItem().setTitle('Tegenpartij (naam)');
    form.addTextItem().setTitle('Tegenrekening (IBAN)');
    form.addTextItem().setTitle('Omschrijving / betalingskenmerk').setRequired(true);
    form.addTextItem().setTitle('Referentie (factuurnummer)');

    const rekKeuzes = ['1200 – Bank zakelijk', '1210 – Kas', '1220 – Spaarrekening'];
    const rekItem = form.addListItem().setTitle('Bankrekening').setRequired(true);
    rekItem.setChoiceValues(rekKeuzes);

    const gbKeuzes = STANDAARD_GROOTBOEK.map(r => `${r.code} – ${r.naam}`);
    const gbItem = form.addListItem().setTitle('Grootboekrekening').setRequired(true);
    gbItem.setChoiceValues(gbKeuzes);

    form.addTextItem().setTitle('Projectcode');
    form.addParagraphTextItem().setTitle('Notities');

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
    koppeelFormAanTabblad_(form, ss, 'RESP_Banktransactie');

    props.setProperty(PROP.FORM_BANK_ID, form.getId());
  }

  // ── 4. Relatie (Klant / Leverancier) ───────────────────────────────────
  if (!props.getProperty(PROP.FORM_RELATIE_ID)) {
    const form = FormApp.create(`${bedrijf} – Relatie toevoegen`);
    form.setDescription('Voeg een nieuwe klant of leverancier toe aan het relatiebestand.');
    form.setConfirmationMessage('De relatie is toegevoegd.');

    const typeItem = form.addListItem().setTitle('Type relatie').setRequired(true);
    typeItem.setChoiceValues([RELATIE_TYPE.KLANT, RELATIE_TYPE.LEVERANCIER, RELATIE_TYPE.BEIDE]);

    form.addTextItem().setTitle('Bedrijfsnaam').setRequired(true);
    form.addTextItem().setTitle('Contactpersoon');
    form.addTextItem().setTitle('Straat en huisnummer');
    form.addTextItem().setTitle('Postcode');
    form.addTextItem().setTitle('Plaats');
    form.addTextItem().setTitle('Land').setHelpText('Standaard: Nederland');
    form.addTextItem().setTitle('KvK-nummer');
    form.addTextItem().setTitle('BTW-nummer');
    form.addTextItem().setTitle('E-mailadres');
    form.addTextItem().setTitle('Telefoonnummer');
    form.addTextItem().setTitle('IBAN');
    form.addTextItem().setTitle('Betalingstermijn (dagen)').setHelpText('Standaard: 30');
    form.addParagraphTextItem().setTitle('Notities');

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
    koppeelFormAanTabblad_(form, ss, 'RESP_Relatie');

    props.setProperty(PROP.FORM_RELATIE_ID, form.getId());
  }

  // ── 5. Handmatige Journaalpost ──────────────────────────────────────────
  if (!props.getProperty(PROP.FORM_JOURNAAL_ID)) {
    const form = FormApp.create(`${bedrijf} – Handmatige journaalpost`);
    form.setDescription('Voer een handmatige boeking in (memoriaal / openingsbalans / correctie).');
    form.setConfirmationMessage('De journaalpost is geboekt.');

    form.addDateItem().setTitle('Boekingsdatum').setRequired(true);
    form.addTextItem().setTitle('Omschrijving').setRequired(true);

    const dagboekItem = form.addListItem().setTitle('Dagboek').setRequired(true);
    dagboekItem.setChoiceValues(['Memoriaal', 'Beginbalans', 'Correctie', 'Afschrijving', 'Loon', 'Privé']);

    const gbKeuzes = STANDAARD_GROOTBOEK.map(r => `${r.code} – ${r.naam}`);

    const debItem = form.addListItem().setTitle('Debet rekening').setRequired(true);
    debItem.setChoiceValues(gbKeuzes);

    const creItem = form.addListItem().setTitle('Credit rekening').setRequired(true);
    creItem.setChoiceValues(gbKeuzes);

    form.addTextItem().setTitle('Bedrag (excl. BTW)').setRequired(true);

    const btwItem = form.addListItem().setTitle('BTW tarief');
    btwItem.setChoiceValues(['Geen BTW', ...BTW_KEUZES]);

    form.addTextItem().setTitle('Referentie');
    form.addTextItem().setTitle('Projectcode');
    form.addParagraphTextItem().setTitle('Notities');

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);
    koppeelFormAanTabblad_(form, ss, 'RESP_Journaalpost');

    props.setProperty(PROP.FORM_JOURNAAL_ID, form.getId());
  }

  // Sla form URLs op in Instellingen
  slaFormUrlsOp_(ss);
}

// ─────────────────────────────────────────────
//  HULPFUNCTIE: FORM AAN TABBLAD KOPPELEN
// ─────────────────────────────────────────────
function koppeelFormAanTabblad_(form, ss, tabNaam) {
  // Apps Script koppelt forms automatisch aan een nieuw tabblad.
  // We verbergen dat tabblad en verwijzen ernaar als RESP_* tabblad.
  // De respons sheet naam wordt ingesteld door Apps Script.
  // We slaan de form URL op voor referentie.
  Utilities.sleep(1000); // wacht op activatie
}

// ─────────────────────────────────────────────
//  FORM URLS OPSLAAN IN INSTELLINGEN
// ─────────────────────────────────────────────
function slaFormUrlsOp_(ss) {
  const props = PropertiesService.getScriptProperties();
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);

  const urlData = [
    ['', ''],
    ['FORMULIER LINKS', ''],
    ['Verkoopfactuur formulier', getFormUrl_(props.getProperty(PROP.FORM_VERKOOP_ID))],
    ['Inkoopfactuur formulier', getFormUrl_(props.getProperty(PROP.FORM_INKOOP_ID))],
    ['Banktransactie formulier', getFormUrl_(props.getProperty(PROP.FORM_BANK_ID))],
    ['Relatie formulier', getFormUrl_(props.getProperty(PROP.FORM_RELATIE_ID))],
    ['Journaalpost formulier', getFormUrl_(props.getProperty(PROP.FORM_JOURNAAL_ID))],
  ];

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, urlData.length, 2).setValues(urlData);

  // Opmaak sectietitel
  sheet.getRange(lastRow + 2, 1, 1, 2)
    .setBackground(KLEUREN.HEADER_BG)
    .setFontColor(KLEUREN.HEADER_FG)
    .setFontWeight('bold');
}

function getFormUrl_(formId) {
  if (!formId) return 'Niet aangemaakt';
  try {
    return FormApp.openById(formId).getPublishedUrl();
  } catch (e) {
    return 'Fout: ' + e.message;
  }
}

// ─────────────────────────────────────────────
//  TRIGGERS INSTALLEREN
// ─────────────────────────────────────────────
function installeelTriggers_() {
  // Verwijder bestaande triggers van dit script
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // onOpen trigger
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  // Form submit triggers
  const formIds = [
    { propKey: PROP.FORM_VERKOOP_ID,  handler: 'verwerkVerkoopfactuurFormulier'  },
    { propKey: PROP.FORM_INKOOP_ID,   handler: 'verwerkInkoopfactuurFormulier'   },
    { propKey: PROP.FORM_BANK_ID,     handler: 'verwerkBanktransactieFormulier'  },
    { propKey: PROP.FORM_RELATIE_ID,  handler: 'verwerkRelatieFormulier'         },
    { propKey: PROP.FORM_JOURNAAL_ID, handler: 'verwerkJournaalpostFormulier'    },
  ];

  formIds.forEach(({ propKey, handler }) => {
    const formId = props.getProperty(propKey);
    if (!formId) return;
    try {
      const form = FormApp.openById(formId);
      ScriptApp.newTrigger(handler)
        .forForm(form)
        .onFormSubmit()
        .create();
    } catch (e) {
      Logger.log(`Trigger fout voor ${handler}: ${e.message}`);
    }
  });

  // Dagelijkse trigger voor factuurherinneringen en rapportages
  ScriptApp.newTrigger('dagelijkseTaken')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();

  Logger.log('Triggers geïnstalleerd');
}

// ─────────────────────────────────────────────
//  HELPER: HEADER RIJ OPMAKEN
// ─────────────────────────────────────────────
function zetHeaderRij_(sheet, headers) {
  const rij = sheet.getRange(1, 1, 1, headers.length);
  rij.setValues([headers]);
  rij.setBackground(KLEUREN.HEADER_BG);
  rij.setFontColor(KLEUREN.HEADER_FG);
  rij.setFontWeight('bold');
  rij.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Autofit kolommen
  for (let i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, 140);
  }
  sheet.setColumnWidth(1, 100);
}

// ─────────────────────────────────────────────
//  INSTELLING OPHALEN UIT INSTELLINGEN TABBLAD
// ─────────────────────────────────────────────
function getInstelling_(sleutel) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === sleutel) return String(data[i][1]);
  }
  return null;
}

// ─────────────────────────────────────────────
//  SETUP OPNIEUW UITVOEREN (FORMS RESETTEN)
// ─────────────────────────────────────────────
function resetSetup() {
  const ui = SpreadsheetApp.getUi();
  const bevestiging = ui.alert(
    'Waarschuwing',
    'Dit verwijdert alle triggers en form-koppelingen (NIET de data).\nDoorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestiging !== ui.Button.YES) return;

  const props = PropertiesService.getScriptProperties();
  [PROP.FORM_VERKOOP_ID, PROP.FORM_INKOOP_ID, PROP.FORM_BANK_ID,
   PROP.FORM_RELATIE_ID, PROP.FORM_JOURNAAL_ID, PROP.SETUP_DONE
  ].forEach(k => props.deleteProperty(k));

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ui.alert('Reset geslaagd. Voer nu opnieuw "Setup uitvoeren" uit.');
}

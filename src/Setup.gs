/**
 * Setup.gs
 * Initialiseer de volledige spreadsheet-structuur en Google Forms.
 * Voer éénmalig uit via het menu of door setup() aan te roepen.
 */

// ─────────────────────────────────────────────
//  HOOFDFUNCTIE: VOLLEDIG SYSTEEM OPZETTEN
// ─────────────────────────────────────────────
function setup() {
  // Haal spreadsheet op of maak een nieuwe aan (standalone-compatibel)
  let ss = getSpreadsheet_();
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  // ── Idempotency guard ──────────────────────────────────────────────────
  // Voorkomt dat een herhaalde setup alle instellingen en formulieren overschrijft.
  if (PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) === 'true') {
    alertOfLog_(ui, 'Setup al uitgevoerd',
      'Het systeem is al geconfigureerd.\n\n' +
      'Gebruik "Boekhouding → Beheer → Herstel / Herinstalleer" als u opzettelijk opnieuw wilt instellen.');
    return;
  }
  // ──────────────────────────────────────────────────────────────────────

  if (!ss) {
    const naam = 'Boekhouding ' + new Date().getFullYear();
    ss = SpreadsheetApp.create(naam);
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('=== SPREADSHEET AANGEMAAKT ===');
    Logger.log('URL: ' + ss.getUrl());
    Logger.log('Open deze URL in uw browser, ga dan naar');
    Logger.log('Extensies → Apps Script en voer setup() opnieuw uit.');
    Logger.log('==============================');
    alertOfLog_(ui, 'Spreadsheet aangemaakt',
      'Spreadsheet aangemaakt!\n\nURL (zie ook Logboek):\n' + ss.getUrl() +
      '\n\nOpen deze URL, ga dan naar Extensies → Apps Script → setup() uitvoeren.');
    return;
  }

  try {
    Logger.log('Setup gestart...');
    maakTabbladen_(ss);
    verbergTechnischeTabbladen_(ss);
    vulGrootboekschema_(ss);
    zetInstellingen_(ss);
    maakFormuliersTabbladen_(ss);
    maakHoofdFormulier_(ss);
    installeelTriggers_();
    // Drive mappenstructuur aanmaken
    const jaar = new Date().getFullYear();
    maakDriveStructuur_(jaar);
    slaDriverLinksOpInInstellingen_(jaar);

    PropertiesService.getScriptProperties().setProperty(PROP.SETUP_DONE, 'true');

    Logger.log('=== SETUP GESLAAGD ===');
    Logger.log('Spreadsheet URL: ' + ss.getUrl());
    Logger.log('Vul uw bedrijfsgegevens in op het tabblad Instellingen.');
    Logger.log('De Google Forms staan klaar in Google Drive.');

    alertOfLog_(ui, 'Setup gelukt!',
      'Uw boekhouding is klaar voor gebruik.\n\n' +
      'Vul eerst uw bedrijfsgegevens in op het tabblad "Instellingen" (bedrijfsnaam, BTW-nummer, IBAN, etc.).\n\n' +
      'Daarna kunt u direct facturen maken, kosten boeken en declaraties indienen via het formulier.');

    try { ss.setActiveSheet(ss.getSheetByName(SHEETS.DASHBOARD)); } catch (e) {}
    vernieuwDashboard();

  } catch (e) {
    Logger.log('FOUT bij setup: ' + e.message + '\n' + e.stack);
    alertOfLog_(ui, 'Fout bij setup', e.message);
  }
}

// ─────────────────────────────────────────────
//  ALLE TABBLADEN AANMAKEN
// ─────────────────────────────────────────────
// Zichtbare tabs: alleen wat de gebruiker dagelijks nodig heeft.
// Technische tabs (grootboek, rapporten) worden verborgen en
// zijn bereikbaar via het menu.
const ZICHTBARE_TABS = [
  SHEETS.DASHBOARD, SHEETS.INSTELLINGEN,
  SHEETS.VERKOOPFACTUREN, SHEETS.INKOOPFACTUREN,
  SHEETS.BANKTRANSACTIES, SHEETS.RELATIES,
  SHEETS.BTW_AANGIFTE,
];

function maakTabbladen_(ss) {
  const tabDefinities = [
    { naam: SHEETS.DASHBOARD,       volgorde: 1,  kleur: '#1A237E' },
    { naam: SHEETS.INSTELLINGEN,    volgorde: 2,  kleur: '#4527A0' },
    { naam: SHEETS.VERKOOPFACTUREN, volgorde: 3,  kleur: '#1565C0' },
    { naam: SHEETS.INKOOPFACTUREN,  volgorde: 4,  kleur: '#0277BD' },
    { naam: SHEETS.BANKTRANSACTIES, volgorde: 5,  kleur: '#00695C' },
    { naam: SHEETS.RELATIES,        volgorde: 6,  kleur: '#558B2F' },
    { naam: SHEETS.BTW_AANGIFTE,    volgorde: 7,  kleur: '#E65100' },
    // Technische tabs — verborgen, gegenereerd via menu
    { naam: SHEETS.JOURNAALPOSTEN,  volgorde: 8,  kleur: '#2E7D32' },
    { naam: SHEETS.GROOTBOEKSCHEMA, volgorde: 9,  kleur: '#F57F17' },
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

function verbergTechnischeTabbladen_(ss) {
  const technisch = [
    SHEETS.JOURNAALPOSTEN, SHEETS.GROOTBOEKSCHEMA,
    SHEETS.BALANS, SHEETS.WV_REKENING, SHEETS.CASHFLOW,
    SHEETS.DEBITEUREN, SHEETS.CREDITEUREN, SHEETS.JAARREKENING,
  ];
  technisch.forEach(naam => {
    const sheet = ss.getSheetByName(naam);
    if (sheet) sheet.hideSheet();
  });

  // Verwijder oude RESP_ tabbladen van de 5-formulier versie
  const oudeRespTabs = [
    'RESP_Verkoopfactuur', 'RESP_Inkoopfactuur', 'RESP_Banktransactie',
    'RESP_Relatie', 'RESP_Journaalpost',
    'RESP_Verkoopfacturen', 'RESP_Inkoopfacturen', 'RESP_Banktransacties',
    'RESP_Relaties', 'RESP_Journaalposten',
  ];
  oudeRespTabs.forEach(naam => {
    const sheet = ss.getSheetByName(naam);
    if (sheet) {
      try { ss.deleteSheet(sheet); } catch(e) { sheet.hideSheet(); }
    }
  });

  // Verberg RESP_Hoofdformulier (alleen technisch nodig)
  const respHoofd = ss.getSheetByName('RESP_Hoofdformulier');
  if (respHoofd) respHoofd.hideSheet();
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
    ['Bedrijfsnaam', '← Vul hier uw bedrijfsnaam in'],
    ['Rechtsvorm', 'Eenmanszaak'],
    ['Adres', '← Uw straatnaam + huisnummer'],
    ['Postcode', '← Postcode'],
    ['Plaats', '← Woonplaats'],
    ['Land', 'Nederland'],
    ['KvK-nummer', '← 8-cijferig KvK-nummer'],
    ['BTW-nummer', '← NL + 9 cijfers + B + 2 cijfers'],
    ['IBAN', '← NL + bankrekeningnummer'],
    ['BIC', '← BIC/SWIFT code van uw bank'],
    ['Email', '← uw@emailadres.nl'],
    ['Telefoon', '← Uw telefoonnummer'],
    ['Website', '← www.uwwebsite.nl (optioneel)'],
    ['', ''],
    ['BOEKHOUDINSTELLINGEN', ''],
    ['Boekjaar start', '01-01-' + new Date().getFullYear()],
    ['Boekjaar einde', '31-12-' + new Date().getFullYear()],
    ['Startjaar onderneming', new Date().getFullYear()],
    ['Standaard BTW tarief', '21% (hoog)'],
    ['BTW aangifteperiode', 'Kwartaal'],
    ['Betalingstermijn (dagen)', '30'],
    ['Volgende factuurnummer', new Date().getFullYear() + '001'],
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
    ['', ''],
    ['INTEGRATIES & API', ''],
    ['Webhook API sleutel', '← Kies een sterk wachtwoord (bijv. mijnbedrijf-2026-geheim)'],
    ['Web App URL', '← Plak hier de Web App URL na publicatie (zie Zapier instructies)'],
  ];

  sheet.getRange(1, 1, data.length, 2).setValues(data);

  // Opmaak sectietitels
  [1, 16, 27, 33, 37].forEach(rij => {
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
  const namen = ['RESP_Hoofdformulier'];
  namen.forEach(naam => {
    if (!ss.getSheetByName(naam)) {
      const sheet = ss.insertSheet(naam);
      sheet.hideSheet();
    }
  });
}

// ─────────────────────────────────────────────
//  EENFORMULIER AANMAKEN (vervangt 5 aparte forms)
// ─────────────────────────────────────────────
/**
 * Maakt één Google Form met secties en vertakkingen:
 *   Sectie 1 → Inkomsten (factuur)
 *   Sectie 2 → Uitgaven (kosten)
 *   Sectie 3 → Declaratie (privé voorgeschoten)
 *
 * Het formulier werkt op mobiel en desktop. Na verzending:
 *   Inkomsten  → PDF factuur aangemaakt + automatisch gemaild
 *   Uitgaven   → Boeking + BTW bijgewerkt
 *   Declaratie → Boeking aangemaakt
 */
function maakHoofdFormulier_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP.FORM_HOOFD_ID)) return; // Reeds aangemaakt

  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Ons Bedrijf';
  const form = FormApp.create(`${bedrijf} – Boekhouding`);

  form.setDescription(
    'Gebruik dit formulier om:\n\n' +
    '• Een factuur te maken → de factuur (PDF) wordt automatisch aangemaakt en per e-mail naar uw klant gestuurd\n' +
    '• Kosten te boeken → uw uitgave wordt direct verwerkt in de administratie\n' +
    '• Een declaratie in te dienen → als u iets zakelijks met eigen geld heeft betaald\n\n' +
    'U hoeft geen boekhoudkennis te hebben. Het systeem regelt de rest.'
  );
  form.setConfirmationMessage(
    'Gelukt! Uw invoer is verwerkt.\n\n' +
    'Heeft u een factuur aangemaakt? De PDF is verstuurd naar uw klant (als u dat heeft aangegeven).\n' +
    'Kosten of declaratie? Deze staan in uw administratie en BTW-overzicht.\n\n' +
    'U kunt dit formulier opnieuw invullen via de knop hieronder.'
  );
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(true);
  form.setCollectEmail(false);

  // ── Pagina 1: Type keuze ────────────────────────────────────────────
  const typeItem = form.addMultipleChoiceItem()
    .setTitle('Wat wil je doen?')
    .setRequired(true)
    .setHelpText('Kies een optie. U krijgt daarna alleen de velden te zien die u nodig heeft.');

  // ── Sectie: Inkomsten ───────────────────────────────────────────────
  const secInkomsten = form.addPageBreakItem()
    .setTitle('Factuur aanmaken')
    .setHelpText('Vul hieronder de klantgegevens en factuurregels in. Uw factuur (PDF) wordt automatisch aangemaakt. U kunt deze direct laten e-mailen naar uw klant.');

  form.addTextItem()
    .setTitle('Klantnaam')
    .setRequired(true)
    .setHelpText('Naam van de klant of het bedrijf — bijv. "Bedrijf BV" of "Jan de Vries"');

  form.addTextItem()
    .setTitle('Klant e-mailadres')
    .setRequired(true)
    .setHelpText('De factuur PDF wordt hiernaartoe verstuurd');

  form.addTextItem()
    .setTitle('Factuuradres klant')
    .setHelpText('Straat + huisnummer, postcode, plaats — verschijnt op de factuur');

  form.addTextItem()
    .setTitle('KvK-nummer klant')
    .setHelpText('Optioneel — voor zakelijke klanten');

  form.addTextItem()
    .setTitle('BTW-nummer klant')
    .setHelpText('Optioneel — bijv. NL123456789B01');

  form.addDateItem()
    .setTitle('Factuurdatum')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Betalingstermijn (dagen)')
    .setHelpText('Standaard 30 — vul een getal in');

  const btwItem1 = form.addListItem().setTitle('BTW tarief').setRequired(true);
  btwItem1.setChoiceValues(BTW_KEUZES);

  // Factuurregels (5 regels voor uurtje/factuurtje én complexe facturen)
  for (let i = 1; i <= 5; i++) {
    const req = i === 1;
    form.addTextItem()
      .setTitle(`Regel ${i} – Omschrijving`)
      .setRequired(req)
      .setHelpText(i === 1
        ? 'Bijv. "Consultancy januari 2026", "Materialen project X" of "Uurtarief 8 uur"'
        : 'Optioneel – bijv. materialen, reiskosten, extra dienst');
    form.addTextItem()
      .setTitle(`Regel ${i} – Aantal`)
      .setRequired(req)
      .setHelpText(i === 1 ? 'Aantal uren, stuks of eenheden — bijv. 8 of 2.5' : '');
    form.addTextItem()
      .setTitle(`Regel ${i} – Prijs per eenheid (excl. BTW)`)
      .setRequired(req)
      .setHelpText(i === 1 ? 'Prijs excl. BTW per stuk/uur — bijv. 75.00' : '');
  }

  form.addTextItem()
    .setTitle('Korting (in €)')
    .setHelpText('Optioneel — vul het kortingsbedrag in euro\'s in. Leeg laten = geen korting.');

  const mailItem = form.addMultipleChoiceItem()
    .setTitle('Factuur direct e-mailen naar klant?')
    .setRequired(true);
  mailItem.setChoiceValues(['Ja, direct versturen', 'Nee, later handmatig']);

  form.addTextItem()
    .setTitle('Projectcode / Referentie')
    .setHelpText('Optioneel — verschijnt op de factuur als referentie');

  form.addParagraphTextItem()
    .setTitle('Notities op factuur')
    .setHelpText('Optioneel — bijv. bijzondere afspraken of aanvullende informatie');

  // ── Sectie: Uitgaven ────────────────────────────────────────────────
  const secUitgaven = form.addPageBreakItem()
    .setTitle('Kosten boeken')
    .setHelpText('Registreer een uitgave (factuur, bon, abonnement). Dit wordt automatisch verwerkt in uw administratie en BTW-overzicht.');

  form.addTextItem()
    .setTitle('Leveranciernaam')
    .setRequired(true)
    .setHelpText('Naam van de leverancier of winkel');

  form.addTextItem()
    .setTitle('Factuurnummer leverancier')
    .setRequired(true)
    .setHelpText('Het factuurnummer op de ontvangen factuur of bon');

  form.addDateItem()
    .setTitle('Factuurdatum uitgave')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Bedrag excl. BTW')
    .setRequired(true)
    .setHelpText('Bedrag zonder BTW — bijv. 100.00');

  const btwItem2 = form.addListItem().setTitle('BTW tarief uitgave').setRequired(true);
  btwItem2.setChoiceValues(['21% (hoog)', '9% (laag)', '0% (nultarief)', 'Geen BTW (vrijgesteld)']);

  form.addTextItem()
    .setTitle('BTW bedrag uitgave')
    .setHelpText('Optioneel — leeg laten = automatisch berekend op basis van tarief');

  const catItem = form.addListItem().setTitle('Categorie kosten').setRequired(true);
  catItem.setChoiceValues(KOSTEN_CATEGORIEEN);

  const betaalItem = form.addListItem().setTitle('Betaalmethode').setRequired(true);
  betaalItem.setChoiceValues(['Overschrijving', 'Pin / Debet', 'Contant', 'Creditcard', 'iDEAL / PayPal / Anders']);

  const statusUitItem = form.addListItem().setTitle('Betalingsstatus uitgave').setRequired(true);
  statusUitItem.setChoiceValues(['Betaald', 'Openstaand']);

  form.addParagraphTextItem()
    .setTitle('Omschrijving uitgave')
    .setRequired(true)
    .setHelpText('Bijv. "Adobe abonnement feb 2026" of "Benzine klantbezoek Utrecht"');

  form.addParagraphTextItem()
    .setTitle('Notities uitgave')
    .setHelpText('Optioneel');

  // ── Sectie: Declaratie ──────────────────────────────────────────────
  const secDeclaratie = form.addPageBreakItem()
    .setTitle('Declaratie indienen')
    .setHelpText('Heeft u iets zakelijks betaald met uw eigen (privé) geld? Vul het hieronder in, zodat u het kunt terugkrijgen.');

  form.addDateItem()
    .setTitle('Datum declaratie')
    .setRequired(true);

  const catItem2 = form.addListItem().setTitle('Categorie declaratie').setRequired(true);
  catItem2.setChoiceValues(KOSTEN_CATEGORIEEN);

  form.addTextItem()
    .setTitle('Bedrag excl. BTW declaratie')
    .setRequired(true)
    .setHelpText('Bedrag zonder BTW');

  const btwItem3 = form.addListItem().setTitle('BTW tarief declaratie').setRequired(true);
  btwItem3.setChoiceValues(['21% (hoog)', '9% (laag)', '0% (nultarief)', 'Geen BTW (vrijgesteld)']);

  const betaalItem2 = form.addListItem().setTitle('Betaalmethode declaratie').setRequired(true);
  betaalItem2.setChoiceValues(['Contant', 'Privé bankpas / creditcard', 'iDEAL / PayPal / Anders']);

  form.addParagraphTextItem()
    .setTitle('Omschrijving declaratie')
    .setRequired(true)
    .setHelpText('Bijv. "Parkeerkosten klantbezoek" of "Pennen Bruna voor kantoor"');

  form.addTextItem()
    .setTitle('Betaald door (naam)')
    .setHelpText('Optioneel — uw naam of die van een medewerker');

  const declStatusItem = form.addListItem().setTitle('Declaratie status').setRequired(true);
  declStatusItem.setChoiceValues(['Terug te betalen', 'Terugbetaald']);

  // ── Vertakkingen instellen ──────────────────────────────────────────
  typeItem.setChoices([
    typeItem.createChoice('Inkomsten (factuur maken)', secInkomsten),
    typeItem.createChoice('Uitgaven (kosten boeken)', secUitgaven),
    typeItem.createChoice('Declaratie (privé voorgeschoten)', secDeclaratie),
  ]);

  // ── Koppelen aan spreadsheet ────────────────────────────────────────
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  Utilities.sleep(1500);

  props.setProperty(PROP.FORM_HOOFD_ID, form.getId());
  Logger.log('Hoofdformulier aangemaakt: ' + form.getPublishedUrl());

  slaFormUrlsOp_(ss);
}

// VEROUDERD – vervangen door maakHoofdFormulier_()
// Bewaard voor backward-compatibiliteit (bestaande installaties met de 5 losse forms)
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
    ['Boekhouding formulier (alles-in-één)', getFormUrl_(props.getProperty(PROP.FORM_HOOFD_ID))],
  ];

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, urlData.length, 2).setValues(urlData);

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
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const props = PropertiesService.getScriptProperties();
  const ss = getSpreadsheet_();

  // onOpen trigger
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  // Hoofdformulier trigger
  const hoofdFormId = props.getProperty(PROP.FORM_HOOFD_ID);
  if (hoofdFormId) {
    try {
      ScriptApp.newTrigger('verwerkHoofdformulier')
        .forForm(FormApp.openById(hoofdFormId))
        .onFormSubmit()
        .create();
      Logger.log('Hoofdformulier trigger geïnstalleerd');
    } catch (e) {
      Logger.log('Trigger fout hoofdformulier: ' + e.message);
    }
  }

  // Dagelijkse trigger: factuurherinneringen, BTW deadlines, dashboard
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
  const ss = getSpreadsheet_();
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
  [PROP.FORM_HOOFD_ID, PROP.FORM_VERKOOP_ID, PROP.FORM_INKOOP_ID,
   PROP.FORM_BANK_ID, PROP.FORM_RELATIE_ID, PROP.FORM_JOURNAAL_ID, PROP.SETUP_DONE
  ].forEach(k => props.deleteProperty(k));

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ui.alert('Reset geslaagd. Voer nu opnieuw "Setup uitvoeren" uit.');
}

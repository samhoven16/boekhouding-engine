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
  if (PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) === 'true') {
    alertOfLog_(ui, 'Setup is al klaar',
      'Je boekhouding draait al — niks meer te doen hier.\n\n' +
      'Wil je toch helemaal opnieuw beginnen? Ga naar:\n' +
      'Boekhouding → Instellingen → Setup opnieuw uitvoeren (reset)');
    return;
  }
  // ──────────────────────────────────────────────────────────────────────

  // ── Drive-quota pre-check ──────────────────────────────────────────────
  // Voorheen: setup() probeerde createFolder/createFile zonder quota-check.
  // Bij 0 MB vrij faalde stap 8 silent → klant zat met half-werkende installatie.
  // Nu: hard fail vooraf met duidelijke fix-instructie.
  try {
    if (typeof DriveApp !== 'undefined' && DriveApp.getStorageLimit && DriveApp.getStorageUsed) {
      const limiet = DriveApp.getStorageLimit();
      const gebruikt = DriveApp.getStorageUsed();
      const vrij = limiet - gebruikt;
      // 50 MB minimum: PDFs, backups, formulier-templates passen ruim
      if (vrij > 0 && vrij < 50 * 1024 * 1024) {
        const vrijMb = Math.round(vrij / (1024 * 1024));
        alertOfLog_(ui, '⚠️ Te weinig Drive-opslag',
          'Setup heeft minimaal 50 MB Drive-opslag nodig voor PDFs + backups.\n' +
          'Je hebt nu ' + vrijMb + ' MB vrij.\n\n' +
          'Fix: maak ruimte vrij in Google Drive (drive.google.com) of upgrade ' +
          'naar Google One. Run setup() opnieuw zodra je ruimte hebt.');
        return;
      }
    }
  } catch (e) {
    Logger.log('Drive-quota check overgeslagen: ' + e.message);
  }
  // ──────────────────────────────────────────────────────────────────────

  // ── Licentiecontrole ───────────────────────────────────────────────────
  // Als er een licentieserver geconfigureerd is, verplicht de gebruiker
  // een geldige sleutel in te voeren vóór de setup verder gaat.
  if (getLicentieServerUrl_()) {
    if (!isLicentieGeldig_()) {
      if (ui) {
        toonLicentieDialoog();
        // Controleer nogmaals na de dialoog; gebruiker kan geannuleerd hebben
        if (!isLicentieGeldig_()) {
          alertOfLog_(ui, 'Licentie vereist',
            'U heeft een geldige licentiesleutel nodig om de setup te starten.\n\n' +
            'Ga naar Boekhouding → Licentie activeren en voer uw sleutel in.');
          return;
        }
      } else {
        Logger.log('Setup afgebroken: geen geldige licentie.');
        return;
      }
    }
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

    // Elke stap krijgt een label zodat een crash exact vertelt
    // waar het misging. Fail-fast: stop bij eerste fout.
    const jaar = new Date().getFullYear();
    const stappen = [
      ['Tabbladen aanmaken',        function() { maakTabbladen_(ss); }],
      ['Technische tabs verbergen', function() { verbergTechnischeTabbladen_(ss); }],
      ['Grootboekschema laden',     function() { vulGrootboekschema_(ss); }],
      ['Instellingen initialiseren', function() { zetInstellingen_(ss); }],
      ['Slimme defaults invullen',  function() {
        // Vult Email + Webhook-secret automatisch op basis van wat we al
        // weten (Session-user, random secret). Idempotent — overschrijft
        // nooit klant-input.
        if (typeof vulSlimmeDefaultsIn_ === 'function') {
          vulSlimmeDefaultsIn_();
        }
      }],
      ['Belasting-overrides toevoegen', function() {
        if (typeof voegBelastingOverridesToeAanInstellingen_ === 'function') {
          voegBelastingOverridesToeAanInstellingen_();
        }
      }],
      ['Audit Log aanmaken',        function() { setupAuditLogSheet_(); }],
      ['Urenregistratie',           function() {
        if (typeof setupUrenregistratieSheet_ === 'function') setupUrenregistratieSheet_();
      }],
      ['Help & Compliance tab',     function() {
        if (typeof bouwHelpTab_ === 'function') bouwHelpTab_(ss);
      }],
      ['Formuliers-tabs aanmaken',  function() { maakFormuliersTabbladen_(ss); }],
      ['Hoofdformulier aanmaken',   function() { maakHoofdFormulier_(ss); }],
      ['Werkruimte ordenen',        function() { herorganiseerWerkruimteSilent_(ss); }],
      ['Cellen beschermen',         function() { beschermCellen_(ss); }],
      ['Triggers installeren',      function() { installeelTriggers_(); }],
      ['Drive-structuur aanmaken',  function() { maakDriveStructuur_(jaar); }],
      ['Drive-links opslaan',       function() { slaDriverLinksOpInInstellingen_(jaar); }],
    ];

    // UX: toon klant direct dat setup gestart is — voorkomt "doet ie nog wat?" angst.
    // Toast verschijnt rechtsonder ~5 sec, niet-blokkerend.
    try { ss.toast('Even geduld — eerste setup duurt ~1-3 minuten', 'Boekhoudbaar — Setup gestart', 6); } catch (_) {}

    for (let i = 0; i < stappen.length; i++) {
      const label = stappen[i][0];
      const fn    = stappen[i][1];
      try {
        Logger.log('Setup-stap ' + (i + 1) + '/' + stappen.length + ': ' + label);
        // UX: live progress-toast per stap. Klant ziet exact wat gebeurt
        // en hoeveel stappen er nog over zijn.
        try {
          ss.toast(
            label,
            'Setup — stap ' + (i + 1) + ' van ' + stappen.length,
            10
          );
        } catch (_) {}
        fn();
      } catch (stapErr) {
        const melding = 'Setup gestopt bij stap ' + (i + 1) + ' van ' + stappen.length +
                        ' (' + label + '): ' + stapErr.message;
        Logger.log('::error:: ' + melding + '\n' + (stapErr.stack || ''));
        // Klant ziet exacte stap waar het misging — niet alleen in log
        try { ss.toast('FOUT bij stap ' + (i + 1) + ': ' + label + ' — ' + stapErr.message, 'Setup gestopt', 30); } catch (_) {}
        // Herkenbaar voor de eigenaar in support-ticket: stap-nummer + stap-naam
        throw new Error(melding);
      }
    }

    // POST-INSTALL WATCHDOG: verifieer dat critical infrastructure echt werkt
    // voordat we SETUP_DONE markeren. Voorheen kon setup "slagen" met 0 triggers
    // of zonder hoofdformulier → klant ziet nooit foutmelding, features stil kapot.
    const watchdogFouten = [];
    try {
      const trigs = ScriptApp.getProjectTriggers();
      if (trigs.length === 0) {
        watchdogFouten.push('GEEN triggers geïnstalleerd — onEdit/dagelijks werkt niet');
      }
    } catch (e) {
      watchdogFouten.push('Trigger-check faalde: ' + e.message);
    }
    try {
      const verwacht = [SHEETS.DASHBOARD, SHEETS.INSTELLINGEN, SHEETS.VERKOOPFACTUREN, SHEETS.INKOOPFACTUREN, SHEETS.JOURNAALPOSTEN];
      verwacht.forEach(function(naam) {
        if (!ss.getSheetByName(naam)) watchdogFouten.push('Tabblad ontbreekt: ' + naam);
      });
    } catch (_) {}

    if (watchdogFouten.length > 0) {
      // Setup heeft technisch geen exception gegooid maar er ontbreken componenten.
      // Toast + audit-log + WEL SETUP_DONE markeren (zodat klant niet vastloopt)
      // maar klant krijgt direct te zien wat er ontbreekt.
      try { ss.toast('Setup grotendeels OK, maar: ' + watchdogFouten[0] + (watchdogFouten.length > 1 ? ' + ' + (watchdogFouten.length - 1) + ' meer' : ''), 'Setup waarschuwing', 30); } catch (_) {}
      safeAuditLog_('Setup watchdog WAARSCHUWING', watchdogFouten.join(' | '));
      Logger.log('Setup watchdog vond ontbrekende componenten: ' + watchdogFouten.join(' | '));
    }

    PropertiesService.getScriptProperties().setProperty(PROP.SETUP_DONE, 'true');

    // Meld onboarding succesvol aan centrale licentieserver (fire-and-forget).
    try { meldOnboardingAanServer_(); } catch (e) { Logger.log('Onboarding-callback overgeslagen: ' + e.message); }

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
    alertOfLog_(ui, 'Fout bij setup', e.message +
      '\n\nStuur dit bericht door aan support@boekhoudbaar.nl — het stap-nummer helpt ons snel te weten waar te kijken.');
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
    { naam: SHEETS.DASHBOARD,       volgorde: 1,  kleur: '#0D1B4E' },
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
//  WERKRUIMTE OPSCHONEN
// ─────────────────────────────────────────────
/**
 * Verbergt automatisch aangemaakte "Form Responses N" tabbladen die Google
 * aanmaakt bij form.setDestination(), en zet de Dashboard-tab weer op pos. 1.
 *
 * Aanroepbaar via menu: Instellingen → Werkruimte opschonen.
 * Veilig om meerdere keren uit te voeren (idempotent).
 */
function herorganiseerWerkruimte() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();
  herorganiseerWerkruimteSilent_(ss);
  ui.alert('Werkruimte opgeschoond',
    'Tabbladen staan nu in de juiste volgorde:\n\n' +
    ZICHTBARE_TABS.join(' → ') + '\n\n' +
    'Technische tabbladen zijn verborgen en bereikbaar via het menu.',
    ui.ButtonSet.OK);
}

/**
 * Stille versie: geen popup. Aanroepbaar vanuit onOpen en setup.
 * Zet zichtbare tabs in de vaste volgorde, verbergt de rest.
 * @param {Spreadsheet} ss
 */
function herorganiseerWerkruimteSilent_(ss) {
  // Verberg Form Response tabs
  verbergFormResponseTabs_(ss);

  // Zet de 7 zichtbare tabs in de juiste volgorde
  ZICHTBARE_TABS.forEach(function(naam, i) {
    const sheet = ss.getSheetByName(naam);
    if (sheet) {
      try {
        sheet.showSheet();
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(i + 1);
      } catch (e) {}
    }
  });

  // Verberg technische tabs (komen na de zichtbare, op onbekende posities)
  [SHEETS.JOURNAALPOSTEN, SHEETS.GROOTBOEKSCHEMA, SHEETS.BALANS,
   SHEETS.WV_REKENING, SHEETS.CASHFLOW, SHEETS.DEBITEUREN,
   SHEETS.CREDITEUREN, SHEETS.JAARREKENING].forEach(function(naam) {
    const sheet = ss.getSheetByName(naam);
    if (sheet) try { sheet.hideSheet(); } catch (e) {}
  });

  // Activeer Dashboard
  try {
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (dash) ss.setActiveSheet(dash);
  } catch (e) {}
}

// ─────────────────────────────────────────────
//  CELBESCHERMING
// ─────────────────────────────────────────────
/**
 * Zet een "waarschuwing bij bewerken" op het Dashboard en de Instellingen-tab.
 * Gebruikers kunnen nog steeds bewerken maar krijgen een melding,
 * wat voorkomt dat formules per ongeluk worden overschreven.
 * @param {Spreadsheet} ss
 */
function beschermCellen_(ss) {
  // Twee niveaus van bescherming:
  //   HARD: editor wordt geblokkeerd (alleen eigenaar kan bewerken). Voor
  //         tabbladen waarvan formula-edit = catastrofe (Dashboard KPI's
  //         doorbreken alle metrics; Journaalposten = boekhouding-bron).
  //   ZACHT: warning-popup bij bewerken. Voor tabbladen waar handmatige
  //          bewerking soms nodig is (Instellingen, Grootboek).
  const HARD = [
    { naam: SHEETS.DASHBOARD,      omschr: 'Dashboard — automatisch gegenereerd. Bewerken breekt KPI-formules en alle rapporten daarna.' },
    { naam: SHEETS.JOURNAALPOSTEN, omschr: 'Journaalposten — boekhoudkundige bron. Bewerken corrumpeert balans + BTW-aangifte. Voeg toe via Boekhouding-menu.' },
  ];
  const ZACHT = [
    { naam: SHEETS.GROOTBOEKSCHEMA,    omschr: 'Grootboek — categorisatie. Bewerken alleen na consult.' },
    { naam: SHEETS.INSTELLINGEN, omschr: 'Instellingen — wijziging beïnvloedt PDF-template + email-flow.' },
  ];

  function _herstelEnZet_(def, hard) {
    const sheet = ss.getSheetByName(def.naam);
    if (!sheet) return;
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .forEach(function(p) { try { p.remove(); } catch (e) {} });
    try {
      const prot = sheet.protect().setDescription(def.omschr);
      if (hard) {
        // Hard: alleen huidige user (= eigenaar) mag bewerken
        try {
          const me = Session.getEffectiveUser();
          prot.removeEditors(prot.getEditors());
          prot.addEditor(me);
          // setDomainEdit(false) blokkeert non-eigenaars effectief
          if (prot.canDomainEdit && prot.canDomainEdit()) prot.setDomainEdit(false);
        } catch (e) { /* fallback naar warning */ prot.setWarningOnly(true); }
      } else {
        prot.setWarningOnly(true);
      }
    } catch (e) {
      Logger.log('Bescherming mislukt voor ' + def.naam + ': ' + e.message);
    }
  }
  HARD.forEach(function(d) { _herstelEnZet_(d, true); });
  ZACHT.forEach(function(d) { _herstelEnZet_(d, false); });
}

/**
 * Tabblad-recovery: herstel verplichte tabbladen die ontbreken.
 * Wordt door dagelijkseTaken aangeroepen — als klant per ongeluk een tab
 * verwijdert (right-click → Delete), maakt deze functie hem opnieuw aan
 * met juiste headers + alert naar owner. Data is verloren — klant moet
 * Versiegeschiedenis (Bestand → Versiegeschiedenis) gebruiken voor recovery.
 *
 * @param {Spreadsheet} ss
 */
function controleerEnHerstelTabbladen_(ss) {
  if (!ss) return;
  const verplicht = [
    SHEETS.VERKOOPFACTUREN, SHEETS.INKOOPFACTUREN, SHEETS.JOURNAALPOSTEN,
    SHEETS.GROOTBOEKSCHEMA, SHEETS.RELATIES, SHEETS.INSTELLINGEN, SHEETS.DASHBOARD,
  ].filter(function(n) {
    // Defensieve guard: skip undefined/empty waarden zodat een type-fout in
    // SHEETS-config niet leidt tot 'tabblad undefined was verwijderd'-spam.
    return n && typeof n === 'string' && n.trim().length > 0;
  });
  const ontbreken = [];
  verplicht.forEach(function(naam) {
    if (!ss.getSheetByName(naam)) ontbreken.push(naam);
  });
  if (ontbreken.length === 0) return;

  // KRITIEK: tab is per ongeluk verwijderd.
  ontbreken.forEach(function(naam) {
    try {
      // Recreate met headers (uit maakTabbladen_ gedefinieerde structuur).
      // We runnen maakTabbladen_(ss) nog eens — die is idempotent en maakt
      // alleen ontbrekende tabbladen.
      if (typeof maakTabbladen_ === 'function') maakTabbladen_(ss);
      try { schrijfAuditLog_('TABBLAD HERSTELD',
        'Tabblad "' + naam + '" was verwijderd — opnieuw aangemaakt zonder data. ' +
        'Klant: gebruik Bestand → Versiegeschiedenis om vorige versie terug te zetten.'); } catch (_) {}
      try { meldFataalAanOwner_('TAB_DELETED',
        'Verplicht tabblad "' + naam + '" was verwijderd door klant',
        { tabblad: naam, ssUrl: ss.getUrl(), advies: 'Adviseer klant Versiegeschiedenis te openen voor recovery van data' }); } catch (_) {}
    } catch (e) {
      Logger.log('Tabblad-herstel mislukt voor ' + naam + ': ' + e.message);
    }
  });

  // Toon klant bij eerstvolgende open een alert via property-flag
  try {
    PropertiesService.getScriptProperties().setProperty(
      'tabbladenHersteldBericht',
      JSON.stringify({ tabbladen: ontbreken, ts: Date.now() })
    );
  } catch (_) {}
}

/**
 * Verbergt alle sheets waarvan de naam begint met "Form Responses"
 * (automatisch aangemaakt door Google bij koppelen van een Form).
 * @param {Spreadsheet} ss
 */
function verbergFormResponseTabs_(ss) {
  ss.getSheets().forEach(function(sheet) {
    const naam = sheet.getName();
    if (/^Form Responses/i.test(naam) || naam.startsWith('Formulierreacties')) {
      try { sheet.hideSheet(); } catch (e) {}
    }
  });
  // Zet Dashboard terug op positie 1
  try {
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (dash) { ss.setActiveSheet(dash); ss.moveActiveSheet(1); }
  } catch (e) {}
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
  // 19 kolommen: 16 originele + 3 HITL-validatie (Human-in-the-Loop):
  // Q=Status (Concept/Gevalideerd), R=Gevalideerd door (email), S=Gevalideerd op (datum).
  // Default voor nieuwe boekingen: Status='Concept'. Klant valideert via menu
  // "Boekhouding → Geavanceerd → Boekingen valideren". Pas dan officieel "afgesloten".
  const headers = [
    'Boeking ID', 'Datum', 'Omschrijving', 'Dagboek', 'Debet rekening',
    'Debet omschrijving', 'Credit rekening', 'Credit omschrijving',
    'Bedrag', 'BTW %', 'BTW bedrag', 'Referentie', 'Projectcode',
    'Type', 'Notities', 'Aangemaakt op',
    'Status', 'Gevalideerd door', 'Gevalideerd op',
  ];
  if (sheet.getLastRow() > 0) {
    // Bestaande sheet: voeg ontbrekende kolommen toe (idempotent — geen overschrijven)
    const huidigeBreedte = sheet.getLastColumn();
    if (huidigeBreedte < headers.length) {
      sheet.getRange(1, huidigeBreedte + 1, 1, headers.length - huidigeBreedte)
        .setValues([headers.slice(huidigeBreedte)]);
    }
    return;
  }
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
  const headers = ['Code', 'Naam', 'Type', 'Categorie', 'Balans/W&V', 'Saldo'];

  // ── BESTAANDE DATA INDEXEREN (vóór clearContents) ───────────────────────
  // Zonder deze preservatie wist "Rekeningschema opnieuw laden":
  //   - klant-toegevoegde rekeningen (bv. 7100 'Reiskosten — bus' of
  //     8800 'Project Acme inkomsten') → audit-trail loss
  //   - alle saldi → grootboek loopt uit-fase tot klant 'Saldi herberekenen'
  //     handmatig draait
  // Beide bugs leverden silent data-corruption op (geen waarschuwing).
  const standaardCodes = new Set(STANDAARD_GROOTBOEK.map(r => String(r.code)));
  const bestaandeSaldi = {};   // code → laatste saldo (preserveer voor standaard-codes)
  const klantRijen = [];        // niet-standaard rekeningen (klant toegevoegd)
  try {
    const bestaande = sheet.getDataRange().getValues();
    for (let i = 1; i < bestaande.length; i++) {
      const code = String(bestaande[i][0] || '').trim();
      if (!code) continue;
      if (standaardCodes.has(code)) {
        const saldoRaw = bestaande[i][5];
        const saldo = parseFloat(saldoRaw);
        if (isFinite(saldo) && saldo !== 0) bestaandeSaldi[code] = saldo;
      } else {
        // Klant-rij: bewaar exact zoals ingevoerd (6 kolommen)
        klantRijen.push([
          code,
          String(bestaande[i][1] || ''),
          String(bestaande[i][2] || ''),
          String(bestaande[i][3] || ''),
          String(bestaande[i][4] || ''),
          parseFloat(bestaande[i][5]) || 0,
        ]);
      }
    }
  } catch (_) { /* eerste-run setup: sheet is leeg, geen preservatie nodig */ }

  sheet.clearContents();
  zetHeaderRij_(sheet, headers);

  const standaardRijen = STANDAARD_GROOTBOEK.map(r => [
    r.code, r.naam, r.type, r.cat, r.bw, bestaandeSaldi[String(r.code)] || 0,
  ]);
  const alleRijen = standaardRijen.concat(klantRijen);
  if (alleRijen.length > 0) {
    sheet.getRange(2, 1, alleRijen.length, headers.length).setValues(alleRijen);
  }

  // Opmaak
  sheet.getRange(2, 1, alleRijen.length, 1)
    .setNumberFormat('@')
    .setFontFamily('Courier New');

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 100);
  sheet.getRange(2, 6, alleRijen.length, 1).setNumberFormat('€#,##0.00');
  sheet.setFrozenRows(1);

  return {
    standaard: standaardRijen.length,
    klantBehouden: klantRijen.length,
    saldiBehouden: Object.keys(bestaandeSaldi).length,
  };
}

// ─────────────────────────────────────────────
//  INSTELLINGEN TABBLAD
// ─────────────────────────────────────────────
function zetInstellingen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);

  // CYCLE 75: data-behoud via per-veld MERGE i.p.v. een drempel-skip.
  // VOORHEEN: als kolom B >3 gevulde waarden had → re-init volledig
  // overgeslagen (return). Twee gebreken: (a) de drempel telde óók de
  // DEFAULT-waarden mee (een verse setup vult al ~19 cellen) → de skip was
  // grillig en kon bij weinig gevulde velden alsnog wissen; (b) bij skip
  // kreeg een bestaande klant nooit nieuwe instellingen uit een product-update.
  // NU: lees bestaande label→waarde, en overschrijf een default ALLEEN als de
  // klant dat veld nog niet zelf heeft ingevuld. De structuur wordt altijd
  // ververst (nieuwe defaults erbij), klant-data gaat NOOIT verloren.
  const bestaandeWaarden = {};
  try {
    if (sheet.getLastRow() >= 1) {
      const rijen = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
      rijen.forEach(function(r) {
        const label = String(r[0] || '').trim();
        const waarde = r[1];
        if (label && waarde !== '' && waarde !== null && waarde !== undefined) {
          bestaandeWaarden[label] = waarde;
        }
      });
    }
  } catch (e) {
    Logger.log('zetInstellingen_ kon bestaande waarden niet lezen, behandel als lege sheet: ' + e.message);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const data = [
    ['START HIER — Vul deze velden eenmalig in', 'Boekhoudbaar gebruikt ze op elke factuur, BTW-aangifte en rapport.'],
    ['', ''],
    ['BEDRIJFSGEGEVENS', ''],
    ['Bedrijfsnaam', ''],
    ['Rechtsvorm', 'Eenmanszaak'],
    ['Adres', ''],
    ['Postcode', ''],
    ['Plaats', ''],
    ['Land', 'Nederland'],
    ['KvK-nummer', ''],
    ['BTW-nummer', ''],
    ['IBAN', ''],
    ['BIC', ''],
    ['Email', ''],
    ['Telefoon', ''],
    ['Website', ''],
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
    ['Bankrekening op factuur', ''], // CYCLE 76: leeg — voorheen 'NL01ABNA0123456789', een MOD-97-ongeldige nep-IBAN die wél presence-checks passeerde → klant verstuurde factuur met nep-IBAN. Veld leeg laten dwingt de klant tot invullen vóór de eerste factuur (zie cycle 74 pre-flight).
    ['Betaallink tonen', 'Nee'],
    ['', ''],
    ['RAPPORTAGE INSTELLINGEN', ''],
    ['Dashboard vernieuwen bij openen', 'Ja'],
    ['Email rapporten naar', 'eigenaar@mijnbedrijf.nl'],
    ['BTW aangifte herinnering', 'Ja'],
    ['Gewerkte uren dit jaar', '0'],
    ['Thuiswerk dagen per jaar', '0'],
    ['', ''],
    ['INTEGRATIES & API', ''],
    ['Webhook API sleutel', ''],
    ['Web App URL', ''],
  ];

  // MERGE-overlay: behoud elke door de klant ingevulde waarde (gematcht op
  // het label in kolom A). Sectie-headers en lege scheidingsrijen hebben geen
  // bewaarde waarde en blijven dus op hun default. Zo wint klant-data altijd
  // van de default, terwijl nieuwe default-rijen wél worden toegevoegd.
  let aantalBehouden = 0;
  for (let i = 0; i < data.length; i++) {
    const label = String(data[i][0] || '').trim();
    if (label && Object.prototype.hasOwnProperty.call(bestaandeWaarden, label)) {
      data[i][1] = bestaandeWaarden[label];
      aantalBehouden++;
    }
  }
  if (aantalBehouden > 0) {
    safeAuditLog_('Setup instellingen samengevoegd', aantalBehouden + ' bestaande veld(en) behouden bij re-init');
  }

  sheet.getRange(1, 1, data.length, 2).setValues(data);

  // Plaatshouder-notities (verschijnen als tooltip op lege cellen)
  // Indices zijn +2 verschoven omdat rij 1 een START-HIER-banner is en rij 2 leeg.
  const notities = [
    [4,  'Uw officiële handelsnaam — wordt verwerkt in facturen, dashboard en bestandsnaam'],
    [6,  'Uw straatnaam + huisnummer (bijv. Hoofdstraat 12)'],
    [7,  'Postcode (bijv. 1234 AB)'],
    [8,  'Plaatsnaam'],
    [10, '8-cijferig KvK-nummer (te vinden op kvk.nl)'],
    [11, 'BTW-nummer: NL + 9 cijfers + B + 2 cijfers (bijv. NL123456789B01)'],
    [12, 'IBAN-nummer: NL + 2 cijfers + 4 letters + 10 cijfers'],
    [13, 'BIC/SWIFT-code van uw bank (bijv. ABNANL2A)'],
    [14, 'Uw zakelijk e-mailadres'],
    [15, 'Uw telefoonnummer (bijv. 06-12345678)'],
    [16, 'Uw website (optioneel, bijv. www.uwbedrijf.nl)'],
    [32, 'Kies een sterk wachtwoord voor de API-koppeling (bijv. mijnbedrijf-2026-geheim)'],
    [33, 'Vul hier de Web App URL in na publicatie — zie Boekhouding → Koppeling Zapier'],
  ];
  notities.forEach(function(n) {
    sheet.getRange(n[0], 2).setNote(n[1]);
  });

  // B2 self-service (audit): tooltips op de beslisvelden die beginners het
  // meest verwarren — voorkomt fout-configuratie aan de bron. Label-gebaseerd
  // (robuust tegen row-shifts), fail-safe gewrapt. Bewust géén setDataValidation:
  // een dropdown zou kunnen botsen met een via de merge-overlay bewaarde
  // klant-waarde die niet exact in de lijst staat.
  const veldNotities = {
    'Standaard BTW tarief': 'Meestal 21%. Kies 9% alleen als je hoofdzakelijk onder het lage tarief valt (voeding, boeken, kappers e.d.). Twijfel? 21%.',
    'BTW aangifteperiode': "Kwartaal is standaard voor de meeste ZZP'ers. Maand alleen als de Belastingdienst je dat oplegt (>€15.000 BTW/jaar). Jaar alleen op aanvraag. Twijfel? Kwartaal.",
    'KOR regeling actief': 'Alleen "Ja" als je je hebt aangemeld voor de Kleineondernemersregeling (<€20.000 omzet, géén BTW op je facturen). De meeste starters: Nee. Zie boekhoudbaar.nl/gids/btw-aangifte-zzp/',
    'Bankrekening op factuur': 'Het IBAN dat op je facturen komt. Zakelijke rekening aanbevolen; privé mag, maar houd zakelijk/privé gescheiden. Zie boekhoudbaar.nl/gids/zakelijke-rekening-zzp-2026/',
    'Betalingstermijn (dagen)': 'Aantal dagen dat een klant heeft om te betalen. Gangbaar: 14 of 30.',
  };
  for (let i = 0; i < data.length; i++) {
    const lbl = String(data[i][0] || '').trim();
    if (Object.prototype.hasOwnProperty.call(veldNotities, lbl)) {
      try { sheet.getRange(i + 1, 2).setNote(veldNotities[lbl]); } catch (_) {}
    }
  }

  // Opmaak — START HIER banner (rij 1): accent-teal bg, donker navy tekst
  sheet.getRange(1, 1, 1, 2)
    .setBackground('#E6F7F4')
    .setFontColor(KLEUREN.HEADER_BG)
    .setFontWeight('bold')
    .setFontSize(12)
    .setWrap(true);
  sheet.setRowHeight(1, 38);

  // Opmaak sectietitels — rijen +2 vanaf oude indices [1,16,27,33,37]
  [3, 18, 29, 35, 39].forEach(rij => {
    sheet.getRange(rij, 1, 1, 2)
      .setBackground(KLEUREN.HEADER_BG)
      .setFontColor(KLEUREN.HEADER_FG)
      .setFontWeight('bold')
      .setFontSize(11);
  });

  // Opmaak labels (vanaf rij 2 tot einde; banner-rij is al opgemaakt)
  sheet.getRange(2, 1, data.length - 1, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 400);
  sheet.setFrozenRows(1); // START HIER altijd zichtbaar
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
    Logger.log('getFormPublishedUrl_ fout: ' + e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
//  TRIGGERS INSTALLEREN
// ─────────────────────────────────────────────
function installeelTriggers_() {
  const props = PropertiesService.getScriptProperties();
  const ss = getSpreadsheet_();
  const nieuweTriggers = [];

  // Maak nieuwe triggers EERST aan — verwijder pas als alles gelukt is
  nieuweTriggers.push(
    ScriptApp.newTrigger('onOpen')
      .forSpreadsheet(ss)
      .onOpen()
      .create()
  );

  // onEdit voor audit trail + bedrijfsnaam-detectie
  nieuweTriggers.push(
    ScriptApp.newTrigger('onEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create()
  );

  const hoofdFormId = props.getProperty(PROP.FORM_HOOFD_ID);
  if (hoofdFormId) {
    try {
      nieuweTriggers.push(
        ScriptApp.newTrigger('verwerkHoofdformulier')
          .forForm(FormApp.openById(hoofdFormId))
          .onFormSubmit()
          .create()
      );
      Logger.log('Hoofdformulier trigger geïnstalleerd');
    } catch (e) {
      Logger.log('Trigger fout hoofdformulier: ' + e.message);
    }
  }

  // Dagelijkse taken: 08:00
  nieuweTriggers.push(
    ScriptApp.newTrigger('dagelijkseTaken')
      .timeBased()
      .atHour(8)
      .everyDays(1)
      .create()
  );

  // Wekelijkse samenvatting: maandag 08:00
  nieuweTriggers.push(
    ScriptApp.newTrigger('stuurWeeklySamenvatting_')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(8)
      .create()
  );

  // Maandrapport per e-mail: 1e van de maand om 10:00
  nieuweTriggers.push(
    ScriptApp.newTrigger('mailMaandrapport')
      .timeBased()
      .onMonthDay(1)
      .atHour(10)
      .create()
  );

  // Verwijder nu pas de oude triggers (nieuwe zijn al actief)
  // CYCLE-52: try/catch per trigger — voorkomt dat één faal (bv. trigger
  // tussentijds al verwijderd door andere session) de rest blokkeert.
  const nieuwIds = new Set(nieuweTriggers.map(t => t.getUniqueId()));
  ScriptApp.getProjectTriggers()
    .filter(t => !nieuwIds.has(t.getUniqueId()))
    .forEach(t => {
      try { ScriptApp.deleteTrigger(t); }
      catch (err) { Logger.log('deleteTrigger faalde (skipping): ' + err.message); }
    });

  Logger.log('Triggers geïnstalleerd (' + nieuweTriggers.length + ' actief)');
}

/**
 * CYCLE 73: zelfherstel van de kritieke achtergrond-trigger.
 *
 * Probleem: installeelTriggers_ maakt de triggers sequentieel aan. Faalt het
 * halverwege (transiënte fout, scopes nog niet volledig, trigger-quota), dan
 * kan `dagelijkseTaken` ontbreken terwijl setup tóch SETUP_DONE='true' zet.
 * dagelijkseTaken is de automatisering-ruggengraat: backups, betalings-
 * herinneringen, BTW-deadlines, audit-keten-check (cycle 69), Noah's Ark
 * (cycle 70), dashboard-refresh. Ontbreekt die, dan draait dat alles stil
 * door — geen foutmelding, geen mail, niets.
 *
 * De bestaande controleerTriggerWatchdog_ ziet dit NIET: die leest de
 * Taakstatus-tab, die leeg is als de trigger nooit liep → vroege return.
 *
 * Deze functie draait bij onOpen, detecteert de ontbrekende trigger direct
 * via getProjectTriggers(), en herstelt automatisch (i.p.v. de klant naar
 * Diagnostiek te sturen voor een handmatige herinstallatie). Zo wordt de
 * "één klik"-reparatie een "nul klikken"-reparatie.
 *
 * Veilig: alleen ná voltooide setup; throttle 1×/dag; auth-veilig (in
 * LIMITED-modus — als de installable onOpen ontbreekt — kan ScriptApp toch
 * geen triggers maken, dus we vangen dat stil af). Hergebruikt de idempotente
 * installeelTriggers_ (single source of truth; create-first-then-delete →
 * geen zero-trigger-venster).
 */
function herstelKritiekeTriggersIndienNodig_() {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(PROP.SETUP_DONE) !== 'true') return; // alleen na setup

    let bestaande;
    try {
      bestaande = ScriptApp.getProjectTriggers();
    } catch (_) {
      return; // LIMITED auth-modus: kan toch geen triggers installeren
    }
    const handlers = bestaande.map(function(t) { return t.getHandlerFunction(); });
    if (handlers.indexOf('dagelijkseTaken') !== -1) return; // kritieke trigger ok

    // Throttle: max 1×/dag — vermijdt herhaalde reinstall-pogingen + quota.
    const userProps = PropertiesService.getUserProperties();
    const KEY = 'triggerHerstelTs';
    const last = parseInt(userProps.getProperty(KEY) || '0', 10);
    if (Date.now() - last < 24 * 3600 * 1000) return;
    userProps.setProperty(KEY, String(Date.now()));

    installeelTriggers_();
    safeAuditLog_('Trigger zelfherstel', 'dagelijkseTaken ontbrak — triggers automatisch opnieuw geïnstalleerd');
    try {
      getSpreadsheet_().toast('Achtergrondtaken waren gestopt en zijn automatisch hersteld.', '✓ Hersteld', 8);
    } catch (_) {}
  } catch (e) {
    Logger.log('herstelKritiekeTriggersIndienNodig_ faalde: ' + e.message);
    safeAuditLog_('Trigger zelfherstel FOUT', e.message);
  }
}

// ─────────────────────────────────────────────
//  AUDIT LOG TABBLAD
// ─────────────────────────────────────────────
/**
 * Maakt het Audit Log-tabblad aan (verborgen, op de achtergrond).
 * Bevat alle cell-edits op gevoelige tabbladen + alle script-acties.
 */
function setupAuditLogSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  let sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.AUDIT_LOG);
    sheet.setTabColor('#616161'); // grijs — administratief
  }
  if (sheet.getLastRow() > 0) {
    // Alleen aanvullen als header ontbreekt; nooit data overschrijven
    return;
  }
  // Kolom 8 'Ketenhash' (cycle 69): SHA-256 hash-keten voor tamper-evidence.
  const headers = ['Tijdstip', 'Gebruiker', 'Tabblad', 'Cel', 'Oude waarde', 'Nieuwe waarde', 'Type', 'Ketenhash'];
  zetHeaderRij_(sheet, headers);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 220);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 260);
  // Verberg standaard — gebruiker kan via menu "Audit Log tonen" openen
  try { sheet.hideSheet(); } catch (e) {}
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
  // setFrozenColumns(1) BEWUST WEGGELATEN — veroorzaakt fout
  // "Je kunt vastgezette kolommen niet samenvoegen met niet-vastgezette
  // kolommen" zodra een latere helper een merge over kolom 1+2 doet
  // (bv. titel-row banner). Sheets die kolom-freeze écht nodig hebben
  // (Cashflow met maand-rijen) zetten dat expliciet zelf via
  // sheet.setFrozenColumns(N) NA alle merges.

  // Autofit kolommen
  for (let i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, 140);
  }
  sheet.setColumnWidth(1, 100);
}

// ─────────────────────────────────────────────
//  INSTELLING OPHALEN UIT INSTELLINGEN TABBLAD
// ─────────────────────────────────────────────
// Session-level cache: one sheet read per GAS execution, not per call.
// GAS module-level `let` persists within a single execution context
// (one trigger invocation / one manual run) and resets between runs.
let _instellingenCache = null;
function wisInstellingenCache_() {
  _instellingenCache = null;
  // Belasting-overrides leeft op de Instellingen-tab → cache mee invalideren
  // zodat een wijziging in een tarief-rij direct doorwerkt in alle berekeningen.
  try { if (typeof _wisBelastingOverridesCache_ === 'function') _wisBelastingOverridesCache_(); } catch (_) {}
}

function getInstelling_(sleutel) {
  if (!_instellingenCache) {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    _instellingenCache = {};
    for (let i = 0; i < data.length; i++) {
      if (data[i][0]) {
        const val = String(data[i][1] != null ? data[i][1] : '');
        // Verouderde placeholder-tekst (begint met ←) behandelen als leeg
        _instellingenCache[String(data[i][0])] = val.startsWith('←') ? '' : val;
      }
    }
  }
  return Object.prototype.hasOwnProperty.call(_instellingenCache, sleutel)
    ? _instellingenCache[sleutel]
    : null;
}

/**
 * Schrijft een instelling weg naar het Instellingen-tabblad.
 * Voegt nieuwe rij toe als sleutel niet bestaat. Invalideert cache.
 *
 * @param {string} sleutel Sleutel-naam (bv. 'Geboortedatum').
 * @param {string|number} waarde Waarde om weg te schrijven.
 */
function setInstelling_(sleutel, waarde) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (!sheet) throw new Error('Tabblad Instellingen niet gevonden');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '') === String(sleutel)) {
      sheet.getRange(i + 1, 2).setValue(waarde);
      wisInstellingenCache_(); // Invalideert ook belasting-overrides cache
      return;
    }
  }
  // Niet gevonden → append onderaan
  sheet.appendRow([sleutel, waarde]);
  wisInstellingenCache_();
}

// ─────────────────────────────────────────────
//  SETUP OPNIEUW UITVOEREN (FORMS RESETTEN)
// ─────────────────────────────────────────────
function resetSetup() {
  const ui = SpreadsheetApp.getUi();
  const bevestiging = ui.alert(
    'Setup opnieuw uitvoeren?',
    'Dit wist alle formulieren en automatisering — je boekhoud-data blijft veilig staan.\n\n' +
    'Daarna kun je setup opnieuw doorlopen.\n\nDoorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestiging !== ui.Button.YES) return;

  const props = PropertiesService.getScriptProperties();
  [PROP.FORM_HOOFD_ID, PROP.FORM_VERKOOP_ID, PROP.FORM_INKOOP_ID,
   PROP.FORM_BANK_ID, PROP.FORM_RELATIE_ID, PROP.FORM_JOURNAAL_ID,
   PROP.SETUP_DONE, PROP.KPI_SNAPSHOT,
  ].forEach(k => props.deleteProperty(k));

  // CYCLE-52: try/catch per trigger — voorkomt half-finished reset
  ScriptApp.getProjectTriggers().forEach(t => {
    try { ScriptApp.deleteTrigger(t); }
    catch (err) { Logger.log('reset deleteTrigger faalde: ' + err.message); }
  });

  ui.alert('Klaar! ✓',
    'Reset gelukt. Run nu opnieuw setup via:\n' +
    'Boekhouding → Instellingen → Eerste keer instellen (setup)',
    ui.ButtonSet.OK);
}

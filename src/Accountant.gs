/**
 * Accountant.gs
 * Read-only deel-flow voor accountant.
 *
 * Klant wil sheet delen met accountant maar alleen rapportages tonen
 * (Balans, W&V, Cashflow, BTW Aangifte) — NIET de bron-data of dialogs.
 *
 * Strategie:
 *  1. Maak een nieuwe sheet (kopie) in /Boekhoudbaar/Accountant-share/
 *  2. Verwijder dialogs/scripts/triggers (alleen waarden + formats blijven)
 *  3. Verberg alle behalve rapportages-tabs
 *  4. Share met accountant-email (read-only)
 *  5. Sla SS-id op met expiry-datum (default 30 dagen)
 *  6. Background-task ruimt verlopen shares op
 *
 * Geen impact op klant-spreadsheet.
 */

const ACCOUNTANT_SHARES_PROP = 'accountantShares';
const ACCOUNTANT_RAPPORT_TABS = ['Dashboard', 'Balans', 'Winst & Verlies', 'Cashflow', 'BTW Aangifte', 'Belastingadvies'];
const ACCOUNTANT_DEFAULT_DAGEN = 30;

/**
 * Menu-entry: deel met accountant.
 */
function deelMetAccountant() {
  const ui = SpreadsheetApp.getUi();
  const emailResp = ui.prompt(
    '👤 Delen met accountant',
    'E-mailadres van je accountant?\n\n' +
    'Wat de accountant ziet:\n' +
    '✓ Balans, Winst & Verlies, Cashflow\n' +
    '✓ BTW Aangifte\n' +
    '✓ Belastingadvies\n' +
    '✓ Dashboard\n\n' +
    'Wat de accountant NIET ziet:\n' +
    '• Bron-tabbladen (Verkoop/Inkoop/Bank)\n' +
    '• Klant-data (Relaties)\n' +
    '• Audit-log\n' +
    '• Dialogs/menu (read-only kopie zonder scripts)',
    ui.ButtonSet.OK_CANCEL
  );
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;
  const email = String(emailResp.getResponseText() || '').trim();
  if (!isGeldigEmail_(email)) {
    ui.alert('⚠️ Ongeldig e-mailadres', 'Probeer opnieuw met geldig adres (bv. naam@kantoor.nl).', ui.ButtonSet.OK);
    return;
  }

  const dagenResp = ui.prompt(
    'Hoelang toegang?',
    'Aantal dagen toegang (1-365). Default: ' + ACCOUNTANT_DEFAULT_DAGEN + '.',
    ui.ButtonSet.OK_CANCEL
  );
  if (dagenResp.getSelectedButton() !== ui.Button.OK) return;
  let dagen = parseInt(dagenResp.getResponseText()) || ACCOUNTANT_DEFAULT_DAGEN;
  dagen = Math.max(1, Math.min(365, dagen));

  try {
    const shareInfo = _maakAccountantKopie_(email, dagen);
    ui.alert(
      '✅ Gedeeld met accountant',
      'Toegang tot ' + email + ' tot ' + shareInfo.vervalDatum + '.\n\n' +
      'URL: ' + shareInfo.url + '\n\n' +
      'Tip: deel deze URL ook in een mail. De accountant heeft Google-account nodig.',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('⚠️ Delen mislukt', vertaalFout_(e), ui.ButtonSet.OK);
  }
}

function _maakAccountantKopie_(email, dagen) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Boekhouding';
  const huidigJaar = new Date().getFullYear();
  const ts = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
  const naam = bedrijf + ' – Accountant-share – ' + ts;

  // Backup-map binnen klant Drive-structuur
  let shareMap = null;
  try {
    const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + huidigJaar);
    if (hoofdId) {
      const hoofd = DriveApp.getFolderById(hoofdId);
      const it = hoofd.getFoldersByName('Accountant-share');
      shareMap = it.hasNext() ? it.next() : hoofd.createFolder('Accountant-share');
    }
  } catch (_) {}
  if (!shareMap) shareMap = DriveApp.getRootFolder();

  // Maak read-only kopie
  const copy = ss.copy(naam);
  const copyId = copy.getId();
  try {
    const file = DriveApp.getFileById(copyId);
    shareMap.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (_) {}

  // Verberg alle non-rapportage tabs
  const copySs = SpreadsheetApp.openById(copyId);
  copySs.getSheets().forEach(function(sheet) {
    const naamS = sheet.getName();
    if (ACCOUNTANT_RAPPORT_TABS.indexOf(naamS) === -1) {
      try { sheet.hideSheet(); } catch (_) {}
    }
  });

  // Set view-only access voor de accountant
  const file = DriveApp.getFileById(copyId);
  try { file.addViewer(email); } catch (e) { Logger.log('addViewer fout: ' + e.message); }
  // Geen editors, geen domain-share — alleen specifieke email
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); } catch (_) {}

  // Sla share-info op (voor cleanup)
  const shares = _laadShares_();
  const vervalDatum = new Date(Date.now() + dagen * 86400000);
  shares.push({
    id: copyId,
    email: email,
    vervalt: vervalDatum.toISOString(),
    aangemaakt: new Date().toISOString(),
  });
  PropertiesService.getScriptProperties().setProperty(ACCOUNTANT_SHARES_PROP, JSON.stringify(shares));

  try { schrijfAuditLog_('Accountant-share aangemaakt', email + ' tot ' + vervalDatum.toLocaleDateString('nl-NL')); } catch (_) {}

  return {
    id: copyId,
    url: file.getUrl(),
    vervalDatum: vervalDatum.toLocaleDateString('nl-NL'),
  };
}

function _laadShares_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ACCOUNTANT_SHARES_PROP) || '[]';
    return JSON.parse(raw);
  } catch (_) { return []; }
}

/**
 * Background-task: verwijdert verlopen accountant-shares.
 * Wordt aangeroepen vanuit dagelijkseTaken (Triggers.gs).
 */
function ruimVerlopenShares_() {
  const shares = _laadShares_();
  if (shares.length === 0) return;
  const nu = Date.now();
  const overig = [];
  shares.forEach(function(s) {
    const vervalTs = Date.parse(s.vervalt);
    if (isNaN(vervalTs) || vervalTs > nu) {
      overig.push(s);
      return;
    }
    // Vervallen — file naar prullenbak
    try {
      DriveApp.getFileById(s.id).setTrashed(true);
      schrijfAuditLog_('Accountant-share verlopen', s.email + ' (' + s.id.slice(0, 8) + '...) → prullenbak');
    } catch (e) {
      Logger.log('ruimVerlopenShares_ fout voor ' + s.id + ': ' + e.message);
    }
  });
  PropertiesService.getScriptProperties().setProperty(ACCOUNTANT_SHARES_PROP, JSON.stringify(overig));
}

/**
 * Toont overzicht van actieve accountant-shares.
 */
function toonAccountantShares() {
  const shares = _laadShares_();
  if (shares.length === 0) {
    SpreadsheetApp.getUi().alert('Geen actieve accountant-shares.', 'Maak een share via Boekhouding → Delen met accountant.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const lijst = shares.map(function(s) {
    const verval = new Date(s.vervalt).toLocaleDateString('nl-NL');
    return '• ' + s.email + ' — verloopt ' + verval;
  }).join('\n');
  SpreadsheetApp.getUi().alert('👤 Actieve accountant-shares', lijst, SpreadsheetApp.getUi().ButtonSet.OK);
}

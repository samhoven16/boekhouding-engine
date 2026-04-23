/**
 * DriveStructuur.gs
 * Beheert de Google Drive mappenstructuur per boekjaar.
 * Alle facturen, aangiften en documenten worden automatisch opgeslagen
 * in de juiste map.
 *
 * Structuur per jaar:
 *   📁 [Bedrijfsnaam] Boekhouding [Jaar]
 *   ├── 📁 Verkoopfacturen
 *   ├── 📁 Inkoopfacturen en bonnetjes
 *   ├── 📁 BTW aangiften
 *   ├── 📁 Bankafschriften
 *   └── 📁 Jaarrekening
 */

// ─────────────────────────────────────────────
//  DRIVE STRUCTUUR AANMAKEN (EENMALIG PER JAAR)
// ─────────────────────────────────────────────
function maakDriveStructuur_(jaar) {
  jaar = jaar || new Date().getFullYear();
  const props = PropertiesService.getScriptProperties();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Boekhouding';

  // Hoofdmap ophalen of aanmaken
  const hoofdmapKey = 'DRIVE_HOOFDMAP_' + jaar;
  let hoofdmap = getDriveMapViaKey_(hoofdmapKey);

  if (!hoofdmap) {
    const naam = bedrijf + ' – Boekhouding ' + jaar;
    hoofdmap = DriveApp.createFolder(naam);
    props.setProperty(hoofdmapKey, hoofdmap.getId());
    Logger.log('Drive hoofdmap aangemaakt: ' + hoofdmap.getUrl());
  }

  // Submappen
  const submappen = {
    ['DRIVE_VERKOOPFACTUREN_' + jaar]: '📄 Verkoopfacturen',
    ['DRIVE_INKOOPFACTUREN_'  + jaar]: '🧾 Inkoopfacturen en bonnetjes',
    ['DRIVE_BTW_'             + jaar]: '📊 BTW aangiften',
    ['DRIVE_BANKAFSCHRIFTEN_' + jaar]: '🏦 Bankafschriften',
    ['DRIVE_JAARREKENING_'    + jaar]: '📑 Jaarrekening',
  };

  Object.entries(submappen).forEach(([key, naam]) => {
    if (!getDriveMapViaKey_(key)) {
      const submap = hoofdmap.createFolder(naam);
      props.setProperty(key, submap.getId());
    }
  });

  return hoofdmap;
}

// ─────────────────────────────────────────────
//  SPECIFIEKE MAP OPHALEN
// ─────────────────────────────────────────────
function getDriveMapVerkoopfacturen_(jaar) {
  return getDriveMapViaKey_('DRIVE_VERKOOPFACTUREN_' + (jaar || new Date().getFullYear()));
}

function getDriveMapInkoopfacturen_(jaar) {
  return getDriveMapViaKey_('DRIVE_INKOOPFACTUREN_' + (jaar || new Date().getFullYear()));
}

function getDriveMapBtw_(jaar) {
  return getDriveMapViaKey_('DRIVE_BTW_' + (jaar || new Date().getFullYear()));
}

function getDriveMapBankafschriften_(jaar) {
  return getDriveMapViaKey_('DRIVE_BANKAFSCHRIFTEN_' + (jaar || new Date().getFullYear()));
}

function getDriveMapJaarrekening_(jaar) {
  return getDriveMapViaKey_('DRIVE_JAARREKENING_' + (jaar || new Date().getFullYear()));
}

// ─────────────────────────────────────────────
//  HULPFUNCTIE: MAP OPHALEN VIA PROPERTY KEY
// ─────────────────────────────────────────────
function getDriveMapViaKey_(key) {
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) return null;
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────
//  BESTAND OPSLAAN IN JUISTE MAP
// ─────────────────────────────────────────────
function slaFactuurOpInDrive_(pdfBlob, factuurnummer, jaar) {
  let map = getDriveMapVerkoopfacturen_(jaar);
  if (!map) map = maakDriveStructuur_(jaar) && getDriveMapVerkoopfacturen_(jaar);
  if (!map) map = DriveApp.getRootFolder();

  // Verwijder eventueel bestaand bestand met zelfde naam
  const bestaand = map.getFilesByName(pdfBlob.getName());
  while (bestaand.hasNext()) bestaand.next().setTrashed(true);

  const bestand = map.createFile(pdfBlob);
  return bestand.getUrl();
}

function slaBtwAangifteOpInDrive_(pdfBlob, kwartaal, jaar) {
  let map = getDriveMapBtw_(jaar);
  if (!map) map = DriveApp.getRootFolder();
  const bestand = map.createFile(pdfBlob);
  return bestand.getUrl();
}

function slaJaarrekeningOpInDrive_(pdfBlob, jaar) {
  let map = getDriveMapJaarrekening_(jaar);
  if (!map) map = DriveApp.getRootFolder();
  const bestand = map.createFile(pdfBlob);
  return bestand.getUrl();
}

// ─────────────────────────────────────────────
//  DRIVE OVERZICHT TONEN (IN INSTELLINGEN)
// ─────────────────────────────────────────────
function toonDriveStructuur() {
  const jaar = new Date().getFullYear();
  const props = PropertiesService.getScriptProperties();

  const mappen = [
    { label: 'Hoofdmap ' + jaar,              key: 'DRIVE_HOOFDMAP_'       + jaar },
    { label: 'Verkoopfacturen',               key: 'DRIVE_VERKOOPFACTUREN_' + jaar },
    { label: 'Inkoopfacturen & bonnetjes',    key: 'DRIVE_INKOOPFACTUREN_'  + jaar },
    { label: 'BTW aangiften',                 key: 'DRIVE_BTW_'             + jaar },
    { label: 'Bankafschriften',               key: 'DRIVE_BANKAFSCHRIFTEN_' + jaar },
    { label: 'Jaarrekening',                  key: 'DRIVE_JAARREKENING_'    + jaar },
  ];

  let html = ''
    + '<style>'
    + '*{box-sizing:border-box}'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;'
    + 'padding:20px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}'
    + 'h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 12px}'
    + 'table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(13,27,78,0.04)}'
    + 'td{padding:10px 12px;border-bottom:1px solid #E5EAF2}'
    + 'tr:last-child td{border-bottom:none}'
    + 'td:first-child{font-weight:600;color:#0D1B4E}'
    + 'a{color:#0D1B4E;font-weight:600;text-decoration:none}'
    + 'a:hover{color:#2EC4B6}'
    + '.btn{background:#0D1B4E;color:white;padding:10px 18px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-top:14px;transition:background 0.15s}'
    + '.btn:hover{background:#1A2A6B}'
    + '.btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-left:8px;margin-top:14px;transition:background 0.15s}'
    + '.btn-sec:hover{background:#EEF2F8}'
    + '</style>'
    + '<h3>Google Drive mappen ' + jaar + '</h3><table>';
  mappen.forEach(m => {
    const id = props.getProperty(m.key);
    let link = '<span style="color:#5A6478">Nog niet aangemaakt</span>';
    if (id) {
      try {
        const url = DriveApp.getFolderById(id).getUrl();
        link = '<a href="' + url + '" target="_blank">Openen →</a>';
      } catch(e) { link = '<span style="color:#c62828">Niet beschikbaar</span>'; }
    }
    html += '<tr><td>' + m.label + '</td><td>' + link + '</td></tr>';
  });
  html += '</table>';
  html += '<button class="btn" onclick="google.script.run.maakDriveStructuurManueel()">Mappen aanmaken / vernieuwen</button>';
  html += '<button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(500).setHeight(350),
    'Google Drive Structuur'
  );
}

function maakDriveStructuurManueel() {
  const jaar = new Date().getFullYear();
  maakDriveStructuur_(jaar);
  // Sla links op in Instellingen tabblad
  slaDriverLinksOpInInstellingen_(jaar);
}

// ─────────────────────────────────────────────
//  DRIVE LINKS OPSLAAN IN INSTELLINGEN TABBLAD
// ─────────────────────────────────────────────
function slaDriverLinksOpInInstellingen_(jaar) {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (!sheet) return;

  const props = PropertiesService.getScriptProperties();
  const jaar_ = jaar || new Date().getFullYear();

  const mappen = [
    { label: 'Drive: Hoofdmap ' + jaar_,            key: 'DRIVE_HOOFDMAP_'        + jaar_ },
    { label: 'Drive: Verkoopfacturen',               key: 'DRIVE_VERKOOPFACTUREN_' + jaar_ },
    { label: 'Drive: Inkoopfacturen & bonnetjes',    key: 'DRIVE_INKOOPFACTUREN_'  + jaar_ },
    { label: 'Drive: BTW aangiften',                 key: 'DRIVE_BTW_'             + jaar_ },
    { label: 'Drive: Bankafschriften',               key: 'DRIVE_BANKAFSCHRIFTEN_' + jaar_ },
    { label: 'Drive: Jaarrekening',                  key: 'DRIVE_JAARREKENING_'    + jaar_ },
  ];

  // Zoek of voeg toe onderaan Instellingen
  const data = sheet.getDataRange().getValues();
  let driveStartRij = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).startsWith('Drive:') || data[i][0] === 'GOOGLE DRIVE MAPPEN') {
      driveStartRij = i + 1;
      break;
    }
  }

  if (driveStartRij === -1) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, 2)
      .setValues([['GOOGLE DRIVE MAPPEN ' + jaar_, '']])
      .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
    driveStartRij = lastRow + 2;
  }

  mappen.forEach((m, i) => {
    const id = props.getProperty(m.key);
    let url = 'Nog niet aangemaakt';
    if (id) {
      try { url = DriveApp.getFolderById(id).getUrl(); } catch(e) {}
    }
    sheet.getRange(driveStartRij + i, 1).setValue(m.label).setFontWeight('bold');
    sheet.getRange(driveStartRij + i, 2).setValue(url);
  });
}

// ─────────────────────────────────────────────
//  NIEUW BOEKJAAR AANMAKEN (legacy — alleen Drive structuur)
// ─────────────────────────────────────────────
function maakNieuwBoekjaar() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Nieuw boekjaar', 'Voer het jaar in (bijv. 2025):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const jaar = parseInt(resp.getResponseText().trim());
  if (isNaN(jaar) || jaar < 2020 || jaar > 2099) {
    ui.alert('Ongeldig jaar opgegeven.');
    return;
  }

  maakDriveStructuur_(jaar);
  slaDriverLinksOpInInstellingen_(jaar);

  ui.alert('Boekjaar ' + jaar + ' aangemaakt.\nGoogle Drive mappen staan klaar.\nLinks zijn opgeslagen in het tabblad Instellingen.');
}

// ─────────────────────────────────────────────
//  JAARAFSLUITING WIZARD
// ─────────────────────────────────────────────
/**
 * Sluit het huidige boekjaar af en bereidt het volgende voor:
 *  1. Archiveert de huidige spreadsheet naar Drive
 *  2. Reset factuurnummer- en inkooptellers naar 1
 *  3. Werkt de factuurprefix bij met het nieuwe jaar (bijv. F2027-)
 *  4. Werkt Boekjaar start/einde bij in Instellingen
 *  5. Maakt Drive-mappen aan voor het nieuwe jaar
 */
function sluitJaarAf() {
  const ui = SpreadsheetApp.getUi();
  const huidigJaar = new Date().getFullYear();
  const nieuwJaar  = huidigJaar + 1;

  const bevestiging = ui.alert(
    'Jaarafsluiting ' + huidigJaar,
    'Dit doet het volgende:\n\n' +
    '✓ Archief-kopie van huidige spreadsheet opslaan in Drive\n' +
    '✓ Factuurnummerteller resetten naar 1 (voor ' + nieuwJaar + ')\n' +
    '✓ Factuurprefix bijwerken naar F' + nieuwJaar + '-\n' +
    '✓ Boekjaar-instellingen bijwerken naar ' + nieuwJaar + '\n' +
    '✓ Drive-mappen aanmaken voor ' + nieuwJaar + '\n\n' +
    'Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestiging !== ui.Button.YES) return;

  const ss    = getSpreadsheet_();
  const props = PropertiesService.getScriptProperties();
  const fouten = [];

  // 1. Archiveer huidige spreadsheet
  try {
    const archief = ss.copy('Boekhoudbaar ' + huidigJaar + ' — Archief');
    schrijfAuditLog_('Jaarafsluiting', 'Archief aangemaakt: ' + archief.getUrl());
  } catch (e) {
    fouten.push('Archief niet gelukt: ' + e.message);
  }

  // 2. Reset tellers
  props.setProperty(PROP.VOLGEND_FACTUUR_NR, '1');
  props.setProperty(PROP.VOLGEND_INKOOP_NR,  '1');
  _instellingenCache = null; // invalidate cache before writes

  // 3. Factuurprefix + boekjaarinstellingen bijwerken in sheet
  const instSheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (instSheet) {
    const data = instSheet.getDataRange().getValues();
    const updates = {
      'Factuurprefix':   'F' + nieuwJaar + '-',
      'Boekjaar start':  '01-01-' + nieuwJaar,
      'Boekjaar einde':  '31-12-' + nieuwJaar,
      'Gewerkte uren dit jaar': '0',
      'Thuiswerk dagen per jaar': '0',
    };
    for (let i = 0; i < data.length; i++) {
      const sleutel = String(data[i][0]);
      if (Object.prototype.hasOwnProperty.call(updates, sleutel)) {
        instSheet.getRange(i + 1, 2).setValue(updates[sleutel]);
      }
    }
    _instellingenCache = null; // invalidate na writes
  }

  // 4. Drive-structuur nieuw boekjaar
  try {
    maakDriveStructuur_(nieuwJaar);
    slaDriverLinksOpInInstellingen_(nieuwJaar);
  } catch (e) {
    fouten.push('Drive-mappen niet aangemaakt: ' + e.message);
  }

  schrijfAuditLog_('Jaarafsluiting voltooid', huidigJaar + ' → ' + nieuwJaar);

  const foutTekst = fouten.length ? '\n\nWaarschuwingen:\n' + fouten.join('\n') : '';
  ui.alert(
    'Jaarafsluiting voltooid',
    'Boekjaar ' + huidigJaar + ' is afgesloten.\n\n' +
    '• Archief opgeslagen in Google Drive\n' +
    '• Factuurnummers beginnen opnieuw bij 1\n' +
    '• Factuurprefix: F' + nieuwJaar + '-\n' +
    '• Drive-mappen aangemaakt voor ' + nieuwJaar + foutTekst,
    ui.ButtonSet.OK
  );
}

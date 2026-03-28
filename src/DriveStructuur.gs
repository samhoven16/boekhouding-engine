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

  let html = '<h3>Google Drive mappen ' + jaar + '</h3><table style="border-collapse:collapse;width:100%;font-family:Arial;font-size:13px">';
  mappen.forEach(m => {
    const id = props.getProperty(m.key);
    let link = 'Nog niet aangemaakt';
    if (id) {
      try {
        const url = DriveApp.getFolderById(id).getUrl();
        link = '<a href="' + url + '" target="_blank">📁 Openen</a>';
      } catch(e) { link = 'Niet beschikbaar'; }
    }
    html += '<tr><td style="padding:5px 8px;font-weight:bold">' + m.label + '</td><td style="padding:5px 8px">' + link + '</td></tr>';
  });
  html += '</table>';
  html += '<br><button onclick="google.script.run.maakDriveStructuurManueel()">Mappen aanmaken / vernieuwen</button>';
  html += '&nbsp;<button onclick="google.script.host.close()">Sluiten</button>';

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
//  NIEUW BOEKJAAR AANMAKEN
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

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

  // Hoofdmap ophalen of aanmaken (collision-veilig)
  const hoofdmapKey = 'DRIVE_HOOFDMAP_' + jaar;
  let hoofdmap = getDriveMapViaKey_(hoofdmapKey);

  if (!hoofdmap) {
    const naam = bedrijf + ' – Boekhouding ' + jaar;
    // Collision-check: heeft de klant al een map met deze naam? (bv. handmatig
    // aangemaakt of een vorige setup waarbij de property is verloren). Drive
    // staat duplicaten met identieke naam toe — zonder check krijg je twee
    // parallelle "Boekhouding 2026" mappen en files belanden in de verkeerde.
    hoofdmap = _vindBestaandeDriveMap_(naam);
    if (hoofdmap) {
      props.setProperty(hoofdmapKey, hoofdmap.getId());
      Logger.log('Drive hoofdmap hergebruikt (collision-detect): ' + hoofdmap.getUrl());
      safeAuditLog_('Drive map hergebruikt', naam + ' (' + hoofdmap.getId() + ')');
    } else {
      hoofdmap = DriveApp.createFolder(naam);
      props.setProperty(hoofdmapKey, hoofdmap.getId());
      Logger.log('Drive hoofdmap aangemaakt: ' + hoofdmap.getUrl());
      safeAuditLog_('Drive map aangemaakt', naam + ' (' + hoofdmap.getId() + ')');
    }
  }

  // Submappen — zelfde collision-check binnen hoofdmap
  const submappen = {
    ['DRIVE_VERKOOPFACTUREN_' + jaar]: '📄 Verkoopfacturen',
    ['DRIVE_INKOOPFACTUREN_'  + jaar]: '🧾 Inkoopfacturen en bonnetjes',
    ['DRIVE_BTW_'             + jaar]: '📊 BTW aangiften',
    ['DRIVE_BANKAFSCHRIFTEN_' + jaar]: '🏦 Bankafschriften',
    ['DRIVE_JAARREKENING_'    + jaar]: '📑 Jaarrekening',
  };

  Object.entries(submappen).forEach(([key, naam]) => {
    if (getDriveMapViaKey_(key)) return;
    let submap = _vindBestaandeSubmap_(hoofdmap, naam);
    if (!submap) submap = hoofdmap.createFolder(naam);
    props.setProperty(key, submap.getId());
  });

  return hoofdmap;
}

/**
 * Zoekt een bestaande root-level map op naam en retourneert de eerste niet-trash
 * match. Voorkomt dubbele "Boekhouding 2026" mappen wanneer klant er handmatig
 * één heeft aangemaakt of property verloren is.
 */
function _vindBestaandeDriveMap_(naam) {
  // drive.file: whole-Drive zoeken mag niet → deze getFoldersByName-call gooit
  // een scope-error die hier wordt opgevangen (resultaat null → caller maakt een
  // verse hoofdmap aan). Collision-detectie is onder drive.file dus niet
  // beschikbaar; acceptabel want het primaire pad is de opgeslagen hoofdmap-ID.
  try {
    const it = DriveApp.getFoldersByName(naam);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed()) return f;
    }
  } catch (_) {}
  return null;
}

/**
 * Zoekt submap binnen een specifieke parent. Filtert prullenbak-items en
 * voorkomt dubbele submappen na herinstallatie.
 */
function _vindBestaandeSubmap_(parent, naam) {
  if (!parent) return null;
  try {
    const it = parent.getFoldersByName(naam);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed()) return f;
    }
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
//  SPECIFIEKE MAP OPHALEN
// ─────────────────────────────────────────────
function getDriveMapVerkoopfacturen_(jaar) {
  return getDriveMapViaKey_('DRIVE_VERKOOPFACTUREN_' + (jaar || new Date().getFullYear()));
}

function getDriveMapBtw_(jaar) {
  return getDriveMapViaKey_('DRIVE_BTW_' + (jaar || new Date().getFullYear()));
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

/**
 * Hoofdmap van een boekjaar via de opgeslagen ID. drive.file-veilig: de app mag
 * bij mappen die ze zélf aanmaakte (getFolderById + child-listing werken).
 * Geeft null als de ID ontbreekt/onbereikbaar is — callers maken dan een
 * bestand/map PARENT-LOOS aan (createFile/createFolder zonder parent werkt onder
 * drive.file, i.t.t. DriveApp.getRootFolder() die niet toegankelijk is).
 */
function getDriveHoofdmap_(jaar) {
  return getDriveMapViaKey_('DRIVE_HOOFDMAP_' + (jaar || new Date().getFullYear()));
}

/**
 * Backups-submap binnen de hoofdmap (app-created → drive.file-veilig: zoeken/
 * aanmaken binnen een zélf-aangemaakte map mag). Geeft null als er geen hoofdmap
 * is. maakAan=false → alleen lezen (niet aanmaken). Vervangt het whole-Drive
 * zoeken naar de legacy 'Boekhouding Backups'-topmap, dat onder drive.file niet
 * is toegestaan.
 */
function getDriveBackupMap_(jaar, maakAan) {
  const hoofd = getDriveHoofdmap_(jaar);
  if (!hoofd) return null;
  try {
    const it = hoofd.getFoldersByName('Backups');
    if (it.hasNext()) return it.next();
    return maakAan === false ? null : hoofd.createFolder('Backups');
  } catch (_) {
    return null;
  }
}

/**
 * Losse top-level map (bonnetjes/facturen) drive.file-veilig ophalen: primair via
 * opgeslagen ID (getFolderById op een door-de-app-aangemaakte map mag), anders
 * PARENT-LOOS aanmaken en de ID opslaan. Vermijdt DriveApp.getFoldersByName op
 * topniveau (whole-Drive-zoeken, niet toegestaan onder drive.file) én voorkomt
 * duplicaat-mappen.
 */
function getOfMaakLosseMap_(propKey, mapNaam) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(propKey);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_) {}
  }
  const folder = DriveApp.createFolder(mapNaam);
  props.setProperty(propKey, folder.getId());
  return folder;
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
    HtmlService.createHtmlOutput(html).setWidth(500).setHeight(350).setSandboxMode(HtmlService.SandboxMode.IFRAME),
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
    if (String(data[i][KOL.INST.sleutel]).startsWith('Drive:') || data[i][KOL.INST.sleutel] === 'GOOGLE DRIVE MAPPEN') {
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
    '✓ Resultaat verwerken: omzet en kosten van ' + huidigJaar + ' naar Eigen Vermogen\n' +
    '✓ Jaaroverdracht: resultaat van ' + huidigJaar + ' naar Onverdeelde winst voorgaande jaren\n' +
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

  // Pre-flight idempotency: voorkom dubbele resultaatverwerking voordat
  // we Drive-quota verbruiken aan een archief dat we niet kunnen gebruiken.
  if (jaarAlAfgesloten_(ss, huidigJaar)) {
    ui.alert(
      'Jaarafsluiting al voltooid',
      'Boekjaar ' + huidigJaar + ' is al afgesloten.\n\n' +
      'In Journaalposten staan al boekingen met referentie JA-' + huidigJaar + '. ' +
      'Een tweede afsluiting zou de resultaatverwerking dubbel boeken en de balans verstoren.\n\n' +
      'Neem contact op met je accountant als je een correctie wilt doorvoeren.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Pre-flight: strikte balans-check vóór jaarafsluiting. Drempel €0,005
  // (1 cent afronding × halve eenheid). Als balans niet sluit op deze
  // strikte drempel staat ergens een journaalpost scheef en gaat een
  // jaarafsluiting de drift permanent in archief vastleggen.
  if (typeof controleerBalansStrikt_ === 'function') {
    const balansCheck = controleerBalansStrikt_();
    if (balansCheck.status === 'KRITIEK') {
      // Harde blokker (audit F-ACC-002): bij een verschil > €0,005 — in een
      // integer-centen-administratie kán dat alleen een echte scheve boeking
      // zijn — mag de afsluiting NIET doorgaan. De oude YES-bypass legde de
      // niet-sluitende balans permanent (en daarna oncorrigeerbaar) in het
      // archief vast. Geen override-knop: eerst herstellen, dan opnieuw.
      schrijfAuditLog_('Jaarafsluiting GEBLOKKEERD',
        'Balans sluit niet strikt (' + balansCheck.status + '): ' + balansCheck.bericht);
      ui.alert(
        'Balans sluit niet — jaarafsluiting geblokkeerd',
        balansCheck.bericht + '\n\n' +
        'Voor een formele jaarrekening MOET activa = passiva tot op €0,005 nauwkeurig. ' +
        'De afsluiting is geblokkeerd zodat een niet-sluitende balans niet permanent ' +
        'in het archief belandt.\n\n' +
        'Herstel: kies "Grootboeksaldi herberekenen", corrigeer de scheve journaalpost, ' +
        'en sluit daarna opnieuw af.',
        ui.ButtonSet.OK
      );
      return;
    }
  }

  // 1. Archiveer huidige spreadsheet — KRITISCH: zonder backup geen reset
  let archiefUrl = '';
  try {
    const archief = ss.copy('Boekhoudbaar ' + huidigJaar + ' — Archief');
    archiefUrl = archief.getUrl();
    schrijfAuditLog_('Jaarafsluiting', 'Archief aangemaakt: ' + archiefUrl);
  } catch (e) {
    // Stop direct. Counters niet resetten zonder bewezen archief —
    // anders verlies je je sequentiële factuurnummering bij Drive-quota issue.
    schrijfAuditLog_('Jaarafsluiting AFGEBROKEN', 'Archief mislukt: ' + e.message);
    ui.alert(
      'Jaarafsluiting afgebroken',
      'Het archief kon niet worden aangemaakt:\n\n' + e.message + '\n\n' +
      'Geen wijzigingen aangebracht. Veelvoorkomende oorzaken:\n' +
      '• Google Drive opslag vol — ruim ruimte op\n' +
      '• Geen Drive-rechten — controleer account\n\n' +
      'Probeer opnieuw zodra het probleem is opgelost.',
      ui.ButtonSet.OK
    );
    return;
  }

  // 2. Resultaatverwerking + jaaroverdracht (balanscontinuiteit RJ 160/170)
  // FATAL bij failure: zonder geslaagde resultaatverwerking mogen we de
  // factuurnummering NIET resetten — boekjaar N is dan boekhoudkundig
  // niet afgesloten, terwijl de tellers wel naar N+1 zouden wijzen.
  let afsluitResultaat = null;
  try {
    afsluitResultaat = voerJaarafsluitingResultaatUit_(ss, huidigJaar);
  } catch (e) {
    schrijfAuditLog_('Jaarafsluiting AFGEBROKEN', 'Resultaatverwerking faalde: ' + e.message);
    ui.alert(
      'Jaarafsluiting afgebroken',
      'De resultaatverwerking kon niet voltooid worden:\n\n' + e.message + '\n\n' +
      'Archief blijft beschikbaar: ' + archiefUrl + '\n\n' +
      'Factuurnummers en boekjaar-instellingen zijn NIET aangepast. ' +
      'Controleer de Journaalposten en neem contact op met support als dit aanhoudt.',
      ui.ButtonSet.OK
    );
    return;
  }

  // 3. Factuurprefix + boekjaarinstellingen bijwerken in sheet
  // Volgorde-invariant: prefix MOET bijgewerkt zijn vóór de tellers
  // resetten. Zo voorkomen we dat een mislukte prefix-update de tellers
  // op '1' achterlaat met de oude prefix → duplicaat factuurnummers
  // tegenover vorig boekjaar (Wet OB art. 35a schending).
  _instellingenCache = null; // invalidate cache before writes
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
      const sleutel = String(data[i][KOL.INST.sleutel]);
      if (Object.prototype.hasOwnProperty.call(updates, sleutel)) {
        instSheet.getRange(i + 1, 2).setValue(updates[sleutel]);
      }
    }
    _instellingenCache = null; // invalidate na writes
  }

  // 4. Reset tellers — pas NA succesvolle prefix-update
  props.setProperty(PROP.VOLGEND_FACTUUR_NR, '1');
  props.setProperty(PROP.VOLGEND_INKOOP_NR,  '1');

  // 5. Drive-structuur nieuw boekjaar
  try {
    maakDriveStructuur_(nieuwJaar);
    slaDriverLinksOpInInstellingen_(nieuwJaar);
  } catch (e) {
    fouten.push('Drive-mappen niet aangemaakt: ' + e.message);
  }

  // 6. Vergrendel het afgesloten boekjaar als gesloten periode (audit F-ACC-003).
  // Hierdoor dekt de formele I8-immutability-verifier dit jaar via
  // GESLOTEN_PERIODES, onafhankelijk van de losse JA-tag in maakJournaalpost_.
  // MOET ná de resultaatverwerking gebeuren — die boekt JA-posten ín huidigJaar;
  // eerder vergrendelen zou de afsluitboekingen zelf blokkeren.
  try {
    vergrendelPeriode_(
      new Date(huidigJaar, 0, 1),
      new Date(huidigJaar, 11, 31, 23, 59, 59, 999),
      'Jaarafsluiting ' + huidigJaar
    );
  } catch (e) {
    fouten.push('Periode-vergrendeling ' + huidigJaar + ' niet vastgelegd: ' + e.message);
  }

  schrijfAuditLog_('Jaarafsluiting voltooid', huidigJaar + ' → ' + nieuwJaar);

  const foutTekst = fouten.length ? '\n\nWaarschuwingen:\n' + fouten.join('\n') : '';
  const resultaatTekst = afsluitResultaat
    ? '\n• Resultaat ' + huidigJaar + ': € ' + formatBedrag_(afsluitResultaat.resultaat) +
      ' (' + afsluitResultaat.boekingenCount + ' afsluitboekingen)'
    : '';
  ui.alert(
    'Jaarafsluiting voltooid',
    'Boekjaar ' + huidigJaar + ' is afgesloten.\n\n' +
    '• Archief opgeslagen in Google Drive' + resultaatTekst + '\n' +
    '• Factuurnummers beginnen opnieuw bij 1\n' +
    '• Factuurprefix: F' + nieuwJaar + '-\n' +
    '• Drive-mappen aangemaakt voor ' + nieuwJaar + foutTekst,
    ui.ButtonSet.OK
  );
}

/**
 * Auto-detect of jaarafsluiting nodig is.
 * Aangeroepen vanuit onOpen — als huidig kalenderjaar niet meer matcht met
 * het jaar in factuurprefix (bv. F2026- terwijl het 2027 is), toont prominent
 * banner met "klik hier voor jaarafsluiting".
 *
 * Throttle: max 1× per dag waarschuwen (anders dialoog-spam).
 */
function checkJaarwisselingNodig_() {
  try {
    // Verse kopie: SETUP_DONE reist niet mee. Zonder deze gate kan een YES-klik
    // sluitJaarAf() draaien op de GEËRFDE master-data van een kopie die nooit
    // zelf setupte (archief + prefix-herschrijving + teller-reset = dataverlies).
    if (PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) !== 'true') return;
    const huidigJaar = new Date().getFullYear();
    // Alleen waarschuwen in januari–februari (vroeg in nieuw jaar) en bij
    // mismatch — voorkomt onnodige paniek midden in jaar bij prefix-typo.
    const maand = new Date().getMonth() + 1; // 1-12
    if (maand > 3) return;

    const props = PropertiesService.getScriptProperties();
    const KEY = 'jaarwisselingWaarschuwingTs';
    const last = parseInt(props.getProperty(KEY) || '0');
    if (Date.now() - last < 24 * 3600 * 1000) return;

    // Lees huidige factuurprefix uit Instellingen
    let prefix = '';
    try { prefix = String(getInstelling_('Factuurprefix') || '').trim(); } catch (_) {}
    const prefixJaarMatch = prefix.match(/(\d{4})/);
    if (!prefixJaarMatch) return;
    const prefixJaar = parseInt(prefixJaarMatch[1]);

    if (prefixJaar < huidigJaar) {
      props.setProperty(KEY, String(Date.now()));
      const ui = SpreadsheetApp.getUi();
      const resp = ui.alert(
        '🗓️ Jaarafsluiting ' + prefixJaar + ' nog te doen',
        'Het is nu ' + huidigJaar + ', maar je factuurprefix staat nog op ' +
        prefix + ' (boekjaar ' + prefixJaar + ').\n\n' +
        'Wat dit betekent:\n' +
        '• Nieuwe facturen krijgen nog een ' + prefixJaar + '-nummer\n' +
        '• BTW-rapporten kloppen niet meer voor het nieuwe jaar\n\n' +
        'JAARAFSLUITING DOEN?\n\n' +
        'Dit doet automatisch:\n' +
        '✓ Archief maken van ' + prefixJaar + '-data in Drive\n' +
        '✓ Factuurprefix bijwerken naar F' + huidigJaar + '-\n' +
        '✓ Nummering opnieuw starten vanaf 1\n' +
        '✓ Drive-mappen voor ' + huidigJaar + ' klaarzetten\n\n' +
        'Ja → start nu | Nee → uitstellen (waarschuwing morgen weer)',
        ui.ButtonSet.YES_NO
      );
      if (resp === ui.Button.YES) {
        sluitJaarAf();
      } else {
        safeAuditLog_('Jaarwisseling uitgesteld door klant', prefix + ' → ' + huidigJaar);
      }
    }
  } catch (e) {
    Logger.log('checkJaarwisselingNodig_ silent fail: ' + e.message);
  }
}

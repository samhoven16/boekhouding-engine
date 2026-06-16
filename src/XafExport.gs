/**
 * XafExport.gs
 *
 * Genereer een Auditfile Financieel (XAF) versie 3.2 export van de complete
 * administratie. Dit is de Nederlandse standaard voor:
 *   - Belastingdienst-controle (art. 52 AWR fiscale bewaarplicht 7 jaar)
 *   - Overdracht naar andere boekhoudsoftware
 *   - Accountant-aanlevering
 *
 * KERN VAN BOEKHOUDBAAR'S "BEZIT JE ADMINISTRATIE"-PROPOSITIE:
 * Deze functie MOET altijd werken — ook na opzegging, ook bij founder-overlijden,
 * ook bij Boekhoudbaar-faillissement. Het is de exit-route die de propositie
 * verdedigt. Een klant die weet dat hij weg kan, blijft. Een klant die merkt
 * dat hij niet weg kan, wordt activist.
 *
 * Specificatie: XBRL-NL/Auditfile Financieel 3.2 — formele NL-standaard.
 * Schema: http://www.auditfiles.nl/XAF/3.2
 *
 * Menu: Boekhouding → Data → Exporteer als XAF (Auditfile)
 */

'use strict';

const XAF_VERSIE = '3.2';
const XAF_NAMESPACE = 'http://www.auditfiles.nl/XAF/3.2';

/**
 * Hoofdfunctie — genereert XAF en biedt download aan via HTML-dialog.
 *
 * Audit 2026-06-12 (C3): vraagt nu om het exportjaar. Voorheen pakte de
 * functie altijd new Date().getFullYear() → accountant kon in maart 2027
 * geen XAF voor 2026 maken (header zei 2027, alle 2026-rijen werden
 * uitgefilterd). Default = huidig jaar; klant kan overschrijven.
 */
function exporteerXaf(jaarOverschrijving) {
  const ui = SpreadsheetApp.getUi();
  const ss = (typeof getSpreadsheet_ === 'function') ? getSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    ui.alert('Geen spreadsheet bereikbaar.');
    return;
  }

  // Bepaal het exportjaar. Als de aanroeper geen jaar meegaf en we zitten
  // in een UI-context, vragen we het via prompt. In trigger/test-context
  // zonder UI: huidig kalenderjaar als veilig default.
  let exportJaar = parseInt(jaarOverschrijving, 10);
  if (!isFinite(exportJaar) || exportJaar < 2000 || exportJaar > 2099) {
    exportJaar = new Date().getFullYear();
    try {
      const resp = ui.prompt(
        'XAF-export — kies boekjaar',
        'Welk boekjaar wil je exporteren? Default: ' + exportJaar + '. ' +
        'Vul een ander jaar in (bv. 2026 voor de aangifte van vorig jaar) of laat leeg.',
        ui.ButtonSet.OK_CANCEL);
      if (resp.getSelectedButton() === ui.Button.CANCEL) return;
      const ingevuld = String(resp.getResponseText() || '').trim();
      if (ingevuld) {
        const parsed = parseInt(ingevuld, 10);
        if (isFinite(parsed) && parsed >= 2000 && parsed <= 2099) exportJaar = parsed;
      }
    } catch (_) { /* geen UI-context — gebruik default */ }
  }

  // Toast — klant ziet dat we werken
  try { ss.toast('XAF-export ' + exportJaar + ' wordt voorbereid, even geduld…', 'Export', 5); } catch (_) {}

  let xml;
  try {
    xml = _bouwXafXml_(ss, exportJaar);
  } catch (e) {
    Logger.log('XAF-export fout: ' + e.message);
    ui.alert('XAF-export mislukt',
      'Er ging iets mis bij het opbouwen van de export: ' + e.message + '\n\n' +
      'Mail support@boekhoudbaar.nl met deze foutmelding.',
      ui.ButtonSet.OK);
    return;
  }

  const bedrijf = ((typeof getInstelling_ === 'function' ? getInstelling_('Bedrijfsnaam') : '') || 'administratie')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  // Bestandsnaam bevat het EXPORTJAAR (niet het huidige) zodat een
  // accountant XAF_klant_2026_2027-03-15.xaf.xml herkent als 2026-aangifte.
  const bestandsnaam = 'XAF_' + bedrijf + '_' + exportJaar + '_' + Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd') + '.xaf.xml';

  // Sla op in klant's eigen Drive (zelfde map als spreadsheet)
  let driveUrl = '';
  try {
    const blob = Utilities.newBlob(xml, 'application/xml', bestandsnaam);
    const ssFile = DriveApp.getFileById(ss.getId());
    const parents = ssFile.getParents();
    const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

    // Probeer "Exports" submap aan te maken (idempotent)
    let exportsFolder;
    const it = parentFolder.getFoldersByName('XAF-exports');
    if (it.hasNext()) {
      exportsFolder = it.next();
    } else {
      exportsFolder = parentFolder.createFolder('XAF-exports');
    }

    const bestand = exportsFolder.createFile(blob);
    driveUrl = bestand.getUrl();

    safeAuditLog_('XAF-export gemaakt', bestandsnaam + ' (' + Math.round(xml.length / 1024) + ' KB) → ' + driveUrl);
  } catch (driveFout) {
    Logger.log('XAF-export naar Drive mislukt: ' + driveFout.message);
    // Fallback: toon XML in dialog zodat klant het kan kopiëren
    _toonXafDialog_(xml, bestandsnaam, driveFout.message);
    return;
  }

  // Succesvol opgeslagen — open dialog met link
  _toonXafDialog_(xml, bestandsnaam, null, driveUrl);
}

/**
 * Toont resultaat-dialog. Bij succes: link naar bestand. Bij fallback: copy-paste-XML.
 */
function _toonXafDialog_(xml, bestandsnaam, fout, driveUrl) {
  const ui = SpreadsheetApp.getUi();
  const sizeKb = Math.round(xml.length / 1024);

  if (driveUrl) {
    const html = HtmlService.createHtmlOutput(`
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:24px;color:#1A1A1A">
        <h2 style="color:#0D1B4E;margin:0 0 12px;font-size:20px">✓ XAF-export gemaakt</h2>
        <p style="margin:0 0 16px">Je administratie is geëxporteerd als <strong>Auditfile Financieel 3.2</strong> (${sizeKb} KB).</p>
        <div style="background:#F7F9FC;border-radius:8px;padding:14px;margin:0 0 16px">
          <div style="font-size:12px;color:#5F6B7A;margin-bottom:4px">Bestand</div>
          <div style="font-family:monospace;font-size:13px;color:#0D1B4E;word-break:break-all">${bestandsnaam}</div>
        </div>
        <div style="background:#E8F8F6;border-left:4px solid #2EC4B6;padding:12px 16px;margin:0 0 16px;font-size:13px">
          <strong>Wat is dit?</strong> Het Auditfile Financieel is de Nederlandse standaard voor administratie-overdracht.
          Belastingdienst, accountants en andere boekhoudsoftware kunnen dit bestand direct inlezen.
          Dit is jouw <em>data-soevereiniteit</em> in actie — je kunt altijd weg, zonder iets te verliezen.
        </div>
        <a href="${driveUrl}" target="_blank" style="display:inline-block;background:#0D1B4E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open bestand in Drive →</a>
        <p style="margin:18px 0 0;font-size:12px;color:#5F6B7A">
          Het bestand staat in je eigen Google Drive in de map "XAF-exports" naast je administratie-spreadsheet.
        </p>
      </div>
    `).setWidth(540).setHeight(380);
    ui.showModalDialog(html, 'XAF-export gemaakt');
  } else {
    // Fallback: laat klant XML kopiëren
    const html = HtmlService.createHtmlOutput(`
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:24px;color:#1A1A1A">
        <h2 style="color:#0D1B4E;margin:0 0 12px;font-size:20px">XAF-export — handmatig opslaan</h2>
        <p style="margin:0 0 12px;color:#B71C1C;font-size:14px"><strong>Drive-opslag mislukt:</strong> ${fout || 'onbekende fout'}</p>
        <p style="margin:0 0 12px;font-size:13px">Selecteer en kopieer de XML hieronder. Plak in een tekst-editor en sla op als <code>${bestandsnaam}</code>.</p>
        <textarea readonly style="width:100%;height:280px;font-family:monospace;font-size:11px;border:1px solid #E5EAF2;border-radius:8px;padding:10px">${xml.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')}</textarea>
        <button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value);this.textContent='Gekopieerd ✓'" style="margin-top:12px;background:#2EC4B6;color:#0A4744;border:none;padding:10px 18px;border-radius:6px;font-weight:600;cursor:pointer">Kopieer naar klembord</button>
      </div>
    `).setWidth(680).setHeight(480);
    ui.showModalDialog(html, 'XAF-export');
  }
}

/**
 * Bouw de complete XAF XML-string. Conform XAF 3.2 schema.
 * Verplichte secties:
 *   - header (bedrijf, periode, software-info)
 *   - company (gegevens onderneming)
 *   - generalLedger (rekeningen)
 *   - customersSuppliers (klanten + leveranciers, optioneel)
 *   - transactions (journaalposten)
 */
function _bouwXafXml_(ss, jaarArg) {
  // C3-audit 2026-06-12: jaar is nu een parameter. Default = huidig jaar
  // voor backwards-compatibiliteit met legacy-callers.
  const jaar = (isFinite(parseInt(jaarArg, 10)) && jaarArg >= 2000 && jaarArg <= 2099)
    ? parseInt(jaarArg, 10)
    : new Date().getFullYear();
  const bedrijfsnaam = (typeof getInstelling_ === 'function' ? getInstelling_('Bedrijfsnaam') : '') || 'Onbenoemd';
  const kvk = (typeof getInstelling_ === 'function' ? getInstelling_('KvK-nummer') : '') || '';
  const btwNr = (typeof getInstelling_ === 'function' ? getInstelling_('BTW-nummer') : '') || '';

  const periodeStart = jaar + '-01-01';
  const periodeEnd = jaar + '-12-31';
  const exportDatum = Utilities.formatDate(new Date(), 'Europe/Amsterdam', "yyyy-MM-dd'T'HH:mm:ss");

  // Header
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<auditfile xmlns="' + XAF_NAMESPACE + '" version="' + XAF_VERSIE + '">\n';
  xml += '  <header>\n';
  xml += '    <fiscalYear>' + jaar + '</fiscalYear>\n';
  xml += '    <startDate>' + periodeStart + '</startDate>\n';
  xml += '    <endDate>' + periodeEnd + '</endDate>\n';
  xml += '    <curCode>EUR</curCode>\n';
  xml += '    <dateCreated>' + exportDatum + '</dateCreated>\n';
  xml += '    <softwareDesc>Boekhoudbaar</softwareDesc>\n';
  xml += '    <softwareVersion>' + ((typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : '?') + '</softwareVersion>\n';
  xml += '  </header>\n';

  // Company
  xml += '  <company>\n';
  xml += '    <companyIdent>' + _xafEsc_(kvk) + '</companyIdent>\n';
  xml += '    <companyName>' + _xafEsc_(bedrijfsnaam) + '</companyName>\n';
  if (btwNr) xml += '    <taxRegistrationCountry>NL</taxRegistrationCountry>\n';
  if (btwNr) xml += '    <taxRegIdent>' + _xafEsc_(btwNr) + '</taxRegIdent>\n';
  xml += '\n';

  // General Ledger — rekeningen uit grootboekschema
  xml += '    <generalLedger>\n';
  xml += _bouwGrootboekXml_(ss);
  xml += '    </generalLedger>\n';

  // Customers + Suppliers — optioneel maar wel opnemen voor compleetheid
  try {
    xml += _bouwRelatiesXml_(ss);
  } catch (e) {
    Logger.log('XAF: relaties-sectie overgeslagen: ' + e.message);
  }

  // Transactions — journaalposten
  xml += '    <transactions>\n';
  xml += _bouwTransactionsXml_(ss, jaar);
  xml += '    </transactions>\n';

  xml += '  </company>\n';
  xml += '</auditfile>\n';

  return xml;
}

/**
 * Bouw <ledgerAccount>-records uit GROOTBOEKSCHEMA-tab.
 */
function _bouwGrootboekXml_(ss) {
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  if (!sheet) return '      <!-- Grootboekschema niet beschikbaar -->\n';

  const data = sheet.getDataRange().getValues();
  let xml = '';
  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    const code = String(rij[0] || '').trim();
    const naam = String(rij[1] || '').trim();
    if (!code) continue;
    xml += '      <ledgerAccount>\n';
    xml += '        <accID>' + _xafEsc_(code) + '</accID>\n';
    xml += '        <accDesc>' + _xafEsc_(naam) + '</accDesc>\n';
    // accTp = grootboek-categorie (B=balans, P=winst-verlies). Gebruik de
    // expliciete Balans/W&V-kolom [4] uit het schema (F-ACC-009) i.p.v. een gok
    // op het eerste code-cijfer — een custom schema met bv. een resultaat-
    // rekening in de 0-3 range kreeg anders ten onrechte 'B' en moest de
    // accountant bij import handmatig herclassificeren. Val alleen terug op de
    // code-range-heuristiek als de Balans/W&V-kolom leeg/onbekend is.
    const bwVlag = String(rij[4] || '').trim().toLowerCase().charAt(0);
    let accTp;
    if (bwVlag === 'b') accTp = 'B';        // "Balans"
    else if (bwVlag === 'w') accTp = 'P';   // "W&V" / "Winst & Verlies"
    else {
      const eersteCijfer = code.charAt(0);  // fallback: code-range-heuristiek
      accTp = (eersteCijfer >= '4' && eersteCijfer <= '9') ? 'P' : 'B';
    }
    xml += '        <accTp>' + accTp + '</accTp>\n';
    // K2-Accountant (criticus-rapport): RGS NL-codering toevoegen zodat
    // Caseware/Visma/Twinfield/Pinkweb/Exact direct kunnen mappen
    // zonder handmatige rekening-koppeling per cliënt. RGS-tabel staat
    // in src/RgsMapping.gs. Niet-gemapte rekeningen krijgen geen tag —
    // accountant kan die handmatig invullen in zijn ontvangst-systeem.
    if (typeof getRgsCode_ === 'function') {
      const rgs = getRgsCode_(code);
      if (rgs) {
        xml += '        <leadCode>' + _xafEsc_(rgs) + '</leadCode>\n';
        xml += '        <leadDescription>RGS NL 3.5</leadDescription>\n';
      }
    }
    xml += '      </ledgerAccount>\n';
  }
  return xml;
}

/**
 * Bouw <customersSuppliers>-sectie. Optioneel — alleen als RELATIES bestaat.
 */
function _bouwRelatiesXml_(ss) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  if (!sheet) return '';

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return '';

  let klanten = '';
  let leveranciers = '';
  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    // Kolomindices conform .claude/sheet-schemas.md RELATIES:
    // [0]=Relatie ID, [1]=Type, [2]=Naam, [8]=KvK, [9]=BTW, [10]=Email.
    // Eerdere versie las [0] als naam etc. → Relatie-ID als naam en
    // ontbrekende KvK/BTW-nummers in het auditfile (faalt VIES/ICP-crosscheck).
    const relatieId = String(rij[0] || '').trim();
    const type = String(rij[1] || '').toLowerCase();
    const naam = String(rij[2] || '').trim();
    if (!naam) continue;
    const kvk = String(rij[8] || '').trim();
    const btw = String(rij[9] || '').trim();
    const email = String(rij[10] || '').trim();

    const entry = '      <customerSupplier>\n' +
      '        <custSupID>' + _xafEsc_((relatieId || naam).substring(0, 50)) + '</custSupID>\n' +
      '        <custSupName>' + _xafEsc_(naam) + '</custSupName>\n' +
      (kvk ? '        <custSupCompanyIdent>' + _xafEsc_(kvk) + '</custSupCompanyIdent>\n' : '') +
      (btw ? '        <taxRegIdent>' + _xafEsc_(btw) + '</taxRegIdent>\n' : '') +
      (email ? '        <contact>\n          <contEmail>' + _xafEsc_(email) + '</contEmail>\n        </contact>\n' : '') +
      '      </customerSupplier>\n';

    if (type.indexOf('lever') === 0) {
      leveranciers += entry;
    } else {
      klanten += entry;
    }
  }

  let xml = '';
  if (klanten) {
    xml += '    <customers>\n' + klanten + '    </customers>\n';
  }
  if (leveranciers) {
    xml += '    <suppliers>\n' + leveranciers + '    </suppliers>\n';
  }
  return xml;
}

/**
 * C2 (audit 2026-06-12): mapt het tekst-Dagboek-veld op een RGS-XAF-
 * dagboek-ID + dagboektype-code conform XAF 3.2:
 *   V = Verkoop, I = Inkoop, B = Bank, K = Kas, M = Memoriaal, O = Other/overig
 *
 * Voorheen werden ALLE journaalposten in één <journal jrnID="ALG" jrnTp="O">
 * geplaatst → Caseware/Visma/Twinfield konden dit niet automatisch
 * verwerken; accountant moest handmatig herclassificeren.
 *
 * @param {string} dagboekTekst   waarde uit JOURNAALPOSTEN kolom 3
 * @returns {{id: string, type: string, desc: string}}
 */
function _xafDagboekClassificeer_(dagboekTekst) {
  const lc = String(dagboekTekst || '').toLowerCase();
  if (/verkoop|debiteur|factuur uit/.test(lc))     return { id: 'V', type: 'V', desc: 'Verkoopdagboek' };
  if (/inkoop|crediteur|factuur in/.test(lc))      return { id: 'I', type: 'I', desc: 'Inkoopdagboek' };
  if (/bank|sepa|tikkie|paypal|stripe|mollie/.test(lc)) return { id: 'B', type: 'B', desc: 'Bankboek' };
  if (/^kas\b|kassa|contant/.test(lc))             return { id: 'K', type: 'K', desc: 'Kasboek' };
  if (/memo|journaal|correctie|overig|herwaardering/.test(lc)) return { id: 'M', type: 'M', desc: 'Memoriaal' };
  return { id: 'M', type: 'M', desc: 'Memoriaal (default)' };
}

/**
 * Bouw <journal>-records uit JOURNAALPOSTEN-tab voor het opgegeven jaar.
 *
 * Audit 2026-06-12 (C2): journaalposten worden nu per dagboek gegroepeerd
 * (Verkoop, Inkoop, Bank, Kas, Memoriaal). RGS/XAF 3.2-conform —
 * accountantssoftware kan dit automatisch verwerken.
 */
function _bouwTransactionsXml_(ss, jaar) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) return '      <!-- Journaalposten niet beschikbaar -->\n';

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return '      <!-- Geen journaalposten -->\n';

  // Schema (echte indexen uit Setup.gs:zetJournaalpostenHeaders_):
  //   rij[0]=Boeking ID, rij[1]=Datum, rij[2]=Omschrijving, rij[3]=Dagboek,
  //   rij[4]=Debet rekening, rij[5]=Debet omschr, rij[6]=Credit rekening,
  //   rij[7]=Credit omschr, rij[8]=Bedrag, rij[9]=BTW %, rij[10]=BTW bedrag, ...

  // Eerste pass: groepeer ROW-INDEX per dagboek-ID. Tweede pass: bouw XML
  // per dagboek. Voorkomt N² door geneste loops.
  const grouped = { V: [], I: [], B: [], K: [], M: [] };
  const labels = {};

  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    const id = String(rij[0] || '').trim();
    let datum = rij[1];
    let datumObj = datum instanceof Date ? datum : null;
    if (datum instanceof Date) {
      // Filter op fiscaal jaar
      if (datum.getFullYear() !== jaar) continue;
      datum = Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd');
    } else if (!datum) {
      continue;
    } else {
      datum = String(datum);
      datumObj = (typeof parseDatum_ === 'function') ? parseDatum_(datum) : new Date(datum);
      // CYCLE-48: string-dated journaalposten ontweken eerder het fiscaal-jaar
      // filter (alleen Date-pad checkte jaar). Gevolg: XAF-export voor jaar X
      // bevatte ook entries van jaar Y → audit-error bij Belastingdienst of
      // accountant. Filter nu in beide paden.
      if (!datumObj || isNaN(datumObj.getTime()) || datumObj.getFullYear() !== jaar) continue;
      datum = Utilities.formatDate(datumObj, 'Europe/Amsterdam', 'yyyy-MM-dd');
    }
    const omschr = String(rij[2] || '').trim();
    const dagboek = String(rij[3] || '').trim();
    const debet = String(rij[4] || '').trim();
    const credit = String(rij[6] || '').trim();
    const bedrag = parseFloat(rij[8]) || 0;
    if (!id || !debet || !credit || bedrag <= 0) continue;

    // periodNumber 1-12 — gebruik geparste datumObj direct (new Date(datum-string)
    // kan ambiguous zijn afhankelijk van locale). datumObj is gegarandeerd Date.
    const periode = datumObj && !isNaN(datumObj.getTime()) ? datumObj.getMonth() + 1 : 1;
    const klassificatie = _xafDagboekClassificeer_(dagboek);
    labels[klassificatie.id] = klassificatie.desc;
    let tx = '        <transaction>\n';
    tx += '          <nr>' + _xafEsc_(id) + '</nr>\n';
    tx += '          <desc>' + _xafEsc_(omschr) + '</desc>\n';
    tx += '          <periodNumber>' + periode + '</periodNumber>\n';
    tx += '          <transactionDate>' + datum + '</transactionDate>\n';
    // Debet-regel
    tx += '          <trLine>\n';
    tx += '            <nr>1</nr>\n';
    tx += '            <accID>' + _xafEsc_(debet) + '</accID>\n';
    tx += '            <docRef>' + _xafEsc_(id) + '</docRef>\n';
    tx += '            <effectiveDate>' + datum + '</effectiveDate>\n';
    tx += '            <desc>' + _xafEsc_(omschr) + '</desc>\n';
    tx += '            <amnt>' + bedrag.toFixed(2) + '</amnt>\n';
    tx += '            <amntTp>D</amntTp>\n';
    tx += '          </trLine>\n';
    // Credit-regel
    tx += '          <trLine>\n';
    tx += '            <nr>2</nr>\n';
    tx += '            <accID>' + _xafEsc_(credit) + '</accID>\n';
    tx += '            <docRef>' + _xafEsc_(id) + '</docRef>\n';
    tx += '            <effectiveDate>' + datum + '</effectiveDate>\n';
    tx += '            <desc>' + _xafEsc_(omschr) + '</desc>\n';
    tx += '            <amnt>' + bedrag.toFixed(2) + '</amnt>\n';
    tx += '            <amntTp>C</amntTp>\n';
    tx += '          </trLine>\n';
    tx += '        </transaction>\n';
    grouped[klassificatie.id].push(tx);
  }

  // Tweede pass: render één <journal>-blok per dagboek. Geforceerde
  // volgorde V → I → B → K → M voor consistente lezing door accountants.
  let xml = '';
  ['V', 'I', 'B', 'K', 'M'].forEach(function(jrnId) {
    if (!grouped[jrnId] || grouped[jrnId].length === 0) return;
    const typeMap = { V: 'V', I: 'I', B: 'B', K: 'K', M: 'M' };
    xml += '      <journal>\n';
    xml += '        <jrnID>' + jrnId + '</jrnID>\n';
    xml += '        <desc>' + _xafEsc_(labels[jrnId] || jrnId) + '</desc>\n';
    xml += '        <jrnTp>' + typeMap[jrnId] + '</jrnTp>\n';
    xml += grouped[jrnId].join('');
    xml += '      </journal>\n';
  });
  if (!xml) return '      <!-- Geen journaalposten in jaar ' + jaar + ' -->\n';
  return xml;
}

/**
 * XML-escape voor tekstwaarden. Strict — voorkom XML-injectie.
 */
function _xafEsc_(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

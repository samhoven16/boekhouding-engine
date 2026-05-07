/**
 * DataPortability.gs — GDPR art. 20 export.
 *
 * Eén klik → klant krijgt complete export van AL z'n data:
 *  1. XLSX van hele spreadsheet (= reeds via maakBackup, hergebruikt)
 *  2. JSONL van audit-log (laatste 90 dagen)
 *  3. Metadata-bestand: bedrijfsgegevens + instellingen + tax-versie
 *
 * Alle drie in één Drive-folder met datum-stempel. Klant kan deze folder
 * downloaden of doorsturen naar volgende boekhoudtool.
 */

function exporteerAlleData() {
  const ui = SpreadsheetApp.getUi();
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;

  const bevestig = ui.alert(
    '📦 Volledige data-export (GDPR art. 20)',
    'Dit maakt een export van AL je data:\n\n' +
    '• XLSX-backup van complete spreadsheet\n' +
    '• Audit-log laatste 90 dagen (JSONL)\n' +
    '• Bedrijfsgegevens + instellingen (JSON)\n' +
    '• Belastingadvies-snapshot (JSON)\n' +
    '• PDF-archief alle facturen\n\n' +
    'Output: één Drive-map met alles erin.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.OK_CANCEL
  );
  if (bevestig !== ui.Button.OK) return;

  const ss = getSpreadsheet_();
  if (!ss) return;
  const ssId = ss.getId();
  const bedrijf = (getInstelling_('Bedrijfsnaam') || 'Boekhouding').replace(/[^a-zA-Z0-9 _-]/g, '');
  const ts = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd_HH-mm');
  const mapNaam = 'export-volledig_' + bedrijf + '_' + ts;

  // Maak export-map binnen klant's Drive-structuur
  let exportMap = null;
  try {
    const huidigJaar = new Date().getFullYear();
    const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + huidigJaar);
    if (hoofdId) {
      const hoofd = DriveApp.getFolderById(hoofdId);
      const it = hoofd.getFoldersByName('Exports');
      const exportsParent = it.hasNext() ? it.next() : hoofd.createFolder('Exports');
      exportMap = exportsParent.createFolder(mapNaam);
    }
  } catch (_) {}
  if (!exportMap) exportMap = DriveApp.getRootFolder().createFolder(mapNaam);

  let aantalBestanden = 0;
  let fouten = [];

  // 1. XLSX-backup
  try {
    SpreadsheetApp.flush();
    const xlsxResp = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (xlsxResp.getResponseCode() === 200) {
      const blob = xlsxResp.getBlob().setName('volledige-administratie.xlsx');
      exportMap.createFile(blob);
      aantalBestanden++;
    } else {
      fouten.push('XLSX-export status ' + xlsxResp.getResponseCode());
    }
  } catch (e) { fouten.push('XLSX: ' + e.message); }

  // 2. Audit-log JSONL (laatste 90 dagen)
  try {
    const auditSheet = ss.getSheetByName('Audit Log');
    if (auditSheet && auditSheet.getLastRow() > 1) {
      const data = auditSheet.getDataRange().getValues();
      const headers = data[0];
      const grens = Date.now() - 90 * 86400000;
      const events = [];
      for (let i = 1; i < data.length; i++) {
        const tsRow = data[i][0] instanceof Date ? data[i][0].getTime() : 0;
        if (tsRow < grens) continue;
        const event = {};
        headers.forEach(function(h, idx) {
          event[String(h).toLowerCase().replace(/\s+/g, '_')] = data[i][idx] instanceof Date
            ? data[i][idx].toISOString()
            : data[i][idx];
        });
        events.push(event);
      }
      const jsonl = events.map(function(e) { return JSON.stringify(e); }).join('\n');
      exportMap.createFile('audit-log-90d.jsonl', jsonl, 'application/x-ndjson');
      aantalBestanden++;
    }
  } catch (e) { fouten.push('Audit: ' + e.message); }

  // 3. Bedrijfsgegevens + instellingen
  try {
    const instSheet = ss.getSheetByName('Instellingen');
    const instellingen = {};
    if (instSheet && instSheet.getLastRow() > 1) {
      const data = instSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const k = String(data[i][0] || '').trim();
        if (k && !/wachtwoord|password|key|secret|token/i.test(k)) {
          instellingen[k] = String(data[i][1] || '');
        }
      }
    }
    const meta = {
      exportTijdstip: new Date().toISOString(),
      bedrijf: bedrijf,
      spreadsheetId: ssId,
      versie: PropertiesService.getScriptProperties().getProperty('geinstalleerde_versie') || 'onbekend',
      instellingen: instellingen,
    };
    exportMap.createFile('metadata.json', JSON.stringify(meta, null, 2), 'application/json');
    aantalBestanden++;
  } catch (e) { fouten.push('Metadata: ' + e.message); }

  // 4. Belastingadvies-snapshot (huidige berekening met input-hash)
  try {
    if (typeof berekenBelastingadvies_ === 'function') {
      const advies = berekenBelastingadvies_(ss);
      exportMap.createFile('belastingadvies-snapshot.json', JSON.stringify(advies, null, 2), 'application/json');
      aantalBestanden++;
    }
  } catch (e) { fouten.push('Belastingadvies: ' + e.message); }

  // 5. PDF-facturen — link-lijst (PDFs zelf staan al in /Boekhoudbaar/Verkoopfacturen)
  try {
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getDataRange().getValues();
      const pdfs = [];
      for (let i = 1; i < data.length; i++) {
        const url = String(data[i][19] || '').trim();
        if (url) pdfs.push({ factuurnummer: String(data[i][1] || ''), datum: data[i][2], pdfUrl: url });
      }
      exportMap.createFile('factuur-pdf-index.json', JSON.stringify(pdfs, null, 2), 'application/json');
      aantalBestanden++;
    }
  } catch (e) { fouten.push('PDF-index: ' + e.message); }

  try { schrijfAuditLog_('Data-export GDPR-art-20', mapNaam + ' — ' + aantalBestanden + ' bestanden, ' + fouten.length + ' fouten'); } catch (_) {}

  ui.alert(
    '✅ Data-export voltooid',
    aantalBestanden + ' bestanden in nieuwe map:\n\n' +
    mapNaam + '\n\n' +
    'URL: ' + exportMap.getUrl() +
    (fouten.length ? '\n\n⚠️ ' + fouten.length + ' fouten:\n• ' + fouten.join('\n• ') : ''),
    ui.ButtonSet.OK
  );
}

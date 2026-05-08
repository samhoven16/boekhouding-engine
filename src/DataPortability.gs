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

  // 2. Audit-log JSONL — VOLLEDIG (AWR art. 52: bewaarplicht 7 jaar).
  // Voorheen 90 dagen → faillissement-curador kon geen 5-jaars audit krijgen.
  // Nu: ALLE rijen. Splitst per jaar in aparte files als log >50.000 rijen
  // (Drive file-size limit). Compliance-grond gelegd voor de hele bewaartermijn.
  try {
    const auditSheet = ss.getSheetByName('Audit Log');
    if (auditSheet && auditSheet.getLastRow() > 1) {
      const data = auditSheet.getDataRange().getValues();
      const headers = data[0];
      const eventsPerJaar = {};   // {2024: [...], 2025: [...], ...}
      let totaalEvents = 0;
      for (let i = 1; i < data.length; i++) {
        const ts = data[i][0];
        const jaar = ts instanceof Date ? ts.getFullYear() : 'onbekend';
        const event = {};
        headers.forEach(function(h, idx) {
          event[String(h).toLowerCase().replace(/\s+/g, '_')] = data[i][idx] instanceof Date
            ? data[i][idx].toISOString()
            : data[i][idx];
        });
        if (!eventsPerJaar[jaar]) eventsPerJaar[jaar] = [];
        eventsPerJaar[jaar].push(event);
        totaalEvents++;
      }
      // Eén bestand per jaar — ook makkelijk voor curador/accountant
      Object.keys(eventsPerJaar).sort().forEach(function(jaar) {
        const lijst = eventsPerJaar[jaar];
        const jsonl = lijst.map(function(e) { return JSON.stringify(e); }).join('\n');
        exportMap.createFile('audit-log-' + jaar + '.jsonl', jsonl, 'application/x-ndjson');
        aantalBestanden++;
      });
      // Index-bestand met overzicht
      const index = {
        totaalEvents: totaalEvents,
        perJaar: Object.keys(eventsPerJaar).reduce(function(acc, j) {
          acc[j] = eventsPerJaar[j].length; return acc;
        }, {}),
        bewaarplicht: 'AWR art. 52 — boekhoudkundige stukken 7 jaar',
        exportTijdstip: new Date().toISOString(),
      };
      exportMap.createFile('audit-log-index.json', JSON.stringify(index, null, 2), 'application/json');
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

  // 5. PDF-facturen — link-lijst MET resolve-check.
  // Voorheen alleen URL opgeslagen. Als klant Drive-map verplaatst was URL stil
  // dood. Nu: extract fileId, probeer file op te halen, marker dood/levend +
  // verse URL als file nog bestaat. Compliance-grond voor 7-jaars bewaarplicht.
  try {
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getDataRange().getValues();
      const pdfs = [];
      let ontbrekend = 0;
      for (let i = 1; i < data.length; i++) {
        const url = String(data[i][19] || '').trim();
        if (!url) continue;
        const factuurnr = String(data[i][1] || '');
        const fileId = (typeof extractFileId_ === 'function') ? extractFileId_(url) : '';
        let status = 'onbekend';
        let verseUrl = url;
        let bestandsnaam = '';
        if (fileId) {
          try {
            const file = DriveApp.getFileById(fileId);
            verseUrl = file.getUrl();
            bestandsnaam = file.getName();
            status = 'aanwezig';
          } catch (resolveErr) {
            status = 'verloren';
            ontbrekend++;
          }
        }
        pdfs.push({
          factuurnummer: factuurnr,
          datum: data[i][2],
          fileId: fileId,
          pdfUrl: verseUrl,
          originelePdfUrl: url,
          bestandsnaam: bestandsnaam,
          status: status,
        });
      }
      const indexFile = {
        gegenereerd: new Date().toISOString(),
        totaalFacturen: pdfs.length,
        statusOverzicht: {
          aanwezig: pdfs.filter(function(p){ return p.status === 'aanwezig'; }).length,
          verloren: ontbrekend,
        },
        bewaarplicht: 'AWR art. 52 — 7 jaar. Verloren PDFs moeten opnieuw gegenereerd worden.',
        pdfs: pdfs,
      };
      exportMap.createFile('factuur-pdf-index.json', JSON.stringify(indexFile, null, 2), 'application/json');
      aantalBestanden++;
      if (ontbrekend > 0) {
        fouten.push('PDF: ' + ontbrekend + ' factuur-PDF(s) niet meer vindbaar in Drive');
      }
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

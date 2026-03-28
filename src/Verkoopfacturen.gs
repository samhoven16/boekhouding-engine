/**
 * Verkoopfacturen.gs
 * Verkoopfactuur aanmaken, PDF genereren en per e-mail versturen.
 */

// ─────────────────────────────────────────────
//  PDF FACTUUR GENEREREN
// ─────────────────────────────────────────────
function genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, formData) {
  try {
    const bedrijf = getInstelling_('Bedrijfsnaam') || 'Ons Bedrijf';
    const adres = getInstelling_('Adres') || '';
    const postcode = getInstelling_('Postcode') || '';
    const plaats = getInstelling_('Plaats') || '';
    const kvk = getInstelling_('KvK-nummer') || '';
    const btwNr = getInstelling_('BTW-nummer') || '';
    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const factuurprefix = getInstelling_('Factuurprefix') || 'F';
    const voettekst = getInstelling_('Factuur voettekst') || '';

    const factuurnummer = factuurprefix + factuurNr;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bedrijfsnaam { font-size: 22pt; font-weight: bold; color: #1A237E; }
    .factuur-info { text-align: right; }
    .factuur-titel { font-size: 18pt; font-weight: bold; color: #1A237E; margin-bottom: 4px; }
    .factuur-nr { font-size: 13pt; color: #555; }
    .adressen { display: flex; gap: 40px; margin-bottom: 30px; padding-top: 20px; border-top: 2px solid #1A237E; }
    .adres-blok { flex: 1; }
    .adres-titel { font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 1px; }
    .datums { background: #F5F5F5; padding: 10px 16px; border-radius: 4px; margin-bottom: 24px; display: flex; gap: 40px; }
    .datum-item label { font-size: 9pt; color: #888; display: block; }
    .datum-item span { font-weight: bold; }
    table.regels { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.regels th { background: #1A237E; color: white; padding: 8px 10px; text-align: left; font-size: 10pt; }
    table.regels td { padding: 7px 10px; border-bottom: 1px solid #E0E0E0; font-size: 10pt; }
    table.regels tr:nth-child(even) td { background: #FAFAFA; }
    table.regels td.getal { text-align: right; }
    .totalen { margin-left: auto; width: 300px; margin-bottom: 20px; }
    .totalen table { width: 100%; border-collapse: collapse; }
    .totalen td { padding: 5px 10px; font-size: 10pt; }
    .totalen td:last-child { text-align: right; }
    .totalen tr.subtotaal td { border-top: 1px solid #ccc; }
    .totalen tr.totaal td { border-top: 2px solid #1A237E; font-weight: bold; font-size: 12pt; color: #1A237E; padding-top: 8px; }
    .betaalinfo { background: #E8EAF6; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid #1A237E; }
    .betaalinfo h4 { color: #1A237E; margin-bottom: 8px; }
    .betaalinfo p { font-size: 10pt; line-height: 1.8; }
    .voettekst { font-size: 9pt; color: #888; text-align: center; border-top: 1px solid #E0E0E0; padding-top: 12px; }
    .bedrijfsinfo { font-size: 9pt; color: #666; text-align: center; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="bedrijfsnaam">${bedrijf}</div>
      <div style="font-size:10pt;color:#666;margin-top:4px">${adres}<br>${postcode} ${plaats}</div>
      <div style="font-size:9pt;color:#888;margin-top:4px">KvK: ${kvk} | BTW: ${btwNr}</div>
    </div>
    <div class="factuur-info">
      <div class="factuur-titel">FACTUUR</div>
      <div class="factuur-nr">${factuurnummer}</div>
    </div>
  </div>

  <div class="adressen">
    <div class="adres-blok">
      <div class="adres-titel">Aan</div>
      <strong>${klantnaam}</strong><br>
      ${formData['Factuuradres klant'] ? formData['Factuuradres klant'].replace(/\n/g, '<br>') : ''}<br>
      ${formData['BTW-nummer klant'] ? 'BTW: ' + formData['BTW-nummer klant'] : ''}
    </div>
    <div class="adres-blok">
      <div class="adres-titel">Van</div>
      <strong>${bedrijf}</strong><br>
      ${adres}<br>${postcode} ${plaats}
    </div>
  </div>

  <div class="datums">
    <div class="datum-item"><label>Factuurdatum</label><span>${formatDatum_(datum)}</span></div>
    <div class="datum-item"><label>Vervaldatum</label><span>${formatDatum_(vervaldatum)}</span></div>
    <div class="datum-item"><label>Factuurnummer</label><span>${factuurnummer}</span></div>
    ${formData['Projectcode / Referentie'] ? `<div class="datum-item"><label>Referentie</label><span>${formData['Projectcode / Referentie']}</span></div>` : ''}
  </div>

  <table class="regels">
    <thead>
      <tr><th style="width:45%">Omschrijving</th><th>Aantal</th><th>Prijs/eenheid</th><th>Subtotaal</th></tr>
    </thead>
    <tbody>
      ${regels.map(r => `
        <tr>
          <td>${r.omschr}</td>
          <td class="getal">${r.aantal}</td>
          <td class="getal">${formatBedrag_(r.prijs)}</td>
          <td class="getal">${formatBedrag_(r.totaal)}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <div class="totalen">
    <table>
      <tr class="subtotaal">
        <td>Subtotaal excl. BTW</td>
        <td>${formatBedrag_(totalExcl)}</td>
      </tr>
      <tr>
        <td>BTW (${formData['BTW tarief'] || '21%'})</td>
        <td>${formatBedrag_(totalBtw)}</td>
      </tr>
      <tr class="totaal">
        <td>Totaal te betalen</td>
        <td>${formatBedrag_(totalIncl)}</td>
      </tr>
    </table>
  </div>

  <div class="betaalinfo">
    <h4>Betaalinformatie</h4>
    <p>
      Gelieve het bedrag van <strong>${formatBedrag_(totalIncl)}</strong> over te maken vóór
      <strong>${formatDatum_(vervaldatum)}</strong> naar:<br>
      IBAN: <strong>${iban}</strong><br>
      t.n.v.: ${bedrijf}<br>
      o.v.v.: ${factuurnummer}
    </p>
  </div>

  ${formData['Notities / bijzonderheden'] ? `
  <div style="margin-bottom:16px;padding:10px;background:#FFF8E1;border-radius:4px">
    <strong>Notities:</strong> ${formData['Notities / bijzonderheden']}
  </div>` : ''}

  <div class="bedrijfsinfo">
    ${bedrijf} | ${adres}, ${postcode} ${plaats} | KvK: ${kvk} | BTW: ${btwNr} | IBAN: ${iban}
  </div>
  <div class="voettekst">${voettekst}</div>
</body>
</html>`;

    // Maak een tijdelijk Google Doc voor PDF conversie
    const blob = Utilities.newBlob(html, 'text/html', `Factuur_${factuurnummer}.html`);
    const folder = getOrMaakFactuurenMap_();
    const pdfBlob = blob.getAs('application/pdf');
    pdfBlob.setName(`Factuur_${factuurnummer}.pdf`);
    const pdfFile = folder.createFile(pdfBlob);

    return pdfFile.getUrl();

  } catch (err) {
    Logger.log('Fout genereerFactuurPdf_: ' + err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
//  FACTUUR OPNIEUW GENEREREN EN MAILEN
// ─────────────────────────────────────────────
function stuurVerkoopfactuurPdf() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const resp = ui.prompt(
    'Factuur versturen',
    'Voer het factuurnummer in (bijv. F2024001):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const zoekNr = resp.getResponseText().trim();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();

  let gevonden = null;
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === zoekNr || String(data[i][0]) === zoekNr) {
      gevonden = data[i];
      rij = i + 1;
      break;
    }
  }

  if (!gevonden) {
    ui.alert('Factuur ' + zoekNr + ' niet gevonden.');
    return;
  }

  // Klant e-mail ophalen
  const klantId = gevonden[4];
  const klantEmail = haalRelatieEmail_(ss, klantId);

  const emailResp = ui.prompt(
    'Factuur versturen',
    `Naar welk e-mailadres sturen?\n(Klant: ${gevonden[5]}, gevonden: ${klantEmail || 'onbekend'})`,
    ui.ButtonSet.OK_CANCEL
  );
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;

  const email = emailResp.getResponseText().trim() || klantEmail;
  if (!email) {
    ui.alert('Geen e-mailadres opgegeven.');
    return;
  }

  // PDF URL ophalen of opnieuw genereren
  let pdfUrl = gevonden[19]; // PDF URL kolom
  if (!pdfUrl) {
    ui.alert('Geen PDF beschikbaar. Genereer eerst de factuur opnieuw via het formulier.');
    return;
  }

  // Verstuur e-mail met PDF als bijlage
  try {
    const pdfFile = DriveApp.getFileById(extractFileId_(pdfUrl));
    const bedrijf = getInstelling_('Bedrijfsnaam') || '';
    const factuurnummer = gevonden[1];
    const bedragIncl = formatBedrag_(gevonden[12]);
    const vervaldatum = formatDatum_(gevonden[3]);

    GmailApp.sendEmail(
      email,
      `Factuur ${factuurnummer} van ${bedrijf}`,
      `Geachte ${gevonden[5]},\n\nHierbij ontvangt u factuur ${factuurnummer} voor een bedrag van ${bedragIncl}.\n` +
      `Wij verzoeken u vriendelijk dit bedrag te voldoen vóór ${vervaldatum}.\n\n` +
      `Met vriendelijke groet,\n${bedrijf}`,
      {
        attachments: [pdfFile.getAs('application/pdf')],
        name: bedrijf,
      }
    );

    // Status bijwerken
    sheet.getRange(rij, 15).setValue(FACTUUR_STATUS.VERZONDEN);
    ui.alert(`Factuur ${factuurnummer} is verstuurd naar ${email}.`);

  } catch (err) {
    ui.alert('Fout bij versturen: ' + err.message);
  }
}

// ─────────────────────────────────────────────
//  CREDITNOTA AANMAKEN
// ─────────────────────────────────────────────
function maakCreditnota(factuurNummer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();

  let origineel = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === factuurNummer) {
      origineel = data[i];
      sheet.getRange(i + 1, 15).setValue(FACTUUR_STATUS.GECREDITEERD);
      break;
    }
  }

  if (!origineel) return;

  const creditNr = volgendFactuurnummer_();
  const creditPrefix = getInstelling_('Factuurprefix') || 'F';
  const datum = new Date();

  // Negatieve boeking
  const creditRij = [...origineel];
  creditRij[0] = creditNr;
  creditRij[1] = `${creditPrefix}CN${creditNr}`;
  creditRij[2] = datum;
  creditRij[9] = -Math.abs(origineel[9]);   // Bedrag excl. negatief
  creditRij[11] = -Math.abs(origineel[11]); // BTW negatief
  creditRij[12] = -Math.abs(origineel[12]); // Incl. negatief
  creditRij[14] = FACTUUR_STATUS.BETAALD;
  creditRij[18] = `Creditnota voor ${factuurNummer}`;

  sheet.appendRow(creditRij);

  // Stornoboeking
  maakJournaalpost_(ss, {
    datum,
    omschr: `Creditnota ${creditPrefix}CN${creditNr} (storno ${factuurNummer})`,
    dagboek: 'Verkoopboek',
    debet: bepaalOmzetRekening_(origineel[10]),
    credit: '1100',
    bedrag: Math.abs(origineel[9]),
    type: BOEKING_TYPE.MEMORIAAL,
  });
}

// ─────────────────────────────────────────────
//  BANK IMPORTEREN (CSV)
// ─────────────────────────────────────────────
function importeerBankafschrift() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      textarea { width: 100%; height: 200px; font-family: monospace; font-size: 11px; }
      .btn { background: #1A237E; color: white; padding: 8px 16px; border: none; cursor: pointer; margin-top: 8px; }
      select, input { padding: 4px; margin: 4px 0; }
    </style>
    <h3>Bankafschrift importeren (CSV)</h3>
    <p>Plak hieronder de CSV-inhoud van uw bankafschrift:</p>
    <p>
      <label>Datum kolom: <input type="number" id="colDatum" value="1" min="1" max="20"></label>
      <label style="margin-left:16px">Omschr. kolom: <input type="number" id="colOmschr" value="2" min="1" max="20"></label>
      <label style="margin-left:16px">Bedrag kolom: <input type="number" id="colBedrag" value="3" min="1" max="20"></label>
      <label style="margin-left:16px">Scheidingsteken: <select id="sep">
        <option value=",">Komma (,)</option>
        <option value=";">Puntkomma (;)</option>
        <option value="\t">Tab</option>
      </select></label>
    </p>
    <textarea id="csv" placeholder="Datum;Omschrijving;Bedrag&#10;2024-01-15;Betaling klant;1250.00&#10;2024-01-16;Huur;-1500.00"></textarea>
    <br>
    <button class="btn" onclick="importeer_()">Importeren</button>
    <button onclick="google.script.host.close()" style="margin-left:8px">Annuleren</button>
    <div id="result" style="margin-top:8px;color:green"></div>
    <script>
      function importeer_() {
        const csv = document.getElementById('csv').value;
        const sep = document.getElementById('sep').value;
        const cols = {
          datum: parseInt(document.getElementById('colDatum').value) - 1,
          omschr: parseInt(document.getElementById('colOmschr').value) - 1,
          bedrag: parseInt(document.getElementById('colBedrag').value) - 1,
        };
        google.script.run
          .withSuccessHandler(n => {
            document.getElementById('result').textContent = n + ' transacties geïmporteerd.';
          })
          .withFailureHandler(e => {
            document.getElementById('result').textContent = 'Fout: ' + e.message;
            document.getElementById('result').style.color = 'red';
          })
          .verwerkBankCsvImport(csv, sep, cols);
      }
    </script>
  `).setWidth(700).setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'Bankafschrift importeren');
}

function verwerkBankCsvImport(csvTekst, scheidingsteken, kolommen) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const regels = csvTekst.trim().split('\n');
  let aantalImport = 0;

  // Skip eerste rij als header
  const startRij = regels[0].toLowerCase().includes('datum') || regels[0].toLowerCase().includes('date') ? 1 : 0;

  for (let i = startRij; i < regels.length; i++) {
    const koloms = regels[i].split(scheidingsteken).map(k => k.trim().replace(/^"|"$/g, ''));
    if (koloms.length < 3) continue;

    const datumStr = koloms[kolommen.datum];
    const omschr = koloms[kolommen.omschr];
    const bedragStr = koloms[kolommen.bedrag].replace(',', '.');
    const bedrag = parseFloat(bedragStr);

    if (isNaN(bedrag)) continue;

    const datum = parseDatum_(datumStr);
    const transactieId = volgendTransactieId_();
    const isOntvangst = bedrag > 0;

    sheet.appendRow([
      transactieId,
      datum,
      omschr,
      bedrag,
      isOntvangst ? 'Ontvangst (bij)' : 'Betaling (af)',
      '1200',  // Bank zakelijk
      '', '', '', '',
      '', '', 'Geïmporteerd', '', new Date(),
    ]);
    aantalImport++;
  }

  return aantalImport;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function getOrMaakFactuurenMap_() {
  const mapNaam = 'Boekhoud Facturen';
  const mappen = DriveApp.getFoldersByName(mapNaam);
  if (mappen.hasNext()) return mappen.next();
  return DriveApp.createFolder(mapNaam);
}

function extractFileId_(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

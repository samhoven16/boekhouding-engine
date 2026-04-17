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
    // Branding: logo + bedrijfskleur (uit Branding.gs)
    const logoDataUrl = (typeof getBedrijfsLogoVolledig_ === 'function') ? getBedrijfsLogoVolledig_() : null;
    const pkKleur     = (typeof getBedrijfsKleur_ === 'function') ? getBedrijfsKleur_() : '#1A237E';
    const pkLicht     = (typeof getBedrijfsKleurLicht_ === 'function') ? getBedrijfsKleurLicht_() : '#E8EAF6';
    const adres = getInstelling_('Adres') || '';
    const postcode = getInstelling_('Postcode') || '';
    const plaats = getInstelling_('Plaats') || '';
    const kvk = getInstelling_('KvK-nummer') || '';
    const btwNr = getInstelling_('BTW-nummer') || '';
    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const factuurprefix = getInstelling_('Factuurprefix') || 'F';
    const voettekst = getInstelling_('Factuur voettekst') || '';

    const factuurnummer = formatFactuurnummer_(factuurNr, factuurprefix, 6);
    const sepaQr = haalSepaQrBase64_(iban, bedrijf, totalIncl, factuurnummer);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bedrijfsnaam { font-size: 22pt; font-weight: bold; color: ${pkKleur}; }
    .factuur-info { text-align: right; }
    .factuur-titel { font-size: 18pt; font-weight: bold; color: ${pkKleur}; margin-bottom: 4px; }
    .factuur-nr { font-size: 13pt; color: #555; }
    .adressen { display: flex; gap: 40px; margin-bottom: 30px; padding-top: 20px; border-top: 2px solid ${pkKleur}; }
    .adres-blok { flex: 1; }
    .adres-titel { font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 1px; }
    .datums { background: #F5F5F5; padding: 10px 16px; border-radius: 4px; margin-bottom: 24px; display: flex; gap: 40px; }
    .datum-item label { font-size: 9pt; color: #888; display: block; }
    .datum-item span { font-weight: bold; }
    table.regels { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.regels th { background: ${pkKleur}; color: white; padding: 8px 10px; text-align: left; font-size: 10pt; }
    table.regels td { padding: 7px 10px; border-bottom: 1px solid #E0E0E0; font-size: 10pt; }
    table.regels tr:nth-child(even) td { background: #FAFAFA; }
    table.regels td.getal { text-align: right; }
    .totalen { margin-left: auto; width: 300px; margin-bottom: 20px; }
    .totalen table { width: 100%; border-collapse: collapse; }
    .totalen td { padding: 5px 10px; font-size: 10pt; }
    .totalen td:last-child { text-align: right; }
    .totalen tr.subtotaal td { border-top: 1px solid #ccc; }
    .totalen tr.totaal td { border-top: 2px solid ${pkKleur}; font-weight: bold; font-size: 12pt; color: ${pkKleur}; padding-top: 8px; }
    .betaalinfo { background: ${pkLicht}; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid ${pkKleur}; }
    .betaalinfo h4 { color: ${pkKleur}; margin-bottom: 8px; }
    .betaalinfo p { font-size: 10pt; line-height: 1.8; }
    .voettekst { font-size: 9pt; color: #888; text-align: center; border-top: 1px solid #E0E0E0; padding-top: 12px; }
    .bedrijfsinfo { font-size: 9pt; color: #666; text-align: center; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoDataUrl
        ? `<img src="${logoDataUrl}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin-bottom:4px" alt="${escHtml_(bedrijf)}">`
        : `<div class="bedrijfsnaam" style="color:${pkKleur}">${escHtml_(bedrijf)}</div>`}
      <div style="font-size:10pt;color:#666;margin-top:4px">${escHtml_(adres)}<br>${escHtml_(postcode)} ${escHtml_(plaats)}</div>
      <div style="font-size:9pt;color:#888;margin-top:4px">KvK: ${escHtml_(kvk)} | BTW: ${escHtml_(btwNr)}</div>
    </div>
    <div class="factuur-info">
      <div class="factuur-titel">FACTUUR</div>
      <div class="factuur-nr">${escHtml_(factuurnummer)}</div>
    </div>
  </div>

  <div class="adressen">
    <div class="adres-blok">
      <div class="adres-titel">Aan</div>
      <strong>${escHtml_(klantnaam)}</strong><br>
      ${formData['Factuuradres klant'] ? escHtml_(formData['Factuuradres klant']).replace(/\n/g, '<br>') : ''}<br>
      ${formData['BTW-nummer klant'] ? 'BTW: ' + escHtml_(formData['BTW-nummer klant']) : ''}
    </div>
    <div class="adres-blok">
      <div class="adres-titel">Van</div>
      <strong>${escHtml_(bedrijf)}</strong><br>
      ${escHtml_(adres)}<br>${escHtml_(postcode)} ${escHtml_(plaats)}
    </div>
  </div>

  <div class="datums">
    <div class="datum-item"><label>Factuurdatum</label><span>${formatDatum_(datum)}</span></div>
    <div class="datum-item"><label>Vervaldatum</label><span>${formatDatum_(vervaldatum)}</span></div>
    <div class="datum-item"><label>Factuurnummer</label><span>${escHtml_(factuurnummer)}</span></div>
    ${formData['Projectcode / Referentie'] ? `<div class="datum-item"><label>Referentie</label><span>${escHtml_(formData['Projectcode / Referentie'])}</span></div>` : ''}
  </div>

  <table class="regels">
    <thead>
      <tr><th style="width:45%">Omschrijving</th><th>Aantal</th><th>Prijs/eenheid</th><th>Subtotaal</th></tr>
    </thead>
    <tbody>
      ${regels.map(r => `
        <tr>
          <td>${escHtml_(r.omschr)}</td>
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
    <div style="display:flex;gap:20px;align-items:flex-start">
      <div>
        <p>
          Gelieve het bedrag van <strong>${formatBedrag_(totalIncl)}</strong> over te maken vóór
          <strong>${formatDatum_(vervaldatum)}</strong> naar:<br>
          IBAN: <strong>${escHtml_(iban)}</strong><br>
          t.n.v.: ${escHtml_(bedrijf)}<br>
          o.v.v.: ${escHtml_(factuurnummer)}
        </p>
      </div>
      ${sepaQr ? `<div style="text-align:center;flex-shrink:0">
        <img src="${sepaQr}" width="90" height="90" alt="SEPA QR">
        <div style="font-size:8pt;color:#888;margin-top:2px">Scan om te betalen</div>
      </div>` : ''}
    </div>
  </div>

  ${formData['Notities / bijzonderheden'] ? `
  <div style="margin-bottom:16px;padding:10px;background:#FFF8E1;border-radius:4px">
    <strong>Notities:</strong> ${escHtml_(formData['Notities / bijzonderheden'])}
  </div>` : ''}

  <div class="bedrijfsinfo">
    ${escHtml_(bedrijf)} | ${escHtml_(adres)}, ${escHtml_(postcode)} ${escHtml_(plaats)} | KvK: ${escHtml_(kvk)} | BTW: ${escHtml_(btwNr)} | IBAN: ${escHtml_(iban)}
  </div>
  <div class="voettekst">${escHtml_(voettekst)}</div>
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
    try { schrijfAuditLog_('PDF FOUT', 'genereerFactuurPdf_ – ' + err.message); } catch(e2) {}
    return null;
  }
}

// ─────────────────────────────────────────────
//  FACTUUR STUREN VANUIT SUCCES-SCHERM / FACTUURLIJST
// ─────────────────────────────────────────────
// NB: het oude ui.prompt-tweemaal pad is verwijderd in Phase 3K.
// Factuurlijst (openFactuurlijst) is nu de enige trusted plek voor
// post-hoc versturen. Beide entry-points (succes-scherm van
// NieuweBoeking en Factuurlijst) roepen `stuurFactuurNaarEmailAdres` aan.
/**
 * Verstuurt een reeds aangemaakte factuur per e-mail op verzoek vanuit het
 * succes-scherm van Nieuwe Boeking (niet via ui.prompt). Wordt aangeroepen
 * via google.script.run vanuit de browser.
 *
 * @param {string} factuurnummer  Bijv. "F000001"
 * @param {string} email          E-mailadres van de klant
 * @return {boolean}              true als succesvol verstuurd
 */
function stuurFactuurNaarEmailAdres(factuurnummer, email) {
  if (!factuurnummer || !email) return false;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) return false;

  const data = sheet.getDataRange().getValues();
  let gevonden = null;
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === factuurnummer || String(data[i][0]) === factuurnummer) {
      gevonden = data[i];
      rij = i + 1;
      break;
    }
  }
  if (!gevonden) { Logger.log('stuurFactuurNaarEmailAdres: factuur niet gevonden: ' + factuurnummer); return false; }

  const pdfUrl = gevonden[19];
  if (!pdfUrl) { Logger.log('stuurFactuurNaarEmailAdres: geen PDF voor ' + factuurnummer); return false; }

  const ok = stuurFactuurEmailNaarKlant_(
    email,
    gevonden[5],   // klantnaam
    gevonden[1],   // factuurnummer
    gevonden[12],  // bedragIncl
    gevonden[3],   // vervaldatum
    pdfUrl,
    null           // ublUrl — optioneel
  );

  if (ok) {
    // Alleen upgraden naar VERZONDEN als de factuur nog niet betaald of gecrediteerd is.
    // Voorkomen dat een reeds betaalde factuur terugvalt naar een lagere status.
    const huidigStatus = String(gevonden[14] || '');
    const geenDowngrade = huidigStatus !== FACTUUR_STATUS.BETAALD
                       && huidigStatus !== FACTUUR_STATUS.GECREDITEERD
                       && huidigStatus !== FACTUUR_STATUS.DEELS_BETAALD;
    if (geenDowngrade) {
      sheet.getRange(rij, 15).setValue(FACTUUR_STATUS.VERZONDEN);
    }
    schrijfAuditLog_('Factuur gemaild (succes-scherm)', gevonden[1] + ' → ' + email);
    invalideerKpiSnapshot_();
  } else {
    schrijfAuditLog_('Factuur email MISLUKT (succes-scherm)', (gevonden ? gevonden[1] : factuurnummer) + ' → ' + email);
  }
  return ok;
}

// ─────────────────────────────────────────────
//  CREDITNOTA AANMAKEN
// ─────────────────────────────────────────────
function maakCreditnota(factuurNummer) {
  const ss = getSpreadsheet_();
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
  const ss = getSpreadsheet_();
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
    // Normaliseer Nederlandstalig getal: "1.234,56" → "1234.56"
    const bedragStr = koloms[kolommen.bedrag].replace(/\./g, '').replace(',', '.');
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
//  AUTO-EMAIL FACTUUR NAAR KLANT
// ─────────────────────────────────────────────
/**
 * Verstuurt de gegenereerde factuur PDF (en optioneel UBL) per e-mail naar de klant.
 * Wordt automatisch aangeroepen vanuit de form-handler als 'Ja, direct versturen'.
 */
function stuurFactuurEmailNaarKlant_(klantEmail, klantnaam, factuurNummer, bedragIncl, vervaldatum, pdfUrl, ublUrl) {
  if (!klantEmail || !pdfUrl) {
    Logger.log('stuurFactuurEmailNaarKlant_: klantEmail of pdfUrl ontbreekt, mail overgeslagen.');
    return false;
  }
  const fileId = extractFileId_(pdfUrl);
  if (!fileId) {
    Logger.log('stuurFactuurEmailNaarKlant_: kon geen file-ID extracten uit pdfUrl, mail overgeslagen.');
    return false;
  }
  try {
    const bedrijf = getInstelling_('Bedrijfsnaam') || '';
    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const eigenEmail = getInstelling_('Email rapporten naar') || '';

    const pdfFile = DriveApp.getFileById(fileId);
    const bijlagen = [pdfFile.getAs('application/pdf')];

    if (ublUrl) {
      try {
        bijlagen.push(DriveApp.getFileById(extractFileId_(ublUrl)).getBlob());
      } catch (e) { /* UBL optioneel */ }
    }

    const onderwerp = `Factuur ${factuurNummer} van ${bedrijf}`;
    const tekst =
      `Beste ${klantnaam},\n\n` +
      `Bijgaand ontvangt u factuur ${factuurNummer}.\n\n` +
      `Bedrag te betalen: ${formatBedrag_(bedragIncl)}\n` +
      `Vervaldatum: ${formatDatum_(vervaldatum)}\n\n` +
      `Gelieve het bedrag over te maken naar:\n` +
      `IBAN: ${iban}\n` +
      `t.n.v.: ${bedrijf}\n` +
      `o.v.v.: ${factuurNummer}\n\n` +
      `Met vriendelijke groet,\n${bedrijf}`;

    const opties = {
      attachments: bijlagen,
      name: bedrijf,
    };
    if (eigenEmail) opties.cc = eigenEmail;

    GmailApp.sendEmail(klantEmail, onderwerp, tekst, opties);
    Logger.log(`Factuur ${factuurNummer} gemaild naar ${klantEmail}`);
    return true;
  } catch (err) {
    Logger.log('Fout stuurFactuurEmailNaarKlant_: ' + err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
//  UBL 2.1 GENEREREN (e-factuur formaat)
// ─────────────────────────────────────────────
function genereerUBL_(factuurNr, klantnaam, klantadres, regels, totalExcl, totalBtw, totalIncl, datum, vervaldatum, btwTarief) {
  try {
    const bedrijf = getInstelling_('Bedrijfsnaam') || '';
    const adres   = getInstelling_('Adres') || '';
    const kvk     = getInstelling_('KvK-nummer') || '';
    const btwNr   = getInstelling_('BTW-nummer') || '';
    const iban    = (getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '').replace(/\s/g, '');
    const prefix  = getInstelling_('Factuurprefix') || 'F';

    const esc_ = s => String(s || '').replace(/[<>&"']/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    const isoDate = d => Utilities.formatDate(new Date(d), 'UTC', 'yyyy-MM-dd');
    const vatPct = btwTarief !== null ? (btwTarief * 100).toFixed(2) : '0.00';

    const regelsXml = regels.map((r, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${r.aantal}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="EUR">${r.totaal.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${esc_(r.omschr)}</cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="EUR">${r.prijs.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${esc_(prefix + factuurNr)}</cbc:ID>
  <cbc:IssueDate>${isoDate(datum)}</cbc:IssueDate>
  <cbc:DueDate>${isoDate(vervaldatum)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc_(bedrijf)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>${esc_(adres)}</cbc:StreetName><cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>${esc_(btwNr)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc_(bedrijf)}</cbc:RegistrationName><cbc:CompanyID>${esc_(kvk)}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc_(klantnaam)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>${esc_(klantadres || '')}</cbc:StreetName><cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${isoDate(vervaldatum)}</cbc:PaymentDueDate>
    <cac:PayeeFinancialAccount><cbc:ID>${esc_(iban)}</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${totalBtw.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${totalExcl.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${totalBtw.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPct}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${totalExcl.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${totalExcl.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${totalIncl.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${totalIncl.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${regelsXml}
</Invoice>`;

    const map = getOrMaakFactuurenMap_();
    const blob = Utilities.newBlob(xml, 'application/xml', `UBL_${prefix}${factuurNr}.xml`);
    const file = map.createFile(blob);
    return file.getUrl();
  } catch (err) {
    Logger.log('Fout genereerUBL_: ' + err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
//  SEPA QR CODE (base64 voor PDF insluiting)
// ─────────────────────────────────────────────
function haalSepaQrBase64_(iban, bedrijfNaam, bedrag, referentie) {
  try {
    const ibanClean = String(iban || '').replace(/\s/g, '');
    if (!ibanClean) return null;
    const qrData = [
      'BCD', '001', '1', 'SCT', '',
      String(bedrijfNaam || '').substring(0, 70),
      ibanClean,
      'EUR' + Number(bedrag || 0).toFixed(2),
      '', '',
      String(referentie || '').substring(0, 35),
    ].join('\n');
    const url = 'https://chart.googleapis.com/chart?cht=qr&chs=180x180&chl=' +
      encodeURIComponent(qrData);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      return 'data:image/png;base64,' + Utilities.base64Encode(resp.getContent());
    }
  } catch (e) {
    Logger.log('SEPA QR fout (niet fataal): ' + e.message);
  }
  return null;
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
  if (!url) return '';
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  const m3 = url.match(/[-\w]{25,}/);
  return m3 ? m3[0] : '';
}

// ─────────────────────────────────────────────
//  FACTUURLIJST DIALOG
// ─────────────────────────────────────────────

/**
 * Opent de factuurlijst als HTML dialog met status-tabs.
 * Menu: Boekhouding → Facturen & Betalingen → Factuurlijst openen
 */
function openFactuurlijst() {
  const html = HtmlService.createHtmlOutput(_bouwFactuurlijstHtml_())
    .setWidth(880)
    .setHeight(580);
  SpreadsheetApp.getUi().showModalDialog(html, 'Factuurlijst');
}

/**
 * Geeft alle verkoopfacturen terug voor de factuurlijst dialog.
 * Publieke functie — aangeroepen via google.script.run.
 */
function getFactuurlijstData() {
  const ss = getSpreadsheet_();
  if (!ss) throw new Error('Spreadsheet niet bereikbaar');
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet) throw new Error('Tabblad "Verkoopfacturen" ontbreekt — voer de setup uit.');
  const data = vfSheet.getDataRange().getValues();
  const vandaag = new Date();
  const facturen = [];

  // Build klantId → email map in ÉÉN pass van RELATIES (niet N lookups per rij).
  // Null-safe: als RELATIES tab ontbreekt, email blijft leeg.
  const emailPerKlant = {};
  const relatiesSheet = ss.getSheetByName(SHEETS.RELATIES);
  if (relatiesSheet) {
    const relatiesData = relatiesSheet.getDataRange().getValues();
    for (let i = 1; i < relatiesData.length; i++) {
      const relatieId = String(relatiesData[i][0] || '');
      if (relatieId) emailPerKlant[relatieId] = String(relatiesData[i][10] || '');
    }
  }

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[1]) continue; // Geen factuurnummer = lege rij
    const vervaldatum = r[3] ? new Date(r[3]) : null;
    const datum       = r[2] ? new Date(r[2]) : null;
    const status      = String(r[14] || '');
    const bedragIncl  = parseFloat(r[12]) || 0;
    const betaald     = parseFloat(r[13]) || 0;
    const openBedrag  = rondBedrag_(bedragIncl - betaald);
    const dagenVervallen = vervaldatum
      ? Math.floor((vandaag - vervaldatum) / (1000 * 60 * 60 * 24))
      : 0;
    const klantId     = String(r[4] || '');

    facturen.push({
      rij:            i + 1,
      nr:             String(r[1] || ''),
      datum:          datum ? formatDatum_(datum) : '',
      vervaldatum:    vervaldatum ? formatDatum_(vervaldatum) : '',
      vervaldatumTs:  vervaldatum ? vervaldatum.getTime() : 0,  // timestamp voor correcte sortering
      klant:          String(r[5] || '–'),
      klantEmail:     emailPerKlant[klantId] || '',
      bedragIncl,
      betaald,
      openBedrag,
      status,
      betaaldatum:    r[15] ? formatDatum_(new Date(r[15])) : '',
      dagenVervallen: status === FACTUUR_STATUS.VERVALLEN ? dagenVervallen : 0,
      pdfUrl:         String(r[19] || ''),  // [19] = PDF URL per sheet-schemas.md; was abusievelijk r[17] (Projectcode)
    });
  }

  // Urgentiesortering: vervallen (oudste eerst), dan op vervaldatum timestamp
  // GEEN string-vergelijking van dd-mm-yyyy (chronologisch onjuist)
  facturen.sort((a, b) => {
    if (a.status === FACTUUR_STATUS.VERVALLEN && b.status !== FACTUUR_STATUS.VERVALLEN) return -1;
    if (b.status === FACTUUR_STATUS.VERVALLEN && a.status !== FACTUUR_STATUS.VERVALLEN) return 1;
    return b.dagenVervallen - a.dagenVervallen || a.vervaldatumTs - b.vervaldatumTs;
  });

  const tellers = {
    alle:     facturen.length,
    open:     facturen.filter(f => f.status === FACTUUR_STATUS.VERZONDEN || f.status === FACTUUR_STATUS.CONCEPT || f.status === FACTUUR_STATUS.DEELS_BETAALD).length,
    vervallen: facturen.filter(f => f.status === FACTUUR_STATUS.VERVALLEN).length,
    betaald:  facturen.filter(f => f.status === FACTUUR_STATUS.BETAALD || f.status === FACTUUR_STATUS.GECREDITEERD).length,
  };

  return { facturen, tellers };
}

/**
 * Markeert een verkoopfactuur als volledig betaald.
 * Aangeroepen via google.script.run vanuit de factuurlijst dialog.
 * @param {string} factuurnr
 * @param {string} betaaldatumStr  ISO-datum string (yyyy-mm-dd)
 */
function markeerVerkoopfactuurBetaald(factuurnr, betaaldatumStr) {
  if (!factuurnr) throw new Error('Geen factuurnummer opgegeven');
  const ss    = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data  = sheet.getDataRange().getValues();
  const datum = betaaldatumStr ? parseDatum_(betaaldatumStr) : new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== String(factuurnr)) continue;

    // Idempotentie-check: als al betaald, geen tweede journaalpost aanmaken
    const huidigStatus = String(data[i][14] || '');
    if (huidigStatus === FACTUUR_STATUS.BETAALD || huidigStatus === FACTUUR_STATUS.GECREDITEERD) {
      return { ok: true, bericht: 'Factuur ' + factuurnr + ' was al gemarkeerd als betaald.' };
    }

    const bedragIncl = parseFloat(data[i][12]) || 0;
    if (bedragIncl <= 0) throw new Error('Factuur ' + factuurnr + ' heeft geen geldig bedrag');

    sheet.getRange(i + 1, 14).setValue(bedragIncl);              // Betaald bedrag
    sheet.getRange(i + 1, 15).setValue(FACTUUR_STATUS.BETAALD);  // Status
    sheet.getRange(i + 1, 16).setValue(datum);                   // Betaaldatum

    // Journaalpost: Debiteuren → Bank (exact 1x per aanroep dankzij idempotentie-check)
    maakJournaalpost_(ss, {
      datum,
      omschr:  'Ontvangst factuur ' + factuurnr,
      dagboek: 'Bankboek',
      debet:   '1200',
      credit:  '1100',
      bedrag:  bedragIncl,
      ref:     factuurnr,
      type:    BOEKING_TYPE.BANKONTVANGST,
    });

    schrijfAuditLog_('Factuur betaald', factuurnr + ' via factuurlijst dialog');
    // Invalidate snapshot: debiteurenOpen and aantalOpenFacturen have changed.
    // The next snapshot read will recompute fresh (no vernieuwDashboard overhead here).
    invalideerKpiSnapshot_();
    return { ok: true, bericht: 'Factuur ' + factuurnr + ' gemarkeerd als betaald.' };
  }
  throw new Error('Factuurnummer ' + factuurnr + ' niet gevonden');
}

function _bouwFactuurlijstHtml_() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:Arial,sans-serif;font-size:13px;color:#212121;background:#F4F5F8;height:100vh;display:flex;flex-direction:column;overflow:hidden}' +
    '.hdr{background:#1A237E;color:white;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
    '.hdr h1{font-size:14px;font-weight:bold}' +
    '.btn-ref{background:rgba(255,255,255,.15);border:none;color:white;padding:5px 11px;border-radius:4px;cursor:pointer;font-size:11px}' +
    '.btn-ref:hover{background:rgba(255,255,255,.25)}' +
    '.tabs{display:flex;background:white;border-bottom:2px solid #E5E7EB;flex-shrink:0}' +
    '.tab{flex:1;padding:10px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:bold;color:#6B7280;border-bottom:3px solid transparent;transition:all .15s;user-select:none}' +
    '.tab:hover{color:#1A237E;background:#F5F3FF}' +
    '.tab.actief{color:#1A237E;border-bottom-color:#1A237E}' +
    '.tab .cnt{display:inline-block;background:#E5E7EB;color:#374151;font-size:10px;padding:1px 6px;border-radius:20px;margin-left:4px;vertical-align:middle}' +
    '.tab.actief .cnt{background:#DBEAFE;color:#1D4ED8}' +
    '.tab.vervallen.actief .cnt{background:#FEE2E2;color:#991B1B}' +
    '.body{flex:1;overflow-y:auto;padding:12px 16px}' +
    'table{width:100%;border-collapse:collapse;background:white;border-radius:8px;border:1px solid #E5E7EB;overflow:hidden}' +
    'th{background:#F9FAFB;font-size:10px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;padding:9px 12px;text-align:left;border-bottom:1px solid #E5E7EB}' +
    'td{padding:9px 12px;border-bottom:1px solid #F9FAFB;font-size:12px;vertical-align:middle}' +
    'tr:last-child td{border-bottom:none}' +
    'tr:hover td{background:#FAFAFA}' +
    '.badge{font-size:10px;font-weight:bold;padding:2px 8px;border-radius:20px;white-space:nowrap}' +
    '.b-open{background:#DBEAFE;color:#1D4ED8}' +
    '.b-concept{background:#F3F4F6;color:#374151}' +
    '.b-deels{background:#FEF9C3;color:#854D0E}' +
    '.b-vervallen{background:#FEE2E2;color:#991B1B}' +
    '.b-betaald{background:#DCFCE7;color:#166534}' +
    '.b-gecrediteerd{background:#F3E8FF;color:#6B21A8}' +
    '.btn-betaald{background:#15803D;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap}' +
    '.btn-betaald:hover{background:#166534}' +
    '.btn-betaald:disabled{background:#9CA3AF;cursor:not-allowed}' +
    '.btn-verstuur{background:#1D4ED8;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;margin-right:4px}' +
    '.btn-verstuur:hover{background:#1E40AF}' +
    '.btn-verstuur:disabled{background:#9CA3AF;cursor:not-allowed}' +
    '.urgent{color:#B91C1C;font-weight:bold}' +
    '.loading{text-align:center;padding:40px;color:#9CA3AF}' +
    '.spin{display:inline-block;width:20px;height:20px;border:2px solid #E5E7EB;border-top-color:#1A237E;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.leeg{text-align:center;padding:30px;color:#9CA3AF;font-size:12px}' +
    '.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#166534;color:white;padding:8px 18px;border-radius:6px;font-size:12px;display:none;z-index:99}' +
    '</style></head><body>' +
    '<div class="hdr"><h1>Verkoopfacturen</h1><button class="btn-ref" onclick="laad()">\u21bb Vernieuwen</button></div>' +
    '<div class="tabs" id="tabs">' +
    '  <div class="tab actief" data-tab="alle" onclick="wissel(\'alle\')">Alle<span class="cnt" id="cnt-alle">0</span></div>' +
    '  <div class="tab" data-tab="open" onclick="wissel(\'open\')">Openstaand<span class="cnt" id="cnt-open">0</span></div>' +
    '  <div class="tab vervallen" data-tab="vervallen" onclick="wissel(\'vervallen\')">Vervallen<span class="cnt" id="cnt-vervallen">0</span></div>' +
    '  <div class="tab" data-tab="betaald" onclick="wissel(\'betaald\')">Betaald<span class="cnt" id="cnt-betaald">0</span></div>' +
    '</div>' +
    '<div class="body" id="body"><div class="loading"><div class="spin"></div><br>Even laden\u2026</div></div>' +
    '<div class="toast" id="toast"></div>' +
    '<script>' +
    'var ALLE=[], ACTIEF_TAB="alle";' +
    'function fmt(b){b=parseFloat(b)||0;return(b<0?"-\u20ac":"\u20ac")+Math.abs(b).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});}' +
    'function esc(s){return String(s||"").replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\'":"&#39;"}[c];});}' +
    'function badgeKls(s){var m={"Verzonden":"b-open","Concept":"b-concept","Deels betaald":"b-deels","Vervallen":"b-vervallen","Betaald":"b-betaald","Gecrediteerd":"b-gecrediteerd"};return m[s]||"b-concept";}' +
    'function laad(){' +
    '  document.getElementById("body").innerHTML=\'<div class="loading"><div class="spin"></div><br>Even laden\u2026</div>\';' +
    '  google.script.run.withSuccessHandler(function(d){' +
    '    ALLE=d.facturen;' +
    '    document.getElementById("cnt-alle").textContent=d.tellers.alle;' +
    '    document.getElementById("cnt-open").textContent=d.tellers.open;' +
    '    document.getElementById("cnt-vervallen").textContent=d.tellers.vervallen;' +
    '    document.getElementById("cnt-betaald").textContent=d.tellers.betaald;' +
    '    render(ACTIEF_TAB);' +
    '  }).withFailureHandler(function(e){' +
    '    document.getElementById("body").innerHTML=\'<div class="loading" style="color:#B91C1C">Laden mislukt: \'+esc(e.message)+\'</div>\';' +
    '  }).getFactuurlijstData();' +
    '}' +
    'function wissel(tab){' +
    '  ACTIEF_TAB=tab;' +
    '  document.querySelectorAll(".tab").forEach(function(t){t.classList.toggle("actief",t.dataset.tab===tab);});' +
    '  render(tab);' +
    '}' +
    'function filter(tab){' +
    '  if(tab==="alle") return ALLE;' +
    '  if(tab==="open") return ALLE.filter(function(f){return f.status==="Verzonden"||f.status==="Concept"||f.status==="Deels betaald";});' +
    '  if(tab==="vervallen") return ALLE.filter(function(f){return f.status==="Vervallen";});' +
    '  if(tab==="betaald") return ALLE.filter(function(f){return f.status==="Betaald"||f.status==="Gecrediteerd";});' +
    '  return ALLE;' +
    '}' +
    'function render(tab){' +
    '  var rijen=filter(tab);' +
    '  if(rijen.length===0){document.getElementById("body").innerHTML=\'<div class="leeg">\u2713 Geen facturen in dit overzicht</div>\';return;}' +
    '  var h=\'<table><thead><tr>\'+' +
    '    \'<th>Nummer</th><th>Datum</th><th>Klant</th><th>Bedrag incl.</th><th>Open</th><th>Vervaldatum</th><th>Status</th><th></th>\'+' +
    '    \'</tr></thead><tbody>\';' +
    '  rijen.forEach(function(f){' +
    '    var urgent=f.status==="Vervallen"&&f.dagenVervallen>30;' +
    '    var kanBetalen=f.status!=="Betaald"&&f.status!=="Gecrediteerd";' +
    '    var kanVersturen=!!f.pdfUrl && f.status!=="Gecrediteerd";' +
    '    h+=\'<tr>\';' +
    '    h+=\'<td style="font-weight:bold">\'+esc(f.nr)+\'</td>\';' +
    '    h+=\'<td>\'+esc(f.datum)+\'</td>\';' +
    '    h+=\'<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\'+esc(f.klant)+\'</td>\';' +
    '    h+=\'<td>\'+fmt(f.bedragIncl)+\'</td>\';' +
    '    h+=\'<td class="\'+( urgent?"urgent":"" )+\'">\'+fmt(f.openBedrag)+\'</td>\';' +
    '    h+=\'<td class="\'+( urgent?"urgent":"" )+\'">\'+esc(f.vervaldatum)+\'</td>\';' +
    '    h+=\'<td><span class="badge \'+badgeKls(f.status)+\'">\'+esc(f.status)+\'</span></td>\';' +
    '    h+=\'<td style="white-space:nowrap">\';' +
    '    if(kanVersturen){' +
    '      h+=\'<button class="btn-verstuur" id="vs-\'+esc(f.nr)+\'" onclick="verstuur(\\\'\'+esc(f.nr)+\'\\\',\\\'\'+esc(f.klantEmail||"")+\'\\\')">\u2709 Verstuur</button>\';' +
    '    }' +
    '    if(kanBetalen){' +
    '      h+=\'<button class="btn-betaald" id="btn-\'+esc(f.nr)+\'" onclick="betaal(\\\'\'+esc(f.nr)+\'\\\')">Betaald</button>\';' +
    '    }' +
    '    h+=\'</td></tr>\';' +
    '  });' +
    '  h+=\'</tbody></table>\';' +
    '  document.getElementById("body").innerHTML=h;' +
    '}' +
    'function betaal(nr){' +
    '  var btn=document.getElementById("btn-"+nr);' +
    '  if(!btn||btn.disabled) return;' +  // dubbel-klik guard
    '  btn.disabled=true;btn.textContent="\u23f3";' +
    '  var datum=new Date().toISOString().slice(0,10);' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){' +
    '      toonToast(r.bericht||"Gemarkeerd als betaald");' +
    '      laad();' +
    '    })' +
    '    .withFailureHandler(function(e){' +
    '      // Heractiveer knop via fresh DOM lookup (btn-referentie kan stale zijn)' +
    '      var b2=document.getElementById("btn-"+nr);' +
    '      if(b2){b2.disabled=false;b2.textContent="Betaald";}' +
    '      toonToast("\u274c Fout: "+(e.message||"Onbekend"));' +
    '    })' +
    '    .markeerVerkoopfactuurBetaald(nr,datum);' +
    '}' +
    'function verstuur(nr,bekendeEmail){' +
    '  var email=prompt("Factuur "+nr+" per e-mail versturen naar:",bekendeEmail||"");' +
    '  if(email===null) return;' +  // cancel
    '  email=String(email||"").trim();' +
    '  if(!email){toonToast("\u274c Geen e-mailadres ingevuld");return;}' +
    '  var btn=document.getElementById("vs-"+nr);' +
    '  if(btn){btn.disabled=true;btn.textContent="\u23f3";}' +
    '  google.script.run' +
    '    .withSuccessHandler(function(ok){' +
    '      if(ok){toonToast("\u2705 Verstuurd naar "+email);laad();}' +
    '      else {' +
    '        var b2=document.getElementById("vs-"+nr);' +
    '        if(b2){b2.disabled=false;b2.textContent="\u2709 Verstuur";}' +
    '        toonToast("\u274c Versturen mislukt \u2014 controleer PDF en Gmail-toegang");' +
    '      }' +
    '    })' +
    '    .withFailureHandler(function(e){' +
    '      var b2=document.getElementById("vs-"+nr);' +
    '      if(b2){b2.disabled=false;b2.textContent="\u2709 Verstuur";}' +
    '      toonToast("\u274c Fout: "+(e.message||"Onbekend"));' +
    '    })' +
    '    .stuurFactuurNaarEmailAdres(nr,email);' +
    '}' +
    'function toonToast(tekst){' +
    '  var t=document.getElementById("toast");' +
    '  t.textContent=tekst;t.style.display="block";' +
    '  setTimeout(function(){t.style.display="none";},3000);' +
    '}' +
    'laad();' +
    '<\/script></body></html>';
}

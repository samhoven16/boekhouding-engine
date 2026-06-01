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
    const pkKleur     = (typeof getBedrijfsKleur_ === 'function') ? getBedrijfsKleur_() : '#0D1B4E';
    const pkLicht     = (typeof getBedrijfsKleurLicht_ === 'function') ? getBedrijfsKleurLicht_() : '#F7F9FC';
    const adres = getInstelling_('Adres') || '';
    const postcode = getInstelling_('Postcode') || '';
    const plaats = getInstelling_('Plaats') || '';
    const kvk = getInstelling_('KvK-nummer') || '';
    const btwNr = getInstelling_('BTW-nummer') || '';
    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const factuurprefix = getInstelling_('Factuurprefix') || 'F';
    const voettekst = getInstelling_('Factuur voettekst') || '';
    // CYCLE-56: gebruik isJa_ helper (consistent met andere paden) —
    // accepteert ook 'y', '1', 'aan', 'on', true-boolean ipv alleen
    // 'ja'/'true'/'yes'.
    const korActief = (typeof isJa_ === 'function')
      ? isJa_(getInstelling_('KOR regeling actief'))
      : false;

    const factuurnummer = formatFactuurnummer_(factuurNr, factuurprefix, 6);
    const sepaQr = haalSepaQrBase64_(iban, bedrijf, totalIncl, factuurnummer);

    // KOR-verklaring — wettelijk verplicht op facturen als ondernemer
    // onder de kleineondernemersregeling valt. Voorwaarden:
    //   1. KOR-instelling staat aan
    //   2. Deze factuur is NIET vrijgesteld (KOR ≠ vrijgesteld; verschillende rechtsgronden)
    //   3. Geen BTW op deze factuur (KOR-ondernemer mag geen BTW factureren)
    // Anders is de KOR-tekst misleidend → klantverwarring + audit-risico.
    const btwTariefStr = String(formData['BTW tarief'] || '');
    const isVrijgesteld = /Vrijgesteld/i.test(btwTariefStr);
    const isVerlegd     = /Verlegd/i.test(btwTariefStr);
    const heeftBtw = parseFloat(totalBtw) > 0.005;
    const korVerklaring = (korActief && !isVrijgesteld && !heeftBtw)
      ? `<div style="background:#FFF8E1;border:1px solid #F9A825;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-size:10pt;color:#5A3F00">
           <strong>Kleineondernemersregeling (KOR)</strong> — Er is geen btw in rekening gebracht, op basis van artikel 25 Wet OB.
         </div>`
      : '';
    // Verleggings-verklaring is wettelijk verplicht op B2B-EU-facturen waar
    // BTW is verlegd naar de afnemer (art. 12 lid 3 Wet OB / art. 196 EU-
    // richtlijn 2006/112/EG). Zonder deze tekst kan Belastingdienst herziening
    // eisen — klant moet kunnen bewijzen waarom geen BTW is afgedragen.
    const verleggingsVerklaring = isVerlegd
      ? `<div style="background:#E3F2FD;border:1px solid #1976D2;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-size:10pt;color:#0D47A1">
           <strong>BTW verlegd</strong> — Op deze factuur is de btw verlegd naar de afnemer (art. 12 lid 3 Wet OB 1968 / art. 196 EU-richtlijn 2006/112/EG).
         </div>`
      : '';
    // Mollie betaal-link (optioneel — alleen indien API-key geconfigureerd)
    let molliePaymentHtml = '';
    try {
      if (typeof molliePaymentBlock_ === 'function') {
        molliePaymentHtml = molliePaymentBlock_({
          factuurnummer: factuurNr,
          klantnaam: klantnaam,
          klantEmail: formData['Klant e-mailadres'] || '',
          bedragIncl: totalIncl,
        });
      }
    } catch (e) { Logger.log('molliePaymentBlock_ fout: ' + e.message); }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1A1A1A; padding: 40px; -webkit-font-smoothing: antialiased; }
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

  ${korVerklaring}
  ${verleggingsVerklaring}
  ${molliePaymentHtml}

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
        <div style="display:inline-block;border:2px solid ${pkKleur};border-radius:8px;padding:4px;background:#fff">
          <img src="${sepaQr}" width="90" height="90" alt="SEPA QR">
        </div>
        <div style="font-size:9pt;color:${pkKleur};font-weight:600;margin-top:6px">Scan &amp; betaal →</div>
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

  // Per-factuur LockService: voorkomt dat dubbel-klikken op verstuur-knop
  // twee parallelle email-versturingen aanjaagt. Lock-key is per-factuurnr
  // zodat verschillende facturen wel parallel kunnen.
  // Apps Script LockService is script-wide, niet per-key — dus we gebruiken
  // een ScriptProperty als mutex-flag met TTL.
  const props = PropertiesService.getScriptProperties();
  const flagKey = 'verstuurBezig_' + factuurnummer;
  const nu = Date.now();
  const bezigSinds = parseInt(props.getProperty(flagKey) || '0');
  if (bezigSinds && (nu - bezigSinds) < 30000) {  // 30s mutex-window
    Logger.log('stuurFactuurNaarEmailAdres: SKIPPED — al bezig met ' + factuurnummer + ' (' + Math.round((nu - bezigSinds)/1000) + 's)');
    try { schrijfAuditLog_('Factuur dubbel-versturen geblokkeerd', factuurnummer + ' (' + Math.round((nu - bezigSinds)/1000) + 's)'); } catch (_) {}
    return false;
  }
  props.setProperty(flagKey, String(nu));

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) { props.deleteProperty(flagKey); return false; }

  // Pre-flight quota-check — voorkomt mid-flight email-fail
  try {
    const remaining = MailApp.getRemainingDailyQuota();
    if (remaining < 1) {
      props.deleteProperty(flagKey);
      try { schrijfAuditLog_('Email quota uitgeput', factuurnummer + ' rem=0'); } catch (_) {}
      throw new Error('Dagelijkse e-maillimiet bereikt — probeer morgen opnieuw of upgrade naar Workspace.');
    }
  } catch (e) {
    if (/limiet bereikt/.test(e.message)) throw e;  // bubble up naar dialog
    // Quota-API down? laat door
  }

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
  if (!gevonden) { props.deleteProperty(flagKey); Logger.log('stuurFactuurNaarEmailAdres: factuur niet gevonden: ' + factuurnummer); return false; }

  const pdfUrl = gevonden[19];
  if (!pdfUrl) { props.deleteProperty(flagKey); Logger.log('stuurFactuurNaarEmailAdres: geen PDF voor ' + factuurnummer); return false; }

  // Flush vóór email — zorg dat status-changes uit nieuw-aangemaakte factuurs zichtbaar zijn
  SpreadsheetApp.flush();

  // Ghost-success guard: idempotency-key. Zelfde mechanisme als
  // verwerkInkomstenUitHoofdformulier_ — voorkomt dubbele mail bij retry-after-crash.
  const idemKey = 'emailVerzonden_' + factuurnummer;
  const propsIdem = PropertiesService.getScriptProperties();
  if (propsIdem.getProperty(idemKey) === 'DONE') {
    Logger.log('stuurFactuurNaarEmailAdres: SKIP — al gemarkeerd DONE voor ' + factuurnummer);
    try { schrijfAuditLog_('Email DUBBEL geblokkeerd', factuurnummer + ' (factuurlijst)'); } catch (_) {}
    try { props.deleteProperty(flagKey); } catch (_) {}
    return true;  // optimistisch — caller hoeft niet opnieuw te proberen
  }
  propsIdem.setProperty(idemKey, 'PENDING:' + Date.now());

  const ok = stuurFactuurEmailNaarKlant_(
    email,
    gevonden[5],   // klantnaam
    gevonden[1],   // factuurnummer
    gevonden[12],  // bedragIncl
    gevonden[3],   // vervaldatum
    pdfUrl,
    null           // ublUrl — optioneel
  );

  // Idempotency: markeer DONE direct na succes (atomair vóór sheet-write)
  if (ok) {
    try { propsIdem.setProperty(idemKey, 'DONE'); } catch (_) {}
  } else {
    try { propsIdem.deleteProperty(idemKey); } catch (_) {}  // retry mag
  }

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
  // Mutex-flag wissen — andere klikken kunnen weer
  try { props.deleteProperty(flagKey); } catch (_) {}
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

  // Stornoboeking — reverseer de twee originele journaalposten:
  //  1) Debet omzet, Credit 1100  (omzet-deel excl.)
  //  2) Debet BTW-afdracht, Credit 1100  (BTW-deel)
  // Tot voorheen werd alleen leg-1 geboekt waardoor de BTW-afdracht in
  // het grootboek niet werd terugverlegd — administratief onjuist.
  const btwLabel  = origineel[10];
  const btwTarief = parseBtwTarief_(btwLabel);
  const omzetExcl = Math.abs(origineel[9]);
  const btwBedrag = Math.abs(origineel[11]);
  const omschrCN  = `Creditnota ${creditPrefix}CN${creditNr} (storno ${factuurNummer})`;

  maakJournaalpost_(ss, {
    datum,
    omschr: omschrCN,
    dagboek: 'Verkoopboek',
    debet: bepaalOmzetRekening_(btwLabel),
    credit: '1100',
    bedrag: omzetExcl,
    btwTarief,
    btwBedrag: 0,
    ref: `${creditPrefix}CN${creditNr}`,
    type: BOEKING_TYPE.MEMORIAAL,
  });
  if (btwBedrag > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: omschrCN + ' (BTW)',
      dagboek: 'Verkoopboek',
      debet: bepaalBtwVerkoopRekening_(btwLabel),
      credit: '1100',
      bedrag: btwBedrag,
      btwTarief,
      btwBedrag,
      ref: `${creditPrefix}CN${creditNr}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }
}

// ─────────────────────────────────────────────
//  BANK IMPORTEREN (CSV)
// ─────────────────────────────────────────────
function importeerBankafschrift() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 6px}
      p{color:#5A6478;margin:0 0 10px;line-height:1.55}
      textarea{width:100%;height:200px;font-family:monospace;font-size:11px;padding:10px;
               border:1px solid #E5EAF2;border-radius:6px;color:#1A1A1A;background:#fff;
               transition:border-color 0.15s}
      textarea:focus{outline:none;border-color:#2EC4B6}
      label{color:#0D1B4E;font-weight:600;font-size:12px}
      select,input{padding:6px 8px;margin:4px 0;border:1px solid #E5EAF2;border-radius:6px;
                   font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff}
      input[type=number]{width:70px}
      .btn{background:#0D1B4E;color:white;padding:10px 18px;border:none;border-radius:6px;
           cursor:pointer;margin-top:10px;font-size:13px;font-weight:600;
           font-family:inherit;transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 16px;
               border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
               font-family:inherit;margin-left:8px;margin-top:10px;transition:background 0.15s}
      .btn-sec:hover{background:#EEF2F8}
    </style>
    <h3>Bankafschrift importeren (CSV)</h3>
    <p>Plak hieronder de CSV-inhoud van je bankafschrift.</p>
    <p>
      <label>Datum kolom <input type="number" id="colDatum" value="1" min="1" max="20"></label>
      &nbsp;&nbsp;<label>Omschr. kolom <input type="number" id="colOmschr" value="2" min="1" max="20"></label>
      &nbsp;&nbsp;<label>Bedrag kolom <input type="number" id="colBedrag" value="3" min="1" max="20"></label>
      &nbsp;&nbsp;<label>Scheidingsteken <select id="sep">
        <option value=",">Komma (,)</option>
        <option value=";">Puntkomma (;)</option>
        <option value="\t">Tab</option>
      </select></label>
    </p>
    <textarea id="csv" placeholder="Datum;Omschrijving;Bedrag&#10;2024-01-15;Betaling klant;1250.00&#10;2024-01-16;Huur;-1500.00"></textarea>
    <br>
    <button class="btn" id="btnImporteer">Importeren</button>
    <button class="btn-sec" id="btnAnnuleerCsv">Annuleren</button>
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
          .withSuccessHandler(r => {
            const aantal = (r && typeof r === 'object') ? r.aantal : r;
            const over = (r && typeof r === 'object') ? r.overgeslagen : 0;
            let msg = aantal + ' transacties geïmporteerd.';
            if (over > 0) msg += ' ' + over + ' rij(en) overgeslagen (ongeldige datum of bedrag).';
            document.getElementById('result').textContent = msg;
          })
          .withFailureHandler(e => {
            document.getElementById('result').textContent = '⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Probeer opnieuw.');
            document.getElementById('result').style.color = 'red';
          })
          .verwerkBankCsvImport(csv, sep, cols);
      }
      document.addEventListener('DOMContentLoaded', function() {
        var b = document.getElementById('btnImporteer');
        if (b) b.addEventListener('click', function(e){ e.preventDefault(); importeer_(); });
        var a = document.getElementById('btnAnnuleerCsv');
        if (a) a.addEventListener('click', function(){ try { google.script.host.close(); } catch (_) {} });
      });
    </script>
  `).setWidth(700).setHeight(450).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, 'Bankafschrift importeren');
}

/**
 * Detecteert decimal-separator door naar de LAATSTE punt vs komma te kijken.
 * Voorkomt twee silent-corruption bugs van de oude versie:
 *   1. "1234.56" (US/intl, dot-decimaal) → werd 123456 → klant boekt €123.456
 *      ipv €1.234,56. Komt o.a. voor in Wise/Revolut/N26-CSV en in
 *      Excel-exports met EN-US-locale.
 *   2. "1,234.56" (US thousands-comma + dot-decimaal) → werd 1.23456.
 * Retourneert NaN voor onparsebare input zodat caller kan skippen.
 */
function _parseBankBedrag_(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/[€\s]/g, '');
  if (!s) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let cleaned;
  if (lastDot > lastComma) {
    cleaned = s.replace(/,/g, '');                       // dot is decimal
  } else if (lastComma > lastDot) {
    cleaned = s.replace(/\./g, '').replace(',', '.');    // comma is decimal
  } else {
    cleaned = s;                                          // geen scheiding
  }
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

/**
 * Strikte CSV-datum-parser. parseDatum_ valt terug op vandaag bij onparsebare
 * input — wat bij bank-import betekent dat een hele rij silent op vandaag
 * geboekt wordt (verkeerd kwartaal, verkeerde BTW-aangifte). Hier retourneren
 * we null zodat caller de rij kan skippen + de klant kan waarschuwen.
 */
function _parseCsvDatumStrict_(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const s = String(str).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (!isNaN(d.getTime()) && d.getMonth() === parseInt(iso[2]) - 1 && d.getDate() === parseInt(iso[3])) return d;
    return null;
  }
  const nl = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (nl) {
    const d = new Date(parseInt(nl[3]), parseInt(nl[2]) - 1, parseInt(nl[1]));
    if (!isNaN(d.getTime()) && d.getMonth() === parseInt(nl[2]) - 1 && d.getDate() === parseInt(nl[1])) return d;
    return null;
  }
  return null;
}

function verwerkBankCsvImport(csvTekst, scheidingsteken, kolommen) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  if (!sheet) {
    throw new Error('Tabblad Banktransacties ontbreekt — run Setup eerst (menu: Boekhoudbaar → Setup).');
  }
  const csv = String(csvTekst || '').trim();
  if (!csv) return { aantal: 0, overgeslagen: 0 };
  const regels = csv.split(/\r?\n/);

  // Skip eerste rij als header
  const eerste = String(regels[0] || '').toLowerCase();
  const startRij = (eerste.includes('datum') || eerste.includes('date')) ? 1 : 0;

  let aantalImport = 0;
  let overgeslagen = 0;

  for (let i = startRij; i < regels.length; i++) {
    const koloms = regels[i].split(scheidingsteken).map(k => k.trim().replace(/^"|"$/g, ''));
    if (koloms.length < 3) { if (regels[i].trim()) overgeslagen++; continue; }

    const datumStr = String(koloms[kolommen.datum] || '');
    const omschr   = String(koloms[kolommen.omschr] || '');
    const bedragRw = String(koloms[kolommen.bedrag] || '');
    if (!bedragRw) { overgeslagen++; continue; }

    const bedrag = _parseBankBedrag_(bedragRw);
    if (isNaN(bedrag) || bedrag === 0) { overgeslagen++; continue; }

    const datum = _parseCsvDatumStrict_(datumStr);
    if (!datum) { overgeslagen++; continue; }   // geen silent fallback op vandaag

    const transactieId = volgendTransactieId_();
    const isOntvangst = bedrag > 0;

    sheet.appendRow([
      transactieId,
      datum,
      omschr,
      bedrag,
      isOntvangst ? 'Ontvangst (bij)' : 'Betaling (af)',
      '1200',
      '', '', '', '',
      '', '', 'Geïmporteerd', '', new Date(),
    ]);
    aantalImport++;
  }

  try { schrijfAuditLog_('Bank CSV geïmporteerd', 'transacties: ' + aantalImport + ' | overgeslagen: ' + overgeslagen); } catch (_) {}
  return { aantal: aantalImport, overgeslagen };
}

// ─────────────────────────────────────────────
//  AUTO-EMAIL FACTUUR NAAR KLANT
// ─────────────────────────────────────────────
/**
 * Verstuurt de gegenereerde factuur PDF (en optioneel UBL) per e-mail naar de klant.
 * Wordt automatisch aangeroepen vanuit de form-handler als 'Ja, direct versturen'.
 */
function stuurFactuurEmailNaarKlant_(klantEmail, klantnaam, factuurNummer, bedragIncl, vervaldatum, pdfUrl, ublUrl) {
  klantEmail = String(klantEmail || '').trim();
  if (!klantEmail || !pdfUrl) {
    Logger.log('stuurFactuurEmailNaarKlant_: klantEmail of pdfUrl ontbreekt, mail overgeslagen.');
    return false;
  }
  // Strikte format-validatie via central isGeldigEmail_ (Utils.gs).
  // Voorkomt GmailApp.sendEmail crash + audit-trail van geweigerde mails.
  if (!isGeldigEmail_(klantEmail)) {
    Logger.log('stuurFactuurEmailNaarKlant_: e-mail niet geldig formaat: ' + klantEmail);
    try { schrijfAuditLog_('Factuur-mail geweigerd', 'Ongeldig e-mailformaat: ' + klantEmail); } catch (_) {}
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

    const onderwerp = `Factuur ${factuurNummer} · ${formatBedrag_(bedragIncl)} · ${bedrijf}`;
    const tekst =
      `Hoi ${klantnaam},\n\n` +
      `Hierbij factuur ${factuurNummer}.\n\n` +
      `Te betalen: ${formatBedrag_(bedragIncl)}\n` +
      `Voor: ${formatDatum_(vervaldatum)}\n\n` +
      `Graag overmaken naar:\n` +
      `IBAN: ${iban}\n` +
      `t.n.v.: ${bedrijf}\n` +
      `o.v.v.: ${factuurNummer}\n\n` +
      `Bedankt!\n${bedrijf}`;

    const htmlBody =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:540px;margin:0;padding:0 0 24px;color:#1A1A1A">' +
      '<div style="background:#0D1B4E;padding:20px 24px;border-radius:8px 8px 0 0">' +
        '<div style="color:rgba(255,255,255,.78);font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Factuur</div>' +
        '<div style="color:#fff;font-size:22px;font-weight:700">' + escHtml_(factuurNummer) + '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E5EAF2;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">' +
        '<p style="margin:0 0 14px;font-size:14px">Beste ' + escHtml_(klantnaam) + ',</p>' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.55">Bijgaand ontvangt u factuur <strong>' + escHtml_(factuurNummer) + '</strong>.</p>' +
        '<table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;background:#F7F9FC;border-radius:6px">' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px">Te betalen</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:700;font-size:15px;color:#0D1B4E">' + formatBedrag_(bedragIncl) + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Vóór</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px;border-top:1px solid #E5EAF2">' + formatDatum_(vervaldatum) + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Naar</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(iban) + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Kenmerk</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(factuurNummer) + '</td></tr>' +
        '</table>' +
        '<p style="margin:18px 0 0;font-size:13px;color:#5F6B7A">Met vriendelijke groet,<br><strong style="color:#1A1A1A">' + escHtml_(bedrijf) + '</strong></p>' +
      '</div></div>';

    const opties = {
      attachments: bijlagen,
      name: bedrijf,
      htmlBody: htmlBody,
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
  // Google Image Charts API (chart.googleapis.com) is in maart 2024 uitgezet
  // → primaire fallback is quickchart.io (de officiële vervanger), met
  // api.qrserver.com als secundaire fallback. Beide zijn gratis tiers.
  const ibanClean = String(iban || '').replace(/\s/g, '');
  if (!ibanClean) return null;

  // CYCLE-19: pre-validate IBAN met MOD-97 vóór QR-generatie. Zonder check
  // werd er silent een QR met ongeldig IBAN gegenereerd → klant van klant
  // scant met bank-app → "ongeldig betaal-verzoek" → frictie + verwarring.
  // Bij invalid: skip QR en log, factuur PDF gaat verder zonder QR (zelfde
  // gedrag als 'geen IBAN ingesteld').
  try {
    if (typeof valideerIban_ === 'function') {
      const v = valideerIban_(ibanClean);
      if (!v.geldig) {
        try { schrijfAuditLog_('SEPA QR overgeslagen', 'ongeldig IBAN: ' + ibanClean.slice(0, 8) + '… (MOD-97 controle gefaald)'); } catch (_) {}
        return null;
      }
    }
  } catch (_) { /* valideerIban_ ontbreekt? door — fallback: oude gedrag */ }
  const qrData = [
    'BCD', '001', '1', 'SCT', '',
    String(bedrijfNaam || '').substring(0, 70),
    ibanClean,
    'EUR' + Number(bedrag || 0).toFixed(2),
    '', '',
    String(referentie || '').substring(0, 35),
  ].join('\n');
  const enc = encodeURIComponent(qrData);
  const urls = [
    'https://quickchart.io/qr?size=180&text=' + enc,
    'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + enc,
  ];
  for (const url of urls) {
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        const blob = resp.getBlob();
        // quickchart kan PNG of SVG terugsturen — alleen PNG inline embedden
        const mime = blob.getContentType() || 'image/png';
        if (mime.indexOf('image/') === 0) {
          return 'data:' + mime + ';base64,' + Utilities.base64Encode(resp.getContent());
        }
      }
    } catch (e) {
      Logger.log('SEPA QR primaire bron faalt (' + url + '): ' + e.message);
    }
  }
  return null; // niet fataal — factuur PDF wordt zonder QR gegenereerd
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
    .setHeight(580).setSandboxMode(HtmlService.SandboxMode.IFRAME);
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

  // CYCLE-27: strikte lock-eis voor financieel-kritieke sectie. Voorheen
  // ging de functie door bij lock-timeout — de idempotency-check ving het
  // meeste op, maar twee callers konden allebei de check passeren VOORDAT
  // de status-write naar BETAALD afgerond was → 2× journaalpost = €X dubbel
  // geboekt op debiteuren. Nu: bij timeout → klantvriendelijke fout, klant
  // probeert opnieuw na bestaande operatie klaar is.
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(30000);
  if (!gotLock) {
    throw new Error('Systeem is bezig met een andere betaling te verwerken. Wacht een ogenblik en probeer opnieuw.');
  }

  try {
    const ss    = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    // Re-read NA lock om laatste-stand te zien (een ander process kan net
    // hebben gemarkeerd terwijl we wachtten op lock)
    const data  = sheet.getDataRange().getValues();
    const datum = betaaldatumStr ? parseDatum_(betaaldatumStr) : new Date();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) !== String(factuurnr)) continue;

      // Idempotentie-check NA lock-acquire — race-vrij
      const huidigStatus = String(data[i][14] || '');
      if (huidigStatus === FACTUUR_STATUS.BETAALD || huidigStatus === FACTUUR_STATUS.GECREDITEERD) {
        return { ok: true, bericht: 'Factuur ' + factuurnr + ' was al gemarkeerd als betaald.' };
      }

      const bedragIncl = parseFloat(data[i][12]) || 0;
      if (bedragIncl <= 0) throw new Error('Factuur ' + factuurnr + ' heeft geen geldig bedrag');

      // Bij DEELS_BETAALD: alleen het RESTERENDE bedrag boeken. Het al
      // betaalde deel heeft al een eigen journaalpost (via bank-import
      // koppelBankTransactieAanFactuur_). Boekten we hier het volle
      // bedragIncl, dan zou debiteurensaldo dubbel afnemen.
      const huidigBetaald = parseFloat(data[i][13]) || 0;
      const resterend = rondBedrag_(bedragIncl - huidigBetaald);

      sheet.getRange(i + 1, 14).setValue(bedragIncl);              // Betaald bedrag (= totaal)
      sheet.getRange(i + 1, 15).setValue(FACTUUR_STATUS.BETAALD);  // Status
      sheet.getRange(i + 1, 16).setValue(datum);                   // Betaaldatum
      // CYCLE-20: cleanup herinneringsStap_ — voorkomt ScriptProperty-accumulatie
      try { PropertiesService.getScriptProperties().deleteProperty('herinneringsStap_' + factuurnr); } catch (_) {}
      SpreadsheetApp.flush();                                       // Forceer write vóór journaalpost

      // Journaalpost alleen wanneer er nog resterend openstaat. Bij een
      // volledig betaalde DEELS_BETAALD → BETAALD upgrade (resterend = 0)
      // hoeven we niets extra te boeken, alleen status corrigeren.
      // Compensating rollback: als journaalpost faalt, draai factuur-status terug
      // anders staat factuur als BETAALD zonder tegenboeking → balans loopt scheef.
      if (resterend > 0.005) {
        try {
          maakJournaalpost_(ss, {
            datum,
            omschr:  huidigBetaald > 0
              ? 'Restbetaling factuur ' + factuurnr
              : 'Ontvangst factuur ' + factuurnr,
            dagboek: 'Bankboek',
            debet:   '1200',
            credit:  '1100',
            bedrag:  resterend,
            ref:     factuurnr,
            type:    BOEKING_TYPE.BANKONTVANGST,
          });
        } catch (jpFout) {
          // Rollback: herstel ORIGINELE betaald-bedrag (niet leeg → bewaar
          // eventuele partial pay). Status terug naar wat het was.
          try {
            sheet.getRange(i + 1, 14).setValue(huidigBetaald > 0 ? huidigBetaald : '');
            sheet.getRange(i + 1, 15).setValue(huidigStatus || FACTUUR_STATUS.VERZONDEN);
            sheet.getRange(i + 1, 16).setValue('');
            SpreadsheetApp.flush();
          } catch (rollbackFout) {
            // KRITIEKE STAAT: journaalpost faalde EN rollback faalde. Factuur
            // staat nu mogelijk in inconsistente staat (status BETAALD zonder
            // bijbehorende journaalpost). Klant moet handmatig corrigeren.
            // schrijfAuditLog_ kan ook falen → eerst naar noodLog_, dan
            // re-throw zodat caller ZIET dat het stuk is.
            try { if (typeof noodLog_ === 'function') noodLog_('FACTUUR_ROLLBACK_FATAAL', factuurnr + ' — ' + (rollbackFout && rollbackFout.message || rollbackFout)); } catch (_) {}
            try { schrijfAuditLog_('FATAAL: rollback factuur-betaald faalde', factuurnr + ' — handmatig herstel nodig — ' + (rollbackFout && rollbackFout.message || rollbackFout)); } catch (_) {}
            // Re-throw zodat klant niet denkt "alles OK"
            throw new Error('KRITIEK: factuur ' + factuurnr + ' in inconsistente staat — neem direct contact op met support. Foutdetails: journaalpost=' + (jpFout && jpFout.message || jpFout) + ' / rollback=' + (rollbackFout && rollbackFout.message || rollbackFout));
          }
          try { schrijfAuditLog_('Factuur betaald → journaalpost FAALDE, rollback uitgevoerd', factuurnr + ' — ' + (jpFout && jpFout.message || jpFout)); } catch (_) {}
          throw new Error('Markeer-betaald faalde tijdens journaalpost: ' + (jpFout && jpFout.message || jpFout) + ' — factuur-status teruggezet.');
        }
      }

      schrijfAuditLog_('Factuur betaald', factuurnr + ' via factuurlijst dialog');
      // Invalidate snapshot: debiteurenOpen and aantalOpenFacturen have changed.
      // The next snapshot read will recompute fresh (no vernieuwDashboard overhead here).
      invalideerKpiSnapshot_();
      try { bustCache_('kpi'); bustCache_('advies'); } catch (_) {}
      return { ok: true, bericht: 'Factuur ' + factuurnr + ' gemarkeerd als betaald.' };
    }
    throw new Error('Factuurnummer ' + factuurnr + ' niet gevonden');
  } finally {
    if (gotLock) try { lock.releaseLock(); } catch (_) {}
  }
}

function _bouwFactuurlijstHtml_() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#1A1A1A;background:#F7F9FC;height:100vh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}' +
    '.hdr{background:#0D1B4E;color:white;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
    '.hdr h1{font-size:14px;font-weight:700;letter-spacing:-0.01em}' +
    '.btn-ref{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:white;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-family:inherit;transition:background .15s ease}' +
    '.btn-ref:hover{background:rgba(255,255,255,.22)}' +
    '.tabs{display:flex;background:white;border-bottom:1px solid #E5EAF2;flex-shrink:0}' +
    '.tab{flex:1;padding:11px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:#5F6B7A;border-bottom:3px solid transparent;transition:all .15s;user-select:none}' +
    '.tab:hover{color:#0D1B4E;background:#F7F9FC}' +
    '.tab.actief{color:#0D1B4E;border-bottom-color:#2EC4B6}' +
    '.tab .cnt{display:inline-block;background:#E5EAF2;color:#5F6B7A;font-size:10px;padding:1px 7px;border-radius:20px;margin-left:6px;vertical-align:middle;font-weight:600}' +
    '.tab.actief .cnt{background:rgba(46,196,182,.18);color:#0D1B4E}' +
    '.tab.vervallen.actief .cnt{background:#FDECEC;color:#B91C1C}' +
    '.body{flex:1;overflow-y:auto;padding:14px 18px}' +
    'table{width:100%;border-collapse:collapse;background:white;border-radius:10px;border:1px solid #E5EAF2;overflow:hidden}' +
    'th{background:#F7F9FC;font-size:10px;font-weight:700;color:#5F6B7A;text-transform:uppercase;letter-spacing:.6px;padding:10px 12px;text-align:left;border-bottom:1px solid #E5EAF2}' +
    'td{padding:10px 12px;border-bottom:1px solid #F0F3F7;font-size:12px;vertical-align:middle}' +
    'tr:last-child td{border-bottom:none}' +
    'tr:hover td{background:#FAFBFC}' +
    '.badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;letter-spacing:.3px;box-shadow:inset 0 1px 2px rgba(0,0,0,.04)}' +
    '.b-open{background:rgba(46,196,182,.14);color:#0D1B4E}' +
    '.b-concept{background:#F0F3F7;color:#5F6B7A}' +
    '.b-deels{background:#FEF9C3;color:#854D0E}' +
    '.b-vervallen{background:#FDECEC;color:#B91C1C}' +
    '.b-betaald{background:#DCFCE7;color:#166534}' +
    '.b-gecrediteerd{background:#F3E8FF;color:#6B21A8}' +
    '.btn-betaald{background:#166534;color:white;border:none;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap;font-family:inherit;font-weight:600}' +
    '.btn-betaald:hover{background:#14532D}' +
    '.btn-betaald:disabled{background:#94A3B8;cursor:not-allowed}' +
    '.btn-verstuur{background:#0D1B4E;color:white;border:none;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap;margin-right:4px;font-family:inherit;font-weight:600}' +
    '.btn-verstuur:hover{background:#1A2A6B}' +
    '.btn-verstuur:disabled{background:#94A3B8;cursor:not-allowed}' +
    '.urgent{color:#B91C1C;font-weight:700;background:rgba(185,28,28,.08);padding:2px 6px;border-radius:4px}' +
    '.loading{text-align:center;padding:40px;color:#94A3B8}' +
    '.spin{display:inline-block;width:20px;height:20px;border:2px solid #E5EAF2;border-top-color:#2EC4B6;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.leeg{text-align:center;padding:30px;color:#94A3B8;font-size:12px}' +
    '.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#0D1B4E;color:white;padding:10px 22px;border-radius:8px;font-size:12px;display:none;z-index:99;box-shadow:0 6px 20px rgba(13,27,78,.22)}' +
    '::selection{background:rgba(46,196,182,.28);color:#0D1B4E}' +
    '</style></head><body>' +
    '<div class="hdr"><h1>Verkoopfacturen</h1><button class="btn-ref" data-actie="laad">\u21bb Vernieuwen</button></div>' +
    '<div class="tabs" id="tabs">' +
    '  <div class="tab actief" data-tab="alle" data-actie="wissel">Alle<span class="cnt" id="cnt-alle">0</span></div>' +
    '  <div class="tab" data-tab="open" data-actie="wissel">Openstaand<span class="cnt" id="cnt-open">0</span></div>' +
    '  <div class="tab vervallen" data-tab="vervallen" data-actie="wissel">Vervallen<span class="cnt" id="cnt-vervallen">0</span></div>' +
    '  <div class="tab" data-tab="betaald" data-actie="wissel">Betaald<span class="cnt" id="cnt-betaald">0</span></div>' +
    '</div>' +
    '<div class="body" id="body"><div class="loading"><div class="spin"></div><br>Even laden\u2026</div></div>' +
    '<div class="toast" id="toast"></div>' +
    '<script>' +
    'var ALLE=[], ACTIEF_TAB="alle";' +
    'function fmt(b){b=parseFloat(b)||0;return(b<0?"-\u20ac":"\u20ac")+Math.abs(b).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});}' +
    'function esc(s){return String(s||"").replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\'":"&#39;"}[c];});}' +
    'function badgeKls(s){var m={"Verzonden":"b-open","Concept":"b-concept","Deels betaald":"b-deels","Vervallen":"b-vervallen","Betaald":"b-betaald","Gecrediteerd":"b-gecrediteerd"};return m[s]||"b-concept";}' +
    'function statusEmoji(s){var m={"Concept":"✏️","Verzonden":"📧","Deels betaald":"🔵","Betaald":"✅","Vervallen":"⚠️","Gecrediteerd":"↩️"};return m[s]||"";}' +
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
    '    h+=\'<td><span class="badge \'+badgeKls(f.status)+\'">\'+statusEmoji(f.status)+\' \'+esc(f.status)+\'</span></td>\';' +
    '    h+=\'<td style="white-space:nowrap">\';' +
    // data-actie + dataset-attributen ipv inline onclick (CSP-veilig + voorkomt
    // quote-escape-hell met factuurnummers die quotes/specials kunnen bevatten).
    '    if(kanVersturen){' +
    '      h+=\'<button class="btn-verstuur" id="vs-\'+esc(f.nr)+\'" data-actie="verstuur" data-nr="\'+esc(f.nr)+\'" data-email="\'+esc(f.klantEmail||"")+\'">\u2709 Verstuur</button>\';' +
    '    }' +
    '    if(kanBetalen){' +
    '      h+=\'<button class="btn-betaald" id="btn-\'+esc(f.nr)+\'" data-actie="betaal" data-nr="\'+esc(f.nr)+\'">Betaald</button>\';' +
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
    // Event-delegation op de body: één listener vangt alle klikken op
    // dynamisch gegenereerde knoppen + tabs (innerHTML-rerender wist listeners).
    'document.body.addEventListener("click",function(e){' +
    '  var a=e.target.closest("[data-actie]");' +
    '  if(!a) return;' +
    '  var actie=a.getAttribute("data-actie");' +
    '  if(actie==="verstuur"){verstuur(a.getAttribute("data-nr"),a.getAttribute("data-email")||"");}' +
    '  else if(actie==="betaal"){betaal(a.getAttribute("data-nr"));}' +
    '  else if(actie==="wissel"){wissel(a.getAttribute("data-tab"));}' +
    '  else if(actie==="laad"){laad();}' +
    '});' +
    'laad();' +
    '<\/script></body></html>';
}

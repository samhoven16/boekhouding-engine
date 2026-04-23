/**
 * ExportAccountant.gs
 * Exporteer een volledig accountantspakket met één klik.
 *
 * WERKELIJKE PIJN die dit oplost:
 *  - "Afhankelijkheid accountant" (Exact Online) → geef accountant wat hij nodig heeft
 *  - "Geen transparantie" (traditionele accountant) → toon alle cijfers open en helder
 *  - "Lock-in pricing" (QuickBooks) → data altijd beschikbaar, altijd exporteerbaar
 *  - "Black box" (Yuki AI) → laat zien hoe elk getal tot stand is gekomen
 *
 * WAT WORDT GEËXPORTEERD:
 *  1. Samenvatting (1 pagina voor accountant: winst, BTW, balans)
 *  2. Alle journaalposten (CSV — voor import in elk boekhoudpakket)
 *  3. Verkoopfacturen overzicht (voor omzetcontrole)
 *  4. Inkoopfacturen overzicht (voor kostencontrole)
 *  5. BTW aangifte alle kwartalen
 *  6. Grootboeksaldi
 *
 * RESULTAAT: Alle bestanden in Drive map "Accountantspakket [jaar]"
 */

// ─────────────────────────────────────────────
//  MENU-ENTRY PUNT
// ─────────────────────────────────────────────

function exporteerAccountantsPakket() {
  const ui = SpreadsheetApp.getUi();

  const bevestiging = ui.alert(
    'Accountantspakket exporteren',
    'Dit maakt een volledig exportpakket aan in uw Google Drive:\n\n' +
    '  • Samenvatting winst/verlies en balans\n' +
    '  • Alle journaalposten (CSV)\n' +
    '  • Overzicht verkoopfacturen\n' +
    '  • Overzicht inkoopfacturen\n' +
    '  • BTW aangifte alle kwartalen\n\n' +
    'De bestanden worden opgeslagen in de map\n"Accountantspakket [jaar]" in uw Google Drive.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.OK_CANCEL
  );

  if (bevestiging !== ui.Button.OK) return;

  const ss     = getSpreadsheet_();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'MijnBedrijf';
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const jaar    = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const mapNaam = `Accountantspakket ${bedrijf} ${jaar}`;

  // Maak Drive map aan
  let folder;
  const bestaandeMappen = DriveApp.getFoldersByName(mapNaam);
  folder = bestaandeMappen.hasNext() ? bestaandeMappen.next() : DriveApp.createFolder(mapNaam);

  const gemaakteFiles = [];

  try {
    // ── 1. Samenvatting ──────────────────────────────────────────────────
    const samenvattingTekst = maakSamenvattingTekst_(ss, bedrijf, jaar);
    const samenvattingFile = folder.createFile(`1_Samenvatting_${jaar}.txt`, samenvattingTekst, 'text/plain');
    gemaakteFiles.push('📄 Samenvatting');

    // ── 2. Journaalposten CSV ────────────────────────────────────────────
    const jpCsv = exporteerAlsCsv_(ss, SHEETS.JOURNAALPOSTEN);
    folder.createFile(`2_Journaalposten_${jaar}.csv`, jpCsv, 'text/csv');
    gemaakteFiles.push('📊 Journaalposten');

    // ── 3. Verkoopfacturen CSV ───────────────────────────────────────────
    const vfCsv = exporteerAlsCsv_(ss, SHEETS.VERKOOPFACTUREN);
    folder.createFile(`3_Verkoopfacturen_${jaar}.csv`, vfCsv, 'text/csv');
    gemaakteFiles.push('📊 Verkoopfacturen');

    // ── 4. Inkoopfacturen CSV ────────────────────────────────────────────
    const ifCsv = exporteerAlsCsv_(ss, SHEETS.INKOOPFACTUREN);
    folder.createFile(`4_Inkoopfacturen_${jaar}.csv`, ifCsv, 'text/csv');
    gemaakteFiles.push('📊 Inkoopfacturen');

    // ── 5. BTW aangifte alle kwartalen ───────────────────────────────────
    const btwTekst = maakBtwOverzichtTekst_(ss, jaar);
    folder.createFile(`5_BTW_aangifte_${jaar}.txt`, btwTekst, 'text/plain');
    gemaakteFiles.push('📄 BTW aangifte');

    // ── 6. Grootboeksaldi CSV ────────────────────────────────────────────
    const gbCsv = exporteerAlsCsv_(ss, SHEETS.GROOTBOEKSCHEMA);
    folder.createFile(`6_Grootboeksaldi_${jaar}.csv`, gbCsv, 'text/csv');
    gemaakteFiles.push('📊 Grootboeksaldi');

    // ── 7. Instructiebestand voor accountant ────────────────────────────
    const instructies = maakAccountantInstructies_(bedrijf, jaar, folder.getUrl());
    folder.createFile(`0_LEESMIJ_accountant.txt`, instructies, 'text/plain');

  } catch (e) {
    ui.alert('Fout', 'Export mislukt: ' + e.message, ui.ButtonSet.OK);
    return;
  }

  ui.alert(
    '✅ Export klaar!',
    `Alle bestanden staan klaar in Google Drive:\n\n` +
    gemaakteFiles.map(f => '  ' + f).join('\n') + '\n\n' +
    `Map: "${mapNaam}"\n\n` +
    `U kunt de map nu delen met uw accountant via Google Drive (rechtsklik → Delen).`,
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  EMAIL NAAR ACCOUNTANT
// ─────────────────────────────────────────────

function emailNaarAccountant() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 10px}
      .form-row{margin:10px 0}
      label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#0D1B4E}
      input,textarea{width:100%;padding:8px 10px;border:1px solid #E5EAF2;border-radius:6px;
                     font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;
                     transition:border-color 0.15s}
      input:focus,textarea:focus{outline:none;border-color:#2EC4B6}
      .btn{background:#0D1B4E;color:white;border:none;padding:11px 20px;border-radius:6px;
           cursor:pointer;width:100%;margin-top:14px;font-size:14px;font-weight:600;
           font-family:inherit;transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .btn:disabled{background:#9AA3B5;cursor:not-allowed}
      .info{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;
            padding:10px 12px;border-radius:0 6px 6px 0;font-size:12px;margin-bottom:14px;
            color:#1A1A1A;line-height:1.5}
    </style>
    <h3>Samenvatting naar je accountant e-mailen</h3>
    <div class="info">Er wordt een tekstsamenvatting gemaild — geen persoonlijke financiële gegevens zonder jouw toestemming.</div>
    <div class="form-row">
      <label>E-mailadres accountant *</label>
      <input type="email" id="email" placeholder="accountant@kantoor.nl">
    </div>
    <div class="form-row">
      <label>Persoonlijk berichtje (optioneel)</label>
      <textarea id="bericht" rows="3" placeholder="Bijv. 'Hierbij mijn kwartaaloverzicht, graag nakijken.'"></textarea>
    </div>
    <button class="btn" onclick="verstuur()">Versturen</button>
    <div id="status" style="margin-top:8px;display:none"></div>
    <script>
      function verstuur() {
        var email   = document.getElementById('email').value.trim();
        var bericht = document.getElementById('bericht').value.trim();
        if (!email || !email.includes('@')) { alert('Voer een geldig e-mailadres in.'); return; }
        document.querySelector('.btn').disabled = true;
        document.querySelector('.btn').textContent = 'Versturen...';
        google.script.run
          .withSuccessHandler(function() {
            document.getElementById('status').style.display = 'block';
            document.getElementById('status').style.color = 'green';
            document.getElementById('status').textContent = '✓ Verstuurd!';
            setTimeout(function(){ google.script.host.close(); }, 1500);
          })
          .withFailureHandler(function(err) {
            document.querySelector('.btn').disabled = false;
            document.querySelector('.btn').textContent = 'Opnieuw proberen';
            document.getElementById('status').style.display = 'block';
            document.getElementById('status').style.color = 'red';
            document.getElementById('status').textContent = 'Fout: ' + err.message;
          })
          .verstuurSamenvattingAccountant(email, bericht);
      }
    </script>
  `).setWidth(480).setHeight(340);
  ui.showModalDialog(html, 'E-mail naar accountant');
}

function verstuurSamenvattingAccountant(emailAccountant, persoonlijkBericht) {
  const ss      = getSpreadsheet_();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Mijn Bedrijf';
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const jaar    = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const kg      = berekenKengetallen_(ss);

  GmailApp.sendEmail(emailAccountant, `Financieel overzicht ${bedrijf} — ${jaar}`, '', {
    htmlBody: `
      <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;color:#1A1A1A;margin:0;padding:0;background:#F7F9FC">
        <div style="background:#0D1B4E;padding:22px 24px;border-radius:10px 10px 0 0">
          <h2 style="color:white;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.01em">${bedrijf}</h2>
          <p style="color:#B8C2D1;margin:4px 0 0;font-size:13px">Financieel overzicht ${jaar}</p>
        </div>
        <div style="padding:22px 24px;border:1px solid #E5EAF2;border-top:none;background:#fff;border-radius:0 0 10px 10px">
          ${persoonlijkBericht ? `<p style="background:#F7F9FC;border-left:3px solid #2EC4B6;padding:12px 14px;border-radius:0 6px 6px 0;margin:0 0 18px">${escHtml_(persoonlijkBericht)}</p>` : ''}
          <h3 style="color:#0D1B4E;font-size:14px;font-weight:600;margin:0 0 10px">Samenvatting</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="background:#F7F9FC"><td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #E5EAF2">Omzet (YTD)</td><td style="padding:10px 12px;text-align:right;border-bottom:1px solid #E5EAF2">${formatBedrag_(kg.omzet)}</td></tr>
            <tr><td style="padding:10px 12px;border-bottom:1px solid #E5EAF2">Kosten (YTD)</td><td style="padding:10px 12px;text-align:right;border-bottom:1px solid #E5EAF2">${formatBedrag_(kg.kosten)}</td></tr>
            <tr style="background:#E6F7F4;font-weight:600"><td style="padding:10px 12px;border-bottom:1px solid #E5EAF2">Nettowinst</td><td style="padding:10px 12px;text-align:right;border-bottom:1px solid #E5EAF2">${formatBedrag_(kg.nettowinst)}</td></tr>
            <tr><td style="padding:10px 12px;border-bottom:1px solid #E5EAF2">Banksaldo</td><td style="padding:10px 12px;text-align:right;border-bottom:1px solid #E5EAF2">${formatBedrag_(kg.banksaldo)}</td></tr>
            <tr><td style="padding:10px 12px">Open debiteuren</td><td style="padding:10px 12px;text-align:right">${formatBedrag_(kg.debiteuren)}</td></tr>
          </table>
          <p style="font-size:11px;color:#5A6478;margin-top:18px;line-height:1.5">
            Gegenereerd via Boekhoudbaar op ${formatDatumTijd_(new Date())}.<br>
            Raadpleeg het volledige exportpakket voor details.
          </p>
        </div>
      </body></html>
    `,
  });
}

// ─────────────────────────────────────────────
//  HELPER: SAMENVATTING TEKST
// ─────────────────────────────────────────────

function maakSamenvattingTekst_(ss, bedrijf, jaar) {
  const kg = berekenKengetallen_(ss);
  const nu = new Date();

  return [
    `FINANCIEEL OVERZICHT ${bedrijf} — Boekjaar ${jaar}`,
    `Gegenereerd: ${formatDatumTijd_(nu)}`,
    `${'='.repeat(60)}`,
    '',
    'RESULTATENREKENING (W&V)',
    `Omzet (excl. BTW):     ${formatBedrag_(kg.omzet)}`,
    `Kosten:                ${formatBedrag_(kg.kosten)}`,
    `Nettowinst/-verlies:   ${formatBedrag_(kg.nettowinst)}`,
    `Winstmarge:            ${kg.winstmarge}%`,
    '',
    'BALANS',
    `Banksaldo:             ${formatBedrag_(kg.banksaldo)}`,
    `Debiteuren (open):     ${formatBedrag_(kg.debiteuren)}`,
    `Crediteuren (open):    ${formatBedrag_(kg.crediteuren)}`,
    `Eigen vermogen:        ${formatBedrag_(kg.eigenVermogen)}`,
    '',
    'KENGETALLEN',
    `Liquiditeit (current ratio): ${kg.liquiditeit ? kg.liquiditeit.toFixed(2) : 'n.v.t.'}`,
    `Solvabiliteit:               ${kg.solvabiliteit ? kg.solvabiliteit + '%' : 'n.v.t.'}`,
    '',
    `${'='.repeat(60)}`,
    'NB: Dit is een beknopte samenvatting. Zie de meegeleverde CSV-bestanden',
    'voor de volledige journaalposten en factuuroverzichten.',
  ].join('\n');
}

function maakBtwOverzichtTekst_(ss, jaar) {
  const kwartalen = ['Q1', 'Q2', 'Q3', 'Q4'];
  const lijnen = [`BTW AANGIFTE OVERZICHT ${jaar}`, '='.repeat(50), ''];

  kwartalen.forEach(kw => {
    try {
      const periode = bepaalBtwPeriode_(kw, jaar);
      const aangifte = berekenBtwAangifte_(ss, periode.van, periode.tot);
      lijnen.push(`${kw} (${formatDatum_(periode.van)} t/m ${formatDatum_(periode.tot)})`);
      lijnen.push(`  Omzet 21%:         ${formatBedrag_(aangifte.r1a_grondslag)}  BTW: ${formatBedrag_(aangifte.r1a_btw)}`);
      lijnen.push(`  Omzet 9%:          ${formatBedrag_(aangifte.r1b_grondslag)}  BTW: ${formatBedrag_(aangifte.r1b_btw)}`);
      lijnen.push(`  Voorbelasting:     ${formatBedrag_(aangifte.r5b)}`);
      lijnen.push(`  SALDO:             ${formatBedrag_(aangifte.saldo)}  ${aangifte.saldo >= 0 ? '(te betalen)' : '(terug te vorderen)'}`);
      lijnen.push('');
    } catch (e) {
      lijnen.push(`${kw}: kon niet berekenen (${e.message})`);
    }
  });

  return lijnen.join('\n');
}

function maakAccountantInstructies_(bedrijf, jaar, mapUrl) {
  return `INSTRUCTIES VOOR ACCOUNTANT
Boekhoudbaar — ${bedrijf} — Boekjaar ${jaar}
${'='.repeat(60)}

Beste accountant,

In deze map vindt u de volledige boekhouding van ${bedrijf} voor ${jaar}.

INHOUD:
  0_LEESMIJ_accountant.txt    — Dit bestand
  1_Samenvatting_${jaar}.txt  — Beknopt overzicht winst/verlies en balans
  2_Journaalposten_${jaar}.csv — Alle boekingen (dubbel boekhouden)
  3_Verkoopfacturen_${jaar}.csv — Alle uitgestuurde facturen
  4_Inkoopfacturen_${jaar}.csv  — Alle ontvangen facturen/kosten
  5_BTW_aangifte_${jaar}.txt    — BTW overzicht per kwartaal
  6_Grootboeksaldi_${jaar}.csv  — Eindstanden per grootboekrekening

GEBRUIKTE GROOTBOEKSCHEMA:
  Conform Nederlands RGS (Referentie Grootboekschema).
  Codes zijn compatibel met Exact Online en Twinfield.

IMPORT IN BOEKHOUDPAKKET:
  De CSV-bestanden kunnen worden geïmporteerd in:
  Exact Online, Twinfield, AFAS, of handmatig verwerkt worden.

CONTACT:
  Vragen over de data? Neem contact op met de ondernemer.

Gegenereerd via Boekhoudbaar op ${formatDatumTijd_(new Date())}.
`;
}

// ─────────────────────────────────────────────
//  BACKUP NAAR DRIVE
// ─────────────────────────────────────────────
/**
 * Exporteert de volledige spreadsheet als XLSX naar de map "Boekhouding Backups"
 * in Google Drive. Bestandsnaam bevat datum voor traceerbaarheid.
 * Voldoet aan de 7-jaar bewaarplicht: backups worden nooit automatisch verwijderd.
 */
function maakBackup() {
  if (!controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  const ssId = ss.getId();
  const bedrijf = (getInstelling_('Bedrijfsnaam') || 'Boekhouding')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const datum = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd_HH-mm');
  const bestandsnaam = 'Backup_' + bedrijf + '_' + datum + '.xlsx';

  try {
    // XLSX export via de Google Sheets export-URL (vereist OAuth-token van de eigenaar)
    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + ssId +
                      '/export?format=xlsx&access_token=' +
                      encodeURIComponent(ScriptApp.getOAuthToken());
    const blob = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true }
    ).getBlob().setName(bestandsnaam);

    // Sla op in de map "Boekhouding Backups" (aanmaken als die niet bestaat)
    const mappen = DriveApp.getFoldersByName('Boekhouding Backups');
    const map = mappen.hasNext() ? mappen.next() : DriveApp.createFolder('Boekhouding Backups');
    const file = map.createFile(blob);

    ui.alert('Backup gemaakt',
      'Backup opgeslagen als:\n' + bestandsnaam +
      '\n\nLocatie: Google Drive \u2192 Boekhouding Backups\n\n' +
      'Tip: maak maandelijks een backup om te voldoen aan de 7-jaar bewaarplicht.',
      ui.ButtonSet.OK);

    Logger.log('Backup aangemaakt: ' + file.getUrl());
  } catch (e) {
    Logger.log('Backup mislukt: ' + e.message);
    ui.alert('Backup mislukt', 'Er ging iets mis: ' + e.message, ui.ButtonSet.OK);
  }
}

// ─────────────────────────────────────────────
//  HELPER: SHEET → CSV
// ─────────────────────────────────────────────

function exporteerAlsCsv_(ss, sheetNaam) {
  const sheet = ss.getSheetByName(sheetNaam);
  if (!sheet) return '';

  const data = sheet.getDataRange().getValues();
  return data.map(rij =>
    rij.map(cel => {
      let waarde = '';
      if (cel instanceof Date) {
        waarde = Utilities.formatDate(cel, 'Europe/Amsterdam', 'dd-MM-yyyy');
      } else {
        waarde = String(cel === null || cel === undefined ? '' : cel);
      }
      // Formula-injectie blokkeren (Excel/Sheets veiligheid)
      if (/^[=+\-@\t\r]/.test(waarde)) waarde = "'" + waarde;
      // CSV escaping: omsluit met quotes als het komma's, quotes of newlines bevat
      if (waarde.includes(',') || waarde.includes('"') || waarde.includes('\n')) {
        waarde = '"' + waarde.replace(/"/g, '""') + '"';
      }
      return waarde;
    }).join(',')
  ).join('\n');
}

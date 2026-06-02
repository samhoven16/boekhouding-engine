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
  const jaar    = getBoekjaar_();
  // Sanitize bedrijf voor filesystem-safety; voorkomt path-traversal of vreemde tekens.
  const bedrijfSafe = String(bedrijf).replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'MijnBedrijf';
  const mapNaam = `Accountantspakket ${bedrijfSafe} ${jaar}`;

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
            document.getElementById('status').textContent = '⚠️ ' + (err && err.message ? err.message : 'Er ging iets mis. Probeer opnieuw.');
          })
          .verstuurSamenvattingAccountant(email, bericht);
      }
    </script>
  `).setWidth(480).setHeight(340).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  ui.showModalDialog(html, 'E-mail naar accountant');
}

function verstuurSamenvattingAccountant(emailAccountant, persoonlijkBericht) {
  // Server-side e-mail validatie — dialog-side validatie kan
  // omzeild worden via custom HTTP-clients of devtools.
  emailAccountant = String(emailAccountant || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailAccountant)) {
    throw new Error('Ongeldig e-mailadres: ' + emailAccountant);
  }
  const ss      = getSpreadsheet_();
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Mijn Bedrijf';
  const jaar    = getBoekjaar_();
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
    // Flush forceren — backup mag NIET stale data bevatten (compliance).
    SpreadsheetApp.flush();
    // XLSX export via de Google Sheets export-URL (vereist OAuth-token van de eigenaar)
    const resp = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true }
    );
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Google Sheets export gaf HTTP ' + code + ' \u2014 heb je voldoende Drive-rechten?');
    }
    const blob = resp.getBlob().setName(bestandsnaam);
    if (blob.getBytes().length < 1000) {
      throw new Error('Backup-bestand is verdacht klein (' + blob.getBytes().length + ' bytes). Mogelijk auth-probleem.');
    }

    // Sla op in de map "Boekhouding Backups" (aanmaken als die niet bestaat).
    // Pak de oudste matchende map zodat backups bij elkaar blijven, ook bij dubbele.
    const mappen = DriveApp.getFoldersByName('Boekhouding Backups');
    let map;
    if (mappen.hasNext()) {
      map = mappen.next();
    } else {
      map = DriveApp.createFolder('Boekhouding Backups');
    }
    const file = map.createFile(blob);
    const fileUrl = file.getUrl();
    const mapUrl  = map.getUrl();

    ui.alert('Backup gemaakt',
      'Backup opgeslagen als:\n' + bestandsnaam +
      '\n\nGrootte: ' + Math.round(blob.getBytes().length / 1024) + ' KB' +
      '\nLocatie: Google Drive \u2192 Boekhouding Backups\n' +
      'Map: ' + mapUrl + '\n\n' +
      'Tip: maak maandelijks een backup om te voldoen aan de 7-jaar bewaarplicht.',
      ui.ButtonSet.OK);

    Logger.log('Backup aangemaakt: ' + fileUrl);
    safeAuditLog_('Backup', 'XLSX gemaakt: ' + bestandsnaam + ' (' + Math.round(blob.getBytes().length / 1024) + ' KB)');
  } catch (e) {
    Logger.log('Backup mislukt: ' + e.message);
    safeAuditLog_('FOUT Backup', e.message);
    ui.alert('Backup mislukt',
      'Er ging iets mis:\n\n' + e.message +
      '\n\nMogelijke oorzaken:\n\u2022 Drive-quota vol \u2014 ruim ruimte op\n\u2022 Geen schrijfrechten op Drive\n\u2022 Tijdelijke Google API-fout \u2014 probeer over een minuut opnieuw',
      ui.ButtonSet.OK);
  }
}

/**
 * Automatische dagelijkse backup \u2014 aangeroepen door dagelijkseTaken.
 * Geen UI, geen alerts; logs naar audit-log. Bewaart max 30 dagen aan
 * backups in /Boekhoudbaar/Backups/ \u2014 oudere worden naar prullenbak.
 */
function maakAutomatischeBackup_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    const ssId = ss.getId();
    const bedrijf = (getInstelling_('Bedrijfsnaam') || 'Boekhouding')
      .replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const datum = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
    const bestandsnaam = 'AutoBackup_' + bedrijf + '_' + datum + '.xlsx';

    // Skip als backup van vandaag al bestaat (dagelijkse trigger kan 2\u00d7 runnen
    // bij retry \u2014 voorkom Drive-vervuiling)
    const huidigJaar = new Date().getFullYear();
    let backupMap = null;
    try {
      const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + huidigJaar);
      if (hoofdId) {
        const hoofd = DriveApp.getFolderById(hoofdId);
        const it = hoofd.getFoldersByName('Backups');
        backupMap = it.hasNext() ? it.next() : hoofd.createFolder('Backups');
      }
    } catch (_) {}
    if (!backupMap) {
      const it = DriveApp.getFoldersByName('Boekhouding Backups');
      backupMap = it.hasNext() ? it.next() : DriveApp.createFolder('Boekhouding Backups');
    }

    const bestaand = backupMap.getFilesByName(bestandsnaam);
    if (bestaand.hasNext()) return;  // al gemaakt vandaag

    const resp = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true }
    );
    if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
      throw new Error('export HTTP ' + resp.getResponseCode());
    }
    const blob = resp.getBlob().setName(bestandsnaam);
    backupMap.createFile(blob);
    safeAuditLog_('AutoBackup', bestandsnaam + ' (' + Math.round(blob.getBytes().length / 1024) + ' KB)');

    // Retentie: verwijder backups ouder dan 30 dagen
    const grens = Date.now() - 30 * 86400000;
    const oudIt = backupMap.getFilesByType(MimeType.MICROSOFT_EXCEL);
    while (oudIt.hasNext()) {
      const f = oudIt.next();
      if (f.getName().startsWith('AutoBackup_') && f.getDateCreated().getTime() < grens) {
        try { f.setTrashed(true); } catch (_) {}
      }
    }
  } catch (e) {
    Logger.log('maakAutomatischeBackup_ fout: ' + e.message);
    safeAuditLog_('FOUT AutoBackup', e.message);
  }
}

// ─────────────────────────────────────────────
//  CYCLE 70: NOAH'S ARK — PLATFORM-ONAFHANKELIJKE SNAPSHOT
// ─────────────────────────────────────────────
//
// Probleem: maakAutomatischeBackup_ schrijft .xlsx — een vendor-formaat
// dat een leesprogramma vereist (Excel, LibreOffice, een xlsx-library).
// Als Google Apps Script over 15 jaar stopt of de klant z'n account
// kwijtraakt, zijn die backups nog te openen, maar de bookkeeping-data
// in machine-leesbare vorm is afhankelijk van software-survival.
//
// Cycle 70 voegt een TWEEDE dagelijkse backup toe: één JSONL-bestand met
// alle bron-sheets (de data waaruit de hele administratie reconstrueert).
// Pure text, één JSON-object per regel, leesbaar door ELK programma dat
// tekst kan parsen — Python, Rust, awk, in 2070 nog. De hash-keten uit
// cycle 69 reist mee, dus integriteits-bewijs blijft verifieerbaar zonder
// Google.
//
// EERLIJK over wat dit wel en niet doet:
//  • Dit IS een echte exit-strategie voor de data zelf.
//  • Dit is GEEN exit-strategie voor de logica (BTW-berekening,
//    journaalpost-rules) — die zit in .gs en moet bij migratie herschreven.
//  • Afgeleide sheets (Dashboard, Balans, W&V, BTW Aangifte) staan
//    BEWUST niet in de snapshot: die zijn berekenbaar uit de bron-sheets.
//    Dubbel opnemen = synchronisatie-rot tussen bron en afgeleide.

/** De data-sheets die de hele boekhouding reconstrueren. Niet de afgeleide. */
function _BRON_SHEETS_NOAH_() {
  return [
    SHEETS.JOURNAALPOSTEN,     // canonieke grootboek-feiten
    SHEETS.VERKOOPFACTUREN,
    SHEETS.INKOOPFACTUREN,
    SHEETS.BANKTRANSACTIES,
    SHEETS.RELATIES,
    SHEETS.HERHALENDE_KOSTEN,
    SHEETS.INSTELLINGEN,
    SHEETS.GROOTBOEKSCHEMA,
    SHEETS.AUDIT_LOG,          // incl. cycle-69 hash-keten
  ];
}

/**
 * Serialiseert één sheet naar JSONL-regels. Eerste regel = header-record,
 * daarna één regel per data-rij. Header-driven: elke cel wordt gekoppeld aan
 * de kolom-naam uit rij 1, zodat schema-wijzigingen (extra kolom) door een
 * 2070-lezer foutloos te volgen zijn (object-properties i.p.v. array-indices).
 * Datums → ISO-8601 (UTC), zonder verlies vergeleken met sheet-serial.
 */
function _serialiseerSheetNaarJsonl_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h || ''); });
  const regels = [JSON.stringify({
    _record: 'sheet-header',
    sheet: sheet.getName(),
    kolommen: headers,
    rijen: Math.max(0, data.length - 1),
  })];
  for (var i = 1; i < data.length; i++) {
    const obj = { _record: 'rij', sheet: sheet.getName(), rij: i + 1 };
    const data_obj = {};
    var leeg = true;
    for (var k = 0; k < headers.length; k++) {
      var v = data[i][k];
      if (v instanceof Date) v = v.toISOString();
      else if (v != null && v !== '') leeg = false;
      data_obj[headers[k] || ('kolom' + (k + 1))] = v == null ? '' : v;
    }
    if (leeg) continue;        // sla geheel-lege staartrijen over
    obj.data = data_obj;
    regels.push(JSON.stringify(obj));
  }
  return regels;
}

/**
 * Dagelijks: schrijf één platform-onafhankelijke JSONL-snapshot naar Drive.
 *   manifest-regel → per-sheet header-regel → per-rij data-regels.
 *
 * Idempotent: skip als snapshot van vandaag al bestaat (trigger kan 2× draaien).
 * Retentie: 30 dagen, gelijk aan xlsx-backup.
 */
function maakNoahArkSnapshot_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    const bedrijf = (getInstelling_('Bedrijfsnaam') || 'Boekhouding')
      .replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const datum = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
    const bestandsnaam = 'NoahArk_' + bedrijf + '_' + datum + '.jsonl';

    // Drive-map: hergebruik de Backups-folder waar de xlsx ook in staat.
    const huidigJaar = new Date().getFullYear();
    var backupMap = null;
    try {
      const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + huidigJaar);
      if (hoofdId) {
        const hoofd = DriveApp.getFolderById(hoofdId);
        const it = hoofd.getFoldersByName('Backups');
        backupMap = it.hasNext() ? it.next() : hoofd.createFolder('Backups');
      }
    } catch (_) {}
    if (!backupMap) {
      const it = DriveApp.getFoldersByName('Boekhouding Backups');
      backupMap = it.hasNext() ? it.next() : DriveApp.createFolder('Boekhouding Backups');
    }

    if (backupMap.getFilesByName(bestandsnaam).hasNext()) return;  // al vandaag

    // Manifest = eerste regel. Bevat schema-versie + reconstructie-instructies
    // zodat een lezer in 2070 weet hoe-en-wat zonder externe documentatie.
    const manifest = {
      _record: 'manifest',
      _schema: 'noah-ark/v1',
      formaat: 'JSONL (één JSON-object per regel, UTF-8, LF-newlines)',
      bron: 'Boekhoudbaar — Google Sheets administratie',
      bedrijf: bedrijf,
      spreadsheetId: ss.getId(),
      exportTijdstip: new Date().toISOString(),
      reconstructieInstructie:
        'Bron-sheets bevatten de canonieke feiten; afgeleide sheets ' +
        '(Dashboard/Balans/W&V/BTW Aangifte) zijn berekenbaar uit Journaalposten ' +
        'volgens dubbel-boekhouden (debet=credit). Audit Log bevat een ' +
        'SHA-256 hash-keten in kolom Ketenhash voor tamper-evidence.',
      sheets: _BRON_SHEETS_NOAH_(),
    };
    const regels = [JSON.stringify(manifest)];

    const bronSheets = _BRON_SHEETS_NOAH_();
    for (var i = 0; i < bronSheets.length; i++) {
      const sheet = ss.getSheetByName(bronSheets[i]);
      if (!sheet) continue;     // sheet kan ontbreken in onvoltooide setup
      Array.prototype.push.apply(regels, _serialiseerSheetNaarJsonl_(sheet));
    }

    const inhoud = regels.join('\n') + '\n';
    backupMap.createFile(bestandsnaam, inhoud, 'application/x-ndjson');
    try { schrijfAuditLog_('NoahArkSnapshot',
      bestandsnaam + ' (' + regels.length + ' records, ' +
      Math.round(inhoud.length / 1024) + ' KB)'); } catch (_) {}

    // Retentie: 30 dagen, alleen NoahArk_*.jsonl prefix (raak xlsx niet aan).
    const grens = Date.now() - 30 * 86400000;
    const oudIt = backupMap.getFiles();
    while (oudIt.hasNext()) {
      const f = oudIt.next();
      if (f.getName().indexOf('NoahArk_') === 0 &&
          f.getDateCreated().getTime() < grens) {
        try { f.setTrashed(true); } catch (_) {}
      }
    }
  } catch (e) {
    Logger.log('maakNoahArkSnapshot_ fout: ' + e.message);
    safeAuditLog_('FOUT NoahArk', e.message);
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

// ─────────────────────────────────────────────
//  MAANDRAPPORT — automatisch op de 1e van de maand
// ─────────────────────────────────────────────
/**
 * Wordt elke 1e van de maand om 10:00 aangeroepen via time-trigger.
 * Genereert een PDF van het Dashboard voor de afgelopen maand en
 * mailt deze naar de eigenaar + (indien ingesteld) de accountant.
 *
 * Niet-fataal: faalt stil bij netwerk- of e-mail-problemen, met audit-log.
 */
function mailMaandrapport() {
  try {
    if (!controleerSetupGedaan_()) return;
    const ss = getSpreadsheet_();
    if (!ss) return;
    // OPT-IN: niet iedereen wil maandelijks PDF-rapport (dashboard volstaat
    // voor de meesten). Default Nee. Klant zet 'Ja' via Instellingen.
    // CYCLE-56: isJa_ helper voor consistente case-insensitive detectie
    const optActief = (typeof isJa_ === 'function') ? isJa_(getInstelling_('Email maandrapport')) : false;
    if (!optActief) {
      Logger.log('Maandrapport overgeslagen: opt-in niet actief (Email maandrapport=Nee)');
      return;
    }

    const nu = new Date();
    const vorigeMaand = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
    const eindeVorigeMaand = new Date(nu.getFullYear(), nu.getMonth(), 0);

    const eigenaar = getInstelling_('Email rapporten naar') || getInstelling_('Email');
    const accountantEmail = getInstelling_('Email accountant') || PropertiesService
      .getScriptProperties().getProperty(PROP.ACCOUNTANT_EMAIL);

    const ontvangers = [];
    if (eigenaar && isGeldigEmail_(eigenaar)) ontvangers.push(eigenaar);
    if (accountantEmail && isGeldigEmail_(accountantEmail) && ontvangers.indexOf(accountantEmail) === -1) {
      ontvangers.push(accountantEmail);
    }
    if (ontvangers.length === 0) {
      Logger.log('Maandrapport overgeslagen: geen geldig ontvanger-emailadres ingesteld');
      return;
    }

    const samenvatting = berekenMaandSamenvatting_(ss, vorigeMaand, eindeVorigeMaand);
    const bedrijf = getInstelling_('Bedrijfsnaam') || 'Mijn Bedrijf';
    const maandNaam = maandNaam_(vorigeMaand.getMonth() + 1);
    const jaar = vorigeMaand.getFullYear();

    const onderwerp = `📅 Maandrapport ${maandNaam} ${jaar} – ${bedrijf}`;
    const body = bouwMaandrapportBody_(bedrijf, maandNaam, jaar, samenvatting);

    // Probeer PDF van het Dashboard te exporteren
    let bijlagen = [];
    try {
      const pdfBlob = exporteerDashboardAlsPdf_(ss, `Maandrapport-${jaar}-${String(vorigeMaand.getMonth() + 1).padStart(2, '0')}.pdf`);
      if (pdfBlob) bijlagen.push(pdfBlob);
    } catch (e) {
      Logger.log('PDF-export mislukt, mail wordt zonder bijlage verstuurd: ' + e.message);
    }

    const opties = bijlagen.length > 0 ? { attachments: bijlagen, htmlBody: body.html } : { htmlBody: body.html };
    GmailApp.sendEmail(ontvangers.join(','), onderwerp, body.tekst, opties);

    schrijfAuditLog_('Maandrapport verzonden', `${maandNaam} ${jaar} → ${ontvangers.join(', ')}`);
    Logger.log('Maandrapport verstuurd naar: ' + ontvangers.join(', '));
  } catch (e) {
    Logger.log('mailMaandrapport FOUT: ' + e.message + '\n' + (e.stack || ''));
    safeAuditLog_('FOUT maandrapport', e.message);
  }
}

/**
 * Verzamelt de cijfers voor een specifieke maand-periode.
 * @param {Spreadsheet} ss
 * @param {Date} vanaf
 * @param {Date} totEnMet
 * @return {Object} samenvatting {omzet, kosten, netto, btwTeBetalen, openDeb, vervallen, facturen, kosten_rijen}
 */
function berekenMaandSamenvatting_(ss, vanaf, totEnMet) {
  const totEod = new Date(totEnMet.getFullYear(), totEnMet.getMonth(), totEnMet.getDate(), 23, 59, 59, 999);

  let omzetExcl = 0, btwOmzet = 0, omzetIncl = 0, aantalFacturen = 0;
  let kostenExcl = 0, btwVoorbelasting = 0, kostenIncl = 0, aantalKosten = 0;
  let openDebSaldo = 0, openDebAantal = 0;
  let vervallenAantal = 0, vervallenBedrag = 0;

  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (vfSheet && vfSheet.getLastRow() > 1) {
    const rows = vfSheet.getRange(2, 1, vfSheet.getLastRow() - 1, vfSheet.getLastColumn()).getValues();
    rows.forEach(function(r) {
      const datum = r[2] ? (r[2] instanceof Date ? r[2] : parseDatum_(r[2])) : null;
      const bedragExcl = Number(r[9]) || 0;
      const btw = Number(r[11]) || 0;
      const bedragIncl = Number(r[12]) || 0;
      const betaald = Number(r[13]) || 0;
      const status = String(r[14] || '');
      if (status === FACTUUR_STATUS.GECREDITEERD) return;
      if (datum && datum >= vanaf && datum <= totEod) {
        omzetExcl += bedragExcl;
        btwOmzet += btw;
        omzetIncl += bedragIncl;
        aantalFacturen++;
      }
      if (status === FACTUUR_STATUS.VERZONDEN || status === FACTUUR_STATUS.DEELS_BETAALD) {
        openDebSaldo += (bedragIncl - betaald);
        openDebAantal++;
      }
      if (status === FACTUUR_STATUS.VERVALLEN) {
        vervallenAantal++;
        vervallenBedrag += (bedragIncl - betaald);
      }
    });
  }

  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (ifSheet && ifSheet.getLastRow() > 1) {
    const rows = ifSheet.getRange(2, 1, ifSheet.getLastRow() - 1, ifSheet.getLastColumn()).getValues();
    rows.forEach(function(r) {
      const datum = r[3]
        ? (r[3] instanceof Date ? r[3] : parseDatum_(r[3]))
        : (r[2] ? (r[2] instanceof Date ? r[2] : parseDatum_(r[2])) : null);
      const bedragExcl = Number(r[8]) || 0;
      const btw = Number(r[10]) || 0;
      const bedragIncl = Number(r[11]) || 0;
      if (datum && datum >= vanaf && datum <= totEod) {
        kostenExcl += bedragExcl;
        btwVoorbelasting += btw;
        kostenIncl += bedragIncl;
        aantalKosten++;
      }
    });
  }

  return {
    omzetExcl: rondBedrag_(omzetExcl),
    btwOmzet: rondBedrag_(btwOmzet),
    omzetIncl: rondBedrag_(omzetIncl),
    aantalFacturen,
    kostenExcl: rondBedrag_(kostenExcl),
    btwVoorbelasting: rondBedrag_(btwVoorbelasting),
    kostenIncl: rondBedrag_(kostenIncl),
    aantalKosten,
    netto: rondBedrag_(omzetExcl - kostenExcl),
    btwSaldo: rondBedrag_(btwOmzet - btwVoorbelasting),
    openDebSaldo: rondBedrag_(openDebSaldo),
    openDebAantal,
    vervallenAantal,
    vervallenBedrag: rondBedrag_(vervallenBedrag),
  };
}

/**
 * Bouwt de e-mailbody voor het maandrapport — zowel HTML als plain-text.
 */
function bouwMaandrapportBody_(bedrijf, maandNaam, jaar, s) {
  const tekst =
    `Maandrapport ${maandNaam} ${jaar} – ${bedrijf}\n\n` +
    `OMZET\n` +
    `   ${s.aantalFacturen} factu${s.aantalFacturen === 1 ? 'ur' : 'ren'} verstuurd\n` +
    `   Excl. BTW:  ${formatBedrag_(s.omzetExcl)}\n` +
    `   BTW:        ${formatBedrag_(s.btwOmzet)}\n` +
    `   Incl. BTW:  ${formatBedrag_(s.omzetIncl)}\n\n` +
    `KOSTEN\n` +
    `   ${s.aantalKosten} uitgave${s.aantalKosten === 1 ? '' : 'n'} geboekt\n` +
    `   Excl. BTW:  ${formatBedrag_(s.kostenExcl)}\n` +
    `   BTW:        ${formatBedrag_(s.btwVoorbelasting)}\n` +
    `   Incl. BTW:  ${formatBedrag_(s.kostenIncl)}\n\n` +
    `NETTO RESULTAAT\n` +
    `   ${formatBedrag_(s.netto)}\n\n` +
    `BTW SALDO\n` +
    `   ${s.btwSaldo >= 0 ? 'Te betalen' : 'Te ontvangen'}: ${formatBedrag_(Math.abs(s.btwSaldo))}\n\n` +
    `OPENSTAANDE DEBITEUREN\n` +
    `   ${s.openDebAantal} factu${s.openDebAantal === 1 ? 'ur' : 'ren'}: ${formatBedrag_(s.openDebSaldo)}\n` +
    (s.vervallenAantal > 0 ? `   waarvan ${s.vervallenAantal} VERVALLEN: ${formatBedrag_(s.vervallenBedrag)}\n` : '') +
    `\nDit rapport is automatisch gegenereerd door Boekhoudbaar.\n` +
    `De PDF in de bijlage bevat het volledige dashboard.\n`;

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0D1B4E">` +
    `<h2 style="background:#0D1B4E;color:#fff;padding:16px;margin:0 0 16px 0;border-radius:8px 8px 0 0">📅 Maandrapport ${maandNaam} ${jaar}</h2>` +
    `<h3 style="color:#0D1B4E;margin:24px 0 8px 0">${bedrijf}</h3>` +
    `<table style="width:100%;border-collapse:collapse;margin:8px 0">` +
      `<tr><td style="padding:8px;background:#F7F9FC;font-weight:bold">📈 Omzet (${s.aantalFacturen} facturen)</td>` +
        `<td style="padding:8px;text-align:right;background:#F7F9FC"><strong>${formatBedrag_(s.omzetIncl)}</strong> incl. BTW</td></tr>` +
      `<tr><td style="padding:8px">Waarvan BTW</td>` +
        `<td style="padding:8px;text-align:right;color:#666">${formatBedrag_(s.btwOmzet)}</td></tr>` +
      `<tr><td style="padding:8px;background:#F7F9FC;font-weight:bold">📉 Kosten (${s.aantalKosten} uitgaven)</td>` +
        `<td style="padding:8px;text-align:right;background:#F7F9FC"><strong>${formatBedrag_(s.kostenIncl)}</strong> incl. BTW</td></tr>` +
      `<tr><td style="padding:8px">Voorbelasting</td>` +
        `<td style="padding:8px;text-align:right;color:#666">${formatBedrag_(s.btwVoorbelasting)}</td></tr>` +
      `<tr><td style="padding:12px;background:#2EC4B6;color:#fff;font-weight:bold;font-size:16px">💰 Netto resultaat</td>` +
        `<td style="padding:12px;text-align:right;background:#2EC4B6;color:#fff;font-weight:bold;font-size:16px">${formatBedrag_(s.netto)}</td></tr>` +
      `<tr><td style="padding:8px;background:#F7F9FC">BTW saldo (${s.btwSaldo >= 0 ? 'te betalen' : 'te ontvangen'})</td>` +
        `<td style="padding:8px;text-align:right;background:#F7F9FC">${formatBedrag_(Math.abs(s.btwSaldo))}</td></tr>` +
    `</table>` +
    (s.openDebAantal > 0 ?
      `<div style="background:#FDF6E3;border-left:4px solid #F5B800;padding:12px;margin:16px 0">` +
      `📥 <strong>${s.openDebAantal} openstaande factu${s.openDebAantal === 1 ? 'ur' : 'ren'}</strong>: ${formatBedrag_(s.openDebSaldo)}` +
      (s.vervallenAantal > 0 ? `<br>⚠️ Waarvan <strong>${s.vervallenAantal} vervallen</strong>: ${formatBedrag_(s.vervallenBedrag)}` : '') +
      `</div>` : '') +
    `<p style="color:#666;font-size:12px;margin-top:24px">Dit rapport is automatisch gegenereerd door Boekhoudbaar. De PDF-bijlage bevat het volledige dashboard.</p>` +
    `</div>`;

  return { tekst, html };
}

/**
 * Exporteert het Dashboard-tabblad als PDF-blob.
 *
 * @param {Spreadsheet} ss
 * @param {string} bestandsnaam
 * @return {Blob|null}
 */
function exporteerDashboardAlsPdf_(ss, bestandsnaam) {
  try {
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (!dash) return null;

    const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
      'format=pdf' +
      '&gid=' + dash.getSheetId() +
      '&size=A4' +
      '&portrait=true' +
      '&fitw=true' +
      '&top_margin=0.50' +
      '&bottom_margin=0.50' +
      '&left_margin=0.50' +
      '&right_margin=0.50' +
      '&sheetnames=false' +
      '&printtitle=false' +
      '&pagenumbers=true' +
      '&gridlines=false' +
      '&fzr=false';

    const token = ScriptApp.getOAuthToken();
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('PDF export niet beschikbaar (HTTP ' + resp.getResponseCode() + ')');
      return null;
    }
    return resp.getBlob().setName(bestandsnaam);
  } catch (e) {
    Logger.log('exporteerDashboardAlsPdf_ fout: ' + e.message);
    return null;
  }
}

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
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px}
      .form-row{margin:8px 0}
      label{display:block;font-weight:bold;margin-bottom:3px;font-size:12px}
      input,textarea{width:100%;padding:7px;border:1px solid #ccc;border-radius:4px;font-size:13px}
      .btn{background:#1A237E;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;width:100%;margin-top:10px}
      .info{background:#E8EAF6;padding:8px;border-radius:4px;font-size:11px;margin-bottom:12px}
    </style>
    <h3>📧 Samenvatting naar accountant e-mailen</h3>
    <div class="info">Er wordt een tekstsamenvatting gemaild — geen persoonlijke financiële gegevens zonder uw toestemming.</div>
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
  const jaar    = new Date().getFullYear();
  const kg      = berekenKengetallen_(ss);

  MailApp.sendEmail({
    to: emailAccountant,
    subject: `Financieel overzicht ${bedrijf} — ${jaar}`,
    htmlBody: `
      <html><body style="font-family:Arial,sans-serif;max-width:600px;color:#333">
        <div style="background:#1A237E;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">📊 ${bedrijf}</h2>
          <p style="color:#C5CAE9;margin:4px 0 0">Financieel overzicht ${jaar}</p>
        </div>
        <div style="padding:20px;border:1px solid #eee;border-top:none;background:#fafafa">
          ${persoonlijkBericht ? `<p style="background:#E8EAF6;padding:12px;border-radius:4px">${escHtml_(persoonlijkBericht)}</p>` : ''}
          <h3>Samenvatting</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#E8EAF6"><td style="padding:8px;font-weight:bold">Omzet (YTD)</td><td style="padding:8px;text-align:right">${formatBedrag_(kg.omzet)}</td></tr>
            <tr><td style="padding:8px">Kosten (YTD)</td><td style="padding:8px;text-align:right">${formatBedrag_(kg.kosten)}</td></tr>
            <tr style="background:#E8F5E9;font-weight:bold"><td style="padding:8px">Nettowinst</td><td style="padding:8px;text-align:right">${formatBedrag_(kg.nettowinst)}</td></tr>
            <tr><td style="padding:8px">Banksaldo</td><td style="padding:8px;text-align:right">${formatBedrag_(kg.banksaldo)}</td></tr>
            <tr><td style="padding:8px">Open debiteuren</td><td style="padding:8px;text-align:right">${formatBedrag_(kg.debiteuren)}</td></tr>
          </table>
          <p style="font-size:11px;color:#888;margin-top:16px">
            Gegenereerd via Boekhouding Engine op ${formatDatumTijd_(new Date())}.
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
Boekhouding Engine — ${bedrijf} — Boekjaar ${jaar}
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

Gegenereerd via Boekhouding Engine op ${formatDatumTijd_(new Date())}.
`;
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
      // CSV escaping: omsluit met quotes als het komma's, quotes of newlines bevat
      if (waarde.includes(',') || waarde.includes('"') || waarde.includes('\n')) {
        waarde = '"' + waarde.replace(/"/g, '""') + '"';
      }
      return waarde;
    }).join(',')
  ).join('\n');
}

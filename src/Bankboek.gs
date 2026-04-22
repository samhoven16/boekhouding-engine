/**
 * Bankboek.gs
 * Bankrekening administratie, saldo-overzichten en reconciliatie.
 */

// ─────────────────────────────────────────────
//  BANKSALDO BEREKENEN
// ─────────────────────────────────────────────
function getBanksaldo_(ss, rekeningCode) {
  rekeningCode = rekeningCode || '1200';
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const data = sheet.getDataRange().getValues();
  let saldo = 0;

  for (let i = 1; i < data.length; i++) {
    const rekening = String(data[i][5] || '');
    if (rekening !== String(rekeningCode)) continue;
    saldo += parseFloat(data[i][3]) || 0;
  }

  return rondBedrag_(saldo);
}

// ─────────────────────────────────────────────
//  KASBOEK
// ─────────────────────────────────────────────
function getKassaldo_(ss) {
  return getBanksaldo_(ss, '1210');
}

// ─────────────────────────────────────────────
//  BANKAFSTEMMING (RECONCILIATIE)
// ─────────────────────────────────────────────
function bankAfstemming() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();

  const resp = ui.prompt(
    'Bankafstemming',
    'Voer het werkelijke eindsaldo in van uw bankafschrift (bijv. 12345.67):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const werkelijkSaldo = parseBedrag_(resp.getResponseText());
  const boekhoudSaldo = getBanksaldo_(ss, '1200');
  const verschil = rondBedrag_(werkelijkSaldo - boekhoudSaldo);

  let bericht = `Bankafstemming resultaten:\n\n`;
  bericht += `Boekhoudkundig saldo (1200): ${formatBedrag_(boekhoudSaldo)}\n`;
  bericht += `Werkelijk banksaldo:          ${formatBedrag_(werkelijkSaldo)}\n`;
  bericht += `Verschil:                     ${formatBedrag_(verschil)}\n\n`;

  if (Math.abs(verschil) < 0.01) {
    bericht += '✓ Banksaldo klopt! Geen correctie nodig.';
  } else {
    bericht += `⚠ Er is een verschil van ${formatBedrag_(verschil)}.\n`;
    bericht += 'Controleer of alle transacties zijn ingevoerd.';
  }

  ui.alert('Bankafstemming', bericht, ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  BANKTRANSACTIE HANDMATIG AANMAKEN
// ─────────────────────────────────────────────
function maakHandmatigeBankTransactie_(ss, opt) {
  const transactieId = volgendTransactieId_();
  const rij = [
    transactieId,
    opt.datum || new Date(),
    opt.omschr || '',
    opt.bedrag || 0,
    opt.type || 'Betaling (af)',
    opt.rekening || '1200',
    opt.tegenrekening || '',
    opt.tegenpartij || '',
    opt.referentie || '',
    opt.grootboek || '',
    '', '',
    'Handmatig',
    opt.notities || '',
    new Date(),
  ];
  ss.getSheetByName(SHEETS.BANKTRANSACTIES).appendRow(rij);
  return transactieId;
}

// ─────────────────────────────────────────────
//  MUTATIEOVERZICHT PER PERIODE
// ─────────────────────────────────────────────
function getMutaties_(ss, rekeningCode, vanDatum, totDatum) {
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const data = sheet.getDataRange().getValues();
  const mutaties = [];

  for (let i = 1; i < data.length; i++) {
    const rekening = String(data[i][5] || '');
    if (rekening !== String(rekeningCode)) continue;

    const datum = data[i][1] ? new Date(data[i][1]) : null;
    if (datum && vanDatum && datum < vanDatum) continue;
    if (datum && totDatum && datum > totDatum) continue;

    mutaties.push({
      id: data[i][0],
      datum,
      omschr: data[i][2],
      bedrag: parseFloat(data[i][3]) || 0,
      type: data[i][4],
      ref: data[i][8],
      status: data[i][12],
    });
  }

  return mutaties;
}

// ─────────────────────────────────────────────
//  PRIVÉ / ZAKELIJK CORRECTIE
// ─────────────────────────────────────────────
function boekPriveCorrectie() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 6px}
      p{color:#5A6478;line-height:1.55;margin:0 0 12px}
      label{display:block;margin-top:10px;font-weight:600;font-size:12px;color:#0D1B4E}
      input,select{width:100%;padding:8px 10px;margin-top:4px;border:1px solid #E5EAF2;
                   border-radius:6px;font-size:13px;font-family:inherit;color:#1A1A1A;
                   background:#fff;transition:border-color 0.15s}
      input:focus,select:focus{outline:none;border-color:#2EC4B6}
      .btn{background:#0D1B4E;color:white;padding:10px 18px;border:none;border-radius:6px;
           cursor:pointer;margin-top:14px;font-size:13px;font-weight:600;font-family:inherit;
           transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 16px;
               border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
               font-family:inherit;margin-left:8px;margin-top:14px;transition:background 0.15s}
      .btn-sec:hover{background:#EEF2F8}
    </style>
    <h3>Privé / zakelijk correctie</h3>
    <p>Gebruik dit voor privé-onttrekkingen of privé-stortingen.</p>
    <form id="f">
      <label>Type
        <select name="type" id="type">
          <option value="storting">Privé storting (geld in bedrijf)</option>
          <option value="onttrekking">Privé onttrekking (geld uit bedrijf)</option>
        </select>
      </label>
      <label>Datum <input type="date" name="datum" required></label>
      <label>Bedrag (€) <input type="number" name="bedrag" step="0.01" min="0" required></label>
      <label>Omschrijving <input type="text" name="omschr" value="Privé"></label>
      <br>
      <button type="button" class="btn" onclick="submit_()">Boeken</button>
      <button type="button" class="btn-sec" onclick="google.script.host.close()">Annuleren</button>
    </form>
    <script>
      function submit_() {
        const f = document.getElementById('f');
        const data = Object.fromEntries(new FormData(f));
        google.script.run
          .withSuccessHandler(() => { alert('Geboekt!'); google.script.host.close(); })
          .verwerkPriveCorrectie(data);
      }
    </script>
  `).setWidth(400).setHeight(320);
  ui.showModalDialog(html, 'Privé correctie');
}

function verwerkPriveCorrectie(data) {
  const ss = getSpreadsheet_();
  const bedrag = parseBedrag_(data.bedrag);
  const datum = parseDatum_(data.datum);
  const isStorting = data.type === 'storting';

  // Storting: Bank debet | Privéstortingen credit
  // Onttrekking: Privéonttrekkingen debet | Bank credit
  maakJournaalpost_(ss, {
    datum,
    omschr: data.omschr || (isStorting ? 'Privé storting' : 'Privé onttrekking'),
    dagboek: 'Privé',
    debet: isStorting ? '1200' : '2400',
    credit: isStorting ? '2300' : '1200',
    bedrag,
    type: BOEKING_TYPE.MEMORIAAL,
  });

  vernieuwDashboard();
}

// ─────────────────────────────────────────────
//  DGA REKENING-COURANT
// ─────────────────────────────────────────────
function boekDgaTransactie(isOpname, bedrag, omschr) {
  const ss = getSpreadsheet_();
  const datum = new Date();

  // Opname: RC DGA debet | Bank credit
  // Storting: Bank debet | RC DGA credit
  maakJournaalpost_(ss, {
    datum,
    omschr: omschr || (isOpname ? 'DGA opname' : 'DGA storting'),
    dagboek: 'Privé',
    debet: isOpname ? '4500' : '1200',
    credit: isOpname ? '1200' : '4500',
    bedrag,
    type: BOEKING_TYPE.MEMORIAAL,
  });
}

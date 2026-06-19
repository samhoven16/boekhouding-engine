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
    const rekening = String(data[i][KOL.BT.rekening] || '');
    if (rekening !== String(rekeningCode)) continue;
    saldo += parseFloat(data[i][KOL.BT.bedrag]) || 0;
  }

  return rondBedrag_(saldo);
}

// ─────────────────────────────────────────────
//  BANKAFSTEMMING (RECONCILIATIE)
// ─────────────────────────────────────────────
function bankAfstemming() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();

  const resp = ui.prompt(
    'Bankafstemming',
    'Voer het werkelijke eindsaldo in van uw bankafschrift (bijv. 12345,67 of -250,00):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  // CYCLE-25: strikte input-validatie. Vroeger viel parseBedrag_ silent
  // terug op 0 bij garbage of lege input → 'Verschil: -€1234,56' alert
  // die suggereerde dat klant €1234,56 in de min stond (terwijl er gewoon
  // niets was ingevuld). Klant kreeg paniek-moment ipv duidelijke fout.
  const ruwe = String(resp.getResponseText() || '').trim();
  if (!ruwe) {
    ui.alert('Bankafstemming', 'U heeft geen bedrag ingevoerd. Annuleer of vul het werkelijke banksaldo in.', ui.ButtonSet.OK);
    return;
  }
  let werkelijkSaldo;
  try {
    werkelijkSaldo = (typeof parseBedragStrict_ === 'function')
      ? parseBedragStrict_(ruwe, 'Werkelijk banksaldo')
      : parseBedrag_(ruwe);
  } catch (err) {
    ui.alert('Bankafstemming', String(err && err.message ? err.message : err), ui.ButtonSet.OK);
    return;
  }
  if (!isFinite(werkelijkSaldo)) {
    ui.alert('Bankafstemming', 'Het ingevoerde bedrag "' + ruwe.slice(0, 40) + '" is geen geldig getal.', ui.ButtonSet.OK);
    return;
  }

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
      <button type="button" class="btn" id="btnBoeken">Boeken</button>
      <button type="button" class="btn-sec" id="btnAnnuleren">Annuleren</button>
    </form>
    <script>
      function submit_() {
        const f = document.getElementById('f');
        const data = Object.fromEntries(new FormData(f));
        google.script.run
          .withSuccessHandler(() => { alert('Geboekt!'); google.script.host.close(); })
          .withFailureHandler((e) => alert('⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Controleer je invoer en probeer opnieuw.')))
          .verwerkPriveCorrectie(data);
      }
      document.addEventListener('DOMContentLoaded', function() {
        var b = document.getElementById('btnBoeken');
        if (b) b.addEventListener('click', function(e){ e.preventDefault(); submit_(); });
        var a = document.getElementById('btnAnnuleren');
        if (a) a.addEventListener('click', function(){ try { google.script.host.close(); } catch (_) {} });
      });
    </script>
  `).setWidth(400).setHeight(320).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  ui.showModalDialog(html, 'Privé correctie');
}

function verwerkPriveCorrectie(data) {
  const ss = getSpreadsheet_();
  // Strict parsing — geen silent fallback; klant ziet exact wat fout is
  const bedrag = parseBedragStrict_(data.bedrag, 'Bedrag');
  const datum  = parseDatumStrict_(data.datum, 'Datum');
  const isStorting = data.type === 'storting';

  if (!(bedrag > 0)) throw new Error('Bedrag moet groter zijn dan €0,00.');

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
  const bedragNum = parseBedragStrict_(bedrag, 'DGA-bedrag');
  if (!(bedragNum > 0)) throw new Error('DGA-bedrag moet groter zijn dan €0,00.');

  // Opname: RC DGA debet | Bank credit
  // Storting: Bank debet | RC DGA credit
  maakJournaalpost_(ss, {
    datum,
    omschr: omschr || (isOpname ? 'DGA opname' : 'DGA storting'),
    dagboek: 'Privé',
    debet: isOpname ? '4500' : '1200',
    credit: isOpname ? '1200' : '4500',
    bedrag: bedragNum,
    type: BOEKING_TYPE.MEMORIAAL,
  });
}

/**
 * Prive.gs
 * Privé financiën naast zakelijke boekhouding.
 *
 * KANS: "Prive gebruik" — systeem werkt ook voor particulieren zonder bedrijf.
 * KANS: "Extreme eenvoud" — privé is eenvoudiger dan zakelijk, dat moet voelbaar zijn.
 *
 * WAT DIT BIEDT:
 *  1. Privé inkomsten/uitgaven bijhouden (budget vs. werkelijk)
 *  2. IB aangifte helper: Box 1 / Box 2 / Box 3 schatting
 *  3. Vermogensoverzicht (spaargeld, beleggingen, eigen woning)
 *  4. Scheiding zakelijk ↔ privé (voor ZZP die beide bijhoudt)
 *
 * MODUS:
 *  - "Zakelijk"  → normale boekhoudmodus (standaard)
 *  - "Privé"     → vereenvoudigde modus zonder BTW/facturen
 *  - "ZZP combi" → beide naast elkaar
 */

const PRIVE_TAB    = 'Privé Financiën';
const VERMOGEN_TAB = 'Vermogensoverzicht';

// ─────────────────────────────────────────────
//  PRIVÉ DASHBOARD OPENEN
// ─────────────────────────────────────────────

function openPriveDashboard() {
  const ss = getSpreadsheet_();
  maakPriveTabbladen_(ss);
  vernieuwPriveDashboard_(ss);
  ss.setActiveSheet(ss.getSheetByName(PRIVE_TAB));
}

function maakPriveTabbladen_(ss) {
  if (!ss.getSheetByName(PRIVE_TAB)) {
    const sheet = ss.insertSheet(PRIVE_TAB);
    sheet.setTabColor('#6A1B9A');
    zetPriveHeaders_(sheet);
  }
  if (!ss.getSheetByName(VERMOGEN_TAB)) {
    const sheet = ss.insertSheet(VERMOGEN_TAB);
    sheet.setTabColor('#4A148C');
  }
}

function zetPriveHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  const headers = [
    'Datum', 'Omschrijving', 'Categorie', 'Bedrag', 'Type', 'Rekening', 'Notities'
  ];
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setBackground('#6A1B9A').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 160);
}

// ─────────────────────────────────────────────
//  PRIVÉ TRANSACTIE TOEVOEGEN (dialoog)
// ─────────────────────────────────────────────

function voegPriveTransactieToe() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px}
      h3{color:#6A1B9A;margin-bottom:10px}
      .form-row{margin:7px 0}
      label{display:block;font-weight:bold;margin-bottom:3px;font-size:12px}
      input,select{width:100%;padding:7px;border:1px solid #ccc;border-radius:4px;font-size:13px}
      .row2{display:flex;gap:8px}
      .row2 .form-row{flex:1}
      .btn{background:#6A1B9A;color:white;border:none;padding:10px 20px;border-radius:4px;
           cursor:pointer;font-size:14px;width:100%;margin-top:10px}
      .btn:hover{background:#7B1FA2}
      .tip{background:#F3E5F5;padding:8px;border-radius:4px;font-size:11px;margin-bottom:10px}
    </style>
    <h3>🏠 Privé transactie invoeren</h3>
    <div class="tip">💡 Gebruik dit voor persoonlijke uitgaven en inkomsten — los van uw bedrijf.</div>

    <div class="row2">
      <div class="form-row">
        <label>Type</label>
        <select id="type" onchange="updateCategorieen()">
          <option value="Uitgave">Uitgave</option>
          <option value="Inkomst">Inkomst</option>
        </select>
      </div>
      <div class="form-row">
        <label>Datum</label>
        <input type="date" id="datum" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>

    <div class="form-row">
      <label>Omschrijving</label>
      <input type="text" id="omschr" placeholder="Bijv. 'Boodschappen Albert Heijn'">
    </div>

    <div class="row2">
      <div class="form-row">
        <label>Categorie</label>
        <select id="categorie">
          <option>Boodschappen</option>
          <option>Huur / Hypotheek</option>
          <option>Energie & Water</option>
          <option>Verzekeringen</option>
          <option>Zorgkosten</option>
          <option>Transport</option>
          <option>Kleding</option>
          <option>Restaurants & Uit eten</option>
          <option>Entertainment & Vrije tijd</option>
          <option>Abonnementen (Netflix etc.)</option>
          <option>Sport & Hobby</option>
          <option>Reizen & Vakantie</option>
          <option>Kinderen</option>
          <option>Onderwijs</option>
          <option>Sparen / Beleggen</option>
          <option>Belasting</option>
          <option>Salaris</option>
          <option>Toeslagen / Uitkeringen</option>
          <option>Overig</option>
        </select>
      </div>
      <div class="form-row">
        <label>Bedrag (€)</label>
        <input type="number" id="bedrag" step="0.01" min="0" placeholder="0.00">
      </div>
    </div>

    <div class="form-row">
      <label>Rekening</label>
      <select id="rekening">
        <option value="Betaalrekening">Betaalrekening</option>
        <option value="Spaarrekening">Spaarrekening</option>
        <option value="Contant">Contant</option>
        <option value="Creditcard">Creditcard</option>
      </select>
    </div>

    <button class="btn" onclick="opslaan()">Opslaan</button>
    <div id="status" style="margin-top:8px;color:green;display:none"></div>

    <script>
      function opslaan() {
        var d = {
          datum:    document.getElementById('datum').value,
          omschr:   document.getElementById('omschr').value.trim(),
          categorie:document.getElementById('categorie').value,
          bedrag:   parseFloat(document.getElementById('bedrag').value),
          type:     document.getElementById('type').value,
          rekening: document.getElementById('rekening').value,
        };
        if (!d.omschr || isNaN(d.bedrag) || d.bedrag <= 0) {
          alert('Vul omschrijving en bedrag in.'); return;
        }
        document.querySelector('.btn').disabled = true;
        google.script.run
          .withSuccessHandler(function(){
            var el = document.getElementById('status');
            el.style.display = 'block';
            el.textContent = '✓ Opgeslagen!';
            setTimeout(function(){ google.script.host.close(); }, 1200);
          })
          .opslaanPriveTransactie(d);
      }
    </script>
  `).setWidth(460).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, 'Privé transactie');
}

function opslaanPriveTransactie(data) {
  const ss = getSpreadsheet_();
  maakPriveTabbladen_(ss);
  const sheet = ss.getSheetByName(PRIVE_TAB);
  const bedrag = data.type === 'Uitgave'
    ? -Math.abs(parseFloat(data.bedrag) || 0)
    :  Math.abs(parseFloat(data.bedrag) || 0);

  sheet.appendRow([
    data.datum ? new Date(data.datum) : new Date(),
    data.omschr,
    data.categorie,
    bedrag,
    data.type,
    data.rekening || 'Betaalrekening',
    '',
  ]);

  const rij = sheet.getLastRow();
  sheet.getRange(rij, 1).setNumberFormat('dd-mm-yyyy');
  sheet.getRange(rij, 4).setNumberFormat('€#,##0.00');
  if (bedrag < 0) sheet.getRange(rij, 4).setFontColor('#C62828');
  else            sheet.getRange(rij, 4).setFontColor('#1B5E20');
}

// ─────────────────────────────────────────────
//  PRIVÉ DASHBOARD VERNIEUWEN
// ─────────────────────────────────────────────

function vernieuwPriveDashboard_(ss) {
  const sheet = ss.getSheetByName(PRIVE_TAB);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Alleen headers

  const vandaag = new Date();
  const huidigeM = vandaag.getMonth();
  const huidigeJ = vandaag.getFullYear();

  let inkomstenMaand = 0, uitgavenMaand = 0;
  let inkomstenJaar  = 0, uitgavenJaar  = 0;
  const perCategorie = {};

  for (let i = 1; i < data.length; i++) {
    const datum  = data[i][0] ? new Date(data[i][0]) : null;
    const bedrag = parseFloat(data[i][3]) || 0;
    const cat    = String(data[i][2] || 'Overig');
    if (!datum) continue;

    if (datum.getFullYear() === huidigeJ) {
      if (bedrag > 0) inkomstenJaar  += bedrag;
      else            uitgavenJaar   += Math.abs(bedrag);
      if (datum.getMonth() === huidigeM) {
        if (bedrag > 0) inkomstenMaand += bedrag;
        else            uitgavenMaand  += Math.abs(bedrag);
      }
      perCategorie[cat] = (perCategorie[cat] || 0) + Math.abs(bedrag);
    }
  }

  // Toon toast met maandoverzicht
  const saldo = inkomstenMaand - uitgavenMaand;
  try {
    ss.toast(
      `Deze maand: +${formatBedrag_(inkomstenMaand)} inkomsten, -${formatBedrag_(uitgavenMaand)} uitgaven = ${saldo >= 0 ? '+' : ''}${formatBedrag_(saldo)}`,
      '🏠 Privé overzicht',
      6
    );
  } catch(e) {}
}

// ─────────────────────────────────────────────
//  IB AANGIFTE HELPER (Box 1 / 2 / 3)
// ─────────────────────────────────────────────

/**
 * Berekent een schatting van de inkomstenbelasting op basis van:
 *  - Box 1: Werk en woning (salaris, ZZP-winst, hypotheekrente aftrek)
 *  - Box 2: Aanmerkelijk belang (dividend uit BV)
 *  - Box 3: Sparen en beleggen (vermogen > heffingsvrij)
 */
function openIbAangifteHelper() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px;max-width:500px}
      h3{color:#6A1B9A;margin-bottom:4px}
      h4{color:#4A148C;margin:14px 0 6px;font-size:13px}
      .form-row{margin:6px 0}
      label{display:block;font-size:12px;color:#555;margin-bottom:2px}
      input{width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:13px}
      .box{background:#F3E5F5;padding:10px;border-radius:6px;margin:10px 0}
      .box2{background:#EDE7F6;padding:10px;border-radius:6px;margin:10px 0}
      .box3{background:#E8EAF6;padding:10px;border-radius:6px;margin:10px 0}
      .btn{background:#6A1B9A;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;width:100%;margin-top:10px}
      .resultaat{margin-top:12px;padding:12px;border-radius:6px;font-size:13px;display:none}
      .info{font-size:10px;color:#888;margin-top:2px}
    </style>
    <h3>🧾 IB Aangifte Schatting 2025</h3>
    <p style="font-size:11px;color:#888">Snelle schatting — niet voor officiële aangifte. Raadpleeg een belastingadviseur voor definitieve berekening.</p>

    <div class="box">
      <h4>📦 Box 1 — Inkomen uit werk en woning</h4>
      <div class="form-row">
        <label>Bruto salaris / ZZP-winst (€/jaar)</label>
        <input type="number" id="b1inkomen" placeholder="0" step="100">
      </div>
      <div class="form-row">
        <label>Aftrekposten Box 1 (hypotheekrente, zelfstandigenaftrek etc.)</label>
        <input type="number" id="b1aftrek" placeholder="0" step="100">
        <div class="info">ZZP: vul zelfstandigenaftrek + MKB-winstvrijstelling in. Thuiswerkers: €2,40/dag.</div>
      </div>
    </div>

    <div class="box2">
      <h4>📦 Box 2 — Aanmerkelijk belang (BV-dividend)</h4>
      <div class="form-row">
        <label>Dividend ontvangen uit eigen BV (€)</label>
        <input type="number" id="b2dividend" placeholder="0" step="100">
        <div class="info">Alleen als u ≥5% aandeelhouder bent. Tarief 2025: 24,5% t/m €67.000, daarboven 33%.</div>
      </div>
    </div>

    <div class="box3">
      <h4>📦 Box 3 — Sparen en beleggen</h4>
      <div class="form-row">
        <label>Totaal vermogen op 1 januari (spaargeld + beleggingen + 2e woning)</label>
        <input type="number" id="b3vermogen" placeholder="0" step="1000">
      </div>
      <div class="form-row">
        <label>Schulden die aftrekbaar zijn in Box 3 (boven €3.400 drempel)</label>
        <input type="number" id="b3schulden" placeholder="0" step="100">
        <div class="info">Heffingsvrij 2025: €57.000 per persoon (€114.000 fiscaal partners).</div>
      </div>
    </div>

    <button class="btn" onclick="bereken()">Berekenen</button>

    <div class="resultaat" id="resultaat"></div>

    <script>
      function bereken() {
        var b1i = parseFloat(document.getElementById('b1inkomen').value)  || 0;
        var b1a = parseFloat(document.getElementById('b1aftrek').value)   || 0;
        var b2d = parseFloat(document.getElementById('b2dividend').value) || 0;
        var b3v = parseFloat(document.getElementById('b3vermogen').value) || 0;
        var b3s = parseFloat(document.getElementById('b3schulden').value) || 0;

        // Box 1
        var b1belastbaar = Math.max(0, b1i - b1a);
        var b1belasting = 0;
        var grens1 = 76817;
        if (b1belastbaar <= grens1) {
          b1belasting = b1belastbaar * 0.3582;
        } else {
          b1belasting = grens1 * 0.3582 + (b1belastbaar - grens1) * 0.495;
        }
        // Heffingskorting (vereenvoudigd)
        var heffingskorting = Math.min(3068, b1belasting);
        b1belasting = Math.max(0, b1belasting - heffingskorting);

        // Box 2
        var b2belasting = 0;
        if (b2d > 0) {
          var grens2 = 67000;
          if (b2d <= grens2) b2belasting = b2d * 0.245;
          else b2belasting = grens2 * 0.245 + (b2d - grens2) * 0.33;
        }

        // Box 3 (forfaitair rendement 2025: spaargeld 1,44%, overig 6,04%)
        var heffingsvrij = 57000;
        var b3grondslag = Math.max(0, b3v - b3s - heffingsvrij);
        var b3rendement = b3grondslag * 0.0644; // Gewogen gemiddelde 2025
        var b3belasting = b3rendement * 0.36;   // 36% over fictief rendement

        var totaal = b1belasting + b2belasting + b3belasting;

        var fmt = function(n) { return '€' + n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.').replace('.', ',').replace(/(,\\d{2})(.*)/,'$1'); };

        var html = '<h4 style="color:#1B5E20">Schatting inkomstenbelasting 2025</h4>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<tr style="background:#F3E5F5"><td>Box 1 (na heffingskorting)</td><td align=right><b>' + fmt(b1belasting) + '</b></td></tr>' +
          (b2d > 0 ? '<tr style="background:#EDE7F6"><td>Box 2 (aanmerkelijk belang)</td><td align=right><b>' + fmt(b2belasting) + '</b></td></tr>' : '') +
          (b3grondslag > 0 ? '<tr style="background:#E8EAF6"><td>Box 3 (grondslag ' + fmt(b3grondslag) + ')</td><td align=right><b>' + fmt(b3belasting) + '</b></td></tr>' : '') +
          '<tr style="background:#1B5E20;color:white"><td><b>TOTAAL GESCHAT</b></td><td align=right><b>' + fmt(totaal) + '</b></td></tr>' +
          '</table>' +
          '<p style="font-size:10px;color:#888;margin-top:8px">Bron: belastingtarieven 2025. Dit is een globale schatting zonder rekening met toeslagen, voorlopige aanslag of persoonlijke aftrekposten.</p>';

        var el = document.getElementById('resultaat');
        el.style.display = 'block';
        el.style.background = '#E8F5E9';
        el.innerHTML = html;
      }
    </script>
  `).setWidth(520).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, '🧾 IB Aangifte Schatting');
}

// ─────────────────────────────────────────────
//  VERMOGENSOVERZICHT (Box 3 hulp)
// ─────────────────────────────────────────────

function beheerVermogensoverzicht() {
  const ss = getSpreadsheet_();
  maakPriveTabbladen_(ss);
  const sheet = ss.getSheetByName(VERMOGEN_TAB);

  if (sheet.getLastRow() === 0) {
    // Initieel invullen met categorieën
    const headers = ['Categorie', 'Omschrijving', 'Waarde (€)', 'Peildatum', 'Notities'];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#4A148C').setFontColor('#FFFFFF').setFontWeight('bold');

    const voorbeeldRijen = [
      ['Betaalrekening',  'ING rekening',      0, new Date('2025-01-01'), ''],
      ['Spaarrekening',   'ING spaarrekening', 0, new Date('2025-01-01'), ''],
      ['Beleggingen',     'DeGiro portefeuille',0,new Date('2025-01-01'), ''],
      ['Eigen woning WOZ','WOZ-waarde woning', 0, new Date('2025-01-01'), 'Alleen in Box 3 als 2e woning'],
      ['Hypotheekschuld', 'Hypotheek bank',    0, new Date('2025-01-01'), 'Negatief bedrag'],
      ['Overig',          '',                  0, new Date('2025-01-01'), ''],
    ];
    sheet.getRange(2, 1, voorbeeldRijen.length, 5).setValues(voorbeeldRijen);
    sheet.getRange(2, 3, voorbeeldRijen.length, 1).setNumberFormat('€#,##0.00');
    sheet.getRange(2, 4, voorbeeldRijen.length, 1).setNumberFormat('dd-mm-yyyy');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 200);
    sheet.setFrozenRows(1);

    SpreadsheetApp.getUi().toast(
      'Vul uw vermogen in op peildatum 1 januari. Dit is nodig voor uw Box 3 berekening.',
      '💼 Vermogensoverzicht aangemaakt', 5
    );
  }

  ss.setActiveSheet(sheet);

  // Bereken Box 3 totaal
  const data = sheet.getDataRange().getValues();
  let totaal = 0;
  for (let i = 1; i < data.length; i++) {
    totaal += parseFloat(data[i][2]) || 0;
  }
  const heffingsvrij = 57000;
  const grondslag = Math.max(0, totaal - heffingsvrij);

  ss.toast(
    `Totaal vermogen: ${formatBedrag_(totaal)}  |  Box 3 grondslag (na heffingsvrij €57.000): ${formatBedrag_(grondslag)}`,
    '💼 Vermogensoverzicht', 8
  );
}

/**
 * HerhalendeKosten.gs
 * Beheer van terugkerende kosten en abonnementen.
 *
 * Adresseert pijnpunten van concurrenten:
 *  - Spendesk/Pleo: "expense control" — abonnementen overzicht
 *  - Expensya/Rydoo: "UI issues" — wij houden het simpel
 *  - Chargebee/Recurly: "duur/complex voor SaaS" — wij bieden een eenvoudige alternatief
 *
 * HOE HET WERKT:
 *  1. Gebruiker registreert een herhalende kost (bijv. kantoorhuur, software-abonnement)
 *  2. Systeem herinnert via dashboard-waarschuwing als de kost binnenkort vervalt
 *  3. Bij automatisch boeken: journaalpost wordt aangemaakt
 *
 * TABBLAD: 'Herhalende Kosten' (automatisch aangemaakt)
 * KOLOMMEN: ID | Naam | Leverancier | Bedrag | Freq. | Volgende datum | Rekening | Status | Notities
 */

const HERHALENDE_TAB = 'Herhalende Kosten';

// ─────────────────────────────────────────────
//  MENU-ENTRY PUNT
// ─────────────────────────────────────────────

function beheerHerhalendeKosten() {
  const ss = getSpreadsheet_();
  // Zorg dat tabblad bestaat
  let sheet = ss.getSheetByName(HERHALENDE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(HERHALENDE_TAB);
    sheet.setTabColor('#5C6BC0');
    const headers = ['ID', 'Naam', 'Leverancier', 'Bedrag (excl.)', 'BTW', 'Frequentie', 'Volgende datum', 'Grootboekrekening', 'Status', 'Automatisch boeken', 'Notities'];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#1A237E').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(8, 200);
  }

  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px}
      h3{color:#1A237E;margin-bottom:12px}
      .form-row{margin:8px 0}
      .form-row label{display:block;font-weight:bold;margin-bottom:3px;font-size:12px}
      .form-row input,.form-row select{width:100%;padding:7px;border:1px solid #ccc;border-radius:4px;font-size:13px}
      .row2{display:flex;gap:8px}
      .row2 .form-row{flex:1}
      .btn{background:#1A237E;color:white;border:none;padding:10px 20px;border-radius:4px;
           cursor:pointer;font-size:14px;width:100%;margin-top:12px}
      .btn:hover{background:#283593}
      .info{background:#E8EAF6;padding:8px;border-radius:4px;font-size:11px;margin-bottom:12px}
    </style>
    <h3>🔄 Herhalende kost toevoegen</h3>
    <div class="info">💡 Gebruik dit voor huur, abonnementen, verzekeringen en andere vaste lasten.
    Het systeem herinnert u als de betaaldatum nadert.</div>

    <div class="form-row">
      <label>Naam / Omschrijving *</label>
      <input type="text" id="naam" placeholder="Bijv. 'Kantoorhuur' of 'Adobe Creative Cloud'">
    </div>
    <div class="form-row">
      <label>Leverancier / Tegenpartij</label>
      <input type="text" id="leverancier" placeholder="Bijv. 'Verhuurder BV' of 'Adobe Inc.'">
    </div>
    <div class="row2">
      <div class="form-row">
        <label>Bedrag per keer (excl. BTW) *</label>
        <input type="number" id="bedrag" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="form-row">
        <label>BTW tarief</label>
        <select id="btw">
          <option value="21% (hoog)">21%</option>
          <option value="9% (laag)">9%</option>
          <option value="0% (nultarief)">0%</option>
          <option value="Vrijgesteld">Vrijgesteld</option>
        </select>
      </div>
    </div>
    <div class="row2">
      <div class="form-row">
        <label>Frequentie *</label>
        <select id="freq">
          <option value="Maandelijks">Maandelijks</option>
          <option value="Kwartaal">Kwartaal (per 3 maanden)</option>
          <option value="Halfjaarlijks">Halfjaarlijks</option>
          <option value="Jaarlijks">Jaarlijks</option>
          <option value="Wekelijks">Wekelijks</option>
        </select>
      </div>
      <div class="form-row">
        <label>Eerste/volgende betaaldatum</label>
        <input type="date" id="datum" value="${new Date().toISOString().slice(0, 10)}">
      </div>
    </div>
    <div class="form-row">
      <label>Grootboekrekening</label>
      <select id="rekening">
        <option value="5200 Huurkosten">5200 – Huurkosten</option>
        <option value="5300 Energie & Water">5300 – Energie & Water</option>
        <option value="5400 Telefoon & Internet">5400 – Telefoon & Internet</option>
        <option value="5500 Verzekeringen">5500 – Verzekeringen</option>
        <option value="5600 Brandstof">5600 – Brandstof</option>
        <option value="5710 Software & Abonnementen">5710 – Software & Abonnementen</option>
        <option value="5800 Advies & Accountant">5800 – Advies & Accountant</option>
        <option value="5900 Marketing & Reclame">5900 – Marketing & Reclame</option>
        <option value="6100 Bankkosten">6100 – Bankkosten</option>
        <option value="7000 Overige kosten">7000 – Overige kosten</option>
      </select>
    </div>
    <div class="form-row">
      <label>Automatisch boeken als journaalpost</label>
      <select id="auto">
        <option value="Nee">Nee (alleen herinnering)</option>
        <option value="Ja">Ja (automatisch boeken bij vernieuwen)</option>
      </select>
    </div>
    <div class="form-row">
      <label>Notities</label>
      <input type="text" id="notities" placeholder="Bijv. contractnummer of looptijd">
    </div>

    <button class="btn" onclick="opslaan()">Opslaan</button>
    <div id="status" style="margin-top:8px;color:green;display:none"></div>

    <script>
      function opslaan() {
        var naam      = document.getElementById('naam').value.trim();
        var leveranc  = document.getElementById('leverancier').value.trim();
        var bedrag    = parseFloat(document.getElementById('bedrag').value);
        var btw       = document.getElementById('btw').value;
        var freq      = document.getElementById('freq').value;
        var datum     = document.getElementById('datum').value;
        var rekening  = document.getElementById('rekening').value;
        var auto      = document.getElementById('auto').value;
        var notities  = document.getElementById('notities').value.trim();

        if (!naam || isNaN(bedrag) || bedrag <= 0) {
          alert('Vul naam en bedrag in.'); return;
        }

        google.script.run
          .withSuccessHandler(function() {
            var el = document.getElementById('status');
            el.textContent = '✓ Opgeslagen!';
            el.style.display = 'block';
            setTimeout(function() { google.script.host.close(); }, 1500);
          })
          .opslaanHerhalendeKost({ naam, leveranc, bedrag, btw, freq, datum, rekening, auto, notities });
      }
    </script>
  `).setWidth(500).setHeight(580);

  ui.showModalDialog(html, 'Herhalende kost toevoegen');
}

/**
 * Sla een nieuwe herhalende kost op in het tabblad.
 */
function opslaanHerhalendeKost(data) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(HERHALENDE_TAB);
  if (!sheet) {
    beheerHerhalendeKosten(); // Maak tab aan
    sheet = ss.getSheetByName(HERHALENDE_TAB);
  }

  const huidigAantal = sheet.getLastRow();
  const id = 'HK' + String(huidigAantal).padStart(4, '0');

  sheet.appendRow([
    id,
    data.naam,
    data.leveranc || '',
    parseFloat(data.bedrag) || 0,
    data.btw || '21% (hoog)',
    data.freq || 'Maandelijks',
    data.datum ? new Date(data.datum) : new Date(),
    data.rekening || '7000 Overige kosten',
    'Actief',
    data.auto || 'Nee',
    data.notities || '',
  ]);

  sheet.getRange(huidigAantal + 1, 4).setNumberFormat('€#,##0.00');
  sheet.getRange(huidigAantal + 1, 7).setNumberFormat('dd-mm-yyyy');
}

// ─────────────────────────────────────────────
//  HERHALENDE KOSTEN VERWERKEN (bij dashboard vernieuwen)
// ─────────────────────────────────────────────

/**
 * Controleert alle herhalende kosten:
 * - Maakt journaalpost als "Automatisch boeken = Ja" en datum is bereikt
 * - Schuift de volgende datum op
 * - Retourneert een lijst van komende betalingen voor dashboard-waarschuwing
 */
function verwerkHerhalendeKosten_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(HERHALENDE_TAB);
  if (!sheet) return { geboekt: 0, komend: [] };

  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  let geboekt = 0;
  const komend = [];

  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][8] || '');
    if (status !== 'Actief') continue;

    const volgende = data[i][6] ? new Date(data[i][6]) : null;
    if (!volgende) continue;

    const naam     = data[i][1];
    const bedrag   = parseFloat(data[i][3]) || 0;
    const freq     = String(data[i][5] || 'Maandelijks');
    const rekening = String(data[i][7] || '7000').split(' ')[0];
    const auto     = String(data[i][9] || 'Nee');

    // Is deze betaling vandaag of in het verleden?
    if (volgende <= vandaag) {
      if (auto === 'Ja') {
        // Automatisch boeken als journaalpost
        maakJournaalpost_(ss, {
          datum: volgende,
          omschr: naam + ' (' + freq + ')',
          dagboek: 'Memoriaal',
          debet: rekening,
          credit: '1200',
          bedrag,
          type: BOEKING_TYPE.MEMORIAAL,
        });
        geboekt++;
      }

      // Volgende datum berekenen
      const volgendeDatum = berekenVolgendeDatum_(volgende, freq);
      sheet.getRange(i + 1, 7).setValue(volgendeDatum);
    }

    // Komende betalingen (volgende 30 dagen)
    const dagenTot = Math.ceil((volgende - vandaag) / (1000 * 60 * 60 * 24));
    if (dagenTot >= 0 && dagenTot <= 30) {
      komend.push({
        naam,
        bedrag,
        datum: volgende,
        dagenTot,
      });
    }
  }

  return { geboekt, komend };
}

function berekenVolgendeDatum_(huidigDatum, freq) {
  const d = new Date(huidigDatum);
  switch (freq) {
    case 'Wekelijks':      d.setDate(d.getDate() + 7);    break;
    case 'Maandelijks':    d.setMonth(d.getMonth() + 1);  break;
    case 'Kwartaal':       d.setMonth(d.getMonth() + 3);  break;
    case 'Halfjaarlijks':  d.setMonth(d.getMonth() + 6);  break;
    case 'Jaarlijks':      d.setFullYear(d.getFullYear() + 1); break;
    default:               d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// ─────────────────────────────────────────────
//  OVERZICHT HERHALENDE KOSTEN
// ─────────────────────────────────────────────

function toonHerhalendeKostenOverzicht() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(HERHALENDE_TAB);

  if (!sheet || sheet.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert(
      'Herhalende kosten',
      'U heeft nog geen herhalende kosten geregistreerd.\n\nVoeg er toe via: Bank → Herhalende kosten beheren.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  ss.setActiveSheet(sheet);

  // Bereken jaarlijkse last voor inzicht
  const data = sheet.getDataRange().getValues();
  let jaarTotaal = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][8]) !== 'Actief') continue;
    const bedrag = parseFloat(data[i][3]) || 0;
    const freq   = String(data[i][5] || 'Maandelijks');
    const factor = { 'Wekelijks': 52, 'Maandelijks': 12, 'Kwartaal': 4, 'Halfjaarlijks': 2, 'Jaarlijks': 1 };
    jaarTotaal += bedrag * (factor[freq] || 12);
  }

  SpreadsheetApp.getUi().toast(
    `Totale vaste lasten per jaar: ${formatBedrag_(jaarTotaal)} (${formatBedrag_(jaarTotaal / 12)}/maand)`,
    '📊 Herhalende kosten overzicht',
    6
  );
}

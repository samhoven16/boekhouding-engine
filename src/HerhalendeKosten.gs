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
  maakHerhalendeKostenTab_(ss);

  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 12px}
      .form-row{margin:10px 0}
      .form-row label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#0D1B4E}
      .form-row input,.form-row select{width:100%;padding:8px 10px;border:1px solid #E5EAF2;border-radius:6px;
                                       font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;
                                       transition:border-color 0.15s}
      .form-row input:focus,.form-row select:focus{outline:none;border-color:#2EC4B6}
      .row2{display:flex;gap:10px}
      .row2 .form-row{flex:1}
      .btn{background:#0D1B4E;color:white;border:none;padding:11px 20px;border-radius:6px;
           cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;width:100%;margin-top:14px;
           transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .info{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;
            padding:10px 12px;border-radius:0 6px 6px 0;font-size:12px;margin-bottom:14px;
            color:#1A1A1A;line-height:1.5}
    </style>
    <h3>Herhalende kost toevoegen</h3>
    <div class="info">Gebruik dit voor huur, abonnementen, verzekeringen en andere vaste lasten. Boekhoudbaar herinnert je als de betaaldatum nadert.</div>

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
    <div class="row2">
      <div class="form-row">
        <label>Zakelijk % (privésplit)</label>
        <input type="number" id="splitPct" min="0" max="100" value="100" placeholder="100">
      </div>
      <div class="form-row">
        <label>Notities</label>
        <input type="text" id="notities" placeholder="Bijv. contractnummer of looptijd">
      </div>
    </div>
    <div class="info" style="font-size:11px;margin-top:-8px;">100% = volledig zakelijk. Bijv. 70% = 70% kostenrekening + 30% privéonttrekkingen (2400).</div>

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
        var splitPct  = parseInt(document.getElementById('splitPct').value) || 100;

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
          .opslaanHerhalendeKost({ naam, leveranc, bedrag, btw, freq, datum, rekening, auto, notities, splitPct });
      }
    </script>
  `).setWidth(500).setHeight(620);

  ui.showModalDialog(html, 'Herhalende kost toevoegen');
}

/**
 * Sla een nieuwe herhalende kost op in het tabblad.
 */
function maakHerhalendeKostenTab_(ss) {
  let sheet = ss.getSheetByName(HERHALENDE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(HERHALENDE_TAB);
    sheet.setTabColor('#5C6BC0');
    const headers = ['ID', 'Naam', 'Leverancier', 'Bedrag (excl.)', 'BTW', 'Frequentie', 'Volgende datum', 'Grootboekrekening', 'Status', 'Automatisch boeken', 'Notities', 'Zakelijk %'];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(8, 200);
  }
  return sheet;
}

function opslaanHerhalendeKost(data) {
  const ss = getSpreadsheet_();
  const sheet = maakHerhalendeKostenTab_(ss);

  const huidigAantal = sheet.getLastRow();
  const id = 'HK' + String(huidigAantal).padStart(4, '0');

  const splitPct = Math.min(100, Math.max(0, parseInt(data.splitPct) || 100));
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
    splitPct,
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

  // Voorkom dubbele boekingen bij gelijktijdige dashboard-refreshes
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { geboekt: 0, komend: [] };

  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  let geboekt = 0;
  const komend = [];

  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][8] || '');
    if (status !== 'Actief') continue;

    const volgende = data[i][6] ? new Date(data[i][6]) : null;
    if (!volgende || isNaN(volgende.getTime())) {
      Logger.log('Herhalende kosten rij ' + (i + 1) + ': ongeldige datum, overgeslagen.');
      continue;
    }

    const naam     = data[i][1];
    const bedrag   = parseFloat(data[i][3]) || 0;
    const freq     = String(data[i][5] || 'Maandelijks');
    const rekening = String(data[i][7] || '7000').split(' ')[0];
    const auto     = String(data[i][9] || 'Nee');
    const splitPct = Math.min(100, Math.max(0, parseFloat(data[i][11] || '100') || 100));

    // Is deze betaling vandaag of in het verleden?
    let datumVoorKomend = volgende;
    if (volgende <= vandaag) {
      if (auto === 'Ja') {
        const zakelijkBedrag = rondBedrag_(bedrag * (splitPct / 100));
        const privaatBedrag  = rondBedrag_(bedrag - zakelijkBedrag);
        // Zakelijk deel → kostenrekening
        maakJournaalpost_(ss, {
          datum: volgende,
          omschr: naam + ' (' + freq + ')' + (splitPct < 100 ? ' — zakelijk ' + splitPct + '%' : ''),
          dagboek: 'Memoriaal',
          debet: rekening,
          credit: '1200',
          bedrag: zakelijkBedrag,
          type: BOEKING_TYPE.MEMORIAAL,
        });
        // Privé deel → 2400 Privéonttrekkingen (alleen als > 0)
        if (privaatBedrag > 0) {
          maakJournaalpost_(ss, {
            datum: volgende,
            omschr: naam + ' (' + freq + ') — privé ' + (100 - splitPct) + '%',
            dagboek: 'Memoriaal',
            debet: '2400',
            credit: '1200',
            bedrag: privaatBedrag,
            type: BOEKING_TYPE.MEMORIAAL,
          });
        }
        geboekt++;
      }

      // Volgende datum berekenen en opslaan
      const volgendeDatum = berekenVolgendeDatum_(volgende, freq);
      sheet.getRange(i + 1, 7).setValue(volgendeDatum);
      datumVoorKomend = volgendeDatum; // Gebruik de nieuwe datum voor de "komend" check
    }

    // Komende betalingen (volgende 30 dagen — gebaseerd op nieuwe/huidige datum)
    const dagenTot = Math.ceil((datumVoorKomend - vandaag) / (1000 * 60 * 60 * 24));
    if (dagenTot >= 0 && dagenTot <= 30) {
      komend.push({
        naam,
        bedrag,
        datum: datumVoorKomend,
        dagenTot,
      });
    }
  }

  lock.releaseLock();
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

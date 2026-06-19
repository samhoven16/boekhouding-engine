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

    <button class="btn" id="btnOpslaanHK">Opslaan</button>
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
          .withFailureHandler(function(e) {
            var el = document.getElementById('status');
            el.style.display = 'block';
            el.style.color = '#B71C1C';
            el.textContent = 'Fout: ' + (e && e.message ? e.message : 'onbekend');
          })
          .opslaanHerhalendeKost({ naam, leveranc, bedrag, btw, freq, datum, rekening, auto, notities, splitPct });
      }
      document.addEventListener('DOMContentLoaded', function() {
        var b = document.getElementById('btnOpslaanHK');
        if (b) b.addEventListener('click', function(e){ e.preventDefault(); opslaan(); });
      });
    </script>
  `).setWidth(500).setHeight(620).setSandboxMode(HtmlService.SandboxMode.IFRAME);

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
  // CYCLE-21: strikte input-validatie. Oude versie liet drie silent
  // corruption-paden door:
  //   1. parseFloat("12,50") → 12 (lost 50 cent per iteratie; NL-formaat)
  //   2. parseInt(0) || 100 = 100 (0% zakelijk werd silent 100%)
  //   3. parseDatum_("garbage") → vandaag (kost stond aan met fout
  //      startdatum — boekte direct ipv op klant-bedoelde datum)
  // Plus géén check op naam-leeg of bedrag<=0 (lege rij gemaakt → klant
  // ziet "Actief" zonder bedrag → verwarrend).
  const naam = String((data && data.naam) || '').trim();
  if (!naam) throw new Error('Naam is verplicht voor een herhalende kost.');

  // parseBedrag_ accepteert "1.234,56" en "1234.56" beide; parseFloat doet
  // dat NIET. Strict (>0) want een €0 herhalende kost is onzinnig.
  const bedrag = (typeof parseBedrag_ === 'function')
    ? parseBedrag_(data.bedrag)
    : (parseFloat(data.bedrag) || 0);
  if (!(bedrag > 0)) throw new Error('Bedrag moet groter dan €0,00 zijn.');

  // splitPct: 0 is een legitieme waarde (100% privé). isNaN-check ipv
  // truthy-fallback zodat 0 niet silent 100 wordt.
  let splitPct = parseInt(data && data.splitPct);
  if (!isFinite(splitPct)) splitPct = 100;
  splitPct = Math.min(100, Math.max(0, splitPct));

  // Datum: parseDatum_ valt silent terug op vandaag bij onparsebare input.
  // Voor herhalende kosten betekent dat: kost wordt direct geboekt ipv op
  // klant-bedoelde startdatum. We checken eerst het format strikt; alleen
  // herkende formaten (ISO of NL met separator) gaan door parseDatum_.
  let startDatum;
  const datumRaw = data && data.datum;
  if (!datumRaw) {
    startDatum = new Date();
  } else if (datumRaw instanceof Date) {
    if (isNaN(datumRaw.getTime())) throw new Error('Startdatum is een ongeldig Date-object.');
    startDatum = datumRaw;
  } else {
    const s = String(datumRaw).trim();
    if (!/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})$/.test(s)) {
      throw new Error('Startdatum is ongeldig — gebruik formaat dd-mm-jjjj of jjjj-mm-dd.');
    }
    startDatum = parseDatum_(s);
    if (!startDatum || isNaN(startDatum.getTime())) {
      throw new Error('Startdatum is ongeldig — gebruik formaat dd-mm-jjjj of jjjj-mm-dd.');
    }
  }

  const ss = getSpreadsheet_();
  const sheet = maakHerhalendeKostenTab_(ss);

  const id = _volgendHerhalendKostId_();
  const huidigAantal = sheet.getLastRow();

  sheet.appendRow([
    id,
    naam,
    String((data && data.leveranc) || ''),
    bedrag,
    (data && data.btw) || '21% (hoog)',
    (data && data.freq) || 'Maandelijks',
    startDatum,
    (data && data.rekening) || '7000 Overige kosten',
    'Actief',
    (data && data.auto) || 'Nee',
    (data && data.notities) || '',
    splitPct,
  ]);

  sheet.getRange(huidigAantal + 1, 4).setNumberFormat('€#,##0.00');
  sheet.getRange(huidigAantal + 1, 7).setNumberFormat('dd-mm-yyyy');
  return { id, naam, bedrag, splitPct };
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
  // 30s timeout — financiële operaties hebben voorrang boven UI-snelheid
  if (!lock.tryLock(30000)) return { geboekt: 0, komend: [] };

  // Cap inhaal-iteraties: voorkomt runaway-loops als iemand een datum
  // in 1990 invoert (ongeluk of ongeldige migratie).
  const MAX_INHAAL = 36;
  let geboekt = 0;
  const komend = [];

  try {
    const data = sheet.getDataRange().getValues();
    const vandaag = new Date();

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][KOL.HK.status] || '');
      if (status !== 'Actief') continue;

      // NB: hier expres new Date() ipv parseDatum_ — parseDatum_ valt terug op
      // 'today' bij ongeldige string, wat hier silent verkeerd zou zijn.
      // Dit veld is een sheet-Date-kolom; non-Date input is een fout om te flaggen.
      let volgende = data[i][KOL.HK.volgendeDatum]
        ? (data[i][KOL.HK.volgendeDatum] instanceof Date ? data[i][KOL.HK.volgendeDatum] : new Date(data[i][KOL.HK.volgendeDatum]))
        : null;
      if (!volgende || isNaN(volgende.getTime())) {
        // Klant ziet "Actief" maar krijgt geen boeking → frustrerend. Maak
        // expliciet zichtbaar: zet status op "FOUT — datum ongeldig" zodat
        // klant in de sheet ziet dat er aandacht nodig is.
        Logger.log('Herhalende kosten rij ' + (i + 1) + ': ongeldige datum, overgeslagen.');
        safeAuditLog_('Herhalende kost OVERGESLAGEN', 'Rij ' + (i + 1) + ' – ongeldige volgende datum: ' + data[i][KOL.HK.volgendeDatum]);
        try {
          const huidigeStatus = String(data[i][KOL.HK.status] || '');
          if (huidigeStatus.indexOf('FOUT') === -1) {
            sheet.getRange(i + 1, 9).setValue('FOUT — datum ongeldig, corrigeer kolom G');
          }
        } catch (_) {}
        try { SpreadsheetApp.getActiveSpreadsheet().toast('Herhalende kost rij ' + (i + 1) + ' heeft ongeldige datum — corrigeer en hervat', 'Herhalende kost', 8); } catch (_) {}
        continue;
      }

      const naam     = data[i][KOL.HK.naam];
      const bedrag   = parseFloat(data[i][KOL.HK.bedragExcl]) || 0;
      const freq     = String(data[i][KOL.HK.frequentie] || 'Maandelijks');
      const rekening = String(data[i][KOL.HK.grootboekrekening] || '7000').split(' ')[0];
      const auto     = String(data[i][KOL.HK.automatischBoeken] || 'Nee');
      const splitPct = Math.min(100, Math.max(0, parseFloat(data[i][KOL.HK.zakelijkPct] || '100') || 100));
      const rijId    = String(data[i][KOL.HK.id] || ('rij' + i));   // unieke ID voor idempotency

      // Inhaal-loop: boek élke gemiste periode tot vandaag (begrensd).
      let iteratie = 0;
      while (volgende <= vandaag && iteratie < MAX_INHAAL) {
        // Idempotency: als deze (rij + datum) combinatie al geboekt is, skip.
        // Voorkomt dubbele journaalpost bij retry-after-crash of paralelle dashboard-refresh.
        const idemKey = 'herhKost_' + rijId + '_' + Utilities.formatDate(volgende, 'Europe/Amsterdam', 'yyyy-MM-dd');
        const reedsGeboekt = PropertiesService.getScriptProperties().getProperty(idemKey);
        if (reedsGeboekt === 'DONE') {
          // Spring direct naar volgende periode zonder opnieuw boeken
          volgende = berekenVolgendeDatum_(volgende, freq);
          iteratie++;
          continue;
        }
        // V3-FIX: case-insensitief via isJa_. Strikte === 'Ja' liet 'ja'/'JA'
        // stil falen → herhalende kost werd niet auto-geboekt → klant mist
        // aftrek (huur, abonnement, verzekering) → meer IB.
        if (isJa_(auto) && bedrag > 0) {
          // klasse 9 (precisie): exact zakelijk-deel via integer-centen; privé-deel
          // is het restant zodat zakelijk + privé exact = bedrag (geen cent-lek).
          const zakelijkBedrag = rondTariefCent_(bedrag, splitPct / 100);
          const privaatBedrag  = rondBedrag_(bedrag - zakelijkBedrag);
          if (zakelijkBedrag > 0) {
            maakJournaalpost_(ss, {
              datum: volgende,
              omschr: naam + ' (' + freq + ')' + (splitPct < 100 ? ' — zakelijk ' + splitPct + '%' : ''),
              dagboek: 'Memoriaal',
              debet: rekening,
              credit: '1200',
              bedrag: zakelijkBedrag,
              type: BOEKING_TYPE.MEMORIAAL,
            });
          }
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
          // Markeer (rij+datum) als geboekt — idempotency-guard. TTL niet
          // ingesteld op cache: ScriptProperty blijft staan tot opt-in cleanup
          // (anders zou cache-eviction dubbel-boeking veroorzaken).
          try { PropertiesService.getScriptProperties().setProperty(idemKey, 'DONE'); } catch (_) {}
        }
        volgende = berekenVolgendeDatum_(volgende, freq);
        iteratie++;
      }
      sheet.getRange(i + 1, 7).setValue(volgende);
      SpreadsheetApp.flush();  // garandeer datum-update vóór trigger evt. opnieuw fired

      // Komende betalingen (volgende 30 dagen)
      const dagenTot = Math.ceil((volgende - vandaag) / (1000 * 60 * 60 * 24));
      if (dagenTot >= 0 && dagenTot <= 30) {
        komend.push({ naam, bedrag, datum: volgende, dagenTot });
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { geboekt, komend };
}

/**
 * Opruimen van oude `herhKost_<rijId>_<YYYY-MM-DD>` idempotency-keys.
 *
 * Zonder deze cleanup accumuleren de keys in ScriptProperties voor altijd:
 * 10 herhalende kosten × 365 dagen × 5 jaar = ~18.250 keys, ~900KB. De
 * ScriptProperties-quota is 500KB — bij overschrijding falen ALLE writes
 * silent (inclusief factuurnummer-claim, idempotency-guards, settings).
 *
 * Strategie: verwijder keys waarvan het datum-deel > `maxDagen` oud is.
 * De keys voor toekomstige iteraties blijven ongemoeid (zou dubbele boeking
 * veroorzaken). 90 dagen is ruim voorbij elke realistische inhaal-window;
 * berekenVolgendeDatum_ kijkt nooit terug.
 *
 * @param {number=} maxDagen  drempel in dagen (default 90)
 * @returns {{verwijderd: number, behouden: number}}
 */
function cleanupHerhalendeKostenIdempotency_(maxDagen) {
  const dagen = (typeof maxDagen === 'number' && maxDagen > 0) ? maxDagen : 90;
  const drempelMs = Date.now() - dagen * 24 * 60 * 60 * 1000;
  const props = PropertiesService.getScriptProperties();
  let alleKeys;
  try {
    alleKeys = props.getKeys();
  } catch (_) { return { verwijderd: 0, behouden: 0 }; }

  let verwijderd = 0;
  let behouden = 0;
  // Pattern: herhKost_<rijId>_<YYYY-MM-DD>
  const re = /^herhKost_.+_(\d{4})-(\d{2})-(\d{2})$/;
  for (let i = 0; i < alleKeys.length; i++) {
    const k = alleKeys[i];
    const m = k.match(re);
    if (!m) continue;
    const dt = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    if (isNaN(dt.getTime())) continue;
    if (dt.getTime() < drempelMs) {
      try { props.deleteProperty(k); verwijderd++; } catch (_) { /* best-effort */ }
    } else {
      behouden++;
    }
  }
  return { verwijderd, behouden };
}

function _volgendHerhalendKostId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const sleutel = 'volgendHerhalendKostId';
    const nr = parseInt(props.getProperty(sleutel) || '1');
    props.setProperty(sleutel, String(nr + 1));
    return 'HK' + String(nr).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

function berekenVolgendeDatum_(huidigDatum, freq) {
  const d = new Date(huidigDatum);
  switch (freq) {
    case 'Wekelijks':      d.setDate(d.getDate() + 7);  return d;
    case 'Maandelijks':    return _addMaandenSafe_(d, 1);
    case 'Kwartaal':       return _addMaandenSafe_(d, 3);
    case 'Halfjaarlijks':  return _addMaandenSafe_(d, 6);
    case 'Jaarlijks':      return _addMaandenSafe_(d, 12);
    default:               return _addMaandenSafe_(d, 1);
  }
}

/**
 * Voegt N maanden toe, maar voorkomt date-overflow.
 * Voorbeeld: 31 jan + 1 maand → 28/29 feb (niet 3 maart).
 * Cruciaal voor herhalende kosten op 28/29/30/31e van de maand.
 */
function _addMaandenSafe_(datum, n) {
  const d = new Date(datum);
  const oorspronkelijkeDag = d.getDate();
  d.setDate(1);                         // Voorkom roll-over
  d.setMonth(d.getMonth() + n);
  // Beperk dag tot max-aantal in nieuwe maand
  const dagenInMaand = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(oorspronkelijkeDag, dagenInMaand));
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
    if (String(data[i][KOL.HK.status]) !== 'Actief') continue;
    const bedrag = parseFloat(data[i][KOL.HK.bedragExcl]) || 0;
    const freq   = String(data[i][KOL.HK.frequentie] || 'Maandelijks');
    const factor = { 'Wekelijks': 52, 'Maandelijks': 12, 'Kwartaal': 4, 'Halfjaarlijks': 2, 'Jaarlijks': 1 };
    jaarTotaal += bedrag * (factor[freq] || 12);
  }

  SpreadsheetApp.getUi().toast(
    `Totale vaste lasten per jaar: ${formatBedrag_(jaarTotaal)} (${formatBedrag_(jaarTotaal / 12)}/maand)`,
    '📊 Herhalende kosten overzicht',
    6
  );
}

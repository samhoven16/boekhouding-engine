/**
 * HitlValidatie.gs
 *
 * Human-in-the-Loop validatielaag voor journaalposten.
 *
 * Filosofie: niet snel-snel boeken — bewust boeken. Elke automatisch
 * gemaakte boeking start met status 'Concept'. Klant moet handmatig
 * bevestigen dat:
 *   1. Grootboekrekening klopt (juiste categorie + RGS-mapping)
 *   2. BTW-tarief klopt (21/9/0/verlegd correct toegepast)
 *   3. Bijlage aanwezig (PDF/bon gekoppeld in Drive)
 *
 * Pas na bevestiging: status → 'Gevalideerd' + email-stempel + datum.
 *
 * Compliance: art. 52 AWR vereist juiste administratie. Auto-boekingen
 * kunnen fouten bevatten (verkeerde categorisatie door AI, typo in BTW%).
 * Dwingt klant tot review-stap. Eens gevalideerd = door de klant nagekeken
 * (GL/BTW/bijlage); de rij blijft BEWERKBAAR tot de periode wordt afgesloten
 * (jaarafsluiting via vergrendelPeriode_) — validatie vergrendelt niets.
 *
 * Menu: Boekhouding → Geavanceerd → "✔ Concept-boekingen valideren"
 */

'use strict';

// Kolom-indexen (1-based) in JOURNAALPOSTEN sheet
const HITL_KOL_STATUS = 17;        // Q
const HITL_KOL_GEVALIDEERD_DOOR = 18;  // R
const HITL_KOL_GEVALIDEERD_OP = 19; // S

const HITL_STATUS_CONCEPT = 'Concept';
const HITL_STATUS_GEVALIDEERD = 'Gevalideerd';

/**
 * Hoofdfunctie — toont lijst Concept-boekingen + checklist per rij.
 */
function openValidatieChecklist() {
  const ui = SpreadsheetApp.getUi();
  const ss = (typeof getSpreadsheet_ === 'function') ? getSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { ui.alert('Geen spreadsheet bereikbaar.'); return; }

  const concept = _haalConceptBoekingen_(ss);
  if (concept.length === 0) {
    ui.alert(
      'Alle boekingen gevalideerd ✓',
      'Geen Concept-boekingen meer. Alle journaalposten zijn door jou nagekeken ' +
      '(grootboek, BTW, bijlage). Ze blijven bewerkbaar tot je de periode afsluit.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Bouw HTML-dialog met checklist per boeking
  const rijen = concept.map(function(b) {
    return '<tr data-row="' + b.rij + '">' +
      '<td style="white-space:nowrap">' + escHtml_(b.id) + '</td>' +
      '<td>' + escHtml_(Utilities.formatDate(b.datum instanceof Date ? b.datum : new Date(b.datum), 'Europe/Amsterdam', 'd-M-yyyy')) + '</td>' +
      '<td>' + escHtml_((b.omschr || '').slice(0, 40)) + '</td>' +
      '<td>' + escHtml_(b.debet + ' / ' + b.credit) + '</td>' +
      '<td style="text-align:right">€ ' + (b.bedrag || 0).toFixed(2).replace('.', ',') + '</td>' +
      '<td>' + escHtml_(b.btw || '') + '</td>' +
      '<td style="text-align:center">' +
        '<label style="display:block"><input type="checkbox" class="c1" /> GL</label>' +
        '<label style="display:block"><input type="checkbox" class="c2" /> BTW</label>' +
        '<label style="display:block"><input type="checkbox" class="c3" /> Bijlage</label>' +
      '</td>' +
    '</tr>';
  }).join('');

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:18px;color:#1A1A1A;font-size:13px}
      h2{color:#0D1B4E;margin:0 0 6px;font-size:18px;font-weight:800}
      .uitleg{background:#FFF8E1;border-left:4px solid #F9A825;padding:10px 14px;border-radius:6px;margin:0 0 14px;font-size:12px;line-height:1.5}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #E5EAF2;padding:6px 8px;vertical-align:top}
      th{background:#F7F9FC;font-weight:700;color:#0D1B4E;text-align:left;position:sticky;top:0}
      tr.valid{background:#E8F8F6}
      .acties{margin-top:14px;display:flex;gap:10px;justify-content:flex-end}
      .btn{background:#2EC4B6;color:#0A4744;border:none;padding:9px 18px;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit}
      .btn:disabled{background:#ccc;cursor:not-allowed;color:#666}
      .btn-sec{background:#fff;border:1px solid #0D1B4E;color:#0D1B4E}
      label{font-size:11px;cursor:pointer}
      label input{margin-right:3px}
      .teller{font-size:12px;color:#5F6B7A}
    </style>
    <h2>✔ Concept-boekingen valideren</h2>
    <div class="uitleg">
      <strong>Human-in-the-Loop validatie</strong>: door deze rij te valideren bevestig je dat
      (1) de <strong>grootboekrekening</strong> correct is, (2) het <strong>BTW-tarief</strong>
      klopt en (3) er een <strong>bijlage</strong> in Drive staat. Na bevestiging is de
      boeking door jou nagekeken; ze blijft bewerkbaar tot je de periode afsluit.
    </div>
    <div class="teller" id="teller"><strong>${concept.length}</strong> boekingen wachten op validatie</div>
    <table style="margin-top:8px">
      <thead><tr>
        <th>ID</th><th>Datum</th><th>Omschrijving</th><th>Debet/Credit</th><th>Bedrag</th><th>BTW</th><th>Check</th>
      </tr></thead>
      <tbody id="tbody">${rijen}</tbody>
    </table>
    <div class="acties">
      <button class="btn btn-sec" onclick="google.script.host.close()">Sluiten</button>
      <button class="btn" id="btnValideer" onclick="valideer()" disabled>Valideer geselecteerde (0)</button>
    </div>
    <script>
      function tellen() {
        var rijen = document.querySelectorAll('#tbody tr');
        var teValideren = 0;
        rijen.forEach(function(tr) {
          var c1 = tr.querySelector('.c1').checked;
          var c2 = tr.querySelector('.c2').checked;
          var c3 = tr.querySelector('.c3').checked;
          if (c1 && c2 && c3) { tr.classList.add('valid'); teValideren++; }
          else { tr.classList.remove('valid'); }
        });
        var btn = document.getElementById('btnValideer');
        btn.disabled = teValideren === 0;
        btn.textContent = 'Valideer geselecteerde (' + teValideren + ')';
      }
      document.addEventListener('change', function(e) {
        if (e.target.matches('input[type=checkbox]')) tellen();
      });
      function valideer() {
        var teValideren = [];
        document.querySelectorAll('#tbody tr.valid').forEach(function(tr) {
          teValideren.push(parseInt(tr.dataset.row, 10));
        });
        if (!teValideren.length) return;
        var btn = document.getElementById('btnValideer');
        btn.disabled = true;
        btn.textContent = 'Bezig met valideren…';
        google.script.run
          .withSuccessHandler(function(aantal) {
            alert('✓ ' + aantal + ' boekingen gevalideerd. Sluit dit venster om bij te werken.');
            google.script.host.close();
          })
          .withFailureHandler(function(e) {
            alert('Fout: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Valideer geselecteerde (' + teValideren.length + ')';
          })
          .valideerBoekingRijen(teValideren);
      }
    </script>
  `).setWidth(880).setHeight(520);
  ui.showModalDialog(html, 'Boekingen valideren — Human-in-the-Loop');
}

/**
 * Server-side: markeer rijen als Gevalideerd. Aangeroepen vanuit dialog.
 *
 * @param {Array<number>} rijIndexen 1-based rij-nummers in JOURNAALPOSTEN sheet
 * @returns {number} aantal succesvol gevalideerd
 */
function valideerBoekingRijen(rijIndexen) {
  if (!Array.isArray(rijIndexen) || !rijIndexen.length) return 0;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) throw new Error('Journaalposten-sheet niet gevonden');

  const user = Session.getActiveUser().getEmail() || 'onbekend';
  const nu = new Date();
  let aantalGevalideerd = 0;

  // Garandeer atomicity via LockService — twee gebruikers tegelijk valideren kan
  return withLock_('hitl-valideer', 10000, function() {
    rijIndexen.forEach(function(rij) {
      try {
        // Veiligheid: lees huidige status, valideer alleen als Concept
        const huidig = sheet.getRange(rij, HITL_KOL_STATUS).getValue();
        if (String(huidig) === HITL_STATUS_GEVALIDEERD) return;  // skip al-gevalideerd

        sheet.getRange(rij, HITL_KOL_STATUS).setValue(HITL_STATUS_GEVALIDEERD);
        sheet.getRange(rij, HITL_KOL_GEVALIDEERD_DOOR).setValue(user);
        sheet.getRange(rij, HITL_KOL_GEVALIDEERD_OP).setValue(nu);
        aantalGevalideerd++;
      } catch (e) {
        Logger.log('HITL valideer rij ' + rij + ' fout: ' + e.message);
      }
    });
    if (aantalGevalideerd > 0) {
      try {
        schrijfAuditLog_('HITL-validatie',
          aantalGevalideerd + ' boekingen gevalideerd door ' + user);
      } catch (_) {}
    }
    return aantalGevalideerd;
  });
}

/**
 * Haalt alle Concept-boekingen op (nog niet gevalideerd).
 *
 * @param {Spreadsheet} ss
 * @returns {Array<{rij, id, datum, omschr, debet, credit, bedrag, btw}>}
 */
function _haalConceptBoekingen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const concept = [];
  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    const status = String(rij[HITL_KOL_STATUS - 1] || '');
    // Concept OF leeg (= legacy boeking vóór HITL-feature) = nog te valideren
    if (status === HITL_STATUS_GEVALIDEERD) continue;
    concept.push({
      rij: i + 1,  // sheet is 1-based
      id: rij[0],
      datum: rij[1],
      omschr: rij[2],
      debet: rij[4],
      credit: rij[6],
      bedrag: rij[8],
      btw: rij[9],
    });
  }
  return concept;
}

/**
 * Toont samenvatting in toast: hoeveel boekingen wachten op validatie.
 * Optioneel aan te roepen vanuit onOpen voor zachte herinnering.
 */
function _waarschuwOnvalidered_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  try {
    const aantal = _haalConceptBoekingen_(ss).length;
    if (aantal >= 10) {
      ss.toast(
        aantal + ' boekingen wachten op validatie. Open Boekhouding → Geavanceerd → ' +
        'Concept-boekingen valideren.',
        '✔ HITL-validatie open',
        8
      );
    }
  } catch (_) {}
}

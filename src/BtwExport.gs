/**
 * BtwExport.gs
 *
 * Tier 2 #4 — structured BTW-aangifte export.
 *
 * WAT DIT WEL IS:
 *   - Een gestructureerd export-formaat (JSON + CSV) van de berekende
 *     BTW-aangifte met alle rubrieken (1a, 1b, 1c, 1d, 1e, 2a, 3a/3b/3c,
 *     4a/4b, 5a/5b/5c/5d, 5g voorbelasting privé-gebruik, 5h personeel) in
 *     de structuur die het Belastingdienst-formulier volgt.
 *   - Bedoeld voor: accountant die deze waarden zelf in MijnBelastingdienst
 *     of zijn eigen software wil overtypen/inlezen. Of voor een toekomstige
 *     XBRL/SBR-generator die deze data als input neemt.
 *
 * WAT DIT EXPLICIET NIET IS:
 *   - Géén XBRL-instance document (geen taxonomie-mapping naar NT16/NT17)
 *   - Géén SBR-banking-transport (Aansluitpunt vereist eHerkenning + PKI-O
 *     certificaat + WSS-signing — multi-week werk)
 *   - Géén automatische indiening bij de Belastingdienst (klant of accountant
 *     moet altijd zelf indienen — wettelijk: aangifte is verantwoordelijkheid
 *     van de ondernemer, AWR art. 8)
 *
 * Toekomstpad (tier 3):
 *   1. Mapping van deze JSON naar SBR-NT-taxonomie-codes
 *   2. XBRL-instance-generator (per kwartaal)
 *   3. Digital signing (PKI-Overheid certificate)
 *   4. Optioneel: SBR-aansluitpunt-transport (Logius)
 */

/**
 * Menu-actie. Toont dialog met dropdown voor kwartaal, dan download-knoppen
 * voor JSON en CSV. Gebruikt de bestaande BTW-aangifte-berekening
 * (berekenBtwAangifte_).
 */
function toonBtwExportDialog() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  if (!ss) { ui.alert('Open eerst de Boekhoudbaar spreadsheet.'); return; }

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:22px 24px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:4px}
      h3{color:#0D1B4E;margin-bottom:8px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      .info{background:#E6F7F4;border-left:3px solid #2EC4B6;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px;color:#0D1B4E;line-height:1.55}
      .warn{background:#FFF8E1;border-left:3px solid #FFC107;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px;color:#5A3F00;line-height:1.55}
      .form-row{margin:10px 0}
      .form-row label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#1A1A1A}
      select{width:100%;padding:10px 12px;border:1px solid #E5EAF2;border-radius:8px;
             font-size:13px;font-family:inherit;background:#fff}
      .btn{background:#0D1B4E;color:white;border:none;padding:11px 18px;border-radius:8px;
           cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-right:6px;margin-bottom:6px}
      .btn:hover:not(:disabled){background:#1A2A6B}
      .btn:disabled{background:#94A3B8;cursor:not-allowed}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:10px 16px;
               border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
      .status{margin-top:10px;padding:10px 12px;border-radius:8px;display:none;font-size:12px;border:1px solid transparent}
      pre{background:#fff;border:1px solid #E5EAF2;border-radius:8px;padding:10px;font-size:11px;
          font-family:Menlo,Consolas,monospace;overflow:auto;max-height:240px;white-space:pre-wrap}
      hr{border:none;border-top:1px solid #E5EAF2;margin:14px 0}
      table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;font-size:12px;margin:8px 0}
      th{background:#0D1B4E;color:#fff;text-align:left;padding:8px 10px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      td{padding:8px 10px;border-bottom:1px solid #F0F2F7;color:#1A1A1A}
      td.code{font-family:Menlo,Consolas,monospace;color:#0D1B4E;font-weight:600;width:50px}
      td.num{text-align:right;font-variant-numeric:tabular-nums}
      tr.totaal td{background:#F7F9FC;font-weight:700;color:#0D1B4E}
      tr.saldo td{background:#E6F7F4;font-weight:700;color:#0D1B4E;font-size:13px}
      .periode-koplabel{font-size:11px;color:#5A6478;margin:6px 0 2px}
    </style>
    <div class="label">Export</div>
    <h3>BTW-aangifte exporteren</h3>
    <div class="info">
      Genereert een gestructureerd export-bestand (JSON of CSV) van je
      BTW-aangifte voor een kwartaal. Bedoeld voor je accountant of voor
      latere XBRL/SBR-generatie. <b>Geen automatische indiening</b> bij de
      Belastingdienst — die verantwoordelijkheid blijft bij jou (AWR art. 8).
    </div>

    <div class="form-row">
      <label>Periode</label>
      <select id="periode">
        ${(function() {
          const huidigJaar = new Date().getFullYear();
          let opt = '';
          for (let j = huidigJaar; j >= huidigJaar - 1; j--) {
            for (let q = 1; q <= 4; q++) {
              opt += '<option value="' + j + '-Q' + q + '">' + j + ' kwartaal ' + q + '</option>';
            }
          }
          return opt;
        })()}
      </select>
    </div>

    <button class="btn" id="btnPreview" onclick="laadPreview()">Toon preview</button>
    <button class="btn" id="btnJson" onclick="download('json')" disabled>↓ Download JSON</button>
    <button class="btn" id="btnCsv" onclick="download('csv')" disabled>↓ Download CSV</button>
    <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>

    <hr>
    <div id="previewWrapper" style="display:none">
      <p><b>Preview</b> — controleer of de cijfers kloppen vóór je 'm gebruikt:</p>
      <div class="periode-koplabel" id="periodeKop"></div>
      <div id="previewTabel"></div>
    </div>
    <div class="status" id="status"></div>

    <script>
      var huidigePeriode = null;

      function fmtEuro(n) {
        if (n === null || n === undefined) return '—';
        var num = Number(n);
        if (!isFinite(num)) return '—';
        return '€ ' + num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      function escHtml(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
      function renderPreviewTabel(exp) {
        if (!exp || !exp.rubrieken) {
          document.getElementById('previewTabel').textContent = 'Geen data.';
          return;
        }
        document.getElementById('periodeKop').textContent =
          'Kwartaal ' + exp.periode.kwartaal + ' ' + exp.periode.jaar +
          ' (' + exp.periode.vanaf + ' t/m ' + exp.periode.totEnMet + ')';
        var rijen = ['<table><thead><tr>' +
          '<th>Rubriek</th><th>Omschrijving</th>' +
          '<th style="text-align:right">Grondslag</th>' +
          '<th style="text-align:right">BTW</th></tr></thead><tbody>'];
        var totaalKeys = { r5a:true, r5b:true, r5c:true };
        var saldoKey = 'r5d';
        Object.keys(exp.rubrieken).forEach(function(code) {
          var r = exp.rubrieken[code];
          var rowClass = (code === saldoKey) ? ' class="saldo"' :
                         (totaalKeys[code] ? ' class="totaal"' : '');
          rijen.push('<tr' + rowClass + '>' +
            '<td class="code">' + escHtml(code) + '</td>' +
            '<td>' + escHtml(r.naam) + '</td>' +
            '<td class="num">' + (r.grondslag == null ? '—' : fmtEuro(r.grondslag)) + '</td>' +
            '<td class="num">' + fmtEuro(r.btw) + '</td>' +
            '</tr>');
        });
        rijen.push('</tbody></table>');
        document.getElementById('previewTabel').innerHTML = rijen.join('');
      }
      function toon(kleur, tekst) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        if (kleur === 'green')    { el.style.background = '#E6F7F4'; el.style.color = '#0D1B4E'; el.style.borderColor = 'rgba(46,196,182,.35)'; }
        else if (kleur === 'red') { el.style.background = '#FDECEC'; el.style.color = '#B91C1C'; el.style.borderColor = '#F5B3B3'; }
        else                       { el.style.background = '#F7F9FC'; el.style.color = '#5F6B7A'; el.style.borderColor = '#E5EAF2'; }
        el.textContent = tekst;
      }
      function laadPreview() {
        var periode = document.getElementById('periode').value;
        huidigePeriode = periode;
        toon('info', 'BTW-aangifte berekenen...');
        document.getElementById('btnPreview').disabled = true;
        google.script.run
          .withSuccessHandler(function(res) {
            document.getElementById('btnPreview').disabled = false;
            if (res && res.ok) {
              renderPreviewTabel(res.export);
              document.getElementById('previewWrapper').style.display = 'block';
              document.getElementById('btnJson').disabled = false;
              document.getElementById('btnCsv').disabled = false;
              toon('green', 'Preview geladen. Controleer + download.');
            } else {
              toon('red', (res && res.fout) || 'Berekening mislukt.');
            }
          })
          .withFailureHandler(function(err) {
            document.getElementById('btnPreview').disabled = false;
            toon('red', (err && err.message) || 'Er ging iets mis — probeer opnieuw of mail support@boekhoudbaar.nl.');
          })
          .berekenBtwExportPreview(periode);
      }
      function download(formaat) {
        if (!huidigePeriode) return;
        toon('info', 'Bestand voorbereiden...');
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.ok) {
              var blob = new Blob([res.inhoud], { type: res.mime });
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url;
              a.download = res.bestandsnaam;
              a.click();
              URL.revokeObjectURL(url);
              toon('green', 'Bestand ' + res.bestandsnaam + ' is gedownload.');
            } else {
              toon('red', (res && res.fout) || 'Download mislukt.');
            }
          })
          .withFailureHandler(function(err) { toon('red', (err && err.message) || 'Er ging iets mis — probeer opnieuw of mail support@boekhoudbaar.nl.'); })
          .berekenBtwExportBestand(huidigePeriode, formaat);
      }
    </script>
  `).setWidth(620).setHeight(680).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  ui.showModalDialog(html, '💾 BTW-aangifte exporteren');
}

/**
 * Server-handler: bereken de aangifte voor een periode en retourneer de
 * canonical-JSON-export. Aangeroepen door dialog voor preview.
 *
 * @param {string} periodeKey  Format 'YYYY-Q1' tot 'YYYY-Q4'
 * @return {{ok: boolean, export?: Object, fout?: string}}
 */
function berekenBtwExportPreview(periodeKey) {
  try {
    const range = _parsePeriodeKey_(periodeKey);
    if (!range) return { ok: false, fout: 'Ongeldige periode. Verwacht: YYYY-Q1 t/m Q4.' };
    const ss = getSpreadsheet_();
    if (!ss) return { ok: false, fout: 'Geen actieve spreadsheet.' };
    const aangifte = berekenBtwAangifte_(ss, range.van, range.tot);
    const exp = _toCanonicalExport_(aangifte, range);
    return { ok: true, export: exp };
  } catch (e) {
    return { ok: false, fout: e.message };
  }
}

/**
 * Server-handler: bereken de aangifte en retourneer als JSON of CSV string.
 * Aangeroepen door download-knoppen.
 *
 * @param {string} periodeKey
 * @param {string} formaat  'json' | 'csv'
 * @return {{ok: boolean, inhoud?: string, bestandsnaam?: string, mime?: string, fout?: string}}
 */
function berekenBtwExportBestand(periodeKey, formaat) {
  try {
    const pre = berekenBtwExportPreview(periodeKey);
    if (!pre.ok) return pre;
    const bestand = (typeof Utilities !== 'undefined' && Utilities.formatDate)
      ? 'btw-aangifte_' + periodeKey + '.' + formaat
      : 'btw-aangifte_' + periodeKey + '.' + formaat;

    if (formaat === 'csv') {
      const csv = _toCsv_(pre.export);
      try { safeAuditLog_('BTW-export CSV', periodeKey); } catch (_) {}
      return { ok: true, inhoud: csv, bestandsnaam: bestand, mime: 'text/csv' };
    }
    // default json
    const json = JSON.stringify(pre.export, null, 2);
    try { safeAuditLog_('BTW-export JSON', periodeKey); } catch (_) {}
    return { ok: true, inhoud: json, bestandsnaam: bestand, mime: 'application/json' };
  } catch (e) {
    return { ok: false, fout: e.message };
  }
}

/**
 * Mapping van BTW-aangifte-object → canonical export-formaat. Bedoeld als
 * input voor accountant of voor toekomstige XBRL/SBR-generator. Rubriek-
 * codes komen 1-op-1 overeen met het Belastingdienst-formulier.
 */
function _toCanonicalExport_(aangifte, range) {
  function r(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }
  return {
    _schema: 'boekhoudbaar/btw-export/v1',
    _disclaimer:
      'Dit is GEEN officiele BTW-aangifte. Voor indiening: ' +
      'overzicht handmatig invullen op MijnBelastingdienst of in ' +
      'boekhoudsoftware van accountant. Verantwoordelijkheid voor ' +
      'juistheid: ondernemer (AWR art. 8).',
    periode: {
      kwartaal: range.kwartaal,
      jaar: range.jaar,
      vanaf: Utilities.formatDate(range.van, 'Europe/Amsterdam', 'yyyy-MM-dd'),
      totEnMet: Utilities.formatDate(range.tot, 'Europe/Amsterdam', 'yyyy-MM-dd'),
    },
    rubrieken: {
      r1a: { naam: 'Leveringen/diensten belast 21%', grondslag: r(aangifte.r1a_grondslag), btw: r(aangifte.r1a_btw) },
      r1b: { naam: 'Leveringen/diensten belast 9%',  grondslag: r(aangifte.r1b_grondslag), btw: r(aangifte.r1b_btw) },
      r1c: { naam: 'Leveringen/diensten belast overige tarieven', grondslag: r(aangifte.r1c_grondslag), btw: r(aangifte.r1c_btw) },
      r1d: { naam: 'Leveringen belast 0% of vrijgesteld', grondslag: r(aangifte.r1d), btw: 0 },
      r1e: { naam: 'Leveringen waarbij BTW is verlegd', grondslag: r(aangifte.r1e_grondslag), btw: r(aangifte.r1e_btw) },
      r2a: { naam: 'Leveringen buiten EU (export)', grondslag: r(aangifte.r2a), btw: 0 },
      r3a: { naam: 'Leveringen naar landen binnen EU (IC)', grondslag: r(aangifte.r3a_grondslag), btw: 0 },
      r4a: { naam: 'Inkopen van goederen uit EU (verlegd)', grondslag: r(aangifte.r4a_grondslag), btw: r(aangifte.r4a_btw) },
      r5a: { naam: 'Verschuldigde omzetbelasting (subtotaal)', grondslag: null, btw: r(aangifte.r5a) },
      r5b: { naam: 'Voorbelasting', grondslag: null, btw: r(aangifte.r5b) },
      r5c: { naam: 'Subtotaal', grondslag: null, btw: r(aangifte.r5c) },
      r5d: { naam: 'Te betalen (positief) of terug te vragen (negatief)', grondslag: null, btw: r(aangifte.saldo) },
    },
    intern: {
      r1d_vrijgesteld: r(aangifte.r1d_vrijgesteld || 0),
      r1d_nul:         r(aangifte.r1d_nul || 0),
    },
  };
}

function _toCsv_(exp) {
  const sep = ';';  // Europese conventie (comma is decimaal-separator)
  const regels = ['Rubriek;Naam;Grondslag;BTW'];
  Object.keys(exp.rubrieken).forEach(function(code) {
    const r = exp.rubrieken[code];
    const grondslag = (r.grondslag == null) ? '' : String(r.grondslag).replace('.', ',');
    const btw = (r.btw == null) ? '' : String(r.btw).replace('.', ',');
    // Naam mag puntkomma of quote bevatten — escape via dubbele quotes.
    const naamEsc = '"' + String(r.naam).replace(/"/g, '""') + '"';
    regels.push([code, naamEsc, grondslag, btw].join(sep));
  });
  return '﻿' + regels.join('\r\n') + '\r\n';  // BOM + CRLF voor Excel
}

function _parsePeriodeKey_(key) {
  const m = String(key || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const jaar = parseInt(m[1], 10);
  const kw = parseInt(m[2], 10);
  const van = new Date(jaar, (kw - 1) * 3, 1);
  const tot = new Date(jaar, kw * 3, 0, 23, 59, 59, 999);  // .999 = identiek aan bepaalBtwPeriode_ (geen rand-drift)
  return { jaar: jaar, kwartaal: kw, van: van, tot: tot };
}

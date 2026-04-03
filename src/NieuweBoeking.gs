/**
 * NieuweBoeking.gs
 * De enige invoer-entry point voor het hele systeem.
 * 1 dialoog – 4 flows (factuur / kosten / declaratie / upload+AI).
 * Vervangt InvoerenDialog.gs volledig.
 */

// ─── ENTRY POINT ─────────────────────────────
function openNieuweBoeking() {
  const ctx  = getBoekingContext();
  const kleur = ctx.kleur || '#1A237E';
  const kleurLicht = _hexNaarRgba_(kleur, 0.08);
  const kleurMidden = _hexNaarRgba_(kleur, 0.15);

  const btwOpties = (ctx.btwKeuzes || [])
    .map(function(k){ return '<option>' + k + '</option>'; }).join('');
  const catOpties = (ctx.categorieen || [])
    .map(function(c){ return '<option>' + c + '</option>'; }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
:root{--pk:${kleur};--pk-licht:${kleurLicht};--pk-mid:${kleurMidden}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#212121;background:#F8F9FA;height:100vh;display:flex;flex-direction:column}
/* ── TABBAR ── */
.tabbar{display:flex;background:white;border-bottom:2px solid #E0E0E0;flex-shrink:0}
.tab{flex:1;padding:10px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:bold;
     color:#777;border-bottom:3px solid transparent;transition:all 0.15s;user-select:none}
.tab:hover{color:var(--pk);background:var(--pk-licht)}
.tab.actief{color:var(--pk);border-bottom-color:var(--pk);background:var(--pk-licht)}
.tab .icon{display:block;font-size:20px;margin-bottom:2px}
/* ── PANELS ── */
.panels{flex:1;overflow:auto;padding:14px 16px}
.panel{display:none;animation:fadeIn 0.15s ease}
.panel.actief{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
/* ── FORMULIER ELEMENTEN ── */
.rij{display:flex;gap:10px;margin-bottom:9px}
.rij>.veld{flex:1}
.veld label{display:block;font-size:10px;font-weight:bold;color:#666;text-transform:uppercase;
            letter-spacing:0.4px;margin-bottom:3px}
input[type=text],input[type=email],input[type=number],input[type=date],select,textarea{
  width:100%;padding:7px 9px;border:1.5px solid #DDD;border-radius:5px;font-size:13px;
  font-family:Arial,sans-serif;transition:border-color 0.15s;background:white}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--pk)}
input.fout,select.fout{border-color:#c62828;background:#FFF5F5}
input.ok{border-color:#2e7d32}
.foutmelding{font-size:11px;color:#c62828;margin-top:2px;display:none}
.foutmelding.zichtbaar{display:block}
/* ── REGELLIJST ── */
.regeltabel{width:100%;border-collapse:collapse;margin:6px 0}
.regeltabel th{font-size:10px;color:#888;font-weight:bold;text-transform:uppercase;
               padding:0 4px 4px;text-align:left}
.regeltabel td{padding:3px 4px;vertical-align:top}
.regeltabel input{padding:5px 7px;font-size:12px}
.regeltabel .verwijder{background:none;border:none;color:#ccc;cursor:pointer;font-size:16px;
                        padding:4px;line-height:1;transition:color 0.15s}
.regeltabel .verwijder:hover{color:#c62828}
.regel-toevoegen{font-size:12px;color:var(--pk);cursor:pointer;background:none;border:none;
                  padding:4px 0;text-decoration:underline;margin-top:4px}
/* ── TOTALEN ── */
.totalen{background:var(--pk-licht);border:1px solid var(--pk-mid);border-radius:6px;
          padding:10px 14px;margin:10px 0;font-size:13px}
.totalen table{width:100%;border-collapse:collapse}
.totalen td{padding:2px 0}
.totalen td:last-child{text-align:right;font-weight:bold}
.totalen .eindtotaal td{border-top:1.5px solid var(--pk);padding-top:6px;font-size:15px;color:var(--pk)}
/* ── UPLOAD ── */
.dropzone{border:2px dashed #C5CAE9;border-radius:8px;padding:24px;text-align:center;
           cursor:pointer;transition:all 0.2s;background:white;min-height:110px;
           display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.dropzone:hover,.dropzone.dragover{border-color:var(--pk);background:var(--pk-licht)}
.dropzone.geladen{border-color:#2e7d32;background:#F0FFF4}
.dropzone .icoon{font-size:32px}
.dropzone p{color:#666;font-size:12px}
/* ── AI STATUS ── */
.ai-balk{background:#E8EAF6;border-radius:5px;padding:8px 12px;font-size:12px;
          margin:8px 0;display:none;align-items:center;gap:8px}
.ai-balk.actief{display:flex}
.ai-balk.ok{background:#E8F5E9}
.ai-balk.fout{background:#FFEBEE}
.spinner{width:16px;height:16px;border:2px solid #ccc;border-top-color:var(--pk);
          border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
/* ── SPRAAK ── */
.spraak-rij{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.spraak-btn{background:var(--pk);color:white;border:none;border-radius:20px;
             padding:5px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px}
.spraak-btn.luistert{background:#c62828;animation:puls 1s infinite}
@keyframes puls{0%,100%{opacity:1}50%{opacity:.6}}
.spraak-status{font-size:11px;color:#888;font-style:italic;flex:1}
/* ── FOOTER ── */
.footer{background:white;border-top:1px solid #E0E0E0;padding:10px 16px;
         display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0}
.btn{padding:9px 20px;border:none;border-radius:5px;cursor:pointer;font-size:13px;
      font-weight:bold;transition:all 0.15s}
.btn-pri{background:var(--pk);color:white}
.btn-pri:hover{opacity:0.9}
.btn-pri:disabled{background:#9E9E9E;cursor:not-allowed}
.btn-sec{background:#E8EAF6;color:var(--pk)}
.btn-sec:hover{background:#C5CAE9}
/* ── BEVESTIGING ── */
.klaar{text-align:center;padding:30px 20px}
.klaar .groot-icoon{font-size:52px;margin-bottom:12px}
.klaar h3{color:var(--pk);font-size:18px;margin-bottom:8px}
.klaar p{color:#555;font-size:13px;line-height:1.6}
/* ── SECTIELABELS ── */
.sectie{font-size:10px;font-weight:bold;color:var(--pk);text-transform:uppercase;
         letter-spacing:0.5px;margin:12px 0 6px;padding-bottom:3px;
         border-bottom:1px solid var(--pk-mid)}
/* ── KLEIN HULPTEKST ── */
.tip{background:#FFF8E1;border-left:3px solid #FFC107;padding:7px 10px;
      font-size:11px;border-radius:0 4px 4px 0;margin:6px 0;line-height:1.5}
</style>
</head>
<body>

<!-- TABBAR -->
<div class="tabbar">
  <div class="tab actief" id="tab-factuur" onclick="wisselTab('factuur')">
    <span class="icon">🧾</span>Factuur
  </div>
  <div class="tab" id="tab-kosten" onclick="wisselTab('kosten')">
    <span class="icon">💸</span>Kosten
  </div>
  <div class="tab" id="tab-declaratie" onclick="wisselTab('declaratie')">
    <span class="icon">📤</span>Declaratie
  </div>
  <div class="tab" id="tab-upload" onclick="wisselTab('upload')">
    <span class="icon">📸</span>Upload + AI
  </div>
</div>

<!-- PANELS -->
<div class="panels">

<!-- ════ FACTUUR ════ -->
<div class="panel actief" id="panel-factuur">
  <div class="spraak-rij">
    <button class="spraak-btn" id="spraak-factuur" onclick="startSpraak('factuur')">🎤 Spraak</button>
    <span class="spraak-status" id="spraakstatus-factuur">Spreek in: "factuur 500 euro advies aan Janssen"</span>
  </div>
  <div class="rij">
    <div class="veld" style="flex:2">
      <label>Klantnaam *</label>
      <input type="text" id="f-klant" placeholder="Naam van de klant" oninput="valideerVeld('factuur','klant',this)">
      <div class="foutmelding" id="fm-f-klant"></div>
    </div>
    <div class="veld">
      <label>Factuurdatum *</label>
      <input type="date" id="f-datum" oninput="valideerVeld('factuur','datum',this)">
    </div>
  </div>
  <div class="rij">
    <div class="veld">
      <label>E-mail klant</label>
      <input type="email" id="f-email" placeholder="klant@voorbeeld.nl">
    </div>
    <div class="veld">
      <label>Betalingstermijn</label>
      <select id="f-termijn">
        <option value="14">14 dagen</option>
        <option value="30" selected>30 dagen</option>
        <option value="60">60 dagen</option>
        <option value="90">90 dagen</option>
      </select>
    </div>
    <div class="veld">
      <label>BTW tarief</label>
      <select id="f-btw" onchange="herbereken()">${btwOpties}</select>
    </div>
  </div>

  <div class="sectie">Factuurregels</div>
  <table class="regeltabel">
    <colgroup><col style="width:42%"><col style="width:15%"><col style="width:22%"><col style="width:16%"><col style="width:5%"></colgroup>
    <thead><tr>
      <th>Omschrijving *</th><th>Aantal</th><th>Prijs excl. BTW</th><th>Totaal</th><th></th>
    </tr></thead>
    <tbody id="regels-body">
      <tr id="regel-1">
        <td><input type="text" id="f-r1omschr" placeholder="Bijv. Webdesign" oninput="herbereken();valideerVeld('factuur','r1omschr',this)"></td>
        <td><input type="number" id="f-r1aantal" value="1" min="0.01" step="any" oninput="herbereken()"></td>
        <td><input type="number" id="f-r1prijs" placeholder="0,00" min="0" step="any" oninput="herbereken();valideerVeld('factuur','r1prijs',this)"></td>
        <td><input type="text" id="f-r1tot" readonly tabindex="-1" style="background:#F5F5F5;color:#555"></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <button class="regel-toevoegen" onclick="voegRegelToe()" id="btn-meer-regels">+ Nog een regel</button>
  <div class="foutmelding" id="fm-f-r1prijs"></div>
  <div class="foutmelding" id="fm-f-r1omschr"></div>

  <div class="totalen">
    <table>
      <tr><td>Subtotaal excl. BTW</td><td id="tot-excl">€ 0,00</td></tr>
      <tr><td id="tot-btw-label">BTW (21%)</td><td id="tot-btw">€ 0,00</td></tr>
      <tr class="eindtotaal"><td>Totaal te betalen</td><td id="tot-incl">€ 0,00</td></tr>
    </table>
  </div>
  <div class="rij">
    <div class="veld">
      <label>Referentie / projectcode</label>
      <input type="text" id="f-ref" placeholder="Optioneel">
    </div>
    <div class="veld">
      <label>Notities (intern)</label>
      <input type="text" id="f-notities" placeholder="Niet zichtbaar op factuur">
    </div>
  </div>
  <div class="rij">
    <div class="veld" style="flex:2">
      <label>Factuuradres klant</label>
      <input type="text" id="f-klantadres" placeholder="Straat, postcode, stad">
    </div>
  </div>
  <div class="rij">
    <div class="veld">
      <label>KvK-nummer klant</label>
      <input type="text" id="f-kvk" placeholder="Optioneel">
    </div>
    <div class="veld">
      <label>BTW-nummer klant</label>
      <input type="text" id="f-btwnr" placeholder="Bijv. NL000000000B01">
    </div>
  </div>
</div>

<!-- ════ KOSTEN ════ -->
<div class="panel" id="panel-kosten">
  <div class="spraak-rij">
    <button class="spraak-btn" id="spraak-kosten" onclick="startSpraak('kosten')">🎤 Spraak</button>
    <span class="spraak-status" id="spraakstatus-kosten">Bijv. "55 euro benzine bij Shell gisteren"</span>
  </div>
  <div class="rij">
    <div class="veld" style="flex:2">
      <label>Leverancier / winkel *</label>
      <input type="text" id="k-leverancier" placeholder="Naam van de leverancier" oninput="valideerVeld('kosten','leverancier',this)">
      <div class="foutmelding" id="fm-k-leverancier"></div>
    </div>
    <div class="veld">
      <label>Datum *</label>
      <input type="date" id="k-datum" oninput="valideerVeld('kosten','datum',this)">
    </div>
  </div>
  <div class="rij">
    <div class="veld" style="flex:2">
      <label>Omschrijving *</label>
      <input type="text" id="k-omschr" placeholder="Wat is er gekocht?" oninput="valideerVeld('kosten','omschr',this)">
      <div class="foutmelding" id="fm-k-omschr"></div>
    </div>
    <div class="veld">
      <label>Categorie</label>
      <select id="k-cat"><option value="">-- Kies --</option>${catOpties}</select>
    </div>
  </div>
  <div class="rij">
    <div class="veld">
      <label>Totaal incl. BTW (€) *</label>
      <input type="number" id="k-incl" placeholder="0,00" min="0" step="any"
             oninput="berekenKosten();valideerVeld('kosten','bedragIncl',this)">
      <div class="foutmelding" id="fm-k-bedragIncl"></div>
    </div>
    <div class="veld">
      <label>BTW tarief</label>
      <select id="k-btw" onchange="berekenKosten()">${btwOpties}</select>
    </div>
    <div class="veld">
      <label>Bedrag excl. BTW</label>
      <input type="text" id="k-excl" readonly tabindex="-1" style="background:#F5F5F5;color:#555">
    </div>
  </div>
  <div class="rij">
    <div class="veld">
      <label>Factuurnummer leverancier</label>
      <input type="text" id="k-factnr" placeholder="Optioneel">
    </div>
  </div>
  <div class="tip">💡 Upload een bon via het tabblad <b>📸 Upload + AI</b> voor automatisch invullen.</div>
</div>

<!-- ════ DECLARATIE ════ -->
<div class="panel" id="panel-declaratie">
  <div class="spraak-rij">
    <button class="spraak-btn" id="spraak-declaratie" onclick="startSpraak('declaratie')">🎤 Spraak</button>
    <span class="spraak-status" id="spraakstatus-declaratie">Bijv. "treinkaartje 24 euro privé betaald"</span>
  </div>
  <div class="tip" style="margin-bottom:10px">💡 Gebruik dit als u <b>privé heeft betaald</b> voor een zakelijke uitgave en het bedrag wilt terugvorderen.</div>
  <div class="rij">
    <div class="veld" style="flex:2">
      <label>Omschrijving *</label>
      <input type="text" id="d-omschr" placeholder="Wat heeft u betaald?" oninput="valideerVeld('declaratie','omschr',this)">
      <div class="foutmelding" id="fm-d-omschr"></div>
    </div>
    <div class="veld">
      <label>Datum *</label>
      <input type="date" id="d-datum" oninput="valideerVeld('declaratie','datum',this)">
    </div>
  </div>
  <div class="rij">
    <div class="veld">
      <label>Bedrag (€) *</label>
      <input type="number" id="d-bedrag" placeholder="0,00" min="0.01" step="any"
             oninput="valideerVeld('declaratie','bedrag',this)">
      <div class="foutmelding" id="fm-d-bedrag"></div>
    </div>
    <div class="veld">
      <label>BTW tarief</label>
      <select id="d-btw">${btwOpties}</select>
    </div>
    <div class="veld">
      <label>Betaald door</label>
      <input type="text" id="d-door" placeholder="Uw naam">
    </div>
  </div>
  <div class="veld">
    <label>Toelichting</label>
    <input type="text" id="d-toelichting" placeholder="Optioneel — reden van declaratie">
  </div>
</div>

<!-- ════ UPLOAD + AI ════ -->
<div class="panel" id="panel-upload">
  <div class="sectie">Stap 1 — Upload uw bon of factuur</div>
  <div class="dropzone" id="dropzone" onclick="document.getElementById('bon-file').click()">
    <span class="icoon">📷</span>
    <strong id="dz-titel">Klik hier of sleep een bestand</strong>
    <p>JPG, PNG, PDF — max 10 MB</p>
  </div>
  <input type="file" id="bon-file" accept="image/*,.pdf" style="display:none" onchange="bonGekozen(this)">

  <div class="ai-balk" id="ai-balk">
    <div class="spinner" id="ai-spinner"></div>
    <span id="ai-tekst">AI scant uw document...</span>
  </div>

  <div id="upload-velden" style="display:none">
    <div class="sectie">Stap 2 — Controleer &amp; corrigeer</div>
    <div class="rij">
      <div class="veld" style="flex:2">
        <label>Leverancier</label>
        <input type="text" id="u-leverancier" placeholder="Naam leverancier">
      </div>
      <div class="veld">
        <label>Datum</label>
        <input type="date" id="u-datum">
      </div>
    </div>
    <div class="rij">
      <div class="veld" style="flex:2">
        <label>Omschrijving</label>
        <input type="text" id="u-omschr" placeholder="Wat staat er op de bon?">
      </div>
      <div class="veld">
        <label>Categorie</label>
        <select id="u-cat"><option value="">-- Kies --</option>${catOpties}</select>
      </div>
    </div>
    <div class="rij">
      <div class="veld">
        <label>Totaal incl. BTW (€)</label>
        <input type="number" id="u-incl" min="0" step="any">
      </div>
      <div class="veld">
        <label>BTW %</label>
        <select id="u-btw">${btwOpties}</select>
      </div>
      <div class="veld">
        <label>Boeken als</label>
        <select id="u-type" onchange="wisselUploadType()">
          <option value="kosten">💸 Kosten (zakelijk betaald)</option>
          <option value="declaratie">📤 Declaratie (privé betaald)</option>
        </select>
      </div>
    </div>
    <div class="rij" id="u-door-rij" style="display:none">
      <div class="veld">
        <label>Betaald door</label>
        <input type="text" id="u-door" placeholder="Uw naam">
      </div>
    </div>
  </div>
</div>

</div><!-- /panels -->

<!-- FOOTER -->
<div class="footer">
  <span id="footer-status" style="flex:1;font-size:11px;color:#888;font-style:italic"></span>
  <button class="btn btn-sec" onclick="google.script.host.close()">Annuleer</button>
  <button class="btn btn-pri" id="btn-bevestig" onclick="bevestig()">✅ Opslaan</button>
</div>

<script>
/* ── STATE ── */
var ACTIEF_TAB = 'factuur';
var REGEL_TELLER = 1;
var MAX_REGELS = 5;
var BON_B64 = null;
var BON_MIME = null;
var HERKENNER = null;

/* ── INIT ── */
(function init(){
  // Datums instellen op vandaag
  var vandaag = '${ctx.vandaag}';
  ['f-datum','k-datum','d-datum','u-datum'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = vandaag;
  });
  // BTW standaard
  var btwStd = '${ctx.btwStandaard}';
  setSelect('f-btw', btwStd);
  setSelect('k-btw', btwStd);
  setSelect('d-btw', btwStd);
  setSelect('u-btw', btwStd);
  herbereken();
})();

function setSelect(id, waarde) {
  var s = document.getElementById(id);
  if(!s) return;
  for(var i=0;i<s.options.length;i++){
    if(s.options[i].value === waarde || s.options[i].text === waarde){
      s.selectedIndex = i; break;
    }
  }
}

/* ── TAB NAVIGATIE ── */
function wisselTab(type) {
  ACTIEF_TAB = type;
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('actief'); });
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('actief'); });
  document.getElementById('tab-' + type).classList.add('actief');
  document.getElementById('panel-' + type).classList.add('actief');
  document.getElementById('btn-bevestig').textContent = type === 'upload' ? '✅ Bon opslaan' : '✅ Opslaan';
  document.getElementById('footer-status').textContent = '';
}

/* ── FACTUUR: REGELS ── */
function voegRegelToe() {
  if(REGEL_TELLER >= MAX_REGELS) return;
  REGEL_TELLER++;
  var n = REGEL_TELLER;
  var tr = document.createElement('tr');
  tr.id = 'regel-' + n;
  tr.innerHTML = '<td><input type="text" id="f-r'+n+'omschr" placeholder="Omschrijving" oninput="herbereken()"></td>'
    + '<td><input type="number" id="f-r'+n+'aantal" value="1" min="0" step="any" oninput="herbereken()"></td>'
    + '<td><input type="number" id="f-r'+n+'prijs" placeholder="0,00" min="0" step="any" oninput="herbereken()"></td>'
    + '<td><input type="text" id="f-r'+n+'tot" readonly tabindex="-1" style="background:#F5F5F5;color:#555"></td>'
    + '<td><button class="verwijder" onclick="verwijderRegel('+n+')" title="Verwijder regel">\xd7</button></td>';
  document.getElementById('regels-body').appendChild(tr);
  if(REGEL_TELLER >= MAX_REGELS) document.getElementById('btn-meer-regels').style.display='none';
  document.getElementById('f-r'+n+'omschr').focus();
}

function verwijderRegel(n) {
  var tr = document.getElementById('regel-'+n);
  if(tr) tr.remove();
  document.getElementById('btn-meer-regels').style.display='';
  herbereken();
}

/* ── BTW BEREKENING FACTUUR ── */
function fmt(n){ return '\u20ac\u00a0' + parseFloat(n||0).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function btwPct(sel){
  var v = document.getElementById(sel).value;
  return v.includes('21') ? 0.21 : v.includes('9') ? 0.09 : 0;
}

function herbereken() {
  var excl = 0;
  for(var i=1;i<=REGEL_TELLER;i++){
    var omEl = document.getElementById('f-r'+i+'omschr');
    if(!omEl) continue;
    var a = parseFloat((document.getElementById('f-r'+i+'aantal')||{}).value||0);
    var p = parseFloat((document.getElementById('f-r'+i+'prijs')||{}).value||0);
    var tot = Math.round(a*p*100)/100;
    var totEl = document.getElementById('f-r'+i+'tot');
    if(totEl) totEl.value = tot>0 ? fmt(tot) : '';
    excl += tot;
  }
  var pct = btwPct('f-btw');
  var btw = Math.round(excl*pct*100)/100;
  var incl = Math.round((excl+btw)*100)/100;
  document.getElementById('tot-excl').textContent = fmt(excl);
  document.getElementById('tot-btw').textContent  = fmt(btw);
  document.getElementById('tot-incl').textContent = fmt(incl);
  var btwLabel = document.getElementById('f-btw').value.match(/\d+%/);
  document.getElementById('tot-btw-label').textContent = 'BTW (' + (btwLabel ? btwLabel[0] : '0%') + ')';
}

/* ── BTW BEREKENING KOSTEN ── */
function berekenKosten() {
  var incl = parseFloat(document.getElementById('k-incl').value||0);
  var pct  = btwPct('k-btw');
  var excl = pct>0 ? Math.round(incl/(1+pct)*100)/100 : incl;
  document.getElementById('k-excl').value = incl>0 ? fmt(excl) : '';
}

/* ── REALTIME VALIDATIE ── */
var REGELS = {
  factuur:    { klant: function(v){return v.trim().length>=2;}, datum: function(v){return /\d{4}-\d{2}-\d{2}/.test(v);}, r1omschr: function(v){return v.trim().length>=2;}, r1prijs: function(v){return parseFloat(v)>0;} },
  kosten:     { leverancier: function(v){return v.trim().length>=2;}, datum: function(v){return /\d{4}-\d{2}-\d{2}/.test(v);}, omschr: function(v){return v.trim().length>=3;}, bedragIncl: function(v){return parseFloat(v)>0;} },
  declaratie: { omschr: function(v){return v.trim().length>=3;}, datum: function(v){return /\d{4}-\d{2}-\d{2}/.test(v);}, bedrag: function(v){return parseFloat(v)>0;} },
};
var BERICHTEN = {
  klant: 'Minimaal 2 tekens vereist.', datum: 'Ongeldige datum.', r1omschr: 'Omschrijving verplicht.',
  r1prijs: 'Voer een bedrag > \u20ac\u00a00 in.', leverancier: 'Minimaal 2 tekens.', omschr: 'Minimaal 3 tekens.',
  bedragIncl: 'Bedrag > \u20ac\u00a00 vereist.', bedrag: 'Bedrag > \u20ac\u00a00 vereist.',
};

function valideerVeld(type, veld, el) {
  var fn = (REGELS[type]||{})[veld];
  if(!fn) return true;
  var ok = fn(el.value);
  el.classList.toggle('fout', !ok);
  el.classList.toggle('ok', ok);
  var fm = document.getElementById('fm-' + (type==='factuur'?'f':type==='kosten'?'k':'d') + '-' + veld);
  if(fm){ fm.textContent = ok ? '' : (BERICHTEN[veld]||'Verplicht veld.'); fm.classList.toggle('zichtbaar',!ok); }
  return ok;
}

function valideerTab(type) {
  var prefMap = { factuur:'f', kosten:'k', declaratie:'d' };
  var pref = prefMap[type] || type;
  var regels = REGELS[type] || {};
  var idMap = { 'k-bedragIncl': 'k-incl' };
  var ok = true;
  Object.keys(regels).forEach(function(veld){
    var gebouwdId = pref + '-' + veld;
    var elId = idMap[gebouwdId] || gebouwdId;
    var el = document.getElementById(elId);
    if(el && !valideerVeld(type, veld, el)) ok = false;
  });
  return ok;
}

/* ── BEVESTIG (SUBMIT) ── */
function bevestig() {
  var btn = document.getElementById('btn-bevestig');
  btn.disabled = true;
  btn.textContent = 'Bezig...';
  document.getElementById('footer-status').textContent = '';

  var type = ACTIEF_TAB;
  var data = {};

  if (type === 'factuur') {
    if (!valideerTab('factuur')) { btn.disabled=false; btn.textContent='\u2705 Opslaan'; return; }
    data = {
      klant: val('f-klant'), datum: val('f-datum'), email: val('f-email'),
      termijn: val('f-termijn'), btw: val('f-btw'), referentie: val('f-ref'),
      notities: val('f-notities'),
      klantAdres: val('f-klantadres'), kvkKlant: val('f-kvk'), btwNrKlant: val('f-btwnr'),
    };
    for(var i=1;i<=REGEL_TELLER;i++){
      var o=val('f-r'+i+'omschr'), p=val('f-r'+i+'prijs'), a=val('f-r'+i+'aantal');
      if(o){ data['r'+i+'omschr']=o; data['r'+i+'prijs']=parseFloat(p)||0; data['r'+i+'aantal']=parseFloat(a)||1; }
    }

  } else if (type === 'kosten') {
    if (!valideerTab('kosten')) { btn.disabled=false; btn.textContent='\u2705 Opslaan'; return; }
    data = {
      leverancier: val('k-leverancier'), datum: val('k-datum'), omschr: val('k-omschr'),
      categorie: val('k-cat'), bedragIncl: parseFloat(val('k-incl'))||0,
      btw: val('k-btw'), factuurnrLev: val('k-factnr'),
    };

  } else if (type === 'declaratie') {
    if (!valideerTab('declaratie')) { btn.disabled=false; btn.textContent='\u2705 Opslaan'; return; }
    data = {
      omschr: val('d-omschr'), datum: val('d-datum'),
      bedrag: parseFloat(val('d-bedrag'))||0,
      btw: val('d-btw'), betaaldDoor: val('d-door'), toelichting: val('d-toelichting'),
    };

  } else if (type === 'upload') {
    // upload → verwerk als kosten of declaratie
    if (!BON_B64) { toonStatus('Upload eerst een bon.','#c62828'); btn.disabled=false; btn.textContent='\u2705 Bon opslaan'; return; }
    var subType = val('u-type');
    data = {
      leverancier: val('u-leverancier'), datum: val('u-datum'), omschr: val('u-omschr'),
      categorie: val('u-cat'), bedragIncl: parseFloat(val('u-incl'))||0,
      btw: val('u-btw'), bonBase64: BON_B64, bonMime: BON_MIME,
    };
    if (subType === 'declaratie') {
      data.bedrag = data.bedragIncl;
      data.betaaldDoor = val('u-door');
    }
    type = subType;
  }

  google.script.run
    .withSuccessHandler(function(r) {
      toonKlaar(r);
    })
    .withFailureHandler(function(e) {
      toonStatus('\u274c Opslaan mislukt. Controleer uw invoer en probeer opnieuw.', '#c62828');
      btn.disabled = false;
      btn.textContent = '\u2705 Opslaan';
    })
    .submitNieuweBoeking(type, data);
}

function val(id) {
  var el = document.getElementById(id);
  return el ? el.value : '';
}

function wisselUploadType() {
  var isDecl = val('u-type') === 'declaratie';
  document.getElementById('u-door-rij').style.display = isDecl ? '' : 'none';
}

function toonStatus(tekst, kleur) {
  var el = document.getElementById('footer-status');
  el.textContent = tekst;
  el.style.color = kleur || '#555';
}

function toonKlaar(r) {
  // Vervang panels met succes-melding
  document.querySelector('.panels').innerHTML =
    '<div class="klaar">'
    + '<div class="groot-icoon">\u2705</div>'
    + '<h3>' + (r.factuurnummer ? 'Factuur ' + r.factuurnummer + ' aangemaakt!' : 'Opgeslagen!') + '</h3>'
    + '<p>' + escHtml(r.bericht || '') + '</p>'
    + (r.emailVerzonden ? '<p style="margin-top:8px;color:#2e7d32">\ud83d\udce7 E-mail verstuurd!</p>' : '')
    + (r.bonUrl ? '<p style="margin-top:8px;color:#2e7d32">\ud83d\udcc4 Bon opgeslagen in Google Drive.</p>' : '')
    + '</div>';
  document.querySelector('.tabbar').style.display = 'none';
  var footer = document.querySelector('.footer');
  footer.innerHTML = '<button class="btn btn-pri" onclick="google.script.host.close()">Sluiten</button>'
    + '<button class="btn btn-sec" onclick="window.location.reload()">Nog een boeking</button>';
}

function escHtml(s) {
  return String(s).replace(/[&<>"\']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ── SPRAAK ── */
function startSpraak(type) {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var btnId = 'spraak-' + type;
  var statusId = 'spraakstatus-' + type;
  if (!SpeechRec) { document.getElementById(statusId).textContent = 'Spraak niet beschikbaar in deze browser.'; return; }
  if (HERKENNER) { HERKENNER.stop(); return; }
  HERKENNER = new SpeechRec();
  HERKENNER.lang = 'nl-NL';
  HERKENNER.onstart = function() {
    document.getElementById(btnId).classList.add('luistert');
    document.getElementById(btnId).textContent = '\u23f9 Stop';
    document.getElementById(statusId).textContent = 'Luisteren...';
  };
  HERKENNER.onresult = function(e) {
    var tekst = e.results[0][0].transcript;
    document.getElementById(statusId).textContent = 'Verwerken: \u201c' + tekst + '\u201d';
    google.script.run
      .withSuccessHandler(function(velden) {
        vulSpraakVelden(type, velden);
        document.getElementById(statusId).textContent = '\u2713 Ingevuld via spraak \u2014 controleer de gegevens';
      })
      .withFailureHandler(function() {
        document.getElementById(statusId).textContent = 'Kon niet verwerken. Probeer opnieuw.';
      })
      .parseBoekingSpraakinvoer(type, tekst);
  };
  HERKENNER.onerror = function(e) {
    document.getElementById(statusId).textContent = 'Fout: ' + e.error;
  };
  HERKENNER.onend = function() {
    HERKENNER = null;
    var btn = document.getElementById(btnId);
    btn.classList.remove('luistert');
    btn.textContent = '\ud83c\udf99 Spraak';
  };
  HERKENNER.start();
}

function vulSpraakVelden(type, v) {
  if (!v) return;
  if (type === 'factuur') {
    if (v.klant)    document.getElementById('f-klant').value    = v.klant;
    if (v.r1omschr) document.getElementById('f-r1omschr').value = v.r1omschr;
    if (v.r1prijs)  document.getElementById('f-r1prijs').value  = v.r1prijs;
    if (v.r1aantal) document.getElementById('f-r1aantal').value = v.r1aantal;
    if (v.email)    document.getElementById('f-email').value    = v.email;
    herbereken();
  } else if (type === 'kosten') {
    if (v.leverancier) document.getElementById('k-leverancier').value = v.leverancier;
    if (v.omschr)      document.getElementById('k-omschr').value      = v.omschr;
    if (v.bedragIncl)  { document.getElementById('k-incl').value = v.bedragIncl; berekenKosten(); }
    if (v.btw)         setSelect('k-btw', v.btw);
    if (v.categorie)   setSelect('k-cat', v.categorie);
  } else if (type === 'declaratie') {
    if (v.omschr)   document.getElementById('d-omschr').value   = v.omschr;
    if (v.bedrag)   document.getElementById('d-bedrag').value   = v.bedrag;
    if (v.toelichting) document.getElementById('d-toelichting').value = v.toelichting;
  }
}

/* ── UPLOAD + AI ── */
function bonGekozen(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('Bestand te groot (max 10 MB).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var parts = e.target.result.split(',');
    BON_B64 = parts[1];
    BON_MIME = file.type || 'image/jpeg';
    var dz = document.getElementById('dropzone');
    dz.classList.add('geladen');
    document.getElementById('dz-titel').textContent = '\u2713 ' + file.name;

    var balk = document.getElementById('ai-balk');
    balk.className = 'ai-balk actief';
    document.getElementById('ai-tekst').textContent = 'AI scant uw document\u2026';
    document.getElementById('ai-spinner').style.display = 'block';

    google.script.run
      .withSuccessHandler(function(scan) {
        if (scan.fout) {
          balk.className = 'ai-balk actief fout';
          document.getElementById('ai-tekst').textContent = scan.fout;
          document.getElementById('ai-spinner').style.display = 'none';
        } else {
          balk.className = 'ai-balk actief ok';
          document.getElementById('ai-tekst').textContent = '\u2705 AI herkend \u2014 controleer de gegevens hieronder';
          document.getElementById('ai-spinner').style.display = 'none';
          vulUploadVelden(scan);
        }
        document.getElementById('upload-velden').style.display = 'block';
      })
      .withFailureHandler(function(e) {
        balk.className = 'ai-balk actief fout';
        document.getElementById('ai-tekst').textContent = 'AI fout: ' + e.message;
        document.getElementById('ai-spinner').style.display = 'none';
        document.getElementById('upload-velden').style.display = 'block';
      })
      .scanBoekingDocument(BON_B64, BON_MIME);
  };
  reader.readAsDataURL(file);
}

function vulUploadVelden(s) {
  if (s.leverancier) document.getElementById('u-leverancier').value = s.leverancier;
  if (s.datum)       document.getElementById('u-datum').value       = s.datum;
  if (s.omschrijving) document.getElementById('u-omschr').value     = s.omschrijving;
  if (s.bedragIncl > 0) document.getElementById('u-incl').value    = s.bedragIncl;
  if (s.btwPercentage === 21) setSelect('u-btw','21% (hoog)');
  else if (s.btwPercentage === 9) setSelect('u-btw','9% (laag)');
  if (s.categorie) setSelect('u-cat', s.categorie);
}

/* ── DRAG & DROP ── */
(function() {
  var dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', function(e){ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', function(){ dz.classList.remove('dragover'); });
  dz.addEventListener('drop', function(e){
    e.preventDefault(); dz.classList.remove('dragover');
    var f = e.dataTransfer.files[0];
    if(f){ var inp=document.getElementById('bon-file'); var dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files; bonGekozen(inp); }
  });
})();

</script>
</body></html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(720).setHeight(640),
    '+ Nieuwe boeking'
  );
}

// Helper: hex kleur naar rgba string
function _hexNaarRgba_(hex, alpha) {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+alpha+')';
  } catch(e) { return 'rgba(26,35,126,'+alpha+')'; }
}

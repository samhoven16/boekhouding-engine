/**
 * InvoerenDialog.gs
 * Hub-dialoog voor facturen, kosten en declaraties.
 * Vervangt het Google Formulier met ingebouwde invoerdialogen.
 * Bevat: spraakinvoer (Web Speech API), AI-scan van bonnen (Gemini Vision),
 * live BTW-berekening, invoervalidatie en e-mailbevestiging.
 */

// ─────────────────────────────────────────────
//  HELPER DATA VOOR DIALOGEN
// ─────────────────────────────────────────────
function getDialoogHulpdata() {
  const props = PropertiesService.getScriptProperties();
  return {
    btwKeuzes: BTW_KEUZES,
    kategorieën: KOSTEN_CATEGORIEEN,
    bedrijfsnaam: getInstelling_('Bedrijfsnaam') || '',
    vandaag: new Date().toISOString().slice(0, 10),
  };
}

// ─────────────────────────────────────────────
//  HUB DIALOOG — KEUZE INVOERTYPE
// ─────────────────────────────────────────────
function openNieuwInvoeren() {
  const html = HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head>
<style>
  body{font-family:Arial,sans-serif;padding:20px;margin:0;background:#F5F5F5}
  h2{color:#1A237E;margin:0 0 6px;font-size:18px}
  .sub{color:#666;font-size:13px;margin-bottom:20px}
  .cards{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .card{background:white;border-radius:10px;padding:22px 18px;text-align:center;
        cursor:pointer;width:155px;box-shadow:0 2px 8px rgba(0,0,0,0.08);
        transition:all 0.15s;border:2px solid transparent}
  .card:hover{border-color:#1A237E;box-shadow:0 4px 16px rgba(26,35,126,0.15);transform:translateY(-2px)}
  .icon{font-size:38px;margin-bottom:10px;display:block}
  .card h3{margin:0 0 6px;font-size:15px;color:#1A237E}
  .card p{margin:0;font-size:11px;color:#777;line-height:1.4}
  .upload-link{margin-top:18px;text-align:center;font-size:12px;color:#888}
  .upload-link a{color:#1A237E;cursor:pointer;text-decoration:underline}
</style>
</head>
<body>
<h2>📋 Wat wilt u invoeren?</h2>
<p class="sub">Kies het type invoer hieronder.</p>
<div class="cards">
  <div class="card" onclick="kies('factuur')">
    <span class="icon">🧾</span>
    <h3>Factuur maken</h3>
    <p>Stuur een factuur naar een klant</p>
  </div>
  <div class="card" onclick="kies('kosten')">
    <span class="icon">💸</span>
    <h3>Kosten boeken</h3>
    <p>Leg een zakelijke uitgave of bon vast</p>
  </div>
  <div class="card" onclick="kies('declaratie')">
    <span class="icon">📤</span>
    <h3>Declaratie</h3>
    <p>Privé betaald voor de zaak? Declareer het hier</p>
  </div>
</div>
<div class="upload-link">
  Of <a onclick="kiesUpload()">📸 upload direct een bon of factuur</a> voor automatisch invullen met AI
</div>
<script>
function kies(type) {
  google.script.run
    .withFailureHandler(function(e){ alert(e.message); })
    [type === 'factuur' ? 'toonFactuurDialog' :
     type === 'kosten'  ? 'toonKostenDialog'  : 'toonDeclaratieDialog']();
  google.script.host.close();
}
function kiesUpload() {
  google.script.run.openBonUploadMetAI();
  google.script.host.close();
}
</script>
</body>
</html>`).setWidth(560).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nieuw invoeren');
}

// ─────────────────────────────────────────────
//  FACTUUR DIALOOG
// ─────────────────────────────────────────────
function toonFactuurDialog() {
  const data = getDialoogHulpdata();
  const btwOpties = data.btwKeuzes.map(function(k) {
    return '<option value="' + k + '">' + k + '</option>';
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:14px 16px;font-size:13px;margin:0;color:#212121}
  h2{color:#1A237E;font-size:16px;margin:0 0 12px}
  .row{display:flex;gap:10px;margin-bottom:8px}
  .row > *{flex:1}
  label{display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px}
  input,select,textarea{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}
  input:invalid,select:invalid{border-color:#e53935}
  input[type=number]::-webkit-inner-spin-button{opacity:1}
  .sectie{font-size:11px;font-weight:bold;color:#1A237E;text-transform:uppercase;
          letter-spacing:0.5px;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid #E8EAF6}
  .btw-totaal{background:#E8EAF6;padding:8px 10px;border-radius:4px;margin:8px 0;font-size:12px}
  .btw-totaal span{font-weight:bold;color:#1A237E}
  .mic-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .mic-btn{background:#1A237E;color:white;border:none;border-radius:20px;padding:6px 14px;
           cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px}
  .mic-btn.luistert{background:#c62828;animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
  .mic-status{font-size:11px;color:#666;font-style:italic}
  .btn{padding:9px 18px;border-radius:4px;border:none;cursor:pointer;font-size:13px;font-weight:bold}
  .btn-pri{background:#1A237E;color:white;width:100%;margin-top:10px}
  .btn-pri:hover{background:#283593}
  .btn-pri:disabled{background:#999;cursor:not-allowed}
  .err{color:#c62828;font-size:11px;margin-top:3px;display:none}
  .conf{background:#E8F5E9;border-left:3px solid #4CAF50;padding:10px;margin-top:10px;
        border-radius:0 4px 4px 0;font-size:13px;display:none}
</style>
</head>
<body>
<h2>🧾 Factuur maken</h2>

<div class="mic-row">
  <button class="mic-btn" id="micBtn" onclick="startSpraakinvoer()" title="Spreek uw factuurgegevens in">
    🎤 Spraakinvoer
  </button>
  <span class="mic-status" id="micStatus">Klik op de microfoon en spreek in</span>
</div>

<div class="row">
  <div>
    <label>Klantnaam *</label>
    <input type="text" id="klant" required placeholder="Naam van de klant">
  </div>
  <div>
    <label>Factuurdatum *</label>
    <input type="date" id="datum" required value="${data.vandaag}">
  </div>
</div>
<div class="row">
  <div>
    <label>E-mailadres klant</label>
    <input type="email" id="email" placeholder="klant@voorbeeld.nl">
  </div>
  <div>
    <label>Vervaldatum</label>
    <input type="date" id="vervaldatum">
  </div>
</div>

<div class="sectie">Factuurregel 1</div>
<div class="row">
  <div style="flex:3">
    <label>Omschrijving *</label>
    <input type="text" id="omschr1" required placeholder="Bijv. Webdesign werkzaamheden">
  </div>
  <div style="flex:1">
    <label>Aantal</label>
    <input type="number" id="aantal1" value="1" min="0.01" step="0.01">
  </div>
  <div style="flex:1.5">
    <label>Prijs per stuk (excl.)</label>
    <input type="number" id="prijs1" value="" min="0" step="0.01" placeholder="0,00">
  </div>
</div>
<div class="row">
  <div>
    <label>BTW tarief</label>
    <select id="btw1">${btwOpties}</select>
  </div>
  <div>
    <label>Totaal excl. BTW</label>
    <input type="text" id="subtotaal1" readonly style="background:#F5F5F5;color:#555">
  </div>
</div>

<div class="sectie">Factuurregel 2 (optioneel)</div>
<div class="row">
  <div style="flex:3">
    <label>Omschrijving</label>
    <input type="text" id="omschr2" placeholder="Tweede regel (optioneel)">
  </div>
  <div style="flex:1">
    <label>Aantal</label>
    <input type="number" id="aantal2" value="" min="0" step="0.01">
  </div>
  <div style="flex:1.5">
    <label>Prijs per stuk (excl.)</label>
    <input type="number" id="prijs2" value="" min="0" step="0.01" placeholder="0,00">
  </div>
</div>
<div class="row">
  <div>
    <label>BTW tarief</label>
    <select id="btw2">${btwOpties}</select>
  </div>
  <div>
    <label>Totaal excl. BTW</label>
    <input type="text" id="subtotaal2" readonly style="background:#F5F5F5;color:#555">
  </div>
</div>

<div class="btw-totaal">
  Subtotaal excl.: <span id="totExcl">€ 0,00</span> &nbsp;|&nbsp;
  BTW: <span id="totBtw">€ 0,00</span> &nbsp;|&nbsp;
  <b>Totaal incl.: <span id="totIncl">€ 0,00</span></b>
</div>

<div>
  <label>Notities (intern, niet op factuur)</label>
  <textarea id="notities" rows="2" style="resize:vertical" placeholder="Optionele aantekening"></textarea>
</div>
<div class="err" id="foutmelding">Vul alle verplichte velden in.</div>
<button class="btn btn-pri" id="verzendBtn" onclick="verzend()">✅ Factuur aanmaken &amp; versturen</button>
<div class="conf" id="bevestiging"></div>

<script>
var herkenner = null;

function fmt(n) {
  return '\\u20ac\\u00a0' + parseFloat(n||0).toFixed(2).replace('.', ',');
}
function btwTarief(keuze) {
  if (keuze.includes('21')) return 0.21;
  if (keuze.includes('9')) return 0.09;
  return 0;
}
function berekenRegel(n, p, btw) {
  var excl = (parseFloat(n)||0) * (parseFloat(p)||0);
  return { excl: excl, btw: excl * btwTarief(btw) };
}
function herbereken() {
  var r1 = berekenRegel(document.getElementById('aantal1').value,
                        document.getElementById('prijs1').value,
                        document.getElementById('btw1').value);
  var r2 = berekenRegel(document.getElementById('aantal2').value,
                        document.getElementById('prijs2').value,
                        document.getElementById('btw2').value);
  document.getElementById('subtotaal1').value = r1.excl > 0 ? fmt(r1.excl) : '';
  document.getElementById('subtotaal2').value = r2.excl > 0 ? fmt(r2.excl) : '';
  var totExcl = r1.excl + r2.excl;
  var totBtw  = r1.btw + r2.btw;
  document.getElementById('totExcl').textContent = fmt(totExcl);
  document.getElementById('totBtw').textContent  = fmt(totBtw);
  document.getElementById('totIncl').textContent = fmt(totExcl + totBtw);
}
['aantal1','prijs1','btw1','aantal2','prijs2','btw2'].forEach(function(id){
  document.getElementById(id).addEventListener('input', herbereken);
  document.getElementById(id).addEventListener('change', herbereken);
});

function startSpraakinvoer() {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    document.getElementById('micStatus').textContent = 'Spraakinvoer niet beschikbaar in deze browser.';
    return;
  }
  if (herkenner) { herkenner.stop(); return; }
  herkenner = new SpeechRec();
  herkenner.lang = 'nl-NL';
  herkenner.continuous = false;
  herkenner.interimResults = false;
  herkenner.onstart = function() {
    document.getElementById('micBtn').classList.add('luistert');
    document.getElementById('micBtn').textContent = '⏹ Stop opname';
    document.getElementById('micStatus').textContent = 'Luisteren... Spreek uw factuurgegevens in';
  };
  herkenner.onresult = function(e) {
    var tekst = e.results[0][0].transcript;
    document.getElementById('micStatus').textContent = 'Verwerken: "' + tekst + '"';
    google.script.run
      .withSuccessHandler(function(data) {
        if (data.klant) document.getElementById('klant').value = data.klant;
        if (data.omschrijving) document.getElementById('omschr1').value = data.omschrijving;
        if (data.aantal) document.getElementById('aantal1').value = data.aantal;
        if (data.prijs) document.getElementById('prijs1').value = data.prijs;
        if (data.email) document.getElementById('email').value = data.email;
        herbereken();
        document.getElementById('micStatus').textContent = '\\u2713 Ingevuld via spraak';
      })
      .withFailureHandler(function(e) {
        document.getElementById('micStatus').textContent = 'Kon niet verwerken: ' + e.message;
      })
      .verwerkSpraakinvoerFactuur(tekst);
  };
  herkenner.onerror = function(e) {
    document.getElementById('micStatus').textContent = 'Fout: ' + e.error;
  };
  herkenner.onend = function() {
    herkenner = null;
    document.getElementById('micBtn').classList.remove('luistert');
    document.getElementById('micBtn').textContent = '\\ud83c\\udf99 Spraakinvoer';
  };
  herkenner.start();
}

function verzend() {
  var klant = document.getElementById('klant').value.trim();
  var datum = document.getElementById('datum').value;
  var omschr1 = document.getElementById('omschr1').value.trim();
  var prijs1 = parseFloat(document.getElementById('prijs1').value) || 0;

  if (!klant || !datum || !omschr1 || prijs1 <= 0) {
    document.getElementById('foutmelding').style.display = 'block';
    return;
  }
  document.getElementById('foutmelding').style.display = 'none';
  document.getElementById('verzendBtn').disabled = true;
  document.getElementById('verzendBtn').textContent = 'Bezig...';

  var factuurData = {
    klant: klant,
    datum: datum,
    vervaldatum: document.getElementById('vervaldatum').value,
    email: document.getElementById('email').value.trim(),
    notities: document.getElementById('notities').value.trim(),
    regels: [
      { omschr: omschr1,
        aantal: parseFloat(document.getElementById('aantal1').value) || 1,
        prijs: prijs1,
        btw: document.getElementById('btw1').value },
      { omschr: document.getElementById('omschr2').value.trim(),
        aantal: parseFloat(document.getElementById('aantal2').value) || 0,
        prijs: parseFloat(document.getElementById('prijs2').value) || 0,
        btw: document.getElementById('btw2').value }
    ]
  };

  google.script.run
    .withSuccessHandler(function(result) {
      var conf = document.getElementById('bevestiging');
      conf.style.display = 'block';
      conf.innerHTML = '\\u2705 <b>Factuur aangemaakt!</b> Factuurnummer: <b>' + result.factuurnummer + '</b><br>' +
        (result.emailVerzonden ? '\\ud83d\\udce7 E-mail verstuurd naar ' + result.emailAdres + '.' :
         '\\u26a0\\ufe0f Geen e-mailadres — factuur staat klaar als PDF in Google Drive.') +
        '<br><button onclick="google.script.host.close()" style="margin-top:8px;cursor:pointer;padding:4px 10px">Sluiten</button>';
      document.getElementById('verzendBtn').style.display = 'none';
    })
    .withFailureHandler(function(e) {
      document.getElementById('foutmelding').textContent = 'Fout: ' + e.message;
      document.getElementById('foutmelding').style.display = 'block';
      document.getElementById('verzendBtn').disabled = false;
      document.getElementById('verzendBtn').textContent = '\\u2705 Factuur aanmaken & versturen';
    })
    .verwerkFactuurUitDialog(factuurData);
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(720).setHeight(620),
    '🧾 Factuur maken'
  );
}

// ─────────────────────────────────────────────
//  KOSTEN DIALOOG
// ─────────────────────────────────────────────
function toonKostenDialog() {
  const data = getDialoogHulpdata();
  const btwOpties = data.btwKeuzes.map(function(k) {
    return '<option value="' + k + '">' + k + '</option>';
  }).join('');
  const catOpties = data.kategorieën.map(function(c) {
    return '<option value="' + c + '">' + c + '</option>';
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:14px 16px;font-size:13px;margin:0}
  h2{color:#1A237E;font-size:16px;margin:0 0 12px}
  .row{display:flex;gap:10px;margin-bottom:8px}
  .row > *{flex:1}
  label{display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px}
  input,select{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}
  .sectie{font-size:11px;font-weight:bold;color:#1A237E;text-transform:uppercase;
          letter-spacing:0.5px;margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid #E8EAF6}
  .upload-area{border:2px dashed #C5CAE9;border-radius:8px;padding:16px;text-align:center;
               cursor:pointer;transition:all 0.2s;margin:6px 0;background:#FAFAFA}
  .upload-area:hover{border-color:#1A237E;background:#F0F2FF}
  .upload-area.active{border-color:#4CAF50;background:#E8F5E9}
  .ai-status{font-size:12px;color:#555;margin:4px 0;min-height:18px;font-style:italic}
  .btw-totaal{background:#FFF3E0;padding:8px 10px;border-radius:4px;margin:8px 0;font-size:12px}
  .btw-totaal span{font-weight:bold;color:#E65100}
  .mic-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .mic-btn{background:#1A237E;color:white;border:none;border-radius:20px;padding:5px 12px;
           cursor:pointer;font-size:12px}
  .mic-btn.luistert{background:#c62828;animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
  .mic-status{font-size:11px;color:#666;font-style:italic}
  .btn{padding:9px 18px;border-radius:4px;border:none;cursor:pointer;font-size:13px;font-weight:bold}
  .btn-pri{background:#1A237E;color:white;width:100%;margin-top:10px}
  .btn-pri:hover{background:#283593}
  .btn-pri:disabled{background:#999;cursor:not-allowed}
  .err{color:#c62828;font-size:11px;margin-top:3px;display:none}
  .conf{background:#E8F5E9;border-left:3px solid #4CAF50;padding:10px;margin-top:10px;
        border-radius:0 4px 4px 0;font-size:13px;display:none}
</style>
</head>
<body>
<h2>💸 Kosten boeken</h2>

<div class="sectie">📸 Bon uploaden voor automatisch invullen</div>
<div class="upload-area" id="dropZone" onclick="document.getElementById('bonInput').click()">
  📷 Klik hier of sleep een bon / factuur<br>
  <span style="font-size:11px;color:#888">(JPG, PNG, PDF — max 10 MB)</span>
</div>
<input type="file" id="bonInput" accept="image/*,.pdf" style="display:none" onchange="bonGekozen(this)">
<div class="ai-status" id="aiStatus">AI legt uw bon automatisch vast na uploaden</div>

<div class="sectie">Gegevens</div>
<div class="mic-row">
  <button class="mic-btn" id="micBtnK" onclick="startSpraakinvoerK()">🎤 Spraakinvoer</button>
  <span class="mic-status" id="micStatusK">Spreek leverancier, bedrag en omschrijving in</span>
</div>
<div class="row">
  <div>
    <label>Leverancier *</label>
    <input type="text" id="leverancier" required placeholder="Naam van de leverancier">
  </div>
  <div>
    <label>Datum *</label>
    <input type="date" id="datum" required value="${data.vandaag}">
  </div>
</div>
<div class="row">
  <div>
    <label>Omschrijving *</label>
    <input type="text" id="omschr" required placeholder="Wat is er gekocht / betaald?">
  </div>
  <div>
    <label>Categorie</label>
    <select id="categorie"><option value="">-- Kies categorie --</option>${catOpties}</select>
  </div>
</div>
<div class="row">
  <div>
    <label>Bedrag excl. BTW (€)</label>
    <input type="number" id="bedragExcl" min="0" step="0.01" placeholder="0,00">
  </div>
  <div>
    <label>BTW tarief</label>
    <select id="btw">${btwOpties}</select>
  </div>
  <div>
    <label>BTW bedrag (€)</label>
    <input type="number" id="btwBedrag" min="0" step="0.01" placeholder="0,00" readonly style="background:#F5F5F5">
  </div>
</div>
<div class="row">
  <div>
    <label>Totaal incl. BTW (€)</label>
    <input type="number" id="bedragIncl" min="0" step="0.01" placeholder="0,00">
  </div>
  <div>
    <label>Factuurnummer leverancier</label>
    <input type="text" id="factuurnr" placeholder="Optioneel">
  </div>
</div>
<div class="btw-totaal">
  💡 Vul óf het bedrag excl. BTW óf het totaal incl. BTW in — de andere velden worden automatisch berekend.
</div>

<div class="err" id="foutmelding">Vul alle verplichte velden in.</div>
<button class="btn btn-pri" id="opslaanBtn" onclick="opslaan()">💾 Kosten opslaan</button>
<div class="conf" id="bevestiging"></div>

<script>
var herkennerK = null;
var bonBase64 = null;
var bonMime = null;

function fmt(n) { return parseFloat(n||0).toFixed(2); }
function btwTarief(keuze) {
  if (keuze.includes('21')) return 0.21;
  if (keuze.includes('9')) return 0.09;
  return 0;
}

document.getElementById('bedragExcl').addEventListener('input', function() {
  var excl = parseFloat(this.value) || 0;
  var tarief = btwTarief(document.getElementById('btw').value);
  var btw = excl * tarief;
  document.getElementById('btwBedrag').value = btw > 0 ? fmt(btw) : '';
  document.getElementById('bedragIncl').value = excl > 0 ? fmt(excl + btw) : '';
});
document.getElementById('bedragIncl').addEventListener('input', function() {
  var incl = parseFloat(this.value) || 0;
  var tarief = btwTarief(document.getElementById('btw').value);
  var excl = tarief > 0 ? incl / (1 + tarief) : incl;
  var btw = incl - excl;
  document.getElementById('bedragExcl').value = excl > 0 ? fmt(excl) : '';
  document.getElementById('btwBedrag').value = btw > 0 ? fmt(btw) : '';
});
document.getElementById('btw').addEventListener('change', function() {
  var excl = parseFloat(document.getElementById('bedragExcl').value) || 0;
  if (excl > 0) document.getElementById('bedragExcl').dispatchEvent(new Event('input'));
});

function bonGekozen(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('Bestand te groot (max 10 MB).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var parts = e.target.result.split(',');
    bonBase64 = parts[1];
    bonMime = file.type || 'image/jpeg';
    document.getElementById('dropZone').classList.add('active');
    document.getElementById('dropZone').innerHTML = '\\u2713 ' + file.name + ' — AI scant de bon...';
    document.getElementById('aiStatus').textContent = '\\ud83e\\udd16 AI verwerkt uw bon...';
    google.script.run
      .withSuccessHandler(function(scan) {
        if (scan.leverancier) document.getElementById('leverancier').value = scan.leverancier;
        if (scan.datum) document.getElementById('datum').value = scan.datum;
        if (scan.omschrijving) document.getElementById('omschr').value = scan.omschrijving;
        if (scan.factuurnummer) document.getElementById('factuurnr').value = scan.factuurnummer;
        if (scan.bedragExcl > 0) { document.getElementById('bedragExcl').value = fmt(scan.bedragExcl); document.getElementById('bedragExcl').dispatchEvent(new Event('input')); }
        else if (scan.bedragIncl > 0) { document.getElementById('bedragIncl').value = fmt(scan.bedragIncl); document.getElementById('bedragIncl').dispatchEvent(new Event('input')); }
        if (scan.btwPercentage === 21) document.getElementById('btw').value = '21% (hoog)';
        else if (scan.btwPercentage === 9) document.getElementById('btw').value = '9% (laag)';
        document.getElementById('aiStatus').textContent = '\\u2705 AI heeft de bon herkend — controleer de gegevens';
      })
      .withFailureHandler(function(e) {
        document.getElementById('aiStatus').textContent = 'AI kon bon niet lezen: ' + e.message + ' — vul handmatig in';
      })
      .scanBonMetAI(bonBase64, bonMime);
  };
  reader.readAsDataURL(file);
}

function startSpraakinvoerK() {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) { document.getElementById('micStatusK').textContent = 'Niet beschikbaar.'; return; }
  if (herkennerK) { herkennerK.stop(); return; }
  herkennerK = new SpeechRec();
  herkennerK.lang = 'nl-NL';
  herkennerK.onstart = function() {
    document.getElementById('micBtnK').classList.add('luistert');
    document.getElementById('micBtnK').textContent = '\\u23f9 Stop';
    document.getElementById('micStatusK').textContent = 'Luisteren...';
  };
  herkennerK.onresult = function(e) {
    var tekst = e.results[0][0].transcript;
    document.getElementById('micStatusK').textContent = 'Verwerken: "' + tekst + '"';
    google.script.run
      .withSuccessHandler(function(d) {
        if (d.leverancier) document.getElementById('leverancier').value = d.leverancier;
        if (d.omschrijving) document.getElementById('omschr').value = d.omschrijving;
        if (d.bedragIncl > 0) { document.getElementById('bedragIncl').value = fmt(d.bedragIncl); document.getElementById('bedragIncl').dispatchEvent(new Event('input')); }
        document.getElementById('micStatusK').textContent = '\\u2713 Ingevuld';
      })
      .withFailureHandler(function(e) { document.getElementById('micStatusK').textContent = 'Fout: ' + e.message; })
      .verwerkSpraakinvoerKosten(tekst);
  };
  herkennerK.onerror = function(e) { document.getElementById('micStatusK').textContent = 'Fout: ' + e.error; };
  herkennerK.onend = function() {
    herkennerK = null;
    document.getElementById('micBtnK').classList.remove('luistert');
    document.getElementById('micBtnK').textContent = '\\ud83c\\udf99 Spraakinvoer';
  };
  herkennerK.start();
}

function opslaan() {
  var leverancier = document.getElementById('leverancier').value.trim();
  var datum = document.getElementById('datum').value;
  var omschr = document.getElementById('omschr').value.trim();
  var bedragIncl = parseFloat(document.getElementById('bedragIncl').value) || 0;
  var bedragExcl = parseFloat(document.getElementById('bedragExcl').value) || 0;
  if (!leverancier || !datum || !omschr || (bedragIncl <= 0 && bedragExcl <= 0)) {
    document.getElementById('foutmelding').style.display = 'block';
    return;
  }
  document.getElementById('foutmelding').style.display = 'none';
  document.getElementById('opslaanBtn').disabled = true;
  document.getElementById('opslaanBtn').textContent = 'Bezig...';
  var data = {
    leverancier: leverancier, datum: datum, omschr: omschr,
    categorie: document.getElementById('categorie').value,
    bedragExcl: bedragExcl,
    btwBedrag: parseFloat(document.getElementById('btwBedrag').value) || 0,
    bedragIncl: bedragIncl,
    btw: document.getElementById('btw').value,
    factuurnr: document.getElementById('factuurnr').value.trim(),
    bonBase64: bonBase64, bonMime: bonMime
  };
  google.script.run
    .withSuccessHandler(function(r) {
      var conf = document.getElementById('bevestiging');
      conf.style.display = 'block';
      conf.innerHTML = '\\u2705 <b>Kosten opgeslagen!</b>' + (r.bonUrl ? ' Bon opgeslagen in Google Drive.' : '') +
        '<br><button onclick="google.script.host.close()" style="margin-top:8px;cursor:pointer;padding:4px 10px">Sluiten</button>';
      document.getElementById('opslaanBtn').style.display = 'none';
    })
    .withFailureHandler(function(e) {
      document.getElementById('foutmelding').textContent = 'Fout: ' + e.message;
      document.getElementById('foutmelding').style.display = 'block';
      document.getElementById('opslaanBtn').disabled = false;
      document.getElementById('opslaanBtn').textContent = '\\ud83d\\udcbe Kosten opslaan';
    })
    .verwerkKostenUitDialog(data);
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(680).setHeight(580),
    '💸 Kosten boeken'
  );
}

// ─────────────────────────────────────────────
//  DECLARATIE DIALOOG
// ─────────────────────────────────────────────
function toonDeclaratieDialog() {
  const data = getDialoogHulpdata();
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:14px 16px;font-size:13px;margin:0}
  h2{color:#1A237E;font-size:16px;margin:0 0 6px}
  .info{background:#E8EAF6;padding:10px;border-radius:4px;font-size:12px;margin-bottom:12px}
  .row{display:flex;gap:10px;margin-bottom:8px}
  .row > *{flex:1}
  label{display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px}
  input,select,textarea{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}
  .upload-area{border:2px dashed #C5CAE9;border-radius:8px;padding:14px;text-align:center;
               cursor:pointer;transition:all 0.2s;margin:6px 0;background:#FAFAFA}
  .upload-area:hover{border-color:#1A237E;background:#F0F2FF}
  .upload-area.active{border-color:#4CAF50;background:#E8F5E9}
  .mic-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .mic-btn{background:#1A237E;color:white;border:none;border-radius:20px;padding:5px 12px;cursor:pointer;font-size:12px}
  .mic-btn.luistert{background:#c62828;animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
  .btn{padding:9px 18px;border-radius:4px;border:none;cursor:pointer;font-size:13px;font-weight:bold}
  .btn-pri{background:#1A237E;color:white;width:100%;margin-top:10px}
  .btn-pri:hover{background:#283593}
  .btn-pri:disabled{background:#999;cursor:not-allowed}
  .err{color:#c62828;font-size:11px;margin-top:3px;display:none}
  .conf{background:#E8F5E9;border-left:3px solid #4CAF50;padding:10px;margin-top:10px;border-radius:0 4px 4px 0;font-size:13px;display:none}
</style>
</head>
<body>
<h2>📤 Declaratie indienen</h2>
<div class="info">💡 Gebruik dit formulier als u <b>privé heeft betaald</b> voor een zakelijke uitgave en het bedrag terugwilt.</div>

<div class="upload-area" id="dropZone" onclick="document.getElementById('bonInput').click()">
  📷 Upload een foto van het bonnetje (optioneel)<br>
  <span style="font-size:11px;color:#888">(JPG, PNG, PDF)</span>
</div>
<input type="file" id="bonInput" accept="image/*,.pdf" style="display:none" onchange="bonGekozen(this)">
<div id="aiStatus" style="font-size:12px;color:#555;margin:4px 0;min-height:16px;font-style:italic"></div>

<div class="mic-row">
  <button class="mic-btn" id="micBtn" onclick="startSpraakinvoer()">🎤 Spraakinvoer</button>
  <span style="font-size:11px;color:#666;font-style:italic" id="micStatus">Optioneel: spreek in wat u wilt declareren</span>
</div>

<div class="row">
  <div>
    <label>Omschrijving *</label>
    <input type="text" id="omschr" required placeholder="Bijv. Treinkaartje Amsterdam–Rotterdam">
  </div>
  <div>
    <label>Datum *</label>
    <input type="date" id="datum" required value="${data.vandaag}">
  </div>
</div>
<div class="row">
  <div>
    <label>Bedrag incl. BTW (€) *</label>
    <input type="number" id="bedrag" required min="0.01" step="0.01" placeholder="0,00">
  </div>
  <div>
    <label>Betaald door</label>
    <input type="text" id="betaaldDoor" placeholder="Uw naam">
  </div>
</div>
<div>
  <label>Toelichting</label>
  <textarea id="toelichting" rows="2" placeholder="Reden van de declaratie (optioneel)"></textarea>
</div>

<div class="err" id="foutmelding">Vul omschrijving, datum en bedrag in.</div>
<button class="btn btn-pri" id="indienBtn" onclick="indien()">📤 Declaratie indienen</button>
<div class="conf" id="bevestiging"></div>

<script>
var herkenner = null;
var bonBase64 = null;
var bonMime = null;

function bonGekozen(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var parts = e.target.result.split(',');
    bonBase64 = parts[1];
    bonMime = file.type || 'image/jpeg';
    document.getElementById('dropZone').classList.add('active');
    document.getElementById('dropZone').innerHTML = '\\u2713 ' + file.name;
    document.getElementById('aiStatus').textContent = '\\ud83e\\udd16 AI leest de bon...';
    google.script.run
      .withSuccessHandler(function(scan) {
        if (scan.omschrijving) document.getElementById('omschr').value = scan.omschrijving;
        if (scan.datum) document.getElementById('datum').value = scan.datum;
        if (scan.bedragIncl > 0) document.getElementById('bedrag').value = parseFloat(scan.bedragIncl).toFixed(2);
        document.getElementById('aiStatus').textContent = '\\u2705 Bon herkend — controleer de gegevens';
      })
      .withFailureHandler(function() {
        document.getElementById('aiStatus').textContent = 'Kon bon niet lezen — vul handmatig in';
      })
      .scanBonMetAI(bonBase64, bonMime);
  };
  reader.readAsDataURL(file);
}

function startSpraakinvoer() {
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) { document.getElementById('micStatus').textContent = 'Niet beschikbaar.'; return; }
  if (herkenner) { herkenner.stop(); return; }
  herkenner = new SpeechRec();
  herkenner.lang = 'nl-NL';
  herkenner.onstart = function() {
    document.getElementById('micBtn').classList.add('luistert');
    document.getElementById('micBtn').textContent = '\\u23f9 Stop';
    document.getElementById('micStatus').textContent = 'Luisteren...';
  };
  herkenner.onresult = function(e) {
    var tekst = e.results[0][0].transcript;
    google.script.run
      .withSuccessHandler(function(d) {
        if (d.omschrijving) document.getElementById('omschr').value = d.omschrijving;
        if (d.bedragIncl > 0) document.getElementById('bedrag').value = parseFloat(d.bedragIncl).toFixed(2);
        document.getElementById('micStatus').textContent = '\\u2713 Ingevuld';
      })
      .withFailureHandler(function() {})
      .verwerkSpraakinvoerKosten(tekst);
  };
  herkenner.onerror = function(e) { document.getElementById('micStatus').textContent = 'Fout: ' + e.error; };
  herkenner.onend = function() {
    herkenner = null;
    document.getElementById('micBtn').classList.remove('luistert');
    document.getElementById('micBtn').textContent = '\\ud83c\\udf99 Spraakinvoer';
  };
  herkenner.start();
}

function indien() {
  var omschr = document.getElementById('omschr').value.trim();
  var datum = document.getElementById('datum').value;
  var bedrag = parseFloat(document.getElementById('bedrag').value) || 0;
  if (!omschr || !datum || bedrag <= 0) {
    document.getElementById('foutmelding').style.display = 'block';
    return;
  }
  document.getElementById('foutmelding').style.display = 'none';
  document.getElementById('indienBtn').disabled = true;
  document.getElementById('indienBtn').textContent = 'Bezig...';
  var decData = {
    omschr: omschr, datum: datum, bedrag: bedrag,
    betaaldDoor: document.getElementById('betaaldDoor').value.trim(),
    toelichting: document.getElementById('toelichting').value.trim(),
    bonBase64: bonBase64, bonMime: bonMime
  };
  google.script.run
    .withSuccessHandler(function() {
      var conf = document.getElementById('bevestiging');
      conf.style.display = 'block';
      conf.innerHTML = '\\u2705 <b>Declaratie ingediend!</b><br>' +
        '<button onclick="google.script.host.close()" style="margin-top:8px;cursor:pointer;padding:4px 10px">Sluiten</button>';
      document.getElementById('indienBtn').style.display = 'none';
    })
    .withFailureHandler(function(e) {
      document.getElementById('foutmelding').textContent = 'Fout: ' + e.message;
      document.getElementById('foutmelding').style.display = 'block';
      document.getElementById('indienBtn').disabled = false;
      document.getElementById('indienBtn').textContent = '\\ud83d\\udce4 Declaratie indienen';
    })
    .verwerkDeclaratieUitDialog(decData);
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(640).setHeight(520),
    '📤 Declaratie indienen'
  );
}

// ─────────────────────────────────────────────
//  BON UPLOAD MET AI (STANDALONE)
// ─────────────────────────────────────────────
function openBonUploadMetAI() {
  const data = getDialoogHulpdata();
  const catOpties = data.kategorieën.map(function(c) {
    return '<option value="' + c + '">' + c + '</option>';
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:14px 16px;font-size:13px;margin:0}
  h2{color:#1A237E;font-size:16px;margin:0 0 12px}
  .upload-area{border:2px dashed #C5CAE9;border-radius:8px;padding:24px;text-align:center;
               cursor:pointer;transition:all 0.2s;margin:0 0 10px;background:#FAFAFA}
  .upload-area:hover{border-color:#1A237E;background:#F0F2FF}
  .upload-area.active{border-color:#4CAF50;background:#E8F5E9}
  .ai-status{font-size:13px;color:#555;padding:8px;min-height:24px}
  .row{display:flex;gap:10px;margin-bottom:8px}
  .row > *{flex:1}
  label{display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px}
  input,select{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px}
  .veld-sectie{display:none}
  .btn{padding:9px 18px;border-radius:4px;border:none;cursor:pointer;font-size:13px;font-weight:bold}
  .btn-pri{background:#1A237E;color:white;width:100%;margin-top:10px}
  .btn-pri:hover{background:#283593}
  .btn-pri:disabled{background:#999;cursor:not-allowed}
  .conf{background:#E8F5E9;border-left:3px solid #4CAF50;padding:10px;margin-top:10px;border-radius:0 4px 4px 0;display:none}
</style>
</head>
<body>
<h2>📸 Bon of factuur uploaden</h2>
<div class="upload-area" id="dropZone" onclick="document.getElementById('bonFile').click()">
  📷 Klik hier of sleep een bon / factuur<br>
  <span style="font-size:11px;color:#888">(JPG, PNG, PDF — max 10 MB)</span>
</div>
<input type="file" id="bonFile" accept="image/*,.pdf" style="display:none" onchange="bonGekozen(this)">
<div class="ai-status" id="aiStatus">Upload een bon en AI vult de gegevens automatisch in</div>

<div class="veld-sectie" id="veldSectie">
  <div class="row">
    <div><label>Leverancier</label><input type="text" id="leverancier" placeholder="Naam leverancier"></div>
    <div><label>Datum</label><input type="date" id="datum" value="${data.vandaag}"></div>
  </div>
  <div class="row">
    <div><label>Omschrijving</label><input type="text" id="omschr" placeholder="Wat staat er op de bon?"></div>
    <div><label>Categorie</label><select id="cat"><option value="">-- Kies --</option>${catOpties}</select></div>
  </div>
  <div class="row">
    <div><label>Bedrag incl. BTW (€)</label><input type="number" id="bedragIncl" step="0.01" min="0"></div>
    <div><label>Factuurnummer</label><input type="text" id="factuurnr" placeholder="Optioneel"></div>
  </div>
  <button class="btn btn-pri" id="opslaanBtn" onclick="opslaan()">💾 Opslaan als kosten</button>
</div>
<div class="conf" id="bevestiging"></div>

<script>
var bonBase64 = null;
var bonMime = null;

function bonGekozen(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('Bestand te groot (max 10 MB).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var parts = e.target.result.split(',');
    bonBase64 = parts[1];
    bonMime = file.type || 'image/jpeg';
    document.getElementById('dropZone').classList.add('active');
    document.getElementById('dropZone').innerHTML = '\\u2713 ' + file.name;
    document.getElementById('aiStatus').textContent = '\\ud83e\\udd16 AI scant uw bon...';
    document.getElementById('veldSectie').style.display = 'block';
    google.script.run
      .withSuccessHandler(function(scan) {
        if (scan.leverancier) document.getElementById('leverancier').value = scan.leverancier;
        if (scan.datum) document.getElementById('datum').value = scan.datum;
        if (scan.omschrijving) document.getElementById('omschr').value = scan.omschrijving;
        if (scan.factuurnummer) document.getElementById('factuurnr').value = scan.factuurnummer;
        if (scan.bedragIncl > 0) document.getElementById('bedragIncl').value = parseFloat(scan.bedragIncl).toFixed(2);
        document.getElementById('aiStatus').textContent = '\\u2705 AI herkend — controleer en sla op';
      })
      .withFailureHandler(function() {
        document.getElementById('aiStatus').textContent = 'Kon bon niet lezen — vul handmatig in';
      })
      .scanBonMetAI(bonBase64, bonMime);
  };
  reader.readAsDataURL(file);
}

function opslaan() {
  document.getElementById('opslaanBtn').disabled = true;
  document.getElementById('opslaanBtn').textContent = 'Bezig...';
  var data = {
    leverancier: document.getElementById('leverancier').value.trim(),
    datum: document.getElementById('datum').value,
    omschr: document.getElementById('omschr').value.trim(),
    categorie: document.getElementById('cat').value,
    bedragIncl: parseFloat(document.getElementById('bedragIncl').value) || 0,
    btw: '21% (hoog)',
    bedragExcl: 0, btwBedrag: 0,
    factuurnr: document.getElementById('factuurnr').value.trim(),
    bonBase64: bonBase64, bonMime: bonMime
  };
  google.script.run
    .withSuccessHandler(function() {
      var c = document.getElementById('bevestiging');
      c.style.display = 'block';
      c.innerHTML = '\\u2705 <b>Opgeslagen!</b><br><button onclick="google.script.host.close()" style="margin-top:8px;cursor:pointer;padding:4px 10px">Sluiten</button>';
      document.getElementById('opslaanBtn').style.display = 'none';
    })
    .withFailureHandler(function(e) {
      alert('Fout: ' + e.message);
      document.getElementById('opslaanBtn').disabled = false;
      document.getElementById('opslaanBtn').textContent = '\\ud83d\\udcbe Opslaan als kosten';
    })
    .verwerkKostenUitDialog(data);
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(560).setHeight(480),
    '📸 Bon uploaden met AI'
  );
}

// ─────────────────────────────────────────────
//  SERVER HANDLERS
// ─────────────────────────────────────────────

/**
 * Verwerkt factuurgegevens uit het dialoogvenster.
 * Roept de bestaande verkoopfactuurverwerking aan.
 */
function verwerkFactuurUitDialog(factuurData) {
  const ss = getSpreadsheet_();
  const regels = factuurData.regels || [];

  // Bouw em-dash formaat op (zoals het hoofdformulier verwacht)
  const formData = {};
  formData['Soort boeking'] = 'Verkoopfactuur';
  formData['Klantnaam'] = factuurData.klant || '';
  formData['Factuurdatum'] = factuurData.datum || '';
  formData['Vervaldatum factuur'] = factuurData.vervaldatum || '';
  formData['E-mailadres klant'] = factuurData.email || '';
  formData['Notities'] = factuurData.notities || '';

  if (regels[0] && regels[0].omschr) {
    formData['Regel 1 \u2013 Omschrijving'] = regels[0].omschr;
    formData['Regel 1 \u2013 Aantal'] = regels[0].aantal || 1;
    formData['Regel 1 \u2013 Prijs per eenheid (excl. BTW)'] = regels[0].prijs || 0;
    formData['Regel 1 \u2013 BTW-tarief'] = regels[0].btw || '21% (hoog)';
  }
  if (regels[1] && regels[1].omschr) {
    formData['Regel 2 \u2013 Omschrijving'] = regels[1].omschr;
    formData['Regel 2 \u2013 Aantal'] = regels[1].aantal || 1;
    formData['Regel 2 \u2013 Prijs per eenheid (excl. BTW)'] = regels[1].prijs || 0;
    formData['Regel 2 \u2013 BTW-tarief'] = regels[1].btw || '21% (hoog)';
  }

  const result = verwerkInkomstenUitHoofdformulier_(ss, formData);

  // E-mail versturen als er een e-mailadres is
  let emailVerzonden = false;
  if (factuurData.email && result && result.factuurnummer) {
    try {
      stuurVerkoopfactuurPdfNaarKlant_(ss, result.factuurnummer, factuurData.email);
      emailVerzonden = true;
    } catch(e) {
      Logger.log('E-mail versturen mislukt: ' + e.message);
    }
  }

  return {
    factuurnummer: result ? result.factuurnummer : 'Onbekend',
    emailVerzonden: emailVerzonden,
    emailAdres: factuurData.email,
  };
}

/**
 * Verwerkt kostengegevens uit het dialoogvenster.
 * Slaat ook de bon op in Drive als base64 aanwezig is.
 */
function verwerkKostenUitDialog(data) {
  const ss = getSpreadsheet_();

  // Bereken excl. als niet ingevuld
  let bedragExcl = parseFloat(data.bedragExcl) || 0;
  let btwBedrag  = parseFloat(data.btwBedrag) || 0;
  let bedragIncl = parseFloat(data.bedragIncl) || 0;

  if (bedragExcl <= 0 && bedragIncl > 0) {
    const tarief = data.btw && data.btw.includes('21') ? 0.21 :
                   data.btw && data.btw.includes('9')  ? 0.09 : 0;
    bedragExcl = tarief > 0 ? bedragIncl / (1 + tarief) : bedragIncl;
    btwBedrag  = bedragIncl - bedragExcl;
  }

  const formData = {};
  formData['Soort boeking'] = 'Inkoopfactuur / kosten';
  formData['Leverancier / betaald aan'] = data.leverancier || '';
  formData['Datum'] = data.datum || '';
  formData['Omschrijving kosten'] = data.omschr || '';
  formData['Kostenrubriek'] = data.categorie || '';
  formData['Bedrag excl. BTW'] = bedragExcl;
  formData['BTW-tarief'] = data.btw || '21% (hoog)';
  formData['BTW-bedrag'] = btwBedrag;
  formData['Totaalbedrag incl. BTW'] = bedragIncl || (bedragExcl + btwBedrag);
  formData['Factuurnummer leverancier'] = data.factuurnr || '';

  verwerkUitgavenUitHoofdformulier_(ss, formData);

  // Bon opslaan in Drive
  let bonUrl = null;
  if (data.bonBase64) {
    try {
      const decoded = Utilities.base64Decode(data.bonBase64);
      const mime = data.bonMime || 'image/jpeg';
      const ext  = mime.includes('pdf') ? 'pdf' : mime.split('/')[1] || 'jpg';
      const blob = Utilities.newBlob(decoded, mime, (data.datum || 'bon') + '_' + (data.leverancier || 'bon') + '.' + ext);
      const mapNaam = 'Bonnetjes & Ontvangstbewijzen';
      let folder;
      const mappen = DriveApp.getFoldersByName(mapNaam);
      folder = mappen.hasNext() ? mappen.next() : DriveApp.createFolder(mapNaam);
      const file = folder.createFile(blob);
      bonUrl = file.getUrl();
    } catch(e) {
      Logger.log('Bon opslaan mislukt: ' + e.message);
    }
  }

  return { bonUrl: bonUrl };
}

/**
 * Verwerkt declaratiegegevens uit het dialoogvenster.
 */
function verwerkDeclaratieUitDialog(decData) {
  const ss = getSpreadsheet_();

  const formData = {};
  formData['Soort boeking'] = 'Declaratie';
  formData['Omschrijving kosten'] = decData.omschr || '';
  formData['Datum'] = decData.datum || '';
  formData['Totaalbedrag incl. BTW'] = parseFloat(decData.bedrag) || 0;
  formData['Bedrag excl. BTW'] = parseFloat(decData.bedrag) || 0;
  formData['BTW-tarief'] = '0% (nultarief)';
  formData['BTW-bedrag'] = 0;
  formData['Leverancier / betaald aan'] = decData.betaaldDoor || getInstelling_('Bedrijfsnaam') || '';
  formData['Notities'] = decData.toelichting || '';

  verwerkDeclaratieUitHoofdformulier_(ss, formData);

  if (decData.bonBase64) {
    try {
      const decoded = Utilities.base64Decode(decData.bonBase64);
      const mime = decData.bonMime || 'image/jpeg';
      const ext  = mime.includes('pdf') ? 'pdf' : (mime.split('/')[1] || 'jpg');
      const blob = Utilities.newBlob(decoded, mime, (decData.datum || 'decl') + '_declaratie.' + ext);
      const mapNaam = 'Bonnetjes & Ontvangstbewijzen';
      let folder;
      const mappen = DriveApp.getFoldersByName(mapNaam);
      folder = mappen.hasNext() ? mappen.next() : DriveApp.createFolder(mapNaam);
      folder.createFile(blob);
    } catch(e) {
      Logger.log('Declaratie bon opslaan mislukt: ' + e.message);
    }
  }

  return true;
}

// ─────────────────────────────────────────────
//  GEMINI AI BON SCAN
// ─────────────────────────────────────────────
/**
 * Stuurt een afbeelding of PDF naar Gemini Vision voor automatische herkenning.
 * Geeft gestructureerde gegevens terug (leverancier, datum, bedragen, BTW).
 */
function scanBonMetAI(base64Data, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini API-sleutel niet ingesteld (zie Instellingen).');

  const prompt = `Je bent een boekhoudassistent. Analyseer dit bonnetje of factuur en extraheer de volgende informatie in JSON-formaat (gebruik null voor ontbrekende velden):
{
  "leverancier": "naam van de verkoper/leverancier",
  "datum": "YYYY-MM-DD formaat",
  "factuurnummer": "factuurnummer indien aanwezig",
  "omschrijving": "korte omschrijving van de aankoop",
  "bedragExcl": numeriek bedrag excl. BTW,
  "btwBedrag": numeriek BTW-bedrag,
  "bedragIncl": numeriek totaalbedrag incl. BTW,
  "btwPercentage": 21 of 9 of 0
}
Geef ALLEEN de JSON terug, geen extra tekst.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }
      ]
    }]
  };

  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  const json = JSON.parse(response.getContentText());
  if (json.error) throw new Error(json.error.message);

  const tekst = json.candidates[0].content.parts[0].text.trim();
  // Strook markdown code fences als aanwezig
  const jsonStr = tekst.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch(e) {
    Logger.log('Gemini bon parse fout: ' + e.message + ' | tekst: ' + tekst);
    return {};
  }
}

// ─────────────────────────────────────────────
//  GEMINI SPRAAKINVOER → VELDEN
// ─────────────────────────────────────────────
/**
 * Verwerkt gesproken tekst naar factuurvelden via Gemini.
 */
function verwerkSpraakinvoerFactuur(tekst) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return {};

  const prompt = `Extraheer factuurgegevens uit deze gesproken Nederlandse tekst en geef JSON terug:
{
  "klant": "naam van de klant",
  "omschrijving": "omschrijving van de dienst/product",
  "aantal": numeriek aantal (standaard 1),
  "prijs": numerieke prijs per eenheid excl. BTW,
  "email": "e-mailadres indien vermeld of null"
}
Gesproken tekst: "${tekst}"
Geef ALLEEN de JSON terug.`;

  return _geminiTekstNaarJson_(apiKey, prompt);
}

/**
 * Verwerkt gesproken tekst naar kostenvelden via Gemini.
 */
function verwerkSpraakinvoerKosten(tekst) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return {};

  const prompt = `Extraheer uitgavengegevens uit deze gesproken Nederlandse tekst en geef JSON terug:
{
  "leverancier": "naam van de leverancier/winkel",
  "omschrijving": "omschrijving van de aankoop",
  "bedragIncl": numeriek totaalbedrag incl. BTW of null
}
Gesproken tekst: "${tekst}"
Geef ALLEEN de JSON terug.`;

  return _geminiTekstNaarJson_(apiKey, prompt);
}

function _geminiTekstNaarJson_(apiKey, prompt) {
  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    const response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    const json = JSON.parse(response.getContentText());
    if (json.error) return {};
    const tekst = json.candidates[0].content.parts[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(tekst);
  } catch(e) {
    Logger.log('Gemini spraakinvoer fout: ' + e.message);
    return {};
  }
}

// ─────────────────────────────────────────────
//  E-MAIL HELPER (PROGRAMMATISCH)
// ─────────────────────────────────────────────
/**
 * Stuurt een verkoopfactuur-PDF per e-mail zonder UI-prompt.
 * Wordt aangeroepen vanuit verwerkFactuurUitDialog na aanmaken.
 */
function stuurVerkoopfactuurPdfNaarKlant_(ss, factuurnummer, email) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();
  let gevonden = null;
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === factuurnummer || String(data[i][0]) === factuurnummer) {
      gevonden = data[i];
      rij = i + 1;
      break;
    }
  }
  if (!gevonden || !gevonden[19]) return; // Geen PDF beschikbaar
  const pdfFile = DriveApp.getFileById(extractFileId_(gevonden[19]));
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const bedragIncl = formatBedrag_(gevonden[12]);
  const vervaldatum = formatDatum_(gevonden[3]);
  GmailApp.sendEmail(
    email,
    'Factuur ' + factuurnummer + ' van ' + bedrijf,
    'Geachte ' + gevonden[5] + ',\n\nHierbij ontvangt u factuur ' + factuurnummer +
    ' voor een bedrag van ' + bedragIncl + '.\n' +
    'Wij verzoeken u vriendelijk dit bedrag te voldoen vóór ' + vervaldatum + '.\n\n' +
    'Met vriendelijke groet,\n' + bedrijf,
    { attachments: [pdfFile.getAs('application/pdf')], name: bedrijf }
  );
  sheet.getRange(rij, 15).setValue(FACTUUR_STATUS.VERZONDEN);
}

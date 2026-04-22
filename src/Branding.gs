/**
 * Branding.gs
 * Bedrijfsstijl beheren: logo, kleuren en factuuruitstraling.
 * Het logo wordt als base64 opgeslagen in ScriptProperties en
 * automatisch op alle facturen en PDF's geplaatst.
 */

// ─────────────────────────────────────────────
//  CONSTANTEN
// ─────────────────────────────────────────────
const PROP_LOGO      = 'bedrijfsLogo';
const PROP_LOGO_MIME = 'bedrijfsLogoMime';
const PROP_KLEUR     = 'bedrijfsKleur';

// ─────────────────────────────────────────────
//  GETTERS (voor gebruik in andere bestanden)
// ─────────────────────────────────────────────

/**
 * Geeft het bedrijfslogo terug als data-URL (base64).
 * Geeft null terug als er geen logo is ingesteld.
 */
function getBedrijfsLogo_() {
  const props = PropertiesService.getScriptProperties();
  const b64   = props.getProperty(PROP_LOGO);
  const mime  = props.getProperty(PROP_LOGO_MIME) || 'image/png';
  if (!b64 || b64.length < 100) return null;
  return 'data:' + mime + ';base64,' + b64;
}

/**
 * Geeft de primaire bedrijfskleur terug (hex, default #0D1B4E).
 */
function getBedrijfsKleur_() {
  const kleur = PropertiesService.getScriptProperties().getProperty(PROP_KLEUR);
  return kleur && /^#[0-9A-Fa-f]{6}$/.test(kleur) ? kleur : '#0D1B4E';
}

/**
 * Geeft een lichtere variant van de primaire kleur terug voor achtergronden.
 * Voegt alpha toe voor CSS gebruik.
 */
function getBedrijfsKleurLicht_() {
  const kleur = getBedrijfsKleur_();
  // Converteer hex naar rgb en voeg transparantie toe (15%)
  const r = parseInt(kleur.slice(1,3), 16);
  const g = parseInt(kleur.slice(3,5), 16);
  const b = parseInt(kleur.slice(5,7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',0.08)';
}

// ─────────────────────────────────────────────
//  SERVER HANDLERS (vanuit dialoog)
// ─────────────────────────────────────────────

/**
 * Slaat het geüploade logo op in ScriptProperties.
 * Max grootte ~100 KB (ScriptProperties limiet: 9 KB per waarde = chunking vereist
 * voor grotere bestanden; hier beperken we tot 100 KB).
 */
function slaLogoOp(base64Data, mimeType) {
  if (!base64Data || base64Data.length < 10) throw new Error('Geen afbeeldingsdata ontvangen.');

  // Grootte check: base64 is ~33% groter dan binaire data
  const byteSchatting = base64Data.length * 0.75;
  if (byteSchatting > 200 * 1024) {
    throw new Error('Logo is te groot (max 200 KB). Maak de afbeelding kleiner en probeer opnieuw.');
  }

  // Sla op in ScriptProperties (chunked voor grote data)
  const props = PropertiesService.getScriptProperties();

  // Verwijder oude chunks
  const oud = parseInt(props.getProperty('bedrijfsLogoChunks') || '0');
  for (let i = 0; i < oud; i++) {
    props.deleteProperty('bedrijfsLogo_chunk_' + i);
  }

  // Splits in stukken van 8000 tekens (ScriptProperties max 9KB/waarde)
  const chunkGrootte = 8000;
  const chunks = Math.ceil(base64Data.length / chunkGrootte);

  for (let i = 0; i < chunks; i++) {
    props.setProperty('bedrijfsLogo_chunk_' + i, base64Data.slice(i * chunkGrootte, (i + 1) * chunkGrootte));
  }

  props.setProperty('bedrijfsLogoChunks', String(chunks));
  props.setProperty(PROP_LOGO_MIME, mimeType || 'image/png');
  // Sla ook één waarde op als snelle aanwezigheidscheck
  props.setProperty(PROP_LOGO, base64Data.slice(0, 50) + '...');

  auditLog_('Logo geüpload', mime + ', ' + Math.round(byteSchatting / 1024) + ' KB');
  return true;
}

/**
 * Verwijdert het bedrijfslogo.
 */
function verwijderLogo() {
  const props = PropertiesService.getScriptProperties();
  const chunks = parseInt(props.getProperty('bedrijfsLogoChunks') || '0');
  for (let i = 0; i < chunks; i++) {
    props.deleteProperty('bedrijfsLogo_chunk_' + i);
  }
  props.deleteProperty('bedrijfsLogoChunks');
  props.deleteProperty(PROP_LOGO);
  props.deleteProperty(PROP_LOGO_MIME);
  auditLog_('Logo verwijderd', '');
  return true;
}

/**
 * Interne helper: reconstrueer volledig logo base64 uit chunks.
 */
function getBedrijfsLogoVolledig_() {
  const props = PropertiesService.getScriptProperties();
  const chunks = parseInt(props.getProperty('bedrijfsLogoChunks') || '0');
  if (chunks === 0) return null;
  let b64 = '';
  for (let i = 0; i < chunks; i++) {
    b64 += props.getProperty('bedrijfsLogo_chunk_' + i) || '';
  }
  const mime = props.getProperty(PROP_LOGO_MIME) || 'image/png';
  return b64 ? 'data:' + mime + ';base64,' + b64 : null;
}

/**
 * Slaat de primaire bedrijfskleur op.
 */
function slaKleurOp(hexKleur) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexKleur)) {
    throw new Error('Ongeldige kleur. Gebruik een hex kleur zoals #0D1B4E.');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_KLEUR, hexKleur);
  auditLog_('Bedrijfskleur gewijzigd', hexKleur);
  return true;
}

/**
 * Geeft huidige branding instellingen terug (voor dialoog).
 */
function getBrandingInstellingen() {
  const props = PropertiesService.getScriptProperties();
  const heeftLogo = parseInt(props.getProperty('bedrijfsLogoChunks') || '0') > 0;
  return {
    heeftLogo: heeftLogo,
    logoPreview: heeftLogo ? getBedrijfsLogoVolledig_() : null,
    kleur: getBedrijfsKleur_(),
    bedrijfsnaam: getInstelling_('Bedrijfsnaam') || '',
  };
}

// ─────────────────────────────────────────────
//  DIALOOG
// ─────────────────────────────────────────────

/**
 * Opent de bedrijfsstijl dialoog.
 */
function openBrandingInstellingen() {
  const html = HtmlService.createHtmlOutput(`<!DOCTYPE html>
<html>
<head>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
       padding:18px;font-size:13px;margin:0;color:#1A1A1A;-webkit-font-smoothing:antialiased}
  h2{color:#0D1B4E;font-size:17px;margin:0 0 4px;font-weight:700;letter-spacing:-0.01em}
  .sub{color:#5A6478;font-size:12px;margin-bottom:18px}
  .sectie{font-size:11px;font-weight:600;color:#0D1B4E;text-transform:uppercase;
          letter-spacing:0.6px;margin:16px 0 8px;padding-bottom:6px;
          border-bottom:1px solid #E5EAF2}
  .logo-area{border:2px dashed #E5EAF2;border-radius:10px;padding:20px;text-align:center;
             cursor:pointer;transition:all 0.2s;background:#F7F9FC;min-height:96px;
             display:flex;align-items:center;justify-content:center;flex-direction:column}
  .logo-area:hover{border-color:#2EC4B6;background:#E6F7F4}
  .logo-area.heeft-logo{border-color:#2EC4B6;background:#E6F7F4}
  .logo-preview{max-width:200px;max-height:70px;object-fit:contain;margin-bottom:8px}
  .kleur-rij{display:flex;align-items:center;gap:12px;margin:8px 0}
  .kleur-vakje{width:36px;height:36px;border-radius:6px;border:2px solid #E5EAF2;
               cursor:pointer;flex-shrink:0;transition:border-color 0.2s}
  .kleur-vakje:hover{border-color:#0D1B4E}
  input[type=color]{width:44px;height:36px;padding:2px;border:1px solid #E5EAF2;border-radius:6px;cursor:pointer}
  input[type=text]{padding:8px 10px;border:1px solid #E5EAF2;border-radius:6px;font-size:13px;width:130px;
                   color:#1A1A1A;background:#fff;transition:border-color 0.15s}
  input[type=text]:focus{outline:none;border-color:#2EC4B6}
  .preview-box{background:#F7F9FC;border-radius:8px;padding:14px;margin:10px 0;
               border:1px solid #E5EAF2;text-align:center}
  .factuur-mini{background:white;border-radius:6px;padding:12px 14px;text-align:left;
                display:inline-block;width:280px;border:1px solid #E5EAF2;font-size:11px;
                box-shadow:0 1px 3px rgba(13,27,78,0.04)}
  .factuur-header{display:flex;justify-content:space-between;align-items:flex-start;
                  margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--pk)}
  .mini-label{font-size:9px;color:#5A6478;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .mini-tabel-header{color:white;padding:4px 6px;margin:4px 0;border-radius:3px;font-size:10px;background:var(--pk)}
  .btn{padding:9px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600;
       font-family:inherit;transition:background 0.15s,transform 0.05s}
  .btn:active{transform:translateY(1px)}
  .btn-pri{background:#0D1B4E;color:white}
  .btn-pri:hover{background:#1A2A6B}
  .btn-sec{background:#F7F9FC;color:#0D1B4E;margin-left:6px;border:1px solid #E5EAF2}
  .btn-sec:hover{background:#EEF2F8}
  .btn-danger{background:#FFF1F2;color:#c62828;margin-left:6px;border:1px solid #FCD9DA}
  .btn-danger:hover{background:#FFE0E2}
  .status{font-size:12px;font-style:italic;color:#5A6478;min-height:18px;margin:6px 0}
  .kleuren-presets{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
  .preset{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid transparent;
          transition:all 0.15s;flex-shrink:0}
  .preset:hover{border-color:white;box-shadow:0 0 0 2px #0D1B4E;transform:scale(1.1)}
  .tip{background:#FFF8E1;border-left:3px solid #FFC107;padding:10px 12px;font-size:11px;
       color:#5A3A00;border-radius:0 6px 6px 0;margin-top:12px;line-height:1.5}
</style>
</head>
<body>
<h2>🎨 Bedrijfsstijl instellen</h2>
<p class="sub">Uw logo en kleur worden automatisch op alle facturen geplaatst.</p>

<div class="sectie">Bedrijfslogo</div>
<div class="logo-area" id="logoArea" onclick="document.getElementById('logoInput').click()">
  <div id="logoInhoud">
    <div style="font-size:28px;margin-bottom:6px">🏢</div>
    <div>Klik hier om een logo te uploaden</div>
    <div style="font-size:11px;color:#888;margin-top:4px">PNG, JPG, SVG — max 200 KB</div>
  </div>
</div>
<input type="file" id="logoInput" accept="image/*" style="display:none" onchange="logoGekozen(this)">
<div class="status" id="logoStatus">Laden...</div>

<div class="sectie">Primaire kleur</div>
<div class="kleur-rij">
  <input type="color" id="kleurPicker" value="#0D1B4E" oninput="kleurGewijzigd(this.value)">
  <input type="text" id="kleurHex" value="#0D1B4E" onchange="kleurHexGewijzigd()" maxlength="7" placeholder="#0D1B4E">
</div>
<div class="kleuren-presets" id="presets"></div>

<div class="sectie">Voorbeeld factuur</div>
<div class="preview-box">
  <div class="factuur-mini" id="preview" style="--pk:#0D1B4E">
    <div class="factuur-header">
      <div id="prevLogo">
        <div style="font-weight:bold;font-size:13px;color:var(--pk)" id="prevNaam">Uw Bedrijf</div>
        <div style="font-size:9px;color:#888">Adres 1, 1234 AB Plaats</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:bold;color:var(--pk);font-size:12px">FACTUUR</div>
        <div style="font-size:10px;color:#555">F000001</div>
      </div>
    </div>
    <div class="mini-tabel-header">Omschrijving &nbsp;&nbsp; Aantal &nbsp;&nbsp; Prijs &nbsp;&nbsp; Totaal</div>
    <div style="font-size:10px;padding:3px 6px;border-bottom:1px solid #eee">Dienstverlening &nbsp;&nbsp; 1 &nbsp;&nbsp; €1.000 &nbsp;&nbsp; €1.000</div>
    <div style="text-align:right;font-size:10px;margin-top:4px;font-weight:bold;color:var(--pk)">Totaal: €1.210</div>
  </div>
</div>

<div class="tip">💡 <b>Tip:</b> Gebruik uw bedrijfskleur voor een herkenbare, professionele uitstraling op alle facturen.</div>

<div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">
  <button class="btn btn-pri" onclick="opslaan()">✅ Opslaan</button>
  <button class="btn btn-danger" id="verwijderBtn" onclick="verwijderLogo()" style="display:none">🗑 Logo verwijderen</button>
  <button class="btn btn-sec" onclick="google.script.host.close()">Sluiten</button>
</div>
<div class="status" id="opslaanStatus"></div>

<script>
var logoBase64 = null;
var logoMime = null;
var heeftBestaandLogo = false;

// Preset kleuren — eerste kleur = Boekhoudbaar brand-navy.
var PRESETS = [
  '#0D1B4E','#1A2A6B','#0D47A1','#01579B','#006064',
  '#2EC4B6','#1B5E20','#E65100','#BF360C','#880E4F',
  '#4A148C','#212121','#37474F',
];
var presetsEl = document.getElementById('presets');
PRESETS.forEach(function(k) {
  var el = document.createElement('div');
  el.className = 'preset';
  el.style.background = k;
  el.title = k;
  el.onclick = function() { kleurGewijzigd(k); document.getElementById('kleurPicker').value = k; };
  presetsEl.appendChild(el);
});

// Initialiseren
google.script.run
  .withSuccessHandler(function(data) {
    document.getElementById('prevNaam').textContent = data.bedrijfsnaam || 'Uw Bedrijf';
    if (data.heeftLogo && data.logoPreview) {
      toonLogoPreview(data.logoPreview);
      heeftBestaandLogo = true;
      document.getElementById('verwijderBtn').style.display = 'inline-block';
    }
    kleurGewijzigd(data.kleur || '#0D1B4E');
    document.getElementById('kleurPicker').value = data.kleur || '#0D1B4E';
    document.getElementById('kleurHex').value = data.kleur || '#0D1B4E';
    document.getElementById('logoStatus').textContent = data.heeftLogo ? '\u2713 Logo is ingesteld' : 'Nog geen logo';
  })
  .withFailureHandler(function() { document.getElementById('logoStatus').textContent = ''; })
  .getBrandingInstellingen();

function logoGekozen(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 200 * 1024) { alert('Logo te groot (max 200 KB). Maak de afbeelding kleiner.'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var parts = e.target.result.split(',');
    logoBase64 = parts[1];
    logoMime = file.type || 'image/png';
    toonLogoPreview(e.target.result);
    document.getElementById('logoStatus').textContent = '\u2713 ' + file.name + ' geselecteerd';
    document.getElementById('verwijderBtn').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}

function toonLogoPreview(dataUrl) {
  var area = document.getElementById('logoArea');
  area.classList.add('heeft-logo');
  var prevLogo = document.getElementById('prevLogo');
  prevLogo.innerHTML = '<img src="' + dataUrl + '" style="max-width:120px;max-height:40px;object-fit:contain">';
  document.getElementById('logoInhoud').innerHTML =
    '<img src="' + dataUrl + '" class="logo-preview"><br>' +
    '<span style="font-size:11px;color:#2e7d32">\u2713 Logo ingesteld</span>';
}

function kleurGewijzigd(kleur) {
  document.getElementById('kleurHex').value = kleur;
  document.getElementById('kleurPicker').value = kleur;
  document.getElementById('preview').style.setProperty('--pk', kleur);
}

function kleurHexGewijzigd() {
  var val = document.getElementById('kleurHex').value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) kleurGewijzigd(val);
}

function opslaan() {
  var kleur = document.getElementById('kleurHex').value.trim();
  document.getElementById('opslaanStatus').textContent = 'Opslaan...';

  function slaKleurOp() {
    google.script.run
      .withSuccessHandler(function() {
        document.getElementById('opslaanStatus').style.color = 'green';
        document.getElementById('opslaanStatus').textContent = '\u2705 Opgeslagen! Uw facturen worden voortaan in uw stijl gegenereerd.';
      })
      .withFailureHandler(function(e) {
        document.getElementById('opslaanStatus').style.color = 'red';
        document.getElementById('opslaanStatus').textContent = 'Fout: ' + e.message;
      })
      .slaKleurOp(kleur);
  }

  if (logoBase64) {
    google.script.run
      .withSuccessHandler(function() { slaKleurOp(); })
      .withFailureHandler(function(e) {
        document.getElementById('opslaanStatus').style.color = 'red';
        document.getElementById('opslaanStatus').textContent = 'Logo fout: ' + e.message;
      })
      .slaLogoOp(logoBase64, logoMime);
  } else {
    slaKleurOp();
  }
}

function verwijderLogo() {
  if (!confirm('Weet u zeker dat u het logo wilt verwijderen?')) return;
  google.script.run
    .withSuccessHandler(function() {
      document.getElementById('logoInhoud').innerHTML =
        '<div style="font-size:28px;margin-bottom:6px">\ud83c\udfe2</div><div>Klik hier om een logo te uploaden</div>';
      document.getElementById('logoArea').classList.remove('heeft-logo');
      document.getElementById('verwijderBtn').style.display = 'none';
      document.getElementById('prevLogo').innerHTML =
        '<div style="font-weight:bold;font-size:13px;color:var(--pk)">' +
        document.getElementById('prevNaam').textContent + '</div>' +
        '<div style="font-size:9px;color:#888">Adres 1, 1234 AB Plaats</div>';
      logoBase64 = null;
      document.getElementById('logoStatus').textContent = 'Logo verwijderd';
    })
    .withFailureHandler(function(e) { alert('Fout: ' + e.message); })
    .verwijderLogo();
}
</script>
</body>
</html>`).setWidth(560).setHeight(600);

  SpreadsheetApp.getUi().showModalDialog(html, '🎨 Bedrijfsstijl instellen');
}

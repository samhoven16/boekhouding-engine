/**
 * Onboarding.gs
 * Stap-voor-stap welkomst-wizard voor nieuwe klanten.
 *
 * Wordt automatisch getoond bij de eerste keer openen van de spreadsheet.
 * Leidt de klant door: licentie activeren → bedrijfsgegevens → eerste factuur.
 * Geschreven in eenvoudige taal — geen boekhoudkennis vereist.
 */

const ONBOARDING_PROP = 'onboarding_voltooid';
const VERSIE_PROP     = 'geinstalleerde_versie';
// Bump bij elke deploy waarbij sheet-schema, triggers of klant-zichtbaar
// gedrag verandert. Format: MAJOR.MINOR.PATCH (semver).
//   2.0.0 → 2.1.0  (Fase 0-4 polish-ronde mei 2026)
const HUIDIGE_VERSIE  = '2.7.0';

// ─────────────────────────────────────────────
//  ONBOARDING STARTEN (automatisch bij eerste gebruik)
// ─────────────────────────────────────────────

/**
 * Controleert of onboarding al is voltooid.
 * Zo niet: toon de welkomst-wizard.
 * Zo ja: controleer op updates.
 */
function controleerOnboarding_() {
  const props = PropertiesService.getScriptProperties();
  const voltooid = props.getProperty(ONBOARDING_PROP);

  // Moderne flow: klant kwam via /kopen → activation dialog → OTP → setup.
  // Tegen de tijd dat deze functie draait is setup klaar, licentie geldig.
  // De oude stap-voor-stap ui.alert-wizard zou dan nog eens om activatie
  // vragen en voelt dubbel. Auto-flag voltooid zodat 'm overslaan de
  // default is. toonPostSetupWelkomModal_ neemt de welkom-rol over.
  const setupDone = props.getProperty(PROP.SETUP_DONE) === 'true';
  if (!voltooid && setupDone) {
    props.setProperties({
      [ONBOARDING_PROP]: 'ja',
      [VERSIE_PROP]:     HUIDIGE_VERSIE,
    });
    controleerOpUpdate_();
    return;
  }

  if (!voltooid) {
    // Legacy pad (pre-setup, niet via activation-flow): oude wizard
    Utilities.sleep(1000);
    toonWelkomstWizard();
  } else {
    // Terugkerende gebruiker: stille versiecheck
    controleerOpUpdate_();
  }
}

// ─────────────────────────────────────────────
//  WELKOMST WIZARD (multi-stap)
// ─────────────────────────────────────────────

function toonWelkomstWizard() {
  const ui = SpreadsheetApp.getUi();

  // Stap 1: Welkom
  const stap1 = ui.alert(
    '🎉 Welkom bij Boekhoudbaar!',
    'Fijn dat je voor Boekhoudbaar hebt gekozen.\n\n' +
    'In de volgende stappen helpen we je in 3 minuten op weg:\n\n' +
    '  ✅ Stap 1: Je licentie activeren\n' +
    '  ✅ Stap 2: Je bedrijfsgegevens invullen\n' +
    '  ✅ Stap 3: Klaar voor gebruik!\n\n' +
    'Druk op OK om te beginnen.',
    ui.ButtonSet.OK_CANCEL
  );
  if (stap1 !== ui.Button.OK) return;

  // Stap 2: Licentie activeren
  toonLicentieDialoog();

  // Wacht even en controleer of licentie nu geldig is
  Utilities.sleep(500);

  // Stap 3: Bedrijfsgegevens
  const stap3 = ui.alert(
    '📝 Stap 2: Je bedrijfsgegevens',
    'Om facturen te maken heeft Boekhoudbaar je bedrijfsgegevens nodig.\n\n' +
    'In het tabblad "Instellingen" vul je in:\n' +
    '  • Bedrijfsnaam\n' +
    '  • Adres\n' +
    '  • KvK-nummer\n' +
    '  • BTW-nummer\n' +
    '  • Bankrekening (IBAN)\n\n' +
    'Druk op OK om naar de Instellingen te gaan.',
    ui.ButtonSet.OK_CANCEL
  );
  if (stap3 === ui.Button.OK) {
    // Navigeer naar Instellingen tabblad
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('Instellingen');
      if (sheet) ss.setActiveSheet(sheet);
    } catch (e) {
      Logger.log('Kon niet navigeren naar Instellingen: ' + e.message);
    }
  }

  // Stap 4: Klaar
  const stap4 = ui.alert(
    '🚀 Klaar voor gebruik!',
    'Je boekhouding is ingesteld.\n\n' +
    'Wat kun je nu doen?\n\n' +
    '  📋 Factuur maken → Boekhoudbaar → Nieuwe boeking\n' +
    '  📸 Bon uploaden → Boekhoudbaar → Bon of factuur uploaden\n' +
    '  💬 Hulp nodig? → Boekhoudbaar → Hulp & uitleg\n\n' +
    'Succes met je boekhouding!',
    ui.ButtonSet.OK
  );

  // Bewaarplicht-tip tonen (TAX-ADM-001) — eenmalig, idempotent
  toonTaxAdmOnboardingTip_();

  // Markeer onboarding als voltooid
  PropertiesService.getScriptProperties().setProperties({
    [ONBOARDING_PROP]: 'ja',
    [VERSIE_PROP]:     HUIDIGE_VERSIE,
  });
}

// ─────────────────────────────────────────────
//  FISCAAL PROFIEL WIZARD (POST-SETUP)
//  ────────────────────────────────────────────
// Vraagt 6 simpele ja/nee/datum-velden uit en zet ze in Instellingen.
// Daarna geeft Belastingadvies persoonlijk advies zonder dat klant zelf
// moet weten wat een KIA, AOV, WBSO of stakingsaftrek is.

function toonFiscaalProfielWizard() {
  const ss = getSpreadsheet_();
  // Lees huidige waarden uit Instellingen om als default te tonen
  const huidig = {
    geboortedatum: getInstelling_('Geboortedatum') || '',
    startjaar: getInstelling_('Startjaar onderneming') || '',
    bedrijfsactiviteit: getInstelling_('Bedrijfsactiviteit') || '',
    aovActief: getInstelling_('AOV polis actief') || '',
    wbsoActief: getInstelling_('WBSO actief') || '',
    stakingsdatum: getInstelling_('Stakingsdatum onderneming') || '',
  };
  const today = new Date().toISOString().slice(0, 10);
  const huidigJaar = new Date().getFullYear();

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
     padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;margin:0}
h2{color:#0D1B4E;margin:0 0 6px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
.sub{color:#5F6B7A;font-size:12px;margin-bottom:18px;line-height:1.5}
.veld{margin-bottom:14px}
label{display:block;font-weight:600;font-size:12px;color:#0D1B4E;margin-bottom:4px}
.help{color:#5F6B7A;font-size:11px;margin-top:3px;line-height:1.4}
input,select{width:100%;padding:9px 12px;border:1px solid #E5EAF2;border-radius:6px;
             font-size:13px;font-family:inherit;background:#fff}
input:focus,select:focus{outline:none;border-color:#2EC4B6}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{background:#2EC4B6;color:white;border:none;padding:11px 22px;border-radius:8px;
     cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;
     width:100%;margin-top:18px;transition:background 0.15s}
.btn:hover{background:#28B0A4}
.btn-skip{background:transparent;color:#5F6B7A;border:none;cursor:pointer;font-size:12px;
          font-family:inherit;width:100%;margin-top:8px;padding:6px}
.tip{background:#FFF8E1;border-radius:8px;padding:12px 14px;font-size:11px;
     color:#5A3F00;margin-top:14px;line-height:1.5}
.status{padding:10px;border-radius:6px;margin-top:10px;font-size:12px;display:none}
.status.success{background:#E8F5E9;color:#1B5E20}
.status.error{background:#FFEBEE;color:#B71C1C}
</style></head>
<body>
<h2>📋 Persoonlijk fiscaal profiel</h2>
<div class="sub">
  6 vragen → Boekhoudbaar geeft daarna automatisch persoonlijke fiscale signalering
  voor KIA, AOV, WBSO, AOW-leeftijd en alle aftrekposten waar je recht op hebt.
</div>

<div class="veld">
  <label>1. Geboortedatum</label>
  <input id="geboortedatum" type="date" value="${huidig.geboortedatum || ''}">
  <div class="help">Voor AOW-leeftijd-check. AOW-gerechtigden krijgen lager schijf-1-tarief (~17,8% i.p.v. 35,7%).</div>
</div>

<div class="veld">
  <label>2. Startjaar van je onderneming</label>
  <input id="startjaar" type="number" min="1990" max="${huidigJaar}" placeholder="${huidigJaar}" value="${huidig.startjaar || ''}">
  <div class="help">Voor startersaftrek (€2.123 in eerste 3 jaar) en starterbonus WBSO (€7.996 eerste 5 jaar).</div>
</div>

<div class="veld">
  <label>3. Bedrijfsactiviteit (kort)</label>
  <input id="bedrijfsactiviteit" type="text" placeholder="bijv. Software-ontwikkeling, B&B, Consultancy" value="${escHtml_(huidig.bedrijfsactiviteit || '')}">
  <div class="help">Voor branche-specifieke tips (bijv. logies-BTW 21% per 2026, R&D-detectie).</div>
</div>

<div class="row">
  <div class="veld">
    <label>4. Heb je een AOV?</label>
    <select id="aovActief">
      <option value="">— niet ingevuld —</option>
      <option value="Ja" ${huidig.aovActief === 'Ja' ? 'selected' : ''}>Ja, ik betaal AOV-premie</option>
      <option value="Nee" ${huidig.aovActief === 'Nee' ? 'selected' : ''}>Nee, geen AOV</option>
    </select>
    <div class="help">AOV-premie is aftrekbaar in box 1. Verplichte AOV vanaf uiterlijk 2030.</div>
  </div>

  <div class="veld">
    <label>5. Doe je R&D / innovatie-werk?</label>
    <select id="wbsoActief">
      <option value="">— niet ingevuld —</option>
      <option value="Ja" ${huidig.wbsoActief === 'Ja' ? 'selected' : ''}>Ja (≥500u/jaar)</option>
      <option value="Nee" ${huidig.wbsoActief === 'Nee' ? 'selected' : ''}>Nee</option>
    </select>
    <div class="help">Bij Ja: WBSO-aftrek mogelijk (€15.979 + starterbonus). Vraagt S&O-verklaring bij RVO.</div>
  </div>
</div>

<div class="veld">
  <label>6. Stop je dit jaar met je onderneming? (optioneel)</label>
  <input id="stakingsdatum" type="date" value="${huidig.stakingsdatum || ''}">
  <div class="help">Bij staking dit jaar: stakingsaftrek €3.630 (eenmalig per leven) + stakingslijfrente.</div>
</div>

<div class="tip">
  💡 Alle antwoorden gaan naar het tabblad "Instellingen" en kunnen later
  altijd worden aangepast. Vragen die je openlaat blokkeren niets — het systeem
  geeft dan minder gepersonaliseerd advies.
</div>

<button class="btn" id="btnOpslaan" data-actie="opslaan">Opslaan & fiscale signalering activeren</button>
<button class="btn-skip" id="btnSluiten" data-actie="sluiten">Sla over (later doen)</button>

<div id="status" class="status"></div>

<script>
function opslaan() {
  var data = {
    geboortedatum: document.getElementById('geboortedatum').value,
    startjaar: document.getElementById('startjaar').value,
    bedrijfsactiviteit: document.getElementById('bedrijfsactiviteit').value,
    aovActief: document.getElementById('aovActief').value,
    wbsoActief: document.getElementById('wbsoActief').value,
    stakingsdatum: document.getElementById('stakingsdatum').value,
  };
  var s = document.getElementById('status');
  s.className = 'status';
  s.style.display = 'block';
  s.textContent = 'Bezig met opslaan...';
  google.script.run
    .withSuccessHandler(function(){
      s.className = 'status success';
      s.textContent = '✓ Profiel opgeslagen — open Boekhoudbaar → Belastingtips voor je advies.';
      setTimeout(function(){ google.script.host.close(); }, 1800);
    })
    .withFailureHandler(function(e){
      s.className = 'status error';
      s.textContent = '⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Probeer opnieuw.');
    })
    .slaFiscaalProfielOp(data);
}

document.addEventListener('DOMContentLoaded', function() {
  var ACTIES = {
    opslaan: opslaan,
    sluiten: function() { try { google.script.host.close(); } catch (_) {} },
  };
  document.querySelectorAll('[data-actie]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      var fn = ACTIES[el.getAttribute('data-actie')];
      if (typeof fn === 'function') fn();
    });
  });
});
</script>
</body></html>
  `).setWidth(560).setHeight(700).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  SpreadsheetApp.getUi().showModalDialog(html, '📋 Fiscaal profiel');
}

/**
 * Server-side handler — schrijft profielwaarden naar Instellingen-sheet.
 * Lege waarden worden overgeslagen (bestaand blijft).
 */
function slaFiscaalProfielOp(data) {
  if (!data) return false;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (!sheet) throw new Error('Tabblad Instellingen niet gevonden — run setup eerst.');
  const veldMap = {
    'Geboortedatum':              data.geboortedatum,
    'Startjaar onderneming':      data.startjaar,
    'Bedrijfsactiviteit':         data.bedrijfsactiviteit,
    'AOV polis actief':           data.aovActief,
    'WBSO actief':                data.wbsoActief,
    'Stakingsdatum onderneming':  data.stakingsdatum,
  };
  Object.keys(veldMap).forEach(function(naam) {
    const waarde = veldMap[naam];
    if (waarde === '' || waarde == null) return;
    try { setInstelling_(naam, waarde); }
    catch (e) { Logger.log('Profiel-veld ' + naam + ': ' + e.message); }
  });
  safeAuditLog_('Fiscaal profiel bijgewerkt', Object.keys(veldMap).filter(function(k){return veldMap[k];}).join(', '));
  return true;
}

// ─────────────────────────────────────────────
//  VERSIE-UPDATE NOTIFICATIE
// ─────────────────────────────────────────────

/**
 * Controleert of er een nieuwere versie geïnstalleerd is dan de gebruiker
 * de laatste keer heeft gezien. Toont een beknopte melding indien nodig.
 */
function controleerOpUpdate_() {
  const props = PropertiesService.getScriptProperties();
  const opgeslagenVersie = props.getProperty(VERSIE_PROP) || '1.0.0';

  // Pad: lokale upgrade door owner (clasp push) → "Bijgewerkt naar X" toast
  if (opgeslagenVersie !== HUIDIGE_VERSIE) {
    // Pre-migratie backup — als een migratie data wist of corruptie veroorzaakt,
    // moet er een rollback-pad zijn. Maakt copy in /Boekhoudbaar/Backups/
    // (best-effort: bij Drive-fout gaat migratie WEL door — versie-bump is dan
    // het ergste dat misgaat, geen data-loss).
    try { _maakPreMigratieBackup_(opgeslagenVersie, HUIDIGE_VERSIE); }
    catch (be) { Logger.log('Pre-migratie backup overgeslagen: ' + be.message); }

    // Migraties uitvoeren VÓÓR het bumpen van de versie-property — anders
    // worden migraties bij een crash niet meer geprobeerd op volgende open.
    try { voerMigratiesUit_(opgeslagenVersie, HUIDIGE_VERSIE); }
    catch (e) {
      Logger.log('Migratie-fout (' + opgeslagenVersie + ' → ' + HUIDIGE_VERSIE + '): ' + e.message);
      safeAuditLog_('Migratie FOUT', e.message);
      // Versie NIET bumpen — volgende keer opnieuw proberen
      return;
    }
    props.setProperty(VERSIE_PROP, HUIDIGE_VERSIE);
    toonUpdateMelding_(opgeslagenVersie, HUIDIGE_VERSIE);
    return;
  }

  // Hybride pad: server kan vertellen dat een NIEUWERE versie beschikbaar is
  // dan wat de klant draait. Twee niveaus:
  //   - 'normaal' → toast 1×/7 dagen, niet-blokkerend
  //   - 'kritiek' (BTW-fix, fiscale correctheid, security) → modal 1×/dag,
  //     audit-gelogd. Klant kan toelichting + instructies-link zien. Audit-log
  //     is Sam's bewijslast: "klant is op datum X gewaarschuwd voor versie Y".
  try {
    if (typeof haalConfigOp_ !== 'function') return;
    const cfg = haalConfigOp_();
    if (!cfg || !cfg.versie) return;
    if (!_versieIsNieuwer_(cfg.versie, HUIDIGE_VERSIE)) return;

    const isKritiek = (cfg.versieErnst === 'kritiek') &&
      _isVersieKritiek_(HUIDIGE_VERSIE, cfg.versieKritiekVoor);

    if (isKritiek) {
      _toonKritiekeUpdateModal_(HUIDIGE_VERSIE, cfg.versie,
        cfg.versieToelichting || '', cfg.versieInstructiesUrl || 'https://boekhoudbaar.nl/update/');
    } else {
      _toonNormaleUpdateToast_(HUIDIGE_VERSIE, cfg.versie);
    }
  } catch (_) {}
}

/**
 * Klant draait een versie die op de kritieke-lijst staat (server bepaalt
 * welke). Toont modal die klant moet bevestigen. Throttle 1×/dag — klant
 * kan in een dag meerdere keren openen, niet steeds nag.
 *
 * Audit-log: bewijst dat klant is gewaarschuwd voor deze upgrade. Bij
 * latere geschil ("ik wist het niet") is dit Sam's bewijslast.
 */
function _toonKritiekeUpdateModal_(huidigeVersie, nieuweVersie, toelichting, instructiesUrl) {
  const userProps = PropertiesService.getUserProperties();
  const lastKey = 'kritiekeUpdateModalTs_' + nieuweVersie;
  const last = parseInt(userProps.getProperty(lastKey) || '0');
  if (Date.now() - last < 24 * 3600 * 1000) return;
  userProps.setProperty(lastKey, String(Date.now()));

  try { safeAuditLog_('Kritieke update aangekondigd',
    'huidige=' + huidigeVersie + ' nieuw=' + nieuweVersie); } catch (_) {}

  // Escape: server-input komt nu uit ScriptProperties (Sam-controlled), maar
  // bij toekomstig admin-dashboard kan iemand anders die zetten. Geen XSS-risico.
  const esc = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  huidigeVersie = esc(huidigeVersie);
  nieuweVersie  = esc(nieuweVersie);
  toelichting   = esc(toelichting);
  instructiesUrl = _veiligeUpdateUrl_(instructiesUrl);

  try {
    const html = HtmlService.createHtmlOutput(`
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
             padding:24px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
        .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#B91C1C;margin-bottom:6px}
        h3{color:#0D1B4E;margin-bottom:8px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
        p{color:#5A6478;line-height:1.55;margin:0 0 10px}
        .versie{background:#fff;border:1px solid #E5EAF2;padding:10px 14px;border-radius:8px;margin:12px 0;font-size:13px}
        .versie b{color:#0D1B4E}
        .warn{background:#FDECEC;border-left:3px solid #B91C1C;color:#5A1010;padding:12px 14px;border-radius:0 6px 6px 0;margin:12px 0;font-size:12px;line-height:1.55}
        .btn{background:#0D1B4E;color:white;border:none;padding:11px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;text-decoration:none;display:inline-block}
        .btn:hover{background:#1A2A6B}
        .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-left:6px}
        .btn-sec:hover{background:#EEF2F8}
      </style>
      <div class="label">Kritieke update</div>
      <h3>Update naar versie ${nieuweVersie} aanbevolen</h3>
      <div class="versie">
        Je versie: <b>${huidigeVersie}</b> &nbsp;→&nbsp; Beschikbaar: <b>${nieuweVersie}</b>
      </div>
      <p>${toelichting || 'Deze versie bevat een correctie die invloed kan hebben op je fiscale aangifte of administratie.'}</p>
      <div class="warn">
        <b>Waarom dit serieus is:</b> kritieke updates lossen fouten op in BTW-berekening, jaarafsluiting of compliance. We streven ernaar deze binnen redelijke termijn beschikbaar te stellen. Verantwoordelijkheid voor de juistheid van je aangifte blijft bij jou als ondernemer (AWR art. 8); update tijdig om afwijkingen te voorkomen.
      </div>
      <p>De update-instructies (≈ 5 minuten werk) vind je op:</p>
      <p><a class="btn" href="${instructiesUrl}" target="_blank" rel="noopener noreferrer">Open update-instructies</a>
         <button class="btn-sec" onclick="google.script.host.close()">Later — herinner me morgen</button></p>
    `).setWidth(560).setHeight(420).setSandboxMode(HtmlService.SandboxMode.IFRAME);
    SpreadsheetApp.getUi().showModalDialog(html, '⚠ Kritieke update beschikbaar');
  } catch (_) {
    // Geen UI (trigger-context) — toast als fallback
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'KRITIEKE update naar ' + nieuweVersie + ' beschikbaar. Zie ' + instructiesUrl,
        '⚠ Update vereist', 15
      );
    } catch (__) {}
  }
}

/**
 * Niet-kritieke update: zachte toast 1×/7 dagen. Klant kan negeren.
 */
function _toonNormaleUpdateToast_(huidigeVersie, nieuweVersie) {
  const userProps = PropertiesService.getUserProperties();
  const last = parseInt(userProps.getProperty('serverVersieToastTs') || '0');
  if (Date.now() - last < 7 * 24 * 3600 * 1000) return;
  userProps.setProperty('serverVersieToastTs', String(Date.now()));
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Versie ' + nieuweVersie + ' is beschikbaar (jij draait ' + huidigeVersie + '). ' +
      'Menu: Boekhoudbaar → Licentie & Updates → Hoe update ik?',
      '↑ Update beschikbaar', 10
    );
  } catch (_) {}
}

/**
 * Returnt true als huidigeVersie in de kritieke-lijst staat (string-match).
 * Lege lijst = nooit kritiek (server heeft (nog) niets geclassificeerd).
 */
function _isVersieKritiek_(huidigeVersie, kritiekVoor) {
  if (!Array.isArray(kritiekVoor) || kritiekVoor.length === 0) return false;
  return kritiekVoor.indexOf(String(huidigeVersie)) >= 0;
}

/**
 * Domain-allowlist op update-instructies-URL. Server-config kan momenteel
 * alleen door Sam worden gezet, maar bij toekomstig admin-dashboard kan
 * iemand anders die zetten — dan wordt deze URL klikbare phishing-vector.
 * Allowlist: alleen boekhoudbaar.nl-subdomeinen + github.com/samhoven16.
 * Bij mismatch: fallback naar default https://boekhoudbaar.nl/update/.
 */
function _veiligeUpdateUrl_(url) {
  const fallback = 'https://boekhoudbaar.nl/update/';
  const s = String(url || '').trim();
  if (!s) return fallback;
  // Eerst scheme: alleen https (geen javascript:, geen http: voor anti-MITM)
  if (!/^https:\/\//i.test(s)) return fallback;
  // Dan host extraheren: alles tussen https:// en eerste /, ? of #
  const m = s.match(/^https:\/\/([^/?#]+)/i);
  if (!m) return fallback;
  const host = m[1].toLowerCase();
  // Allowed: boekhoudbaar.nl, *.boekhoudbaar.nl, github.com (Sam's gist/pages)
  if (host === 'boekhoudbaar.nl') return s;
  if (host.endsWith('.boekhoudbaar.nl')) return s;
  if (host === 'github.com' || host === 'gist.github.com') return s;
  return fallback;
}

/**
 * Cleanup: `kritiekeUpdateModalTs_X.Y.Z` keys groeien per kritieke release.
 * Bij 50 releases over 5 jaar = 50 stale UserProperties-keys per gebruiker.
 * Verwijder keys ouder dan 30 dagen (ruim voor 24u-throttle-window).
 * Wordt aangeroepen door dagelijkseTaken cleanup-fase.
 */
function cleanupKritiekeUpdateModalKeys_() {
  const userProps = PropertiesService.getUserProperties();
  const alle = userProps.getProperties();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let verwijderd = 0;
  Object.keys(alle).forEach(function(k) {
    if (k.indexOf('kritiekeUpdateModalTs_') !== 0) return;
    const ts = parseInt(alle[k] || '0');
    if (isFinite(ts) && ts > 0 && ts < cutoff) {
      try { userProps.deleteProperty(k); verwijderd++; } catch (_) {}
    }
  });
  if (verwijderd > 0) {
    try { safeAuditLog_('cleanupKritiekeUpdateModalKeys',
      'Verwijderd ' + verwijderd + ' verlopen modal-throttle-keys'); } catch (_) {}
  }
}

/**
 * Menu-actie: klant kan altijd handmatig naar de update-pagina.
 * Forceert versie-check (bypass cache) zodat klant meteen de meest recente
 * info ziet — geen 24u-staleness.
 */
function toonHoeUpdateIk() {
  let cfg = null;
  try {
    // Cache-spam guard: max 1× per 60s een geforceerde server-fetch. Voorkomt
    // dat klant door menu-klikken een burst richting `?actie=config` triggert
    // (gas-runtime-audit vondst). Onder de 60s = cache gebruiken zoals die is.
    const userProps = PropertiesService.getUserProperties();
    const lastForce = parseInt(userProps.getProperty('toonHoeUpdateIkForceTs') || '0');
    if (Date.now() - lastForce > 60 * 1000) {
      userProps.setProperty('toonHoeUpdateIkForceTs', String(Date.now()));
      userProps.deleteProperty('licentieConfigTs');
    }
    cfg = haalConfigOp_();
  } catch (_) {}

  const esc = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const nieuw = esc((cfg && cfg.versie) || 'onbekend');
  const url = _veiligeUpdateUrl_(cfg && cfg.versieInstructiesUrl);
  const isNieuwer = cfg && cfg.versie && _versieIsNieuwer_(cfg.versie, HUIDIGE_VERSIE);
  const isKritiek = isNieuwer && cfg.versieErnst === 'kritiek' &&
    _isVersieKritiek_(HUIDIGE_VERSIE, cfg.versieKritiekVoor);

  const statusBlok = isNieuwer
    ? (isKritiek
        ? '<div style="background:#FDECEC;border-left:3px solid #B91C1C;color:#5A1010;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px"><b>Kritieke update beschikbaar</b><br>' + esc(cfg.versieToelichting || 'BTW/compliance-correctie.') + '</div>'
        : '<div style="background:#FFF8E1;border-left:3px solid #FFC107;color:#5A3F00;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px"><b>Nieuwe versie beschikbaar</b><br>Niet-urgent — update wanneer je tijd hebt.</div>')
    : '<div style="background:#E6F7F4;border-left:3px solid #2EC4B6;color:#0D1B4E;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px"><b>Je bent up-to-date</b></div>';

  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:22px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:4px}
      h3{color:#0D1B4E;margin-bottom:8px;font-size:18px;font-weight:800;letter-spacing:-0.01em}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      .versie{background:#fff;border:1px solid #E5EAF2;padding:10px 14px;border-radius:8px;margin:10px 0;font-size:13px}
      .versie b{color:#0D1B4E}
      .btn{background:#0D1B4E;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none;display:inline-block;font-family:inherit}
      .btn:hover{background:#1A2A6B}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-left:6px}
    </style>
    <div class="label">Updates</div>
    <h3>Hoe update ik?</h3>
    <div class="versie">Je versie: <b>${HUIDIGE_VERSIE}</b> &nbsp;&nbsp; Beschikbaar: <b>${nieuw}</b></div>
    ${statusBlok}
    <p>Updates voor Boekhoudbaar werken via een korte handmatige stap. Bekijk de instructies:</p>
    <p><a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">Open update-instructies</a>
       <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button></p>
  `).setWidth(540).setHeight(380).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, 'Updates');
}

/** Vergelijkt 'a.b.c' versie-strings. Returns true als a > b. */
function _versieIsNieuwer_(a, b) {
  const pa = String(a || '0').split('.').map(function(x) { return parseInt(x) || 0; });
  const pb = String(b || '0').split('.').map(function(x) { return parseInt(x) || 0; });
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function toonUpdateMelding_(oudeVersie, nieuweVersie) {
  // Niet-opdringerig: gebruik een toast (kleine melding onderaan scherm)
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Bijgewerkt van versie ${oudeVersie} naar ${nieuweVersie}. Zie Boekhouding → Wat is er nieuw? voor details.`,
      '✅ Boekhoudbaar bijgewerkt',
      8
    );
  } catch (e) {
    Logger.log('Update melding kon niet worden getoond: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  WAT IS ER NIEUW? (versiegeschiedenis)
// ─────────────────────────────────────────────

/**
 * Toont de "Wat is er nieuw?" modal. Voorheen had deze functie een
 * eigen hardcoded HTML-changelog met versies 2.0.0 / 1.5.0 / 1.0.0 —
 * die werd nooit bijgewerkt en lag mijlen ver achter op het dynamische
 * CHANGELOG_ENTRIES in Changelog.gs (2.3.0–2.6.0). Klant die de Updates-
 * submenu-entry opende dacht dat het product al een jaar stilstond.
 *
 * Nu: delegeer naar toonChangelogVolledig zodat één bron van waarheid
 * geldt — wat owner aan CHANGELOG_ENTRIES toevoegt verschijnt overal.
 */
function toonWatIsErNieuw() {
  if (typeof toonChangelogVolledig === 'function') {
    toonChangelogVolledig();
    return;
  }
  // Defensieve fallback voor het hypothetische geval dat Changelog.gs
  // ontbreekt — tonen we een minimaal bericht met versie-info.
  SpreadsheetApp.getUi().alert(
    'Wat is er nieuw?',
    'Versie ' + (typeof HUIDIGE_VERSIE !== 'undefined' ? HUIDIGE_VERSIE : 'onbekend') +
    ' is geïnstalleerd. Het changelog-overzicht is momenteel niet beschikbaar.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  POST-SETUP WELKOM-MODAL (éénmalig na eerste setup)
// ─────────────────────────────────────────────

const POST_SETUP_WELKOM_GEZIEN = 'postSetupWelkomGezien';

/**
 * Toont éénmalig een welkom-modal zodra setup() klaar is. Vertelt de
 * klant dat de boekhouding live is en biedt 3 duidelijke vervolgacties:
 * bedrijfsgegevens invullen, eerste factuur maken, dashboard openen.
 * Daarna wordt de property gezet en verschijnt 't nooit meer.
 */
function toonPostSetupWelkomModal_() {
  const scriptProps = PropertiesService.getScriptProperties();
  if (scriptProps.getProperty(PROP.SETUP_DONE) !== 'true') return;

  const userProps = PropertiesService.getUserProperties();
  if (userProps.getProperty(POST_SETUP_WELKOM_GEZIEN) === 'true') return;

  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return; }  // geen UI-context (trigger)

  const bedrijfRaw = (getInstelling_ && typeof getInstelling_ === 'function')
    ? (getInstelling_('Bedrijfsnaam') || '')
    : '';
  // SECURITY: bedrijfsnaam is klant-controlled input. Escapen voor embed in
  // HTML/template-literal — anders kan een payload als
  // "<img src=x onerror=alert(1)>" als bedrijfsnaam JS uitvoeren in dialog.
  const bedrijf = (typeof escHtml_ === 'function') ? escHtml_(bedrijfRaw) : String(bedrijfRaw).replace(/[<>&"']/g, '');
  const begroeting = bedrijf ? 'Welkom bij Boekhoudbaar, ' + bedrijf : 'Welkom bij Boekhoudbaar';

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           color:#1A1A1A;background:linear-gradient(135deg,#F7F9FC 0%,#EAF4F2 100%);padding:30px 32px;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#2EC4B6;margin-bottom:10px}
      h1{color:#0D1B4E;font-size:24px;font-weight:800;letter-spacing:-0.015em;margin-bottom:8px;line-height:1.2}
      p.sub{color:#5F6B7A;font-size:14px;line-height:1.6;margin-bottom:22px}
      .acties{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}
      .actie{
        display:flex;align-items:center;gap:14px;padding:14px 16px;
        background:#fff;border:1px solid #E5EAF2;border-radius:12px;
        cursor:pointer;transition:all .18s ease;
        font-family:inherit;font-size:14px;text-align:left;color:#1A1A1A;width:100%;
        box-shadow:0 1px 2px rgba(13,27,78,.04);
      }
      .actie:hover{border-color:#2EC4B6;transform:translateY(-2px);box-shadow:0 6px 18px rgba(13,27,78,.10);background:#FFFFFF}
      .actie:active{transform:translateY(0);box-shadow:0 2px 6px rgba(13,27,78,.08)}
      .actie .n{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2EC4B6 0%,#1FA89C 100%);color:#fff;
                font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
                box-shadow:0 2px 6px rgba(46,196,182,.3)}
      .actie .t{flex:1;min-width:0}
      .actie .t strong{display:block;color:#0D1B4E;font-weight:700;font-size:14px;margin-bottom:3px;letter-spacing:-0.01em}
      .actie .t span{color:#5F6B7A;font-size:12px;line-height:1.45;display:block}
      .actie .arrow{color:#9CA3B0;font-size:18px;flex-shrink:0;transition:color .15s,transform .15s}
      .actie:hover .arrow{color:#2EC4B6;transform:translateX(2px)}
      .later{text-align:center;margin-top:8px}
      .later button{background:none;border:none;color:#5F6B7A;font-size:13px;cursor:pointer;font-family:inherit;padding:8px 12px;border-radius:6px;transition:all .15s}
      .later button:hover{color:#0D1B4E;background:rgba(13,27,78,.04)}
      .actie-primair{border-color:#2EC4B6;background:rgba(46,196,182,.06)}
    </style>
    <div class="label">✨ Setup voltooid</div>
    <h1>${begroeting}</h1>
    <p class="sub">Je boekhouding staat klaar. Kies hieronder waar je wil beginnen — of later via het Boekhouding-menu.</p>
    <div class="acties">
      <button class="actie actie-primair" type="button" data-actie="instellingen">
        <span class="n">1</span>
        <span class="t"><strong>Bedrijfsgegevens invullen</strong><span>Naam, BTW-nummer, IBAN — nodig voor facturen · begin hier</span></span>
        <span class="arrow">›</span>
      </button>
      <button class="actie" type="button" data-actie="profiel">
        <span class="n">2</span>
        <span class="t"><strong>Fiscaal profiel invullen (60 sec)</strong><span>Voor signalering over KIA, AOV, WBSO &amp; AOW-leeftijd</span></span>
        <span class="arrow">›</span>
      </button>
      <button class="actie" type="button" data-actie="boeking">
        <span class="n">3</span>
        <span class="t"><strong>Eerste factuur of kostenpost boeken</strong><span>Nieuwe boeking dialoog openen</span></span>
        <span class="arrow">›</span>
      </button>
      <button class="actie" type="button" data-actie="dashboard">
        <span class="n">4</span>
        <span class="t"><strong>Dashboard bekijken</strong><span>KPI's en openstaande facturen in één oogopslag</span></span>
        <span class="arrow">›</span>
      </button>
    </div>
    <div class="later"><button id="btn-later" type="button" data-actie="later">Later — sluit dit venster</button></div>
    <script>
      // FIRE-AND-FORGET pattern: server-call gaat de lucht in,
      // dialog sluit DIRECT zonder wachten op response.
      // Voorheen: wachten op .withSuccessHandler kon eindeloos hangen
      // bij CSP/privacy/cache issues. Nu: nooit hangen.
      function doeActie(actie) {
        try { google.script.run.markeerWelkomGezienEnNavigeer(actie); } catch (_) {}
        try { google.script.host.close(); } catch (_) {}
      }
      // Bind via addEventListener — werkt in elke CSP-mode incl. iframe-strict.
      function bindAlleKnoppen() {
        document.querySelectorAll('button[data-actie]').forEach(function(btn) {
          if (btn._bound) return;
          btn._bound = true;
          btn.addEventListener('click', function(ev) {
            ev.preventDefault();
            doeActie(btn.getAttribute('data-actie'));
          });
        });
      }
      // Bind nu (DOM is klaar bij script-execution in Apps Script dialogs)
      bindAlleKnoppen();
      // Plus DOMContentLoaded als extra zekerheid
      document.addEventListener('DOMContentLoaded', bindAlleKnoppen);
    </script>
  `).setWidth(460).setHeight(440).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  ui.showModalDialog(html, 'Welkom bij Boekhoudbaar');
}

/**
 * Zet de welkom-gezien-vlag en navigeert (optioneel) naar de gekozen
 * vervolg-actie. Aangeroepen vanuit de welkom-modal.
 */
/**
 * Zet de welkom-gezien-vlag en navigeert (optioneel) naar de gekozen
 * vervolg-actie. Aangeroepen vanuit de welkom-modal.
 *
 * BELANGRIJK: PUBLIEKE naam (geen trailing underscore) — anders kan
 * google.script.run de functie niet aanroepen. Apps Script-conventie:
 * functies met trailing _ zijn private en niet bereikbaar vanuit dialogs.
 */
function markeerWelkomGezienEnNavigeer(actie) {
  PropertiesService.getUserProperties().setProperty(POST_SETUP_WELKOM_GEZIEN, 'true');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // UX: directe feedback dat klant-actie aankomt. Voorheen sloot modal
    // dicht zonder dat klant zag wat ging gebeuren → 1-3 sec stilte voelt
    // als "kapot". Toast verschijnt onder, sheet-navigation volgt direct.
    const meldingen = {
      instellingen: 'Naviger naar Instellingen…',
      dashboard:    'Naviger naar Dashboard…',
      boeking:      'Boekingsdialog wordt geopend…',
      later:        '',
    };
    const m = meldingen[actie];
    if (m) { try { ss.toast(m, 'Even geduld', 3); } catch (_) {} }

    if (actie === 'instellingen') {
      const s = ss.getSheetByName(SHEETS.INSTELLINGEN);
      if (s) ss.setActiveSheet(s);
    } else if (actie === 'dashboard') {
      const s = ss.getSheetByName(SHEETS.DASHBOARD);
      if (s) ss.setActiveSheet(s);
    } else if (actie === 'boeking') {
      // Apps Script kan maar 1 modal tegelijk tonen — wacht 1500ms zodat de
      // client-side host.close() van welkom-modal echt afgerond is.
      if (typeof openNieuweBoeking === 'function') {
        Utilities.sleep(1500);
        openNieuweBoeking();
      }
    } else if (actie === 'profiel') {
      // Auto-trigger fiscaal profiel — voorheen alleen via menu te bereiken,
      // nu prominent als stap 2 in welkomstmodal zodat klant direct
      // persoonlijk advies krijgt zonder zelf te zoeken.
      // 1500ms i.p.v. 300ms — Apps Script kan geen 2 modals stacken.
      if (typeof toonFiscaalProfielWizard === 'function') {
        Utilities.sleep(1500);
        toonFiscaalProfielWizard();
      }
    }
  } catch (e) { Logger.log('Welkom-navigatie fout: ' + e.message); }
}

// ─────────────────────────────────────────────
//  ONBOARDING RESETTEN (voor ontwikkeling/support)
// ─────────────────────────────────────────────

/**
 * Reset de onboarding-status zodat de wizard opnieuw wordt getoond.
 * Handig voor support bij problemen, of bij demo-presentaties.
 */
function resetOnboarding() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(ONBOARDING_PROP);
  props.deleteProperty(VERSIE_PROP);
  PropertiesService.getUserProperties().deleteProperty(POST_SETUP_WELKOM_GEZIEN);
  SpreadsheetApp.getUi().alert(
    'Onboarding gereset',
    'De welkomst-wizard + post-setup welkom-modal worden opnieuw getoond.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  MIGRATIES
// ─────────────────────────────────────────────
//
// Bij elke versie-bump waarbij sheet-schema, ScriptProperty-format of
// klant-data wijzigt, voeg een migreer_v{X}_naar_v{Y}_(ss) functie toe
// onder MIGRATIES_REGISTER. Volgorde van uitvoering: oplopende vanaf
// klant-versie naar HUIDIGE_VERSIE.
//
// REGEL: migraties moeten IDEMPOTENT zijn — bij crash + retry mag er
// geen data-corruptie zijn. Patroon:
//   if (alreadyMigrated_) return;  // skip
//   doActualMigration();
//
// Test elke migratie in tests/unit/migraties.test.js.
const MIGRATIES_REGISTER = [
  // 2.0 → 2.1: polish-ronde, geen schema-wijziging
  {
    van: '2.0.0',
    naar: '2.1.0',
    naam: 'polish_ronde_mei_2026',
    fn: function(_ss) {
      safeAuditLog_('Migratie 2.0→2.1', 'no-op (UX-polish only)');
    },
  },
  // 2.1 → 2.6: één gebundelde migratie omdat 2.2-2.5 nooit publieke
  // releases waren (alleen interne ontwikkel-snapshots). Geen schema-
  // wijziging — alle 2.1→2.6 verbeteringen zijn UX/copy/email/legal.
  // Wat WEL doe: zorg dat eventuele oude SHEETS.GROOTBOEK-property ruimt
  // (de undefined-bug-fix) door cache-invalidation aan te roepen.
  {
    van: '2.1.0',
    naar: '2.6.0',
    naam: 'launch_ready_mei_2026',
    fn: function(_ss) {
      try {
        // Stop eventuele lopende FATAL-throttle-cache zodat klant niet
        // herhaalde mails krijgt over de oude 'undefined tabblad'-bug.
        const cache = CacheService.getScriptCache();
        ['fataal_TAB_DELETED_', 'fataal_TAB_DELETED'].forEach(function(prefix) {
          try { cache.remove(prefix); } catch (_) {}
        });
      } catch (_) {}
      safeAuditLog_('Migratie 2.1→2.6', 'launch-ready (UX/copy/legal + FATAL-spam-fix)');
    },
  },
  // 2.6 → 2.7: voeg klant-overschrijfbare belastingtarieven toe aan Instellingen.
  // Bij Prinsjesdag-update kan klant nu zelf tarieven aanpassen zonder
  // op script-update te wachten. Idempotent — bij bestaande sectie no-op.
  {
    van: '2.6.0',
    naar: '2.7.0',
    naam: 'belasting_overrides_in_instellingen',
    fn: function(_ss) {
      try {
        if (typeof voegBelastingOverridesToeAanInstellingen_ === 'function') {
          voegBelastingOverridesToeAanInstellingen_();
        }
      } catch (e) { Logger.log('Migratie 2.6→2.7 fout: ' + e.message); }
      safeAuditLog_('Migratie 2.6→2.7', 'belasting-overrides sectie in Instellingen toegevoegd');
    },
  },
];

/**
 * Voert alle migraties uit die nodig zijn om van `vanafVersie` naar
 * `naarVersie` te komen. Migraties zijn aflopend op `van` gesorteerd
 * — als klant op 1.5.0 staat en 2.1.0 binnenkomt, draait de chain
 * 1.5→2.0 dan 2.0→2.1 (in registratie-volgorde).
 *
 * Bij fout: throw — de versie-property wordt door caller NIET ge-bumpt
 * zodat volgende open opnieuw probeert.
 */
function voerMigratiesUit_(vanafVersie, naarVersie) {
  const ss = getSpreadsheet_();
  if (!ss) return;
  // Selecteer ALLE migraties tussen vanafVersie en naarVersie:
  //   m.van  ≥ vanafVersie  (klant heeft deze nog niet gehad)
  //   m.naar ≤ naarVersie   (deze migratie hoort tot doel-versie)
  // Sorteer chronologisch zodat een sprong (bv. 2.0→2.5) elke tussenliggende
  // migratie 2.0→2.1, 2.1→2.2, ..., 2.4→2.5 in de juiste volgorde draait.
  // Eerdere implementatie miste tussenliggende migraties bij meerdere stappen.
  const toepasselijk = MIGRATIES_REGISTER
    .filter(function(m) {
      return !_versieIsNieuwer_(vanafVersie, m.van)   // m.van >= vanaf
          && !_versieIsNieuwer_(m.naar, naarVersie);  // m.naar <= naar
    })
    .sort(function(a, b) {
      // Oplopende volgorde op .van — _versieIsNieuwer_(a,b) = true → a > b
      if (_versieIsNieuwer_(a.van, b.van)) return 1;
      if (_versieIsNieuwer_(b.van, a.van)) return -1;
      return 0;
    });
  toepasselijk.forEach(function(m) {
    Logger.log('Migratie ' + m.naam + ' (' + m.van + ' → ' + m.naar + ') uitvoeren...');
    m.fn(ss);
    Logger.log('Migratie ' + m.naam + ' klaar.');
  });
}

/**
 * Maakt een copy van de spreadsheet vóór een migratie wordt gedraaid.
 * Slaat op in /Boekhoudbaar/Backups/ — naam bevat van/naar versie + datum.
 * Best-effort: bij Drive-fout (quota, permissions) blokkeert de migratie niet.
 *
 * Backups ouder dan 90 dagen worden NIET automatisch verwijderd; klant
 * beheert zelf z'n Drive-quota.
 */
function _maakPreMigratieBackup_(vanaf, naar) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    const backupMap = getDriveBackupMap_();
    const ts = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd_HH-mm');
    const naam = 'pre-migratie-' + vanaf + '-naar-' + naar + '-' + ts;
    const copy = ss.copy(naam);
    // drive.file: geen getRootFolder()-move-idioom. moveTo() verplaatst de kopie
    // naar de (app-aangemaakte) Backups-map; zonder hoofdmap blijft 'ie staan.
    if (backupMap) {
      try { DriveApp.getFileById(copy.getId()).moveTo(backupMap); } catch (_) {}
    }
    safeAuditLog_('Pre-migratie backup', naam + ' (' + copy.getId() + ')');
  } catch (e) {
    Logger.log('_maakPreMigratieBackup_ fout: ' + e.message);
    throw e;
  }
}

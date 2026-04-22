/**
 * Licentie.gs
 * Licentiebeheer — activering via e-mail + OTP, kopieerbeveiliging.
 *
 * Klantflow:
 *  1. Klant ontvangt e-mail met "Maak een kopie"-link naar master-sjabloon
 *  2. Bij eerste open: activatiedialoog verschijnt automatisch
 *  3. Klant vult e-mailadres in → ontvangt 6-cijferige OTP per e-mail
 *  4. Klant voert OTP in → licentie gebonden aan deze spreadsheet-ID
 *  5. Setup draait automatisch — klant is direct aan de slag
 *
 * Kopieerbeveiliging:
 *  - Bij "Maak een kopie" worden Script Properties NIET meegekopieerd
 *  - De kopie opent zonder licentie-binding → vergrendelscherm
 *  - Alle sheets worden beschermd (read-only) met link naar boekhoudbaar.nl
 */

// ─────────────────────────────────────────────
//  CONSTANTEN
// ─────────────────────────────────────────────
const LICENTIE_PROP_KEY   = 'licentiesleutel';
const LICENTIE_CACHE_KEY  = 'licentieCacheGeldigTot';
const LICENTIE_KLANT_KEY  = 'licentieKlantnaam';
const LICENTIE_VERSIE_KEY = 'licentieVersie';
const LICENTIE_SS_ID_KEY  = 'licentieSsId';        // Gebonden spreadsheet-ID
const LICENTIE_CACHE_UREN = 24;

function getLicentieServerUrl_() {
  return PropertiesService.getScriptProperties()
    .getProperty('LICENTIE_SERVER_URL') || '';
}

// ─────────────────────────────────────────────
//  ONOPEN-CHECK: LICENTIE EN KOPIE
// ─────────────────────────────────────────────
/**
 * Aanroepen vanuit onOpen. Retourneert true als licentie geldig en spreadsheet origineel.
 * Bij kopie: vergrendelt en retourneert false. Bij niet-geactiveerd: toont dialoog.
 */
function controleerLicentieEnKopie_() {
  const props      = PropertiesService.getScriptProperties();
  const sleutel    = props.getProperty(LICENTIE_PROP_KEY);
  const regSsId    = props.getProperty(LICENTIE_SS_ID_KEY);
  const huidigSsId = SpreadsheetApp.getActiveSpreadsheet().getId();

  // Geval 1: Kopie gedetecteerd — gebonden ID bestaat maar komt niet overeen
  if (regSsId && regSsId !== huidigSsId) {
    vergrendelKopie_();
    return false;
  }

  // Geval 2: Nog niet geactiveerd
  if (!sleutel) {
    try { toonActivatieDialog_(); } catch (_) {}
    return false;
  }

  // Geval 3: Geactiveerd — periodiek server-validatie (1× per dag, stil)
  try {
    const userProps = PropertiesService.getUserProperties();
    const lastCheck = parseInt(userProps.getProperty('licentieLastCheck') || '0');
    if (Date.now() - lastCheck > LICENTIE_CACHE_UREN * 3600 * 1000) {
      const res = valideerLicentieOpServer_(sleutel);
      if (res.geldig) {
        userProps.setProperty('licentieLastCheck', String(Date.now()));
      } else if (!res.offline) {
        // Server zegt expliciet ongeldig (niet offline) → nieuwe activatie
        props.deleteProperty(LICENTIE_PROP_KEY);
        props.deleteProperty(LICENTIE_SS_ID_KEY);
        try { toonActivatieDialog_(); } catch (_) {}
        return false;
      }
    }
  } catch (_) {}

  return true;
}

// ─────────────────────────────────────────────
//  KOPIE VERGRENDELEN
// ─────────────────────────────────────────────
function vergrendelKopie_() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const mij = Session.getEffectiveUser().getEmail();

  ss.getSheets().forEach(function(sheet) {
    try {
      const prot = sheet.protect();
      prot.setDescription('Boekhoudbaar — licentie vereist');
      // Verwijder alle editors behalve eigenaar (onszelf)
      const editors = prot.getEditors();
      if (editors.length > 0) prot.removeEditors(editors);
      if (mij) prot.addEditor(mij);
      prot.setUnprotectedRanges([]);
    } catch (_) {}
  });

  try {
    const html = HtmlService.createHtmlOutput(`
      <!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                   padding:28px 30px;background:#F7F9FC;color:#1A1A1A;-webkit-font-smoothing:antialiased">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:6px">Licentie vereist</div>
        <h2 style="color:#0D1B4E;font-size:22px;font-weight:800;letter-spacing:-0.01em;margin-bottom:10px;line-height:1.3">
          Dit is een kopie van een Boekhoudbaar-sheet
        </h2>
        <p style="color:#5F6B7A;font-size:13px;line-height:1.6;margin-bottom:16px">
          Elke Boekhoudbaar-installatie heeft een eigen licentie nodig. Deze kopie is niet
          geactiveerd. Alle tabbladen zijn daarom alleen-lezen.
        </p>
        <div style="background:#fff;border:1px solid #E5EAF2;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:13px;line-height:1.55;color:#1A1A1A">
          <strong style="color:#0D1B4E">Wat te doen?</strong><br>
          <span style="color:#5F6B7A">Open de originele spreadsheet die je bij activering hebt aangemaakt, óf koop een eigen licentie hieronder.</span>
        </div>
        <div style="text-align:center;margin-top:20px">
          <a href="https://boekhoudbaar.nl/kopen" target="_blank"
             style="background:#0D1B4E;color:#fff;padding:13px 28px;border-radius:10px;
                    text-decoration:none;font-weight:600;font-size:14px;display:inline-block;letter-spacing:.1px">
            Koop een licentie — €49
          </a>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin-top:18px;text-align:center">
          Al gekocht? Mail <a href="mailto:hallo@boekhoudbaar.nl" style="color:#0D1B4E">hallo@boekhoudbaar.nl</a>.
        </p>
      </body></html>
    `).setWidth(460).setHeight(380);
    SpreadsheetApp.getUi().showModalDialog(html, 'Boekhoudbaar — Licentie vereist');
  } catch (_) {}
}

// ─────────────────────────────────────────────
//  ACTIVATIEDIALOOG (OTP — 2 stappen)
// ─────────────────────────────────────────────
function toonActivatieDialog_() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html><html lang="nl"><head>
    <meta charset="UTF-8">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           padding:26px 28px;font-size:14px;color:#1A1A1A;background:#F7F9FC;
           -webkit-font-smoothing:antialiased}
      .head{margin-bottom:22px}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:6px}
      h2{font-size:20px;font-weight:800;color:#0D1B4E;letter-spacing:-0.01em;margin-bottom:6px;line-height:1.3}
      .sub{color:#5F6B7A;font-size:13px;line-height:1.55}
      .stap{display:none}
      .stap.actief{display:block}
      label.veld{display:block;font-weight:600;margin-bottom:6px;color:#1A1A1A;font-size:13px}
      input{width:100%;padding:12px 14px;border:1px solid #E5EAF2;border-radius:8px;
            font-size:14px;font-family:inherit;margin-bottom:12px;background:#fff;
            transition:border-color .15s ease,box-shadow .15s ease}
      input:focus{outline:none;border-color:#2EC4B6;box-shadow:0 0 0 3px rgba(46,196,182,.18)}
      input#otp{font-family:inherit;letter-spacing:6px;font-size:18px;text-align:center;font-weight:600}
      .btn{width:100%;padding:13px 16px;background:#0D1B4E;color:#fff;border:none;
           border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;
           transition:background .15s ease,transform .15s ease,box-shadow .2s ease}
      .btn:hover:not(:disabled){background:#1A2A6B;transform:translateY(-1px);box-shadow:0 6px 20px rgba(13,27,78,.22)}
      .btn:disabled{background:#94A3B8;cursor:not-allowed}
      .fout{background:#FDECEC;color:#B91C1C;padding:10px 12px;border-radius:6px;
            font-size:12px;margin-bottom:12px;display:none;border:1px solid #F5B3B3}
      .hint{font-size:12px;color:#5F6B7A;text-align:center;margin-top:10px;line-height:1.5}
      .link-btn{background:none;border:none;color:#0D1B4E;cursor:pointer;
                text-decoration:underline;font-size:12px;padding:0;font-family:inherit}
      .banner{background:#E6F7F4;border:1px solid rgba(46,196,182,.35);color:#0D1B4E;
              padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:14px;line-height:1.5}
      .succes-box{text-align:center;padding:10px 0 4px}
      .check{width:56px;height:56px;border-radius:50%;background:rgba(46,196,182,.14);
             color:#2EC4B6;display:inline-flex;align-items:center;justify-content:center;
             font-size:28px;font-weight:800;margin-bottom:14px;border:1px solid rgba(46,196,182,.35)}
      ::selection{background:rgba(46,196,182,.28);color:#0D1B4E}
    </style></head>
    <body>
      <div class="head">
        <div class="label">Licentie</div>
        <h2>Activeer je Boekhoudbaar</h2>
        <p class="sub">Voer het e-mailadres in waarmee je de licentie hebt gekocht. Je krijgt dan een 6-cijferige code.</p>
      </div>

      <!-- Stap 1: e-mail -->
      <div class="stap actief" id="stap1">
        <label class="veld">E-mailadres</label>
        <input type="email" id="email" placeholder="jan@uwbedrijf.nl" autocomplete="email">
        <div class="fout" id="fout1"></div>
        <button class="btn" id="btn1" onclick="stuurCode()">Stuur activeringscode</button>
        <p class="hint">Geen mail ontvangen? Check je spam-map of mail <a href="mailto:hallo@boekhoudbaar.nl" style="color:#0D1B4E">hallo@boekhoudbaar.nl</a>.</p>
      </div>

      <!-- Stap 2: OTP -->
      <div class="stap" id="stap2">
        <div class="banner"><strong>Code verstuurd.</strong> Check je inbox — en eventueel je spam-map.</div>
        <label class="veld">Activeringscode (6 cijfers)</label>
        <input type="text" id="otp" placeholder="000000" maxlength="6"
               inputmode="numeric" autocomplete="one-time-code">
        <div class="fout" id="fout2"></div>
        <button class="btn" id="btn2" onclick="activeer()">Activeer Boekhoudbaar</button>
        <p class="hint"><button class="link-btn" onclick="nieuweCode()">Andere code aanvragen</button></p>
      </div>

      <!-- Stap 3: succes -->
      <div class="stap" id="stap3">
        <div class="succes-box">
          <div class="check">✓</div>
          <h2 id="succes_titel" style="margin-bottom:6px">Geactiveerd</h2>
          <p id="succes_naam" class="sub" style="margin-bottom:14px"></p>
          <p class="sub" style="font-size:13px">
            Je boekhouding wordt nu ingericht.<br>
            <strong style="color:#0D1B4E">Ververs straks de pagina</strong> (Ctrl+R of Cmd+R) om het volledige menu te laden.
          </p>
        </div>
      </div>

    <script>
    var emailVal = '';

    function stuurCode() {
      var email = document.getElementById('email').value.trim();
      if (!email || !email.includes('@')) {
        toonFout('fout1', 'Vul een geldig e-mailadres in.');
        return;
      }
      emailVal = email;
      var btn = document.getElementById('btn1');
      btn.disabled = true;
      btn.textContent = 'Versturen…';
      document.getElementById('fout1').style.display = 'none';

      google.script.run
        .withSuccessHandler(function(res) {
          btn.disabled = false;
          btn.textContent = 'Stuur activeringscode';
          if (res.ok) {
            schakelNaar('stap2');
            setTimeout(function() { document.getElementById('otp').focus(); }, 100);
          } else {
            toonFout('fout1', res.fout || 'Fout bij aanvragen. Probeer opnieuw.');
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'Stuur activeringscode';
          toonFout('fout1', 'Fout: ' + err.message);
        })
        .aanvraagOtp(email);
    }

    function activeer() {
      var otp = document.getElementById('otp').value.trim();
      if (!otp || otp.length < 6) {
        toonFout('fout2', 'Voer de 6-cijferige code in.');
        return;
      }
      var btn = document.getElementById('btn2');
      btn.disabled = true;
      btn.textContent = 'Activeren…';
      document.getElementById('fout2').style.display = 'none';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.ok) {
            schakelNaar('stap3');
            document.getElementById('succes_naam').textContent =
              res.naam ? 'Welkom, ' + res.naam + '.' : '';
            // Setup draaien op achtergrond
            google.script.run.initialiseerNaActivatie();
          } else {
            btn.disabled = false;
            btn.textContent = 'Activeer Boekhoudbaar';
            toonFout('fout2', res.fout || 'Activering mislukt. Probeer opnieuw.');
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'Activeer Boekhoudbaar';
          toonFout('fout2', 'Fout: ' + err.message);
        })
        .activeerMetOtp(emailVal, otp);
    }

    function nieuweCode() {
      schakelNaar('stap1');
      document.getElementById('fout1').style.display = 'none';
    }

    function schakelNaar(id) {
      ['stap1','stap2','stap3'].forEach(function(s) {
        document.getElementById(s).classList.remove('actief');
      });
      document.getElementById(id).classList.add('actief');
    }

    function toonFout(id, tekst) {
      var el = document.getElementById(id);
      el.textContent = tekst;
      el.style.display = 'block';
    }
    </script>
    </body></html>
  `).setWidth(400).setHeight(380);

  SpreadsheetApp.getUi().showModalDialog(html, '📊 Boekhoudbaar — Licentie activeren');
}

// ─────────────────────────────────────────────
//  OTP AANVRAGEN (server-side, aangeroepen door dialoog)
// ─────────────────────────────────────────────
function aanvraagOtp(email) {
  email = String(email || '').trim().toLowerCase();
  const serverUrl = getLicentieServerUrl_();
  if (!serverUrl) return { ok: false, fout: 'Licentieserver niet geconfigureerd.' };

  try {
    const url  = serverUrl + '?actie=aanvraag-otp&email=' + encodeURIComponent(email);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    return safeJsonParse_(resp.getContentText());
  } catch (err) {
    return { ok: false, fout: 'Netwerkfout: ' + err.message };
  }
}

// ─────────────────────────────────────────────
//  ACTIVEREN MET OTP (server-side, aangeroepen door dialoog)
// ─────────────────────────────────────────────
function activeerMetOtp(email, otp) {
  email = String(email || '').trim().toLowerCase();
  otp   = String(otp   || '').trim();

  const serverUrl  = getLicentieServerUrl_();
  const huidigSsId = SpreadsheetApp.getActiveSpreadsheet().getId();

  if (!serverUrl) return { ok: false, fout: 'Licentieserver niet geconfigureerd.' };

  try {
    const url  = serverUrl
      + '?actie=activeer-otp'
      + '&email='  + encodeURIComponent(email)
      + '&otp='    + encodeURIComponent(otp)
      + '&ssId='   + encodeURIComponent(huidigSsId);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const res  = safeJsonParse_(resp.getContentText());

    if (res.ok && res.sleutel) {
      // Sla licentie op in Script Properties
      const props = PropertiesService.getScriptProperties();
      props.setProperty(LICENTIE_PROP_KEY,   res.sleutel);
      props.setProperty(LICENTIE_KLANT_KEY,  res.naam || '');
      props.setProperty(LICENTIE_SS_ID_KEY,  huidigSsId);
      props.setProperty(LICENTIE_VERSIE_KEY, 'Standaard');
      props.setProperty(LICENTIE_CACHE_KEY,  String(Date.now() + LICENTIE_CACHE_UREN * 3600 * 1000));
    }
    return res;
  } catch (err) {
    return { ok: false, fout: 'Netwerkfout: ' + err.message };
  }
}

// ─────────────────────────────────────────────
//  AUTO-SETUP NA ACTIVATIE
// ─────────────────────────────────────────────
function initialiseerNaActivatie() {
  try {
    // setup() heeft eigen idempotency guard — veilig om aan te roepen
    setup();
  } catch (err) {
    Logger.log('initialiseerNaActivatie fout: ' + err.message);
  }
}

// ─────────────────────────────────────────────
//  LICENTIE VALIDEREN (gecacht)
// ─────────────────────────────────────────────
function isLicentieGeldig_() {
  const props   = PropertiesService.getScriptProperties();
  const sleutel = props.getProperty(LICENTIE_PROP_KEY);
  if (!sleutel) return false;

  const cacheGeldigTot = parseInt(props.getProperty(LICENTIE_CACHE_KEY) || '0');
  if (Date.now() < cacheGeldigTot) return true;

  const resultaat = valideerLicentieOpServer_(sleutel);
  if (resultaat.geldig) {
    props.setProperty(LICENTIE_CACHE_KEY,
      String(Date.now() + LICENTIE_CACHE_UREN * 3600 * 1000));
  }
  return resultaat.geldig;
}

/**
 * Toont het globale bericht uit de centrale config (indien aanwezig en
 * nog niet vandaag getoond voor dit exacte bericht). Non-intrusieve
 * toast-notificatie rechtsonder in de spreadsheet. Faalt stil.
 *
 * Owner-workflow: Apps Script editor → Script Properties → zet
 * GLOBAL_BERICHT op de tekst die je naar alle actieve klanten wilt
 * sturen. Binnen 24u zien ze de toast bij het openen van hun sheet.
 * Leeg laten = geen bericht.
 */
function toonGlobaalBerichtIndienNieuw_() {
  const cfg = haalConfigOp_();
  if (!cfg || !cfg.bericht) return;

  const bericht = String(cfg.bericht).trim();
  if (!bericht) return;

  const userProps = PropertiesService.getUserProperties();
  // Fingerprint: bericht + datum van vandaag. Bij wijziging OF nieuwe dag:
  // opnieuw tonen. Zo ziet de klant hetzelfde bericht max 1×/dag.
  const vandaag = new Date().toISOString().slice(0, 10);
  const hash = String(bericht).length + '-' + bericht.substring(0, 40);
  const fingerprint = vandaag + '|' + hash;
  if (userProps.getProperty('globaalBerichtLaatst') === fingerprint) return;

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(bericht, 'Boekhoudbaar', 10);
    userProps.setProperty('globaalBerichtLaatst', fingerprint);
  } catch (_) { /* toast niet beschikbaar in trigger-context, OK */ }
}

/**
 * Haalt centrale product-config op (versie, bericht, flags) en cachet
 * 24 uur in UserProperties. Returnt null wanneer offline of geen server.
 *
 * Gebruik:
 *   const cfg = haalConfigOp_();
 *   if (cfg && cfg.bericht) toonBanner(cfg.bericht);
 *   if (cfg && cfg.versie !== MIJN_VERSIE) toonNieuweVersieBanner();
 */
function haalConfigOp_() {
  const userProps = PropertiesService.getUserProperties();
  const cached    = userProps.getProperty('licentieConfig');
  const cachedTs  = parseInt(userProps.getProperty('licentieConfigTs') || '0');
  const verlopen  = Date.now() - cachedTs > 24 * 3600 * 1000;

  if (cached && !verlopen) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const serverUrl = getLicentieServerUrl_();
  if (!serverUrl) return null;

  try {
    const resp = UrlFetchApp.fetch(serverUrl + '?actie=config', {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Boekhoudbaar/2.1' },
    });
    if (resp.getResponseCode() !== 200) {
      return cached ? JSON.parse(cached) : null;
    }
    const parsed = JSON.parse(resp.getContentText());
    userProps.setProperty('licentieConfig', resp.getContentText());
    userProps.setProperty('licentieConfigTs', String(Date.now()));
    return parsed;
  } catch (err) {
    Logger.log('haalConfigOp_ fout: ' + err.message);
    return cached ? JSON.parse(cached) : null;
  }
}

/**
 * Eénmalig signaal aan de licentieserver dat setup() succesvol is
 * doorlopen. Idempotent: zet een UserProperties-vlag die herhalen
 * voorkomt. Faalt stil — setup() mag hier nooit op breken.
 */
function meldOnboardingAanServer_() {
  const serverUrl = getLicentieServerUrl_();
  if (!serverUrl) return;

  const userProps = PropertiesService.getUserProperties();
  if (userProps.getProperty('onboardingGemeld') === 'true') return;

  const scriptProps = PropertiesService.getScriptProperties();
  const sleutel = scriptProps.getProperty(LICENTIE_PROP_KEY) || '';
  const ssId    = scriptProps.getProperty(LICENTIE_SS_ID_KEY) || '';
  if (!sleutel) return;  // Nog niet geactiveerd — geen melding

  try {
    const url = serverUrl
      + '?actie=onboarded&sleutel=' + encodeURIComponent(sleutel)
      + '&ssId='                    + encodeURIComponent(ssId);
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Boekhoudbaar/2.1' },
    });
    if (resp.getResponseCode() === 200) {
      userProps.setProperty('onboardingGemeld', 'true');
    }
  } catch (err) {
    Logger.log('meldOnboardingAanServer_ fout: ' + err.message);
  }
}

function valideerLicentieOpServer_(sleutel) {
  const serverUrl  = getLicentieServerUrl_();
  const huidigSsId = PropertiesService.getScriptProperties().getProperty(LICENTIE_SS_ID_KEY) || '';

  if (!serverUrl) {
    Logger.log('WAARSCHUWING: Geen licentieserver — licentie geaccepteerd zonder validatie.');
    return { geldig: true, naam: 'Demo', versie: 'Demo' };
  }

  try {
    const url  = serverUrl
      + '?actie=valideer&sleutel=' + encodeURIComponent(sleutel)
      + '&installatie='            + encodeURIComponent(huidigSsId);
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Boekhoudbaar/2.1' },
    });
    if (resp.getResponseCode() === 200) return safeJsonParse_(resp.getContentText());

    // Server niet bereikbaar → vertrouw lokale cache
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(LICENTIE_PROP_KEY) === sleutel) {
      return { geldig: true, naam: props.getProperty(LICENTIE_KLANT_KEY) || '', offline: true };
    }
    return { geldig: false, fout: 'Server niet bereikbaar.' };
  } catch (err) {
    Logger.log('Licentievalidatie fout: ' + err.message);
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(LICENTIE_PROP_KEY) === sleutel) {
      return { geldig: true, naam: props.getProperty(LICENTIE_KLANT_KEY) || '', offline: true };
    }
    return { geldig: false, fout: 'Validatie mislukt: ' + err.message };
  }
}

// ─────────────────────────────────────────────
//  LICENTIE INFO TONEN (menu-item)
// ─────────────────────────────────────────────
function toonLicentieInfo() {
  const props      = PropertiesService.getScriptProperties();
  const sleutel    = props.getProperty(LICENTIE_PROP_KEY)  || 'Niet geactiveerd';
  const klantnaam  = props.getProperty(LICENTIE_KLANT_KEY) || '—';
  const versie     = props.getProperty(LICENTIE_VERSIE_KEY)|| '—';
  const ssId       = props.getProperty(LICENTIE_SS_ID_KEY) || '—';

  SpreadsheetApp.getUi().alert(
    'Licentie-informatie',
    'Licentiehouder: ' + klantnaam + '\n' +
    'Versie: '         + versie    + '\n' +
    'Sleutel: '        + sleutel   + '\n' +
    'Spreadsheet-ID: ' + ssId      + '\n\n' +
    'Vragen? hallo@boekhoudbaar.nl',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  LICENTIE OPNIEUW ACTIVEREN (menu-optie voor support)
// ─────────────────────────────────────────────
function toonLicentieDialoog() {
  toonActivatieDialog_();
}

// ─────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────
function safeJsonParse_(tekst) {
  try { return JSON.parse(tekst); } catch (_) { return { geldig: false, fout: 'Ongeldig serverantwoord.' }; }
}

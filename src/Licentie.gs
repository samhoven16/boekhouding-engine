/**
 * Licentie.gs
 * Licentiebeheer voor het Boekhouding Engine product.
 *
 * Hoe het werkt:
 *  1. Klant koopt het product → ontvangt een unieke licentiesleutel per e-mail
 *  2. Bij eerste gebruik voert de klant de sleutel in via de setup-wizard
 *  3. De sleutel wordt gevalideerd tegen de centrale licentieserver (Google Sheet)
 *  4. Geldige licenties worden lokaal gecached (24 uur geldig)
 *  5. Bij verlopen licentie of upgrade: nieuwe sleutel invoeren
 *
 * Voor de ontwikkelaar (u):
 *  - Centrale licentiesheet: zie LICENTIE_SHEET_URL in Config.gs
 *  - Nieuwe klant toevoegen: voeg rij toe aan de sheet
 *  - Licentie intrekken: zet status op 'Ingetrokken' in de sheet
 */

// ─────────────────────────────────────────────
//  CONSTANTEN
// ─────────────────────────────────────────────
const LICENTIE_PROP_KEY      = 'licentiesleutel';
const LICENTIE_CACHE_KEY     = 'licentieCacheGeldigTot';
const LICENTIE_KLANT_KEY     = 'licentieKlantnaam';
const LICENTIE_VERSIE_KEY    = 'licentieVersie';
const LICENTIE_CACHE_UREN    = 24;

// URL van de centrale licentieserver (Google Sheet als Web App, gepubliceerd door de ontwikkelaar)
// Vervang dit door uw eigen gepubliceerde Web App URL na deployment
const LICENTIE_SERVER_URL    = PropertiesService.getScriptProperties()
  .getProperty('LICENTIE_SERVER_URL') || '';

// ─────────────────────────────────────────────
//  LICENTIE DIALOOG TONEN
// ─────────────────────────────────────────────
function toonLicentieDialoog() {
  const ui = SpreadsheetApp.getUi();
  const huidig = PropertiesService.getScriptProperties().getProperty(LICENTIE_PROP_KEY) || '';

  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:13px}
      h3{color:#1A237E;margin-bottom:6px}
      input{width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;
            font-family:monospace;letter-spacing:1px;margin:6px 0}
      .btn{background:#1A237E;color:white;border:none;padding:10px 20px;border-radius:4px;
           cursor:pointer;font-size:14px;width:100%;margin-top:8px}
      .btn:hover{background:#283593}
      .info{background:#E8EAF6;padding:10px;border-radius:4px;font-size:11px;margin:8px 0}
      .fout{background:#FFEBEE;padding:8px;border-radius:4px;color:#c62828;display:none}
      .ok{background:#E8F5E9;padding:8px;border-radius:4px;color:#2E7D32;display:none}
    </style>
    <h3>Licentie activeren</h3>
    <div class="info">
      U heeft een licentiesleutel ontvangen per e-mail na uw aankoop.<br>
      Voer deze hieronder in om het programma te activeren.
    </div>
    <label><b>Uw licentiesleutel:</b></label>
    <input type="text" id="sleutel" value="${huidig}"
           placeholder="BKHE-XXXX-XXXX-XXXX" autocomplete="off">
    <div class="fout" id="fout"></div>
    <div class="ok" id="ok"></div>
    <button class="btn" id="btn" onclick="activeer()">Licentie activeren</button>
    <p style="text-align:center;font-size:11px;color:#888;margin-top:10px">
      Geen sleutel? <a href="mailto:info@boekhouding-engine.nl" target="_blank">Neem contact op</a>
    </p>
    <script>
    function activeer() {
      var sleutel = document.getElementById('sleutel').value.trim().toUpperCase();
      if (!sleutel) { toonFout('Voer uw licentiesleutel in.'); return; }
      document.getElementById('btn').disabled = true;
      document.getElementById('btn').textContent = 'Valideren...';
      document.getElementById('fout').style.display = 'none';
      document.getElementById('ok').style.display = 'none';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.geldig) {
            toonOk('Licentie geactiveerd voor ' + res.naam + '! Dit venster sluit automatisch...');
            setTimeout(function() { google.script.host.close(); }, 2000);
          } else {
            toonFout(res.fout || 'Ongeldige licentiesleutel. Controleer de sleutel en probeer opnieuw.');
            document.getElementById('btn').disabled = false;
            document.getElementById('btn').textContent = 'Licentie activeren';
          }
        })
        .withFailureHandler(function(err) {
          toonFout('Fout: ' + err.message);
          document.getElementById('btn').disabled = false;
          document.getElementById('btn').textContent = 'Licentie activeren';
        })
        .activeerLicentie(sleutel);
    }
    function toonFout(t) { var e=document.getElementById('fout'); e.textContent=t; e.style.display='block'; }
    function toonOk(t) { var e=document.getElementById('ok'); e.textContent=t; e.style.display='block'; }
    </script>
  `).setWidth(440).setHeight(360);

  ui.showModalDialog(html, 'Licentie activeren');
}

// ─────────────────────────────────────────────
//  LICENTIE ACTIVEREN (server-side)
// ─────────────────────────────────────────────
function activeerLicentie(sleutel) {
  const props = PropertiesService.getScriptProperties();
  sleutel = String(sleutel || '').trim().toUpperCase();

  if (!sleutel) return { geldig: false, fout: 'Geen sleutel opgegeven.' };

  // Valideer via server
  const resultaat = valideerLicentieOpServer_(sleutel);

  if (resultaat.geldig) {
    props.setProperty(LICENTIE_PROP_KEY, sleutel);
    props.setProperty(LICENTIE_KLANT_KEY, resultaat.naam || '');
    props.setProperty(LICENTIE_VERSIE_KEY, resultaat.versie || 'Standaard');
    // Cache instellen (24 uur geldig)
    props.setProperty(LICENTIE_CACHE_KEY,
      String(Date.now() + LICENTIE_CACHE_UREN * 3600 * 1000));
    Logger.log('Licentie geactiveerd: ' + sleutel + ' voor ' + resultaat.naam);
  }

  return resultaat;
}

// ─────────────────────────────────────────────
//  LICENTIE VALIDEREN (gecacht)
// ─────────────────────────────────────────────
/**
 * Controleert of de licentie geldig is.
 * Gebruikt een 24-uurs cache om serverbelasting te beperken.
 * @returns {boolean}
 */
function isLicentieGeldig_() {
  const props = PropertiesService.getScriptProperties();
  const sleutel = props.getProperty(LICENTIE_PROP_KEY);

  // Geen sleutel = nooit geactiveerd
  if (!sleutel) return false;

  // Cache check
  const cacheGeldigTot = parseInt(props.getProperty(LICENTIE_CACHE_KEY) || '0');
  if (Date.now() < cacheGeldigTot) return true;

  // Cache verlopen: opnieuw valideren
  const resultaat = valideerLicentieOpServer_(sleutel);
  if (resultaat.geldig) {
    props.setProperty(LICENTIE_CACHE_KEY,
      String(Date.now() + LICENTIE_CACHE_UREN * 3600 * 1000));
  }
  return resultaat.geldig;
}

/**
 * Valideert de licentiesleutel tegen de centrale server.
 * Als de server niet bereikbaar is, geldt de gecachte status.
 */
function valideerLicentieOpServer_(sleutel) {
  const serverUrl = LICENTIE_SERVER_URL;

  // Als er geen server URL is geconfigureerd, accepteer ALLE sleutels
  // (voor demo/dev gebruik — zet de server URL in voor productie)
  if (!serverUrl) {
    Logger.log('WAARSCHUWING: Geen licentieserver geconfigureerd. Licentie geaccepteerd zonder validatie.');
    return { geldig: true, naam: 'Demo gebruiker', versie: 'Demo' };
  }

  try {
    const url = serverUrl + '?actie=valideer&sleutel=' + encodeURIComponent(sleutel)
      + '&installatie=' + encodeURIComponent(getInstallatieid_());
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'BoekhoudenEngine/2.0' },
    });

    if (resp.getResponseCode() === 200) {
      const data = safeJsonParse_(resp.getContentText());
      return data;
    }

    // Server niet bereikbaar maar sleutel is lokaal opgeslagen → vertrouw het
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(LICENTIE_PROP_KEY) === sleutel) {
      Logger.log('Licentieserver niet bereikbaar — lokale cache gebruikt.');
      return { geldig: true, naam: props.getProperty(LICENTIE_KLANT_KEY) || '', offline: true };
    }

    return { geldig: false, fout: 'Server niet bereikbaar. Controleer uw internetverbinding.' };
  } catch (e) {
    Logger.log('Licentievalidatie fout: ' + e.message);
    // Bij netwerk fout: vertrouw de lokaal opgeslagen sleutel
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(LICENTIE_PROP_KEY) === sleutel) {
      return { geldig: true, naam: props.getProperty(LICENTIE_KLANT_KEY) || '', offline: true };
    }
    return { geldig: false, fout: 'Validatie mislukt: ' + e.message };
  }
}

// ─────────────────────────────────────────────
//  UNIEK INSTALLATIE-ID
// ─────────────────────────────────────────────
/**
 * Genereert een uniek ID voor deze installatie.
 * Wordt gebruikt om te registreren welk exemplaar de licentie gebruikt.
 */
function getInstallatieid_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('installatie_id');
  if (!id) {
    id = 'BKHE-' + Utilities.getUuid().toUpperCase().replace(/-/g, '').substring(0, 12);
    props.setProperty('installatie_id', id);
  }
  return id;
}

// ─────────────────────────────────────────────
//  LICENTIE INFO TONEN
// ─────────────────────────────────────────────
function toonLicentieInfo() {
  const props = PropertiesService.getScriptProperties();
  const sleutel = props.getProperty(LICENTIE_PROP_KEY) || 'Niet geactiveerd';
  const klantnaam = props.getProperty(LICENTIE_KLANT_KEY) || '—';
  const versie = props.getProperty(LICENTIE_VERSIE_KEY) || '—';
  const installatieId = getInstallatieid_();

  SpreadsheetApp.getUi().alert(
    'Licentie-informatie',
    `Licentiehouder: ${klantnaam}\n` +
    `Licentieversie: ${versie}\n` +
    `Sleutel: ${sleutel}\n` +
    `Installatie-ID: ${installatieId}\n\n` +
    `Bewaar uw installatie-ID voor support-vragen.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  LICENTIESERVER (draait op ontwikkelaarsaccount)
// ─────────────────────────────────────────────
/**
 * Dit is de server-kant van het licentiesysteem.
 * Publiceer dit script ALS WEB APP op uw eigen Google-account.
 * Zet de Web App URL als LICENTIE_SERVER_URL in uw Script Properties.
 *
 * De licentiesheet bevat kolommen:
 *   A: Licentiesleutel  B: Klantnaam  C: E-mail  D: Versie  E: Status  F: Vervaldatum
 *   G: Installatie-ID   H: Laatste check
 */
function doGetLicentieServer_(e) {
  // !! ALLEEN gebruiken als dit script de licentieserver IS !!
  // Verwijder de underscore en publiceer als Web App op uw eigen account.

  const actie = e.parameter.actie;
  const sleutel = String(e.parameter.sleutel || '').trim().toUpperCase();
  const installatieId = String(e.parameter.installatie || '');

  if (actie === 'valideer' && sleutel) {
    const LICENTIE_SHEET_ID = PropertiesService.getScriptProperties()
      .getProperty('LICENTIE_SHEET_ID') || '';

    if (!LICENTIE_SHEET_ID) {
      return ContentService.createTextOutput(JSON.stringify({
        geldig: false, fout: 'Licentieserver niet geconfigureerd'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const ss = SpreadsheetApp.openById(LICENTIE_SHEET_ID);
      const sheet = ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).toUpperCase() === sleutel) {
          const status = String(data[i][4]).toLowerCase();
          const vervaldatum = data[i][5] ? new Date(data[i][5]) : null;
          const isVerlopen = vervaldatum && vervaldatum < new Date();

          if (status === 'ingetrokken') {
            return _jsonResp({ geldig: false, fout: 'Licentie is ingetrokken.' });
          }
          if (isVerlopen) {
            return _jsonResp({ geldig: false, fout: 'Licentie is verlopen. Verleng uw abonnement.' });
          }

          // Registreer installatie-ID en laatste check
          if (installatieId && !data[i][6]) {
            sheet.getRange(i + 1, 7).setValue(installatieId);
          }
          sheet.getRange(i + 1, 8).setValue(new Date());

          return _jsonResp({
            geldig: true,
            naam: data[i][1],
            email: data[i][2],
            versie: data[i][3] || 'Standaard',
          });
        }
      }

      return _jsonResp({ geldig: false, fout: 'Licentiesleutel niet gevonden.' });
    } catch (err) {
      return _jsonResp({ geldig: false, fout: 'Serverfout: ' + err.message });
    }
  }

  return _jsonResp({ fout: 'Onbekende actie' });
}

function _jsonResp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

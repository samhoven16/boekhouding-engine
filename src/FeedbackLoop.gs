/**
 * FeedbackLoop.gs
 *
 * Klant-feedback-loop voor zelfverbeterend systeem (bonus uit 7-lens audit).
 *
 * Realiteit: "AI leert van fouten en past validatie aan" is in deze
 * deployment-context (klant-eigen Drive, geen centrale backend) niet
 * realistisch — een AI-pipeline die training-data verzamelt vereist
 * infrastructuur die buiten scope van een €49 product valt.
 *
 * Pragmatisch alternatief: een gestructureerd KLANT-FEEDBACK-mechanisme:
 *  1. Klant kan fout/suggestie melden via menu
 *  2. Melding wordt lokaal opgeslagen + naar owner-server gestuurd
 *  3. Owner ziet aggregaten en bouwt verbeteringen in volgende release
 *
 * Dit IS zelfverbeterend — maar via menselijke iteratie + telemetrie,
 * niet via runtime-AI-learning. Veel realistischer + privacy-vriendelijk.
 *
 * Menu: Boekhouding → Hulp → "💬 Fout melden / suggestie"
 */

'use strict';

const FEEDBACK_PROP_KEY = 'KLANT_FEEDBACK_BUFFER';
const FEEDBACK_MAX_BUFFER = 50;  // max events vóór auto-flush naar owner-server

/**
 * UI: opent dialog waar klant fout/suggestie kan typen.
 */
function openFeedbackDialog() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:24px;color:#1A1A1A;font-size:13px}
      h2{color:#0D1B4E;margin:0 0 6px;font-size:18px;font-weight:800}
      .uitleg{background:#E8F8F6;border-left:4px solid #2EC4B6;padding:10px 14px;border-radius:6px;margin:0 0 16px;font-size:12px;line-height:1.5}
      label{display:block;font-weight:600;font-size:12px;color:#0D1B4E;margin:10px 0 4px}
      select,textarea,input{width:100%;padding:9px 12px;border:1px solid #E5EAF2;border-radius:6px;font-size:13px;background:#fff;font-family:inherit}
      textarea{min-height:120px;resize:vertical}
      .acties{margin-top:14px;display:flex;gap:10px;justify-content:flex-end}
      .btn{background:#2EC4B6;color:#0A4744;border:none;padding:9px 18px;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit}
      .btn-sec{background:#fff;border:1px solid #0D1B4E;color:#0D1B4E}
    </style>
    <h2>💬 Fout melden of suggestie indienen</h2>
    <div class="uitleg">
      Jouw feedback maakt het product beter. Elke melding wordt geanonimiseerd
      gelogd. We verzamelen géén persoonsgegevens of boekhoud-inhoud — alleen
      categorie + omschrijving + welke functie het betreft.
    </div>
    <label>Soort melding</label>
    <select id="soort">
      <option value="FOUT">🐞 Fout / bug</option>
      <option value="SUGGESTIE">💡 Suggestie voor verbetering</option>
      <option value="VRAAG">❓ Vraag / onduidelijkheid</option>
      <option value="COMPLIMENT">🎉 Compliment / positief</option>
    </select>
    <label>Welke functie of menu betreft het?</label>
    <input id="context" placeholder="bv. 'Nieuwe boeking → Factuur' of 'BTW-aangifte Q1'">
    <label>Beschrijving (max 1000 tekens)</label>
    <textarea id="omschr" maxlength="1000" placeholder="Beschrijf wat er gebeurde of wat je suggereert. NIET: klantnamen of bedragen — anonimiseer."></textarea>
    <label><input type="checkbox" id="contact" style="width:auto"> Ja, neem contact op via mijn licentie-email voor follow-up</label>
    <div class="acties">
      <button class="btn btn-sec" onclick="google.script.host.close()">Annuleer</button>
      <button class="btn" onclick="verstuur()">Verstuur</button>
    </div>
    <script>
      function verstuur() {
        const data = {
          soort: document.getElementById('soort').value,
          context: document.getElementById('context').value.trim(),
          omschr: document.getElementById('omschr').value.trim(),
          contactGewenst: document.getElementById('contact').checked,
        };
        if (!data.omschr) { alert('Vul de beschrijving in.'); return; }
        google.script.run
          .withSuccessHandler(function() {
            alert('✓ Bedankt! Jouw feedback is verzonden.');
            google.script.host.close();
          })
          .withFailureHandler(function(e) { alert('Fout: ' + e.message); })
          .verzendKlantFeedback(data);
      }
    </script>
  `).setWidth(540).setHeight(540);
  ui.showModalDialog(html, 'Feedback');
}

/**
 * Server-side: ontvangt feedback, slaat lokaal op, probeert async naar
 * owner-server te sturen.
 *
 * @param {Object} data { soort, context, omschr, contactGewenst }
 */
function verzendKlantFeedback(data) {
  if (!data || !data.omschr) throw new Error('Beschrijving ontbreekt');

  // Sanitize: max-lengtes, geen HTML
  const veilig = {
    soort: ['FOUT', 'SUGGESTIE', 'VRAAG', 'COMPLIMENT'].indexOf(data.soort) !== -1 ? data.soort : 'VRAAG',
    context: String(data.context || '').slice(0, 200),
    omschr: String(data.omschr).slice(0, 1000),
    contactGewenst: data.contactGewenst === true,
    ts: new Date().toISOString(),
    versie: (typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : '?',
    licentieId: _haalLicentieIdAnoniem_(),
  };

  // 1. Lokale opslag — buffer in ScriptProperty (50 events max)
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(FEEDBACK_PROP_KEY);
    let buffer = [];
    if (raw) {
      try { buffer = JSON.parse(raw); } catch (_) { buffer = []; }
    }
    if (!Array.isArray(buffer)) buffer = [];
    buffer.push(veilig);
    if (buffer.length > FEEDBACK_MAX_BUFFER) buffer = buffer.slice(-FEEDBACK_MAX_BUFFER);
    props.setProperty(FEEDBACK_PROP_KEY, JSON.stringify(buffer));
  } catch (e) {
    Logger.log('Feedback buffer write fout: ' + e.message);
  }

  // 2. Audit-log entry (klant heeft eigen audit-log van zijn meldingen)
  try {
    schrijfAuditLog_('Feedback verstuurd',
      veilig.soort + ' — ' + (veilig.context || 'geen context') +
      ' — ' + veilig.omschr.slice(0, 80));
  } catch (_) {}

  // 3. Async naar owner-server (fire-and-forget, mag niet blokkeren)
  try {
    const serverUrl = getLicentieServerUrl_();
    if (serverUrl) {
      UrlFetchApp.fetch(serverUrl + '?actie=feedback', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify(veilig),
      });
    }
  } catch (e) {
    Logger.log('Feedback server-call fout (niet-blokkerend): ' + e.message);
  }

  return true;
}

/**
 * Anonieme licentie-id voor klant-tracking zonder PII.
 * Hash van licentie-key zodat owner aggregaten kan zien zonder de key te
 * kennen. SHA-256 van de key, eerste 12 chars.
 */
function _haalLicentieIdAnoniem_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('LICENTIE_KEY') || '';
    if (!key) return 'anoniem';
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key);
    return hash.map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('').slice(0, 12);
  } catch (_) {
    return 'anoniem';
  }
}

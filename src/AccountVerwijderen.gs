/**
 * AccountVerwijderen.gs
 *
 * AVG Art. 17 zelfservice. Klant kan zonder Sam-contact zijn licentie
 * pseudonymiseren via OTP-flow. Roept twee bestaande licence-server-
 * endpoints aan: 'aanvraag-otp' (verstuurt 6-cijferige code) en 'verwijder'
 * (pseudonymiseert rij in Licenties-sheet).
 *
 * Pad in product:
 *   Menu → Licentie & Updates → Mijn account verwijderen (AVG)
 *
 * Wat NIET wordt verwijderd: factuurnummers, bedragen, journaalposten —
 * die blijven 7 jaar conform AWR art. 52. Klant's eigen spreadsheet blijft
 * in klant's eigen Drive; daar hebben wij geen toegang toe.
 */

function toonAccountVerwijderenDialog() {
  // Pre-fill e-mail uit licentie als beschikbaar — bespaart tikken en
  // verkleint kans op typefout (verkeerd adres = geen rij gevonden).
  const props = PropertiesService.getScriptProperties();
  const klantnaam = props.getProperty(LICENTIE_KLANT_KEY) || '';
  const ingevuldEmail = (Session.getActiveUser().getEmail() || '').toLowerCase();

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:22px 24px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#B91C1C;margin-bottom:4px}
      h3{color:#0D1B4E;margin-bottom:8px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      .warn{background:#FDECEC;border:1px solid #F5B3B3;color:#5A1010;padding:12px 14px;border-radius:8px;margin:12px 0;font-size:12px;line-height:1.55}
      .warn b{color:#B91C1C}
      .info{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;
            padding:12px 14px;border-radius:0 6px 6px 0;margin:12px 0;font-size:12px;color:#1A1A1A;line-height:1.55}
      .form-row{margin:10px 0}
      .form-row label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#1A1A1A}
      .form-row input{width:100%;padding:10px 12px;border:1px solid #E5EAF2;border-radius:8px;
                       font-size:13px;font-family:inherit;background:#fff;
                       transition:border-color .15s ease,box-shadow .15s ease}
      .form-row input:focus{outline:none;border-color:#2EC4B6;box-shadow:0 0 0 3px rgba(46,196,182,.18)}
      .btn{background:#B91C1C;color:white;border:none;padding:11px 18px;border-radius:8px;
           cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;
           transition:background .15s ease}
      .btn:hover:not(:disabled){background:#7F1D1D}
      .btn:disabled{background:#94A3B8;cursor:not-allowed}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:10px 16px;
               border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
               font-family:inherit;transition:background 0.15s}
      .btn-sec:hover{background:#EEF2F8}
      .row-btns{display:flex;gap:8px;margin-top:14px}
      .status{margin-top:10px;padding:10px 12px;border-radius:8px;display:none;font-size:12px;border:1px solid transparent;line-height:1.5}
      .step{display:none}
      .step.active{display:block}
      .hint{font-size:11px;color:#5A6478;margin-top:6px}
      hr{border:none;border-top:1px solid #E5EAF2;margin:14px 0}
      code{background:#F7F9FC;padding:2px 6px;border-radius:4px;font-size:11px;color:#0D1B4E;font-family:Menlo,Consolas,monospace}
    </style>

    <div class="label">AVG Art. 17</div>
    <h3>Mijn account verwijderen</h3>
    <p>Je vraagt het recht op vergetelheid uit. Dit is een onomkeerbare actie. Lees onderstaande zorgvuldig.</p>

    <div class="warn">
      <b>Wat wordt verwijderd:</b><br>
      • Je naam, e-mail en spreadsheet-koppeling op onze licentieserver<br>
      • Je licentie wordt ingetrokken — na 14 dagen grace verlies je toegang
    </div>

    <div class="info">
      <b>Wat blijft staan (wettelijk verplicht):</b><br>
      • Factuurnummers en bedragen — 7 jaar conform AWR art. 52<br>
      • Je eigen Google-spreadsheet — die staat in <i>jouw</i> Drive, daar hebben wij geen toegang toe. Verwijder die zelf.
    </div>

    <hr>

    <div class="step active" id="stap1">
      <div class="form-row">
        <label>E-mailadres waarmee je hebt gekocht</label>
        <input type="email" id="email" value="${ingevuldEmail}" placeholder="jouw@email.nl">
        <div class="hint">We sturen hier een 6-cijferige bevestigingscode naar. ${klantnaam ? 'Licentiehouder: ' + klantnaam : ''}</div>
      </div>
      <div class="row-btns">
        <button class="btn" id="btnOtp" onclick="vraagCode()">Verstuur bevestigingscode</button>
        <button class="btn-sec" onclick="google.script.host.close()">Annuleren</button>
      </div>
      <div class="status" id="status1"></div>
    </div>

    <div class="step" id="stap2">
      <div class="info">Code verstuurd naar <span id="bevestigEmail"></span>. Geldig 15 minuten.</div>
      <div class="form-row">
        <label>6-cijferige code uit je e-mail</label>
        <input type="text" id="otp" maxlength="6" placeholder="123456" autocomplete="off" inputmode="numeric">
      </div>
      <div class="row-btns">
        <button class="btn" id="btnDelete" onclick="bevestigVerwijdering()">Definitief verwijderen</button>
        <button class="btn-sec" onclick="terugNaarStap1()">Terug</button>
      </div>
      <div class="status" id="status2"></div>
    </div>

    <div class="step" id="stap3">
      <div class="info">
        <b>✓ Verwijdering verwerkt</b><br>
        <span id="resultaatBericht"></span>
      </div>
      <div class="row-btns">
        <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>
      </div>
    </div>

    <script>
      function toon(id, kleur, tekst) {
        var el = document.getElementById(id);
        el.style.display = 'block';
        if (kleur === 'green')    { el.style.background = '#E6F7F4'; el.style.color = '#0D1B4E'; el.style.borderColor = 'rgba(46,196,182,.35)'; }
        else if (kleur === 'red') { el.style.background = '#FDECEC'; el.style.color = '#B91C1C'; el.style.borderColor = '#F5B3B3'; }
        else                       { el.style.background = '#F7F9FC'; el.style.color = '#5F6B7A'; el.style.borderColor = '#E5EAF2'; }
        el.textContent = tekst;
      }
      function setStap(n) {
        ['stap1','stap2','stap3'].forEach(function(id, i){
          document.getElementById(id).classList.toggle('active', i === n - 1);
        });
      }
      function terugNaarStap1() {
        setStap(1);
        document.getElementById('btnOtp').disabled = false;
        document.getElementById('btnOtp').textContent = 'Verstuur bevestigingscode';
        document.getElementById('status1').style.display = 'none';
      }
      function vraagCode() {
        var email = document.getElementById('email').value.trim().toLowerCase();
        if (!email || email.indexOf('@') < 0) {
          toon('status1', 'red', 'Vul een geldig e-mailadres in.');
          return;
        }
        document.getElementById('btnOtp').disabled = true;
        document.getElementById('btnOtp').textContent = 'Bezig...';
        toon('status1', 'info', 'Code wordt verstuurd...');
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.ok) {
              document.getElementById('bevestigEmail').textContent = email;
              setStap(2);
              setTimeout(function(){ document.getElementById('otp').focus(); }, 100);
            } else {
              document.getElementById('btnOtp').disabled = false;
              document.getElementById('btnOtp').textContent = 'Verstuur bevestigingscode';
              toon('status1', 'red', (res && res.fout) || 'Er ging iets mis. Probeer opnieuw.');
            }
          })
          .withFailureHandler(function(err) {
            document.getElementById('btnOtp').disabled = false;
            document.getElementById('btnOtp').textContent = 'Verstuur bevestigingscode';
            toon('status1', 'red', (err && err.message) || 'Netwerkfout.');
          })
          .aanvraagVerwijderOtp_(email);
      }
      function bevestigVerwijdering() {
        var email = document.getElementById('email').value.trim().toLowerCase();
        var otp = document.getElementById('otp').value.trim();
        if (otp.length !== 6) {
          toon('status2', 'red', 'Code is 6 cijfers.');
          return;
        }
        document.getElementById('btnDelete').disabled = true;
        document.getElementById('btnDelete').textContent = 'Bezig met verwijderen...';
        toon('status2', 'info', 'Verwerken...');
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.ok) {
              document.getElementById('resultaatBericht').textContent = res.bericht || 'Je gegevens zijn gepseudonymiseerd.';
              setStap(3);
            } else {
              document.getElementById('btnDelete').disabled = false;
              document.getElementById('btnDelete').textContent = 'Definitief verwijderen';
              toon('status2', 'red', (res && res.fout) || 'Verwijdering mislukt.');
            }
          })
          .withFailureHandler(function(err) {
            document.getElementById('btnDelete').disabled = false;
            document.getElementById('btnDelete').textContent = 'Definitief verwijderen';
            toon('status2', 'red', (err && err.message) || 'Netwerkfout.');
          })
          .voerAccountVerwijdering_(email, otp);
      }
    </script>
  `).setWidth(540).setHeight(620).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  SpreadsheetApp.getUi().showModalDialog(html, 'Mijn account verwijderen — AVG Art. 17');
}

/**
 * Vraag OTP aan bij licentieserver voor verwijdering. Hergebruikt het
 * bestaande 'aanvraag-otp'-endpoint (zelfde endpoint als bij re-activatie).
 *
 * @param {string} email
 * @return {{ok: boolean, fout?: string}}
 */
function aanvraagVerwijderOtp_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) {
    return { ok: false, fout: 'Ongeldig e-mailadres.' };
  }
  const serverUrl = getLicentieServerUrl_();
  if (!serverUrl) {
    return { ok: false, fout: 'Licentieserver niet geconfigureerd. Mail support@boekhoudbaar.nl.' };
  }
  try {
    const url = serverUrl + '?actie=aanvraag-otp&email=' + encodeURIComponent(email);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const res = parseServerJson_(resp.getContentText());
    try { safeAuditLog_('AVG Art. 17 — code aangevraagd', email.slice(0, 3) + '***'); } catch (_) {}
    return res;
  } catch (err) {
    return { ok: false, fout: 'Netwerkfout: ' + err.message };
  }
}

/**
 * Voer de verwijdering uit via 'verwijder'-endpoint. Bij ok: zet ook lokale
 * licentie-cache leeg zodat de klant na herstart niet stil door blijft draaien
 * met een ingetrokken licentie. Fiscale data in eigen spreadsheet blijft.
 *
 * @param {string} email
 * @param {string} otp
 * @return {{ok: boolean, bericht?: string, fout?: string}}
 */
function voerAccountVerwijdering_(email, otp) {
  email = String(email || '').trim().toLowerCase();
  otp = String(otp || '').trim();
  if (!email || !otp) return { ok: false, fout: 'E-mail en code zijn verplicht.' };
  if (otp.length !== 6) return { ok: false, fout: 'Code is 6 cijfers.' };

  const serverUrl = getLicentieServerUrl_();
  if (!serverUrl) {
    return { ok: false, fout: 'Licentieserver niet geconfigureerd. Mail support@boekhoudbaar.nl.' };
  }
  try {
    const url = serverUrl
      + '?actie=verwijder'
      + '&email=' + encodeURIComponent(email)
      + '&otp=' + encodeURIComponent(otp);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const res = parseServerJson_(resp.getContentText());

    if (res && res.ok) {
      // Lokale licentie-cache invalideren. Klant blijft 14 dagen offline-grace
      // werken, daarna stopt licentiecheck. Bewust: factureren tijdens grace
      // mag — het is een verzoek tot verwijdering, geen contractbreuk.
      try {
        const props = PropertiesService.getScriptProperties();
        props.deleteProperty(LICENTIE_CACHE_KEY);
      } catch (_) {}
      try { safeAuditLog_('AVG Art. 17 — verwijdering bevestigd', email.slice(0, 3) + '***'); } catch (_) {}
    }
    return res;
  } catch (err) {
    return { ok: false, fout: 'Netwerkfout: ' + err.message };
  }
}

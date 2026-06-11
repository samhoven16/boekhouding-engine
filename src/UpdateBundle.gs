/**
 * UpdateBundle.gs
 *
 * Tier 2.1: assisted manual update. Klant kan via menu de laatste code-bundle
 * downloaden, lokaal hash-verifiëren tegen wat de server claimt te leveren,
 * en de inhoud per bestand kopiëren om in Apps Script editor te plakken.
 *
 * Bewust geen auto-write naar `script.projects.updateContent`. Die capability
 * vereist:
 *   - `script.projects` OAuth-scope (gevoelig, klant moet expliciet authorizen)
 *   - Rollback-pad bij gefaalde write (corrupte JSON breekt klant z'n project)
 *   - Concurrent-execution lock (mid-trigger overwrite = undefined behavior)
 *   - Voldoende geverifieerde tests
 * Die komen in tier 2.2 — pas wanneer de signing-infrastructuur is gehard.
 *
 * Pad in product:
 *   Menu → Licentie & Updates → 📦 Download laatste versie
 */

/**
 * Menu-actie: opent dialog die klant door 'download + verify + paste'-flow leidt.
 */
function toonUpdateBundleDialog() {
  const props = PropertiesService.getScriptProperties();
  const sleutel = props.getProperty(LICENTIE_PROP_KEY) || '';
  const klantnaam = props.getProperty(LICENTIE_KLANT_KEY) || '';

  if (!sleutel) {
    SpreadsheetApp.getUi().alert('Licentie nodig',
      'Activeer eerst je licentie: Boekhoudbaar → Licentie & Updates → Licentie activeren.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const huidigeVersie = (typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : '?';

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:22px 24px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:4px}
      h3{color:#0D1B4E;margin-bottom:8px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      .versie{background:#fff;border:1px solid #E5EAF2;padding:10px 14px;border-radius:8px;margin:10px 0;font-size:13px}
      .versie b{color:#0D1B4E}
      .info{background:#E6F7F4;border-left:3px solid #2EC4B6;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px;color:#0D1B4E;line-height:1.55}
      .warn{background:#FFF8E1;border-left:3px solid #FFC107;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px;color:#5A3F00;line-height:1.55}
      .err{background:#FDECEC;border-left:3px solid #B91C1C;padding:10px 12px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12px;color:#5A1010;line-height:1.55}
      .form-row{margin:10px 0}
      .form-row label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#1A1A1A}
      .form-row input{width:100%;padding:10px 12px;border:1px solid #E5EAF2;border-radius:8px;
                       font-size:13px;font-family:inherit;background:#fff}
      .btn{background:#0D1B4E;color:white;border:none;padding:11px 18px;border-radius:8px;
           cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
      .btn:hover:not(:disabled){background:#1A2A6B}
      .btn:disabled{background:#94A3B8;cursor:not-allowed}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:10px 16px;
               border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
               font-family:inherit}
      .btn-mini{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:5px 10px;
                border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
      .btn-mini:hover{background:#EEF2F8}
      .row-btns{display:flex;gap:8px;margin-top:14px}
      .status{margin-top:10px;padding:10px 12px;border-radius:8px;display:none;font-size:12px;border:1px solid transparent;line-height:1.5}
      .step{display:none}
      .step.active{display:block}
      hr{border:none;border-top:1px solid #E5EAF2;margin:14px 0}
      .file-rij{background:#fff;border:1px solid #E5EAF2;border-radius:8px;padding:10px 12px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;font-size:12px}
      .file-rij b{color:#0D1B4E;font-family:Menlo,Consolas,monospace}
      .file-rij .meta{color:#5A6478;font-size:11px;margin-top:2px}
      .hash{font-family:Menlo,Consolas,monospace;font-size:10px;color:#5A6478;word-break:break-all;background:#F7F9FC;padding:6px 8px;border-radius:6px;margin-top:6px}
    </style>

    <div class="label">Updates</div>
    <h3>Download laatste versie</h3>
    <p>Je versie: <b>${huidigeVersie}</b>${klantnaam ? ' &nbsp;·&nbsp; Licentiehouder: ' + klantnaam : ''}</p>

    <div class="step active" id="stap1">
      <div class="info">
        Sam publiceert per release een code-bundle. Deze stap haalt 'm op, verifieert lokaal dat de inhoud niet onderweg is gewijzigd (SHA-256 hash-check), en toont per bestand een kopieer-knop. Plakken doe je daarna handmatig in de Apps Script editor.
      </div>
      <div class="form-row">
        <label>Welke versie wil je ophalen?</label>
        <input type="text" id="versie" placeholder="bijv. 2.8.0" autocomplete="off">
      </div>
      <div class="row-btns">
        <button class="btn" id="btnHaal" onclick="haalBundle()">Haal bundle op</button>
        <button class="btn-sec" onclick="google.script.host.close()">Annuleren</button>
      </div>
      <div class="status" id="status1"></div>
    </div>

    <div class="step" id="stap2">
      <div class="info">
        <b>✓ Bundle geverifieerd</b><br>
        <span id="bundleSamenvatting"></span>
      </div>
      <div class="warn">
        <b>Plakken</b>: open Apps Script editor (Extensies → Apps Script). Voor elk bestand hieronder: open de file in de editor, selecteer alles (Cmd/Ctrl+A), plak de gekopieerde inhoud over. Sla op (Cmd/Ctrl+S). Klaar.
      </div>
      <div id="bestandenLijst"></div>
      <div class="hash" id="hashWeergave"></div>
      <div class="row-btns">
        <button class="btn-sec" onclick="terugNaarStap1()">Andere versie ophalen</button>
        <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>
      </div>
    </div>

    <script>
      var huidigeBundle = null;

      function toon(id, kleur, tekst) {
        var el = document.getElementById(id);
        el.style.display = 'block';
        if (kleur === 'green')    { el.style.background = '#E6F7F4'; el.style.color = '#0D1B4E'; el.style.borderColor = 'rgba(46,196,182,.35)'; }
        else if (kleur === 'red') { el.style.background = '#FDECEC'; el.style.color = '#B91C1C'; el.style.borderColor = '#F5B3B3'; }
        else                       { el.style.background = '#F7F9FC'; el.style.color = '#5F6B7A'; el.style.borderColor = '#E5EAF2'; }
        el.textContent = tekst;
      }
      function setStap(n) {
        ['stap1','stap2'].forEach(function(id, i){
          document.getElementById(id).classList.toggle('active', i === n - 1);
        });
      }
      function terugNaarStap1() {
        setStap(1);
        document.getElementById('btnHaal').disabled = false;
        document.getElementById('btnHaal').textContent = 'Haal bundle op';
        document.getElementById('status1').style.display = 'none';
      }
      function haalBundle() {
        var versie = document.getElementById('versie').value.trim();
        if (!/^[\\d]+\\.[\\d]+\\.[\\d]+$/.test(versie)) {
          toon('status1', 'red', 'Versie-formaat: X.Y.Z (bijv. 2.8.0)');
          return;
        }
        document.getElementById('btnHaal').disabled = true;
        document.getElementById('btnHaal').textContent = 'Bezig...';
        toon('status1', 'info', 'Bundle ophalen en verifiëren...');
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.ok) {
              huidigeBundle = res;
              toonBundle(res);
              setStap(2);
            } else {
              document.getElementById('btnHaal').disabled = false;
              document.getElementById('btnHaal').textContent = 'Haal bundle op';
              toon('status1', 'red', (res && res.fout) || 'Bundle ophalen mislukt.');
            }
          })
          .withFailureHandler(function(err) {
            document.getElementById('btnHaal').disabled = false;
            document.getElementById('btnHaal').textContent = 'Haal bundle op';
            toon('status1', 'red', (err && err.message) || 'Netwerkfout.');
          })
          .haalUpdateBundleOp(versie);
      }
      function toonBundle(res) {
        document.getElementById('bundleSamenvatting').textContent =
          'Versie ' + res.versie + ' — ' + res.files.length + ' bestand(en). Hash matched.';
        document.getElementById('hashWeergave').textContent = 'SHA-256: ' + res.hash;
        var lijst = document.getElementById('bestandenLijst');
        lijst.innerHTML = '';
        res.files.forEach(function(f, idx) {
          var div = document.createElement('div');
          div.className = 'file-rij';
          var info = document.createElement('div');
          var naam = document.createElement('b');
          naam.textContent = f.naam;
          var meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = (f.source || '').length + ' chars · type=' + (f.type || 'server_js');
          info.appendChild(naam);
          info.appendChild(meta);
          var btn = document.createElement('button');
          btn.className = 'btn-mini';
          btn.textContent = '📋 Kopieer';
          btn.onclick = (function(content, btnEl){ return function(){
            try {
              navigator.clipboard.writeText(content).then(function() {
                btnEl.textContent = '✓ Gekopieerd';
                setTimeout(function() { btnEl.textContent = '📋 Kopieer'; }, 2000);
              });
            } catch (e) {
              alert('Kopiëren mislukte — gebruik de fallback-textarea hieronder.');
            }
          }; })(f.source || '', btn);
          div.appendChild(info);
          div.appendChild(btn);
          lijst.appendChild(div);
        });
      }
    </script>
  `).setWidth(620).setHeight(720).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  SpreadsheetApp.getUi().showModalDialog(html, '📦 Download laatste versie');
}

/**
 * Server-handler aangeroepen vanuit dialog. Haalt bundle bij licence-server,
 * verifieert lokaal dat SHA-256-hash van files-array matched met wat server
 * claimt (tamper-detection). Audit-logt elke fetch.
 *
 * @param {string} versie  Versie-string X.Y.Z
 * @return {{ok: boolean, versie?: string, files?: Array, hash?: string, fout?: string}}
 */
function haalUpdateBundleOp(versie) {
  versie = String(versie || '').trim();
  if (!/^[\d]+\.[\d]+\.[\d]+$/.test(versie)) {
    return { ok: false, fout: 'Ongeldig versie-formaat (verwacht X.Y.Z).' };
  }
  const serverUrl = (typeof getLicentieServerUrl_ === 'function') ? getLicentieServerUrl_() : '';
  if (!serverUrl) {
    return { ok: false, fout: 'Licentieserver niet geconfigureerd.' };
  }
  const props = PropertiesService.getScriptProperties();
  const sleutel = props.getProperty(LICENTIE_PROP_KEY) || '';
  if (!sleutel) {
    return { ok: false, fout: 'Geen licentie geactiveerd. Activeer eerst via menu.' };
  }
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();

  try {
    const url = serverUrl +
      '?actie=update-bundle' +
      '&sleutel=' + encodeURIComponent(sleutel) +
      '&email='   + encodeURIComponent(email) +
      '&versie='  + encodeURIComponent(versie);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const res = parseServerJson_(resp.getContentText());
    if (!res || !res.ok) {
      try { safeAuditLog_('update-bundle fetch fout',
        'versie=' + versie + ' fout=' + ((res && res.fout) || 'onbekend')); } catch (_) {}
      return res || { ok: false, fout: 'Geen geldig server-antwoord.' };
    }

    // Lokale hash-verificatie (tamper-detection in transit, naast TLS).
    const lokaal = _berekenBundleHash_(res.files);
    if (lokaal !== res.hash) {
      try { safeAuditLog_('update-bundle hash-mismatch',
        'versie=' + versie + ' server=' + (res.hash || '') + ' lokaal=' + lokaal); } catch (_) {}
      return { ok: false, fout: 'Hash-verificatie mislukt — bundle is mogelijk gewijzigd onderweg. NIET plakken.' };
    }

    try { safeAuditLog_('update-bundle geverifieerd',
      'versie=' + versie + ' bestanden=' + res.files.length); } catch (_) {}
    return res;
  } catch (err) {
    return { ok: false, fout: 'Netwerkfout: ' + err.message };
  }
}

/**
 * SHA-256 hash van geserialiseerde files-array (zelfde canonicalisering als
 * server). Output: hex-string van 64 chars. Bij mismatch met server-hash
 * = tampering of corruptie.
 */
function _berekenBundleHash_(files) {
  try {
    const canonical = JSON.stringify(files || []);
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical)
      .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
      .join('');
  } catch (_) {
    return 'hash-fail';
  }
}

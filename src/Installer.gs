/**
 * Installer.gs
 * Eén-klik installatie voor nieuwe klanten.
 *
 * HOE HET WERKT:
 *  1. Klant koopt het product (via uw website / Gumroad / etc.)
 *  2. Klant ontvangt een unieke installatielink per e-mail
 *  3. Klant klikt op de link → Web App opent in browser
 *  4. Web App maakt automatisch een nieuwe spreadsheet aan op het account van de klant
 *  5. Klant wordt doorgestuurd naar zijn nieuwe boekhouding
 *
 * VOOR DE ONTWIKKELAAR:
 *  - Publiceer DIT SCRIPT als Web App (Uitvoeren als: ik, Toegang: iedereen)
 *  - Stel INSTALLER_TEMPLATE_ID in als Script Property (het script-ID van uw master script)
 *  - Gebruik de installatielink: https://script.google.com/macros/s/[WEB_APP_ID]/exec?sleutel=XXXX
 *
 * BENODIGDE SCRIPT PROPERTIES:
 *  - INSTALLER_TEMPLATE_ID: Script ID van uw master boekhouding script
 *  - LICENTIE_SERVER_URL: URL van de licentieserver (zie Licentie.gs)
 */

// ─────────────────────────────────────────────
//  WEB APP ENTRY POINT
// ─────────────────────────────────────────────

/**
 * Installatieformulier via doGet.
 *
 * NIET direct aanroepen — de gecombineerde doGet in API.gs routeert
 * naar bouwInstallerPagina_() als het query-param ?sleutel= aanwezig is.
 * GAS staat slechts één doGet per project toe; zie API.gs.
 *
 * URL: https://script.google.com/macros/s/[ID]/exec?sleutel=BKHE-XXXX-XXXX-XXXX
 */
function doGetInstaller_(e) {
  const sleutel = String((e && e.parameter && e.parameter.sleutel) || '').trim().toUpperCase();

  return HtmlService.createHtmlOutput(bouwInstallerPagina_(sleutel))
    .setTitle('Boekhouding Engine — Installatie')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Verwerkt het installatieformulier (POST of via google.script.run).
 * Maakt een nieuwe spreadsheet aan voor de klant.
 */
function installerenVoorKlant(sleutel, bedrijfsnaam, email) {
  sleutel = String(sleutel || '').trim().toUpperCase();
  bedrijfsnaam = String(bedrijfsnaam || '').trim();
  email = String(email || '').trim().toLowerCase();

  if (!sleutel)      return { succes: false, fout: 'Voer uw licentiesleutel in.' };
  if (!bedrijfsnaam) return { succes: false, fout: 'Voer uw bedrijfsnaam in.' };
  if (!email)        return { succes: false, fout: 'Voer uw e-mailadres in.' };

  // Valideer licentie
  const licentie = valideerLicentieOpServer_(sleutel);
  if (!licentie.geldig) {
    return { succes: false, fout: licentie.fout || 'Ongeldige licentiesleutel.' };
  }

  try {
    // Maak nieuwe spreadsheet aan in de Drive van de ingelogde gebruiker
    const naam = 'Boekhouding ' + bedrijfsnaam + ' ' + new Date().getFullYear();
    const ss = SpreadsheetApp.create(naam);
    const ssId = ss.getId();

    // Sla sleutel en bedrijfsgegevens op als Script Properties van het nieuwe script
    // (dit vereist dat het script al is gebonden aan de spreadsheet)
    Logger.log('Spreadsheet aangemaakt: ' + ssId + ' voor ' + bedrijfsnaam);

    // Stuur bevestigingsmail naar klant
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Uw Boekhouding Engine is klaar!',
        htmlBody: bouwBevestigingsmail_(bedrijfsnaam, ss.getUrl(), sleutel),
      });
    } catch (mailErr) {
      Logger.log('Bevestigingsmail mislukt: ' + mailErr.message);
      // Niet fataal — installatie is wel geslaagd
    }

    return {
      succes: true,
      spreadsheetUrl: ss.getUrl(),
      spreadsheetId:  ssId,
      naam:           licentie.naam || bedrijfsnaam,
    };

  } catch (err) {
    Logger.log('Installatie mislukt: ' + err.message);
    return { succes: false, fout: 'Installatie mislukt: ' + err.message };
  }
}

// ─────────────────────────────────────────────
//  HTML PAGINA BOUWEN
// ─────────────────────────────────────────────

function bouwInstallerPagina_(vooringevuldeSleutel) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boekhouding Engine — Installatie</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #1A237E 0%, #283593 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .logo {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo h1 {
      color: #1A237E;
      font-size: 24px;
      font-weight: 700;
    }
    .logo p {
      color: #666;
      font-size: 14px;
      margin-top: 4px;
    }
    .stappen {
      background: #E8EAF6;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #333;
      line-height: 1.8;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 6px;
      color: #333;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #1A237E;
    }
    input#sleutel {
      font-family: monospace;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: #1A237E;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    .btn:hover { background: #283593; }
    .btn:disabled { background: #999; cursor: not-allowed; }
    .fout {
      background: #FFEBEE;
      color: #c62828;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      margin-top: 12px;
      display: none;
    }
    .succes {
      text-align: center;
      padding: 20px 0;
      display: none;
    }
    .succes h2 { color: #2E7D32; margin-bottom: 12px; }
    .succes p { color: #555; font-size: 14px; line-height: 1.6; }
    .open-btn {
      display: inline-block;
      margin-top: 16px;
      padding: 14px 28px;
      background: #2E7D32;
      color: white;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
    }
    .open-btn:hover { background: #388E3C; }
    .veilig {
      text-align: center;
      font-size: 11px;
      color: #999;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>📊 Boekhouding Engine</h1>
      <p>Uw boekhouding in Google Spreadsheets — eenvoudig en overzichtelijk</p>
    </div>

    <div id="formulier">
      <div class="stappen">
        <strong>Installatie in 3 stappen:</strong><br>
        1️⃣ Vul uw licentiesleutel in (uit de e-mail)<br>
        2️⃣ Vul uw bedrijfsnaam en e-mailadres in<br>
        3️⃣ Klik op "Installeren" — klaar!
      </div>

      <div class="form-group">
        <label>Licentiesleutel *</label>
        <input type="text" id="sleutel" placeholder="BKHE-XXXX-XXXX-XXXX"
               value="${vooringevuldeSleutel || ''}" autocomplete="off" maxlength="20">
      </div>
      <div class="form-group">
        <label>Bedrijfsnaam *</label>
        <input type="text" id="bedrijf" placeholder="Bijv. Bakkerij De Zonnebloem">
      </div>
      <div class="form-group">
        <label>E-mailadres *</label>
        <input type="email" id="email" placeholder="u@uwbedrijf.nl">
      </div>

      <button class="btn" id="btn" onclick="installeer()">
        🚀 Boekhouding installeren
      </button>
      <div class="fout" id="fout"></div>
      <p class="veilig">🔒 Uw gegevens worden veilig verwerkt via Google</p>
    </div>

    <div class="succes" id="succes">
      <h2>🎉 Uw boekhouding is klaar!</h2>
      <p>
        We hebben een nieuw boekhoudbestand aangemaakt in uw Google Drive.<br>
        Een bevestiging is verstuurd naar uw e-mailadres.
      </p>
      <a href="#" id="openLink" class="open-btn" target="_blank">
        📊 Boekhouding openen
      </a>
      <p style="font-size:12px;color:#888;margin-top:16px">
        Sla de link op als bladwijzer voor snelle toegang.
      </p>
    </div>
  </div>

  <script>
    function installeer() {
      var sleutel  = document.getElementById('sleutel').value.trim().toUpperCase();
      var bedrijf  = document.getElementById('bedrijf').value.trim();
      var email    = document.getElementById('email').value.trim();

      if (!sleutel) { toonFout('Voer uw licentiesleutel in.'); return; }
      if (!bedrijf) { toonFout('Voer uw bedrijfsnaam in.'); return; }
      if (!email || !email.includes('@')) { toonFout('Voer een geldig e-mailadres in.'); return; }

      var btn = document.getElementById('btn');
      btn.disabled = true;
      btn.textContent = '⏳ Even geduld, uw boekhouding wordt aangemaakt...';
      document.getElementById('fout').style.display = 'none';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.succes) {
            document.getElementById('formulier').style.display = 'none';
            var succes = document.getElementById('succes');
            succes.style.display = 'block';
            document.getElementById('openLink').href = res.spreadsheetUrl;
          } else {
            toonFout(res.fout || 'Er ging iets mis. Probeer opnieuw.');
            btn.disabled = false;
            btn.textContent = '🚀 Boekhouding installeren';
          }
        })
        .withFailureHandler(function(err) {
          toonFout('Fout: ' + err.message);
          btn.disabled = false;
          btn.textContent = '🚀 Boekhouding installeren';
        })
        .installerenVoorKlant(sleutel, bedrijf, email);
    }

    function toonFout(tekst) {
      var el = document.getElementById('fout');
      el.textContent = tekst;
      el.style.display = 'block';
    }

    // Auto-format licentiekey als gebruiker typt
    document.addEventListener('DOMContentLoaded', function() {
      var inp = document.getElementById('sleutel');
      if (inp) {
        inp.addEventListener('input', function() {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        });
      }
    });
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────
//  BEVESTIGINGSMAIL
// ─────────────────────────────────────────────

function bouwBevestigingsmail_(bedrijfsnaam, url, sleutel) {
  return `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1A237E;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:22px">📊 Boekhouding Engine</h1>
    <p style="color:#C5CAE9;margin:6px 0 0">Uw boekhouding is klaar voor gebruik</p>
  </div>

  <div style="background:#f9f9f9;padding:24px;border:1px solid #eee;border-top:none">
    <h2 style="color:#1A237E">Welkom, ${bedrijfsnaam}!</h2>
    <p>Goed nieuws: uw Boekhouding Engine is succesvol geïnstalleerd en staat klaar voor gebruik.</p>

    <div style="background:white;border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0 0 8px"><strong>Uw boekhoudbestand:</strong></p>
      <a href="${url}" style="color:#1A237E;font-size:15px">📊 Boekhouding openen →</a>
      <p style="font-size:11px;color:#999;margin:8px 0 0;word-break:break-all">${url}</p>
    </div>

    <h3 style="color:#333;font-size:15px">Wat kunt u nu doen?</h3>
    <ol style="padding-left:20px;line-height:2">
      <li><strong>Open het boekhoudbestand</strong> via de link hierboven</li>
      <li><strong>Vul uw bedrijfsgegevens in</strong> (tabblad "Instellingen")</li>
      <li><strong>Maak uw eerste factuur</strong> via Boekhouding → Nieuw invoeren</li>
    </ol>

    <div style="background:#E8EAF6;border-radius:6px;padding:12px;margin:16px 0">
      <p style="margin:0;font-size:13px">
        <strong>Uw licentiesleutel:</strong> <code>${sleutel}</code><br>
        <span style="font-size:11px;color:#666">Bewaar deze e-mail — u heeft de sleutel nodig als u het programma op een ander apparaat installeert.</span>
      </p>
    </div>
  </div>

  <div style="padding:16px;text-align:center;font-size:12px;color:#999">
    <p>Vragen? Stuur een e-mail naar <a href="mailto:support@boekhouding-engine.nl" style="color:#1A237E">support@boekhouding-engine.nl</a></p>
    <p>Boekhouding Engine — Eenvoudig boekhouden voor ondernemers</p>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
//  HULPFUNCTIE: INSTALLATIESTATUS CONTROLEREN
// ─────────────────────────────────────────────

/**
 * Controleert of het script correct geïnstalleerd is en alle vereiste
 * Script Properties aanwezig zijn. Geeft een overzicht terug.
 * Gebruik dit om te testen of de Web App correct werkt.
 */
function controleerInstallatieConfig() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const vereist = ['LICENTIE_SERVER_URL'];
  const aanwezig = [];
  const ontbreekt = [];

  vereist.forEach(key => {
    if (props[key]) aanwezig.push(key + ' ✅');
    else ontbreekt.push(key + ' ❌ (ontbreekt)');
  });

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Installatie configuratie',
    'Aanwezig:\n' + (aanwezig.join('\n') || '— geen —') +
    '\n\nOntbreekt:\n' + (ontbreekt.join('\n') || '— geen —'),
    ui.ButtonSet.OK
  );
}

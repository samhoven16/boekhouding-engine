/**
 * Menu.gs
 * Aangepast menu in Google Spreadsheets.
 * Alle teksten in begrijpelijke taal — ook voor gebruikers zonder boekhoudkennis.
 */

// ─────────────────────────────────────────────
//  ON OPEN: MENU AANMAKEN
// ─────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // Onboarding wizard bij eerste gebruik + update-melding bij terugkerende gebruikers
  try { controleerOnboarding_(); } catch (e) { Logger.log('Onboarding check fout: ' + e.message); }

  ui.createMenu('Boekhouding')

    // ── Dagelijks gebruik ─────────────────────
    .addItem('📋 Nieuw invoeren (factuur / kosten / declaratie)', 'openHoofdFormulier')
    .addItem('📸 Bon of factuur uploaden (foto)', 'openBonUpload')
    .addSeparator()

    // ── Facturen ──────────────────────────────
    .addSubMenu(ui.createMenu('Facturen & Betalingen')
      .addItem('Factuur per e-mail versturen', 'stuurVerkoopfactuurPdf')
      .addItem('Betalingsherinneringen versturen', 'stuurBetalingsherinneringen')
      .addSeparator()
      .addItem('Openstaande klantfacturen bekijken', 'vernieuwDebiteurenOverzicht')
      .addItem('Openstaande leveranciersfacturen bekijken', 'vernieuwCrediteurenOverzicht')
    )

    // ── Bankboek ──────────────────────────────
    .addSubMenu(ui.createMenu('Bank')
      .addItem('Bankafschrift importeren (CSV)', 'importeerBankafschrift')
      .addSeparator()
      .addItem('Betalingen automatisch koppelen aan facturen', 'koppelTransactiesAanFacturen')
      .addItem('Transacties automatisch categoriseren', 'autoCategoriseerTransacties')
      .addSeparator()
      .addItem('Banksaldo controleren (afstemming)', 'bankAfstemming')
      .addSeparator()
      .addItem('🔄 Herhalende kosten toevoegen', 'beheerHerhalendeKosten')
      .addItem('Herhalende kosten overzicht', 'toonHerhalendeKostenOverzicht')
    )

    // ── Geavanceerd boekhouden ────────────────
    .addSubMenu(ui.createMenu('Geavanceerd')
      .addItem('Handmatige boeking toevoegen', 'openJournaalpostFormulier')
      .addItem('Openingssaldi invoeren (start boekjaar)', 'openBeginbalansDialoog')
      .addSeparator()
      .addItem('Afschrijvingen verwerken', 'boekAfschrijvingen')
      .addItem('BTW-periode afsluiten', 'sluitBtwPeriode')
    )

    // ── Hulp & advies ─────────────────────────
    .addItem('💬 Hulp & Assistent', 'openAssistent')
    .addItem('💡 Belastingtips & besparingen', 'genereerBelastingadvies')
    .addSeparator()

    // ── Rapporten ─────────────────────────────
    .addSubMenu(ui.createMenu('Overzichten & Rapporten')
      .addItem('Dashboard vernieuwen', 'vernieuwDashboard')
      .addSeparator()
      .addItem('Balans', 'genereerBalans')
      .addItem('Winst & Verlies', 'genereerWvRekening')
      .addItem('Kasstroom (cashflow)', 'genereerCashflow')
      .addSeparator()
      .addItem('BTW-aangifte berekenen', 'genereerBtwAangifte')
      .addItem('Jaarrekening', 'genereerJaarrekening')
      .addSeparator()
      .addItem('Detailoverzicht per rekening', 'exporteerGrootboekkaart')
    )

    // ── BTW ───────────────────────────────────
    .addSubMenu(ui.createMenu('BTW')
      .addItem('BTW-aangifte kwartaal 1 (jan-mrt)', 'genereerBtwAangifteQ1')
      .addItem('BTW-aangifte kwartaal 2 (apr-jun)', 'genereerBtwAangifteQ2')
      .addItem('BTW-aangifte kwartaal 3 (jul-sep)', 'genereerBtwAangifteQ3')
      .addItem('BTW-aangifte kwartaal 4 (okt-dec)', 'genereerBtwAangifteQ4')
      .addSeparator()
      .addItem('Kleineondernemersregeling (KOR) check', 'controleerKor')
    )

    // ── Instellingen & Beheer ─────────────────
    .addSeparator()
    .addSubMenu(ui.createMenu('Instellingen')
      .addItem('Eerste keer instellen (setup)', 'setup')
      .addSeparator()
      .addItem('Formulierlink bekijken', 'toonFormulierLinks')
      .addItem('Google Drive mappen', 'toonDriveStructuur')
      .addItem('Koppeling met Zapier / Make / n8n', 'toonZapierInstructies')
      .addSeparator()
      .addItem('Nieuw boekjaar starten', 'maakNieuwBoekjaar')
      .addItem('Rekeningschema opnieuw laden', 'herlaadGrootboekschema')
      .addItem('Alle overzichten vernieuwen', 'vernieuwAlleRapporten')
      .addItem('Saldi herberekenen (bij fouten)', 'herberekeningGrootboekSaldi')
      .addSeparator()
      .addItem('Setup opnieuw uitvoeren (reset)', 'resetSetup')
    )

    // ── Licentie & Updates ────────────────────
    .addSubMenu(ui.createMenu('Licentie & Updates')
      .addItem('Licentie activeren / wijzigen', 'toonLicentieDialoog')
      .addItem('Licentie-informatie bekijken', 'toonLicentieInfo')
      .addSeparator()
      .addItem('Wat is er nieuw?', 'toonWatIsErNieuw')
    )

    .addToUi();
}

// ─────────────────────────────────────────────
//  HOOFDFORMULIER OPENEN
// ─────────────────────────────────────────────
function openHoofdFormulier() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_HOOFD_ID);
  if (!formId) {
    SpreadsheetApp.getUi().alert(
      'Formulier nog niet aangemaakt',
      'Voer eerst de setup uit:\nBoekhouding → Instellingen → Eerste keer instellen (setup)',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  const url = FormApp.openById(formId).getPublishedUrl();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:20px;text-align:center}
      .btn{display:inline-block;background:#1A237E;color:#fff;padding:14px 28px;
           border-radius:6px;text-decoration:none;font-size:15px;margin:10px 0}
      .btn:hover{background:#283593}
      .tip{background:#FFF8E1;padding:10px;border-radius:4px;font-size:11px;margin-top:14px}
    </style>
    <h3 style="color:#1A237E">Factuur, kosten of declaratie invoeren</h3>
    <p>Klik hieronder om het formulier te openen.<br>
    U kiest zelf wat u wilt doen: een factuur maken, kosten boeken of een declaratie indienen.</p>
    <a class="btn" href="${url}" target="_blank">📋 Formulier openen</a>
    <p style="font-size:11px;color:#888;margin-top:12px;word-break:break-all">${url}</p>
    <div class="tip">💡 <b>Tip:</b> Stuur deze link naar uzelf (WhatsApp, e-mail) zodat u ook vanaf uw telefoon kunt invoeren.</div>
  `).setWidth(500).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Formulier openen');
}

// ─────────────────────────────────────────────
//  BON / FACTUUR UPLOADEN (FOTO)
// ─────────────────────────────────────────────
/**
 * Opent een dialoog waarmee gebruikers een foto van een bon of factuur
 * kunnen uploaden naar Google Drive. Het bestand wordt opgeslagen in de
 * map "Bonnetjes & Ontvangstbewijzen" onder de boekhouding-mappen.
 */
function openBonUpload() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px}
      h3{color:#1A237E;margin-bottom:8px}
      .upload-area{border:2px dashed #C5CAE9;border-radius:8px;padding:24px;text-align:center;
                   margin:10px 0;cursor:pointer;transition:all 0.2s}
      .upload-area:hover{border-color:#1A237E;background:#F5F5FF}
      .upload-area.active{border-color:#4CAF50;background:#E8F5E9}
      input[type=file]{display:none}
      .form-row{margin:8px 0}
      .form-row label{display:block;font-weight:bold;margin-bottom:3px;font-size:12px}
      .form-row select,.form-row input[type=text],.form-row input[type=date]{
        width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:13px}
      .btn{background:#1A237E;color:white;border:none;padding:10px 20px;border-radius:4px;
           cursor:pointer;font-size:14px;width:100%;margin-top:10px}
      .btn:hover{background:#283593}
      .btn:disabled{background:#999;cursor:not-allowed}
      .status{margin-top:8px;padding:8px;border-radius:4px;display:none}
      .tip{background:#FFF8E1;padding:8px;border-radius:4px;font-size:11px;margin-top:10px}
    </style>
    <h3>📸 Bon of factuur uploaden</h3>
    <p>Upload een foto van een bon, factuur of kassabon. Het bestand wordt opgeslagen in uw Google Drive.</p>

    <div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
      📷 Klik hier of sleep een bestand<br>
      <span style="font-size:11px;color:#888">(JPG, PNG, PDF — max 10 MB)</span>
    </div>
    <input type="file" id="fileInput" accept="image/*,.pdf" onchange="bestandGekozen(this)">
    <div id="fileName" style="font-size:11px;color:#1A237E;margin:4px 0"></div>

    <div class="form-row">
      <label>Wat is dit?</label>
      <select id="type">
        <option value="Inkoopfactuur">Inkoopfactuur / bon van een leverancier</option>
        <option value="Declaratie">Declaratie (privé betaald)</option>
        <option value="Overig">Overig document</option>
      </select>
    </div>
    <div class="form-row">
      <label>Korte omschrijving</label>
      <input type="text" id="omschr" placeholder="Bijv. 'Benzinebon tankstation Shell'">
    </div>
    <div class="form-row">
      <label>Datum op de bon</label>
      <input type="date" id="datum" value="${new Date().toISOString().slice(0, 10)}">
    </div>

    <button class="btn" id="uploadBtn" onclick="upload()" disabled>Uploaden naar Google Drive</button>
    <div class="status" id="status"></div>
    <div class="tip">💡 Na het uploaden kunt u de kosten registreren via het formulier (Boekhouding → Nieuw invoeren).</div>

    <script>
      var fileData = null;
      var fileName = '';

      function bestandGekozen(input) {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          toonStatus('Bestand is te groot (max 10 MB).', 'red');
          return;
        }
        fileName = file.name;
        document.getElementById('fileName').textContent = '✓ ' + fileName;
        document.getElementById('dropZone').classList.add('active');
        document.getElementById('uploadBtn').disabled = false;

        var reader = new FileReader();
        reader.onload = function(e) { fileData = e.target.result.split(',')[1]; };
        reader.readAsDataURL(file);
      }

      function upload() {
        if (!fileData) return;
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('uploadBtn').textContent = 'Bezig met uploaden...';
        toonStatus('Uploaden...', '#1A237E');

        google.script.run
          .withSuccessHandler(function(url) {
            toonStatus('✓ Opgeslagen in Google Drive!', 'green');
            document.getElementById('uploadBtn').textContent = 'Nog een bestand uploaden';
            document.getElementById('uploadBtn').disabled = false;
            fileData = null;
          })
          .withFailureHandler(function(err) {
            toonStatus('Fout: ' + err.message, 'red');
            document.getElementById('uploadBtn').textContent = 'Opnieuw proberen';
            document.getElementById('uploadBtn').disabled = false;
          })
          .verwerkBonUpload(fileData, fileName,
            document.getElementById('type').value,
            document.getElementById('omschr').value,
            document.getElementById('datum').value);
      }

      function toonStatus(tekst, kleur) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.style.color = kleur;
        el.style.background = kleur === 'green' ? '#E8F5E9' : kleur === 'red' ? '#FFEBEE' : '#E3F2FD';
        el.textContent = tekst;
      }
    </script>
  `).setWidth(480).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, '📸 Bon uploaden');
}

/**
 * Verwerkt de upload vanuit de dialog.
 * Slaat het bestand op in Google Drive en retourneert de URL.
 */
function verwerkBonUpload(base64Data, bestandsnaam, type, omschrijving, datum) {
  const decoded = Utilities.base64Decode(base64Data);
  const mimeType = bestandsnaam.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'image/' + (bestandsnaam.split('.').pop() || 'jpeg');

  const blob = Utilities.newBlob(decoded, mimeType, bestandsnaam);

  // Map ophalen of aanmaken
  const mapNaam = 'Bonnetjes & Ontvangstbewijzen';
  let folder;
  const mappen = DriveApp.getFoldersByName(mapNaam);
  if (mappen.hasNext()) {
    folder = mappen.next();
  } else {
    folder = DriveApp.createFolder(mapNaam);
  }

  // Hernoem bestand voor overzichtelijkheid
  const datumStr = datum || new Date().toISOString().slice(0, 10);
  const naamParts = [datumStr, type || 'Bon', omschrijving || ''].filter(Boolean);
  const schoneNaam = naamParts.join(' – ').replace(/[\/\\:*?"<>|]/g, '') + '.' + (bestandsnaam.split('.').pop() || 'jpg');
  blob.setName(schoneNaam);

  const file = folder.createFile(blob);
  Logger.log('Bon geüpload: ' + file.getUrl());
  return file.getUrl();
}

// Backward-compat: wordt doorgestuurd naar het hoofdformulier
function openJournaalpostFormulier() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_JOURNAAL_ID);
  if (!formId) {
    openHoofdFormulier();
    return;
  }
  const url = FormApp.openById(formId).getPublishedUrl();
  const html = HtmlService.createHtmlOutput(
    `<p><a href="${url}" target="_blank">📋 Handmatige boeking openen</a></p>`
  ).setWidth(450).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, 'Handmatige boeking');
}

// ─────────────────────────────────────────────
//  FORMULIER LINKS TONEN
// ─────────────────────────────────────────────
function toonFormulierLinks() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(PROP.FORM_HOOFD_ID);
  let url = 'Nog niet aangemaakt — voer eerst de setup uit.';
  if (formId) {
    try { url = FormApp.openById(formId).getPublishedUrl(); }
    catch(e) { url = 'Kon niet ophalen: ' + e.message; }
  }
  const html = `
    <style>body{font-family:Arial,sans-serif;padding:16px} a{color:#1A237E}</style>
    <h3>Uw formulierlink</h3>
    <p>Met dit formulier kunt u facturen maken, kosten boeken en declaraties indienen:</p>
    <p><a href="${url}" target="_blank">📋 Formulier openen</a></p>
    <p style="font-size:11px;color:#666;word-break:break-all">${url}</p>
    <p style="font-size:11px;color:#888">💡 Sla deze link op als bladwijzer op uw telefoon voor snelle invoer onderweg.</p>
  `;
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(500).setHeight(250),
    'Formulierlink'
  );
}

// ─────────────────────────────────────────────
//  REKENINGSCHEMA HERLADEN
// ─────────────────────────────────────────────
function herlaadGrootboekschema() {
  vulGrootboekschema_(getSpreadsheet_());
  SpreadsheetApp.getUi().alert('Rekeningschema is opnieuw geladen.');
}

// ─────────────────────────────────────────────
//  ALLE RAPPORTEN VERNIEUWEN
// ─────────────────────────────────────────────
function vernieuwAlleRapporten() {
  vernieuwDashboard();
  genereerBalans();
  genereerWvRekening();
  genereerCashflow();
  vernieuwDebiteurenOverzicht();
  vernieuwCrediteurenOverzicht();
  SpreadsheetApp.getUi().alert('Alle overzichten zijn bijgewerkt.');
}

// ─────────────────────────────────────────────
//  BEGINBALANS DIALOOG
// ─────────────────────────────────────────────
function openBeginbalansDialoog() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 14px; font-size: 13px; }
      .info { background: #E8EAF6; padding: 12px; border-radius: 4px; margin: 10px 0; }
      .btn { background: #1A237E; color: white; padding: 10px 18px; border: none;
             border-radius: 4px; cursor: pointer; font-size: 13px; }
      .btn:hover { background: #283593; }
    </style>
    <h3 style="color:#1A237E">Openingssaldi invoeren</h3>
    <div class="info">
      <p>Voer hier de beginstand van uw bankrekening en andere rekeningen in.<br>
      Dit is nodig als u overstapt van een ander systeem of een nieuw boekjaar start.</p>
    </div>
    <p>Klik op de knop hieronder. Kies als type <b>"Beginbalans"</b>.</p>
    <p>Tegenrekening: <b>2000 – Ondernemingsvermogen</b></p>
    <p><button class="btn" onclick="google.script.run.openJournaalpostFormulier()">Openingssaldi invoeren</button></p>
    <button onclick="google.script.host.close()" style="margin-top:8px;cursor:pointer">Sluiten</button>
  `).setWidth(450).setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, 'Openingssaldi');
}

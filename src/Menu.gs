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

  // Licentie- en kopiecheck — bij kopie: vergrendelt + minimaal menu; bij niet-geactiveerd: dialoog + minimaal menu
  let licentieOk = false;
  try { licentieOk = controleerLicentieEnKopie_(); } catch (e) { Logger.log('Licentie check fout: ' + e.message); }

  if (!licentieOk) {
    ui.createMenu('Boekhoudbaar')
      .addItem('Licentie activeren', 'toonLicentieDialoog')
      .addSeparator()
      .addItem('Licentie-informatie', 'toonLicentieInfo')
      .addToUi();
    return;
  }

  // Onboarding wizard bij eerste gebruik + update-melding bij terugkerende gebruikers
  try { controleerOnboarding_(); } catch (e) { Logger.log('Onboarding check fout: ' + e.message); }

  // Eénmalig welkom-modal na geslaagde setup — 3 quick-start acties
  try { toonPostSetupWelkomModal_(); } catch (e) { Logger.log('Welkom-modal overgeslagen: ' + e.message); }

  // Globaal bericht van licentieserver (bv. onderhoud, nieuwe versie) — max 1×/dag/bericht.
  try { toonGlobaalBerichtIndienNieuw_(); } catch (e) { Logger.log('Globaal bericht overgeslagen: ' + e.message); }

  // Verberg automatisch aangemaakte formulier-responstabbladen (stil, geen popup)
  try {
    const _ss = getSpreadsheet_();
    if (_ss) verbergFormResponseTabs_(_ss);
  } catch (e) { Logger.log('onOpen werkruimte fout: ' + e.message); }

  ui.createMenu('Boekhoudbaar')

    // ── Dagelijks gebruik ─────────────────────
    .addItem('Dashboard openen', 'openDashboard')
    .addItem('Nieuwe boeking — factuur, kosten of declaratie', 'openNieuweBoeking')
    .addSeparator()

    // ── Facturen ──────────────────────────────
    .addSubMenu(ui.createMenu('Facturen & Betalingen')
      .addItem('Factuurlijst — openen, versturen, markeren', 'openFactuurlijst')
      .addSeparator()
      .addItem('Betalingsherinneringen versturen', 'stuurBetalingsherinneringen')
      .addSeparator()
      .addItem('Openstaande klantfacturen', 'vernieuwDebiteurenOverzicht')
      .addItem('Openstaande leveranciersfacturen', 'vernieuwCrediteurenOverzicht')
    )

    // ── Bankboek ──────────────────────────────
    .addSubMenu(ui.createMenu('Bank')
      .addItem('Bankafschrift importeren (CSV, auto-match)', 'openBankImportDialoog')
      .addItem('Bankafschrift importeren — oude versie', 'importeerBankafschrift')
      .addSeparator()
      .addItem('Betalingen koppelen aan facturen', 'koppelTransactiesAanFacturen')
      .addItem('Transacties categoriseren', 'autoCategoriseerTransacties')
      .addSeparator()
      .addItem('Banksaldo controleren (afstemming)', 'bankAfstemming')
      .addSeparator()
      .addItem('Herhalende kosten toevoegen', 'beheerHerhalendeKosten')
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

    // ── Kwaliteit & Controle ──────────────────
    .addSubMenu(ui.createMenu('Controle & Export')
      .addItem('Gezondheidscheck uitvoeren', 'voerGezondheidCheckUit')
      .addSeparator()
      .addItem('Backup maken (XLSX naar Drive)', 'maakBackup')
      .addItem('Accountantspakket exporteren', 'exporteerAccountantsPakket')
      .addItem('Samenvatting e-mailen naar accountant', 'emailNaarAccountant')
      .addSeparator()
      .addItem('Gesloten periodes beheren', 'beheerGeslotenPeriodes')
    )

    // ── Hulp & advies ─────────────────────────
    .addItem('Hulp & Assistent', 'openAssistent')
    .addItem('Belastingtips & besparingen', 'genereerBelastingadvies')
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
      .addItem('BTW-aangifte assistent (invulhulp)', 'toonBtwAangifteAssistent')
      .addSeparator()
      .addItem('BTW-aangifte kwartaal 1 (jan-mrt)', 'genereerBtwAangifteQ1')
      .addItem('BTW-aangifte kwartaal 2 (apr-jun)', 'genereerBtwAangifteQ2')
      .addItem('BTW-aangifte kwartaal 3 (jul-sep)', 'genereerBtwAangifteQ3')
      .addItem('BTW-aangifte kwartaal 4 (okt-dec)', 'genereerBtwAangifteQ4')
      .addSeparator()
      .addItem('Kleineondernemersregeling (KOR) check', 'controleerKor')
      .addSeparator()
      .addItem('BTW reminder instellen', 'instelBtwReminderTrigger')
    )

    // ── Instellingen & Beheer ─────────────────
    .addSeparator()
    .addSubMenu(ui.createMenu('Instellingen')
      .addItem('Eerste keer instellen (setup)', 'setup')
      .addSeparator()
      .addItem('Bedrijfsstijl (logo & kleur)', 'openBrandingInstellingen')
      .addItem('Google Drive mappen', 'toonDriveStructuur')
      .addItem('Website / webshop koppelen (API)', 'toonZapierInstructies')
      .addSeparator()
      .addItem('Nieuw boekjaar starten', 'maakNieuwBoekjaar')
      .addItem('Rekeningschema opnieuw laden', 'herlaadGrootboekschema')
      .addItem('Alle overzichten vernieuwen', 'vernieuwAlleRapporten')
      .addItem('Saldi herberekenen (bij fouten)', 'herberekeningGrootboekSaldi')
      .addSeparator()
      .addItem('Instellingen controleren', 'valideerEnMeldInstellingen')
      .addItem('Dashboard diagnose (als iets hangt)', 'diagnoseDashboard')
      .addSeparator()
      .addItem('Licentie activeren', 'toonLicentieDialoog')
      .addItem('Licentie-informatie', 'toonLicentieInfo')
      .addSeparator()
      .addItem('Werkruimte opschonen (tabbladen)', 'herorganiseerWerkruimte')
      .addSeparator()
      .addItem('Setup opnieuw uitvoeren (reset)', 'resetSetup')
    )

    // ── Privé Financiën ───────────────────────
    .addSubMenu(ui.createMenu('Privé Financiën')
      .addItem('Privé dashboard openen', 'openPriveDashboard')
      .addSeparator()
      .addItem('Privé transactie toevoegen', 'voegPriveTransactieToe')
      .addItem('Vermogensoverzicht beheren', 'beheerVermogensoverzicht')
      .addSeparator()
      .addItem('IB-aangifte schatting (Box 1/2/3)', 'openIbAangifteHelper')
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
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;padding:24px;text-align:center;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:18px;font-weight:700;letter-spacing:-0.01em;margin-bottom:6px}
      p{color:#5A6478;font-size:13px;line-height:1.55;margin:0 0 10px}
      .btn{display:inline-block;background:#0D1B4E;color:#fff;padding:12px 24px;
           border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin:12px 0;
           transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .url{font-size:11px;color:#5A6478;margin-top:10px;word-break:break-all}
      .tip{background:#FFF8E1;border-left:3px solid #FFC107;padding:10px 12px;border-radius:0 6px 6px 0;font-size:11px;margin-top:16px;text-align:left;color:#5A3A00;line-height:1.5}
    </style>
    <h3>Factuur, kosten of declaratie invoeren</h3>
    <p>Klik hieronder om het formulier te openen. Je kiest zelf wat je wilt doen: een factuur maken, kosten boeken of een declaratie indienen.</p>
    <a class="btn" href="${url}" target="_blank">Formulier openen</a>
    <p class="url">${url}</p>
    <div class="tip"><b>Tip —</b> stuur deze link naar jezelf (WhatsApp, e-mail) zodat je ook vanaf je telefoon kunt invoeren.</div>
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
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:22px 24px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:4px}
      h3{color:#0D1B4E;margin-bottom:6px;font-size:20px;font-weight:800;letter-spacing:-0.01em}
      .sub{color:#5F6B7A;font-size:13px;line-height:1.55;margin-bottom:16px}
      .upload-area{border:1.5px dashed #E5EAF2;border-radius:12px;padding:28px 20px;text-align:center;
                   margin:12px 0;cursor:pointer;background:#fff;transition:all 0.15s ease;color:#5F6B7A}
      .upload-area:hover{border-color:rgba(46,196,182,.55);background:rgba(46,196,182,.03)}
      .upload-area.active{border-color:#2EC4B6;background:rgba(46,196,182,.06);color:#0D1B4E}
      input[type=file]{display:none}
      .form-row{margin:10px 0}
      .form-row label{display:block;font-weight:600;margin-bottom:4px;font-size:12px;color:#1A1A1A}
      .form-row select,.form-row input[type=text],.form-row input[type=date]{
        width:100%;padding:9px 11px;border:1px solid #E5EAF2;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;
        transition:border-color .15s ease,box-shadow .15s ease}
      .form-row select:focus,.form-row input:focus{outline:none;border-color:#2EC4B6;box-shadow:0 0 0 3px rgba(46,196,182,.18)}
      .btn{background:#0D1B4E;color:white;border:none;padding:12px 18px;border-radius:10px;
           cursor:pointer;font-size:14px;width:100%;margin-top:14px;font-family:inherit;font-weight:600;letter-spacing:.1px;
           transition:background .15s ease,transform .15s ease,box-shadow .2s ease}
      .btn:hover:not(:disabled){background:#1A2A6B;transform:translateY(-1px);box-shadow:0 6px 20px rgba(13,27,78,.22)}
      .btn:disabled{background:#94A3B8;cursor:not-allowed}
      .status{margin-top:10px;padding:10px 12px;border-radius:8px;display:none;font-size:12px;border:1px solid transparent}
      .tip{background:#FFF8E1;border:1px solid #FFECB3;color:#5A3F00;padding:10px 12px;border-radius:8px;font-size:12px;margin-top:12px;line-height:1.5}
      .filename{font-size:11px;color:#2EC4B6;margin:6px 0 0;font-weight:600}
      ::selection{background:rgba(46,196,182,.28);color:#0D1B4E}
    </style>
    <div class="label">Upload</div>
    <h3>Bon of factuur uploaden</h3>
    <p class="sub">Upload een foto van een bon, factuur of kassabon. Het bestand wordt opgeslagen in jouw Google Drive.</p>

    <div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
      Klik hier of sleep een bestand<br>
      <span style="font-size:11px;color:#94A3B8">JPG, PNG, PDF — max 10 MB</span>
    </div>
    <input type="file" id="fileInput" accept="image/*,.pdf" onchange="bestandGekozen(this)">
    <div id="fileName" class="filename"></div>

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
    <div class="tip">Na uploaden registreer je de kosten via Boekhoudbaar → Nieuwe boeking.</div>

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
        document.getElementById('uploadBtn').textContent = 'Bezig met uploaden…';
        toonStatus('Uploaden…', 'info');

        google.script.run
          .withSuccessHandler(function(url) {
            toonStatus('Opgeslagen in Google Drive.', 'green');
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
        if (kleur === 'green')      { el.style.background = '#E6F7F4'; el.style.color = '#0D1B4E'; el.style.borderColor = 'rgba(46,196,182,.35)'; }
        else if (kleur === 'red')   { el.style.background = '#FDECEC'; el.style.color = '#B91C1C'; el.style.borderColor = '#F5B3B3'; }
        else                         { el.style.background = '#F7F9FC'; el.style.color = '#5F6B7A'; el.style.borderColor = '#E5EAF2'; }
        el.textContent = tekst;
      }
    </script>
  `).setWidth(500).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Bon of factuur uploaden');
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
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 10px}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      a{color:#0D1B4E;font-weight:600;text-decoration:none}
      a:hover{color:#2EC4B6}
      .url{font-size:11px;color:#5A6478;word-break:break-all}
      .hint{font-size:11px;color:#5A6478;margin-top:8px}
    </style>
    <h3>Je formulierlink</h3>
    <p>Met dit formulier kun je facturen maken, kosten boeken en declaraties indienen.</p>
    <p><a href="${url}" target="_blank">Formulier openen →</a></p>
    <p class="url">${url}</p>
    <p class="hint">Sla deze link op als bladwijzer op je telefoon voor snelle invoer onderweg.</p>
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
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 10px}
      p{color:#5A6478;line-height:1.55;margin:0 0 10px}
      b{color:#0D1B4E;font-weight:600}
      .info{background:#fff;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;
            padding:12px 14px;border-radius:0 6px 6px 0;margin:12px 0}
      .info p{margin:0;color:#1A1A1A}
      .btn{background:#0D1B4E;color:white;padding:10px 18px;border:none;
           border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
           font-family:inherit;transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;padding:9px 16px;
               border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;margin-top:8px;
               font-family:inherit;transition:background 0.15s}
      .btn-sec:hover{background:#EEF2F8}
    </style>
    <h3>Openingssaldi invoeren</h3>
    <div class="info">
      <p>Voer hier de beginstand van je bankrekening en andere rekeningen in. Dit is nodig als je overstapt van een ander systeem of een nieuw boekjaar start.</p>
    </div>
    <p>Klik op de knop hieronder. Kies als type <b>"Beginbalans"</b>.</p>
    <p>Tegenrekening: <b>2000 – Ondernemingsvermogen</b></p>
    <p><button class="btn" onclick="google.script.run.openJournaalpostFormulier()">Openingssaldi invoeren</button></p>
    <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>
  `).setWidth(450).setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, 'Openingssaldi');
}

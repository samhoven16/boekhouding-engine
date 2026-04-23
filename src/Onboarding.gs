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
const HUIDIGE_VERSIE  = '2.0.0';

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
    'Fijn dat u ons programma heeft gekozen.\n\n' +
    'In de volgende stappen helpen we u in 3 minuten op weg:\n\n' +
    '  ✅ Stap 1: Uw licentie activeren\n' +
    '  ✅ Stap 2: Uw bedrijfsgegevens invullen\n' +
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
    '📝 Stap 2: Uw bedrijfsgegevens',
    'Om facturen te maken heeft het programma uw bedrijfsgegevens nodig.\n\n' +
    'In het tabblad "Instellingen" kunt u invullen:\n' +
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
    'Uw boekhouding is ingesteld.\n\n' +
    'Wat kunt u nu doen?\n\n' +
    '  📋 Factuur maken → Boekhouding → Nieuw invoeren\n' +
    '  📸 Bon uploaden → Boekhouding → Bon of factuur uploaden\n' +
    '  💬 Hulp nodig? → Boekhouding → Hulp & Assistent\n\n' +
    'Succes met uw boekhouding!',
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
//  VERSIE-UPDATE NOTIFICATIE
// ─────────────────────────────────────────────

/**
 * Controleert of er een nieuwere versie geïnstalleerd is dan de gebruiker
 * de laatste keer heeft gezien. Toont een beknopte melding indien nodig.
 */
function controleerOpUpdate_() {
  const props = PropertiesService.getScriptProperties();
  const opgeslagenVersie = props.getProperty(VERSIE_PROP) || '1.0.0';

  if (opgeslagenVersie !== HUIDIGE_VERSIE) {
    // Nieuwe versie beschikbaar
    props.setProperty(VERSIE_PROP, HUIDIGE_VERSIE);
    toonUpdateMelding_(opgeslagenVersie, HUIDIGE_VERSIE);
  }
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

function toonWatIsErNieuw() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:22px;font-size:13px;line-height:1.6;color:#1A1A1A;background:#F7F9FC;
           -webkit-font-smoothing:antialiased}
      h2{color:#0D1B4E;font-size:18px;font-weight:700;letter-spacing:-0.01em;margin:0 0 4px}
      h3{color:#0D1B4E;margin:0 0 6px;font-size:13px;font-weight:600}
      .versie{background:#fff;border:1px solid #E5EAF2;padding:14px 16px;border-radius:8px;
              margin-bottom:12px;box-shadow:0 1px 2px rgba(13,27,78,0.03)}
      .versie.nieuwste{border-left:3px solid #2EC4B6}
      .nieuw{color:#1A1A1A}
      .nieuw::marker{color:#2EC4B6}
      .fix{color:#5A6478}
      .fix::marker{color:#5A6478}
      ul{margin:4px 0;padding-left:20px}
      li{margin:3px 0}
      a{color:#0D1B4E;text-decoration:none;font-weight:600}
      a:hover{color:#2EC4B6}
      .foot{font-size:11px;color:#5A6478;margin-top:16px}
      .btn-sec{background:#F7F9FC;color:#0D1B4E;border:1px solid #E5EAF2;
               padding:9px 16px;border-radius:6px;cursor:pointer;font-size:13px;
               font-weight:600;font-family:inherit;margin-top:10px;transition:background 0.15s}
      .btn-sec:hover{background:#EEF2F8}
    </style>
    <h2>Wat is er nieuw in Boekhoudbaar?</h2>

    <div class="versie nieuwste">
      <h3>Versie 2.0.0 — grote update</h3>
      <ul>
        <li class="nieuw">Eén formulier voor facturen, kosten en declaraties (was: 5 aparte formulieren)</li>
        <li class="nieuw">Foto van bon of factuur uploaden via het menu</li>
        <li class="nieuw">Alle teksten herschreven in gewone taal</li>
        <li class="nieuw">Koppeling met Zapier, Make en n8n voor automatisering</li>
        <li class="nieuw">Betere factuurlay-out met opgemaakt factuurnummer (F000001)</li>
        <li class="nieuw">Ondersteuning voor niet-Gmail e-mail (ProtonMail, Outlook etc.)</li>
        <li class="fix">Alle menu-items werken nu correct (was: toestemmingsfout)</li>
        <li class="fix">Oude antwoordtabbladen worden automatisch verwijderd</li>
        <li class="fix">Beveiliging verbeterd: injecties in PDF-facturen niet meer mogelijk</li>
      </ul>
    </div>

    <div class="versie">
      <h3>Versie 1.5.0</h3>
      <ul>
        <li>Betalingsherinneringen automatisch versturen</li>
        <li>Kasstroom (cashflow) rapport toegevoegd</li>
        <li>KOR-check (Kleineondernemersregeling) ingebouwd</li>
      </ul>
    </div>

    <div class="versie">
      <h3>Versie 1.0.0 — eerste versie</h3>
      <ul>
        <li>Basisfunctionaliteit: facturen, kosten, BTW-aangifte</li>
        <li>Dashboard met live statistieken</li>
        <li>Google Drive integratie</li>
      </ul>
    </div>

    <p class="foot">Vragen of problemen? <a href="mailto:support@boekhoudbaar.nl">support@boekhoudbaar.nl</a></p>
    <button class="btn-sec" onclick="google.script.host.close()">Sluiten</button>
  `).setWidth(520).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'Wat is er nieuw?');
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

  const bedrijf = (getInstelling_ && typeof getInstelling_ === 'function')
    ? (getInstelling_('Bedrijfsnaam') || '')
    : '';
  const begroeting = bedrijf ? 'Welkom bij Boekhoudbaar, ' + bedrijf : 'Welkom bij Boekhoudbaar';

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           color:#1A1A1A;background:#F7F9FC;padding:26px 28px}
      .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:8px}
      h1{color:#0D1B4E;font-size:22px;font-weight:800;letter-spacing:-0.01em;margin-bottom:10px;line-height:1.25}
      p.sub{color:#5F6B7A;font-size:14px;line-height:1.55;margin-bottom:20px}
      .acties{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
      .actie{
        display:flex;align-items:center;gap:14px;padding:14px 16px;
        background:#fff;border:1px solid #E5EAF2;border-radius:10px;
        cursor:pointer;transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease;
        font-family:inherit;font-size:14px;text-align:left;color:#1A1A1A;width:100%;
      }
      .actie:hover{border-color:rgba(46,196,182,.45);transform:translateY(-1px);box-shadow:0 2px 10px rgba(13,27,78,.06)}
      .actie .n{width:28px;height:28px;border-radius:50%;background:rgba(46,196,182,.12);color:#0D1B4E;
                font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
      .actie .t{flex:1}
      .actie .t strong{display:block;color:#0D1B4E;font-weight:700;font-size:14px;margin-bottom:2px}
      .actie .t span{color:#5F6B7A;font-size:12px}
      .later{text-align:center;margin-top:6px}
      .later button{background:none;border:none;color:#5F6B7A;font-size:13px;cursor:pointer;font-family:inherit;padding:8px 12px}
      .later button:hover{color:#0D1B4E}
    </style>
    <div class="label">Setup voltooid</div>
    <h1>${begroeting}</h1>
    <p class="sub">Je boekhouding staat klaar. Drie acties die je nu kunt doen — of later via het Boekhouding-menu.</p>
    <div class="acties">
      <button class="actie" onclick="kies('instellingen')">
        <span class="n">1</span>
        <span class="t"><strong>Bedrijfsgegevens invullen</strong><span>Naam, BTW-nummer, IBAN — nodig voor facturen</span></span>
      </button>
      <button class="actie" onclick="kies('boeking')">
        <span class="n">2</span>
        <span class="t"><strong>Eerste factuur of kostenpost boeken</strong><span>Nieuwe boeking dialoog openen</span></span>
      </button>
      <button class="actie" onclick="kies('dashboard')">
        <span class="n">3</span>
        <span class="t"><strong>Dashboard bekijken</strong><span>KPI's en openstaande facturen in één oogopslag</span></span>
      </button>
    </div>
    <div class="later"><button onclick="kies('later')">Later — sluit dit venster</button></div>
    <script>
      function kies(actie) {
        google.script.run.withSuccessHandler(function(){ google.script.host.close(); })
          .markeerWelkomGezienEnNavigeer_(actie);
      }
    </script>
  `).setWidth(460).setHeight(440);

  ui.showModalDialog(html, 'Welkom bij Boekhoudbaar');
}

/**
 * Zet de welkom-gezien-vlag en navigeert (optioneel) naar de gekozen
 * vervolg-actie. Aangeroepen vanuit de welkom-modal.
 */
function markeerWelkomGezienEnNavigeer_(actie) {
  PropertiesService.getUserProperties().setProperty(POST_SETUP_WELKOM_GEZIEN, 'true');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (actie === 'instellingen') {
      const s = ss.getSheetByName(SHEETS.INSTELLINGEN);
      if (s) ss.setActiveSheet(s);
    } else if (actie === 'dashboard') {
      const s = ss.getSheetByName(SHEETS.DASHBOARD);
      if (s) ss.setActiveSheet(s);
    } else if (actie === 'boeking') {
      if (typeof openNieuweBoeking === 'function') openNieuweBoeking();
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

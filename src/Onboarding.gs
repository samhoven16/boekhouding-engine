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

  if (!voltooid) {
    // Eerste keer: toon welkomst-wizard
    Utilities.sleep(1000); // Laat spreadsheet eerst laden
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
    '🎉 Welkom bij Boekhouding Engine!',
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
      '✅ Boekhouding Engine bijgewerkt',
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
      body{font-family:Arial,sans-serif;padding:20px;font-size:13px;line-height:1.6}
      h2{color:#1A237E;margin-bottom:4px}
      h3{color:#283593;margin:16px 0 4px;font-size:13px}
      .versie{background:#E8EAF6;padding:12px;border-radius:6px;margin-bottom:12px}
      .nieuw{color:#2E7D32;font-weight:bold}
      .fix{color:#1565C0}
      ul{margin:4px 0;padding-left:20px}
      li{margin:2px 0}
    </style>
    <h2>Wat is er nieuw in Boekhouding Engine?</h2>

    <div class="versie">
      <h3>🆕 Versie 2.0.0 — Grote update</h3>
      <ul>
        <li class="nieuw">✨ Eén formulier voor facturen, kosten en declaraties (was: 5 aparte formulieren)</li>
        <li class="nieuw">✨ Foto van bon of factuur uploaden via het menu</li>
        <li class="nieuw">✨ Alle teksten herschreven in gewone taal</li>
        <li class="nieuw">✨ Koppeling met Zapier, Make en n8n voor automatisering</li>
        <li class="nieuw">✨ Betere factuurlay-out met opgemaakt factuurnummer (F000001)</li>
        <li class="nieuw">✨ Ondersteuning voor niet-Gmail e-mail (ProtonMail, Outlook etc.)</li>
        <li class="fix">🔧 Alle menu-items werken nu correct (was: toestemmingsfout)</li>
        <li class="fix">🔧 Oude antwoordtabbladen worden automatisch verwijderd</li>
        <li class="fix">🔧 Beveiliging verbeterd: injecties in PDF-facturen niet meer mogelijk</li>
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
      <h3>Versie 1.0.0 — Eerste versie</h3>
      <ul>
        <li>Basisfunctionaliteit: facturen, kosten, BTW-aangifte</li>
        <li>Dashboard met live statistieken</li>
        <li>Google Drive integratie</li>
      </ul>
    </div>

    <p style="font-size:11px;color:#888;margin-top:16px">
      Vragen of problemen? <a href="mailto:support@boekhouding-engine.nl">support@boekhouding-engine.nl</a>
    </p>
    <button onclick="google.script.host.close()" style="margin-top:8px;padding:8px 16px;cursor:pointer">Sluiten</button>
  `).setWidth(520).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'Wat is er nieuw?');
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
  SpreadsheetApp.getUi().alert(
    'Onboarding gereset',
    'De welkomst-wizard wordt getoond bij de volgende keer openen.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

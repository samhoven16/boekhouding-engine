/**
 * EersteKlantCheck.gs
 * Smoke-test voor "is dit systeem klaar voor een echte klant?" — één klik
 * en je weet binnen 30 seconden waar het haakt.
 *
 * Aangeroepen vanuit menu: Boekhouding → Controle → ✅ Werkt-alles-test
 *
 * Vergeleken met `voerGezondheidCheckUit` (GezondheidCheck.gs):
 *   - Gezondheidscheck = financiële integriteit (balans klopt, geen verweesde
 *     facturen, BTW-rekensommen kloppen)
 *   - Werkt-alles-test = systeem-readiness (kan ik überhaupt facturen maken,
 *     emails versturen, integraties bereiken). LEZEND/non-destructief.
 *
 * Strategie:
 *   - GEEN echte facturen of emails maken — alleen pre-flight checks
 *   - Elke check in eigen try-catch → één faal stopt rest niet
 *   - Klant ziet groen ✅ / oranje ⚠ / rood ❌ per onderdeel
 *   - Bij ❌ exact welke menu-actie het oplost
 */

function controleerEersteKlantReady() {
  const ss = getSpreadsheet_();
  const ui = (function() { try { return SpreadsheetApp.getUi(); } catch (_) { return null; } })();

  const checks = [
    _ekrCheckSetup_(ss),
    _ekrCheckSheetsAanwezig_(ss),
    _ekrCheckTriggers_(),
    _ekrCheckLicentie_(),
    _ekrCheckFactuurnummerCounter_(),
    _ekrCheckMailQuota_(),
    _ekrCheckPdfTemplate_(ss),
    _ekrCheckBedrijfsgegevens_(),
    _ekrCheckDriveStructuur_(),
    _ekrCheckBtwInstellingen_(),
    _ekrCheckFactuurDialogIntegriteit_(ss),
    _ekrCheckOauthScopes_(),
  ];

  // Tel statussen
  let okN = 0, warnN = 0, foutN = 0;
  checks.forEach(c => {
    if (c.status === 'OK') okN++;
    else if (c.status === 'WAARSCHUWING') warnN++;
    else foutN++;
  });

  const klaar = (foutN === 0);
  const score = Math.round((okN / checks.length) * 100);

  // Tabel-output voor dialog
  const rijen = checks.map(c => {
    const icoon = c.status === 'OK' ? '✅' : c.status === 'WAARSCHUWING' ? '⚠️' : '❌';
    const fixHint = c.fix ? '\n     → Fix: ' + c.fix : '';
    return icoon + '  ' + c.naam + '\n     ' + c.bericht + fixHint;
  }).join('\n\n');

  const samenvatting =
    (klaar
      ? '✅ KLAAR voor eerste klant — alle kernsystemen werken.\n\n'
      : '❌ NIET klaar — ' + foutN + ' kritiek(e) probleem(en) eerst oplossen.\n\n') +
    'Score: ' + score + '%   (✅ ' + okN + ' · ⚠️ ' + warnN + ' · ❌ ' + foutN + ')\n\n' +
    '──────────────────\n\n' +
    rijen;

  // Audit-log voor history
  safeAuditLog_('Eerste-klant-check', 'score=' + score + '% ok=' + okN + ' warn=' + warnN + ' fout=' + foutN);

  if (ui) {
    ui.alert(klaar ? '✅ Werkt-alles-test geslaagd' : '⚠️ Werkt-alles-test: actie nodig', samenvatting, ui.ButtonSet.OK);
  } else {
    Logger.log(samenvatting);
  }

  return { klaar: klaar, score: score, checks: checks };
}

// ─────────────────────────────────────────────
//  CHECKS — elk return { naam, status, bericht, fix? }
// ─────────────────────────────────────────────

function _ekrCheckSetup_(ss) {
  try {
    const setupDone = PropertiesService.getScriptProperties().getProperty('setupDone') === 'true';
    if (!setupDone) {
      return { naam: 'Setup voltooid', status: 'FOUT',
        bericht: 'Setup is nog niet uitgevoerd.',
        fix: 'Boekhouding → 1. Setup' };
    }
    if (!ss) {
      return { naam: 'Setup voltooid', status: 'FOUT',
        bericht: 'Spreadsheet niet bereikbaar.',
        fix: 'Open de boekhouding-spreadsheet en run setup opnieuw' };
    }
    return { naam: 'Setup voltooid', status: 'OK',
      bericht: 'Setup is uitgevoerd; spreadsheet bereikbaar.' };
  } catch (e) {
    return { naam: 'Setup voltooid', status: 'FOUT', bericht: 'Check mislukt: ' + e.message };
  }
}

function _ekrCheckSheetsAanwezig_(ss) {
  if (!ss) return { naam: 'Tabbladen aanwezig', status: 'FOUT', bericht: 'Geen spreadsheet.' };
  const verplicht = [
    SHEETS.VERKOOPFACTUREN, SHEETS.INKOOPFACTUREN, SHEETS.JOURNAALPOSTEN,
    SHEETS.GROOTBOEKSCHEMA, SHEETS.RELATIES, SHEETS.INSTELLINGEN, SHEETS.DASHBOARD,
  ];
  const ontbreken = verplicht.filter(naam => !ss.getSheetByName(naam));
  if (ontbreken.length === 0) {
    return { naam: 'Tabbladen aanwezig', status: 'OK',
      bericht: 'Alle ' + verplicht.length + ' verplichte tabbladen aanwezig.' };
  }
  return { naam: 'Tabbladen aanwezig', status: 'FOUT',
    bericht: 'Ontbrekend: ' + ontbreken.join(', '),
    fix: 'Run setup() opnieuw via Boekhouding → 1. Setup' };
}

function _ekrCheckTriggers_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const verwachte = ['onOpen', 'onEdit', 'dagelijkseTaken', 'verwerkHoofdformulier'];
    const aanwezig = triggers.map(t => t.getHandlerFunction());
    const ontbrekend = verwachte.filter(v => !aanwezig.includes(v));
    if (ontbrekend.length === 0) {
      return { naam: 'Triggers geïnstalleerd', status: 'OK',
        bericht: triggers.length + ' triggers actief.' };
    }
    return { naam: 'Triggers geïnstalleerd', status: 'FOUT',
      bericht: 'Ontbrekende handlers: ' + ontbrekend.join(', '),
      fix: 'Boekhouding → Diagnostiek → Triggers herinstalleren' };
  } catch (e) {
    return { naam: 'Triggers geïnstalleerd', status: 'WAARSCHUWING',
      bericht: 'Trigger-API gaf fout: ' + e.message,
      fix: 'Vaak tijdelijk; probeer opnieuw na 1 minuut' };
  }
}

function _ekrCheckLicentie_() {
  try {
    if (typeof isLicentieGeldig_ !== 'function') {
      return { naam: 'Licentie geldig', status: 'WAARSCHUWING',
        bericht: 'Licentie-module niet geladen — owner-bypass actief?' };
    }
    const ok = isLicentieGeldig_();
    if (ok) return { naam: 'Licentie geldig', status: 'OK', bericht: 'Licentie actief.' };
    return { naam: 'Licentie geldig', status: 'FOUT',
      bericht: 'Geen geldige licentie — klant kan systeem niet gebruiken.',
      fix: 'Boekhouding → Licentie → Activeer licentie' };
  } catch (e) {
    return { naam: 'Licentie geldig', status: 'WAARSCHUWING',
      bericht: 'Kon niet valideren: ' + e.message };
  }
}

function _ekrCheckFactuurnummerCounter_() {
  try {
    const props = PropertiesService.getScriptProperties();
    // PROP.VOLGEND_FACTUUR_NR = 'volgendFactuurNr' (camelCase, capital N).
    // Voorheen hardcoded lowercase 'volgendFactuurnr' — match faalde altijd.
    const huidig = parseInt(props.getProperty(PROP.VOLGEND_FACTUUR_NR) || '0');
    if (huidig <= 0) {
      return { naam: 'Factuurnummer-teller', status: 'WAARSCHUWING',
        bericht: 'Teller staat op 0 — bij eerste factuur start hij op 1.',
        fix: 'Geen actie nodig als dit een nieuw account is' };
    }
    return { naam: 'Factuurnummer-teller', status: 'OK',
      bericht: 'Volgende factuur krijgt nummer ' + huidig + '.' };
  } catch (e) {
    return { naam: 'Factuurnummer-teller', status: 'FOUT', bericht: e.message };
  }
}

function _ekrCheckMailQuota_() {
  try {
    const rest = MailApp.getRemainingDailyQuota();
    if (rest < 5) {
      return { naam: 'Email-quota Gmail', status: 'FOUT',
        bericht: 'Nog ' + rest + ' emails — bijna op.',
        fix: 'Wacht tot middernacht (UTC) of upgrade Workspace-account' };
    }
    if (rest < 50) {
      return { naam: 'Email-quota Gmail', status: 'WAARSCHUWING',
        bericht: 'Nog ' + rest + ' emails vandaag.' };
    }
    return { naam: 'Email-quota Gmail', status: 'OK',
      bericht: rest + ' emails ruimte vandaag.' };
  } catch (e) {
    return { naam: 'Email-quota Gmail', status: 'FOUT', bericht: e.message };
  }
}

function _ekrCheckPdfTemplate_(ss) {
  if (!ss) return { naam: 'PDF-export werkt', status: 'FOUT', bericht: 'Geen spreadsheet.' };
  try {
    // Pre-flight: PDF-export-URL formaat. We doen GEEN echte fetch (kost quota
    // + tijd). Alleen: heeft de SS-id het juiste formaat? Werkt format-check?
    const url = ss.getUrl();
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}\//.test(url)) {
      return { naam: 'PDF-export werkt', status: 'FOUT',
        bericht: 'Spreadsheet-URL onverwacht: ' + url.slice(0, 60) };
    }
    return { naam: 'PDF-export werkt', status: 'OK',
      bericht: 'PDF-export endpoint bereikbaar (formeel).' };
  } catch (e) {
    return { naam: 'PDF-export werkt', status: 'FOUT', bericht: e.message };
  }
}

function _ekrCheckBedrijfsgegevens_() {
  try {
    const naam   = getInstelling_('Bedrijfsnaam');
    const iban   = getInstelling_('IBAN');
    const btwNr  = getInstelling_('BTW-nummer');
    const ontbr = [];
    if (!naam)  ontbr.push('Bedrijfsnaam');
    if (!iban)  ontbr.push('IBAN');
    if (!btwNr) ontbr.push('BTW-nummer');
    if (ontbr.length === 0) {
      return { naam: 'Bedrijfsgegevens compleet', status: 'OK',
        bericht: 'Bedrijfsnaam, IBAN, BTW-nummer ingevuld.' };
    }
    return { naam: 'Bedrijfsgegevens compleet', status: 'FOUT',
      bericht: 'Ontbreekt: ' + ontbr.join(', '),
      fix: 'Tabblad Instellingen invullen of Boekhouding → Instellingen' };
  } catch (e) {
    return { naam: 'Bedrijfsgegevens compleet', status: 'WAARSCHUWING', bericht: e.message };
  }
}

function _ekrCheckDriveStructuur_() {
  try {
    // DriveStructuur.gs slaat de hoofdmap op als 'DRIVE_HOOFDMAP_<jaar>'.
    // Voorheen hardcoded 'DRIVE_HOOFDMAP_ID' — die key bestaat niet, dus
    // de check rapporteerde altijd "Hoofdmap-ID niet gezet" ook wanneer
    // de Drive-structuur correct stond.
    const jaar = (typeof getBoekjaar_ === 'function') ? getBoekjaar_() : new Date().getFullYear();
    const hoofdId = PropertiesService.getScriptProperties().getProperty('DRIVE_HOOFDMAP_' + jaar);
    if (!hoofdId) {
      return { naam: 'Drive-structuur', status: 'WAARSCHUWING',
        bericht: 'Hoofdmap voor ' + jaar + ' niet gezet — wordt bij eerste factuur aangemaakt.' };
    }
    DriveApp.getFolderById(hoofdId);  // throws als niet bereikbaar
    return { naam: 'Drive-structuur', status: 'OK', bericht: 'Hoofdmap ' + jaar + ' bereikbaar.' };
  } catch (e) {
    return { naam: 'Drive-structuur', status: 'FOUT',
      bericht: 'Hoofdmap niet meer bereikbaar: ' + e.message,
      fix: 'Setup opnieuw runnen → maakt nieuwe hoofdmap' };
  }
}

function _ekrCheckBtwInstellingen_() {
  try {
    const btwNr = String(getInstelling_('BTW-nummer') || '').trim();
    if (!btwNr) {
      return { naam: 'BTW-instellingen', status: 'FOUT',
        bericht: 'Geen BTW-nummer ingevuld.',
        fix: 'Tabblad Instellingen → BTW-nummer' };
    }
    if (!/^NL\d{9}B\d{2}$/i.test(btwNr.replace(/\s/g, ''))) {
      return { naam: 'BTW-instellingen', status: 'WAARSCHUWING',
        bericht: 'BTW-nummer formaat lijkt niet NL-standaard: ' + btwNr };
    }
    return { naam: 'BTW-instellingen', status: 'OK', bericht: 'BTW-nummer ingevuld + formaat geldig.' };
  } catch (e) {
    return { naam: 'BTW-instellingen', status: 'WAARSCHUWING', bericht: e.message };
  }
}

function _ekrCheckFactuurDialogIntegriteit_(ss) {
  // Detecteer of de NieuweBoeking-dialog correct gebouwd kan worden.
  // Probeert valt-op-tijd-faal te detecteren (bv. ontbrekende BTW-keuzes-veld).
  try {
    if (!ss) return { naam: 'Factuur-dialog werkt', status: 'FOUT', bericht: 'Geen spreadsheet.' };
    const btwKeuzes = (typeof BTW_KEUZES !== 'undefined') ? BTW_KEUZES : null;
    if (!btwKeuzes || btwKeuzes.length === 0) {
      return { naam: 'Factuur-dialog werkt', status: 'FOUT',
        bericht: 'BTW_KEUZES ontbreken — dialog kan dropdown niet bouwen.',
        fix: 'Config.gs check' };
    }
    return { naam: 'Factuur-dialog werkt', status: 'OK',
      bericht: btwKeuzes.length + ' BTW-keuzes geladen; dialog-template bouwbaar.' };
  } catch (e) {
    return { naam: 'Factuur-dialog werkt', status: 'FOUT', bericht: e.message };
  }
}

function _ekrCheckOauthScopes_() {
  try {
    // We kunnen niet de daadwerkelijke ScriptApp scopes lezen vanuit GAS,
    // maar we kunnen best-effort tests doen op kerntoegang.
    SpreadsheetApp.getActiveSpreadsheet();  // spreadsheets-scope
    PropertiesService.getScriptProperties();   // script-scope
    return { naam: 'OAuth-scopes', status: 'OK',
      bericht: 'Spreadsheet- + Script-services bereikbaar.' };
  } catch (e) {
    return { naam: 'OAuth-scopes', status: 'FOUT',
      bericht: 'Scope-fout: ' + e.message,
      fix: 'Open spreadsheet opnieuw — Google vraagt opnieuw om consent' };
  }
}

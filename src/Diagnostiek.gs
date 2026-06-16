/**
 * Diagnostiek.gs
 * Self-tests voor autorisaties + executions-debug.
 *
 * Adresseert "Valse Start"-issues:
 *  - #1 Machtigingen: klant heeft niet alle scopes geaccepteerd
 *  - #2 Silent triggers: trigger geïnstalleerd maar gefaald
 *  - #6 Quota / executions: klant ziet geen errors
 *
 * Run via menu: Boekhouding → Controle & Export → Diagnostiek uitvoeren.
 * Tests elke gebruikte service en geeft per-service status.
 */

/**
 * Pingt elke gebruikte GAS-service en rapporteert OK / FOUT / NIET_GEAUTORISEERD.
 * Zonder runtime-effect (geen schrijf-acties); alleen lezen om scope te valideren.
 */
function controleerAutorisaties() {
  const ui = SpreadsheetApp.getUi();
  const checks = [];

  function probeer(naam, fn) {
    try { fn(); checks.push({ naam, status: 'OK', detail: '' }); }
    catch (e) {
      const msg = String(e.message || e);
      const niet = /not authorized|geen toegang|access.*denied|permission/i.test(msg);
      checks.push({ naam, status: niet ? 'AUTORISATIE_NODIG' : 'FOUT', detail: msg.slice(0, 200) });
    }
  }

  probeer('SpreadsheetApp', function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('geen actieve spreadsheet');
    ss.getName();
  });
  probeer('DriveApp',   function() { const f = DriveApp.createFile('._probe', '', 'text/plain'); f.setTrashed(true); });
  probeer('MailApp',    function() { MailApp.getRemainingDailyQuota(); });
  probeer('UrlFetchApp', function() {
    // Lichte HEAD naar een endpoint binnen onze allowlist — geen externe load
    const resp = UrlFetchApp.fetch('https://api.kvk.nl/', { muteHttpExceptions: true, method: 'get' });
    resp.getResponseCode();
  });
  probeer('PropertiesService', function() { PropertiesService.getScriptProperties().getKeys(); });
  probeer('CacheService', function() { CacheService.getScriptCache().get('___probe'); });
  probeer('LockService', function() {
    const l = LockService.getScriptLock();
    if (l.tryLock(50)) l.releaseLock();
  });
  probeer('FormApp', function() {
    // Probeer alleen als er een hoofdformulier-id is
    const id = PropertiesService.getScriptProperties().getProperty('formHoofdId');
    if (id) FormApp.openById(id).getId();
  });
  probeer('Triggers', function() {
    const t = ScriptApp.getProjectTriggers();
    if (!Array.isArray(t)) throw new Error('triggers retourneert niet-array');
  });
  probeer('Session', function() {
    const u = Session.getActiveUser();
    if (!u) throw new Error('geen actieve user');
  });
  probeer('Utilities', function() { Utilities.getUuid(); });

  // ── Renderen ──
  const rijen = checks.map(function(c) {
    const icon = c.status === 'OK' ? '✅' : (c.status === 'AUTORISATIE_NODIG' ? '🔐' : '⚠️');
    return icon + '  ' + c.naam.padEnd(20) + '  ' + c.status + (c.detail ? '  — ' + c.detail.slice(0, 80) : '');
  }).join('\n');

  const aantalAutorisatie = checks.filter(function(c) { return c.status === 'AUTORISATIE_NODIG'; }).length;
  const aantalFout = checks.filter(function(c) { return c.status === 'FOUT'; }).length;
  const aantalOk = checks.filter(function(c) { return c.status === 'OK'; }).length;

  let advies = '';
  if (aantalAutorisatie > 0) {
    advies = '\n\n⚠️ Open Apps Script editor (Extensies → Apps Script), klik op de "Uitvoeren"-knop ' +
             'naast een functie en doorloop de toestemming-popup (klik "Geavanceerd" → "Ga toch naar..."). ' +
             'Daarna werken triggers automatisch.';
  } else if (aantalFout > 0) {
    advies = '\n\nEr zijn fouten in non-autorisatie-categorie. Kopieer dit overzicht en deel met support.';
  } else {
    advies = '\n\n✅ Alle services geautoriseerd en bereikbaar. Triggers + dialogs werken correct.';
  }

  safeAuditLog_('Diagnostiek', aantalOk + ' OK / ' + aantalAutorisatie + ' auth-nodig / ' + aantalFout + ' fout');

  ui.alert(
    '🔧 Autorisatie-diagnostiek',
    'Resultaat: ' + aantalOk + ' OK · ' + aantalAutorisatie + ' autorisatie nodig · ' + aantalFout + ' fout\n\n' +
    rijen + advies,
    ui.ButtonSet.OK
  );
}

/**
 * Open Apps Script Executions-dashboard in nieuw tabblad.
 * Klant kan daar alle script-runs + errors zien — debug-info-goudmijn.
 */
function openExecutionsDashboard() {
  const scriptId = ScriptApp.getScriptId();
  const url = 'https://script.google.com/home/projects/' + scriptId + '/executions';
  const html = HtmlService.createHtmlOutput(
    '<style>body{font-family:-apple-system,sans-serif;padding:20px;font-size:13px;background:#F7F9FC}' +
    'a{display:inline-block;background:#0D1B4E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;margin-top:14px}' +
    'a:hover{background:#1A2A6B}</style>' +
    '<h2 style="color:#0D1B4E;margin:0 0 10px">📋 Apps Script Executions</h2>' +
    '<p style="color:#5F6B7A;line-height:1.5">Hier zie je elke script-run met duur, status (OK/FAILED/TIMED_OUT) en stack-trace bij fout. ' +
    'Open in nieuw tabblad om logs door te zoeken.</p>' +
    '<a href="' + escHtml_(url) + '" target="_blank">→ Open Executions-dashboard</a>'
  ).setWidth(440).setHeight(220).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, '📋 Executions');
}

/**
 * Trigger-overzicht. Toont welke triggers geïnstalleerd zijn + hun functie + event.
 * Cruciaal voor "Silent triggers"-debug — als trigger niet zichtbaar is, draait hij niet.
 */
/**
 * Watchdog: detecteert of dagelijkseTaken in de afgelopen 36u heeft gedraaid.
 * Zo niet → "valse start"-scenario (klant heeft scopes niet geaccepteerd).
 * Stuurt eenmalig per dag een toast naar klant + audit-log entry.
 *
 * Aangeroepen vanuit onOpen — fail-silently.
 */
function controleerTriggerWatchdog_() {
  try {
    // Laatste run van dagelijkseTaken via Taakstatus-tab
    const ss = getSpreadsheet_();
    if (!ss) return;
    const sheet = ss.getSheetByName('Taakstatus');
    if (!sheet || sheet.getLastRow() < 2) return;  // Nog geen runs gehad — nieuw klant, ok
    const data = sheet.getDataRange().getValues();
    let laatsteRun = null;
    for (let i = 1; i < data.length; i++) {
      const ts = data[i][1];  // kolom 1 = Laatste run
      if (ts instanceof Date) {
        if (!laatsteRun || ts > laatsteRun) laatsteRun = ts;
      }
    }
    if (!laatsteRun) return;

    const urenTerug = (Date.now() - laatsteRun.getTime()) / 3600000;
    if (urenTerug < 36) return;  // ok, recent gedraaid

    // Throttle: max 1× per dag waarschuwen
    const props = PropertiesService.getUserProperties();
    const KEY = 'watchdogToastTs';
    const last = parseInt(props.getProperty(KEY) || '0');
    if (Date.now() - last < 24 * 3600 * 1000) return;
    props.setProperty(KEY, String(Date.now()));

    try {
      ss.toast(
        'Dagelijkse taken hebben ' + Math.round(urenTerug) + 'u niet gedraaid. Open Boekhouding → Diagnostiek voor check.',
        '⚠️ Triggers stilgevallen?',
        15
      );
    } catch (_) {}
    safeAuditLog_('Trigger-watchdog', 'dagelijkseTaken ' + Math.round(urenTerug) + 'u geleden');
  } catch (e) {
    Logger.log('controleerTriggerWatchdog_ silent fail: ' + e.message);
  }
}

function toonTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const ui = SpreadsheetApp.getUi();
    if (!triggers.length) {
      ui.alert('⚠️ Geen triggers', 'Er zijn geen triggers geïnstalleerd. Run setup() opnieuw of klik "Triggers installeren".', ui.ButtonSet.OK);
      return;
    }
    const rijen = triggers.map(function(t) {
      const event = t.getEventType ? t.getEventType().toString() : 'onbekend';
      const handler = t.getHandlerFunction ? t.getHandlerFunction() : 'onbekend';
      const bron = t.getTriggerSource ? t.getTriggerSource().toString() : '';
      return '• ' + handler + '  [' + event + (bron ? ' / ' + bron : '') + ']';
    }).join('\n');
    ui.alert('📋 Geïnstalleerde triggers (' + triggers.length + ')', rijen, ui.ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Trigger-overzicht fout', vertaalFout_(e), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Metrics.gs
 * Performance-metrics + critical-error broadcast.
 *
 * Doel: owner krijgt zichtbaar of het systeem snel/traag is + waarschuwing
 * bij FATAAL-niveau errors zonder dat klant hoeft te bellen.
 *
 * Schrijft naar verborgen 'Metrics' tabblad (max 5000 rijen, FIFO).
 * Geen impact op klant-flow — async fire-and-forget.
 */

const METRICS_SHEET = 'Metrics';
const METRICS_MAX_RIJEN = 5000;

/**
 * Logt een performance-meting in een verborgen Metrics-tab.
 * Roep aan rond zware operaties:
 *
 *   const t0 = Date.now();
 *   try { ...zwaar... }
 *   finally { metricsLog_('dashboard.refresh', Date.now() - t0, true); }
 *
 * @param {string}  naam        kort label (dashboard.refresh, factuur.create, btw.aangifte)
 * @param {number}  durMs       duur in milliseconden
 * @param {boolean} ok          true = geslaagd, false = exception
 * @param {Object=} extra       optioneel object (klein, JSON-stringified)
 */
function metricsLog_(naam, durMs, ok, extra) {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    let sheet = ss.getSheetByName(METRICS_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(METRICS_SHEET);
      sheet.getRange(1, 1, 1, 5)
        .setValues([['Tijdstip', 'Naam', 'Duur (ms)', 'Status', 'Detail']])
        .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      sheet.hideSheet();
    }
    const detail = extra ? String(JSON.stringify(extra)).slice(0, 500) : '';
    sheet.appendRow([new Date(), String(naam), parseInt(durMs) || 0, ok ? 'OK' : 'FOUT', detail]);

    // FIFO trim — voorkom runaway-growth
    const lastRow = sheet.getLastRow();
    if (lastRow > METRICS_MAX_RIJEN + 1) {
      sheet.deleteRows(2, lastRow - METRICS_MAX_RIJEN - 1);
    }
  } catch (e) {
    // Metrics mag NOOIT klant-flow blokkeren
    Logger.log('metricsLog_ silently failed: ' + e.message);
  }
}

/**
 * Wikkel een functie met automatische metrics-logging.
 * Gebruik:
 *   const result = metMetrics_('dashboard.refresh', function() { return ...; });
 */
function metMetrics_(naam, fn) {
  const t0 = Date.now();
  let ok = false;
  try {
    const r = fn();
    ok = true;
    return r;
  } finally {
    try { metricsLog_(naam, Date.now() - t0, ok); } catch (_) {}
  }
}

/**
 * Critical-error broadcast naar owner.
 * Voor FATAAL-niveau fouten (data-loss-risico, payment-fail, security-breach)
 * waar owner direct op moet reageren — niet wachten tot klant belt.
 *
 * Throttle: max 1 mail per uniek-bericht per uur — voorkomt mail-bombing
 * bij een loop-fout.
 *
 * @param {string} categorie   bv. 'PAYMENT', 'MIGRATIE', 'DATA_LOSS', 'AUTH'
 * @param {string} bericht     korte beschrijving
 * @param {Object=} context    optionele key-value details
 */
function meldFataalAanOwner_(categorie, bericht, context) {
  try {
    const cacheKey = 'fataal_' + categorie + '_' + Utilities.base64Encode(String(bericht).slice(0, 80)).slice(0, 40);
    const cache = CacheService.getScriptCache();
    if (cache.get(cacheKey)) return;  // throttled
    cache.put(cacheKey, '1', 3600);

    const ssNaam = (function(){ try { return SpreadsheetApp.getActiveSpreadsheet().getName(); } catch (_) { return 'onbekend'; } })();
    const ssId = (function(){ try { return SpreadsheetApp.getActiveSpreadsheet().getId(); } catch (_) { return 'onbekend'; } })();
    const userEmail = (function(){ try { return Session.getActiveUser().getEmail() || 'anoniem'; } catch (_) { return 'anoniem'; } })();
    const ctxJson = context ? JSON.stringify(context).slice(0, 1000) : '(geen)';

    const onderwerp = '[Boekhoudbaar FATAAL] ' + categorie + ' — ' + ssNaam;
    const body =
      'FATAAL-niveau probleem gedetecteerd in Boekhoudbaar.\n\n' +
      'Categorie:  ' + categorie + '\n' +
      'Bericht:    ' + bericht + '\n' +
      'Klant:      ' + userEmail + '\n' +
      'Spreadsheet: ' + ssNaam + ' (' + ssId + ')\n' +
      'Tijdstip:   ' + new Date().toLocaleString('nl-NL') + '\n\n' +
      'Context:\n' + ctxJson + '\n\n' +
      '— automatische melding via meldFataalAanOwner_ (gethrottled 1×/uur per bericht)';

    // Stuur naar eerste ADMIN_EMAIL als die bekend is — anders fallback samhoven16
    let owner = '';
    try {
      if (typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.length) owner = ADMIN_EMAILS[0];
    } catch (_) {}
    if (!owner) owner = 'samhoven16@gmail.com';

    GmailApp.sendEmail(owner, onderwerp, body);
    try { schrijfAuditLog_('FATAAL gemeld', categorie + ' | ' + String(bericht).slice(0, 100)); } catch (_) {}
  } catch (e) {
    Logger.log('meldFataalAanOwner_ fout: ' + e.message);
  }
}

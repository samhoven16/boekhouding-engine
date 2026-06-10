/**
 * Hygiene.gs
 * ════════════════════════════════════════════════════════════════
 * Rommel-bestrijding — Sam's "Grote Schoonmaak"-protocol
 * ════════════════════════════════════════════════════════════════
 *
 * Drie helpers voor codebase + live-omgeving hygiëne:
 *
 *   1. executeWithLock_(naam, fn, opt)
 *      LockService-wrapper voor concurrent-write safety. Voorkomt
 *      race-conditions tussen dagelijkse trigger en user-acties op
 *      dezelfde sheet/range.
 *
 *   2. sanitizeTriggers_()
 *      Verwijdert ALLE bestaande project-triggers en maakt alleen de
 *      noodzakelijke opnieuw aan. Bestrijdt "zombie-triggers" (dubbele
 *      execs van vorige deploys, partial installs, etc.).
 *
 *   3. structuredLog_(level, fn, msg, ctx)
 *      Schrijft naar _SYSTEM_LOG sheet met [Timestamp, Level, Function,
 *      Message, Context]. Vervangt nutteloze Logger.log/console.log
 *      die bij crashes verdwijnen.
 *
 * Bewust additief — bestaande code blijft werken. Migratie naar deze
 * patronen is opt-in per call-site.
 */

// ─────────────────────────────────────────────────────────────
// 1. executeWithLock_ — concurrent-safe execution
// ─────────────────────────────────────────────────────────────

/**
 * Voer fn() uit met een script-lock. Voorkomt race-conditions tussen
 * concurrent execs (dagelijkse trigger + user-actie + webhook).
 *
 * @param {string} naam — beschrijvende naam voor logging
 * @param {Function} fn — functie zonder argumenten
 * @param {Object} [opt]
 * @param {number} [opt.timeoutMs=10000] — max wachttijd op lock
 * @param {boolean} [opt.silentOnTimeout=false] — bij true: skip i.p.v. throw
 * @returns resultaat van fn() of undefined bij silentOnTimeout + lock-miss
 */
// eslint-disable-next-line no-unused-vars
function executeWithLock_(naam, fn, opt) {
  opt = opt || {};
  const timeoutMs = opt.timeoutMs || 10000;
  const lock = LockService.getScriptLock();
  let lockHeld = false;
  try {
    lock.waitLock(timeoutMs);
    lockHeld = true;
  } catch (e) {
    if (opt.silentOnTimeout) {
      try { structuredLog_('WARN', 'executeWithLock_',
        'Lock-timeout op ' + naam + ' — skip', { timeoutMs: timeoutMs }); } catch (_) {}
      return undefined;
    }
    throw new Error('executeWithLock_(' + naam + '): kon geen lock krijgen binnen ' +
      timeoutMs + 'ms — ' + (e.message || e));
  }
  try {
    return fn();
  } finally {
    if (lockHeld) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 2. sanitizeTriggers_ — zombie-trigger eradicatie
// ─────────────────────────────────────────────────────────────

/**
 * Centrale definitie van álle expected triggers. Single source of truth.
 * Verwijdert vroeger-gewenste triggers automatisch + voorkomt drift.
 *
 * @private
 */
const _HYGIENE_VERWACHTE_TRIGGERS = [
  { handler: 'onOpen',              type: 'spreadsheet',    event: 'onOpen' },
  { handler: 'onEdit',              type: 'spreadsheet',    event: 'onEdit' },
  { handler: 'verwerkHoofdformulier', type: 'spreadsheet',  event: 'onFormSubmit' },
  // 08:00 conform installeelTriggers_ (Setup.gs) — was 00:00, maar dan
  // verstuurt dunning betalingsherinneringen om middernacht.
  { handler: 'dagelijkseTaken',     type: 'time',            uur: 8 },
  { handler: 'stuurWeeklySamenvatting_', type: 'weekly',     dag: 'MONDAY', uur: 8 },
  { handler: 'mailMaandrapport',    type: 'monthly',          dagVanMaand: 1, uur: 10 },
];

/**
 * Opt-in triggers die de klant bewust zelf aanzet (en sanitize dus moet
 * BEHOUDEN, niet hermaken): zonder deze lijst wist delete-all-recreate
 * de BTW-deadline-reminder permanent.
 * @private
 */
const _HYGIENE_BEHOUD_HANDLERS = ['controleerBtwDeadline_'];

/**
 * Verwijder ALLE bestaande project-triggers en installeer alleen de
 * verwachte set opnieuw. Idempotent — tweede aanroep is no-op qua
 * eindstaat (al zit er overhead in delete-recreate).
 *
 * Wordt aangeroepen vanuit menu (handmatig) en optioneel vanuit deploy-
 * pipeline (CI). Vervangt installeelTriggers_ als single bron-van-waarheid
 * voor trigger-state.
 *
 * @returns {{verwijderd: number, aangemaakt: number, fouten: Array<string>}}
 */
// eslint-disable-next-line no-unused-vars
function sanitizeTriggers_() {
  const fouten = [];
  let verwijderd = 0;
  let aangemaakt = 0;

  // 1. Verwijder alle bestaande triggers (zombie-bestrijding)
  try {
    const bestaand = ScriptApp.getProjectTriggers();
    bestaand.forEach(function(t) {
      try {
        if (_HYGIENE_BEHOUD_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) return;
        ScriptApp.deleteTrigger(t);
        verwijderd++;
      } catch (e) {
        fouten.push('Delete ' + t.getHandlerFunction() + ': ' + e.message);
      }
    });
  } catch (e) {
    fouten.push('getProjectTriggers: ' + e.message);
  }

  // 2. Hermaak alleen wat er WERKELIJK moet zijn
  const ss = getSpreadsheet_();
  if (!ss) {
    fouten.push('Spreadsheet niet beschikbaar — kan triggers niet binden');
    return { verwijderd: verwijderd, aangemaakt: 0, fouten: fouten };
  }

  _HYGIENE_VERWACHTE_TRIGGERS.forEach(function(def) {
    try {
      if (def.type === 'time') {
        ScriptApp.newTrigger(def.handler).timeBased().atHour(def.uur).everyDays(1).create();
      } else if (def.type === 'weekly') {
        ScriptApp.newTrigger(def.handler).timeBased()
          .onWeekDay(ScriptApp.WeekDay[def.dag]).atHour(def.uur).create();
      } else if (def.type === 'monthly') {
        ScriptApp.newTrigger(def.handler).timeBased()
          .onMonthDay(def.dagVanMaand).atHour(def.uur).create();
      } else if (def.type === 'spreadsheet') {
        const b = ScriptApp.newTrigger(def.handler).forSpreadsheet(ss);
        if (def.event === 'onOpen') b.onOpen().create();
        else if (def.event === 'onEdit') b.onEdit().create();
        else if (def.event === 'onFormSubmit') b.onFormSubmit().create();
      }
      aangemaakt++;
    } catch (e) {
      fouten.push('Create ' + def.handler + ': ' + e.message);
    }
  });

  try {
    structuredLog_('INFO', 'sanitizeTriggers_',
      verwijderd + ' verwijderd, ' + aangemaakt + ' aangemaakt' +
      (fouten.length ? ', ' + fouten.length + ' fouten' : ''),
      { fouten: fouten });
  } catch (_) {}

  return { verwijderd: verwijderd, aangemaakt: aangemaakt, fouten: fouten };
}

/**
 * Menu-handler: sanitizeTriggers_ met UI feedback.
 */
// eslint-disable-next-line no-unused-vars
function sanitizeTriggers() {
  const ui = SpreadsheetApp.getUi();
  const bevestig = ui.alert(
    '🧹 Trigger-hygiëne uitvoeren?',
    'Alle bestaande triggers worden verwijderd en de noodzakelijke set wordt opnieuw geïnstalleerd. Voorkomt dubbele uitvoering van dagelijkse taken door zombie-triggers van vorige installaties.\n\nDoorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestig !== ui.Button.YES) return;
  const r = sanitizeTriggers_();
  ui.alert(
    '🧹 Trigger-hygiëne klaar',
    'Verwijderd: ' + r.verwijderd +
    '\nAangemaakt: ' + r.aangemaakt +
    (r.fouten.length ? '\nFouten: ' + r.fouten.length + ' (zie _SYSTEM_LOG)' : '\nGeen fouten.'),
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────────────────────
// 3. structuredLog_ — gestructureerde logging
// ─────────────────────────────────────────────────────────────

const _HYGIENE_LOG_SHEET = '_SYSTEM_LOG';
const _HYGIENE_LOG_MAX_ROWS = 5000;  // 50× normale dagactiviteit; trim cap
const _HYGIENE_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

/**
 * Schrijf een gestructureerde log-entry naar het _SYSTEM_LOG-tabblad.
 * Vervang Logger.log/console.log calls die in productie verdwijnen.
 *
 * Bij elke 100e append: trim de oudste 20% (zachte FIFO).
 *
 * @param {string} level — DEBUG | INFO | WARN | ERROR
 * @param {string} fn — naam van de aanroepende functie
 * @param {string} msg — klare-tekst boodschap
 * @param {Object} [ctx] — optionele context (wordt JSON-gestringified)
 */
// eslint-disable-next-line no-unused-vars
function structuredLog_(level, fn, msg, ctx) {
  if (_HYGIENE_LOG_LEVELS.indexOf(level) === -1) level = 'INFO';
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    let sheet = ss.getSheetByName(_HYGIENE_LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(_HYGIENE_LOG_SHEET);
      sheet.appendRow(['Timestamp', 'Level', 'Function', 'Message', 'Context', 'User']);
      sheet.setFrozenRows(1);
      try { sheet.hideSheet(); } catch (_) {}
    }
    let user = '';
    try { user = Session.getEffectiveUser().getEmail() || ''; } catch (_) {}
    let ctxStr = '';
    if (ctx !== undefined && ctx !== null) {
      try { ctxStr = JSON.stringify(ctx); } catch (_) { ctxStr = String(ctx); }
      if (ctxStr.length > 2000) ctxStr = ctxStr.slice(0, 1997) + '…';
    }
    sheet.appendRow([new Date(), level, String(fn || ''), String(msg || ''), ctxStr, user]);

    // Trim periodiek: bij elke 100e log + boven cap (verwijder oudste 20%)
    const lastRow = sheet.getLastRow();
    if (lastRow > _HYGIENE_LOG_MAX_ROWS && lastRow % 100 === 0) {
      const teVerwijderen = Math.floor(_HYGIENE_LOG_MAX_ROWS * 0.2);
      try { sheet.deleteRows(2, teVerwijderen); } catch (_) {}
    }
  } catch (_) {
    // Logging-fout mag nooit hoofdtaak breken
  }
}

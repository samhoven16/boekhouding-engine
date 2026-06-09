/**
 * SelfHeal.gs
 * ════════════════════════════════════════════════════════════════
 * "Zero-Touch" trigger-controle — uitgebreid trigger-zelfherstel
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's "Zero-Touch" eis: klant opent sheet, alles werkt direct.
 *
 * Bestaande herstelKritiekeTriggersIndienNodig_ (Setup.gs) check alleen
 * of de dagelijkseTaken-trigger nog bestaat. Maar als onEdit, onOpen, of
 * verwerkHoofdformulier ontbreekt:
 *   - onEdit weg → audit-log wordt niet bijgewerkt → stille tamper-tolerantie
 *   - onOpen weg → menu verschijnt niet → klant denkt dat het stuk is
 *   - onFormSubmit weg → Google Form invoer komt niet door
 *
 * Deze module:
 *   1. Vergelijkt actuele triggers met canonical set (_HYGIENE_VERWACHTE_TRIGGERS)
 *   2. Herstelt missende triggers via sanitizeTriggers_ (single source of truth)
 *   3. Schrijft elke check naar _SYSTEM_LOG (observability)
 *
 * Throttle 24u — voorkomt dat een licht-kapotte installatie elk uur opnieuw
 * probeert te healen en quota verbrandt.
 */

const _SELFHEAL_LAATSTE_RUN_PROP = 'SELFHEAL_LAATSTE_RUN_TS';
const _SELFHEAL_THROTTLE_UREN = 24;

/**
 * Pure introspectie: welke verwachte triggers ontbreken?
 *
 * @returns {{volledig: boolean, missend: Array<string>, present: Array<string>, bereikbaar: boolean}}
 */
// eslint-disable-next-line no-unused-vars
function inspecteerTriggerInstallatie_() {
  // Canonical list uit Hygiene.gs (single source of truth)
  if (typeof _HYGIENE_VERWACHTE_TRIGGERS === 'undefined') {
    return { volledig: true, missend: [], present: [], bereikbaar: false };
  }
  let bestaande = [];
  try {
    bestaande = ScriptApp.getProjectTriggers();
  } catch (_) {
    // LIMITED auth: simple-trigger context kan triggers niet enumereren.
    // Geen oordeel mogelijk → bereikbaar=false zodat caller niet acteert.
    return { volledig: true, missend: [], present: [], bereikbaar: false };
  }
  const handlers = bestaande.map(function(t) { return t.getHandlerFunction(); });
  const verwacht = _HYGIENE_VERWACHTE_TRIGGERS.map(function(v) { return v.handler; });
  const missend = verwacht.filter(function(h) { return handlers.indexOf(h) === -1; });
  const present = verwacht.filter(function(h) { return handlers.indexOf(h) !== -1; });
  return {
    volledig: missend.length === 0,
    missend: missend,
    present: present,
    bereikbaar: true,
  };
}

/**
 * Volledige zelfheal-cyclus: detecteer + repareer + observe.
 * Aangeroepen vanuit onOpen (na de bestaande herstel-stap) en uit
 * dagelijkseTaken (verbose log).
 *
 * @returns {{staat: string, missend: Array, gehealed: boolean}}
 */
// eslint-disable-next-line no-unused-vars
function controleerVolledigeTriggerInstallatie_() {
  // Alleen na voltooide setup — anders weet je niet of triggers er zouden moeten zijn
  try {
    if (typeof PROP !== 'undefined' && PROP && PROP.SETUP_DONE) {
      const setupGedaan = PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) === 'true';
      if (!setupGedaan) {
        return { staat: 'VERSE_KOPIE', missend: [], gehealed: false };
      }
    }
  } catch (_) {}

  const rapport = inspecteerTriggerInstallatie_();
  if (!rapport.bereikbaar) {
    return { staat: 'LIMITED_AUTH', missend: [], gehealed: false };
  }
  if (rapport.volledig) {
    return { staat: 'OK', missend: [], gehealed: false };
  }

  // Throttle: max 1× per 24u — voorkomt heal-stormen.
  let mogenHealen = false;
  try {
    const userProps = PropertiesService.getUserProperties();
    const laatste = parseInt(userProps.getProperty(_SELFHEAL_LAATSTE_RUN_PROP) || '0', 10);
    const verstreken = Date.now() - laatste;
    if (verstreken >= _SELFHEAL_THROTTLE_UREN * 60 * 60 * 1000) {
      mogenHealen = true;
      userProps.setProperty(_SELFHEAL_LAATSTE_RUN_PROP, String(Date.now()));
    }
  } catch (_) {}

  if (!mogenHealen) {
    return { staat: 'KAPOT_GETHROTTLED', missend: rapport.missend, gehealed: false };
  }

  // Heal via sanitizeTriggers_ (Hygiene.gs) — single source of truth voor
  // trigger-installatie. Deletet alles + recreate canonical.
  try {
    if (typeof sanitizeTriggers_ === 'function') {
      const heal = sanitizeTriggers_();
      try {
        if (typeof structuredLog_ === 'function') {
          structuredLog_('WARN', 'SelfHeal.controleerVolledige',
            'Triggers ontbraken: ' + rapport.missend.join(', ') + ' — hersteld',
            { missend: rapport.missend, heal: heal });
        }
      } catch (_) {}
      try { safeAuditLog_('SelfHeal', 'Triggers hersteld: ' + rapport.missend.join(', ')); } catch (_) {}
      return { staat: 'GEHEALED', missend: rapport.missend, gehealed: true };
    }
  } catch (e) {
    try { safeAuditLog_('SelfHeal FOUT', e.message); } catch (_) {}
    return { staat: 'HEAL_GEFAALD', missend: rapport.missend, gehealed: false };
  }
  return { staat: 'GEEN_SANITIZER', missend: rapport.missend, gehealed: false };
}

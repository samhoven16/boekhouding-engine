/**
 * ResilientExecutor.gs
 * ════════════════════════════════════════════════════════════════
 * Zelfherstellend uitvoer-patroon voor externe API-calls
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's Axioma 3 — Self-Healing:
 *   "WRAP elke externe API-call (Mollie, Brevo, KvK, Gemini) in een
 *   retryWithBackoff() functie (exponentiële vertraging, max 5 pogingen)."
 *
 * Implementatie:
 *   retryMetBackoff_(fn, opt) — voert fn() uit, vangt fouten, wacht
 *     exponentieel langer (1s → 2s → 4s → 8s → 16s) en probeert opnieuw.
 *     Returnt resultaat van fn of throwt finaal na max pogingen.
 *
 *   circuitBreaker_(naam, fn, opt) — als een service >N keer faalt
 *     binnen window M, ga in "offline mode": gooi expliciete CircuitOpen
 *     fout zonder opnieuw te bellen. Reset na cooldown.
 *
 * Geen vervanging van bestaande try/catch — bedoeld als opt-in helper
 * voor NIEUWE API-integraties en als refactor-target voor bestaande
 * callers waar resilience-uitbreiding kritisch is.
 */

/**
 * Voer fn() uit met exponentiële backoff bij fouten.
 *
 * @param {Function} fn — functie zonder argumenten
 * @param {Object} [opt]
 * @param {number} [opt.maxPogingen=5]
 * @param {number} [opt.basisDelayMs=1000]
 * @param {Array<string>} [opt.retryableMessages] — error-message substrings
 *   die retry rechtvaardigen. Default: alle fouten worden retried.
 *   Voorbeeld: ['timeout', '429', '503'] = alleen op netwerk/throttling.
 * @returns resultaat van fn()
 * @throws laatste fout na uitputting van pogingen
 */
// eslint-disable-next-line no-unused-vars
function retryMetBackoff_(fn, opt) {
  opt = opt || {};
  const maxPogingen = opt.maxPogingen || 5;
  const basisDelay = opt.basisDelayMs || 1000;
  const retryable = opt.retryableMessages || null;
  let laatsteFout = null;
  for (let poging = 1; poging <= maxPogingen; poging++) {
    try {
      return fn();
    } catch (e) {
      laatsteFout = e;
      // Niet-retryable fout? Direct doorgooien
      if (retryable && retryable.length > 0) {
        const msg = String(e.message || e || '').toLowerCase();
        const hasMatch = retryable.some(function(s) {
          return msg.indexOf(String(s).toLowerCase()) !== -1;
        });
        if (!hasMatch) throw e;
      }
      if (poging >= maxPogingen) break;
      // Exponentiële backoff: 1s, 2s, 4s, 8s, 16s
      const wachtMs = basisDelay * Math.pow(2, poging - 1);
      try { Utilities.sleep(wachtMs); } catch (_) {}
    }
  }
  throw laatsteFout || new Error('retryMetBackoff_: onbekende fout');
}

/**
 * Circuit breaker: als een externe service >N keer faalt binnen window,
 * stop met proberen totdat cooldown verstreken is.
 *
 * State opgeslagen in ScriptProperties: { fouten: int, eerste: ts, open_tot: ts }
 *
 * @param {string} naam — unieke service-identifier (bv. "mollie", "brevo")
 * @param {Function} fn
 * @param {Object} [opt]
 * @param {number} [opt.drempel=3] — N fouten = open circuit
 * @param {number} [opt.windowMs=300000] — 5 min window voor tellen
 * @param {number} [opt.cooldownMs=900000] — 15 min cooldown na open
 * @returns resultaat van fn() of throwt CircuitOpen-fout
 */
// eslint-disable-next-line no-unused-vars
function circuitBreaker_(naam, fn, opt) {
  opt = opt || {};
  const drempel = opt.drempel || 3;
  const windowMs = opt.windowMs || 5 * 60 * 1000;
  const cooldownMs = opt.cooldownMs || 15 * 60 * 1000;
  const props = PropertiesService.getScriptProperties();
  const sleutel = 'CIRCUIT_' + naam.toUpperCase();
  const nu = Date.now();

  // 1. Check of circuit open is
  let state = {};
  try { state = JSON.parse(props.getProperty(sleutel) || '{}'); } catch (_) {}
  if (state.open_tot && state.open_tot > nu) {
    throw new Error('Circuit OPEN voor ' + naam +
      ' (cooldown nog ' + Math.round((state.open_tot - nu) / 1000) + 's)');
  }
  // Window verlopen? Reset teller
  if (state.eerste && (nu - state.eerste) > windowMs) {
    state = {};
  }

  // 2. Voer functie uit
  try {
    const resultaat = fn();
    // Succes: reset state
    if (state.fouten) {
      props.deleteProperty(sleutel);
    }
    return resultaat;
  } catch (e) {
    // Fout: tel + check drempel
    state.fouten = (state.fouten || 0) + 1;
    if (!state.eerste) state.eerste = nu;
    if (state.fouten >= drempel) {
      state.open_tot = nu + cooldownMs;
      try { safeAuditLog_('Circuit Breaker OPEN', naam + ' na ' + state.fouten + ' fouten'); } catch (_) {}
    }
    props.setProperty(sleutel, JSON.stringify(state));
    throw e;
  }
}

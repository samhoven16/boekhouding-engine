/**
 * AIConfig.gs
 * ════════════════════════════════════════════════════════════════
 * "Bring Your Own Key" — Gemini AI is een opt-in feature
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's principe: klant betaalt nooit verrast. De AI-bonscan draait op
 * Gemini → kost geld → moet dus expliciet door de klant ingeschakeld
 * worden met zijn EIGEN Google-key. Hij ziet zijn eigen Google-bill,
 * weet wat hij krijgt, en kan op elk moment uitzetten.
 *
 * Existing helpers:
 *   - zetGeminiApiKey()  (BoekingEngine.gs) — menu om key in te stellen
 *   - scanDocumentMetAI() (BoekingEngine.gs) — feature die de key gebruikt
 *
 * Deze module voegt toe:
 *   - aiBeschikbaar_()                — pure check
 *   - getAiStatusVoorDialog()         — publieke wrapper voor HTML-dialog
 *   - aiSetupViaDialog()              — google.script.run-hook naar setup
 *
 * Geen executable secrets in deze module — alleen status-introspectie.
 */

const _AI_KEY_PROP = 'GEMINI_API_KEY';

/**
 * Is er een geldige Gemini API-key geconfigureerd?
 * Pure read; geen UI, geen side-effects.
 *
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
function aiBeschikbaar_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const versleuteld = props.getProperty(_AI_KEY_PROP);
    if (!versleuteld) return false;
    const key = (typeof ontsleutelString_ === 'function')
      ? ontsleutelString_(versleuteld)
      : versleuteld;
    return Boolean(key && String(key).length >= 20);
  } catch (_) {
    return false;
  }
}

/**
 * Publieke wrapper voor de Nieuwe-Boeking dialog. Geeft minimale
 * status door zonder de key zelf te exposen.
 *
 * @returns {{actief: boolean, melding: string}}
 */
// eslint-disable-next-line no-unused-vars
function getAiStatusVoorDialog() {
  const actief = aiBeschikbaar_();
  return {
    actief: actief,
    melding: actief
      ? 'AI bon-scan actief — Gemini Vision leest leverancier, datum en bedrag automatisch.'
      : 'AI bon-scan is uit. Stel je eigen Gemini API-key in (gratis op aistudio.google.com) om het aan te zetten.',
  };
}

/**
 * Publieke wrapper voor google.script.run vanuit de dialog. Roept de
 * bestaande zetGeminiApiKey()-prompt aan en geeft de nieuwe status terug
 * zodat de UI direct kan herrenderen.
 *
 * @returns {{actief: boolean}}
 */
// eslint-disable-next-line no-unused-vars
function aiSetupViaDialog() {
  try {
    if (typeof zetGeminiApiKey === 'function') zetGeminiApiKey();
  } catch (_) {}
  return { actief: aiBeschikbaar_() };
}

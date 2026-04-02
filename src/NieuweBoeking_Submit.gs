/**
 * NieuweBoeking_Submit.gs
 * Submit-logica, spraak en upload-handlers voor NieuweBoeking.
 * Wordt inline in de dialog-HTML geplaatst als <script>-blok.
 *
 * TECHNISCHE NOOT: dit bestand bevat ALLEEN server-side GAS functies.
 * De client-side JS zit inline in openNieuweBoeking() in NieuweBoeking.gs.
 */

// ─── SUBMIT HANDLER (client belt dit aan) ─────────────────────────────
/**
 * Verwerkt de huidige tab-invoer en boekt het resultaat.
 * Retourneert {ok, bericht, factuurnummer?, emailVerzonden?, bonUrl?}
 */
function submitNieuweBoeking(type, formData) {
  // Dubbele server-side validatie (ook als client-side wordt omzeild)
  const v = valideerBoeking(type, formData);
  if (!v.ok) {
    throw new Error(v.fouten.map(function(f){ return f.bericht; }).join('\n'));
  }
  return verwerkNieuweBoeking(type, formData);
}

/**
 * Scant een document via Gemini Vision en geeft extractie terug.
 * Publieke wrapper voor gebruik vanuit de dialog.
 */
function scanBoekingDocument(base64, mime) {
  return scanDocumentMetAI(base64, mime);
}

/**
 * Verwerkt gesproken tekst naar velden.
 */
function parseBoekingSpraakinvoer(type, tekst) {
  return parseSpraakinvoer(type, tekst);
}

/**
 * Slaat bedrijfstype op (uit onboarding of instellingen).
 */
function zetBusinessType(type) {
  return slaBusinessTypeOp(type);
}

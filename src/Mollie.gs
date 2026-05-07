/**
 * Mollie.gs
 * Genereert iDEAL/SEPA-betaal-links per factuur via Mollie API.
 *
 * Klant zet API-key éénmalig via Boekhouding → Instellingen → Mollie API-key.
 * Bij factuur-creatie wordt automatisch een payment-link gegenereerd en
 * geëmbed in de email + PDF — afnemer betaalt met 1 klik i.p.v.
 * IBAN handmatig over te tikken.
 *
 * Strategie: best-effort. Als Mollie down is of geen key: factuur wordt
 * gewoon zonder betaal-link verstuurd (huidig gedrag = baseline).
 *
 * API-docs: docs.mollie.com/reference/v2/payments-api/create-payment
 * Test-keys (test_*) zijn gratis; live-keys (live_*) vereisen Mollie-account.
 */

const MOLLIE_KEY_PROP = 'MOLLIE_API_KEY';
const MOLLIE_API_BASE = 'https://api.mollie.com/v2';

/**
 * Eenmalige setup vanuit menu. Versleuteld opgeslagen in UserProperties.
 */
function zetMollieApiKey() {
  const ui = SpreadsheetApp.getUi();
  const userProps = PropertiesService.getUserProperties();
  const huidigEnc = userProps.getProperty(MOLLIE_KEY_PROP) || '';
  const huidig = ontsleutelString_(huidigEnc);
  const resp = ui.prompt(
    'Mollie API-key instellen',
    'Plak hier je Mollie API-key (live_xxxxx of test_xxxxx).\n' +
    'Maak een gratis account aan op mollie.com — eerste 100 transacties zijn gratis.\n\n' +
    'Wordt versleuteld opgeslagen.\n\nHuidig: ' +
      (huidig ? huidig.slice(0, 5) + '…' + huidig.slice(-4) : '(geen)'),
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const key = String(resp.getResponseText() || '').trim();
  if (!key) {
    userProps.deleteProperty(MOLLIE_KEY_PROP);
    ui.alert('Mollie API-key verwijderd. Facturen krijgen geen betaal-link meer.');
    return;
  }
  if (!/^(live|test)_/.test(key)) {
    ui.alert('⚠️ Ongeldige sleutel', 'Mollie-sleutels beginnen met live_ of test_. Probeer opnieuw.', ui.ButtonSet.OK);
    return;
  }
  userProps.setProperty(MOLLIE_KEY_PROP, versleutelString_(key));
  ui.alert('✅ Mollie API-key opgeslagen (versleuteld).', 'Vanaf nu krijgt elke nieuwe factuur automatisch een betaal-link in PDF + email.', ui.ButtonSet.OK);
}

/**
 * Genereert een Mollie payment-link voor een factuur.
 * Returns string-URL of null bij fail (best-effort).
 *
 * @param {Object} factuur  { factuurnummer, klantnaam, klantEmail, bedragIncl, omschrijving, vervaldatum }
 * @returns {string|null}   payment-link of null
 */
function genereerMolliePaymentLink_(factuur) {
  if (!factuur || !factuur.factuurnummer || !(factuur.bedragIncl > 0)) return null;

  // Feature-flag check — klant kan ondanks API-key Mollie-link uitzetten
  // via Instellingen 'Feature: mollie_betaal_link' = Nee
  try {
    if (typeof featureAan_ === 'function' && !featureAan_('mollie_betaal_link')) return null;
  } catch (_) {}

  let apiKey = '';
  try {
    const raw = PropertiesService.getUserProperties().getProperty(MOLLIE_KEY_PROP) || '';
    apiKey = ontsleutelString_(raw);
  } catch (_) {}
  if (!apiKey) return null;  // geen key = geen link, factuur gaat zonder

  // Rate-limit: max 60 betaal-links/min per user
  try { rateLimit_('mollieCreate', 60); } catch (_) { return null; }

  try {
    const payload = {
      amount: { currency: 'EUR', value: Number(factuur.bedragIncl).toFixed(2) },
      description: 'Factuur ' + String(factuur.factuurnummer) + (factuur.klantnaam ? ' — ' + factuur.klantnaam : ''),
      // redirectUrl is verplicht in productie; gebruik placeholder die klant later kan aanpassen
      redirectUrl: 'https://boekhoudbaar.nl/factuur-betaald?nr=' + encodeURIComponent(factuur.factuurnummer),
      metadata: {
        factuurnummer: String(factuur.factuurnummer),
        klantEmail: String(factuur.klantEmail || ''),
        bron: 'boekhoudbaar',
      },
    };
    const resp = veiligFetch_(MOLLIE_API_BASE + '/payments', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code !== 201) {
      Logger.log('Mollie create-payment status ' + code + ': ' + resp.getContentText().slice(0, 300));
      try { schrijfAuditLog_('Mollie payment-link MISLUKT', factuur.factuurnummer + ' status=' + code); } catch (_) {}
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    const link = (json._links && json._links.checkout && json._links.checkout.href) || null;
    if (!link) return null;
    try { schrijfAuditLog_('Mollie payment-link', factuur.factuurnummer + ' → ' + link.slice(0, 80)); } catch (_) {}
    return link;
  } catch (e) {
    Logger.log('genereerMolliePaymentLink_ fout: ' + e.message);
    return null;
  }
}

/**
 * Wrapper voor gebruik in Verkoopfacturen.gs PDF-template + email-body.
 * Best-effort: alleen aanroepen als Mollie geconfigureerd is.
 */
function molliePaymentBlock_(factuur) {
  const link = genereerMolliePaymentLink_(factuur);
  if (!link) return '';
  return '<div style="background:#E6F7F4;border:1px solid #2EC4B6;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:11pt;text-align:center">' +
    '<strong style="color:#0D1B4E">Direct betalen?</strong><br>' +
    '<a href="' + escHtml_(link) + '" style="display:inline-block;background:#2EC4B6;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:600;margin-top:8px">' +
    'Betaal met iDEAL →</a>' +
    '<div style="font-size:9pt;color:#5F6B7A;margin-top:8px">via Mollie · veilig · 1 klik</div>' +
    '</div>';
}

// ─────────────────────────────────────────────
//  MOLLIE WEBHOOK HANDLER
// ─────────────────────────────────────────────
//
// Mollie POST'st bij payment-status-update naar onze doPost-endpoint.
// Body: id=tr_xxx (payment-id), webhookUrl, etc. We moeten verifiëren:
//  1. Request komt echt van Mollie (IP-allowlist + signature via shared secret)
//  2. Payment-id is bekend en active (voorkom replay van oude webhooks)
//  3. Status is final (paid/failed/expired/canceled)
//
// Bij paid → markeer factuur betaald + journaalpost (1200 → 1100).

const MOLLIE_WEBHOOK_SECRET_PROP = 'MOLLIE_WEBHOOK_SECRET';

/**
 * Webhook-handler aanroepbaar vanuit doPost.
 * Verwacht payload: { id: 'tr_xxx', signature: 'hex(hmac-sha256(secret, id))' }
 *
 * @param {Object} payload  parsed JSON body
 * @returns {Object}        { succes, factuurnummer?, status? }
 */
function verwerkMollieWebhook_(payload) {
  if (!payload || !payload.id) {
    return { succes: false, fout: 'Ontbrekende payment-id' };
  }
  const paymentId = String(payload.id);
  if (!/^tr_[a-zA-Z0-9]{8,}$/.test(paymentId)) {
    return { succes: false, fout: 'Ongeldig payment-id format' };
  }

  // Signature-verificatie (eigen shared secret tussen klant + Mollie-config)
  const secret = ontsleutelString_(PropertiesService.getScriptProperties().getProperty(MOLLIE_WEBHOOK_SECRET_PROP) || '');
  if (secret) {
    const sig = String(payload.signature || '');
    const verwacht = (function() {
      const raw = Utilities.computeHmacSha256Signature(paymentId, secret);
      return raw.map(function(b) { return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0'); }).join('');
    })();
    if (!sig || sig !== verwacht) {
      try { schrijfAuditLog_('Mollie webhook sig mismatch', paymentId.slice(0, 12) + '…'); } catch (_) {}
      return { succes: false, fout: 'Ongeldige signature' };
    }
  }

  // Replay-protection per payment-id (cache 24u)
  try {
    const cache = CacheService.getScriptCache();
    const replayKey = 'mollie_webhook_' + paymentId;
    if (cache.get(replayKey)) {
      // Replay → idempotent succes
      return { succes: true, fout: null, dupe: true };
    }
    cache.put(replayKey, '1', 86400);
  } catch (_) {}

  // Haal payment-status op via Mollie API (we vertrouwen NIET op webhook-body
  // voor finale waarheid — altijd verificatie via API-call)
  let apiKey = '';
  try {
    apiKey = ontsleutelString_(PropertiesService.getUserProperties().getProperty(MOLLIE_KEY_PROP) || '');
  } catch (_) {}
  if (!apiKey) return { succes: false, fout: 'Mollie API-key niet geconfigureerd' };

  let status, factuurnummer;
  try {
    const resp = veiligFetch_(MOLLIE_API_BASE + '/payments/' + paymentId, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      return { succes: false, fout: 'Mollie API status ' + resp.getResponseCode() };
    }
    const json = JSON.parse(resp.getContentText());
    status = json.status;
    factuurnummer = (json.metadata && json.metadata.factuurnummer) || '';
  } catch (e) {
    return { succes: false, fout: e.message };
  }

  if (status !== 'paid' || !factuurnummer) {
    try { schrijfAuditLog_('Mollie webhook (geen actie)', paymentId.slice(0, 12) + ' status=' + status); } catch (_) {}
    return { succes: true, status: status };
  }

  // Markeer factuur betaald via bestaande functie (idempotent + LockService)
  try {
    if (typeof markeerVerkoopfactuurBetaald === 'function') {
      const r = markeerVerkoopfactuurBetaald(factuurnummer, new Date().toISOString().slice(0, 10));
      try { schrijfAuditLog_('Mollie webhook → factuur betaald', factuurnummer + ' (' + paymentId.slice(0, 12) + ')'); } catch (_) {}
      return Object.assign({ succes: true, factuurnummer: factuurnummer, status: status }, r);
    }
  } catch (e) {
    return { succes: false, fout: 'Markeer-betaald faalde: ' + e.message };
  }
  return { succes: true, status: status };
}

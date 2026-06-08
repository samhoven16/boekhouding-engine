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
    'Maak een gratis account aan op mollie.com — geen abonnement, alleen kleine kosten per transactie.\n\n' +
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
      safeAuditLog_('Mollie payment-link MISLUKT', factuur.factuurnummer + ' status=' + code);
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    const link = (json._links && json._links.checkout && json._links.checkout.href) || null;
    if (!link) return null;
    safeAuditLog_('Mollie payment-link', factuur.factuurnummer + ' → ' + link.slice(0, 80));
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
      safeAuditLog_('Mollie webhook sig mismatch', paymentId.slice(0, 12) + '…');
      return { succes: false, fout: 'Ongeldige signature' };
    }
  }

  // Replay-protection per payment-id. CRITICAL: cache wordt pas gezet NA
  // succesvolle markeer-betaald (zie einde van functie). Voorheen werd hij
  // hier al gezet — gevolg: als markeer-betaald faalde, blokkeerde de cache
  // Mollie's automatische retry → factuur bleef onbetaald, journaalpost
  // ontbreekt, klant ziet niets. Persistente backup in ScriptProperties
  // overleeft script-restarts (cache wist dan).
  if (isMollieReedsVerwerkt_(paymentId)) {
    return { succes: true, fout: null, dupe: true };
  }

  // Haal payment-status op via Mollie API (we vertrouwen NIET op webhook-body
  // voor finale waarheid — altijd verificatie via API-call)
  let apiKey = '';
  try {
    apiKey = ontsleutelString_(PropertiesService.getUserProperties().getProperty(MOLLIE_KEY_PROP) || '');
  } catch (_) {}
  if (!apiKey) return { succes: false, fout: 'Mollie API-key niet geconfigureerd' };

  let status, factuurnummer, paymentBedrag, paymentBron;
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
    paymentBedrag = json.amount ? parseFloat(json.amount.value) : NaN;
    paymentBron = (json.metadata && json.metadata.bron) || '';
  } catch (e) {
    return { succes: false, fout: e.message };
  }

  if (status !== 'paid' || !factuurnummer) {
    // Statuses zoals 'open', 'pending', 'canceled', 'expired' verdienen géén
    // idempotency-marker — Mollie kan later wél met 'paid' terugkomen.
    safeAuditLog_('Mollie webhook (geen actie)', paymentId.slice(0, 12) + ' status=' + status);
    return { succes: true, status: status };
  }

  // P0-2 (criticus-rapport Security): verifieer dat de payment-metadata
  // overeenkomt met DEZE administratie. Voorheen werd factuurnummer uit
  // metadata blind aan markeerVerkoopfactuurBetaald gegeven; als een
  // payment uit een ander Boekhoudbaar-account ooit per ongeluk dezelfde
  // factuurnummer in metadata had, kon dat een vreemde betaling laten
  // landen. Nu drie harde checks:
  //   1. Metadata.bron === 'boekhoudbaar' (wij hebben hem aangemaakt)
  //   2. Factuurnummer bestaat in VERKOOPFACTUREN
  //   3. Payment-bedrag === open factuurbedrag (tot €0,02 afronding)
  if (paymentBron && paymentBron !== 'boekhoudbaar') {
    safeAuditLog_('Mollie webhook geweigerd (bron mismatch)',
      paymentId.slice(0, 12) + ' bron=' + paymentBron + ' factuur=' + factuurnummer);
    return { succes: false, fout: 'Payment-bron is niet boekhoudbaar' };
  }
  try {
    if (typeof getSpreadsheet_ === 'function') {
      const _ss = getSpreadsheet_();
      const _vf = _ss && _ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
      if (_vf) {
        const _data = _vf.getDataRange().getValues();
        let _factBedrag = null;
        for (let i = 1; i < _data.length; i++) {
          if (String(_data[i][0]) === String(factuurnummer)) {
            _factBedrag = parseFloat(_data[i][6]) || parseFloat(_data[i][5]) || null;
            break;
          }
        }
        if (_factBedrag === null) {
          safeAuditLog_('Mollie webhook geweigerd (factuur onbekend)',
            paymentId.slice(0, 12) + ' factuur=' + factuurnummer);
          return { succes: false, fout: 'Factuurnummer niet gevonden in administratie' };
        }
        if (isFinite(paymentBedrag) && Math.abs(paymentBedrag - _factBedrag) > 0.02) {
          safeAuditLog_('Mollie webhook geweigerd (bedrag mismatch)',
            paymentId.slice(0, 12) + ' factuur=' + factuurnummer +
            ' verwacht=' + _factBedrag + ' ontvangen=' + paymentBedrag);
          return { succes: false, fout: 'Bedrag mismatch (verwacht €' + _factBedrag + ', ontvangen €' + paymentBedrag + ')' };
        }
      }
    }
  } catch (_verifyErr) {
    // Verificatie best-effort: bij interne fout (sheet niet leesbaar) loggen
    // we maar laten we doorgaan zodat een crash niet alle betalingen
    // blokkeert. De bedrag-check is de échte gate.
    Logger.log('Mollie webhook metadata-verify fout: ' + _verifyErr.message);
  }

  // Markeer factuur betaald via bestaande functie (idempotent + LockService +
  // rollback bij journaalpost-fout). Pas NA succes idempotency-marker zetten
  // — anders blokkeren we Mollie's automatische retry van een mislukte run.
  try {
    if (typeof markeerVerkoopfactuurBetaald === 'function') {
      const r = markeerVerkoopfactuurBetaald(factuurnummer, new Date().toISOString().slice(0, 10));
      markeerMollieVerwerkt_(paymentId);
      safeAuditLog_('Mollie webhook → factuur betaald', factuurnummer + ' (' + paymentId.slice(0, 12) + ')');
      return Object.assign({ succes: true, factuurnummer: factuurnummer, status: status }, r);
    }
  } catch (e) {
    // GEEN idempotency-marker → volgende Mollie-retry probeert opnieuw.
    return { succes: false, fout: 'Markeer-betaald faalde: ' + e.message };
  }
  markeerMollieVerwerkt_(paymentId);
  return { succes: true, status: status };
}

/**
 * Idempotency-check: is deze Mollie payment al verwerkt?
 *
 * Twee lagen:
 *   1. CacheService — snelle hit, ~6h horizon (Apps Script kan eerder wissen)
 *   2. ScriptProperties — persistente backup; overleeft script-restart
 *
 * Cache-miss + Properties-hit: cache wordt opnieuw gewarmd zodat volgende
 * checks weer via de snelle laag gaan.
 *
 * @param {string} paymentId  Mollie payment-id (tr_xxx)
 * @returns {boolean} true als al verwerkt (binnen retention-window)
 */
function isMollieReedsVerwerkt_(paymentId) {
  if (!paymentId) return false;
  const cacheKey = 'mollie_webhook_' + paymentId;
  const propKey  = 'mollie_completed_' + paymentId;
  try {
    if (CacheService.getScriptCache().get(cacheKey)) return true;
  } catch (_) {}
  try {
    if (PropertiesService.getScriptProperties().getProperty(propKey)) {
      try { CacheService.getScriptCache().put(cacheKey, '1', 21600); } catch (_) {}
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Markeer Mollie payment-id als afgerond. Tweeledig:
 *   1. Cache — 6h horizon voor snelle dedup binnen Mollie's retry-window
 *   2. ScriptProperties — persistent met timestamp; later opruimbaar via
 *      ruimMollieIdempotencyOp_ (zie onder)
 *
 * Best-effort: failures hier mogen de webhook-flow niet breken. Worst case
 * is een dubbele markeer-betaald-poging, maar die is op zijn beurt
 * idempotent (zie markeerVerkoopfactuurBetaald in Verkoopfacturen.gs).
 *
 * @param {string} paymentId  Mollie payment-id (tr_xxx)
 */
function markeerMollieVerwerkt_(paymentId) {
  if (!paymentId) return;
  try {
    CacheService.getScriptCache().put('mollie_webhook_' + paymentId, '1', 21600);
  } catch (_) {}
  try {
    PropertiesService.getScriptProperties().setProperty(
      'mollie_completed_' + paymentId,
      new Date().toISOString()
    );
  } catch (_) {}
}

/**
 * Opruimen van oude Mollie-idempotency-markers in ScriptProperties.
 *
 * Aangeroepen vanuit dagelijkseTaken. ScriptProperties heeft een 500KB-quota;
 * bij ~80 bytes per entry kunnen we ~5000 actieve markers houden. We bewaren
 * 90 dagen — ruim boven Mollie's retry-window (max enkele dagen) maar genoeg
 * voor forensische tracing bij disputen.
 *
 * @returns {{verwijderd: number}}
 */
function ruimMollieIdempotencyOp_() {
  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let verwijderd = 0;
  Object.keys(all).forEach(function(k) {
    if (k.indexOf('mollie_completed_') !== 0) return;
    const ts = Date.parse(all[k] || '');
    if (!isFinite(ts) || ts < cutoffMs) {
      try { props.deleteProperty(k); verwijderd++; } catch (_) {}
    }
  });
  return { verwijderd: verwijderd };
}

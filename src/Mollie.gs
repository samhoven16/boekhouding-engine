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

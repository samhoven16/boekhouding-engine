/**
 * Boekhoudbaar — Licentieverificatieserver
 *
 * Publiceer dit script als aparte Web App (eigen Google-account):
 *   Implementeren → Nieuwe implementatie → Web-app
 *   Uitvoeren als: Ik zelf  |  Toegang: Iedereen (anoniem)
 *
 * Vereiste Script Properties (Projectinstellingen → Script Properties):
 *   LICENTIE_SHEET_ID   — ID van de licentie-spreadsheet (zie setupLicentieSheet())
 *   MOLLIE_API_KEY      — test_xxx of live_xxx (dashboard.mollie.com)
 *   ADMIN_WACHTWOORD    — wachtwoord voor het beheerpaneel
 *   INSTALLER_URL       — URL van de installatie-webapp (Installer.gs doGet)
 *   PRODUCT_NAAM        — standaard "Boekhoudbaar"
 *   PRODUCT_PRIJS       — bijv. "49.00"  (incl. BTW, in EUR — géén centen)
 *
 * Vul na publicatie de Web App URL in als LICENTIE_SERVER_URL in de
 * boekhouding-spreadsheet (tabblad Instellingen).
 */

// ─────────────────────────────────────────────
//  ROUTING
// ─────────────────────────────────────────────
function doGet(e) {
  // Auto-initialize licence sheet on first request
  if (!PropertiesService.getScriptProperties().getProperty('LICENTIE_SHEET_ID')) {
    try { setupLicentieSheet(); } catch (err) { Logger.log('Auto-setup fout: ' + err.message); }
  }

  // Zelfherstellende config — corrigeert historische fouten (prijs in centen,
  // oude productnaam). Idempotent: runt elke request maar schrijft alleen
  // wanneer de waarde écht gecorrigeerd moet worden.
  try { zelfHerstelProductConfig_(); } catch (err) { Logger.log('Self-heal fout: ' + err.message); }

  const actie = (e && e.parameter && e.parameter.actie) || '';

  if (actie === 'health')        return healthEndpoint_();
  if (actie === 'valideer')      return valideerEndpoint_(e);
  if (actie === 'aanvraag-otp')  return rateLimit_(e, { actie: 'aanvraag-otp', perEmail: 5,  globaal: 500, windowMin: 60 }) || aanvraagOtpEndpoint_(e);
  if (actie === 'activeer-otp')  return rateLimit_(e, { actie: 'activeer-otp', perEmail: 12, globaal: 500, windowMin: 60 }) || activeerOtpEndpoint_(e);
  if (actie === 'herstuur-licentie') return rateLimit_(e, { actie: 'herstuur-licentie', perEmail: 3, globaal: 200, windowMin: 60 }) || herstuurLicentieEndpoint_(e);
  if (actie === 'onboarded')     return rateLimit_(e, { actie: 'onboarded', globaal: 500, windowMin: 60 }) || onboardedEndpoint_(e);
  if (actie === 'config')        return configEndpoint_(e);
  if (actie === 'telemetry')     return telemetryEndpoint_(e);
  if (actie === 'bedankt')       return bedanktPagina_(e);
  // CYCLE-41: rate-limit admin-login om brute-force op ADMIN_WACHTWOORD
  // te voorkomen. Voorheen kon attacker onbeperkt wachtwoorden proberen
  // (veiligVergelijk_ stopt timing-attack maar niet rate-attack).
  // 20 pogingen/uur globaal — voldoende voor legitieme typo's, voorkomt
  // brute-force scanning.
  if (actie === 'admin')         return rateLimit_(e, { actie: 'admin-login', globaal: 20, windowMin: 60 }) || adminPaneel_(e);
  if (actie === 'roteer')        return rateLimit_(e, { actie: 'roteer', perEmail: 3, globaal: 100, windowMin: 60 }) || roteerEndpoint_(e);
  if (actie === 'revoke')        return revokeEndpoint_(e);

  // Standaard: betaalpagina tonen
  return betaalPagina_(e);
}


function doPost(e) {
  // Router: Mollie stuurt form-urlencoded met `id=tr_…`. Brevo stuurt JSON met
  // `event` veld. We dispatchen op basis van wat er binnenkomt.
  const isBrevo = e && e.postData && e.postData.type &&
    /json/i.test(e.postData.type) && /"event"/.test(e.postData.contents || '');

  try {
    if (isBrevo) {
      verwerkBrevoBounce_(e);
    } else {
      verwerkMollieWebhook_(e);
    }
    return ContentService.createTextOutput('OK');
  } catch (err) {
    Logger.log('Webhook fout: ' + err.message + '\n' + (err.stack || ''));
    // Re-throw zodat Apps Script HTTP 500 retourneert. Mollie retried
    // (max 10x over 26 uur); Brevo retried tot 24u. Een returned ContentService
    // output zou 200 teruggeven en de retry-flow uitschakelen.
    throw err;
  }
}

// ─────────────────────────────────────────────
//  HEALTH-ENDPOINT
// ─────────────────────────────────────────────
function healthEndpoint_() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('LICENTIE_SHEET_ID');
  let licenseCount = 0;
  try {
    if (sheetId) {
      const ss = SpreadsheetApp.openById(sheetId);
      const sheet = ss.getSheetByName('Licenties');
      licenseCount = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    }
  } catch (_) {}
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    ts: new Date().toISOString(),
    version: '1.0.3',
    licenses: licenseCount,
    mollie: !!props.getProperty('MOLLIE_API_KEY'),
    templateReady: !!props.getProperty('TEMPLATE_SS_ID'),
    brevo: !!props.getProperty('BREVO_API_KEY'),
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Constant-time string comparison.
 *
 * Voorkomt timing-attacks waarbij een attacker byte-voor-byte de code
 * kan achterhalen door microseconde-verschillen te meten tussen een match
 * op byte 1 vs match op byte 1+2 etc.
 *
 * Werkt zonder crypto-module (Apps Script heeft beperkte primitives):
 * XOR elke byte, OR alle resultaten, eindcontrole = 0.
 *
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function veiligVergelijk_(a, b) {
  const s1 = String(a == null ? '' : a);
  const s2 = String(b == null ? '' : b);
  if (s1.length !== s2.length) return false;
  let mismatch = 0;
  for (let i = 0; i < s1.length; i++) {
    mismatch |= (s1.charCodeAt(i) ^ s2.charCodeAt(i));
  }
  return mismatch === 0;
}

/**
 * Zelfherstellende configuratie-laag.
 *
 * Repareert drie historische fouten die in live ScriptProperties kunnen staan:
 *   1. PRODUCT_PRIJS in centen (bv. "4900" → "49.00")
 *   2. PRODUCT_NAAM = "Boekhouding Engine" → "Boekhoudbaar"
 *   3. PRODUCT_PRIJS afwezig → default "49.00"
 *
 * Idempotent: draait op elke doGet maar schrijft alleen bij daadwerkelijke correctie.
 * Schrijft een audit-entry zodat we de correctie kunnen terugvinden.
 */
function zelfHerstelProductConfig_() {
  const props = PropertiesService.getScriptProperties();

  // 1. Prijs — als waarde parseet als geheel getal >= 100, is het waarschijnlijk
  //    in centen opgeslagen door een oude deploy. Converteer naar euro's.
  const huidigePrijs = props.getProperty('PRODUCT_PRIJS');
  if (!huidigePrijs) {
    props.setProperty('PRODUCT_PRIJS', '49.00');
  } else {
    const n = parseFloat(huidigePrijs);
    // Heuristiek: alleen corrigeren bij gehele waarden >= 100 ZONDER komma/punt.
    // "49.00" blijft ongemoeid, "4900" wordt "49.00".
    if (Number.isFinite(n) && n >= 100 && !/[.,]/.test(String(huidigePrijs).trim())) {
      const gecorrigeerd = (n / 100).toFixed(2);
      props.setProperty('PRODUCT_PRIJS', gecorrigeerd);
      Logger.log('PRODUCT_PRIJS zelfhersteld: ' + huidigePrijs + ' → ' + gecorrigeerd);
    }
  }

  // 2. Productnaam — corrigeer "Boekhouding Engine" → "Boekhoudbaar"
  const huidigeNaam = props.getProperty('PRODUCT_NAAM');
  if (!huidigeNaam || /boekhouding\s*engine/i.test(huidigeNaam)) {
    props.setProperty('PRODUCT_NAAM', 'Boekhoudbaar');
    if (huidigeNaam) Logger.log('PRODUCT_NAAM zelfhersteld: ' + huidigeNaam + ' → Boekhoudbaar');
  }
}

function betaalPagina_(e) {
  const props   = PropertiesService.getScriptProperties();
  const naam    = props.getProperty('PRODUCT_NAAM')  || 'Boekhoudbaar';
  const prijsRw = props.getProperty('PRODUCT_PRIJS') || '49.00';
  // Affiliate-code uit ?ref=<code> — alleen alfanumeriek/underscore/dash,
  // max 32 tekens. Wordt doorgegeven aan Mollie als metadata zodat we
  // bij webhook-verwerking de verwijzer kunnen vastleggen.
  const refRaw = (e && e.parameter && e.parameter.ref) || '';
  const refCode = String(refRaw).replace(/[^A-Za-z0-9_-]/g, '').substring(0, 32);
  // Dubbele fallback: zelfs als zelfHerstelProductConfig_ niet heeft gedraaid,
  // corrigeer alsnog in de render-laag zodat de pagina nooit €4900 toont.
  const prijsNum = (parseFloat(prijsRw) >= 100 && !/[.,]/.test(String(prijsRw).trim()))
    ? parseFloat(prijsRw) / 100
    : parseFloat(prijsRw) || 49;
  // Nederlandse weergave: komma ipv punt, geen trailing .00 bij ronde bedragen
  const prijs = (prijsNum % 1 === 0)
    ? prijsNum.toString()
    : prijsNum.toFixed(2).replace('.', ',');

  const html = `<!DOCTYPE html><html lang="nl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0D1B4E">
<title>${naam} — Aankoop</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    background:#F7F9FC;min-height:100vh;color:#1A1A1A;
    display:flex;align-items:center;justify-content:center;padding:24px;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  }
  .card{
    background:#fff;border:1px solid #E5EAF2;border-radius:16px;
    padding:36px 32px;max-width:460px;width:100%;
    box-shadow:0 20px 60px rgba(13,27,78,.08),0 2px 8px rgba(13,27,78,.04);
  }
  .brand{font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#2EC4B6;margin-bottom:6px}
  h1{color:#0D1B4E;font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:12px}
  .prijs{font-size:44px;font-weight:800;color:#0D1B4E;letter-spacing:-0.02em;line-height:1;margin:8px 0 4px}
  .prijs sup{font-size:22px;font-weight:700;color:#0D1B4E;vertical-align:super;margin-right:4px}
  .sub{color:#5F6B7A;font-size:13px;margin-bottom:22px}
  .voordelen{list-style:none;margin:0 0 24px;padding:0}
  .voordelen li{display:flex;align-items:flex-start;gap:10px;padding:7px 0;font-size:14px;color:#1A1A1A;line-height:1.5}
  .voordelen .v{width:18px;height:18px;border-radius:50%;background:rgba(46,196,182,.14);color:#2EC4B6;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
  label.veld{display:block;font-weight:600;font-size:13px;margin:0 0 6px;color:#1A1A1A}
  input[type=text],input[type=email]{
    width:100%;padding:12px 14px;border:1px solid #E5EAF2;border-radius:8px;
    font-size:14px;font-family:inherit;margin-bottom:14px;background:#fff;
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  input[type=text]:focus,input[type=email]:focus{
    outline:none;border-color:#2EC4B6;box-shadow:0 0 0 3px rgba(46,196,182,.18);
  }
  .herroepingsrecht{
    background:#F7F9FC;border:1px solid #E5EAF2;border-radius:8px;
    padding:14px 16px;margin:4px 0 16px;font-size:12px;color:#5F6B7A;line-height:1.6;
  }
  .herroepingsrecht label{display:flex;gap:10px;align-items:flex-start;font-weight:normal;margin-bottom:8px;cursor:pointer}
  .herroepingsrecht label:last-child{margin-bottom:0}
  .herroepingsrecht input[type=checkbox]{width:18px;height:18px;margin-top:1px;flex-shrink:0;accent-color:#2EC4B6;cursor:pointer}
  .btn{
    width:100%;padding:15px 18px;background:#0D1B4E;color:#fff;border:none;
    border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;
    font-family:inherit;letter-spacing:.1px;
    transition:background .15s ease,transform .15s ease,box-shadow .2s ease;
  }
  .btn:hover:not(:disabled){background:#1A2A6B;transform:translateY(-1px);box-shadow:0 6px 20px rgba(13,27,78,.22)}
  .btn:disabled{background:#94A3B8;cursor:not-allowed}
  .fout{
    background:#FDECEC;color:#B91C1C;padding:10px 14px;border-radius:6px;
    font-size:13px;margin-top:12px;display:none;border:1px solid #F5B3B3;
    animation:slideDown .25s ease;
  }
  @keyframes slideDown{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
  .prijs{animation:scaleIn .6s cubic-bezier(.34,1.56,.64,1)}
  @keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
  @media(max-width:480px){
    .card{padding:24px 18px}
    h1{font-size:19px}
    .prijs{font-size:36px}
    .voordelen li{font-size:13px}
    .btn{font-size:14px;padding:14px 16px}
  }
  .hint{font-size:12px;color:#5F6B7A;text-align:center;margin-top:14px;line-height:1.5}
  .hint strong{color:#1A1A1A;font-weight:600}
  .preframe{
    background:#FFF8E1;border:1px solid #FFECB3;border-radius:8px;
    padding:12px 14px;margin-top:14px;font-size:12px;color:#5A3F00;line-height:1.5;
  }
  ::selection{background:rgba(46,196,182,.28);color:#0D1B4E}
</style></head><body>
<div class="card">
  <div class="brand">${naam}</div>
  <h1>Eenmalig — geen abonnement</h1>
  <div class="prijs"><sup>€</sup>${prijs}</div>
  <div class="sub">Licentiesleutel direct per e-mail. Altijd van jou.</div>

  <ul class="voordelen">
    <li><span class="v">✓</span>Volledige ZZP-boekhouding in Google Spreadsheets</li>
    <li><span class="v">✓</span>PDF-facturen aanmaken &amp; rechtstreeks mailen</li>
    <li><span class="v">✓</span>BTW-aangifte automatisch berekend per kwartaal</li>
    <li><span class="v">✓</span>Aftrekposten automatisch gesignaleerd</li>
    <li><span class="v">✓</span>Data blijft op jóuw Google Drive — wij kunnen er niet bij</li>
  </ul>

  <label class="veld" for="naam">Jouw naam</label>
  <input type="text" id="naam" placeholder="Jan Jansen" autocomplete="name">

  <label class="veld" for="email">E-mailadres</label>
  <input type="email" id="email" placeholder="jan@uwbedrijf.nl" autocomplete="email">

  <div class="herroepingsrecht">
    <label>
      <input type="checkbox" id="cb1">
      <span>Ik verzoek uitdrukkelijk om directe levering van de digitale inhoud vóór het einde van de herroepingstermijn.</span>
    </label>
    <label>
      <input type="checkbox" id="cb2">
      <span>Ik begrijp dat ik hiermee mijn herroepingsrecht verlies zodra de levering is gestart.</span>
    </label>
  </div>

  <input type="hidden" id="ref" value="${escHtml_(refCode)}">
  <button class="btn" id="btn" onclick="betaal()">Bestelling met betalingsverplichting · €${prijs}</button>
  <div class="fout" id="fout"></div>

  <div class="hint"><strong>Betaling via Mollie</strong> — iDEAL, creditcard of Bancontact. Factuur volgt per e-mail.</div>

  <div class="preframe"><strong>Wat na je betaling gebeurt:</strong> je krijgt binnen een minuut een e-mail met een link. Google vraagt dan toestemming om jouw boekhoudbestand in jóuw Drive te zetten — dat is precies de bedoeling. Je data blijft 100% van jou.</div>
</div>
<script>
function betaal() {
  var naam  = document.getElementById('naam').value.trim();
  var email = document.getElementById('email').value.trim();
  if (!naam)  { toonFout('Vul je naam in.'); return; }
  if (!email || !email.includes('@')) { toonFout('Vul een geldig e-mailadres in.'); return; }
  if (!document.getElementById('cb1').checked) { toonFout('Vink het eerste vakje aan om door te gaan.'); return; }
  if (!document.getElementById('cb2').checked) { toonFout('Vink het tweede vakje aan om door te gaan.'); return; }
  var btn = document.getElementById('btn');
  var oriBtnTxt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Betaling aanmaken…';
  document.getElementById('fout').style.display = 'none';
  google.script.run
    .withSuccessHandler(function(res) {
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; }
      else { toonFout(res.fout || 'Betaling aanmaken mislukt.'); btn.disabled=false; btn.textContent=oriBtnTxt; }
    })
    .withFailureHandler(function(e) { toonFout('Fout: '+e.message); btn.disabled=false; btn.textContent=oriBtnTxt; })
    .maakBetaling(naam, email, (document.getElementById('ref')||{}).value||'');
}
function toonFout(t){var e=document.getElementById('fout');e.textContent=t;e.style.display='block';}
</script></body></html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle(naam + ' — Aankoop')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ─────────────────────────────────────────────
//  BETAALPAGINA: BETALING AANMAKEN (Mollie)
// ─────────────────────────────────────────────
function maakBetaling(klantnaam, klantEmail, refCode) {
  klantnaam  = String(klantnaam  || '').trim();
  klantEmail = String(klantEmail || '').trim().toLowerCase();
  // Sanitiseer ref opnieuw server-side: client kan alles sturen.
  const ref = String(refCode || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 32);
  if (!klantnaam || !klantEmail) return { fout: 'Naam en e-mail zijn verplicht.' };
  // CYCLE-8 FIX: max-length defense (RFC 5321 email = 254 chars; klantnaam
  // > 200 chars wijst op script-attack of accidental paste). Voorheen geen
  // bovengrens → grote payloads konden GAS-quota verbruiken of Mollie
  // afkappen op onbekende manier.
  if (klantnaam.length > 200) {
    return { fout: 'Naam is te lang (max 200 tekens). Gebruik je gewone bedrijfs- of persoonsnaam.' };
  }
  if (klantEmail.length > 254) {
    return { fout: 'E-mailadres is te lang. Controleer of je geen typefout hebt gemaakt.' };
  }
  // Format-check zodat de licentie-mail later (na betaling) niet crasht.
  // Voor klant beter om vroeg te falen dan na betaling.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(klantEmail)) {
    return { fout: 'Vul een geldig e-mailadres in (bijv. naam@voorbeeld.nl).' };
  }

  // CYCLE-8 FIX: idempotency tegen dubbel-klik. Als zelfde email net (binnen
  // 5 min) een checkout-URL kreeg, geef die TERUG ipv nieuwe Mollie-call.
  // Voorheen: klant die 2x op "Betalen" klikt = 2 separate Mollie-payments
  // aangemaakt → kans op 2x €49 afrekenen als ze beide doorlopen.
  const cache = CacheService.getScriptCache();
  const idemKey = 'maakBetaling_' + Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, klantEmail
  ).map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); })
   .join('').slice(0, 16);
  const eerderUrl = cache.get(idemKey);
  if (eerderUrl) {
    Logger.log('maakBetaling idempotent retour van checkout-URL voor ' + klantEmail.slice(0, 3) + '***');
    return { checkoutUrl: eerderUrl };
  }

  // CYCLE-8 FIX: rate-limit per email (max 5 betalingen/uur). Voorkomt dat
  // attacker met geldig email-formaat de Mollie-API spamt en daarmee onze
  // quota uitput / Mollie ons blokkeert.
  const rateLimitKey = 'rate_maakBetaling_' + idemKey;
  const huidig = parseInt(cache.get(rateLimitKey) || '0', 10);
  if (huidig >= 5) {
    return { fout: 'Te veel betalingspogingen voor dit e-mailadres. Wacht een uur of neem contact op via hallo@boekhoudbaar.nl.' };
  }
  cache.put(rateLimitKey, String(huidig + 1), 3600);  // 1 uur

  const props     = PropertiesService.getScriptProperties();
  const mollieKey = props.getProperty('MOLLIE_API_KEY');
  const prijsRw   = props.getProperty('PRODUCT_PRIJS') || '49.00';
  const productnm = props.getProperty('PRODUCT_NAAM')  || 'Boekhoudbaar';
  const webAppUrl = ScriptApp.getService().getUrl();
  // Dubbele fallback — zelfs als self-heal niet draaide, reken geen €4900 af.
  const prijs = (parseFloat(prijsRw) >= 100 && !/[.,]/.test(String(prijsRw).trim()))
    ? (parseFloat(prijsRw) / 100).toFixed(2)
    : prijsRw;

  if (!mollieKey) return { fout: 'Betalingsprovider niet geconfigureerd. Neem contact op.' };

  try {
    const resp = UrlFetchApp.fetch('https://api.mollie.com/v2/payments', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + mollieKey },
      payload: JSON.stringify({
        amount:      { value: parseFloat(prijs).toFixed(2), currency: 'EUR' },
        description: productnm + ' — ' + klantnaam,
        redirectUrl: webAppUrl + '?actie=bedankt',
        webhookUrl:  webAppUrl,
        metadata:    ref
          ? { naam: klantnaam, email: klantEmail, ref: ref }
          : { naam: klantnaam, email: klantEmail },
        method:      ['ideal', 'creditcard', 'bancontact'],
      }),
      muteHttpExceptions: true,
    });

    let data;
    try { data = JSON.parse(resp.getContentText()); }
    catch (parseErr) {
      Logger.log('Mollie non-JSON response: ' + resp.getContentText().slice(0, 500));
      return { fout: 'Betalingsprovider gaf onverwachte respons. Probeer opnieuw of neem contact op.' };
    }

    if (data.status >= 400 || !data._links || !data._links.checkout || !data._links.checkout.href) {
      Logger.log('Mollie fout/onvolledige response: ' + resp.getContentText().slice(0, 500));
      return { fout: 'Betaling aanmaken mislukt. Probeer opnieuw.' };
    }
    // CYCLE-8 FIX: cache de checkout-URL voor idempotency bij dubbel-klik.
    // 5 min TTL — lang genoeg dat klant op "Betalen" kan klikken zonder
    // dubbel-charge-risico, kort genoeg dat een echte 2e betaling (later)
    // wel doorgaat.
    try { cache.put(idemKey, data._links.checkout.href, 300); } catch (_) {}
    return { checkoutUrl: data._links.checkout.href };
  } catch (err) {
    Logger.log('maakBetaling fout: ' + err.message);
    return { fout: 'Netwerkfout bij betaling aanmaken. Probeer over een minuut opnieuw.' };
  }
}

// ─────────────────────────────────────────────
//  MOLLIE WEBHOOK — betaling verwerken
// ─────────────────────────────────────────────
function verwerkMollieWebhook_(e) {
  const paymentId = e && e.parameter && e.parameter.id;
  if (!paymentId) return;

  const props     = PropertiesService.getScriptProperties();
  const mollieKey = props.getProperty('MOLLIE_API_KEY');
  if (!mollieKey) throw new Error('MOLLIE_API_KEY niet ingesteld');

  // Snelle idempotency-check via CacheService (6 uur TTL)
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'mollie_paid_' + paymentId;
  if (cache.get(cacheKey) === 'done') return;

  // Exclusieve lock — voorkomt race-condition bij gelijktijdige webhooks
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Lock timeout voor ' + paymentId);

  try {
    // Haal status op bij Mollie (webhook bevat alleen id, geen status)
    const resp = UrlFetchApp.fetch('https://api.mollie.com/v2/payments/' + paymentId, {
      headers: { Authorization: 'Bearer ' + mollieKey },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw new Error('Mollie API ' + resp.getResponseCode());
    const betaling = JSON.parse(resp.getContentText());

    if (betaling.status !== 'paid') return; // Openstaand of geannuleerd — geen actie

    // Dubbele check in sheet (CacheService kan verlopen zijn na GAS-restart)
    const sheet = getLicentieSheet_();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][8]) === paymentId) {
        cache.put(cacheKey, 'done', 21600);
        return; // Al verwerkt
      }
    }

    // Genereer en sla licentiesleutel op.
    // Defense-in-depth: strip HTML-actieve tekens al voor opslag.
    // Output-escaping blijft verplicht, maar zo zit vervuilde data
    // niet in de CRM.
    const meta    = betaling.metadata || {};
    const naam    = saneerNaam_(String(meta.naam  || 'Klant'));
    const email   = String(meta.email || '').trim().toLowerCase();
    const ref     = String(meta.ref   || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 32);
    const sleutel = genereerSleutel_();

    // Zorg dat de extra kolommen (Verwijzer, Bouncestatus, Bouncereden) bestaan
    // voordat we de rij appenden. Idempotent.
    borgExtraKolommen_(sheet);

    sheet.appendRow([
      sleutel, naam, email, 'Standaard', 'Actief', '',
      '', new Date(), paymentId, new Date(),
      '',           // Onboarded op
      ref,          // Verwijzer (kolom 12, 0-based 11)
      '',           // Bouncestatus
      '',           // Bouncereden
    ]);

    // Sla op in cache zodat retries direct stoppen
    cache.put(cacheKey, 'done', 21600);

    // Stuur licentiecode per e-mail
    if (email) stuurLicentiemail_(naam, email, sleutel);

    // Defense-in-depth: log alleen eerste 8 tekens van sleutel zodat
    // een gelekte log niet direct de volledige code onthult.
    Logger.log('Licentie aangemaakt: ' + sleutel.substring(0, 8) + '… voor ' + email);

  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
//  OTP — STAP 1: CODE AANVRAGEN
// ─────────────────────────────────────────────
function aanvraagOtpEndpoint_(e) {
  const email = String((e.parameter.email || '')).trim().toLowerCase();
  if (!email.includes('@')) return jsonResp_({ ok: false, fout: 'Ongeldig e-mailadres.' });

  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  let gevonden = false;
  for (let i = 1; i < data.length; i++) {
    // CYCLE-29: startsWith('actief') ipv === 'actief' voor consistentie met
    // onboardedEndpoint_/herstuurLicentieEndpoint_/admin-counters. Anders
    // krijgen klanten met manueel-gezette varianten ('Actief (handmatig)',
    // 'Actief — trial', 'Actief — vervolg') silent 'geen actieve licentie'.
    if (String(data[i][2]).toLowerCase() === email &&
        String(data[i][4] || '').toLowerCase().startsWith('actief')) { gevonden = true; break; }
  }
  if (!gevonden) {
    return jsonResp_({ ok: false, fout: 'Dit e-mailadres is niet bekend als klant. Controleer het e-mailadres waarmee je hebt gekocht.' });
  }

  // Rate limit: max 1 aanvraag per 60 seconden
  const props  = PropertiesService.getScriptProperties();
  const lastTs = parseInt(props.getProperty('otp_ts_' + email) || '0');
  if (Date.now() - lastTs < 60000) {
    return jsonResp_({ ok: false, fout: 'Even wachten — je kunt eens per minuut een code aanvragen.' });
  }

  // Crypto-secure 6-digit OTP via UUID-bytes (Math.random is voorspelbaar)
  const uuidHex = Utilities.getUuid().replace(/-/g, '');
  const otpInt = parseInt(uuidHex.substring(0, 8), 16) % 1000000;
  const otp = String(otpInt).padStart(6, '0');
  props.setProperty('otp_' + email, JSON.stringify({ code: otp, expiry: Date.now() + 15 * 60 * 1000 }));
  props.setProperty('otp_ts_' + email, String(Date.now()));
  stuurOtpMail_(email, otp);
  return jsonResp_({ ok: true });
}

// ─────────────────────────────────────────────
//  OTP — STAP 2: ACTIVEREN MET CODE
// ─────────────────────────────────────────────
function activeerOtpEndpoint_(e) {
  const email = String((e.parameter.email || '')).trim().toLowerCase();
  const otp   = String((e.parameter.otp   || '')).trim();
  const ssId  = String((e.parameter.ssId  || '')).trim();

  if (!email || !otp) return jsonResp_({ ok: false, fout: 'E-mail en code zijn verplicht.' });

  const props  = PropertiesService.getScriptProperties();
  const otpRaw = props.getProperty('otp_' + email);
  if (!otpRaw) return jsonResp_({ ok: false, fout: 'Geen code aangevraagd of al gebruikt. Vraag opnieuw een code aan.' });

  let otpObj;
  try { otpObj = JSON.parse(otpRaw); } catch (_) { return jsonResp_({ ok: false, fout: 'Ongeldige code.' }); }

  if (Date.now() > otpObj.expiry) {
    props.deleteProperty('otp_' + email);
    props.deleteProperty('otp_pogingen_' + email);
    return jsonResp_({ ok: false, fout: 'Code verlopen (geldig 15 min). Vraag een nieuwe code aan.' });
  }

  // Brute-force bescherming — na 5 foute pogingen, OTP ongeldig verklaren
  // (attacker moet opnieuw rate-limited aanvraag doen = max 1/min)
  const pogingenKey = 'otp_pogingen_' + email;
  const pogingen = parseInt(props.getProperty(pogingenKey) || '0');
  if (pogingen >= 5) {
    props.deleteProperty('otp_' + email);
    props.deleteProperty(pogingenKey);
    return jsonResp_({ ok: false, fout: 'Te veel foute pogingen. Vraag een nieuwe code aan.' });
  }

  // Constant-time vergelijk voorkomt timing-attack (leak van code byte-voor-byte)
  if (!veiligVergelijk_(otpObj.code, otp)) {
    props.setProperty(pogingenKey, String(pogingen + 1));
    const resterend = 5 - (pogingen + 1);
    return jsonResp_({
      ok: false,
      fout: 'Onjuiste code. ' + (resterend > 0 ? 'Nog ' + resterend + ' poging(en).' : 'Vraag een nieuwe code aan.'),
    });
  }

  // Eenmalig gebruik — code + poging-teller direct verwijderen
  props.deleteProperty('otp_' + email);
  props.deleteProperty('otp_ts_' + email);
  props.deleteProperty(pogingenKey);

  // Zoek actieve licentie voor dit e-mailadres
  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() !== email) continue;
    // CYCLE-29: zie aanvraagOtpEndpoint_ — startsWith('actief') voor
    // consistentie met varianten als 'Actief (handmatig)' etc.
    if (!String(data[i][4] || '').toLowerCase().startsWith('actief')) continue;

    const sleutel    = String(data[i][0]);
    const naam       = String(data[i][1]);
    const huidigSsId = String(data[i][6] || '');

    if (ssId) {
      if (!huidigSsId) {
        sheet.getRange(i + 1, 7).setValue(ssId); // Eerste activatie — bind spreadsheet-ID
      } else if (huidigSsId !== ssId) {
        return jsonResp_({ ok: false, fout: 'Licentie is al actief op een andere spreadsheet. Neem contact op via support@boekhoudbaar.nl' });
      }
    }
    sheet.getRange(i + 1, 10).setValue(new Date());
    return jsonResp_({ ok: true, sleutel, naam });
  }
  return jsonResp_({ ok: false, fout: 'Geen actieve licentie gevonden voor dit e-mailadres.' });
}

// ─────────────────────────────────────────────
//  OTP E-MAIL
// ─────────────────────────────────────────────
function stuurOtpMail_(email, otp) {
  const props    = PropertiesService.getScriptProperties();
  const brevoKey = props.getProperty('BREVO_API_KEY') || '';
  const vanEmail = props.getProperty('VAN_EMAIL')     || 'info@boekhoudbaar.nl';
  const vanNaam  = props.getProperty('VAN_NAAM')      || 'Boekhoudbaar';
  const replyTo  = props.getProperty('SUPPORT_EMAIL') || 'support@boekhoudbaar.nl';
  const kvk      = props.getProperty('KVK_NUMMER')    || '';
  const btw      = props.getProperty('BTW_NUMMER')    || '';

  const html = `<!DOCTYPE html><html lang="nl"><body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f8fafc">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">Je 6-cijferige activeringscode is ${otp} — geldig 15 minuten.</div>
  <div style="background:#0D1B4E;padding:24px;border-radius:10px 10px 0 0;text-align:center">
    <h2 style="color:#fff;margin:0;font-size:18px;font-weight:700;letter-spacing:-0.01em">Boekhoudbaar — Activeringscode</h2>
  </div>
  <div style="background:#fff;padding:26px 24px;border:1px solid #E5EAF2;border-top:none;border-radius:0 0 10px 10px">
    <p style="color:#1A1A1A;margin:0 0 14px">Je activeringscode:</p>
    <div style="background:#F7F9FC;border:1px solid #E5EAF2;border-radius:10px;padding:20px;text-align:center;margin:16px 0">
      <code style="font-size:36px;font-weight:800;color:#0D1B4E;letter-spacing:8px">${otp}</code>
    </div>
    <p style="color:#666;font-size:13px">Geldig voor <strong>15 minuten</strong>. Voer de code in de spreadsheet in.</p>
    <p style="color:#999;font-size:11px;margin-top:12px">Heb je geen code aangevraagd? Negeer dit bericht.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0 12px">
    <p style="color:#94a3b8;font-size:11px;line-height:1.5;margin:0">
      Vragen? <a href="mailto:${replyTo}" style="color:#0D1B4E">${replyTo}</a><br>
      Hoven Strategy &amp; Solutions${kvk ? ' · KvK ' + kvk : ''}${btw ? ' · BTW ' + btw : ''}
    </p>
  </div></body></html>`;

  const textBody = 'Je activeringscode Boekhoudbaar: ' + otp + '\n\n' +
    'Geldig 15 minuten. Voer in via de spreadsheet.\n\n' +
    'Geen code aangevraagd? Negeer dit bericht.\n\n' +
    '— Vragen? ' + replyTo + '\n' +
    'Hoven Strategy & Solutions' + (kvk ? ' · KvK ' + kvk : '') + (btw ? ' · BTW ' + btw : '') + '\n';

  if (brevoKey) {
    try {
      const resp = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'post', contentType: 'application/json',
        headers: { 'api-key': brevoKey, 'accept': 'application/json' },
        payload: JSON.stringify({
          sender: { name: vanNaam, email: vanEmail },
          replyTo: { email: replyTo, name: vanNaam },
          to: [{ email }],
          subject: 'Je activeringscode Boekhoudbaar: ' + otp,
          htmlContent: html,
          textContent: textBody,
          headers: {
            'List-Unsubscribe': '<mailto:' + replyTo + '?subject=Unsubscribe>',
          },
        }),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) return;  // succes — geen fallback nodig
      Logger.log('Brevo OTP-mail faalde (HTTP ' + code + '): ' + resp.getContentText().slice(0, 300) + ' — fallback MailApp');
    } catch (err) {
      Logger.log('Brevo OTP exception: ' + err.message + ' — fallback MailApp');
    }
  }
  // Fallback: MailApp via Google Workspace (lager limiet maar reliable).
  MailApp.sendEmail({
    to: email,
    subject: 'Activeringscode Boekhoudbaar: ' + otp,
    body: textBody,
    htmlBody: html,
    replyTo: replyTo,
    name: vanNaam,
  });
}

// ─────────────────────────────────────────────
//  VALIDEER-ENDPOINT (aangeroepen door Licentie.gs)
// ─────────────────────────────────────────────
function valideerEndpoint_(e) {
  const sleutel      = String((e.parameter.sleutel     || '')).trim().toUpperCase();
  const installatieId = String((e.parameter.installatie || '')).trim();

  if (!sleutel) return jsonResp_({ geldig: false, fout: 'Geen sleutel opgegeven.' });

  // Rate-limit: max 10 validaties per sleutel per uur (beschermt tegen brute-force).
  // Gebruik volledige sleutel ipv eerste 16 tekens — anders zouden twee licenties
  // met gelijke prefix dezelfde rate-limit bucket delen (cross-user DoS-risico).
  const cache = CacheService.getScriptCache();
  const cacheKey = 'valRate_' + sleutel;
  const pogingen = parseInt(cache.get(cacheKey) || '0');
  if (pogingen >= 10) {
    return jsonResp_({ geldig: false, fout: 'Te veel validatiepogingen. Probeer over een uur opnieuw.' });
  }
  cache.put(cacheKey, String(pogingen + 1), 3600);

  try {
    const sheet = getLicentieSheet_();
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() !== sleutel) continue;

      const status    = String(data[i][4] || '').toLowerCase();
      const vervaldat = data[i][5] ? new Date(data[i][5]) : null;

      // CYCLE-42: startsWith('ingetrokken') ipv strict equality. Voorheen
      // werd 'Ingetrokken — rotatie' (cycle 31) niet herkend → een gerotireerde
      // sleutel bleef geldig valideren → klant (of attacker met oude sleutel)
      // kon de spreadsheet blijven gebruiken. Plus bounce-status werd niet
      // gecheckt → klant met onbereikbare email kon door zonder dat wij hen
      // konden bereiken voor support.
      if (status.startsWith('ingetrokken')) return jsonResp_({ geldig: false, fout: 'Licentie is ingetrokken.' });
      if (status === 'bounce') return jsonResp_({ geldig: false, fout: 'E-mailadres ontvangt geen post. Neem contact op via support@boekhoudbaar.nl.' });
      if (vervaldat && vervaldat < new Date()) return jsonResp_({ geldig: false, fout: 'Licentie is verlopen.' });

      // Registreer installatie-ID bij eerste activatie (één installatie per sleutel)
      const huidigInstId = String(data[i][6] || '');
      if (installatieId && !huidigInstId) {
        sheet.getRange(i + 1, 7).setValue(installatieId);
      } else if (huidigInstId && installatieId && huidigInstId !== installatieId) {
        return jsonResp_({ geldig: false, fout: 'Licentie is al actief op een andere installatie.' });
      }

      // Update laatste validatie
      sheet.getRange(i + 1, 10).setValue(new Date());

      return jsonResp_({ geldig: true, naam: data[i][1], versie: data[i][3] || 'Standaard' });
    }
    return jsonResp_({ geldig: false, fout: 'Licentiesleutel niet gevonden.' });
  } catch (err) {
    Logger.log('Valideer fout: ' + err.message);
    return jsonResp_({ geldig: false, fout: 'Serverfout: ' + err.message });
  }
}

// ─────────────────────────────────────────────
//  CONFIG-ENDPOINT — centrale product-versie + bericht
// ─────────────────────────────────────────────
/**
 * Klant-kopie vraagt dit 1× per 24u op voor:
 *  - versie      — huidige product-versie (vergelijkt met eigen PRODUCT_VERSIE)
 *  - bericht     — optionele globale banner-tekst (leeg = geen banner)
 *  - flags       — feature-flag object voor toekomstige gradual rollouts
 *
 * Geen authenticatie nodig: het is publieke product-metadata.
 */
function configEndpoint_(e) {
  const props = PropertiesService.getScriptProperties();
  let flags = {};
  let belastingTarieven = null;
  let featureMeldingen = {};
  try { flags = JSON.parse(props.getProperty('FEATURE_FLAGS') || '{}'); } catch (_) {}
  try { belastingTarieven = JSON.parse(props.getProperty('BELASTING_TARIEVEN') || 'null'); } catch (_) {}
  try { featureMeldingen = JSON.parse(props.getProperty('FEATURE_MELDINGEN') || '{}'); } catch (_) {}
  return jsonResp_({
    versie:           props.getProperty('PRODUCT_VERSIE') || '2.1.0',
    bericht:          props.getProperty('GLOBAL_BERICHT') || '',
    flags:            flags,
    features:         flags,           // alias voor isFeatureIngeschakeld_
    featureMeldingen: featureMeldingen,
    belastingTarieven: belastingTarieven,  // null = client gebruikt lokale fallback
  });
}

// ─────────────────────────────────────────────
//  ONBOARDED-ENDPOINT — klant-kopie meldt geslaagde setup()
// ─────────────────────────────────────────────
/**
 * Klant-kopie roept dit aan zodra setup() voor het eerst succesvol is
 * doorlopen. Schrijft een timestamp in kolom 11 ("Onboarded op") van de
 * CRM-sheet, zodat jij in één oogopslag ziet welke klanten daadwerkelijk
 * werkend zijn vs. alleen geactiveerd.
 *
 * Idempotent — overschrijft een bestaande timestamp niet.
 */
/**
 * TELEMETRY-endpoint — klant rapporteert anomalies (BTW-invariant fail,
 * detecteerAfwijkingen_ matches, exception-traces).
 *
 * Schrijft naar 'Telemetry'-tabblad op licence-sheet zodat jij in
 * realtime ziet welke klanten welke fout krijgen op welke versie.
 *
 * Privacy: ontvangt GEEN boekhouddata, alleen structurele info
 *   (sleutel-hash, code, message, versie, timestamp).
 */
function telemetryEndpoint_(e) {
  const sleutel = String((e.parameter.sleutel || '')).trim().toUpperCase();
  const code    = String((e.parameter.code    || '')).slice(0, 80);
  const bericht = String((e.parameter.bericht || '')).slice(0, 500);
  const versie  = String((e.parameter.versie  || '')).slice(0, 20);

  if (!sleutel || !code) return jsonResp_({ ok: false, fout: 'sleutel + code verplicht' });

  // Privacy: hash sleutel voor opslag — wij hoeven niet te weten wélke klant,
  // alleen of meerdere klanten dezelfde fout hebben.
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sleutel)
    .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('').slice(0, 12);

  // Server-side rate-limit op (hash, code) — max 1× per uur per (klant, code).
  // Client throttled al naar 1×/uur, maar bij gemanipuleerd verzoek of
  // verschillende installaties van dezelfde licentie zou de Telemetry-tab
  // anders ongelimiteerd kunnen groeien.
  const cache = CacheService.getScriptCache();
  const rateKey = 'tel_' + hash + '_' + code.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  if (cache.get(rateKey)) return jsonResp_({ ok: true, throttled: true });
  cache.put(rateKey, '1', 3600);

  try {
    const ss = SpreadsheetApp.openById(getLicentieSheet_().getParent().getId());
    let tel = ss.getSheetByName('Telemetry');
    if (!tel) {
      tel = ss.insertSheet('Telemetry');
      tel.appendRow(['Datum', 'Klant-hash', 'Code', 'Bericht', 'Versie']);
      tel.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#fff');
    }
    tel.appendRow([new Date(), hash, code, bericht, versie]);

    // Trim — houd max 5000 rijen om sheet-quotum niet te halen.
    const last = tel.getLastRow();
    if (last > 5001) tel.deleteRows(2, last - 5001);
  } catch (err) {
    Logger.log('telemetry write failed: ' + err.message);
  }
  return jsonResp_({ ok: true });
}

function onboardedEndpoint_(e) {
  const sleutel = String((e.parameter.sleutel || '')).trim().toUpperCase();
  const ssId    = String((e.parameter.ssId    || '')).trim();
  if (!sleutel) return jsonResp_({ ok: false, fout: 'Geen sleutel.' });

  try {
    const sheet = getLicentieSheet_();
    ensureOnboardedKolom_(sheet);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() !== sleutel) continue;

      // CYCLE-15: weiger onboarded-mark op niet-actieve licentie (revoked /
      // bounce / pending). Voorkomt dat ingetrokken sleutels alsnog als
      // "onboarded" gemarkeerd worden (= verwarrend voor admin-overview).
      const status = String(data[i][4] || '').toLowerCase();
      if (!status.startsWith('actief')) {
        return jsonResp_({ ok: false, fout: 'Licentie is niet actief.' });
      }

      const boundSsId = String(data[i][6] || '');
      if (ssId && boundSsId && ssId !== boundSsId) {
        return jsonResp_({ ok: false, fout: 'Spreadsheet-ID komt niet overeen.' });
      }

      // Idempotent — niet overschrijven als al geboekt
      if (data[i][10]) return jsonResp_({ ok: true, already: true });

      sheet.getRange(i + 1, 11).setValue(new Date());
      return jsonResp_({ ok: true });
    }
    return jsonResp_({ ok: false, fout: 'Sleutel niet gevonden.' });
  } catch (err) {
    Logger.log('Onboarded fout: ' + err.message);
    return jsonResp_({ ok: false, fout: 'Serverfout.' });
  }
}

/**
 * Voegt kolom 11 ('Onboarded op') toe aan oudere licentie-sheets.
 * Idempotent — no-op als kolom al bestaat.
 */
function ensureOnboardedKolom_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol >= 11) return;
  sheet.getRange(1, 11)
    .setValue('Onboarded op')
    .setFontWeight('bold')
    .setBackground('#0D1B4E')
    .setFontColor('#FFFFFF');
}

// ─────────────────────────────────────────────
//  BEDANKT-PAGINA (na Mollie redirect)
// ─────────────────────────────────────────────
function bedanktPagina_(e) {
  const html = `<!DOCTYPE html><html lang="nl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<!-- CYCLE-49: transactionele post-purchase pagina — niet indexeren,
     anders kunnen reviews/screenshots in zoekresultaten verschijnen. -->
<meta name="robots" content="noindex,nofollow">
<title>Betaling ontvangen</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
       background:#F7F9FC;min-height:100vh;display:flex;align-items:center;
       justify-content:center;padding:20px;color:#1A1A1A}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:520px;
        width:100%;text-align:left;box-shadow:0 8px 32px rgba(13,27,78,.10)}
  h1{color:#0D1B4E;font-size:24px;margin:8px 0 6px;text-align:center}
  .sub{color:#5F6B7A;font-size:14px;text-align:center;margin-bottom:18px}
  .info{background:#F7F9FC;border:1px solid #E5EAF2;border-radius:8px;padding:14px;font-size:13px;color:#1A1A1A;margin:14px 0}
  .heads-up{background:#FFF8E1;border:1px solid #FFECB3;border-radius:10px;padding:14px 18px;margin:18px 0;font-size:13px;line-height:1.6;color:#5A3F00}
  .heads-up strong{color:#5A3F00}
  .heads-up ol{margin:6px 0 0;padding-left:20px}
  .heads-up li{margin:3px 0}
  .heads-up .google-note{margin-top:10px;padding-top:10px;border-top:1px dashed #E0D08A}
  p{color:#5F6B7A;font-size:13px;line-height:1.7;margin:8px 0}
</style></head><body>
<div class="card">
  <div style="font-size:44px;text-align:center">🎉</div>
  <h1>Bedankt voor je aankoop!</h1>
  <p class="sub">Je betaling is ontvangen. Binnen enkele minuten staat er een e-mail in je inbox met je licentiesleutel en activatielink.</p>
  <div class="info"><strong>Nog niets binnen na 5 minuten?</strong> Check je spam-map en zoek op <em>"Boekhoudbaar"</em>.</div>

  <div class="heads-up">
    <strong>Wat gebeurt er zo:</strong>
    <ol>
      <li>Je klikt op de activatielink in de mail.</li>
      <li>Google vraagt je toestemming om een kopie in <strong>jouw Drive</strong> te zetten en <strong>namens jou mail te sturen</strong> (voor facturen).</li>
      <li>Je ziet mogelijk <em>"Deze app is niet geverifieerd door Google"</em> — dat klopt, Boekhoudbaar is een éénpersoonszaak. Klik op <strong>Geavanceerd → Doorgaan</strong>.</li>
      <li>Je boekhoudbestand opent. Vul je e-mail in, ontvang een 6-cijferige code, voer 'm in, klaar.</li>
    </ol>
    <p class="google-note" style="margin:10px 0 0">Je data blijft 100% op jouw eigen Drive. Wij hebben er geen toegang toe.</p>
  </div>

  <p style="text-align:center;font-size:12px;color:#94a3b8">Dit venster kun je sluiten.</p>
</div></body></html>`;

  return HtmlService.createHtmlOutput(html).setTitle('Betaling ontvangen');
}

// ─────────────────────────────────────────────
//  ADMIN PANEEL
// ─────────────────────────────────────────────
function adminPaneel_(e) {
  const ww    = PropertiesService.getScriptProperties().getProperty('ADMIN_WACHTWOORD') || '';
  const input = String((e.parameter.ww || '')).trim();

  if (!ww || !veiligVergelijk_(ww, input)) {
    return HtmlService.createHtmlOutput(
      '<form style="font-family:Arial;padding:30px">' +
      '<h3>Beheerpaneel</h3>' +
      '<input name="ww" type="password" placeholder="Wachtwoord" style="padding:8px;margin-right:8px">' +
      '<input name="actie" type="hidden" value="admin">' +
      '<button type="submit">Inloggen</button></form>'
    ).setTitle('Admin');
  }

  const props = PropertiesService.getScriptProperties();
  const templateReady = !!props.getProperty('TEMPLATE_SS_ID');
  const mollieReady   = !!props.getProperty('MOLLIE_API_KEY');
  const brevoReady    = !!props.getProperty('BREVO_API_KEY');

  let banners = '';
  if (!templateReady) {
    banners += '<div class="banner err"><strong>⚠ TEMPLATE_SS_ID ontbreekt.</strong> ' +
               'De copy-link in de klant-e-mail is dan leeg. Vul Script Properties → ' +
               '<code>TEMPLATE_SS_ID</code> met het ID van je master-spreadsheet.</div>';
  }
  if (!mollieReady) {
    banners += '<div class="banner err"><strong>⚠ MOLLIE_API_KEY ontbreekt.</strong> ' +
               'Betaalpagina werkt niet. Vul Script Properties.</div>';
  }
  if (!brevoReady) {
    banners += '<div class="banner warn">Brevo niet geconfigureerd — transactionele e-mail ' +
               'valt terug op <code>MailApp.sendEmail</code> (lagere deliverability).</div>';
  }

  const sheet = getLicentieSheet_();
  ensureOnboardedKolom_(sheet);
  const data  = sheet.getDataRange().getValues();
  const totaal      = Math.max(0, data.length - 1);
  let actief        = 0;
  let onboarded     = 0;
  let wachtTemplate = 0;
  let rijen = '';

  for (let i = 1; i < data.length; i++) {
    const statusRaw = String(data[i][4] || '');
    const statusL   = statusRaw.toLowerCase();
    const installatie = String(data[i][6] || '');
    const onboardDt = data[i][10];
    const valideerDt = data[i][9];

    if (statusL.startsWith('actief')) actief++;
    if (onboardDt) onboarded++;
    if (statusRaw.indexOf('wacht op TEMPLATE') !== -1) wachtTemplate++;

    const cat = onboardDt
      ? 'onboarded'
      : (statusL.startsWith('actief') ? 'actief' : 'overig');

    const zoekTekst = (String(data[i][1] || '') + ' ' + String(data[i][2] || '')).toLowerCase();
    rijen += `<tr data-cat="${escHtml_(cat)}" data-tekst="${escHtml_(zoekTekst)}">
      <td>${escHtml_(data[i][0])}</td><td>${escHtml_(data[i][1])}</td><td>${escHtml_(data[i][2])}</td>
      <td>${escHtml_(statusRaw)}</td>
      <td>${installatie ? '<code>' + escHtml_(installatie.substring(0, 16)) + '…</code>' : '—'}</td>
      <td>${onboardDt ? new Date(onboardDt).toLocaleDateString('nl-NL') : '—'}</td>
      <td>${valideerDt ? new Date(valideerDt).toLocaleDateString('nl-NL') : '—'}</td>
    </tr>`;
  }

  return HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial;padding:20px;font-size:13px}
      .banner{border-radius:6px;padding:10px 14px;margin-bottom:10px;font-size:13px}
      .banner.err{background:#FDECEC;color:#B91C1C;border:1px solid #F5B3B3}
      .banner.warn{background:#FFF8E1;color:#8B5A00;border:1px solid #E6D8A8}
      code{background:#F1F3F5;padding:1px 6px;border-radius:3px;font-size:12px}
      .metrics{display:flex;gap:14px;margin:12px 0 18px}
      .metric{background:#F7F9FC;border:1px solid #E5EAF2;border-radius:8px;padding:10px 14px;min-width:120px}
      .metric .v{font-size:20px;font-weight:700;color:#0D1B4E}
      .metric .l{font-size:11px;color:#5F6B7A;text-transform:uppercase;letter-spacing:.5px}
      .filters{display:flex;gap:8px;margin:0 0 10px;flex-wrap:wrap}
      .filters input{flex:1;min-width:220px;padding:8px;border:1px solid #E5EAF2;border-radius:6px;font-size:13px}
      .filters button{padding:8px 12px;border:1px solid #E5EAF2;background:#fff;border-radius:6px;cursor:pointer;font-size:12px}
      .filters button.actief{background:#0D1B4E;color:#fff;border-color:#0D1B4E}
      table{width:100%;border-collapse:collapse}
      th,td{padding:7px 10px;border:1px solid #ddd;text-align:left}
      th{background:#0D1B4E;color:#fff}
      tr:nth-child(even){background:#f5f5f5}
      tr.hidden{display:none}
    </style>
    ${banners}
    <h3>Klanten-overzicht</h3>
    <div class="metrics">
      <div class="metric"><div class="v">${totaal}</div><div class="l">Totaal</div></div>
      <div class="metric"><div class="v">${actief}</div><div class="l">Actief</div></div>
      <div class="metric"><div class="v">${onboarded}</div><div class="l">Onboarded</div></div>
      <div class="metric"><div class="v" style="color:${wachtTemplate ? '#B91C1C' : '#0D1B4E'}">${wachtTemplate}</div><div class="l">Wacht op template</div></div>
    </div>
    <div class="filters">
      <input id="zoek" placeholder="Filter op naam of e-mail…" oninput="filter()">
      <button onclick="kiesCat('alle', this)" class="actief">Alle</button>
      <button onclick="kiesCat('onboarded', this)">Onboarded</button>
      <button onclick="kiesCat('actief', this)">Actief (nog niet onboarded)</button>
      <button onclick="kiesCat('overig', this)">Overig</button>
    </div>
    <table><tr>
      <th>Sleutel</th><th>Naam</th><th>Email</th><th>Status</th>
      <th>Installatie-ID</th><th>Onboarded op</th><th>Laatste validatie</th>
    </tr>${rijen}</table>
    <p style="margin-top:16px;font-size:11px;color:#999">
      Licenties beheren: open de licentie-spreadsheet rechtstreeks in Google Drive.</p>
    <script>
      var cat = 'alle';
      function kiesCat(c, btn) {
        cat = c;
        document.querySelectorAll('.filters button').forEach(function(b){ b.classList.remove('actief'); });
        btn.classList.add('actief');
        filter();
      }
      function filter() {
        var q = document.getElementById('zoek').value.toLowerCase();
        document.querySelectorAll('tr[data-cat]').forEach(function(tr){
          var catOk = cat === 'alle' || tr.getAttribute('data-cat') === cat;
          var qOk   = !q || tr.getAttribute('data-tekst').indexOf(q) !== -1;
          tr.classList.toggle('hidden', !(catOk && qOk));
        });
      }
    </script>
  `).setTitle('Admin — Licentiebeheer');
}

// ─────────────────────────────────────────────
//  E-MAIL NAAR KLANT
// ─────────────────────────────────────────────
function stuurLicentiemail_(naam, email, sleutel) {
  const props       = PropertiesService.getScriptProperties();
  const productnm   = props.getProperty('PRODUCT_NAAM')    || 'Boekhoudbaar';
  const templateId  = props.getProperty('TEMPLATE_SS_ID')  || '';
  const brevoKey    = props.getProperty('BREVO_API_KEY')   || '';
  const vanEmail    = props.getProperty('VAN_EMAIL')       || 'info@boekhoudbaar.nl';
  const vanNaam     = props.getProperty('VAN_NAAM')        || 'Sam van Boekhoudbaar';
  const kvk         = props.getProperty('KVK_NUMMER')      || '';
  const btw         = props.getProperty('BTW_NUMMER')      || '';
  const privacyUrl  = props.getProperty('PRIVACY_URL')     || 'https://www.boekhoudbaar.nl/privacy';

  // Guard — zonder TEMPLATE_SS_ID kan de klant de copy-link niet gebruiken.
  // VOORHEEN: alleen alert naar eigenaar, klant kreeg NIETS → uren/dagen wachten.
  // NU: klant krijgt OOK een mail met:
  //   - duidelijke uitleg dat licentie actief is
  //   - hun licentiesleutel (zodat ze niets verliezen)
  //   - belofte: copy-link binnen 24u
  //   - support-email om sneller te reageren
  if (!templateId) {
    Logger.log('::error:: TEMPLATE_SS_ID ontbreekt — klant ' + email + ' (' + sleutel.substring(0, 8) + '…) wacht op activatielink.');
    try { markeerTemplateOntbreekt_(sleutel); } catch (_) {}

    // 1. Alert naar eigenaar (urgent)
    try {
      MailApp.sendEmail({
        to: vanEmail,
        subject: '🚨 URGENT: Klant ' + email + ' wacht — TEMPLATE_SS_ID ontbreekt',
        htmlBody: '<p>Nieuwe klant <strong>' + escHtml_(naam) + '</strong> (' + escHtml_(email) + ') heeft betaald, ' +
                  'maar de copy-link kan niet worden opgebouwd omdat <code>TEMPLATE_SS_ID</code> ' +
                  'ontbreekt in Script Properties.</p>' +
                  '<p><strong>De klant heeft zojuist een uitleg-mail ontvangen</strong> met hun licentiesleutel ' +
                  'en de belofte dat de copy-link binnen 24 uur volgt. Reageer A.S.A.P.:</p>' +
                  '<ol><li>Vul <code>TEMPLATE_SS_ID</code> in Script Properties</li>' +
                  '<li>Run <code>herstuurLicentiemailHandmatig("' + escHtml_(sleutel) + '")</code> in de editor</li></ol>' +
                  '<p>Licentiesleutel: <code>' + escHtml_(sleutel) + '</code><br>' +
                  'Klant-email: <a href="mailto:' + escHtml_(email) + '">' + escHtml_(email) + '</a></p>',
      });
    } catch (_) {}

    // 2. KLANT KRIJGT OOK EEN MAIL (cruciaal — geen radio-stilte)
    try {
      const klantHtml =
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">' +
        '<div style="background:#0D1B4E;color:#fff;padding:24px;border-radius:8px 8px 0 0">' +
        '<h1 style="margin:0;font-size:22px">✅ Bedankt voor je bestelling, ' + escHtml_(naam || 'klant') + '!</h1>' +
        '</div>' +
        '<div style="padding:24px;border:1px solid #E5EAF2;border-top:0;border-radius:0 0 8px 8px">' +
        '<p>Je betaling is verwerkt en je licentie is geactiveerd.</p>' +
        '<div style="background:#F7F9FC;border:1px solid #E5EAF2;border-radius:8px;padding:16px;margin:16px 0">' +
        '<p style="margin:0 0 4px;font-size:13px;color:#5F6B7A">Je licentiesleutel:</p>' +
        '<code style="font-size:18px;color:#0D1B4E;font-weight:600">' + escHtml_(sleutel) + '</code>' +
        '<p style="margin:8px 0 0;font-size:12px;color:#5F6B7A">Bewaar deze code — je hebt hem straks nodig om je boekhouding te activeren.</p>' +
        '</div>' +
        '<p><strong>Wat nu?</strong></p>' +
        '<p>We sturen je <strong>binnen 24 uur</strong> de installatie-link waarmee je je eigen kopie van Boekhoudbaar krijgt. ' +
        'We zorgen dat je vandaag of morgen kunt starten.</p>' +
        '<p style="margin-top:24px">Heb je vragen of wil je sneller starten? Reageer op deze e-mail of stuur een bericht naar ' +
        '<a href="mailto:' + escHtml_(vanEmail) + '" style="color:#2EC4B6">' + escHtml_(vanEmail) + '</a>. ' +
        'Ik (Sam) lees mijn mail meerdere keren per dag.</p>' +
        '<p style="margin-top:32px;color:#5F6B7A;font-size:13px">— ' + escHtml_(vanNaam) + '<br>' +
        escHtml_(productnm) + (kvk ? ' · KvK ' + escHtml_(kvk) : '') + (btw ? ' · BTW ' + escHtml_(btw) : '') + '</p>' +
        '</div></div>';
      MailApp.sendEmail({
        to: email,
        subject: '✅ Boekhoudbaar — bestelling ontvangen, installatie-link volgt binnen 24u',
        htmlBody: klantHtml,
        replyTo: vanEmail,
        name: vanNaam,
      });
      Logger.log('Klant-fallback-mail verstuurd naar ' + email);
    } catch (klantMailErr) {
      Logger.log('::error:: Kon ook geen klant-fallback-mail sturen naar ' + email + ': ' + klantMailErr.message);
    }
    return;
  }

  // Klant krijgt een "Maak een kopie"-link naar het master-sjabloon.
  // Na het openen vult de klant zijn e-mailadres in, ontvangt een OTP en activeert.
  const kopieerLink = templateId
    ? 'https://docs.google.com/spreadsheets/d/' + templateId + '/copy'
    : '';

  const stappenHtml = kopieerLink ? `
    <div style="background:#F7F9FC;border:1px solid #E5EAF2;border-left:3px solid #2EC4B6;border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 12px;font-weight:700;color:#0D1B4E">In 3 stappen aan de slag:</p>
      <p style="margin:0 0 8px;font-size:14px;color:#1A1A1A">① Klik op de knop hieronder om je spreadsheet te openen</p>
      <p style="margin:0 0 8px;font-size:14px;color:#1A1A1A">② Vul je e-mailadres in — je ontvangt een 6-cijferige activeringscode</p>
      <p style="margin:0;font-size:14px;color:#1A1A1A">③ Voer de code in en je boekhouding is direct klaar voor gebruik</p>
    </div>

    <div style="background:#E6F7F4;border:1px solid #2EC4B6;border-radius:10px;padding:16px 20px;margin:20px 0;font-size:13px;line-height:1.7;color:#0D4F47">
      <p style="margin:0 0 8px;font-weight:700;color:#0D1B4E">📌 Heb je geen Gmail? Geen probleem.</p>
      <p style="margin:0 0 8px">Boekhoudbaar draait op Google Sheets — daarom heb je een <strong>Google-account</strong> nodig om je spreadsheet te openen. Maar je hoeft <strong>geen Gmail-adres</strong> te gebruiken: je kunt een gratis Google-account aanmaken met je huidige email (Outlook, iCloud, Proton, eigen domein, etc.) in 2 minuten.</p>
      <p style="margin:0">
        Stappen: ga naar <a href="https://accounts.google.com/signup" style="color:#0D1B4E;text-decoration:underline">accounts.google.com/signup</a> →
        kies <strong>"Use my existing email"</strong> → vul ${escHtml_(email)} in → bevestig via verificatiecode in je inbox.
        Daarna log je hier op in.
      </p>
    </div>

    <div style="background:#FFF8E1;border:1px solid #FFECB3;border-radius:10px;padding:16px 20px;margin:20px 0;font-size:13px;line-height:1.7;color:#5f4b14">
      <p style="margin:0 0 8px;font-weight:700;color:#5A3F00">Wat Google je zo gaat vragen:</p>
      <p style="margin:0 0 6px"><strong>1.</strong> Toegang tot <strong>je eigen Google&nbsp;Drive</strong> — precies de bedoeling: dáár komt jouw boekhoudbestand te staan.</p>
      <p style="margin:0 0 6px"><strong>2.</strong> Toestemming om <strong>namens jou e-mail te sturen</strong> — zodat je facturen direct uit de sheet verstuurt.</p>
      <p style="margin:0 0 10px"><strong>3.</strong> Verbinding met <strong>externe diensten</strong> — voor licentie-validatie en (optioneel) bank/Mollie-koppelingen.</p>
      <p style="margin:0;padding-top:10px;border-top:1px dashed #E0D08A">
        Google toont mogelijk <em>"Deze app is niet geverifieerd door Google"</em>. Dat klopt — Boekhoudbaar is een éénpersoonszaak, geen Google-partner.
        Klik op <strong>Geavanceerd → Ga naar Boekhoudbaar (onveilig)</strong>. Je data blijft 100% op jóuw Drive; wij kunnen er niet bij.
      </p>
    </div>

    <div style="text-align:center;margin:24px 0">
      <a href="${kopieerLink}" style="background:#0D1B4E;color:#fff;padding:16px 32px;
         border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;letter-spacing:.1px">
        Open mijn boekhouding →
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;word-break:break-all">
      Werkt de knop niet? Kopieer: ${kopieerLink}</p>
  ` : `
    <p style="font-size:14px;color:#64748b">Je ontvangt binnenkort een link om je boekhouding te openen.
    Vragen? Mail naar <a href="mailto:${vanEmail}" style="color:#0D1B4E">${vanEmail}</a>.</p>
  `;

  const htmlBody = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
<title>${productnm} — Bestelling bevestigd</title>
<meta name="x-apple-disable-message-reformatting">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8fafc">
  <!-- Preheader: zichtbaar in inbox-preview, vergroot open-rate -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">
    Je licentie is klaar. In 3 stappen heb je je eigen boekhouding draaiend — werkt met élk emailadres.
  </div>
  <div style="background:#0D1B4E;padding:28px 24px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.01em">${productnm}</h1>
    <p style="color:#B8C2D1;margin:6px 0 0;font-size:14px">Bestelling bevestigd — je boekhouding staat klaar</p>
  </div>
  <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
    <p style="font-size:16px">Hoi ${naam},</p>
    <p>Bedankt voor je aankoop. Hieronder de stappen om aan de slag te gaan.</p>
    ${stappenHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:13px;color:#94a3b8;line-height:1.6">
      Vragen of feedback? <a href="mailto:${vanEmail}" style="color:#0D1B4E">${vanEmail}</a><br>
      Lukt iets niet? <a href="mailto:support@boekhoudbaar.nl" style="color:#0D1B4E">support@boekhoudbaar.nl</a>
    </p>
    <p style="font-size:12px;color:#cbd5e1;line-height:1.5">
      ${productnm} — een product van Hoven Strategy &amp; Solutions${kvk ? ' · KvK ' + kvk : ''}${btw ? ' · BTW ' + btw : ''}<br>
      <a href="${privacyUrl}" style="color:#94a3b8">Privacybeleid</a> ·
      <a href="mailto:support@boekhoudbaar.nl?subject=Unsubscribe" style="color:#94a3b8">Uitschrijven</a>
    </p>
  </div>
</body></html>`;

  // Plain-text alternatief — verhoogt deliverability (spam-filters scoren
  // HTML-only mails hoger als risico).
  const textBody =
    'Hoi ' + naam + ',\n\n' +
    'Bedankt voor je aankoop. Hieronder de stappen om aan de slag te gaan.\n\n' +
    (kopieerLink ? 'In 3 stappen aan de slag:\n' +
      '1. Open je spreadsheet via: ' + kopieerLink + '\n' +
      '2. Vul je e-mailadres in — je ontvangt een 6-cijferige activeringscode\n' +
      '3. Voer de code in en je boekhouding is direct klaar voor gebruik\n\n' +
      'GEEN GMAIL? GEEN PROBLEEM.\n' +
      'Boekhoudbaar draait op Google Sheets, dus je hebt een Google-account nodig.\n' +
      'Maar je kunt gratis een Google-account aanmaken met je huidige email\n' +
      '(Outlook, iCloud, Proton, eigen domein, etc.).\n' +
      'Stappen: accounts.google.com/signup → "Use my existing email" → vul ' + email + ' in.\n\n' : '') +
    'Vragen? Stuur een e-mail naar ' + vanEmail + '.\n\n' +
    productnm + (kvk ? ' · KVK ' + kvk : '') + (btw ? ' · BTW ' + btw : '') +
    '\nPrivacybeleid: ' + privacyUrl + '\n';

  let brevoOk = false;
  const supportEmail = props.getProperty('SUPPORT_EMAIL') || 'support@boekhoudbaar.nl';
  if (brevoKey) {
    try {
      const resp = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'api-key': brevoKey },
        payload: JSON.stringify({
          sender:      { name: vanNaam, email: vanEmail },
          replyTo:     { email: supportEmail, name: vanNaam },
          to:          [{ email: email, name: naam }],
          subject:     'Je ' + productnm + ' is klaar — activeer nu 🚀',
          htmlContent: htmlBody,
          textContent: textBody,
          tags:        ['licentie', 'dag0'],
          params:      { naam: naam },
          headers:     {
            'List-Unsubscribe': '<mailto:' + supportEmail + '?subject=Unsubscribe>',
          },
        }),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) brevoOk = true;
      else Logger.log('::error:: Brevo licentiemail faalde HTTP ' + code + ': ' + resp.getContentText().slice(0, 400) + ' — val terug op MailApp voor ' + email);
    } catch (err) {
      Logger.log('::error:: Brevo licentiemail exception: ' + err.message + ' — val terug op MailApp voor ' + email);
    }
  }
  if (!brevoOk) {
    // Fallback — minder mooie HTML maar reliable Google delivery.
    // Cruciaal: klant heeft betaald, MOET sleutel ontvangen.
    MailApp.sendEmail({
      to: email,
      subject: 'Je ' + productnm + ' is klaar — activeer nu',
      body: textBody,
      htmlBody: htmlBody,
      replyTo: supportEmail,
      name: vanNaam,
    });
  }

  if (brevoKey) maakBrevoContact_(naam, email, sleutel, brevoKey);
}

/**
 * Markeert een licentie-rij wanneer de eerste mail niet verstuurd kon worden
 * wegens ontbrekende TEMPLATE_SS_ID. Admin-paneel toont de aangepaste status.
 */
function markeerTemplateOntbreekt_(sleutel) {
  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === sleutel) {
      sheet.getRange(i + 1, 5).setValue('Actief — wacht op TEMPLATE_SS_ID');
      return;
    }
  }
}

/**
 * Handmatig opnieuw de activatiemail versturen. Gebruiken wanneer de eerste
 * mail faalde (bv. TEMPLATE_SS_ID stond toen nog niet ingesteld).
 * Run in de editor: herstuurLicentiemailHandmatig("BKHE-XXXX-XXXX-XXXX")
 */
/**
 * CYCLE-13 — Klant-zelf-service: licentie-mail opnieuw versturen op basis
 * van email. Klant heeft sleutel verloren / email gemist → kan zelf
 * herstellen zonder support-ticket.
 *
 * Privacy-by-default: respons reveals NOOIT of email een actieve licentie
 * heeft (anders = enumeration-leak). Altijd dezelfde "als bekend, mail
 * onderweg"-melding. Audit-log capture'd of mail is verzonden.
 *
 * Rate-limit (via doGet rateLimit_):
 *   - 3 herstuur-pogingen per email per uur
 *   - 200 globaal per uur (catastrofale-spam-cap)
 */
function herstuurLicentieEndpoint_(e) {
  const email = String((e && e.parameter && e.parameter.email) || '')
    .trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return jsonResp_({ ok: false, fout: 'Vul een geldig e-mailadres in.' });
  }

  // Constante respons — onafhankelijk van of email bestaat.
  // Voorkomt account-enumeration-leak via timing of inhoud.
  const genericeRespons = {
    ok: true,
    bericht: 'Als dit e-mailadres een actieve licentie heeft, ontvang je binnen enkele minuten opnieuw je installatie-mail. Check ook je spam-map.',
  };

  try {
    const sheet = getLicentieSheet_();
    const data = sheet.getDataRange().getValues();
    let gevonden = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').toLowerCase() === email &&
          String(data[i][4] || '').toLowerCase().startsWith('actief')) {
        gevonden = {
          sleutel: String(data[i][0] || ''),
          naam:    String(data[i][1] || 'Klant'),
        };
        break;
      }
    }
    if (gevonden && gevonden.sleutel) {
      try { stuurLicentiemail_(gevonden.naam, email, gevonden.sleutel); }
      catch (mailErr) { Logger.log('herstuur-mail fout: ' + mailErr.message); }
      try {
        // Audit-log alleen owner-zichtbaar, met email-hash voor privacy
        const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email)
          .map(function(b){ return (b<0?b+256:b).toString(16).padStart(2,'0'); })
          .join('').slice(0, 12);
        Logger.log('Licentie-mail opnieuw verstuurd (hash ' + hash + ')');
      } catch (_) {}
    } else {
      // Geen actieve match — log voor support-trace zonder email te onthullen
      Logger.log('herstuur-licentie: geen actieve match voor email-hash ' +
        (Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email)
          .map(function(b){ return (b<0?b+256:b).toString(16).padStart(2,'0'); })
          .join('').slice(0, 8)));
    }
  } catch (lookupErr) {
    // Sheet-fout mag NOOIT gevolg geven aan klant — fail-silent met respons
    Logger.log('herstuur-licentie sheet-fout: ' + lookupErr.message);
  }

  return jsonResp_(genericeRespons);
}

function herstuurLicentiemailHandmatig(sleutel) {
  sleutel = String(sleutel || '').trim().toUpperCase();
  if (!sleutel) throw new Error('Geef een licentiesleutel op.');
  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() !== sleutel) continue;
    const naam  = String(data[i][1] || 'Klant');
    const email = String(data[i][2] || '');
    if (!email) throw new Error('Rij heeft geen e-mailadres.');
    stuurLicentiemail_(naam, email, sleutel);
    // Status normaliseren als 'm op de fallback stond
    if (String(data[i][4]).indexOf('wacht op TEMPLATE') !== -1) {
      sheet.getRange(i + 1, 5).setValue('Actief');
    }
    Logger.log('Mail opnieuw verstuurd naar ' + email);
    return;
  }
  throw new Error('Sleutel niet gevonden: ' + sleutel);
}

function maakBrevoContact_(naam, email, sleutel, brevoKey) {
  const payload = {
    email:      email,
    attributes: {
      FIRSTNAME:        naam.split(' ')[0],
      LASTNAME:         naam.split(' ').slice(1).join(' ') || '',
      LICENTIESLEUTEL:  sleutel,
      ACTIVATIE_DATUM:  new Date().toISOString().split('T')[0],
    },
    listIds:         [2],
    updateEnabled:   true,
  };
  UrlFetchApp.fetch('https://api.brevo.com/v3/contacts', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': brevoKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function genereerSleutel_() {
  // Gebruik Utilities.getUuid() voor crypto-secure randomness
  // (Math.random is V8-xorshift, theoretisch voorspelbaar bij genoeg samples).
  // UUID v4 → strip dashes → map naar [A-Z2-9] alfabet → 12 chars.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const uuidHex = Utilities.getUuid().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 12; i++) {
    // Pak 2 hex-chars per output-char → 256 mogelijkheden mod 32 = 8x bias-rond
    // (verwaarloosbare bias voor licentie-uniqueness)
    const byte = parseInt(uuidHex.substring(i * 2, i * 2 + 2), 16);
    s += chars[byte % chars.length];
  }
  return 'BKHE-' + s.substring(0, 4) + '-' + s.substring(4, 8) + '-' + s.substring(8, 12);
}

function getLicentieSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('LICENTIE_SHEET_ID');
  if (!id) throw new Error('LICENTIE_SHEET_ID niet ingesteld in Script Properties.');
  const ss    = SpreadsheetApp.openById(id);
  const sheet = ss.getSheets()[0];
  // Zet headers als het een nieuw blad is
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Sleutel','Naam','Email','Versie','Status','Vervaldatum',
                     'Installatie-ID','Aangemaakt op','Mollie betaling ID','Laatste validatie',
                     'Onboarded op']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold')
      .setBackground('#0D1B4E').setFontColor('#FFFFFF');
  }
  return sheet;
}

/**
 * HTML-escape helper. Gebruik ALTIJD bij het interpoleren van
 * sheet-data of Mollie-metadata in HTML-templates (admin-paneel,
 * owner-alerts). Anders bestaat XSS-risico.
 */
function escHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Defense-in-depth input-filter voor klantnaam die uit Mollie-metadata
 * komt. Strip HTML-actieve tekens. Output-escaping via escHtml_ blijft
 * de primaire veiligheid; deze guard zorgt dat vervuilde data niet
 * eens in de CRM komt.
 */
function saneerNaam_(s) {
  return String(s || '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .substring(0, 120);
}

function jsonResp_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────
//  EENMALIGE SETUP (run handmatig in de editor)
// ─────────────────────────────────────────────
/**
 * Maak een nieuwe licentie-spreadsheet aan en sla het ID op.
 * Voer deze functie éénmalig uit in de Apps Script editor.
 */
function setupLicentieSheet() {
  const ss = SpreadsheetApp.create('Boekhoudbaar — Licentiebeheer');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LICENTIE_SHEET_ID', ss.getId());

  // Stel alleen niet-gevoelige defaults in. Gevoelige properties
  // (MOLLIE_API_KEY, ADMIN_WACHTWOORD, BREVO_API_KEY, TEMPLATE_SS_ID,
  // KVK_NUMMER, BTW_NUMMER) moeten handmatig worden ingevuld per
  // environment — nooit hardcoden.
  if (!props.getProperty('PRODUCT_NAAM'))  props.setProperty('PRODUCT_NAAM',  'Boekhoudbaar');
  if (!props.getProperty('PRODUCT_PRIJS')) props.setProperty('PRODUCT_PRIJS', '49.00');

  const ontbrekend = [];
  if (!props.getProperty('MOLLIE_API_KEY'))    ontbrekend.push('MOLLIE_API_KEY');
  if (!props.getProperty('ADMIN_WACHTWOORD'))  ontbrekend.push('ADMIN_WACHTWOORD');
  if (!props.getProperty('TEMPLATE_SS_ID'))    ontbrekend.push('TEMPLATE_SS_ID');

  Logger.log('Licentie-spreadsheet aangemaakt: ' + ss.getUrl());
  if (ontbrekend.length) {
    Logger.log('::warning:: Verplichte Script Properties ontbreken nog: ' + ontbrekend.join(', '));
    Logger.log('Vul ze in via Project Settings → Script Properties voordat je deployt.');
  }
}

/**
 * Handmatig een licentiesleutel genereren (bijv. voor een gratis of kortingsexemplaar).
 * Voer uit in de editor; vul naam en email aan in de spreadsheet.
 */
function genereerHandmatigeLicentie() {
  const sleutel = genereerSleutel_();
  getLicentieSheet_().appendRow([
    sleutel, 'Handmatig', '', 'Standaard', 'Actief', '', '', new Date(), 'HANDMATIG', '', '',
  ]);
  Logger.log('Nieuwe sleutel: ' + sleutel);
  SpreadsheetApp.getUi().alert('Nieuwe licentiesleutel', sleutel, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Cleanup-helper: verwijder oude follow-up trigger als die ooit geïnstalleerd is.
 * Voorheen bestond een verwerkFollowUpEmails-systeem dat verwees naar een
 * niet-bestaande getSpreadsheet_() en verkeerde kolomindices gebruikte. Het
 * actieve drip-systeem is nu verstuurDripsDagelijks_ (zie verder beneden).
 * Run handmatig in editor als je zeker wilt zijn dat de oude trigger weg is.
 */
function verwijderOudeFollowUpTrigger_() {
  let verwijderd = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'verwerkFollowUpEmails') {
      ScriptApp.deleteTrigger(t);
      verwijderd++;
    }
  });
  Logger.log('Oude follow-up triggers verwijderd: ' + verwijderd);
}

// ─────────────────────────────────────────────
//  RATE-LIMITING + UITGEBREIDE LICENTIE-ENDPOINTS
// ─────────────────────────────────────────────

/**
 * Rate-limit per IP (best-effort via X-Forwarded-For). Apps Script Web Apps
 * leveren niet altijd IP — fallback op user-email.
 *
 * @param {Object} e          doGet event
 * @param {number} maxPerUur  max calls per uur
 * @param {number} ttlMin     window in minuten
 * @returns {ContentService.TextOutput|null}  output bij blokkering, null bij OK
 */
/**
 * Twee-laags rate-limiting voor publieke endpoints.
 *
 * ACHTERGROND — waarom geen IP-gebaseerde limiting:
 * Apps Script Web Apps exposen GEEN betrouwbaar client-IP. De vorige
 * implementatie las `e.parameter.ip` — een URL-parameter die de aanvrager
 * zelf zet. Een attacker kon die per request variëren en zo de limiet
 * volledig omzeilen; legitiem verkeer zonder parameter deelde één globale
 * 'anon'-bucket, waardoor één bad actor alle nieuwe klanten 60 min kon
 * blokkeren. Beide gevallen = kapot. Daarom volledig vervangen.
 *
 * NIEUW MODEL — twee lagen die elkaar aanvullen:
 *   Laag 1 (per-identiteit): throttle op het genormaliseerde e-mailadres
 *           uit de request. E-mail is spoofbaar, maar de OTP-endpoints
 *           valideren het adres tegen de licentie-sheet — abuse blijft dus
 *           beperkt tot reeds-bekende klant-adressen, elk apart geremd.
 *   Laag 2 (circuit-breaker): ruime globale cap over álle requests van een
 *           actie. Raakt normaal verkeer nooit (ook niet bij een drukke
 *           launch-dag); stopt uitsluitend massale geautomatiseerde abuse.
 *
 * Fail-open: bij een CacheService-storing gaat de request door — een
 * tijdelijke infra-hapering mag geen klant buitensluiten.
 *
 * @param {Object} e       doGet/doPost event-object.
 * @param {Object} opties  { actie:string, perEmail:number, globaal:number,
 *                           windowMin:number }
 * @return {ContentService.TextOutput|null} 429-respons bij overschrijding,
 *         anders null (= ga door met het endpoint).
 */
function rateLimit_(e, opties) {
  try {
    opties = opties || {};
    const actie     = opties.actie || 'algemeen';
    const windowMin = opties.windowMin || 60;
    const windowSec = windowMin * 60;
    const cache     = CacheService.getScriptCache();

    // Verzamel alle van toepassing zijnde checks vóór we iets ophogen —
    // zo telt een geweigerde request niet mee in een andere bucket.
    const checks = [];

    const email = String((e && e.parameter && e.parameter.email) || '')
      .trim().toLowerCase();
    if (email && opties.perEmail) {
      const ek = 'rl_' + actie + '_e_' + _rlHash_(email);
      checks.push({ key: ek, count: parseInt(cache.get(ek) || '0', 10), max: opties.perEmail });
    }

    if (opties.globaal) {
      const gk = 'rl_' + actie + '_g';
      checks.push({ key: gk, count: parseInt(cache.get(gk) || '0', 10), max: opties.globaal });
    }

    for (let i = 0; i < checks.length; i++) {
      if (checks[i].count >= checks[i].max) return _rl429_(windowMin);
    }
    for (let i = 0; i < checks.length; i++) {
      cache.put(checks[i].key, String(checks[i].count + 1), windowSec);
    }
    return null;  // OK, ga door
  } catch (err) {
    Logger.log('rateLimit_ fout (fail-open): ' + err.message);
    return null;  // fail-open — beter functioneel dan klanten buitensluiten
  }
}

/**
 * Korte, niet-omkeerbare hash van een rate-limit-identiteit (e-mail).
 * Houdt plaintext-adressen uit cache-keys.
 */
function _rlHash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s))
    .map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); })
    .join('').slice(0, 16);
}

/**
 * Standaard 429-achtige JSON-respons bij rate-limit-overschrijding.
 */
function _rl429_(windowMin) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    fout: 'Te veel verzoeken — wacht ' + windowMin + ' minuten en probeer opnieuw.',
    retryAfterSec: windowMin * 60,
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * /api/licentie/roteer — klant kan eigen sleutel rotaten bij verdacht gebruik.
 * Vereist: oude sleutel + email van klant. Output: nieuwe sleutel + revoke oude.
 */
function roteerEndpoint_(e) {
  try {
    const oudeSleutel = String((e.parameter && e.parameter.sleutel) || '').trim();
    const email = String((e.parameter && e.parameter.email) || '').trim().toLowerCase();
    if (!oudeSleutel || !email) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Geef sleutel en email mee.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = getLicentieSheet_();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sleutelCol = headers.indexOf('Sleutel');
    const naamCol = headers.indexOf('Naam');
    const emailCol = headers.indexOf('Email');
    const statusCol = headers.indexOf('Status');
    if (sleutelCol < 0 || emailCol < 0 || statusCol < 0) throw new Error('Sheet-format onjuist');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sleutelCol]).toUpperCase() === oudeSleutel.toUpperCase() &&
          String(data[i][emailCol]).toLowerCase() === email) {
        // CYCLE-43: status-language-bug fix. Voorheen `indexOf('revoked')` —
        // maar de sheet bevat NL-status 'Ingetrokken' resp. 'Ingetrokken —
        // rotatie' (cycle 31). 'revoked' matchte NOOIT → reeds-ingetrokken
        // sleutel kon alsnog geroteerd worden → bypass van revoke.
        if (String(data[i][statusCol] || '').toLowerCase().startsWith('ingetrokken')) {
          return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Sleutel is al ingetrokken.' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        const nieuweSleutel = genereerSleutel_();
        const naam = naamCol >= 0 ? String(data[i][naamCol] || 'Klant') : 'Klant';
        // Markeer oud als ingetrokken + voeg nieuwe rij toe met dezelfde kolom-volgorde
        // als setupLicentieSheet (Sleutel, Naam, Email, Versie, Status, Vervaldatum,
        // Installatie-ID, Aangemaakt op, Mollie betaling ID, Laatste validatie, Onboarded op).
        sheet.getRange(i + 1, statusCol + 1).setValue('Ingetrokken — rotatie');
        // CYCLE-31: zelfde cleanup als revoke — oude drip-state weg.
        // Nieuwe sleutel krijgt eigen verse drips via aanmaakDatum=new Date().
        _verwijderDripKeys_(oudeSleutel);
        sheet.appendRow([
          nieuweSleutel, naam, email, 'Standaard', 'Actief', '',
          '', new Date(), 'ROTATIE-VAN-' + oudeSleutel, '', '',
        ]);
        return ContentService.createTextOutput(JSON.stringify({
          ok: true, nieuweSleutel: nieuweSleutel,
          bericht: 'Oude sleutel ingetrokken. Nieuwe is direct actief.',
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Sleutel + email combinatie niet gevonden.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // CYCLE-14: lek geen err.message naar publieke endpoint — kan stack-trace,
    // sheet-format details of interne paden onthullen. Generieke respons voor
    // klant; Logger.log voor diagnose door owner.
    Logger.log('roteerEndpoint_ fout: ' + (err && err.message || err));
    return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Interne fout — neem contact op met support.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * /api/licentie/revoke — admin-only revocation (bij refund of misbruik).
 * Vereist admin-token in query: ?actie=revoke&sleutel=...&token=ADMIN_TOKEN
 */
/**
 * CYCLE-31: verwijdert alle `drip_<sleutel>_*` ScriptProperties voor één
 * licentie-sleutel. Wordt aangeroepen na revoke of roteer zodat:
 *   - de oude sleutel geen residuele drip-state heeft (defense; loop in
 *     verstuurDripsDagelijks_ skipped al op status, maar dit is opruim)
 *   - ScriptProperties-quota niet onnodig vol blijft (1 key per drip per
 *     ooit-bestaande sleutel, accumuleert anders voor altijd)
 * Best-effort: failures niet propagateren — endpoint-resultaat blijft OK.
 */
function _verwijderDripKeys_(sleutel) {
  if (!sleutel) return 0;
  try {
    const props = PropertiesService.getScriptProperties();
    const prefix = 'drip_' + String(sleutel).toUpperCase() + '_';
    const prefixLower = 'drip_' + String(sleutel).toLowerCase() + '_';
    const keys = props.getKeys();
    let verwijderd = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(prefix) === 0 || k.indexOf(prefixLower) === 0 ||
          k.indexOf('drip_' + sleutel + '_') === 0) {
        try { props.deleteProperty(k); verwijderd++; } catch (_) {}
      }
    }
    return verwijderd;
  } catch (_) { return 0; }
}

function revokeEndpoint_(e) {
  try {
    const sleutel = String((e.parameter && e.parameter.sleutel) || '').trim();
    const token = String((e.parameter && e.parameter.token) || '').trim();
    const adminToken = PropertiesService.getScriptProperties().getProperty('ADMIN_REVOKE_TOKEN');
    if (!adminToken || !veiligVergelijk_(token, adminToken)) {
      // CYCLE-14: log mislukte revoke-pogingen (security-event)
      try { Logger.log('revokeEndpoint_ unauthorized: token-poging ' +
        String(token).substring(0, 4) + '… voor sleutel ' + sleutel.substring(0, 4) + '…'); } catch (_) {}
      return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Ongeldig admin-token.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = getLicentieSheet_();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sleutelCol = headers.indexOf('Sleutel');
    const statusCol = headers.indexOf('Status');
    if (sleutelCol < 0 || statusCol < 0) throw new Error('Sheet-format onjuist');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sleutelCol]).toUpperCase() === sleutel.toUpperCase()) {
        sheet.getRange(i + 1, statusCol + 1).setValue('Ingetrokken');
        // CYCLE-31: ruim drip-state op zodat ScriptProperty-quota niet
        // accumuleert. Best-effort — failure mag revoke niet blokkeren.
        _verwijderDripKeys_(sleutel);
        // CYCLE-14: audit-log voor security-significant event (admin trekt
        // licentie in). Logger.log + sheet-write zodat owner kan reconstrueren.
        try {
          Logger.log('Licentie ingetrokken: ' + sleutel.substring(0, 8) + '… op ' + new Date().toISOString());
          // Probeer ook in audit-tabblad als die bestaat (defense in depth)
          const ss = SpreadsheetApp.openById(
            PropertiesService.getScriptProperties().getProperty('LICENTIE_SHEET_ID') || ''
          );
          if (ss) {
            let auditSheet = ss.getSheetByName('Revoke-audit');
            if (!auditSheet) {
              auditSheet = ss.insertSheet('Revoke-audit');
              auditSheet.appendRow(['Datum', 'Sleutel (eerste 8)', 'Status', 'Sheet-rij']);
            }
            auditSheet.appendRow([new Date(), sleutel.substring(0, 8) + '…', 'Ingetrokken', i + 1]);
          }
        } catch (_) {}
        return ContentService.createTextOutput(JSON.stringify({ ok: true, bericht: 'Sleutel ingetrokken.' }))
          .setMimeType(ContentService.MimeType.JSON);
    }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Sleutel niet gevonden.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // CYCLE-14: zelfde err.message-lek-fix als roteer
    Logger.log('revokeEndpoint_ fout: ' + (err && err.message || err));
    return ContentService.createTextOutput(JSON.stringify({ ok: false, fout: 'Interne fout — neem contact op met support.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Activation-throttling: max N actieve SS-bindingen per licentie.
 * Voeg aan valideerEndpoint_ toe: bij Nde activatie → blokkeer.
 *
 * Implementatie: bij elke valideer-call, log SS-id in 'Bindings'-tab van
 * licence-sheet. Tel unieke SS-ids per sleutel. Boven max → 'Te veel
 * activaties' melding.
 *
 * Roep aan: const blok = checkActivationCap_(sleutel, ssId, 3);
 *           if (blok) return error-output;
 */
function checkActivationCap_(sleutel, ssId, maxBindings) {
  if (!sleutel || !ssId) return null;
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('LICENTIE_SHEET_ID'));
    let bindings = ss.getSheetByName('Bindings');
    if (!bindings) {
      bindings = ss.insertSheet('Bindings');
      bindings.getRange(1, 1, 1, 4).setValues([['Sleutel', 'SS-ID', 'EersteCheck', 'LaatsteCheck']]);
    }
    const data = bindings.getDataRange().getValues();
    const ssIdsVoorSleutel = new Set();
    let bestaandeRij = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === sleutel) {
        ssIdsVoorSleutel.add(String(data[i][1]));
        if (String(data[i][1]) === ssId) bestaandeRij = i + 1;
      }
    }
    // Update LaatsteCheck of voeg nieuwe binding toe
    if (bestaandeRij > 0) {
      bindings.getRange(bestaandeRij, 4).setValue(new Date());
      return null;  // OK — bestaande binding
    }
    if (ssIdsVoorSleutel.size >= maxBindings) {
      return {
        ok: false,
        fout: 'Deze licentie is al ' + ssIdsVoorSleutel.size + 'x geactiveerd (max ' + maxBindings + ').',
        actie: 'Vraag een nieuwe sleutel aan via /api/licentie/roteer of mail support@boekhoudbaar.nl',
      };
    }
    bindings.appendRow([sleutel, ssId, new Date(), new Date()]);
    return null;
  } catch (e) {
    Logger.log('checkActivationCap_ fout: ' + e.message);
    return null;  // fail-open
  }
}

// ─────────────────────────────────────────────
//  DRIP EMAIL CAMPAIGN — dag 3, 7, 14, 30
// ─────────────────────────────────────────────
//
// Doel: klant bij eerste paar weken niet kwijtraken. Standaard verliest 60%
// van de SaaS-klanten interesse na dag-0; drips bouwen engagement én tonen
// dat product écht werkt.
//
// Schedule per drip:
//   dag 3:  "Hoe gaat het? — eerste-factuur tip"
//   dag 7:  "BTW-deadline weet je al?" (als kwartaal-eind nadert)
//   dag 14: "Klaar voor je accountant?" (zachte upgrade-prompt)
//   dag 30: "Eén maand boekhouden — feedback?" (NPS + review-vraag)
//
// Trigger: dagelijks 09:00 via time-based trigger 'verstuurDripsDagelijks_'.
// State: kolom 5 ('Drip-status') in licentie-sheet — bevat csv "d3,d7,d14,d30"
// van verstuurde dagen. Idempotent — kan veilig 2x draaien.

const DRIP_SCHEDULE = [
  { dag: 3,  vlag: 'd3',  onderwerp: 'Hoe gaat het met je eerste factuur? 💼' },
  { dag: 7,  vlag: 'd7',  onderwerp: 'BTW-aangifte deadline — wist je dat?' },
  { dag: 14, vlag: 'd14', onderwerp: 'Boekhoudbaar voor je accountant — handig?' },
  { dag: 30, vlag: 'd30', onderwerp: 'Eén maand Boekhoudbaar — wat vind je?' },
];

/**
 * Dagelijkse trigger — scan licentie-sheet voor klanten die een drip
 * verdienen op basis van aanmaakdatum + nog-niet-verzonden status.
 *
 * Installeren via editor: run installeerDripTrigger_() éénmalig.
 */
function verstuurDripsDagelijks_() {
  try {
    const sheet = getLicentieSheet_();
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getDataRange().getValues();
    const props = PropertiesService.getScriptProperties();
    const nu = Date.now();
    let verstuurd = 0;

    // Kolom-indices op basis van setupLicentieSheet (0-based):
    // [0]=Sleutel [1]=Naam [2]=Email [3]=Versie [4]=Status [5]=Vervaldatum
    // [6]=Installatie-ID [7]=Aangemaakt op [8]=Mollie betaling ID
    for (let i = 1; i < data.length; i++) {
      const sleutel       = String(data[i][0] || '').trim();
      const naam          = String(data[i][1] || '').trim();
      const email         = String(data[i][2] || '').trim();
      const status        = String(data[i][4] || '').trim();
      const aanmaakDatum  = data[i][7];

      if (!email || !sleutel) continue;
      const statusLow = status.toLowerCase();
      // CYCLE-30: startsWith('actief') ipv `=== 'actief' || indexOf('actief —')`.
      // Vorige check miste varianten 'Actief (handmatig)', 'Actief - trial'
      // (gewone dash ipv em-dash), 'Actief\tcustomvariant' → klanten in zulke
      // statussen kregen geen onboarding-drips → minder activatie + churn-risico.
      // Nu consistent met onboarded-/herstuur-/OTP-endpoints (cycles 13/15/29).
      if (!statusLow.startsWith('actief')) continue;
      if (!aanmaakDatum || !(aanmaakDatum instanceof Date)) continue;

      const dagenSinds = Math.floor((nu - aanmaakDatum.getTime()) / 86400000);
      if (dagenSinds < 3) continue;  // eerste drip is dag 3

      DRIP_SCHEDULE.forEach(function(drip) {
        if (dagenSinds < drip.dag) return;
        // State via ScriptProperties — voorheen werd Vervaldatum-kolom
        // overschreven met "d3,d7,..." wat data corrupteerde.
        const sentKey = 'drip_' + sleutel + '_' + drip.vlag;
        if (props.getProperty(sentKey) === 'sent') return;
        try {
          verstuurDripMail_(naam, email, sleutel, drip);
          props.setProperty(sentKey, 'sent');
          verstuurd++;
        } catch (mailErr) {
          Logger.log('Drip ' + drip.vlag + ' faalde voor ' + email + ': ' + mailErr.message);
        }
      });
    }
    if (verstuurd > 0) Logger.log('Drip-batch: ' + verstuurd + ' mails verstuurd.');
  } catch (e) {
    Logger.log('::error:: verstuurDripsDagelijks_ fout: ' + e.message);
  }
}

function verstuurDripMail_(naam, email, sleutel, drip) {
  const props        = PropertiesService.getScriptProperties();
  const brevoKey     = props.getProperty('BREVO_API_KEY')   || '';
  const vanEmail     = props.getProperty('VAN_EMAIL')       || 'info@boekhoudbaar.nl';
  const vanNaam      = props.getProperty('VAN_NAAM')        || 'Sam van Boekhoudbaar';
  const supportEmail = props.getProperty('SUPPORT_EMAIL')   || 'support@boekhoudbaar.nl';
  const productnm    = props.getProperty('PRODUCT_NAAM')    || 'Boekhoudbaar';
  const kvk          = props.getProperty('KVK_NUMMER')      || '';
  const btw          = props.getProperty('BTW_NUMMER')      || '';
  const privacyUrl   = props.getProperty('PRIVACY_URL')     || 'https://www.boekhoudbaar.nl/privacy';

  const inhoud = dripInhoud_(drip.dag, naam, productnm);
  const html = `<!DOCTYPE html><html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8fafc">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${inhoud.preheader}</div>
  <div style="background:#0D1B4E;padding:20px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700">${productnm}</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;line-height:1.6;font-size:14px">
    <p style="margin:0 0 12px">Hoi ${escHtml_(naam || 'daar')},</p>
    ${inhoud.body}
    <p style="margin:18px 0 0">Veel succes,<br>${escHtml_(vanNaam)}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 12px">
    <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0">
      Vragen of feedback? Reageer op deze mail of stuur naar
      <a href="mailto:${supportEmail}" style="color:#0D1B4E">${supportEmail}</a><br>
      Hoven Strategy &amp; Solutions${kvk ? ' · KvK ' + kvk : ''}${btw ? ' · BTW ' + btw : ''}<br>
      <a href="${privacyUrl}" style="color:#94a3b8">Privacy</a> ·
      <a href="mailto:${supportEmail}?subject=Unsubscribe%20drip" style="color:#94a3b8">Geen drip-mails meer</a>
    </p>
  </div>
</body></html>`;
  const text = (inhoud.preheader || '') + '\n\n' +
    'Hoi ' + (naam || 'daar') + ',\n\n' +
    inhoud.bodyTekst + '\n\n' +
    'Veel succes,\n' + vanNaam + '\n\n' +
    '---\n' +
    'Reageer op deze mail of: ' + supportEmail + '\n' +
    'Hoven Strategy & Solutions' + (kvk ? ' · KvK ' + kvk : '') + (btw ? ' · BTW ' + btw : '') + '\n' +
    'Geen drip-mails meer? mail: ' + supportEmail + ' subject: Unsubscribe drip\n';

  if (brevoKey) {
    try {
      const resp = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'post', contentType: 'application/json',
        headers: { 'api-key': brevoKey },
        payload: JSON.stringify({
          sender:  { name: vanNaam, email: vanEmail },
          replyTo: { email: supportEmail, name: vanNaam },
          to:      [{ email: email, name: naam }],
          subject: drip.onderwerp,
          htmlContent: html,
          textContent: text,
          tags: ['drip', drip.vlag],
          headers: { 'List-Unsubscribe': '<mailto:' + supportEmail + '?subject=Unsubscribe drip>' },
        }),
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() < 300) return;
      Logger.log('Brevo drip ' + drip.vlag + ' faalde HTTP ' + resp.getResponseCode());
    } catch (e) { Logger.log('Brevo drip exception: ' + e.message); }
  }
  // Fallback MailApp
  MailApp.sendEmail({
    to: email, subject: drip.onderwerp, body: text, htmlBody: html,
    replyTo: supportEmail, name: vanNaam,
  });
}

function dripInhoud_(dag, naam, productnm) {
  const naamSafe = naam || 'daar';
  if (dag === 3) {
    return {
      preheader: 'Hoe gaat het? Tip voor je eerste factuur.',
      body:
        '<p>Drie dagen geleden activeerde je ' + escHtml_(productnm) + ' — hopelijk loopt alles soepel.</p>' +
        '<p><strong>Tip voor je eerste factuur:</strong> houd het simpel. Eén regel, juiste BTW (21% standaard, 9% voor specifieke diensten zoals catering of fysiotherapie). De PDF wordt automatisch opgemaakt — geen Word nodig.</p>' +
        '<p>Vastgelopen? Open Boekhouding → Controle → ✅ Werkt-alles-test (12 punts gezondheidscheck).</p>',
      bodyTekst:
        'Drie dagen geleden activeerde je ' + productnm + ' — hopelijk loopt alles soepel.\n\n' +
        'Tip voor je eerste factuur: houd het simpel. Eén regel, juiste BTW (21% standaard, 9% specifiek). De PDF wordt automatisch opgemaakt.\n\n' +
        'Vastgelopen? Open Boekhouding → Controle → ✅ Werkt-alles-test.',
    };
  }
  if (dag === 7) {
    return {
      preheader: 'BTW-deadline volgende week of binnen 1 maand?',
      body:
        '<p>Een week ' + escHtml_(productnm) + ' achter de rug. Goede gewoonte ingebouwd?</p>' +
        '<p><strong>BTW-aangifte:</strong> NL-ZZP\'ers doen kwartaalaangifte. Deadlines:<br>' +
        '<strong>Q1</strong>: vóór 30 april · <strong>Q2</strong>: vóór 31 juli · <strong>Q3</strong>: vóór 31 oktober · <strong>Q4</strong>: vóór 31 januari.</p>' +
        '<p>Boekhoudbaar berekent automatisch — open <strong>Boekhouding → BTW → BTW-aangifte (kwartaal)</strong> en je hebt de cijfers in 30 seconden.</p>',
      bodyTekst:
        'Een week ' + productnm + ' achter de rug.\n\n' +
        'BTW-aangifte deadlines: Q1=30/4, Q2=31/7, Q3=31/10, Q4=31/1.\n' +
        'Boekhoudbaar berekent automatisch via Boekhouding → BTW.',
    };
  }
  if (dag === 14) {
    return {
      preheader: 'Je boekhouder mee laten kijken in 1 klik.',
      body:
        '<p>Twee weken ' + escHtml_(productnm) + '. Heb je al gedacht aan je accountant?</p>' +
        '<p><strong>Boekhouder mee laten kijken:</strong> in Google Sheets klik je op <strong>Delen</strong> rechtsboven, typ je het mailadres, en kies je rechten (alleen-lezen of bewerken). Geen extra licentie, geen tweede account.</p>' +
        '<p>Of: <strong>Boekhouding → Accountantspakket exporteren</strong> maakt een ZIP met PDF + XLSX + JSONL die je accountant kan inlezen in elk pakket (Snelstart, Exact, Twinfield).</p>',
      bodyTekst:
        'Twee weken ' + productnm + '.\n\n' +
        'Boekhouder mee laten kijken: klik Delen in Google Sheets en typ mailadres.\n' +
        'Of: Boekhouding → Accountantspakket exporteren = ZIP voor elk pakket.',
    };
  }
  if (dag === 30) {
    return {
      preheader: 'Hoe is je eerste maand? — 1-min feedback maakt me blij.',
      body:
        '<p>Een maand <strong>' + escHtml_(productnm) + '</strong> achter de rug. Ik ben benieuwd hoe het is gegaan.</p>' +
        '<p>Als je 30 seconden hebt: reageer op deze mail met antwoord op één van deze:</p>' +
        '<ul><li>Wat werkt goed?</li><li>Wat zou ik moeten verbeteren?</li><li>Zou je het aanraden? (1-10)</li></ul>' +
        '<p>Echte feedback maakt het product beter voor de volgende ZZP\'er. En als ik iets specifieks voor jou kan oplossen — zeg het.</p>',
      bodyTekst:
        'Een maand ' + productnm + '. Hoe is het gegaan?\n\n' +
        '30 seconden voor feedback?\n' +
        '- Wat werkt goed?\n' +
        '- Wat zou ik moeten verbeteren?\n' +
        '- Zou je het aanraden? (1-10)\n\n' +
        'Reageer op deze mail.',
    };
  }
  return { preheader: '', body: '<p>—</p>', bodyTekst: '—' };
}

/**
 * Eenmalig installeren in editor: run installeerDripTrigger_() handmatig.
 * Maakt time-based trigger 09:00 dagelijks. Idempotent — bestaande triggers
 * voor verstuurDripsDagelijks_ worden eerst verwijderd.
 */
function installeerDripTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'verstuurDripsDagelijks_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verstuurDripsDagelijks_')
    .timeBased().everyDays(1).atHour(9).create();
  Logger.log('Drip-trigger geïnstalleerd: 09:00 dagelijks');
}

// ─────────────────────────────────────────────
//  AFFILIATE + BOUNCE — sheet-uitbreidingen
// ─────────────────────────────────────────────
/**
 * Voegt idempotent de kolommen Verwijzer, Bouncestatus en Bouncereden toe
 * aan de Licenties-sheet. Bestaande klanten houden lege waarden.
 *
 * Wordt aangeroepen vanuit de Mollie-webhook en de Brevo-webhook zodat
 * oude installaties zelfheel-baar zijn zonder handmatige migratie.
 */
function borgExtraKolommen_(sheet) {
  if (!sheet) sheet = getLicentieSheet_();
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return; // leeg blad — setupLicentieSheet zet headers
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const verwacht = ['Verwijzer', 'Bouncestatus', 'Bouncereden'];
  let teVoegen = verwacht.filter(function(h) { return headers.indexOf(h) === -1; });
  if (!teVoegen.length) return;
  const start = lastCol + 1;
  sheet.getRange(1, start, 1, teVoegen.length).setValues([teVoegen])
    .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
}

/**
 * Vindt het 0-based kolomindex van een header op de Licenties-sheet.
 * Returns -1 als de kolom niet bestaat (caller moet borgExtraKolommen_ eerst aanroepen).
 */
function kolomIndex_(sheet, naam) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.indexOf(naam);
}

// ─────────────────────────────────────────────
//  BREVO BOUNCE-WEBHOOK
// ─────────────────────────────────────────────
/**
 * Verwerkt een Brevo Transactional Webhook event.
 *
 * Brevo POST body (JSON):
 *   { event: "hard_bounce" | "soft_bounce" | "spam" | "invalid_email" | ...,
 *     email: "klant@voorbeeld.nl", reason: "...", date: "...", ... }
 *
 * Authenticatie: query-parameter `?token=<BREVO_WEBHOOK_TOKEN>` moet
 * matchen met de ScriptProperty. Brevo ondersteunt geen native HMAC-
 * signature; een ondoorzichtige token in de URL is de officiële aanpak
 * (URL wordt alleen aan Brevo gegeven via hun dashboard, niet publiek).
 *
 * Side-effects:
 *  - hard_bounce / invalid_email / spam → markeer email als ongeldig
 *    (Bouncestatus = 'hard') en zet Status van actieve licenties op
 *    'Bounce' zodat verdere drips niet versturen.
 *  - soft_bounce → noteer als 'soft' (info-only, geen Status-wijziging).
 */
function verwerkBrevoBounce_(e) {
  const props = PropertiesService.getScriptProperties();
  const verwachteToken = props.getProperty('BREVO_WEBHOOK_TOKEN');
  if (!verwachteToken) {
    Logger.log('BREVO_WEBHOOK_TOKEN niet ingesteld — webhook genegeerd');
    return;
  }
  const aangeleverd = (e && e.parameter && e.parameter.token) || '';
  if (!veiligVergelijk_(aangeleverd, verwachteToken)) {
    Logger.log('Brevo webhook: ongeldig token (eerste 4: ' +
      String(aangeleverd).substring(0, 4) + '…)');
    throw new Error('Unauthorized'); // 500 → Brevo retried, ops kan investigation doen
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    Logger.log('Brevo webhook: JSON-parse fout: ' + parseErr.message);
    return;
  }

  const event = String(payload.event || '').toLowerCase();
  const email = String(payload.email || '').trim().toLowerCase();
  const reden = String(payload.reason || payload['delivery_status'] || '').substring(0, 240);
  if (!event || !email) return;

  const hardBounceEvents = ['hard_bounce', 'invalid_email', 'spam', 'blocked', 'unsubscribed'];
  const softBounceEvents = ['soft_bounce', 'deferred'];
  let bounceStatus = '';
  if (hardBounceEvents.indexOf(event) !== -1) bounceStatus = 'hard';
  else if (softBounceEvents.indexOf(event) !== -1) bounceStatus = 'soft';
  else return; // delivered / opened / clicked → genegeerd

  // Cache idempotency-key: zelfde event+email+timestamp niet dubbel verwerken
  const cache = CacheService.getScriptCache();
  const cacheKey = 'brevo_' + event + '_' + email + '_' +
    String(payload.date || payload.ts || '').substring(0, 32);
  if (cache.get(cacheKey) === 'done') return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('Lock timeout Brevo ' + email);

  try {
    const sheet = getLicentieSheet_();
    borgExtraKolommen_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const emailCol  = headers.indexOf('Email');
    const statusCol = headers.indexOf('Status');
    const bsCol     = headers.indexOf('Bouncestatus');
    const brCol     = headers.indexOf('Bouncereden');
    if (emailCol === -1 || bsCol === -1 || brCol === -1) {
      Logger.log('Brevo webhook: verwachte kolommen niet gevonden');
      return;
    }
    const data = sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), sheet.getLastColumn()).getValues();
    let geraakt = 0;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][emailCol]).toLowerCase() === email) {
        const rij = i + 2; // header-rij = 1
        sheet.getRange(rij, bsCol + 1).setValue(bounceStatus);
        sheet.getRange(rij, brCol + 1).setValue(reden + ' · ' + new Date().toISOString().substring(0, 10));
        // Bij hard-bounce: stop alle drips door Status op 'Bounce' te zetten.
        // CYCLE-32: startsWith('actief') ipv strict equality. Klanten met
        // varianten 'Actief (handmatig)' / 'Actief — trial' werden eerder
        // overgeslagen → drips bleven naar bounce-adres gestuurd worden →
        // Brevo-quota verspild + sender reputation hit. Nu consistent met
        // cycles 13/15/29/30.
        if (bounceStatus === 'hard' && statusCol !== -1 &&
            String(data[i][statusCol] || '').toLowerCase().startsWith('actief')) {
          sheet.getRange(rij, statusCol + 1).setValue('Bounce');
        }
        geraakt++;
      }
    }
    cache.put(cacheKey, 'done', 21600);
    Logger.log('Brevo bounce verwerkt: ' + event + ' voor ' + email +
      ' (' + geraakt + ' rijen geraakt)');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Setup-helper: roep eenmalig handmatig aan in de editor om een token
 * te genereren en in de ScriptProperties op te slaan. Geef de URL aan
 * Brevo (dashboard → Transactional → Settings → Webhook):
 *   <WEB_APP_EXEC_URL>?token=<TOKEN>
 *
 * Belangrijk: ScriptApp.getService().getUrl() geeft vanuit de editor de
 * `/dev` URL terug — die werkt NIET voor externe webhooks (Brevo krijgt
 * dan een Google-login-redirect en faalt stil). Daarom leest deze helper
 * de echte deployment-URL uit ScriptProperty `WEB_APP_EXEC_URL`.
 *
 * Eerste setup:
 *   1. Deploy → Manage deployments → kopieer de Web app URL (eindigt op /exec)
 *   2. Project Settings → Script Properties → voeg toe:
 *        WEB_APP_EXEC_URL = https://script.google.com/macros/s/<ID>/exec
 *   3. Run deze functie → kopieer de URL uit Logs → plak in Brevo dashboard
 */
function setupBrevoWebhookToken() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('BREVO_WEBHOOK_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('BREVO_WEBHOOK_TOKEN', token);
  }
  const execUrl = props.getProperty('WEB_APP_EXEC_URL');
  if (!execUrl || !/\/exec$/.test(execUrl)) {
    Logger.log('::error:: WEB_APP_EXEC_URL ontbreekt of eindigt niet op /exec.');
    Logger.log('Stappen: Deploy → Manage deployments → kopieer de Web app URL ' +
      '(eindigt op /exec) → Project Settings → Script Properties → ' +
      'voeg WEB_APP_EXEC_URL toe. Daarna deze functie opnieuw runnen.');
    Logger.log('Token alvast opgeslagen: ' + token);
    return null;
  }
  const url = execUrl + '?token=' + token;
  Logger.log('Brevo webhook URL (plak in Brevo dashboard):\n' + url);
  return url;
}

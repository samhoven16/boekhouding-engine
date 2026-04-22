/**
 * Boekhouding Engine — Licentieverificatieserver
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
 *   PRODUCT_NAAM        — bijv. "Boekhouding Engine"
 *   PRODUCT_PRIJS       — bijv. "49.00"  (excl. BTW, in EUR)
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

  const actie = (e && e.parameter && e.parameter.actie) || '';

  if (actie === 'health')        return healthEndpoint_();
  if (actie === 'valideer')      return valideerEndpoint_(e);
  if (actie === 'aanvraag-otp')  return aanvraagOtpEndpoint_(e);
  if (actie === 'activeer-otp')  return activeerOtpEndpoint_(e);
  if (actie === 'onboarded')     return onboardedEndpoint_(e);
  if (actie === 'config')        return configEndpoint_(e);
  if (actie === 'bedankt')       return bedanktPagina_(e);
  if (actie === 'admin')         return adminPaneel_(e);

  // Standaard: betaalpagina tonen
  return betaalPagina_(e);
}


function doPost(e) {
  try {
    verwerkMollieWebhook_(e);
    return ContentService.createTextOutput('OK');
  } catch (err) {
    Logger.log('Webhook fout: ' + err.message);
    // Non-200 triggers Mollie retry (max 10x over 26 uur)
    return ContentService.createTextOutput('ERROR: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
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

function betaalPagina_(e) {
  const props = PropertiesService.getScriptProperties();
  const naam  = props.getProperty('PRODUCT_NAAM')  || 'Boekhoudbaar';
  const prijs = props.getProperty('PRODUCT_PRIJS') || '49';

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
  .herroepingsrecht input[type=checkbox]{width:auto;margin-top:3px;flex-shrink:0;accent-color:#2EC4B6}
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
    .maakBetaling(naam, email);
}
function toonFout(t){var e=document.getElementById('fout');e.textContent=t;e.style.display='block';}
</script></body></html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle(naam + ' — Aankoop')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─────────────────────────────────────────────
//  BETAALPAGINA: BETALING AANMAKEN (Mollie)
// ─────────────────────────────────────────────
function maakBetaling(klantnaam, klantEmail) {
  klantnaam  = String(klantnaam  || '').trim();
  klantEmail = String(klantEmail || '').trim().toLowerCase();
  if (!klantnaam || !klantEmail) return { fout: 'Naam en e-mail zijn verplicht.' };

  const props     = PropertiesService.getScriptProperties();
  const mollieKey = props.getProperty('MOLLIE_API_KEY');
  const prijs     = props.getProperty('PRODUCT_PRIJS') || '49.00';
  const productnm = props.getProperty('PRODUCT_NAAM')  || 'Boekhouding Engine';
  const webAppUrl = ScriptApp.getService().getUrl();

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
        metadata:    { naam: klantnaam, email: klantEmail },
        method:      ['ideal', 'creditcard', 'bancontact'],
      }),
      muteHttpExceptions: true,
    });

    const data = JSON.parse(resp.getContentText());
    if (data.status >= 400 || !data._links) {
      Logger.log('Mollie fout: ' + resp.getContentText());
      return { fout: 'Betaling aanmaken mislukt. Probeer opnieuw.' };
    }
    return { checkoutUrl: data._links.checkout.href };
  } catch (err) {
    Logger.log('maakBetaling fout: ' + err.message);
    return { fout: 'Netwerkfout bij betaling aanmaken.' };
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
    const sleutel = genereerSleutel_();

    sheet.appendRow([
      sleutel, naam, email, 'Standaard', 'Actief', '',
      '', new Date(), paymentId, new Date(),
    ]);

    // Sla op in cache zodat retries direct stoppen
    cache.put(cacheKey, 'done', 21600);

    // Stuur licentiecode per e-mail
    if (email) stuurLicentiemail_(naam, email, sleutel);

    Logger.log('Licentie aangemaakt: ' + sleutel + ' voor ' + email);

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
    if (String(data[i][2]).toLowerCase() === email &&
        String(data[i][4]).toLowerCase() === 'actief') { gevonden = true; break; }
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

  const otp = String(Math.floor(100000 + Math.random() * 900000));
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
    return jsonResp_({ ok: false, fout: 'Code verlopen (geldig 15 min). Vraag een nieuwe code aan.' });
  }
  if (otpObj.code !== otp) return jsonResp_({ ok: false, fout: 'Onjuiste code. Controleer je e-mail.' });

  // Eenmalig gebruik — code direct verwijderen
  props.deleteProperty('otp_' + email);
  props.deleteProperty('otp_ts_' + email);

  // Zoek actieve licentie voor dit e-mailadres
  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() !== email) continue;
    if (String(data[i][4]).toLowerCase() !== 'actief') continue;

    const sleutel    = String(data[i][0]);
    const naam       = String(data[i][1]);
    const huidigSsId = String(data[i][6] || '');

    if (ssId) {
      if (!huidigSsId) {
        sheet.getRange(i + 1, 7).setValue(ssId); // Eerste activatie — bind spreadsheet-ID
      } else if (huidigSsId !== ssId) {
        return jsonResp_({ ok: false, fout: 'Licentie is al actief op een andere spreadsheet. Neem contact op via hallo@boekhoudbaar.nl' });
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
  const vanEmail = props.getProperty('VAN_EMAIL')     || 'hallo@boekhoudbaar.nl';
  const vanNaam  = props.getProperty('VAN_NAAM')      || 'Boekhoudbaar';

  const html = `<!DOCTYPE html><html lang="nl"><body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#f8fafc">
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
  </div></body></html>`;

  if (brevoKey) {
    try {
      UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'post', contentType: 'application/json',
        headers: { 'api-key': brevoKey, 'accept': 'application/json' },
        payload: JSON.stringify({
          sender: { name: vanNaam, email: vanEmail },
          to: [{ email }],
          subject: 'Je activeringscode Boekhoudbaar: ' + otp,
          htmlContent: html,
        }),
        muteHttpExceptions: true,
      });
      return;
    } catch (_) {}
  }
  MailApp.sendEmail(email, 'Activeringscode Boekhoudbaar: ' + otp,
    'Code: ' + otp + '\n\nGeldig 15 minuten. Voer in via de spreadsheet.', { htmlBody: html });
}

// ─────────────────────────────────────────────
//  VALIDEER-ENDPOINT (aangeroepen door Licentie.gs)
// ─────────────────────────────────────────────
function valideerEndpoint_(e) {
  const sleutel      = String((e.parameter.sleutel     || '')).trim().toUpperCase();
  const installatieId = String((e.parameter.installatie || '')).trim();

  if (!sleutel) return jsonResp_({ geldig: false, fout: 'Geen sleutel opgegeven.' });

  try {
    const sheet = getLicentieSheet_();
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() !== sleutel) continue;

      const status    = String(data[i][4]).toLowerCase();
      const vervaldat = data[i][5] ? new Date(data[i][5]) : null;

      if (status === 'ingetrokken') return jsonResp_({ geldig: false, fout: 'Licentie is ingetrokken.' });
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
  try { flags = JSON.parse(props.getProperty('FEATURE_FLAGS') || '{}'); } catch (_) {}
  return jsonResp_({
    versie:  props.getProperty('PRODUCT_VERSIE') || '2.1.0',
    bericht: props.getProperty('GLOBAL_BERICHT') || '',
    flags:   flags,
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

  if (!ww || input !== ww) {
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
  const vanEmail    = props.getProperty('VAN_EMAIL')       || 'hallo@boekhoudbaar.nl';
  const vanNaam     = props.getProperty('VAN_NAAM')        || 'Sam van Boekhoudbaar';
  const kvk         = props.getProperty('KVK_NUMMER')      || '';
  const btw         = props.getProperty('BTW_NUMMER')      || '';
  const privacyUrl  = props.getProperty('PRIVACY_URL')     || 'https://www.boekhoudbaar.nl/privacy';

  // Guard — zonder TEMPLATE_SS_ID kan de klant de copy-link niet gebruiken.
  // Stuur een alert naar de eigenaar en markeer de licentie-rij zichtbaar.
  if (!templateId) {
    Logger.log('::error:: TEMPLATE_SS_ID ontbreekt — klant ' + email + ' (' + sleutel + ') wacht op activatielink.');
    try { markeerTemplateOntbreekt_(sleutel); } catch (_) {}
    try {
      MailApp.sendEmail({
        to: vanEmail,
        subject: '⚠ Boekhoudbaar — TEMPLATE_SS_ID ontbreekt (' + email + ' wacht)',
        htmlBody: '<p>Nieuwe klant <strong>' + escHtml_(naam) + '</strong> (' + escHtml_(email) + ') heeft betaald ' +
                  'maar de copy-link kan niet worden opgebouwd omdat <code>TEMPLATE_SS_ID</code> ' +
                  'ontbreekt in Script Properties.</p>' +
                  '<p>Licentiesleutel: <code>' + escHtml_(sleutel) + '</code></p>' +
                  '<p>Vul <code>TEMPLATE_SS_ID</code> en run <code>herstuurLicentiemailHandmatig(&quot;' +
                  escHtml_(sleutel) + '&quot;)</code> in de editor.</p>',
      });
    } catch (_) {}
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

  const htmlBody = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8fafc">
  <div style="background:#0D1B4E;padding:28px 24px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.01em">${productnm}</h1>
    <p style="color:#B8C2D1;margin:6px 0 0;font-size:14px">Bestelling bevestigd — je boekhouding staat klaar</p>
  </div>
  <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
    <p style="font-size:16px">Hoi ${naam},</p>
    <p>Gefeliciteerd met je aankoop van ${productnm}! Je boekhouding staat klaar om te activeren.</p>
    ${stappenHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:13px;color:#94a3b8">
      Vragen? Stuur een e-mail naar <a href="mailto:${vanEmail}" style="color:#0D1B4E">${vanEmail}</a>.
    </p>
    <p style="font-size:12px;color:#cbd5e1">
      ${productnm}${kvk ? ' · KVK ' + kvk : ''}${btw ? ' · BTW ' + btw : ''} · <a href="${privacyUrl}" style="color:#94a3b8">Privacybeleid</a>
    </p>
  </div>
</body></html>`;

  if (brevoKey) {
    UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'api-key': brevoKey },
      payload: JSON.stringify({
        sender:      { name: vanNaam, email: vanEmail },
        to:          [{ email: email, name: naam }],
        subject:     'Je ' + productnm + ' is klaar — activeer nu 🚀',
        htmlContent: htmlBody,
        tags:        ['licentie', 'dag0'],
        params:      { naam: naam },
      }),
      muteHttpExceptions: true,
    });
  } else {
    MailApp.sendEmail({ to: email, subject: 'Je ' + productnm + ' is klaar — activeer nu', htmlBody: htmlBody });
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function deel() {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  return 'BKHE-' + deel() + '-' + deel() + '-' + deel();
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
  const ss = SpreadsheetApp.create('Boekhouding Engine — Licentiebeheer');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LICENTIE_SHEET_ID', ss.getId());

  // Stel alleen niet-gevoelige defaults in. Gevoelige properties
  // (MOLLIE_API_KEY, ADMIN_WACHTWOORD, BREVO_API_KEY, TEMPLATE_SS_ID,
  // KVK_NUMMER, BTW_NUMMER) moeten handmatig worden ingevuld per
  // environment — nooit hardcoden.
  if (!props.getProperty('PRODUCT_NAAM'))  props.setProperty('PRODUCT_NAAM',  'Boekhouding Engine');
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
    sleutel, 'Handmatig', '', 'Standaard', 'Actief', '', '', new Date(), 'HANDMATIG', '',
  ]);
  Logger.log('Nieuwe sleutel: ' + sleutel);
  SpreadsheetApp.getUi().alert('Nieuwe licentiesleutel', sleutel, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ─────────────────────────────────────────────────────────────
//  BREVO FOLLOW-UP SEQUENTIES
//  Dag 3 / 7 / 14 / 30 / 60 / 90 na activatie
//  Trigger: dagelijkse GAS time-based trigger (zie installeelFollowUpTrigger_)
// ─────────────────────────────────────────────────────────────

const FOLLOWUP_SCHEMA = [
  {
    dag: 3,
    onderwerp: 'Je eerste BTW-aangifte met Boekhoudbaar',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Je hebt Boekhoudbaar nu 3 dagen. Tijd voor je eerste BTW-aangifte tip:</p>
<ul>
  <li>Ga naar <strong>Boekhouding → BTW → Genereer BTW-aangifte</strong></li>
  <li>Kies het juiste kwartaal</li>
  <li>Kopieer de bedragen naar Mijn Belastingdienst</li>
</ul>
<p>Duurt letterlijk 5 minuten. 💪</p>
<p>Heb je vragen? Stuur gewoon een reply op deze mail.</p>`,
  },
  {
    dag: 7,
    onderwerp: 'Heb je al je eerste factuur verstuurd?',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Een week geleden heb je Boekhoudbaar geactiveerd. Heb je al je eerste factuur verstuurd?</p>
<p>Zo maak je een factuur:</p>
<ol>
  <li>Open je spreadsheet</li>
  <li>Klik op <strong>Boekhouding → Nieuwe boeking → Verkoopfactuur</strong></li>
  <li>Vul klantgegevens en bedrag in</li>
  <li>Klik op Verzenden — je klant ontvangt direct een PDF</li>
</ol>
<p>Tip: sla je klantgegevens één keer op in het Relaties-tabblad, daarna worden ze automatisch ingevuld.</p>`,
  },
  {
    dag: 14,
    onderwerp: 'Belastingvoordelen die je (waarschijnlijk) misloopt',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Als ZZP-er heb je recht op aftrekposten die veel ondernemers vergeten:</p>
<ul>
  <li><strong>Zelfstandigenaftrek</strong> — €2.470 als je ≥1.225 uur werkt</li>
  <li><strong>Thuiswerkaftrek</strong> — €2,40 per dag dat je thuis werkt</li>
  <li><strong>KIA</strong> — 28% extra aftrek op investeringen ≥€2.801</li>
  <li><strong>MKB-winstvrijstelling</strong> — 12,7% van je winst is vrijgesteld</li>
</ul>
<p>Boekhoudbaar berekent dit automatisch via <strong>Boekhouding → Belastingadvies → Genereer belastingadvies</strong>.</p>`,
  },
  {
    dag: 30,
    onderwerp: 'Je eerste maand — hoe staat je boekhouding ervoor?',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Je gebruikt Boekhoudbaar nu een maand. Goed moment voor een check:</p>
<ul>
  <li>✅ Alle facturen van deze maand geboekt?</li>
  <li>✅ Kosten geboekt (abonnementen, materialen, reiskosten)?</li>
  <li>✅ Dashboard bekeken? (<strong>Boekhouding → Dashboard openen</strong>)</li>
  <li>✅ Bankafschriften vergeleken?</li>
</ul>
<p>Een maand bijwerken duurt 15-30 minuten. Als je dat elke maand doet, heb je aan het einde van het jaar geen stress.</p>`,
  },
  {
    dag: 60,
    onderwerp: 'Kwartaal bijna voorbij — BTW aangifte checklist',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Het kwartaal loopt bijna af. Checklist voor je BTW-aangifte:</p>
<ol>
  <li>Alle verkoopfacturen geboekt? Check je Verkoopfacturen-tab</li>
  <li>Alle inkoopfacturen (met BTW) geboekt? Check je Inkoopfacturen-tab</li>
  <li>Genereer je aangifte: <strong>Boekhouding → BTW → Genereer BTW-aangifte</strong></li>
  <li>Dien in via mijn.belastingdienst.nl voor het einde van de maand</li>
</ol>
<p>Deadline Q1: 30 april · Q2: 31 juli · Q3: 31 oktober · Q4: 31 januari</p>`,
  },
  {
    dag: 90,
    onderwerp: 'Drie maanden Boekhoudbaar — wat heb je al bespaard?',
    html: (naam) => `<p>Hoi ${naam},</p>
<p>Je gebruikt Boekhoudbaar al 3 maanden. Wat je al hebt bespaard vs. een abonnement:</p>
<ul>
  <li>Moneybird zou nu al €45–€117 gekost hebben</li>
  <li>e-Boekhouden: €30–€72</li>
  <li>Jij: €49 eenmalig — en dat blijft zo</li>
</ul>
<p>Tevreden? Help een andere ZZP-er door Boekhoudbaar te delen. Of word partner (commissie per doorverwezen klant) — stuur een reply.</p>`,
  },
];

/**
 * Wikkelt een follow-up-bodyHTML in een brand-aligned e-mail-shell
 * (navy header, neutrale body, subtiele footer met contact). Zo krijgen
 * alle 6 follow-ups dezelfde premium uitstraling als de activatie-mail.
 */
function wrapFollowUpHtml_(onderwerp, bodyHtml, vanEmail) {
  return '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>' +
'<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;' +
  'max-width:580px;margin:0 auto;padding:20px;color:#1A1A1A;background:#F7F9FC">' +
'<div style="background:#0D1B4E;padding:22px 24px;border-radius:10px 10px 0 0">' +
  '<div style="color:#2EC4B6;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px">Boekhoudbaar</div>' +
  '<h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;letter-spacing:-0.01em;line-height:1.3">' + escHtml_(onderwerp) + '</h1>' +
'</div>' +
'<div style="background:#fff;padding:24px;border:1px solid #E5EAF2;border-top:none;border-radius:0 0 10px 10px;font-size:14px;line-height:1.65;color:#1A1A1A">' +
  bodyHtml +
  '<hr style="border:none;border-top:1px solid #E5EAF2;margin:22px 0">' +
  '<p style="font-size:12px;color:#5F6B7A;margin:0">Vragen? Beantwoord deze mail of stuur naar <a href="mailto:' + escHtml_(vanEmail) + '" style="color:#0D1B4E">' + escHtml_(vanEmail) + '</a>.</p>' +
'</div>' +
'<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:12px">' +
  'Je ontvangt deze tip-serie omdat je Boekhoudbaar hebt geactiveerd. Reageer met "stop" om af te melden.' +
'</p>' +
'</body></html>';
}

/**
 * Controleert alle actieve licenties en stuurt follow-up emails op de juiste dag.
 * Aanroepen via een dagelijkse GAS time-based trigger.
 */
function verwerkFollowUpEmails() {
  const props = PropertiesService.getScriptProperties();
  const brevoKey = props.getProperty('BREVO_API_KEY') || '';
  const vanEmail = props.getProperty('VAN_EMAIL') || 'hallo@boekhoudbaar.nl';
  const vanNaam  = props.getProperty('VAN_NAAM')  || 'Sam van Boekhoudbaar';

  if (!brevoKey) {
    Logger.log('verwerkFollowUpEmails: BREVO_API_KEY niet ingesteld, overgeslagen.');
    return;
  }

  const ss = getSpreadsheet_();
  if (!ss) return;
  const sheet = ss.getSheetByName('Licenties');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  // Kolom-indices op basis van setupLicentieSheet (0-based):
  // [0]=LicentieID [1]=Sleutel [2]=Naam [3]=Email [4]=Status [5]=ActivatieDatum
  data.slice(1).forEach((rij, idx) => {
    const status       = String(rij[4] || '').toLowerCase();
    const naam         = String(rij[2] || 'ondernemer');
    const email        = String(rij[3] || '');
    const activatieDag = rij[5] instanceof Date ? rij[5] : new Date(rij[5]);

    if (status !== 'actief' || !email || isNaN(activatieDag.getTime())) return;

    activatieDag.setHours(0, 0, 0, 0);
    const dagenSindsActivatie = Math.round((vandaag - activatieDag) / (1000 * 60 * 60 * 24));

    FOLLOWUP_SCHEMA.forEach(seq => {
      if (dagenSindsActivatie !== seq.dag) return;

      const sentKey = 'followup_' + String(rij[1]) + '_dag' + seq.dag;
      if (props.getProperty(sentKey) === 'sent') return;  // idempotency

      try {
        const voornaam = naam.split(' ')[0] || naam;
        const payload = {
          sender:      { email: vanEmail, name: vanNaam },
          to:          [{ email, name: naam }],
          subject:     seq.onderwerp,
          htmlContent: wrapFollowUpHtml_(seq.onderwerp, seq.html(voornaam), vanEmail),
          tags:        ['followup', 'dag' + seq.dag],
        };

        const resp = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'api-key': brevoKey },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });

        if (resp.getResponseCode() === 201) {
          props.setProperty(sentKey, 'sent');
          Logger.log('Follow-up dag ' + seq.dag + ' verstuurd naar ' + email);
        } else {
          Logger.log('Follow-up dag ' + seq.dag + ' FOUT voor ' + email + ': ' + resp.getContentText());
        }
      } catch (e) {
        Logger.log('Follow-up dag ' + seq.dag + ' EXCEPTION voor ' + email + ': ' + e.message);
      }
    });
  });
}

/**
 * Installeert de dagelijkse follow-up trigger (idempotent).
 * Eénmalig uitvoeren na deployment.
 */
function installeelFollowUpTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const alAanwezig = triggers.some(t => t.getHandlerFunction() === 'verwerkFollowUpEmails');
  if (alAanwezig) {
    Logger.log('Follow-up trigger al aanwezig.');
    return;
  }
  ScriptApp.newTrigger('verwerkFollowUpEmails')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  Logger.log('Follow-up trigger aangemaakt: dagelijks 09:00.');
}

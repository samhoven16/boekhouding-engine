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

  if (actie === 'health')    return healthEndpoint_();
  if (actie === 'valideer')  return valideerEndpoint_(e);
  if (actie === 'bedankt')   return bedanktPagina_(e);
  if (actie === 'admin')     return adminPaneel_(e);

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
  })).setMimeType(ContentService.MimeType.JSON);
}

function betaalPagina_(e) {
  const props = PropertiesService.getScriptProperties();
  const naam  = props.getProperty('PRODUCT_NAAM')  || 'Boekhouding Engine';
  const prijs = props.getProperty('PRODUCT_PRIJS') || '49.00';

  const html = `<!DOCTYPE html><html lang="nl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${naam} — Aankoop</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
       background:linear-gradient(135deg,#1A237E,#283593);min-height:100vh;
       display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:440px;width:100%;
        box-shadow:0 20px 60px rgba(0,0,0,.3)}
  h1{color:#1A237E;font-size:22px;margin-bottom:4px}
  .prijs{font-size:36px;font-weight:700;color:#1A237E;margin:16px 0 4px}
  .sub{color:#666;font-size:13px;margin-bottom:20px}
  .voordelen{background:#E8EAF6;border-radius:8px;padding:14px 16px;margin-bottom:24px;
             font-size:13px;line-height:2;color:#333}
  label{display:block;font-weight:600;font-size:13px;margin-bottom:5px;color:#333}
  input{width:100%;padding:11px;border:1.5px solid #ddd;border-radius:8px;
        font-size:14px;margin-bottom:14px;transition:border-color .2s}
  input:focus{outline:none;border-color:#1A237E}
  .btn{width:100%;padding:15px;background:#1A237E;color:#fff;border:none;
       border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s}
  .btn:hover{background:#283593} .btn:disabled{background:#999;cursor:not-allowed}
  .fout{background:#FFEBEE;color:#c62828;padding:10px;border-radius:6px;
        font-size:13px;margin-top:10px;display:none}
  .veilig{text-align:center;font-size:11px;color:#999;margin-top:14px}
</style></head><body>
<div class="card">
  <h1>📊 ${naam}</h1>
  <div class="prijs">€${prijs}</div>
  <div class="sub">Eenmalige aankoop — geen abonnement — altijd van u</div>
  <div class="voordelen">
    ✅ Volledige boekhouding in Google Spreadsheets<br>
    ✅ PDF-facturen direct naar klanten sturen<br>
    ✅ BTW-aangifte automatisch berekend<br>
    ✅ Koppelbaar met uw website of webshop<br>
    ✅ Uw data blijft op uw eigen Google Drive
  </div>
  <label>Uw naam *</label>
  <input type="text" id="naam" placeholder="Jan Jansen" autocomplete="name">
  <label>E-mailadres *</label>
  <input type="email" id="email" placeholder="jan@uwbedrijf.nl" autocomplete="email">
  <div style="background:#F3F4F6;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#444;line-height:1.6">
    <label style="display:flex;gap:8px;align-items:flex-start;font-weight:normal;margin-bottom:8px">
      <input type="checkbox" id="cb1" style="width:auto;margin-top:2px;flex-shrink:0">
      <span>Ik verzoek uitdrukkelijk om directe levering van de digitale inhoud vóór het verstrijken van de herroepingstermijn.</span>
    </label>
    <label style="display:flex;gap:8px;align-items:flex-start;font-weight:normal;margin-bottom:0">
      <input type="checkbox" id="cb2" style="width:auto;margin-top:2px;flex-shrink:0">
      <span>Ik begrijp dat ik hiermee mijn herroepingsrecht verlies zodra de levering is gestart.</span>
    </label>
  </div>
  <button class="btn" id="btn" onclick="betaal()">Bestelling met betalingsverplichting — €${prijs} iDEAL</button>
  <div class="fout" id="fout"></div>
  <div class="veilig">Betaling via Mollie · Veilig &amp; versleuteld · Factuur per e-mail</div>
</div>
<script>
function betaal() {
  var naam  = document.getElementById('naam').value.trim();
  var email = document.getElementById('email').value.trim();
  if (!naam)  { toonFout('Vul uw naam in.'); return; }
  if (!email || !email.includes('@')) { toonFout('Vul een geldig e-mailadres in.'); return; }
  if (!document.getElementById('cb1').checked) { toonFout('Vink het eerste vakje aan om door te gaan.'); return; }
  if (!document.getElementById('cb2').checked) { toonFout('Vink het tweede vakje aan om door te gaan.'); return; }
  var btn = document.getElementById('btn');
  btn.disabled = true; btn.textContent = '⏳ Even geduld...';
  document.getElementById('fout').style.display = 'none';
  google.script.run
    .withSuccessHandler(function(res) {
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; }
      else { toonFout(res.fout || 'Betaling aanmaken mislukt.'); btn.disabled=false; btn.textContent='🔒 Veilig betalen met iDEAL →'; }
    })
    .withFailureHandler(function(e) { toonFout('Fout: '+e.message); btn.disabled=false; btn.textContent='🔒 Veilig betalen met iDEAL →'; })
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

    // Genereer en sla licentiesleutel op
    const meta    = betaling.metadata || {};
    const naam    = String(meta.naam  || 'Klant');
    const email   = String(meta.email || '');
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
//  BEDANKT-PAGINA (na Mollie redirect)
// ─────────────────────────────────────────────
function bedanktPagina_(e) {
  const html = `<!DOCTYPE html><html lang="nl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Betaling ontvangen</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
       background:#E8F5E9;min-height:100vh;display:flex;align-items:center;
       justify-content:center;padding:20px}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:460px;
        width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.12)}
  h1{color:#2E7D32;font-size:26px;margin:16px 0 8px}
  p{color:#555;font-size:14px;line-height:1.7;margin-bottom:12px}
  .info{background:#F1F8E9;border-radius:8px;padding:14px;font-size:13px;color:#33691E;margin:16px 0}
</style></head><body>
<div class="card">
  <div style="font-size:56px">🎉</div>
  <h1>Bedankt voor uw aankoop!</h1>
  <p>Uw betaling is ontvangen. U ontvangt binnen enkele minuten een e-mail met uw licentiesleutel en installatielink.</p>
  <div class="info">
    <strong>Controleer ook uw spam-map</strong> als u na 5 minuten nog niets heeft ontvangen.
  </div>
  <p style="font-size:12px;color:#999">U kunt dit venster sluiten.</p>
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

  const sheet = getLicentieSheet_();
  const data  = sheet.getDataRange().getValues();
  let rijen   = '';
  for (let i = 1; i < data.length; i++) {
    rijen += `<tr><td>${data[i][0]}</td><td>${data[i][1]}</td><td>${data[i][2]}</td>
      <td>${data[i][4]}</td><td>${data[i][6] || '—'}</td>
      <td>${data[i][9] ? new Date(data[i][9]).toLocaleDateString('nl-NL') : '—'}</td></tr>`;
  }

  return HtmlService.createHtmlOutput(`
    <style>body{font-family:Arial;padding:20px;font-size:13px}
    table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;
    border:1px solid #ddd;text-align:left}th{background:#1A237E;color:#fff}
    tr:nth-child(even){background:#f5f5f5}</style>
    <h3>Licenties (${data.length - 1} totaal)</h3>
    <table><tr><th>Sleutel</th><th>Naam</th><th>Email</th>
    <th>Status</th><th>Installatie-ID</th><th>Laatste validatie</th></tr>
    ${rijen}</table>
    <p style="margin-top:16px;font-size:11px;color:#999">
      Licenties beheren: open de licentie-spreadsheet rechtstreeks in Google Drive.</p>
  `).setTitle('Admin — Licentiebeheer');
}

// ─────────────────────────────────────────────
//  E-MAIL NAAR KLANT
// ─────────────────────────────────────────────
function stuurLicentiemail_(naam, email, sleutel) {
  const props        = PropertiesService.getScriptProperties();
  const productnm    = props.getProperty('PRODUCT_NAAM')   || 'Boekhoudbaar';
  const installerUrl = props.getProperty('INSTALLER_URL')  || '';
  const brevoKey     = props.getProperty('BREVO_API_KEY')  || '';
  const vanEmail     = props.getProperty('VAN_EMAIL')      || 'hallo@boekhoudbaar.nl';
  const vanNaam      = props.getProperty('VAN_NAAM')       || 'Sam van Boekhoudbaar';

  const activatieLink = installerUrl
    ? installerUrl + '?sleutel=' + encodeURIComponent(sleutel)
    : '';

  const htmlBody = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8fafc">
  <div style="background:#1A237E;padding:28px 24px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">📊 ${productnm}</h1>
    <p style="color:#C5CAE9;margin:6px 0 0;font-size:14px">Bestelling bevestigd — jouw licentiesleutel staat hieronder</p>
  </div>
  <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
    <p style="font-size:16px">Hoi ${naam},</p>
    <p>Gefeliciteerd — je boekhouding staat nu klaar om te activeren. Bewaar deze e-mail goed.</p>

    <div style="background:#E8EAF6;border-radius:10px;padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#666;text-transform:uppercase">Jouw licentiesleutel</p>
      <code style="font-size:26px;font-weight:800;color:#1A237E;letter-spacing:3px">${sleutel}</code>
    </div>

    ${activatieLink ? `
    <div style="text-align:center;margin:28px 0">
      <a href="${activatieLink}" style="background:#1A237E;color:#fff;padding:16px 32px;
         border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
        🚀 Boekhouding activeren →
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;word-break:break-all">
      Of kopieer deze link: ${activatieLink}</p>
    ` : ''}

    <p style="font-size:14px;color:#64748b;margin-top:24px">
      <strong>Volgende stap:</strong> klik op de knop hierboven. Je Google Spreadsheet wordt
      automatisch aangemaakt in jouw Drive. Activeren duurt 5 minuten.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:13px;color:#94a3b8">
      Vragen? Stuur een e-mail naar <a href="mailto:${vanEmail}" style="color:#1A237E">${vanEmail}</a>.<br>
      Helpdesk: <a href="https://help.boekhoudbaar.nl" style="color:#1A237E">help.boekhoudbaar.nl</a>
    </p>
    <p style="font-size:12px;color:#cbd5e1">
      ${productnm} · KVK 00000000 · <a href="https://www.boekhoudbaar.nl/privacy" style="color:#94a3b8">Privacybeleid</a>
    </p>
  </div>
</body></html>`;

  if (brevoKey) {
    // Stuur via Brevo API (geen GAS-quota, 300/dag gratis)
    const payload = {
      sender:     { name: vanNaam, email: vanEmail },
      to:         [{ email: email, name: naam }],
      subject:    'Je ' + productnm + ' licentiesleutel 🎉',
      htmlContent: htmlBody,
      tags:       ['licentie', 'dag0'],
      params:     { naam: naam, sleutel: sleutel },
    };
    UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'api-key': brevoKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } else {
    // Fallback: GAS MailApp (max 100/dag op consumer-account)
    MailApp.sendEmail({ to: email, subject: 'Je licentiesleutel — ' + productnm, htmlBody: htmlBody });
  }

  // Voeg contact toe in Brevo voor automatisatie-sequentie
  if (brevoKey) maakBrevoContact_(naam, email, sleutel, brevoKey);
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
                     'Installatie-ID','Aangemaakt op','Mollie betaling ID','Laatste validatie']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold')
      .setBackground('#1A237E').setFontColor('#FFFFFF');
  }
  return sheet;
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

  // Stel defaults in voor niet-gevoelige properties (worden overschreven als al ingesteld)
  if (!props.getProperty('PRODUCT_NAAM'))  props.setProperty('PRODUCT_NAAM',  'Boekhouding Engine');
  if (!props.getProperty('PRODUCT_PRIJS')) props.setProperty('PRODUCT_PRIJS', '4900');
  if (!props.getProperty('MOLLIE_API_KEY'))
    props.setProperty('MOLLIE_API_KEY', 'test_j6zt7F42h3drBQQsfx2evx5pHHrWuD');
  if (!props.getProperty('ADMIN_WACHTWOORD'))
    props.setProperty('ADMIN_WACHTWOORD', 'BoekhoudAdmin2026!');

  Logger.log('Licentie-spreadsheet aangemaakt: ' + ss.getUrl());
  Logger.log('Alle Script Properties ingesteld.');
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

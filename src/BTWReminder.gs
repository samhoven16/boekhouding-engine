/**
 * BTWReminder.gs
 * BTW deadline herinneringen en aangifte assistent.
 * Stuurt automatisch een e-mail wanneer de BTW aangifte deadline nadert.
 */

// ─────────────────────────────────────────────
//  HUIDIGE KWARTAAL BEPALEN
// ─────────────────────────────────────────────
function huidigeKwartaal_() {
  // Retourneert het kwartaal waarvoor de eerstvolgende BTW-aangifte
  // moet worden ingediend (NIET de huidige kalenderkwartaal).
  //
  // Voorbeeld: in april 2026 is Q1 2026 al afgesloten en de aangifte
  // moet binnen Q1 deadline (30 april). Gebruiker moet over Q1 worden
  // herinnerd, niet over Q2 dat nog 3 maanden duurt.
  const nu = new Date();
  const jaar = nu.getFullYear();

  // Genereer kandidaten: alle deadlines van vorig jaar (Q4) t/m volgend jaar (Q4).
  // Pak de eerstvolgende deadline ≥ vandaag.
  const kandidaten = [
    { kw: 'Q4', jaar: jaar - 1, van: new Date(jaar - 1, 9, 1),  tot: new Date(jaar - 1, 11, 31, 23, 59, 59, 999), deadline: new Date(jaar, 0, 31) },
    { kw: 'Q1', jaar,           van: new Date(jaar, 0, 1),     tot: new Date(jaar, 2, 31, 23, 59, 59, 999),     deadline: new Date(jaar, 3, 30) },
    { kw: 'Q2', jaar,           van: new Date(jaar, 3, 1),     tot: new Date(jaar, 5, 30, 23, 59, 59, 999),     deadline: new Date(jaar, 6, 31) },
    { kw: 'Q3', jaar,           van: new Date(jaar, 6, 1),     tot: new Date(jaar, 8, 30, 23, 59, 59, 999),     deadline: new Date(jaar, 9, 31) },
    { kw: 'Q4', jaar,           van: new Date(jaar, 9, 1),     tot: new Date(jaar, 11, 31, 23, 59, 59, 999),    deadline: new Date(jaar + 1, 0, 31) },
  ];

  const naamMap = {
    Q1: 'Kwartaal 1 (januari – maart)',
    Q2: 'Kwartaal 2 (april – juni)',
    Q3: 'Kwartaal 3 (juli – september)',
    Q4: 'Kwartaal 4 (oktober – december)',
  };

  // Pak de eerstvolgende deadline (≥ vandaag of de meest recent verlopene als alle voorbij).
  const toekomstig = kandidaten.find(k => k.deadline >= nu);
  const k = toekomstig || kandidaten[kandidaten.length - 1];

  return {
    kw: k.kw,
    jaar: k.jaar,
    van: k.van,
    tot: k.tot,
    deadline: k.deadline,
    naam: naamMap[k.kw],
  };
}

// ─────────────────────────────────────────────
//  DAGELIJKSE CONTROLE (TRIGGER)
// ─────────────────────────────────────────────
/**
 * Wordt dagelijks uitgevoerd door een time-based trigger.
 * Stuurt een e-mailherinnering als de BTW-deadline binnen 14 dagen valt.
 */
function controleerBtwDeadline_() {
  const props = PropertiesService.getScriptProperties();
  const kw = huidigeKwartaal_();
  const nu = new Date();
  const dagentot = Math.ceil((kw.deadline - nu) / (1000 * 60 * 60 * 24));

  // Alleen herinnering sturen als deadline binnen 14 dagen
  if (dagentot > 14 || dagentot < 0) return;

  // Voorkomen dat dezelfde periode meerdere keren een mail krijgt
  const verstuurdKey = 'btwReminderVerstuurdPeriode';
  const verstuurd = props.getProperty(verstuurdKey);
  const periodeKey = kw.kw + '_' + kw.jaar;
  if (verstuurd === periodeKey) return;

  // E-mailadres ophalen + valideren via centrale isGeldigEmail_ (Utils.gs)
  // — voorkomt GmailApp-crash op invalid input + consistente RFC-validatie.
  // Setup.gs:613 schrijft de instelling onder key 'Email'. Voorheen 'E-mailadres'
  // → key bestond niet → fallback naar Session-email = Google-account ipv
  // business-email → BTW-reminder naar verkeerd adres → gemiste deadline + boete.
  const email = getInstelling_('Email') || Session.getActiveUser().getEmail();
  if (!email || !isGeldigEmail_(email)) {
    Logger.log('BTW reminder overgeslagen: geen of ongeldig e-mailadres (' + email + ')');
    safeAuditLog_('BTW reminder OVERGESLAGEN', 'Ongeldig e-mailadres: ' + email);
    return;
  }

  // BTW berekening voor het kwartaal
  let saldoTekst = '';
  try {
    const ss = getSpreadsheet_();
    const aangifte = berekenBtwAangifte_(ss, kw.van, kw.tot);
    if (aangifte.saldo > 0.005) {
      saldoTekst = `\n\nVoorafinschatting: U moet mogelijk € ${aangifte.saldo.toFixed(2).replace('.', ',')} betalen.`;
    } else if (aangifte.saldo < -0.005) {
      saldoTekst = `\n\nVoorafinschatting: U kunt mogelijk € ${Math.abs(aangifte.saldo).toFixed(2).replace('.', ',')} terugvragen.`;
    }
  } catch(_e) { /* geen berekening beschikbaar */ }

  const onderwerp = `⏰ BTW aangifte herinnering — ${kw.naam} (deadline ${kw.deadline.toLocaleDateString('nl-NL')})`;
  const body = `Beste,

Uw BTW aangifte voor ${kw.naam} moet uiterlijk ${kw.deadline.toLocaleDateString('nl-NL')} ingediend worden.

U heeft nog ${dagentot} dag${dagentot === 1 ? '' : 'en'} de tijd.${saldoTekst}

Open uw boekhoudprogramma en kies:
Boekhouding → BTW → 🧾 BTW aangifte assistent

Voor de daadwerkelijke aangifte gaat u naar:
https://mijn.belastingdienst.nl

Met vriendelijke groet,
Uw boekhoudprogramma`;

  // Try/catch zodat een GmailApp-quota-fout de trigger-keten niet stopt;
  // props alleen bijwerken bij geslaagde verzending (anders wordt morgen
  // opnieuw geprobeerd — gewenst gedrag).
  //
  // V8: via stuurMailMetDlq_ — bij Brevo/Gmail-quota-fail komt het bericht in
  // de DLQ en wordt automatisch opnieuw geprobeerd binnen 1u/4u/12u in plaats
  // van stilletjes te verdwijnen → klant mist deadline niet door één hapering.
  // Markeer als verstuurd alleen bij directe verzending; bij DLQ-fallback NIET
  // markeren zodat een succesvolle retry alsnog een fresh herinnering geeft
  // (de DLQ-retry zélf verstuurt; periodeKey wordt dan in volgende dag-loop
  // alsnog gemarkeerd via dezelfde flow).
  const verzonden = (typeof stuurMailMetDlq_ === 'function')
    ? stuurMailMetDlq_(email, onderwerp, body)
    : (function() {
        try { GmailApp.sendEmail(email, onderwerp, body); return true; }
        catch (e) {
          Logger.log('BTW herinnering MISLUKT: ' + e.message);
          safeAuditLog_('BTW reminder MISLUKT', e.message);
          return false;
        }
      })();
  if (verzonden) {
    props.setProperty(verstuurdKey, periodeKey);
    Logger.log('BTW herinnering verstuurd naar ' + email);
  } else {
    Logger.log('BTW herinnering naar DLQ (' + email + ') — retry binnen 24u');
  }
}

// ─────────────────────────────────────────────
//  TRIGGER INSTELLEN
// ─────────────────────────────────────────────
/**
 * Maakt een dagelijkse trigger aan voor BTW deadline controle.
 * Verwijdert eerst bestaande BTW-triggers om dubbelen te voorkomen.
 */
function instelBtwReminderTrigger() {
  // Verwijder bestaande triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'controleerBtwDeadline_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Nieuwe dagelijkse trigger aanmaken (elke ochtend om 09:00)
  ScriptApp.newTrigger('controleerBtwDeadline_')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ BTW reminder ingesteld',
    'U ontvangt voortaan automatisch een e-mail als de BTW-deadline binnen 14 dagen valt.\n\n' +
    'De controle wordt elke ochtend om 09:00 uitgevoerd.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  BTW AANGIFTE ASSISTENT (DIALOG)
// ─────────────────────────────────────────────
/**
 * Toont een dialoog met een overzicht van de BTW-aangifte voor het huidige kwartaal.
 * Laat de exacte velden zien die op het Belastingdienst-formulier ingevuld moeten worden.
 */
function toonBtwAangifteAssistent() {
  const ss = getSpreadsheet_();
  const kw = huidigeKwartaal_();
  let aangifte;
  try {
    aangifte = berekenBtwAangifte_(ss, kw.van, kw.tot);
  } catch(e) {
    SpreadsheetApp.getUi().alert('Fout bij berekenen: ' + e.message);
    return;
  }

  const nu = new Date();
  const dagentot = Math.ceil((kw.deadline - nu) / (1000 * 60 * 60 * 24));
  const deadlineKleur = dagentot <= 7 ? '#c62828' : dagentot <= 14 ? '#e65100' : '#2e7d32';
  const deadlineTekst = dagentot < 0 ? 'Deadline verstreken!' : `Nog ${dagentot} dag${dagentot === 1 ? '' : 'en'}`;

  function fmt(n) {
    return '€\u00a0' + (n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
  .label{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#2EC4B6;margin-bottom:4px}
  h2{color:#0D1B4E;margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-0.01em}
  .periode{color:#5F6B7A;font-size:13px;margin-bottom:14px}
  .deadline{display:inline-block;padding:6px 14px;border-radius:100px;font-weight:600;font-size:12px;margin-bottom:18px;color:white;background:${deadlineKleur};letter-spacing:.2px}
  table{width:100%;border-collapse:collapse;margin:10px 0;background:#fff;border:1px solid #E5EAF2;border-radius:8px;overflow:hidden}
  th{background:#F7F9FC;color:#0D1B4E;text-align:left;padding:9px 11px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-bottom:1px solid #E5EAF2}
  td{padding:8px 11px;border-bottom:1px solid #F0F3F7;font-size:13px}
  td.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#5F6B7A;width:40px;font-size:12px}
  td.bedrag{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
  .saldo-pos td{background:#FDECEC;color:#B91C1C;font-weight:700}
  .saldo-neg td{background:#E6F7F4;color:#0D1B4E;font-weight:700}
  .saldo-nul td{background:#F7F9FC;color:#5F6B7A}
  .sectie{font-size:10px;font-weight:700;color:#5F6B7A;padding:10px 11px 4px;text-transform:uppercase;letter-spacing:1.2px;background:#fff}
  .btn{display:inline-block;padding:11px 20px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;margin:4px 6px 0 0;font-family:inherit;letter-spacing:.1px;transition:background .15s ease,transform .15s ease,box-shadow .2s ease}
  .btn-pri{background:#0D1B4E;color:white}
  .btn-pri:hover{background:#1A2A6B;transform:translateY(-1px);box-shadow:0 6px 20px rgba(13,27,78,.22)}
  .btn-sec{background:#fff;color:#0D1B4E;border:1px solid #E5EAF2}
  .btn-sec:hover{border-color:rgba(46,196,182,.45);transform:translateY(-1px)}
  .tip{background:#FFF8E1;border:1px solid #FFECB3;padding:12px 14px;margin-top:16px;font-size:12px;color:#5A3F00;border-radius:8px;line-height:1.5}
  .nul{color:#94a3b8}
  ::selection{background:rgba(46,196,182,.28);color:#0D1B4E}
</style>
</head>
<body>
<div class="label">BTW-aangifte</div>
<h2>Aangifte-assistent ${kw.naam}</h2>
<div class="periode">Periode ${kw.van.toLocaleDateString('nl-NL')} – ${kw.tot.toLocaleDateString('nl-NL')}</div>
<div class="deadline">Deadline: ${kw.deadline.toLocaleDateString('nl-NL')} — ${deadlineTekst}</div>

<table>
  <tr><th colspan="3">Rubriek op het Belastingdienst-formulier</th><th>Bedrag</th></tr>

  <tr><td colspan="4" class="sectie">Rubriek 1 — Binnenlandse omzet</td></tr>
  <tr>
    <td class="code">1a</td>
    <td>Omzet belast met 21%</td>
    <td class="${aangifte.r1a_grondslag > 0 ? '' : 'nul'}">${fmt(aangifte.r1a_grondslag)}</td>
    <td class="bedrag">${fmt(aangifte.r1a_btw)}</td>
  </tr>
  <tr>
    <td class="code">1b</td>
    <td>Omzet belast met 9%</td>
    <td class="${aangifte.r1b_grondslag > 0 ? '' : 'nul'}">${fmt(aangifte.r1b_grondslag)}</td>
    <td class="bedrag">${fmt(aangifte.r1b_btw)}</td>
  </tr>
  <tr>
    <td class="code">1c</td>
    <td>Omzet overige tarieven</td>
    <td class="${aangifte.r1c_grondslag > 0 ? '' : 'nul'}">${fmt(aangifte.r1c_grondslag)}</td>
    <td class="bedrag">${fmt(aangifte.r1c_btw)}</td>
  </tr>

  <tr><td colspan="4" class="sectie">Rubriek 5 — Totalen</td></tr>
  <tr>
    <td class="code">5a</td>
    <td>Totaal verschuldigde BTW</td>
    <td></td>
    <td class="bedrag">${fmt(aangifte.r5a)}</td>
  </tr>
  <tr>
    <td class="code">5b</td>
    <td>Voorbelasting (aftrekbare BTW op inkopen)</td>
    <td></td>
    <td class="bedrag">${fmt(aangifte.r5b)}</td>
  </tr>
  <tr class="${aangifte.saldo > 0.005 ? 'saldo-pos' : aangifte.saldo < -0.005 ? 'saldo-neg' : 'saldo-nul'}">
    <td class="code">5g</td>
    <td><b>${aangifte.saldo > 0.005 ? 'Te betalen aan Belastingdienst' : aangifte.saldo < -0.005 ? 'Terug te ontvangen' : 'Saldo nul'}</b></td>
    <td></td>
    <td class="bedrag"><b>${fmt(Math.abs(aangifte.saldo))}</b></td>
  </tr>
</table>

<div class="tip">
  <strong>Invullen bij de Belastingdienst:</strong> gebruik de bedragen hierboven en vul ze in bij de overeenkomstige rubrieken (1a, 1b, 5a, 5b, 5g). Klik op de knop hieronder om direct naar het aangifte-portaal te gaan.
</div>

<div style="margin-top:16px">
  <button class="btn btn-pri" onclick="naarBelastingdienst()">Naar mijn.belastingdienst.nl</button>
  <button class="btn btn-sec" onclick="exporteerAangifte()">Exporteer naar tabblad</button>
  <button class="btn btn-sec" onclick="google.script.host.close()">Sluiten</button>
</div>

<script>
function naarBelastingdienst() {
  window.open('https://mijn.belastingdienst.nl', '_blank');
}
function exporteerAangifte() {
  google.script.run
    .withSuccessHandler(function(){ alert('Aangifte staat klaar op tabblad "BTW Aangifte".'); })
    .withFailureHandler(function(e){ alert('⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Probeer opnieuw.')); })
    .genereerBtwAangifte('${kw.kw}');
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(720).setHeight(580).setSandboxMode(HtmlService.SandboxMode.IFRAME),
    'BTW Aangifte Assistent — ' + kw.naam
  );
}

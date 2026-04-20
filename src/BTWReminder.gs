/**
 * BTWReminder.gs
 * BTW deadline herinneringen en aangifte assistent.
 * Stuurt automatisch een e-mail wanneer de BTW aangifte deadline nadert.
 */

// ─────────────────────────────────────────────
//  HUIDIGE KWARTAAL BEPALEN
// ─────────────────────────────────────────────
function huidigeKwartaal_() {
  const nu = new Date();
  const maand = nu.getMonth(); // 0-11
  let kw, van, tot;

  if (maand <= 2) {
    kw = 'Q1';
    van = new Date(nu.getFullYear(), 0, 1);
    tot = new Date(nu.getFullYear(), 2, 31);
  } else if (maand <= 5) {
    kw = 'Q2';
    van = new Date(nu.getFullYear(), 3, 1);
    tot = new Date(nu.getFullYear(), 5, 30);
  } else if (maand <= 8) {
    kw = 'Q3';
    van = new Date(nu.getFullYear(), 6, 1);
    tot = new Date(nu.getFullYear(), 8, 30);
  } else {
    kw = 'Q4';
    van = new Date(nu.getFullYear(), 9, 1);
    tot = new Date(nu.getFullYear(), 11, 31);
  }

  // Deadline: Q1=30 apr, Q2=31 jul, Q3=31 okt, Q4=31 jan (volgend jaar)
  const deadlineMap = {
    Q1: new Date(nu.getFullYear(), 3, 30),
    Q2: new Date(nu.getFullYear(), 6, 31),
    Q3: new Date(nu.getFullYear(), 9, 31),
    Q4: new Date(nu.getFullYear() + 1, 0, 31),
  };
  const naamMap = {
    Q1: 'Kwartaal 1 (januari – maart)',
    Q2: 'Kwartaal 2 (april – juni)',
    Q3: 'Kwartaal 3 (juli – september)',
    Q4: 'Kwartaal 4 (oktober – december)',
  };

  return { kw, jaar: nu.getFullYear(), van, tot, deadline: deadlineMap[kw], naam: naamMap[kw] };
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

  // E-mailadres ophalen
  const email = getInstelling_('E-mailadres') || Session.getActiveUser().getEmail();
  if (!email) return;

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

  GmailApp.sendEmail(email, onderwerp, body);
  props.setProperty(verstuurdKey, periodeKey);
  Logger.log('BTW herinnering verstuurd naar ' + email);
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
  body{font-family:Arial,sans-serif;padding:16px;font-size:13px;color:#212121}
  h2{color:#1A237E;margin:0 0 4px}
  .periode{color:#555;font-size:12px;margin-bottom:14px}
  .deadline{display:inline-block;padding:5px 12px;border-radius:12px;font-weight:bold;font-size:13px;margin-bottom:14px;color:white;background:${deadlineKleur}}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th{background:#E8EAF6;color:#1A237E;text-align:left;padding:7px 9px;font-size:12px}
  td{padding:6px 9px;border-bottom:1px solid #eee;font-size:13px}
  td.code{font-family:monospace;color:#555;width:40px}
  td.bedrag{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
  .saldo-pos{background:#FFEBEE;color:#c62828;font-weight:bold}
  .saldo-neg{background:#E8F5E9;color:#2e7d32;font-weight:bold}
  .saldo-nul{background:#F5F5F5;color:#555}
  .sectie{font-size:11px;font-weight:bold;color:#777;padding:8px 9px 4px;text-transform:uppercase;letter-spacing:0.5px}
  .btn{display:inline-block;padding:10px 18px;border-radius:5px;border:none;cursor:pointer;font-size:13px;font-weight:bold;margin:4px 4px 0 0}
  .btn-pri{background:#1A237E;color:white}
  .btn-pri:hover{background:#283593}
  .btn-sec{background:#E8EAF6;color:#1A237E}
  .btn-sec:hover{background:#C5CAE9}
  .tip{background:#FFF8E1;border-left:3px solid #FFC107;padding:9px 12px;margin-top:12px;font-size:12px;border-radius:0 4px 4px 0}
  .nul{color:#bbb}
</style>
</head>
<body>
<h2>🧾 BTW Aangifte Assistent</h2>
<div class="periode">${kw.naam} (${kw.van.toLocaleDateString('nl-NL')} – ${kw.tot.toLocaleDateString('nl-NL')})</div>
<div class="deadline">⏰ Deadline: ${kw.deadline.toLocaleDateString('nl-NL')} — ${deadlineTekst}</div>

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
  💡 <b>Invullen bij de Belastingdienst:</b> Gebruik de bedragen hierboven.
  Vul ze in bij de overeenkomstige rubrieken (1a, 1b, 5a, 5b, 5g).
  Klik op "Naar mijn.belastingdienst.nl" om direct naar het aangifte-portaal te gaan.
</div>

<div style="margin-top:14px">
  <button class="btn btn-pri" onclick="naarBelastingdienst()">🌐 Naar mijn.belastingdienst.nl</button>
  <button class="btn btn-sec" onclick="exporteerAangifte()">📄 Exporteer naar tabblad</button>
  <button class="btn btn-sec" onclick="google.script.host.close()">Sluiten</button>
</div>

<script>
function naarBelastingdienst() {
  window.open('https://mijn.belastingdienst.nl', '_blank');
}
function exporteerAangifte() {
  google.script.run
    .withSuccessHandler(function(){ alert('Aangifte staat klaar op tabblad "BTW Aangifte".'); })
    .withFailureHandler(function(e){ alert('Fout: ' + e.message); })
    .genereerBtwAangifte('${kw.kw}');
}
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(700).setHeight(560),
    '🧾 BTW Aangifte Assistent — ' + kw.naam
  );
}

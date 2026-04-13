/**
 * Assistent.gs
 * Ingebouwde hulpcenter — beantwoordt vragen over het programma,
 * boekhouding en belastingen op basis van uw eigen administratie.
 */

// ─────────────────────────────────────────────
//  ASSISTENT OPENEN
// ─────────────────────────────────────────────
function openAssistent() {
  const ss = getSpreadsheet_();
  // Fast path: use snapshot when fresh. The assistant shows current-year totals and
  // open positions — 30-min staleness is acceptable for a Q&A context.
  const kpi = leesKpiSnapshot_() || berekenKpiData_(ss);
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Uw bedrijf';
  const jaar = new Date().getFullYear();
  const btwPeriode = getInstelling_('BTW aangifteperiode') || 'Kwartaal';

  // Actuele cijfers uit eigen administratie
  const snelleFeiten = [
    { vraag: 'Wat is mijn omzet dit jaar?',                antwoord: `Uw totale omzet dit jaar is ${formatBedrag_(kpi.omzet)}.` },
    { vraag: 'Wat zijn mijn kosten?',                      antwoord: `Uw totale kosten dit jaar zijn ${formatBedrag_(kpi.kosten)}.` },
    { vraag: 'Hoeveel winst maak ik?',                     antwoord: `Uw netto winst is ${formatBedrag_(kpi.nettowinst)} (winstmarge: ${kpi.winstmarge}%).` },
    { vraag: 'Hoeveel moeten klanten mij nog betalen?',    antwoord: `Open facturen bij klanten: ${formatBedrag_(kpi.debiteurenOpen)} (${kpi.aantalOpenFacturen} facturen).` },
    { vraag: 'Hoeveel BTW moet ik afdragen?',              antwoord: `Uw BTW-saldo dit jaar: ${formatBedrag_(kpi.btwSaldo)}.${kpi.btwSaldo > 0 ? ' Dit moet u betalen aan de Belastingdienst.' : ' Dit kunt u terugvragen.'}` },
    { vraag: 'Wat staat er op mijn zakelijke rekening?',   antwoord: `Banksaldo volgens de administratie: ${formatBedrag_(kpi.banksaldo)}.` },
  ];

  // Uitgebreide FAQ
  const faq = [
    {
      categorie: 'Hoe gebruik ik dit programma?',
      items: [
        { v: 'Hoe maak ik een factuur?',
          a: 'Klik bovenin op <b>Boekhouding → Nieuw invoeren</b>. Kies "Inkomsten (factuur maken)", vul de gegevens in en klik op verzenden. De factuur (PDF) wordt automatisch aangemaakt en per e-mail naar uw klant gestuurd.' },
        { v: 'Hoe boek ik een kostenpost?',
          a: 'Open hetzelfde formulier en kies "Uitgaven (kosten boeken)". Vul leverancier, bedrag en categorie in. De boeking wordt direct verwerkt in uw administratie en BTW-overzicht.' },
        { v: 'Hoe dien ik een declaratie in?',
          a: 'Heeft u iets zakelijks betaald met uw privérekening? Open het formulier, kies "Declaratie" en vul het bedrag en de omschrijving in. Het systeem houdt bij dat u dit geld nog terugkrijgt.' },
        { v: 'Hoe importeer ik mijn bankafschrift?',
          a: 'Ga naar <b>Boekhouding → Bank → Bankafschrift importeren</b>. Download eerst uw bankafschrift als CSV bij uw bank (bijv. via internetbankieren), en plak de inhoud in het importvenster.' },
        { v: 'Hoe stuur ik een betalingsherinnering?',
          a: 'Het systeem stuurt automatisch herinneringen na 1, 7 en 14 dagen na de vervaldatum. Wilt u het nu doen? Ga naar <b>Boekhouding → Facturen → Betalingsherinneringen versturen</b>.' },
        { v: 'Hoe upload ik een foto van een bon?',
          a: 'Klik op <b>Boekhouding → Bon of factuur uploaden (foto)</b>. Upload een foto van de bon en vul een korte omschrijving in. Het bestand wordt opgeslagen in Google Drive.' },
      ],
    },
    {
      categorie: 'BTW en belastingen',
      items: [
        { v: 'Wanneer moet ik BTW-aangifte doen?',
          a: `U doet ${btwPeriode === 'Kwartaal' ? 'elk kwartaal (elke 3 maanden)' : 'maandelijks'} BTW-aangifte.<br><b>Deadlines:</b> Q1 → 30 april | Q2 → 31 juli | Q3 → 31 oktober | Q4 → 31 januari.<br>Ga naar <b>Boekhouding → BTW</b> om uw aangifte klaar te zetten.` },
        { v: 'Wat is de Kleineondernemersregeling (KOR)?',
          a: 'Als uw jaaromzet onder €20.000 blijft, bent u vrijgesteld van BTW-aangifte. U hoeft dan geen BTW te berekenen aan klanten. Uw systeem detecteert dit automatisch. Zie <b>Boekhouding → BTW → KOR check</b>.' },
        { v: 'Wat is de zelfstandigenaftrek?',
          a: `Als u meer dan 1.225 uur per jaar aan uw bedrijf besteedt, mag u een vast bedrag aftrekken van uw winst. Dit verlaagt uw inkomstenbelasting. Zie <b>Boekhouding → Belastingtips</b> voor het exacte bedrag.` },
        { v: 'Wat is de MKB-winstvrijstelling?',
          a: 'U betaalt inkomstenbelasting over 86% van uw winst — 14% is belastingvrij. Dit wordt automatisch berekend in uw belastingadvies.' },
        { v: 'Wat zijn representatiekosten?',
          a: 'Zakelijke lunches, diners en relatiegeschenken. Hiervan mag u slechts 73,5% als kosten aftrekken. Gebruik de categorie "Maaltijden & Representatie" bij het boeken van deze kosten.' },
        { v: 'Krijg ik extra aftrek bij bedrijfsinvesteringen?',
          a: 'Ja! Bij investeringen tussen €2.800 en €353.973 (bijv. apparatuur, gereedschap, voertuig) krijgt u extra belastingaftrek via de Kleinschaligheidsinvesteringsaftrek (KIA). Het systeem detecteert dit automatisch.' },
      ],
    },
    {
      categorie: 'Facturen',
      items: [
        { v: 'Wat staat er verplicht op een factuur?',
          a: 'Bedrijfsnaam, adres, BTW-nummer, KvK-nummer, factuurdatum, factuurnummer, omschrijving, bedrag excl. BTW, BTW-percentage, BTW-bedrag, totaalbedrag en uw IBAN. <b>Dit wordt automatisch ingevuld door het systeem.</b>' },
        { v: 'Wat is een UBL-factuur?',
          a: 'UBL is een digitaal factuurformaat dat steeds vaker vereist is bij de overheid en grote bedrijven (e-Facturatie). Bij elke factuur maakt het systeem automatisch een UBL-bestand aan dat u kunt meesturen.' },
        { v: 'Hoe lang moet ik facturen bewaren?',
          a: 'Minimaal <b>7 jaar</b> (wettelijke bewaarplicht). Uw facturen worden automatisch opgeslagen in Google Drive.' },
      ],
    },
    {
      categorie: 'Overzichten & rapporten',
      items: [
        { v: 'Hoe maak ik een balans?',
          a: 'Ga naar <b>Boekhouding → Overzichten → Balans</b>. U ziet dan een overzicht van uw bezittingen (activa) en schulden (passiva).' },
        { v: 'Wat is het verschil tussen balans en winst & verlies?',
          a: 'De <b>balans</b> laat zien wat u bezit en wat u schuldig bent (op een bepaald moment). De <b>winst & verlies</b> laat zien hoeveel u verdiend en uitgegeven heeft (over een periode).' },
        { v: 'Hoe deel ik mijn administratie met mijn accountant?',
          a: 'Ga naar <b>Boekhouding → Overzichten → Jaarrekening</b>. Dit genereert een compleet rapport dat u kunt delen.' },
      ],
    },
  ];

  // HTML opbouwen
  const faqHtml = faq.map(cat => `
    <div class="categorie">
      <div class="cat-titel" onclick="toggle(this)">${cat.categorie} <span>▼</span></div>
      <div class="cat-items">
        ${cat.items.map(item => `
          <div class="item">
            <div class="vraag" onclick="toggle(this)">❓ ${item.v}</div>
            <div class="antwoord">${item.a}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  const snelHtml = snelleFeiten.map(f => `
    <div class="snel-item">
      <span class="snel-v">${f.vraag}</span>
      <span class="snel-a">${f.antwoord}</span>
    </div>`).join('');

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 0; color: #333; }
  .header { background: #1A237E; color: white; padding: 14px 18px; font-size: 15px; font-weight: bold; }
  .header span { font-size: 11px; font-weight: normal; opacity: 0.8; display: block; margin-top: 2px; }
  .tabs { display: flex; background: #E8EAF6; }
  .tab { padding: 10px 16px; cursor: pointer; font-weight: bold; font-size: 12px; border-bottom: 3px solid transparent; }
  .tab.actief { border-bottom-color: #1A237E; color: #1A237E; background: white; }
  .sectie { display: none; padding: 12px; height: 420px; overflow-y: auto; }
  .sectie.actief { display: block; }
  .snel-item { padding: 8px 0; border-bottom: 1px solid #EEE; }
  .snel-v { font-weight: bold; display: block; margin-bottom: 2px; }
  .snel-a { color: #1A237E; }
  .categorie { margin-bottom: 8px; border: 1px solid #E0E0E0; border-radius: 4px; overflow: hidden; }
  .cat-titel { background: #E8EAF6; padding: 10px 12px; font-weight: bold; cursor: pointer; font-size: 12px; }
  .cat-items { display: none; padding: 8px 12px; }
  .cat-items.open { display: block; }
  .item { margin: 6px 0; }
  .vraag { cursor: pointer; color: #1A237E; font-weight: bold; font-size: 12px; padding: 4px 0; }
  .antwoord { display: none; padding: 6px 8px; background: #F5F5F5; border-radius: 3px; line-height: 1.5; font-size: 12px; }
  .antwoord.open { display: block; }
  .ai-blok { background: #E3F2FD; border-radius: 6px; padding: 14px; margin: 10px 0; }
  .ai-blok h4 { margin: 0 0 8px; color: #1A237E; }
  .ai-blok a { color: #1565C0; text-decoration: none; font-weight: bold; }
  .ai-blok a:hover { text-decoration: underline; }
  .tip { background: #FFF8E1; padding: 8px 12px; border-radius: 4px; font-size: 11px; margin: 8px 0; }
  .actie-knop { background: #1A237E; color: white; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%; margin: 8px 0; }
  .actie-knop:hover { background: #283593; }
</style>
</head>
<body>
<div class="header">
  Hulpcenter – ${escHtml_(bedrijf)}
  <span>${formatDatum_(new Date())} | Boekjaar ${jaar}</span>
</div>

<div class="tabs">
  <div class="tab actief" onclick="toonTab('snel', this)">Uw cijfers</div>
  <div class="tab" onclick="toonTab('faq', this)">Veelgestelde vragen</div>
  <div class="tab" onclick="toonTab('ai', this)">AI hulp</div>
</div>

<div id="snel" class="sectie actief">
  <p style="color:#666;font-size:11px;margin-bottom:8px">Antwoorden op basis van uw huidige administratie:</p>
  ${snelHtml}
  <div class="tip">Meer details nodig? Ga naar <b>Boekhouding → Overzichten</b> of <b>Belastingtips</b>.</div>
  <button class="actie-knop" onclick="google.script.run.genereerBelastingadvies()">
    Belastingtips & besparingen bekijken
  </button>
</div>

<div id="faq" class="sectie">
  <p style="color:#666;font-size:11px;margin-bottom:8px">Klik op een categorie om antwoorden te bekijken:</p>
  ${faqHtml}
</div>

<div id="ai" class="sectie">
  <div class="ai-blok">
    <h4>Stel een vraag aan AI</h4>
    <p>Voor specifieke vragen over uw situatie kunt u een AI-assistent raadplegen. Kopieer onderstaande context en stel uw vraag:</p>
    <p><a href="https://claude.ai" target="_blank">Claude (Anthropic) openen</a></p>
    <p><a href="https://chat.openai.com" target="_blank">ChatGPT openen</a></p>
  </div>
  <div class="tip">
    <b>Voorbeeldvraag om te plakken:</b><br>
    "Ik ben ondernemer in Nederland. Mijn omzet dit jaar is ${formatBedrag_(kpi.omzet)}, kosten ${formatBedrag_(kpi.kosten)}.
    Ik gebruik een boekhoudprogramma met dubbel boekhouden (NL GAAP).
    Vraag: [typ hier uw vraag]"
  </div>
  <div class="ai-blok" style="background:#E8F5E9">
    <h4>Automatisering (Zapier / Make / n8n)</h4>
    <p>Verbind uw boekhouding met andere tools via de ingebouwde koppeling:</p>
    <button class="actie-knop" style="background:#2E7D32" onclick="google.script.run.toonZapierInstructies(); google.script.host.close();">
      Koppelinstructies bekijken
    </button>
  </div>
</div>

<script>
function toonTab(id, el) {
  document.querySelectorAll('.sectie').forEach(s => s.classList.remove('actief'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('actief'));
  document.getElementById(id).classList.add('actief');
  el.classList.add('actief');
}
function toggle(el) {
  const next = el.nextElementSibling;
  if (next) next.classList.toggle('open');
}
</script>
</body>
</html>
  `).setWidth(580).setHeight(560);

  SpreadsheetApp.getUi().showModalDialog(html, 'Hulpcenter');
}

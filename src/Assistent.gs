/**
 * Assistent.gs
 * Ingebouwde slimme helpdesk — beantwoordt vragen over het programma,
 * boekhouding en belastingen op basis van uw eigen boekhouding.
 *
 * Bevat:
 * 1. Contextbewuste FAQ (leest uw eigen cijfers mee)
 * 2. Directe doorverwijzing naar belastingadvies
 * 3. Optionele AI-doorverwijzing via externe link
 */

// ─────────────────────────────────────────────
//  ASSISTENT OPENEN
// ─────────────────────────────────────────────
function openAssistent() {
  const ss = getSpreadsheet_();
  const kpi = berekenKpiData_(ss);
  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Uw bedrijf';
  const jaar = new Date().getFullYear();
  const btwPeriode = getInstelling_('BTW aangifteperiode') || 'Kwartaal';

  // Snel antwoord op basis van actuele cijfers
  const snelleFeiten = [
    { vraag: 'Wat is mijn omzet dit jaar?',        antwoord: `Uw omzet (year-to-date) is ${formatBedrag_(kpi.omzet)}.` },
    { vraag: 'Wat zijn mijn kosten?',              antwoord: `Uw totale kosten dit jaar zijn ${formatBedrag_(kpi.kosten)}.` },
    { vraag: 'Hoeveel winst maak ik?',             antwoord: `Uw nettowinst is ${formatBedrag_(kpi.nettowinst)} (winstmarge: ${kpi.winstmarge}%).` },
    { vraag: 'Wat heb ik open staan bij klanten?', antwoord: `Open debiteuren: ${formatBedrag_(kpi.debiteurenOpen)} (${kpi.aantalOpenFacturen} facturen).` },
    { vraag: 'Hoeveel BTW ben ik verschuldigd?',   antwoord: `Uw BTW-saldo dit jaar: ${formatBedrag_(kpi.btwSaldo)}.${kpi.btwSaldo > 0 ? ' Dit is te betalen aan de Belastingdienst.' : ' U kunt dit terugvragen.'}` },
    { vraag: 'Wat is mijn banksaldo?',             antwoord: `Huidig banksaldo in de administratie: ${formatBedrag_(kpi.banksaldo)}.` },
  ];

  // Kennisbank (altijd beschikbaar)
  const faq = [
    {
      categorie: 'Hoe gebruik ik het programma?',
      items: [
        { v: 'Hoe maak ik een factuur?',
          a: 'Klik op "📋 Boekhouding formulier openen" in het menu of via Boekhouding → Formulier. Kies "Inkomsten (factuur maken)", vul de gegevens in en klik op verzenden. De factuur wordt automatisch aangemaakt en gemaild.' },
        { v: 'Hoe boek ik een kostenpost?',
          a: 'Open het formulier en kies "Uitgaven (kosten boeken)". Vul leverancier, bedrag en categorie in. De boeking wordt automatisch verwerkt in uw administratie en BTW-overzicht.' },
        { v: 'Hoe voer ik een declaratie in?',
          a: 'Open het formulier en kies "Declaratie (privé voorgeschoten)". Vul het bedrag, de omschrijving en de categorie in. Het systeem boekt dit als een privé-onttrekking.' },
        { v: 'Hoe koppel ik mijn bankafschrift?',
          a: 'Ga naar Boekhouding → Bankboek → Bankafschrift importeren (CSV). Exporteer uw bankafschrift als CSV bij uw bank en plak de inhoud in het importvenster.' },
        { v: 'Hoe stuur ik een herinnering?',
          a: 'Automatische betalingsherinneringen worden dagelijks verstuurd (na 1, 7 en 14 dagen). Handmatig: Boekhouding → Facturen → Betalingsherinneringen nu sturen.' },
      ],
    },
    {
      categorie: 'BTW en belastingen',
      items: [
        { v: 'Wanneer moet ik BTW aangifte doen?',
          a: `U doet ${btwPeriode === 'Kwartaal' ? 'elk kwartaal' : 'maandelijks'} BTW aangifte. Deadlines: Q1 → 30 april | Q2 → 31 juli | Q3 → 31 oktober | Q4 → 31 januari. Ga naar Boekhouding → BTW om uw aangifte te genereren.` },
        { v: 'Wat is de KOR regeling?',
          a: 'De Kleineondernemersregeling (KOR) geldt als uw jaaromzet onder €20.000 blijft. U hoeft dan geen BTW te rekenen en geen aangifte te doen. Uw systeem detecteert dit automatisch. Zie Boekhouding → Belastingadvies.' },
        { v: 'Wat is de zelfstandigenaftrek?',
          a: 'Als u meer dan 1.225 uur per jaar aan uw onderneming besteedt, kunt u €5.030 aftrekken van uw winst (2024). Dit verlaagt uw inkomstenbelasting aanzienlijk.' },
        { v: 'Wat is de MKB-winstvrijstelling?',
          a: '14% van uw winst (na aftrekposten) is vrijgesteld van inkomstenbelasting. Dit wordt automatisch berekend in uw belastingadvies.' },
        { v: 'Wat zijn representatiekosten?',
          a: 'Kosten voor zakelijke lunches, diners en relatiegeschenken. Slechts 73,5% is fiscaal aftrekbaar. Gebruik de categorie "Maaltijden & Representatie" bij het boeken.' },
        { v: 'Hoe werkt de KIA (Kleinschaligheidsinvesteringsaftrek)?',
          a: 'Als u tussen €2.800 en €353.973 investeert in bedrijfsmiddelen, kunt u 28% extra aftrekken. Het systeem detecteert dit automatisch via uw grootboek.' },
      ],
    },
    {
      categorie: 'Facturen',
      items: [
        { v: 'Welke verplichte vermeldingen staan er op een factuur?',
          a: 'Een factuur moet bevatten: uw naam/bedrijfsnaam, adres, BTW-nummer, KvK-nummer, factuurdatum, factuurnummer, omschrijving, bedrag excl. BTW, BTW-percentage, BTW-bedrag, totaalbedrag en IBAN. Uw systeem vult dit automatisch in.' },
        { v: 'Hoe maak ik een creditnota?',
          a: 'Ga naar tabblad Verkoopfacturen, zoek de factuur, en bel via het menu de functie "Creditnota aanmaken" aan (Boekhouding → Facturen). Het systeem boekt de storno automatisch.' },
        { v: 'Wat is een UBL-factuur?',
          a: 'UBL (Universal Business Language) is een digitaal factuurformaat dat vereist is voor facturering aan de overheid (e-Facturatie) en steeds vaker door grote bedrijven. Uw systeem genereert automatisch een UBL 2.1 XML-bestand bij elke factuur.' },
        { v: 'Hoe lang moet ik facturen bewaren?',
          a: 'Minimaal 7 jaar (fiscale bewaarplicht). Uw facturen worden automatisch opgeslagen in Google Drive in de mappenstructuur per boekjaar.' },
      ],
    },
    {
      categorie: 'Rapportages',
      items: [
        { v: 'Hoe genereer ik een balans?',
          a: 'Boekhouding → Rapporten → Balans genereren. U ziet automatisch uw activa, passiva en eigen vermogen.' },
        { v: 'Wat is het verschil tussen balans en W&V rekening?',
          a: 'De balans toont uw vermogenspositie (bezittingen vs. schulden) op een moment. De W&V rekening (resultatenrekening) toont uw omzet en kosten over een periode.' },
        { v: 'Hoe exporteer ik voor mijn accountant?',
          a: 'Ga naar Boekhouding → Rapporten → Jaarrekening genereren. Dit genereert een volledig rapport dat u kunt delen met uw accountant.' },
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
  .belasting-knop { background: #1A237E; color: white; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%; margin: 8px 0; }
  .belasting-knop:hover { background: #283593; }
</style>
</head>
<body>
<div class="header">
  💬 Slimme Helpdesk – ${bedrijf}
  <span>Uw administratie op ${formatDatum_(new Date())} | Boekjaar ${jaar}</span>
</div>

<div class="tabs">
  <div class="tab actief" onclick="toonTab('snel', this)">📊 Uw cijfers</div>
  <div class="tab" onclick="toonTab('faq', this)">❓ Vragen & Antwoorden</div>
  <div class="tab" onclick="toonTab('ai', this)">🤖 AI Assistent</div>
</div>

<div id="snel" class="sectie actief">
  <p style="color:#666;font-size:11px;margin-bottom:8px">Direct antwoord op basis van uw huidige administratie:</p>
  ${snelHtml}
  <div class="tip">📌 Meer details? Gebruik Boekhouding → Rapporten of Boekhouding → Belastingadvies</div>
  <button class="belasting-knop" onclick="google.script.run.genereerBelastingadvies()">
    💡 Belastingadvies & aftrekposten genereren
  </button>
</div>

<div id="faq" class="sectie">
  <p style="color:#666;font-size:11px;margin-bottom:8px">Klik op een categorie om vragen te bekijken:</p>
  ${faqHtml}
</div>

<div id="ai" class="sectie">
  <div class="ai-blok">
    <h4>🤖 Stel een vraag aan AI</h4>
    <p>Voor complexe boekhoudvragen kunt u een AI-assistent gebruiken. Kopieer uw vraag en plak uw context:</p>
    <p><a href="https://claude.ai" target="_blank">Claude (Anthropic) openen →</a></p>
    <p><a href="https://chat.openai.com" target="_blank">ChatGPT openen →</a></p>
  </div>
  <div class="tip">
    <b>Handig prompt-voorbeeld:</b><br>
    "Ik ben ZZP'er in Nederland. Mijn omzet dit jaar is ${formatBedrag_(kpi.omzet)}, kosten ${formatBedrag_(kpi.kosten)}.
    Ik gebruik Google Spreadsheets voor mijn boekhouding (dubbel boekhouden, NL GAAP).
    Vraag: [uw vraag hier]"
  </div>
  <div class="ai-blok" style="background:#E8F5E9">
    <h4>🔗 Koppelen met AI-workflows (Zapier / Make)</h4>
    <p>Verbind uw boekhouding met AI-tools via de ingebouwde webhook API:</p>
    <button class="belasting-knop" style="background:#2E7D32" onclick="google.script.run.toonZapierInstructies(); google.script.host.close();">
      Webhook / Zapier instructies tonen
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

  SpreadsheetApp.getUi().showModalDialog(html, '💬 Helpdesk & Assistent');
}

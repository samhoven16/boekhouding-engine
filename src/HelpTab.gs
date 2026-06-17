/**
 * HelpTab.gs
 *
 * Genereert het "Help & Compliance"-tabblad. Statische referentie-content
 * voor de klant: Belastingdienst-links, jaarafsluiting-checklist,
 * bewaarplicht-uitleg, KvK-vereisten.
 *
 * Idempotent: bij her-run wordt content vervangen, niet gedupliceerd.
 * Aangeroepen vanuit setup() en als losse functie via menu.
 */

'use strict';

function bouwHelpTab_(ss) {
  const sheet = ss.getSheetByName(SHEETS.HELP) || ss.insertSheet(SHEETS.HELP);
  sheet.clearContents();
  sheet.clearFormats();

  const blauw = '#0D1B4E';
  const accent = '#2EC4B6';
  const lichtBg = '#F7F9FC';

  // ── Header ──────────────────────────────────────
  sheet.getRange('A1:B1').merge()
    .setValue('Help & Compliance — Belastingdienst-referenties + jaarafsluiting')
    .setBackground(blauw).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('left');

  sheet.getRange('A2:B2').merge()
    .setValue('Deze pagina is statisch. Wijzigingen kun je niet aanbrengen — alle inhoud werk je bij via een update van Boekhoudbaar.')
    .setBackground(lichtBg).setFontColor('#5F6B7A').setFontSize(11).setFontStyle('italic');

  let rij = 4;

  // ── Sectie 1: Belastingdienst-portalen ──────────
  rij = _sectieHeader_(sheet, rij, '📋 Belastingdienst-portalen', accent);
  const portalen = [
    ['Mijn Belastingdienst Zakelijk (BTW-aangifte)', 'https://ondernemers.belastingdienst.nl/'],
    ['BTW-aangifte indienen', 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/btw'],
    ['KOR (Kleineondernemersregeling) aan/afmelden', 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/hoeveel_btw_betalen_en_terugkrijgen/kleineondernemersregeling/'],
    ['ICP-opgaaf (EU B2B-verkopen)', 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/'],
    ['OSS-regeling (EU B2C-verkopen €10k+)', 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/one_stop_shop_oss/'],
    ['Inkomstenbelasting ZZP', 'https://www.belastingdienst.nl/wps/wcm/connect/nl/ib-aangifte/ib-aangifte'],
    ['Suppletie-aangifte (correctie achteraf)', 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/suppletie-of-correctie'],
  ];
  portalen.forEach(function(p) {
    sheet.getRange(rij, 1).setValue(p[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(p[1]).setFontColor('#2EC4B6');
    rij++;
  });
  rij += 2;

  // ── Sectie 2: Bewaarplicht (Art. 52 AWR) ────────
  rij = _sectieHeader_(sheet, rij, '📦 Bewaarplicht — Art. 52 AWR', accent);
  const bewaarplicht = [
    ['Algemene boekhouding', '7 jaar vanaf einde boekjaar'],
    ['Onroerend goed (gebouwen, grond)', '10 jaar vanaf einde boekjaar'],
    ['Bewaarvorm', 'Origineel formaat OF gestructureerde elektronische kopie (XAF)'],
    ['Boekhoudbaar XAF-export', 'Beschikbaar via Menu → Boekhouding → Controle & Export → "💾 Exporteer als XAF"'],
    ['Drive-backup retentie', 'Dagelijks (30 dagen retentie). Voor 7-jaars: jaarlijks XAF-export downloaden.'],
  ];
  bewaarplicht.forEach(function(b) {
    sheet.getRange(rij, 1).setValue(b[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(b[1]);
    rij++;
  });
  rij += 2;

  // ── Sectie 3: Factuur-verplichtingen (Art. 35a Wet OB) ──
  rij = _sectieHeader_(sheet, rij, '🧾 Factuur-verplichtingen — Art. 35a Wet OB', accent);
  const factuurEisen = [
    ['1. Factuurdatum', 'Verplicht'],
    ['2. Uniek factuurnummer (doorlopend)', 'Verplicht — Boekhoudbaar zorgt automatisch'],
    ['3. Naam + adres + KvK leverancier', 'Verplicht'],
    ['4. Naam + adres afnemer', 'Verplicht'],
    ['5. BTW-identificatienummer leverancier', 'Verplicht'],
    ['6. BTW-nr afnemer', 'Verplicht bij verleggingsregeling'],
    ['7. Datum levering of dienst', 'Verplicht'],
    ['8. Hoeveelheid + aard goederen/diensten', 'Verplicht'],
    ['9. Vergoeding per BTW-tarief', 'Verplicht'],
    ['10. BTW-tarief toegepast', 'Verplicht'],
    ['11. BTW-bedrag', 'Verplicht'],
    ['12. Vermelding "btw verlegd" (indien van toepassing)', 'B2B EU + diensten verleggingsregeling'],
  ];
  factuurEisen.forEach(function(f) {
    sheet.getRange(rij, 1).setValue(f[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(f[1]);
    rij++;
  });
  rij += 2;

  // ── Sectie 4: Jaarafsluiting checklist ──────────
  rij = _sectieHeader_(sheet, rij, '✅ Jaarafsluiting-checklist', accent);
  const checklist = [
    ['☐ 1. Alle facturen Q4 verstuurd vóór 31-12', 'Belasting valt anders in volgend jaar'],
    ['☐ 2. Alle bonnen Q4 geboekt', 'Aftrek mag tot 7 jaar achteraf maar liever direct'],
    ['☐ 3. Banktransacties tot 31-12 geïmporteerd', 'Menu → Bank → CSV importeren'],
    ['☐ 4. Openstaande debiteuren gecontroleerd', 'Menu → Facturen → Openstaande klantfacturen'],
    ['☐ 5. BTW Q4 aangifte vóór 31 januari', 'Menu → BTW → Aangifte Q4'],
    ['☐ 6. Privé-opnames + privé-stortingen rondrekening', 'Eigen vermogen sluit op debet+credit'],
    ['☐ 7. Afschrijvingen verwerkt', 'Menu → Boekhouding → Geavanceerd → Afschrijvingen verwerken'],
    ['☐ 8. Voorraad-opname (indien van toepassing)', '31-12 inventarisatie'],
    ['☐ 9. KOR-omzet onder €20.000?', 'Anders afmelden bij Belastingdienst'],
    ['☐ 10. Periode BTW Q4 afsluiten', 'Menu → Boekhouding → Geavanceerd → BTW-periode afsluiten'],
    ['☐ 11. XAF-export voor accountant', 'Menu → Controle & Export → Exporteer als XAF'],
    ['☐ 12. IB-aangifte vóór 1 mei (volgend jaar)', 'Of vraag uitstel aan'],
  ];
  checklist.forEach(function(c) {
    sheet.getRange(rij, 1).setValue(c[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(c[1]).setFontColor('#5F6B7A');
    rij++;
  });
  rij += 2;

  // ── Sectie 5: BTW-deadlines ──────────────────────
  rij = _sectieHeader_(sheet, rij, '📅 BTW-aangifte deadlines (kwartaal)', accent);
  const deadlines = [
    ['Q1 (jan-mrt)', 'Aangifte + betaling vóór 30 april'],
    ['Q2 (apr-jun)', 'Aangifte + betaling vóór 31 juli'],
    ['Q3 (jul-sep)', 'Aangifte + betaling vóór 31 oktober'],
    ['Q4 (okt-dec)', 'Aangifte + betaling vóór 31 januari (volgend jaar)'],
    ['ICP-opgaaf', 'Zelfde deadlines als BTW-aangifte'],
    ['OSS (kwartaal)', 'Vóór laatste dag van maand na kwartaal'],
  ];
  deadlines.forEach(function(d) {
    sheet.getRange(rij, 1).setValue(d[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(d[1]);
    rij++;
  });
  rij += 2;

  // ── Sectie 6: KvK-vereisten ──────────────────────
  rij = _sectieHeader_(sheet, rij, '🏛️ KvK-vereisten', accent);
  const kvk = [
    ['Inschrijfplicht', 'Verplicht bij oprichting onderneming'],
    ['Jaarrekening deponeren', 'Niet voor eenmanszaak/VOF (alleen BV/NV)'],
    ['UBO-register', 'Bij BV/Stichting/Vereniging — niet bij eenmanszaak'],
    ['Wijziging adres / activiteit', 'Binnen 1 week melden bij KvK'],
    ['Stopzetting onderneming', 'Uitschrijven via Mijn KvK (gratis)'],
  ];
  kvk.forEach(function(k) {
    sheet.getRange(rij, 1).setValue(k[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(k[1]);
    rij++;
  });
  rij += 2;

  // ── Sectie 7: Boekhoudbaar-support ──────────────
  rij = _sectieHeader_(sheet, rij, '🆘 Hulp + support', accent);
  const support = [
    ['Documentatie', 'https://www.boekhoudbaar.nl/gids/'],
    ['FAQ', 'https://www.boekhoudbaar.nl/faq/'],
    ['Email support', 'support@boekhoudbaar.nl'],
    ['Installatie-diagnose runnen', 'Menu → Controle & Export → 🔍 Installatie diagnoseren'],
    ['Health-check', 'Menu → Controle & Export → Gezondheidscheck uitvoeren'],
  ];
  support.forEach(function(s) {
    sheet.getRange(rij, 1).setValue(s[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(s[1]);
    rij++;
  });
  rij += 2;

  // ── Sectie 8: Wat als de licentie-server niet meer reageert? ──
  // Audit 2026-06-12 (D4): klanten hadden geen weet van de
  // LICENTIE_GRACE_DAGEN-override. Bij langdurige server-uitval valt na
  // dag 91 ELKE klant stil — zonder dat ze weten dat ze zelf kunnen
  // verlengen. Dit is een bus-factor-risico dat in de Help-tab hoort.
  rij = _sectieHeader_(sheet, rij, '🏖️ Werkt het op vakantie / zonder internet? (offline-toegang)', accent);
  const grace = [
    ['Wat gebeurt er?',
      'Je administratie blijft normaal werken. Boekhoudbaar checkt 1× per dag of de licentie geldig is; bij ' +
      'tijdelijke storingen werkt alles door (90 dagen offline-grace standaard).'],
    ['Wanneer wordt het kritiek?',
      'Na 90 aaneengesloten dagen zonder geslaagde licentie-check. Daarna ' +
      'kun je geen nieuwe facturen meer versturen tot de server weer online is.'],
    ['Wat kun je zelf doen?',
      'Open de Apps Script editor (Extensies → Apps Script), ga naar ' +
      'Projectinstellingen → Scripteigenschappen, en voeg een eigenschap toe ' +
      'met naam LICENTIE_GRACE_DAGEN en waarde 365 (één jaar) of 3650 (tien jaar). ' +
      'Geldige waarden: 1 t/m 3650.'],
    ['Wanneer mag je dat doen?',
      'Alleen als jij weet of het waarschijnlijk is dat de server een ' +
      'tijd langer offline blijft (bv. een aangekondigde overgang). Het is ' +
      'geen omzeil-truc voor licentie-controle — die blijft gewoon gelden ' +
      'zodra de server weer online is.'],
    ['Email check',
      'support@boekhoudbaar.nl — als je niet weet of het probleem aan jouw ' +
      'kant of die van Boekhoudbaar ligt, mail eerst.'],
    ['Als Boekhoudbaar definitief zou stoppen',
      'Je raakt niets kwijt: je hele administratie staat in jóuw Google Drive en blijft werken. ' +
      'Exporteer alles via Boekhouding → Exporteren (XAF + Excel + PDF\'s) voor je accountant. ' +
      'De volledige broncode staat open op github.com/samhoven16/boekhouding-engine, zodat een ' +
      'technische opvolger 1-op-1 verder kan. Zet desnoods LICENTIE_GRACE_DAGEN op 3650 (zie hierboven) ' +
      'om te blijven factureren — dit alles werkt zónder dat onze server nodig is.'],
  ];
  grace.forEach(function(g) {
    sheet.getRange(rij, 1).setValue(g[0]).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(g[1]).setWrap(true).setVerticalAlignment('top');
    rij++;
  });

  // ── Disclaimer aan einde ─────────────────────────
  rij += 2;
  sheet.getRange(rij, 1, 1, 2).merge()
    .setValue('⚠️ Disclaimer: Deze informatie is een samenvatting van publieke bronnen voor jouw gemak. Voor bindende uitspraken raadpleeg altijd de Belastingdienst of een fiscalist. Boekhoudbaar is niet aansprakelijk voor fiscale beslissingen op basis van deze referentie.')
    .setFontStyle('italic').setFontColor('#5F6B7A').setFontSize(10)
    .setWrap(true).setVerticalAlignment('top');

  // ── Layout-finetuning ───────────────────────────
  sheet.setColumnWidth(1, 360);
  sheet.setColumnWidth(2, 580);
  sheet.setFrozenRows(2);

  return sheet;
}

function _sectieHeader_(sheet, rij, titel, accent) {
  sheet.getRange(rij, 1, 1, 2).merge()
    .setValue(titel)
    .setBackground(accent).setFontColor('#0A4744')
    .setFontWeight('bold').setFontSize(12);
  return rij + 1;
}

/**
 * Menu-entry: vernieuw Help-tab handmatig (voor het geval klant content kwijt is).
 */
function vernieuwHelpTab() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  bouwHelpTab_(ss);
  try { ss.toast('Help & Compliance-tab bijgewerkt', 'Boekhoudbaar', 4); } catch (_) {}
}

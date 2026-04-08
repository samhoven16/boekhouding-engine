/**
 * Dashboard.gs
 * Interactief financieel dashboard met KPI's, grafieken en waarschuwingen.
 */

// ─────────────────────────────────────────────
//  DASHBOARD VERNIEUWEN (HOOFDFUNCTIE)
// ─────────────────────────────────────────────
function vernieuwDashboard() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.DASHBOARD);
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Mijn Bedrijf';
  const jaar = new Date().getFullYear();
  const nu = new Date();

  // Bereken KPI's
  const kpi = berekenKpiData_(ss);
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const btwJaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const btwData = getBtwPerMaand_(ss, btwJaar);

  // ── Koptekst ─────────────────────────────────────────────────────────
  sheet.getRange(1, 1, 1, 8).merge()
    .setValue(`FINANCIEEL DASHBOARD – ${bedrijf.toUpperCase()}`)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 8).merge()
    .setValue(`Bijgewerkt op ${formatDatumTijd_(nu)}  |  Boekjaar ${jaar}`)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#E8EAF6')
    .setFontSize(10).setHorizontalAlignment('center');

  sheet.setRowHeight(1, 40);
  sheet.setRowHeight(2, 22);

  // ── KPI Blokken (rij 4) ───────────────────────────────────────────────
  // Burn rate + cash runway (pijnpunt: Fractional CFO / Qonto / Bunq "geen echte boekhouding")
  const burnRate = kpi.kosten > 0 && kpi.omzet > 0
    ? rondBedrag_(Math.max(0, kpi.kosten - kpi.omzet) / 12)
    : 0;
  const runway = burnRate > 0 && kpi.banksaldo > 0
    ? Math.floor(kpi.banksaldo / burnRate)
    : null;

  const kpiItems = [
    { label: 'Omzet (YTD)', waarde: kpi.omzet, format: 'bedrag', kleur: '#E8F5E9' },
    { label: 'Kosten (YTD)', waarde: kpi.kosten, format: 'bedrag', kleur: '#FFEBEE' },
    { label: 'Nettowinst', waarde: kpi.nettowinst, format: 'bedrag', kleur: kpi.nettowinst >= 0 ? '#E8F5E9' : '#FFEBEE' },
    { label: 'Winstmarge', waarde: kpi.winstmarge, format: 'pct', kleur: kpi.winstmarge >= 20 ? '#E8F5E9' : '#FFF8E1' },
    { label: 'Banksaldo', waarde: kpi.banksaldo, format: 'bedrag', kleur: kpi.banksaldo >= 0 ? '#E3F2FD' : '#FFEBEE' },
    { label: 'Open debiteuren', waarde: kpi.debiteurenOpen, format: 'bedrag', kleur: '#FFF3E0' },
    { label: 'Open crediteuren', waarde: kpi.crediteurenOpen, format: 'bedrag', kleur: '#FCE4EC' },
    { label: 'BTW saldo', waarde: kpi.btwSaldo, format: 'bedrag', kleur: '#F3E5F5' },
  ];

  // Rij 4: KPI titels, Rij 5: KPI waarden
  kpiItems.forEach((item, i) => {
    const col = i + 1;
    const titelCel = sheet.getRange(4, col);
    const waardeCel = sheet.getRange(5, col);

    titelCel.setValue(item.label)
      .setBackground(item.kleur)
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setWrap(true);

    if (item.format === 'bedrag') {
      waardeCel.setValue(item.waarde)
        .setNumberFormat('€#,##0.00')
        .setFontSize(12).setFontWeight('bold')
        .setBackground(item.kleur).setHorizontalAlignment('center');
    } else {
      waardeCel.setValue(item.waarde / 100)
        .setNumberFormat('0.0%')
        .setFontSize(12).setFontWeight('bold')
        .setBackground(item.kleur).setHorizontalAlignment('center');
    }

    sheet.setColumnWidth(col, 120);
  });

  sheet.setRowHeight(4, 35);
  sheet.setRowHeight(5, 35);

  // Verwerk herhalende kosten (automatisch boeken + komende betalingen voor waarschuwingen)
  let herhalendeResult = { geboekt: 0, komend: [] };
  try { herhalendeResult = verwerkHerhalendeKosten_(); } catch (e) { Logger.log('Herhalende kosten: ' + e.message); }

  // ── Waarschuwingen ────────────────────────────────────────────────────
  let rij = 7;
  rij = schrijfWaarschuwingen_(sheet, ss, kpi, rij, herhalendeResult.komend);

  // ── Belastingadvies samenvatting ──────────────────────────────────────
  rij++;
  try {
    const advies = berekenBelastingadvies_(ss);
    const topAdviezen = advies.adviezen.filter(a => a.type === 'VOORDEEL' || a.type === 'ACTIE' || a.type === 'WAARSCHUWING').slice(0, 3);
    if (topAdviezen.length > 0 || advies.totaalAftrek > 0) {
      sheet.getRange(rij, 1, 1, 8).merge()
        .setValue('💡 BELASTINGADVIES  |  Totaal aftrekposten: ' + formatBedrag_(advies.totaalAftrek) +
                  '  |  Geschatte IB: ' + formatBedrag_(advies.geschatteIB) +
                  '  →  Klik: Boekhouding → Belastingadvies voor details')
        .setBackground('#FFF8E1').setFontWeight('bold').setFontSize(10);
      rij++;
      topAdviezen.forEach(a => {
        sheet.getRange(rij, 1, 1, 8).merge().setValue(a.titel + '  –  ' + a.tekst.substring(0, 120) + '...')
          .setBackground('#FFFDE7').setFontSize(9).setWrap(false);
        rij++;
      });
    }
  } catch(e) { /* Belastingadvies overgeslagen */ }

  // ── Recente verkoopfacturen ───────────────────────────────────────────
  rij++;
  sheet.getRange(rij, 1, 1, 5).merge()
    .setValue('RECENTE VERKOOPFACTUREN (LAATSTE 10)')
    .setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const vfHeaders = ['Factuurnummer', 'Datum', 'Klant', 'Bedrag incl.', 'Status'];
  sheet.getRange(rij, 1, 1, 5).setValues([vfHeaders])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const recenteVf = vfData.slice(1).filter(r => r[0]).slice(-10).reverse();

  recenteVf.forEach(r => {
    sheet.getRange(rij, 1, 1, 5).setValues([[r[1], r[2], r[5], r[12], r[14]]]);
    sheet.getRange(rij, 4).setNumberFormat('€#,##0.00');

    // Kleurstatus
    const statusKleuren = {
      [FACTUUR_STATUS.BETAALD]: '#E8F5E9',
      [FACTUUR_STATUS.VERVALLEN]: '#FFCDD2',
      [FACTUUR_STATUS.VERZONDEN]: '#E3F2FD',
      [FACTUUR_STATUS.CONCEPT]: '#FFFFFF',
    };
    sheet.getRange(rij, 5).setBackground(statusKleuren[r[14]] || '#FFFFFF');
    rij++;
  });

  // ── BTW Maandoverzicht ────────────────────────────────────────────────
  rij += 2;
  sheet.getRange(rij, 1, 1, 8).merge()
    .setValue(`BTW OVERZICHT ${jaar} (per kwartaal)`)
    .setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const btwHeaders = ['', 'Q1 (jan-mrt)', 'Q2 (apr-jun)', 'Q3 (jul-sep)', 'Q4 (okt-dec)', 'Jaar totaal'];
  sheet.getRange(rij, 1, 1, 6).setValues([btwHeaders])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  const btwQ = [
    btwData.slice(0, 3),   // Q1
    btwData.slice(3, 6),   // Q2
    btwData.slice(6, 9),   // Q3
    btwData.slice(9, 12),  // Q4
  ].map(q => ({
    omzet: q.reduce((s, m) => s + m.omzetHoog + m.omzetLaag, 0),
    btw: q.reduce((s, m) => s + m.btwHoog + m.btwLaag, 0),
    voorbelasting: q.reduce((s, m) => s + m.voorbelasting, 0),
    saldo: q.reduce((s, m) => s + m.saldo, 0),
  }));

  const btwRijen = [
    ['Omzet (excl.)', ...btwQ.map(q => rondBedrag_(q.omzet)), rondBedrag_(btwQ.reduce((s,q) => s+q.omzet,0))],
    ['BTW verschuldigd', ...btwQ.map(q => rondBedrag_(q.btw)), rondBedrag_(btwQ.reduce((s,q) => s+q.btw,0))],
    ['Voorbelasting', ...btwQ.map(q => rondBedrag_(q.voorbelasting)), rondBedrag_(btwQ.reduce((s,q) => s+q.voorbelasting,0))],
    ['SALDO', ...btwQ.map(q => rondBedrag_(q.saldo)), rondBedrag_(btwQ.reduce((s,q) => s+q.saldo,0))],
  ];

  sheet.getRange(rij, 1, btwRijen.length, 6).setValues(btwRijen);
  sheet.getRange(rij, 2, btwRijen.length, 5).setNumberFormat('€#,##0.00');
  sheet.getRange(rij + btwRijen.length - 1, 1, 1, 6).setFontWeight('bold').setBackground(KLEUREN.SECTIE_BG);

  // ── Kengetallen ───────────────────────────────────────────────────────
  rij += btwRijen.length + 2;
  sheet.getRange(rij, 1, 1, 4).merge()
    .setValue('KENGETALLEN').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const kgHeaders = ['Kengetal', 'Waarde', 'Norm', 'Beoordeling'];
  sheet.getRange(rij, 1, 1, 4).setValues([kgHeaders])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  const kengetallen = [
    {
      naam: 'Winstmarge', waarde: kpi.winstmarge + '%',
      norm: '≥ 20%', ok: kpi.winstmarge >= 20,
    },
    {
      naam: 'Current ratio (liquiditeit)', waarde: kpi.liquiditeit ? kpi.liquiditeit.toFixed(2) : 'n.v.t.',
      norm: '≥ 1.5', ok: kpi.liquiditeit === null || kpi.liquiditeit >= 1.5,
    },
    {
      naam: 'Solvabiliteit', waarde: kpi.solvabiliteit ? kpi.solvabiliteit + '%' : 'n.v.t.',
      norm: '≥ 25%', ok: kpi.solvabiliteit === null || kpi.solvabiliteit >= 25,
    },
    {
      naam: 'Debiteurendagen', waarde: kpi.debiteurendagen + ' dagen',
      norm: '≤ 45 dagen', ok: kpi.debiteurendagen <= 45,
    },
    {
      naam: 'Cash runway', waarde: kpi.runway !== null ? kpi.runway + ' maanden' : 'Winstgevend ✓',
      norm: '≥ 3 maanden', ok: kpi.runway === null || kpi.runway >= 3,
    },
    {
      naam: 'Maandelijkse burn rate', waarde: kpi.burnRate > 0 ? formatBedrag_(kpi.burnRate) : '— (winstgevend)',
      norm: '< maandomzet', ok: kpi.burnRate === 0,
    },
  ];

  kengetallen.forEach(kg => {
    sheet.getRange(rij, 1, 1, 4).setValues([[kg.naam, kg.waarde, kg.norm, kg.ok ? '✓ Goed' : '⚠ Let op']]);
    sheet.getRange(rij, 4).setBackground(kg.ok ? '#E8F5E9' : '#FFF3E0');
    rij++;
  });

  // ── ROI Sectie: "Wat heeft Boekhouding Engine u opgeleverd?" ─────────
  rij += 2;
  sheet.getRange(rij, 1, 1, 8).merge()
    .setValue('WAT HEEFT BOEKHOUDING ENGINE U OPGELEVERD?')
    .setBackground('#1A237E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(12);
  rij++;

  const roiData = berekenRoiData_(ss, kpi);

  const roiItems = [
    { label: 'Facturen verstuurd', waarde: roiData.aantalFacturen + ' stuks', icon: '📋' },
    { label: 'Omzet geïnd dit jaar', waarde: formatBedrag_(roiData.omzetGeind), icon: '💶' },
    { label: 'BTW correct verwerkt', waarde: formatBedrag_(roiData.btwVerwerkt), icon: '✅' },
    { label: 'Geschatte tijdsbesparing', waarde: roiData.tijdsBesparing + ' uur/jaar', icon: '⏱' },
  ];

  roiItems.forEach((item, i) => {
    const col = i * 2 + 1;
    sheet.getRange(rij, col, 1, 2).merge()
      .setValue(item.icon + '  ' + item.label)
      .setBackground('#E8EAF6').setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center');
    sheet.getRange(rij + 1, col, 1, 2).merge()
      .setValue(item.waarde)
      .setBackground('#E8EAF6').setFontSize(14).setFontWeight('bold')
      .setHorizontalAlignment('center').setFontColor('#1A237E');
  });

  sheet.setRowHeight(rij, 28);
  sheet.setRowHeight(rij + 1, 32);
  rij += 3;

  // Tijdbesparing motivatietekst
  sheet.getRange(rij, 1, 1, 8).merge()
    .setValue(`💡 Op basis van ${roiData.aantalFacturen} facturen, ${roiData.aantalBoekingen} boekingen en automatische categorisering schat Boekhouding Engine u ~${roiData.tijdsBesparing} uur administratietijd te hebben bespaard dit jaar.`)
    .setBackground('#F5F5FF').setFontSize(9).setWrap(true).setFontColor('#37474F');
  sheet.setRowHeight(rij, 30);

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  ROI DATA BEREKENEN
// ─────────────────────────────────────────────
function berekenRoiData_(ss, kpi) {
  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const jrData = ss.getSheetByName(SHEETS.JOURNAALPOSTEN).getDataRange().getValues();
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const boekjaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();

  const aantalFacturen = Math.max(0, vfData.length - 1);

  // Omzet geïnd = incl-bedrag van betaalde facturen in boekjaar
  let omzetGeind = 0;
  for (let i = 1; i < vfData.length; i++) {
    if (vfData[i][14] !== FACTUUR_STATUS.BETAALD) continue;
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    if (datum && datum.getFullYear() !== boekjaar) continue;
    omzetGeind += parseFloat(vfData[i][12]) || 0; // incl. BTW bedrag
  }

  // BTW correct verwerkt = som van BTW-bedragen op facturen in boekjaar
  let btwVerwerkt = 0;
  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    if (datum && datum.getFullYear() !== boekjaar) continue;
    const incl = parseFloat(vfData[i][12]) || 0;
    const excl = parseFloat(vfData[i][9]) || 0;
    btwVerwerkt += rondBedrag_(incl - excl);
  }

  // Boekingen gefilterd op boekjaar
  let aantalBoekingen = 0;
  for (let i = 1; i < jrData.length; i++) {
    const datum = jrData[i][1] ? new Date(jrData[i][1]) : null;
    if (!datum || datum.getFullYear() !== boekjaar) continue;
    aantalBoekingen++;
  }

  // Tijdsbesparing schatting:
  // - 15 min per factuur aanmaken/versturen
  // - 5 min per boeking handmatig vs. 1 min automatisch → 4 min bespaard
  // - 2 uur per kwartaal BTW aangifte (vs. 4 uur handmatig) → 6 uur/jaar
  const minPerFactuur = 15;
  const minPerBoeking = 4;
  const minBtw = 6 * 60;
  const totalMin = (aantalFacturen * minPerFactuur) + (aantalBoekingen * minPerBoeking) + minBtw;
  const tijdsBesparing = Math.round(totalMin / 60);

  return { aantalFacturen, omzetGeind, btwVerwerkt, aantalBoekingen, tijdsBesparing };
}

// ─────────────────────────────────────────────
//  KPI DATA BEREKENEN
// ─────────────────────────────────────────────
function berekenKpiData_(ss) {
  const kg = berekenKengetallen_(ss);
  const jaar = new Date().getFullYear();

  // Open debiteuren
  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  let debiteurenOpen = 0;
  let aantalOpenFacturen = 0;
  let totaalDagenOpen = 0;
  const vandaag = new Date();

  for (let i = 1; i < vfData.length; i++) {
    const status = vfData[i][14];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;
    const incl = parseFloat(vfData[i][12]) || 0;
    const betaald = parseFloat(vfData[i][13]) || 0;
    const open = rondBedrag_(incl - betaald);
    if (open <= 0) continue;
    debiteurenOpen += open;
    aantalOpenFacturen++;
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : vandaag;
    totaalDagenOpen += Math.floor((vandaag - datum) / (1000 * 60 * 60 * 24));
  }

  // Open crediteuren
  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();
  let crediteurenOpen = 0;
  for (let i = 1; i < ifData.length; i++) {
    if (ifData[i][12] === FACTUUR_STATUS.BETAALD) continue;
    crediteurenOpen += parseFloat(ifData[i][11]) || 0;
  }

  // BTW saldo
  const btwData = getBtwPerMaand_(ss, jaar);
  const btwSaldo = btwData.reduce((s, m) => s + m.saldo, 0);

  // Burn rate + runway berekenen (maandelijkse kosten minus omzet)
  const maandenVerstreken = Math.max(1, new Date().getMonth() + 1);
  const maandelijkseKosten = kg.kosten / maandenVerstreken;
  const maandelijkseOmzet  = kg.omzet  / maandenVerstreken;
  const netBurnRate = rondBedrag_(Math.max(0, maandelijkseKosten - maandelijkseOmzet));
  const runway = netBurnRate > 0 ? Math.floor(kg.banksaldo / netBurnRate) : null;

  return {
    ...kg,
    debiteurenOpen: rondBedrag_(debiteurenOpen),
    crediteurenOpen: rondBedrag_(crediteurenOpen),
    btwSaldo: rondBedrag_(btwSaldo),
    aantalOpenFacturen,
    debiteurendagen: aantalOpenFacturen > 0 ? Math.round(totaalDagenOpen / aantalOpenFacturen) : 0,
    liquiditeit: kg.liquiditeit,
    solvabiliteit: kg.solvabiliteit,
    burnRate: netBurnRate,
    runway,
  };
}

// ─────────────────────────────────────────────
//  WAARSCHUWINGEN SCHRIJVEN
// ─────────────────────────────────────────────
function schrijfWaarschuwingen_(sheet, ss, kpi, startRij, komendHerhalend) {
  const waarschuwingen = [];

  if (kpi.banksaldo < 0) waarschuwingen.push(['KRITIEK', 'Negatief banksaldo!', '#FFCDD2']);
  if (kpi.debiteurenOpen > 10000) waarschuwingen.push(['LET OP', `Open debiteuren boven €10.000: ${formatBedrag_(kpi.debiteurenOpen)}`, '#FFF3E0']);
  if (kpi.nettowinst < 0) waarschuwingen.push(['LET OP', 'Bedrijf maakt verlies dit boekjaar!', '#FFCDD2']);

  // Vervallen facturen
  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const aantalVervallen = vfData.slice(1).filter(r => r[14] === FACTUUR_STATUS.VERVALLEN).length;
  if (aantalVervallen > 0) waarschuwingen.push(['LET OP', `${aantalVervallen} vervallen factuur/facturen`, '#FFF3E0']);

  // BTW deadline controle (bug-fix: was altijd true door <= 31 conditie)
  // Deadlines: Q1→30 april, Q2→31 juli, Q3→31 okt, Q4→31 jan
  // Waarschuwing toont in de 2 weken voor de deadline
  const nu = new Date();
  const maand = nu.getMonth() + 1;
  const dag   = nu.getDate();
  const btwDeadlines = [
    { kwartaal: 'Q4 vorig jaar', warnMaand: 1,  warnVanaf: 15 },
    { kwartaal: 'Q1',            warnMaand: 4,  warnVanaf: 15 },
    { kwartaal: 'Q2',            warnMaand: 7,  warnVanaf: 15 },
    { kwartaal: 'Q3',            warnMaand: 10, warnVanaf: 15 },
  ];
  const btwDeadline = btwDeadlines.find(d => d.warnMaand === maand && dag >= d.warnVanaf);
  if (btwDeadline) {
    waarschuwingen.push(['LET OP', `BTW aangifte ${btwDeadline.kwartaal} — deadline einde deze maand! Genereer via Boekhouding → BTW.`, '#FFF3E0']);
  }

  // Cash runway waarschuwing (nieuw: Fractional CFO / startup pijnpunt)
  if (kpi.runway !== undefined && kpi.runway !== null && kpi.runway < 3) {
    waarschuwingen.push(['KRITIEK', `Cash runway: ~${kpi.runway} maand(en) bij huidig uitgavenpatroon. Verlaag kosten of vergroot omzet.`, '#FFCDD2']);
  }

  // Crediteuren vervallen waarschuwing (nieuw: Blue10 AP automation pijnpunt)
  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();
  let vervallenCrediteuren = 0;
  const vandaag30 = nu;
  for (let i = 1; i < ifData.length; i++) {
    if (ifData[i][12] === FACTUUR_STATUS.BETAALD) continue;
    const factDatum = ifData[i][3] ? new Date(ifData[i][3]) : null;
    if (!factDatum) continue;
    const vervaldatum = new Date(factDatum.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (vandaag30 > vervaldatum) vervallenCrediteuren++;
  }
  if (vervallenCrediteuren > 0) {
    waarschuwingen.push(['LET OP', `${vervallenCrediteuren} inkoopfactuur/facturen zijn te laat betaald (leverancierstermijn >30 dagen). Zie tabblad Crediteuren.`, '#FFF3E0']);
  }

  // Herhalende kosten komende 30 dagen
  if (komendHerhalend && komendHerhalend.length > 0) {
    const totaalKomend = komendHerhalend.reduce((s, k) => s + k.bedrag, 0);
    const namen = komendHerhalend.slice(0, 3).map(k => k.naam + ' (' + formatBedrag_(k.bedrag) + ')').join(', ');
    waarschuwingen.push(['INFO', `Herhalende kosten volgende 30 dagen: ${formatBedrag_(totaalKomend)} — ${namen}${komendHerhalend.length > 3 ? ' en meer' : ''}`, '#E3F2FD']);
  }

  if (waarschuwingen.length === 0) {
    sheet.getRange(startRij, 1, 1, 8).merge()
      .setValue('✓ Geen waarschuwingen – alles ziet er goed uit!')
      .setBackground('#E8F5E9').setFontColor('#1B5E20').setFontWeight('bold');
    return startRij + 1;
  }

  sheet.getRange(startRij, 1, 1, 8).merge()
    .setValue('WAARSCHUWINGEN').setBackground('#FF8F00').setFontColor('#FFFFFF').setFontWeight('bold');
  startRij++;

  waarschuwingen.forEach(([type, tekst, bg]) => {
    sheet.getRange(startRij, 1).setValue(type).setBackground(bg).setFontWeight('bold');
    sheet.getRange(startRij, 2, 1, 7).merge().setValue(tekst).setBackground(bg);
    startRij++;
  });

  return startRij;
}

// ─────────────────────────────────────────────
//  DASHBOARD HTML DIALOG
// ─────────────────────────────────────────────

/**
 * Opent het interactieve dashboard als HTML dialog.
 * Menu: Boekhouding → Dashboard openen
 */
function openDashboard() {
  const html = HtmlService.createHtmlOutput(_bouwDashboardHtml_())
    .setWidth(880)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Dashboard');
}

/**
 * Geeft dashboard data terug voor de HTML dialog.
 * Publieke functie — aangeroepen via google.script.run.
 */
function getDashboardData() {
  const ss = getSpreadsheet_();
  const nu = new Date();
  const huidigeM = nu.getMonth();
  const huidigeJ = nu.getFullYear();

  const kpi = berekenKpiData_(ss);

  // Maand-specifieke omzet + vervallen facturen uit Verkoopfacturen
  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  let omzetMaand = 0;
  const vervallenFacturen = [];
  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    const status = String(vfData[i][14] || '');
    if (datum && datum.getMonth() === huidigeM && datum.getFullYear() === huidigeJ) {
      omzetMaand += parseFloat(vfData[i][12]) || 0;
    }
    if (status === FACTUUR_STATUS.VERVALLEN) {
      vervallenFacturen.push({
        nr:    String(vfData[i][1] || ''),
        klant: String(vfData[i][5] || '–'),
        bedrag: parseFloat(vfData[i][12]) || 0,
        datum: datum ? formatDatum_(datum) : '–',
      });
    }
  }

  // Maand-specifieke kosten uit Inkoopfacturen (col 11 = bedrag incl.)
  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();
  let kostenMaand = 0;
  for (let i = 1; i < ifData.length; i++) {
    const datum = ifData[i][3] ? new Date(ifData[i][3]) : null;
    if (datum && datum.getMonth() === huidigeM && datum.getFullYear() === huidigeJ) {
      kostenMaand += parseFloat(ifData[i][11]) || 0;
    }
  }

  return {
    bedrijf:    getInstelling_('Bedrijfsnaam') || 'Mijn bedrijf',
    bijgewerkt: formatDatumTijd_(nu),
    kpi: {
      aantalOpenFacturen: kpi.aantalOpenFacturen,
      debiteurenOpen:     kpi.debiteurenOpen,
      omzetMaand:         rondBedrag_(omzetMaand),
      kostenMaand:        rondBedrag_(kostenMaand),
      btwSaldo:           kpi.btwSaldo,
      btwDeadline:        _berekenBtwDeadline_(),
    },
    vervallenFacturen: vervallenFacturen.slice(0, 10),
  };
}

function _berekenBtwDeadline_() {
  const nu = new Date();
  const m = nu.getMonth() + 1; // 1–12
  // Aangifte deadlines: Q1→30 apr, Q2→31 jul, Q3→31 okt, Q4→31 jan
  const deadlines = [
    { kwartaal: 'Q1', maandNr: 4,  dag: 30 },
    { kwartaal: 'Q2', maandNr: 7,  dag: 31 },
    { kwartaal: 'Q3', maandNr: 10, dag: 31 },
    { kwartaal: 'Q4', maandNr: 1,  dag: 31 },
  ];
  let volgende = deadlines.find(d => d.maandNr >= m);
  let jaar = nu.getFullYear();
  if (!volgende) {
    volgende = deadlines[3]; // Q4 → jan volgend jaar
    jaar = nu.getFullYear() + 1;
  }
  const datum = new Date(jaar, volgende.maandNr - 1, volgende.dag);
  const dagenOver = Math.ceil((datum - nu) / (1000 * 60 * 60 * 24));
  return {
    kwartaal: volgende.kwartaal,
    datum:    formatDatum_(datum),
    dagenOver,
    urgent:   dagenOver <= 14,
  };
}

function _bouwDashboardHtml_() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:Arial,sans-serif;font-size:13px;color:#212121;background:#F4F5F8;height:100vh;display:flex;flex-direction:column;overflow:hidden}' +
    '.hdr{background:#1A237E;color:white;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
    '.hdr h1{font-size:14px;font-weight:bold;letter-spacing:.3px}' +
    '.hdr .meta{font-size:10px;opacity:.65;margin-top:2px}' +
    '.btn-ref{background:rgba(255,255,255,.15);border:none;color:white;padding:5px 11px;border-radius:4px;cursor:pointer;font-size:11px}' +
    '.btn-ref:hover{background:rgba(255,255,255,.25)}' +
    '.body{flex:1;overflow-y:auto;padding:14px 16px}' +
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}' +
    '.kpi{background:white;border-radius:8px;padding:13px 14px;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,.05)}' +
    '.kpi .lbl{font-size:10px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:.5px}' +
    '.kpi .val{font-size:19px;font-weight:bold;color:#111827;margin:5px 0 3px;line-height:1}' +
    '.kpi .sub{font-size:11px;color:#9CA3AF}' +
    '.kpi.goed .val{color:#15803D}.kpi.warn .val{color:#B45309}.kpi.krit .val{color:#B91C1C}' +
    '.sec{font-size:10px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}' +
    '.acties{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}' +
    '.actie{background:white;border:2px solid #E5E7EB;border-radius:8px;padding:14px 10px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;user-select:none}' +
    '.actie:hover{border-color:#3730A3;background:#F5F3FF}' +
    '.actie .icoon{font-size:22px;margin-bottom:6px}' +
    '.actie .txt{font-size:12px;font-weight:bold;color:#1E1B4B;line-height:1.3}' +
    '.actie.pr{background:#1A237E;border-color:#1A237E}.actie.pr .txt{color:white}.actie.pr:hover{background:#283593;border-color:#283593}' +
    '.lijst{background:white;border-radius:8px;border:1px solid #E5E7EB;overflow:hidden;margin-bottom:14px}' +
    '.rij{display:flex;align-items:center;padding:9px 14px;border-bottom:1px solid #F9FAFB;gap:10px}' +
    '.rij:last-child{border-bottom:none}' +
    '.badge{font-size:10px;font-weight:bold;padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;background:#FEE2E2;color:#991B1B}' +
    '.hoofd{flex:1;min-width:0}' +
    '.naam{font-weight:bold;color:#111827;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sub2{font-size:10px;color:#9CA3AF;margin-top:1px}' +
    '.bedrag{font-size:13px;font-weight:bold;color:#B91C1C;flex-shrink:0}' +
    '.leeg{padding:18px;text-align:center;color:#9CA3AF;font-size:12px}' +
    '.loading{text-align:center;padding:60px 20px;color:#9CA3AF}' +
    '.spin{display:inline-block;width:22px;height:22px;border:2px solid #E5E7EB;border-top-color:#1A237E;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:10px}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '</style></head><body>' +
    '<div class="hdr">' +
    '  <div><h1 id="h-nm">Dashboard laden\u2026</h1><div class="meta" id="h-tm"></div></div>' +
    '  <button class="btn-ref" onclick="laad()">\u21bb Vernieuwen</button>' +
    '</div>' +
    '<div class="body" id="body"><div class="loading"><div class="spin"></div><br>Even laden\u2026</div></div>' +
    '<script>' +
    'function fmt(b){b=parseFloat(b)||0;return(b<0?"-\u20ac":"\u20ac")+Math.abs(b).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});}' +
    'function esc(s){return String(s||"").replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\'":"&#39;"}[c];});}' +
    'function laad(){' +
    '  document.getElementById("body").innerHTML=\'<div class="loading"><div class="spin"></div><br>Even laden\u2026</div>\';' +
    '  google.script.run.withSuccessHandler(render).withFailureHandler(function(e){' +
    '    document.getElementById("body").innerHTML=\'<div class="loading" style="color:#B91C1C">Laden mislukt: \'+esc(e.message)+\'</div>\';' +
    '  }).getDashboardData();' +
    '}' +
    'function render(d){' +
    '  document.getElementById("h-nm").textContent=(d.bedrijf||"Dashboard")+" \u2014 Dashboard";' +
    '  document.getElementById("h-tm").textContent="Bijgewerkt: "+d.bijgewerkt;' +
    '  var k=d.kpi,btw=k.btwDeadline,h="";' +
    '  h+=\'<div class="kpi-grid">\';' +
    '  h+=kpi("Open facturen",k.aantalOpenFacturen+" stuks",fmt(k.debiteurenOpen),k.aantalOpenFacturen>0?"warn":"goed");' +
    '  h+=kpi("Omzet deze maand",fmt(k.omzetMaand),"",k.omzetMaand>0?"goed":"");' +
    '  h+=kpi("Kosten deze maand",fmt(k.kostenMaand),"","");' +
    '  h+=kpi("BTW aangifte",btw.kwartaal+" \u2014 "+btw.datum,btw.dagenOver+" dagen over",btw.urgent?"krit":"");' +
    '  h+=\'</div>\';' +
    '  h+=\'<div class="sec">Snelle acties</div>\';' +
    '  h+=\'<div class="acties">\';' +
    '  h+=actie("\u2795","Nieuwe boeking","openNieuweBoeking",true);' +
    '  h+=actie("\uD83D\uDCF7","Upload bon","openBonUpload",false);' +
    '  h+=actie("\uD83D\uDCCB","Openstaande facturen","vernieuwDebiteurenOverzicht",false);' +
    '  h+=\'</div>\';' +
    '  h+=\'<div class="sec">Vervallen facturen (\'+(d.vervallenFacturen?d.vervallenFacturen.length:0)+\')</div>\';' +
    '  h+=\'<div class="lijst">\';' +
    '  if(d.vervallenFacturen&&d.vervallenFacturen.length>0){' +
    '    d.vervallenFacturen.forEach(function(f){' +
    '      h+=\'<div class="rij"><span class="badge">Vervallen</span>\';' +
    '      h+=\'<div class="hoofd"><div class="naam">\'+esc(f.klant)+\'</div><div class="sub2">\'+esc(f.nr)+\' \u00b7 \'+esc(f.datum)+\'</div></div>\';' +
    '      h+=\'<div class="bedrag">\'+fmt(f.bedrag)+\'</div></div>\';' +
    '    });' +
    '  }else{h+=\'<div class="leeg">\u2713 Geen vervallen facturen</div>\';}' +
    '  h+=\'</div>\';' +
    '  document.getElementById("body").innerHTML=h;' +
    '}' +
    'function kpi(lbl,val,sub,kls){' +
    '  return \'<div class="kpi \'+(kls||"")+\'">\'+' +
    '    \'<div class="lbl">\'+lbl+\'</div>\'+' +
    '    \'<div class="val">\'+val+\'</div>\'+' +
    '    (sub?\'<div class="sub">\'+sub+\'</div>\':"")+' +
    '    \'</div>\';' +
    '}' +
    'function actie(icoon,txt,fn,pr){' +
    '  return \'<div class="actie\'+(pr?" pr":"")+\'" onclick="roep(\\\'\'+ fn +\'\\\')">\'+' +
    '    \'<div class="icoon">\'+icoon+\'</div>\'+' +
    '    \'<div class="txt">\'+txt+\'</div></div>\';' +
    '}' +
    'function roep(fn){' +
    '  google.script.run' +
    '    .withSuccessHandler(function(){google.script.host.close();})' +
    '    .withFailureHandler(function(e){alert("Fout: "+e.message);})' +
    '    [fn]();' +
    '}' +
    'laad();' +
    '<\/script></body></html>';
}

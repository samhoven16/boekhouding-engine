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

  ss.setActiveSheet(sheet);
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

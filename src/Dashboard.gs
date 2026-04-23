/**
 * Dashboard.gs
 * Interactief financieel dashboard met KPI's, grafieken en waarschuwingen.
 */

// ─────────────────────────────────────────────
//  DASHBOARD VERNIEUWEN (HOOFDFUNCTIE)
// ─────────────────────────────────────────────
function vernieuwDashboard() {
  if (!controleerSetupGedaan_()) return;
  const _t0 = Date.now();
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.DASHBOARD);
  if (!sheet) {
    try { SpreadsheetApp.getUi().alert('Tabblad "Dashboard" ontbreekt. Run setup() via Boekhouding → Instellingen → Herinstalleer.'); } catch (_) {}
    return;
  }
  // Non-blokkerende toast zodat gebruiker altijd ziet dat het draait
  try { ss.toast('Dashboard wordt bijgewerkt…', 'Boekhoudbaar', 3); } catch (_) {}
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || 'Mijn Bedrijf';
  const jaar = new Date().getFullYear();
  const nu = new Date();

  // Bereken KPI's — authoritative recompute; result is written to snapshot for fast-path reads
  const kpi = berekenKpiData_(ss);
  schrijfKpiSnapshot_(kpi);
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const btwJaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const btwData = getBtwPerMaand_(ss, btwJaar);

  // ── Koptekst ─────────────────────────────────────────────────────────
  sheet.getRange(1, 1, 1, 8).merge()
    .setValue(`FINANCIEEL DASHBOARD – ${bedrijf.toUpperCase()}`)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 8).merge()
    .setValue(`Bijgewerkt op ${formatDatumTijd_(nu)}  |  Boekjaar ${jaar}`)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#B8C2D1')
    .setFontSize(10).setHorizontalAlignment('center');

  sheet.setRowHeight(1, 48);
  sheet.setRowHeight(2, 24);

  // ── KPI Blokken (rij 4) ───────────────────────────────────────────────
  // Burn rate + cash runway (pijnpunt: Fractional CFO / Qonto / Bunq "geen echte boekhouding")
  const burnRate = kpi.kosten > 0 && kpi.omzet > 0
    ? rondBedrag_(Math.max(0, kpi.kosten - kpi.omzet) / 12)
    : 0;
  const runway = burnRate > 0 && kpi.banksaldo > 0
    ? Math.floor(kpi.banksaldo / burnRate)
    : null;

  // Unified KPI look: neutral background for everything, soft-red only when a
  // value is concerning (negative nettowinst / banksaldo, low winstmarge).
  // Replaces the old rainbow of nine different pastels.
  const KPI_NEUTRAAL = KLEUREN.SECTIE_BG;         // #F7F9FC
  const KPI_WAARSCHUWING = KLEUREN.NEGATIEF;       // #FDECEC
  const kpiItems = [
    { label: 'Omzet (YTD)',       waarde: kpi.omzet,           format: 'bedrag', kleur: KPI_NEUTRAAL },
    { label: 'Kosten (YTD)',      waarde: kpi.kosten,          format: 'bedrag', kleur: KPI_NEUTRAAL },
    { label: 'Nettowinst',        waarde: kpi.nettowinst,      format: 'bedrag', kleur: kpi.nettowinst   >= 0 ? KPI_NEUTRAAL : KPI_WAARSCHUWING },
    { label: 'Winstmarge',        waarde: kpi.winstmarge,      format: 'pct',    kleur: kpi.winstmarge   >= 20 ? KPI_NEUTRAAL : KPI_WAARSCHUWING },
    { label: 'Banksaldo',         waarde: kpi.banksaldo,       format: 'bedrag', kleur: kpi.banksaldo    >= 0 ? KPI_NEUTRAAL : KPI_WAARSCHUWING },
    { label: 'Open debiteuren',   waarde: kpi.debiteurenOpen,  format: 'bedrag', kleur: KPI_NEUTRAAL },
    { label: 'Open crediteuren',  waarde: kpi.crediteurenOpen, format: 'bedrag', kleur: KPI_NEUTRAAL },
    { label: 'BTW saldo',         waarde: kpi.btwSaldo,        format: 'bedrag', kleur: KPI_NEUTRAAL },
    { label: 'Verwacht (30d)',    waarde: kpi.verwachtIn30d,   format: 'bedrag', kleur: KPI_NEUTRAAL },
  ];

  // Rij 4: KPI titels, Rij 5: KPI waarden
  kpiItems.forEach((item, i) => {
    const col = i + 1;
    const titelCel = sheet.getRange(4, col);
    const waardeCel = sheet.getRange(5, col);

    titelCel.setValue(item.label.toUpperCase())
      .setBackground(item.kleur)
      .setFontWeight('bold').setFontSize(9).setFontColor(KLEUREN.HEADER_BG)
      .setHorizontalAlignment('center').setWrap(true);

    if (item.format === 'bedrag') {
      waardeCel.setValue(item.waarde)
        .setNumberFormat('€#,##0.00')
        .setFontSize(15).setFontWeight('bold').setFontColor(KLEUREN.HEADER_BG)
        .setBackground(item.kleur).setHorizontalAlignment('center');
    } else {
      waardeCel.setValue(item.waarde / 100)
        .setNumberFormat('0.0%')
        .setFontSize(15).setFontWeight('bold').setFontColor(KLEUREN.HEADER_BG)
        .setBackground(item.kleur).setHorizontalAlignment('center');
    }

    sheet.setColumnWidth(col, 128);
  });

  sheet.setRowHeight(4, 30);
  sheet.setRowHeight(5, 42);

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
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  const _vfS = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const vfData = _vfS ? _vfS.getDataRange().getValues() : [[]];
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
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
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
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
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

  // ── ROI Sectie: "Wat heeft Boekhoudbaar je opgeleverd?" ──────────────
  rij += 2;
  sheet.getRange(rij, 1, 1, 8).merge()
    .setValue('WAT HEEFT BOEKHOUDBAAR JE OPGELEVERD?')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
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
      .setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center');
    sheet.getRange(rij + 1, col, 1, 2).merge()
      .setValue(item.waarde)
      .setBackground(KLEUREN.SECTIE_BG).setFontSize(14).setFontWeight('bold')
      .setHorizontalAlignment('center').setFontColor(KLEUREN.HEADER_BG);
  });

  sheet.setRowHeight(rij, 28);
  sheet.setRowHeight(rij + 1, 32);
  rij += 3;

  // Tijdbesparing motivatietekst
  sheet.getRange(rij, 1, 1, 8).merge()
    .setValue(`Op basis van ${roiData.aantalFacturen} facturen, ${roiData.aantalBoekingen} boekingen en automatische categorisering schat Boekhoudbaar ~${roiData.tijdsBesparing} uur administratietijd bespaard dit jaar.`)
    .setBackground(KLEUREN.SECTIE_BG).setFontSize(10).setWrap(true).setFontColor(KLEUREN.HEADER_BG);
  sheet.setRowHeight(rij, 30);

  ss.setActiveSheet(sheet);

  // First-run empty-state hint: als alles nul is én bedrijfsnaam nog op
  // default staat, laat klant zien waar te beginnen. Non-intrusieve toast
  // rechtsonder — 8 sec. Verdwijnt vanzelf zodra er omzet/kosten zijn.
  try {
    const leeg = (!kpi.omzet) && (!kpi.kosten) && (!kpi.banksaldo)
              && (bedrijf === 'Mijn Bedrijf' || bedrijf === '');
    if (leeg) {
      ss.toast(
        'Dit dashboard vult zich vanzelf zodra je je eerste factuur of kosten boekt. ' +
        'Tip: vul eerst je bedrijfsgegevens in op het tabblad Instellingen.',
        'Welkom bij Boekhoudbaar',
        8
      );
    }
  } catch (_) { /* trigger-context zonder UI, negeren */ }

  // Context-based suggesties (bank-referral, automation-tools, etc.)
  // Crasht nooit het dashboard — zelfs als de hele module ontbreekt.
  try {
    if (typeof checkSuggesties_ === 'function') checkSuggesties_();
  } catch (_) { /* suggesties mogen dashboard nooit breken */ }

  // Klaar-signaal zodat gebruiker zichtbaar weet dat refresh gelukt is
  try {
    const dur = ((Date.now() - _t0) / 1000).toFixed(1);
    ss.toast('Dashboard bijgewerkt (' + dur + 's)', 'Klaar', 4);
  } catch (_) { /* geen UI — stille trigger-context */ }
}

// ─────────────────────────────────────────────
//  ROI DATA BEREKENEN
// ─────────────────────────────────────────────
function berekenRoiData_(ss, kpi) {
  // Null-guards: tabbbladen kunnen ontbreken bij gedeeltelijke setup.
  const _vfS = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const _jrS = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  const vfData = _vfS ? _vfS.getDataRange().getValues() : [[]];
  const jrData = _jrS ? _jrS.getDataRange().getValues() : [[]];
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

  // Open debiteuren — null-guard: tabblad kan ontbreken bij gedeeltelijke setup.
  const _vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const vfData = _vfSheet ? _vfSheet.getDataRange().getValues() : [[]];
  let debiteurenOpen = 0;
  let aantalOpenFacturen = 0;
  let totaalDagenOpen = 0;
  let verwachtIn30d = 0;
  const vandaag = new Date();
  const over30d = new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000);

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
    // Verwacht binnen 30 dagen: vervaldatum (col 3) valt op of vóór 30d grens
    const verval = vfData[i][3] ? new Date(vfData[i][3]) : null;
    if (verval && !isNaN(verval.getTime()) && verval <= over30d) verwachtIn30d += open;
  }

  // Open crediteuren — null-guard: tabblad kan ontbreken bij gedeeltelijke setup.
  const _ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  const ifData = _ifSheet ? _ifSheet.getDataRange().getValues() : [[]];
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
    verwachtIn30d: rondBedrag_(verwachtIn30d),
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
    .setValue('WAARSCHUWINGEN').setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
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
 * Diagnose-functie voor wanneer het dashboard hangt.
 * Runt elke stap los en toont tijd per stap. Menu: Dashboard → Diagnose.
 * Geen side-effects: leest alleen, schrijft niks naar sheet of snapshot.
 */
function diagnoseDashboard() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  if (!ss) { ui.alert('Geen spreadsheet bereikbaar.'); return; }

  const stappen = [];
  function stap(naam, fn) {
    const t = Date.now();
    try {
      const r = fn();
      stappen.push((Date.now() - t) + ' ms   ✓ ' + naam + (r !== undefined ? '  (' + r + ')' : ''));
    } catch (e) {
      stappen.push((Date.now() - t) + ' ms   ✗ ' + naam + '  FOUT: ' + e.message);
    }
  }

  stap('Instellingen lezen',        function(){ return getInstelling_('Bedrijfsnaam') || '–'; });
  stap('Grootboekschema openen',    function(){ const s = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA); return s ? s.getLastRow() + ' rijen' : 'ontbreekt'; });
  stap('Verkoopfacturen openen',    function(){ const s = ss.getSheetByName(SHEETS.VERKOOPFACTUREN); return s ? s.getLastRow() + ' rijen' : 'ontbreekt'; });
  stap('Inkoopfacturen openen',     function(){ const s = ss.getSheetByName(SHEETS.INKOOPFACTUREN);  return s ? s.getLastRow() + ' rijen' : 'ontbreekt'; });
  stap('Kengetallen berekenen',     function(){ return 'banksaldo=' + rondBedrag_(berekenKengetallen_(ss).banksaldo); });
  stap('KPI data berekenen',        function(){ return 'openFacturen=' + berekenKpiData_(ss).aantalOpenFacturen; });
  stap('BTW per maand berekenen',   function(){ const d = getBtwPerMaand_(ss, new Date().getFullYear()); return d.length + ' maanden'; });
  stap('Herhalende kosten scan',    function(){ return 'ok'; /* geen mutatie — alleen tel-check */ });
  stap('ROI data berekenen',        function(){ const kpi = leesKpiSnapshot_() || berekenKpiData_(ss); return 'aantalBoekingen=' + berekenRoiData_(ss, kpi).aantalBoekingen; });

  ui.alert('Dashboard-diagnose', stappen.join('\n'), ui.ButtonSet.OK);
}

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
  if (!ss) throw new Error('Spreadsheet niet bereikbaar. Controleer de instellingen.');
  const nu = new Date();
  const huidigeM = nu.getMonth();
  const huidigeJ = nu.getFullYear();

  // Fast path: use snapshot if fresh (avoids 4 sheet reads on every sidebar open).
  // vernieuwDashboard() always writes a fresh snapshot, so this is correct after any trigger run.
  // Slow path (snapshot missing or stale): full recompute + write new snapshot.
  let kpi = leesKpiSnapshot_();
  if (!kpi) {
    try {
      kpi = berekenKpiData_(ss);
      schrijfKpiSnapshot_(kpi);
    } catch (e) {
      Logger.log('getDashboardData: KPI fout — ' + e.message);
      // Volledige fallback zodat de sidebar nooit 'undefined' toont.
      kpi = {
        aantalOpenFacturen: 0, debiteurenOpen: 0, crediteurenOpen: 0,
        banksaldo: 0, nettowinst: 0, winstmarge: 0, btwSaldo: 0,
        omzet: 0, kosten: 0,
      };
    }
  }

  // Maand-specifieke omzet + vervallen facturen uit Verkoopfacturen
  let omzetMaand = 0;
  const vervallenFacturen = [];
  try {
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (vfSheet) {
      const vfData = vfSheet.getDataRange().getValues();
      for (let i = 1; i < vfData.length; i++) {
        const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
        const status = String(vfData[i][14] || '');
        if (datum && !isNaN(datum) && datum.getMonth() === huidigeM && datum.getFullYear() === huidigeJ) {
          omzetMaand += parseFloat(vfData[i][12]) || 0;
        }
        if (status === FACTUUR_STATUS.VERVALLEN) {
          vervallenFacturen.push({
            nr:     String(vfData[i][1] || ''),
            klant:  String(vfData[i][5] || '–'),
            bedrag: parseFloat(vfData[i][12]) || 0,
            datum:  datum && !isNaN(datum) ? formatDatum_(datum) : '–',
          });
        }
      }
    }
  } catch (e) { Logger.log('getDashboardData: VF fout — ' + e.message); }

  // Maand-specifieke kosten uit Inkoopfacturen (col 11 = bedrag incl.)
  let kostenMaand = 0;
  try {
    const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (ifSheet) {
      const ifData = ifSheet.getDataRange().getValues();
      for (let i = 1; i < ifData.length; i++) {
        const datum = ifData[i][3] ? new Date(ifData[i][3]) : null;
        if (datum && !isNaN(datum) && datum.getMonth() === huidigeM && datum.getFullYear() === huidigeJ) {
          kostenMaand += parseFloat(ifData[i][11]) || 0;
        }
      }
    }
  } catch (e) { Logger.log('getDashboardData: IF fout — ' + e.message); }

  return {
    bedrijf:    getInstelling_('Bedrijfsnaam') || 'Mijn bedrijf',
    bijgewerkt: formatDatumTijd_(nu),
    kpi: {
      aantalOpenFacturen: kpi.aantalOpenFacturen,
      debiteurenOpen:     kpi.debiteurenOpen,
      crediteurenOpen:    kpi.crediteurenOpen,
      banksaldo:          kpi.banksaldo,
      nettowinst:         kpi.nettowinst,
      winstmarge:         kpi.winstmarge,
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
  const jaar = nu.getFullYear();

  // Alle BTW-aangifte deadlines in chronologische volgorde binnen een jaar.
  // Gebruik maandindex 0-based (JS Date). Jan=0, Apr=3, Jul=6, Okt=9.
  // Q4-aangifte (voor okt-dec van vorig jaar) valt op 31 januari dit jaar.
  // Voeg ook 31-jan volgend jaar toe als wrap-around voor Nov/Dec.
  const kandidaten = [
    { kwartaal: 'Q4 vorig jaar', datum: new Date(jaar,     0, 31) },
    { kwartaal: 'Q1',            datum: new Date(jaar,     3, 30) },
    { kwartaal: 'Q2',            datum: new Date(jaar,     6, 31) },
    { kwartaal: 'Q3',            datum: new Date(jaar,     9, 31) },
    { kwartaal: 'Q4',            datum: new Date(jaar + 1, 0, 31) },
  ];

  // Einde van de dag als grens (inclusief de deadline-dag zelf)
  const eindVanDag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 23, 59, 59);
  const volgende = kandidaten.find(k => k.datum >= eindVanDag);
  // Altijd gevonden: worst-case is Q4 januari volgend jaar
  const dagenOver = Math.ceil((volgende.datum - nu) / (1000 * 60 * 60 * 24));
  return {
    kwartaal: volgende.kwartaal,
    datum:    formatDatum_(volgende.datum),
    dagenOver,
    urgent:   dagenOver <= 14,
  };
}

function _bouwDashboardHtml_() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;font-size:13px;color:#1A1A1A;background:#F7F9FC;height:100vh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}' +
    '.hdr{background:#0D1B4E;color:white;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
    '.hdr h1{font-size:14px;font-weight:bold;letter-spacing:.3px}' +
    '.hdr .meta{font-size:10px;opacity:.65;margin-top:2px}' +
    '.btn-ref{background:rgba(255,255,255,.15);border:none;color:white;padding:5px 11px;border-radius:4px;cursor:pointer;font-size:11px}' +
    '.btn-ref:hover{background:rgba(255,255,255,.25)}' +
    '.body{flex:1;overflow-y:auto;padding:14px 16px}' +
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}' +
    '.kpi{background:white;border-radius:8px;padding:13px 14px;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,.05)}' +
    '.kpi .lbl{font-size:10px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:.5px}' +
    '.kpi .val{font-size:19px;font-weight:bold;color:#111827;margin:5px 0 3px;line-height:1}' +
    '.kpi .sub{font-size:11px;color:#9CA3AF}' +
    '.kpi.goed .val{color:#15803D}.kpi.warn .val{color:#B45309}.kpi.krit .val{color:#B91C1C}' +
    '.sec{font-size:10px;font-weight:bold;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}' +
    '.acties{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}' +
    '.actie{background:white;border:1px solid #E5EAF2;border-radius:8px;padding:14px 10px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;user-select:none}' +
    '.actie:hover{border-color:#2EC4B6;background:#E6F7F4;box-shadow:0 2px 6px rgba(13,27,78,0.06)}' +
    '.actie .icoon{font-size:22px;margin-bottom:6px}' +
    '.actie .txt{font-size:12px;font-weight:600;color:#0D1B4E;line-height:1.3}' +
    '.actie.pr{background:#0D1B4E;border-color:#0D1B4E}.actie.pr .txt{color:white}.actie.pr:hover{background:#1A2A6B;border-color:#1A2A6B}' +
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
    '.spin{display:inline-block;width:22px;height:22px;border:2px solid #E5EAF2;border-top-color:#2EC4B6;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:10px}' +
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
    '  var klaar=false;' +
    '  setTimeout(function(){ if(!klaar){ document.getElementById("body").innerHTML=\'<div class="loading" style="color:#B91C1C">Laden duurt langer dan verwacht. Sluit dit venster en run eerst: Boekhoudbaar menu → Dashboard vernieuwen, open daarna opnieuw.</div>\'; } }, 30000);' +
    '  google.script.run.withSuccessHandler(function(d){klaar=true;render(d);}).withFailureHandler(function(e){klaar=true;' +
    '    document.getElementById("body").innerHTML=\'<div class="loading" style="color:#B91C1C">Laden mislukt: \'+esc(e.message)+\'</div>\';' +
    '  }).getDashboardData();' +
    '}' +
    'function render(d){' +
    '  if(!d||!d.kpi){document.getElementById("body").innerHTML=\'<div class="loading" style="color:#B91C1C">Ongeldige data ontvangen. Probeer te vernieuwen.</div>\';return;}' +
    '  document.getElementById("h-nm").textContent=(d.bedrijf||"Dashboard")+" \u2014 Dashboard";' +
    '  document.getElementById("h-tm").textContent="Bijgewerkt: "+d.bijgewerkt;' +
    '  var k=d.kpi,btw=k.btwDeadline||{kwartaal:"?",datum:"?",dagenOver:"?",urgent:false},h="";' +
    '  var nettoMaand=Math.round(((k.omzetMaand||0)-(k.kostenMaand||0))*100)/100;' +
    '  h+=\'<div class="kpi-grid">\';' +
    '  h+=kpi("Banksaldo",fmt(k.banksaldo||0),"",(k.banksaldo||0)<0?"krit":(k.banksaldo||0)>0?"goed":"");' +
    '  h+=kpi("Omzet deze maand",fmt(k.omzetMaand),"",k.omzetMaand>0?"goed":"");' +
    '  h+=kpi("Kosten deze maand",fmt(k.kostenMaand),"","");' +
    '  h+=kpi("Netto (maand)",fmt(nettoMaand),"",nettoMaand>0?"goed":nettoMaand<0?"krit":"");' +
    '  h+=\'</div>\';' +
    '  h+=\'<div class="kpi-grid" style="margin-bottom:14px">\';' +
    '  h+=kpi("Open facturen",k.aantalOpenFacturen+" stuks",fmt(k.debiteurenOpen),k.aantalOpenFacturen>0?"warn":"goed");' +
    '  h+=kpi("Te betalen BTW",fmt(k.btwSaldo||0),"",(k.btwSaldo||0)>0?"warn":"goed");' +
    '  h+=kpi("Open crediteuren",fmt(k.crediteurenOpen||0),"","");' +
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

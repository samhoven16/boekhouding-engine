/**
 * Rapportages.gs
 * Genereer financiële rapporten: Balans, W&V Rekening, Cashflow, Jaarrekening.
 * Conform Nederlandse GAAP / NL IFRS SME standaarden.
 */

// ─────────────────────────────────────────────
//  BALANS GENEREREN
// ─────────────────────────────────────────────
function genereerBalans() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.BALANS);
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const peildatum = new Date();

  // Koptekst
  zetRapportKoptekst_(sheet, 'BALANS', bedrijf, `Per ${formatDatum_(peildatum)}`, 4);

  // Haal saldi op uit grootboek
  const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
  const saldi = {};
  for (let i = 1; i < gbData.length; i++) {
    saldi[String(gbData[i][0])] = {
      naam: gbData[i][1], type: gbData[i][2],
      cat: gbData[i][3], bw: gbData[i][4],
      saldo: parseFloat(gbData[i][5]) || 0,
    };
  }

  let rij = 4;

  // ── ACTIVA ─────────────────────────────────────────────────────────────
  rij = schrijfBalansZijde_(sheet, saldi, 'Actief', 'ACTIVA', rij, 1);

  // Resultaat jaar toevoegen aan eigen vermogen
  const resultaatJaar = berekenResultaatJaar_(saldi);

  // ── PASSIVA ────────────────────────────────────────────────────────────
  rij = schrijfBalansZijde_(sheet, saldi, 'Passief', 'PASSIVA', rij + 2, 1, resultaatJaar);

  // Kolom opmaak
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);

  ss.setActiveSheet(sheet);
}

function schrijfBalansZijde_(sheet, saldi, zijdeType, titel, startRij, startKol, extraResultaat) {
  // Groepeer per categorie
  const categorieen = {};
  Object.values(saldi).forEach(r => {
    if (r.bw !== 'Balans') return;
    if (r.type !== zijdeType && !(zijdeType === 'Passief' && r.type === 'Actief' && r.cat === 'Eigen vermogen')) return;
    if (!categorieen[r.cat]) categorieen[r.cat] = [];
    categorieen[r.cat].push(r);
  });

  let rij = startRij;

  // Hoofdtitel
  sheet.getRange(rij, startKol, 1, 4).merge()
    .setValue(titel)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13);
  rij++;

  let totaalZijde = 0;
  const catVolgorde = zijdeType === 'Actief'
    ? ['Vaste activa', 'Vlottende activa', 'Liquide middelen']
    : ['Eigen vermogen', 'Langlopende schulden', 'Kortlopende schulden'];

  catVolgorde.forEach(cat => {
    const rekeningen = categorieen[cat];
    if (!rekeningen || rekeningen.length === 0) return;

    // Categorietitel
    sheet.getRange(rij, startKol, 1, 4).merge()
      .setValue(cat)
      .setBackground(KLEUREN.SECTIE_BG)
      .setFontWeight('bold').setFontSize(11);
    rij++;

    let catTotaal = 0;
    rekeningen.forEach(r => {
      if (Math.abs(r.saldo) < 0.005) return;
      sheet.getRange(rij, startKol + 1).setValue(r.naam);
      sheet.getRange(rij, startKol + 3).setValue(r.saldo).setNumberFormat('€#,##0.00');
      if (r.saldo < 0) sheet.getRange(rij, startKol + 3).setFontColor('#C62828');
      catTotaal += r.saldo;
      rij++;
    });

    // Resultaat boekjaar in eigen vermogen
    if (cat === 'Eigen vermogen' && extraResultaat !== undefined) {
      sheet.getRange(rij, startKol + 1).setValue('Resultaat boekjaar');
      sheet.getRange(rij, startKol + 3).setValue(extraResultaat).setNumberFormat('€#,##0.00');
      if (extraResultaat < 0) sheet.getRange(rij, startKol + 3).setFontColor('#C62828');
      catTotaal += extraResultaat;
      rij++;
    }

    // Categorietotaal
    sheet.getRange(rij, startKol + 1).setValue(`Totaal ${cat}`).setFontWeight('bold');
    sheet.getRange(rij, startKol + 3).setValue(catTotaal).setNumberFormat('€#,##0.00').setFontWeight('bold')
      .setBackground(cat === 'Eigen vermogen' ? '#E8F5E9' : KLEUREN.NEUTRAAL);
    totaalZijde += catTotaal;
    rij += 2;
  });

  // Eindtotaal
  sheet.getRange(rij, startKol, 1, 3).merge()
    .setValue(`TOTAAL ${titel}`).setFontWeight('bold').setFontSize(12)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF');
  sheet.getRange(rij, startKol + 3).setValue(totaalZijde)
    .setNumberFormat('€#,##0.00').setFontWeight('bold').setFontSize(12)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF');

  return rij + 1;
}

// ─────────────────────────────────────────────
//  WINST & VERLIESREKENING
// ─────────────────────────────────────────────
function genereerWvRekening() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.WV_REKENING);
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const jaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();

  zetRapportKoptekst_(sheet, 'WINST- EN VERLIESREKENING', bedrijf, `Boekjaar ${jaar}`, 3);

  // Haal journaalposten op voor het boekjaar
  const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
  const saldi = {};
  for (let i = 1; i < gbData.length; i++) {
    if (gbData[i][4] !== 'W&V') continue;
    saldi[String(gbData[i][0])] = {
      naam: gbData[i][1], type: gbData[i][2],
      cat: gbData[i][3], saldo: parseFloat(gbData[i][5]) || 0,
    };
  }

  let rij = 4;
  let totaalOpbrengsten = 0;
  let totaalKosten = 0;

  // ── NETTO OMZET ────────────────────────────
  rij = schrijfWvSectie_(sheet, saldi, 'Opbrengst', 'OPBRENGSTEN', rij);
  Object.values(saldi).filter(r => r.type === 'Opbrengst').forEach(r => totaalOpbrengsten += r.saldo);
  totaalOpbrengsten = rondBedrag_(totaalOpbrengsten);

  // Totaalrij opbrengsten
  sheet.getRange(rij, 1, 1, 3).merge().setValue('TOTAAL OPBRENGSTEN')
    .setFontWeight('bold').setBackground('#C8E6C9').setFontSize(11);
  sheet.getRange(rij, 3).setValue(totaalOpbrengsten)
    .setNumberFormat('€#,##0.00').setFontWeight('bold').setBackground('#C8E6C9').setFontSize(11);
  rij += 2;

  // ── KOSTEN PER CATEGORIE ────────────────────
  const kostenCategorieen = [
    'Directe kosten', 'Personeelskosten', 'Huisvesting', 'Transport',
    'Kantoor', 'Verkoop & Marketing', 'Onderhoud', 'Afschrijvingen',
    'Financieel', 'Overig', 'Belasting'
  ];

  kostenCategorieen.forEach(cat => {
    const rekeningen = Object.values(saldi).filter(r => r.type === 'Kosten' && r.cat === cat);
    if (rekeningen.length === 0) return;

    const catTotaal = rekeningen.reduce((s, r) => s + r.saldo, 0);
    if (Math.abs(catTotaal) < 0.005) return;

    sheet.getRange(rij, 1, 1, 3).merge().setValue(cat)
      .setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
    rij++;

    rekeningen.forEach(r => {
      if (Math.abs(r.saldo) < 0.005) return;
      sheet.getRange(rij, 2).setValue(r.naam);
      sheet.getRange(rij, 3).setValue(r.saldo).setNumberFormat('€#,##0.00');
      totaalKosten += r.saldo;
      rij++;
    });

    sheet.getRange(rij, 2).setValue(`Subtotaal ${cat}`).setFontWeight('bold');
    sheet.getRange(rij, 3).setValue(rondBedrag_(catTotaal))
      .setNumberFormat('€#,##0.00').setFontWeight('bold').setBackground(KLEUREN.NEUTRAAL);
    rij += 2;
  });

  totaalKosten = rondBedrag_(totaalKosten);

  // Totaalrij kosten
  sheet.getRange(rij, 1, 1, 3).merge().setValue('TOTAAL KOSTEN')
    .setFontWeight('bold').setBackground('#FFCDD2').setFontSize(11);
  sheet.getRange(rij, 3).setValue(totaalKosten)
    .setNumberFormat('€#,##0.00').setFontWeight('bold').setBackground('#FFCDD2').setFontSize(11);
  rij += 2;

  // Resultaat
  const resultaat = rondBedrag_(totaalOpbrengsten - totaalKosten);
  const winstVerlies = resultaat >= 0 ? 'NETTOWINST' : 'NETTOVERLIES';

  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue(winstVerlies)
    .setFontWeight('bold').setFontSize(13)
    .setBackground(resultaat >= 0 ? '#1B5E20' : '#B71C1C')
    .setFontColor('#FFFFFF');
  sheet.getRange(rij, 3).setValue(Math.abs(resultaat))
    .setNumberFormat('€#,##0.00').setFontWeight('bold').setFontSize(13)
    .setBackground(resultaat >= 0 ? '#1B5E20' : '#B71C1C')
    .setFontColor('#FFFFFF');

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 160);

  ss.setActiveSheet(sheet);
}

function schrijfWvSectie_(sheet, saldi, type, titel, startRij) {
  sheet.getRange(startRij, 1, 1, 3).merge()
    .setValue(titel).setBackground(KLEUREN.HEADER_BG)
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12);
  startRij++;

  const rekeningen = Object.entries(saldi)
    .filter(([_, r]) => r.type === type)
    .sort(([a], [b]) => a.localeCompare(b));

  rekeningen.forEach(([code, r]) => {
    if (Math.abs(r.saldo) < 0.005) return;
    sheet.getRange(startRij, 2).setValue(r.naam);
    sheet.getRange(startRij, 3).setValue(r.saldo).setNumberFormat('€#,##0.00');
    startRij++;
  });

  return startRij + 1;
}

// ─────────────────────────────────────────────
//  CASHFLOW OVERZICHT
// ─────────────────────────────────────────────
function genereerCashflow() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.CASHFLOW);
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const jaar = new Date().getFullYear();

  zetRapportKoptekst_(sheet, 'CASHFLOW OVERZICHT', bedrijf, `Boekjaar ${jaar}`, 3);

  const maandnamen = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

  // Headers
  const headers = ['Categorie', ...maandnamen, 'Totaal'];
  const headerRij = sheet.getRange(4, 1, 1, headers.length);
  headerRij.setValues([headers])
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');

  // Ontvangsten per maand
  const btData = ss.getSheetByName(SHEETS.BANKTRANSACTIES).getDataRange().getValues();
  const ontvangstenPerMaand = new Array(12).fill(0);
  const betalingenPerMaand = new Array(12).fill(0);

  for (let i = 1; i < btData.length; i++) {
    const datum = btData[i][1] ? new Date(btData[i][1]) : null;
    if (!datum || datum.getFullYear() !== jaar) continue;
    const m = datum.getMonth();
    const bedrag = parseFloat(btData[i][3]) || 0;
    if (bedrag > 0) ontvangstenPerMaand[m] += bedrag;
    else betalingenPerMaand[m] += Math.abs(bedrag);
  }

  // Schrijf rijen
  let rij = 5;

  const schrijfCashflowRij = (label, waarden, bg) => {
    const totaal = waarden.reduce((s, v) => s + v, 0);
    const rijData = [label, ...waarden.map(v => rondBedrag_(v)), rondBedrag_(totaal)];
    sheet.getRange(rij, 1, 1, rijData.length).setValues([rijData]);
    sheet.getRange(rij, 2, 1, 13).setNumberFormat('€#,##0.00');
    if (bg) sheet.getRange(rij, 1, 1, rijData.length).setBackground(bg);
    rij++;
    return rondBedrag_(totaal);
  };

  const totOntv = schrijfCashflowRij('Ontvangsten', ontvangstenPerMaand, KLEUREN.POSITIEF);
  const totBetal = schrijfCashflowRij('Betalingen', betalingenPerMaand, KLEUREN.NEGATIEF);

  rij++; // Lege rij

  const nettoCashflow = ontvangstenPerMaand.map((o, i) => rondBedrag_(o - betalingenPerMaand[i]));
  schrijfCashflowRij('NETTO CASHFLOW', nettoCashflow, KLEUREN.SECTIE_BG);

  // Cumulatief saldo
  let cumulatief = 0;
  const cumulatiefWaarden = nettoCashflow.map(v => { cumulatief += v; return rondBedrag_(cumulatief); });
  schrijfCashflowRij('Cumulatief saldo', cumulatiefWaarden, '#E3F2FD');

  // Kolom opmaak
  sheet.setColumnWidth(1, 160);
  for (let k = 2; k <= 14; k++) sheet.setColumnWidth(k, 85);
  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(1);

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  JAARREKENING
// ─────────────────────────────────────────────
function genereerJaarrekening() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.JAARREKENING);
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const adres = getInstelling_('Adres') || '';
  const postcode = getInstelling_('Postcode') || '';
  const plaats = getInstelling_('Plaats') || '';
  const kvk = getInstelling_('KvK-nummer') || '';
  const rechtsvorm = getInstelling_('Rechtsvorm') || '';
  const jaar = new Date().getFullYear();

  // Titelblad
  sheet.getRange(1, 1, 1, 4).merge()
    .setValue('JAARREKENING ' + jaar)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(20).setHorizontalAlignment('center');

  const titels = [
    ['', ''],
    [bedrijf, ''],
    [rechtsvorm, ''],
    [adres, ''],
    [`${postcode} ${plaats}`, ''],
    ['', ''],
    ['KvK-nummer:', kvk],
    ['', ''],
    ['Opgesteld op:', formatDatum_(new Date())],
  ];

  titels.forEach((r, i) => {
    sheet.getRange(i + 2, 1).setValue(r[0]);
    sheet.getRange(i + 2, 2).setValue(r[1]);
  });

  sheet.getRange(3, 1).setFontSize(16).setFontWeight('bold');
  sheet.getRange(4, 1).setFontSize(12);

  // Roep balans en W&V aan (al gegenereerd)
  genereerBalans();
  genereerWvRekening();
  genereerCashflow();

  // Terug naar jaarrekening
  ss.setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    'Jaarrekening gegenereerd',
    `De jaarrekening voor ${jaar} is klaar.\n\nDe volgende onderdelen zijn bijgewerkt:\n• Balans\n• Winst- en verliesrekening\n• Cashflow overzicht`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  HELPER: RESULTAAT JAAR BEREKENEN
// ─────────────────────────────────────────────
function berekenResultaatJaar_(saldi) {
  let opbrengsten = 0;
  let kosten = 0;
  Object.values(saldi).forEach(r => {
    if (r.bw !== 'W&V') return;
    if (r.type === 'Opbrengst') opbrengsten += r.saldo;
    else if (r.type === 'Kosten') kosten += r.saldo;
  });
  return rondBedrag_(opbrengsten - kosten);
}

// ─────────────────────────────────────────────
//  HELPER: RAPPORT KOPTEKST
// ─────────────────────────────────────────────
function zetRapportKoptekst_(sheet, titel, bedrijf, periode, aantalKolommen) {
  sheet.getRange(1, 1, 1, aantalKolommen).merge()
    .setValue(titel)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, aantalKolommen).merge()
    .setValue(`${bedrijf}  |  ${periode}`)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF')
    .setFontSize(11).setHorizontalAlignment('center');

  sheet.setRowHeight(1, 35);
  sheet.setRowHeight(2, 25);
}

// ─────────────────────────────────────────────
//  KENGETALLEN ANALYSE
// ─────────────────────────────────────────────
function berekenKengetallen_(ss) {
  const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
  const saldi = {};
  for (let i = 1; i < gbData.length; i++) {
    saldi[String(gbData[i][0])] = {
      type: gbData[i][2], cat: gbData[i][3], bw: gbData[i][4],
      saldo: parseFloat(gbData[i][5]) || 0,
    };
  }

  const getSaldo = (code) => saldi[code] ? saldi[code].saldo : 0;

  const omzet = ['8000','8010','8020','8030','8040'].reduce((s, c) => s + getSaldo(c), 0);
  const kosten = Object.values(saldi).filter(r => r.type === 'Kosten').reduce((s, r) => s + r.saldo, 0);
  const nettowinst = rondBedrag_(omzet - kosten);
  const debiteuren = getSaldo('1100');
  const bank = getSaldo('1200') + getSaldo('1210');
  const crediteuren = getSaldo('4000');
  const eigenVermogen = Object.values(saldi).filter(r => r.bw === 'Balans' && r.cat === 'Eigen vermogen')
    .reduce((s, r) => s + r.saldo, 0) + nettowinst;

  return {
    omzet: rondBedrag_(omzet),
    kosten: rondBedrag_(kosten),
    nettowinst,
    winstmarge: omzet > 0 ? rondBedrag_((nettowinst / omzet) * 100) : 0,
    debiteuren: rondBedrag_(debiteuren),
    crediteuren: rondBedrag_(crediteuren),
    banksaldo: rondBedrag_(bank),
    liquiditeit: crediteuren > 0 ? rondBedrag_(bank / crediteuren) : null,
    eigenVermogen: rondBedrag_(eigenVermogen),
    solvabiliteit: (eigenVermogen + Math.abs(crediteuren)) > 0
      ? rondBedrag_((eigenVermogen / (eigenVermogen + Math.abs(crediteuren))) * 100)
      : null,
  };
}

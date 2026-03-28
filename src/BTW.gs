/**
 * BTW.gs
 * BTW administratie, aangifte berekening en KOR controle.
 * Gebaseerd op Nederlandse BTW wetgeving (Wet OB 1968).
 */

// ─────────────────────────────────────────────
//  BTW AANGIFTE GENEREREN (KWARTAAL)
// ─────────────────────────────────────────────
function genereerBtwAangifteQ1() { genereerBtwAangifte('Q1'); }
function genereerBtwAangifteQ2() { genereerBtwAangifte('Q2'); }
function genereerBtwAangifteQ3() { genereerBtwAangifte('Q3'); }
function genereerBtwAangifteQ4() { genereerBtwAangifte('Q4'); }

function genereerBtwAangifte(kwartaal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jaar = parseInt(getInstelling_('Boekjaar start') || new Date().getFullYear());
  const periode = bepaalBtwPeriode_(kwartaal, isNaN(jaar) ? new Date().getFullYear() : jaar);

  const aangifte = berekenBtwAangifte_(ss, periode.van, periode.tot);

  zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode);

  SpreadsheetApp.getUi().alert(
    `BTW aangifte ${kwartaal} gegenereerd`,
    `Periode: ${formatDatum_(periode.van)} – ${formatDatum_(periode.tot)}\n\n` +
    `Rubriek 1a (21%):     ${formatBedrag_(aangifte.r1a_grondslag)} / BTW: ${formatBedrag_(aangifte.r1a_btw)}\n` +
    `Rubriek 1b (9%):      ${formatBedrag_(aangifte.r1b_grondslag)} / BTW: ${formatBedrag_(aangifte.r1b_btw)}\n` +
    `Rubriek 1d (vrijgest): ${formatBedrag_(aangifte.r1d)}\n` +
    `Rubriek 5b (voorbelasting): ${formatBedrag_(aangifte.r5b)}\n\n` +
    `Te betalen / terug te vorderen: ${formatBedrag_(aangifte.saldo)}\n` +
    `${aangifte.saldo >= 0 ? '(te betalen aan Belastingdienst)' : '(terug te vorderen)'}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  BTW AANGIFTE BEREKENING (ALLE RUBRIEKEN)
// ─────────────────────────────────────────────
function berekenBtwAangifte_(ss, vanDatum, totDatum) {
  const jpData = ss.getSheetByName(SHEETS.JOURNAALPOSTEN).getDataRange().getValues();
  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();

  // Rubrieken conform Aangifte Omzetbelasting (OB):
  // 1a: Leveringen/diensten belast 21%
  // 1b: Leveringen/diensten belast 9%
  // 1c: Leveringen/diensten belast overige tarieven
  // 1d: Leveringen belast 0% of vrijgesteld (omzet telt wel)
  // 1e: Omzet en BTW verlegd
  // 2a: Leveringen buiten EU (export)
  // 3a: Leveringen binnen EU (IC)
  // 4a: Inkopen met verlegd BTW
  // 5a: Subtotaal verschuldigde BTW
  // 5b: Voorbelasting (aftrekbare inkoop BTW)
  // 5c: Terug te vragen subtotaal
  // 5d: Saldo (te betalen of terug te vorderen)

  const aangifte = {
    r1a_grondslag: 0, r1a_btw: 0,   // 21%
    r1b_grondslag: 0, r1b_btw: 0,   // 9%
    r1c_grondslag: 0, r1c_btw: 0,   // Overige
    r1d: 0,                          // 0% / vrijgesteld
    r1e_grondslag: 0, r1e_btw: 0,   // Verlegd
    r2a: 0,                          // Export
    r3a_grondslag: 0, r3a_btw: 0,   // IC
    r4a_grondslag: 0, r4a_btw: 0,   // Inkoop verlegd
    r5a: 0,                          // Totaal verschuldigde BTW
    r5b: 0,                          // Voorbelasting
    r5c: 0,
    saldo: 0,
  };

  // ── Verkoopfacturen analyseren ─────────────
  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    if (!datum || datum < vanDatum || datum > totDatum) continue;

    const grondslag = parseFloat(vfData[i][9]) || 0;  // Excl. BTW
    const btwBedrag = parseFloat(vfData[i][11]) || 0;
    const btwLabel  = String(vfData[i][10] || '');

    if (btwLabel.includes('21')) {
      aangifte.r1a_grondslag += grondslag;
      aangifte.r1a_btw += btwBedrag;
    } else if (btwLabel.includes('9')) {
      aangifte.r1b_grondslag += grondslag;
      aangifte.r1b_btw += btwBedrag;
    } else if (btwLabel.includes('Vrijgesteld')) {
      aangifte.r1d += grondslag;
    } else if (btwLabel.includes('0%') || btwLabel.includes('nultarief')) {
      aangifte.r1d += grondslag;
    } else if (btwLabel.includes('Verlegd')) {
      aangifte.r1e_grondslag += grondslag;
    }
  }

  // ── Inkoopfacturen – voorbelasting ─────────
  for (let i = 1; i < ifData.length; i++) {
    const datum = ifData[i][3] ? new Date(ifData[i][3]) : null;
    if (!datum || datum < vanDatum || datum > totDatum) continue;

    const btwBedrag = parseFloat(ifData[i][10]) || 0;
    const btwLabel  = String(ifData[i][9] || '');

    if (btwLabel.includes('Verlegd')) {
      const grondslag = parseFloat(ifData[i][8]) || 0;
      aangifte.r4a_grondslag += grondslag;
      aangifte.r4a_btw += btwBedrag;
    } else if (btwBedrag > 0) {
      aangifte.r5b += btwBedrag;  // Aftrekbare voorbelasting
    }
  }

  // ── Bereken totalen ─────────────────────────
  aangifte.r5a = rondBedrag_(
    aangifte.r1a_btw + aangifte.r1b_btw + aangifte.r1c_btw +
    aangifte.r1e_btw + aangifte.r4a_btw
  );
  aangifte.r5b = rondBedrag_(aangifte.r5b);
  aangifte.r5c = rondBedrag_(Math.max(0, aangifte.r5b - aangifte.r5a));
  aangifte.saldo = rondBedrag_(aangifte.r5a - aangifte.r5b);

  // Afronden alle bedragen
  Object.keys(aangifte).forEach(k => {
    aangifte[k] = rondBedrag_(aangifte[k]);
  });

  return aangifte;
}

// ─────────────────────────────────────────────
//  BTW AANGIFTE OP SHEET ZETTEN
// ─────────────────────────────────────────────
function zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode) {
  const sheet = ss.getSheetByName(SHEETS.BTW_AANGIFTE);
  sheet.clearContents();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const btwNr = getInstelling_('BTW-nummer') || '';
  const jaar = periode.van.getFullYear();

  // ── Koptekst ───────────────────────────────
  sheet.getRange(1, 1, 1, 4).merge()
    .setValue('AANGIFTE OMZETBELASTING')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 4).merge()
    .setValue(`${bedrijf}  |  BTW-nr: ${btwNr}  |  Periode: ${kwartaal} ${jaar}  |  ${formatDatum_(periode.van)} t/m ${formatDatum_(periode.tot)}`)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF').setFontSize(11).setHorizontalAlignment('center');

  const rijen = [
    ['', '', '', ''],
    ['RUBRIEK', 'OMSCHRIJVING', 'GRONDSLAG', 'BTW BEDRAG'],
    ['', '', '', ''],
    ['SECTIE A – PRESTATIES BINNENLAND', '', '', ''],
    ['1a', 'Leveringen/diensten belast met hoog tarief 21%', aangifte.r1a_grondslag, aangifte.r1a_btw],
    ['1b', 'Leveringen/diensten belast met laag tarief 9%', aangifte.r1b_grondslag, aangifte.r1b_btw],
    ['1c', 'Leveringen/diensten belast met overige tarieven', aangifte.r1c_grondslag, aangifte.r1c_btw],
    ['1d', 'Leveringen/diensten belast met 0% of vrijgesteld', aangifte.r1d, 0],
    ['1e', 'Omzet waarbij BTW is verlegd naar de afnemer', aangifte.r1e_grondslag, aangifte.r1e_btw],
    ['', '', '', ''],
    ['SECTIE B – PRESTATIES BUITEN NEDERLAND', '', '', ''],
    ['2a', 'Leveringen buiten de EU (export)', aangifte.r2a, 0],
    ['3a', 'Leveringen binnen de EU (ICL)', aangifte.r3a_grondslag, aangifte.r3a_btw],
    ['', '', '', ''],
    ['SECTIE C – VOORBELASTING EN SALDO', '', '', ''],
    ['4a', 'Inkopen waarbij BTW verlegd is', aangifte.r4a_grondslag, aangifte.r4a_btw],
    ['', '', '', ''],
    ['5a', 'Subtotaal verschuldigde BTW (= som 1a t/m 4a)', '', aangifte.r5a],
    ['5b', 'Voorbelasting: aftrekbare inkoop-BTW', '', aangifte.r5b],
    ['5c', 'Terug te vragen (alleen als 5b > 5a)', '', aangifte.r5c],
    ['', '', '', ''],
    ['SALDO', aangifte.saldo >= 0 ? 'TE BETALEN aan Belastingdienst' : 'TERUG TE VORDEREN', '', Math.abs(aangifte.saldo)],
    ['', '', '', ''],
    ['Deadline', bepaalBtwDeadline_(kwartaal, jaar), '', ''],
    ['Status', 'Concept (nog niet ingediend)', '', ''],
  ];

  const startRij = 3;
  sheet.getRange(startRij, 1, rijen.length, 4).setValues(rijen);

  // Opmaak sectietitels
  [7, 14, 18].forEach(offset => {
    sheet.getRange(startRij + offset, 1, 1, 4)
      .setBackground(KLEUREN.SECTIE_BG)
      .setFontWeight('bold');
  });

  // Opmaak headers
  sheet.getRange(startRij + 1, 1, 1, 4)
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  // Opmaak saldo rij
  const saldoRij = startRij + rijen.length - 5;
  sheet.getRange(saldoRij, 1, 1, 4)
    .setBackground(aangifte.saldo >= 0 ? '#FFCDD2' : '#C8E6C9')
    .setFontWeight('bold').setFontSize(12);

  // Nummers opmaken
  sheet.getRange(startRij + 3, 3, rijen.length - 3, 2).setNumberFormat('€#,##0.00');

  // Kolombreedte
  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 350);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
  sheet.setFrozenRows(4);

  // Journaalpost voor BTW afdracht aanmaken (als saldo te betalen)
  if (aangifte.saldo > 0) {
    Logger.log(`BTW aangifte ${kwartaal} ${jaar}: te betalen ${aangifte.saldo}`);
  }

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  BTW PERIODE SLUITEN (JOURNAALPOST)
// ─────────────────────────────────────────────
function sluitBtwPeriode() {
  const ui = SpreadsheetApp.getUi();
  const kwartaalResp = ui.prompt(
    'BTW periode sluiten',
    'Welk kwartaal sluit u? (Q1, Q2, Q3 of Q4):',
    ui.ButtonSet.OK_CANCEL
  );
  if (kwartaalResp.getSelectedButton() !== ui.Button.OK) return;

  const kwartaal = kwartaalResp.getResponseText().toUpperCase().trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const jaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const periode = bepaalBtwPeriode_(kwartaal, jaar);
  const aangifte = berekenBtwAangifte_(ss, periode.van, periode.tot);
  const datum = new Date();

  // BTW rekeningen salderen naar "te betalen BTW"
  if (aangifte.r1a_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW afdracht ${kwartaal} ${jaar} – 21%`,
      dagboek: 'Memoriaal',
      debet: '4110', credit: '4100',
      bedrag: aangifte.r1a_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  if (aangifte.r1b_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW afdracht ${kwartaal} ${jaar} – 9%`,
      dagboek: 'Memoriaal',
      debet: '4120', credit: '4100',
      bedrag: aangifte.r1b_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  if (aangifte.r5b > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW voorbelasting verrekening ${kwartaal} ${jaar}`,
      dagboek: 'Memoriaal',
      debet: '4100', credit: '1400',
      bedrag: aangifte.r5b,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  ui.alert(
    `BTW periode ${kwartaal} gesloten`,
    `Journaalposten aangemaakt.\n\nSaldo: ${formatBedrag_(aangifte.saldo)}\n` +
    `${aangifte.saldo >= 0 ? 'Te betalen vóór: ' + bepaalBtwDeadline_(kwartaal, jaar) : 'Terug te vorderen'}`,
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  KOR REGELING CONTROLE
// ─────────────────────────────────────────────
function controleerKor() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jaarStr = getInstelling_('Boekjaar start') || new Date().getFullYear().toString();
  const jaar = parseInt(jaarStr.slice(-4)) || new Date().getFullYear();
  const periode = { van: new Date(jaar, 0, 1), tot: new Date(jaar, 11, 31) };

  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  let totaalOmzet = 0;

  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    if (!datum || datum < periode.van || datum > periode.tot) continue;
    totaalOmzet += parseFloat(vfData[i][9]) || 0;  // Excl. BTW
  }

  const korGrens = 20000;
  const korActief = getInstelling_('KOR regeling actief') === 'Ja';

  let bericht = `KOR Controle ${jaar}\n\n`;
  bericht += `Totale omzet (excl. BTW): ${formatBedrag_(totaalOmzet)}\n`;
  bericht += `KOR grens: ${formatBedrag_(korGrens)}\n\n`;

  if (totaalOmzet < korGrens) {
    bericht += `✓ U valt onder de KOR grens.\n`;
    bericht += korActief
      ? 'KOR is actief: u hoeft geen BTW te berekenen over uw omzet.'
      : 'KOR is NIET actief. Overweeg aanmelding bij de Belastingdienst.';
  } else {
    bericht += `⚠ Uw omzet overschrijdt de KOR grens van €20.000.\n`;
    bericht += korActief
      ? 'Meld u af voor de KOR bij de Belastingdienst!'
      : 'U bent BTW-plichtig (correct).';
  }

  SpreadsheetApp.getUi().alert('KOR Regeling Controle', bericht, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  BTW PER MAAND OVERZICHT
// ─────────────────────────────────────────────
function getBtwPerMaand_(ss, jaar) {
  const resultaat = Array.from({ length: 12 }, (_, i) => ({
    maand: i + 1,
    omzetHoog: 0, btwHoog: 0,
    omzetLaag: 0, btwLaag: 0,
    voorbelasting: 0,
    saldo: 0,
  }));

  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();

  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? new Date(vfData[i][2]) : null;
    if (!datum || datum.getFullYear() !== jaar) continue;
    const m = datum.getMonth();
    const grondslag = parseFloat(vfData[i][9]) || 0;
    const btwBedrag = parseFloat(vfData[i][11]) || 0;
    const btwLabel = String(vfData[i][10] || '');

    if (btwLabel.includes('21')) {
      resultaat[m].omzetHoog += grondslag;
      resultaat[m].btwHoog += btwBedrag;
    } else if (btwLabel.includes('9')) {
      resultaat[m].omzetLaag += grondslag;
      resultaat[m].btwLaag += btwBedrag;
    }
  }

  for (let i = 1; i < ifData.length; i++) {
    const datum = ifData[i][3] ? new Date(ifData[i][3]) : null;
    if (!datum || datum.getFullYear() !== jaar) continue;
    const m = datum.getMonth();
    const btwBedrag = parseFloat(ifData[i][10]) || 0;
    if (btwBedrag > 0) resultaat[m].voorbelasting += btwBedrag;
  }

  resultaat.forEach(r => {
    r.saldo = rondBedrag_(r.btwHoog + r.btwLaag - r.voorbelasting);
    r.omzetHoog = rondBedrag_(r.omzetHoog);
    r.btwHoog = rondBedrag_(r.btwHoog);
    r.omzetLaag = rondBedrag_(r.omzetLaag);
    r.btwLaag = rondBedrag_(r.btwLaag);
    r.voorbelasting = rondBedrag_(r.voorbelasting);
  });

  return resultaat;
}

// ─────────────────────────────────────────────
//  HELPERS BTW
// ─────────────────────────────────────────────
function parseBtwTarief_(label) {
  if (!label) return 0.21;
  if (label.includes('21')) return 0.21;
  if (label.includes('9')) return 0.09;
  if (label.includes('0%') || label.includes('nultarief')) return 0.00;
  if (label.includes('Vrijgesteld') || label.includes('Verlegd')) return null;
  return 0.21;
}

function bepaalBtwPeriode_(kwartaal, jaar) {
  const periodes = {
    'Q1': { van: new Date(jaar, 0, 1),  tot: new Date(jaar, 2, 31) },
    'Q2': { van: new Date(jaar, 3, 1),  tot: new Date(jaar, 5, 30) },
    'Q3': { van: new Date(jaar, 6, 1),  tot: new Date(jaar, 8, 30) },
    'Q4': { van: new Date(jaar, 9, 1),  tot: new Date(jaar, 11, 31) },
  };
  return periodes[kwartaal] || periodes['Q1'];
}

function bepaalBtwDeadline_(kwartaal, jaar) {
  const deadlines = {
    'Q1': new Date(jaar, 3, 30),   // 30 april
    'Q2': new Date(jaar, 6, 31),   // 31 juli
    'Q3': new Date(jaar, 9, 31),   // 31 oktober
    'Q4': new Date(jaar + 1, 0, 31), // 31 januari volgend jaar
  };
  return formatDatum_(deadlines[kwartaal] || deadlines['Q1']);
}

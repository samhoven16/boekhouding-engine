/**
 * Belastingadvies.gs
 * Automatische berekening van belastingvoordelen en advies voor ZZP/MKB.
 * Het systeem detecteert zelf welke aftrekposten van toepassing zijn
 * en waarschuwt proactief wanneer actie nodig is.
 *
 * Verwerkte regelingen (2025):
 *  - Zelfstandigenaftrek            €2.470  (ZZP, ≥1225 uur — stapsgewijs verlaagd)
 *  - Startersaftrek                 €2.123  (eerste 3 jaar ZZP)
 *  - MKB-winstvrijstelling          12,70%  (na aftrekken)
 *  - KOR                            €0 BTW  (omzet < €20.000)
 *  - KIA                            28%     (investeringen €2.801–€353.973)
 *  - Reiskosten eigen vervoer       €0,23/km
 *  - Thuiswerkvergoeding            €2,35/dag
 *  - Representatiekosten            73,5% aftrekbaar
 */

// ─────────────────────────────────────────────
//  BELASTING TARIEVEN EN GRENZEN (2025)
// ─────────────────────────────────────────────
const BELASTING = {
  ZELFSTANDIGENAFTREK:    2470,    // 2025: €2.470 (was €3.750 in 2024, daalt jaarlijks richting €900 in 2027)
  STARTERSAFTREK:         2123,    // 2025: ongewijzigd
  MKB_WINSTVRIJSTELLING:  0.1270,  // 2025: 12,70% (was 13,31% in 2024)
  KOR_GRENS:              20000,   // ongewijzigd
  KIA_MIN:                2801,    // ongewijzigd
  KIA_MAX:                353973,  // ongewijzigd
  KIA_PCT:                0.28,    // ongewijzigd
  REISKOSTEN_PER_KM:      0.23,    // 2025: ongewijzigd (zal stijgen)
  THUISWERK_PER_DAG:      2.40,    // 2025: €2,40/dag (was €2,35)
  REPRESENTATIE_AFTREK:   0.735,   // 73,5% aftrekbaar — ongewijzigd
  IB_SCHIJF_1_MAX:        76817,   // 2025: €76.817 (was €75.518)
  IB_SCHIJF_1_PCT:        0.3582,  // 2025: 35,82% (was 36,97% — verlaagd)
  IB_SCHIJF_2_PCT:        0.495,   // 2025: ongewijzigd
  HEFFINGSKORTING_MAX:    3068,    // 2025: max €3.068 (inkomensafhankelijk)
  ARBEIDSKORTING_MAX:     5625,    // 2025: max €5.625
};

// ─────────────────────────────────────────────
//  VOLLEDIG BELASTINGADVIES BEREKENEN
// ─────────────────────────────────────────────
function berekenBelastingadvies_(ss) {
  const jaar = new Date().getFullYear();
  const kg = berekenKengetallen_(ss);
  const omzet = kg.omzet;
  const kosten = kg.kosten;
  const winst = kg.nettowinst;
  const rechtsvorm = getInstelling_('Rechtsvorm') || 'Eenmanszaak';
  const isZzp = ['Eenmanszaak', 'ZZP', 'VOF'].includes(rechtsvorm);

  const adviezen = [];
  const aftrekken = [];
  let totaalAftrek = 0;

  // ── 1. KOR regeling ───────────────────────────────────────────────────
  if (omzet > 0 && omzet < BELASTING.KOR_GRENS) {
    const korActief = getInstelling_('KOR regeling actief') === 'Ja';
    if (!korActief) {
      adviezen.push({
        type: 'VOORDEEL',
        titel: '💡 KOR regeling mogelijk',
        tekst: `Uw omzet (${formatBedrag_(omzet)}) is onder de €20.000 grens. ` +
               `Met de Kleine Ondernemers Regeling hoeft u geen BTW te berekenen én in te dienen. ` +
               `Dit scheelt administratie en geeft u een prijsvoordeel. Meld u aan via de Belastingdienst.`,
        besparing: null,
      });
    }
  } else if (omzet >= BELASTING.KOR_GRENS) {
    const korActief = getInstelling_('KOR regeling actief') === 'Ja';
    if (korActief) {
      adviezen.push({
        type: 'WAARSCHUWING',
        titel: '⚠️ KOR grens overschreden',
        tekst: `Uw omzet (${formatBedrag_(omzet)}) overschrijdt de KOR grens van €20.000. ` +
               `U moet zich afmelden voor de KOR bij de Belastingdienst en BTW gaan berekenen.`,
        besparing: null,
      });
    }
  }

  // ── 2. Zelfstandigenaftrek (ZZP/eenmanszaak) ─────────────────────────
  if (isZzp && winst > 0) {
    const aftrek = Math.min(BELASTING.ZELFSTANDIGENAFTREK, winst);
    aftrekken.push({
      naam: 'Zelfstandigenaftrek',
      bedrag: aftrek,
      voorwaarde: '≥ 1.225 uur per jaar aan uw onderneming besteed',
      code: '7990',
    });
    totaalAftrek += aftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ Zelfstandigenaftrek: ' + formatBedrag_(aftrek),
      tekst: `Als ZZP-er met ≥1.225 werkuren mag u €${BELASTING.ZELFSTANDIGENAFTREK.toLocaleString('nl-NL')} aftrekken van uw winst. ` +
             `Houd uw uren bij om dit te onderbouwen (bijv. in een urenregistratie).`,
      besparing: rondBedrag_(aftrek * BELASTING.IB_SCHIJF_1_PCT),
    });
  }

  // ── 3. Startersaftrek (eerste 3 jaar) ────────────────────────────────
  if (isZzp) {
    const startjaar = parseInt(getInstelling_('Startjaar onderneming') || '0');
    if (startjaar > 0 && (jaar - startjaar) < 3) {
      const aftrek = BELASTING.STARTERSAFTREK;
      aftrekken.push({
        naam: 'Startersaftrek',
        bedrag: aftrek,
        voorwaarde: 'Eerste 3 jaar als ondernemer',
        code: '7990',
      });
      totaalAftrek += aftrek;
      adviezen.push({
        type: 'AFTREKPOST',
        titel: '✅ Startersaftrek: ' + formatBedrag_(aftrek),
        tekst: `U bent nog geen ${jaar - startjaar + 1} jaar ondernemer. De startersaftrek van €${BELASTING.STARTERSAFTREK.toLocaleString('nl-NL')} ` +
               `bovenop de zelfstandigenaftrek is van toepassing.`,
        besparing: rondBedrag_(aftrek * BELASTING.IB_SCHIJF_1_PCT),
      });
    }
  }

  // ── 4. MKB-winstvrijstelling ──────────────────────────────────────────
  if (isZzp && winst > 0) {
    const winstNaAftrekken = Math.max(0, winst - totaalAftrek);
    const mkbAftrek = rondBedrag_(winstNaAftrekken * BELASTING.MKB_WINSTVRIJSTELLING);
    aftrekken.push({
      naam: 'MKB-winstvrijstelling (12,70%)',
      bedrag: mkbAftrek,
      voorwaarde: 'Automatisch van toepassing voor ondernemers IB',
      code: '7990',
    });
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ MKB-winstvrijstelling: ' + formatBedrag_(mkbAftrek),
      tekst: `12,70% van uw winst na aftrekken (${formatBedrag_(winstNaAftrekken)}) is vrijgesteld van inkomstenbelasting. ` +
             `Dit wordt automatisch meegenomen in uw aangifte.`,
      besparing: rondBedrag_(mkbAftrek * BELASTING.IB_SCHIJF_1_PCT),
    });
    totaalAftrek += mkbAftrek;
  }

  // ── 5. KIA (Kleinschaligheidsinvesteringsaftrek) ──────────────────────
  const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
  let investeringen = 0;
  gbData.slice(1).forEach(r => {
    if (r[0] && String(r[0]).startsWith('02') && parseFloat(r[5]) > 0) {
      investeringen += parseFloat(r[5]);
    }
  });

  if (investeringen >= BELASTING.KIA_MIN && investeringen <= BELASTING.KIA_MAX) {
    const kiaAftrek = rondBedrag_(investeringen * BELASTING.KIA_PCT);
    aftrekken.push({
      naam: 'KIA – Kleinschaligheidsinvesteringsaftrek (28%)',
      bedrag: kiaAftrek,
      voorwaarde: `Investeringen tussen €${BELASTING.KIA_MIN.toLocaleString('nl-NL')} en €${BELASTING.KIA_MAX.toLocaleString('nl-NL')}`,
      code: '7990',
    });
    totaalAftrek += kiaAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ KIA Investeringsaftrek: ' + formatBedrag_(kiaAftrek),
      tekst: `U heeft ${formatBedrag_(investeringen)} geïnvesteerd. De KIA geeft 28% extra aftrek: ${formatBedrag_(kiaAftrek)}. ` +
             `Zorg dat investeringen ≥ €450 zijn en voor bedrijfsmatig gebruik.`,
      besparing: rondBedrag_(kiaAftrek * BELASTING.IB_SCHIJF_1_PCT),
    });
  } else if (investeringen > 0 && investeringen < BELASTING.KIA_MIN) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Tip: Extra investering voor KIA',
      tekst: `U heeft ${formatBedrag_(investeringen)} geïnvesteerd. Investeer nog ${formatBedrag_(BELASTING.KIA_MIN - investeringen)} meer ` +
             `dit jaar om in aanmerking te komen voor de KIA (28% extra aftrek = ${formatBedrag_((BELASTING.KIA_MIN) * BELASTING.KIA_PCT)}).`,
      besparing: null,
    });
  }

  // ── 6. Reiskosten analyse ─────────────────────────────────────────────
  const reiskosten = getGrootboekSaldo_(ss, '7350');
  if (reiskosten === 0) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Reiskosten aftrekken?',
      tekst: `U heeft nog geen zakelijke reiskosten geboekt (rekening 7350). ` +
             `Zakelijke kilometers zijn aftrekbaar tegen €0,23/km. Gebruik het banktransactie formulier om dit bij te houden.`,
      besparing: null,
    });
  }

  // ── 7. BTW aangifte deadline check ───────────────────────────────────
  const vandaag = new Date();
  const maand = vandaag.getMonth() + 1;
  // BTW deadlines: Q4→31 jan, Q1→30 apr, Q2→31 jul, Q3→31 okt
  // Waarschuwing toont in de deadlinemaand zelf (maand 1, 4, 7 of 10)
  const maandNamen = ['', 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
                      'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const kwartaalDeadlines = { 1: 'Q4 vorig jaar', 4: 'Q1', 7: 'Q2', 10: 'Q3' };
  if (kwartaalDeadlines[maand] && vandaag.getDate() <= 28) {
    adviezen.push({
      type: 'ACTIE',
      titel: '📅 BTW aangifte: ' + kwartaalDeadlines[maand] + ' deadline nadert',
      tekst: `De BTW aangifte voor ${kwartaalDeadlines[maand]} moet voor eind ${maandNamen[maand]} worden ingediend. ` +
             `Genereer uw aangifte via: Boekhouding → BTW.`,
      besparing: null,
    });
  }

  // ── 8. Representatiekosten controle ──────────────────────────────────
  const reprKosten = getGrootboekSaldo_(ss, '7520');
  if (reprKosten > 0) {
    const nietAftrekbaar = rondBedrag_(reprKosten * (1 - BELASTING.REPRESENTATIE_AFTREK));
    adviezen.push({
      type: 'INFO',
      titel: 'ℹ️ Representatiekosten: let op beperkte aftrek',
      tekst: `Van uw representatiekosten (${formatBedrag_(reprKosten)}) is 26,5% NIET aftrekbaar (${formatBedrag_(nietAftrekbaar)}). ` +
             `Dit is al verwerkt in rekening 7520.`,
      besparing: null,
    });
  }

  // ── 9. Geschatte inkomstenbelasting ──────────────────────────────────
  let geschatteIB = 0;
  if (isZzp && winst > 0) {
    const belastbaarInkomen = Math.max(0, winst - totaalAftrek);
    if (belastbaarInkomen <= BELASTING.IB_SCHIJF_1_MAX) {
      geschatteIB = rondBedrag_(belastbaarInkomen * BELASTING.IB_SCHIJF_1_PCT);
    } else {
      geschatteIB = rondBedrag_(
        BELASTING.IB_SCHIJF_1_MAX * BELASTING.IB_SCHIJF_1_PCT +
        (belastbaarInkomen - BELASTING.IB_SCHIJF_1_MAX) * BELASTING.IB_SCHIJF_2_PCT
      );
    }
    // Heffingskortingen (vereenvoudigd)
    geschatteIB = Math.max(0, rondBedrag_(geschatteIB - BELASTING.HEFFINGSKORTING_MAX));
  }

  return {
    adviezen,
    aftrekken,
    totaalAftrek: rondBedrag_(totaalAftrek),
    winstVoorAftrek: winst,
    winstNaAftrek: Math.max(0, rondBedrag_(winst - totaalAftrek)),
    geschatteIB,
    isZzp,
  };
}

// ─────────────────────────────────────────────
//  BELASTINGADVIES TABBLAD GENEREREN
// ─────────────────────────────────────────────
function genereerBelastingadvies() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const bladNaam = 'Belastingadvies';
  let sheet = ss.getSheetByName(bladNaam);
  if (!sheet) sheet = ss.insertSheet(bladNaam);
  sheet.clearContents();
  sheet.clearFormats();
  sheet.setTabColor('#FF6F00');

  const advies = berekenBelastingadvies_(ss);
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const jaar = new Date().getFullYear();

  // Koptekst
  sheet.getRange(1, 1, 1, 3).merge()
    .setValue('BELASTINGADVIES & AFTREKPOSTEN – ' + jaar)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sheet.getRange(2, 1, 1, 3).merge()
    .setValue(bedrijf + '  |  Bijgewerkt: ' + formatDatumTijd_(new Date()))
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#E8EAF6')
    .setFontSize(10).setHorizontalAlignment('center');

  let rij = 4;

  // Samenvatting
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('SAMENVATTING').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const samenvatting = [
    ['Winst vóór aftrekken', formatBedrag_(advies.winstVoorAftrek)],
    ['Totaal aftrekposten', formatBedrag_(advies.totaalAftrek)],
    ['Belastbare winst', formatBedrag_(advies.winstNaAftrek)],
    ['Geschatte inkomstenbelasting*', formatBedrag_(advies.geschatteIB)],
  ];
  samenvatting.forEach(([label, waarde]) => {
    sheet.getRange(rij, 1).setValue(label).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(waarde);
    rij++;
  });
  sheet.getRange(rij - 1, 1, 1, 2).setBackground('#FFECB3').setFontWeight('bold');
  sheet.getRange(rij, 1, 1, 2).merge()
    .setValue('* Schatting o.b.v. huidige winst. Raadpleeg uw accountant voor definitieve aangifte.')
    .setFontSize(9).setFontColor('#888');
  rij += 2;

  // Aftrekposten
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('AFTREKPOSTEN').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;
  sheet.getRange(rij, 1, 1, 3).setValues([['Aftrekpost', 'Bedrag', 'Voorwaarde']])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  advies.aftrekken.forEach(a => {
    sheet.getRange(rij, 1).setValue(a.naam);
    sheet.getRange(rij, 2).setValue(a.bedrag).setNumberFormat('€#,##0.00');
    sheet.getRange(rij, 3).setValue(a.voorwaarde).setFontSize(9).setFontColor('#555');
    sheet.getRange(rij, 1, 1, 3).setBackground(KLEUREN.POSITIEF);
    rij++;
  });

  if (advies.aftrekken.length === 0) {
    sheet.getRange(rij, 1, 1, 3).merge().setValue('Nog geen aftrekposten berekend (vul bedrijfsgegevens in).')
      .setFontColor('#888');
    rij++;
  }
  rij++;

  // Adviezen en tips
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('ADVIEZEN & ACTIEPUNTEN').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const typeKleuren = {
    'VOORDEEL':     '#E8F5E9',
    'AFTREKPOST':   '#E3F2FD',
    'WAARSCHUWING': '#FFCDD2',
    'ACTIE':        '#FFF3E0',
    'TIP':          '#F3E5F5',
    'INFO':         '#F5F5F5',
  };

  advies.adviezen.forEach(a => {
    const bg = typeKleuren[a.type] || '#FAFAFA';
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.titel)
      .setBackground(bg).setFontWeight('bold').setWrap(true);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.tekst)
      .setBackground(bg).setWrap(true).setFontSize(10);
    if (a.besparing) {
      sheet.getRange(rij, 3).setValue('Belastingbesparing: ' + formatBedrag_(a.besparing))
        .setFontWeight('bold').setFontColor('#1B5E20');
    }
    rij += 2;
  });

  // Kolombreedte
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 350);
  sheet.setFrozenRows(2);

  ss.setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    'Belastingadvies bijgewerkt',
    `${advies.adviezen.length} adviezen / ${advies.aftrekken.length} aftrekposten gevonden.\n\n` +
    `Geschatte belastingbesparing via aftrekken: ${formatBedrag_(advies.aftrekken.reduce((s, a) => s + (a.bedrag * BELASTING.IB_SCHIJF_1_PCT), 0))}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

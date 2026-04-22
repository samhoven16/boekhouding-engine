/**
 * Belastingadvies.gs
 * Automatische berekening van belastingvoordelen en advies voor ZZP/MKB.
 * Het systeem detecteert zelf welke aftrekposten van toepassing zijn
 * en waarschuwt proactief wanneer actie nodig is.
 *
 * Verwerkte regelingen (2025) — zakelijk:
 *  - Zelfstandigenaftrek            €2.470  (ZZP, ≥1225 uur — stapsgewijs verlaagd)
 *  - Startersaftrek                 €2.123  (eerste 3 jaar ZZP)
 *  - MKB-winstvrijstelling          12,70%  (na aftrekken)
 *  - KOR                            €0 BTW  (omzet < €20.000)
 *  - KIA                            28%     (investeringen €2.801–€353.973)
 *  - FOR                            9,44%   (max €10.786 per jaar)
 *  - MIA/VAMIL                      45,5%   (milieu-investeringen)
 *  - Reiskosten eigen vervoer       €0,23/km
 *  - Thuiswerkvergoeding            €2,40/dag
 *  - Representatiekosten            73,5% aftrekbaar
 *  - Urencriterium                  1.225 uur
 *  - Afschrijvingskandidaten        ≥ €450 (automatisch gesignaleerd)
 *
 * Verwerkte regelingen (2025) — privé:
 *  - Lijfrente                      tot 30% van de premiegrondslag (max €35.987)
 *  - Giftenaftrek (ANBI)            1%–10% van het drempelinkomen
 *  - Box 3 groensparen              €65.072 vrijgesteld + 0,7% heffingskorting
 *  - Eigen woning hypotheekrente    aftrekbaar in box 1
 */

// ─────────────────────────────────────────────
//  BELASTING TARIEVEN EN GRENZEN (2025)
// ─────────────────────────────────────────────
const BELASTING = {
  ZELFSTANDIGENAFTREK:    2470,    // 2025: €2.470 (daalt jaarlijks richting €900 in 2027)
  STARTERSAFTREK:         2123,    // 2025: ongewijzigd
  MKB_WINSTVRIJSTELLING:  0.1270,  // 2025: 12,70% (was 13,31% in 2024)
  KOR_GRENS:              20000,
  KIA_MIN:                2801,
  KIA_MAX:                353973,
  KIA_PCT:                0.28,
  FOR_PCT:                0.0944,  // 9,44% van de winst
  FOR_MAX:                10786,   // 2025: max €10.786
  MIA_PCT:                0.455,   // Milieu-investeringsaftrek: 45,5%
  MIA_MIN:                2500,    // Minimale investeringsomvang voor MIA
  URENCRITERIUM:          1225,
  ACTIVEER_GRENS:         450,     // Investeringen ≥ €450 moeten worden geactiveerd
  REISKOSTEN_PER_KM:      0.23,
  THUISWERK_PER_DAG:      2.40,    // 2025: €2,40/dag (was €2,35)
  REPRESENTATIE_AFTREK:   0.735,   // 73,5% aftrekbaar
  LIJFRENTE_MAX:          35987,   // 2025: max €35.987 per jaar
  LIJFRENTE_PCT:          0.30,    // 30% van premiegrondslag (inkomen minus AOW-franchise)
  AOW_FRANCHISE:          14110,   // 2025: AOW-franchise voor lijfrenteberekening
  GIFTEN_DREMPEL_PCT:     0.01,    // min 1% van drempelinkomen
  GIFTEN_MAX_PCT:         0.10,    // max 10% van drempelinkomen
  BOX3_GROEN_VRIJSTELLING: 65072,  // 2025: per persoon (€130.144 voor partners)
  BOX3_GROEN_KORTING_PCT:  0.007,  // 0,7% heffingskorting over vrijgesteld bedrag
  IB_SCHIJF_1_MAX:        76817,
  IB_SCHIJF_1_PCT:        0.3582,
  IB_SCHIJF_2_PCT:        0.495,
  HEFFINGSKORTING_MAX:    3068,
  ARBEIDSKORTING_MAX:     5625,
};

// ─────────────────────────────────────────────
//  VOLLEDIG BELASTINGADVIES BEREKENEN
// ─────────────────────────────────────────────
function berekenBelastingadvies_(ss) {
  const jaar = new Date().getFullYear();
  const kg = berekenKengetallen_(ss);
  const omzet = kg.omzet;
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

  // ── 8a. FOR — Fiscale OudedagsReserve ────────────────────────────────
  if (isZzp && winst > 0) {
    const forBedrag = Math.min(rondBedrag_(winst * BELASTING.FOR_PCT), BELASTING.FOR_MAX);
    adviezen.push({
      type: 'VOORDEEL',
      titel: '💰 FOR – Fiscale OudedagsReserve: ' + formatBedrag_(forBedrag),
      tekst: `U kunt 9,44% van uw winst (max €10.786) toevoegen aan de FOR: ${formatBedrag_(forBedrag)}. ` +
             `Dit verlaagt uw belastbare winst nu. Let op: de FOR valt bij staken vrij en is dan belast. ` +
             `Overweeg alternatief een lijfrentepolis. Bespreek met uw accountant.`,
      besparing: rondBedrag_(forBedrag * BELASTING.IB_SCHIJF_1_PCT),
    });
  }

  // ── 8b. MIA/VAMIL (milieu-investeringen) ─────────────────────────────
  // Kijk of er milieu-gerelateerde investeringen zijn (rekening 026x/027x)
  const gbDataMia = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA) ? ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues() : [[]];
  let milieu = 0;
  gbDataMia.slice(1).forEach(r => {
    if (r[0] && /^02[67]/.test(String(r[0])) && parseFloat(r[5]) > 0) milieu += parseFloat(r[5]);
  });
  if (milieu >= BELASTING.MIA_MIN) {
    const miaAftrek = rondBedrag_(milieu * BELASTING.MIA_PCT);
    aftrekken.push({ naam: 'MIA – Milieu-investeringsaftrek (45,5%)', bedrag: miaAftrek, voorwaarde: `Milieu-investeringen ≥ €2.500 op de RVO-milieulijst`, code: '7990' });
    totaalAftrek += miaAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ MIA – Milieu-investeringsaftrek: ' + formatBedrag_(miaAftrek),
      tekst: `${formatBedrag_(milieu)} aan milieu-investeringen gedetecteerd. MIA geeft 45,5% extra aftrek: ${formatBedrag_(miaAftrek)}. ` +
             `Investeringen moeten op de RVO-milieulijst staan én vóór aanschaf gemeld bij RVO. Combineerbaar met KIA.`,
      besparing: rondBedrag_(miaAftrek * BELASTING.IB_SCHIJF_1_PCT),
    });
  } else if (milieu === 0) {
    adviezen.push({
      type: 'TIP',
      titel: '🌱 Tip: MIA/VAMIL – 45,5% extra aftrek bij milieu-investeringen',
      tekst: `Investeert u in zonnepanelen, elektrische auto, warmtepomp of andere milieu-investeringen? ` +
             `Dan geeft MIA 45,5% extra aftrek bóvenop de normale afschrijving. Meld vóór aankoop bij RVO.nl.`,
      besparing: null,
    });
  }

  // ── 8c. Thuiswerkaftrek ────────────────────────────────────────────────
  const thuiswerkDagen = parseInt(getInstelling_('Thuiswerk dagen per jaar') || '0');
  if (thuiswerkDagen > 0) {
    const thuiswerkAftrek = rondBedrag_(thuiswerkDagen * BELASTING.THUISWERK_PER_DAG);
    aftrekken.push({ naam: `Thuiswerkvergoeding (${thuiswerkDagen} dagen × €${BELASTING.THUISWERK_PER_DAG})`, bedrag: thuiswerkAftrek, voorwaarde: 'Werkdagen vanuit huis', code: '7350' });
    totaalAftrek += thuiswerkAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ Thuiswerkaftrek: ' + formatBedrag_(thuiswerkAftrek),
      tekst: `Op basis van ${thuiswerkDagen} thuiswerkdagen à €${BELASTING.THUISWERK_PER_DAG}/dag: ${formatBedrag_(thuiswerkAftrek)}. ` +
             `Pas het aantal dagen aan via Instellingen → "Thuiswerk dagen per jaar".`,
      besparing: rondBedrag_(thuiswerkAftrek * BELASTING.IB_SCHIJF_1_PCT),
    });
  } else {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Thuiswerkaftrek: €2,40 per werkdag aftrekbaar',
      tekst: `Werkt u vanuit huis? Dan is €2,40 per werkdag aftrekbaar (ca. €624 bij 260 werkdagen). ` +
             `Vul "Thuiswerk dagen per jaar" in via Instellingen om dit automatisch te berekenen.`,
      besparing: null,
    });
  }

  // ── 8d. Urencriterium voortgang ───────────────────────────────────────
  if (isZzp) {
    const uren = parseInt(getInstelling_('Gewerkte uren dit jaar') || '0');
    if (uren > 0) {
      const pct = Math.min(100, Math.round((uren / BELASTING.URENCRITERIUM) * 100));
      const resterend = Math.max(0, BELASTING.URENCRITERIUM - uren);
      adviezen.push({
        type: uren >= BELASTING.URENCRITERIUM ? 'AFTREKPOST' : 'ACTIE',
        titel: uren >= BELASTING.URENCRITERIUM
          ? `✅ Urencriterium gehaald! (${uren}/1.225 uur)`
          : `⏱️ Urencriterium: ${uren}/1.225 uur (${pct}%)`,
        tekst: uren >= BELASTING.URENCRITERIUM
          ? `U heeft het urencriterium gehaald. Zelfstandigenaftrek en startersaftrek zijn van toepassing. Bewaar uw urenregistratie als bewijs voor de Belastingdienst.`
          : `Nog ${resterend} uur nodig voor zelfstandigenaftrek (€2.470) en startersaftrek. ` +
            `Update "Gewerkte uren dit jaar" in Instellingen. Houd een urenregistratie bij als bewijs.`,
        besparing: null,
      });
    } else {
      adviezen.push({
        type: 'ACTIE',
        titel: '⏱️ Urenregistratie vereist voor zelfstandigenaftrek',
        tekst: `Vul "Gewerkte uren dit jaar" in via Instellingen. Zonder 1.225 uur geen recht op ` +
               `zelfstandigenaftrek (€2.470) of startersaftrek (€2.123). Houd een urenadministratie bij.`,
        besparing: null,
      });
    }
  }

  // ── 8e. Privégebruik zakelijke middelen ───────────────────────────────
  adviezen.push({
    type: 'INFO',
    titel: 'ℹ️ Privégebruik zakelijke middelen — controleer correcties',
    tekst: `Telefoon/laptop zakelijk maar ook privé gebruikt? Bijtelling verplicht of zakelijk aftrekbaar als ≥10% zakelijk. ` +
           `Auto van de zaak: bijtelling 16–22% van cataloguswaarde per jaar (EV: 16%). ` +
           `Kilometer­registratie bij privéauto: €0,23/km aftrekbaar. ` +
           `Gebruik rekening 7900 (Privé-onttrekkingen) voor correcties. Bespreek met uw accountant.`,
    besparing: null,
  });

  // ── 8f. Afschrijvingskandidaten ───────────────────────────────────────
  const kandidaten = scanAfschrijvingskandidaten_(ss);
  if (kandidaten.length > 0) {
    const totaalKandidaten = kandidaten.reduce((s, k) => s + k.bedrag, 0);
    adviezen.push({
      type: 'ACTIE',
      titel: `📦 ${kandidaten.length} mogelijke afschrijvingskandidaa${kandidaten.length === 1 ? 't' : 'ten'} (totaal ${formatBedrag_(totaalKandidaten)})`,
      tekst: kandidaten.slice(0, 5).map(k => `• ${formatBedrag_(k.bedrag)} – ${k.omschr} (${k.leverancier})`).join('\n') +
             (kandidaten.length > 5 ? `\n• … en ${kandidaten.length - 5} meer` : '') +
             `\n\nAankopen ≥ €${BELASTING.ACTIVEER_GRENS} moeten worden geactiveerd als investering (niet direct als kosten). ` +
             `Boek ze op een 0xxx-rekening en schrijf jaarlijks af. Dit geeft recht op KIA (28% extra aftrek).`,
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
  sheet.setTabColor(KLEUREN.ACCENT);

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
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#B8C2D1')
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
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
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

  // ── Privé belastingvoordelen ──────────────────────────────────────────
  rij++;
  const prive = berekenPriveBelastingvoordelen_(advies.winstVoorAftrek);
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('PRIVÉ BELASTINGVOORDELEN').setBackground('#4A148C').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  prive.forEach(a => {
    const bg = typeKleuren[a.type] || '#FAFAFA';
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.titel).setBackground(bg).setFontWeight('bold').setWrap(true);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.tekst).setBackground(bg).setWrap(true).setFontSize(10);
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

  const totaalBesparing = advies.aftrekken.reduce((s, a) => s + rondBedrag_(a.bedrag * BELASTING.IB_SCHIJF_1_PCT), 0);
  SpreadsheetApp.getUi().alert(
    'Belastingadvies bijgewerkt',
    `${advies.adviezen.length + prive.length} adviezen / ${advies.aftrekken.length} aftrekposten gevonden.\n\n` +
    `Geschatte belastingbesparing via zakelijke aftrekken: ${formatBedrag_(totaalBesparing)}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  AFSCHRIJVINGSKANDIDATEN SCAN
//  Zoekt inkoopfacturen ≥ €450 die NIET op een
//  activarekening (0xxx) zijn geboekt.
// ─────────────────────────────────────────────
function scanAfschrijvingskandidaten_(ss) {
  const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const kandidaten = [];
  const huidigJaar = new Date().getFullYear();

  data.slice(1).forEach(r => {
    const bedrag = parseFloat(r[8]) || 0;           // [8] = bedrag excl. BTW
    const kostenRek = String(r[15] || '');           // [15] = kostenrekening
    const datum = r[3] instanceof Date ? r[3] : new Date(r[3]);
    if (bedrag < BELASTING.ACTIVEER_GRENS) return;
    if (isNaN(datum.getTime()) || datum.getFullYear() < huidigJaar) return;
    if (kostenRek.startsWith('0')) return;           // al geactiveerd
    kandidaten.push({
      bedrag,
      omschr:     String(r[7] || ''),
      leverancier: String(r[6] || ''),
      datum,
    });
  });
  return kandidaten;
}

// ─────────────────────────────────────────────
//  PROACTIEVE AFSCHRIJVINGSMELDING
//  Aanroepen vanuit Triggers.gs na elke
//  inkoopfactuur ≥ €450.
// ─────────────────────────────────────────────
function signaleerAfschrijvingskandidaat_(ss, bedrag, leverancier, omschr) {
  try {
    schrijfAuditLog_('AFSCHRIJVING KANDIDAAT',
      `Aankoop ${formatBedrag_(bedrag)} bij ${leverancier} – "${omschr}" kan worden geactiveerd (≥ €${BELASTING.ACTIVEER_GRENS}). ` +
      `Boek op 0xxx-rekening + jaarlijkse afschrijving voor KIA (28% extra aftrek).`);
  } catch (_e) {}
}

// ─────────────────────────────────────────────
//  PRIVÉ BELASTINGVOORDELEN
// ─────────────────────────────────────────────
function berekenPriveBelastingvoordelen_(winst) {
  const adviezen = [];
  const inkomen = winst || 0;

  // Lijfrente
  const premiegrondslag = Math.max(0, inkomen - BELASTING.AOW_FRANCHISE);
  const lijfrenteMax = Math.min(
    rondBedrag_(premiegrondslag * BELASTING.LIJFRENTE_PCT),
    BELASTING.LIJFRENTE_MAX
  );
  if (lijfrenteMax > 0) {
    adviezen.push({
      type: 'VOORDEEL',
      titel: `💼 Lijfrente: tot ${formatBedrag_(lijfrenteMax)} aftrekbaar`,
      tekst: `U kunt maximaal 30% van uw premiegrondslag (${formatBedrag_(premiegrondslag)}) inleggen in een ` +
             `lijfrente en dit aftrekken van uw IB: maximaal ${formatBedrag_(lijfrenteMax)} dit jaar. ` +
             `Sluit een bancaire lijfrente of lijfrenteverzekering af. Vervangt deels de FOR. ` +
             `Vraag uw bank of verzekeraar om de jaarnota voor uw aangifte.`,
      besparing: rondBedrag_(lijfrenteMax * BELASTING.IB_SCHIJF_1_PCT),
    });
  }

  // Box 3 groensparen
  adviezen.push({
    type: 'VOORDEEL',
    titel: `🌿 Groensparen/groenbeleggen: tot ${formatBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING)} vrijgesteld in box 3`,
    tekst: `Groensparen en groenbeleggen zijn vrijgesteld van box 3 tot €${(BELASTING.BOX3_GROEN_VRIJSTELLING).toLocaleString('nl-NL')} ` +
           `per persoon (€${(BELASTING.BOX3_GROEN_VRIJSTELLING * 2).toLocaleString('nl-NL')} met fiscaal partner). ` +
           `Bovendien geeft het een heffingskorting van 0,7% over het vrijgestelde bedrag: ` +
           `max ${formatBedrag_(rondBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING * BELASTING.BOX3_GROEN_KORTING_PCT))} per persoon. ` +
           `Vraag uw bank naar een groenspaarrekening of -beleggingsfonds met CBF-keurmerk.`,
    besparing: rondBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING * BELASTING.BOX3_GROEN_KORTING_PCT),
  });

  // Giftenaftrek (ANBI)
  if (inkomen > 0) {
    const drempel = rondBedrag_(inkomen * BELASTING.GIFTEN_DREMPEL_PCT);
    const maxGift = rondBedrag_(inkomen * BELASTING.GIFTEN_MAX_PCT);
    adviezen.push({
      type: 'TIP',
      titel: `❤️ Giftenaftrek (ANBI): tot ${formatBedrag_(maxGift)} per jaar aftrekbaar`,
      tekst: `Giften aan goede doelen met ANBI-status zijn aftrekbaar voor het deel boven 1% van uw drempelinkomen ` +
             `(${formatBedrag_(drempel)}), tot maximaal 10% (${formatBedrag_(maxGift)}). ` +
             `Periodieke giften (minimaal 5 jaar, notarieel of schriftelijk vastgelegd) zijn VOLLEDIG aftrekbaar zonder drempel.`,
      besparing: null,
    });
  }

  // Eigen woning
  adviezen.push({
    type: 'TIP',
    titel: '🏠 Eigen woning – hypotheekrente aftrekbaar in box 1',
    tekst: `Hypotheekrente op uw eigen woning is aftrekbaar in box 1. Aftrek wordt beperkt tot het belastingtarief ` +
           `van de laagste schijf (35,82% in 2025). Eigenwoningforfait (0,35% WOZ bij WOZ €75k–€1,2M) telt als ` +
           `fictief inkomen. Als u geen rente meer betaalt (annuïteit bijna klaar), overweeg dan de Hillen-aftrek. ` +
           `Houd uw jaaropgave hypotheekrente bij de hand voor de aangifte.`,
    besparing: null,
  });

  // Zonnepanelen / saldering
  adviezen.push({
    type: 'TIP',
    titel: '☀️ Zonnepanelen – belasting besparen én salderen (t/m 2027)',
    tekst: `Zonnepanelen op uw eigen woning zijn BTW-vrij (0% BTW bij aankoop, mits u terugleverd). ` +
           `Terugleversubsidie (saldering) loopt door t/m 2027, daarna afgebouwd. ` +
           `Zakelijk geplaatste zonnepanelen komen in aanmerking voor KIA (28%) en eventueel MIA (45,5%). ` +
           `Dien de BTW-melding in bij de Belastingdienst binnen 6 maanden na installatie.`,
    besparing: null,
  });

  return adviezen;
}

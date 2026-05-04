/**
 * Beleggingen.gs
 * Real-time beleggingstracking via GOOGLEFINANCE().
 *
 * Sheet "Beleggingen" toont per positie:
 *   • Live koers via =GOOGLEFINANCE(ticker, "price")
 *   • Aankoopwaarde, huidige waarde, winst/verlies en rendement
 *   • Historische 52w hoog/laag voor context
 *   • Portfolio-totaal (in EUR via getWisselkoers_ voor non-EUR posities)
 *
 * Deze module raakt geen kernboekhouding aan — Beleggingen draait apart.
 * Voor IB-aangifte (Box 3) wordt het portfolio-saldo periodiek naar
 * Privé/Vermogensoverzicht gepusht.
 */

const BELEGGINGEN_HEADERS = [
  'Ticker',
  'Naam',
  'Aantal',
  'Aankoopkoers',
  'Aankoopwaarde',
  'Koers nu',
  'Waarde nu',
  'Winst/Verlies',
  'Rendement %',
  'Valuta',
  '52w hoog',
  '52w laag',
  'Aangekocht op',
  'Notities',
];

/**
 * Wordt aangeroepen vanuit setup() en/of via menu "Beleggingen tab toevoegen".
 * Maakt het Beleggingen-tabblad aan met GOOGLEFINANCE-formules.
 * Idempotent: doet niets als sheet al bestaat met data.
 */
function setupBeleggingenSheet_() {
  const ss = getSpreadsheet_();
  if (!ss) return;

  let sheet = ss.getSheetByName(SHEETS.BELEGGINGEN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.BELEGGINGEN);
    sheet.setTabColor('#7B1FA2'); // paars — onderscheidt zich van financiële tabs
  } else if (sheet.getLastRow() > 1) {
    return; // al gevuld; raak het niet aan
  }

  // ── Header rij ─────────────────────────────────────────────────
  zetHeaderRij_(sheet, BELEGGINGEN_HEADERS);
  sheet.setFrozenColumns(2);

  // ── Voorbeeldrijen met live formules ──────────────────────────
  // Twee populaire ETF voorbeelden + ruimte voor 18 posities
  const voorbeelden = [
    ['AMS:VWRL', '', 10, 0, '', '', '', '', '', '', '', '', new Date(), 'Voorbeeld — pas aan of verwijder'],
    ['AMS:VUSA', '', 5,  0, '', '', '', '', '', '', '', '', new Date(), ''],
  ];
  sheet.getRange(2, 1, voorbeelden.length, voorbeelden[0].length).setValues(voorbeelden);

  // ── Formules per rij (rij 2 t/m 21) ────────────────────────────
  const startRij = 2;
  const eindRij = 21;
  for (let r = startRij; r <= eindRij; r++) {
    // Naam (kolom B): =IFERROR(GOOGLEFINANCE(A2,"name"),"")
    sheet.getRange(r, 2).setFormula(`=IFERROR(IF(A${r}="","",GOOGLEFINANCE(A${r},"name")),"")`);
    // Aankoopwaarde (E): =C*D
    sheet.getRange(r, 5).setFormula(`=IF(OR(A${r}="",C${r}=""),"",C${r}*D${r})`);
    // Koers nu (F): =GOOGLEFINANCE(A,"price")
    sheet.getRange(r, 6).setFormula(`=IFERROR(IF(A${r}="","",GOOGLEFINANCE(A${r},"price")),"")`);
    // Waarde nu (G): =C*F
    sheet.getRange(r, 7).setFormula(`=IF(OR(A${r}="",C${r}="",F${r}=""),"",C${r}*F${r})`);
    // Winst/Verlies (H): =G-E
    sheet.getRange(r, 8).setFormula(`=IF(OR(E${r}="",G${r}=""),"",G${r}-E${r})`);
    // Rendement % (I): =IFERROR(H/E)
    sheet.getRange(r, 9).setFormula(`=IFERROR(IF(OR(E${r}="",E${r}=0),"",H${r}/E${r}),"")`);
    // Valuta (J): =GOOGLEFINANCE(A,"currency")
    sheet.getRange(r, 10).setFormula(`=IFERROR(IF(A${r}="","",GOOGLEFINANCE(A${r},"currency")),"")`);
    // 52w hoog (K)
    sheet.getRange(r, 11).setFormula(`=IFERROR(IF(A${r}="","",GOOGLEFINANCE(A${r},"high52")),"")`);
    // 52w laag (L)
    sheet.getRange(r, 12).setFormula(`=IFERROR(IF(A${r}="","",GOOGLEFINANCE(A${r},"low52")),"")`);
  }

  // ── Number formats ─────────────────────────────────────────────
  sheet.getRange(startRij, 4, eindRij - 1, 1).setNumberFormat('€#,##0.0000'); // aankoopkoers
  sheet.getRange(startRij, 5, eindRij - 1, 1).setNumberFormat('€#,##0.00');   // aankoopwaarde
  sheet.getRange(startRij, 6, eindRij - 1, 1).setNumberFormat('#,##0.0000');  // koers nu (kan vreemde valuta zijn)
  sheet.getRange(startRij, 7, eindRij - 1, 1).setNumberFormat('#,##0.00');    // waarde nu
  sheet.getRange(startRij, 8, eindRij - 1, 1).setNumberFormat('+€#,##0.00;-€#,##0.00;€0,00'); // w/v
  sheet.getRange(startRij, 9, eindRij - 1, 1).setNumberFormat('+0.00%;-0.00%;0.00%');         // rendement
  sheet.getRange(startRij, 11, eindRij - 1, 2).setNumberFormat('#,##0.0000');
  sheet.getRange(startRij, 13, eindRij - 1, 1).setNumberFormat('dd-MM-yyyy');

  // ── Conditional formatting op rendement % (kolom I) ────────────
  const rendementRange = sheet.getRange(startRij, 9, eindRij - 1, 1);
  const regels = sheet.getConditionalFormatRules();
  regels.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground('#E6F7F4')
      .setFontColor('#0D6E5A')
      .setRanges([rendementRange])
      .build()
  );
  regels.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground('#FDECEC')
      .setFontColor('#B71C1C')
      .setRanges([rendementRange])
      .build()
  );
  sheet.setConditionalFormatRules(regels);

  // ── Totaal rij (rij 23) ────────────────────────────────────────
  const totaalRij = 23;
  sheet.getRange(totaalRij, 1).setValue('TOTAAL PORTFOLIO');
  sheet.getRange(totaalRij, 1, 1, BELEGGINGEN_HEADERS.length)
    .setBackground(KLEUREN.HEADER_BG)
    .setFontColor(KLEUREN.HEADER_FG)
    .setFontWeight('bold');
  sheet.getRange(totaalRij, 5).setFormula(`=SUM(E${startRij}:E${eindRij})`).setNumberFormat('€#,##0.00');
  sheet.getRange(totaalRij, 7).setFormula(`=SUM(G${startRij}:G${eindRij})`).setNumberFormat('€#,##0.00');
  sheet.getRange(totaalRij, 8).setFormula(`=G${totaalRij}-E${totaalRij}`).setNumberFormat('+€#,##0.00;-€#,##0.00;€0,00');
  sheet.getRange(totaalRij, 9).setFormula(`=IFERROR(H${totaalRij}/E${totaalRij},"")`).setNumberFormat('+0.00%;-0.00%;0.00%');

  // ── Uitleg-blok onderin ────────────────────────────────────────
  const uitlegRij = totaalRij + 3;
  const uitleg = [
    ['ℹ️ Hoe werkt dit?'],
    ['• Vul kolom A (Ticker), C (Aantal) en D (Aankoopkoers) in. De rest wordt automatisch berekend.'],
    ['• Voor Nederlandse ETFs gebruik je het AMS: prefix → bv. AMS:VWRL of AMS:VUSA.'],
    ['• Voor Amerikaanse aandelen kun je gewoon de ticker invullen → bv. AAPL, MSFT, TSLA.'],
    ['• De koersen vernieuwen automatisch via GOOGLEFINANCE() — meestal binnen 20 minuten.'],
    ['• Posities in vreemde valuta worden weergegeven in de oorspronkelijke munteenheid (kolom J).'],
    ['• Voor IB-aangifte (Box 3) wordt het totaal automatisch meegenomen in Privé → Vermogensoverzicht.'],
  ];
  sheet.getRange(uitlegRij, 1, uitleg.length, 1).setValues(uitleg);
  sheet.getRange(uitlegRij, 1).setFontWeight('bold').setFontSize(11);
  sheet.getRange(uitlegRij, 1, uitleg.length, 1).setFontFamily('Arial');
  sheet.getRange(uitlegRij, 1, 1, BELEGGINGEN_HEADERS.length).merge();
  for (let i = 1; i < uitleg.length; i++) {
    sheet.getRange(uitlegRij + i, 1, 1, BELEGGINGEN_HEADERS.length).merge();
  }

  // ── Kolom-breedtes ─────────────────────────────────────────────
  sheet.setColumnWidth(1, 110);  // ticker
  sheet.setColumnWidth(2, 220);  // naam
  sheet.setColumnWidth(3, 80);   // aantal
  sheet.setColumnWidth(4, 110);  // aankoopkoers
  sheet.setColumnWidth(5, 130);  // aankoopwaarde
  sheet.setColumnWidth(6, 100);  // koers nu
  sheet.setColumnWidth(7, 130);  // waarde nu
  sheet.setColumnWidth(8, 130);  // w/v
  sheet.setColumnWidth(9, 110);  // rendement
  sheet.setColumnWidth(10, 70);  // valuta
  sheet.setColumnWidth(11, 100); // 52w hoog
  sheet.setColumnWidth(12, 100); // 52w laag
  sheet.setColumnWidth(13, 110); // aangekocht op
  sheet.setColumnWidth(14, 200); // notities
}

/**
 * Leest de live waarden uit het Beleggingen-tabblad en bewaart een snapshot
 * (timestamp + totaalwaarde + winst/verlies) in ScriptProperties voor trend.
 * Aangeroepen door dagelijkseTaken().
 */
function vernieuwBeleggingenSnapshot_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    const sheet = ss.getSheetByName(SHEETS.BELEGGINGEN);
    if (!sheet) return;

    const samenvatting = getBeleggingsSamenvatting_();
    if (!samenvatting || samenvatting.totaalWaarde === 0) return;

    const props = PropertiesService.getScriptProperties();
    const eerder = props.getProperty(PROP.BELEGGINGEN_SNAPSHOT);
    let geschiedenis = [];
    if (eerder) {
      try { geschiedenis = JSON.parse(eerder); } catch (e) { geschiedenis = []; }
    }
    geschiedenis.push({
      ts: new Date().toISOString(),
      waarde: samenvatting.totaalWaarde,
      winstVerlies: samenvatting.totaalWinstVerlies,
      rendement: samenvatting.gemiddeldRendement,
    });
    // Bewaar maximaal 90 dagen
    if (geschiedenis.length > 90) geschiedenis = geschiedenis.slice(-90);
    props.setProperty(PROP.BELEGGINGEN_SNAPSHOT, JSON.stringify(geschiedenis));
  } catch (e) {
    Logger.log('vernieuwBeleggingenSnapshot_ fout: ' + e.message);
  }
}

/**
 * Geeft een samenvatting van de huidige portfolio terug.
 * Leest waarden direct uit het Beleggingen-tabblad (data rijen 2-21).
 *
 * @return {Object|null} { totaalAankoop, totaalWaarde, totaalWinstVerlies, gemiddeldRendement, posities }
 */
function getBeleggingsSamenvatting_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  const sheet = ss.getSheetByName(SHEETS.BELEGGINGEN);
  if (!sheet) return null;

  const data = sheet.getRange(2, 1, 20, BELEGGINGEN_HEADERS.length).getValues();
  let totaalAankoop = 0;
  let totaalWaarde = 0;
  let posities = 0;
  data.forEach(function(row) {
    const ticker = String(row[0] || '').trim();
    if (!ticker) return;
    const aankoopwaarde = Number(row[4]) || 0;
    const waardeNu = Number(row[6]) || 0;
    if (aankoopwaarde > 0) {
      totaalAankoop += aankoopwaarde;
      totaalWaarde += waardeNu;
      posities++;
    }
  });
  const totaalWinstVerlies = totaalWaarde - totaalAankoop;
  const gemiddeldRendement = totaalAankoop > 0 ? totaalWinstVerlies / totaalAankoop : 0;
  return {
    totaalAankoop: Math.round(totaalAankoop * 100) / 100,
    totaalWaarde: Math.round(totaalWaarde * 100) / 100,
    totaalWinstVerlies: Math.round(totaalWinstVerlies * 100) / 100,
    gemiddeldRendement: Math.round(gemiddeldRendement * 10000) / 10000,
    posities: posities,
  };
}

/**
 * Menu-actie: voegt het Beleggingen-tabblad toe aan een bestaande spreadsheet.
 * Idempotent — toont melding als sheet al bestaat.
 */
function voegBeleggingenTabToe() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();
  if (ss.getSheetByName(SHEETS.BELEGGINGEN)) {
    ui.alert('Beleggingen-tabblad bestaat al',
      'Het tabblad "Beleggingen" is al aanwezig. Open het via de tabbalk onderin.',
      ui.ButtonSet.OK);
    return;
  }
  setupBeleggingenSheet_();
  schrijfAuditLog_('beleggingen_tab_aangemaakt', 'Beleggingen-tabblad toegevoegd aan spreadsheet');
  ui.alert('Beleggingen-tabblad toegevoegd',
    'Het tabblad "Beleggingen" staat nu in uw spreadsheet, met 2 voorbeeldposities.\n\n' +
    'Vul ticker, aantal en aankoopkoers in — de rest gaat automatisch via GOOGLEFINANCE().',
    ui.ButtonSet.OK);
}

/**
 * Verfraaien.gs
 * Centrale visuele opmaak voor data-tabbladen. Past conditional formatting,
 * banding (striped rows), kleur-coderingen en headers toe op:
 *   - Verkoopfacturen
 *   - Inkoopfacturen
 *   - Banktransacties
 *   - Relaties
 *   - Journaalposten
 *
 * Aangeroepen via menu-actie "Tabbladen opmaken" of automatisch na setup.
 * Idempotent: kan oneindig vaak worden gerund zonder duplicaten.
 */

// ─────────────────────────────────────────────
//  HOOFD-FUNCTIE — alle tabbladen mooier maken
// ─────────────────────────────────────────────

function verfraaiTabbladen() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let aantal = 0;
  const stappen = [
    ['Verkoopfacturen',   function() { _verfraaiVerkoopfacturen_(ss); }],
    ['Inkoopfacturen',    function() { _verfraaiInkoopfacturen_(ss); }],
    ['Banktransacties',   function() { _verfraaiBanktransacties_(ss); }],
    ['Relaties',          function() { _verfraaiRelaties_(ss); }],
    ['Journaalposten',    function() { _verfraaiJournaalposten_(ss); }],
  ];
  stappen.forEach(function(s) {
    try { s[1](); aantal++; }
    catch (e) { Logger.log('Verfraai ' + s[0] + ' fout: ' + e.message); }
  });
  try {
    SpreadsheetApp.getUi().alert(
      '✨ Tabbladen opgemaakt',
      aantal + ' van ' + stappen.length + ' tabbladen visueel verbeterd.\n\n' +
      'Wat is er gewijzigd:\n' +
      '• Status-kolom wordt nu groen/oranje/rood gekleurd\n' +
      '• Bedragen netjes geformatteerd als €\n' +
      '• Wisselende rij-kleuren voor leesbaarheid\n' +
      '• Frozen header-rij + auto-breedte kolommen',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (_) {}
}

// ─────────────────────────────────────────────
//  GENERIEKE OPMAAK-HELPERS
// ─────────────────────────────────────────────

/**
 * Past striped rows toe op een tabblad (alternating row colors).
 * Idempotent — verwijdert eerst oude bandings.
 */
function _zetBanding_(sheet, range) {
  if (!range || range.getNumRows() < 2) return;
  // Verwijder eerst bestaande bandings om duplicaten te voorkomen
  try {
    const bestaand = sheet.getBandings();
    bestaand.forEach(function(b) {
      try { b.remove(); } catch (_) {}
    });
  } catch (_) {}
  try {
    range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY)
      .setHeaderRowColor('#0D1B4E')
      .setFirstRowColor('#FFFFFF')
      .setSecondRowColor('#F7F9FC');
  } catch (_) {}
}

/**
 * Pas conditional formatting toe op een status-kolom met de standaard
 * boekhoud-statussen (Concept/Verzonden/Deels betaald/Betaald/Vervallen/Gecrediteerd).
 */
function _zetStatusKleurRegels_(sheet, kolomLetter, vanRij) {
  if (!sheet) return;
  const range = sheet.getRange(kolomLetter + (vanRij || 2) + ':' + kolomLetter);
  const regels = sheet.getConditionalFormatRules() || [];
  // Filter bestaande regels op deze range weg om duplicaten te voorkomen
  const overig = regels.filter(function(r) {
    const ranges = r.getRanges();
    return !ranges.some(function(rng) { return rng.getA1Notation().indexOf(kolomLetter + ':' + kolomLetter) !== -1
                                          || rng.getA1Notation().indexOf(kolomLetter + (vanRij || 2)) === 0; });
  });

  function maakRegel(tekst, achtergrond, voorgrond) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(tekst)
      .setBackground(achtergrond)
      .setFontColor(voorgrond)
      .setRanges([range])
      .build();
  }

  overig.push(maakRegel('Betaald',        '#C8E6C9', '#1B5E20'));   // groen
  overig.push(maakRegel('Verzonden',      '#E3F2FD', '#0D47A1'));   // lichtblauw
  overig.push(maakRegel('Concept',        '#F5F5F5', '#616161'));   // grijs
  overig.push(maakRegel('Deels betaald',  '#FFF8E1', '#5A3F00'));   // licht-oranje
  overig.push(maakRegel('Vervallen',      '#FFCDD2', '#B71C1C'));   // rood
  overig.push(maakRegel('Gecrediteerd',   '#E1BEE7', '#4A148C'));   // paars

  sheet.setConditionalFormatRules(overig);
}

/**
 * Pas conditional formatting toe op een bedrag-kolom: groen positief,
 * rood negatief. Werkt op getallen, niet op tekst.
 */
function _zetBedragKleurRegels_(sheet, kolomLetter, vanRij) {
  if (!sheet) return;
  const range = sheet.getRange(kolomLetter + (vanRij || 2) + ':' + kolomLetter);
  const regels = sheet.getConditionalFormatRules() || [];

  const groen = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setFontColor('#1B5E20')
    .setRanges([range])
    .build();
  const rood = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0)
    .setFontColor('#B71C1C')
    .setRanges([range])
    .build();

  regels.push(groen, rood);
  sheet.setConditionalFormatRules(regels);
}

/**
 * Standaard header-opmaak voor een tabblad: navy band, witte font, frozen rij.
 */
function _zetMooieHeader_(sheet, breedte) {
  if (!sheet || sheet.getLastRow() === 0) return;
  const cols = breedte || sheet.getLastColumn();
  if (cols < 1) return;
  const headerRange = sheet.getRange(1, 1, 1, cols);
  headerRange.setBackground('#0D1B4E');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setVerticalAlignment('middle');
  headerRange.setHorizontalAlignment('left');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
}

// ─────────────────────────────────────────────
//  PER-TABBLAD VERFRAAIING
// ─────────────────────────────────────────────

function _verfraaiVerkoopfacturen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  _zetMooieHeader_(sheet, lastCol);

  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    _zetBanding_(sheet, dataRange);
    // Bedragen formatteren (kolom 10=excl, 11=BTW, 12=incl, 13=betaald)
    [10, 12, 13, 14].forEach(function(c) {
      if (c <= lastCol) sheet.getRange(2, c, lastRow - 1, 1).setNumberFormat('€ #,##0.00');
    });
  }
  // Status-kolom = O (15)
  _zetStatusKleurRegels_(sheet, 'O', 2);
}

function _verfraaiInkoopfacturen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  _zetMooieHeader_(sheet, lastCol);

  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    _zetBanding_(sheet, dataRange);
    // Bedragen (kolom 9=excl, 11=BTW, 12=incl)
    [9, 11, 12].forEach(function(c) {
      if (c <= lastCol) sheet.getRange(2, c, lastRow - 1, 1).setNumberFormat('€ #,##0.00');
    });
  }
  // Status-kolom = M (13)
  _zetStatusKleurRegels_(sheet, 'M', 2);
}

function _verfraaiBanktransacties_(ss) {
  const sheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  _zetMooieHeader_(sheet, lastCol);

  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    _zetBanding_(sheet, dataRange);
    // Bedrag-kolom = D (4) → kleur op +/-
    if (lastCol >= 4) {
      sheet.getRange(2, 4, lastRow - 1, 1).setNumberFormat('€ #,##0.00');
    }
  }
  _zetBedragKleurRegels_(sheet, 'D', 2);
}

function _verfraaiRelaties_(ss) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  _zetMooieHeader_(sheet, lastCol);

  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    _zetBanding_(sheet, dataRange);
  }
}

function _verfraaiJournaalposten_(ss) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  _zetMooieHeader_(sheet, lastCol);

  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    _zetBanding_(sheet, dataRange);
    // Bedrag-kolom = I (9), BTW-bedrag = K (11)
    [9, 11].forEach(function(c) {
      if (c <= lastCol) sheet.getRange(2, c, lastRow - 1, 1).setNumberFormat('€ #,##0.00');
    });
  }
}

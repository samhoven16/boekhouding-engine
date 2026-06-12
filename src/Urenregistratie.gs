/**
 * src/Urenregistratie.gs
 *
 * MVP-urenregistratie — bewijslast voor het 1.225-uren-criterium (art. 3.6
 * Wet IB) voor zelfstandigenaftrek en startersaftrek.
 *
 * Probleem dat dit oplost (audit 2026-06-12, C1):
 * Voorheen las Belastingadvies.gs alleen een instelling "Gewerkte uren dit
 * jaar". Dat is een vrij-in-te-vullen totaal-nummer zonder onderbouwing.
 * Bij Belastingdienst-controle moet de klant per-rij datum + activiteit +
 * uren tonen. Zonder dit: directe correctie zelfstandigenaftrek + boete.
 *
 * Architectuur — bewust simpel:
 *   - Eén sheet UREN met 6 kolommen ([Datum, Uren, Activiteit, Project,
 *     Notities, Aangemaakt op]).
 *   - Aggregator-functie totaalUrenInBoekjaar_(ss, jaar) telt uren per jaar.
 *   - Belastingadvies.gs gebruikt deze aggregator (met fallback naar de
 *     bestaande instelling voor backwards-compatibiliteit met installaties
 *     die nog geen UREN-sheet hebben).
 *
 * Niet-doelen in deze MVP (kunnen later):
 *   - Geen dialog/UI voor invoer — klant typt direct in de sheet.
 *   - Geen koppeling aan factuur/klant — dat is een aparte feature.
 *   - Geen rapportage — totaalovergang loopt via Belastingadvies-tab.
 */

// Kolom-indices (0-based) — MOET overeenkomen met de header in
// setupUrenregistratieSheet_. Sheet-schema.md kent dezelfde volgorde.
const UREN_KOL = {
  DATUM:        0,
  UREN:         1,
  ACTIVITEIT:   2,
  PROJECT:      3,
  NOTITIES:     4,
  AANGEMAAKT:   5,
};

/**
 * Maakt of repareert het UREN-tabblad. Idempotent: tweede aanroep is no-op
 * voor de structuur. Bestaande data blijft staan.
 */
function setupUrenregistratieSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.UREN);
  const headers = ['Datum', 'Uren', 'Activiteit', 'Project/Klant', 'Notities', 'Aangemaakt op'];

  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.UREN);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#E8F0FE');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100); // Datum
    sheet.setColumnWidth(2, 70);  // Uren
    sheet.setColumnWidth(3, 280); // Activiteit
    sheet.setColumnWidth(4, 180); // Project
    sheet.setColumnWidth(5, 240); // Notities
    sheet.setColumnWidth(6, 130); // Aangemaakt op

    // Datum-validatie kolom A (audit-bestendige invoer)
    try {
      const datumRule = SpreadsheetApp.newDataValidation()
        .requireDate()
        .setAllowInvalid(false)
        .setHelpText('Voer een datum in (formaat DD-MM-JJJJ)')
        .build();
      sheet.getRange(2, 1, 999, 1).setDataValidation(datumRule);
    } catch (_) {}

    // Uren-validatie kolom B (positief getal, max 24/dag pragmatisch)
    try {
      const urenRule = SpreadsheetApp.newDataValidation()
        .requireNumberBetween(0.25, 24)
        .setAllowInvalid(false)
        .setHelpText('Aantal uren (0,25 t/m 24). Gebruik 0,25 voor 15 minuten.')
        .build();
      sheet.getRange(2, 2, 999, 1).setDataValidation(urenRule);
    } catch (_) {}

    // Korte instructie bovenaan rij 2 (sample-rij; klant overschrijft)
    sheet.getRange(2, 1, 1, headers.length).setValues([[
      new Date(), 2, 'Voorbeeld: administratie bijwerken', '', 'Verwijder of pas deze rij aan',
      new Date(),
    ]]);
    sheet.getRange(2, 1, 1, headers.length).setFontStyle('italic')
      .setBackground('#FFFDE7'); // licht-geel — visueel "concept"

    try {
      schrijfAuditLog_('Urenregistratie-sheet aangemaakt',
        'C1-audit: bewijslast 1.225-uren-criterium (art. 3.6 Wet IB).');
    } catch (_) {}
  } else {
    // Bestaande sheet — alleen headers verifiëren/repareren.
    const huidige = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (huidige.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#E8F0FE');
    }
  }
  return sheet;
}

/**
 * Telt alle gewerkte uren in het opgegeven boekjaar. Robuust voor
 * lege rijen, string-datums (parseDatum_), en ontbrekend tabblad.
 *
 * @param {Spreadsheet} ss
 * @param {number} jaar  — kalenderjaar (bv. 2026)
 * @returns {number} totaal uren (decimaal)
 */
function totaalUrenInBoekjaar_(ss, jaar) {
  if (!ss || typeof ss.getSheetByName !== 'function') return 0;
  const sheet = ss.getSheetByName(SHEETS.UREN);
  if (!sheet) return 0;
  const laatste = sheet.getLastRow();
  if (laatste < 2) return 0;
  const data = sheet.getRange(2, 1, laatste - 1, 2).getValues(); // alleen datum + uren
  let totaal = 0;
  for (let i = 0; i < data.length; i++) {
    const ruw = data[i][UREN_KOL.DATUM];
    if (!ruw) continue;
    const datum = (ruw instanceof Date) ? ruw :
      (typeof parseDatum_ === 'function' ? parseDatum_(ruw) : new Date(ruw));
    if (!datum || isNaN(datum.getTime())) continue;
    if (datum.getFullYear() !== jaar) continue;
    const uren = parseFloat(data[i][UREN_KOL.UREN]);
    if (isFinite(uren) && uren > 0) totaal += uren;
  }
  // Rond af op 1 decimaal — uren-totalen op de cent is fictieve precisie.
  return Math.round(totaal * 10) / 10;
}

/**
 * Menu-actie: opent het UREN-tabblad. Aanroepbaar vanuit Boekhoudbaar-menu.
 * Maakt het tabblad aan als het ontbreekt — zodat klanten met een legacy-
 * installatie zonder reset toch toegang krijgen.
 */
function openUrenregistratie() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.UREN);
  if (!sheet) {
    sheet = setupUrenregistratieSheet_();
  }
  ss.setActiveSheet(sheet);
  try { SpreadsheetApp.flush(); } catch (_) {}
}

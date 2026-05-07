/**
 * EUVerkoop.gs
 * EU intracommunautaire prestaties + OSS-monitoring.
 *
 * REGELS (NL ZZP-context, 2026):
 *  - B2B EU-klant met geldig BTW-nummer → verleggingsregeling, 0% BTW,
 *    klant moet in eigen land BTW afdragen. Aangifte: rubriek 3b BTW-aangifte
 *    + ICP-opgaaf (Opgaaf Intracommunautaire Prestaties) per kwartaal.
 *  - B2C EU-klant zonder BTW-nr (consument) → mogelijk OSS:
 *      Wanneer cumulatieve EU-B2C-omzet > €10.000/jaar = OSS-aangifte
 *      verplicht (of registreer in elk EU-land). Onder €10k = NL-BTW-tarief.
 *
 * Deze module:
 *  - Markeert facturen die EU-B2C of EU-B2B zijn
 *  - Berekent of OSS-grens (€10k) is bereikt
 *  - Genereert ICP-rapport voor Belastingdienst
 */

const OSS_DREMPEL = 10000;
const ICP_SHEET = 'ICP-rapport';

const _EU_LANDCODES = {
  AT:'Oostenrijk', BE:'België', BG:'Bulgarije', HR:'Kroatië', CY:'Cyprus',
  CZ:'Tsjechië', DK:'Denemarken', EE:'Estland', FI:'Finland', FR:'Frankrijk',
  DE:'Duitsland', GR:'Griekenland', HU:'Hongarije', IE:'Ierland', IT:'Italië',
  LV:'Letland', LT:'Litouwen', LU:'Luxemburg', MT:'Malta', PL:'Polen',
  PT:'Portugal', RO:'Roemenië', SK:'Slowakije', SI:'Slovenië', ES:'Spanje',
  SE:'Zweden',
};

/**
 * Detecteert EU-landcode uit BTW-nummer (eerste 2 letters) of land-veld.
 * Returns null als niet-EU of NL.
 * @param {string} btwNr   bv. "DE123456789"
 * @param {string=} land   optionele landcode-fallback
 */
function detecteerEULand_(btwNr, land) {
  const b = String(btwNr || '').toUpperCase().replace(/\s/g, '');
  const m = b.match(/^([A-Z]{2})/);
  if (m && m[1] !== 'NL' && _EU_LANDCODES[m[1]]) return m[1];
  const l = String(land || '').toUpperCase().slice(0, 2);
  if (l !== 'NL' && _EU_LANDCODES[l]) return l;
  return null;
}

/**
 * Is dit een geldige EU-B2B-factuur? (verleggingsregeling van toepassing)
 * Vereist: EU-klant + niet-NL + BTW-nummer ingevuld.
 */
function isEUB2B_(btwNrKlant, landKlant) {
  const land = detecteerEULand_(btwNrKlant, landKlant);
  if (!land) return false;
  // BTW-nummer moet ingevuld én niet-leeg zijn (anders B2C)
  return String(btwNrKlant || '').trim().length > 5;
}

/**
 * OSS-monitor: berekent cumulatieve EU-B2C-omzet huidig kalenderjaar.
 * Returns { totaalEuB2c, drempelOverschreden, perLand: {DE: 1234, FR: 567} }
 */
function controleerOssDrempel_() {
  const ss = getSpreadsheet_();
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet || vfSheet.getLastRow() < 2) {
    return { totaalEuB2c: 0, drempelOverschreden: false, perLand: {} };
  }
  const data = vfSheet.getDataRange().getValues();
  const huidigJaar = new Date().getFullYear();
  const perLand = {};
  let totaal = 0;

  // We hebben factuur-rij maar niet altijd EU-flag. Heuristiek:
  // Klant-BTW-nr (kolom 21) of land-veld in adres parseren.
  for (let i = 1; i < data.length; i++) {
    const datum = data[i][2] instanceof Date ? data[i][2] : null;
    if (!datum || datum.getFullYear() !== huidigJaar) continue;
    const status = String(data[i][14] || '');
    if (status === 'Gecrediteerd') continue;
    const btwNrKlant = String(data[i][21] || '').trim();
    const klantAdres = String(data[i][6] || '');
    // Detecteer EU-land
    let euLand = detecteerEULand_(btwNrKlant, '');
    if (!euLand) {
      // Probeer adres voor landcode (bv. "Berlin, DE 10115")
      const m = klantAdres.match(/\b([A-Z]{2})\s*\d{4,5}\b/);
      if (m && _EU_LANDCODES[m[1]]) euLand = m[1];
    }
    if (!euLand) continue;
    // B2B (BTW-nr) → niet OSS, maar ICP. Alleen B2C telt voor OSS-drempel.
    if (btwNrKlant && btwNrKlant.length > 5) continue;
    const omzet = parseFloat(data[i][9]) || 0;
    perLand[euLand] = (perLand[euLand] || 0) + omzet;
    totaal += omzet;
  }
  return {
    totaalEuB2c: rondBedrag_(totaal),
    drempelOverschreden: totaal > OSS_DREMPEL,
    perLand: perLand,
  };
}

/**
 * Genereert ICP-rapport (Opgaaf Intracommunautaire Prestaties).
 * Verplicht per kwartaal voor B2B EU-leveringen.
 * Output: tabblad 'ICP-rapport' met rijen per klant + totaal.
 */
function genereerIcpRapport() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  const resp = ui.prompt(
    'ICP-rapport genereren',
    'Voor welk kwartaal? Geef Q1/Q2/Q3/Q4 of een jaar (bv. 2026 = heel jaar).',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const periode = String(resp.getResponseText() || '').trim().toUpperCase();
  const huidigJaar = new Date().getFullYear();
  let van, tot, label;
  if (/^Q[1-4]$/.test(periode)) {
    const q = parseInt(periode[1]);
    van = new Date(huidigJaar, (q - 1) * 3, 1);
    tot = new Date(huidigJaar, q * 3, 0, 23, 59, 59, 999);
    label = periode + ' ' + huidigJaar;
  } else if (/^\d{4}$/.test(periode)) {
    const y = parseInt(periode);
    van = new Date(y, 0, 1);
    tot = new Date(y, 11, 31, 23, 59, 59, 999);
    label = String(y);
  } else {
    ui.alert('Periode niet herkend. Gebruik Q1, Q2, Q3, Q4 of een jaar zoals 2026.');
    return;
  }

  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet || vfSheet.getLastRow() < 2) {
    ui.alert('Geen verkoopfacturen om te rapporteren.');
    return;
  }
  const data = vfSheet.getDataRange().getValues();
  // Aggregate per (BTW-nummer + land) — Belastingdienst wil per ontvanger
  const agg = {};
  for (let i = 1; i < data.length; i++) {
    const datum = data[i][2] instanceof Date ? data[i][2] : null;
    if (!datum || datum < van || datum > tot) continue;
    const status = String(data[i][14] || '');
    if (status === 'Gecrediteerd') continue;
    const btwNrKlant = String(data[i][21] || '').trim();
    const land = detecteerEULand_(btwNrKlant);
    if (!land || !btwNrKlant || btwNrKlant.length <= 5) continue;  // alleen EU B2B
    const klantnaam = String(data[i][5] || '');
    const omzet = parseFloat(data[i][9]) || 0;
    const key = btwNrKlant;
    if (!agg[key]) agg[key] = { btwNr: btwNrKlant, naam: klantnaam, land: land, omzet: 0, aantalFacturen: 0 };
    agg[key].omzet += omzet;
    agg[key].aantalFacturen++;
  }

  // Schrijf rapport
  let sheet = ss.getSheetByName(ICP_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ICP_SHEET);
    sheet.setTabColor('#1A2A6B');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }
  sheet.getRange(1, 1, 1, 5).merge()
    .setValue('🇪🇺 ICP-RAPPORT — ' + label)
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(15).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 38);

  sheet.getRange(2, 1, 1, 5).merge()
    .setValue('Opgaaf Intracommunautaire Prestaties — voor BTW-aangifte rubriek 3b. Indienen per kwartaal verplicht (binnen 1 maand na kwartaaleinde).')
    .setBackground('#F7F9FC').setFontColor('#5F6B7A').setFontSize(11)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(2, 36);

  sheet.getRange(4, 1, 1, 5).setValues([['BTW-nummer afnemer', 'Klantnaam', 'Land', 'Aantal facturen', 'Omzet (excl. BTW)']])
    .setBackground('#0D1B4E').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(4);

  let r = 5;
  let totaal = 0;
  Object.keys(agg).sort().forEach(function(k) {
    const a = agg[k];
    sheet.getRange(r, 1, 1, 5).setValues([[a.btwNr, a.naam, a.land + ' — ' + (_EU_LANDCODES[a.land] || ''), a.aantalFacturen, formatBedrag_(a.omzet)]])
      .setFontSize(11);
    if ((r - 5) % 2 === 1) sheet.getRange(r, 1, 1, 5).setBackground('#F7F9FC');
    totaal += a.omzet;
    r++;
  });
  if (Object.keys(agg).length === 0) {
    sheet.getRange(5, 1, 1, 5).merge()
      .setValue('Geen EU B2B-leveringen in deze periode.')
      .setBackground('#E8F5E9').setFontColor('#1B5E20').setFontWeight('bold')
      .setFontSize(13).setHorizontalAlignment('center');
    r = 6;
  } else {
    sheet.getRange(r, 1, 1, 5).setValues([['', '', '', 'TOTAAL', formatBedrag_(totaal)]])
      .setBackground('#E6F7F4').setFontWeight('bold').setFontSize(12);
  }

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 140);
  sheet.hideGridlines();
  ss.setActiveSheet(sheet);

  try { schrijfAuditLog_('ICP-rapport gegenereerd', label + ' — ' + Object.keys(agg).length + ' afnemers, totaal ' + formatBedrag_(totaal)); } catch (_) {}
  ui.alert('🇪🇺 ICP-rapport klaar', 'Periode: ' + label + '\n' + Object.keys(agg).length + ' EU B2B-afnemers · totaal ' + formatBedrag_(totaal) + '\n\nDien dit binnen 1 maand na kwartaaleinde in via mijn.belastingdienst.nl.', ui.ButtonSet.OK);
}

/**
 * OSS-melding voor in Notificaties / Belastingadvies.
 * Wordt aangeroepen vanuit genereerNotificaties_().
 */
function ossNotificatie_() {
  const r = controleerOssDrempel_();
  if (r.totaalEuB2c === 0) return null;
  if (r.drempelOverschreden) {
    return {
      titel: '🇪🇺 OSS-aangifte verplicht',
      tekst: 'EU B2C-omzet ' + formatBedrag_(r.totaalEuB2c) + ' > €10.000 grens. ' +
             'Registreer voor OSS via mijn.belastingdienst.nl en doe per kwartaal aangifte voor alle EU-landen.',
      actie: 'OSS-registreren bij Belastingdienst',
      euros: 0,
      urgent: true,
      prioriteit: 95,
    };
  }
  if (r.totaalEuB2c >= OSS_DREMPEL * 0.8) {
    return {
      titel: '🇪🇺 OSS-grens nadert',
      tekst: 'EU B2C-omzet ' + formatBedrag_(r.totaalEuB2c) + ' (80%+ van €10.000-grens). ' +
             'Voorbereid je vast voor OSS-registratie als je deze trend voortzet.',
      actie: 'Lees /gids/oss-aangifte-eu-webshop',
      euros: 0,
      urgent: false,
      prioriteit: 50,
    };
  }
  return null;
}

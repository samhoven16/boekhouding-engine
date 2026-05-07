/**
 * Consolidatie.gs
 * Holding-overzicht voor klant met meerdere boekhoudbaar-spreadsheets.
 *
 * Use-case: ondernemer met 3 eenmanszaken (bv. coaching + webshop + SaaS)
 * heeft 3 aparte sheets. Hij wil één Holding-rapportage zonder data te
 * dupliceren. Deze module leest meerdere SS-IDs en aggregeert KPI's.
 *
 * VEILIG OMDAT:
 *  - Alleen READ via SpreadsheetApp.openById (klant moet eigenaar/edit
 *    rights hebben — Drive permissions enforced)
 *  - Geen write naar bron-sheets, alleen schrijft Holding-tab in HUIDIGE
 *    spreadsheet
 *  - Best-effort: bron niet bereikbaar = silent skip + audit-log
 *
 * GEBRUIK:
 *  - Klant zet SS-IDs in Instellingen ("Holding admin SS-IDs", komma-
 *    gescheiden)
 *  - Menu: Boekhouding → Overzichten → Holding-overzicht vernieuwen
 */

const HOLDING_SHEET = 'Holding-overzicht';

/**
 * Menu-entry: vernieuw Holding-overzicht.
 */
function vernieuwHoldingOverzicht() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ssIdsRaw = String(getInstelling_('Holding admin SS-IDs') || '').trim();
  if (!ssIdsRaw) {
    ui.alert(
      '⚙️ Holding-overzicht eerst configureren',
      'Vul in tabblad "Instellingen" bij sleutel "Holding admin SS-IDs" een ' +
      'komma-gescheiden lijst van Spreadsheet-IDs van je andere ' +
      'boekhoudbaar-administraties.\n\n' +
      'Voorbeeld:\n  1AbCdEfGh...XyZ123, 1KlMnO...PqR789\n\n' +
      'Tip: SS-ID staat in de URL na /spreadsheets/d/ en vóór /edit.',
      ui.ButtonSet.OK
    );
    return;
  }

  const ssIds = ssIdsRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (ssIds.length === 0) {
    ui.alert('Geen geldige SS-IDs gevonden in Instellingen.');
    return;
  }
  // Voeg HUIDIGE sheet toe als eerste — Holding bevat dan ook eigen cijfers
  const huidigSsId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const alleIds = [huidigSsId].concat(ssIds.filter(function(id) { return id !== huidigSsId; }));

  const data = consolideerAdmins(alleIds);
  schrijfHoldingOverzicht_(data);
  ui.alert('✅ Holding-overzicht klaar', data.beschikbaar.length + ' admins verwerkt, ' +
    data.fout.length + ' fouten.\n\nOpen tabblad "Holding-overzicht".', ui.ButtonSet.OK);
}

/**
 * Lees meerdere boekhoudbaar-spreadsheets en aggregeer KPI's.
 * @param {string[]} ssIds
 * @returns {Object} aggregaat
 */
function consolideerAdmins(ssIds) {
  const t0 = Date.now();
  const beschikbaar = [];
  const fout = [];
  let totaal = {
    omzetExcl: 0, kostenExcl: 0, btwTeBetalen: 0,
    debiteurenOpen: 0, crediteurenOpen: 0, banksaldo: 0,
    aantalFacturen: 0, aantalKosten: 0,
  };
  const perAdmin = [];

  ssIds.forEach(function(ssId) {
    try {
      const bron = SpreadsheetApp.openById(ssId);
      const naam = (bron.getName() || ssId.slice(0, 8)).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50);
      const k = _kpisVoorAdmin_(bron);
      perAdmin.push(Object.assign({ naam: naam, ssId: ssId }, k));
      // Aggregatie
      Object.keys(totaal).forEach(function(key) {
        totaal[key] += parseFloat(k[key]) || 0;
      });
      beschikbaar.push(naam);
    } catch (e) {
      fout.push({ ssId: ssId.slice(0, 12) + '…', fout: e.message });
      Logger.log('consolideerAdmins fout voor ' + ssId + ': ' + e.message);
    }
  });

  try { metricsLog_('holding.consolidate', Date.now() - t0, true, { admins: beschikbaar.length, fouten: fout.length }); } catch (_) {}
  try { schrijfAuditLog_('Holding-consolidatie', beschikbaar.length + ' admins, ' + fout.length + ' fouten'); } catch (_) {}

  return { perAdmin: perAdmin, totaal: totaal, beschikbaar: beschikbaar, fout: fout };
}

/**
 * Lees KPI's uit één bron-administratie. Best-effort, defensief.
 */
function _kpisVoorAdmin_(bron) {
  const result = {
    omzetExcl: 0, kostenExcl: 0, btwTeBetalen: 0,
    debiteurenOpen: 0, crediteurenOpen: 0, banksaldo: 0,
    aantalFacturen: 0, aantalKosten: 0,
  };
  const huidigJaar = new Date().getFullYear();

  // Verkoopfacturen — col 9 = excl, col 11 = BTW, col 12 = incl, col 13 = betaald, col 14 = status
  try {
    const vfSheet = bron.getSheetByName('Verkoopfacturen');
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const vfData = vfSheet.getDataRange().getValues();
      for (let i = 1; i < vfData.length; i++) {
        const datum = vfData[i][2] instanceof Date ? vfData[i][2] : null;
        if (!datum || datum.getFullYear() !== huidigJaar) continue;
        const status = String(vfData[i][14] || '');
        if (status === 'Gecrediteerd') continue;
        result.omzetExcl += parseFloat(vfData[i][9]) || 0;
        result.btwTeBetalen += parseFloat(vfData[i][10]) || 0;
        result.aantalFacturen++;
        if (status !== 'Betaald') {
          const open = (parseFloat(vfData[i][12]) || 0) - (parseFloat(vfData[i][13]) || 0);
          if (open > 0) result.debiteurenOpen += open;
        }
      }
    }
  } catch (_) {}

  // Inkoopfacturen
  try {
    const ifSheet = bron.getSheetByName('Inkoopfacturen');
    if (ifSheet && ifSheet.getLastRow() > 1) {
      const ifData = ifSheet.getDataRange().getValues();
      for (let i = 1; i < ifData.length; i++) {
        const datum = ifData[i][3] instanceof Date ? ifData[i][3] : null;
        if (!datum || datum.getFullYear() !== huidigJaar) continue;
        result.kostenExcl += parseFloat(ifData[i][8]) || 0;
        result.btwTeBetalen -= parseFloat(ifData[i][10]) || 0;  // voorbelasting
        result.aantalKosten++;
        const status = String(ifData[i][12] || '');
        if (status !== 'Betaald') {
          const incl = parseFloat(ifData[i][11]) || 0;
          if (incl > 0) result.crediteurenOpen += incl;
        }
      }
    }
  } catch (_) {}

  // Banksaldo via journaalposten (rekening 1200)
  try {
    const jpSheet = bron.getSheetByName('Journaalposten');
    if (jpSheet && jpSheet.getLastRow() > 1) {
      const jpData = jpSheet.getDataRange().getValues();
      for (let i = 1; i < jpData.length; i++) {
        const debet = String(jpData[i][4] || '');
        const credit = String(jpData[i][6] || '');
        const bedrag = parseFloat(jpData[i][8]) || 0;
        if (debet === '1200') result.banksaldo += bedrag;
        if (credit === '1200') result.banksaldo -= bedrag;
      }
    }
  } catch (_) {}

  // Round
  Object.keys(result).forEach(function(k) {
    if (typeof result[k] === 'number') result[k] = Math.round(result[k] * 100) / 100;
  });
  return result;
}

/**
 * Render Holding-overzicht naar tabblad.
 */
function schrijfHoldingOverzicht_(data) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(HOLDING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(HOLDING_SHEET);
    sheet.setTabColor('#0D1B4E');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  // Header
  sheet.getRange(1, 1, 1, 9).merge()
    .setValue('🏢 HOLDING-OVERZICHT — ' + new Date().toLocaleDateString('nl-NL'))
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);

  sheet.getRange(2, 1, 1, 9).merge()
    .setValue('Geconsolideerde KPI\'s over ' + data.beschikbaar.length + ' administraties — ' + new Date().getFullYear())
    .setBackground('#F7F9FC').setFontColor('#5F6B7A').setFontSize(11)
    .setHorizontalAlignment('center');

  // Totalen-banner
  const t = data.totaal;
  const totalRij = [
    'TOTAAL',
    formatBedrag_(t.omzetExcl),
    formatBedrag_(t.kostenExcl),
    formatBedrag_(t.omzetExcl - t.kostenExcl),  // winst
    formatBedrag_(t.btwTeBetalen),
    formatBedrag_(t.debiteurenOpen),
    formatBedrag_(t.crediteurenOpen),
    formatBedrag_(t.banksaldo),
    t.aantalFacturen + ' / ' + t.aantalKosten,
  ];
  sheet.getRange(4, 1, 1, 9).setValues([['Admin', 'Omzet', 'Kosten', 'Winst', 'BTW saldo', 'Debiteuren', 'Crediteuren', 'Banksaldo', '#F / #K']])
    .setBackground('#0D1B4E').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(4);

  sheet.getRange(5, 1, 1, 9).setValues([totalRij])
    .setBackground('#E6F7F4').setFontWeight('bold').setFontSize(11);

  // Per-admin rijen
  let r = 6;
  data.perAdmin.forEach(function(a) {
    const winst = a.omzetExcl - a.kostenExcl;
    sheet.getRange(r, 1, 1, 9).setValues([[
      a.naam,
      formatBedrag_(a.omzetExcl),
      formatBedrag_(a.kostenExcl),
      formatBedrag_(winst),
      formatBedrag_(a.btwTeBetalen),
      formatBedrag_(a.debiteurenOpen),
      formatBedrag_(a.crediteurenOpen),
      formatBedrag_(a.banksaldo),
      a.aantalFacturen + ' / ' + a.aantalKosten,
    ]]).setFontSize(11);
    if ((r - 6) % 2 === 1) sheet.getRange(r, 1, 1, 9).setBackground('#F7F9FC');
    r++;
  });

  // Foutrijen
  if (data.fout.length) {
    r++;
    sheet.getRange(r, 1, 1, 9).merge().setValue('⚠️ ' + data.fout.length + ' admin(s) niet bereikbaar')
      .setBackground('#FFEBEE').setFontColor('#B71C1C').setFontWeight('bold');
    r++;
    data.fout.forEach(function(f) {
      sheet.getRange(r, 1, 1, 9).merge()
        .setValue('• ' + f.ssId + ' — ' + f.fout.slice(0, 100))
        .setFontColor('#B71C1C').setFontSize(11);
      r++;
    });
  }

  // Column widths
  sheet.setColumnWidth(1, 200);
  for (let c = 2; c <= 8; c++) sheet.setColumnWidth(c, 130);
  sheet.setColumnWidth(9, 90);
  sheet.hideGridlines();
  ss.setActiveSheet(sheet);
}

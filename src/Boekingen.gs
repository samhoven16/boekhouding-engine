/**
 * Boekingen.gs
 * Kern van het dubbel boekhoudingssysteem.
 * Beheert journaalposten, grootboeksaldi en boekingslogica.
 */

// ─────────────────────────────────────────────
//  JOURNAALPOST AANMAKEN (HOOFDFUNCTIE)
// ─────────────────────────────────────────────
/**
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} opt - Boeking opties
 *   datum, omschr, dagboek, debet, credit, bedrag,
 *   btwTarief, btwBedrag, ref, projectcode, type, notities, isHoofdpost
 */
function maakJournaalpost_(ss, opt) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  const boekingId = volgendBoekingId_();

  const debetNaam = zoekGrootboekNaam_(opt.debet || '');
  const creditNaam = zoekGrootboekNaam_(opt.credit || '');

  const rij = [
    boekingId,
    opt.datum || new Date(),
    opt.omschr || '',
    opt.dagboek || 'Memoriaal',
    opt.debet || '',
    debetNaam,
    opt.credit || '',
    creditNaam,
    rondBedrag_(opt.bedrag || 0),
    opt.btwTarief !== null && opt.btwTarief !== undefined
      ? (opt.btwTarief * 100) + '%'
      : 'Geen',
    rondBedrag_(opt.btwBedrag || 0),
    opt.ref || '',
    opt.projectcode || '',
    opt.type || BOEKING_TYPE.JOURNAALPOST,
    opt.notities || '',
    new Date(),
  ];

  sheet.appendRow(rij);
  updateGrootboekSaldo_(ss, opt.debet, opt.bedrag || 0, 'debet');
  updateGrootboekSaldo_(ss, opt.credit, opt.bedrag || 0, 'credit');

  return boekingId;
}

// ─────────────────────────────────────────────
//  GROOTBOEKSALDO BIJWERKEN
// ─────────────────────────────────────────────
function updateGrootboekSaldo_(ss, rekeningCode, bedrag, zijde) {
  if (!rekeningCode) return;
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(rekeningCode)) {
      const type = data[i][2]; // Actief / Passief / Opbrengst / Kosten
      let huidigSaldo = parseFloat(data[i][5]) || 0;

      // Dubbel boekhouden regels:
      // Activa: Debet = plus, Credit = min
      // Passiva: Debet = min, Credit = plus
      // Opbrengsten: Debet = min, Credit = plus
      // Kosten: Debet = plus, Credit = min
      const isDebet = zijde === 'debet';

      if (type === 'Actief' || type === 'Kosten') {
        huidigSaldo += isDebet ? bedrag : -bedrag;
      } else {
        huidigSaldo += isDebet ? -bedrag : bedrag;
      }

      sheet.getRange(i + 1, 6).setValue(rondBedrag_(huidigSaldo));
      return;
    }
  }
}

// ─────────────────────────────────────────────
//  GROOTBOEKSALDO OPVRAGEN
// ─────────────────────────────────────────────
function getGrootboekSaldo_(ss, rekeningCode) {
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(rekeningCode)) {
      return parseFloat(data[i][5]) || 0;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────
//  ALLE SALDI HERBEREKENEN (VOLLEDIGE HERBEREKENING)
// ─────────────────────────────────────────────
function herberekeningGrootboekSaldi() {
  const ss = getSpreadsheet_();
  const gbSheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);

  // Reset alle saldi naar 0
  const gbData = gbSheet.getDataRange().getValues();
  for (let i = 1; i < gbData.length; i++) {
    gbSheet.getRange(i + 1, 6).setValue(0);
  }

  // Herbereken op basis van alle journaalposten
  const jpData = jpSheet.getDataRange().getValues();
  for (let i = 1; i < jpData.length; i++) {
    const debet = String(jpData[i][4]);
    const credit = String(jpData[i][6]);
    const bedrag = parseFloat(jpData[i][8]) || 0;

    updateGrootboekSaldo_(ss, debet, bedrag, 'debet');
    updateGrootboekSaldo_(ss, credit, bedrag, 'credit');
  }

  SpreadsheetApp.getUi().alert('Saldi herberekend op basis van alle journaalposten.');
}

// ─────────────────────────────────────────────
//  GROOTBOEKKAART EXPORTEREN (PER REKENING)
// ─────────────────────────────────────────────
function exporteerGrootboekkaart() {
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.prompt(
    'Grootboekkaart',
    'Voer de grootboekrekening code in (bijv. 1100):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const code = resp.getResponseText().trim();
  const naam = zoekGrootboekNaam_(code);
  if (!naam) {
    ui.alert('Rekening ' + code + ' niet gevonden.');
    return;
  }

  genereerGrootboekkaart_(ss, code, naam);
}

function genereerGrootboekkaart_(ss, code, naam) {
  const bladNaam = `GB_${code}`;
  let sheet = ss.getSheetByName(bladNaam);
  if (sheet) {
    sheet.clearContents();
  } else {
    sheet = ss.insertSheet(bladNaam);
  }

  // Koptekst
  sheet.getRange(1, 1, 1, 7).merge()
    .setValue(`Grootboekkaart: ${code} – ${naam}`)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14);

  const headers = ['Datum', 'Omschrijving', 'Dagboek', 'Referentie', 'Debet', 'Credit', 'Saldo'];
  zetHeaderRij_(sheet, headers);
  sheet.setRange = sheet.getRange(2, 1, 1, 7);

  const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  const data = jpSheet.getDataRange().getValues();
  let lopenSaldo = 0;
  let rij = 3;

  for (let i = 1; i < data.length; i++) {
    const debetKode = String(data[i][4]);
    const creditKode = String(data[i][6]);
    const bedrag = parseFloat(data[i][8]) || 0;

    let debet = 0, credit = 0;
    if (debetKode === code) debet = bedrag;
    if (creditKode === code) credit = bedrag;
    if (debet === 0 && credit === 0) continue;

    // Saldo bepalen op basis van rekeningtype
    const type = zoekGrootboekType_(code);
    if (type === 'Actief' || type === 'Kosten') {
      lopenSaldo += debet - credit;
    } else {
      lopenSaldo += credit - debet;
    }

    sheet.getRange(rij, 1, 1, 7).setValues([[
      data[i][1],       // Datum
      data[i][2],       // Omschrijving
      data[i][3],       // Dagboek
      data[i][11],      // Referentie
      debet || '',
      credit || '',
      rondBedrag_(lopenSaldo),
    ]]);

    if (debet > 0) sheet.getRange(rij, 5).setBackground(KLEUREN.POSITIEF);
    if (credit > 0) sheet.getRange(rij, 6).setBackground(KLEUREN.NEGATIEF);
    rij++;
  }

  // Totaalregel
  sheet.getRange(rij, 1, 1, 7).setValues([['TOTAAL', '', '', '', '', '', lopenSaldo]])
    .setFontWeight('bold').setBackground(KLEUREN.SECTIE_BG);

  // Opmaak
  sheet.getRange(3, 5, rij - 2, 3).setNumberFormat('€#,##0.00');
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 250);

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  AFSCHRIJVINGEN BOEKEN
// ─────────────────────────────────────────────
function boekAfschrijvingen() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();

  // Haal vaste activa op uit grootboek
  const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
  const vasteActiva = gbData.filter(r => r[2] === 'Actief' && r[3] === 'Vaste activa' && parseFloat(r[5]) > 0);

  if (vasteActiva.length === 0) {
    ui.alert('Geen vaste activa met positief saldo gevonden.');
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 10px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 4px 6px; border: 1px solid #ccc; }
      th { background: #1A237E; color: white; }
      input[type=number] { width: 80px; }
      .btn { background: #1A237E; color: white; padding: 8px 16px; border: none; cursor: pointer; }
    </style>
    <h3>Afschrijvingen boeken</h3>
    <p>Voer het afschrijvingspercentage per actief in (lineaire methode):</p>
    <form id="form">
      <table>
        <tr><th>Code</th><th>Naam</th><th>Boekwaarde</th><th>Afschr. %/jaar</th></tr>
        ${vasteActiva.filter((r,_,a) => !r[1].includes('Afschrijving')).map(r => `
          <tr>
            <td>${r[0]}</td>
            <td>${r[1]}</td>
            <td>€${parseFloat(r[5]).toFixed(2)}</td>
            <td><input type="number" name="${r[0]}" min="0" max="100" step="0.1" value="20"></td>
          </tr>`).join('')}
      </table>
      <br>
      <label>Boekingsperiode: <select name="periode">
        <option>Jaarlijks</option><option>Maandelijks</option>
      </select></label>
      <br><br>
      <button type="button" class="btn" onclick="submit_()">Afschrijvingen boeken</button>
      <button type="button" onclick="google.script.host.close()" style="margin-left:8px">Annuleren</button>
    </form>
    <script>
      function submit_() {
        const form = document.getElementById('form');
        const data = {};
        new FormData(form).forEach((v, k) => data[k] = v);
        google.script.run.withSuccessHandler(() => {
          alert('Afschrijvingen geboekt!');
          google.script.host.close();
        }).verwerkAfschrijvingen(data);
      }
    </script>
  `).setWidth(600).setHeight(450);

  ui.showModalDialog(html, 'Afschrijvingen');
}

function verwerkAfschrijvingen(data) {
  const ss = getSpreadsheet_();
  const periode = data.periode || 'Jaarlijks';
  const factor = periode === 'Maandelijks' ? 1/12 : 1;
  const datum = new Date();

  Object.keys(data).forEach(code => {
    if (code === 'periode') return;
    const pct = parseFloat(data[code]) / 100;
    if (pct <= 0) return;

    const saldo = getGrootboekSaldo_(ss, code);
    if (saldo <= 0) return;

    const afschrBedrag = rondBedrag_(saldo * pct * factor);
    const naam = zoekGrootboekNaam_(code);

    // Debet afschrijving | Credit gecumuleerde afschrijving
    maakJournaalpost_(ss, {
      datum,
      omschr: `Afschrijving ${naam} (${(pct * 100).toFixed(1)}% ${periode})`,
      dagboek: 'Memoriaal',
      debet: code.startsWith('02') ? '7720' : '7710',
      credit: code.startsWith('01') ? '0190' : '0290',
      bedrag: afschrBedrag,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  });

  vernieuwDashboard();
}

// ─────────────────────────────────────────────
//  DEBITEUREN OVERZICHT
// ─────────────────────────────────────────────
function vernieuwDebiteurenOverzicht() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.DEBITEUREN);
  sheet.clearContents();

  const headers = ['Factuurnummer', 'Datum', 'Vervaldatum', 'Klant', 'Bedrag incl.', 'Betaald', 'Openstaand', 'Dagen over', 'Status'];
  zetHeaderRij_(sheet, headers);

  const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
  const vandaag = new Date();
  let rij = 2;
  let totaalOpen = 0;

  for (let i = 1; i < vfData.length; i++) {
    const status = vfData[i][14];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;

    const incl = parseFloat(vfData[i][12]) || 0;
    const betaald = parseFloat(vfData[i][13]) || 0;
    const open = rondBedrag_(incl - betaald);
    if (open <= 0) continue;

    const vervaldatum = vfData[i][3] ? new Date(vfData[i][3]) : null;
    const dagenOver = vervaldatum ? Math.floor((vandaag - vervaldatum) / (1000 * 60 * 60 * 24)) : 0;

    sheet.appendRow([
      vfData[i][1],  // Factuurnummer
      vfData[i][2],  // Datum
      vervaldatum,   // Vervaldatum
      vfData[i][5],  // Klant
      incl,
      betaald,
      open,
      dagenOver > 0 ? dagenOver : 0,
      status,
    ]);

    if (dagenOver > 0) {
      sheet.getRange(rij, 1, 1, 9).setBackground('#FFEBEE');
    }

    totaalOpen += open;
    rij++;
  }

  // Totaalregel
  sheet.appendRow(['', '', '', 'TOTAAL OPENSTAAND', '', '', totaalOpen, '', ''])
    .setFontWeight('bold');
  sheet.getRange(rij, 5, 1, 3).setBackground(KLEUREN.SECTIE_BG);
  sheet.getRange(2, 5, rij - 1, 3).setNumberFormat('€#,##0.00');
}

// ─────────────────────────────────────────────
//  CREDITEUREN OVERZICHT
// ─────────────────────────────────────────────
function vernieuwCrediteurenOverzicht() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.CREDITEUREN);
  sheet.clearContents();

  const headers = ['Intern nr.', 'Factuurdatum', 'Leverancier', 'Factuurref.', 'Bedrag incl.', 'Status', 'Openstaand'];
  zetHeaderRij_(sheet, headers);

  const ifData = ss.getSheetByName(SHEETS.INKOOPFACTUREN).getDataRange().getValues();
  let rij = 2;
  let totaalOpen = 0;

  for (let i = 1; i < ifData.length; i++) {
    const status = ifData[i][12];
    if (status === FACTUUR_STATUS.BETAALD) continue;

    const incl = parseFloat(ifData[i][11]) || 0;
    totaalOpen += incl;

    sheet.appendRow([
      ifData[i][1],  // Intern nummer
      ifData[i][3],  // Factuurdatum
      ifData[i][6],  // Leverancier
      ifData[i][4],  // Factuurref
      incl,
      status,
      incl,
    ]);
    rij++;
  }

  sheet.appendRow(['', '', 'TOTAAL TE BETALEN', '', '', '', totaalOpen])
    .setFontWeight('bold');
  sheet.getRange(2, 5, rij - 1, 3).setNumberFormat('€#,##0.00');
}

// ─────────────────────────────────────────────
//  TRANSACTIES KOPPELEN AAN FACTUREN
// ─────────────────────────────────────────────
function koppelTransactiesAanFacturen() {
  const ss = getSpreadsheet_();
  const btData = ss.getSheetByName(SHEETS.BANKTRANSACTIES).getDataRange().getValues();
  let gekoppeld = 0;

  for (let i = 1; i < btData.length; i++) {
    if (btData[i][10]) continue; // Al gekoppeld
    const ref = String(btData[i][8] || '');
    const bedrag = Math.abs(parseFloat(btData[i][3]) || 0);
    const isOntvangst = parseFloat(btData[i][3]) > 0;

    if (!ref) continue;

    const datum = btData[i][1] ? new Date(btData[i][1]) : new Date();
    koppelBankTransactieAanFactuur_(ss, btData[i][0], ref, bedrag, isOntvangst, datum);
    gekoppeld++;
  }

  SpreadsheetApp.getUi().alert(`${gekoppeld} transacties verwerkt voor koppeling.`);
  vernieuwDebiteurenOverzicht();
  vernieuwCrediteurenOverzicht();
}

// ─────────────────────────────────────────────
//  HELPERS NUMMERING
// ─────────────────────────────────────────────
function volgendFactuurnummer_() {
  const props = PropertiesService.getScriptProperties();
  let nr = parseInt(props.getProperty(PROP.VOLGEND_FACTUUR_NR) || '1');
  props.setProperty(PROP.VOLGEND_FACTUUR_NR, String(nr + 1));
  return nr;
}

function volgendInkoopNummer_() {
  const props = PropertiesService.getScriptProperties();
  let nr = parseInt(props.getProperty(PROP.VOLGEND_INKOOP_NR) || '1');
  props.setProperty(PROP.VOLGEND_INKOOP_NR, String(nr + 1));
  return nr;
}

function volgendBoekingId_() {
  const props = PropertiesService.getScriptProperties();
  let nr = parseInt(props.getProperty(PROP.VOLGEND_BOEKING_NR) || '1');
  props.setProperty(PROP.VOLGEND_BOEKING_NR, String(nr + 1));
  return 'BK' + String(nr).padStart(6, '0');
}

function volgendTransactieId_() {
  const props = PropertiesService.getScriptProperties();
  const sleutel = 'volgendTransactieId';
  let nr = parseInt(props.getProperty(sleutel) || '1');
  props.setProperty(sleutel, String(nr + 1));
  return 'TR' + String(nr).padStart(6, '0');
}

function volgendRelatieId_() {
  const props = PropertiesService.getScriptProperties();
  const sleutel = 'volgendRelatieId';
  let nr = parseInt(props.getProperty(sleutel) || '1');
  props.setProperty(sleutel, String(nr + 1));
  return 'REL' + String(nr).padStart(4, '0');
}

// ─────────────────────────────────────────────
//  HELPERS GROOTBOEK OPZOEKEN
// ─────────────────────────────────────────────
function zoekGrootboekNaam_(code) {
  const item = STANDAARD_GROOTBOEK.find(r => r.code === String(code));
  return item ? item.naam : (code || '');
}

function zoekGrootboekType_(code) {
  const item = STANDAARD_GROOTBOEK.find(r => r.code === String(code));
  return item ? item.type : 'Onbekend';
}

function zoekGrootboekBwType_(code) {
  const item = STANDAARD_GROOTBOEK.find(r => r.code === String(code));
  return item ? item.bw : '';
}

// ─────────────────────────────────────────────
//  HELPERS RELATIES
// ─────────────────────────────────────────────
function zoekOfMaakRelatie_(ss, naam, type, email) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === naam.toLowerCase()) {
      // Sla e-mail op als die nog niet bekend was (kolom 11 = index 10)
      if (email && !data[i][10]) {
        sheet.getRange(i + 1, 11).setValue(email);
      }
      return data[i][0]; // Relatie ID
    }
  }

  // Maak nieuwe relatie aan
  const id = volgendRelatieId_();
  sheet.appendRow([
    id, type, naam, '', '', '', '', 'Nederland',
    '', '', email || '', '', '', 30, '21% (hoog)', '', 'Ja', '', new Date()
  ]);
  return id;
}

// ─────────────────────────────────────────────
//  BTW REKENING HELPERS
// ─────────────────────────────────────────────
function bepaalOmzetRekening_(btwLabel) {
  if (!btwLabel) return '8000';
  if (btwLabel.includes('21')) return '8000';
  if (btwLabel.includes('9')) return '8010';
  if (btwLabel.includes('0%') || btwLabel.includes('nultarief')) return '8020';
  if (btwLabel.includes('Vrijgesteld')) return '8030';
  if (btwLabel.includes('Verlegd')) return '8040';
  return '8000';
}

function bepaalBtwVerkoopRekening_(btwLabel) {
  if (!btwLabel) return '4110';
  if (btwLabel.includes('21')) return '4110';
  if (btwLabel.includes('9')) return '4120';
  return '4100';
}

function bepaalBtwVoorbelastingRekening_(btwLabel) {
  if (!btwLabel) return '1410';
  if (btwLabel.includes('21')) return '1410';
  if (btwLabel.includes('9')) return '1420';
  return '1400';
}

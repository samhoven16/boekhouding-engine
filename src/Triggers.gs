/**
 * Triggers.gs
 * Verwerkt Google Form submissions en dagelijkse taken.
 * Elke onFormSubmit handler vertaalt formulierdata naar boekingen.
 */

// ─────────────────────────────────────────────
//  1. VERKOOPFACTUUR FORMULIER
// ─────────────────────────────────────────────
function verwerkVerkoopfactuurFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const factuurNr = volgendFactuurnummer_();
    const datum = data['Factuurdatum'] ? new Date(data['Factuurdatum']) : new Date();
    const termijn = parseInt(data['Betalingstermijn (dagen)'] || '30');
    const vervaldatum = new Date(datum.getTime() + termijn * 24 * 60 * 60 * 1000);

    // Factuurregels berekenen
    let totalExcl = 0;
    let totalBtw = 0;
    const regels = [];

    for (let i = 1; i <= 3; i++) {
      const omschr = data[`Factuurregel ${i} – Omschrijving`];
      const aantal = parseFloat(data[`Factuurregel ${i} – Aantal`] || '0');
      const prijs = parseBedrag_(data[`Factuurregel ${i} – Prijs per eenheid (excl. BTW)`] || '0');
      if (!omschr || aantal === 0) continue;
      const regelBedrag = rondBedrag_(aantal * prijs);
      regels.push({ omschr, aantal, prijs, totaal: regelBedrag });
      totalExcl += regelBedrag;
    }

    const btwTarief = parseBtwTarief_(data['BTW tarief'] || '21% (hoog)');
    totalBtw = btwTarief !== null ? rondBedrag_(totalExcl * btwTarief) : 0;
    const totalIncl = rondBedrag_(totalExcl + totalBtw);

    const klantnaam = data['Klantnaam'] || '';
    const klantId = zoekOfMaakRelatie_(ss, klantnaam, RELATIE_TYPE.KLANT);

    // Hoofdregel in Verkoopfacturen tabblad
    const factuurData = [
      factuurNr,                              // Factuur ID
      getInstelling_('Factuurprefix') + factuurNr, // Factuurnummer
      datum,                                  // Datum
      vervaldatum,                            // Vervaldatum
      klantId,                                // Klant ID
      klantnaam,                              // Klantnaam
      data['KvK-nummer klant'] || '',
      data['BTW-nummer klant'] || '',
      regels.map(r => r.omschr).join('; '),   // Omschrijving
      totalExcl,                              // Bedrag excl.
      btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld',
      totalBtw,                               // BTW bedrag
      totalIncl,                              // Bedrag incl.
      0,                                      // Betaald bedrag
      FACTUUR_STATUS.CONCEPT,                 // Status
      '',                                     // Betaaldatum
      '',                                     // Betalingsreferentie
      data['Projectcode / Referentie'] || '',
      data['Notities / bijzonderheden'] || '',
      '',                                     // PDF URL (later)
      bepaalOmzetRekening_(data['BTW tarief']),
      new Date(),
      Session.getActiveUser().getEmail(),
    ];

    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    vfSheet.appendRow(factuurData);

    // Journaalposten aanmaken (dubbel boekhouden)
    const boekingRef = factuurNr;
    const omschr = `Verkoopfactuur ${getInstelling_('Factuurprefix')}${factuurNr} – ${klantnaam}`;

    // Debet: Debiteuren | Credit: Omzet
    maakJournaalpost_(ss, {
      datum, omschr,
      dagboek: 'Verkoopboek',
      debet: '1100', credit: bepaalOmzetRekening_(data['BTW tarief']),
      bedrag: totalExcl,
      btwTarief: btwTarief,
      btwBedrag: 0,
      ref: boekingRef,
      type: BOEKING_TYPE.VERKOOPFACTUUR,
    });

    // Als BTW van toepassing
    if (totalBtw > 0) {
      maakJournaalpost_(ss, {
        datum, omschr: omschr + ' (BTW)',
        dagboek: 'Verkoopboek',
        debet: '1100', credit: bepaalBtwVerkoopRekening_(data['BTW tarief']),
        bedrag: totalBtw,
        btwTarief: btwTarief,
        btwBedrag: totalBtw,
        ref: boekingRef,
        type: BOEKING_TYPE.VERKOOPFACTUUR,
      });
    }

    // Voeg volledige boeking toe (debet totaal incl.)
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (totaal)',
      dagboek: 'Verkoopboek',
      debet: '1100', credit: '1100',
      bedrag: totalIncl,
      ref: boekingRef,
      type: BOEKING_TYPE.VERKOOPFACTUUR,
      isHoofdpost: true,
    });

    // Genereer PDF en stuur e-mail
    Utilities.sleep(500);
    const pdfUrl = genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, data);

    // Sla PDF URL op
    if (pdfUrl) {
      const rijen = vfSheet.getDataRange().getValues();
      for (let i = 1; i < rijen.length; i++) {
        if (rijen[i][0] == factuurNr) {
          vfSheet.getRange(i + 1, 20).setValue(pdfUrl);
          break;
        }
      }
    }

    // Dashboard vernieuwen
    vernieuwDashboard();

    Logger.log(`Verkoopfactuur ${factuurNr} aangemaakt voor ${klantnaam}`);

  } catch (err) {
    Logger.log('Fout verwerkVerkoopfactuurFormulier: ' + err.message + '\n' + err.stack);
    stuurFoutEmail_('Verkoopfactuur verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  2. INKOOPFACTUUR FORMULIER
// ─────────────────────────────────────────────
function verwerkInkoopfactuurFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inkoopNr = volgendInkoopNummer_();
    const datum = data['Factuurdatum'] ? new Date(data['Factuurdatum']) : new Date();
    const leverancier = data['Leveranciernaam'] || '';
    const leverancierId = zoekOfMaakRelatie_(ss, leverancier, RELATIE_TYPE.LEVERANCIER);

    const bedragExcl = parseBedrag_(data['Bedrag excl. BTW'] || '0');
    const btwTarief = parseBtwTarief_(data['BTW tarief'] || '21% (hoog)');
    let btwBedrag = parseBedrag_(data['BTW bedrag'] || '0');

    // Als BTW bedrag niet ingevuld, zelf berekenen
    if (btwBedrag === 0 && btwTarief !== null) {
      btwBedrag = rondBedrag_(bedragExcl * btwTarief);
    }
    const bedragIncl = rondBedrag_(bedragExcl + btwBedrag);

    const kostenRekCode = (data['Kostenrekening (grootboek)'] || '').split(' – ')[0];

    const inkoopData = [
      inkoopNr,
      'IK' + inkoopNr,
      new Date(),
      datum,
      data['Factuurnummer leverancier'] || '',
      leverancierId,
      leverancier,
      data['Omschrijving'] || '',
      bedragExcl,
      btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld',
      btwBedrag,
      bedragIncl,
      FACTUUR_STATUS.CONCEPT,
      '',
      '',
      kostenRekCode,
      data['Projectcode / Referentie'] || '',
      data['Notities'] || '',
      '',
      new Date(),
    ];

    ss.getSheetByName(SHEETS.INKOOPFACTUREN).appendRow(inkoopData);

    // Journaalpost: Kosten + BTW voorbelasting | Credit: Crediteuren
    const omschr = `Inkoopfactuur ${data['Factuurnummer leverancier'] || inkoopNr} – ${leverancier}`;

    maakJournaalpost_(ss, {
      datum, omschr,
      dagboek: 'Inkoopboek',
      debet: kostenRekCode || '7990', credit: '4000',
      bedrag: bedragExcl,
      ref: 'IK' + inkoopNr,
      type: BOEKING_TYPE.INKOOPFACTUUR,
    });

    if (btwBedrag > 0) {
      maakJournaalpost_(ss, {
        datum, omschr: omschr + ' (BTW voorbelasting)',
        dagboek: 'Inkoopboek',
        debet: bepaalBtwVoorbelastingRekening_(data['BTW tarief']),
        credit: '4000',
        bedrag: btwBedrag,
        btwBedrag: btwBedrag,
        ref: 'IK' + inkoopNr,
        type: BOEKING_TYPE.INKOOPFACTUUR,
      });
    }

    vernieuwDashboard();
    Logger.log(`Inkoopfactuur ${inkoopNr} geregistreerd voor ${leverancier}`);

  } catch (err) {
    Logger.log('Fout verwerkInkoopfactuurFormulier: ' + err.message);
    stuurFoutEmail_('Inkoopfactuur verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  3. BANKTRANSACTIE FORMULIER
// ─────────────────────────────────────────────
function verwerkBanktransactieFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transactieId = volgendTransactieId_();
    const datum = data['Transactiedatum'] ? new Date(data['Transactiedatum']) : new Date();
    const type = data['Type transactie'] || 'Betaling (af)';
    const bedrag = parseBedrag_(data['Bedrag'] || '0');
    const isOntvangst = type.includes('Ontvangst');
    const bedragGesigneerd = isOntvangst ? bedrag : -bedrag;

    const rekeningCode = (data['Bankrekening'] || '1200 – Bank zakelijk').split(' – ')[0];
    const grootboekCode = (data['Grootboekrekening'] || '').split(' – ')[0];

    const transactieData = [
      transactieId,
      datum,
      data['Omschrijving / betalingskenmerk'] || '',
      bedragGesigneerd,
      type,
      rekeningCode,
      data['Tegenrekening (IBAN)'] || '',
      data['Tegenpartij (naam)'] || '',
      data['Referentie (factuurnummer)'] || '',
      grootboekCode,
      '',  // Gekoppeld aan
      '',  // Gekoppeld factuur
      'Verwerkt',
      data['Notities'] || '',
      new Date(),
    ];

    ss.getSheetByName(SHEETS.BANKTRANSACTIES).appendRow(transactieData);

    // Journaalpost aanmaken
    const omschr = data['Omschrijving / betalingskenmerk'] || 'Banktransactie';
    const debet = isOntvangst ? rekeningCode : grootboekCode;
    const credit = isOntvangst ? grootboekCode : rekeningCode;

    if (debet && credit) {
      maakJournaalpost_(ss, {
        datum, omschr,
        dagboek: 'Bankboek',
        debet, credit,
        bedrag,
        ref: data['Referentie (factuurnummer)'] || transactieId,
        type: isOntvangst ? BOEKING_TYPE.BANKONTVANGST : BOEKING_TYPE.BANKBETALING,
      });
    }

    // Probeer te koppelen aan openstaande factuur
    const ref = data['Referentie (factuurnummer)'] || '';
    if (ref) {
      koppelBankTransactieAanFactuur_(ss, transactieId, ref, bedrag, isOntvangst, datum);
    }

    vernieuwDashboard();

  } catch (err) {
    Logger.log('Fout verwerkBanktransactieFormulier: ' + err.message);
    stuurFoutEmail_('Banktransactie verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  4. RELATIE FORMULIER
// ─────────────────────────────────────────────
function verwerkRelatieFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const relatieId = volgendRelatieId_();

    const relatieData = [
      relatieId,
      data['Type relatie'] || RELATIE_TYPE.KLANT,
      data['Bedrijfsnaam'] || '',
      data['Contactpersoon'] || '',
      data['Straat en huisnummer'] || '',
      data['Postcode'] || '',
      data['Plaats'] || '',
      data['Land'] || 'Nederland',
      data['KvK-nummer'] || '',
      data['BTW-nummer'] || '',
      data['E-mailadres'] || '',
      data['Telefoonnummer'] || '',
      data['IBAN'] || '',
      parseInt(data['Betalingstermijn (dagen)'] || '30'),
      '21% (hoog)',
      '',
      'Ja',
      data['Notities'] || '',
      new Date(),
    ];

    ss.getSheetByName(SHEETS.RELATIES).appendRow(relatieData);
    Logger.log(`Relatie ${relatieId} aangemaakt: ${data['Bedrijfsnaam']}`);

  } catch (err) {
    Logger.log('Fout verwerkRelatieFormulier: ' + err.message);
  }
}

// ─────────────────────────────────────────────
//  5. JOURNAALPOST FORMULIER
// ─────────────────────────────────────────────
function verwerkJournaalpostFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const datum = data['Boekingsdatum'] ? new Date(data['Boekingsdatum']) : new Date();
    const bedrag = parseBedrag_(data['Bedrag (excl. BTW)'] || '0');
    const btwKeuze = data['BTW tarief'] || 'Geen BTW';
    const btwTarief = btwKeuze === 'Geen BTW' ? null : parseBtwTarief_(btwKeuze);
    const btwBedrag = btwTarief !== null ? rondBedrag_(bedrag * btwTarief) : 0;

    const debetCode = (data['Debet rekening'] || '').split(' – ')[0];
    const creditCode = (data['Credit rekening'] || '').split(' – ')[0];

    maakJournaalpost_(ss, {
      datum,
      omschr: data['Omschrijving'] || '',
      dagboek: data['Dagboek'] || 'Memoriaal',
      debet: debetCode,
      credit: creditCode,
      bedrag,
      btwTarief,
      btwBedrag,
      ref: data['Referentie'] || '',
      projectcode: data['Projectcode'] || '',
      type: BOEKING_TYPE.JOURNAALPOST,
      notities: data['Notities'] || '',
    });

    vernieuwDashboard();

  } catch (err) {
    Logger.log('Fout verwerkJournaalpostFormulier: ' + err.message);
  }
}

// ─────────────────────────────────────────────
//  DAGELIJKSE TAKEN (TIMER TRIGGER)
// ─────────────────────────────────────────────
function dagelijkseTaken() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Vervallen facturen markeren
  markeerVervallenFacturen_(ss);

  // Betalingsherinneringen sturen (optioneel)
  const herinneringen = getInstelling_('BTW aangifte herinnering');
  if (herinneringen === 'Ja') {
    controleerBtwDeadlines_();
  }

  // Dashboard vernieuwen
  vernieuwDashboard();

  Logger.log('Dagelijkse taken uitgevoerd: ' + new Date());
}

// ─────────────────────────────────────────────
//  HELPERS TRIGGERS
// ─────────────────────────────────────────────
function koppelBankTransactieAanFactuur_(ss, transactieId, ref, bedrag, isOntvangst, datum) {
  if (isOntvangst) {
    // Zoek open verkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][1]); // Factuurnummer
      if (fnr.includes(ref) || ref.includes(fnr)) {
        const openstaand = data[i][12] - data[i][13]; // incl - betaald
        const nieuwBetaald = rondBedrag_(data[i][13] + Math.min(bedrag, openstaand));
        const nieuwStatus = nieuwBetaald >= data[i][12]
          ? FACTUUR_STATUS.BETAALD
          : FACTUUR_STATUS.DEELS_BETAALD;
        sheet.getRange(i + 1, 14).setValue(nieuwBetaald);   // Betaald bedrag
        sheet.getRange(i + 1, 15).setValue(nieuwStatus);    // Status
        if (nieuwStatus === FACTUUR_STATUS.BETAALD) {
          sheet.getRange(i + 1, 16).setValue(datum);        // Betaaldatum

          // Debiteuren → Bank journaalpost
          maakJournaalpost_(ss, {
            datum,
            omschr: `Ontvangst factuur ${fnr}`,
            dagboek: 'Bankboek',
            debet: '1200', credit: '1100',
            bedrag: nieuwBetaald,
            ref: fnr,
            type: BOEKING_TYPE.BANKONTVANGST,
          });
        }
        break;
      }
    }
  } else {
    // Zoek open inkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][4]); // Factuurref leverancier
      if (fnr.includes(ref) || ref.includes(fnr)) {
        sheet.getRange(i + 1, 13).setValue(FACTUUR_STATUS.BETAALD);
        sheet.getRange(i + 1, 14).setValue(datum);

        // Crediteuren → Bank journaalpost
        maakJournaalpost_(ss, {
          datum,
          omschr: `Betaling factuur ${fnr}`,
          dagboek: 'Bankboek',
          debet: '4000', credit: '1200',
          bedrag,
          ref: fnr,
          type: BOEKING_TYPE.BANKBETALING,
        });
        break;
      }
    }
  }
}

function markeerVervallenFacturen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  for (let i = 1; i < data.length; i++) {
    const status = data[i][14];
    const vervaldatum = data[i][3];
    if (status === FACTUUR_STATUS.VERZONDEN && vervaldatum && new Date(vervaldatum) < vandaag) {
      sheet.getRange(i + 1, 15).setValue(FACTUUR_STATUS.VERVALLEN);
      sheet.getRange(i + 1, 15).setBackground('#FFCDD2');
    }
  }
}

function controleerBtwDeadlines_() {
  const vandaag = new Date();
  const maand = vandaag.getMonth() + 1;
  const btwDeadlines = [31, 60, 91, 122]; // Deadlines per kwartaal (dag van het jaar)

  // Stuur herinnering als we binnen 14 dagen van een BTW deadline zitten
  [1, 4, 7, 10].forEach(maandStart => {
    const deadline = new Date(vandaag.getFullYear(), maandStart + 1, 28); // Einde volgende maand
    const dagenTot = Math.floor((deadline - vandaag) / (1000 * 60 * 60 * 24));
    if (dagenTot > 0 && dagenTot <= 14) {
      const kwartaal = Math.ceil(maandStart / 3);
      const email = getInstelling_('Email rapporten naar');
      if (email) {
        GmailApp.sendEmail(email,
          `Herinnering: BTW aangifte Q${kwartaal} deadline over ${dagenTot} dagen`,
          `Beste,\n\nDe deadline voor uw BTW aangifte Q${kwartaal} is ${formatDatum_(deadline)}.\n\n` +
          `Genereer uw aangifte via: Boekhouding → BTW → BTW aangifte Q${kwartaal}\n\n` +
          `Met vriendelijke groet,\nUw boekhoudprogramma`
        );
      }
    }
  });
}

function stuurFoutEmail_(context, err) {
  try {
    const email = getInstelling_('Email rapporten naar');
    if (email) {
      GmailApp.sendEmail(email,
        `Fout in boekhoudprogramma: ${context}`,
        `Er is een fout opgetreden bij het verwerken van: ${context}\n\nFoutmelding: ${err.message}\n\nStack: ${err.stack}`
      );
    }
  } catch(e) {
    Logger.log('Kon fout email niet sturen: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  HERINNERINGEN HANDMATIG STUREN
// ─────────────────────────────────────────────
function stuurBetalingsherinneringen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  let aantalVerstuurd = 0;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][14];
    const email = ''; // Haal e-mail op uit relaties
    const klantId = data[i][4];

    if (status !== FACTUUR_STATUS.VERVALLEN && status !== FACTUUR_STATUS.VERZONDEN) continue;

    const klantEmail = haalRelatieEmail_(ss, klantId);
    if (!klantEmail) continue;

    const fnr = data[i][1];
    const bedragOpen = rondBedrag_(data[i][12] - data[i][13]);
    const vervaldatum = data[i][3];

    GmailApp.sendEmail(klantEmail,
      `Betalingsherinnering factuur ${fnr}`,
      `Geachte klant,\n\nWij herinneren u vriendelijk aan de openstaande factuur:\n\n` +
      `Factuurnummer: ${fnr}\nVervaldatum: ${formatDatum_(vervaldatum)}\nOpenstaand bedrag: ${formatBedrag_(bedragOpen)}\n\n` +
      `Wilt u dit bedrag zo spoedig mogelijk overmaken naar ${getInstelling_('Bankrekening op factuur')}?\n\n` +
      `Met vriendelijke groet,\n${getInstelling_('Bedrijfsnaam')}`
    );
    aantalVerstuurd++;
  }

  SpreadsheetApp.getUi().alert(`${aantalVerstuurd} herinneringen verstuurd.`);
}

function haalRelatieEmail_(ss, relatieId) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == relatieId) return data[i][10]; // E-mailadres kolom
  }
  return null;
}

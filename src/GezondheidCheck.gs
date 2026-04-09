/**
 * GezondheidCheck.gs
 * Automatische validatie van de boekhouding — geeft rust en voorkomt fouten.
 *
 * WERKELIJKE PIJN die dit oplost:
 *  - "Onzekerheid over fouten/boetes" (Moneybird BTW) → valideer alles
 *  - "Geen controle/overzicht" (Excel chaos) → geef een score
 *  - "Black box" (Yuki AI) → leg uit wat er mis is
 *  - "Compliance risico" (Wave) → controleer NL-specifieke regels
 *  - "Geen vertrouwen" (e-boekhouden oud UI) → geef vertrouwen door inzicht
 *
 * CHECKLIST:
 *  1. Balans klopt (activa = passiva + eigen vermogen)
 *  2. Alle journaalposten hebben debet ≠ credit rekening
 *  3. Geen negatieve bedragen in facturen
 *  4. BTW rekensommen kloppen
 *  5. Geen boekingen in afgesloten periodes
 *  6. Alle verkoopfacturen hebben een klant + bedrag
 *  7. Geen duplicaat factuurnummers
 *  8. KOR-status consistent met omzet
 *  9. Ontvangen betalingen zijn gekoppeld aan facturen
 * 10. Vervaldatums zijn realistisch (niet > 180 dagen)
 */

// ─────────────────────────────────────────────
//  HOOFDFUNCTIE: VOLLEDIGE CHECK
// ─────────────────────────────────────────────

function voerGezondheidCheckUit() {
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  ui.alert('Even geduld...', 'De gezondheidscheck wordt uitgevoerd. Dit duurt een paar seconden.', ui.ButtonSet.OK);

  const resultaten = [];
  let aantalFouten   = 0;
  let aantalWaarsch  = 0;
  let aantalOk       = 0;

  // ── Check 1: Balans ────────────────────────────────────────────────────
  const balansCheck = controleerBalans_(ss);
  resultaten.push(balansCheck);
  if (balansCheck.status === 'FOUT')    aantalFouten++;
  else if (balansCheck.status === 'OK') aantalOk++;
  else aantalWaarsch++;

  // ── Check 2: Journaalposten ───────────────────────────────────────────
  const jpChecks = controleerJournaalposten_(ss);
  jpChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 3: Verkoopfacturen ──────────────────────────────────────────
  const vfChecks = controleerVerkoopfacturen_(ss);
  vfChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 4: BTW ──────────────────────────────────────────────────────
  const btwCheck = controleerBtwConsistentie_(ss);
  resultaten.push(btwCheck);
  if (btwCheck.status === 'FOUT') aantalFouten++;
  else if (btwCheck.status === 'OK') aantalOk++;
  else aantalWaarsch++;

  // ── Check 5: Instellingen ─────────────────────────────────────────────
  const instellingChecks = controleerInstellingen_();
  instellingChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 6: TAX-BTW-001 — BTW aangifte deadline ─────────────────────
  const btwDeadlineCheck = controleerTaxBtwDeadlineCheck_();
  resultaten.push(btwDeadlineCheck);
  if (btwDeadlineCheck.status === 'FOUT')        aantalFouten++;
  else if (btwDeadlineCheck.status === 'OK')     aantalOk++;
  else                                            aantalWaarsch++;

  // ── Check 7: TAX-ADM-001 — Bewaarplicht administratie ────────────────
  const bewaarplichtCheck = controleerTaxAdmBewaarplichtCheck_();
  resultaten.push(bewaarplichtCheck);
  if (bewaarplichtCheck.status === 'FOUT')       aantalFouten++;
  else if (bewaarplichtCheck.status === 'OK')    aantalOk++;
  else                                            aantalWaarsch++;

  // ── Gezondheidscore ───────────────────────────────────────────────────
  const totaal = aantalFouten + aantalWaarsch + aantalOk;
  const score  = totaal > 0 ? Math.round(((aantalOk + aantalWaarsch * 0.5) / totaal) * 100) : 100;

  // Schrijf resultaten naar tabblad
  schrijfGezondheidCheckResultaten_(ss, resultaten, score, aantalFouten, aantalWaarsch, aantalOk);

  // Slotbericht
  const emoticon = score >= 90 ? '✅' : score >= 70 ? '⚠️' : '❌';
  const boodschap = score >= 90
    ? 'Uw boekhouding ziet er goed uit! Kleine aandachtspunten zijn opgeslagen.'
    : score >= 70
      ? 'Er zijn enkele aandachtspunten. Bekijk de details voor actie.'
      : 'Er zijn fouten gevonden die u aandacht verdienen. Bekijk de details.';

  ui.alert(
    `${emoticon} Gezondheidscheck — Score: ${score}/100`,
    `${boodschap}\n\n` +
    `✅ In orde:          ${aantalOk}\n` +
    `⚠️  Aandachtspunten: ${aantalWaarsch}\n` +
    `❌ Fouten:           ${aantalFouten}\n\n` +
    `De details staan in het tabblad "Gezondheidscheck".`,
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  CHECK 1: BALANS KLOPT
// ─────────────────────────────────────────────

function controleerBalans_(ss) {
  try {
    const gbData = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA).getDataRange().getValues();
    let totaalActiva  = 0;
    let totaalPassiva = 0;

    for (let i = 1; i < gbData.length; i++) {
      const type  = gbData[i][2];
      const bw    = gbData[i][4];
      const saldo = parseFloat(gbData[i][5]) || 0;
      if (bw !== 'Balans') continue;

      if (type === 'Actief')  totaalActiva  += saldo;
      if (type === 'Passief') totaalPassiva += saldo;
    }

    // Resultaat boekjaar telt mee als passiva (tijdelijk in passiva/EV)
    const verschil = rondBedrag_(Math.abs(totaalActiva - totaalPassiva));

    if (verschil < 1) {
      return { check: 'Balans', status: 'OK', bericht: `Activa en passiva zijn in evenwicht (${formatBedrag_(totaalActiva)}).` };
    } else {
      return {
        check: 'Balans',
        status: 'WAARSCHUWING',
        bericht: `Verschil van ${formatBedrag_(verschil)} tussen activa (${formatBedrag_(totaalActiva)}) en passiva (${formatBedrag_(totaalPassiva)}). Controleer openingssaldi of ontbrekende boekingen. Dit kan normaal zijn als het boekjaar nog loopt.`,
      };
    }
  } catch (e) {
    return { check: 'Balans', status: 'FOUT', bericht: 'Kon balans niet controleren: ' + e.message };
  }
}

// ─────────────────────────────────────────────
//  CHECK 2: JOURNAALPOSTEN
// ─────────────────────────────────────────────

function controleerJournaalposten_(ss) {
  const resultaten = [];

  try {
    const data = ss.getSheetByName(SHEETS.JOURNAALPOSTEN).getDataRange().getValues();

    let aantalPosten     = data.length - 1;
    let zelfboekingen    = 0;
    let nulBedragen      = 0;
    let toekomstDatums   = 0;
    const vandaag = new Date();

    for (let i = 1; i < data.length; i++) {
      const debet  = String(data[i][4] || '');
      const credit = String(data[i][6] || '');
      const bedrag = parseFloat(data[i][8]) || 0;
      const datum  = data[i][1] ? new Date(data[i][1]) : null;

      // Zelfde rekening op debet én credit = fout
      if (debet && credit && debet === credit) zelfboekingen++;
      // Nulbedrag = verdacht
      if (bedrag === 0) nulBedragen++;
      // Toekomstige datum = verdacht
      if (datum && datum > vandaag) toekomstDatums++;
    }

    resultaten.push({
      check: 'Journaalposten – Totaal',
      status: 'OK',
      bericht: `${aantalPosten} journaalposten gevonden.`,
    });

    if (zelfboekingen > 0) {
      resultaten.push({
        check: 'Journaalposten – Zelfboekingen',
        status: 'FOUT',
        bericht: `${zelfboekingen} journaalpost(en) hebben dezelfde rekening op debet én credit. Dit is altijd fout — dezelfde rekening kan niet tegelijkertijd debet en credit zijn.`,
      });
    } else {
      resultaten.push({ check: 'Journaalposten – Zelfboekingen', status: 'OK', bericht: 'Geen zelfboekingen gevonden.' });
    }

    if (nulBedragen > 0) {
      resultaten.push({
        check: 'Journaalposten – Nulbedragen',
        status: 'WAARSCHUWING',
        bericht: `${nulBedragen} journaalpost(en) met bedrag €0,00. Controleer of dit correct is.`,
      });
    }

    if (toekomstDatums > 0) {
      resultaten.push({
        check: 'Journaalposten – Toekomstige datums',
        status: 'WAARSCHUWING',
        bericht: `${toekomstDatums} journaalpost(en) met een datum in de toekomst. Controleer of dit bedoeld is.`,
      });
    }

  } catch (e) {
    resultaten.push({ check: 'Journaalposten', status: 'FOUT', bericht: 'Fout bij controleren: ' + e.message });
  }

  return resultaten;
}

// ─────────────────────────────────────────────
//  CHECK 3: VERKOOPFACTUREN
// ─────────────────────────────────────────────

function controleerVerkoopfacturen_(ss) {
  const resultaten = [];

  try {
    const data = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
    const nummers = {};
    let duplicaten    = 0;
    let geenKlant     = 0;
    let negatiefBedrag = 0;
    let vervallenOpen  = 0;
    const vandaag = new Date();

    for (let i = 1; i < data.length; i++) {
      const nr      = String(data[i][1] || '');
      const klant   = String(data[i][5] || '').trim();
      const bedrag  = parseFloat(data[i][12]) || 0;
      const status  = String(data[i][14] || '');
      const vervalD = data[i][3] ? new Date(data[i][3]) : null;

      if (nr) {
        if (nummers[nr]) duplicaten++;
        else nummers[nr] = true;
      }
      if (!klant) geenKlant++;
      if (bedrag < 0) negatiefBedrag++;
      if (vervalD && vervalD < vandaag && status !== FACTUUR_STATUS.BETAALD && status !== FACTUUR_STATUS.GECREDITEERD) {
        vervallenOpen++;
      }
    }

    if (duplicaten > 0) {
      resultaten.push({ check: 'Facturen – Duplicaat nummers', status: 'FOUT',
        bericht: `${duplicaten} factuurnummer(s) komen meerdere keren voor. Dit is niet toegestaan — elk factuurnummer moet uniek zijn (wettelijk vereist).` });
    } else {
      resultaten.push({ check: 'Facturen – Unieke nummers', status: 'OK', bericht: 'Alle factuurnummers zijn uniek.' });
    }

    if (geenKlant > 0) {
      resultaten.push({ check: 'Facturen – Ontbrekende klant', status: 'WAARSCHUWING',
        bericht: `${geenKlant} factuur/facturen zonder klantnaam. Dit kan problemen geven bij BTW-controle.` });
    }

    if (negatiefBedrag > 0) {
      resultaten.push({ check: 'Facturen – Negatieve bedragen', status: 'FOUT',
        bericht: `${negatiefBedrag} factuur/facturen met een negatief bedrag. Gebruik creditnota's voor correcties — niet negatieve facturen.` });
    }

    if (vervallenOpen > 0) {
      resultaten.push({ check: 'Facturen – Vervallen onbetaald', status: 'WAARSCHUWING',
        bericht: `${vervallenOpen} factuur/facturen zijn vervallen maar nog niet betaald. Stuur een betalingsherinnering via Boekhouding → Facturen & Betalingen.` });
    } else {
      resultaten.push({ check: 'Facturen – Vervallen onbetaald', status: 'OK', bericht: 'Geen vervallen onbetaalde facturen.' });
    }

  } catch (e) {
    resultaten.push({ check: 'Verkoopfacturen', status: 'FOUT', bericht: 'Fout bij controleren: ' + e.message });
  }

  return resultaten;
}

// ─────────────────────────────────────────────
//  CHECK 4: BTW CONSISTENTIE
// ─────────────────────────────────────────────

function controleerBtwConsistentie_(ss) {
  try {
    const vfData = ss.getSheetByName(SHEETS.VERKOOPFACTUREN).getDataRange().getValues();
    let btwMismatch = 0;

    for (let i = 1; i < vfData.length; i++) {
      const exclBtw  = parseFloat(vfData[i][9])  || 0;
      const btwLabel = String(vfData[i][10] || '');
      const btwBedrag = parseFloat(vfData[i][11]) || 0;
      const inclBtw  = parseFloat(vfData[i][12]) || 0;

      if (exclBtw <= 0) continue;

      const tarief = parseBtwTarief_(btwLabel);
      if (tarief === null) continue; // Vrijgesteld/Verlegd

      const verwachtBtw = rondBedrag_(exclBtw * tarief);
      const verwachtIncl = rondBedrag_(exclBtw + verwachtBtw);

      if (Math.abs(btwBedrag - verwachtBtw) > 0.02 || Math.abs(inclBtw - verwachtIncl) > 0.02) {
        btwMismatch++;
      }
    }

    if (btwMismatch > 0) {
      return {
        check: 'BTW – Rekensommen',
        status: 'FOUT',
        bericht: `${btwMismatch} factuur/facturen waarbij het BTW-bedrag niet overeenkomt met het verwachte bedrag op basis van het BTW-tarief. Dit kan leiden tot fouten in de BTW-aangifte.`,
      };
    }

    return { check: 'BTW – Rekensommen', status: 'OK', bericht: 'Alle BTW-bedragen zijn wiskundig correct.' };

  } catch (e) {
    return { check: 'BTW – Consistentie', status: 'FOUT', bericht: 'Fout bij BTW-controle: ' + e.message };
  }
}

// ─────────────────────────────────────────────
//  CHECK 5: INSTELLINGEN
// ─────────────────────────────────────────────

function controleerInstellingen_() {
  const resultaten = [];

  const verplicht = [
    { sleutel: 'Bedrijfsnaam',  label: 'Bedrijfsnaam',    uitleg: 'Verplicht op iedere factuur.' },
    { sleutel: 'BTW-nummer',    label: 'BTW-nummer',       uitleg: 'Verplicht op facturen > €100 (EU-regelgeving).' },
    { sleutel: 'KvK-nummer',    label: 'KvK-nummer',       uitleg: 'Verplicht voor BV/eenmanszaak op briefpapier.' },
    { sleutel: 'IBAN',          label: 'Bankrekening (IBAN)', uitleg: 'Nodig voor betalingsinstructie op factuur.' },
    { sleutel: 'Rechtsvorm',    label: 'Rechtsvorm',       uitleg: 'Nodig voor correcte belastingberekening.' },
  ];

  const ontbrekend = verplicht.filter(v => !getInstelling_(v.sleutel));

  if (ontbrekend.length === 0) {
    resultaten.push({ check: 'Instellingen – Verplichte velden', status: 'OK', bericht: 'Alle verplichte bedrijfsgegevens zijn ingevuld.' });
  } else {
    ontbrekend.forEach(v => {
      resultaten.push({
        check: `Instellingen – ${v.label}`,
        status: 'WAARSCHUWING',
        bericht: `${v.label} is niet ingevuld. ${v.uitleg} Ga naar tabblad "Instellingen" om dit in te vullen.`,
      });
    });
  }

  return resultaten;
}

// ─────────────────────────────────────────────
//  RESULTATEN NAAR TABBLAD
// ─────────────────────────────────────────────

function schrijfGezondheidCheckResultaten_(ss, resultaten, score, fouten, waarsch, ok) {
  const bladNaam = 'Gezondheidscheck';
  let sheet = ss.getSheetByName(bladNaam);
  if (!sheet) {
    sheet = ss.insertSheet(bladNaam);
    sheet.setTabColor('#F57F17');
  }
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const nu = new Date();

  // Koptekst
  sheet.getRange(1, 1, 1, 3).merge()
    .setValue(`GEZONDHEIDSCHECK – ${bedrijf}`)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 3).merge()
    .setValue(`Uitgevoerd op ${formatDatumTijd_(nu)}  |  Score: ${score}/100  |  ✅ ${ok} in orde  |  ⚠️ ${waarsch} aandacht  |  ❌ ${fouten} fouten`)
    .setBackground(score >= 90 ? '#1B5E20' : score >= 70 ? '#E65100' : '#B71C1C')
    .setFontColor('#FFFFFF').setFontSize(11).setHorizontalAlignment('center');

  // Score visualisatie
  const scoreBalk = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
  sheet.getRange(3, 1, 1, 3).merge()
    .setValue(`Score ${score}/100  ${scoreBalk}`)
    .setFontFamily('Courier New').setFontSize(11)
    .setBackground(score >= 90 ? '#E8F5E9' : score >= 70 ? '#FFF8E1' : '#FFEBEE')
    .setHorizontalAlignment('center');

  // Headers
  sheet.getRange(5, 1, 1, 3)
    .setValues([['Check', 'Status', 'Toelichting']])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  const statusKleuren = {
    'OK':          '#E8F5E9',
    'WAARSCHUWING': '#FFF8E1',
    'FOUT':        '#FFEBEE',
  };
  const statusLabels = { 'OK': '✅ In orde', 'WAARSCHUWING': '⚠️ Let op', 'FOUT': '❌ Fout' };

  let rij = 6;
  resultaten.forEach(r => {
    const bg = statusKleuren[r.status] || '#FAFAFA';
    sheet.getRange(rij, 1).setValue(r.check).setBackground(bg).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(statusLabels[r.status] || r.status).setBackground(bg);
    sheet.getRange(rij, 3).setValue(r.bericht).setBackground(bg).setWrap(true);
    rij++;
  });

  // Actiepunten sectie
  const fouten_lijst = resultaten.filter(r => r.status === 'FOUT');
  const waarsch_lijst = resultaten.filter(r => r.status === 'WAARSCHUWING');

  if (fouten_lijst.length > 0 || waarsch_lijst.length > 0) {
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue('ACTIEPUNTEN — Dit vraagt uw aandacht:')
      .setBackground('#FF8F00').setFontColor('#FFFFFF').setFontWeight('bold');
    rij++;

    [...fouten_lijst, ...waarsch_lijst].forEach((r, idx) => {
      sheet.getRange(rij, 1, 1, 3).merge()
        .setValue(`${idx + 1}. [${r.check}] ${r.bericht}`)
        .setBackground(r.status === 'FOUT' ? '#FFEBEE' : '#FFF8E1')
        .setWrap(true).setFontSize(10);
      rij++;
    });
  }

  // Kolombreedte
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 500);
  sheet.setFrozenRows(5);

  ss.setActiveSheet(sheet);
}

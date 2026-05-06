/**
 * Triggers.gs
 * Verwerkt het uniforme boekhoudformulier en dagelijkse taken.
 * Het hoofdformulier heeft drie secties: Inkomsten, Uitgaven, Declaratie.
 */

// ─────────────────────────────────────────────
//  ON EDIT: BEDRIJFSNAAM DOORVOEREN
// ─────────────────────────────────────────────
/**
 * Trigger — wordt automatisch aangeroepen bij elke celbewerking.
 * Twee taken:
 *   1. Audit trail — log elke wijziging op gevoelige tabbladen
 *   2. Bedrijfsnaam-detectie in Instellingen → spreadsheet hernoemen
 *
 * Beide stappen lopen onafhankelijk: één fout blokkeert de andere niet.
 */
function onEdit(e) {
  // ── Audit trail: log alle edits op gevoelige sheets ───────────
  try {
    schrijfAuditEdit_(e);
  } catch (err) {
    Logger.log('onEdit audit fout: ' + err.message);
  }

  // ── Bedrijfsnaam doorvoeren naar spreadsheet-titel ────────────
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEETS.INSTELLINGEN) return;

    // Alleen kolom B (waarden), label in kolom A
    if (e.range.getColumn() !== 2) return;
    const label = sheet.getRange(e.range.getRow(), 1).getValue();
    if (String(label) !== 'Bedrijfsnaam') return;

    const nieuwNaam = String(e.value || '').trim();
    if (!nieuwNaam || nieuwNaam.startsWith('←')) return;

    verwerkBedrijfsnaamWijziging_(nieuwNaam);
  } catch (err) {
    Logger.log('onEdit fout: ' + err.message);
  }
}

/**
 * Schrijft een rij naar het Audit Log voor elke edit op een gevoelig tabblad.
 * Niet-fataal: nooit een gebruikersactie blokkeren als logging faalt.
 *
 * Watch-list: VERKOOPFACTUREN, INKOOPFACTUREN, INSTELLINGEN, BANKTRANSACTIES,
 *             HERHALENDE_KOSTEN, JOURNAALPOSTEN, RELATIES.
 */
function _AUDIT_WATCH_SHEETS_() {
  // Function used as constant — recomputed lazily so SHEETS is loaded.
  return [
    SHEETS.VERKOOPFACTUREN,
    SHEETS.INKOOPFACTUREN,
    SHEETS.INSTELLINGEN,
    SHEETS.BANKTRANSACTIES,
    SHEETS.HERHALENDE_KOSTEN,
    SHEETS.JOURNAALPOSTEN,
    SHEETS.RELATIES,
  ];
}

function schrijfAuditEdit_(e) {
  if (!e || !e.range || !e.source) return;
  const sheet = e.range.getSheet();
  const naam = sheet.getName();
  const watch = _AUDIT_WATCH_SHEETS_();
  if (watch.indexOf(naam) === -1) return;

  // Geen wijziging? Skip (formaat-edits, sortering)
  const oud = e.oldValue !== undefined ? e.oldValue : '';
  const nieuw = e.value !== undefined ? e.value : '';
  if (String(oud) === String(nieuw)) return;

  const ss = e.source;
  const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!auditSheet) return;

  let user = '';
  try { user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; } catch (_) {}

  const rij = [
    new Date(),
    user,
    naam,
    e.range.getA1Notation(),
    String(oud).slice(0, 500),
    String(nieuw).slice(0, 500),
    'cell-edit',
  ];

  // Voeg toe aan einde, daarna trim:
  //  • Datum-cutoff op 7 jaar (AWR art. 52 bewaarplicht — moet bewaard blijven)
  //  • Hard-cap 5000 rijen als safety-net tegen runaway-growth
  // Voorheen: 500 rijen ≈ 2,5 jaar, te kort voor compliance.
  auditSheet.appendRow(rij);

  _trimAuditLog_(auditSheet);
}

/**
 * Verwijdert audit-log rijen die ouder zijn dan 7 jaar (bewaarplicht-grens
 * art. 52 AWR is precies 7 jaar; we behouden alles binnen de termijn).
 * Daarnaast hard-cap op 5000 rijen om runaway-growth te beperken.
 *
 * Idempotent: opnieuw draaien bij gelijke staat = no-op.
 */
function _trimAuditLog_(auditSheet) {
  if (!auditSheet) return;
  const lastRow = auditSheet.getLastRow();
  if (lastRow <= 1) return;

  const HARD_CAP = 5000;
  const ZEVEN_JAAR_MS = 7 * 365.25 * 24 * 3600 * 1000;
  const cutoffDate = new Date(Date.now() - ZEVEN_JAAR_MS);

  // Lees alleen kolom 1 (datum) — efficiënt voor grote logs
  const datums = auditSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let aantalTeOud = 0;
  for (let i = 0; i < datums.length; i++) {
    const d = datums[i][0];
    if (!(d instanceof Date)) break;        // log corrupt? stop trim
    if (d.getTime() >= cutoffDate.getTime()) break;  // alle volgende zijn jonger
    aantalTeOud++;
  }

  // Hard-cap: als totaal nog steeds > HARD_CAP na 7y-trim, verwijder ook oudste
  // recent-jonge rijen om limit te respecteren.
  const naCutoffTrim = lastRow - 1 - aantalTeOud;
  let extraOver = Math.max(0, naCutoffTrim - HARD_CAP);

  const totaalTeVerwijderen = aantalTeOud + extraOver;
  if (totaalTeVerwijderen > 0) {
    auditSheet.deleteRows(2, totaalTeVerwijderen);
  }
}

/**
 * Past de spreadsheet-naam en de Dashboard-koptekst aan op de nieuwe bedrijfsnaam.
 * @param {string} naam
 */
function verwerkBedrijfsnaamWijziging_(naam) {
  const ss = getSpreadsheet_();
  const jaar = new Date().getFullYear();

  // Hernoem het spreadsheet-bestand
  try {
    ss.rename('Boekhouding ' + naam + ' ' + jaar);
  } catch (e) {
    Logger.log('Hernoemen spreadsheet mislukt: ' + e.message);
  }

  // Wis de instellingen-cache via de helper in Setup.gs
  try { wisInstellingenCache_(); } catch (e) {}

  // Update Dashboard-koptekst direct (zonder volledige herberekening)
  try {
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (dash) {
      const huidigeWaarde = String(dash.getRange(1, 1).getValue());
      if (huidigeWaarde.includes('DASHBOARD')) {
        dash.getRange(1, 1).setValue('FINANCIEEL DASHBOARD \u2013 ' + naam.toUpperCase());
      }
    }
  } catch (e) {
    Logger.log('Dashboard-koptekst bijwerken mislukt: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  UNIFIED FORM HANDLER (alles-in-één formulier)
// ─────────────────────────────────────────────
function verwerkHoofdformulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const type = String(data['Wat wil je doen?'] || '');
    const ss = getSpreadsheet_();
    schrijfAuditLog_('Formulier ontvangen', 'type: ' + type);

    if (type.includes('Inkomsten')) {
      verwerkInkomstenUitHoofdformulier_(ss, data);
    } else if (type.includes('Uitgaven')) {
      verwerkUitgavenUitHoofdformulier_(ss, data);
    } else if (type.includes('Declaratie')) {
      verwerkDeclaratieUitHoofdformulier_(ss, data);
    } else {
      schrijfAuditLog_('Formulier ONBEKEND type', type);
      Logger.log('Onbekend formuliertype: ' + type);
    }

    vernieuwDashboard();

  } catch (err) {
    schrijfAuditLog_('FOUT Formulier', err.message);
    Logger.log('Fout verwerkHoofdformulier: ' + err.message + '\n' + err.stack);
    stuurFoutEmail_('Hoofdformulier verwerking', err);
  }
}

// ─────────────────────────────────────────────
//  INKOMSTEN (factuur aanmaken)
// ─────────────────────────────────────────────
function verwerkInkomstenUitHoofdformulier_(ss, data) {
  const klantnaam  = data['Klantnaam'] || '';
  const klantEmail = String(data['Klant e-mailadres'] || '').trim();
  const klantAdres = data['Factuuradres klant'] || '';
  // parseDatum_ verwerkt DD-MM-YYYY, ISO én Date-objecten — voorkomt dat een
  // factuur met handgetypte NL-locale datum stilletjes 'today' krijgt.
  const datum      = parseDatum_(data['Factuurdatum']) || new Date();
  // Datum-range validatie:
  //   * niet > 90 dagen toekomst (anti-fraude / typo)
  //   * niet > 7 jaar in verleden (bewaarplicht-grens AWR art. 52 = 7 jaar)
  // Beide cases zijn geldig in zeer specifieke gevallen, dus we waarschuwen
  // i.p.v. blokkeren — schrijven naar audit-log voor compliance-trail.
  const _nu = new Date();
  const _maxToekomst = new Date(_nu.getTime() + 90 * 86400000);
  const _maxVerleden = new Date(_nu.getFullYear() - 7, _nu.getMonth(), _nu.getDate());
  if (datum > _maxToekomst) {
    try { schrijfAuditLog_('Factuur datum-waarschuwing', 'datum > 90 dagen toekomst: ' + formatDatum_(datum)); } catch (_) {}
  } else if (datum < _maxVerleden) {
    try { schrijfAuditLog_('Factuur datum-waarschuwing', 'datum > 7 jaar verleden (bewaarplicht): ' + formatDatum_(datum)); } catch (_) {}
  }
  const termijn    = parseInt(data['Betalingstermijn (dagen)'] || '30') || 30;
  if (termijn <= 0) {
    throw new Error('Betalingstermijn moet groter dan 0 dagen zijn (gevonden: ' + termijn + ').');
  }
  if (termijn > 365) {
    // Belastingdienst-stelling: betalingstermijnen > 12 maanden zijn ongebruikelijk
    // en kunnen op een typo wijzen (3650 i.p.v. 365). Niet blokkeren — wel loggen.
    try { schrijfAuditLog_('Factuur termijn-waarschuwing', 'termijn > 1 jaar: ' + termijn); } catch (_) {}
  }
  const vervaldatum = new Date(datum.getTime() + termijn * 86400000);
  const directMailen = String(data['Factuur direct e-mailen naar klant?'] || '').includes('Ja');

  // Factuurregels (5 regels) — VALIDEREN VOORDAT factuurnummer-counter wordt bumped.
  // Belastingdienst eist sequentiële factuurnummers; gat door early-return = audit-flag.
  // Skip-regel: omschrijving leeg OF aantal<=0 OF prijs<=0. Voorkomt €0-regels en
  // negatieve regels (refund-risk). Negatieve aantal/prijs wordt bovendien gelogd.
  const regels = [];
  const overgeslagenRegels = [];
  for (let i = 1; i <= 5; i++) {
    const omschr = String(data[`Regel ${i} – Omschrijving`] || '').trim();
    const aantal = parseBedrag_(data[`Regel ${i} – Aantal`] || '0');
    const prijs  = parseBedrag_(data[`Regel ${i} – Prijs per eenheid (excl. BTW)`] || '0');
    if (!omschr && aantal === 0 && prijs === 0) continue;   // volledig leeg → stille skip
    if (!omschr) { overgeslagenRegels.push(`Regel ${i}: omschrijving leeg`); continue; }
    if (aantal <= 0) { overgeslagenRegels.push(`Regel ${i} (${omschr}): aantal moet > 0 zijn`); continue; }
    if (prijs <= 0) { overgeslagenRegels.push(`Regel ${i} (${omschr}): prijs moet > €0 zijn`); continue; }
    const totaal = rondBedrag_(aantal * prijs);
    regels.push({ omschr, aantal, prijs, totaal });
  }

  if (regels.length === 0) {
    const detail = overgeslagenRegels.length
      ? '\n\nOvergeslagen regels:\n• ' + overgeslagenRegels.join('\n• ')
      : '';
    schrijfAuditLog_('Factuur MISLUKT', 'Geen geldige factuurregels — geen nummer geclaimd' + (detail ? ' | ' + overgeslagenRegels.join(' | ') : ''));
    throw new Error('Geen geldige factuurregels gevonden. Vul minimaal één regel met omschrijving, aantal > 0 en prijs > €0.' + detail);
  }
  if (overgeslagenRegels.length) {
    try { schrijfAuditLog_('Factuur regels overgeslagen', overgeslagenRegels.join(' | ')); } catch (_) {}
  }

  // Klant-BTW-nr formaat-check (niet-blokkerend) — bij verleggingsregeling
  // is een geldig EU-BTW-nr verplicht (Wet OB art. 12 lid 3). We waarschuwen
  // alleen via audit-log, blokkeren niet (B2C-facturen hebben geen BTW-nr).
  const klantBtwNr = String(data['BTW-nummer klant'] || '').trim();
  if (klantBtwNr && !isGeldigEuBTWNummer_(klantBtwNr)) {
    try { schrijfAuditLog_('Factuur klant-BTW-waarschuwing', 'Onbekend BTW-nr-formaat: ' + klantBtwNr); } catch (_) {}
  }

  // Pas NA validatie nummer claimen — voorkomt gap in factuurreeks
  const factuurNr  = volgendFactuurnummer_();
  // Factuurnummer-gap-check: vergelijk met laatste in sheet. Een gat > 1
  // (overgeslagen nummers) is een audit-flag voor de Belastingdienst.
  // We loggen alleen — herstellen vergt manuele actie.
  try {
    const _vfSheetCheck = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (_vfSheetCheck && _vfSheetCheck.getLastRow() > 1) {
      const _lastCol = _vfSheetCheck.getRange(_vfSheetCheck.getLastRow(), 1).getValue();
      const _laatsteNr = parseInt(_lastCol, 10);
      if (_laatsteNr > 0 && factuurNr - _laatsteNr > 1) {
        schrijfAuditLog_('Factuurnummer GAP gedetecteerd',
          'Vorig: ' + _laatsteNr + ' Nieuw: ' + factuurNr +
          ' (gap=' + (factuurNr - _laatsteNr - 1) + ' nummers). Audit-flag.');
      }
    }
  } catch (_) { /* gap-check is best-effort */ }

  const korting    = parseBedrag_(data['Korting (in €)'] || '0') || 0;
  const btwTarief  = parseBtwTarief_(data['BTW tarief'] || '21% (hoog)');
  const _subtotaal = regels.reduce((s, r) => s + r.totaal, 0);
  if (korting < 0) {
    throw new Error('Korting moet ≥ €0 zijn (gevonden: ' + formatBedrag_(korting) + ').');
  }
  if (korting > _subtotaal) {
    throw new Error('Korting (' + formatBedrag_(korting) + ') is groter dan totaal regels (' +
      formatBedrag_(_subtotaal) + '). Een factuur mag niet negatief zijn — maak een correctiefactuur (creditnota) voor terugbetaling.');
  }
  const totalExcl    = rondBedrag_(_subtotaal - korting);
  const totalBtw   = btwTarief !== null ? rondBedrag_(totalExcl * btwTarief) : 0;
  const totalIncl  = rondBedrag_(totalExcl + totalBtw);

  // Klant opslaan/ophalen (inclusief e-mailadres)
  const klantId = zoekOfMaakRelatie_(ss, klantnaam, RELATIE_TYPE.KLANT, klantEmail);

  const prefix = getInstelling_('Factuurprefix') || 'F';
  const factuurNummerOpgemaakt = formatFactuurnummer_(factuurNr, prefix, 6);
  const factuurData = [
    factuurNr,
    factuurNummerOpgemaakt,
    datum,
    vervaldatum,
    klantId,
    klantnaam,
    data['KvK-nummer klant'] || '',
    data['BTW-nummer klant'] || '',
    regels.map(r => r.omschr).join('; '),
    totalExcl,
    data['BTW tarief'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    totalBtw,
    totalIncl,
    0,
    FACTUUR_STATUS.CONCEPT,
    '',
    '',
    data['Projectcode / Referentie'] || '',
    data['Notities op factuur'] || '',
    '',   // PDF URL (later ingevuld)
    bepaalOmzetRekening_(data['BTW tarief']),
    new Date(),
    Session.getActiveUser().getEmail(),
  ];

  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);

  // Idempotency: blokkeer dubbele verwerking van hetzelfde factuurnummer
  const bestaandeRijen = vfSheet.getDataRange().getValues();
  const datumStr = Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd');
  let recenteDuplicate = null;
  for (let i = 1; i < bestaandeRijen.length; i++) {
    if (bestaandeRijen[i][0] === factuurNr) {
      schrijfAuditLog_('Factuur DUBBEL geblokkeerd', factuurNummerOpgemaakt + ' bestaat al in sheet');
      throw new Error('Factuur ' + factuurNummerOpgemaakt + ' bestaat al — dubbele verwerking geblokkeerd.');
    }
    // Self-healing: detecteer 'gevoelsmatige' duplicate — zelfde klant + zelfde
    // datum + zelfde bedrag binnen 5 minuten = waarschijnlijk dubbel-submit.
    // Geen blokkade (kan legitiem zijn), wél waarschuwing in audit-log.
    const exDatum = bestaandeRijen[i][2];
    const exKlant = String(bestaandeRijen[i][5] || '');
    const exIncl  = parseFloat(bestaandeRijen[i][12]) || 0;
    if (exDatum) {
      const exDatumStr = Utilities.formatDate(new Date(exDatum), 'Europe/Amsterdam', 'yyyy-MM-dd');
      if (exDatumStr === datumStr && exKlant === klantnaam && Math.abs(exIncl - totalIncl) < 0.01) {
        recenteDuplicate = bestaandeRijen[i][1] || ('rij ' + (i + 1));
      }
    }
  }
  if (recenteDuplicate) {
    schrijfAuditLog_('Factuur dubbel-submit verdacht',
      factuurNummerOpgemaakt + ' lijkt op bestaande ' + recenteDuplicate +
      ' (zelfde klant/datum/bedrag) — niet geblokkeerd, audit-flag gezet');
    try { if (typeof rapporteerAnomalie_ === 'function') rapporteerAnomalie_('factuur_mogelijk_dubbel', 'similar to ' + recenteDuplicate); } catch (_) {}
  }

  vfSheet.appendRow(factuurData);
  const nieuweRij = vfSheet.getLastRow();
  schrijfAuditLog_('Factuur in sheet', factuurNummerOpgemaakt + ' | klant: ' + klantnaam + ' | excl: ' + totalExcl + ' | incl: ' + totalIncl);

  // Journaalposten
  const omschr = `Verkoopfactuur ${factuurNummerOpgemaakt} – ${klantnaam}`;
  maakJournaalpost_(ss, {
    datum, omschr, dagboek: 'Verkoopboek',
    debet: '1100', credit: bepaalOmzetRekening_(data['BTW tarief']),
    bedrag: totalExcl, btwTarief, btwBedrag: 0,
    ref: factuurNummerOpgemaakt, type: BOEKING_TYPE.VERKOOPFACTUUR,
  });
  if (totalBtw > 0) {
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (BTW)', dagboek: 'Verkoopboek',
      debet: '1100', credit: bepaalBtwVerkoopRekening_(data['BTW tarief']),
      bedrag: totalBtw, btwTarief, btwBedrag: totalBtw,
      ref: factuurNummerOpgemaakt, type: BOEKING_TYPE.VERKOOPFACTUUR,
    });
  }

  // PDF genereren
  Utilities.sleep(500);
  const formData = {
    'Factuuradres klant': klantAdres,
    'BTW-nummer klant': data['BTW-nummer klant'] || '',
    'BTW tarief': data['BTW tarief'] || '21% (hoog)',
    'Projectcode / Referentie': data['Projectcode / Referentie'] || '',
    'Notities / bijzonderheden': data['Notities op factuur'] || '',
  };
  const pdfUrl = genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, formData);

  // UBL genereren
  const ublUrl = genereerUBL_(factuurNr, klantnaam, klantAdres, regels, totalExcl, totalBtw, totalIncl, datum, vervaldatum, btwTarief);

  // BTW-spaarpot auto-reservering (opt-in via instelling 'BTW automatisch reserveren')
  // Voorkomt dat klant per ongeluk BTW besteedt — bij elke factuur wordt BTW-deel
  // direct van 1200 naar 1205 (BTW-spaarpot) geboekt zodat het apart staat.
  try {
    if (typeof reserveerBtwOpSpaarpot_ === 'function') {
      reserveerBtwOpSpaarpot_(ss, factuurNummerOpgemaakt, totalBtw, datum);
    }
  } catch (_) { /* spaarpot is best-effort */ }

  // PDF URL opslaan; log expliciet als PDF ontbreekt
  if (pdfUrl) {
    vfSheet.getRange(nieuweRij, 20).setValue(pdfUrl);
  } else {
    schrijfAuditLog_('PDF MISLUKT', factuurNummerOpgemaakt + ' – PDF niet gegenereerd; factuur staat in sheet zonder PDF');
    Logger.log('WAARSCHUWING: PDF niet gegenereerd voor ' + factuurNummerOpgemaakt);
  }

  // Automatisch mailen naar klant — alleen als PDF aanwezig
  let emailVerzonden = false;
  if (directMailen && klantEmail && pdfUrl) {
    emailVerzonden = stuurFactuurEmailNaarKlant_(klantEmail, klantnaam, factuurNummerOpgemaakt, totalIncl, vervaldatum, pdfUrl, ublUrl) === true;
    if (emailVerzonden) {
      schrijfAuditLog_('Email verstuurd', factuurNummerOpgemaakt + ' → ' + klantEmail);
    } else {
      schrijfAuditLog_('Email MISLUKT', factuurNummerOpgemaakt + ' → ' + klantEmail + ' – versturen mislukt');
    }
  } else if (directMailen && !klantEmail) {
    schrijfAuditLog_('Email OVERGESLAGEN', factuurNummerOpgemaakt + ' – geen klant e-mailadres bekend. Vul het e-mailadres in bij de klant-relatie en verstuur handmatig via Boekhouding → Verkoopfacturen.');
  } else if (directMailen && klantEmail && !pdfUrl) {
    schrijfAuditLog_('Email OVERGESLAGEN', factuurNummerOpgemaakt + ' – PDF niet beschikbaar, email niet verzonden');
  }

  // Status na werkelijk email-resultaat zetten (niet op intentie)
  if (pdfUrl) {
    const nieuweStatus = emailVerzonden ? FACTUUR_STATUS.VERZONDEN : FACTUUR_STATUS.CONCEPT;
    vfSheet.getRange(nieuweRij, 15).setValue(nieuweStatus);
  }

  Logger.log(`Verkoopfactuur ${factuurNummerOpgemaakt} aangemaakt voor ${klantnaam}`);

  // ── Financieel snapshot (zero extra sheet reads) ───────────────────────
  // bestaandeRijen was loaded above for the idempotency check.
  // We compute YTD excl. revenue and open debiteuren from existing rows,
  // then add this new invoice's contribution.
  const huidigJaar = new Date().getFullYear();
  let ytdOmzetExcl = 0;
  let debiteurenOpenNa = 0;
  for (let i = 1; i < bestaandeRijen.length; i++) {
    const r = bestaandeRijen[i];
    const rDatum = r[2] ? new Date(r[2]) : null;
    if (rDatum && rDatum.getFullYear() === huidigJaar) {
      ytdOmzetExcl += parseFloat(r[9]) || 0;
    }
    const rStatus = r[14];
    if (rStatus !== FACTUUR_STATUS.BETAALD && rStatus !== FACTUUR_STATUS.GECREDITEERD) {
      const rOpen = rondBedrag_((parseFloat(r[12]) || 0) - (parseFloat(r[13]) || 0));
      if (rOpen > 0) debiteurenOpenNa += rOpen;
    }
  }
  // Add this new invoice (YTD + open debiteur)
  ytdOmzetExcl = rondBedrag_(ytdOmzetExcl + totalExcl);
  debiteurenOpenNa = rondBedrag_(debiteurenOpenNa + totalIncl);

  return {
    ok:              true,
    factuurnummer:   factuurNummerOpgemaakt,
    emailVerzonden:  emailVerzonden,
    pdfUrl:          pdfUrl || null,
    sheetRij:        nieuweRij,
    ytdOmzetExcl:    ytdOmzetExcl,
    debiteurenOpen:  debiteurenOpenNa,
  };
}

// ─────────────────────────────────────────────
//  UITGAVEN (inkoopfactuur registreren)
// ─────────────────────────────────────────────
function verwerkUitgavenUitHoofdformulier_(ss, data) {
  const leverancier = String(data['Leveranciernaam'] || '').trim();
  const datum       = parseDatum_(data['Factuurdatum uitgave']) || new Date();
  const bedragExcl  = parseBedrag_(data['Bedrag excl. BTW'] || '0');
  // Validatie EERST — voorkom gap in inkoopnummer-reeks
  if (!leverancier) {
    schrijfAuditLog_('Uitgave geweigerd', 'leverancier ontbreekt');
    throw new Error('Leveranciernaam is verplicht.');
  }
  if (bedragExcl <= 0) {
    schrijfAuditLog_('Uitgave geweigerd', 'bedragExcl ≤ 0');
    throw new Error('Vul een bedrag in groter dan €0,00');
  }
  const inkoopNr    = volgendInkoopNummer_();
  const levId       = zoekOfMaakRelatie_(ss, leverancier, RELATIE_TYPE.LEVERANCIER);
  const btwTarief   = parseBtwTarief_(data['BTW tarief uitgave'] || '21% (hoog)');
  let btwBedrag     = parseBedrag_(data['BTW bedrag uitgave'] || '0');
  if (btwBedrag === 0 && btwTarief !== null) {
    btwBedrag = rondBedrag_(bedragExcl * btwTarief);
  }
  const bedragIncl = rondBedrag_(bedragExcl + btwBedrag);

  // Kostenrekening bepalen op basis van categorie
  const categorie   = data['Categorie kosten'] || 'Overige kosten';
  const kostenRek   = bepaalKostenrekening_(categorie);

  const inkoopData = [
    inkoopNr, 'IK' + inkoopNr, new Date(), datum,
    data['Factuurnummer leverancier'] || '',
    levId, leverancier,
    data['Omschrijving uitgave'] || categorie,
    bedragExcl,
    data['BTW tarief uitgave'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    btwBedrag, bedragIncl,
    data['Betalingsstatus uitgave'] === 'Betaald' ? FACTUUR_STATUS.BETAALD : FACTUUR_STATUS.CONCEPT,
    '',
    data['Betaalmethode'] || '',
    kostenRek,
    '', data['Notities uitgave'] || '', '', new Date(),
  ];

  ss.getSheetByName(SHEETS.INKOOPFACTUREN).appendRow(inkoopData);

  const omschr = `Inkoopfactuur ${data['Factuurnummer leverancier'] || inkoopNr} – ${leverancier}`;
  maakJournaalpost_(ss, {
    datum, omschr, dagboek: 'Inkoopboek',
    debet: kostenRek || '7990', credit: '4000',
    bedrag: bedragExcl, ref: 'IK' + inkoopNr,
    type: BOEKING_TYPE.INKOOPFACTUUR,
  });
  if (btwBedrag > 0) {
    maakJournaalpost_(ss, {
      datum, omschr: omschr + ' (BTW voorbelasting)', dagboek: 'Inkoopboek',
      debet: bepaalBtwVoorbelastingRekening_(data['BTW tarief uitgave']),
      credit: '4000', bedrag: btwBedrag, btwBedrag,
      ref: 'IK' + inkoopNr, type: BOEKING_TYPE.INKOOPFACTUUR,
    });
  }

  // Als de gebruiker de uitgave direct als BETAALD markeert: ook de
  // betaal-boeking aanmaken (4000 → 1200/2400). Anders accumuleert het
  // crediteurensaldo terwijl de uitgave op de inkoop-tab al "Betaald" staat.
  const betaaldDirect = data['Betalingsstatus uitgave'] === 'Betaald';
  if (betaaldDirect) {
    const betaalmethode = String(data['Betaalmethode'] || '').toLowerCase();
    const isPrive = betaalmethode.includes('priv');
    maakJournaalpost_(ss, {
      datum,
      omschr: omschr + ' (betaling)',
      dagboek: 'Bankboek',
      debet:  '4000',
      credit: isPrive ? '2400' : '1200',  // privé-betaling → privéonttrekking, anders bank
      bedrag: bedragIncl,
      ref:    'IK' + inkoopNr,
      type:   BOEKING_TYPE.BANKBETALING,
    });
  }

  Logger.log(`Inkoopfactuur IK${inkoopNr} geregistreerd voor ${leverancier}`);

  // Proactief signaal: aankoop ≥ €450 kan worden geactiveerd als investering.
  if (bedragExcl >= 450) {
    try {
      signaleerAfschrijvingskandidaat_(ss, bedragExcl, leverancier, data['Omschrijving uitgave'] || categorie);
    } catch (_) {}
  }

  // Slimme fiscale tips: detecteer AOV/EIA/KIA-grens/reiskosten/thuiswerk
  // Klant ziet meteen of er extra fiscaal voordeel mogelijk is.
  try {
    const slimmeTips = genereerSlimmeBoekingTips_({
      leverancier: leverancier,
      omschr: data['Omschrijving uitgave'] || '',
      bedrag: bedragExcl,
      categorie: categorie,
      kostenRek: kostenRek,
    });
    if (slimmeTips && slimmeTips.length > 0) {
      slimmeTips.forEach(function(t) {
        schrijfAuditLog_('Slimme tip uitgave', 'IK' + inkoopNr + ': ' + t.slice(0, 200));
      });
    }
  } catch (e) {
    Logger.log('Slimme boeking-tips: ' + e.message);
  }

  // High-expense alert — e-mail eigenaar bij ongebruikelijk hoge uitgave
  try {
    waarschuwBijHogeUitgave_(bedragIncl, leverancier, categorie, 'IK' + inkoopNr);
  } catch (_) {}

  return { ok: true, inkoopnummer: 'IK' + inkoopNr, bedragExcl: bedragExcl, bedragIncl: bedragIncl };
}

/**
 * Stuurt een e-mailalert wanneer een uitgave boven de drempel uitkomt.
 * Drempel komt uit Instellingen ("Melding hoge uitgave") of default €500.
 * Niet-fataal: faalt stil zodat het de boekingsflow niet blokkeert.
 *
 * @param {number} bedrag    Bedrag inclusief BTW.
 * @param {string} leverancier
 * @param {string} categorie
 * @param {string} ref       Inkoopnummer / referentie
 */
function waarschuwBijHogeUitgave_(bedrag, leverancier, categorie, ref) {
  const drempelStr = getInstelling_('Melding hoge uitgave');
  const drempel = drempelStr ? parseBedrag_(drempelStr) : 500;
  if (!isFinite(drempel) || drempel <= 0) return;
  if (bedrag < drempel) return;

  const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
  if (!ontvanger || !isGeldigEmail_(ontvanger)) return;

  const onderwerp = `⚠️ Hoge uitgave geregistreerd: ${formatBedrag_(bedrag)} – ${leverancier}`;
  const body =
    'Er is zojuist een uitgave geboekt die boven uw alert-drempel uitkomt:\n\n' +
    `Leverancier:   ${leverancier}\n` +
    `Categorie:     ${categorie}\n` +
    `Bedrag (incl): ${formatBedrag_(bedrag)}\n` +
    `Drempel:       ${formatBedrag_(drempel)}\n` +
    `Referentie:    ${ref}\n\n` +
    'Open uw spreadsheet om de boeking te bekijken of te wijzigen.\n\n' +
    'U kunt de drempel aanpassen op het tabblad Instellingen → "Melding hoge uitgave".';

  if (!isGeldigEmail_(ontvanger)) {
    Logger.log('Hoge-uitgave alert overgeslagen: ongeldig e-mailadres "' + ontvanger + '"');
    try { schrijfAuditLog_('Hoge uitgave alert OVERGESLAGEN', 'Ongeldig e-mailadres: ' + ontvanger); } catch (_) {}
    return;
  }
  try {
    GmailApp.sendEmail(ontvanger, onderwerp, body);
    schrijfAuditLog_('Hoge uitgave alert', `${leverancier} ${formatBedrag_(bedrag)} → ${ontvanger}`);
  } catch (e) {
    Logger.log('Hoge-uitgave alert niet verzonden: ' + e.message);
    try { schrijfAuditLog_('Hoge uitgave alert MISLUKT', e.message); } catch (_) {}
  }
}

// ─────────────────────────────────────────────
//  DECLARATIE (privé voorgeschoten)
// ─────────────────────────────────────────────
function verwerkDeclaratieUitHoofdformulier_(ss, data) {
  const datum      = parseDatum_(data['Datum declaratie']) || new Date();
  const bedragExcl = parseBedrag_(data['Bedrag excl. BTW declaratie'] || '0');
  // Validatie EERST — voorkom gap in inkoopnummer-reeks bij lege submit
  if (bedragExcl <= 0) {
    schrijfAuditLog_('Declaratie geweigerd', 'bedragExcl ≤ 0 — geen inkoopnummer geclaimd');
    throw new Error('Vul een bedrag in groter dan €0,00');
  }
  const inkoopNr   = volgendInkoopNummer_();
  const btwTarief  = parseBtwTarief_(data['BTW tarief declaratie'] || '0% (nultarief)');
  // Use pre-computed BTW bedrag if provided (avoids cascaded rounding errors from excl*rate);
  // fall back to computed value for Forms submissions that don't include this field.
  let btwBedrag = parseBedrag_(data['BTW bedrag declaratie'] || '0');
  if (btwBedrag === 0 && btwTarief !== null) {
    btwBedrag = rondBedrag_(bedragExcl * btwTarief);
  }
  const bedragIncl = rondBedrag_(bedragExcl + btwBedrag);
  const categorie  = data['Categorie declaratie'] || 'Overige kosten';
  const betaaldDoor = data['Betaald door (naam)'] || 'Privé';
  const kostenRek  = bepaalKostenrekening_(categorie);

  const inkoopData = [
    inkoopNr, 'DECL' + inkoopNr, new Date(), datum,
    '', '', betaaldDoor,
    data['Omschrijving declaratie'] || categorie,
    bedragExcl,
    data['BTW tarief declaratie'] || (btwTarief !== null ? (btwTarief * 100) + '%' : 'Vrijgesteld'),
    btwBedrag, bedragIncl,
    data['Declaratie status'] === 'Terugbetaald' ? FACTUUR_STATUS.BETAALD : FACTUUR_STATUS.CONCEPT,
    '', data['Betaalmethode declaratie'] || '',
    kostenRek, 'Declaratie', '', '', new Date(),
  ];

  ss.getSheetByName(SHEETS.INKOOPFACTUREN).appendRow(inkoopData);

  // Privé-voorgeschoten kosten: kostenrekening (excl) + BTW-voorbelasting → 4500 (incl).
  // Eerdere versie boekte alleen excl. waardoor BTW niet als voorbelasting werd
  // teruggevorderd én 4500 onvolledig was (€100 ipv €121 bij 21% declaratie).
  const omschrDecl = `Declaratie ${betaaldDoor} – ${data['Omschrijving declaratie'] || categorie}`;
  maakJournaalpost_(ss, {
    datum,
    omschr: omschrDecl,
    dagboek: 'Memoriaal',
    debet: kostenRek || '7990', credit: '4500',
    bedrag: bedragExcl,
    btwTarief, btwBedrag: 0,
    ref: 'DECL' + inkoopNr, type: BOEKING_TYPE.MEMORIAAL,
  });
  if (btwBedrag > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: omschrDecl + ' (BTW voorbelasting)',
      dagboek: 'Memoriaal',
      debet: bepaalBtwVoorbelastingRekening_(data['BTW tarief declaratie']),
      credit: '4500',
      bedrag: btwBedrag,
      btwTarief, btwBedrag,
      ref: 'DECL' + inkoopNr, type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  // Als de declaratie al 'Terugbetaald' is: ook de uitbetaling boeken
  // (4500 debet, Bank credit). Anders blijft 4500-saldo open ondanks 'Betaald'.
  if (data['Declaratie status'] === 'Terugbetaald') {
    maakJournaalpost_(ss, {
      datum,
      omschr: omschrDecl + ' (terugbetaling)',
      dagboek: 'Bankboek',
      debet: '4500',
      credit: '1200',
      bedrag: bedragIncl,
      ref: 'DECL' + inkoopNr,
      type: BOEKING_TYPE.BANKBETALING,
    });
  }

  Logger.log(`Declaratie DECL${inkoopNr} geregistreerd voor ${betaaldDoor}`);
}

// ─────────────────────────────────────────────
//  KOSTENREKENING OP BASIS VAN CATEGORIE
// ─────────────────────────────────────────────
function bepaalKostenrekening_(categorie) {
  const map = {
    'Marketing & Reclame':            '7510',
    'Software & Abonnementen':        '7440',
    'Kantoor & Werkruimte':           '7400',
    'Advies & Dienstverlening':       '7450',
    'Auto & Vervoer':                 '7300',
    'Openbaar Vervoer & Reiskosten':  '7340',
    'Maaltijden & Representatie':     '7520',
    'Inkoop / Materialen':            '7020',
    'Verzekeringen & Bankkosten':     '7910',
    'Personeelskosten':               '7100',
    'Onderhoud & Reparaties':         '7600',
    'Telecom & Internet':             '7430',
    'Studie & Opleiding':             '7930',
    'Overige kosten':                 '7990',
  };
  return map[categorie] || '7990';
}

// ─────────────────────────────────────────────
//  BACKWARD-COMPAT: VERKOOPFACTUUR FORMULIER
// ─────────────────────────────────────────────
// Bewaard voor installaties met het oude losse formulier.
function verwerkVerkoopfactuurFormulier(e) {
  try {
    const antwoorden = e.response.getItemResponses();
    const data = {};
    antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

    const ss = getSpreadsheet_();
    const datum = parseDatum_(data['Factuurdatum']) || new Date();
    const termijn = parseInt(data['Betalingstermijn (dagen)'] || '30');
    const vervaldatum = new Date(datum.getTime() + termijn * 24 * 60 * 60 * 1000);

    // Factuurregels berekenen — VOOR factuurnummer-claim om gap te voorkomen
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

    if (regels.length === 0) {
      throw new Error('Geen geldige factuurregels gevonden — geen factuurnummer geclaimd.');
    }
    const factuurNr = volgendFactuurnummer_();

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

    // NOOT: de derde journaalpost (debet 1100 / credit 1100 voor totaal incl.) is verwijderd.
    // Die post was een self-posting entry die het grootboek uit balans bracht.
    // Correcte boekhouding: alleen omzet-post en BTW-post (zie boven).

    // Genereer PDF
    Utilities.sleep(500);
    const pdfUrl = genereerFactuurPdf_(ss, factuurNr, klantnaam, datum, vervaldatum, regels, totalExcl, totalBtw, totalIncl, data);

    // Sla PDF URL op
    if (pdfUrl) {
      const rijen = vfSheet.getDataRange().getValues();
      for (let i = 1; i < rijen.length; i++) {
        // Strict numeric compare — voorkomt cross-type match (bv. '100' == 100)
        if (parseInt(rijen[i][0], 10) === factuurNr) {
          vfSheet.getRange(i + 1, 20).setValue(pdfUrl);
          break;
        }
      }
      schrijfAuditLog_('Factuur aangemaakt (legacy)', getInstelling_('Factuurprefix') + factuurNr + ' | klant: ' + klantnaam);
    } else {
      schrijfAuditLog_('PDF MISLUKT (legacy)', 'factuur ' + factuurNr + ' – PDF niet gegenereerd');
    }

    // Dashboard vernieuwen
    vernieuwDashboard();

    Logger.log(`Verkoopfactuur ${factuurNr} aangemaakt voor ${klantnaam}`);

  } catch (err) {
    schrijfAuditLog_('FOUT legacy factuur', err.message);
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

    const ss = getSpreadsheet_();
    const datum = parseDatum_(data['Factuurdatum']) || new Date();
    const leverancier = String(data['Leveranciernaam'] || '').trim();
    const bedragExcl = parseBedrag_(data['Bedrag excl. BTW'] || '0');
    // Validatie EERST — voorkom gap in inkoopnummer-reeks bij lege submit
    if (!leverancier) {
      schrijfAuditLog_('Inkoopfactuur (legacy) geweigerd', 'leverancier ontbreekt');
      throw new Error('Leveranciernaam is verplicht.');
    }
    if (bedragExcl <= 0) {
      schrijfAuditLog_('Inkoopfactuur (legacy) geweigerd', 'bedragExcl ≤ 0');
      throw new Error('Vul een bedrag in groter dan €0,00');
    }
    const inkoopNr = volgendInkoopNummer_();
    const leverancierId = zoekOfMaakRelatie_(ss, leverancier, RELATIE_TYPE.LEVERANCIER);

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

    const ss = getSpreadsheet_();
    const transactieId = volgendTransactieId_();
    const datum = parseDatum_(data['Transactiedatum']) || new Date();
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

    const ss = getSpreadsheet_();
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

    const ss = getSpreadsheet_();
    const datum = parseDatum_(data['Boekingsdatum']) || new Date();
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
  const ss = getSpreadsheet_();
  const dagelijksTotaal0 = Date.now();

  // Elke taak in eigen try-catch: één falende taak stopt de rest niet.
  // Wrap in _runTaak_ voor automatische metrics + status-logging.
  _runTaak_('markeerVervallen', function() { markeerVervallenFacturen_(ss); });
  _runTaak_('herinneringen',    function() { stuurAutomatischeBetalingsherinneringen_(ss); });
  _runTaak_('btwDeadline',      function() {
    if (getInstelling_('BTW aangifte herinnering') === 'Ja') controleerBtwDeadlines_();
  });
  _runTaak_('gezondheidscheck', function() { voerGezondheidCheckStil_(); });
  _runTaak_('dashboard',        function() { vernieuwDashboard(); });
  _runTaak_('groottecheck',     function() { controleerSheetGrootte_(ss); });

  // Aggregaat: totale duur dagelijkseTaken
  try { metricsLog_('dagelijkseTaken.totaal', Date.now() - dagelijksTotaal0, true); } catch (_) {}
  Logger.log('Dagelijkse taken uitgevoerd: ' + new Date());
}

/**
 * Runt een sub-taak met automatische:
 *  - try/catch isolation (een fout stopt de keten niet)
 *  - duur-meting → metricsLog_
 *  - status-tracking → taakStatus-sheet (laatste run + status)
 *  - audit-log bij fout
 */
function _runTaak_(naam, fn) {
  const t0 = Date.now();
  let status = 'OK';
  let foutBericht = '';
  try {
    fn();
  } catch (e) {
    status = 'FOUT';
    foutBericht = e.message;
    Logger.log('dagelijkse taak FOUT ' + naam + ': ' + e.message);
    try { schrijfAuditLog_('FOUT dagelijkse taak', naam + ': ' + e.message); } catch (_) {}
  } finally {
    const durMs = Date.now() - t0;
    try { metricsLog_('taak.' + naam, durMs, status === 'OK', { fout: foutBericht || undefined }); } catch (_) {}
    try { _updateTaakStatus_(naam, status, durMs, foutBericht); } catch (_) {}
  }
}

/**
 * Verborgen tabblad 'Taakstatus' toont per achtergrond-taak: laatste run,
 * duur, status, eventueel laatste fout. Klant-vriendelijk overzicht via
 * Boekhouding → Controle → Taakstatus tonen.
 */
function _updateTaakStatus_(naam, status, durMs, fout) {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const SHEET = 'Taakstatus';
  let sheet = ss.getSheetByName(SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET);
    sheet.getRange(1, 1, 1, 5)
      .setValues([['Taak', 'Laatste run', 'Duur (ms)', 'Status', 'Laatste fout']])
      .setFontWeight('bold').setBackground('#0D1B4E').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  // Zoek bestaande rij voor deze taak (één rij per taak — geen historie hier;
  // historie staat in Metrics-tab).
  const data = sheet.getDataRange().getValues();
  let rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === naam) { rij = i + 1; break; }
  }
  const waarden = [naam, new Date(), durMs, status, fout || ''];
  if (rij === -1) {
    sheet.appendRow(waarden);
  } else {
    sheet.getRange(rij, 1, 1, 5).setValues([waarden]);
  }
  // Kleur status-cel
  if (rij === -1) rij = sheet.getLastRow();
  sheet.getRange(rij, 4).setBackground(status === 'OK' ? '#E8F5E9' : '#FFEBEE')
    .setFontColor(status === 'OK' ? '#1B5E20' : '#B71C1C');
}

// ─────────────────────────────────────────────
//  WEKELIJKSE SAMENVATTING (MAANDAG 08:00)
// ─────────────────────────────────────────────
/**
 * Stuurt een wekelijkse samenvatting per e-mail naar de eigenaar.
 * Bevat: omzet/kosten afgelopen week, openstaande debiteuren,
 * vervallen facturen, BTW-deadline (indien <30 dagen).
 *
 * Trigger: maandag 08:00 — geïnstalleerd via installeelTriggers_().
 */
function stuurWeeklySamenvatting_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return;
    // OPT-IN check: niet iedereen wil tips/samenvatting per email.
    // Default = Nee. Klant zet 'Ja' via Instellingen om abonnement aan te
    // zetten. Voorkomt ongewenste mail die als spam aanvoelt.
    const opt = String(getInstelling_('Email tips wekelijks') || '').toLowerCase().trim();
    const optActief = opt === 'ja' || opt === 'true' || opt === 'yes';
    if (!optActief) {
      Logger.log('Wekelijkse samenvatting overgeslagen: opt-in niet actief (Email tips wekelijks=Nee)');
      return;
    }
    const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
    if (!ontvanger || !isGeldigEmail_(ontvanger)) {
      Logger.log('Wekelijkse samenvatting overgeslagen: geen geldig ontvanger-emailadres');
      return;
    }

    const nu = new Date();
    const weekGeleden = new Date(nu.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Verzameld over de afgelopen 7 dagen
    let omzetWeek = 0;
    let aantalFacturen = 0;
    let kostenWeek = 0;
    let aantalKosten = 0;
    let openDebSaldo = 0;
    let openDebAantal = 0;
    let vervallenAantal = 0;
    let vervallenBedrag = 0;

    // Verkoopfacturen
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getRange(2, 1, vfSheet.getLastRow() - 1, vfSheet.getLastColumn()).getValues();
      data.forEach(function(r) {
        const datum = r[2] ? new Date(r[2]) : null;
        const bedragIncl = Number(r[12]) || 0;
        const status = String(r[14] || '');
        if (datum && datum >= weekGeleden && datum <= nu) {
          omzetWeek += bedragIncl;
          aantalFacturen++;
        }
        if (status === FACTUUR_STATUS.VERZONDEN || status === FACTUUR_STATUS.DEELS_BETAALD) {
          const betaald = Number(r[13]) || 0;
          openDebSaldo += (bedragIncl - betaald);
          openDebAantal++;
        }
        if (status === FACTUUR_STATUS.VERVALLEN) {
          vervallenAantal++;
          vervallenBedrag += bedragIncl - (Number(r[13]) || 0);
        }
      });
    }

    // Inkoopfacturen
    const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (ifSheet && ifSheet.getLastRow() > 1) {
      const data = ifSheet.getRange(2, 1, ifSheet.getLastRow() - 1, ifSheet.getLastColumn()).getValues();
      data.forEach(function(r) {
        const datum = r[3] ? parseDatum_(r[3]) : null;
        const bedragIncl = Number(r[11]) || 0;
        if (datum && !isNaN(datum.getTime()) && datum >= weekGeleden && datum <= nu) {
          kostenWeek += bedragIncl;
          aantalKosten++;
        }
      });
    }

    // BTW deadline?
    let btwInfo = '';
    try {
      const kStr = getKwartaal_(nu); // 'Q1' .. 'Q4'
      const kNum = parseInt(String(kStr || '').replace('Q', ''), 10);
      // Guard: corrupte getKwartaal_ output zou anders Invalid Date geven
      // en de hele weekly summary kapot maken bij een bug in kwartaal-helper.
      if (!isNaN(kNum) && kNum >= 1 && kNum <= 4) {
        const eindKwartaal = new Date(nu.getFullYear(), kNum * 3, 0);
        const deadline = new Date(eindKwartaal);
        deadline.setMonth(deadline.getMonth() + 1);
        const dagenTot = Math.ceil((deadline - nu) / (24 * 60 * 60 * 1000));
        if (dagenTot >= 0 && dagenTot <= 30) {
          btwInfo = `\n⏰ BTW-deadline ${kStr}: nog ${dagenTot} dagen (uiterlijk ${formatDatum_(deadline)})\n`;
        }
      }
    } catch (e) {
      Logger.log('BTW deadline berekening in weekly summary: ' + e.message);
    }

    const onderwerp = `📊 Weekoverzicht ${formatDatum_(weekGeleden)} – ${formatDatum_(nu)}`;
    const body =
      `Hallo,\n\n` +
      `Hier is uw wekelijkse boekhoud-samenvatting:\n\n` +
      `📈 OMZET DEZE WEEK\n` +
      `   ${aantalFacturen} factu${aantalFacturen === 1 ? 'ur' : 'ren'} verstuurd  →  ${formatBedrag_(omzetWeek)}\n\n` +
      `📉 KOSTEN DEZE WEEK\n` +
      `   ${aantalKosten} uitgave${aantalKosten === 1 ? '' : 'n'} geboekt  →  ${formatBedrag_(kostenWeek)}\n\n` +
      `💰 NETTO DEZE WEEK\n` +
      `   ${formatBedrag_(omzetWeek - kostenWeek)}\n\n` +
      `📥 OPENSTAANDE DEBITEUREN\n` +
      `   ${openDebAantal} factu${openDebAantal === 1 ? 'ur' : 'ren'}  →  ${formatBedrag_(openDebSaldo)}\n\n` +
      (vervallenAantal > 0 ?
        `⚠️ VERVALLEN FACTUREN\n   ${vervallenAantal} factu${vervallenAantal === 1 ? 'ur' : 'ren'}  →  ${formatBedrag_(vervallenBedrag)}\n\n` :
        '') +
      btwInfo +
      `\nOpen uw spreadsheet voor het volledige dashboard.\n\n` +
      `— Boekhoudbaar`;

    if (!isGeldigEmail_(ontvanger)) {
      Logger.log('Weekly summary overgeslagen: ongeldig e-mailadres "' + ontvanger + '"');
      try { schrijfAuditLog_('Weekly summary OVERGESLAGEN', 'Ongeldig e-mailadres: ' + ontvanger); } catch (_) {}
      return;
    }
    GmailApp.sendEmail(ontvanger, onderwerp, body);
    schrijfAuditLog_('Weekly summary verzonden', `naar ${ontvanger} – omzet ${formatBedrag_(omzetWeek)}`);
  } catch (e) {
    Logger.log('stuurWeeklySamenvatting_ fout: ' + e.message);
    try { schrijfAuditLog_('FOUT weekly summary', e.message); } catch (_) {}
  }
}

/**
 * Detecteert wanneer de spreadsheet zo groot wordt dat prestaties merkbaar
 * degraderen. Stuurt één waarschuwing per 30 dagen, via audit-log + email
 * indien eigen e-mail is ingesteld.
 *
 * Drempels:
 *   - VERKOOPFACTUREN + INKOOPFACTUREN samen > 2000 rijen
 *   - JOURNAALPOSTEN > 8000 rijen
 * Dan: adviseer "Boekhouding → Beheer → Nieuw boekjaar starten"
 */
function controleerSheetGrootte_(ss) {
  const nu = Date.now();
  const props = PropertiesService.getScriptProperties();
  const laatstKey = 'laatsteGrootteWaarschuwing';
  const laatst = parseInt(props.getProperty(laatstKey) || '0');
  if (nu - laatst < 30 * 24 * 60 * 60 * 1000) return; // max 1× per 30 dagen

  const vfRijen = (ss.getSheetByName(SHEETS.VERKOOPFACTUREN) || { getLastRow: () => 0 }).getLastRow();
  const ifRijen = (ss.getSheetByName(SHEETS.INKOOPFACTUREN)  || { getLastRow: () => 0 }).getLastRow();
  const jrRijen = (ss.getSheetByName(SHEETS.JOURNAALPOSTEN)  || { getLastRow: () => 0 }).getLastRow();

  const teVeelFacturen = (vfRijen + ifRijen) > 2000;
  const teVeelBoekingen = jrRijen > 8000;
  if (!teVeelFacturen && !teVeelBoekingen) return;

  const eigenEmail = getInstelling_('Email rapporten naar') || '';
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const bericht =
    'De spreadsheet bevat ' + (vfRijen + ifRijen) + ' facturen en ' + jrRijen + ' boekingen. ' +
    'Dit werkt prima, maar het Dashboard-refresh wordt merkbaar trager. ' +
    'Overweeg om een nieuw boekjaar te starten via Boekhouding → Instellingen → Nieuw boekjaar.';

  try { schrijfAuditLog_('Sheet-grootte waarschuwing', bericht); } catch (_) {}
  if (eigenEmail && isGeldigEmail_(eigenEmail)) {
    try {
      GmailApp.sendEmail(eigenEmail, 'Tip: boekhouding wordt groot — overweeg nieuw boekjaar',
        bericht + '\n\n— Boekhoudbaar' + (bedrijf ? ' (' + bedrijf + ')' : ''));
    } catch (_) {}
  }
  props.setProperty(laatstKey, String(nu));
}

// ─────────────────────────────────────────────
//  AUTOMATISCHE BETALINGSHERINNERINGEN (DUNNING)
// ─────────────────────────────────────────────
/**
 * Stuurt betalingsherinneringen in 3 stappen:
 *   Stap 1: 1 dag na vervaldatum
 *   Stap 2: 7 dagen na vervaldatum
 *   Stap 3: 14 dagen na vervaldatum
 * De bereikte stap wordt bijgehouden in Script Properties.
 */
function stuurAutomatischeBetalingsherinneringen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet || sheet.getLastRow() < 2) return;

  const data = sheet.getDataRange().getValues();
  const vandaag = new Date();
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const props = PropertiesService.getScriptProperties();
  const STAP_DAGEN = [1, 7, 14];

  // Resume-cursor: bij crash halverwege wordt dunningCursor opgeslagen, bij
  // volgende run hervatten we vanaf die rij. Voorkomt dat eerste 50 rijen 2x
  // herinnering krijgen na een 6-min timeout halverwege rij 51.
  // Reset naar 1 zodra alle rijen langs zijn gegaan (einde van loop).
  const CURSOR_KEY = 'dunningCursor';
  const startRij = parseInt(props.getProperty(CURSOR_KEY) || '1');
  const MAX_PER_RUN = 100;  // batch-grootte voor 6-min execution-limit
  let verwerkt = 0;
  let i = startRij;

  for (; i < data.length; i++) {
    if (verwerkt >= MAX_PER_RUN) {
      // Pauzeer hier — volgende run hervat
      props.setProperty(CURSOR_KEY, String(i));
      Logger.log('Dunning batch-pauze bij rij ' + i + ' (max ' + MAX_PER_RUN + ' per run)');
      try { schrijfAuditLog_('Dunning batch-pauze', 'rij ' + i + ' van ' + data.length); } catch (_) {}
      return;
    }
    const status = data[i][14];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;

    const vervaldatum = data[i][3] ? new Date(data[i][3]) : null;
    if (!vervaldatum) continue;
    const dagenOver = Math.floor((vandaag - vervaldatum) / 86400000);
    if (dagenOver < 1) continue;

    const factuurnummer = String(data[i][1]);
    const stapKey = 'herinneringsStap_' + factuurnummer;
    const gestuurdeStap = parseInt(props.getProperty(stapKey) || '0');
    const volgendeStap = STAP_DAGEN.filter(d => dagenOver >= d).length;
    if (volgendeStap <= gestuurdeStap) continue;

    const klantId = data[i][4];
    const klantEmail = haalRelatieEmail_(ss, klantId);
    if (!klantEmail) continue;

    const klantnaam   = data[i][5];
    const bedragOpen  = rondBedrag_((data[i][12] || 0) - (data[i][13] || 0));
    const pdfUrl      = data[i][19] || '';

    // Skip als al volledig betaald (negatief = overbetaling, status nog niet bijgewerkt)
    if (bedragOpen <= 0) continue;

    const onderwerp = `Betalingsherinnering ${volgendeStap}/3 – Factuur ${factuurnummer}`;
    const tekst =
      `Beste ${klantnaam},\n\n` +
      (volgendeStap === 1
        ? `Wij wijzen u vriendelijk op de onderstaande openstaande factuur waarvoor de betalingstermijn is verstreken.`
        : volgendeStap === 2
        ? `Ondanks onze eerdere herinnering ontvingen wij nog geen betaling voor de onderstaande factuur.`
        : `Dit is onze laatste herinnering. Wij verzoeken u dringend de betaling te voldoen.`) +
      `\n\nFactuurnummer: ${factuurnummer}` +
      `\nVervaldatum: ${formatDatum_(vervaldatum)}` +
      `\nOpenstaand bedrag: ${formatBedrag_(bedragOpen)}` +
      `\n\nGelieve dit bedrag over te maken naar ${getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || ''}` +
      ` o.v.v. ${factuurnummer}.\n\nMet vriendelijke groet,\n${bedrijf}`;

    if (!isGeldigEmail_(klantEmail)) {
      Logger.log(`Herinnering ${factuurnummer} overgeslagen: ongeldig e-mailadres "${klantEmail}"`);
      try { schrijfAuditLog_('Herinnering OVERGESLAGEN', factuurnummer + ' – ongeldig e-mailadres: ' + klantEmail); } catch (_) {}
      continue;
    }
    try {
      const opties = { name: bedrijf };
      if (pdfUrl) {
        try {
          opties.attachments = [DriveApp.getFileById(extractFileId_(pdfUrl)).getAs('application/pdf')];
        } catch (e) { /* PDF optioneel */ }
      }
      GmailApp.sendEmail(klantEmail, onderwerp, tekst, opties);
      props.setProperty(stapKey, String(volgendeStap));
      verwerkt++;  // tel alleen werkelijk verstuurde mails — voorkomt batch-skip bij scrolling
      Logger.log(`Herinnering stap ${volgendeStap}/3 verstuurd voor ${factuurnummer} naar ${klantEmail}`);
    } catch (err) {
      Logger.log(`Herinnering fout voor ${factuurnummer}: ${err.message}`);
      try { schrijfAuditLog_('Herinnering MISLUKT', factuurnummer + ' – ' + err.message); } catch (_) {}
    }
  }

  // Volledige sweep voltooid — reset cursor zodat volgende run weer vanaf rij 1 begint
  props.deleteProperty(CURSOR_KEY);
}

// ─────────────────────────────────────────────
//  HELPERS TRIGGERS
// ─────────────────────────────────────────────
function koppelBankTransactieAanFactuur_(ss, transactieId, ref, bedrag, isOntvangst, datum) {
  // Strikte match: ref is alleen geldig als hij EXACT in fnr staat
  // (eerder: fnr.includes(ref) || ref.includes(fnr) → 'F100' matchte 'F1000').
  // We accepteren een match als (a) ref === fnr, of (b) ref voorkomt als
  // hele woordeenheid in fnr (case-insensitive).
  const refNorm = String(ref || '').trim();
  if (!refNorm) return;
  const refRe = new RegExp('(^|\\W)' + refNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\W|$)', 'i');
  const matchFnr = (fnr) => {
    const f = String(fnr || '');
    return f === refNorm || refRe.test(f);
  };

  if (isOntvangst) {
    // Zoek open verkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][1]); // Factuurnummer
      if (!matchFnr(fnr)) continue;
      const totalIncl = parseFloat(data[i][12]) || 0;
      const reedsBetaald = parseFloat(data[i][13]) || 0;
      const openstaand = rondBedrag_(totalIncl - reedsBetaald);
      const tePlaatsen = Math.max(0, Math.min(bedrag, openstaand));
      if (tePlaatsen <= 0) break;
      const nieuwBetaald = rondBedrag_(reedsBetaald + tePlaatsen);
      const nieuwStatus = nieuwBetaald + 0.005 >= totalIncl
        ? FACTUUR_STATUS.BETAALD
        : FACTUUR_STATUS.DEELS_BETAALD;
      sheet.getRange(i + 1, 14).setValue(nieuwBetaald);   // Betaald bedrag
      sheet.getRange(i + 1, 15).setValue(nieuwStatus);    // Status
      if (nieuwStatus === FACTUUR_STATUS.BETAALD) {
        sheet.getRange(i + 1, 16).setValue(datum);        // Betaaldatum
      }
      // Boek de daadwerkelijke betaling van DEZE transactie (niet cumulatief).
      // Vóór de fix werd `nieuwBetaald` geboekt waardoor bij een tweede
      // deelbetaling het hele cumulatieve bedrag dubbel werd geboekt.
      maakJournaalpost_(ss, {
        datum,
        omschr: nieuwStatus === FACTUUR_STATUS.BETAALD
          ? `Ontvangst factuur ${fnr}`
          : `Deelbetaling factuur ${fnr}`,
        dagboek: 'Bankboek',
        debet: '1200', credit: '1100',
        bedrag: tePlaatsen,
        ref: fnr,
        type: BOEKING_TYPE.BANKONTVANGST,
      });
      break;
    }
  } else {
    // Zoek open inkoopfactuur
    const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const fnr = String(data[i][4]); // Factuurref leverancier
      if (!matchFnr(fnr)) continue;
      // Idempotency-guard: als al BETAALD, geen tweede journaalpost.
      const huidigeStatus = String(data[i][12] || '');
      if (huidigeStatus === FACTUUR_STATUS.BETAALD) break;
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

function markeerVervallenFacturen_(ss) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  // Day-only vergelijking: een factuur die VANDAAG vervalt is nog niet vervallen
  // (gebruiker mag tot eind van de dag betalen). Eerst tijd op 00:00 zetten.
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  // Markeer als VERVALLEN: status is VERZONDEN of DEELS_BETAALD én vervaldatum is voorbij.
  // Concepts skippen we (nog niet officieel verstuurd), BETAALD/GECREDITEERD is final.
  const teMarkeren = [FACTUUR_STATUS.VERZONDEN, FACTUUR_STATUS.DEELS_BETAALD];
  for (let i = 1; i < data.length; i++) {
    const status = data[i][14];
    if (teMarkeren.indexOf(status) === -1) continue;
    // Vervaldatum kan in cell als Date-object OF als string staan (na CSV-import).
    // parseDatum_ accepteert beide. Native new Date(stringNL) zou NaN geven.
    const ruwVerval = data[i][3];
    if (!ruwVerval) continue;
    const verval = (ruwVerval instanceof Date) ? ruwVerval : parseDatum_(ruwVerval);
    if (!verval || isNaN(verval.getTime())) continue;
    if (verval < vandaag) {
      sheet.getRange(i + 1, 15).setValue(FACTUUR_STATUS.VERVALLEN);
      sheet.getRange(i + 1, 15).setBackground('#FFCDD2');
    }
  }
}

function controleerBtwDeadlines_() {
  const vandaag = new Date();
  const jaar = vandaag.getFullYear();
  // Officiële BTW-aangifte deadlines: laatste dag van maand-na-kwartaal
  // Q1 (jan-mrt) → 30 april
  // Q2 (apr-jun) → 31 juli
  // Q3 (jul-sep) → 31 oktober
  // Q4 (okt-dec) → 31 januari volgend jaar
  const deadlines = [
    { kw: 1, datum: new Date(jaar, 3, 30) },
    { kw: 2, datum: new Date(jaar, 6, 31) },
    { kw: 3, datum: new Date(jaar, 9, 31) },
    { kw: 4, datum: new Date(jaar + 1, 0, 31) },
    // Ook Q4 vorig jaar — voor januari-reminders
    { kw: 4, datum: new Date(jaar, 0, 31), suffix: ' (' + (jaar - 1) + ')' },
  ];
  const email = getInstelling_('Email rapporten naar');
  if (!email || !isGeldigEmail_(email)) {
    if (email) {
      Logger.log('BTW-deadline check: ongeldig e-mailadres "' + email + '"');
      try { schrijfAuditLog_('BTW deadline check OVERGESLAGEN', 'Ongeldig e-mailadres: ' + email); } catch (_) {}
    }
    return;
  }

  for (const d of deadlines) {
    const dagenTot = Math.floor((d.datum - vandaag) / 86400000);
    if (dagenTot > 0 && dagenTot <= 14) {
      const kwLabel = 'Q' + d.kw + (d.suffix || '');
      try {
        GmailApp.sendEmail(email,
          `Herinnering: BTW aangifte ${kwLabel} deadline over ${dagenTot} dagen`,
          `Beste,\n\nDe deadline voor uw BTW aangifte ${kwLabel} is ${formatDatum_(d.datum)}.\n\n` +
          `Genereer uw aangifte via: Boekhouding → BTW → BTW aangifte ${kwLabel.replace(/\s.*/, '')}\n\n` +
          `Met vriendelijke groet,\nUw boekhoudprogramma`
        );
      } catch (err) {
        Logger.log('BTW deadline reminder mislukt: ' + err.message);
        try { schrijfAuditLog_('BTW reminder MISLUKT', kwLabel + ' – ' + err.message); } catch (_) {}
      }
    }
  }
}

function stuurFoutEmail_(context, err) {
  try {
    const email = getInstelling_('Email rapporten naar');
    if (email && isGeldigEmail_(email)) {
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
  const ss = getSpreadsheet_();
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
    // Defensief parsen: als een klant handmatig 'betaald' of een datum in
    // betaald-kolom zet, geven we liever €0 dan NaN in de herinneringsmail.
    const bedragOpen = rondBedrag_((parseFloat(data[i][12]) || 0) - (parseFloat(data[i][13]) || 0));
    const vervaldatum = data[i][3];
    if (bedragOpen <= 0) continue; // Geen herinnering sturen voor volledig betaalde factuur

    const iban = getInstelling_('Bankrekening op factuur') || getInstelling_('IBAN') || '';
    const bedrijf = getInstelling_('Bedrijfsnaam') || '';
    const vervalStr = formatDatum_(vervaldatum);
    const bedragStr = formatBedrag_(bedragOpen);

    const htmlBody =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:540px;color:#1A1A1A">' +
      '<div style="background:#B45309;padding:18px 22px;border-radius:8px 8px 0 0">' +
        '<div style="color:rgba(255,255,255,.85);font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Betalingsherinnering</div>' +
        '<div style="color:#fff;font-size:20px;font-weight:700">' + escHtml_(fnr) + '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E5EAF2;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.55">Wij kwamen deze factuur tegen als nog niet betaald. Mocht u al betaald hebben, negeer dan dit bericht.</p>' +
        '<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0;background:#F7F9FC;border-radius:6px">' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px">Openstaand</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:700;font-size:15px;color:#B45309">' + bedragStr + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Vervaldatum</td>' +
              '<td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px;border-top:1px solid #E5EAF2">' + vervalStr + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">IBAN</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(iban) + '</td></tr>' +
          '<tr><td style="padding:10px 14px;color:#5F6B7A;font-size:13px;border-top:1px solid #E5EAF2">Kenmerk</td>' +
              '<td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid #E5EAF2">' + escHtml_(fnr) + '</td></tr>' +
        '</table>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#5F6B7A">Bij vragen kunt u altijd reageren op deze mail.</p>' +
        '<p style="margin:14px 0 0;font-size:13px;color:#5F6B7A">Met vriendelijke groet,<br><strong style="color:#1A1A1A">' + escHtml_(bedrijf) + '</strong></p>' +
      '</div></div>';

    const tekst =
      'Beste klant,\n\n' +
      'Wij herinneren u vriendelijk aan factuur ' + fnr + '.\n\n' +
      'Openstaand: ' + bedragStr + '\nVervaldatum: ' + vervalStr + '\nIBAN: ' + iban +
      '\nKenmerk: ' + fnr + '\n\nMet vriendelijke groet,\n' + bedrijf;

    if (!isGeldigEmail_(klantEmail)) {
      Logger.log('Herinnering ' + fnr + ' overgeslagen: ongeldig e-mailadres "' + klantEmail + '"');
      try { schrijfAuditLog_('Herinnering OVERGESLAGEN', fnr + ' – ongeldig e-mailadres: ' + klantEmail); } catch (_) {}
      continue;
    }
    try {
      GmailApp.sendEmail(klantEmail,
        `Herinnering factuur ${fnr} · ${bedragStr}`,
        tekst,
        { htmlBody: htmlBody, name: bedrijf }
      );
      aantalVerstuurd++;
    } catch (err) {
      Logger.log('Herinnering ' + fnr + ' mislukt: ' + err.message);
      try { schrijfAuditLog_('Herinnering MISLUKT', fnr + ' – ' + err.message); } catch (_) {}
    }
  }

  SpreadsheetApp.getUi().alert(`${aantalVerstuurd} herinneringen verstuurd.`);
}

function haalRelatieEmail_(ss, relatieId) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  const data = sheet.getDataRange().getValues();
  const idStr = String(relatieId);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === idStr) return data[i][10]; // E-mailadres kolom
  }
  return null;
}

// ─────────────────────────────────────────────
//  AUDIT LOG TONEN (MENU-ACTIE)
// ─────────────────────────────────────────────
/**
 * Maakt het Audit Log-tabblad zichtbaar en activeert het.
 * Aanroepbaar vanuit het menu "Controle & Export → Audit Log tonen".
 */
function toonAuditLog() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (!sheet) {
    setupAuditLogSheet_();
    sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  }
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Audit Log',
      'Het Audit Log-tabblad kon niet worden aangemaakt. Voer eerst de setup uit.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  try { sheet.showSheet(); } catch (_) {}
  ss.setActiveSheet(sheet);
  schrijfAuditLog_('audit_log_geopend', 'gebruiker bekeek het Audit Log');
}

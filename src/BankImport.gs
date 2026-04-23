/**
 * BankImport.gs
 * CSV-import + auto-match voor banktransacties.
 *
 * Ondersteunt ING (semicolon, NL-header), Bunq (comma, EN-header) en
 * een generiek format (kolom-detectie op headers).
 *
 * FLOW:
 *   Menu → Bank → Bankafschrift importeren
 *   Dialoog plakken CSV → parseBankCsv_() → previewBankImport_() → verwerk
 *   Na import: autoMatchBank_() probeert elke transactie aan open factuur
 *   te koppelen op basis van (bedrag ± €0.01) + referentie-match in omschrijving.
 */

function openBankImportDialoog() {
  if (!controleerSetupGedaan_()) return;
  const html = HtmlService.createHtmlOutput(_bouwBankImportHtml_())
    .setWidth(720).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Bankafschrift importeren');
}

/**
 * Parse CSV-string naar transactie-objecten.
 * Returns: [{datum, omschr, bedrag, tegenrekening, tegenpartij, referentie}]
 * Bank-detectie via headers:
 *   - ING:   "Datum","Naam / Omschrijving","Rekening",...
 *   - Bunq:  "Date","Amount","Account","Counterparty","Description"
 *   - Generiek: probeert kolom-index te vinden op basis van keywords.
 */
function parseBankCsv_(csv) {
  if (!csv || typeof csv !== 'string') return [];
  const regels = csv.replace(/\r\n?/g, '\n').split('\n').filter(function(r) { return r.trim() !== ''; });
  if (regels.length < 2) return [];

  // Detecteer delimiter: ING gebruikt ";", Bunq ","
  const eersteRegel = regels[0];
  const delim = (eersteRegel.indexOf(';') >= 0 && eersteRegel.split(';').length > eersteRegel.split(',').length) ? ';' : ',';

  const headers = splitCsvRegel_(regels[0], delim).map(function(h) { return String(h || '').toLowerCase().trim(); });

  // Vind kolom-indices — flexibel zodat kleine variaties werken.
  const idx = {
    datum:         vindCsvKolom_(headers, ['datum', 'date', 'boekdatum', 'transactiedatum']),
    omschr:        vindCsvKolom_(headers, ['omschrijving', 'mededelingen', 'description', 'naam / omschrijving', 'beschrijving']),
    bedrag:        vindCsvKolom_(headers, ['bedrag', 'amount', 'bedrag (eur)', 'amount (eur)']),
    afBij:         vindCsvKolom_(headers, ['af bij', 'af/bij', 'debit/credit', 'type']),
    tegenrekening: vindCsvKolom_(headers, ['tegenrekening', 'counterparty account', 'tegenrekening iban/bban', 'iban/bban tegenrekening']),
    tegenpartij:   vindCsvKolom_(headers, ['naam tegenpartij', 'counterparty', 'tegenpartij', 'naam']),
  };

  const resultaat = [];
  for (let i = 1; i < regels.length; i++) {
    const velden = splitCsvRegel_(regels[i], delim);
    if (velden.length < 2) continue;

    const datumRw  = idx.datum  >= 0 ? velden[idx.datum]  : '';
    const omschrRw = idx.omschr >= 0 ? velden[idx.omschr] : '';
    const bedragRw = idx.bedrag >= 0 ? velden[idx.bedrag] : '0';
    const afBijRw  = idx.afBij  >= 0 ? String(velden[idx.afBij] || '').trim().toLowerCase() : '';

    const datum = parseBankDatum_(datumRw);
    let bedrag = parseBankBedrag_(bedragRw);
    if (afBijRw === 'af' || afBijRw === 'debit' || afBijRw === 'd') bedrag = -Math.abs(bedrag);
    else if (afBijRw === 'bij' || afBijRw === 'credit' || afBijRw === 'c') bedrag = Math.abs(bedrag);

    if (!datum || bedrag === 0) continue;

    resultaat.push({
      datum: datum,
      omschr: String(omschrRw || '').replace(/^"|"$/g, '').trim(),
      bedrag: rondBedrag_(bedrag),
      tegenrekening: idx.tegenrekening >= 0 ? String(velden[idx.tegenrekening] || '').trim() : '',
      tegenpartij:   idx.tegenpartij   >= 0 ? String(velden[idx.tegenpartij]   || '').replace(/^"|"$/g, '').trim() : '',
      referentie:    extraheerReferentie_(omschrRw),
    });
  }
  return resultaat;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function splitCsvRegel_(regel, delim) {
  // Simpele CSV splitter die quoted velden met ingevoegde delimiters respecteert.
  const res = [];
  let huidig = '', inQuote = false;
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === delim && !inQuote) { res.push(huidig); huidig = ''; continue; }
    huidig += c;
  }
  res.push(huidig);
  return res;
}

function vindCsvKolom_(headers, mogelijke) {
  for (let i = 0; i < headers.length; i++) {
    for (let j = 0; j < mogelijke.length; j++) {
      if (headers[i] === mogelijke[j] || headers[i].indexOf(mogelijke[j]) >= 0) return i;
    }
  }
  return -1;
}

function parseBankDatum_(s) {
  const str = String(s || '').trim().replace(/^"|"$/g, '');
  if (!str) return null;
  // ING: "20240115" of "2024-01-15", Bunq: "2024-01-15", anders dd-mm-yyyy of dd/mm/yyyy
  let m;
  if ((m = str.match(/^(\d{4})(\d{2})(\d{2})$/))) return new Date(m[1], parseInt(m[2]) - 1, parseInt(m[3]));
  if ((m = str.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(m[1], parseInt(m[2]) - 1, parseInt(m[3]));
  if ((m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/))) return new Date(m[3], parseInt(m[2]) - 1, parseInt(m[1]));
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseBankBedrag_(s) {
  const str = String(s || '').trim().replace(/^"|"$/g, '').replace(/€/g, '').replace(/\s/g, '');
  if (!str) return 0;
  // Bunq: "1234.56" of "-1234.56", ING: "1234,56"
  const normalized = str.indexOf(',') >= 0 && str.lastIndexOf('.') < str.indexOf(',')
    ? str.replace(/\./g, '').replace(',', '.')
    : str.replace(/,/g, '');
  const n = parseFloat(normalized);
  return isFinite(n) ? n : 0;
}

function extraheerReferentie_(omschr) {
  const s = String(omschr || '');
  // Typische factuurnummer-patronen: F000123, INV-2024-001, 2024-0042
  const m = s.match(/\b([A-Z]{1,4}[-_]?\d{3,10}|\d{4}[-_]\d{3,6})\b/i);
  return m ? m[1] : '';
}

// ─────────────────────────────────────────────
//  AUTO-MATCH: koppel banktransactie aan open factuur
// ─────────────────────────────────────────────

/**
 * Probeert elke geparste transactie te matchen met een open verkoopfactuur.
 * Match-criteria (oplopend in vertrouwen):
 *   1. Factuurnummer in omschrijving (hoogste zekerheid)
 *   2. Exact bedrag (±€0.01) én datum binnen 30 dagen na factuurdatum
 *
 * Retourneert lijst transacties met `.match = {factuurnummer, klant, zekerheid}` of null.
 */
function matchTransactiesMetFacturen_(ss, transacties) {
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet) return transacties;
  const vfData = vfSheet.getDataRange().getValues();
  const openFacturen = [];
  for (let i = 1; i < vfData.length; i++) {
    const status = vfData[i][14];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;
    const incl = parseFloat(vfData[i][12]) || 0;
    const betaald = parseFloat(vfData[i][13]) || 0;
    const open = rondBedrag_(incl - betaald);
    if (open <= 0) continue;
    openFacturen.push({
      rij: i + 1,
      nr: String(vfData[i][1] || ''),
      datum: vfData[i][2] ? new Date(vfData[i][2]) : null,
      klant: String(vfData[i][5] || ''),
      openBedrag: open,
    });
  }

  return transacties.map(function(t) {
    // Alleen positieve bedragen (ontvangsten) kunnen facturen betalen
    if (t.bedrag <= 0) { t.match = null; return t; }

    // Strategie 1: factuurnummer in omschrijving / referentie
    if (t.referentie) {
      const hit = openFacturen.find(function(f) {
        return f.nr && t.referentie.replace(/[-_ ]/g, '').toUpperCase()
                     === f.nr.replace(/[-_ ]/g, '').toUpperCase();
      });
      if (hit && Math.abs(hit.openBedrag - t.bedrag) < 0.02) {
        t.match = { factuurnummer: hit.nr, klant: hit.klant, zekerheid: 'hoog', rij: hit.rij };
        return t;
      }
    }

    // Strategie 2: exact bedrag + datum binnen 30 dagen
    const kandidaten = openFacturen.filter(function(f) {
      if (Math.abs(f.openBedrag - t.bedrag) > 0.02) return false;
      if (!f.datum || !t.datum) return false;
      const dagen = (t.datum - f.datum) / (1000 * 60 * 60 * 24);
      return dagen >= -3 && dagen <= 60; // kan iets vóór of na factuurdatum zijn
    });
    if (kandidaten.length === 1) {
      t.match = { factuurnummer: kandidaten[0].nr, klant: kandidaten[0].klant, zekerheid: 'medium', rij: kandidaten[0].rij };
    } else {
      t.match = null; // 0 of meerdere kandidaten → handmatig
    }
    return t;
  });
}

/**
 * Verwerk geïmporteerde + gematchte transacties:
 *   - voeg toe aan BANKTRANSACTIES sheet
 *   - markeer gematchte facturen als betaald (status + betaald-bedrag)
 *   - genereer journaalpost voor elke transactie (1200 ↔ 1100/diverse)
 *
 * @return {{toegevoegd:number, gematcht:number, fouten:string[]}}
 */
function verwerkBankImport_(ss, transacties) {
  const resultaat = { toegevoegd: 0, gematcht: 0, fouten: [] };
  const btSheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!btSheet) { resultaat.fouten.push('BANKTRANSACTIES-tab ontbreekt'); return resultaat; }

  transacties.forEach(function(t) {
    try {
      const transactieId = volgendTransactieId_ ? volgendTransactieId_() : ('BT-' + Date.now());
      const gekoppeldFactuur = t.match ? t.match.factuurnummer : '';
      const grootboek = t.bedrag > 0 ? '1100' : '';  // ontvangst → debiteuren; uitgave = onbekend, handmatig categoriseren
      const status = t.match ? 'Gekoppeld' : 'Ongekoppeld';

      btSheet.appendRow([
        transactieId,
        t.datum,
        t.omschr,
        t.bedrag,
        t.bedrag > 0 ? 'Ontvangst' : 'Betaling',
        '1200',                  // eigen bankrekening
        t.tegenrekening,
        t.tegenpartij,
        t.referentie,
        grootboek,
        '',                      // gekoppeld aan relatie (handmatig)
        gekoppeldFactuur,
        status,
        'Import CSV',
        new Date(),
      ]);
      resultaat.toegevoegd++;

      // Markeer factuur als betaald wanneer match zeker is
      if (t.match && vfSheet) {
        const rij = t.match.rij;
        const huidigBetaald = parseFloat(vfSheet.getRange(rij, 14).getValue()) || 0;
        const nieuwBetaald = rondBedrag_(huidigBetaald + t.bedrag);
        const totalIncl = parseFloat(vfSheet.getRange(rij, 13).getValue()) || 0;
        vfSheet.getRange(rij, 14).setValue(nieuwBetaald);
        vfSheet.getRange(rij, 15).setValue(nieuwBetaald >= totalIncl - 0.01 ? FACTUUR_STATUS.BETAALD : 'Deels betaald');
        resultaat.gematcht++;
      }
    } catch (e) {
      resultaat.fouten.push('Rij overgeslagen: ' + e.message);
    }
  });

  // Invalideer KPI-snapshot zodat dashboard direct nieuwe banksaldo toont
  try { if (typeof invalideerKpiSnapshot_ === 'function') invalideerKpiSnapshot_(); } catch (_) {}
  return resultaat;
}

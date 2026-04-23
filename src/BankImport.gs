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

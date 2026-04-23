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
  // ── Open verkoopfacturen (ontvangsten) ─────────────────────────────────
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const openFacturen = [];
  if (vfSheet) {
    const vfData = vfSheet.getDataRange().getValues();
    for (let i = 1; i < vfData.length; i++) {
      const status = vfData[i][14];
      if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;
      const incl = parseFloat(vfData[i][12]) || 0;
      const betaald = parseFloat(vfData[i][13]) || 0;
      const open = rondBedrag_(incl - betaald);
      if (open <= 0) continue;
      openFacturen.push({
        rij: i + 1, nr: String(vfData[i][1] || ''),
        datum: vfData[i][2] ? new Date(vfData[i][2]) : null,
        klant: String(vfData[i][5] || ''), openBedrag: open,
      });
    }
  }

  // ── Open inkoopfacturen (uitgaven) ────────────────────────────────────
  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  const openInkoop = [];
  if (ifSheet) {
    const ifData = ifSheet.getDataRange().getValues();
    for (let i = 1; i < ifData.length; i++) {
      if (ifData[i][12] === FACTUUR_STATUS.BETAALD) continue;
      const incl = parseFloat(ifData[i][11]) || 0;
      if (incl <= 0) continue;
      openInkoop.push({
        rij: i + 1, nr: String(ifData[i][1] || ''),
        datum: ifData[i][3] ? new Date(ifData[i][3]) : null,
        leverancier: String(ifData[i][6] || ''),
        ref: String(ifData[i][4] || ''),
        openBedrag: rondBedrag_(incl),
      });
    }
  }

  return transacties.map(function(t) {
    // Uitgaven (negatieve bedragen) matchen tegen open inkoopfacturen
    if (t.bedrag < 0) {
      const bedragAbs = Math.abs(t.bedrag);
      // Strategie 1: leveranciersreferentie of factuurnummer in omschrijving
      if (t.referentie) {
        const hit = openInkoop.find(function(f) {
          const fId = (f.nr + ' ' + f.ref).replace(/[-_ ]/g, '').toUpperCase();
          const tId = t.referentie.replace(/[-_ ]/g, '').toUpperCase();
          return fId.indexOf(tId) >= 0 && Math.abs(f.openBedrag - bedragAbs) < 0.02;
        });
        if (hit) { t.match = { type: 'inkoop', factuurnummer: hit.nr, klant: hit.leverancier, zekerheid: 'hoog', rij: hit.rij }; return t; }
      }
      // Strategie 2: bedrag + datum binnen 60 dagen na factuurdatum
      const kandidaten = openInkoop.filter(function(f) {
        if (Math.abs(f.openBedrag - bedragAbs) > 0.02) return false;
        if (!f.datum || !t.datum) return false;
        const dagen = (t.datum - f.datum) / (1000 * 60 * 60 * 24);
        return dagen >= -3 && dagen <= 90;
      });
      if (kandidaten.length === 1) {
        t.match = { type: 'inkoop', factuurnummer: kandidaten[0].nr, klant: kandidaten[0].leverancier, zekerheid: 'medium', rij: kandidaten[0].rij };
      } else { t.match = null; }
      return t;
    }

    // Ontvangsten (positief) matchen tegen open verkoopfacturen
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

      // Grootboek-bepaling:
      //  - Gematchte factuur → 1100 (debiteuren) = ontvangen betaling
      //  - Ongekoppelde ontvangst → 1100 (klant betaalt voor onbekende factuur)
      //  - Ongekoppelde uitgave → probeer via SmartCategorisatie keyword-match
      let grootboek = '';
      if (t.match) {
        grootboek = '1100';
      } else if (t.bedrag > 0) {
        grootboek = '1100';
      } else if (typeof suggereerCategorie_ === 'function') {
        try {
          const sug = suggereerCategorie_(t.omschr, t.tegenpartij, t.bedrag);
          if (sug && sug.zekerheid >= 75) grootboek = sug.rekening;
        } catch (_) { /* suggesties mogen niet breken */ }
      }
      const status = t.match ? 'Gekoppeld' : (grootboek ? 'Auto-gecategoriseerd' : 'Ongekoppeld');

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

      // Markeer verkoopfactuur als (deels) betaald — voor ontvangsten
      if (t.match && t.match.type !== 'inkoop' && vfSheet) {
        const rij = t.match.rij;
        const huidigBetaald = parseFloat(vfSheet.getRange(rij, 14).getValue()) || 0;
        const nieuwBetaald = rondBedrag_(huidigBetaald + t.bedrag);
        const totalIncl = parseFloat(vfSheet.getRange(rij, 13).getValue()) || 0;
        vfSheet.getRange(rij, 14).setValue(nieuwBetaald);
        vfSheet.getRange(rij, 15).setValue(nieuwBetaald >= totalIncl - 0.01 ? FACTUUR_STATUS.BETAALD : 'Deels betaald');
        resultaat.gematcht++;
      }
      // Markeer inkoopfactuur als betaald — voor uitgaven
      if (t.match && t.match.type === 'inkoop') {
        const ifSh = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
        if (ifSh) {
          const rij = t.match.rij;
          ifSh.getRange(rij, 13).setValue(FACTUUR_STATUS.BETAALD);   // Status kolom [12] → 1-indexed = 13
          ifSh.getRange(rij, 14).setValue(t.datum);                  // Betaaldatum kolom [13]
          resultaat.gematcht++;
        }
      }
    } catch (e) {
      resultaat.fouten.push('Rij overgeslagen: ' + e.message);
    }
  });

  // Invalideer KPI-snapshot zodat dashboard direct nieuwe banksaldo toont
  try { if (typeof invalideerKpiSnapshot_ === 'function') invalideerKpiSnapshot_(); } catch (_) {}
  return resultaat;
}

// ─────────────────────────────────────────────
//  PUBLIC ENDPOINTS (aangeroepen vanuit HTML dialog)
// ─────────────────────────────────────────────

function previewBankImport_public(csv) {
  const ss = getSpreadsheet_();
  const transacties = parseBankCsv_(csv);
  const gematcht = matchTransactiesMetFacturen_(ss, transacties);
  return {
    aantal: gematcht.length,
    voorbeeld: gematcht.slice(0, 50).map(function(t) {
      return {
        datum: t.datum ? Utilities.formatDate(t.datum, 'Europe/Amsterdam', 'dd-MM-yyyy') : '',
        omschr: String(t.omschr || '').substring(0, 60),
        bedrag: t.bedrag,
        tegenpartij: String(t.tegenpartij || '').substring(0, 30),
        match: t.match ? (t.match.factuurnummer + ' (' + t.match.zekerheid + ')') : '',
      };
    }),
  };
}

function verwerkBankImport_public(csv) {
  const ss = getSpreadsheet_();
  const transacties = parseBankCsv_(csv);
  const gematcht = matchTransactiesMetFacturen_(ss, transacties);
  const resultaat = verwerkBankImport_(ss, gematcht);
  try { schrijfAuditLog_('Bank CSV geïmporteerd', resultaat.toegevoegd + ' transacties, ' + resultaat.gematcht + ' gematcht'); } catch (_) {}
  return resultaat;
}

// ─────────────────────────────────────────────
//  HTML DIALOG
// ─────────────────────────────────────────────

function _bouwBankImportHtml_() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;font-size:13px;color:#1A1A1A;background:#F7F9FC;padding:18px 22px}' +
    'h2{color:#0D1B4E;font-size:17px;font-weight:700;margin-bottom:4px}' +
    '.uitleg{color:#5F6B7A;font-size:12px;margin-bottom:14px;line-height:1.5}' +
    'textarea{width:100%;height:140px;padding:10px;border:1px solid #E5EAF2;border-radius:6px;font-family:monospace;font-size:11px;resize:vertical;background:#fff}' +
    'textarea:focus{outline:none;border-color:#2EC4B6;box-shadow:0 0 0 3px rgba(46,196,182,.15)}' +
    '.btn-rij{display:flex;gap:10px;margin-top:10px}' +
    '.btn{padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit}' +
    '.btn-primary{background:#0D1B4E;color:#fff}' +
    '.btn-primary:hover{background:#1A2A6B}' +
    '.btn-secondary{background:#fff;color:#0D1B4E;border:1px solid #E5EAF2}' +
    '.btn-secondary:hover{background:#F7F9FC}' +
    '.btn:disabled{opacity:.5;cursor:not-allowed}' +
    '#preview{margin-top:14px;max-height:280px;overflow-y:auto;background:#fff;border:1px solid #E5EAF2;border-radius:6px;display:none}' +
    'table{width:100%;border-collapse:collapse;font-size:11px}' +
    'th{background:#F7F9FC;padding:6px 8px;text-align:left;font-weight:600;color:#5F6B7A;border-bottom:1px solid #E5EAF2;position:sticky;top:0}' +
    'td{padding:6px 8px;border-bottom:1px solid #F3F5F9}' +
    '.bedrag{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}' +
    '.pos{color:#15803D}.neg{color:#B91C1C}' +
    '.match-hoog{background:#E6F7F4;color:#0D6A5B;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600}' +
    '.match-medium{background:#FFF8E1;color:#7A5A00;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600}' +
    '.status{margin-top:10px;padding:10px 14px;border-radius:6px;font-size:12px;display:none}' +
    '.status.ok{background:#E6F7F4;color:#0D6A5B;border:1px solid #A6E2D4;display:block}' +
    '.status.fout{background:#FDECEC;color:#B91C1C;border:1px solid #F5B3B3;display:block}' +
    '</style></head><body>' +
    '<h2>Bankafschrift importeren</h2>' +
    '<p class="uitleg">Download je bankafschrift als CSV (ING, Bunq, Rabo, ABN, etc.) en plak hier. Open facturen worden automatisch gekoppeld als het bedrag én factuurnummer matchen.</p>' +
    '<textarea id="csv" placeholder="Plak hier je CSV (met header-rij). Voorbeeld ING: &#10;&#34;Datum&#34;,&#34;Naam / Omschrijving&#34;,&#34;Rekening&#34;,...&#10;&#34;20240115&#34;,&#34;Klant BV&#34;,&#34;NL..&#34;,..."></textarea>' +
    '<div class="btn-rij">' +
    '  <button class="btn btn-secondary" onclick="preview()">Controleer preview</button>' +
    '  <button class="btn btn-primary" id="btn-verwerk" onclick="verwerk()" disabled>Importeer &amp; koppel aan facturen</button>' +
    '</div>' +
    '<div id="status" class="status"></div>' +
    '<div id="preview"></div>' +
    '<script>' +
    'function preview(){' +
    '  var csv=document.getElementById("csv").value.trim();' +
    '  if(!csv){ zetStatus("fout","Plak eerst je CSV."); return; }' +
    '  zetStatus("ok","Even geduld — regels worden geparsed…");' +
    '  google.script.run.withSuccessHandler(render).withFailureHandler(function(e){zetStatus("fout","Fout: "+e.message);}).previewBankImport_public(csv);' +
    '}' +
    'function render(res){' +
    '  if(!res||res.aantal===0){ zetStatus("fout","Geen geldige transacties gevonden. Controleer CSV formaat."); return; }' +
    '  var h=\'<table><thead><tr><th>Datum</th><th>Omschrijving</th><th>Tegenpartij</th><th style="text-align:right">Bedrag</th><th>Match</th></tr></thead><tbody>\';' +
    '  res.voorbeeld.forEach(function(t){' +
    '    var klasse=t.bedrag>=0?"pos":"neg";' +
    '    var mKlasse=t.match.indexOf("hoog")>=0?"match-hoog":(t.match?"match-medium":"");' +
    '    h+=\'<tr><td>\'+t.datum+\'</td><td>\'+esc(t.omschr)+\'</td><td>\'+esc(t.tegenpartij)+\'</td><td class="bedrag \'+klasse+\'">\'+fmt(t.bedrag)+\'</td><td>\'+(t.match?\'<span class="\'+mKlasse+\'">\'+esc(t.match)+\'</span>\':"")+\'</td></tr>\';' +
    '  });' +
    '  h+="</tbody></table>";' +
    '  document.getElementById("preview").innerHTML=h;' +
    '  document.getElementById("preview").style.display="block";' +
    '  zetStatus("ok",res.aantal+" transacties gevonden. Klik op \'Importeer\' om ze toe te voegen en te matchen aan open facturen.");' +
    '  document.getElementById("btn-verwerk").disabled=false;' +
    '}' +
    'function verwerk(){' +
    '  var csv=document.getElementById("csv").value.trim();' +
    '  document.getElementById("btn-verwerk").disabled=true;' +
    '  zetStatus("ok","Importeren…");' +
    '  google.script.run.withSuccessHandler(function(r){' +
    '    zetStatus("ok","✓ "+r.toegevoegd+" transactie(s) toegevoegd, "+r.gematcht+" automatisch gekoppeld aan factuur. "+(r.fouten.length?r.fouten.length+" fouten.":"") );' +
    '  }).withFailureHandler(function(e){zetStatus("fout","Fout: "+e.message);document.getElementById("btn-verwerk").disabled=false;})' +
    '   .verwerkBankImport_public(csv);' +
    '}' +
    'function zetStatus(k,t){var s=document.getElementById("status");s.className="status "+k;s.textContent=t;}' +
    'function esc(s){return String(s||"").replace(/[&<>"\\\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\\'":"&#39;"}[c];});}' +
    'function fmt(b){b=parseFloat(b)||0;return(b<0?"-€":"€")+Math.abs(b).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});}' +
    '<\/script></body></html>';
}

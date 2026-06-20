/**
 * XafExport40.gs
 *
 * Genereer een Auditfile Financieel **XAF 4.0** (de per 1-1-2026 verplichte
 * opvolger van 3.2). Gebouwd tegen de officiële XSD van de Belastingdienst-ODB
 * (`docs/xaf/XmlAuditfileFinancieel4.0.xsd`) + het officiële testbestand. De
 * output wordt in de testsuite tegen die XSD gevalideerd met `xmllint`.
 *
 * Fiscaal model (n.a.v. accountant-/Belastingdienst-review):
 *  - BTW staat al als APARTE grootboekmutatie op de BTW-rekeningen (14xx
 *    voorbelasting / 41xx af te dragen). Daarom bewust GEEN los <vat>-blok per
 *    regel: dat zou de BTW dubbeltellen / op de verkeerde regel leggen. De BTW
 *    is volledig uit het grootboek te reconstrueren. <vatCodes> documenteert
 *    wél de koppeling code → BTW-rekening (vatToPay/ClaimAccID).
 *  - Alle saldo-rakende journaalposten — incl. Concept én Gestorneerd — want
 *    de saldibalans op het scherm moet aansluiten op de auditfile (C-1, #324).
 *    Alleen CORRUPT-rijen eruit: hun saldo is al atomair teruggedraaid.
 *  - Controletotalen (linesCount/totalDebit/totalCredit) zodat een verwerker de
 *    volledigheid kan checken.
 *  - RGS-codes per grootboekrekening (RGScode) zodat accountants direct mappen.
 */

'use strict';

const XAF40_NAMESPACE = 'http://www.odb.belastingdienst.nl/Belastingdienst/BCPP/1.1/structures/XmlauditfileXAF_4.0';

/**
 * Bouw de volledige XAF 4.0-XML. Spiegelt de XSD-sequence exact:
 * header → company(Commercenr?, companyName, taxRegistrationCountry,
 * taxRegIdent, customersSuppliers?, generalLedger?, vatCodes?, periods?,
 * openingBalance?, transactions?).
 */
function _bouwXaf40Xml_(ss, jaarArg) {
  const jaar = (isFinite(parseInt(jaarArg, 10)) && jaarArg >= 2000 && jaarArg <= 2099)
    ? parseInt(jaarArg, 10)
    : new Date().getFullYear();
  const bedrijfsnaam = (typeof getInstelling_ === 'function' ? getInstelling_('Bedrijfsnaam') : '') || 'Onbenoemd';
  const kvk = (typeof getInstelling_ === 'function' ? getInstelling_('KvK-nummer') : '') || '';
  const btwNr = (typeof getInstelling_ === 'function' ? getInstelling_('BTW-nummer') : '') || '';
  const vandaag = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
  const versie = (typeof HUIDIGE_VERSIE !== 'undefined') ? String(HUIDIGE_VERSIE) : '?';

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<auditfile xmlns="' + XAF40_NAMESPACE + '">\n';

  // ── header ──
  xml += '  <header>\n';
  xml += '    <fiscalYear>' + jaar + '</fiscalYear>\n';
  xml += '    <startDate>' + jaar + '-01-01</startDate>\n';
  xml += '    <endDate>' + jaar + '-12-31</endDate>\n';
  xml += '    <curCode>EUR</curCode>\n';
  xml += '    <dateCreated>' + vandaag + '</dateCreated>\n';
  xml += '    <softwareDesc>Boekhoudbaar</softwareDesc>\n';
  xml += '    <softwareVersion>' + _xafEsc_(versie.substring(0, 20)) + '</softwareVersion>\n';
  // RGSVersion bewust weggelaten: "RGS 3.5" bestaat niet als release (actuele
  // RGS-versies zijn 3.4/3.7/3.8). Het veld is optioneel in de XSD; de RGScode-
  // codes per rekening blijven gewoon staan. Voeg een geverifieerde versie toe
  // zodra die tegen rgsnl.nl is bevestigd.
  xml += '  </header>\n';

  // ── company ── (taxRegistrationCountry + taxRegIdent zijn VERPLICHT)
  xml += '  <company>\n';
  if (kvk) xml += '    <Commercenr>' + _xafEsc_(kvk.substring(0, 100)) + '</Commercenr>\n';
  xml += '    <companyName>' + _xafEsc_(bedrijfsnaam.substring(0, 255)) + '</companyName>\n';
  xml += '    <taxRegistrationCountry>NL</taxRegistrationCountry>\n';
  xml += '    <taxRegIdent>' + _xafEsc_(btwNr.substring(0, 30)) + '</taxRegIdent>\n';
  try { xml += _xaf40Relaties_(ss); } catch (e) { Logger.log('XAF4.0: relaties overgeslagen: ' + e.message); }
  xml += _xaf40Grootboek_(ss);
  xml += _xaf40VatCodes_();
  xml += _xaf40Periods_(jaar);
  // F-SCALE-330: lees JOURNAALPOSTEN ÉÉN keer en deel de array met beide loops.
  // De openingsbalans (F-ACC-161) en de transacties scannen hetzelfde (continu,
  // niet-resettende) journaal; bij een meerjarige administratie met tienduizenden
  // rijen waren dat 2× volledige sheet-read + 2 arrays tegelijk in het heap →
  // eerste plek die tegen de 6-min-/geheugengrens loopt op de consumer-tier.
  const jpData = _xaf40JournaalData_(ss);
  // F-ACC-161: openingsbalans (1-1) zodat een auditfile van jaar-2+ op zichzelf
  // staat — eindbalans N−1 == openingsbalans N (RJ 160/170). Optioneel in de
  // XSD; fail-open zodat een fout de auditfile niet sloopt.
  try { xml += _xaf40OpeningBalance_(ss, jaar, jpData); } catch (e) { Logger.log('XAF4.0: openingsbalans overgeslagen: ' + e.message); }
  xml += _xaf40Transactions_(ss, jaar, jpData);
  xml += '  </company>\n';

  xml += '</auditfile>\n';
  return xml;
}

/** customersSuppliers — zelfde structuur als de 3.2-fix, XSD-volgorde. */
function _xaf40Relaties_(ss) {
  const sheet = ss.getSheetByName(SHEETS.RELATIES);
  if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return '';
  let rel = '';
  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    const relatieId = String(rij[0] || '').trim();
    const type = String(rij[1] || '').toLowerCase();
    const naam = String(rij[2] || '').trim();
    if (!naam) continue;
    const kvk = String(rij[8] || '').trim();
    const btw = String(rij[9] || '').trim();
    const email = String(rij[10] || '').trim();
    const tp = (type.indexOf('lever') === 0) ? 'S' : 'C';
    const land = /^[A-Za-z]{2}/.test(btw) ? btw.substring(0, 2).toUpperCase() : 'NL';
    rel += '        <customerSupplier>\n';
    rel += '          <custSupID>' + _xafEsc_((relatieId || naam).substring(0, 35)) + '</custSupID>\n';
    rel += '          <custSupName>' + _xafEsc_(naam.substring(0, 50)) + '</custSupName>\n';
    if (email) rel += '          <eMail>' + _xafEsc_(email) + '</eMail>\n';
    if (kvk) rel += '          <commerceNr>' + _xafEsc_(kvk.substring(0, 100)) + '</commerceNr>\n';
    if (btw) {
      rel += '          <taxRegistrationCountry>' + land + '</taxRegistrationCountry>\n';
      rel += '          <taxRegIdent>' + _xafEsc_(btw.substring(0, 30)) + '</taxRegIdent>\n';
    }
    rel += '          <custSupTp>' + tp + '</custSupTp>\n';
    rel += '        </customerSupplier>\n';
  }
  if (!rel) return '';
  return '    <customersSuppliers>\n' + rel + '    </customersSuppliers>\n';
}

/** generalLedger — accID/accDesc/accTp(B|P)/RGScode?. Leeg → weggelaten. */
function _xaf40Grootboek_(ss) {
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  let acc = '';
  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    const code = String(rij[0] || '').trim();
    const naam = String(rij[1] || '').trim();
    if (!code) continue;
    const bw = String(rij[4] || '').trim().toLowerCase().charAt(0);
    let accTp;
    if (bw === 'b') accTp = 'B';
    else if (bw === 'w') accTp = 'P';
    else { const c = code.charAt(0); accTp = (c >= '4' && c <= '9') ? 'P' : 'B'; }
    acc += '        <ledgerAccount>\n';
    acc += '          <accID>' + _xafEsc_(code.substring(0, 35)) + '</accID>\n';
    acc += '          <accDesc>' + _xafEsc_(naam.substring(0, 255)) + '</accDesc>\n';
    acc += '          <accTp>' + accTp + '</accTp>\n';
    if (typeof getRgsCode_ === 'function') {
      const rgs = getRgsCode_(code);
      if (rgs) acc += '          <RGScode>' + _xafEsc_(String(rgs).substring(0, 255)) + '</RGScode>\n';
    }
    acc += '        </ledgerAccount>\n';
  }
  if (!acc) return '';
  return '    <generalLedger>\n' + acc + '    </generalLedger>\n';
}

/** vatCodes — vaste NL-tarieven + koppeling naar de BTW-grootboekrekeningen. */
function _xaf40VatCodes_() {
  let xml = '    <vatCodes>\n';
  xml += '      <vatCode><vatID>21</vatID><vatDesc>BTW hoog 21%</vatDesc><vatToPayAccID>4110</vatToPayAccID><vatToClaimAccID>1410</vatToClaimAccID></vatCode>\n';
  xml += '      <vatCode><vatID>9</vatID><vatDesc>BTW laag 9%</vatDesc><vatToPayAccID>4120</vatToPayAccID><vatToClaimAccID>1420</vatToClaimAccID></vatCode>\n';
  xml += '      <vatCode><vatID>0</vatID><vatDesc>BTW nultarief 0%</vatDesc></vatCode>\n';
  xml += '    </vatCodes>\n';
  return xml;
}

/** periods — 12 maand-perioden (de transacties verwijzen ernaar via periodNumber). */
function _xaf40Periods_(jaar) {
  const dagen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0) dagen[1] = 29;
  let xml = '    <periods>\n';
  for (let m = 1; m <= 12; m++) {
    const mm = (m < 10 ? '0' : '') + m;
    xml += '      <period><periodNumber>' + m + '</periodNumber>'
      + '<startDatePeriod>' + jaar + '-' + mm + '-01</startDatePeriod>'
      + '<endDatePeriod>' + jaar + '-' + mm + '-' + dagen[m - 1] + '</endDatePeriod></period>\n';
  }
  xml += '    </periods>\n';
  return xml;
}

/** Dagboek-classificatie (V/I/B/K/M) → XAF 4.0 jrnTp-enum. */
function _xaf40Jrntp_(id) {
  switch (id) {
    case 'V': return 'S'; // Sales (verkoop)
    case 'I': return 'P'; // Purchase (inkoop)
    case 'B': return 'B'; // Bank
    case 'K': return 'C'; // Cash (kas)
    case 'M': return 'M'; // Memoriaal
    default: return 'O';  // Other
  }
}

/** Eén trLine (XSD-volgorde: nr, accID, docRef, effDate, desc, amnt, amntTp). */
function _xaf40TrLine_(nr, accID, docRef, datum, desc, bedrag, tp) {
  return '          <trLine>\n'
    + '            <nr>' + nr + '</nr>\n'
    + '            <accID>' + _xafEsc_(String(accID).substring(0, 35)) + '</accID>\n'
    + '            <docRef>' + _xafEsc_(String(docRef).substring(0, 255)) + '</docRef>\n'
    + '            <effDate>' + datum + '</effDate>\n'
    + '            <desc>' + _xafEsc_(desc) + '</desc>\n'
    + '            <amnt>' + bedrag.toFixed(2) + '</amnt>\n'
    + '            <amntTp>' + tp + '</amntTp>\n'
    + '          </trLine>\n';
}

/**
 * openingBalance — saldo per grootboekrekening op 1-1 van het fiscaal jaar.
 *
 * Reconstructie uit het continue journaal: de administratie loopt door over
 * jaren (sluitJaarAf archiveert + boekt resultaat, maar reset het journaal
 * niet). Het 1-1-saldo van een rekening = de netto-som van ÁLLE niet-CORRUPT
 * journaalposten met datum < 1-1-jaar (debet +, credit −). Balansrekeningen
 * dragen zo hun cumulatieve saldo; W&V-rekeningen netten naar 0 doordat de
 * resultaatverwerking (JA-/JO-boekingen) ze elk jaar afsluit → vallen vanzelf
 * weg. Gevolg-invariant: openingsbalans + transacties(jaar) = het grootboeksaldo
 * — afgezien van eventuele openstaande CORRUPT-halfboekingen (triple-fail: debet
 * geboekt, credit + rollback gefaald). Die raken het grootboeksaldo wél maar
 * horen in geen enkele auditfile en moeten apart hersteld worden. Σdebet ==
 * Σcredit blijft sowieso (elke bron-boeking die meetelt is gebalanceerd).
 *
 * Jaar 1 (geen historie) → geen obLines → leeg blok weggelaten (XSD: optioneel).
 */
function _xaf40JournaalData_(ss) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  return sheet ? sheet.getDataRange().getValues() : [];
}

function _xaf40OpeningBalance_(ss, jaar, jpData) {
  const data = jpData || _xaf40JournaalData_(ss);
  if (!data.length) return '';
  const startJaar = new Date(jaar, 0, 1);
  const nettoCent = {};   // accID -> netto centen (debet positief, credit negatief)

  for (let i = 1; i < data.length; i++) {
    const rij = data[i];
    // Alleen CORRUPT eruit — exact zoals _xaf40Transactions_ (consistentie).
    if ((rij.length > 16 ? String(rij[16] || '').trim().toUpperCase() : '') === 'CORRUPT') continue;
    const datumObj = rij[1] instanceof Date
      ? rij[1]
      : ((typeof parseDatum_ === 'function') ? parseDatum_(rij[1]) : new Date(rij[1]));
    if (!datumObj || isNaN(datumObj.getTime()) || datumObj >= startJaar) continue;  // alleen vóór het jaar
    const debet = String(rij[4] || '').trim();
    const credit = String(rij[6] || '').trim();
    const cent = Math.round((parseFloat(rij[8]) || 0) * 100);
    if (!debet || !credit || cent <= 0) continue;
    nettoCent[debet] = (nettoCent[debet] || 0) + cent;
    nettoCent[credit] = (nettoCent[credit] || 0) - cent;
  }

  const accIDs = Object.keys(nettoCent).filter(function (a) { return nettoCent[a] !== 0; }).sort();
  if (accIDs.length === 0) return '';   // geen historie → geen openingsbalans

  let totalDebitCent = 0, totalCreditCent = 0, lines = '';
  accIDs.forEach(function (acc, idx) {
    const c = nettoCent[acc];
    const amntTp = c >= 0 ? 'D' : 'C';
    const amntCent = Math.abs(c);
    if (amntTp === 'D') totalDebitCent += amntCent; else totalCreditCent += amntCent;
    lines += '      <obLine>\n';
    lines += '        <nr>' + (idx + 1) + '</nr>\n';
    lines += '        <accID>' + _xafEsc_(String(acc).substring(0, 35)) + '</accID>\n';
    lines += '        <amnt>' + (amntCent / 100).toFixed(2) + '</amnt>\n';
    lines += '        <amntTp>' + amntTp + '</amntTp>\n';
    lines += '      </obLine>\n';
  });

  let xml = '    <openingBalance>\n';
  xml += '      <linesCount>' + accIDs.length + '</linesCount>\n';
  xml += '      <totalDebit>' + (totalDebitCent / 100).toFixed(2) + '</totalDebit>\n';
  xml += '      <totalCredit>' + (totalCreditCent / 100).toFixed(2) + '</totalCredit>\n';
  xml += lines;
  xml += '    </openingBalance>\n';
  return xml;
}

/**
 * transactions — controletotalen + journals (gegroepeerd per dagboek). Elke
 * journaalpost-rij = één gebalanceerde transaction (1 debet- + 1 creditregel).
 * Alleen COMMITTED-rijen van het fiscaal jaar.
 */
function _xaf40Transactions_(ss, jaar, jpData) {
  const data = jpData || _xaf40JournaalData_(ss);
  const grouped = {}; // klassId -> { desc, jrnTp, tx }
  let linesCount = 0;
  let debitCents = 0;
  let creditCents = 0;

  if (data.length) {
    for (let i = 1; i < data.length; i++) {
      const rij = data[i];
      // Spiegel het grootboek: élke boeking die het saldo raakt hoort in de
      // export, zodat de aangeleverde saldibalans = de export (dé controle-test).
      // Alleen CORRUPT (half-geboekt, saldo al teruggedraaid via atomic rollback)
      // valt eruit — die zit ook niet in het grootboek/de rapporten. Concept én
      // Gestorneerd tellen WÉL mee in het grootboeksaldo, dus ook hier; anders
      // sluit de balans op het scherm niet aan op de geleverde auditfile.
      if ((rij.length >= 17 ? String(rij[16] || '').trim().toUpperCase() : '') === 'CORRUPT') continue;
      const id = String(rij[0] || '').trim();

      let datum = rij[1];
      let datumObj = datum instanceof Date ? datum : null;
      if (datum instanceof Date) {
        if (datum.getFullYear() !== jaar) continue;
        datum = Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd');
      } else if (!datum) {
        continue;
      } else {
        datum = String(datum);
        datumObj = (typeof parseDatum_ === 'function') ? parseDatum_(datum) : new Date(datum);
        if (!datumObj || isNaN(datumObj.getTime()) || datumObj.getFullYear() !== jaar) continue;
        datum = Utilities.formatDate(datumObj, 'Europe/Amsterdam', 'yyyy-MM-dd');
      }

      const omschr = String(rij[2] || '').trim();
      const dagboek = String(rij[3] || '').trim();
      const debet = String(rij[4] || '').trim();
      const credit = String(rij[6] || '').trim();
      const bedrag = Math.round((parseFloat(rij[8]) || 0) * 100) / 100;
      if (!id || !debet || !credit || bedrag <= 0) continue;

      const periode = (datumObj && !isNaN(datumObj.getTime())) ? datumObj.getMonth() + 1 : 1;
      const klass = _xafDagboekClassificeer_(dagboek);
      if (!grouped[klass.id]) grouped[klass.id] = { desc: klass.desc, jrnTp: _xaf40Jrntp_(klass.id), tx: '' };

      let tx = '        <transaction>\n';
      tx += '          <nr>' + _xafEsc_(id.substring(0, 35)) + '</nr>\n';
      tx += '          <desc>' + _xafEsc_(omschr) + '</desc>\n';
      tx += '          <periodNumber>' + periode + '</periodNumber>\n';
      tx += '          <trDt>' + datum + '</trDt>\n';
      tx += _xaf40TrLine_(1, debet, id, datum, omschr, bedrag, 'D');
      tx += _xaf40TrLine_(2, credit, id, datum, omschr, bedrag, 'C');
      tx += '        </transaction>\n';

      grouped[klass.id].tx += tx;
      linesCount += 2;
      debitCents += Math.round(bedrag * 100);
      creditCents += Math.round(bedrag * 100);
    }
  }

  let journals = '';
  Object.keys(grouped).forEach(function (jid) {
    if (!grouped[jid].tx) return;
    journals += '      <journal>\n';
    journals += '        <jrnID>' + _xafEsc_(jid) + '</jrnID>\n';
    journals += '        <desc>' + _xafEsc_(grouped[jid].desc) + '</desc>\n';
    journals += '        <jrnTp>' + grouped[jid].jrnTp + '</jrnTp>\n';
    journals += grouped[jid].tx;
    journals += '      </journal>\n';
  });

  let xml = '    <transactions>\n';
  xml += '      <linesCount>' + linesCount + '</linesCount>\n';
  xml += '      <totalDebit>' + (debitCents / 100).toFixed(2) + '</totalDebit>\n';
  xml += '      <totalCredit>' + (creditCents / 100).toFixed(2) + '</totalCredit>\n';
  xml += journals;
  xml += '    </transactions>\n';
  return xml;
}

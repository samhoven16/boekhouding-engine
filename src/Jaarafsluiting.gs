/**
 * Jaarafsluiting.gs
 * Resultaatverwerking + jaaroverdracht voor Nederlandse balanscontinuiteit (RJ 160/170).
 *
 * Pattern (standaard NL accountancy):
 *   1. Resultaatverwerking 31-12-N: per W&V-rekening (7xxx Kosten / 8xxx Opbrengst)
 *      met saldo != 0 → tegenboeking met 2500 Resultaat boekjaar. Eindstand:
 *      alle W&V-saldi op 0, 2500 = winst (credit-saldo) of verlies (debet-saldo).
 *   2. Jaaroverdracht 01-01-N+1: één boeking 2500 ↔ 2600 (Onverdeelde winst
 *      voorgaande jaren). Eindstand: 2500 = 0, 2600 += resultaat.
 *
 * Invarianten (zie .claude/invariants.md):
 *   - som(debet) == som(credit) per gegenereerde boeking
 *   - Na uitvoering: alle 7xxx/8xxx saldi == 0 en 2500 == 0
 *   - Idempotent: throws bij hertoepassing op zelfde jaar
 */

// Pinned per RGS NL-grootboekschema (Config.gs STANDAARD_GROOTBOEK).
const REKENING_RESULTAAT_BOEKJAAR = '2500';
const REKENING_ONVERDEELDE_WINST  = '2600';

/**
 * Pure: produce closing entries that move every non-zero W&V balance onto 2500.
 *
 * @param {Object} saldi   map of {code: {naam, type, bw, saldo}} from grootboek
 * @param {number} jaar    closing year (yyyy)
 * @returns {Array<Object>} bookings as opt-objects for maakJournaalpost_
 */
function genereerResultaatverwerkingsBoekingen_(saldi, jaar) {
  if (!saldi || typeof saldi !== 'object') return [];
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2099) {
    throw new Error('Ongeldig jaar voor resultaatverwerking: ' + jaar);
  }

  const datum = new Date(jaar, 11, 31); // 31-12-jaar (month is 0-indexed)
  const refTag = 'JA-' + jaar;
  const boekingen = [];

  Object.keys(saldi).forEach(function(code) {
    const r = saldi[code];
    if (!r || r.bw !== 'W&V') return;
    const saldo = rondBedrag_(parseFloat(r.saldo) || 0);
    if (Math.abs(saldo) < 0.005) return;

    const omschr = 'Resultaatverwerking ' + jaar + ' — ' + (r.naam || code);

    if (r.type === 'Opbrengst') {
      // Opbrengst-saldo is credit-positief in updateGrootboekSaldo_.
      // Tegenboeking: debet=code (haalt op naar 0), credit=2500 (winstpost).
      boekingen.push({
        datum: datum, omschr: omschr, dagboek: 'Memoriaal',
        debet: code, credit: REKENING_RESULTAAT_BOEKJAAR,
        bedrag: saldo, ref: refTag, type: BOEKING_TYPE.RESULTAATVERWERKING,
      });
    } else if (r.type === 'Kosten') {
      // Kosten-saldo is debet-positief. Tegenboeking: debet=2500, credit=code.
      boekingen.push({
        datum: datum, omschr: omschr, dagboek: 'Memoriaal',
        debet: REKENING_RESULTAAT_BOEKJAAR, credit: code,
        bedrag: saldo, ref: refTag, type: BOEKING_TYPE.RESULTAATVERWERKING,
      });
    }
    // Other W&V types: none in standard schema → silent skip.
  });

  return boekingen;
}

/**
 * Pure: produce the year-transition entry 2500 ↔ 2600.
 *
 * @param {number} resultaat  profit (>0) or loss (<0) realized in year N
 * @param {number} nieuwJaar  year N+1 (used as 01-01 date)
 * @returns {Object|null} booking, or null if resultaat rounds to 0
 */
function genereerJaarOverdrachtBoeking_(resultaat, nieuwJaar) {
  if (!Number.isInteger(nieuwJaar) || nieuwJaar < 2000 || nieuwJaar > 2099) {
    throw new Error('Ongeldig jaar voor jaaroverdracht: ' + nieuwJaar);
  }
  const r = rondBedrag_(parseFloat(resultaat) || 0);
  if (Math.abs(r) < 0.005) return null;

  const datum = new Date(nieuwJaar, 0, 1); // 01-01-nieuwJaar
  const refTag = 'JO-' + nieuwJaar;
  const omschr = 'Jaaroverdracht resultaat ' + (nieuwJaar - 1);

  if (r > 0) {
    // Profit: 2500 had credit-saldo; debet=2500 nulls it, credit=2600 accumulates.
    return {
      datum: datum, omschr: omschr, dagboek: 'Memoriaal',
      debet: REKENING_RESULTAAT_BOEKJAAR, credit: REKENING_ONVERDEELDE_WINST,
      bedrag: r, ref: refTag, type: BOEKING_TYPE.BEGINBALANS,
    };
  }
  // Loss: reverse direction; absolute amount.
  return {
    datum: datum, omschr: omschr, dagboek: 'Memoriaal',
    debet: REKENING_ONVERDEELDE_WINST, credit: REKENING_RESULTAAT_BOEKJAAR,
    bedrag: Math.abs(r), ref: refTag, type: BOEKING_TYPE.BEGINBALANS,
  };
}

/**
 * Read GROOTBOEKSCHEMA into the saldi shape used by Rapportages.gs.
 * Null-safe: returns {} if sheet missing.
 */
function leesGrootboekSaldi_(ss) {
  const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const saldi = {};
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][0] || '').trim();
    if (!code) continue;
    saldi[code] = {
      naam:  data[i][1], type: data[i][2], cat: data[i][3],
      bw:    data[i][4], saldo: parseFloat(data[i][5]) || 0,
    };
  }
  return saldi;
}

/**
 * Idempotency guard: detects if year already has Resultaatverwerking entries.
 * Detection by referentie-tag JA-{jaar} on column 11 (Referentie) in JOURNAALPOSTEN.
 */
function jaarAlAfgesloten_(ss, jaar) {
  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const refTag = 'JA-' + jaar;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][11] || '') === refTag) return true;
  }
  return false;
}

/**
 * Orchestrator: executes full year-end closure (resultaatverwerking + jaaroverdracht).
 * Pre-flight: idempotency check. Throws on violation.
 *
 * @throws {Error} when year already closed
 * @returns {{resultaat:number, boekingenCount:number, boekingIds:string[]}}
 */
function voerJaarafsluitingResultaatUit_(ss, jaar) {
  if (jaarAlAfgesloten_(ss, jaar)) {
    schrijfAuditLog_('Jaarafsluiting GEBLOKKEERD',
      'Jaar ' + jaar + ' is al afgesloten (referentie JA-' + jaar + ' bestaat in Journaalposten)');
    throw new Error(
      'Boekjaar ' + jaar + ' is al afgesloten.\n\n' +
      'Bekijk Journaalposten met referentie JA-' + jaar + ' om de bestaande boekingen te zien. ' +
      'Neem contact op met je accountant als je een correctie wilt doorvoeren.'
    );
  }

  const saldi = leesGrootboekSaldi_(ss);

  // Pre-flight: standaardrekeningen 2500 + 2600 moeten in schema staan.
  // Oudere installaties (pre-2025) hebben ze mogelijk niet — dan zou
  // updateGrootboekSaldo_ alleen "GROOTBOEK ONBEKEND" loggen en de balans
  // zou stilletjes scheef lopen. Hard-fail om dat te voorkomen.
  const ontbreken = [REKENING_RESULTAAT_BOEKJAAR, REKENING_ONVERDEELDE_WINST]
    .filter(c => !saldi[c]);
  if (ontbreken.length) {
    schrijfAuditLog_('Jaarafsluiting GEBLOKKEERD',
      'Ontbrekende rekening(en) in Grootboekschema: ' + ontbreken.join(', '));
    throw new Error(
      'Standaardrekeningen ' + ontbreken.join(' en ') + ' ontbreken in het Grootboekschema. ' +
      'Open Boekhouding → Setup → Rekeningschema herladen, en probeer het opnieuw.'
    );
  }

  const boekingen = genereerResultaatverwerkingsBoekingen_(saldi, jaar);
  const boekingIds = [];
  let resultaat = 0;

  for (let i = 0; i < boekingen.length; i++) {
    const b = boekingen[i];
    // Opbrengsten increase 2500; kosten reduce it.
    if (b.credit === REKENING_RESULTAAT_BOEKJAAR) resultaat += b.bedrag;
    else if (b.debet === REKENING_RESULTAAT_BOEKJAAR) resultaat -= b.bedrag;
    boekingIds.push(maakJournaalpost_(ss, b));
  }
  resultaat = rondBedrag_(resultaat);

  const overdracht = genereerJaarOverdrachtBoeking_(resultaat, jaar + 1);
  if (overdracht) {
    boekingIds.push(maakJournaalpost_(ss, overdracht));
  }

  schrijfAuditLog_('Jaarafsluiting resultaat verwerkt',
    'Jaar ' + jaar + ': ' + boekingen.length + ' resultaatverwerking-boekingen + ' +
    (overdracht ? '1' : '0') + ' jaaroverdracht. Resultaat: € ' + resultaat);

  return {
    resultaat: resultaat,
    boekingenCount: boekingen.length + (overdracht ? 1 : 0),
    boekingIds: boekingIds,
  };
}

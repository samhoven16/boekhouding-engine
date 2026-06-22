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
  // ── Periode-vergrendeling check ───────────────────────────────────────
  // Adresseert "geen controle" pijnpunt: voorkom boekingen in afgesloten periodes
  const boekDatum = opt.datum instanceof Date ? opt.datum : new Date(opt.datum || new Date());
  // CYCLE-53: gedeelde self-healing parse (was inline try/catch)
  const periodes = (typeof _leesGeslotenPeriodes_ === 'function') ? _leesGeslotenPeriodes_() : [];
  if (periodes.length) {
    for (const p of periodes) {
      const van = new Date(p.van);
      const tot = new Date(p.tot);
      if (boekDatum >= van && boekDatum <= tot) {
        throw new Error(
          `Periode ${Utilities.formatDate(van, 'Europe/Amsterdam', 'MMM yyyy')} is afgesloten. ` +
          `U kunt geen boekingen meer maken in een afgesloten periode. ` +
          `Gebruik "Periode ontgrendelen" als dit een correctie is.`
        );
      }
    }
  }

  // ── Jaar-afsluiting check (P0-1 uit criticus-rapport + E2 uit stresstest) ─
  // Voorkomt: klant boekt in 2026 een factuur met datum 15-11-2025 nadat JA-2025
  // is gedaan → balans-archief raakt uit sync met actieve saldi → RJ-160 schending,
  // Belastingdienst-audit-risico. Accountant + DR/SRE bevestigden dit als P0.
  if (typeof jaarAlAfgesloten_ === 'function') {
    const boekJaar = boekDatum.getFullYear();
    if (jaarAlAfgesloten_(ss, boekJaar)) {
      throw new Error(
        `Jaar ${boekJaar} is afgesloten via Resultaatverwerking. ` +
        `Een boeking met datum in een afgesloten jaar zou de gearchiveerde ` +
        `balans uit sync brengen met de actieve grootboek-saldi. ` +
        `Boek de correctie in het huidige jaar, of ontsluit ${boekJaar} eerst ` +
        `via Boekhoudbaar → Geavanceerd → Jaarafsluiting ongedaan maken.`
      );
    }
  }

  // ── Strict input-validation (zero-failure) via Invariants-module ──────
  // Vervangt inline checks (debet/credit/bedrag-validatie) door centrale
  // valideerInvariantsVoorJournaalpost_ uit Invariants.gs. Voordelen:
  //   1. ÉÉN bron-van-waarheid voor invariants
  //   2. Structured error (InvariantSchending) met code + klantBoodschap
  //      ipv generic Error → caller kan op .code routeren
  //   3. Tests in invariants.test.js dekken alle edge-cases
  //
  // Bij faal: InvariantSchending wordt door caller getoond (niet swallowed).
  let bedragGevalideerd;
  try {
    if (typeof valideerInvariantsVoorJournaalpost_ === 'function') {
      valideerInvariantsVoorJournaalpost_(opt.debet, opt.credit, opt.bedrag);
    }
    // Bedrag is gevalideerd door Invariants als finite + positief; round nu
    bedragGevalideerd = rondBedrag_(parseFloat(opt.bedrag));
  } catch (invErr) {
    // Re-throw met legacy message-format voor backwards-compat van bestaande
    // catchers, maar behoud original error voor code-inspectie.
    Logger.log('maakJournaalpost_ invariant-schending: ' + invErr.code + ' — ' + invErr.message);
    throw invErr;
  }

  // Formele transactie-validator (issue #123): normaliseer naar regels in
  // integer centen en valideer balans + rekening-existentie VÓÓR enige write.
  // Een onbekende rekening werd voorheen pas in updateGrootboekSaldo_ stil
  // gelogd — de journaalpost-rij stond dan al in het journaal terwijl het
  // grootboek niet bewoog (zwevende boeking, onzichtbare balansdrift).
  // Nu: heldere weigering, niets geschreven, balans blijft bewijsbaar kloppend.
  if (typeof valideerTransactieFormeel_ === 'function') {
    const centen = naarCenten_(bedragGevalideerd);
    valideerTransactieFormeel_(ss, [
      { rekening: opt.debet,  debetCents: centen, creditCents: 0 },
      { rekening: opt.credit, debetCents: 0,      creditCents: centen },
    ], boekDatum);
  }

  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) {
    noodLog_('JOURNAALPOST GEEN SHEET', 'debet=' + opt.debet + ' bedrag=' + bedragGevalideerd);
    throw new Error('Tabblad Journaalposten niet gevonden — run setup() eerst');
  }
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
    bedragGevalideerd,
    opt.btwTarief !== null && opt.btwTarief !== undefined
      ? (opt.btwTarief * 100) + '%'
      : 'Geen',
    rondBedrag_(opt.btwBedrag || 0),
    opt.ref || '',
    opt.projectcode || '',
    opt.type || BOEKING_TYPE.JOURNAALPOST,
    opt.notities || '',
    new Date(),
    // HITL-validatie (kolom Q-R-S):
    //   Q=Status (default 'Concept' bij auto-boeking; 'Gevalideerd' bij handmatige bevestiging)
    //   R=Gevalideerd door (email — leeg tot validatie)
    //   S=Gevalideerd op (datum — leeg tot validatie)
    // Reden: art. 52 AWR vereist juiste boekhouding, niet "snelle" boekhouding.
    // Klant wordt gedwongen om bewust te bevestigen dat GL-rek + BTW + bijlage correct zijn.
    opt.preGevalideerd === true ? 'Gevalideerd' : 'Concept',
    opt.preGevalideerd === true ? (Session.getActiveUser().getEmail() || 'systeem') : '',
    opt.preGevalideerd === true ? new Date() : '',
  ];

  // Critical write — dubbel-loggen (audit + nood) tegen sheet-write-fail
  try {
    sheet.appendRow(rij);
  } catch (writeErr) {
    noodLog_('JOURNAALPOST_SHEET_FOUT', 'id=' + boekingId + ' debet=' + opt.debet + ' bedrag=' + bedragGevalideerd + ' | ' + writeErr.message);
    try { meldFataalAanOwner_('DATA_LOSS', 'Journaalpost-write faalde', { boekingId: boekingId, debet: opt.debet, credit: opt.credit, bedrag: bedragGevalideerd }); } catch (_) {}
    throw writeErr;
  }

  // CYCLE-2 FIX (axiom 9 atomair): saldo-updates zijn 2 separate sheet-writes.
  // Als de eerste slaagt en de tweede crasht (GAS-timeout, sheet-lock, quota),
  // dan blijft het grootboek onevenwichtig staan → balans klopt niet.
  // Compensating action: bij credit-fail de debet-update terugdraaien zodat
  // het grootboek minstens INTERN consistent is. Journaalpost-rij wordt
  // gemarkeerd als 'CORRUPT' zodat rapportages 'm kunnen skippen (axiom 13).
  //
  // Echte atomicity over 3 sheet-writes is in Google Sheets onmogelijk zonder
  // externe transactie-store. Deze compensating-action-laag is de best
  // haalbare benadering — bij worst-case (rollback faalt ook) wordt owner
  // gealarmeerd via meldFataalAanOwner_ zodat handmatig herstel mogelijk is.
  let debetGedaan = false;
  try {
    updateGrootboekSaldo_(ss, opt.debet, bedragGevalideerd, 'debet');
    debetGedaan = true;
    updateGrootboekSaldo_(ss, opt.credit, bedragGevalideerd, 'credit');
  } catch (saldoErr) {
    if (debetGedaan) {
      // Rollback: keer debet-update om met tegengestelde zijde
      try {
        updateGrootboekSaldo_(ss, opt.debet, bedragGevalideerd, 'credit');
        try { schrijfAuditLog_('JOURNAALPOST ATOMIC ROLLBACK',
          'boekingId=' + boekingId + ' debet ' + opt.debet + ' teruggedraaid wegens credit-fail: ' + saldoErr.message); } catch (_) {}
      } catch (rollbackErr) {
        // Triple-fail: saldi zijn nu zeker corrupt. Markeer journaalpost-rij
        // zodat rapportages 'm uitsluiten + alarmeer owner.
        try {
          const rij = sheet.getLastRow();
          // Status-kolom Q (17) op CORRUPT zetten — rapportage-filter pakt dit op
          sheet.getRange(rij, 17).setValue('CORRUPT');
        } catch (_) {}
        try { noodLog_('SALDO_CORRUPT',
          'boekingId=' + boekingId + ' | saldo: ' + saldoErr.message +
          ' | rollback: ' + rollbackErr.message); } catch (_) {}
        try { meldFataalAanOwner_('SALDO_CORRUPT',
          'Inconsistent grootboeksaldo na journaalpost — handmatig herstel nodig',
          { boekingId: boekingId, debet: opt.debet, credit: opt.credit,
            bedrag: bedragGevalideerd, saldoFout: saldoErr.message,
            rollbackFout: rollbackErr.message }); } catch (_) {}
      }
    }
    throw saldoErr;  // re-throw zodat caller weet dat de boeking onbruikbaar is
  }

  return boekingId;
}

// ─────────────────────────────────────────────
//  CYCLE-7 — STORNO/CORRECTIE-JOURNAALPOST
// ─────────────────────────────────────────────
/**
 * Storneer een eerdere journaalpost door een NIEUWE inverse journaalpost
 * te maken (debet ↔ credit, zelfde bedrag). De originele journaalpost
 * blijft staan — art. 52 AWR + axiom 5 (immutable na commit): nooit
 * verwijderen, alleen tegenboeken.
 *
 * Effect op grootboek: nieuwe boeking heft de oude exact op (saldo terug
 * naar pre-origineel-staat). Beide boekingen blijven zichtbaar in de
 * audit-trail.
 *
 * @param {Spreadsheet} ss
 * @param {string} origineelBoekingId  bv. 'BK000007'
 * @param {string} reden               vereist — komt in omschrijving + audit
 * @return {string} nieuw boekingId van de storno
 * @throws {Error} als origineel niet gevonden of al gestorneerd
 */
function maakStornoJournaalpost_(ss, origineelBoekingId, reden) {
  if (!origineelBoekingId) throw new Error('Storno: origineel boekingId is verplicht.');
  if (!reden || String(reden).trim().length < 5) {
    throw new Error('Storno: reden is verplicht (min. 5 tekens) voor audit-trail.');
  }

  const sheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!sheet) throw new Error('Storno: Journaalposten-tabblad niet gevonden.');

  const data = sheet.getDataRange().getValues();
  let origineel = null;
  let alGestorneerd = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][KOL.JP.boekingId]) === String(origineelBoekingId)) origineel = data[i];
    // Detecteer eerdere storno op deze boeking (ref bevat "STORNO ${id}")
    const omschr = String(data[i][KOL.JP.omschrijving] || '');
    if (omschr.indexOf('STORNO ' + origineelBoekingId) !== -1) alGestorneerd = true;
  }
  if (!origineel) throw new Error('Storno: origineel ' + origineelBoekingId + ' niet gevonden.');
  if (alGestorneerd) {
    throw new Error('Storno: ' + origineelBoekingId + ' is al eerder gestorneerd. Dubbele storno zou origineel weer effectief maken.');
  }

  // Kolom-indices (zie .claude/sheet-schemas.md JOURNAALPOSTEN):
  //   [1] Datum  [3] Dagboek  [4] Debet rek  [6] Credit rek  [8] Bedrag
  //   [9] BTW%   [10] BTW bedrag  [11] Referentie  [13] Type
  const datum    = new Date();  // storno-datum is NU, niet origineel-datum
  const debetOud = String(origineel[4] || '');
  const credOud  = String(origineel[6] || '');
  const bedrag   = parseFloat(origineel[8]) || 0;
  if (bedrag <= 0) throw new Error('Storno: origineel bedrag ongeldig (' + bedrag + ').');

  const origineelDatumStr = origineel[1] instanceof Date
    ? Utilities.formatDate(origineel[1], 'Europe/Amsterdam', 'yyyy-MM-dd')
    : String(origineel[1] || '');
  const omschr = 'STORNO ' + origineelBoekingId +
    ' (origineel ' + origineelDatumStr + '): ' + String(reden).trim();

  // Inverse boeking: debet↔credit gewisseld
  const stornoId = maakJournaalpost_(ss, {
    datum:        datum,
    omschr:       omschr,
    dagboek:      String(origineel[3] || 'Memoriaal'),
    debet:        credOud,           // origineel-credit wordt nu debet
    credit:       debetOud,          // origineel-debet wordt nu credit
    bedrag:       bedrag,
    btwTarief:    null,              // BTW-storno aparte handling — niet hier
    btwBedrag:    0,
    ref:          String(origineel[11] || '') + ' (storno)',
    type:         BOEKING_TYPE.JOURNAALPOST,
    preGevalideerd: true,             // storno is per definitie gevalideerd
  });

  try {
    schrijfAuditLog_('STORNO geboekt',
      stornoId + ' storneert ' + origineelBoekingId + ' (' + reden + ')');
  } catch (_) {}

  // P0-Accountant (criticus-rapport): bij storno op een inkoop- of verkoop-
  // factuur-journaalpost is alleen de JOURNAALPOST-tegenboeking niet
  // genoeg. berekenBtwAangifte_ leest BTW vanuit VERKOOPFACTUREN /
  // INKOOPFACTUREN-rijen, niet uit journaalposten. Zonder factuur-update
  // zou de voorbelasting OF de verschuldigde BTW dubbel meetellen → te
  // veel teruggevraagd of te weinig afgedragen → naheffing + 30% boete.
  // Daarom: markeer matched factuur als 'Gestorneerd' + nul BTW-bedrag.
  try {
    const origRef = String(origineel[11] || '').trim();
    if (origRef) {
      _markeerFactuurGestorneerd_(ss, origRef, stornoId);
    }
  } catch (markErr) {
    Logger.log('Storno: factuur-markering faalde voor ref=' +
      (origineel[11] || '?') + ': ' + markErr.message);
    safeAuditLog_('STORNO factuur-mark MISLUKT',
      origineelBoekingId + ' ref=' + (origineel[11] || '?') + ': ' + markErr.message);
  }

  // F-ACC-165 TERUGGEDRAAID (cross-pr-regressie): het stempelen van de originele
  // JOURNAALPOST-rij als 'GESTORNEERD' brak de formeel-bewijs-verifier. I1/I2
  // (FormeelBewijs.gs:165/196) én de legacy XafExport.gs (:411 via
  // _journaalpostIsCommitted_) SKIPPEN status==='GESTORNEERD' onvoorwaardelijk —
  // terwijl de storno-tegenrij 'Gevalideerd' blijft en het grootboeksaldo (geen
  // status-filter) beide rijen telt. Origineel uit `verwacht` maar wél in het
  // saldo → I2 wijkt af met het storno-bedrag → "formeel bewijs geschonden" bij
  // ÉLKE storno. De terugdraai-/audit-trail blijft traceerbaar via de
  // "STORNO {id}"-omschrijving op de tegenrij + de GESTORNEERD-status op de
  // bron-factuur (VF/IF). Niet opnieuw op de journaalpost zetten zonder óók de
  // I1/I2/legacy-XAF-aggregaties consistent te maken.

  return stornoId;
}

/**
 * Markeer een verkoop- of inkoopfactuur als 'Gestorneerd' op basis van
 * referentie. Zet ook BTW-bedrag op 0 zodat berekenBtwAangifte_ deze rij
 * niet meer meetelt. Idempotent: dubbele aanroep doet niets.
 *
 * Matched op:
 *   VERKOOPFACTUREN [1] Factuurnummer → ref begint met F-prefix
 *   INKOOPFACTUREN  [1] Intern nummer → ref begint met IK-prefix
 *
 * @private
 */
function _markeerFactuurGestorneerd_(ss, ref, stornoId) {
  if (!ref) return;
  // Verkoop-pad
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (vfSheet) {
    const vfData = vfSheet.getDataRange().getValues();
    // ref kan factuurnummer-met-prefix bevatten ('F000001') of met "(storno)"
    // suffix uit eerdere flow. Strip dat eerst.
    const schoonRef = ref.replace(/\s*\(storno\)\s*$/i, '').trim();
    for (let i = 1; i < vfData.length; i++) {
      if (String(vfData[i][KOL.VF.factuurnummer] || '').trim() === schoonRef) {
        if (String(vfData[i][KOL.VF.status] || '').toLowerCase() === 'gestorneerd') return;
        vfSheet.getRange(i + 1, 15).setValue('Gestorneerd');   // kolom 15 = [14] Status
        vfSheet.getRange(i + 1, 12).setValue(0);               // kolom 12 = [11] BTW bedrag
        try { schrijfAuditLog_('VERKOOPFACTUUR gestorneerd',
          'Factuur ' + schoonRef + ' door storno ' + stornoId); } catch (_) {}
        return;
      }
    }
  }
  // Inkoop-pad
  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (ifSheet) {
    const ifData = ifSheet.getDataRange().getValues();
    const schoonRef = ref.replace(/\s*\(storno\)\s*$/i, '').trim();
    for (let i = 1; i < ifData.length; i++) {
      if (String(ifData[i][KOL.IF.internNummer] || '').trim() === schoonRef) {
        if (String(ifData[i][KOL.IF.status] || '').toLowerCase() === 'gestorneerd') return;
        ifSheet.getRange(i + 1, 13).setValue('Gestorneerd');   // kolom 13 = [12] Status
        ifSheet.getRange(i + 1, 11).setValue(0);               // kolom 11 = [10] BTW bedrag
        try { schrijfAuditLog_('INKOOPFACTUUR gestorneerd',
          'Inkoop ' + schoonRef + ' door storno ' + stornoId); } catch (_) {}
        return;
      }
    }
  }
}

// ─────────────────────────────────────────────
//  GROOTBOEKSALDO BIJWERKEN
// ─────────────────────────────────────────────
// Executie-scoped cache: rekeningcode → rij (1-based) in GROOTBOEKSCHEMA.
// Voorheen las elke updateGrootboekSaldo_-call de HELE sheet om één rij te
// vinden; maakJournaalpost_ doet 2 calls per boeking, de herhalende-kosten-
// inhaal tot 36 boekingen per regel → honderden full-sheet-reads per run.
// Rij-posities zijn stabiel binnen één executie; het SALDO wordt nog steeds
// vers gelezen onder de lock (de write-write-bescherming verandert niet).
let _gbRijCache_ = null;

function _gbVindRij_(sheet, rekeningCode) {
  const code = String(rekeningCode);
  // Cache alleen als de sheet identificeerbaar is (echte GAS-sheets altijd;
  // kale test-mocks niet) — zonder id zou de cache tussen verschillende
  // spreadsheets kunnen lekken. Zonder id: vers opbouwen, niet bewaren.
  const cachebaar = typeof sheet.getSheetId === 'function';
  const sheetId = cachebaar ? sheet.getSheetId() : null;
  if (cachebaar && _gbRijCache_ && _gbRijCache_.sheetId === sheetId) {
    return (code in _gbRijCache_.map) ? _gbRijCache_.map[code] : null;
  }
  const laatste = sheet.getLastRow();
  const codes = laatste > 0
    ? sheet.getRange(1, 1, laatste, 1).getValues().map(function (r) { return r[0]; })
    : [];
  const map = {};
  for (let i = 1; i < codes.length; i++) {
    const c = String(codes[i]);
    if (c && !(c in map)) map[c] = i + 1; // eerste match wint, zoals de oude lineaire scan
  }
  if (cachebaar) _gbRijCache_ = { sheetId: sheetId, map: map };
  return (code in map) ? map[code] : null;
}

function updateGrootboekSaldo_(ss, rekeningCode, bedrag, zijde) {
  if (!rekeningCode) return;
  // Coerce bedrag → numeriek, anders 0+'100' = '0100' string-concat → corrupte cel.
  const bedragNum = parseFloat(bedrag) || 0;
  if (bedragNum === 0) return; // Geen wijziging nodig

  // LockService rond read-modify-write op cel — twee gelijktijdige journaalposten
  // op dezelfde rekening zouden anders beide hetzelfde huidigSaldo lezen en
  // de tweede write zou de eerste overschrijven (lost increment).
  const lock = LockService.getScriptLock();
  let lockHeld = false;
  try {
    lock.waitLock(30000);
    lockHeld = true;
  } catch (e) {
    Logger.log('updateGrootboekSaldo_: kon geen lock krijgen voor ' + rekeningCode + ': ' + e.message);
    safeAuditLog_('GROOTBOEK LOCK', 'Lock timeout op ' + rekeningCode);
    return;
  }

  try {
    const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
    if (!sheet) {
      Logger.log('updateGrootboekSaldo_: GROOTBOEKSCHEMA tabblad ontbreekt');
      safeAuditLog_('GROOTBOEK SHEET ONTBREEKT', 'updateGrootboekSaldo_ kon ' + rekeningCode + ' niet bijwerken');
      return;
    }
    // Rij + type + saldo bepalen. Snel pad (echte GAS-sheet): rij via
    // executie-cache, saldo VERS gelezen onder de lock. Als de cel-code niet
    // matcht (rij mid-executie verschoven) of de rekening pas ná de
    // cache-opbouw is toegevoegd: cache weggooien en één keer opnieuw.
    // Kale sheet-objecten (test-mocks zonder getSheetId/getLastRow) nemen
    // het oude getDataRange-pad — gedrag identiek, alleen langzamer.
    let rij = null;
    let type = null;
    let huidigSaldo = 0;
    const echteSheet = typeof sheet.getSheetId === 'function' &&
                       typeof sheet.getLastRow === 'function';
    if (echteSheet) {
      for (let poging = 0; poging < 2 && rij === null; poging++) {
        const kandidaat = _gbVindRij_(sheet, rekeningCode);
        if (kandidaat === null) { _gbRijCache_ = null; continue; }
        const rijData = sheet.getRange(kandidaat, 1, 1, 6).getValues()[0];
        if (String(rijData[KOL.GB.code]) !== String(rekeningCode)) { _gbRijCache_ = null; continue; }
        rij = kandidaat;
        type = rijData[KOL.GB.type]; // Actief / Passief / Opbrengst / Kosten
        huidigSaldo = parseFloat(rijData[KOL.GB.saldo]) || 0;
      }
    } else {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][KOL.GB.code]) === String(rekeningCode)) {
          rij = i + 1;
          type = data[i][KOL.GB.type];
          huidigSaldo = parseFloat(data[i][KOL.GB.saldo]) || 0;
          break;
        }
      }
    }

    if (rij !== null) {
      // Dubbel boekhouden regels:
      // Activa: Debet = plus, Credit = min
      // Passiva: Debet = min, Credit = plus
      // Opbrengsten: Debet = min, Credit = plus
      // Kosten: Debet = plus, Credit = min
      const isDebet = zijde === 'debet';

      if (type === 'Actief' || type === 'Kosten') {
        huidigSaldo += isDebet ? bedragNum : -bedragNum;
      } else {
        huidigSaldo += isDebet ? -bedragNum : bedragNum;
      }

      sheet.getRange(rij, 6).setValue(rondBedrag_(huidigSaldo));
      return;
    }

    // Onbekende rekening — log + audit-trail zodat self-healing dit kan oppikken.
    // Voorheen stille no-op → balans liep ongezien scheef.
    // Nu: log naar drie kanalen (Logger, noodLog, audit-log) zodat altijd
    // minstens één plek bewijst dat dit gebeurd is. Geen exception throwen —
    // de journaalpost ZELF moet wel slagen, anders zou klant geen boeking
    // kunnen maken bij elke schema-drift. Maar wel zichtbaar maken.
    Logger.log('updateGrootboekSaldo_: onbekende rekening ' + rekeningCode + ' (zijde=' + zijde + ', bedrag=' + bedragNum + ')');
    try {
      if (typeof noodLog_ === 'function') {
        noodLog_('GROOTBOEK_ONBEKEND', 'Rekening ' + rekeningCode + ' niet gevonden (zijde=' + zijde + ', bedrag=' + bedragNum + ')');
      }
    } catch (_) {}
    try {
      schrijfAuditLog_(
        'GROOTBOEK ONBEKEND',
        'Rekening ' + rekeningCode + ' niet gevonden — saldo niet bijgewerkt (' + zijde + ' ' + bedragNum + ')'
      );
    } catch (auditFout) {
      // Beide audit-paden faalden — minstens Logger heeft het. Owner moet
      // periodiek Logger checken via Apps Script-dashboard.
      Logger.log('GROOTBOEK_ONBEKEND audit ook gefaald: ' + auditFout.message);
    }
  } finally {
    if (lockHeld) {
      try { lock.releaseLock(); } catch (_) {}
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
    if (String(data[i][KOL.GB.code]) === String(rekeningCode)) {
      return parseFloat(data[i][KOL.GB.saldo]) || 0;
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

  // Eén lees + één in-memory aggregatie + één batch-write. De oude versie
  // riep updateGrootboekSaldo_ aan per debet- en credit-zijde van élke
  // journaalpost. Dat is per call: getDataRange().getValues() op
  // GROOTBOEKSCHEMA + LockService.waitLock + setValue per match.
  // Bij 50k journaalposten × 2 × ~200 GB-rijen = ~20M cell-reads,
  // ~100k setValues, plus de lock seqentialiseert alles → timeout halverwege
  // met een half-geschreven balans (juist het tegenovergestelde van wat dit
  // menu-item moet doen, en het wordt aanbevolen door controleerBalansStrikt_).
  const lock = LockService.getScriptLock();
  let lockHeld = false;
  try { lock.waitLock(30000); lockHeld = true; }
  catch (_e) {
    SpreadsheetApp.getUi().alert(
      'Kon de herberekening niet starten — een andere boeking is nog bezig. ' +
      'Probeer het zo opnieuw.');
    return;
  }

  try {
    const gbData = gbSheet.getDataRange().getValues();
    const jpData = jpSheet.getDataRange().getValues();

    // Bouw lookup van rekeningcode → { idx, type } op basis van het schema.
    const idxPerCode = new Map();
    for (let i = 1; i < gbData.length; i++) {
      const code = String(gbData[i][KOL.GB.code]);
      if (code) idxPerCode.set(code, { rij: i, type: gbData[i][KOL.GB.type] });
    }

    // Reset alle saldi in geheugen.
    const nieuweSaldi = new Map();
    idxPerCode.forEach(function(_, code) { nieuweSaldi.set(code, 0); });

    // Aggregeer over alle journaalposten.
    const onbekendeRekeningen = new Set();
    for (let i = 1; i < jpData.length; i++) {
      const debet = String(jpData[i][KOL.JP.debetRekening] || '');
      const credit = String(jpData[i][KOL.JP.creditRekening] || '');
      const bedrag = parseFloat(jpData[i][KOL.JP.bedrag]) || 0;
      if (bedrag === 0) continue;

      for (const z of [{ code: debet, kant: 'debet' }, { code: credit, kant: 'credit' }]) {
        if (!z.code) continue;
        const meta = idxPerCode.get(z.code);
        if (!meta) { onbekendeRekeningen.add(z.code); continue; }
        const teken = (meta.type === 'Actief' || meta.type === 'Kosten')
          ? (z.kant === 'debet' ? 1 : -1)
          : (z.kant === 'debet' ? -1 : 1);
        nieuweSaldi.set(z.code, nieuweSaldi.get(z.code) + teken * bedrag);
      }
    }

    // Eén batch-write: kolom 6 (saldo) over de hele GB-tab.
    const saldoKolom = [];
    for (let i = 1; i < gbData.length; i++) {
      const code = String(gbData[i][KOL.GB.code] || '');
      saldoKolom.push([code ? rondBedrag_(nieuweSaldi.get(code) || 0) : gbData[i][KOL.GB.saldo]]);
    }
    if (saldoKolom.length > 0) {
      gbSheet.getRange(2, 6, saldoKolom.length, 1).setValues(saldoKolom);
    }

    try {
      schrijfAuditLog_('Saldi herberekend',
        jpData.length - 1 + ' journaalposten verwerkt' +
        (onbekendeRekeningen.size ? ' · ' + onbekendeRekeningen.size + ' onbekende rekening(en): ' +
          [...onbekendeRekeningen].slice(0, 5).join(', ') : ''));
    } catch (_) {}

    const waarschuwing = onbekendeRekeningen.size
      ? '\n\nLet op: ' + onbekendeRekeningen.size + ' rekening(en) uit boekingen staan niet in het schema — '
        + 'die zijn overgeslagen. Check de audit-log voor de codes.'
      : '';
    SpreadsheetApp.getUi().alert(
      'Saldi opnieuw berekend op basis van ' + (jpData.length - 1) + ' boeking(en).' + waarschuwing);
  } finally {
    if (lockHeld) { try { lock.releaseLock(); } catch (_) {} }
  }
}

// ─────────────────────────────────────────────
//  GROOTBOEKKAART EXPORTEREN (PER REKENING)
// ─────────────────────────────────────────────
function exporteerGrootboekkaart() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.prompt(
    'Rekening-overzicht',
    'Voer de rekeningcode in (bijv. 1100 voor Bank, 8000 voor Omzet):',
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

  const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  const data = jpSheet.getDataRange().getValues();
  let lopenSaldo = 0;
  let rij = 3;

  for (let i = 1; i < data.length; i++) {
    const debetKode = String(data[i][KOL.JP.debetRekening]);
    const creditKode = String(data[i][KOL.JP.creditRekening]);
    const bedrag = parseFloat(data[i][KOL.JP.bedrag]) || 0;

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
      data[i][KOL.JP.datum],       // Datum
      data[i][KOL.JP.omschrijving],       // Omschrijving
      data[i][KOL.JP.dagboek],       // Dagboek
      data[i][KOL.JP.referentie],      // Referentie
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
  if (!controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();

  // Haal vaste activa op uit grootboek (CYCLE-51: helper voor null-safety)
  const gbData = leesSheetVeilig_(ss, SHEETS.GROOTBOEKSCHEMA);
  const vasteActiva = gbData.filter(r => r[2] === 'Actief' && r[3] === 'Vaste activa' && parseFloat(r[5]) > 0);

  if (vasteActiva.length === 0) {
    ui.alert('Geen vaste activa met positief saldo gevonden.');
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
           padding:18px;font-size:13px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      h3{color:#0D1B4E;font-size:16px;font-weight:700;letter-spacing:-0.01em;margin:0 0 10px}
      p{color:#5A6478;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;
            box-shadow:0 1px 2px rgba(13,27,78,0.04)}
      td,th{padding:8px 10px;border-bottom:1px solid #E5EAF2;text-align:left}
      th{background:#0D1B4E;color:white;font-weight:600;font-size:12px;letter-spacing:0.3px}
      tr:last-child td{border-bottom:none}
      input[type=number]{width:90px;padding:6px 8px;border:1px solid #E5EAF2;border-radius:6px;
                         font-size:13px;font-family:inherit;background:#fff;transition:border-color 0.15s}
      input[type=number]:focus{outline:none;border-color:#2EC4B6}
      select{padding:6px 8px;border:1px solid #E5EAF2;border-radius:6px;font-size:13px;
             font-family:inherit;background:#fff}
      .btn{background:#0D1B4E;color:white;padding:10px 18px;border:none;border-radius:6px;
           cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;
           transition:background 0.15s}
      .btn:hover{background:#1A2A6B}
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
      <button type="button" class="btn" id="btnBoekenAfs">Afschrijvingen boeken</button>
      <button type="button" id="btnAnnAfs" style="margin-left:8px">Annuleren</button>
    </form>
    <script>
      function submit_() {
        const form = document.getElementById('form');
        const data = {};
        new FormData(form).forEach((v, k) => data[k] = v);
        google.script.run
          .withSuccessHandler(() => { alert('Afschrijvingen geboekt!'); google.script.host.close(); })
          .withFailureHandler((e) => alert('⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Controleer je invoer en probeer opnieuw.')))
          .verwerkAfschrijvingen(data);
      }
      document.addEventListener('DOMContentLoaded', function() {
        var b = document.getElementById('btnBoekenAfs');
        if (b) b.addEventListener('click', function(e){ e.preventDefault(); submit_(); });
        var a = document.getElementById('btnAnnAfs');
        if (a) a.addEventListener('click', function(){ try { google.script.host.close(); } catch (_) {} });
      });
    </script>
  `).setWidth(600).setHeight(450).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  ui.showModalDialog(html, 'Afschrijvingen');
}

function verwerkAfschrijvingen(data) {
  const ss = getSpreadsheet_();
  const periode = data.periode || 'Jaarlijks';
  const factor = periode === 'Maandelijks' ? 1/12 : 1;
  const datum = new Date();

  // LockService rond batch-afschrijvingen — voorkomt dat 2 gelijktijdige
  // klikken op "Afschrijvingen boeken" dezelfde rekening 2× afschrijven
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Andere afschrijving-batch is bezig — wacht een ogenblik en probeer opnieuw.');

  try {
  Object.keys(data).forEach(code => {
    if (code === 'periode') return;
    // Strict pct-parsing, maar met silent-skip bij onbedoelde waarden
    const ruwPct = data[code];
    if (ruwPct === '' || ruwPct === null || ruwPct === undefined) return;
    const pctNum = parseFloat(ruwPct);
    if (isNaN(pctNum)) return;  // klant heeft niet-numeriek getypt: skip i.p.v. crash hele batch
    const pct = pctNum / 100;
    if (pct <= 0) return;
    if (pct > 1) {
      Logger.log('Afschrijving %' + ruwPct + ' op ' + code + ' overgeslagen (>100%)');
      return;
    }

    const saldo = getGrootboekSaldo_(ss, code);
    if (saldo <= 0) return;

    // klasse 9 (precisie): exact in integer-centen (raakt W&V → IB, dus bindend).
    const afschrBedrag = berekenAfschrijvingCent_(saldo, pct, factor);
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
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }

  vernieuwDashboard();
}

// ─────────────────────────────────────────────
//  DEBITEUREN OVERZICHT
// ─────────────────────────────────────────────
function vernieuwDebiteurenOverzicht() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.DEBITEUREN);
  sheet.clearContents();
  sheet.clearFormats();

  // ── Kop ───────────────────────────────────────────────────────────────
  sheet.getRange(1, 1, 1, 9).merge()
    .setValue('DEBITEUREN — openstaande verkoopfacturen')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 36);

  // ── Aging buckets (leeftijdsanalyse) ──────────────────────────────────
  // Eerst alle open facturen verzamelen, dan buckets berekenen.
  const vfData = leesSheetVeilig_(ss, SHEETS.VERKOOPFACTUREN);   // CYCLE-51
  const vandaag = new Date();
  const open = [];

  for (let i = 1; i < vfData.length; i++) {
    const status = vfData[i][KOL.VF.status];
    if (status === FACTUUR_STATUS.BETAALD || status === FACTUUR_STATUS.GECREDITEERD) continue;

    const incl = parseFloat(vfData[i][KOL.VF.bedragIncl]) || 0;
    const betaald = parseFloat(vfData[i][KOL.VF.betaaldBedrag]) || 0;
    const openBedrag = rondBedrag_(incl - betaald);
    if (openBedrag <= 0) continue;

    // Sheet-cell kan Date OF DD-MM-YYYY string zijn (na CSV-import). Native
    // new Date('01-04-2026') geeft NaN; parseDatum_ handelt beide formaten af.
    const vervaldatum = vfData[i][KOL.VF.vervaldatum]
      ? (vfData[i][KOL.VF.vervaldatum] instanceof Date ? vfData[i][KOL.VF.vervaldatum] : parseDatum_(vfData[i][KOL.VF.vervaldatum]))
      : null;
    const dagenOver = vervaldatum && !isNaN(vervaldatum.getTime())
      ? Math.floor((vandaag - vervaldatum) / (1000 * 60 * 60 * 24))
      : 0;

    open.push({
      factuurnummer: vfData[i][KOL.VF.factuurnummer],
      datum: vfData[i][KOL.VF.datum],
      vervaldatum,
      klant: vfData[i][KOL.VF.klantnaam],
      incl,
      betaald,
      openBedrag,
      dagenOver,
      status,
    });
  }

  // Bucket-indeling (positieve dagenOver = te laat; 0 of negatief = nog niet vervallen)
  const bucket = { nietVervallen: 0, b0_30: 0, b30_60: 0, b60_90: 0, b90plus: 0 };
  open.forEach(function(f) {
    if (f.dagenOver <= 0)       bucket.nietVervallen += f.openBedrag;
    else if (f.dagenOver <= 30) bucket.b0_30        += f.openBedrag;
    else if (f.dagenOver <= 60) bucket.b30_60       += f.openBedrag;
    else if (f.dagenOver <= 90) bucket.b60_90       += f.openBedrag;
    else                        bucket.b90plus      += f.openBedrag;
  });
  const totaalOpen = Object.values(bucket).reduce(function(s, v) { return s + v; }, 0);

  // Aging tabel (rij 3-5)
  sheet.getRange(3, 1, 1, 5).setValues([[
    'Nog niet vervallen',
    '1–30 dagen te laat',
    '31–60 dagen te laat',
    '61–90 dagen te laat',
    '90+ dagen te laat',
  ]]).setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold').setFontSize(10)
     .setHorizontalAlignment('center').setFontColor(KLEUREN.HEADER_BG);
  sheet.getRange(4, 1, 1, 5).setValues([[
    rondBedrag_(bucket.nietVervallen),
    rondBedrag_(bucket.b0_30),
    rondBedrag_(bucket.b30_60),
    rondBedrag_(bucket.b60_90),
    rondBedrag_(bucket.b90plus),
  ]]).setNumberFormat('€#,##0.00').setFontSize(14).setFontWeight('bold')
     .setHorizontalAlignment('center').setFontColor(KLEUREN.HEADER_BG);

  // Kleur-coderen: hoe ouder, hoe roder
  sheet.getRange(4, 1).setBackground('#E8F5E9');
  sheet.getRange(4, 2).setBackground('#FFF3E0');
  sheet.getRange(4, 3).setBackground('#FFE0B2');
  sheet.getRange(4, 4).setBackground('#FFCCBC');
  sheet.getRange(4, 5).setBackground('#FFCDD2');
  sheet.setRowHeight(4, 36);

  // ── Detail tabel ──────────────────────────────────────────────────────
  const detailHeaderRij = 6;
  const headers = ['Factuurnummer', 'Datum', 'Vervaldatum', 'Klant', 'Bedrag incl.', 'Betaald', 'Openstaand', 'Dagen te laat', 'Status'];
  sheet.getRange(detailHeaderRij, 1, 1, headers.length).setValues([headers])
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');

  // Sorteer: eerst oudste te-laat bovenaan, dan nog-niet-vervallen
  open.sort(function(a, b) { return b.dagenOver - a.dagenOver; });

  let rij = detailHeaderRij + 1;
  open.forEach(function(f) {
    sheet.appendRow([
      f.factuurnummer, f.datum, f.vervaldatum, f.klant,
      f.incl, f.betaald, f.openBedrag,
      f.dagenOver > 0 ? f.dagenOver : '',
      f.status,
    ]);
    if (f.dagenOver > 90)      sheet.getRange(rij, 1, 1, 9).setBackground('#FFCDD2');
    else if (f.dagenOver > 60) sheet.getRange(rij, 1, 1, 9).setBackground('#FFE0B2');
    else if (f.dagenOver > 30) sheet.getRange(rij, 1, 1, 9).setBackground('#FFF3E0');
    else if (f.dagenOver > 0)  sheet.getRange(rij, 1, 1, 9).setBackground('#FFF9E6');
    rij++;
  });

  // Totaal-regel
  sheet.appendRow(['', '', '', 'TOTAAL OPENSTAAND', '', '', totaalOpen, '', '']);
  sheet.getRange(rij, 1, 1, 9).setFontWeight('bold');
  sheet.getRange(rij, 5, 1, 3).setBackground(KLEUREN.SECTIE_BG);
  if (rij > detailHeaderRij + 1) {
    sheet.getRange(detailHeaderRij + 1, 5, rij - detailHeaderRij, 3).setNumberFormat('€#,##0.00');
  }

  // Kolombreedtes voor leesbaarheid
  sheet.setColumnWidths(1, 1, 130);  // Factuurnr
  sheet.setColumnWidths(4, 1, 180);  // Klant
  sheet.setColumnWidths(5, 3, 120);  // bedragen

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  CREDITEUREN OVERZICHT
// ─────────────────────────────────────────────
function vernieuwCrediteurenOverzicht() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.CREDITEUREN);
  sheet.clearContents();

  const headers = ['Intern nr.', 'Factuurdatum', 'Vervaldatum', 'Leverancier', 'Factuurref.', 'Bedrag incl.', 'Betaald', 'Openstaand', 'Status'];
  zetHeaderRij_(sheet, headers);

  const ifData = leesSheetVeilig_(ss, SHEETS.INKOOPFACTUREN);   // CYCLE-51
  const vandaag = new Date();
  let rij = 2;
  let totaalOpen = 0;

  for (let i = 1; i < ifData.length; i++) {
    const status = ifData[i][KOL.IF.status];
    if (status === FACTUUR_STATUS.BETAALD) continue;

    const incl = parseFloat(ifData[i][KOL.IF.bedragIncl]) || 0;
    // ifData[i][KOL.IF.betaaldatum] is Betaaldatum (a date), not a betaald amount — inkoopfacturen
    // use binary paid/unpaid status. Partial payments are not tracked in this schema,
    // so openstaand equals incl for all unpaid rows.
    const betaald = 0;
    const openstaand = rondBedrag_(incl - betaald);
    if (openstaand <= 0) continue;

    // ifData[i][KOL.IF.factuurdatumLeverancier] is Factuurdatum leverancier (no separate vervaldatum column in schema)
    // CYCLE-60: parseDatum_ + isNaN-guard — string-dated inkoopfacturen anders
    // silent geskipped → onjuiste crediteuren-aging in betalings-overzicht.
    const factuurdatum = ifData[i][KOL.IF.factuurdatumLeverancier]
      ? ((ifData[i][KOL.IF.factuurdatumLeverancier] instanceof Date) ? ifData[i][KOL.IF.factuurdatumLeverancier] : parseDatum_(ifData[i][KOL.IF.factuurdatumLeverancier]))
      : null;
    const factuurdatumGeldig = factuurdatum && !isNaN(factuurdatum.getTime());
    // Approximate vervaldatum: factuurdatum + 30 days (standard payment term)
    const vervaldatum = factuurdatumGeldig ? new Date(factuurdatum.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
    const dagenOver = vervaldatum ? Math.floor((vandaag - vervaldatum) / (1000 * 60 * 60 * 24)) : 0;

    totaalOpen += openstaand;

    sheet.appendRow([
      ifData[i][KOL.IF.internNummer],  // Intern nummer
      factuurdatum,  // Factuurdatum
      vervaldatum,   // Vervaldatum (berekend op basis van factuurdatum + 30 dagen)
      ifData[i][KOL.IF.leveranciernaam],  // Leverancier
      ifData[i][KOL.IF.factuurrefLeverancier],  // Factuurref
      incl,
      betaald || '',
      openstaand,
      status,
    ]);

    if (dagenOver > 0) {
      sheet.getRange(rij, 1, 1, 9).setBackground('#FFEBEE');
    }

    rij++;
  }

  sheet.appendRow(['', '', '', 'TOTAAL TE BETALEN', '', '', '', totaalOpen, '']);
  sheet.getRange(rij, 1, 1, 9).setFontWeight('bold');
  sheet.getRange(rij, 6, 1, 3).setBackground(KLEUREN.SECTIE_BG);
  sheet.getRange(2, 6, rij - 1, 3).setNumberFormat('€#,##0.00');
}

// ─────────────────────────────────────────────
//  TRANSACTIES KOPPELEN AAN FACTUREN
// ─────────────────────────────────────────────
function koppelTransactiesAanFacturen() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const btData = leesSheetVeilig_(ss, SHEETS.BANKTRANSACTIES);   // CYCLE-51
  let gekoppeld = 0;

  for (let i = 1; i < btData.length; i++) {
    if (btData[i][KOL.BT.gekoppeldAan]) continue; // Al gekoppeld
    const ref = String(btData[i][KOL.BT.referentie] || '');
    const bedrag = Math.abs(parseFloat(btData[i][KOL.BT.bedrag]) || 0);
    const isOntvangst = parseFloat(btData[i][KOL.BT.bedrag]) > 0;

    if (!ref) continue;

    const datum = btData[i][KOL.BT.datum] ? new Date(btData[i][KOL.BT.datum]) : new Date();
    koppelBankTransactieAanFactuur_(ss, btData[i][KOL.BT.transactieId], ref, bedrag, isOntvangst, datum);
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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const nr = parseInt(props.getProperty(PROP.VOLGEND_FACTUUR_NR) || '1');
    props.setProperty(PROP.VOLGEND_FACTUUR_NR, String(nr + 1));
    return nr;
  } finally {
    lock.releaseLock();
  }
}

function volgendInkoopNummer_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const nr = parseInt(props.getProperty(PROP.VOLGEND_INKOOP_NR) || '1');
    props.setProperty(PROP.VOLGEND_INKOOP_NR, String(nr + 1));
    return nr;
  } finally {
    lock.releaseLock();
  }
}

function volgendBoekingId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const nr = parseInt(props.getProperty(PROP.VOLGEND_BOEKING_NR) || '1');
    props.setProperty(PROP.VOLGEND_BOEKING_NR, String(nr + 1));
    return 'BK' + String(nr).padStart(6, '0');
  } finally {
    lock.releaseLock();
  }
}

function volgendTransactieId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const sleutel = 'volgendTransactieId';
    const nr = parseInt(props.getProperty(sleutel) || '1');
    props.setProperty(sleutel, String(nr + 1));
    return 'TR' + String(nr).padStart(6, '0');
  } finally {
    lock.releaseLock();
  }
}

function volgendRelatieId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const sleutel = 'volgendRelatieId';
    const nr = parseInt(props.getProperty(sleutel) || '1');
    props.setProperty(sleutel, String(nr + 1));
    return 'REL' + String(nr).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
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

// ─────────────────────────────────────────────
//  HELPERS RELATIES
// ─────────────────────────────────────────────
function zoekOfMaakRelatie_(ss, naam, type, email) {
  // Defensieve normalisatie — voorkomt crashes op non-string input + matcht
  // case-insensitive én trim-onafhankelijk ('Klant ' = 'klant').
  const naamNorm = String(naam || '').trim().toLowerCase();
  if (!naamNorm) throw new Error('Relatie-naam mag niet leeg zijn');
  const emailNorm = String(email || '').trim().toLowerCase();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ss.getSheetByName(SHEETS.RELATIES);
    if (!sheet) throw new Error('Tabblad Relaties ontbreekt — run setup opnieuw');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][KOL.REL.naam] || '').trim().toLowerCase() === naamNorm) {
        // Sla e-mail op als die nog niet bekend was (kolom 11 = index 10)
        if (emailNorm && !data[i][KOL.REL.email]) {
          sheet.getRange(i + 1, 11).setValue(emailNorm);
        }
        return data[i][KOL.REL.relatieId]; // Relatie ID
      }
    }
    // Maak nieuwe relatie aan — ID inline gegenereerd (geen geneste lock)
    const props = PropertiesService.getScriptProperties();
    const nr = parseInt(props.getProperty('volgendRelatieId') || '1');
    props.setProperty('volgendRelatieId', String(nr + 1));
    const id = 'REL' + String(nr).padStart(4, '0');
    // Gebruik de oorspronkelijke (getrimde) naam voor display, niet lowercase
    const displayNaam = String(naam || '').trim();
    sheet.appendRow([
      id, type, displayNaam, '', '', '', '', 'Nederland',
      '', '', emailNorm, '', '', 30, '21% (hoog)', '', 'Ja', '', new Date()
    ]);
    return id;
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
//  BTW REKENING HELPERS
// ─────────────────────────────────────────────
function bepaalOmzetRekening_(btwLabel) {
  if (!btwLabel) return '8000';
  const l = String(btwLabel);
  // Strikte detectie — voorkomt '21' substring matches in '212' of '21,5%'
  if (l.includes('21%') || /\bhoog\b/i.test(l)) return '8000';
  if (l.includes('9%')  || /\blaag\b/i.test(l)) return '8010';
  if (l.includes('0%')  || /nultarief/i.test(l)) return '8020';
  if (/Vrijgesteld/i.test(l)) return '8030';
  if (/Verlegd/i.test(l))     return '8040';
  return '8000';
}

function bepaalBtwVerkoopRekening_(btwLabel) {
  if (!btwLabel) return '4110';
  const l = String(btwLabel);
  if (l.includes('21%') || /\bhoog\b/i.test(l)) return '4110';
  if (l.includes('9%')  || /\blaag\b/i.test(l)) return '4120';
  return '4100';
}

function bepaalBtwVoorbelastingRekening_(btwLabel) {
  if (!btwLabel) return '1410';
  const l = String(btwLabel);
  if (l.includes('21%') || /\bhoog\b/i.test(l)) return '1410';
  if (l.includes('9%')  || /\blaag\b/i.test(l)) return '1420';
  return '1400';
}

// ─────────────────────────────────────────────
//  PERIODE VERGRENDELING
//  Adresseert: "geen controle" (Excel), "compliance risico" (Wave)
// ─────────────────────────────────────────────

/**
 * CYCLE-53: self-healing parse van GESLOTEN_PERIODES. Corrupt JSON
 * (bv. half-geschreven door quota-fail) zou anders vergrendelPeriode_
 * (tijdens BTW-afsluiten) én beheerGeslotenPeriodes (menu) doen crashen.
 *
 * Audit 2026-06-12 (A4): de oude self-heal deed deleteProperty bij corrupt
 * JSON → I₈ (afgesloten-periode-immutability) tijdelijk uit → klant kon
 * stilletjes in een afgesloten jaar boeken. Nu: BACKUP-VÓÓR-DELETE. De
 * corrupte waarde wordt naar GESLOTEN_PERIODES_CORRUPT_<ts> geschreven
 * en gemarkeerd voor forensische trace. Tegelijk meldFataalAanOwner_ +
 * audit-log zodat Sam weet dat een handmatige reconstructie nodig is.
 * Self-heal valt nog steeds open (return []) — de business mag niet
 * volledig stilvallen — maar het gat is nu zichtbaar EN herstelbaar.
 *
 * @returns {Array<Object>}
 */
function _leesGeslotenPeriodes_() {
  const props = PropertiesService.getScriptProperties();
  const bestaand = props.getProperty('GESLOTEN_PERIODES');
  if (!bestaand) return [];
  try {
    const parsed = JSON.parse(bestaand);
    return Array.isArray(parsed) ? parsed : [];
  } catch (jsonErr) {
    const ts = Date.now();
    const backupKey = 'GESLOTEN_PERIODES_CORRUPT_' + ts;
    Logger.log('GESLOTEN_PERIODES parse fout (self-heal + backup → ' + backupKey + '): ' + jsonErr.message);
    // Backup ZONDER delete tot backup geslaagd is — anders verlies van de
    // enige bron-of-truth voor reconstructie.
    let backupOk = false;
    try {
      props.setProperty(backupKey, bestaand);
      backupOk = true;
    } catch (backupErr) {
      Logger.log('Backup van corrupte GESLOTEN_PERIODES MISLUKT: ' + backupErr.message);
    }
    if (backupOk) {
      try { props.deleteProperty('GESLOTEN_PERIODES'); } catch (_) {}
    }
    try {
      if (typeof schrijfAuditLog_ === 'function') {
        schrijfAuditLog_('GESLOTEN_PERIODES CORRUPT',
          'Self-heal: JSON-fout "' + jsonErr.message + '"; corrupte waarde bewaard als ' +
          backupKey + (backupOk ? '' : ' (BACKUP MISLUKTE — handmatige actie vereist)') +
          '. Handmatige reconstructie aanbevolen vóór nieuwe boekingen in afgesloten jaren.');
      }
    } catch (_) {}
    try {
      if (typeof meldFataalAanOwner_ === 'function') {
        meldFataalAanOwner_('GESLOTEN_PERIODES_CORRUPT',
          'Periode-locks zijn tijdelijk uit door corrupt JSON. ' +
          'Bekijk ScriptProperties → ' + backupKey + ' voor de originele waarde en reconstrueer via Beheer geslotenperiodes.',
          { backupKey: backupKey, backupOk: backupOk, fout: jsonErr.message });
      }
    } catch (_) {}
    return [];
  }
}

/**
 * Vergrendelt een periode zodat er geen nieuwe boekingen in gemaakt kunnen worden.
 * Wordt automatisch aangeroepen bij het afsluiten van een BTW-periode.
 */
function vergrendelPeriode_(van, tot, label) {
  // LockService rond de read-modify-write van GESLOTEN_PERIODES — anders kan
  // een gelijktijdige sluiting (BTW-periode + jaarafsluiting, of twee tabs) de
  // net-toegevoegde periode overschrijven (lost write) en verdwijnt een slot
  // geruisloos. Zelfde patroon als updateGrootboekSaldo_ (audit F-ACC-004).
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const periodes = _leesGeslotenPeriodes_();

    // Voorkom dubbele vergrendeling
    const al = periodes.find(p => p.van === van.toISOString() && p.tot === tot.toISOString());
    if (!al) {
      periodes.push({
        van:   van.toISOString(),
        tot:   tot.toISOString(),
        label: label || formatDatum_(van) + ' t/m ' + formatDatum_(tot),
        geslotenOp: new Date().toISOString(),
      });
      props.setProperty('GESLOTEN_PERIODES', JSON.stringify(periodes));
      Logger.log('Periode vergrendeld: ' + label);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Toont een overzicht van vergrendelde periodes en biedt de mogelijkheid
 * om een periode te ontgrendelen.
 */
function beheerGeslotenPeriodes() {
  const props = PropertiesService.getScriptProperties();
  const periodes = _leesGeslotenPeriodes_();   // CYCLE-53: self-healing parse
  const ui = SpreadsheetApp.getUi();

  if (periodes.length === 0) {
    ui.alert('Gesloten periodes', 'Er zijn geen vergrendelde periodes.', ui.ButtonSet.OK);
    return;
  }

  const lijstTekst = periodes.map((p, i) =>
    `${i + 1}. ${p.label}  (gesloten op ${p.geslotenOp ? formatDatum_(new Date(p.geslotenOp)) : '?'})`
  ).join('\n');

  const resp = ui.prompt(
    '🔒 Gesloten periodes',
    `De volgende periodes zijn vergrendeld:\n\n${lijstTekst}\n\n` +
    `Voer het nummer in van de periode die je wilt ontgrendelen, of druk op Annuleren:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const nr = parseInt(resp.getResponseText().trim()) - 1;
  if (isNaN(nr) || nr < 0 || nr >= periodes.length) {
    ui.alert('Ongeldig nummer — kies 1 t/m ' + periodes.length + ' uit de lijst.');
    return;
  }

  // Audit-vondst ronde 2 (accountant + Belastingdienst):
  // Bij art. 52 AWR-controle moet retroactieve wijziging van afgesloten
  // periode "gemotiveerd én onmiskenbaar in audit-trail" worden vastgelegd.
  // Single-YES-click was te laag → "kennelijke onjuistheid"-vermoeden.
  //
  // Nu: 3 gates achter elkaar:
  //   1. Klant typt EXACT de periode-label (typo-resistant intent)
  //   2. Klant typt motivatie (min 20 chars vrije tekst)
  //   3. Bevestigings-dialog toont samenvatting + waarschuwing
  // Pas dan: ontgrendeling + audit-log met motivatie.
  const periode = periodes[nr];

  // Audit ronde 2 (customer-voice): vooraankondiging zodat klant niet
  // verrast wordt door "stap 1 van 3" zonder context.
  const introOk = ui.alert(
    '⚠️ Periode ontgrendelen — uitleg',
    `Je gaat ${periode.label} ontgrendelen. Dit kost 3 bevestigingen:\n\n` +
    `  1. Type de periode-naam exact (intent-check)\n` +
    `  2. Geef een motivatie (min 20 tekens — voor audit-trail)\n` +
    `  3. Eindbevestiging met samenvatting\n\n` +
    `De ontgrendeling wordt vastgelegd in het AuditLog voor controle door\n` +
    `Belastingdienst (art. 52 AWR). Doorgaan?`,
    ui.ButtonSet.YES_NO
  );
  if (introOk !== ui.Button.YES) return;

  const bevestigTekst = ui.prompt(
    '⚠️ Periode ontgrendelen — stap 1 van 3',
    `Type EXACT de periode-naam om je intentie te bevestigen.\n\n` +
    `Verwacht: ${periode.label}\n\n` +
    `(Hoofdletters/spaties moeten overeenkomen)`,
    ui.ButtonSet.OK_CANCEL
  );
  if (bevestigTekst.getSelectedButton() !== ui.Button.OK) return;
  if (String(bevestigTekst.getResponseText() || '').trim() !== periode.label) {
    ui.alert(
      'Geannuleerd',
      'De periode-naam kwam niet exact overeen — uit veiligheid is de actie afgebroken. ' +
      'Probeer opnieuw via Boekhoudbaar → Boekjaar → Gesloten periodes.',
      ui.ButtonSet.OK
    );
    return;
  }

  const motivatieDialog = ui.prompt(
    '⚠️ Periode ontgrendelen — stap 2 van 3',
    `Geef een MOTIVATIE voor het ontgrendelen (min 20 tekens).\n\n` +
    `Deze tekst wordt vastgelegd in het AuditLog ter verdediging bij een ` +
    `controle door Belastingdienst (art. 52 AWR — administratie-betrouwbaarheid).\n\n` +
    `Voorbeelden:\n` +
    `  • "Correctie inkoopfactuur leverancier X, datum 12-02 — bewijsstuk later ontvangen"\n` +
    `  • "Boekjaar 2025 herstellen na ontdekking foutboeking €450 advieskosten"`,
    ui.ButtonSet.OK_CANCEL
  );
  if (motivatieDialog.getSelectedButton() !== ui.Button.OK) return;
  const motivatie = String(motivatieDialog.getResponseText() || '').trim();
  if (motivatie.length < 20) {
    ui.alert(
      'Motivatie te kort',
      'Geef minstens 20 tekens motivatie. Deze tekst wordt vastgelegd in het AuditLog ' +
      'en kan worden overlegd bij een controle door Belastingdienst.',
      ui.ButtonSet.OK
    );
    return;
  }

  const bevestiging = ui.alert(
    '⚠️ Periode ontgrendelen — stap 3 van 3',
    `Periode:    ${periode.label}\n` +
    `Motivatie:  ${motivatie.slice(0, 200)}\n\n` +
    `BELANGRIJK: deze ontgrendeling wordt vastgelegd in het AuditLog ` +
    `inclusief je naam, tijdstip en bovenstaande motivatie. Bij latere ` +
    `Belastingdienst-controle kan deze regel als bewijs van een ` +
    `weloverwogen wijziging worden overlegd.\n\n` +
    `Doorgaan?`,
    ui.ButtonSet.YES_NO
  );

  if (bevestiging === ui.Button.YES) {
    // Audit ronde 2 (accountant): bewaar ontgrendelingshistorie i.p.v.
    // splice (vorige gesloten-staat verloor). Append naar
    // GESLOTEN_PERIODES_HISTORIE-ScriptProperty zodat meervoudige open/
    // sluit-cycli terugleesbaar zijn voor Belastingdienst-controleur.
    try {
      const histRuw = props.getProperty('GESLOTEN_PERIODES_HISTORIE') || '[]';
      let hist = [];
      try { hist = JSON.parse(histRuw); if (!Array.isArray(hist)) hist = []; } catch (_) {}
      hist.push({
        label: periode.label,
        van: periode.van || null,
        tot: periode.tot || null,
        geslotenOp: periode.geslotenOp || null,
        ontgrendeldOp: new Date().toISOString(),
        ontgrendeldDoor: (function() { try { return Session.getActiveUser().getEmail() || ''; } catch (_) { return ''; } })(),
        motivatie: motivatie.slice(0, 400),
      });
      // Cap historie op laatste 15 ontgrendelingen. Audit ronde 3:
      // 100 × ~450B (motivatie 400 + meta) ≈ 45KB > 9KB-per-property limiet
      // → setProperty zou throwen → catch swallow → silent data-loss op historie.
      // 15 entries × ~450B = ~7KB, ruim onder 9KB. Deze prop is enkel een
      // snelle leeshulp; de DUURZAME 7-jaars vastlegging (art. 52 AWR) gebeurt
      // los hieronder via logBusinessEventNaarAuditSheet_ → AUDIT_LOG-sheet
      // (hash-chain + 7-jaars retentie). Oudere entries dan 15 vallen dus
      // alleen uit déze leeshulp, niet uit het duurzame bewijs.
      if (hist.length > 15) hist = hist.slice(hist.length - 15);
      props.setProperty('GESLOTEN_PERIODES_HISTORIE', JSON.stringify(hist));
    } catch (_) { /* historie-write mag splice niet blokkeren */ }

    periodes.splice(nr, 1);
    props.setProperty('GESLOTEN_PERIODES', JSON.stringify(periodes));
    // PERIODE_ONTGRENDELD is legaal-significant → schrijfAuditLog_ routeert het
    // sinds F-ACC-001 zélf duurzaam naar de AUDIT_LOG-sheet (7-jaars bewaar-
    // plicht art. 52 AWR). Geen aparte dual-write meer — die zou nu dubbel
    // loggen in de sheet.
    try {
      schrijfAuditLog_('PERIODE_ONTGRENDELD',
        'periode=' + periode.label + ' | motivatie=' + motivatie.slice(0, 400));
    } catch (_) {}
    ui.alert(
      'Periode ontgrendeld + gelogd',
      'De periode is ontgrendeld. De motivatie staat in AuditLog (verborgen tabblad). ' +
      'Maak nu de noodzakelijke correctie(s) en sluit de periode daarna opnieuw af.',
      ui.ButtonSet.OK
    );
  }
}

// ─────────────────────────────────────────────
//  CYCLE-9 — STORNO DIALOG (menu-entrypoint)
// ─────────────────────────────────────────────
/**
 * Opent een dialog waarmee de klant een eerder geboekte journaalpost kan
 * storneren. Vereist boekingId + reden (verplicht voor audit-trail).
 *
 * Strict-validatie via maakStornoJournaalpost_ (cycle 7):
 *  - Origineel moet bestaan
 *  - Mag niet al gestorneerd zijn
 *  - Reden ≥ 5 tekens
 */
function openStornoDialog() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const idResp = ui.prompt(
    'Journaalpost storneren',
    'Welk boekingId wil je storneren? (zichtbaar in kolom A van Journaalposten, bv. BK000007)',
    ui.ButtonSet.OK_CANCEL
  );
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  const boekingId = String(idResp.getResponseText() || '').trim();
  if (!boekingId) {
    ui.alert('Geen boekingId opgegeven — storno geannuleerd.');
    return;
  }

  const redenResp = ui.prompt(
    'Reden van storno',
    'Waarom wil je deze boeking storneren? (min. 5 tekens — komt in audit-trail voor Belastingdienst)',
    ui.ButtonSet.OK_CANCEL
  );
  if (redenResp.getSelectedButton() !== ui.Button.OK) return;
  const reden = String(redenResp.getResponseText() || '').trim();

  try {
    const ss = getSpreadsheet_();
    const stornoId = maakStornoJournaalpost_(ss, boekingId, reden);
    ui.alert(
      'Storno geboekt',
      'Boeking ' + boekingId + ' is teruggedraaid met een nieuwe inverse boeking (' + stornoId + ').\n\n' +
      'Beide boekingen blijven zichtbaar in de Journaalposten-tab (art. 52 AWR — niets wordt verwijderd).\n' +
      'Grootboeksaldi zijn nu terug in pre-origineel-staat.',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Storno mislukt', err.message || String(err), ui.ButtonSet.OK);
  }
}

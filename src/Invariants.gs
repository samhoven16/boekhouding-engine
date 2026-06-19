/**
 * Invariants.gs
 *
 * Centrale validator-module voor invariants — eigenschappen die ALTIJD waar
 * moeten zijn vóór een schrijfoperatie commits. Conform masterplan maand 1:
 * "deterministische invariants die nooit gebypassed kunnen worden door UI-code".
 *
 * Filosofie: elke functie hier gooit een specifieke Error met klant-actie als
 * de invariant geschonden wordt. Caller MOET deze valideren voor write — anders
 * loopt data scheef en zit klant met fiscale boete.
 *
 * Invariants gedekt:
 *   1. Factuurnummer-uniciteit en doorlopendheid (art. 35a Wet OB)
 *   2. Debet-credit balans in journaalpost (= principe dubbel boekhouden)
 *   3. BTW-totaal aansluit op factuurregels
 *   4. KOR-grens €20.000 omzet/jaar (waarschuwing, geen reject)
 *   5. Bewaarplicht-record aanwezig op elk financieel record (7 jaar AWR art. 52)
 *   6. RGS-rekening-code valide (bestaat in grootboekschema)
 *
 * Gebruik:
 *   valideerInvariantsVoorFactuur_(ss, factuurnr, regels, bedragIncl)
 *   valideerInvariantsVoorJournaalpost_(ss, debet, credit, bedrag)
 *   waarschuwKorGrensIndienOverschreden_(ss, jaaromzet)
 *
 * Bij faal: gooi InvariantSchending — bevat altijd:
 *   - code: machineleesbare identifier (bv. 'FACTUURNR_DUPLICAAT')
 *   - klantBoodschap: wat de klant ziet
 *   - debugInfo: voor support
 */

'use strict';

// ─────────────────────────────────────────────
//  CUSTOM ERROR TYPE
// ─────────────────────────────────────────────

/**
 * Schending van een invariant — moet ALTIJD blokkeren, nooit silent.
 *
 * @param {string} code Machineleesbare identifier (bv. 'BTW_TOTAAL_MISMATCH')
 * @param {string} klantBoodschap Wat klant ziet (concrete actie)
 * @param {Object} [debugInfo] Extra context voor support
 */
function InvariantSchending(code, klantBoodschap, debugInfo) {
  this.name = 'InvariantSchending';
  this.code = code;
  this.message = klantBoodschap;
  this.klantBoodschap = klantBoodschap;
  this.debugInfo = debugInfo || {};
  this.stack = (new Error()).stack;
}
InvariantSchending.prototype = Object.create(Error.prototype);
InvariantSchending.prototype.constructor = InvariantSchending;

// ─────────────────────────────────────────────
//  INVARIANT 1: FACTUURNUMMER-UNICITEIT
// ─────────────────────────────────────────────

/**
 * Controleer dat factuurnummer NOG NIET bestaat in VERKOOPFACTUREN-tab.
 * Art. 35a Wet OB vereist unieke, doorlopende nummering.
 *
 * @param {Spreadsheet} ss
 * @param {string} factuurnummer Het te schrijven nummer (bv. "2026-001")
 * @throws {InvariantSchending} code=FACTUURNR_DUPLICAAT
 */
function valideerFactuurnummerUniek_(ss, factuurnummer) {
  if (!factuurnummer) {
    throw new InvariantSchending(
      'FACTUURNR_LEEG',
      'Factuurnummer mag niet leeg zijn — Belastingdienst vereist unieke nummers per factuur (art. 35a Wet OB).',
      { factuurnummer: factuurnummer }
    );
  }
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!sheet) return;  // sheet bestaat niet (nog) — geen duplicaat mogelijk

  const data = sheet.getDataRange().getValues();
  const target = String(factuurnummer).trim();
  for (let i = 1; i < data.length; i++) {
    // Kolom A = factuurnummer-opgemaakt OF kolom B (afhankelijk van schema-versie)
    const rij0 = String(data[i][KOL.VF.factuurId] || '').trim();
    const rij1 = String(data[i][KOL.VF.factuurnummer] || '').trim();
    if (rij0 === target || rij1 === target) {
      throw new InvariantSchending(
        'FACTUURNR_DUPLICAAT',
        'Factuurnummer ' + factuurnummer + ' bestaat al in je administratie. ' +
        'Belastingdienst vereist unieke nummers per factuur. Controleer of je per ongeluk een ' +
        'dubbele boeking probeert te maken, of kies een nieuw nummer.',
        { factuurnummer: target, rijIndex: i + 1 }
      );
    }
  }
}

// ─────────────────────────────────────────────
//  INVARIANT 2: DEBET-CREDIT BALANS
// ─────────────────────────────────────────────

/**
 * Dubbel boekhouden eist dat een journaalpost in evenwicht is.
 *
 * @param {string|number} debetRekening
 * @param {string|number} creditRekening
 * @param {number} bedrag
 * @throws {InvariantSchending} code=JOURNAALPOST_GEEN_BALANS, JOURNAALPOST_REK_LEEG
 */
function valideerJournaalpostBalans_(debetRekening, creditRekening, bedrag) {
  if (!debetRekening || !creditRekening) {
    throw new InvariantSchending(
      'JOURNAALPOST_REK_LEEG',
      'Journaalpost kan niet worden geboekt: debet- of credit-rekening ontbreekt. ' +
      'Dit is een interne fout — neem contact op met support.',
      { debet: debetRekening, credit: creditRekening, bedrag: bedrag }
    );
  }
  if (String(debetRekening).trim() === String(creditRekening).trim()) {
    throw new InvariantSchending(
      'JOURNAALPOST_ZELFDE_REK',
      'Journaalpost kan niet worden geboekt: debet- en credit-rekening zijn identiek (' +
      debetRekening + '). Dit zou betekenen dat de boeking geen effect heeft op de balans.',
      { debet: debetRekening, credit: creditRekening, bedrag: bedrag }
    );
  }
  const bedragNum = parseFloat(bedrag);
  if (!isFinite(bedragNum) || bedragNum <= 0) {
    throw new InvariantSchending(
      'JOURNAALPOST_BEDRAG_ONGELDIG',
      'Journaalpost kan niet worden geboekt met bedrag ' + bedrag +
      '. Bedrag moet een positief getal zijn.',
      { bedrag: bedrag }
    );
  }
  // CYCLE-3 FIX (axiom 8 — leaf accounts): blokkeer boekingen op pure
  // category-header-rekeningen die NERGENS in src/ als debet/credit worden
  // gebruikt en logisch parent zijn van meerdere sub-accounts.
  //
  // Conservatieve scope: alleen 3 onbetwiste parents. 1400/4100 zijn óók
  // technisch parent maar worden ACTIEF gebruikt (BTW-suspensie + afdracht)
  // — die strict-enforcen zou bestaande flow breken. Voor die ambigue
  // gevallen: alleen audit-log waarschuwing (geen throw).
  const debetStr  = String(debetRekening).trim();
  const creditStr = String(creditRekening).trim();
  const purePArents = ['0100', '0200', '0300'];
  for (let i = 0; i < purePArents.length; i++) {
    if (debetStr === purePArents[i] || creditStr === purePArents[i]) {
      throw new InvariantSchending(
        'REKENING_NIET_POSTABLE',
        'Journaalpost kan niet worden geboekt op rekening ' + purePArents[i] +
        ' — dit is een categorie-header, geen boekbare rekening. ' +
        'Gebruik een specifieke sub-rekening (bv. 0110, 0120, 0210, 0220, etc.).',
        { debet: debetStr, credit: creditStr, parent: purePArents[i] }
      );
    }
  }
  // Ambigue parents (1400, 4100) — alleen waarschuwen via audit-log.
  // Verwijder deze warning zodra het design rond BTW-saldi (parent vs leaf)
  // is uitgezuiverd. Voor nu: detectie zonder blokkade.
  const ambiguousParents = ['1400', '4100'];
  for (let j = 0; j < ambiguousParents.length; j++) {
    if (debetStr === ambiguousParents[j] || creditStr === ambiguousParents[j]) {
      try {
        if (typeof schrijfAuditLog_ === 'function') {
          schrijfAuditLog_('REKENING AMBIGU PARENT',
            'Boeking op ' + ambiguousParents[j] + ' (parent-categorie). ' +
            'Overweeg specifieke sub-rekening (1410/1420 voor BTW-voorbelasting, ' +
            '4110/4120/4130 voor BTW-afdracht).');
        }
      } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────────
//  INVARIANT 3: BTW-TOTAAL AANSLUITING
// ─────────────────────────────────────────────

/**
 * Verifieer dat BTW-bedrag aansluit op (regels × tarief), tot een afrondings-
 * tolerantie van 0,02 (per regel cumulatief).
 *
 * @param {Array<{prijsExcl:number, aantal:number, tarief:number}>} regels
 * @param {number} btwBerekend Som van BTW per regel
 * @param {number} subtotaalExcl Som excl. BTW
 * @param {number} totaalIncl Som incl. BTW
 * @throws {InvariantSchending} code=BTW_TOTAAL_MISMATCH, BEDRAG_BALANS_FOUT
 */
function valideerBtwAansluiting_(regels, btwBerekend, subtotaalExcl, totaalIncl) {
  if (!Array.isArray(regels) || regels.length === 0) {
    throw new InvariantSchending(
      'FACTUUR_GEEN_REGELS',
      'Factuur kan niet worden opgeslagen zonder factuurregels.',
      { regels: regels }
    );
  }

  let exclCheck = 0;
  let btwCheck = 0;
  regels.forEach(function(r, i) {
    const prijs = parseFloat(r.prijsExcl) || 0;
    const aantal = parseFloat(r.aantal) || 0;
    const tarief = parseFloat(r.tarief) || 0;
    const regelExcl = prijs * aantal;
    const regelBtw = regelExcl * tarief;
    exclCheck += regelExcl;
    btwCheck += regelBtw;
    if (prijs < 0 || aantal < 0) {
      throw new InvariantSchending(
        'FACTUURREGEL_NEGATIEF',
        'Factuurregel ' + (i + 1) + ' heeft een negatieve prijs of aantal. ' +
        'Voor creditnota gebruik je de aparte creditnota-functie.',
        { regelIndex: i, prijs: prijs, aantal: aantal }
      );
    }
  });

  // Tolerantie: 1 cent per regel (afronding)
  const tolerantie = Math.max(0.01 * regels.length, 0.02);

  if (Math.abs(exclCheck - subtotaalExcl) > tolerantie) {
    throw new InvariantSchending(
      'BEDRAG_BALANS_FOUT',
      'Subtotaal excl. BTW klopt niet met de regels. Berekend uit regels: ' +
      exclCheck.toFixed(2) + ', opgegeven: ' + subtotaalExcl.toFixed(2) +
      '. Verschil: ' + Math.abs(exclCheck - subtotaalExcl).toFixed(2) + '.',
      { exclCheck: exclCheck, subtotaalExcl: subtotaalExcl, tolerantie: tolerantie }
    );
  }

  if (Math.abs(btwCheck - btwBerekend) > tolerantie) {
    throw new InvariantSchending(
      'BTW_TOTAAL_MISMATCH',
      'BTW-totaal klopt niet met de regel-tarieven. Berekend uit regels: ' +
      btwCheck.toFixed(2) + ', opgegeven: ' + btwBerekend.toFixed(2) +
      '. Verschil: ' + Math.abs(btwCheck - btwBerekend).toFixed(2) + '.',
      { btwCheck: btwCheck, btwBerekend: btwBerekend, tolerantie: tolerantie }
    );
  }

  const inclCheck = exclCheck + btwCheck;
  if (Math.abs(inclCheck - totaalIncl) > tolerantie) {
    throw new InvariantSchending(
      'TOTAAL_INCL_MISMATCH',
      'Totaal incl. BTW klopt niet. Berekend: ' + inclCheck.toFixed(2) +
      ', opgegeven: ' + totaalIncl.toFixed(2) + '.',
      { inclCheck: inclCheck, totaalIncl: totaalIncl, tolerantie: tolerantie }
    );
  }
}

// ─────────────────────────────────────────────
//  INVARIANT 4: KOR-GRENS (waarschuwing, niet blokkerend)
// ─────────────────────────────────────────────

/**
 * Controleer of klant met KOR-status de €20.000-grens (2026) nadert of
 * overschrijdt. Geen reject — wel waarschuwing + toast + audit-log.
 *
 * @param {Spreadsheet} ss
 * @param {number} jaaromzetTotaal Cumulatieve omzet in lopend jaar (excl. BTW)
 * @returns {Object} { status: 'ok'|'naderend'|'overschreden', percentage }
 */
function checkKorGrens_(ss, jaaromzetTotaal) {
  let korActief = false;
  try {
    if (typeof getInstelling_ === 'function') {
      // Setup.gs:626 schrijft 'KOR regeling actief' — moet hier matchen.
      // Eerdere key 'KOR actief' bestond nergens in productie-sheet → functie
      // returned altijd 'nvt' als ooit aangeroepen vanuit src/.
      korActief = String(getInstelling_('KOR regeling actief') || '').toLowerCase() === 'ja';
    }
  } catch (_) {}

  if (!korActief) return { status: 'nvt', percentage: 0 };

  let grens = 20000;
  try {
    if (typeof getBelasting_ === 'function') {
      const B = getBelasting_();
      if (B && B.KOR_GRENS) grens = B.KOR_GRENS;
    }
  } catch (_) {}

  const omzet = parseFloat(jaaromzetTotaal) || 0;
  const pct = (omzet / grens) * 100;

  if (omzet > grens) {
    try {
      schrijfAuditLog_('KOR-GRENS OVERSCHREDEN',
        'Cumulatieve omzet ' + omzet.toFixed(2) + ' > grens ' + grens +
        '. Klant moet zich afmelden bij Belastingdienst (per kwartaal).');
    } catch (_) {}
    try {
      ss.toast(
        'KOR-grens overschreden: ' + Math.round(omzet) + ' van ' + grens +
        '. Meld je af bij Belastingdienst en factureer voortaan met BTW.',
        'KOR-monitor', 15
      );
    } catch (_) {}
    return { status: 'overschreden', percentage: pct };
  }

  if (omzet > grens * 0.9) {
    // 90% drempel: waarschuwing
    try {
      ss.toast(
        'KOR-omzet is ' + Math.round(omzet) + ' (' + Math.round(pct) + '% van ' + grens + '). ' +
        'Plan resterende facturen — bij overschrijden moet je BTW gaan rekenen.',
        'KOR-monitor — bijna grens', 10
      );
    } catch (_) {}
    return { status: 'naderend', percentage: pct };
  }

  return { status: 'ok', percentage: pct };
}

// ─────────────────────────────────────────────
//  INVARIANT 5: BEWAARPLICHT-MARKERING
// ─────────────────────────────────────────────

/**
 * Garandeer dat een financieel record een bewaarplicht-datum heeft die ≥ 7 jaar
 * vanaf boekjaar-einde is (art. 52 AWR). Default: huidige datum + 7 jaar.
 * Onroerend goed kent 10 jaar — alleen via expliciete opt-in.
 *
 * @param {Date} [bewaarplichtTot] Optioneel: expliciete datum
 * @param {boolean} [isOnroerend] True voor onroerend-goed (10 jaar)
 * @returns {Date} Gevalideerde of berekende bewaarplicht-tot-datum
 */
function bepaalBewaarplichtTot_(bewaarplichtTot, isOnroerend) {
  const jaren = isOnroerend ? 10 : 7;
  if (bewaarplichtTot instanceof Date && !isNaN(bewaarplichtTot.getTime())) {
    return bewaarplichtTot;
  }
  const nu = new Date();
  // Boekjaar-einde = 31 december van huidig jaar
  const boekjaarEinde = new Date(nu.getFullYear(), 11, 31);
  return new Date(boekjaarEinde.getFullYear() + jaren, 11, 31);
}

/**
 * V6: proactieve bewaarplicht-waarschuwing.
 *
 * Fiscale bewaarplicht art. 52 AWR = 7 jaar (10 voor onroerend goed). Als de
 * oudste journaalpost in de spreadsheet de 6,5-jaars-grens nadert, krijgt
 * de klant een mail met de aanbeveling om NU het XAF-bestand + PDF-archief
 * te exporteren en buiten Google Drive te bewaren. Zonder die backup riskeer
 * je bij een Belastingdienst-controle bewijslast-omkering (= naheffing
 * zonder verweer als je administratie niet meer compleet is).
 *
 * Idempotent: 1× per kalenderjaar via ScriptProperty BEWAARPLICHT_GEMELD_<jaar>.
 * Aangeroepen vanuit dagelijkseTaken.
 */
function controleerBewaarplichtAlert_() {
  let ss;
  try { ss = getSpreadsheet_(); } catch (_) { return; }
  if (!ss) return;
  const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!jpSheet || jpSheet.getLastRow() < 2) return;

  // Scan kolom [1] (Datum). Beperk tot een vaste range om niet 50k rijen
  // te hoeven scannen — alleen de eerste 5 datum-cellen na de header zijn
  // genoeg om de oudste te kennen als het een normaal-geordende sheet is.
  // Defense: bij ongeordende sheet doen we volle scan tot eerste 1000 rijen.
  const max = Math.min(jpSheet.getLastRow(), 1001);
  const data = jpSheet.getRange(2, 2, max - 1, 1).getValues().map(function (r) { return r[0]; });
  let oudsteDatum = null;
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const d = parseDatum_(data[i]);
    if (!d || isNaN(d.getTime())) continue;
    if (!oudsteDatum || d < oudsteDatum) oudsteDatum = d;
  }
  if (!oudsteDatum) return;

  const dagenSinds = Math.floor((Date.now() - oudsteDatum.getTime()) / (24 * 60 * 60 * 1000));
  if (dagenSinds < 6.5 * 365) return;  // bewaarplicht nog ruim binnen termijn

  // Idempotent: 1× per kalenderjaar
  const huidigJaar = new Date().getFullYear();
  const idemKey = 'BEWAARPLICHT_GEMELD_' + huidigJaar;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(idemKey)) return;
  try { props.setProperty(idemKey, String(Date.now())); } catch (_) {}

  const jaren = Math.round(dagenSinds / 365 * 10) / 10;
  try {
    schrijfAuditLog_('BEWAARPLICHT NADERT',
      'Oudste boeking ' +
      Utilities.formatDate(oudsteDatum, 'Europe/Amsterdam', 'yyyy-MM-dd') +
      ' = ' + jaren + ' jaar oud. XAF-archief aanbevolen.');
  } catch (_) {}

  const ontvanger = (typeof getInstelling_ === 'function')
    ? (getInstelling_('Email rapporten naar') || getInstelling_('Email'))
    : null;
  if (!ontvanger) return;

  const body =
    'Beste,\n\n' +
    'Je oudste boeking dateert van ' +
    Utilities.formatDate(oudsteDatum, 'Europe/Amsterdam', 'dd-MM-yyyy') + '.\n' +
    'Dat is ongeveer ' + jaren + ' jaar geleden.\n\n' +
    'De fiscale bewaarplicht (art. 52 AWR) is 7 jaar (10 jaar voor onroerend\n' +
    'goed). Exporteer NU het XAF-bestand én een PDF-archief van je facturen,\n' +
    'en bewaar dat BUITEN Google Drive (USB, externe schijf, persoonlijke cloud).\n\n' +
    'In Boekhoudbaar:  Controle & Export → XAF-export\n\n' +
    'Bij een Belastingdienst-controle is dit het verschil tussen "ik heb alles\n' +
    'bewaard" en bewijslast-omkering — dat laatste betekent naheffing zonder\n' +
    'verweer als je administratie niet meer compleet is.\n\n' +
    'Boekhoudbaar';

  if (typeof stuurMailMetDlq_ === 'function') {
    stuurMailMetDlq_(ontvanger, '📦 Bewaarplicht: archiveer je boekhouding nu', body);
  }
}

// ─────────────────────────────────────────────
//  HOOFD-VALIDATOR: alle invariants in één call
// ─────────────────────────────────────────────

/**
 * Valideert alle invariants vóór een factuur-write. Gooit InvariantSchending
 * bij de eerste schending. Caller moet deze CATCHEN en aan klant TONEN
 * (niet swallow!).
 *
 * @param {Spreadsheet} ss
 * @param {Object} factuur { factuurnummer, regels, subtotaalExcl, btw, totaalIncl }
 */
function valideerInvariantsVoorFactuur_(ss, factuur) {
  valideerFactuurnummerUniek_(ss, factuur.factuurnummer);
  valideerBtwAansluiting_(
    factuur.regels,
    factuur.btw,
    factuur.subtotaalExcl,
    factuur.totaalIncl
  );
}

/**
 * Valideert alle invariants vóór een journaalpost-write.
 *
 * @param {string|number} debet
 * @param {string|number} credit
 * @param {number} bedrag
 */
function valideerInvariantsVoorJournaalpost_(debet, credit, bedrag) {
  valideerJournaalpostBalans_(debet, credit, bedrag);
}

// ─────────────────────────────────────────────
//  ISSUE #123 BATCH 3 — PENDING/COMMITTED-helpers
// ─────────────────────────────────────────────
//
// Wettelijk eisen rapporten en BTW-aangiften alleen "vastgestelde" boekingen.
// In de huidige architectuur staat dat in kolom Q van JOURNAALPOSTEN:
//   'Gevalideerd' → COMMITTED (telt mee)
//   'Concept'     → PENDING   (telt NIET mee — moet handmatig bevestigd)
//   'CORRUPT'     → uit alle aggregaties (compensating action faalde)
//   'GESTORNEERD' → uit alle aggregaties (storno-tegenpost)
//   leeg/null     → COMMITTED (backwards-compat: legacy rijen zonder
//                              status-kolom worden als wettelijk
//                              vastgesteld behandeld; ze bestonden vóór
//                              de Q-R-S-kolommen werden toegevoegd)
//
// Helpers hieronder zijn de bron-van-waarheid. Callers moeten via
// _journaalpostIsCommitted_(rij) checken — geen string-matching elders.

/**
 * Geeft het wettelijke COMMITTED-state van een journaalpost-rij.
 *
 * @param {Array} rij  rij uit JOURNAALPOSTEN getDataRange().getValues()
 * @returns {boolean}  true als de rij meetelt voor rapporten/aangifte
 */
function _journaalpostIsCommitted_(rij) {
  if (!rij || rij.length < 17) return true; // legacy korte rij → committed
  const raw = rij[16];
  if (raw === null || raw === undefined || raw === '') return true; // legacy lege Q
  const status = String(raw).trim().toUpperCase();
  return status === 'GEVALIDEERD' || status === 'COMMITTED';
}

/**
 * Filtert een 2D-array journaalpost-rijen op COMMITTED (inclusief header
 * op index 0). Behoud rij-volgorde; ongevoelig voor sheet-aanpassingen
 * downstream.
 *
 * @param {Array<Array>} data
 * @returns {Array<Array>}
 */
function _filterJournaalpostenCommitted_(data) {
  if (!Array.isArray(data) || data.length === 0) return data || [];
  const out = [data[0]]; // header
  for (let i = 1; i < data.length; i++) {
    if (_journaalpostIsCommitted_(data[i])) out.push(data[i]);
  }
  return out;
}

// ─────────────────────────────────────────────
//  FORMELE TRANSACTIE-VALIDATOR (issue #123, batch 1)
// ─────────────────────────────────────────────

/**
 * Euro-bedrag → integer centen. Weigert bedragen die niet exact op de cent
 * vallen (10.005 is geen geldig boekingsbedrag). Alle balans-vergelijkingen
 * gebeuren in GEHELE centen — float-epsilon-vergelijkingen zijn verboden in
 * de boekhoudkern (een 0,01-onbalans moet exact 1 cent verschil zijn, geen
 * afrondingsruis).
 *
 * @param {number|string} bedrag
 * @returns {number} integer centen
 * @throws {InvariantSchending} code=BEDRAG_GEEN_CENTEN
 */
function naarCenten_(bedrag) {
  const num = parseFloat(bedrag);
  if (!isFinite(num)) {
    throw new InvariantSchending('BEDRAG_GEEN_CENTEN',
      'Bedrag "' + bedrag + '" is geen getal.', { bedrag: bedrag });
  }
  const centen = Math.round(num * 100);
  if (Math.abs(num * 100 - centen) > 1e-6) {
    throw new InvariantSchending('BEDRAG_GEEN_CENTEN',
      'Bedrag ' + bedrag + ' valt niet exact op de cent. ' +
      'Boekingsbedragen hebben maximaal 2 decimalen.', { bedrag: bedrag });
  }
  return centen;
}

/**
 * Formele transactie-validator (issue #123). Valideert een genormaliseerde
 * transactie — een lijst boekingsregels in integer centen — vóór ENIGE
 * sheet-write. Dit is de toekomstige JOURNAL_MUTATIES-vorm; de huidige
 * enkelbedrag-journaalpost wordt door de caller genormaliseerd naar twee
 * regels (debet + credit).
 *
 * Afgedwongen (throw bij schending, niets wordt geschreven):
 *   T1  transactie heeft ≥ 2 regels (enkelzijdig = geweigerd)
 *   T2  elke regel boekt op precies één zijde (debet XOR credit, > 0)
 *   T3  Σ debetCenten === Σ creditCenten — EXACT, in gehele centen
 *   T4  elke rekening bestaat in GROOTBOEKSCHEMA (alleen wanneer dat
 *       tabblad aanwezig is; ontbreekt het hele tabblad, dan logt
 *       updateGrootboekSaldo_ dat al via het GROOTBOEK-ONTBREEKT-pad)
 *   T5  datum valt niet in een afgesloten boekjaar
 *
 * @param {Spreadsheet} ss
 * @param {Array<{rekening:(string|number), debetCents:number, creditCents:number}>} regels
 * @param {Date} [datum]
 * @throws {InvariantSchending}
 */
function valideerTransactieFormeel_(ss, regels, datum) {
  if (!Array.isArray(regels) || regels.length < 2) {
    throw new InvariantSchending('TRANSACTIE_ENKELZIJDIG',
      'Een boeking moet minimaal een debet- én een creditregel hebben ' +
      '(dubbel boekhouden). Ontvangen: ' + (Array.isArray(regels) ? regels.length : 0) + ' regel(s).',
      { aantalRegels: Array.isArray(regels) ? regels.length : 0 });
  }

  let somDebet = 0;
  let somCredit = 0;
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i];
    const d = r.debetCents;
    const c = r.creditCents;
    if (!Number.isInteger(d) || !Number.isInteger(c) ||
        d < 0 || c < 0 || (d > 0) === (c > 0)) {
      throw new InvariantSchending('TRANSACTIE_REGEL_ONGELDIG',
        'Boekingsregel ' + (i + 1) + ' (rekening ' + r.rekening + ') moet op ' +
        'precies één zijde een positief geheel aantal centen boeken.',
        { regel: i, debetCents: r.debetCents, creditCents: r.creditCents });
    }
    somDebet += d;
    somCredit += c;
  }

  if (somDebet !== somCredit) {
    throw new InvariantSchending('TRANSACTIE_ONBALANS',
      'Boeking is niet in balans: debet ' + (somDebet / 100).toFixed(2) +
      ' ≠ credit ' + (somCredit / 100).toFixed(2) + ' (verschil ' +
      ((somDebet - somCredit) / 100).toFixed(2) + '). ' +
      'Een onbalans — hoe klein ook — kan niet worden geboekt.',
      { somDebetCents: somDebet, somCreditCents: somCredit });
  }

  // T4 — rekening-existentie. Hergebruik de rij-cache uit Boekingen.gs als
  // die geladen is; anders één kolom-read. Tabblad afwezig (test-omgeving,
  // setup nog niet gedraaid) → check overslaan, zie docstring.
  const gb = ss && typeof ss.getSheetByName === 'function'
    ? ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA) : null;
  if (gb) {
    for (let i = 0; i < regels.length; i++) {
      const code = String(regels[i].rekening);
      let gevonden = false;
      // Zelfde echte-sheet-detectie als updateGrootboekSaldo_: de rij-cache
      // vereist getSheetId/getLastRow; kale mocks nemen het getDataRange-pad.
      if (typeof _gbVindRij_ === 'function' &&
          typeof gb.getSheetId === 'function' &&
          typeof gb.getLastRow === 'function') {
        gevonden = _gbVindRij_(gb, code) !== null;
      } else {
        const codes = gb.getDataRange().getValues();
        for (let j = 1; j < codes.length; j++) {
          if (String(codes[j][KOL.GB.code]) === code) { gevonden = true; break; }
        }
      }
      if (!gevonden) {
        throw new InvariantSchending('REKENING_ONBEKEND',
          'Rekening ' + code + ' bestaat niet in het grootboekschema. ' +
          'De boeking is NIET uitgevoerd — zo blijft de balans kloppend. ' +
          'Herstel het schema via Boekhoudbaar → Onderhoud → Tabbladen controleren, ' +
          'of kies een bestaande rekening.',
          { rekening: code });
      }
    }
  }

  // T5 — afgesloten periode (zelfde check als maakJournaalpost_; hier zodat
  // toekomstige directe validator-callers hem niet kunnen vergeten).
  if (datum instanceof Date && !isNaN(datum.getTime()) &&
      typeof jaarAlAfgesloten_ === 'function' && jaarAlAfgesloten_(ss, datum.getFullYear())) {
    throw new InvariantSchending('PERIODE_AFGESLOTEN',
      'Boekjaar ' + datum.getFullYear() + ' is afgesloten. Boek de correctie ' +
      'in het huidige jaar, of maak de jaarafsluiting eerst ongedaan.',
      { jaar: datum.getFullYear() });
  }
}


// ─────────────────────────────────────────────
//  RED-TEAM: BTW-TARIEF CONSISTENCY CHECK
// ─────────────────────────────────────────────
//
// Belastingdienst-boete-risico: klant boekt "boek" als 21% (hoog) ipv 9% (laag).
// Resultaat: te veel BTW gerekend → klant betaalt te veel BTW → bij audit
// correctie + mogelijk boete + suppletie-aangifte verplicht.
//
// Lijst van keywords die DUIDELIJK 9%-tarief vereisen. Bron: belastingdienst.nl
// laag tarief-overzicht. Niet uitputtend — slechts de meest voorkomende
// missclassifications.
//
// Functie returnt waarschuwing-object {ernstig, voorgesteldTarief, reden}
// of null als geen verdenking. Caller (factuur-flow) toont dit als toast
// of in-dialog-waarschuwing voordat de boeking definitief wordt.

const BTW_LAAG_TARIEF_KEYWORDS = [
  // Boeken & media (9%)
  'boek', 'tijdschrift', 'krant', 'magazine', 'ebook', 'audioboek',
  // Voedsel & drank (9%)
  'voedsel', 'levensmiddel', 'maaltijd', 'broodje', 'lunch', 'diner',
  'restaurant', 'catering', 'horeca', 'cafetaria',
  // Cultuur & sport (9%)
  'theater', 'museum', 'concert', 'bioscoop', 'sportevenement', 'attractie',
  // Personenvervoer (9%)
  'taxi', 'trein', 'bus', 'tram', 'metro',
  // Logies — TOT 2025 was 9%, vanaf 1-1-2026 is 21% (Belastingplan 2025)
  // Niet toevoegen — sinds 2026 is hotelovernachting weer 21%.
  // Geneesmiddelen, hulpmiddelen (9%)
  'medicijn', 'geneesmiddel', 'hulpmiddel',
  // Bloemen & planten (9%)
  'bloem', 'plant',
  // Kappersdiensten + fietsenmaker (9%)
  'kapper', 'haarknippen', 'fietsenreparatie',
];

const BTW_HOOG_TARIEF_KEYWORDS = [
  // Diensten standaard 21%
  'advies', 'consultancy', 'design', 'software', 'licentie', 'abonnement',
  'marketing', 'reclame', 'webdesign', 'development',
];

/**
 * Detecteert verdachte BTW-tarief × omschrijving combinatie.
 *
 * @param {string} omschrijving Factuurregel-omschrijving (klant-input)
 * @param {number} tarief 0.21, 0.09, 0 of null
 * @returns {Object|null} { ernstig: bool, voorgesteldTarief: 0.09|0.21|null,
 *                          reden: 'string' } of null als geen verdenking
 */
function checkBtwTariefVerdacht_(omschrijving, tarief) {
  if (omschrijving === null || omschrijving === undefined) return null;
  const t = String(omschrijving).toLowerCase();
  if (!t) return null;

  const tariefNum = parseFloat(tarief);

  // SCENARIO 1: omschrijving suggereert 9% maar klant heeft 21% gekozen
  if (Math.abs(tariefNum - 0.21) < 0.01) {
    for (let i = 0; i < BTW_LAAG_TARIEF_KEYWORDS.length; i++) {
      const kw = BTW_LAAG_TARIEF_KEYWORDS[i];
      if (t.indexOf(kw) !== -1) {
        return {
          ernstig: true,
          voorgesteldTarief: 0.09,
          reden: 'Omschrijving bevat "' + kw + '" — dat valt meestal onder ' +
                 '9% (laag tarief). Controleer dit bij twijfel via Belastingdienst-' +
                 'overzicht laag tarief.',
        };
      }
    }
  }

  // SCENARIO 2: omschrijving suggereert 21% maar klant heeft 9% gekozen
  if (Math.abs(tariefNum - 0.09) < 0.01) {
    for (let i = 0; i < BTW_HOOG_TARIEF_KEYWORDS.length; i++) {
      const kw = BTW_HOOG_TARIEF_KEYWORDS[i];
      if (t.indexOf(kw) !== -1) {
        return {
          ernstig: true,
          voorgesteldTarief: 0.21,
          reden: 'Omschrijving bevat "' + kw + '" — diensten zijn meestal ' +
                 '21% (hoog tarief). Controleer of 9% klopt.',
        };
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────
//  RED-TEAM: BANK-UITGAVE ZONDER INKOOPFACTUUR
// ─────────────────────────────────────────────
//
// Belastingdienst-boete-risico: klant verricht zakelijke betaling vanaf bank,
// maar boekt geen inkoopfactuur → kosten te laag in winst-berekening → IB
// te hoog → klant betaalt te veel IB. Plus BTW-voorbelasting wordt niet
// teruggevraagd.
//
// Detectie: scan bank-uitgaven (negatieve transacties, vaak naar leveranciers)
// die geen ref hebben naar een inkoopfactuur of die niet als kosten-journaalpost
// zijn geboekt. Returnt lijst van verdachte transacties voor klant-review.
//
// @param {Spreadsheet} ss
// @returns {Array<{datum, bedrag, tegenpartij, omschr, rij}>} verdachte uitgaven

function detecteerOngekoppeldeBankuitgaven_(ss) {
  const bankSheet = ss.getSheetByName(SHEETS.BANKTRANSACTIES);
  const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!bankSheet || !jpSheet) return [];

  // Verzamel ref-velden van inkoopboekingen (debet=7xxx kosten, credit=1100 bank)
  const jpData = jpSheet.getDataRange().getValues();
  const gekoppeldeBankRefs = new Set();
  for (let i = 1; i < jpData.length; i++) {
    const debet = String(jpData[i][KOL.JP.debetRekening] || '');
    const credit = String(jpData[i][KOL.JP.creditRekening] || '');
    // Inkoop-betaling: kostenrekening (4xxx/7xxx) debet, bank credit
    if (credit === '1100' && (debet.startsWith('7') || debet.startsWith('4'))) {
      const ref = String(jpData[i][KOL.JP.referentie] || '').trim();
      if (ref) gekoppeldeBankRefs.add(ref);
    }
  }

  // Verzamel referenties van geboekte inkoopfacturen
  const inkoopRefs = new Set();
  if (ifSheet) {
    const ifData = ifSheet.getDataRange().getValues();
    for (let i = 1; i < ifData.length; i++) {
      const ifNr = String(ifData[i][KOL.IF.inkoopId] || '').trim();
      if (ifNr) inkoopRefs.add(ifNr);
    }
  }

  // Scan bank-transacties: negatief bedrag = uitgave
  const verdacht = [];
  const bankData = bankSheet.getDataRange().getValues();
  // Kolommen via KOL.BT (zie src/SheetKolom.gs). F-INV-330: deze functie las
  // voorheen het verkeerde schema (datum←[0]=transactieId, bedrag←[2]=omschrijving)
  // → parseFloat(omschrijving)=NaN→0 → `bedrag >= 0` sloeg ELKE rij over → de
  // controle deed stil niets. (Dead code: geen callers, dus latent.)
  for (let i = 1; i < bankData.length; i++) {
    const datum = bankData[i][KOL.BT.datum];
    const omschr = String(bankData[i][KOL.BT.omschrijving] || '');
    const bedrag = parseFloat(bankData[i][KOL.BT.bedrag]) || 0;
    const tegenpartij = String(bankData[i][KOL.BT.tegenpartij] || '');

    if (bedrag >= 0) continue;  // alleen uitgaven (negatief)
    if (Math.abs(bedrag) < 5) continue;  // skip kleine bedragen (bankkosten etc)

    // Cross-check: matcht deze uitgave een geboekte inkoop?
    let gekoppeld = false;
    // Format-onafhankelijke substring-match: zit een bestaande inkoopfactuur-id
    // ergens in de bank-omschrijving? Voorbeeld: "Betaling IF-2026-001 ABC BV"
    // bevat de ID "IF-2026-001".
    if (inkoopRefs.size > 0) {
      const omschrLower = omschr.toLowerCase();
      inkoopRefs.forEach(function(ref) {
        if (gekoppeld) return;
        const r = String(ref).toLowerCase();
        if (r && omschrLower.indexOf(r) !== -1) gekoppeld = true;
      });
    }
    // Of via journaalpost-ref (kolom 6 in bank-schema, optioneel)
    if (!gekoppeld && gekoppeldeBankRefs.has(String(bankData[i][KOL.BT.referentie] || ''))) gekoppeld = true;

    if (!gekoppeld) {
      verdacht.push({
        rij: i + 1,
        datum: datum,
        bedrag: bedrag,
        omschr: omschr.substring(0, 80),
        tegenpartij: tegenpartij,
      });
    }

    if (verdacht.length > 20) break;  // cap voor performance
  }

  return verdacht;
}

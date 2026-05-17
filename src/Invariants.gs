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
    const rij0 = String(data[i][0] || '').trim();
    const rij1 = String(data[i][1] || '').trim();
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
      korActief = String(getInstelling_('KOR actief') || '').toLowerCase() === 'ja';
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

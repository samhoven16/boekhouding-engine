/**
 * CustomFunctions.gs
 * Aangepaste cel-functies (custom functions) voor gebruik in Sheets:
 *   =BEREKEN_BTW(100; "21%")
 *   =BTW_INCLUSIEF(100; "21%")
 *   =SCHULD_SCHIJF(60000)
 *   =ZZP_NETTO(60000)
 *   =BTW_SALDO(10000; "21%"; 500)
 *   =KM_VERGOEDING(150)
 *
 * Pure functies — geen sheet-reads, geen UrlFetch, geen side effects.
 * Veilig gebruikbaar in formules; herberekent bij wijziging input.
 *
 * Tarieven & schijven volgens Nederlandse fiscale regels 2025.
 */

/**
 * Berekent het BTW-bedrag op basis van een excl-bedrag en een tarief-string.
 *
 * @param {number} bedragExcl  Het bedrag exclusief BTW.
 * @param {string} tarief      "21%", "9%", "0%", "vrijgesteld", of "verlegd".
 * @return {number} Het BTW-bedrag (0 voor vrijgesteld of verlegd).
 * @customfunction
 */
function BEREKEN_BTW(bedragExcl, tarief) {
  var pct = _cf_btwTarief_(tarief);
  if (pct === null) return 0;
  var n = Number(bedragExcl);
  if (!isFinite(n)) return 0;
  return Math.round(n * pct * 100) / 100;
}

/**
 * Berekent het totaalbedrag inclusief BTW.
 *
 * @param {number} bedragExcl  Het bedrag exclusief BTW.
 * @param {string} tarief      "21%", "9%", "0%", "vrijgesteld", of "verlegd".
 * @return {number} Bedrag inclusief BTW.
 * @customfunction
 */
function BTW_INCLUSIEF(bedragExcl, tarief) {
  var n = Number(bedragExcl);
  if (!isFinite(n)) return 0;
  return Math.round((n + BEREKEN_BTW(n, tarief)) * 100) / 100;
}

/**
 * Berekent het exclusieve bedrag uit een inclusief bedrag.
 *
 * @param {number} bedragIncl  Het bedrag inclusief BTW.
 * @param {string} tarief      "21%", "9%", "0%", "vrijgesteld", of "verlegd".
 * @return {number} Bedrag exclusief BTW.
 * @customfunction
 */
function BTW_EXCLUSIEF(bedragIncl, tarief) {
  var pct = _cf_btwTarief_(tarief);
  if (pct === null) return Number(bedragIncl) || 0;
  var n = Number(bedragIncl);
  if (!isFinite(n)) return 0;
  return Math.round((n / (1 + pct)) * 100) / 100;
}

/**
 * Berekent geschatte inkomstenbelasting voor een ZZP'er onder AOW-leeftijd
 * volgens de schijven van 2025 (box 1).
 * Schijf 1: tot € 38.441   → 35,82%
 * Schijf 2: € 38.442 t/m 76.817 → 37,48%
 * Schijf 3: > € 76.817      → 49,50%
 *
 * @param {number} belastbaarInkomen  Belastbaar inkomen na alle aftrekposten.
 * @return {number} Geschatte IB-aanslag (excl. heffingskortingen).
 * @customfunction
 */
function SCHULD_SCHIJF(belastbaarInkomen) {
  var n = Number(belastbaarInkomen);
  if (!isFinite(n) || n <= 0) return 0;
  var s1 = 38441;
  var s2 = 76817;
  var t1 = 0.3582;
  var t2 = 0.3748;
  var t3 = 0.4950;
  var bel = 0;
  if (n <= s1) {
    bel = n * t1;
  } else if (n <= s2) {
    bel = (s1 * t1) + (n - s1) * t2;
  } else {
    bel = (s1 * t1) + (s2 - s1) * t2 + (n - s2) * t3;
  }
  return Math.round(bel * 100) / 100;
}

/**
 * Berekent het geschatte netto jaarinkomen voor een ZZP'er.
 * Past zelfstandigenaftrek (€ 2.470 in 2025), startersaftrek optioneel,
 * en MKB-winstvrijstelling (12,7%) toe vóór schijven.
 *
 * @param {number} winst         Winst uit onderneming (vóór aftrek).
 * @param {boolean} starter      Optioneel: true voor startersaftrek (€ 2.123).
 * @return {number} Geschatte netto winst na IB.
 * @customfunction
 */
function ZZP_NETTO(winst, starter) {
  var w = Number(winst);
  if (!isFinite(w) || w <= 0) return 0;
  var zelfstAftrek = 2470;
  var startersAftrek = starter ? 2123 : 0;
  var naAftrek = Math.max(0, w - zelfstAftrek - startersAftrek);
  var mkbVrijstelling = naAftrek * 0.127;
  var belastbaar = Math.max(0, naAftrek - mkbVrijstelling);
  var ib = SCHULD_SCHIJF(belastbaar);
  // Heffingskorting (vereenvoudigd): grofweg € 3.068 algemene korting + € 5.599 arbeidskorting bij ZZP
  // We schatten conservatief op € 4.500 totaal (zeer afhankelijk van inkomen).
  var heffingskorting = Math.min(ib, 4500);
  var nettoIB = Math.max(0, ib - heffingskorting);
  return Math.round((w - nettoIB) * 100) / 100;
}

/**
 * Berekent het BTW-saldo: te betalen of te ontvangen.
 *
 * @param {number} omzetExcl     Omzet excl. BTW.
 * @param {string} tarief        BTW-tarief op de omzet.
 * @param {number} voorbelasting BTW betaald op inkopen.
 * @return {number} Positief = te betalen, negatief = te ontvangen.
 * @customfunction
 */
function BTW_SALDO(omzetExcl, tarief, voorbelasting) {
  var btwOmzet = BEREKEN_BTW(omzetExcl, tarief);
  var vb = Number(voorbelasting) || 0;
  return Math.round((btwOmzet - vb) * 100) / 100;
}

/**
 * Berekent kilometervergoeding tegen het zakelijke tarief van € 0,23/km (2025).
 *
 * @param {number} kilometers Aantal gereden zakelijke kilometers.
 * @return {number} Vergoeding in euro.
 * @customfunction
 */
function KM_VERGOEDING(kilometers) {
  var km = Number(kilometers);
  if (!isFinite(km) || km < 0) return 0;
  return Math.round(km * 0.23 * 100) / 100;
}

/**
 * Bepaalt of een bedrag valt onder de Kleine Ondernemers Regeling (KOR).
 * Drempel: € 20.000 omzet per jaar.
 *
 * @param {number} jaarOmzet Verwachte jaaromzet.
 * @return {string} "JA — KOR mogelijk" of "NEE — boven drempel".
 * @customfunction
 */
function KOR_GESCHIKT(jaarOmzet) {
  var n = Number(jaarOmzet);
  if (!isFinite(n)) return 'Onbekend';
  return n <= 20000 ? 'JA — KOR mogelijk' : 'NEE — boven drempel';
}

/**
 * Berekent de maandelijkse afschrijving lineair op basis van aanschafwaarde,
 * gebruiksjaren en restwaarde.
 *
 * @param {number} aanschafwaarde  Aankoopbedrag excl. BTW.
 * @param {number} gebruiksjaren   Aantal jaren afschrijven.
 * @param {number} restwaarde      Optioneel: restwaarde na afschrijving.
 * @return {number} Maandelijkse afschrijving in euro.
 * @customfunction
 */
function AFSCHRIJVING_MAAND(aanschafwaarde, gebruiksjaren, restwaarde) {
  var w = Number(aanschafwaarde);
  var jr = Number(gebruiksjaren);
  var rest = Number(restwaarde) || 0;
  if (!isFinite(w) || !isFinite(jr) || jr <= 0 || w <= rest) return 0;
  return Math.round(((w - rest) / (jr * 12)) * 100) / 100;
}

/**
 * Bereken het aantal werkdagen tussen twee data (excl. weekend).
 *
 * @param {Date|string} startDatum Startdatum.
 * @param {Date|string} eindDatum  Einddatum.
 * @return {number} Aantal werkdagen.
 * @customfunction
 */
function WERKDAGEN(startDatum, eindDatum) {
  var d1 = (startDatum instanceof Date) ? startDatum : new Date(startDatum);
  var d2 = (eindDatum instanceof Date) ? eindDatum : new Date(eindDatum);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  if (d1 > d2) { var t = d1; d1 = d2; d2 = t; }
  var teller = 0;
  var d = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  while (d <= d2) {
    var dag = d.getDay();
    if (dag !== 0 && dag !== 6) teller++;
    d.setDate(d.getDate() + 1);
  }
  return teller;
}

// ─────────────────────────────────────────────
//  INTERNE HELPERS (niet als customfunction blootgesteld)
// ─────────────────────────────────────────────

/**
 * Parseert een tarief-string naar een decimaal percentage.
 * Geeft null terug bij vrijgesteld/verlegd (geen BTW van toepassing).
 */
function _cf_btwTarief_(label) {
  if (label === null || label === undefined) return 0.21;
  var s = String(label).toLowerCase().trim();
  if (s === '' || s === '21%' || s === '21' || s === '21,00%' || s.indexOf('21%') === 0) return 0.21;
  if (s === '9%' || s === '9' || s === '9,00%' || s.indexOf('9%') === 0) return 0.09;
  if (s === '0%' || s === '0' || s.indexOf('0%') === 0) return 0;
  if (s.indexOf('vrij') === 0) return null;
  if (s.indexOf('verleg') === 0) return null;
  // Probeer als percentage te parsen ("15%" → 0.15)
  var m = s.match(/^(\d+(?:[.,]\d+)?)\s*%?$/);
  if (m) {
    var val = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(val)) return val / 100;
  }
  return 0.21;
}

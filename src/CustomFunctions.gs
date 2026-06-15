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
 * Geeft de belastingtarieven voor een specifiek jaar terug uit
 * BELASTING_PER_JAAR (Belastingadvies.gs). Werkt zonder services
 * (geen UrlFetch/PropertiesService) — veilig in custom-function context.
 *
 * Bij ontbrekend jaar valt terug op het laatst gedefinieerde jaar (in
 * BELASTING_PER_JAAR) zodat de berekening niet stilletjes 0 retourneert.
 */
function _cf_tarievenVoorJaar_(jaar) {
  var beschikbaar = (typeof BELASTING_PER_JAAR === 'object' && BELASTING_PER_JAAR) ? BELASTING_PER_JAAR : null;
  if (beschikbaar && beschikbaar[jaar]) return beschikbaar[jaar];
  // Fallback: zoek het hoogst beschikbare jaar ≤ huidig kalenderjaar
  if (beschikbaar) {
    var jaren = Object.keys(beschikbaar).map(function(j) { return parseInt(j, 10); }).filter(isFinite).sort();
    for (var i = jaren.length - 1; i >= 0; i--) {
      if (jaren[i] <= jaar) return beschikbaar[jaren[i]];
    }
    if (jaren.length) return beschikbaar[jaren[jaren.length - 1]];
  }
  // Last-resort hardcoded 2026-snapshot (mocht BELASTING_PER_JAAR
  // én getBelasting_() beide ontbreken — alleen in zwaar-degraded modus).
  // Audit 2026-06-12: was 2025-snapshot (€2.470, 38441/76817) wat leidde
  // tot verschillende waardes per UI-scherm. Nu strak op 2026, single
  // bron-of-truth blijft Belastingadvies.gs:130 BELASTING_PER_JAAR[2026].
  // Bronnen geverifieerd via belastingdienst.nl 2026-06-12.
  return {
    ZELFSTANDIGENAFTREK: 1200,        // 2026 verlaagd van 2470
    MKB_WINSTVRIJSTELLING: 0.127,     // 12,70%, ongewijzigd
    HEFFINGSKORTING_MAX: 3115,        // 2026 (audit F-TAX-102: was 2025-waarde 3068)
    HEFFINGSKORTING_AFBOUW_VAN: 29739, // 2026 (was 28406)
    HEFFINGSKORTING_AFBOUW_PCT: 0.0640, // 2026 (was 0.0634)
    HEFFINGSKORTING_NUL_VAN: 78426,   // 2026 schijf-2-grens
    ARBEIDSKORTING_MAX: 5685,         // 2026 (was 5599)
    ARBEIDSKORTING_TOP_TOT: 45592,    // 2026 (was 43071)
    ARBEIDSKORTING_AFBOUW_VAN: 45593, // 2026 (ontbrak in fallback)
    ARBEIDSKORTING_AFBOUW_PCT: 0.0651,
    ZVW_PCT: 0.0485,                  // 2026 verlaagd van 5,26%
    ZVW_MAX_INKOMEN: 79409,           // 2026
    IB_SCHIJF_1_MAX: 38883,           // 2026 schijf-1-grens (was 38441 in 2025)
    IB_SCHIJVEN: [
      { tot: 38883,    pct: 0.3575 },  // 2026: 8,10% IB + 27,65% volksverz.
      { tot: 78426,    pct: 0.3756 },  // 2026 (was 76817 in 2025)
      { tot: Infinity, pct: 0.495  },
    ],
  };
}

/**
 * Geschatte inkomstenbelasting (box 1, jonger dan AOW) volgens
 * de IB-schijven voor het huidige kalenderjaar.
 *
 * Bedragen komen uit BELASTING_PER_JAAR (Belastingadvies.gs) — bij
 * Prinsjesdag-update wordt de formule automatisch correct voor het
 * nieuwe jaar zonder dat klanten formules hoeven bij te werken.
 *
 * Optioneel: geef expliciet jaar mee voor scenario-berekeningen.
 *   =SCHULD_SCHIJF(60000)         → tarieven huidig jaar
 *   =SCHULD_SCHIJF(60000; 2026)   → tarieven 2026
 *
 * @param {number} belastbaarInkomen  Belastbaar inkomen na alle aftrekposten.
 * @param {number=} jaar              Optioneel: jaar voor tariefkeuze (default = nu).
 * @return {number} Geschatte IB-aanslag (excl. heffingskortingen).
 * @customfunction
 */
function SCHULD_SCHIJF(belastbaarInkomen, jaar) {
  var n = Number(belastbaarInkomen);
  if (!isFinite(n) || n <= 0) return 0;
  var doelJaar = parseInt(jaar, 10) || new Date().getFullYear();
  var B = _cf_tarievenVoorJaar_(doelJaar);
  var schijven = (B.IB_SCHIJVEN && B.IB_SCHIJVEN.length) ? B.IB_SCHIJVEN : [
    { tot: 38441, pct: 0.3582 }, { tot: 76817, pct: 0.3748 }, { tot: Infinity, pct: 0.495 },
  ];
  var bel = 0;
  var onder = 0;
  for (var i = 0; i < schijven.length; i++) {
    var boven = Math.min(n, schijven[i].tot);
    if (boven <= onder) break;
    bel += (boven - onder) * schijven[i].pct;
    onder = boven;
    if (n <= schijven[i].tot) break;
  }
  return Math.round(bel * 100) / 100;
}

/**
 * Geschat netto jaarinkomen voor een ZZP'er onder AOW-leeftijd voor
 * het huidige kalenderjaar (auto-update via BELASTING_PER_JAAR).
 *
 * Toepasvolgorde:
 *   1. Zelfstandigenaftrek
 *   2. Startersaftrek (optioneel)
 *   3. MKB-winstvrijstelling
 *   4. IB Box 1 schijven
 *   5. Algemene heffingskorting (afgebouwd bij hoog inkomen)
 *   6. Arbeidskorting (afgebouwd bij hoog inkomen)
 *   7. Zvw inkomensafhankelijke bijdrage
 *
 * @param {number}  winst    Winst uit onderneming (vóór aftrek).
 * @param {boolean} starter  Optioneel: true voor startersaftrek.
 * @param {number}  jaar     Optioneel: jaar voor tariefkeuze (default = nu).
 * @return {number} Geschatte netto winst na IB + Zvw.
 * @customfunction
 */
function ZZP_NETTO(winst, starter, jaar) {
  var w = Number(winst);
  if (!isFinite(w) || w <= 0) return 0;
  var doelJaar = parseInt(jaar, 10) || new Date().getFullYear();
  var B = _cf_tarievenVoorJaar_(doelJaar);

  var zelfstAftrek = B.ZELFSTANDIGENAFTREK || 0;
  var startersAftrek = starter ? (B.STARTERSAFTREK || 2123) : 0;
  var naAftrek = Math.max(0, w - zelfstAftrek - startersAftrek);
  var mkbVrijstelling = naAftrek * (B.MKB_WINSTVRIJSTELLING || 0.127);
  var belastbaar = Math.max(0, naAftrek - mkbVrijstelling);
  var ib = SCHULD_SCHIJF(belastbaar, doelJaar);

  // Algemene heffingskorting (afgebouwd boven afbouwVan)
  var ahkMax = B.HEFFINGSKORTING_MAX || 0;
  var ahkAfbouwVan = B.HEFFINGSKORTING_AFBOUW_VAN || 0;
  var ahkAfbouwPct = B.HEFFINGSKORTING_AFBOUW_PCT || 0;
  var ahkNulVan = B.HEFFINGSKORTING_NUL_VAN ||
    Math.round(ahkAfbouwVan + (ahkMax / Math.max(ahkAfbouwPct, 0.0001)));
  var ahk;
  if (belastbaar <= ahkAfbouwVan) ahk = ahkMax;
  else if (belastbaar >= ahkNulVan) ahk = 0;
  else ahk = Math.max(0, ahkMax - (belastbaar - ahkAfbouwVan) * ahkAfbouwPct);

  // Arbeidskorting (afgebouwd boven topTot)
  var akMax = B.ARBEIDSKORTING_MAX || 0;
  var akTopTot = B.ARBEIDSKORTING_TOP_TOT || 45000;
  var akAfbouwPct = B.ARBEIDSKORTING_AFBOUW_PCT || 0.0651;
  var ak;
  if (w <= akTopTot) ak = akMax;
  else ak = Math.max(0, akMax - (w - akTopTot) * akAfbouwPct);

  var nettoIB = Math.max(0, ib - ahk - ak);

  // Zvw inkomensafhankelijke bijdrage
  var zvw = Math.min(w, B.ZVW_MAX_INKOMEN || 75864) * (B.ZVW_PCT || 0.0526);

  return Math.round((w - nettoIB - zvw) * 100) / 100;
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
 * Berekent kilometervergoeding tegen het zakelijke tarief uit BELASTING-config
 * voor het opgegeven (of huidige) jaar.
 *
 * @param {number} kilometers Aantal gereden zakelijke kilometers.
 * @param {number=} jaar      Optioneel: jaar voor tariefkeuze (default = nu).
 * @return {number} Vergoeding in euro.
 * @customfunction
 */
function KM_VERGOEDING(kilometers, jaar) {
  var km = Number(kilometers);
  if (!isFinite(km) || km < 0) return 0;
  var doelJaar = parseInt(jaar, 10) || new Date().getFullYear();
  var B = _cf_tarievenVoorJaar_(doelJaar);
  var tarief = (B && B.REISKOSTEN_PER_KM) || 0.23;
  return Math.round(km * tarief * 100) / 100;
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

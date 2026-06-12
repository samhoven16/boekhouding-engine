/**
 * Belastingadvies.gs
 * Automatische berekening van belastingvoordelen en advies voor ZZP/MKB.
 * Het systeem detecteert zelf welke aftrekposten van toepassing zijn
 * en waarschuwt proactief wanneer actie nodig is.
 *
 * Verwerkte regelingen (2025) — zakelijk:
 *  - Zelfstandigenaftrek            €2.470  (ZZP, ≥1225 uur — stapsgewijs verlaagd)
 *  - Startersaftrek                 €2.123  (eerste 3 jaar ZZP)
 *  - MKB-winstvrijstelling          12,70%  (na aftrekken)
 *  - KOR                            €0 BTW  (omzet < €20.000)
 *  - KIA                            28%     (investeringen €2.801–€353.973)
 *  - FOR                            9,44%   (max €10.786 per jaar)
 *  - MIA/VAMIL                      45,5%   (milieu-investeringen)
 *  - Reiskosten eigen vervoer       €0,23/km
 *  - Thuiswerkvergoeding            €2,40/dag
 *  - Representatiekosten            73,5% aftrekbaar
 *  - Urencriterium                  1.225 uur
 *  - Afschrijvingskandidaten        ≥ €450 (automatisch gesignaleerd)
 *
 * Verwerkte regelingen (2025) — privé:
 *  - Lijfrente                      tot 30% van de premiegrondslag (max €35.987)
 *  - Giftenaftrek (ANBI)            1%–10% van het drempelinkomen
 *  - Box 3 groensparen              €65.072 vrijgesteld + 0,7% heffingskorting
 *  - Eigen woning hypotheekrente    aftrekbaar in box 1
 */

// ─────────────────────────────────────────────
//  BELASTING TARIEVEN EN GRENZEN PER JAAR
//  Bijwerken elk jaar in jan/feb op basis van Prinsjesdag
//  Bronnen: belastingdienst.nl + kvk.nl/geldzaken/belastingtarieven-{jaar}
// ─────────────────────────────────────────────
//
// IB Box 1 jonger dan AOW heeft drie schijven:
//   schijf 1 (laagste tarief, incl. premies)
//   schijf 2 (middeltarief, incl. premies)
//   schijf 3 (hoogste tarief, alleen IB — geen premies meer)
//
// Voor backwards-compat behouden we IB_SCHIJF_1_PCT/IB_SCHIJF_2_PCT als
// snelle besparing-benadering (= schijf 1 voor de meeste ZZP'ers).
// Voor de geschatteIB-berekening gebruiken we nu IB_SCHIJVEN array.

// Tax-tabel-meta: versienummer + bron-URL + bevestigd-datum per jaar.
// Bij jaarlijkse Prinsjesdag-update: bump versie + datum + URL.
// Klanten kunnen hash compute van inputs+meta voor reproduceerbare advies-snapshot.
const BELASTING_META = {
  2025: {
    versie: '2025.1',
    bevestigd: '2025-09-21',
    bron: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_en_belastingtarieven/belastingtarieven/',
    bron_omschrijving: 'Belastingplan 2025 — Prinsjesdag 21 september 2024',
  },
  2026: {
    versie: '2026.1',
    bevestigd: '2026-04-15',
    bron: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_en_belastingtarieven/belastingtarieven/',
    bron_omschrijving: 'Belastingplan 2026 — Prinsjesdag 16 september 2025',
  },
  2027: {
    versie: '2027.0-prelim',
    bevestigd: null,  // nog niet bevestigd; placeholder waarden
    placeholder: true,  // audit ronde 2 (langlopend): triggert TARIEF_VEROUDERD
    bron: 'https://www.belastingdienst.nl/',
    bron_omschrijving: 'Voorlopige inschatting — wacht op Belastingplan 2027 (september 2026)',
  },
};

const BELASTING_PER_JAAR = {
  2025: {
    ZELFSTANDIGENAFTREK:    2470,
    STARTERSAFTREK:         2123,
    STAKINGSAFTREK:         3630,    // Eenmalig per leven bij staken onderneming
    MKB_WINSTVRIJSTELLING:  0.1270,
    FOR_MAX:                10786,    // FOR afgeschaft 2023 — alleen oude saldo's
    THUISWERK_PER_DAG:      2.40,
    LIJFRENTE_MAX:          35987,
    LIJFRENTE_FACTOR_A:     6.27,    // Wet IB art. 3.127 — pensioen-factor 2024-2025
    AOW_FRANCHISE:          14110,
    AOW_LEEFTIJD:           67,      // 2025/2026/2027 = 67 jaar
    BOX3_GROEN_VRIJSTELLING: 65072,
    BOX3_HEFFINGSVRIJ:      57684,
    BOX3_FORFAIT_BELEGGING: 0.0588,
    BOX3_FORFAIT_SPAAR:     0.0144,
    BOX3_TARIEF:            0.36,
    // Legacy — gebruikt voor snelle besparing-schatting + backwards compat.
    IB_SCHIJF_1_MAX:        76817,    // = bovengrens schijf 2 (legacy naam)
    IB_SCHIJF_1_PCT:        0.3582,   // = schijf 1 tarief
    IB_SCHIJF_2_PCT:        0.495,    // = schijf 3 tarief (legacy naam)
    HEFFINGSKORTING_MAX:    3068,     // 2025 algemene heffingskorting max
    HEFFINGSKORTING_AFBOUW_VAN: 28406,
    HEFFINGSKORTING_AFBOUW_PCT: 0.0634,
    HEFFINGSKORTING_NUL_VAN:    76817,
    ARBEIDSKORTING_MAX:     5599,
    ARBEIDSKORTING_TOP_TOT: 43071,    // 2025 inkomen waar max bereikt
    ARBEIDSKORTING_AFBOUW_VAN: 43071,
    ARBEIDSKORTING_AFBOUW_PCT: 0.0651,
    // Zvw inkomensafhankelijke bijdrage ZZP
    ZVW_PCT:                0.0526,
    ZVW_MAX_INKOMEN:        75864,
    // WBSO 2025
    WBSO_AFTREK:            15738,
    WBSO_STARTERSBONUS:     7996,
    // EIA 2025
    EIA_PCT:                0.40,
    EIA_MIN:                2500,
    // Logies-BTW 2025: 9% (laag tarief)
    LOGIES_BTW_PCT:         0.09,
    // Nieuw — expliciete 3-schijven structuur voor accurate IB-berekening
    IB_SCHIJVEN: [
      { tot: 38441,    pct: 0.3582 },  // schijf 1: 8,17% IB + 27,65% premies = 35,82%
      { tot: 76817,    pct: 0.3748 },  // schijf 2: 37,48%
      { tot: Infinity, pct: 0.495  },  // schijf 3: 49,5%
    ],
    // Voor AOW-gerechtigden (geen AOW-premie meer in schijf 1)
    IB_SCHIJVEN_AOW: [
      { tot: 38441,    pct: 0.1782 },  // schijf 1 zonder AOW-premie ≈ 17,82%
      { tot: 76817,    pct: 0.3748 },
      { tot: Infinity, pct: 0.495  },
    ],
    // Box 2 — aanmerkelijk belang (BV-dividend). Bron: belastingdienst.nl/.../box-2
    // 2024: 24,5% / 33% (verhoogd in Belastingplan 2024)
    // 2025+: 24,5% tot grens, 31% daarboven (verlaagd in Belastingplan 2025)
    BOX2_SCHIJF_1_PCT: 0.245,
    BOX2_SCHIJF_1_MAX: 67000,
    BOX2_SCHIJF_2_PCT: 0.31,
    // DGA-gebruikelijk-loon — Wet IB art. 12a. Bron: belastingdienst.nl.
    // 2025: €56.000. Wijzigt vrijwel jaarlijks per Belastingplan.
    DGA_MIN_SALARIS: 56000,
  },
  2026: {
    ZELFSTANDIGENAFTREK:    1200,    // Verlaagd per 2026 (was €2.470 in 2025)
    STARTERSAFTREK:         2123,    // Ongewijzigd
    STAKINGSAFTREK:         3630,
    MKB_WINSTVRIJSTELLING:  0.1270,  // Ongewijzigd t.o.v. 2025
    FOR_MAX:                10786,   // Geen nieuwe FOR-vorming sinds 2023
    THUISWERK_PER_DAG:      2.40,
    LIJFRENTE_MAX:          38000,
    LIJFRENTE_FACTOR_A:     6.27,    // bevestigen na Belastingplan 2026
    AOW_FRANCHISE:          14540,
    AOW_LEEFTIJD:           67,
    BOX3_GROEN_VRIJSTELLING: 67000,
    BOX3_HEFFINGSVRIJ:      59500,    // Indicatief; bevestigen na Prinsjesdag
    BOX3_FORFAIT_BELEGGING: 0.0778,   // Voorstel kabinet (was 5,88% in 2025)
    BOX3_FORFAIT_SPAAR:     0.0144,
    BOX3_TARIEF:            0.36,
    IB_SCHIJF_1_MAX:        79137,   // bovengrens schijf 2
    IB_SCHIJF_1_PCT:        0.357,   // schijf 1: 35,7%
    IB_SCHIJF_2_PCT:        0.495,   // schijf 3: 49,5% (legacy naam)
    HEFFINGSKORTING_MAX:    3115,    // 2026: max algemene heffingskorting
    HEFFINGSKORTING_AFBOUW_VAN: 29739,
    HEFFINGSKORTING_AFBOUW_PCT: 0.0640,
    HEFFINGSKORTING_NUL_VAN:    78426,
    ARBEIDSKORTING_MAX:     5685,    // 2026: tot inkomen €45.592
    ARBEIDSKORTING_TOP_TOT: 45592,
    // Off-by-one: afbouw start €1 boven topgrens (€45.593 i.p.v. €45.592)
    // anders krijgt inkomen €45.592 = max → €45.593 = direct in afbouwzone
    ARBEIDSKORTING_AFBOUW_VAN: 45593,
    ARBEIDSKORTING_AFBOUW_PCT: 0.0651,
    ZVW_PCT:                0.0485,
    ZVW_MAX_INKOMEN:        79409,
    WBSO_AFTREK:            15979,
    WBSO_STARTERSBONUS:     7996,
    EIA_PCT:                0.40,
    EIA_MIN:                2500,
    // Logies-BTW 2026: VERHOOGD naar 21% per 1-1-2026 (was 9% in 2025)
    LOGIES_BTW_PCT:         0.21,
    IB_SCHIJVEN: [
      { tot: 38883,    pct: 0.357  },  // schijf 1
      { tot: 79137,    pct: 0.3756 },  // schijf 2
      { tot: Infinity, pct: 0.495  },  // schijf 3
    ],
    IB_SCHIJVEN_AOW: [
      { tot: 38883,    pct: 0.1770 },  // schijf 1 voor AOW-gerechtigden
      { tot: 79137,    pct: 0.3756 },
      { tot: Infinity, pct: 0.495  },
    ],
    // Box 2 — aanmerkelijk belang (BV-dividend). 2025+: 24,5% / 31%.
    BOX2_SCHIJF_1_PCT: 0.245,
    BOX2_SCHIJF_1_MAX: 67000,
    BOX2_SCHIJF_2_PCT: 0.31,
    DGA_MIN_SALARIS: 56000,   // 2026 — bevestigen na Belastingplan 2026
  },
  // 2027: placeholder — vervang met officiële Miljoenennota-cijfers Prinsjesdag 2026.
  // Bij ontbreken valt getBelasting_() terug op 2026-tarieven met waarschuwing.
  2027: {
    ZELFSTANDIGENAFTREK:    900,     // INDICATIEF — afbouw zet door
    STARTERSAFTREK:         2123,
    STAKINGSAFTREK:         3630,
    MKB_WINSTVRIJSTELLING:  0.1270,
    FOR_MAX:                10786,
    THUISWERK_PER_DAG:      2.40,
    LIJFRENTE_MAX:          39000,
    LIJFRENTE_FACTOR_A:     6.27,    // preliminair
    AOW_FRANCHISE:          14800,
    AOW_LEEFTIJD:           67,     // 2027 ongewijzigd 67; 2028 → 67j 3m
    BOX3_GROEN_VRIJSTELLING: 68000,
    BOX3_HEFFINGSVRIJ:      60500,
    BOX3_FORFAIT_BELEGGING: 0.0780,
    BOX3_FORFAIT_SPAAR:     0.0150,
    BOX3_TARIEF:            0.36,
    IB_SCHIJF_1_MAX:        80500,
    IB_SCHIJF_1_PCT:        0.357,
    IB_SCHIJF_2_PCT:        0.495,
    HEFFINGSKORTING_MAX:    3150,
    HEFFINGSKORTING_AFBOUW_VAN: 30200,
    HEFFINGSKORTING_AFBOUW_PCT: 0.0640,
    HEFFINGSKORTING_NUL_VAN:    79500,
    ARBEIDSKORTING_MAX:     5750,
    ARBEIDSKORTING_TOP_TOT: 46500,
    ARBEIDSKORTING_AFBOUW_VAN: 46500,
    ARBEIDSKORTING_AFBOUW_PCT: 0.0651,
    ZVW_PCT:                0.0490,
    ZVW_MAX_INKOMEN:        81000,
    WBSO_AFTREK:            16200,
    WBSO_STARTERSBONUS:     8100,
    EIA_PCT:                0.40,
    EIA_MIN:                2500,
    LOGIES_BTW_PCT:         0.21,
    IB_SCHIJVEN: [
      { tot: 39500,    pct: 0.357  },
      { tot: 80500,    pct: 0.3756 },
      { tot: Infinity, pct: 0.495  },
    ],
    IB_SCHIJVEN_AOW: [
      { tot: 39500,    pct: 0.1770 },
      { tot: 80500,    pct: 0.3756 },
      { tot: Infinity, pct: 0.495  },
    ],
    // Box 2 — preliminair (2027 wacht op Belastingplan 2027).
    BOX2_SCHIJF_1_PCT: 0.245,
    BOX2_SCHIJF_1_MAX: 67000,
    BOX2_SCHIJF_2_PCT: 0.31,
    DGA_MIN_SALARIS: 56000,   // 2027 — preliminair, wacht Belastingplan 2027
  },
};

function getBelasting_() {
  const jaar = new Date().getFullYear();
  // Server-side override — bij wetswijziging update centrale config zonder dat
  // klanten een nieuwe sheet hoeven te kopiëren. Fallback naar lokale tabel.
  let serverTarieven = null;
  try {
    if (typeof haalConfigOp_ === 'function') {
      const cfg = haalConfigOp_();
      if (cfg && cfg.belastingTarieven && cfg.belastingTarieven[jaar]) {
        serverTarieven = cfg.belastingTarieven[jaar];
      }
    }
  } catch (_) { /* fail-open naar lokale tarieven */ }

  // Audit-vondst ronde 2 (langlopend-onderhoud): fallback naar
  // BELASTING_PER_JAAR[2026] gaf vanaf 2027 stille verkeerde tarieven als
  // Sam stopt met onderhouden. Nu: pak laatst-bekende jaar als hoogste
  // beschikbare key, niet hardcoded 2026. Daarnaast: returneer expliciet
  // metadata.tariefVerouderd zodat callers kunnen waarschuwen.
  const beschikbareJaren = Object.keys(BELASTING_PER_JAAR)
    .map(function(j) { return parseInt(j, 10); })
    .filter(function(j) { return isFinite(j); })
    .sort(function(a, b) { return b - a; });  // descending
  const laatstBekendJaar = beschikbareJaren[0] || 2026;
  const tarieven = serverTarieven
    || BELASTING_PER_JAAR[jaar]
    || BELASTING_PER_JAAR[laatstBekendJaar];
  // Hebben we échte tarieven voor het lopende jaar (server-override of lokale
  // tabel)? Zo niet, dan vielen we terug op de laatst-bekende-jaar-snapshot.
  // Belangrijk: serverTarieven is een ANDER object dan BELASTING_PER_JAAR[jaar],
  // dus we mogen TARIEFSJAAR niet via object-identiteit bepalen — anders
  // rapporteert de (aanbevolen) server-update-route ten onrechte verouderd-flag.
  const heeftJaarTarieven = !!(serverTarieven || BELASTING_PER_JAAR[jaar]);
  // Audit ronde 2 (langlopend): placeholder-jaartabellen (bv. 2027 vóór
  // Belastingplan 2027 op Prinsjesdag) hebben placeholder:true gemarkeerd
  // en horen óók TARIEF_VEROUDERD-flag te triggeren. Was: alleen bij
  // ontbrekend jaar → stil-verkeerd risico voor heel 2027 als Sam stopt.
  const isPlaceholderJaar = !!(BELASTING_PER_JAAR[jaar] && BELASTING_PER_JAAR[jaar].placeholder);
  // Markeer dat klant een fallback OF placeholder ziet — UI moet expliciet waarschuwen.
  if ((!heeftJaarTarieven || isPlaceholderJaar) && tarieven && typeof tarieven === 'object') {
    tarieven.TARIEF_VEROUDERD = true;
    tarieven.TARIEF_FALLBACK_JAAR = isPlaceholderJaar ? jaar : laatstBekendJaar;
    tarieven.TARIEF_BRON = isPlaceholderJaar
      ? 'placeholder (' + jaar + ' — wacht op Belastingplan)'
      : 'fallback (' + laatstBekendJaar + ')';
  }

  // KLANT-OVERRIDES uit Instellingen-tab. Drie-laags-merge:
  //   1. Hardcoded defaults (KOR_GRENS, KIA_MIN, etc.)
  //   2. Jaarcohort uit BELASTING_PER_JAAR / serverTarieven
  //   3. Klant-override uit Instellingen-tab (last wins)
  // Reden: bij Prinsjesdag-wijziging kan klant zelf bijwerken zonder
  // dat owner een script-deploy hoeft te doen.
  // Caching: leest Instellingen-tab; getBelasting_ wordt geroepen per
  // berekening dus we cachen het resultaat per session (zelfde patroon
  // als _instellingenCache).
  let klantOverrides = null;
  try { klantOverrides = (typeof _leesBelastingOverrides_ === 'function') ? _leesBelastingOverrides_() : null; }
  catch (e) { Logger.log('Belasting-overrides lezen mislukt: ' + e.message); }

  return Object.assign({
    KOR_GRENS:              20000,
    // KIA — investerings-aftrek-tabel 2026. Definitieve staffel,
    // geverifieerd op belastingdienst.nl (2026-06-10):
    //   t/m €2.900: 0% · €2.901–€71.683: 28% · €71.684–€132.746: vast €20.072
    //   €132.747–€398.236: €20.072 − 7,56% × deel boven €132.747 · >€398.236: 0%
    KIA_MIN:                2901,
    KIA_MAX:                398236,
    KIA_PCT:                0.28,
    KIA_VAST_VAN:           71683,
    KIA_VAST_BEDRAG:        20072,
    KIA_AFBOUW_START:       132747,
    KIA_AFBOUW_PCT:         0.0756,
    FOR_PCT:                0.0944,
    MIA_PCT:                0.455,
    MIA_MIN:                2500,
    URENCRITERIUM:          1225,
    ACTIVEER_GRENS:         450,
    REISKOSTEN_PER_KM:      0.23,
    REPRESENTATIE_AFTREK:   0.735,
    LIJFRENTE_PCT:          0.30,
    GIFTEN_DREMPEL_PCT:     0.01,
    GIFTEN_MAX_PCT:         0.10,
    BOX3_GROEN_KORTING_PCT: 0.007,
    TARIEFSJAAR:            heeftJaarTarieven ? jaar : 2026,
  }, tarieven, klantOverrides || {});
}

// ─────────────────────────────────────────────
//  KLANT-OVERRIDES VIA INSTELLINGEN-TAB
// ─────────────────────────────────────────────
//
// Klant kan in het Instellingen-tabblad zelf tarieven aanpassen voor
// het geval Belastingdienst iets wijzigt na Prinsjesdag en owner nog
// niet een nieuwe versie heeft uitgerold.
//
// VEILIGHEID — defensieve parsing (Principal Engineer-pattern):
//  • Lege cel              → null (= geen override, fallback default)
//  • Niet-numerieke input  → null + audit-log (= geen override)
//  • Out-of-range          → null + audit-log
//  • Percentage in heel %  → auto-omzetting (21 → 0.21)
//  • Comma als decimal     → naar punt
//  • % teken               → verwijderd
//  • € teken               → verwijderd
//
// Geen exceptions naar caller: bij FOUTE input wordt de override
// stilletjes overgeslagen + gelogd. Dit voorkomt dat een typo in
// Instellingen alle berekeningen crasht.

/**
 * Declaratieve definitie van overschrijfbare tarieven. Elke entry:
 *   sleutel:  exacte naam in BELASTING-object (= wat berekeningen lezen)
 *   label:    rij-label in Instellingen-tab (klant-gezichte tekst)
 *   type:     'percentage' | 'bedrag' | 'getal'
 *   min/max:  validatie-bereik. Buiten bereik → reject + log.
 *   hint:     uitleg in tooltip (cell-note)
 *
 * Alleen de meest-veranderlijke tarieven staan hier. BTW-tarieven
 * (21%/9%) bewust niet — die zijn stabiel (>10 jaar) en de klant kan
 * BTW per factuur kiezen via dropdown.
 */
const BELASTING_OVERRIDE_VELDEN = [
  { sleutel: 'REISKOSTEN_PER_KM',    label: 'Tarief: Reiskosten per km (€)',     type: 'bedrag',     min: 0.01, max: 1.00,
    hint: 'Zakelijke kilometers met privéauto. Bron: Belastingdienst. 2024-2025: €0,23. Bij verhoging zelf bijwerken.' },
  { sleutel: 'THUISWERK_PER_DAG',    label: 'Tarief: Thuiswerk per dag (€)',     type: 'bedrag',     min: 0.01, max: 10.00,
    hint: 'Onbelaste thuiswerkvergoeding per dag. 2024-2025: €2,40.' },
  { sleutel: 'ZELFSTANDIGENAFTREK',  label: 'Tarief: Zelfstandigenaftrek (€)',   type: 'bedrag',     min: 0,    max: 10000,
    hint: 'Jaarbedrag aftrek voor ZZP met ≥1.225 uur. Stapsgewijs verlaagd: 2025=€2.470, 2026=€1.200.' },
  { sleutel: 'STARTERSAFTREK',       label: 'Tarief: Startersaftrek (€)',        type: 'bedrag',     min: 0,    max: 10000,
    hint: 'Extra aftrek eerste 3 jaar als ondernemer. 2025-2026: €2.123.' },
  { sleutel: 'STAKINGSAFTREK',       label: 'Tarief: Stakingsaftrek (€)',        type: 'bedrag',     min: 0,    max: 20000,
    hint: 'Eenmalig bij bedrijfsbeëindiging. 2025-2026: €3.630.' },
  { sleutel: 'MKB_WINSTVRIJSTELLING', label: 'Tarief: MKB-winstvrijstelling (%)', type: 'percentage', min: 0,    max: 0.30,
    hint: 'Percentage winstvrijstelling. 2025-2026: 12,70% = 0,1270.' },
  { sleutel: 'KIA_PCT',              label: 'Tarief: KIA percentage (%)',        type: 'percentage', min: 0,    max: 0.50,
    hint: 'Investeringsaftrek voor KIA-zone 1. 2025-2026: 28% = 0,28.' },
  { sleutel: 'KIA_MIN',              label: 'Grens: KIA minimum (€)',            type: 'bedrag',     min: 0,    max: 10000,
    hint: 'Drempel waaronder geen KIA. 2025-2026: €2.901.' },
  { sleutel: 'BOX3_HEFFINGSVRIJ',    label: 'Grens: Box 3 heffingsvrij (€)',     type: 'bedrag',     min: 0,    max: 200000,
    hint: 'Vrijstelling Box 3 vermogen. 2025: €57.684. Wijzigt vrijwel jaarlijks.' },
  { sleutel: 'BOX3_TARIEF',          label: 'Tarief: Box 3 belastingtarief (%)', type: 'percentage', min: 0,    max: 0.60,
    hint: 'Box 3 tarief over fictief rendement. 2024-2026: 36%.' },
  { sleutel: 'BOX3_FORFAIT_BELEGGING', label: 'Tarief: Box 3 forfait beleggingen (%)', type: 'percentage', min: 0, max: 0.20,
    hint: 'Fictief rendement beleggingen. 2025: 5,88%. 2026: 7,78% (voorstel).' },
  { sleutel: 'URENCRITERIUM',        label: 'Grens: Urencriterium (uur/jr)',     type: 'getal',      min: 100,  max: 5000,
    hint: 'Minimum uren voor zelfstandigenaftrek. Stabiel: 1.225 uur.' },
  { sleutel: 'ZVW_PCT',              label: 'Tarief: Zvw inkomensafh. bijdrage (%)', type: 'percentage', min: 0, max: 0.15,
    hint: 'Bijdrage Zorgverzekeringswet. 2025: 5,26% = 0,0526.' },
  { sleutel: 'ZVW_MAX_INKOMEN',      label: 'Grens: Zvw max inkomen (€)',        type: 'bedrag',     min: 0,    max: 200000,
    hint: 'Maximum-inkomen waarover Zvw-premie wordt berekend. 2025: €75.864.' },
  { sleutel: 'DGA_MIN_SALARIS',      label: 'Grens: DGA gebruikelijk-loon (€)',  type: 'bedrag',     min: 0,    max: 500000,
    hint: 'Minimum-salaris DGA volgens art. 12a Wet IB. 2025-2026: €56.000. Wijzigt jaarlijks.' },
];

/**
 * Strict overrides-cache. Module-scope via getter zodat we niet bij elke
 * getBelasting_-call de sheet hoeven te lezen (~50ms scheelt).
 * Cache is per-execution (GAS resets module state tussen invocations).
 */
let _belastingOverridesCache = null;
function _wisBelastingOverridesCache_() { _belastingOverridesCache = null; }

/**
 * Parse één raw cell-waarde naar typed override-waarde.
 * Defensieve parsing: bij elke twijfel returns null (= geen override).
 *
 * @param {*} raw - cel-waarde uit Instellingen-tab
 * @param {Object} veldDef - element uit BELASTING_OVERRIDE_VELDEN
 * @returns {number|null} - geparsede waarde, of null als ongeldig/leeg
 */
function _parseOverrideWaarde_(raw, veldDef) {
  // Leeg = geen override (fallback naar default)
  if (raw === null || raw === undefined || raw === '') return null;

  // Als sheet teruggeeft als Date (Google Sheets parst soms numerics als datum)
  // → reject, klant moet "0.21" niet "1-1-1900" typen
  if (raw instanceof Date) return null;

  // Detecteer of klant expliciet "%" heeft getypt — bepaalt of we /100 doen.
  // Voor number-typed input (uit cel) is er geen %-marker; daar volgen we
  // strikte interpretatie (0.21 = 21%, bare 21 = ambigu = reject).
  const isStringInput = typeof raw === 'string';
  const hadPercentTeken = isStringInput && /%/.test(raw);

  let waarde;
  if (typeof raw === 'number') {
    if (!isFinite(raw)) return null;
    waarde = raw;
  } else {
    // String parsing — strip €, %, comma-als-decimal
    const schoon = String(raw).trim()
      .replace(/€/g, '')
      .replace(/%/g, '')
      .replace(/\s+/g, '')
      .replace(',', '.');
    if (!schoon) return null;
    waarde = parseFloat(schoon);
    if (!isFinite(waarde)) return null;
  }

  // Percentage-velden: strikte interpretatie om silent-misinterpret te voorkomen.
  //   "21%"   → 0.21   (% expliciet → altijd /100)
  //   "0,21"  → 0.21   (al decimaal, in range)
  //   "21"    → REJECT (ambigu: bedoelde klant 21% of 2100%? — log + null)
  //   21 (num)→ REJECT (idem, geen %-context uit cel)
  //   "0,5%"  → 0.005  (% expliciet, dus /100)
  if (veldDef.type === 'percentage' && veldDef.max <= 1) {
    if (hadPercentTeken) {
      waarde = waarde / 100;
    } else if (waarde > 1) {
      try {
        schrijfAuditLog_('Belasting-override REJECT-ambigu',
          veldDef.sleutel + '=' + raw + ' (gebruik "0,21" of "21%" — niet bare "21")');
      } catch (_) {}
      return null;
    }
  }

  // Range-validatie. Out-of-range = log + null (vat de fout op, val terug op default).
  if (typeof veldDef.min === 'number' && waarde < veldDef.min) {
    safeAuditLog_('Belasting-override REJECT', veldDef.sleutel + '=' + raw + ' (< min=' + veldDef.min + ')');
    return null;
  }
  if (typeof veldDef.max === 'number' && waarde > veldDef.max) {
    safeAuditLog_('Belasting-override REJECT', veldDef.sleutel + '=' + raw + ' (> max=' + veldDef.max + ')');
    return null;
  }

  return waarde;
}

/**
 * Leest alle belastingtarief-overrides uit het Instellingen-tabblad.
 * Returns object {sleutel: waarde} met alleen geldig-geparsete overrides.
 *
 * Defensief:
 *  - Geen Instellingen-tab        → {}
 *  - Cel ontbreekt                → skip dat veld
 *  - Ongeldige waarde             → skip dat veld + audit-log
 *  - Cache valid voor één session — invalidate na _wisInstellingenCache_/edit
 */
function _leesBelastingOverrides_() {
  if (_belastingOverridesCache) return _belastingOverridesCache;
  const result = {};
  try {
    BELASTING_OVERRIDE_VELDEN.forEach(function(veld) {
      const raw = (typeof getInstelling_ === 'function') ? getInstelling_(veld.label) : null;
      const parsed = _parseOverrideWaarde_(raw, veld);
      if (parsed !== null) result[veld.sleutel] = parsed;
    });
  } catch (e) {
    Logger.log('_leesBelastingOverrides_ fout: ' + e.message);
    return {};
  }
  _belastingOverridesCache = result;
  return result;
}

/**
 * Voegt de override-sectie toe aan het Instellingen-tabblad als die er
 * nog niet is. Idempotent: detecteert bestaande sectie via marker-label.
 *
 * Voor gebruik bij setup() of als migratie.
 */
function voegBelastingOverridesToeAanInstellingen_() {
  const ss = (typeof getSpreadsheet_ === 'function') ? getSpreadsheet_() : null;
  if (!ss) return;
  const sheet = ss.getSheetByName(SHEETS.INSTELLINGEN);
  if (!sheet) return;

  // Idempotency-check: bestaat de header-rij al?
  const MARKER = 'BELASTING-TARIEVEN (aanpasbaar bij Prinsjesdag-update)';
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).indexOf(MARKER) === 0) return;
  }

  const startRij = sheet.getLastRow() + 2;

  // Header-rij
  sheet.getRange(startRij, 1, 1, 2).merge()
    .setValue(MARKER + ' — laat leeg = automatische waarde')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11);

  // Velden zelf — label in kolom 1, waarde leeg in kolom 2, hint als cell-note
  BELASTING_OVERRIDE_VELDEN.forEach(function(veld, i) {
    const rij = startRij + 1 + i;
    sheet.getRange(rij, 1).setValue(veld.label).setFontWeight('bold');
    // Lege waarde-cel; klant vult zelf in als ze willen overschrijven
    const waardeCel = sheet.getRange(rij, 2);
    waardeCel.setValue('');
    if (veld.hint) waardeCel.setNote(veld.hint);
    // Conditional formatting: gele highlight als waarde gevuld is (signaleert klant)
    // Houden we voor later — eerst basic functionaliteit.
  });

  safeAuditLog_('Belasting-overrides sectie toegevoegd', BELASTING_OVERRIDE_VELDEN.length + ' velden');
}

// ─────────────────────────────────────────────
//  HELPERS — KIA + IB + ZVW + HEFFINGSKORTING
// ─────────────────────────────────────────────

/**
 * KIA-aftrek volgens 4-zone tabel (zie BELASTING constants).
 * Returns 0 buiten geldige zone.
 *
 * @param {number} investering Som van investeringen in jaar (excl. BTW).
 * @param {Object} B           BELASTING-config (uit getBelasting_()).
 * @return {number} KIA-aftrek-bedrag, afgerond op 2 decimalen.
 */
function berekenKiaAftrek_(investering, B) {
  const inv = parseFloat(investering) || 0;
  if (inv < B.KIA_MIN || inv > B.KIA_MAX) return 0;
  if (inv <= B.KIA_VAST_VAN)         return rondBedrag_(inv * B.KIA_PCT);
  if (inv <= B.KIA_AFBOUW_START)     return rondBedrag_(B.KIA_VAST_BEDRAG);
  // Afbouwzone: vast bedrag − afbouwpct × overschrijding
  const overschrijding = inv - B.KIA_AFBOUW_START;
  const aftrek = B.KIA_VAST_BEDRAG - B.KIA_AFBOUW_PCT * overschrijding;
  return rondBedrag_(Math.max(0, aftrek));
}

/**
 * Progressieve IB-berekening volgens schijven-array.
 * Werkt voor zowel 2- als 3-schijven configs (vooruit-compatibel).
 *
 * @param {number}  belastbaarInkomen Belastbaar inkomen Box 1 (na aftrekken).
 * @param {Object}  B                 BELASTING-config met IB_SCHIJVEN array.
 * @param {boolean} [isAowGerechtigd] True → gebruik IB_SCHIJVEN_AOW (lager schijf 1).
 * @return {number} Geschatte IB voor heffingskortingen.
 */
function berekenIBProgressief_(belastbaarInkomen, B, isAowGerechtigd) {
  const inkomen = parseFloat(belastbaarInkomen) || 0;
  if (inkomen <= 0) return 0;
  // AOW-gerechtigde gebruikt aparte schijven-tabel (geen AOW-premie meer)
  const schijven = (isAowGerechtigd && Array.isArray(B.IB_SCHIJVEN_AOW))
    ? B.IB_SCHIJVEN_AOW
    : B.IB_SCHIJVEN;
  // Fallback voor configs zonder IB_SCHIJVEN array (legacy 2-schijven model)
  if (!Array.isArray(schijven)) {
    if (inkomen <= B.IB_SCHIJF_1_MAX) return inkomen * B.IB_SCHIJF_1_PCT;
    return B.IB_SCHIJF_1_MAX * B.IB_SCHIJF_1_PCT
         + (inkomen - B.IB_SCHIJF_1_MAX) * B.IB_SCHIJF_2_PCT;
  }
  let belasting = 0;
  let onder = 0;
  for (const schijf of schijven) {
    const boven = Math.min(inkomen, schijf.tot);
    if (boven <= onder) break;
    belasting += (boven - onder) * schijf.pct;
    onder = boven;
    if (inkomen <= schijf.tot) break;
  }
  return belasting;
}

/**
 * Marginaal IB-tarief op het inkomen — het tarief dat geldt voor de
 * "laatste euro". Cruciaal voor besparing-berekeningen bij aftrekposten:
 * elke euro aftrek bespaart het marginale tarief, niet schijf 1.
 *
 * Voorheen werd IB_SCHIJF_1_PCT (35,7%) gebruikt voor alle besparing-
 * berekeningen. Resultaat: middeninkomen (€38k-€79k) zag besparing -2,86 pp
 * te laag (echte tarief 37,56%); hoog-inkomen (>€79k) zag -14 pp te laag
 * (echte tarief 49,5%). Klant zag dus ondergewaardeerde besparing → product
 * leek minder voordelig dan het is.
 *
 * @param {number} inkomen          Belastbaar inkomen Box 1
 * @param {Object} B                BELASTING-config met IB_SCHIJVEN array
 * @param {boolean} [isAowGerechtigd]
 * @return {number} Marginale tarief (0.357, 0.3756, 0.495 voor 2026)
 */
function marginaalIbTarief_(inkomen, B, isAowGerechtigd) {
  const i = parseFloat(inkomen) || 0;
  const schijven = (isAowGerechtigd && Array.isArray(B.IB_SCHIJVEN_AOW))
    ? B.IB_SCHIJVEN_AOW
    : B.IB_SCHIJVEN;
  if (!Array.isArray(schijven)) {
    // Legacy fallback
    return i <= (B.IB_SCHIJF_1_MAX || 38883) ? (B.IB_SCHIJF_1_PCT || 0.357) : (B.IB_SCHIJF_2_PCT || 0.495);
  }
  for (const schijf of schijven) {
    if (i <= schijf.tot) return schijf.pct;
  }
  // Boven hoogste schijf-grens → hoogste tarief
  return schijven[schijven.length - 1].pct;
}

/**
 * Zvw inkomensafhankelijke bijdrage voor ZZP-ondernemer.
 * Wordt geheven over winst tot maximum bijdrage-inkomen.
 * Voorbeeld 2025: 5,26% × min(winst, €75.864) = max €3.991.
 *
 * @param {number} winst Winst uit onderneming (na aftrekken niet nodig — Zvw
 *                       gebruikt eigen grondslag).
 * @param {Object} B     BELASTING-config (uit getBelasting_()).
 * @return {number} Geschatte Zvw-bijdrage (afgerond op 2 decimalen).
 */
function berekenZvw_(winst, B) {
  const w = parseFloat(winst) || 0;
  if (w <= 0) return 0;
  const grondslag = Math.min(w, B.ZVW_MAX_INKOMEN || 75864);
  return rondBedrag_(grondslag * (B.ZVW_PCT || 0.0526));
}

/**
 * Algemene heffingskorting met inkomensafhankelijke afbouw.
 * 2026: max €3.115 tot inkomen €29.739; daarboven afbouw 6,40%; €0 vanaf €78.426.
 *
 * @param {number} belastbaarInkomen Belastbaar inkomen Box 1.
 * @param {Object} B                 BELASTING-config.
 * @return {number} Toepasbare heffingskorting (afgerond).
 */
function berekenHeffingskorting_(belastbaarInkomen, B) {
  const inkomen = parseFloat(belastbaarInkomen) || 0;
  const max = B.HEFFINGSKORTING_MAX || 0;
  if (inkomen <= 0 || max === 0) return 0;
  const afbouwVan = B.HEFFINGSKORTING_AFBOUW_VAN || 0;
  const afbouwPct = B.HEFFINGSKORTING_AFBOUW_PCT || 0;
  // Fallback: bereken nul-van uit max + afbouw-pct als config 't niet expliciet definieert.
  // Wiskundig: max € korting bij afbouwVan, lineair afgebouwd → 0 bij afbouwVan + max/pct.
  const nulVan = B.HEFFINGSKORTING_NUL_VAN ||
    Math.round(afbouwVan + (max / Math.max(afbouwPct, 0.0001)));
  if (inkomen <= afbouwVan) return rondBedrag_(max);
  if (inkomen >= nulVan) return 0;
  const verlaging = (inkomen - afbouwVan) * afbouwPct;
  return rondBedrag_(Math.max(0, max - verlaging));
}

/**
 * Arbeidskorting (vereenvoudigd model: opbouw + afbouw bij hoog inkomen).
 * Voor ondernemers wordt arbeidsinkomen meestal gelijk gesteld aan winst.
 *
 * @param {number} arbeidsinkomen Winst uit onderneming (proxy voor arbeidsinkomen).
 * @param {Object} B              BELASTING-config.
 * @return {number} Toepasbare arbeidskorting.
 */
function berekenArbeidskorting_(arbeidsinkomen, B) {
  const inkomen = parseFloat(arbeidsinkomen) || 0;
  const max = B.ARBEIDSKORTING_MAX || 0;
  if (inkomen <= 0 || max === 0) return 0;
  const topTot = B.ARBEIDSKORTING_TOP_TOT || 45000;
  const afbouwVan = B.ARBEIDSKORTING_AFBOUW_VAN || topTot;
  const afbouwPct = B.ARBEIDSKORTING_AFBOUW_PCT || 0.0651;
  if (inkomen <= topTot) return rondBedrag_(max);
  const verlaging = (inkomen - afbouwVan) * afbouwPct;
  return rondBedrag_(Math.max(0, max - verlaging));
}

/**
 * Bepaalt of de gebruiker AOW-gerechtigd is op basis van geboortedatum-instelling.
 * Werkt fail-safe: bij ontbrekende of corrupte instelling → false (= jonger dan AOW).
 *
 * @param {Object} B BELASTING-config (voor AOW_LEEFTIJD).
 * @return {boolean}
 */
function isAowGerechtigd_(B) {
  try {
    const raw = getInstelling_('Geboortedatum');
    if (!raw) return false;
    const geb = parseDatum_(raw);
    if (!geb || isNaN(geb.getTime())) return false;
    const aowLeeftijd = (B && B.AOW_LEEFTIJD) || 67;
    const aowDatum = new Date(geb.getFullYear() + aowLeeftijd, geb.getMonth(), geb.getDate());
    return new Date() >= aowDatum;
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────
//  VOLLEDIG BELASTINGADVIES BEREKENEN
// ─────────────────────────────────────────────
function berekenBelastingadvies_(ss) {
  // Cache-wrapper: belastingadvies herberekening duurt 1-2s. Cache 10 min,
  // invalidatie via bustCache_('advies') na schrijfacties op kerntabbladen.
  const jaar = new Date().getFullYear();
  const cacheKey = 'advies_' + jaar + '_v' + cacheVersie_('advies');
  return cacheBerekening_(cacheKey, 600, function() { return _berekenBelastingadviesRaw_(ss); });
}

function _berekenBelastingadviesRaw_(ss) {
  const jaar = new Date().getFullYear();
  // Re-evaluate per call zodat server-side tarief-overrides en jaar-rollovers
  // niet pas na een script-reload worden opgepikt. Module-scope BELASTING is
  // bevroren bij script-load; we lezen hier vers.
  const BELASTING = getBelasting_();
  // Defensief: berekenKengetallen_ kan crashen als GROOTBOEKSCHEMA mist of
  // corrupt is. Liever een leeg advies dan een uitvalbeurt — gebruiker
  // ziet dan dat er iets mis is via het audit-log.
  let kg;
  try {
    kg = berekenKengetallen_(ss);
  } catch (e) {
    Logger.log('berekenBelastingadvies_ kon kengetallen niet berekenen: ' + e.message);
    safeAuditLog_('Belastingadvies FOUT', 'Kengetallen niet beschikbaar: ' + e.message);
    return {
      adviezen: [{
        type: 'WAARSCHUWING',
        titel: '⚠️ Belastingadvies kon niet worden berekend',
        tekst: 'Er ging iets mis bij het ophalen van uw boekhoudgegevens. ' +
               'Controleer of het tabblad Grootboekschema bestaat. Foutmelding: ' + e.message,
        besparing: 0,
      }],
      aftrekken: [],
      totaalAftrek: 0,
      geschatteIB: 0,
    };
  }
  const omzet = kg.omzet;
  const winst = kg.nettowinst;
  const rechtsvorm = getInstelling_('Rechtsvorm') || 'Eenmanszaak';
  const isZzp = ['Eenmanszaak', 'ZZP', 'VOF'].includes(rechtsvorm);

  const adviezen = [];
  const aftrekken = [];
  let totaalAftrek = 0;

  // Waarschuw als belastingtarieven voor dit jaar nog niet (definitief)
  // bijgewerkt zijn. Twee scenarios:
  //   A) Geen entry in BELASTING_PER_JAAR voor dit jaar → fallback naar 2026
  //   B) Wel een entry MAAR -prelim suffix in versie / bevestigd === null
  //      (bv. 2027-placeholder bij ontbreken Belastingplan 2027)
  const tariefMeta = BELASTING_META[jaar] || null;
  const tariefIsPreliminair = !!(tariefMeta && (
    !tariefMeta.bevestigd ||
    (tariefMeta.versie && /-prelim/i.test(tariefMeta.versie))
  ));
  if (!BELASTING_PER_JAAR[jaar] || tariefIsPreliminair) {
    const reden = !BELASTING_PER_JAAR[jaar]
      ? `Voor ${jaar} zijn nog geen tarieven gedefinieerd — er wordt teruggevallen op ${BELASTING.TARIEFSJAAR}.`
      : `De tarieven voor ${jaar} zijn nog PRELIMINAIR (${tariefMeta && tariefMeta.bron_omschrijving || 'wacht op Belastingplan'}).`;
    adviezen.push({
      type: 'WAARSCHUWING',
      titel: `⚠️ Belastingtarieven ${jaar} ${tariefIsPreliminair ? 'preliminair' : 'nog niet bijgewerkt'}`,
      tekst: reden +
             ` Schattingen van zelfstandigenaftrek, MKB-vrijstelling en schijfgrenzen zijn voorlopig. ` +
             `Officiële cijfers volgen na Prinsjesdag (3e dinsdag september). ` +
             `Boekhoudbaar wordt dan automatisch bijgewerkt.`,
      besparing: 0,
    });
  }

  // ── 1. KOR regeling ───────────────────────────────────────────────────
  // CYCLE-56: isJa_ helper (consistent met andere paden)
  const korActief = (typeof isJa_ === 'function')
    ? isJa_(getInstelling_('KOR regeling actief'))
    : false;
  if (omzet > 0 && omzet < BELASTING.KOR_GRENS) {
    if (!korActief) {
      adviezen.push({
        type: 'VOORDEEL',
        titel: '💡 KOR regeling mogelijk',
        tekst: `Uw omzet (${formatBedrag_(omzet)}) is onder de €20.000 grens. ` +
               `Met de Kleine Ondernemers Regeling hoeft u geen BTW te berekenen én in te dienen. ` +
               `Dit scheelt administratie en geeft u een prijsvoordeel. Meld u aan via de Belastingdienst.`,
        besparing: null,
      });
    }
  } else if (omzet >= BELASTING.KOR_GRENS) {
    if (korActief) {
      adviezen.push({
        type: 'WAARSCHUWING',
        titel: '⚠️ KOR grens overschreden',
        tekst: `Uw omzet (${formatBedrag_(omzet)}) overschrijdt de KOR grens van €20.000. ` +
               `U moet zich afmelden voor de KOR bij de Belastingdienst en BTW gaan berekenen.`,
        besparing: null,
      });
    }
  } else if (omzet === 0 && korActief) {
    // Edge case: KOR aangevraagd maar nog geen omzet — voorkomt dat nieuwe
    // gebruiker geen feedback krijgt als hij de KOR-checkbox ten onrechte aanvinkt.
    adviezen.push({
      type: 'TIP',
      titel: '💡 KOR is actief maar er is nog geen omzet geboekt',
      tekst: 'U heeft de KOR aangevinkt maar er staan nog geen verkoopfacturen geregistreerd. ' +
             'Controleer of dit klopt: KOR betekent dat u géén BTW factureert. ' +
             'Bij twijfel: raadpleeg een accountant.',
      besparing: null,
    });
  }

  // ── 2. Zelfstandigenaftrek (ZZP/eenmanszaak) ─────────────────────────
  if (isZzp && winst > 0) {
    const aftrek = Math.min(BELASTING.ZELFSTANDIGENAFTREK, winst);
    aftrekken.push({
      naam: 'Zelfstandigenaftrek',
      bedrag: aftrek,
      voorwaarde: '≥ 1.225 uur per jaar aan uw onderneming besteed',
      code: '7990',
    });
    totaalAftrek += aftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ Zelfstandigenaftrek: ' + formatBedrag_(aftrek),
      tekst: `Als ZZP-er met ≥1.225 werkuren mag u €${BELASTING.ZELFSTANDIGENAFTREK.toLocaleString('nl-NL')} aftrekken van uw winst. ` +
             `Houd uw uren bij om dit te onderbouwen (bijv. in een urenregistratie).`,
      besparing: rondBedrag_(aftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  }

  // ── 3. Startersaftrek (eerste 3 jaar) ────────────────────────────────
  if (isZzp && winst > 0) {
    // Strict 4-cijferig jaartal validatie — voorheen accepteerde parseInt
    // strings als "2025xyz" of "2025-2026" (geeft 2025) wat tot foute startersaftrek-claim
    // kan leiden. Nu alleen pure jaartallen tussen 1990 en huidigJaar.
    // Strict 4-cijferig jaartal — extra trim voor zekerheid (instelling kan
    // " 2025 " met spaties bevatten als gebruiker copy-paste gebruikte).
    const startjaarRaw = String(getInstelling_('Startjaar onderneming') || '').trim();
    const startjaar = /^\d{4}$/.test(startjaarRaw) ? parseInt(startjaarRaw, 10) : 0;
    // startjaar > 0:        ingevuld (anders default 0)
    // startjaar <= jaar:    voorkomt foutieve toekomst-datum
    // (jaar - startjaar) < 3: eerste 3 jaren
    if (startjaar >= 1990 && startjaar <= jaar && (jaar - startjaar) < 3) {
      const aftrek = BELASTING.STARTERSAFTREK;
      aftrekken.push({
        naam: 'Startersaftrek',
        bedrag: aftrek,
        voorwaarde: 'Eerste 3 jaar als ondernemer',
        code: '7990',
      });
      totaalAftrek += aftrek;
      adviezen.push({
        type: 'AFTREKPOST',
        titel: '✅ Startersaftrek: ' + formatBedrag_(aftrek),
        tekst: `U bent nog geen ${jaar - startjaar + 1} jaar ondernemer. De startersaftrek van €${BELASTING.STARTERSAFTREK.toLocaleString('nl-NL')} ` +
               `bovenop de zelfstandigenaftrek is van toepassing.`,
        besparing: rondBedrag_(aftrek * marginaalIbTarief_(winst, BELASTING)),
      });
    }
  }

  // ── 4. KIA (Kleinschaligheidsinvesteringsaftrek) ──────────────────────
  // Audit 2026-06-12 (A1): KIA stond hier voorheen NA MKB-vrijstelling.
  // Dat was fiscaal verkeerd: art. 3.40 Wet IB rekent KIA als
  // investeringsaftrek die de WINST vermindert, en art. 3.79a baseert
  // de MKB-vrijstelling op (winst − ondernemersaftrek). KIA hoort dus
  // VÓÓR de MKB-grondslag te zitten. Voorbeeldcasus (winst €60.000,
  // KIA-investering €15.000, ZA €1.200, SA €2.123):
  //   Verkeerd (oud): belastbaar €45.279
  //   Correct (nu):   belastbaar €45.812
  // → klant onderbetaalde IB met ~€200/casus → naheffing bij controle.
  // Tests: tests/unit/mkb-volgorde-na-kia.test.js.
  const gbData = leesSheetVeilig_(ss, SHEETS.GROOTBOEKSCHEMA);   // CYCLE-51
  let investeringen = 0;
  gbData.slice(1).forEach(r => {
    if (r[0] && String(r[0]).startsWith('02') && parseFloat(r[5]) > 0) {
      investeringen += parseFloat(r[5]);
    }
  });

  // KIA-tabel kent 4 zones (zie BELASTING constants):
  //  - <€2.901:                        geen KIA
  //  - €2.901  – €71.683:              28% van investering
  //  - €71.684 – €132.746:             vast €20.072
  //  - €132.747 – €398.236:            afbouw: €20.072 − 7,56% × (inv − €132.747)
  //  - >€398.236:                      geen KIA (max bereikt)
  const kiaAftrek = berekenKiaAftrek_(investeringen, BELASTING);
  if (kiaAftrek > 0) {
    let kiaToelichting;
    if (investeringen <= BELASTING.KIA_VAST_VAN) {
      kiaToelichting = `28% van ${formatBedrag_(investeringen)} = ${formatBedrag_(kiaAftrek)}`;
    } else if (investeringen <= BELASTING.KIA_AFBOUW_START) {
      kiaToelichting = `vast bedrag ${formatBedrag_(kiaAftrek)} (zone €${BELASTING.KIA_VAST_VAN.toLocaleString('nl-NL')} – €${BELASTING.KIA_AFBOUW_START.toLocaleString('nl-NL')})`;
    } else {
      kiaToelichting = `afbouw vanaf €${BELASTING.KIA_AFBOUW_START.toLocaleString('nl-NL')}: ${formatBedrag_(kiaAftrek)}`;
    }
    aftrekken.push({
      naam: 'KIA – Kleinschaligheidsinvesteringsaftrek',
      bedrag: kiaAftrek,
      voorwaarde: `Investeringen tussen €${BELASTING.KIA_MIN.toLocaleString('nl-NL')} en €${BELASTING.KIA_MAX.toLocaleString('nl-NL')}`,
      code: '7990',
    });
    totaalAftrek += kiaAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ KIA Investeringsaftrek: ' + formatBedrag_(kiaAftrek),
      tekst: `U heeft ${formatBedrag_(investeringen)} geïnvesteerd → ${kiaToelichting}. ` +
             `Zorg dat investeringen ≥ €450 zijn en voor bedrijfsmatig gebruik.`,
      besparing: rondBedrag_(kiaAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  } else if (investeringen > 0 && investeringen < BELASTING.KIA_MIN) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Tip: Extra investering voor KIA',
      tekst: `U heeft ${formatBedrag_(investeringen)} geïnvesteerd. Investeer nog ${formatBedrag_(BELASTING.KIA_MIN - investeringen)} meer ` +
             `dit jaar om in aanmerking te komen voor de KIA (28% extra aftrek = ${formatBedrag_((BELASTING.KIA_MIN) * BELASTING.KIA_PCT)}).`,
      besparing: null,
    });
  } else if (investeringen > BELASTING.KIA_MAX) {
    // Boven KIA-plafond — geen KIA, maar mogelijk andere regelingen
    adviezen.push({
      type: 'INFO',
      titel: 'ℹ️ Investeringen boven KIA-plafond',
      tekst: `U heeft ${formatBedrag_(investeringen)} geïnvesteerd, boven het KIA-plafond van ` +
             `€${BELASTING.KIA_MAX.toLocaleString('nl-NL')}. Geen KIA dit jaar. Bekijk MIA/VAMIL voor milieu-investeringen of EIA voor energie-investeringen.`,
      besparing: null,
    });
  }

  // ── 5. MKB-winstvrijstelling (NA KIA — art. 3.79a Wet IB) ──────────────
  // totaalAftrek bevat hier ZA + SA + KIA. MKB-grondslag = winst minus
  // die drie. Voorheen miste KIA in de grondslag → te hoge MKB-claim →
  // klant onderbetaalde IB. Fix-audit 2026-06-12.
  if (isZzp && winst > 0) {
    const winstNaAftrekken = Math.max(0, winst - totaalAftrek);
    const mkbAftrek = rondBedrag_(winstNaAftrekken * BELASTING.MKB_WINSTVRIJSTELLING);
    aftrekken.push({
      naam: `MKB-winstvrijstelling (${(BELASTING.MKB_WINSTVRIJSTELLING * 100).toFixed(2).replace('.', ',')}%)`,
      bedrag: mkbAftrek,
      voorwaarde: 'Automatisch van toepassing voor ondernemers IB',
      code: '7990',
    });
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ MKB-winstvrijstelling: ' + formatBedrag_(mkbAftrek),
      tekst: `${(BELASTING.MKB_WINSTVRIJSTELLING * 100).toFixed(2).replace('.', ',')}% van uw winst na aftrekken (${formatBedrag_(winstNaAftrekken)}) is vrijgesteld van inkomstenbelasting. ` +
             `Dit wordt automatisch meegenomen in uw aangifte.`,
      besparing: rondBedrag_(mkbAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
    totaalAftrek += mkbAftrek;
  }

  // ── 5b. EIA — Energie-investeringsaftrek ──────────────────────────────
  // EIA: 40% extra aftrek bovenop afschrijving voor energiebesparende
  // bedrijfsmiddelen op de RVO Energielijst. Aanmelden vóór 3 maanden na
  // opdracht. Min. €2.500 per investering.
  // Detectie via grootboekrekeningen 02xx + keywords energie/zon/warmte.
  // Bron: rvo.nl/subsidies-financiering/eia + belastingdienst.nl/.../eia-2026
  let eiaInv = 0;
  gbData.slice(1).forEach(r => {
    const code = String(r[0] || '');
    const naam = String(r[1] || '').toLowerCase();
    if (code.startsWith('02') && parseFloat(r[5]) > 0) {
      if (/energie|zonn?epaneel|zonn?epanelen|warmtepomp|isolat|led|elektr.?aut|laadpaal|warmteterugwinning/i.test(naam)) {
        eiaInv += parseFloat(r[5]);
      }
    }
  });
  if (eiaInv >= (BELASTING.EIA_MIN || 2500)) {
    const eiaAftrek = rondBedrag_(eiaInv * (BELASTING.EIA_PCT || 0.40));
    adviezen.push({
      type: 'TIP',
      titel: '💡 EIA Energie-investeringsaftrek mogelijk: ' + formatBedrag_(eiaAftrek),
      tekst: `U heeft mogelijk ${formatBedrag_(eiaInv)} aan energie-investeringen. EIA geeft ` +
             `${Math.round((BELASTING.EIA_PCT || 0.40) * 100)}% extra aftrek = ${formatBedrag_(eiaAftrek)}. ` +
             `Voorwaarde: bedrijfsmiddel staat op RVO Energielijst + aanmelden binnen 3 maanden na opdracht via rvo.nl. ` +
             `EIA is naast KIA mogelijk (geen dubbel-aftrek-verbod, maar wel anti-cumulatie met MIA).`,
      besparing: rondBedrag_(eiaAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  }

  // ── 5c. WBSO — Innovatie-aftrek voor Speur- en Ontwikkelingswerk ──────
  // WBSO is fiscaal voordeel voor R&D-werk (≥500u/jaar). ZZP-aftrek 2026:
  // €15.979 + €7.996 starterbonus.
  // Detectie via grootboek 7790/8050 of categorie 'R&D'/'Onderzoek' of
  // instelling 'WBSO actief'.
  // CYCLE-56: isJa_ helper (consistent + accepteert 'y'/'1'/'aan'/'on')
  const wbsoActief = (typeof isJa_ === 'function') ? isJa_(getInstelling_('WBSO actief')) : false;
  const heeftRdGrootboek = gbData.slice(1).some(r =>
    /onderzoek|r\s*&\s*d|innovatie|s\s*&\s*o|speur/i.test(String(r[1] || ''))
  );
  if ((wbsoActief || heeftRdGrootboek) && isZzp && winst > 0) {
    const startjaarRawW = String(getInstelling_('Startjaar onderneming') || '').trim();
    const startjaarW = /^\d{4}$/.test(startjaarRawW) ? parseInt(startjaarRawW, 10) : 0;
    const isStarter = startjaarW >= 1990 && startjaarW <= jaar && (jaar - startjaarW) < 5;
    const wbsoAftrek = (BELASTING.WBSO_AFTREK || 15979) + (isStarter ? (BELASTING.WBSO_STARTERSBONUS || 7996) : 0);
    adviezen.push({
      type: 'VOORDEEL',
      titel: `💡 WBSO mogelijk: ${formatBedrag_(wbsoAftrek)}/jaar aftrek` + (isStarter ? ' (incl. starterbonus)' : ''),
      tekst: `Heeft u ≥500 uur per jaar besteed aan R&D/innovatie/software-ontwikkeling? ` +
             `De WBSO geeft een vaste aftrek van ${formatBedrag_(BELASTING.WBSO_AFTREK || 15979)}` +
             (isStarter ? ` + ${formatBedrag_(BELASTING.WBSO_STARTERSBONUS || 7996)} starterbonus (eerste 5 jaar)` : '') +
             `. Vraag de S&O-verklaring aan via rvo.nl (minimaal 1 maand vóór projectstart).`,
      besparing: rondBedrag_(wbsoAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  }

  // ── 5d. AOV — Arbeidsongeschiktheidsverzekering ───────────────────────
  // AOV-premie aftrekbaar in box 1 als "uitgave inkomensvoorziening"
  // (alleen bij periodieke uitkering, niet lump sum).
  // Detectie via grootboek 7910 (Verzekeringen) + keyword 'AOV'/'arbeidsongeschikt'
  // Bron: belastingdienst.nl/.../arbeidsongeschiktheidsverzekering-voor-ondernemers
  const aovInJp = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  let heeftAov = false;
  let aovBetaald = 0;
  if (aovInJp && isZzp) {
    const jpData = aovInJp.getDataRange().getValues();
    for (let i = 1; i < jpData.length; i++) {
      const omschrJp = String(jpData[i][2] || '').toLowerCase();
      if (/aov|arbeidsongeschikt/i.test(omschrJp)) {
        heeftAov = true;
        aovBetaald += parseFloat(jpData[i][8]) || 0;
      }
    }
  }
  if (heeftAov && aovBetaald > 0) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 AOV-premie aftrekbaar in box 1: ' + formatBedrag_(aovBetaald),
      tekst: `U heeft AOV-premies betaald (${formatBedrag_(aovBetaald)} dit jaar). ` +
             `Deze premie is NIET aftrekbaar als bedrijfskost, maar WEL in box 1 ` +
             `als "uitgaven voor inkomensvoorzieningen" — mits uw AOV een periodieke ` +
             `uitkering biedt (geen lump sum). Aangeven bij IB-aangifte. Netto ` +
             `voordeel: 35-49,5% afhankelijk van uw schijf.`,
      besparing: rondBedrag_(aovBetaald * marginaalIbTarief_(winst, BELASTING)),
    });
  } else if (isZzp && winst > 5000 && !heeftAov) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Heeft u een AOV?',
      tekst: `Geen AOV-premie betaling gedetecteerd. Voor ondernemers is een ` +
             `arbeidsongeschiktheidsverzekering geen luxe — bij ziekte/letsel valt ` +
             `inkomen weg. Premie is aftrekbaar in box 1 (35-49,5% terug). ` +
             `Verplichte AOV is uitgesteld tot uiterlijk 2030. Bespreek met assurantieadviseur.`,
      besparing: null,
    });
  }

  // ── 5e. Stakingsaftrek (bij detectie staken/beëindigen) ───────────────
  // Eenmalig per leven €3.630 bij staken. Plus stakingslijfrente.
  // Detectie via instelling 'Stakingsdatum' of journaalpost 'staking'/'beëindiging'.
  const stakingsdatumRaw = String(getInstelling_('Stakingsdatum onderneming') || '').trim();
  const stakingsdatum = stakingsdatumRaw ? parseDatum_(stakingsdatumRaw) : null;
  const isStaakjaar = stakingsdatum && !isNaN(stakingsdatum.getTime()) && stakingsdatum.getFullYear() === jaar;
  if (isStaakjaar && isZzp) {
    const stakingsaftrek = BELASTING.STAKINGSAFTREK || 3630;
    aftrekken.push({
      naam: 'Stakingsaftrek',
      bedrag: stakingsaftrek,
      voorwaarde: 'Eenmalig per leven bij staken onderneming',
      code: '7990',
    });
    totaalAftrek += stakingsaftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ Stakingsaftrek: ' + formatBedrag_(stakingsaftrek),
      tekst: `Stakingsdatum ${formatDatum_(stakingsdatum)} is in dit boekjaar. ` +
             `U heeft recht op de stakingsaftrek van €${stakingsaftrek.toLocaleString('nl-NL')} ` +
             `(eenmalig per leven). Daarnaast: stakingslijfrente — extra premieaftrek voor ` +
             `pensioenopbouw bij staking. Bespreek met uw accountant.`,
      besparing: rondBedrag_(stakingsaftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  }

  // ── 5f. Logies-BTW-overgang 2025 → 2026 ───────────────────────────────
  // Per 1 januari 2026 stijgt BTW-tarief logies van 9% naar 21%.
  // Bron: belastingdienst.nl/wps/wcm/connect/.../btw-logies (officieel)
  const bedrijfsActiviteit = String(getInstelling_('Bedrijfsactiviteit') || '').toLowerCase();
  const isLogiesBedrijf = /logies|hotel|b\s*&\s*b|vakantie|airbnb|kamerverhuur|gastenverblijf/i.test(bedrijfsActiviteit);
  if (isLogiesBedrijf && jaar >= 2026) {
    adviezen.push({
      type: 'WAARSCHUWING',
      titel: '⚠️ BTW-tarief logies verhoogd naar 21% per 1-1-2026',
      tekst: `Het verlaagde BTW-tarief van 9% voor logies (hotelovernachtingen, ` +
             `vakantiewoningen, B&B's) is per 1 januari 2026 vervallen. Vanaf nu ` +
             `factureert u 21%. LET OP: betalingen ontvangen in 2025 voor verblijven ` +
             `in 2026 vallen ook al onder 21%. Update uw factuur-template.`,
      besparing: null,
    });
  } else if (isLogiesBedrijf && jaar === 2025) {
    adviezen.push({
      type: 'INFO',
      titel: 'ℹ️ BTW-wijziging logies per 2026',
      tekst: `Vanaf 1 januari 2026 stijgt het BTW-tarief op logies van 9% naar 21%. ` +
             `Voorbereiden: prijscommunicatie naar gasten, factuur-template updaten. ` +
             `Vooruitbetalingen voor 2026-verblijven vallen al onder 21%.`,
      besparing: null,
    });
  }

  // ── 6. Reiskosten analyse ─────────────────────────────────────────────
  // Alleen tonen als er ÜBERHAUPT al boekhouding is — anders confronteer je
  // een nieuwe gebruiker met advies over iets wat hij nog niet eens
  // gebruikt heeft (geeft 'aftrek-aanrekenen op €0 omzet'-gevoel).
  const reiskosten = getGrootboekSaldo_(ss, '7350');
  if (reiskosten === 0 && winst > 0) {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Reiskosten aftrekken?',
      tekst: `U heeft nog geen zakelijke reiskosten geboekt (rekening 7350). ` +
             `Zakelijke kilometers zijn aftrekbaar tegen €0,23/km. Gebruik het banktransactie formulier om dit bij te houden.`,
      besparing: null,
    });
  }

  // ── 7. BTW aangifte deadline check ───────────────────────────────────
  const vandaag = new Date();
  const maand = vandaag.getMonth() + 1;
  // BTW deadlines: Q4→31 jan, Q1→30 apr, Q2→31 jul, Q3→31 okt
  // Waarschuwing toont in de deadlinemaand zelf (maand 1, 4, 7 of 10)
  const maandNamen = ['', 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
                      'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const kwartaalDeadlines = { 1: 'Q4 vorig jaar', 4: 'Q1', 7: 'Q2', 10: 'Q3' };
  if (kwartaalDeadlines[maand] && vandaag.getDate() <= 28) {
    adviezen.push({
      type: 'ACTIE',
      titel: '📅 BTW aangifte: ' + kwartaalDeadlines[maand] + ' deadline nadert',
      tekst: `De BTW aangifte voor ${kwartaalDeadlines[maand]} moet voor eind ${maandNamen[maand]} worden ingediend. ` +
             `Genereer uw aangifte via: Boekhouding → BTW.`,
      besparing: null,
    });
  }

  // ── 8a. FOR — Fiscale OudedagsReserve ────────────────────────────────
  // FOR is per 1 januari 2023 AFGESCHAFT — geen nieuwe dotaties meer mogelijk.
  // Bestaande saldi op 31-12-2022 mogen blijven staan en kunnen worden
  // afgewikkeld bij staking of via lijfrente-aankoop.
  // Bron: belastingdienst.nl/.../fiscale-oudedagsreserve-afgeschaft
  if (isZzp && winst > 0) {
    adviezen.push({
      type: 'INFO',
      titel: 'ℹ️ FOR is afgeschaft (sinds 2023)',
      tekst: `Sinds 1 januari 2023 kan er géén nieuwe dotatie aan de Fiscale Oudedagsreserve worden gedaan. ` +
             `Heeft u nog een FOR-saldo van vóór 2023? Dat mag op uw balans blijven staan en kunt u afwikkelen ` +
             `via aanschaf van een lijfrente bij staking. Voor pensioenopbouw nu: gebruik de jaarruimte voor ` +
             `een lijfrenteverzekering of bancaire lijfrente (zie advies hieronder). ` +
             `Bespreek de afwikkeling van een bestaande FOR met uw accountant.`,
      besparing: null,
    });
  }

  // ── 8b. MIA/VAMIL (milieu-investeringen) ─────────────────────────────
  // Kijk of er milieu-gerelateerde investeringen zijn (rekening 026x/027x)
  const gbDataMia = leesSheetVeilig_(ss, SHEETS.GROOTBOEKSCHEMA);   // CYCLE-51
  let milieu = 0;
  gbDataMia.slice(1).forEach(r => {
    if (r[0] && /^02[67]/.test(String(r[0])) && parseFloat(r[5]) > 0) milieu += parseFloat(r[5]);
  });
  if (milieu >= BELASTING.MIA_MIN) {
    const miaAftrek = rondBedrag_(milieu * BELASTING.MIA_PCT);
    aftrekken.push({ naam: 'MIA – Milieu-investeringsaftrek (45,5%)', bedrag: miaAftrek, voorwaarde: `Milieu-investeringen ≥ €2.500 op de RVO-milieulijst`, code: '7990' });
    totaalAftrek += miaAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ MIA – Milieu-investeringsaftrek: ' + formatBedrag_(miaAftrek),
      tekst: `${formatBedrag_(milieu)} aan milieu-investeringen gedetecteerd. MIA geeft 45,5% extra aftrek: ${formatBedrag_(miaAftrek)}. ` +
             `Investeringen moeten op de RVO-milieulijst staan én vóór aanschaf gemeld bij RVO. Combineerbaar met KIA.`,
      besparing: rondBedrag_(miaAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  } else if (milieu === 0) {
    adviezen.push({
      type: 'TIP',
      titel: '🌱 Tip: MIA/VAMIL – 45,5% extra aftrek bij milieu-investeringen',
      tekst: `Investeert u in zonnepanelen, elektrische auto, warmtepomp of andere milieu-investeringen? ` +
             `Dan geeft MIA 45,5% extra aftrek bóvenop de normale afschrijving. Meld vóór aankoop bij RVO.nl.`,
      besparing: null,
    });
  }

  // ── 8c. Thuiswerkaftrek ────────────────────────────────────────────────
  // Defensieve parse — voorkomt NaN-bugs door non-numeric input zoals '250 dagen'
  // Defensieve clamp: 0-365 dagen. Voorheen kon "1000 dagen" door en
  // gaf €2.400 onrealistische thuiswerkaftrek.
  const thuiswerkDagenRaw = parseInt(getInstelling_('Thuiswerk dagen per jaar') || '0', 10);
  const thuiswerkDagen = (isFinite(thuiswerkDagenRaw) && thuiswerkDagenRaw > 0)
    ? Math.min(365, thuiswerkDagenRaw)
    : 0;
  if (thuiswerkDagen > 0) {
    const thuiswerkAftrek = rondBedrag_(thuiswerkDagen * BELASTING.THUISWERK_PER_DAG);
    aftrekken.push({ naam: `Thuiswerkvergoeding (${thuiswerkDagen} dagen × €${BELASTING.THUISWERK_PER_DAG})`, bedrag: thuiswerkAftrek, voorwaarde: 'Werkdagen vanuit huis', code: '7350' });
    totaalAftrek += thuiswerkAftrek;
    adviezen.push({
      type: 'AFTREKPOST',
      titel: '✅ Thuiswerkaftrek: ' + formatBedrag_(thuiswerkAftrek),
      tekst: `Op basis van ${thuiswerkDagen} thuiswerkdagen à €${BELASTING.THUISWERK_PER_DAG}/dag: ${formatBedrag_(thuiswerkAftrek)}. ` +
             `Pas het aantal dagen aan via Instellingen → "Thuiswerk dagen per jaar".`,
      besparing: rondBedrag_(thuiswerkAftrek * marginaalIbTarief_(winst, BELASTING)),
    });
  } else {
    adviezen.push({
      type: 'TIP',
      titel: '💡 Thuiswerkaftrek: €2,40 per werkdag aftrekbaar',
      tekst: `Werkt u vanuit huis? Dan is €2,40 per werkdag aftrekbaar (ca. €624 bij 260 werkdagen). ` +
             `Vul "Thuiswerk dagen per jaar" in via Instellingen om dit automatisch te berekenen.`,
      besparing: null,
    });
  }

  // ── 8d. Urencriterium voortgang ───────────────────────────────────────
  // Audit 2026-06-12 (C1): Sheet UREN is nu bron-van-waarheid voor het
  // 1.225-uren-criterium (art. 3.6 Wet IB). Belastingdienst-controle eist
  // per-rij datum + activiteit + uren. Fallback naar de oude instelling
  // "Gewerkte uren dit jaar" voor klanten die de UREN-sheet nog niet
  // bevolkt hebben — die fallback waarschuwt expliciet over zwakke
  // onderbouwing.
  if (isZzp) {
    let uren = 0;
    let bron = 'sheet';
    if (typeof totaalUrenInBoekjaar_ === 'function') {
      try { uren = totaalUrenInBoekjaar_(ss, jaar); } catch (_) { uren = 0; }
    }
    if (uren <= 0) {
      const urenRaw = parseInt(getInstelling_('Gewerkte uren dit jaar') || '0', 10);
      if (isFinite(urenRaw) && urenRaw > 0) { uren = urenRaw; bron = 'instelling'; }
    }
    if (uren > 0) {
      const pct = Math.min(100, Math.round((uren / BELASTING.URENCRITERIUM) * 100));
      const resterend = Math.max(0, BELASTING.URENCRITERIUM - uren);
      // Onderbouwingswaarschuwing als de uren NIET uit de sheet komen —
      // dan ontbreekt per-rij-bewijs voor Belastingdienst-controle.
      const onderbouwd = (bron === 'sheet');
      const onderbouwingsTekst = onderbouwd
        ? ' (bewijslast staat in tabblad Urenregistratie).'
        : ' ⚠️ Vul het tabblad Urenregistratie per dag/activiteit — een totaal in Instellingen is bij controle onvoldoende onderbouwing.';
      adviezen.push({
        type: uren >= BELASTING.URENCRITERIUM ? 'AFTREKPOST' : 'ACTIE',
        titel: uren >= BELASTING.URENCRITERIUM
          ? `✅ Urencriterium gehaald! (${uren}/1.225 uur)`
          : `⏱️ Urencriterium: ${uren}/1.225 uur (${pct}%)`,
        tekst: uren >= BELASTING.URENCRITERIUM
          ? `U heeft het urencriterium gehaald. Zelfstandigenaftrek en startersaftrek zijn van toepassing.` + onderbouwingsTekst
          : `Nog ${resterend} uur nodig voor zelfstandigenaftrek en startersaftrek.` + onderbouwingsTekst,
        besparing: null,
      });
    } else {
      adviezen.push({
        type: 'ACTIE',
        titel: '⏱️ Urenregistratie vereist voor zelfstandigenaftrek',
        tekst: `Open menu Boekhoudbaar → Urenregistratie en log dagelijks uw uren ` +
               `(datum + activiteit + aantal). Zonder 1.225 uur geen recht op ` +
               `zelfstandigenaftrek of startersaftrek. Een totaal-veld in Instellingen ` +
               `is bij Belastingdienst-controle onvoldoende onderbouwing.`,
        besparing: null,
      });
    }
  }

  // ── 8e. Privégebruik zakelijke middelen ───────────────────────────────
  adviezen.push({
    type: 'INFO',
    titel: 'ℹ️ Privégebruik zakelijke middelen — controleer correcties',
    tekst: `Telefoon/laptop zakelijk maar ook privé gebruikt? Bijtelling verplicht of zakelijk aftrekbaar als ≥10% zakelijk. ` +
           `Auto van de zaak: bijtelling 16–22% van cataloguswaarde per jaar (EV: 16%). ` +
           `Kilometer­registratie bij privéauto: €0,23/km aftrekbaar. ` +
           `Gebruik rekening 7900 (Privé-onttrekkingen) voor correcties. Bespreek met uw accountant.`,
    besparing: null,
  });

  // ── 8f. Afschrijvingskandidaten ───────────────────────────────────────
  const kandidaten = scanAfschrijvingskandidaten_(ss);
  if (kandidaten.length > 0) {
    const totaalKandidaten = kandidaten.reduce((s, k) => s + k.bedrag, 0);
    adviezen.push({
      type: 'ACTIE',
      titel: `📦 ${kandidaten.length} mogelijke afschrijvingskandidaa${kandidaten.length === 1 ? 't' : 'ten'} (totaal ${formatBedrag_(totaalKandidaten)})`,
      tekst: kandidaten.slice(0, 5).map(k => `• ${formatBedrag_(k.bedrag)} – ${k.omschr} (${k.leverancier})`).join('\n') +
             (kandidaten.length > 5 ? `\n• … en ${kandidaten.length - 5} meer` : '') +
             `\n\nAankopen ≥ €${BELASTING.ACTIVEER_GRENS} moeten worden geactiveerd als investering (niet direct als kosten). ` +
             `Boek ze op een 0xxx-rekening en schrijf jaarlijks af. Dit geeft recht op KIA (28% extra aftrek).`,
      besparing: null,
    });
  }

  // ── 8. Representatiekosten controle ──────────────────────────────────
  const reprKosten = getGrootboekSaldo_(ss, '7520');
  if (reprKosten > 0) {
    const nietAftrekbaar = rondBedrag_(reprKosten * (1 - BELASTING.REPRESENTATIE_AFTREK));
    adviezen.push({
      type: 'INFO',
      titel: 'ℹ️ Representatiekosten: let op beperkte aftrek',
      tekst: `Van uw representatiekosten (${formatBedrag_(reprKosten)}) is 26,5% NIET aftrekbaar (${formatBedrag_(nietAftrekbaar)}). ` +
             `Dit is al verwerkt in rekening 7520.`,
      besparing: null,
    });
  }

  // ── 9. Geschatte fiscale last (IB Box 1 + Zvw, na heffings/arbeidskortingen)
  // Progressief over 3 IB-schijven met AOW-aware tarief schijf 1, plus
  // inkomensafhankelijke heffingskorting + arbeidskorting + Zvw-bijdrage.
  // Voorheen gebruikte het systeem alleen schijf 1 → 2 + vaste max-heffingskorting,
  // wat schijf 2 te laag belaste én Zvw geheel oversloeg (€3-4k onderschatting).
  let geschatteIB = 0;
  let zvwBijdrage = 0;
  let heffingskortingToegepast = 0;
  let arbeidskortingToegepast = 0;
  if (isZzp && winst > 0) {
    const belastbaarInkomen = Math.max(0, winst - totaalAftrek);
    const aow = isAowGerechtigd_(BELASTING);
    const ibBruto = berekenIBProgressief_(belastbaarInkomen, BELASTING, aow);
    heffingskortingToegepast = berekenHeffingskorting_(belastbaarInkomen, BELASTING);
    // Arbeidsinkomen ≈ winst voor ondernemers (geen loonbestanddeel)
    arbeidskortingToegepast = berekenArbeidskorting_(winst, BELASTING);
    geschatteIB = Math.max(0, rondBedrag_(ibBruto - heffingskortingToegepast - arbeidskortingToegepast));
    // Zvw-bijdrage komt BOVENOP de IB voor ondernemers
    zvwBijdrage = berekenZvw_(winst, BELASTING);
  }
  const totaleFiscaleLast = rondBedrag_(geschatteIB + zvwBijdrage);

  // Reproduceerbare snapshot — klant kan jaar later compute en compare hash
  const meta = (typeof BELASTING_META !== 'undefined' && BELASTING_META[jaar]) || null;
  const hashInput = {
    jaar: jaar,
    winst: winst,
    totaalAftrek: rondBedrag_(totaalAftrek),
    geschatteIB: geschatteIB,
    zvwBijdrage: zvwBijdrage,
    isAow: isZzp ? isAowGerechtigd_(BELASTING) : false,
    taxVersie: meta ? meta.versie : '?',
  };
  const inputHash = (typeof hashBerekeningInput_ === 'function') ? hashBerekeningInput_(hashInput) : null;

  return {
    adviezen,
    aftrekken,
    totaalAftrek: rondBedrag_(totaalAftrek),
    winstVoorAftrek: winst,
    winstNaAftrek: Math.max(0, rondBedrag_(winst - totaalAftrek)),
    geschatteIB,
    zvwBijdrage,
    heffingskortingToegepast,
    arbeidskortingToegepast,
    totaleFiscaleLast,
    isAowGerechtigd: isZzp ? isAowGerechtigd_(BELASTING) : false,
    isZzp,
    // Audit-bestendige metadata
    berekendOp: new Date().toISOString(),
    inputHash: inputHash,
    taxVersie: meta ? meta.versie : null,
    taxBevestigd: meta ? meta.bevestigd : null,
    taxBron: meta ? meta.bron : null,
    // Audit ronde 2 (documentatie): TARIEF_VEROUDERD flag voor UI-banner
    BELASTING_meta: {
      tariefVerouderd: !!BELASTING.TARIEF_VEROUDERD,
      tariefBron: BELASTING.TARIEF_BRON || null,
      tariefFallbackJaar: BELASTING.TARIEF_FALLBACK_JAAR || null,
    },
  };
}

// ─────────────────────────────────────────────
//  BELASTINGADVIES TABBLAD GENEREREN
// ─────────────────────────────────────────────
function genereerBelastingadvies() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const bladNaam = 'Belastingadvies';
  let sheet = ss.getSheetByName(bladNaam);
  if (!sheet) sheet = ss.insertSheet(bladNaam);
  sheet.clearContents();
  sheet.clearFormats();
  sheet.setTabColor(KLEUREN.ACCENT);

  const advies = berekenBelastingadvies_(ss);
  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const jaar = new Date().getFullYear();

  // Koptekst
  sheet.getRange(1, 1, 1, 3).merge()
    .setValue('FISCAAL OVERZICHT & AFTREKPOSTEN – ' + jaar)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sheet.getRange(2, 1, 1, 3).merge()
    .setValue(bedrijf + '  |  Bijgewerkt: ' + formatDatumTijd_(new Date()))
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#B8C2D1')
    .setFontSize(10).setHorizontalAlignment('center');

  // Juridische disclaimer + bronnen — VERPLICHT op elke fiscale output.
  // Voorkomt dat klant Boekhoudbaar als 'fiscaal adviseur' interpreteert
  // wat een gereguleerde activiteit is (Wet WFR / AFM-regels). Boekhoudbaar
  // is een tool voor fiscale berekeningen op basis van publieke bronnen,
  // geen erkende belastingadviseur.
  sheet.getRange(3, 1, 1, 3).merge()
    .setValue('ℹ️ Informatieve berekeningen op basis van Belastingdienst.nl — geen formeel belastingadvies. ' +
              'Raadpleeg bij twijfel een gekwalificeerde belastingadviseur of accountant.')
    .setBackground('#FFF8E1').setFontColor('#5A3F00')
    .setFontSize(10).setFontStyle('italic').setHorizontalAlignment('center')
    .setWrap(true);
  sheet.setRowHeight(3, 30);

  // Audit ronde 2 (documentatie): TARIEF_VEROUDERD-banner. Bij placeholder
  // (2027 vóór Belastingplan) of fallback (Sam stopt onderhouden) zien klant
  // dat tarieven niet gevalideerd zijn. Voorkomt klant-vraag "Waarom rekent
  // het programma met 2026-tarieven in 2027?" in januari-massa-event.
  if (advies && advies.BELASTING_meta && advies.BELASTING_meta.tariefVerouderd) {
    const bronTekst = advies.BELASTING_meta.tariefBron || 'oudere tarief-tabel';
    sheet.getRange(4, 1, 1, 3).merge()
      .setValue('⚠️ Tarieven gebruikt voor ' + jaar + ' zijn ' + bronTekst +
                ' — controleer voor indiening tegen Belastingdienst.nl. ' +
                'Updates komen bij volgende Boekhoudbaar-versie of via je accountant.')
      .setBackground('#FEE2E2').setFontColor('#7F1D1D')
      .setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center')
      .setWrap(true);
    sheet.setRowHeight(4, 36);
  }

  // Empty-state: nog geen omzet → tonen wat te doen, geen "lege" rijen advies.
  // Detectie via winstVoorAftrek + omzet — als beide 0 is er nog niets te
  // adviseren. Klant ziet uitnodigende hint i.p.v. "0,00 €" in iedere rij.
  const omzet = advies.omzet || 0;
  const winst = advies.winstVoorAftrek || 0;
  if (omzet === 0 && winst === 0) {
    sheet.setColumnWidth(1, 720);
    sheet.getRange(4, 1, 1, 3).merge()
      .setValue('💡 Nog geen omzet of kosten in ' + jaar)
      .setBackground('#FFF8E1').setFontColor('#5A3F00')
      .setFontWeight('bold').setFontSize(13)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(4, 38);
    sheet.getRange(5, 1, 1, 3).merge()
      .setValue('Voer eerst een paar facturen of kostenposten in via Boekhouding → "Nieuwe boeking". ' +
        'Zodra er omzet of kosten staan, krijg je hier een persoonlijke fiscale signalering met:\n\n' +
        '• Geschatte IB + Zvw voor dit jaar (informatief)\n' +
        '• Aftrekposten waar je mogelijk recht op hebt (KIA, MIA, EIA)\n' +
        '• Reiskosten, lijfrente-jaarruimte, BTW-spaarpot\n' +
        '• Signaleringen op basis van je boekjaar\n\n' +
        'Je kunt ook eerst je fiscaal profiel invullen: Boekhouding → "Vul je profiel in voor persoonlijke berekening".\n\n' +
        '⚠️ Boekhoudbaar geeft informatieve berekeningen, geen formeel belastingadvies. Bron: Belastingdienst.nl.')
      .setBackground('#FFFFFF').setFontColor('#5F6B7A')
      .setFontSize(11).setWrap(true)
      .setHorizontalAlignment('left').setVerticalAlignment('top');
    sheet.setRowHeight(5, 220);
    try { ss.setActiveSheet(sheet); } catch (_) {}
    return;
  }

  let rij = 4;

  // ── BELASTINGVOORDEEL-TOP-BANNER ───────────────────────────────────
  // Klant ziet meteen "wat heeft het systeem opgeleverd" + actuele tip.
  // Is consistent met de dashboard-widget; hier in detail-context.
  let voordeel = null;
  let seizoen = null;
  try {
    const B = getBelasting_();
    voordeel = berekenBelastingvoordeel_(advies, B);
    seizoen = (typeof getSeizoensTipRender_ === 'function') ? getSeizoensTipRender_() : null;
  } catch (e) {
    // Voorheen silent — klant zag dan geen voordeel-banner zonder te weten waarom
    Logger.log('Belastingvoordeel-banner berekening: ' + e.message);
    safeAuditLog_('Belastingvoordeel banner FOUT', e.message);
  }

  if (voordeel) {
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue('💰 WAT BOEKHOUDBAAR DIT JAAR VOOR U DOET')
      .setBackground('#0D1B4E').setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
    sheet.setRowHeight(rij, 28);
    rij++;
    sheet.getRange(rij, 1).setValue('Bespaard dit jaar (benutte aftrekken)')
      .setFontWeight('bold').setBackground('#E6F7F4');
    sheet.getRange(rij, 2, 1, 2).merge()
      .setValue(formatBedrag_(voordeel.bespaardYTD))
      .setFontWeight('bold').setFontSize(14).setFontColor('#0D1B4E')
      .setBackground('#E6F7F4').setHorizontalAlignment('right');
    rij++;
    sheet.getRange(rij, 1).setValue('Mogelijk extra (gemiste kansen)')
      .setFontWeight('bold').setBackground(voordeel.mogelijkExtra > 0 ? '#FFF8E1' : '#F7F9FC');
    sheet.getRange(rij, 2, 1, 2).merge()
      .setValue(formatBedrag_(voordeel.mogelijkExtra))
      .setFontWeight('bold').setFontSize(14).setFontColor('#5A3F00')
      .setBackground(voordeel.mogelijkExtra > 0 ? '#FFF8E1' : '#F7F9FC').setHorizontalAlignment('right');
    rij++;
    sheet.getRange(rij, 1).setValue('Totaal potentieel')
      .setFontWeight('bold').setBackground('#E3F2FD');
    sheet.getRange(rij, 2, 1, 2).merge()
      .setValue(formatBedrag_(voordeel.totaalPotentieel))
      .setFontWeight('bold').setFontSize(14).setFontColor('#0D47A1')
      .setBackground('#E3F2FD').setHorizontalAlignment('right');
    rij += 2;
  }

  // ── PROFIEL-STATUS BANNER ──────────────────────────────────────────
  // Toon CTA als fiscaal profiel niet ingevuld is — dan kan systeem
  // niet alle gepersonaliseerde adviezen geven.
  const profielVelden = ['Geboortedatum', 'Startjaar onderneming', 'Bedrijfsactiviteit'];
  const ontbrekend = profielVelden.filter(function(v) {
    const w = getInstelling_(v);
    return !w || String(w).trim() === '';
  });
  if (ontbrekend.length > 0) {
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue('📋 Vul uw fiscaal profiel in voor persoonlijke berekening (60 sec) — ' +
                ontbrekend.length + ' velden ontbreken: ' + ontbrekend.join(', '))
      .setBackground('#FFF8E1').setFontColor('#5A3F00')
      .setFontWeight('bold').setFontSize(11).setWrap(true);
    sheet.setRowHeight(rij, 36);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue('→ Open via menu: Boekhouding → Persoonlijk fiscaal profiel invullen')
      .setBackground('#FFF8E1').setFontColor('#5A3F00')
      .setFontSize(10).setHorizontalAlignment('center');
    rij += 2;
  }

  // ── SEIZOENS-TIP ───────────────────────────────────────────────────
  if (seizoen) {
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(seizoen.titel).setBackground(seizoen.bgKleur).setFontColor(seizoen.fontKleur)
      .setFontWeight('bold').setFontSize(12);
    sheet.setRowHeight(rij, 28);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(seizoen.tekst + (seizoen.deadline ? '\n⏰ Deadline: ' + seizoen.deadline : ''))
      .setBackground(seizoen.bgKleur).setFontColor(seizoen.fontKleur)
      .setWrap(true).setFontSize(10).setVerticalAlignment('top');
    sheet.setRowHeight(rij, Math.min(140, 30 + (seizoen.tekst.length / 70) * 14));
    rij += 2;
  }

  // Samenvatting
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('SAMENVATTING').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const samenvatting = [
    ['Winst vóór aftrekken', formatBedrag_(advies.winstVoorAftrek)],
    ['Totaal aftrekposten', formatBedrag_(advies.totaalAftrek)],
    ['Belastbare winst', formatBedrag_(advies.winstNaAftrek)],
    ['Heffingskorting toegepast', formatBedrag_(-(advies.heffingskortingToegepast || 0))],
    ['Arbeidskorting toegepast', formatBedrag_(-(advies.arbeidskortingToegepast || 0))],
    ['Geschatte inkomstenbelasting (Box 1)*', formatBedrag_(advies.geschatteIB)],
    ['Zvw inkomensafhankelijke bijdrage*', formatBedrag_(advies.zvwBijdrage || 0)],
    ['TOTALE FISCALE LAST (IB + Zvw)*', formatBedrag_(advies.totaleFiscaleLast || advies.geschatteIB)],
  ];
  samenvatting.forEach(([label, waarde]) => {
    sheet.getRange(rij, 1).setValue(label).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(waarde);
    rij++;
  });
  sheet.getRange(rij - 1, 1, 1, 2).setBackground('#FFECB3').setFontWeight('bold');
  sheet.getRange(rij, 1, 1, 2).merge()
    .setValue('* Schatting. Zvw is wettelijk verplicht voor ondernemers (max ~€3.851/jaar in 2026). ' +
              'Heffingskortingen worden afgebouwd bij hoog inkomen. ' +
              'Voor topverdieners > AOW-leeftijd geldt lager schijf-1-tarief. ' +
              'Raadpleeg uw accountant voor definitieve aangifte.')
    .setFontSize(9).setFontColor('#888');
  rij += 2;

  // Aftrekposten
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('AFTREKPOSTEN').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;
  sheet.getRange(rij, 1, 1, 3).setValues([['Aftrekpost', 'Bedrag', 'Voorwaarde']])
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  advies.aftrekken.forEach(a => {
    sheet.getRange(rij, 1).setValue(a.naam);
    sheet.getRange(rij, 2).setValue(a.bedrag).setNumberFormat('€#,##0.00');
    sheet.getRange(rij, 3).setValue(a.voorwaarde).setFontSize(9).setFontColor('#555');
    sheet.getRange(rij, 1, 1, 3).setBackground(KLEUREN.POSITIEF);
    rij++;
  });

  if (advies.aftrekken.length === 0) {
    sheet.getRange(rij, 1, 1, 3).merge().setValue('Nog geen aftrekposten berekend (vul bedrijfsgegevens in).')
      .setFontColor('#888');
    rij++;
  }
  rij++;

  // Adviezen en tips
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('ADVIEZEN & ACTIEPUNTEN').setBackground(KLEUREN.SECTIE_BG).setFontWeight('bold');
  rij++;

  const typeKleuren = {
    'VOORDEEL':     '#E8F5E9',
    'AFTREKPOST':   '#E3F2FD',
    'WAARSCHUWING': '#FFCDD2',
    'ACTIE':        '#FFF3E0',
    'TIP':          '#F3E5F5',
    'INFO':         '#F5F5F5',
  };

  advies.adviezen.forEach(a => {
    const bg = typeKleuren[a.type] || '#FAFAFA';
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.titel)
      .setBackground(bg).setFontWeight('bold').setWrap(true);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.tekst)
      .setBackground(bg).setWrap(true).setFontSize(10);
    if (a.besparing) {
      sheet.getRange(rij, 3).setValue('Belastingbesparing: ' + formatBedrag_(a.besparing))
        .setFontWeight('bold').setFontColor('#1B5E20');
    }
    rij += 2;
  });

  // ── Privé belastingvoordelen ──────────────────────────────────────────
  rij++;
  const prive = berekenPriveBelastingvoordelen_(advies.winstVoorAftrek);
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('PRIVÉ BELASTINGVOORDELEN').setBackground('#4A148C').setFontColor('#FFFFFF').setFontWeight('bold');
  rij++;

  prive.forEach(a => {
    const bg = typeKleuren[a.type] || '#FAFAFA';
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.titel).setBackground(bg).setFontWeight('bold').setWrap(true);
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue(a.tekst).setBackground(bg).setWrap(true).setFontSize(10);
    if (a.besparing) {
      sheet.getRange(rij, 3).setValue('Belastingbesparing: ' + formatBedrag_(a.besparing))
        .setFontWeight('bold').setFontColor('#1B5E20');
    }
    rij += 2;
  });

  // Kolombreedte
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 350);
  sheet.setFrozenRows(3);

  // ── BRONNEN-VOETNOOT — verplicht voor compliance ──────────────────────
  // Toont aan klant + auditeur welke publieke bronnen gebruikt zijn voor
  // tarieven en regels. Compliance-grond bij eventuele juridische vragen.
  rij += 2;
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue('📚 Bronnen & disclaimer')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(12);
  rij++;
  const bronnenTekst =
    'Tarieven, regels en grenzen voor ' + jaar + ' zijn gebaseerd op publieke bronnen:\n\n' +
    '• Belastingdienst.nl — IB-tarieven, schijven, heffingskorting, ZVW, KOR, BTW: belastingdienst.nl\n' +
    '• Overheid.nl — Wet IB 2001, Wet OB 1968, AWR: wetten.overheid.nl\n' +
    '• KvK.nl — Ondernemersregelingen, MKB-vrijstelling, KIA/MIA/EIA: kvk.nl\n' +
    '• Belastingplan ' + jaar + ' (Prinsjesdag-stukken)\n\n' +
    'DISCLAIMER: Boekhoudbaar geeft informatieve berekeningen, signaleringen en schattingen. ' +
    'Boekhoudbaar is geen registeraccountant of belastingadviseur in de zin van Wet WFR / NBA-regelgeving. ' +
    'Raadpleeg bij twijfel of voor definitieve fiscale beslissingen een gekwalificeerde belastingadviseur, ' +
    'accountant of fiscaal jurist. Aansprakelijkheid is beperkt zoals beschreven in de gebruiksvoorwaarden.';
  sheet.getRange(rij, 1, 1, 3).merge()
    .setValue(bronnenTekst)
    .setBackground('#F7F9FC').setFontColor('#5F6B7A')
    .setFontSize(10).setWrap(true)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sheet.setRowHeight(rij, 180);

  ss.setActiveSheet(sheet);

  const ibPct1 = getBelasting_().IB_SCHIJF_1_PCT;
  const totaalBesparing = advies.aftrekken.reduce((s, a) => s + rondBedrag_(a.bedrag * ibPct1), 0);
  SpreadsheetApp.getUi().alert(
    'Fiscaal overzicht bijgewerkt',
    `${advies.adviezen.length + prive.length} signaleringen / ${advies.aftrekken.length} aftrekposten gevonden.\n\n` +
    `Geschatte belastingbesparing via zakelijke aftrekken: ${formatBedrag_(totaalBesparing)}\n\n` +
    `ℹ️ Informatief — geen formeel belastingadvies. Bron: Belastingdienst.nl. Zie voetnoot in tabblad voor details.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  AFSCHRIJVINGSKANDIDATEN SCAN
//  Zoekt inkoopfacturen ≥ €450 die NIET op een
//  activarekening (0xxx) zijn geboekt.
// ─────────────────────────────────────────────
function scanAfschrijvingskandidaten_(ss) {
  const sheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const kandidaten = [];
  // Boekjaar (niet kalenderjaar) — voorkomt dat investeringen in januari
  // van een afwijkend boekjaar buiten de scan vallen.
  const boekjaar = getBoekjaar_();
  const activeerGrens = getBelasting_().ACTIVEER_GRENS;

  data.slice(1).forEach(r => {
    const bedrag = parseFloat(r[8]) || 0;           // [8] = bedrag excl. BTW
    const kostenRek = String(r[15] || '');           // [15] = kostenrekening
    // parseDatum_ verwerkt DD-MM-YYYY, ISO én Date — voorkomt silent miss
    // bij locale-gestuurde datumstrings.
    const datum = r[3] instanceof Date ? r[3] : (parseDatum_(r[3]) || new Date(NaN));
    if (bedrag < activeerGrens) return;
    if (isNaN(datum.getTime()) || datum.getFullYear() < boekjaar) return;
    if (kostenRek.startsWith('0')) return;           // al geactiveerd
    kandidaten.push({
      bedrag,
      omschr:     String(r[7] || ''),
      leverancier: String(r[6] || ''),
      datum,
    });
  });
  return kandidaten;
}

// ─────────────────────────────────────────────
//  PROACTIEVE AFSCHRIJVINGSMELDING
//  Aanroepen vanuit Triggers.gs na elke
//  inkoopfactuur ≥ €450.
// ─────────────────────────────────────────────
function signaleerAfschrijvingskandidaat_(ss, bedrag, leverancier, omschr) {
  try {
    const grens = getBelasting_().ACTIVEER_GRENS;
    schrijfAuditLog_('AFSCHRIJVING KANDIDAAT',
      `Aankoop ${formatBedrag_(bedrag)} bij ${leverancier} – "${omschr}" kan worden geactiveerd (≥ €${grens}). ` +
      `Boek op 0xxx-rekening + jaarlijkse afschrijving voor KIA (28% extra aftrek).`);
  } catch (_e) {}
}

// ─────────────────────────────────────────────
//  V5 — PROACTIEVE KIA-MISSER DETECTIE
//  signaleerAfschrijvingskandidaat_ schrijft alleen audit-log dat de klant
//  zelden ziet. Deze functie aggregeert ALLE potentieel-gemiste investeringen
//  van het lopende jaar en mailt de klant met een geschatte gemiste KIA.
//  Klant mist anders €420-€20.072 KIA-aftrek (28%-zone) afhankelijk van
//  omvang investeringen. Dagelijks aangeroepen via dagelijkseTaken.
// ─────────────────────────────────────────────
function controleerKiaMisserProactief_() {
  let ss;
  try { ss = getSpreadsheet_(); } catch (_) { return; }
  if (!ss) return;
  const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
  if (!ifSheet || ifSheet.getLastRow() < 2) return;

  const B = getBelasting_();
  const grens  = B.ACTIVEER_GRENS || 450;
  const kiaMin = B.KIA_MIN || 2901;
  const huidigJaar = new Date().getFullYear();
  const data = ifSheet.getDataRange().getValues();

  let totaalPotMisser = 0;
  const kandidaten = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][3]) continue;
    const datum = parseDatum_(data[i][3]);  // [3] Factuurdatum
    if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== huidigJaar) continue;
    const status = String(data[i][12] || '');
    if (status === FACTUUR_STATUS.GECREDITEERD) continue;
    const bedragExcl = parseFloat(data[i][8]) || 0;
    if (bedragExcl < grens) continue;
    const kostenRek = String(data[i][15] || '').trim();
    // Skip als al op activa (0xxx) geboekt — dan is KIA al van toepassing
    if (!kostenRek || kostenRek.charAt(0) === '0') continue;
    totaalPotMisser += bedragExcl;
    kandidaten.push({
      datum:       Utilities.formatDate(datum, 'Europe/Amsterdam', 'yyyy-MM-dd'),
      leverancier: String(data[i][6] || ''),
      bedrag:      bedragExcl,
      rek:         kostenRek,
      omschr:      String(data[i][7] || ''),
    });
  }

  // Onder KIA-drempel = geen KIA mogelijk → geen mail
  if (totaalPotMisser < kiaMin) return;

  const kiaGeschat = (typeof berekenKiaAftrek_ === 'function')
    ? berekenKiaAftrek_(totaalPotMisser, B) : 0;
  if (kiaGeschat < 100) return;  // <€100 KIA-impact is geen mail waard

  // Idempotency per kwartaal — 90 dgn cooldown per kwartaal-bucket
  const kwartaal = Math.floor(new Date().getMonth() / 3) + 1;
  const idemKey  = 'KIA_MISSER_GEMELD_' + huidigJaar + '_Q' + kwartaal;
  const props    = PropertiesService.getScriptProperties();
  const eerderRaw = props.getProperty(idemKey);
  const nuMs     = Date.now();
  if (eerderRaw) {
    const eerder = parseInt(eerderRaw, 10);
    if (eerder && (nuMs - eerder) < 90 * 24 * 60 * 60 * 1000) return;
  }
  // Markeer VÓÓR mail — voorkomt mail-storm bij retry-loop
  try { props.setProperty(idemKey, String(nuMs)); } catch (_) {}

  try {
    schrijfAuditLog_('KIA MISSER kandidaten',
      kandidaten.length + ' uitgaven, totaal ' + formatBedrag_(totaalPotMisser) +
      ' → mogelijk gemist KIA ' + formatBedrag_(kiaGeschat));
  } catch (_) {}

  const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
  if (!ontvanger) return;

  const top10 = kandidaten.slice(0, 10).map(function(k) {
    const omschr = k.omschr.length > 50 ? k.omschr.slice(0, 50) + '…' : k.omschr;
    return '  • ' + k.datum + ' — ' + k.leverancier + ': ' + formatBedrag_(k.bedrag) +
           ' (rek ' + k.rek + ', "' + omschr + '")';
  }).join('\n');
  const meer = kandidaten.length > 10
    ? '\n  … en nog ' + (kandidaten.length - 10) + ' uitgave(n)'
    : '';

  const body =
    'Beste,\n\n' +
    'In je boekhouding zijn ' + kandidaten.length + ' uitgaven van €' + grens +
    ' of meer geboekt op een KOSTENREKENING. Voor aankopen die eigenlijk\n' +
    'INVESTERINGEN zijn (laptop, machine, meubilair, voertuig, server, etc.)\n' +
    'kan KIA-aftrek (28%) van toepassing zijn — door ze te activeren op een\n' +
    '02xx-rekening claim je tot ' + formatBedrag_(kiaGeschat) + ' extra aftrek.\n\n' +
    'Totaal mogelijk activeerbaar: ' + formatBedrag_(totaalPotMisser) + '\n' +
    'Geschat gemiste KIA-aftrek:   ' + formatBedrag_(kiaGeschat) + '\n\n' +
    'Top kandidaten:\n' + top10 + meer + '\n\n' +
    'Niet alle uitgaven zijn investeringen — controleer per regel. Een laptop\n' +
    'wel, een telefoonabonnement niet. Corrigeer in de Inkoopfacturen-tab vóór\n' +
    '31 december van dit jaar om KIA te claimen.\n\n' +
    'Boekhoudbaar';

  if (typeof stuurMailMetDlq_ === 'function') {
    stuurMailMetDlq_(ontvanger, '💰 KIA-aftrek mogelijk gemist (~€' + Math.round(kiaGeschat) + ')', body);
  }
}

// ─────────────────────────────────────────────
//  PRIVÉ BELASTINGVOORDELEN
// ─────────────────────────────────────────────
function berekenPriveBelastingvoordelen_(winst) {
  // Lees vers — zelfde reden als in berekenBelastingadvies_.
  const BELASTING = getBelasting_();
  const adviezen = [];
  const inkomen = winst || 0;

  // Lijfrente
  const premiegrondslag = Math.max(0, inkomen - BELASTING.AOW_FRANCHISE);
  const lijfrenteMax = Math.min(
    rondBedrag_(premiegrondslag * BELASTING.LIJFRENTE_PCT),
    BELASTING.LIJFRENTE_MAX
  );
  if (lijfrenteMax > 0) {
    adviezen.push({
      type: 'VOORDEEL',
      titel: `💼 Lijfrente: tot ${formatBedrag_(lijfrenteMax)} aftrekbaar`,
      tekst: `U kunt maximaal 30% van uw premiegrondslag (${formatBedrag_(premiegrondslag)}) inleggen in een ` +
             `lijfrente en dit aftrekken van uw IB: maximaal ${formatBedrag_(lijfrenteMax)} dit jaar. ` +
             `Sluit een bancaire lijfrente of lijfrenteverzekering af. Vervangt deels de FOR. ` +
             `Vraag uw bank of verzekeraar om de jaarnota voor uw aangifte.`,
      besparing: rondBedrag_(lijfrenteMax * marginaalIbTarief_(winst, BELASTING)),
    });
  }

  // Box 3 groensparen
  adviezen.push({
    type: 'VOORDEEL',
    titel: `🌿 Groensparen/groenbeleggen: tot ${formatBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING)} vrijgesteld in box 3`,
    tekst: `Groensparen en groenbeleggen zijn vrijgesteld van box 3 tot €${(BELASTING.BOX3_GROEN_VRIJSTELLING).toLocaleString('nl-NL')} ` +
           `per persoon (€${(BELASTING.BOX3_GROEN_VRIJSTELLING * 2).toLocaleString('nl-NL')} met fiscaal partner). ` +
           `Bovendien geeft het een heffingskorting van 0,7% over het vrijgestelde bedrag: ` +
           `max ${formatBedrag_(rondBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING * BELASTING.BOX3_GROEN_KORTING_PCT))} per persoon. ` +
           `Vraag uw bank naar een groenspaarrekening of -beleggingsfonds met CBF-keurmerk.`,
    besparing: rondBedrag_(BELASTING.BOX3_GROEN_VRIJSTELLING * BELASTING.BOX3_GROEN_KORTING_PCT),
  });

  // Giftenaftrek (ANBI)
  if (inkomen > 0) {
    const drempel = rondBedrag_(inkomen * BELASTING.GIFTEN_DREMPEL_PCT);
    const maxGift = rondBedrag_(inkomen * BELASTING.GIFTEN_MAX_PCT);
    adviezen.push({
      type: 'TIP',
      titel: `❤️ Giftenaftrek (ANBI): tot ${formatBedrag_(maxGift)} per jaar aftrekbaar`,
      tekst: `Giften aan goede doelen met ANBI-status zijn aftrekbaar voor het deel boven 1% van uw drempelinkomen ` +
             `(${formatBedrag_(drempel)}), tot maximaal 10% (${formatBedrag_(maxGift)}). ` +
             `Periodieke giften (minimaal 5 jaar, notarieel of schriftelijk vastgelegd) zijn VOLLEDIG aftrekbaar zonder drempel.`,
      besparing: null,
    });
  }

  // Eigen woning — tarief eerste schijf dynamisch uit BELASTING-config zodat
  // tekst auto-update bij Prinsjesdag. Geen aparte hypotheekrente-aftrek-grens
  // in config (= laagste schijf-tarief).
  const _eersteSchijfPct = (BELASTING.IB_SCHIJVEN && BELASTING.IB_SCHIJVEN[0])
    ? BELASTING.IB_SCHIJVEN[0].pct
    : (BELASTING.IB_SCHIJF_1_PCT || 0.357);
  const _eersteSchijfTekst = (_eersteSchijfPct * 100).toFixed(2).replace('.', ',') + '%';
  adviezen.push({
    type: 'TIP',
    titel: '🏠 Eigen woning – hypotheekrente aftrekbaar in box 1',
    tekst: `Hypotheekrente op uw eigen woning is aftrekbaar in box 1. Aftrek wordt beperkt tot het belastingtarief ` +
           `van de laagste schijf (${_eersteSchijfTekst} in ${BELASTING.TARIEFSJAAR}). Eigenwoningforfait (0,35% WOZ bij WOZ €75k–€1,2M) telt als ` +
           `fictief inkomen. Als u geen rente meer betaalt (annuïteit bijna klaar), overweeg dan de Hillen-aftrek. ` +
           `Houd uw jaaropgave hypotheekrente bij de hand voor de aangifte.`,
    besparing: null,
  });

  // Zonnepanelen / saldering
  adviezen.push({
    type: 'TIP',
    titel: '☀️ Zonnepanelen – belasting besparen én salderen (t/m 2027)',
    tekst: `Zonnepanelen op uw eigen woning zijn BTW-vrij (0% BTW bij aankoop, mits u terugleverd). ` +
           `Terugleversubsidie (saldering) loopt door t/m 2027, daarna afgebouwd. ` +
           `Zakelijk geplaatste zonnepanelen komen in aanmerking voor KIA (28%) en eventueel MIA (45,5%). ` +
           `Dien de BTW-melding in bij de Belastingdienst binnen 6 maanden na installatie.`,
    besparing: null,
  });

  return adviezen;
}

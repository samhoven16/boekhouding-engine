/**
 * BTW.gs
 * BTW administratie, aangifte berekening en KOR controle.
 * Gebaseerd op Nederlandse BTW wetgeving (Wet OB 1968).
 */

// ─────────────────────────────────────────────
//  BTW AANGIFTE GENEREREN (KWARTAAL)
// ─────────────────────────────────────────────
function genereerBtwAangifteQ1() { genereerBtwAangifte('Q1'); }
function genereerBtwAangifteQ2() { genereerBtwAangifte('Q2'); }
function genereerBtwAangifteQ3() { genereerBtwAangifte('Q3'); }
function genereerBtwAangifteQ4() { genereerBtwAangifte('Q4'); }

function genereerBtwAangifte(kwartaal) {
  if (!controleerSetupGedaan_()) return;
  // Kwartaal-validatie: voorkom dat 'Quarter 1' of 'q1' silently default naar Q1.
  const k = String(kwartaal || '').toUpperCase().trim();
  if (!/^Q[1-4]$/.test(k)) {
    SpreadsheetApp.getUi().alert(
      'Ongeldig kwartaal',
      `"${kwartaal}" is geen geldig kwartaal. Gebruik Q1, Q2, Q3 of Q4.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  kwartaal = k;
  const ss = getSpreadsheet_();
  const jaar = getBoekjaar_();
  const periode = bepaalBtwPeriode_(kwartaal, jaar);

  const aangifte = berekenBtwAangifte_(ss, periode.van, periode.tot);

  // Cycle 80: sanity-check vóór indiening. Vangt drie veelvoorkomende
  // klassen van fouten op:
  //   - Alle bedragen op nul → klant heeft een verkeerde periode gekozen
  //     of de boekingen vallen niet in dit kwartaal (sluitdatum mis)
  //   - Negatieve grondslag-bedragen → corrupte data (zonder creditnota)
  //   - >50% afwijking van vorig kwartaal → mogelijk dubbel-geboekte facturen
  //     of een vergeten maand
  // Geen blokker maar een verplichte expliciete bevestiging via UI-confirm,
  // zodat klant niet per ongeluk €0,- of een corrupt aangifte indient.
  const vorigeAangifte = _vorigeAangifteOphalen_(ss, kwartaal, jaar);
  const issues = valideerAangifteVoorIndiening_(aangifte, vorigeAangifte);
  if (issues.length > 0) {
    const ui = SpreadsheetApp.getUi();
    const respons = ui.alert(
      'Aangifte controleren — ' + issues.length + ' waarschuwing(en)',
      'Voor je de aangifte indient bij de Belastingdienst: controleer de ' +
      'onderstaande punten. Verkeerde aangifte = correctie + boete-risico.\n\n' +
      '• ' + issues.join('\n• ') + '\n\n' +
      'Doorgaan met deze aangifte?',
      ui.ButtonSet.YES_NO
    );
    if (respons !== ui.Button.YES) {
      try { schrijfAuditLog_('BTW aangifte geannuleerd (validatie)',
        kwartaal + ' ' + jaar + ' — ' + issues.length + ' issue(s)'); } catch (_) {}
      return;
    }
  }

  zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode);

  // Samenvatting in begrijpelijke taal (geen rubriekcodes)
  const saldoRegel = aangifte.saldo > 0.005
    ? `💸 U moet ${formatBedrag_(aangifte.saldo)} betalen aan de Belastingdienst.\n` +
      `   Deadline: ${bepaalBtwDeadline_(kwartaal, periode.van.getFullYear())}`
    : aangifte.saldo < -0.005
      ? `💰 U kunt ${formatBedrag_(Math.abs(aangifte.saldo))} terugvragen van de Belastingdienst.`
      : `✓ Saldo is nul — niets te betalen of terug te vragen.`;

  const heeftOmzet21 = aangifte.r1a_grondslag > 0;
  const heeftOmzet9  = aangifte.r1b_grondslag > 0;
  const heeftVrijgest = aangifte.r1d > 0;

  let omzetRegels = '';
  if (heeftOmzet21) omzetRegels += `Omzet 21% BTW:  ${formatBedrag_(aangifte.r1a_grondslag)} → BTW ${formatBedrag_(aangifte.r1a_btw)}\n`;
  if (heeftOmzet9)  omzetRegels += `Omzet 9% BTW:   ${formatBedrag_(aangifte.r1b_grondslag)} → BTW ${formatBedrag_(aangifte.r1b_btw)}\n`;
  if (heeftVrijgest) omzetRegels += `Vrijgestelde omzet: ${formatBedrag_(aangifte.r1d)} (geen BTW)\n`;

  SpreadsheetApp.getUi().alert(
    `BTW aangifte ${kwartaal} — ${formatDatum_(periode.van)} t/m ${formatDatum_(periode.tot)}`,
    `WAT U HEEFT VERKOCHT:\n${omzetRegels || '(geen omzet in deze periode)\n'}\n` +
    `BTW die u in rekening heeft gebracht: ${formatBedrag_(aangifte.r5a)}\n` +
    `BTW die u zelf heeft betaald (aftrekbaar): ${formatBedrag_(aangifte.r5b)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${saldoRegel}\n\n` +
    `Het overzicht staat klaar op het tabblad "BTW Aangifte".`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  BTW AANGIFTE BEREKENING (ALLE RUBRIEKEN)
// ─────────────────────────────────────────────
/**
 * V9-FIX: sheetData_ helper. Was eerder geneste functie binnen
 * berekenBtwAangifte_ (lokaal scope), maar twee andere functies in dit
 * bestand riepen 'm aan als globale — controleerKor (BTW.gs:556) en
 * getBtwPerMaand_ (BTW.gs:615-616) crashten met ReferenceError in
 * productie. Klant zag KOR-check niet werken + dashboard miste BTW-per-
 * maand-data. Nu top-level met 2-arg signature die alle callers verwachten.
 */
function sheetData_(ss, naam) {
  if (!ss || typeof ss.getSheetByName !== 'function') return [[]];
  const s = ss.getSheetByName(naam);
  return s ? s.getDataRange().getValues() : [[]];
}

// Audit ronde 2 (tax-compliance): EU BTW-nummer prefix-lijst voor
// ICP-aangifte (art. 37a Wet OB) — intracommunautaire leveringen aan
// EU-B2B-klanten met geldig BTW-nr. NL wordt geëxcludeerd (binnenlands).
// Bron: https://ec.europa.eu/taxation_customs/vies/
const _EU_LANDEN_BTW_PREFIX = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'EL',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'PL', 'PT', 'RO', 'SE',
  'SI', 'SK',
];

/**
 * Detecteert of een BTW-nummer EU-buiten-NL is (= ICP-relevant).
 * @param {string} btwNr — bijv. "DE123456789" of "FR12345678901"
 * @returns {boolean}
 */
function _isEuBuitenNlBtwNr_(btwNr) {
  const s = String(btwNr || '').replace(/\s/g, '').toUpperCase();
  if (s.length < 4) return false;
  const prefix = s.slice(0, 2);
  if (prefix === 'NL') return false;
  return _EU_LANDEN_BTW_PREFIX.indexOf(prefix) !== -1;
}

// TODO audit-ronde 2 (accountant + Belastingdienst): voor elk inkoopfactuur-
// rij dat r2/r5b voorbelasting bijdraagt, hoort een Drive-bijlage-link
// in dezelfde rij (kolom 'Bijlage' of 'PDF'). Bij steekproef-controle
// art. 15 Wet OB eist onderliggende bewijsstuk; rijen zonder bijlage
// kunnen voorbelasting verliezen. Vervolg-PR: berekenBtwAangifte_ moet
// rijen met lege bijlage-kolom in r2/r5b OF flaggen in audit-log OF
// uitsluiten van voorbelasting-totaal.
function berekenBtwAangifte_(ss, vanDatum, totDatum) {
  // Null-guard: sheet kan ontbreken bij gedeeltelijke setup of verwijderde tab.
  const vfData = sheetData_(ss, SHEETS.VERKOOPFACTUREN);
  const ifData = sheetData_(ss, SHEETS.INKOOPFACTUREN);

  // Rubrieken conform Aangifte Omzetbelasting (OB):
  // 1a: Leveringen/diensten belast 21%
  // 1b: Leveringen/diensten belast 9%
  // 1c: Leveringen/diensten belast overige tarieven
  // 1d: Leveringen belast 0% of vrijgesteld (omzet telt wel)
  // 1e: Omzet en BTW verlegd
  // 2a: Leveringen buiten EU (export)
  // 3a: Leveringen binnen EU (IC)
  // 4a: Inkopen met verlegd BTW
  // 5a: Subtotaal verschuldigde BTW
  // 5b: Voorbelasting (aftrekbare inkoop BTW)
  // 5c: Terug te vragen subtotaal
  // 5d: Saldo (te betalen of terug te vorderen)

  const aangifte = {
    r1a_grondslag: 0, r1a_btw: 0,   // 21%
    r1b_grondslag: 0, r1b_btw: 0,   // 9%
    r1c_grondslag: 0, r1c_btw: 0,   // Overige
    r1d: 0,                          // 0% / vrijgesteld
    r1e_grondslag: 0, r1e_btw: 0,   // Verlegd
    r2a: 0,                          // Export
    r3a_grondslag: 0, r3a_btw: 0,   // IC
    r4a_grondslag: 0, r4a_btw: 0,   // Inkoop verlegd
    r5a: 0,                          // Totaal verschuldigde BTW
    r5b: 0,                          // Voorbelasting
    r5c: 0,
    saldo: 0,
  };

  // ── Verkoopfacturen analyseren ─────────────
  // Onbekende BTW-labels worden geteld + gelogd zodat klant ziet welke
  // facturen (en €) niet in een rubriek vallen — voorkomt stille €0-bug
  // bij typo of nieuw label dat we niet kennen.
  const onbekendeLabels = {};
  let onbekendeOmzet = 0;
  for (let i = 1; i < vfData.length; i++) {
    // Skip lege rijen en rijen zonder datum eerst — voorheen gaf
    // parseDatum_(null) een Date(today) waardoor verwijderde rijen
    // onbedoeld in huidig kwartaal vielen.
    if (!vfData[i][2]) continue;
    const datum = parseDatum_(vfData[i][2]);
    if (!datum || isNaN(datum.getTime()) || datum < vanDatum || datum > totDatum) continue;

    // Skip GESTORNEERD facturen (criticus-rapport Accountant): bij storno
    // wordt status [14] = 'Gestorneerd' en BTW [11] = 0 gezet door
    // _markeerFactuurGestorneerd_. Skip hier expliciet zodat ook bij
    // legacy-rijen zonder bedragsupdate geen dubbeltelling optreedt.
    if (String(vfData[i][14] || '').toLowerCase() === 'gestorneerd') continue;

    // Skip GECREDITEERD facturen — de creditnota-rij (negatieve grondslag)
    // levert al de tegenboeking. Dubbele aftrek voorkomen bij periode-overschrijding.
    const status = String(vfData[i][14] || '');
    if (status === FACTUUR_STATUS.GECREDITEERD) continue;

    const grondslag = parseFloat(vfData[i][9]) || 0;  // Excl. BTW
    const btwBedrag = parseFloat(vfData[i][11]) || 0;
    const btwLabel  = String(vfData[i][10] || '');

    // Case-INsensitive tarief-detectie. Voorheen miste 'verlegd' (kleine v)
    // en 'VRIJGESTELD' de buckets → totaal verdween uit r5a.
    if (btwLabel.includes('21%') || /\bhoog\b/i.test(btwLabel)) {
      aangifte.r1a_grondslag += grondslag;
      aangifte.r1a_btw += btwBedrag;
    } else if (btwLabel.includes('9%') || /\blaag\b/i.test(btwLabel)) {
      aangifte.r1b_grondslag += grondslag;
      aangifte.r1b_btw += btwBedrag;
    } else if (/vrijgesteld/i.test(btwLabel)) {
      // Audit-vondst ronde 2 (tax-compliance): r1d combineert formeel beide
      // (Belastingdienst-rubriek 1d label "0% of vrijgesteld") MAAR voor de
      // pro-rata BTW-aftrek (art. 11 lid 2 Wet OB) telt alleen ECHT-VRIJGESTELD
      // als beperkende noemer. Nultarief-omzet is BELASTE omzet (recht op
      // aftrek). Voorheen: ZZP'er met €30k EU-export + €20k NL 21% kreeg
      // pro-rata 40% i.p.v. 100% → naheffing. Nu intern gesplitst, output
      // naar Belastingdienst-formulier blijft samengevoegd.
      aangifte.r1d += grondslag;
      aangifte.r1d_vrijgesteld = (aangifte.r1d_vrijgesteld || 0) + grondslag;
    } else if (btwLabel.includes('0%') || /nultarief/i.test(btwLabel)) {
      aangifte.r1d += grondslag;
      aangifte.r1d_nul = (aangifte.r1d_nul || 0) + grondslag;
      // Audit ronde 2 (tax-compliance): ICP-detect bij EU B2B-klanten.
      // Niet-NL EU BTW-nummer + nultarief = intracommunautaire levering
      // → r3a-rubriek + ICP-aangifte verplicht (art. 37a Wet OB).
      // Voorheen vergat klant ICP-aangifte = naheffing + boete.
      const btwNrKlant = String(vfData[i][7] || '');
      if (_isEuBuitenNlBtwNr_(btwNrKlant)) {
        aangifte.r3a_grondslag += grondslag;
        aangifte._icpVereist = aangifte._icpVereist || [];
        aangifte._icpVereist.push({
          factuurnummer: String(vfData[i][1] || ''),
          klantnaam: String(vfData[i][5] || ''),
          btwNr: btwNrKlant,
          grondslag: grondslag,
        });
      }
    } else if (/verlegd/i.test(btwLabel)) {
      aangifte.r1e_grondslag += grondslag;
      aangifte.r1e_btw += btwBedrag;
    } else if (grondslag !== 0) {
      // Onbekend label én niet-nul grondslag → kritieke detectie
      onbekendeLabels[btwLabel || '(leeg)'] = (onbekendeLabels[btwLabel || '(leeg)'] || 0) + 1;
      onbekendeOmzet += grondslag;
    }
  }

  // Onbekende labels altijd loggen — klant moet WETEN dat ze ontbreken
  if (onbekendeOmzet !== 0) {
    aangifte._onbekendeLabels = onbekendeLabels;
    aangifte._onbekendeOmzet = rondBedrag_(onbekendeOmzet);
    try {
      schrijfAuditLog_('BTW-aangifte ONBEKENDE LABELS',
        'r5a mist mogelijk € ' + rondBedrag_(onbekendeOmzet) + ' — labels: ' +
        Object.keys(onbekendeLabels).join(', '));
    } catch (_) {}
  }

  // ── Inkoopfacturen – voorbelasting ─────────
  for (let i = 1; i < ifData.length; i++) {
    if (!ifData[i][3]) continue;
    const datum = parseDatum_(ifData[i][3]);
    if (!datum || isNaN(datum.getTime()) || datum < vanDatum || datum > totDatum) continue;

    // Skip GESTORNEERD inkoopfacturen (criticus-rapport Accountant): bij
    // storno via maakStornoJournaalpost_ wordt status [12] = 'Gestorneerd'
    // en BTW [10] = 0. Tweede gate hier voor legacy-rijen.
    if (String(ifData[i][12] || '').toLowerCase() === 'gestorneerd') continue;

    const btwBedrag = parseFloat(ifData[i][10]) || 0;
    const btwLabel  = String(ifData[i][9] || '');

    if (btwLabel.includes('Verlegd')) {
      const grondslag = parseFloat(ifData[i][8]) || 0;
      aangifte.r4a_grondslag += grondslag;
      aangifte.r4a_btw += btwBedrag;
    } else if (btwBedrag > 0) {
      aangifte.r5b += btwBedrag;  // Aftrekbare voorbelasting
    }
  }

  // ── Bereken totalen ─────────────────────────
  aangifte.r5a = rondBedrag_(
    aangifte.r1a_btw + aangifte.r1b_btw + aangifte.r1c_btw +
    aangifte.r1e_btw + aangifte.r4a_btw
  );

  // P5/P10-FIX (Belastingdienst stress-test): Pro-rata BTW-aftrek bij gemengde
  // omzet (Wet OB art. 11 + art. 15 lid 1). Wanneer een klant BÁDE belaste én
  // vrijgestelde omzet heeft (bv. dokter met side-consulting, sportschool met
  // horeca, verhuurder met woningen+kantoren), mag de voorbelasting (rubriek 5b)
  // NIET volledig worden afgetrokken — alleen het deel dat toerekenbaar is aan
  // de BTW-belaste output. Te veel aftrekken = naheffing + boete 5-25%.
  //
  // Formule (algemene methode, art. 11 Uitv.besch.):
  //   pro_rata = belaste_omzet / (belaste_omzet + vrijgestelde_omzet)
  //   aftrekbaar = voorbelasting_origineel × pro_rata
  //
  // Verlegd (r1e) telt als BELAST (alleen heffing verschoven naar afnemer).
  // Export (2a) en EU 0% (1c als 0%) tellen ook als belast.
  const r5bOrigineel = rondBedrag_(aangifte.r5b);
  // Audit-vondst ronde 2: nultarief (export buiten EU) is BELASTE omzet
  // met recht op aftrek. Was ten onrechte als "vrijgesteld" in noemer.
  // Plus: r2a (export buiten EU) en r3a (IC-levering) zijn ook belast.
  const belasteOmzet = (aangifte.r1a_grondslag || 0)
    + (aangifte.r1b_grondslag || 0)
    + (aangifte.r1c_grondslag || 0)
    + (aangifte.r1e_grondslag || 0)
    + (aangifte.r1d_nul || 0)
    + (aangifte.r2a || 0);
  // NB: r3a_grondslag (IC-leveringen) NIET optellen — die euro's zitten al
  // in r1d_nul (zelfde factuur, zie 0%-tak hierboven); meetellen = dubbele
  // telling in de pro-rata-breuk → te hoge voorbelasting-aftrek.
  // Alleen écht vrijgesteld (NIET nultarief) telt in noemer als beperkend.
  const vrijgesteldeOmzet = aangifte.r1d_vrijgesteld || 0;
  const totaalOmzet = belasteOmzet + vrijgesteldeOmzet;

  if (vrijgesteldeOmzet > 0 && belasteOmzet > 0 && totaalOmzet > 0) {
    const proRata = belasteOmzet / totaalOmzet;
    const aftrekbaar = rondBedrag_(r5bOrigineel * proRata);
    const nietAftrekbaar = rondBedrag_(r5bOrigineel - aftrekbaar);
    aangifte.r5b = aftrekbaar;
    aangifte._proRataToegepast = true;
    aangifte._proRataRatio = Math.round(proRata * 10000) / 100;  // % met 2 decimalen
    aangifte._voorbelastingOrigineel = r5bOrigineel;
    aangifte._voorbelastingNietAftrekbaar = nietAftrekbaar;
    try {
      schrijfAuditLog_('Pro-rata BTW-aftrek toegepast',
        'belast €' + rondBedrag_(belasteOmzet) + ' / vrijgesteld €' +
        rondBedrag_(vrijgesteldeOmzet) + ' → ratio ' + aangifte._proRataRatio +
        '% — niet-aftrekbaar €' + nietAftrekbaar);
    } catch (_) {}
  } else {
    aangifte.r5b = r5bOrigineel;
  }

  aangifte.r5c = rondBedrag_(Math.max(0, aangifte.r5b - aangifte.r5a));
  aangifte.saldo = rondBedrag_(aangifte.r5a - aangifte.r5b);
  // Rubriek 5d = 5a − 5b (zelfde waarde als saldo). De I₅-verifier
  // (FormeelBewijs.gs) en de EWMA-anomaliedetectie lezen r5d; zonder dit
  // veld rapporteren zij bij elk saldo ≠ 0 een valse invariant-schending.
  aangifte.r5d = aangifte.saldo;

  // Afronden alle bedragen — skip metadata-keys (beginnen met _)
  // anders wordt _onbekendeLabels-object met rondBedrag_ tot 0 vermalen.
  Object.keys(aangifte).forEach(k => {
    if (k.charAt(0) === '_') return;
    aangifte[k] = rondBedrag_(aangifte[k]);
  });

  // Self-check invariants — run after computation, voor het returned wordt.
  // Wiskundige consistentie-controles. Bij afwijking → audit-log + waarschuwing
  // op aangifte-object zodat de UI 'm kan tonen. Geen auto-fix — alleen detectie.
  try {
    const issues = valideerBtwInvariants_(aangifte);
    if (issues.length > 0) {
      aangifte._invariantIssues = issues;
      const codeStr = issues.map(function(i){return i.code;}).join(', ');
      schrijfAuditLog_('BTW invariants WAARSCHUWING', issues.length + ' afwijking(en): ' + codeStr);
      // Telemetry naar server zodat ik kan zien als meerdere klanten dezelfde
      // bug krijgen (= productie-issue, geen gebruikersfout).
      try { if (typeof rapporteerAnomalie_ === 'function') rapporteerAnomalie_('btw_invariant_' + issues[0].code, codeStr); } catch (_) {}
    }
  } catch (e) { Logger.log('BTW-invariants check: ' + e.message); }

  return aangifte;
}

/**
 * Wiskundige invariants op berekende BTW-aangifte.
 * Faalt het systeem ergens? Dan zien we het hier — niet bij de Belastingdienst.
 * Tolerantie €0,02 voor rounding (GAS rondAfBredrag_ kan 1ct afwijking geven).
 */
function valideerBtwInvariants_(a) {
  const issues = [];
  const TOL = 0.02;
  function near(x, y) { return Math.abs((x || 0) - (y || 0)) <= TOL; }

  // 1. r1a_btw moet ongeveer r1a_grondslag * 0.21 zijn
  if (a.r1a_grondslag > 0) {
    const verwacht = rondBedrag_(a.r1a_grondslag * 0.21);
    if (!near(a.r1a_btw, verwacht)) {
      issues.push({ code: 'BTW-21-MISMATCH', tekst: '21%-rubriek BTW (' + a.r1a_btw + ') wijkt af van grondslag×21% (' + verwacht + ')' });
    }
  }

  // 2. r1b_btw moet ongeveer r1b_grondslag * 0.09 zijn
  if (a.r1b_grondslag > 0) {
    const verwacht = rondBedrag_(a.r1b_grondslag * 0.09);
    if (!near(a.r1b_btw, verwacht)) {
      issues.push({ code: 'BTW-9-MISMATCH', tekst: '9%-rubriek BTW (' + a.r1b_btw + ') wijkt af van grondslag×9% (' + verwacht + ')' });
    }
  }

  // 3. r5a (totaal verschuldigd) = som van rubrieken
  // (r3a is een 0%-grondslag-rubriek zonder verschuldigde BTW en hoort
  // niet in deze som — conform axioma I₅ en berekenBtwAangifte_.)
  const verschuldigdSom = rondBedrag_(
    (a.r1a_btw || 0) + (a.r1b_btw || 0) + (a.r1c_btw || 0) +
    (a.r1e_btw || 0) + (a.r4a_btw || 0)
  );
  if (!near(a.r5a, verschuldigdSom)) {
    issues.push({ code: 'BTW-R5A-SOM', tekst: 'Totaal verschuldigd (r5a=' + a.r5a + ') wijkt af van som rubrieken (' + verschuldigdSom + ')' });
  }

  // 4. saldo = r5a - r5b (verschuldigd minus voorbelasting)
  const saldoVerwacht = rondBedrag_((a.r5a || 0) - (a.r5b || 0));
  if (!near(a.saldo, saldoVerwacht)) {
    issues.push({ code: 'BTW-SALDO', tekst: 'Saldo (' + a.saldo + ') wijkt af van r5a−r5b (' + saldoVerwacht + ')' });
  }

  // 5. Geen NaN of oneindigheid
  ['r1a_btw','r1b_btw','r5a','r5b','saldo'].forEach(function(k) {
    const v = a[k];
    if (v !== undefined && (!isFinite(v) || isNaN(v))) {
      issues.push({ code: 'BTW-NAN', tekst: 'Ongeldige waarde voor ' + k + ': ' + v });
    }
  });

  // 6. Negatieve grondslagen zijn verdacht (creditnota → wel mogelijk maar log)
  if (a.r1a_grondslag < 0 || a.r1b_grondslag < 0) {
    issues.push({
      code: 'BTW-NEG-GRONDSLAG',
      tekst: 'Negatieve grondslag(en) — vaak door correctiefactuur; controleer dat dit klopt',
    });
  }

  return issues;
}

// ─────────────────────────────────────────────
//  PRE-SUBMISSION VALIDATIE (Cycle 80)
// ─────────────────────────────────────────────
/**
 * Sanity-check op een berekende aangifte vóór indiening bij de Belastingdienst.
 *
 * Vangt drie veelvoorkomende fout-patronen op:
 *   - Alle bedragen op nul (verkeerde periode of boekingen mis)
 *   - Negatieve grondslag-bedragen zonder creditnota (data-corruptie)
 *   - >50% afwijking van vorig kwartaal (mogelijk dubbel-geboekte facturen
 *     of een vergeten maand)
 *
 * Pure functie zonder side-effects — input → array van strings. Lege array =
 * geen issues. De aanroeper besluit zelf wat te doen (confirm-dialog,
 * blokkeren, audit-log).
 *
 * @param {Object} aangifte        Resultaat van berekenBtwAangifte_
 * @param {Object} [vorigeAangifte] Optioneel: vorig kwartaal voor afwijking-check
 * @returns {string[]} Lijst van menselijk-leesbare waarschuwingen
 */
function valideerAangifteVoorIndiening_(aangifte, vorigeAangifte) {
  const issues = [];
  if (!aangifte) return ['Geen aangifte-data beschikbaar.'];

  // 1. Alle bedragen nul → klant heeft waarschijnlijk verkeerde periode
  const totaal = Math.abs(aangifte.r1a_grondslag || 0) +
                 Math.abs(aangifte.r1b_grondslag || 0) +
                 Math.abs(aangifte.r1c_grondslag || 0) +
                 Math.abs(aangifte.r1d || 0) +
                 Math.abs(aangifte.r1e_grondslag || 0) +
                 Math.abs(aangifte.r5a || 0) +
                 Math.abs(aangifte.r5b || 0);
  if (totaal < 0.005) {
    issues.push('Alle bedragen zijn €0 — controleer of je de juiste periode hebt ' +
      'gekozen en of de boekingen in deze periode vallen.');
  }

  // 2. Negatieve grondslag-bedragen zonder verwachte tegenboeking
  // Verkoop-grondslagen horen positief te zijn (creditnota's verlagen de totaal,
  // niet één rij). Als de SOM negatief is, is er iets mis met de data.
  const negVelden = [
    ['r1a_grondslag', 'Omzet 21%'],
    ['r1b_grondslag', 'Omzet 9%'],
    ['r1d',           'Omzet 0%/vrijgesteld'],
  ];
  negVelden.forEach(function(pair) {
    const v = aangifte[pair[0]];
    if (typeof v === 'number' && v < -0.005) {
      issues.push('"' + pair[1] + '" is negatief (' + v.toFixed(2) +
        '). Vaak een teken van een ontbrekende of dubbele creditnota.');
    }
  });

  // 3. >50% afwijking van vorig kwartaal (alleen als er een vorige is met data)
  if (vorigeAangifte && (vorigeAangifte.r5a > 0 || vorigeAangifte.r5b > 0)) {
    const huidigSaldoAbs  = Math.abs(aangifte.saldo || 0);
    const vorigSaldoAbs   = Math.abs(vorigeAangifte.saldo || 0);
    if (vorigSaldoAbs > 50 && huidigSaldoAbs > 50) {
      const afwijking = Math.abs(huidigSaldoAbs - vorigSaldoAbs) / vorigSaldoAbs;
      if (afwijking > 0.5) {
        issues.push('Saldo wijkt ' + Math.round(afwijking * 100) + '% af van vorig kwartaal ' +
          '(€' + huidigSaldoAbs.toFixed(2) + ' vs €' + vorigSaldoAbs.toFixed(2) +
          '). Controleer of er geen facturen dubbel of een maand vergeten zijn.');
      }
    }
  }

  return issues;
}

/**
 * Probeert de aangifte van het vorige kwartaal op te halen uit het BTW
 * Aangifte-tabblad. Faalt stil (return null) als er geen snapshot is —
 * de validator gebruikt 'm alleen voor de afwijking-check.
 */
function _vorigeAangifteOphalen_(ss, huidigKwartaal, huidigJaar) {
  try {
    const map = { Q1: { k: 'Q4', j: huidigJaar - 1 },
                  Q2: { k: 'Q1', j: huidigJaar },
                  Q3: { k: 'Q2', j: huidigJaar },
                  Q4: { k: 'Q3', j: huidigJaar } };
    const vorig = map[huidigKwartaal];
    if (!vorig) return null;
    const periode = bepaalBtwPeriode_(vorig.k, vorig.j);
    return berekenBtwAangifte_(ss, periode.van, periode.tot);
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
//  BTW AANGIFTE OP SHEET ZETTEN
// ─────────────────────────────────────────────
function zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode) {
  const sheet = ss.getSheetByName(SHEETS.BTW_AANGIFTE);
  sheet.clearContents();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const btwNr = getInstelling_('BTW-nummer') || '';
  const jaar = periode.van.getFullYear();

  // ── Koptekst ───────────────────────────────
  sheet.getRange(1, 1, 1, 4).merge()
    .setValue('AANGIFTE OMZETBELASTING')
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 4).merge()
    .setValue(`${bedrijf}  |  BTW-nr: ${btwNr}  |  Periode: ${kwartaal} ${jaar}  |  ${formatDatum_(periode.van)} t/m ${formatDatum_(periode.tot)}`)
    .setBackground(KLEUREN.SUBHEADER_BG).setFontColor('#FFFFFF').setFontSize(11).setHorizontalAlignment('center');

  const rijen = [
    ['', '', '', ''],
    ['RUBRIEK', 'OMSCHRIJVING', 'GRONDSLAG', 'BTW BEDRAG'],
    ['', '', '', ''],
    ['SECTIE A – PRESTATIES BINNENLAND', '', '', ''],
    ['1a', 'Leveringen/diensten belast met hoog tarief 21%', aangifte.r1a_grondslag, aangifte.r1a_btw],
    ['1b', 'Leveringen/diensten belast met laag tarief 9%', aangifte.r1b_grondslag, aangifte.r1b_btw],
    ['1c', 'Leveringen/diensten belast met overige tarieven', aangifte.r1c_grondslag, aangifte.r1c_btw],
    ['1d', 'Leveringen/diensten belast met 0% of vrijgesteld', aangifte.r1d, 0],
    ['1e', 'Omzet waarbij BTW is verlegd naar de afnemer', aangifte.r1e_grondslag, aangifte.r1e_btw],
    ['', '', '', ''],
    ['SECTIE B – PRESTATIES BUITEN NEDERLAND', '', '', ''],
    ['2a', 'Leveringen buiten de EU (export)', aangifte.r2a, 0],
    ['3a', 'Leveringen binnen de EU (ICL)', aangifte.r3a_grondslag, aangifte.r3a_btw],
    ['', '', '', ''],
    ['SECTIE C – VOORBELASTING EN SALDO', '', '', ''],
    ['4a', 'Inkopen waarbij BTW verlegd is', aangifte.r4a_grondslag, aangifte.r4a_btw],
    ['', '', '', ''],
    ['5a', 'Subtotaal verschuldigde BTW (= som 1a t/m 4a)', '', aangifte.r5a],
    ['5b', 'Voorbelasting: aftrekbare inkoop-BTW', '', aangifte.r5b],
    ['5c', 'Terug te vragen (alleen als 5b > 5a)', '', aangifte.r5c],
    ['', '', '', ''],
    ['SALDO', aangifte.saldo >= 0 ? 'TE BETALEN aan Belastingdienst' : 'TERUG TE VORDEREN', '', Math.abs(aangifte.saldo)],
    ['', '', '', ''],
    ['Deadline', bepaalBtwDeadline_(kwartaal, jaar), '', ''],
    ['Status', 'Concept (nog niet ingediend)', '', ''],
  ];

  const startRij = 3;
  sheet.getRange(startRij, 1, rijen.length, 4).setValues(rijen);

  // Opmaak sectietitels (indices 3=SECTIE A, 10=SECTIE B, 14=SECTIE C)
  [3, 10, 14].forEach(offset => {
    sheet.getRange(startRij + offset, 1, 1, 4)
      .setBackground(KLEUREN.SECTIE_BG)
      .setFontWeight('bold');
  });

  // Opmaak headers
  sheet.getRange(startRij + 1, 1, 1, 4)
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  // Opmaak saldo rij (index 21 = rijen.length - 4)
  const saldoRij = startRij + rijen.length - 4;
  sheet.getRange(saldoRij, 1, 1, 4)
    .setBackground(aangifte.saldo >= 0 ? '#FFCDD2' : '#C8E6C9')
    .setFontWeight('bold').setFontSize(12);

  // Nummers opmaken
  sheet.getRange(startRij + 3, 3, rijen.length - 3, 2).setNumberFormat('€#,##0.00');

  // Kolombreedte
  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 350);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
  sheet.setFrozenRows(4);

  // Journaalpost voor BTW afdracht aanmaken (als saldo te betalen)
  if (aangifte.saldo > 0) {
    Logger.log(`BTW aangifte ${kwartaal} ${jaar}: te betalen ${aangifte.saldo}`);
  }

  ss.setActiveSheet(sheet);
}

// ─────────────────────────────────────────────
//  BTW PERIODE SLUITEN (JOURNAALPOST)
// ─────────────────────────────────────────────
function sluitBtwPeriode() {
  const ui = SpreadsheetApp.getUi();
  const kwartaalResp = ui.prompt(
    'BTW periode sluiten',
    'Welk kwartaal sluit u? (Q1, Q2, Q3 of Q4):',
    ui.ButtonSet.OK_CANCEL
  );
  if (kwartaalResp.getSelectedButton() !== ui.Button.OK) return;

  const kwartaal = kwartaalResp.getResponseText().toUpperCase().trim();
  // Strikte validatie — voorkomt dat 'q1', 'Quarter 1' of typo silently Q1 sluit.
  if (!/^Q[1-4]$/.test(kwartaal)) {
    ui.alert(
      'Ongeldig kwartaal',
      `"${kwartaalResp.getResponseText()}" is geen geldig kwartaal. Gebruik Q1, Q2, Q3 of Q4.`,
      ui.ButtonSet.OK
    );
    return;
  }
  const ss = getSpreadsheet_();
  const jaar = getBoekjaar_();
  const periode = bepaalBtwPeriode_(kwartaal, jaar);
  const aangifte = berekenBtwAangifte_(ss, periode.van, periode.tot);
  const datum = new Date();

  // BTW rekeningen salderen naar "te betalen BTW"
  if (aangifte.r1a_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW afdracht ${kwartaal} ${jaar} – 21%`,
      dagboek: 'Memoriaal',
      debet: '4110', credit: '4100',
      bedrag: aangifte.r1a_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  if (aangifte.r1b_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW afdracht ${kwartaal} ${jaar} – 9%`,
      dagboek: 'Memoriaal',
      debet: '4120', credit: '4100',
      bedrag: aangifte.r1b_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  // Overige tarieven (rubriek 1c) — bv. 5,5% of historisch tarief.
  // Geen overboeking nodig: bepaalBtwVerkoopRekening_() boekt deze BTW
  // al direct op 4100 (BTW te betalen) bij de oorspronkelijke factuur,
  // omdat er geen rate-specifieke rekening voor overige tarieven bestaat.
  // (Voorheen stond hier debet=credit=4100 wat een self-posting-error gaf
  // zodra een klant überhaupt omzet met overig tarief had.)

  // Verlegde BTW (rubriek 1e) — afnemer draagt af; voor administratie boeken
  // wij dit verplaatst naar 4100 zodat aangifte-totaal klopt.
  if (aangifte.r1e_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW afdracht ${kwartaal} ${jaar} – verlegd`,
      dagboek: 'Memoriaal',
      debet: '4130', credit: '4100',
      bedrag: aangifte.r1e_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  // Inkoop verlegd (rubriek 4a) — heffing verschuldigd door koper
  if (aangifte.r4a_btw > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW verlegd inkoop ${kwartaal} ${jaar}`,
      dagboek: 'Memoriaal',
      debet: '4100', credit: '4140',
      bedrag: aangifte.r4a_btw,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  if (aangifte.r5b > 0) {
    maakJournaalpost_(ss, {
      datum,
      omschr: `BTW voorbelasting verrekening ${kwartaal} ${jaar}`,
      dagboek: 'Memoriaal',
      debet: '4100', credit: '1400',
      bedrag: aangifte.r5b,
      ref: `BTW-${kwartaal}-${jaar}`,
      type: BOEKING_TYPE.MEMORIAAL,
    });
  }

  // Vergrendel de periode automatisch na afsluiten
  vergrendelPeriode_(periode.van, periode.tot, `BTW ${kwartaal} ${jaar}`);

  // V3-FIX (suppletie): leg snapshot vast van wat NU is aangegeven, zodat
  // detecteerSuppletieMogelijk_ over weken/maanden kan vergelijken met de
  // dan-actuele boekstand. Zonder dit blijft BTW_SNAPSHOTS leeg en is de
  // suppletie-detector dood (alles "geen suppletie nodig", ook bij €5.000
  // retroactieve correctie → klant dient niet in → naheffing + 30% boete
  // bij latere Belastingdienst-ontdekking).
  try {
    const props = PropertiesService.getScriptProperties();
    let snaps;
    try { snaps = JSON.parse(props.getProperty('BTW_SNAPSHOTS') || '{}'); }
    catch (_) { snaps = {}; }
    snaps[jaar + '_' + kwartaal] = {
      saldo:    aangifte.saldo,
      r1a_btw:  aangifte.r1a_btw  || 0,
      r1b_btw:  aangifte.r1b_btw  || 0,
      r1c_btw:  aangifte.r1c_btw  || 0,
      r1e_btw:  aangifte.r1e_btw  || 0,
      r4a_btw:  aangifte.r4a_btw  || 0,
      r5a:      aangifte.r5a      || 0,
      r5b:      aangifte.r5b      || 0,
      vastgelegdOp: new Date().toISOString(),
    };
    props.setProperty('BTW_SNAPSHOTS', JSON.stringify(snaps));
    try { schrijfAuditLog_('BTW snapshot vastgelegd',
      kwartaal + ' ' + jaar + ' — saldo ' + formatBedrag_(aangifte.saldo)); } catch (_) {}
  } catch (snapErr) {
    // Niet-kritiek: snapshot mist is een gemis aan suppletie-detectie,
    // niet aan de aangifte zelf. Logger + audit zodat we het wel weten.
    Logger.log('BTW snapshot fout (niet-kritiek): ' + snapErr.message);
    try { schrijfAuditLog_('BTW snapshot MISLUKT',
      kwartaal + ' ' + jaar + ' — ' + snapErr.message); } catch (_) {}
  }

  const actie = aangifte.saldo >= 0
    ? `Te betalen: ${formatBedrag_(aangifte.saldo)}\nDeadline: ${bepaalBtwDeadline_(kwartaal, jaar)}\n\nMaak de betaling over aan de Belastingdienst vóór de deadline.`
    : `Terug te vorderen: ${formatBedrag_(Math.abs(aangifte.saldo))}\nDien uw aangifte in om dit terug te krijgen.`;

  ui.alert(
    `BTW-periode ${kwartaal} afgesloten`,
    `De BTW-administratie is bijgewerkt.\n\n${actie}\n\n🔒 De periode is vergrendeld — nieuwe boekingen in deze periode zijn niet meer mogelijk.`,
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  KOR REGELING CONTROLE
// ─────────────────────────────────────────────
function controleerKor() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const jaar = getBoekjaar_();
  const periode = { van: new Date(jaar, 0, 1), tot: new Date(jaar, 11, 31, 23, 59, 59, 999) };

  const vfData = sheetData_(ss, SHEETS.VERKOOPFACTUREN);
  let totaalOmzet = 0;

  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? parseDatum_(vfData[i][2]) : null;
    if (!datum || isNaN(datum.getTime()) || datum < periode.van || datum > periode.tot) continue;
    // Skip vrijgestelde leveringen — KOR-grens telt alleen belaste omzet
    // (incl. nultarief en verlegd) per art. 25 Wet OB 1968.
    const btwLabel = String(vfData[i][10] || '');
    if (/Vrijgesteld/i.test(btwLabel)) continue;
    // Skip gecrediteerde origineel — creditnota-rij compenseert al.
    const status = String(vfData[i][14] || '');
    if (status === FACTUUR_STATUS.GECREDITEERD) continue;
    totaalOmzet += parseFloat(vfData[i][9]) || 0;  // Excl. BTW
  }

  const korGrens = 20000;
  // CYCLE-56: isJa_ helper (consistent met andere paden)
  const korActief = (typeof isJa_ === 'function')
    ? isJa_(getInstelling_('KOR regeling actief'))
    : false;

  const pct = totaalOmzet > 0 ? Math.round((totaalOmzet / korGrens) * 100) : 0;
  const resterende = Math.max(0, korGrens - totaalOmzet);

  let bericht = `KOR-check ${jaar}  (Kleineondernemersregeling)\n\n`;
  bericht += `Uw omzet dit jaar: ${formatBedrag_(totaalOmzet)}  (${pct}% van de grens)\n`;
  bericht += `KOR-grens:         ${formatBedrag_(korGrens)}\n\n`;

  if (totaalOmzet < korGrens) {
    bericht += `✅ U zit ONDER de grens — nog ${formatBedrag_(resterende)} ruimte.\n\n`;
    if (korActief) {
      bericht += 'KOR is ingeschakeld: u rekent geen BTW aan uw klanten.\nU hoeft geen BTW-aangifte te doen.';
    } else {
      bericht += 'KOR is NIET ingeschakeld.\n\nWat is het voordeel?\nAls u KOR aanvraagt bij de Belastingdienst hoeft u geen BTW te berekenen.\nDit scheelt administratie. Vraag het aan via belastingdienst.nl (zoek op "KOR aanmelden").';
    }
  } else {
    bericht += `⚠️  U zit BOVEN de grens van €20.000.\n\n`;
    if (korActief) {
      bericht += '❗ KOR is nog ingeschakeld maar u overschrijdt de grens!\nMeld u NU af voor de KOR via belastingdienst.nl.\nU moet BTW berekenen vanaf het moment dat u de grens overschreed.';
    } else {
      bericht += '✓ KOR is terecht niet ingeschakeld.\nU verwerkt BTW correct in uw facturen.';
    }
  }

  SpreadsheetApp.getUi().alert('KOR — Kleineondernemersregeling', bericht, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  BTW PER MAAND OVERZICHT
// ─────────────────────────────────────────────
function getBtwPerMaand_(ss, jaar) {
  const resultaat = Array.from({ length: 12 }, (_, i) => ({
    maand: i + 1,
    omzetHoog: 0, btwHoog: 0,
    omzetLaag: 0, btwLaag: 0,
    voorbelasting: 0,
    saldo: 0,
  }));

  const vfData = sheetData_(ss, SHEETS.VERKOOPFACTUREN);
  const ifData = sheetData_(ss, SHEETS.INKOOPFACTUREN);

  for (let i = 1; i < vfData.length; i++) {
    const datum = vfData[i][2] ? parseDatum_(vfData[i][2]) : null;
    if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== jaar) continue;
    // Skip GECREDITEERD originelen — creditnota-rij levert tegenboeking.
    const status = String(vfData[i][14] || '');
    if (status === FACTUUR_STATUS.GECREDITEERD) continue;

    const m = datum.getMonth();
    const grondslag = parseFloat(vfData[i][9]) || 0;
    const btwBedrag = parseFloat(vfData[i][11]) || 0;
    const btwLabel = String(vfData[i][10] || '');

    // Strikte detectie — '21' substring zou '212' of '21.5%' fout matchen
    if (btwLabel.includes('21%') || /\bhoog\b/i.test(btwLabel)) {
      resultaat[m].omzetHoog += grondslag;
      resultaat[m].btwHoog += btwBedrag;
    } else if (btwLabel.includes('9%') || /\blaag\b/i.test(btwLabel)) {
      resultaat[m].omzetLaag += grondslag;
      resultaat[m].btwLaag += btwBedrag;
    }
  }

  for (let i = 1; i < ifData.length; i++) {
    const datum = ifData[i][3] ? parseDatum_(ifData[i][3]) : null;
    if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== jaar) continue;
    const m = datum.getMonth();
    const btwBedrag = parseFloat(ifData[i][10]) || 0;
    if (btwBedrag > 0) resultaat[m].voorbelasting += btwBedrag;
  }

  resultaat.forEach(r => {
    r.saldo = rondBedrag_(r.btwHoog + r.btwLaag - r.voorbelasting);
    r.omzetHoog = rondBedrag_(r.omzetHoog);
    r.btwHoog = rondBedrag_(r.btwHoog);
    r.omzetLaag = rondBedrag_(r.omzetLaag);
    r.btwLaag = rondBedrag_(r.btwLaag);
    r.voorbelasting = rondBedrag_(r.voorbelasting);
  });

  return resultaat;
}

// ─────────────────────────────────────────────
//  HELPERS BTW
// ─────────────────────────────────────────────
function parseBtwTarief_(label) {
  if (!label) return null;
  const l = String(label).toLowerCase();
  // Strikte percent-detectie — voorkomt dat '21' substring een hypothetisch
  // toekomstig tarief als '212' of '21,5%' fout zou matchen.
  if (l.includes('21%') || l.includes('hoog')) return 0.21;
  if (l.includes('9%')  || l.includes('laag')) return 0.09;
  if (l.includes('0%')  || l.includes('nultarief')) return 0.00;
  if (l.includes('vrijgesteld') || l.includes('verlegd') || l.includes('geen btw')) return null;
  return 0.21;
}

function bepaalBtwPeriode_(kwartaal, jaar) {
  // tot-datum is end-of-day (23:59:59.999) zodat boekingen op de laatste dag
  // van het kwartaal mét tijdcomponent (>00:00) niet ten onrechte buiten vallen.
  const periodes = {
    'Q1': { van: new Date(jaar, 0, 1),  tot: new Date(jaar, 2, 31, 23, 59, 59, 999) },
    'Q2': { van: new Date(jaar, 3, 1),  tot: new Date(jaar, 5, 30, 23, 59, 59, 999) },
    'Q3': { van: new Date(jaar, 6, 1),  tot: new Date(jaar, 8, 30, 23, 59, 59, 999) },
    'Q4': { van: new Date(jaar, 9, 1),  tot: new Date(jaar, 11, 31, 23, 59, 59, 999) },
  };
  return periodes[kwartaal] || periodes['Q1'];
}

function bepaalBtwDeadline_(kwartaal, jaar) {
  const deadlines = {
    'Q1': new Date(jaar, 3, 30),     // 30 april
    'Q2': new Date(jaar, 6, 31),     // 31 juli
    'Q3': new Date(jaar, 9, 31),     // 31 oktober
    'Q4': new Date(jaar + 1, 0, 31), // 31 januari volgend jaar
  };
  // Belastingdienst verschuift deadline naar volgende werkdag bij weekend.
  return formatDatum_(volgendeWerkdag_(deadlines[kwartaal] || deadlines['Q1']));
}

/**
 * Verplaats datum naar volgende werkdag (ma-vr) bij weekend.
 * Houdt geen rekening met Nederlandse feestdagen — alleen weekenden.
 */
function volgendeWerkdag_(datum) {
  const d = new Date(datum.getTime());
  const dag = d.getDay(); // 0=zo, 6=za
  if (dag === 6) d.setDate(d.getDate() + 2);      // za → ma
  else if (dag === 0) d.setDate(d.getDate() + 1); // zo → ma
  return d;
}

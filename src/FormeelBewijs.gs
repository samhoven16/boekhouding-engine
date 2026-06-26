/**
 * FormeelBewijs.gs
 * ════════════════════════════════════════════════════════════════
 * Wiskundige Axiomatische Fundering voor Boekhoudbaar
 * ════════════════════════════════════════════════════════════════
 *
 * Filosofie: een boekhoudprogramma is een formeel systeem F = (Σ, A, ⊢)
 * waarbij:
 *   Σ = alfabet (rekeningen, factuurnrs, BTW-tarieven, bedragen ∈ ℚ)
 *   A = axioma's (de wetten van dubbel boekhouden + NL fiscale regels)
 *   ⊢ = afleidingsregels (journaalpost-creatie, BTW-berekening, …)
 *
 * Een correct programma is correct iff alle invarianten in A gelden op
 * elke staat S ∈ State. Deze module verifieert die invarianten tegen
 * de LIVE administratie (niet alleen unit-tests).
 *
 * ────────────────────────────────────────────────────────────────
 * DE AXIOMATISCHE FUNDERING (10 invarianten)
 * ────────────────────────────────────────────────────────────────
 *
 * I₁  ALGEBRA — DEBIT/CREDIT BALANS
 *     ∀ journaalpost J:  J.debet_bedrag = J.credit_bedrag
 *     (gevolg: ΣJ.debet = ΣJ.credit over alle journaalposten)
 *
 * I₂  ALGEBRA — GROOTBOEKSALDO CONSISTENT
 *     ∀ rekening R:  saldo(R) = Σ {J.bedrag | J ∈ JPs, J raakt R aan debet-zijde}
 *                              - Σ {J.bedrag | J ∈ JPs, J raakt R aan credit-zijde}
 *     (anders: GROOTBOEKSCHEMA-saldo en journaalpost-totaal divergeren)
 *
 * I₃  ALGEBRA — BALANS-WET
 *     Σ {R.saldo | R.type = Activa} = Σ {R.saldo | R.type = Passiva}
 *     Tolerantie: ε = 0.005 (jaarrekening) of 0.05 (lopend)
 *
 * I₄  ALGEBRA — FACTUUR-DECOMPOSITIE
 *     ∀ factuur F:  F.bedragIncl = F.bedragExcl + F.btwBedrag  (±€0,01 afronding)
 *     F.btwBedrag = F.bedragExcl × F.btwTarief  (waar btwTarief ∈ {0, 0.09, 0.21})
 *
 * I₅  ALGEBRA — BTW-AANGIFTE SLUITEND
 *     A.r5a = A.r1a_btw + A.r1b_btw + A.r1c_btw + A.r1e_btw + A.r4a_btw
 *     A.r5d = A.r5a - A.r5b
 *     (afgerond op €1 conform Belastingdienst)
 *
 * I₆  GETALTHEORIE — FACTUURNUMMER-UNICITEIT
 *     ∀ F₁, F₂ ∈ Verkoopfacturen:  F₁ ≠ F₂ ⟹ F₁.nr ≠ F₂.nr
 *     (verboden door art. 35 Wet OB; dubbele nr = naheffing-risico)
 *
 * I₇  GETALTHEORIE — FACTUURNUMMER MONOTONIE
 *     ∀ F₁, F₂ met F₁.datum ≤ F₂.datum:  F₁.nr ≤ F₂.nr
 *     Uitzondering: jaarwisseling reset (telleratie per boekjaar)
 *
 * I₈  VERZAMELINGSLEER — AFGESLOTEN PERIODE IMMUTABILITY
 *     Zij P = afgesloten periode. ∀ J nieuwe journaalpost:
 *       J.datum ∈ P ⟹ verwerping (zie maakJournaalpost_ guard)
 *
 * I₉  DISCRETE WISKUNDE — REKENINGSCHEMA DAG-EIGENSCHAP
 *     Het Grootboekschema vormt een rooted forest van rekeningen waar
 *     leaf-rekeningen de enige zijn waarop geboekt mag worden
 *     (parent-rekeningen zijn aggregaten — boekingen daar = invariant-breuk).
 *
 * I₁₀ BAYES — BTW-ANOMALIE-DETECTIE
 *     Zij μ = EWMA van laatste 4 kwartalen r5d. Bij |huidig - μ| > 2σ:
 *     verhoogde waarschijnlijkheid van invoerfout. Waarschuw vóór indiening.
 *
 * ────────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────────
 *   const rapport = bewijsAlleInvarianten_(ss);
 *   if (rapport.alleGoed) console.log('✓ Boekhouding wiskundig consistent.');
 *   else rapport.schendingen.forEach(s => console.log('✗', s.code, s.boodschap));
 *
 * Aanroepen vanuit: GezondheidCheck (dagelijks), pre-jaarafsluiting,
 * pre-BTW-aangifte indienen, pre-accountant-export.
 */

// eslint-disable-next-line no-unused-vars
const FORMEEL_BEWIJS_INVARIANTEN = [
  { code: 'I1', naam: 'Debit/Credit Balans per journaalpost', soort: 'Algebra' },
  { code: 'I2', naam: 'Grootboeksaldo consistent met journaalposten', soort: 'Algebra' },
  { code: 'I3', naam: 'Balans-wet (Activa = Passiva)', soort: 'Algebra' },
  { code: 'I4', naam: 'Factuur-decompositie (excl + btw = incl)', soort: 'Algebra' },
  { code: 'I5', naam: 'BTW-aangifte sluitend (r5d = r5a - r5b)', soort: 'Algebra' },
  { code: 'I6', naam: 'Factuurnummer-uniciteit', soort: 'Getaltheorie' },
  { code: 'I7', naam: 'Factuurnummer-monotonie', soort: 'Getaltheorie' },
  { code: 'I8', naam: 'Afgesloten periode immutability', soort: 'Verzamelingsleer' },
  { code: 'I9', naam: 'Rekeningschema leaf-only-boekingen', soort: 'Discrete wiskunde' },
  { code: 'I10', naam: 'BTW-anomalie binnen 2σ', soort: 'Bayes' },
];

/**
 * Hoofd-runner: verifieert alle 10 invarianten tegen de live administratie.
 * Returns rapport-object met per invariant: status, bewijs/tegenvoorbeeld.
 *
 * @param {Spreadsheet} ss
 * @returns {{alleGoed: boolean, schendingen: Array, gecheckt: number}}
 */
function bewijsAlleInvarianten_(ss) {
  if (!ss) ss = getSpreadsheet_();
  if (!ss) return { alleGoed: false, schendingen: [{ code: 'INIT', boodschap: 'Spreadsheet niet beschikbaar' }], gecheckt: 0 };

  const schendingen = [];
  const checkers = [
    _bewijs_I1_debitCreditBalans_,
    _bewijs_I2_grootboekConsistent_,
    _bewijs_I3_balansWet_,
    _bewijs_I4_factuurDecompositie_,
    _bewijs_I5_btwAangifteSluitend_,
    _bewijs_I6_factuurnummerUniek_,
    _bewijs_I7_factuurnummerMonotoon_,
    _bewijs_I8_afgeslotenPeriode_,
    _bewijs_I9_leafOnlyBoekingen_,
    _bewijs_I10_btwAnomalie_,
  ];

  checkers.forEach(function(checker) {
    try {
      const resultaat = checker(ss);
      if (resultaat && !resultaat.geldig) {
        schendingen.push({
          code: resultaat.code,
          naam: resultaat.naam,
          boodschap: resultaat.boodschap,
          tegenvoorbeeld: resultaat.tegenvoorbeeld || null,
          soort: resultaat.soort,
        });
      }
    } catch (e) {
      schendingen.push({
        code: '?', naam: 'Checker-fout', boodschap: e.message,
      });
    }
  });

  try {
    safeAuditLog_('FormeelBewijs',
      schendingen.length === 0
        ? 'Alle ' + checkers.length + ' invarianten OK'
        : schendingen.length + '/' + checkers.length + ' invarianten geschonden');
  } catch (_) {}

  return {
    alleGoed: schendingen.length === 0,
    schendingen: schendingen,
    gecheckt: checkers.length,
  };
}

// ─────────────────────────────────────────────────────────────
// I₁ — DEBIT/CREDIT BALANS
// ─────────────────────────────────────────────────────────────
function _bewijs_I1_debitCreditBalans_(ss) {
  const meta = { code: 'I1', naam: 'Debit/Credit Balans', soort: 'Algebra' };
  const jp = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!jp || jp.getLastRow() <= 1) return Object.assign(meta, { geldig: true });

  // Datamodel: elk journaalpost-record heeft ÉÉN debet-rekening [4], ÉÉN credit-
  // rekening [6] en ÉÉN bedrag [8] — maakJournaalpost_ schrijft beide benen plus
  // een gevalideerd eindig, positief bedrag. De intra-record balans (debet =
  // credit) geldt dus structureel ZOLANG beide benen bestaan en het bedrag een
  // eindig getal is. I₁ verifieert precies dat: een record met een lege debet-
  // óf credit-rekening is een "eenbenige" boeking (geld uit/naar het niets →
  // debet ≠ credit), en een niet-numeriek/NaN/Infinity bedrag is corrupt.
  //
  // VALS-GROEN-FIX: voorheen telde de code hetzelfde `bedrag` op bij zowel
  // totaalDebet als totaalCredit (totaalDebet += bedrag; totaalCredit += bedrag)
  // → ΣDebet ≡ ΣCredit, een tautologie die ALTIJD slaagde en dus niets bewees.
  // Dezelfde klasse als de I₃-fix F-ACC-001 ("waardoor I₃ ALTIJD slaagde").
  const data = jp.getDataRange().getValues();
  let aantalSchendingen = 0;
  const voorbeelden = [];
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][KOL.JP.status] || '').toUpperCase();
    if (status === 'CORRUPT' || status === 'GESTORNEERD') continue;
    const debet  = String(data[i][KOL.JP.debetRekening]  || '').trim();
    const credit = String(data[i][KOL.JP.creditRekening] || '').trim();
    const ruwBedrag = data[i][KOL.JP.bedrag];
    const bedrag = parseFloat(ruwBedrag);
    if (!debet || !credit || !isFinite(bedrag)) {
      aantalSchendingen++;
      if (voorbeelden.length < 5) {
        voorbeelden.push({ rij: i + 1, debet: debet, credit: credit, bedrag: ruwBedrag });
      }
    }
  }
  if (aantalSchendingen > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: aantalSchendingen + ' journaalpost(en) zonder geldige debet+credit-rekening of eindig ' +
        'bedrag (eenbenige of corrupte boeking → debet ≠ credit)',
      tegenvoorbeeld: voorbeelden,
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₂ — GROOTBOEKSALDO CONSISTENT
// ─────────────────────────────────────────────────────────────
function _bewijs_I2_grootboekConsistent_(ss, opt) {
  const meta = { code: 'I2', naam: 'Grootboeksaldo consistent', soort: 'Algebra' };
  opt = opt || {};
  const gb = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  const jp = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!gb || !jp) return Object.assign(meta, { geldig: true });

  // Bouw verwacht-saldo per rekening uit journaalposten
  const verwacht = {};
  const jpData = jp.getDataRange().getValues();
  for (let i = 1; i < jpData.length; i++) {
    const status = String(jpData[i][KOL.JP.status] || '').toUpperCase();
    if (status === 'CORRUPT' || status === 'GESTORNEERD') continue;
    // Issue #123 batch 3: opt-in strikte modus telt alléén COMMITTED
    // rijen mee. Bij default (legacy) werkt het bewijs zoals voorheen —
    // Concept-boekingen tellen mee omdat ze het grootboek óók al raakten.
    if (opt.alleenCommitted &&
        typeof _journaalpostIsCommitted_ === 'function' &&
        !_journaalpostIsCommitted_(jpData[i])) continue;
    const debet = String(jpData[i][KOL.JP.debetRekening] || '');
    const credit = String(jpData[i][KOL.JP.creditRekening] || '');
    const bedrag = parseFloat(jpData[i][KOL.JP.bedrag]) || 0;
    if (debet) verwacht[debet] = (verwacht[debet] || 0) + bedrag;
    if (credit) verwacht[credit] = (verwacht[credit] || 0) - bedrag;
  }

  // Vergelijk met grootboeksaldi (gemaximaliseerd op 5 grootste afwijkingen)
  const gbData = gb.getDataRange().getValues();
  const drift = [];
  for (let i = 1; i < gbData.length; i++) {
    const code = String(gbData[i][KOL.GB.code] || '').trim();
    if (!code) continue;
    const saldoGB = parseFloat(gbData[i][KOL.GB.saldo]) || 0;
    const saldoVerwacht = verwacht[code] || 0;
    const verschil = Math.abs(saldoGB - saldoVerwacht);
    if (verschil > 0.005) {
      drift.push({ rek: code, gb: saldoGB, verwacht: saldoVerwacht, δ: verschil });
    }
  }
  if (drift.length > 0) {
    drift.sort(function(a, b) { return b.δ - a.δ; });
    return Object.assign(meta, {
      geldig: false,
      boodschap: drift.length + ' rekening(en) divergeren tussen Grootboekschema en Journaalposten',
      tegenvoorbeeld: drift.slice(0, 5),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₃ — BALANS-WET (Activa = Passiva)
// ─────────────────────────────────────────────────────────────
function _bewijs_I3_balansWet_(ss) {
  const meta = { code: 'I3', naam: 'Balans-wet (Activa = Passiva)', soort: 'Algebra' };
  const gb = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
  if (!gb) return Object.assign(meta, { geldig: true });
  const data = gb.getDataRange().getValues();
  let activa = 0, passiva = 0;
  for (let i = 1; i < data.length; i++) {
    // FIX F-ACC-001: balans-side zit in kolom [2] (type = Actief/Passief),
    // NIET in kolom [4] (bw = Balans/W&V). De oude code vergeleek [4] met
    // 'Activa'/'Passiva' — waarden die nergens bestaan — waardoor I₃ ALTIJD
    // slaagde (vals-groen). Spiegelt nu controleerBalans_ (GezondheidCheck.gs).
    const type = String(data[i][KOL.GB.type] || '');
    const bw = String(data[i][KOL.GB.balansWenv] || '');
    const saldo = parseFloat(data[i][KOL.GB.saldo]) || 0;
    if (bw !== 'Balans') continue;            // alleen balansrekeningen
    if (type === 'Actief') activa += saldo;
    if (type === 'Passief') passiva += saldo; // Eigen vermogen heeft ook type 'Passief'
  }
  const verschil = Math.abs(activa - passiva);
  if (verschil > 0.05) {  // soepele drempel: I₃-strikt zit in controleerBalansStrikt_
    return Object.assign(meta, {
      geldig: false,
      boodschap: 'Activa (€' + activa.toFixed(2) + ') ≠ Passiva (€' + passiva.toFixed(2) + '), δ=€' + verschil.toFixed(4),
      tegenvoorbeeld: { activa: activa, passiva: passiva, verschil: verschil },
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₄ — FACTUUR-DECOMPOSITIE
// ─────────────────────────────────────────────────────────────
function _bewijs_I4_factuurDecompositie_(ss) {
  const meta = { code: 'I4', naam: 'Factuur-decompositie (excl + btw = incl)', soort: 'Algebra' };
  const vf = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vf) return Object.assign(meta, { geldig: true });
  const data = vf.getDataRange().getValues();
  const fout = [];
  // Kolommen: [1] nr, [9] excl, [11] btw, [12] incl, [14] status
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][KOL.VF.status] || '').toLowerCase();
    if (status === 'gestorneerd' || status === 'gecrediteerd') continue;
    const excl = parseFloat(data[i][KOL.VF.bedragExcl]) || 0;
    const btw = parseFloat(data[i][KOL.VF.btwBedrag]) || 0;
    const incl = parseFloat(data[i][KOL.VF.bedragIncl]) || 0;
    if (excl === 0 && btw === 0 && incl === 0) continue;
    const verwacht = excl + btw;
    if (Math.abs(verwacht - incl) > 0.01) {
      fout.push({ nr: data[i][KOL.VF.factuurnummer], excl: excl, btw: btw, incl: incl, verwacht: verwacht });
    }
  }
  if (fout.length > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: fout.length + ' factuur(/en) met decompositie-fout',
      tegenvoorbeeld: fout.slice(0, 3),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₅ — BTW-AANGIFTE SLUITEND
// ─────────────────────────────────────────────────────────────
function _bewijs_I5_btwAangifteSluitend_(ss) {
  const meta = { code: 'I5', naam: 'BTW-aangifte sluitend', soort: 'Algebra' };
  // Verifieer op huidig kwartaal als BTW.gs aanroepbaar is
  if (typeof berekenBtwAangifte_ !== 'function') return Object.assign(meta, { geldig: true });
  try {
    const nu = new Date();
    const q = Math.floor(nu.getMonth() / 3);
    const van = new Date(nu.getFullYear(), q * 3, 1);
    const tot = new Date(nu.getFullYear(), (q + 1) * 3, 0, 23, 59, 59);
    const a = berekenBtwAangifte_(ss, van, tot);
    if (!a) return Object.assign(meta, { geldig: true });
    const r5aBerekend = (a.r1a_btw || 0) + (a.r1b_btw || 0) + (a.r1c_btw || 0) + (a.r1e_btw || 0) + (a.r4a_btw || 0);
    if (Math.abs((a.r5a || 0) - r5aBerekend) > 0.01) {
      return Object.assign(meta, {
        geldig: false,
        boodschap: 'r5a (€' + a.r5a + ') ≠ Σ(r1a+r1b+r1c+r1e+r4a) (€' + r5aBerekend.toFixed(2) + ')',
        tegenvoorbeeld: { r5a: a.r5a, berekend: r5aBerekend },
      });
    }
    const r5dBerekend = (a.r5a || 0) - (a.r5b || 0);
    if (Math.abs((a.r5d || 0) - r5dBerekend) > 0.01) {
      return Object.assign(meta, {
        geldig: false,
        boodschap: 'r5d (€' + a.r5d + ') ≠ r5a - r5b (€' + r5dBerekend.toFixed(2) + ')',
        tegenvoorbeeld: { r5d: a.r5d, berekend: r5dBerekend },
      });
    }
  } catch (e) {
    return Object.assign(meta, { geldig: false, boodschap: 'BTW-berekening faalde: ' + e.message });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₆ — FACTUURNUMMER-UNICITEIT
// ─────────────────────────────────────────────────────────────
function _bewijs_I6_factuurnummerUniek_(ss) {
  const meta = { code: 'I6', naam: 'Factuurnummer-uniciteit', soort: 'Getaltheorie' };
  const vf = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vf) return Object.assign(meta, { geldig: true });
  const data = vf.getDataRange().getValues();
  const gezien = {};
  const dubbel = [];
  for (let i = 1; i < data.length; i++) {
    const nr = String(data[i][KOL.VF.factuurnummer] || '').trim();
    if (!nr) continue;
    if (gezien[nr]) dubbel.push({ nr: nr, rijen: [gezien[nr], i + 1] });
    else gezien[nr] = i + 1;
  }
  if (dubbel.length > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: 'Dubbele factuurnummers: ' + dubbel.length + ' (art. 35 Wet OB schending → naheffing-risico)',
      tegenvoorbeeld: dubbel.slice(0, 5),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₇ — FACTUURNUMMER-MONOTONIE
// ─────────────────────────────────────────────────────────────
function _bewijs_I7_factuurnummerMonotoon_(ss) {
  const meta = { code: 'I7', naam: 'Factuurnummer-monotonie binnen boekjaar', soort: 'Getaltheorie' };
  const vf = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vf) return Object.assign(meta, { geldig: true });
  const data = vf.getDataRange().getValues();

  // Groepeer per boekjaar (jaar uit datum [2]), check binnen-jaar monotonie
  const perJaar = {};
  for (let i = 1; i < data.length; i++) {
    const nrStr = String(data[i][KOL.VF.factuurnummer] || '').trim();
    const datum = data[i][KOL.VF.datum];
    if (!nrStr || !(datum instanceof Date)) continue;
    // Extraheer numeriek deel (laatste serie cijfers)
    const m = nrStr.match(/(\d+)\s*$/);
    if (!m) continue;
    const nrNum = parseInt(m[1], 10);
    const jaar = datum.getFullYear();
    if (!perJaar[jaar]) perJaar[jaar] = [];
    perJaar[jaar].push({ nr: nrNum, datum: datum.getTime(), str: nrStr });
  }

  const breuk = [];
  Object.keys(perJaar).forEach(function(j) {
    const lijst = perJaar[j];
    lijst.sort(function(a, b) { return a.datum - b.datum; });
    for (let i = 1; i < lijst.length; i++) {
      if (lijst[i].nr < lijst[i - 1].nr) {
        breuk.push({ jaar: j, eerder: lijst[i - 1].str, later: lijst[i].str });
      }
    }
  });
  // TODO audit-ronde 2 (accountant + Belastingdienst): I₇ blokkeert nu
  // niet in de factuur-creatie-flow — alleen post-hoc detectie. Bij
  // controleur-vraag "waarom factuur 045 vóór 044 in tijd?" leunt
  // verdediging op de klant's begrip van het axioma. Overweeg in
  // vervolg-PR een pre-write check in Verkoopfacturen.gs die backdated
  // factuur-rijen weigert (of expliciet motiveren vereist, zoals
  // beheerGeslotenPeriodes nu doet).
  if (breuk.length > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: breuk.length + ' chronologische monotonie-breuk(en) (waarschuwing, geen blokkering)',
      tegenvoorbeeld: breuk.slice(0, 3),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₈ — AFGESLOTEN PERIODE IMMUTABILITY
// ─────────────────────────────────────────────────────────────
function _bewijs_I8_afgeslotenPeriode_(ss) {
  const meta = { code: 'I8', naam: 'Afgesloten periode immutability', soort: 'Verzamelingsleer' };
  // I₈ wordt afgedwongen in maakJournaalpost_ (Boekingen.gs:36+). De
  // bewijs-runner controleert post-hoc: zijn er journaalposten met
  // datum in een gesloten periode? Zo ja, axiom-schending.
  if (typeof _leesGeslotenPeriodes_ !== 'function') return Object.assign(meta, { geldig: true });
  const periodes = _leesGeslotenPeriodes_();
  if (!periodes || periodes.length === 0) return Object.assign(meta, { geldig: true });

  const jp = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!jp) return Object.assign(meta, { geldig: true });
  const data = jp.getDataRange().getValues();
  const inbreuk = [];
  for (let i = 1; i < data.length; i++) {
    const datum = data[i][KOL.JP.datum];
    if (!(datum instanceof Date)) continue;
    for (let p = 0; p < periodes.length; p++) {
      const van = new Date(periodes[p].van);
      const tot = new Date(periodes[p].tot);
      if (datum >= van && datum <= tot) {
        const aangemaakt = data[i][KOL.JP.aangemaaktOp];  // kolom: aangemaakt op
        if (aangemaakt instanceof Date && periodes[p].geslotenOp) {
          // Inbreuk als aangemaakt NA periode-sluiting (achteraf geboekt).
          const gesloten = new Date(periodes[p].geslotenOp);
          if (aangemaakt > gesloten) {
            inbreuk.push({ jpId: data[i][KOL.JP.boekingId], datum: datum, periode: periodes[p].label, reden: 'aangemaakt na sluiting' });
          }
        } else {
          // VALS-GROEN-FIX (A-339): voorheen werd een rij in een gesloten periode
          // ZÓNDER aanmaak-timestamp (of zonder sluitdatum) stil overgeslagen → I8
          // slaagde dan vals-groen. Maar maakJournaalpost_ zet die timestamp ALTIJD,
          // dus een rij eronder kwam buiten de guard om (handmatige sheet-edit /
          // import) — precies de meest waarschijnlijke immutability-bypass. We kunnen
          // niet bewijzen dat-ie vóór sluiting is gemaakt → tel als inbreuk i.p.v.
          // stil 'geldig' claimen. (Zelfde klasse als de I1/I3-vals-groen-fixes.)
          inbreuk.push({ jpId: data[i][KOL.JP.boekingId], datum: datum, periode: periodes[p].label,
            reden: (aangemaakt instanceof Date) ? 'periode-sluitdatum onbekend' : 'geen aanmaak-timestamp (mogelijk handmatig/geïmporteerd)' });
        }
        break;
      }
    }
  }
  if (inbreuk.length > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: inbreuk.length + ' journaalpost(en) achteraf in afgesloten periode geboekt',
      tegenvoorbeeld: inbreuk.slice(0, 3),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₉ — LEAF-ONLY BOEKINGEN (Discrete wiskunde / Grafentheorie)
// ─────────────────────────────────────────────────────────────
function _bewijs_I9_leafOnlyBoekingen_(ss) {
  const meta = { code: 'I9', naam: 'Boekingen alleen op leaf-rekeningen', soort: 'Discrete wiskunde' };
  // I₉ wordt afgedwongen door valideerJournaalpostBalans_ (Invariants.gs): die
  // THROWT op de pure categorie-headers (0100/0200/0300) bij het boeken, zodat
  // ze nooit in de sheet belanden. Deze post-hoc verificatie bevestigt dat en
  // gebruikt EXACT dezelfde lijst als de validator (single source of truth).
  //
  // F-ACC-330: de vorige numerieke heuristiek ("eindigt op 000" ⇒ parent van
  // álles met hetzelfde eerste cijfer) was fout in twee richtingen:
  //   • vals-POSITIEF: ze vlagde 4000 (Crediteuren — een leaf die op élke
  //     inkoopfactuur geboekt wordt) als parent van 4100/4110 → I₉ vals-rood op
  //     een volkomen correcte administratie.
  //   • vals-NEGATIEF: de échte headers 0100/0200/0300 eindigen NIET op '000'
  //     en werden dus juist gemist.
  // 1400/4100 zijn bewust postbaar (ambigue parents → alleen audit-warning in de
  // validator, niet geblokkeerd) en zijn daarom géén I₉-schending.
  const jp = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
  if (!jp) return Object.assign(meta, { geldig: true });

  // Mirror van valideerJournaalpostBalans_.purePArents (Invariants.gs:144).
  const pureParents = ['0100', '0200', '0300'];
  const jpData = jp.getDataRange().getValues();
  const fout = [];
  for (let i = 1; i < jpData.length; i++) {
    const debet = String(jpData[i][KOL.JP.debetRekening] || '').trim();
    const credit = String(jpData[i][KOL.JP.creditRekening] || '').trim();
    if (pureParents.indexOf(debet) !== -1) fout.push({ jp: jpData[i][KOL.JP.boekingId], rek: debet, zijde: 'debet' });
    if (pureParents.indexOf(credit) !== -1) fout.push({ jp: jpData[i][KOL.JP.boekingId], rek: credit, zijde: 'credit' });
  }
  if (fout.length > 0) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: fout.length + ' boeking(en) op een niet-postbare categorie-header (0100/0200/0300)',
      tegenvoorbeeld: fout.slice(0, 3),
    });
  }
  return Object.assign(meta, { geldig: true });
}

// ─────────────────────────────────────────────────────────────
// I₁₀ — BAYESIAANSE BTW-ANOMALIE
// ─────────────────────────────────────────────────────────────
function _bewijs_I10_btwAnomalie_(ss) {
  const meta = { code: 'I10', naam: 'BTW-aangifte binnen 2σ van EWMA', soort: 'Bayes' };
  // Pak laatste 5 kwartalen, vergelijk huidig (=5e) met EWMA van eerste 4.
  if (typeof berekenBtwAangifte_ !== 'function') return Object.assign(meta, { geldig: true });

  const kwartaalR5d = [];
  const nu = new Date();
  for (let k = 4; k >= 0; k--) {
    const refDatum = new Date(nu.getFullYear(), nu.getMonth() - k * 3, 15);
    const q = Math.floor(refDatum.getMonth() / 3);
    const van = new Date(refDatum.getFullYear(), q * 3, 1);
    const tot = new Date(refDatum.getFullYear(), (q + 1) * 3, 0, 23, 59, 59);
    try {
      const a = berekenBtwAangifte_(ss, van, tot);
      kwartaalR5d.push(a && a.r5d ? parseFloat(a.r5d) : 0);
    } catch (_) {
      kwartaalR5d.push(0);
    }
  }
  if (kwartaalR5d.length < 5) return Object.assign(meta, { geldig: true });

  // EWMA met α=0.5 (recent zwaarder gewicht maar geen overfit)
  const historie = kwartaalR5d.slice(0, 4);
  const huidig = kwartaalR5d[4];
  const μ = historie.reduce(function(s, x, i) {
    const w = Math.pow(0.5, historie.length - 1 - i);
    return s + x * w;
  }, 0) / historie.reduce(function(s, _, i) { return s + Math.pow(0.5, historie.length - 1 - i); }, 0);
  // Sample-standaarddeviatie
  const σ2 = historie.reduce(function(s, x) { return s + Math.pow(x - μ, 2); }, 0) / Math.max(1, historie.length - 1);
  const σ = Math.sqrt(σ2);
  // Als σ ≈ 0 (alle historie gelijk), val terug op 10%-tolerantie van μ
  const tolerantie = σ > 1 ? 2 * σ : Math.max(0.1 * Math.abs(μ), 100);

  if (Math.abs(huidig - μ) > tolerantie) {
    return Object.assign(meta, {
      geldig: false,
      boodschap: 'Huidig kwartaal r5d (€' + huidig.toFixed(0) + ') wijkt > 2σ af van historische EWMA (€' + μ.toFixed(0) + '); controleer vóór indiening',
      tegenvoorbeeld: { huidig: huidig, μ: μ, σ: σ, afwijking: Math.abs(huidig - μ) },
    });
  }
  return Object.assign(meta, { geldig: true });
}

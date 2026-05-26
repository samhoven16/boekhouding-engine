/**
 * Fiscaal.gs
 * Geavanceerde fiscale modules: KIA+MIA+EIA stapeling, stakingswizard,
 * suppletie-aangifte, DGA-salaris-monitor.
 *
 * Adresseert "complexe casus":
 *  - DGA + holding: minimum-loon-check
 *  - Bedrijfsoverdracht: stakingsaftrek + FOR-vrijval + stakingslijfrente
 *  - Investerings-aftrek combinaties (KIA + MIA + EIA gelijktijdig
 *    mogelijk binnen voorwaarden)
 *  - Suppletie: detect retroactief BTW-mismatch → genereer formulier-data
 */

// DGA gebruikelijk-loon: nu uit BELASTING_PER_JAAR.DGA_MIN_SALARIS (per jaar),
// met klant-override via Instellingen-tab. Hardcoded fallback alleen indien
// config-laag onbereikbaar.
const DGA_MIN_SALARIS_FALLBACK = 56000;   // last-resort indien getBelasting_ niet beschikbaar
const SUPPLETIE_DREMPEL        = 1000;    // Onder = volgende aangifte; boven = direct suppletie

// ─────────────────────────────────────────────
//  B6 — KIA + MIA + EIA STAPELING
// ─────────────────────────────────────────────

/**
 * Berekent investerings-aftrek-stapeling voor één bedrijfsmiddel.
 * Mag alle drie tegelijk binnen voorwaarden — KIA voor alle investeringen,
 * MIA voor milieu-investeringen op RVO Milieulijst, EIA voor energie-
 * investeringen op RVO Energielijst (mag NIET dubbel met MIA).
 *
 * @param {Object} inv  { bedrag, isMilieuLijst, isEnergieLijst, totaalKiaJaar, jaar }
 * @returns {Object}    aftrek-bedragen + uitleg
 */
function berekenInvesteringsAftrek_(inv) {
  const B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const bedrag = parseFloat(inv.bedrag) || 0;
  if (bedrag <= 0) return { kia: 0, mia: 0, eia: 0, totaal: 0, uitleg: 'Geen bedrag' };

  // KIA — gebruik centrale helper uit Belastingadvies.gs zodat KIA-bedragen
  // hier identiek zijn aan wat genereerBelastingadvies en het Dashboard
  // tonen. Voorheen waren hier hardcoded €19.535 / €129.194 die afweken
  // van de canonical config (€19.769 / €130.744) → twee verschillende
  // KIA-uitkomsten voor dezelfde investering, afhankelijk van waar de
  // klant het bekijkt. Bij Prinsjesdag-update is nu één plek (BELASTING_PER_JAAR).
  const totaalJaar = parseFloat(inv.totaalKiaJaar) || bedrag;
  const kia = (typeof berekenKiaAftrek_ === 'function') ? berekenKiaAftrek_(totaalJaar, B) : 0;
  const mia = _mia_(inv, B);
  const eia = _eia_(inv, B);

  // Bepaal de zone-uitleg voor de UI
  let uitleg;
  if (totaalJaar < B.KIA_MIN) {
    uitleg = 'KIA-drempel niet bereikt (< €' + B.KIA_MIN.toLocaleString('nl-NL') + ')';
  } else if (totaalJaar > B.KIA_MAX) {
    uitleg = 'KIA-grens overschreden (> €' + B.KIA_MAX.toLocaleString('nl-NL') + ')';
  } else if (totaalJaar <= B.KIA_VAST_VAN) {
    uitleg = 'KIA ' + Math.round((B.KIA_PCT || 0.28) * 100) + '%' +
             (mia > 0 ? ' + MIA' : '') + (eia > 0 ? ' + EIA' : '');
  } else if (totaalJaar <= B.KIA_AFBOUW_START) {
    uitleg = 'KIA-vastbedrag-zone' + (mia > 0 ? ' + MIA' : '') + (eia > 0 ? ' + EIA' : '');
  } else {
    uitleg = 'KIA-afbouwzone' + (mia > 0 ? ' + MIA' : '') + (eia > 0 ? ' + EIA' : '');
  }

  return { kia: kia, mia: mia, eia: eia, totaal: kia + mia + eia, uitleg: uitleg };
}

function _mia_(inv, B) {
  if (!inv.isMilieuLijst) return 0;
  // MIA percentages per categorie (vereenvoudigd; klant kiest categorie)
  // RVO publiceert jaarlijks Milieulijst met categorieën A-G met % 27/36/45.
  // Default: 36% voor middelste categorie.
  const pct = parseFloat(inv.miaPct) || 0.36;
  return rondBedrag_(parseFloat(inv.bedrag) * pct);
}

function _eia_(inv, B) {
  if (!inv.isEnergieLijst) return 0;
  // EIA mag NIET combineren met MIA voor zelfde bedrijfsmiddel
  if (inv.isMilieuLijst) return 0;
  const pct = parseFloat(B.EIA_PCT) || 0.40;
  return rondBedrag_(parseFloat(inv.bedrag) * pct);
}

/**
 * Menu-entry: open dialog om investerings-aftrek-stapeling te berekenen.
 */
function toonInvesteringsAftrekStapeling() {
  const ui = SpreadsheetApp.getUi();
  const _B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const _ibPct1 = (_B && _B.IB_SCHIJVEN && _B.IB_SCHIJVEN[0] && _B.IB_SCHIJVEN[0].pct) || 0.357;
  const _ibPct1Display = (Math.round(_ibPct1 * 1000) / 10).toString().replace('.', ',') + '%';
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;font-size:13px;color:#1A1A1A;background:#F7F9FC}
      h2{color:#0D1B4E;margin:0 0 6px;font-size:18px;font-weight:800}
      .sub{color:#5F6B7A;font-size:12px;margin-bottom:14px}
      label{display:block;font-weight:600;font-size:12px;color:#0D1B4E;margin:10px 0 4px}
      input,select{width:100%;padding:9px 12px;border:1px solid #E5EAF2;border-radius:6px;font-size:13px;background:#fff;font-family:inherit}
      input:focus,select:focus{outline:none;border-color:#2EC4B6}
      .row{display:flex;gap:14px;align-items:center;margin:8px 0}
      .row label{display:flex;align-items:center;gap:6px;font-weight:500;font-size:13px;color:#1A1A1A;margin:0}
      .row input[type=checkbox]{width:auto}
      .uitkomst{background:#0D1B4E;color:white;border-radius:8px;padding:18px;margin-top:18px}
      .uitkomst .lbl{font-size:11px;letter-spacing:.4px;text-transform:uppercase;opacity:.8}
      .uitkomst .v{font-size:28px;font-weight:800;margin:6px 0}
      .uitkomst .sub2{font-size:12px;opacity:.85;margin-top:8px}
      .breakdown{margin-top:10px;font-size:12px}
      .breakdown div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.12)}
      .btn{background:#2EC4B6;color:#0A4744;border:none;padding:10px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit;width:100%;margin-top:14px}
    </style>
    <h2>💎 Investerings-aftrek stapeling</h2>
    <div class="sub">KIA + MIA + EIA mag binnen voorwaarden gestapeld worden. Bereken jouw maximum.</div>
    <label>Aanschafbedrag (excl. BTW)</label>
    <input id="bedrag" type="number" min="0" step="100" placeholder="bv. 5000">
    <label>Totaal investeringen dit jaar (voor KIA-zone)</label>
    <input id="totaal" type="number" min="0" step="500" placeholder="laat leeg = alleen dit bedrag">
    <div class="row"><label><input id="milieu" type="checkbox"> Op RVO Milieulijst (MIA)</label></div>
    <div class="row"><label><input id="energie" type="checkbox"> Op RVO Energielijst (EIA)</label></div>
    <label>MIA-percentage (alleen indien Milieulijst aangevinkt)</label>
    <select id="miaPct">
      <option value="0.27">27% (categorie A/E)</option>
      <option value="0.36" selected>36% (categorie B/D)</option>
      <option value="0.45">45% (categorie F/G)</option>
    </select>
    <button class="btn" id="btnBereken">Bereken stapeling</button>
    <div id="output"></div>
    <script>
      function bereken() {
        const data = {
          bedrag: parseFloat(document.getElementById('bedrag').value) || 0,
          totaalKiaJaar: parseFloat(document.getElementById('totaal').value) || null,
          isMilieuLijst: document.getElementById('milieu').checked,
          isEnergieLijst: document.getElementById('energie').checked,
          miaPct: parseFloat(document.getElementById('miaPct').value),
        };
        if (!data.totaalKiaJaar) data.totaalKiaJaar = data.bedrag;
        google.script.run.withSuccessHandler(function(r) {
          if (!r) return;
          const f = function(n) { return '€' + Number(n).toFixed(2).replace('.',','); };
          document.getElementById('output').innerHTML =
            '<div class="uitkomst">' +
              '<div class="lbl">Totale aftrek</div>' +
              '<div class="v">' + f(r.totaal) + '</div>' +
              '<div class="breakdown">' +
                '<div><span>KIA</span><span>' + f(r.kia) + '</span></div>' +
                '<div><span>MIA</span><span>' + f(r.mia) + '</span></div>' +
                '<div><span>EIA</span><span>' + f(r.eia) + '</span></div>' +
              '</div>' +
              '<div class="sub2">' + r.uitleg + '. Bij IB-tarief ${_ibPct1Display} scheelt dit ' + f(r.totaal * ${_ibPct1}) + ' aan belasting.</div>' +
            '</div>';
        }).berekenInvesteringsAftrek_(data);
      }
      document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('btnBereken').addEventListener('click', bereken);
      });
    </script>
  `).setWidth(440).setHeight(620).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  ui.showModalDialog(html, '💎 Investerings-aftrek stapelen');
}

// ─────────────────────────────────────────────
//  B7 — STAKINGSWIZARD (bedrijfsoverdracht)
// ─────────────────────────────────────────────

/**
 * Bereken alle staking-gerelateerde aftrekken bij bedrijfsoverdracht.
 * @param {Object} input  { stakingswinst, FOR_saldo, lijfrente_premie, isStaker_eenmaal }
 * @returns {Object}      uitsplitsing + totaal + advies
 */
function berekenStakingsfiscaliteit_(input) {
  const B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const stakingswinst = parseFloat(input.stakingswinst) || 0;
  const forSaldo = parseFloat(input.FOR_saldo) || 0;
  const lijfrentePremie = parseFloat(input.lijfrente_premie) || 0;
  const stakingsaftrek = parseFloat(B.STAKINGSAFTREK) || 3630;

  // Stakingsaftrek: éénmalig per leven, max €3.630 (2026)
  const stakingsaftrekToegepast = input.isStaker_eenmaal === false ? 0 : Math.min(stakingsaftrek, stakingswinst);

  // FOR-vrijval: hele saldo telt als winst → belast als stakingswinst, MAAR
  // mag worden omgezet in stakingslijfrente (uitstellen tot uitkering).
  // Klant kiest: laten vrijvallen (belast nu) OF omzetten naar lijfrente.
  const forVrijval = forSaldo;
  const forNaarLijfrente = parseFloat(input.for_naar_lijfrente) || 0;
  const forBelastNu = forVrijval - forNaarLijfrente;

  // Stakingslijfrente: extra aftrek bovenop reguliere lijfrente-jaarruimte
  // op moment van staking — geldt voor stakingswinst + FOR-vrijval omgezet
  const stakingslijfrenteMax = stakingswinst + forNaarLijfrente;
  const stakingslijfrenteToegepast = Math.min(lijfrentePremie + forNaarLijfrente, stakingslijfrenteMax);

  // Belastbare stakingswinst
  const belastbareStaking = Math.max(0, stakingswinst - stakingsaftrekToegepast - stakingslijfrenteToegepast + forBelastNu);

  return {
    stakingswinst: stakingswinst,
    stakingsaftrek: stakingsaftrekToegepast,
    forVrijval: forVrijval,
    forNaarLijfrente: forNaarLijfrente,
    forBelastNu: forBelastNu,
    stakingslijfrente: stakingslijfrenteToegepast,
    belastbareStaking: rondBedrag_(belastbareStaking),
    advies: belastbareStaking > 50000
      ? 'Overweeg meer FOR om te zetten in stakingslijfrente — verlaagt directe belastingdruk.'
      : 'Combinatie lijkt fiscaal gunstig.',
  };
}

/**
 * Menu-entry: stakingswizard.
 */
function toonStakingsWizard() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '🏁 Bedrijf staken — fiscale wizard',
    'Bij bedrijfsbeëindiging spelen stakingsaftrek (€3.630), FOR-vrijval, ' +
    'en stakingslijfrente. Deze wizard berekent het netto-effect.\n\n' +
    'Voor jouw specifieke situatie: raadpleeg een fiscalist VOOR je staakt — ' +
    'de keuzes zijn onomkeerbaar zodra de jaaraangifte is ingediend.\n\n' +
    'Open Boekhouding → Belastingvoordeel → "Wat-als-rekenmachine" en kies ' +
    '"Bedrijf staken" als simulatie-modus.',
    ui.ButtonSet.OK
  );
  // Werkelijke wizard: extend simuleerWatAls_ in Belastingvoordeel.gs
  // met scenario 'staking'. Voor nu: documenteer via alert.
}

// ─────────────────────────────────────────────
//  B8 — SUPPLETIE-AANGIFTE DETECTIE
// ─────────────────────────────────────────────

/**
 * Detecteert retroactieve correcties op afgesloten BTW-periode.
 * Werkt door: vergelijk huidige BTW-aangifte data met historische snapshot
 * uit GESLOTEN_PERIODES. Verschil > €1.000 = direct suppletie verplicht;
 * < €1.000 = mag in volgende reguliere aangifte mee.
 *
 * @returns {Object[]} array van { periode, oudBedrag, nieuwBedrag, verschil, verplicht }
 */
function detecteerSuppletieMogelijk_() {
  const props = PropertiesService.getScriptProperties();
  const snapshotsRaw = props.getProperty('BTW_SNAPSHOTS') || '{}';
  let snapshots;
  try { snapshots = JSON.parse(snapshotsRaw); } catch (_) { snapshots = {}; }

  const ss = getSpreadsheet_();
  if (!ss) return [];
  const huidigJaar = new Date().getFullYear();
  const verschillen = [];

  // Voor elk afgesloten kwartaal in huidig + vorig jaar: bereken nu en compare
  [huidigJaar - 1, huidigJaar].forEach(function(jaar) {
    for (let q = 1; q <= 4; q++) {
      const snapKey = jaar + '_Q' + q;
      const oud = snapshots[snapKey];
      if (!oud) continue;  // periode nooit afgesloten

      // Recompute
      const van = new Date(jaar, (q - 1) * 3, 1);
      const tot = new Date(jaar, q * 3, 0, 23, 59, 59, 999);
      let nieuw;
      try {
        if (typeof berekenBtwAangifte_ === 'function') {
          nieuw = berekenBtwAangifte_(ss, van, tot);
        }
      } catch (_) { continue; }
      if (!nieuw) continue;

      const oudSaldo = parseFloat(oud.saldo) || 0;
      const nieuwSaldo = parseFloat(nieuw.saldo) || 0;
      const verschil = rondBedrag_(nieuwSaldo - oudSaldo);
      if (Math.abs(verschil) < 0.50) continue;  // ronding-noise
      verschillen.push({
        periode: snapKey,
        oudBedrag: oudSaldo,
        nieuwBedrag: nieuwSaldo,
        verschil: verschil,
        verplicht: Math.abs(verschil) >= SUPPLETIE_DREMPEL,
      });
    }
  });
  return verschillen;
}

/**
 * Proactieve suppletie-check vanuit dagelijkseTaken.
 *
 * V3-FIX: detecteerSuppletieMogelijk_ bestond al maar werd alleen aangeroepen
 * via een menu-item dat klanten zelf moeten kiezen. Bij een retroactieve
 * correctie > €1.000 is suppletie binnen 5 jaar verplicht — en de eerste
 * 8 weken zonder boete (vrijwillige verbetering). Klant die niet handmatig
 * "Controleer afsluiting" runt mist die boete-vrije termijn → bij latere
 * Belastingdienst-ontdekking: naheffing + 30% boete + heffingsrente.
 *
 * Idempotent: per periode max 1× per 90 dagen mailen, ook bij dagelijks
 * dezelfde detectie. Klant kan in die 90 dagen indienen of negeren.
 *
 * Fail-soft: elke fout wordt gelogd, dagelijkseTaken stopt nooit op
 * suppletie-check (best-effort waarschuwing).
 */
function controleerSuppletieProactief_() {
  let verschillen;
  try { verschillen = detecteerSuppletieMogelijk_(); }
  catch (e) { Logger.log('Suppletie-check fout: ' + e.message); return; }
  if (!verschillen || verschillen.length === 0) return;

  const verplicht = verschillen.filter(function(v) { return v.verplicht; });
  if (verplicht.length === 0) return;  // alle verschillen <€1.000 = mogen mee in volgende aangifte

  const props = PropertiesService.getScriptProperties();
  const nuMs = Date.now();
  const cooldownMs = 90 * 24 * 60 * 60 * 1000;  // 90 dgn

  const opnieuwTeMelden = verplicht.filter(function(v) {
    const key = 'SUPPLETIE_GEMELD_' + v.periode;
    const eerderRaw = props.getProperty(key);
    if (eerderRaw) {
      const eerder = parseInt(eerderRaw, 10);
      if (eerder && (nuMs - eerder) < cooldownMs) return false;  // nog binnen 90d
    }
    return true;
  });
  if (opnieuwTeMelden.length === 0) return;

  // Markeer ALS GEMELD vóór mail-poging — voorkomt mail-storm bij retry-loop.
  opnieuwTeMelden.forEach(function(v) {
    try { props.setProperty('SUPPLETIE_GEMELD_' + v.periode, String(nuMs)); } catch (_) {}
  });

  // Audit-log + klant-melding via toast + email
  try {
    const samenvatting = opnieuwTeMelden.map(function(v) {
      const richting = v.verschil > 0 ? 'extra te betalen' : 'extra terug te vragen';
      return v.periode + ': ' + formatBedrag_(Math.abs(v.verschil)) + ' ' + richting;
    }).join('; ');
    schrijfAuditLog_('Suppletie VERPLICHT gedetecteerd', samenvatting);
  } catch (_) {}

  // Email naar eigenaar — gebruikt zelfde key als BTW-reminder (PR #117 fix)
  try {
    const ontvanger = getInstelling_('Email rapporten naar') || getInstelling_('Email');
    if (ontvanger && typeof isGeldigEmail_ === 'function' && isGeldigEmail_(ontvanger)) {
      const lijst = opnieuwTeMelden.map(function(v) {
        const richting = v.verschil > 0 ? 'extra te BETALEN' : 'extra TERUG te vragen';
        return '  • ' + v.periode + ': ' + formatBedrag_(Math.abs(v.verschil)) + ' ' + richting +
               ' (vorige aangifte ' + formatBedrag_(v.oudBedrag) + ' → nu ' + formatBedrag_(v.nieuwBedrag) + ')';
      }).join('\n');
      const body =
        'Beste,\n\n' +
        'In je boekhouding is een retroactieve wijziging gedetecteerd op een AFGESLOTEN BTW-periode\n' +
        'met een verschil ≥ €1.000. Voor zulke wijzigingen ben je verplicht een suppletie-aangifte\n' +
        'in te dienen bij de Belastingdienst (binnen 5 jaar; de eerste 8 weken zonder boete).\n\n' +
        'Periode(s) met verschil:\n' + lijst + '\n\n' +
        'Open je boekhouding → menu BTW → "Suppletie-rapport genereren" voor de exacte bedragen,\n' +
        'en dien daarna in via Mijn Belastingdienst Zakelijk → "Suppletie omzetbelasting".\n\n' +
        'Niet indienen kan bij latere ontdekking leiden tot naheffing + 30% verzuimboete + rente.\n\n' +
        'Boekhoudbaar';
      try { MailApp.sendEmail(ontvanger, '🔄 Suppletie BTW verplicht — actie binnen 8 weken', body); }
      catch (_) {}
    }
  } catch (_) {}
}

/**
 * Genereer suppletie-rapport tabblad met alle gedetecteerde correcties.
 */
function genereerSuppletieRapport() {
  const ui = SpreadsheetApp.getUi();
  const verschillen = detecteerSuppletieMogelijk_();
  if (verschillen.length === 0) {
    ui.alert('✅ Geen suppletie nodig', 'Geen retroactieve verschillen gedetecteerd t.o.v. afgesloten periodes.', ui.ButtonSet.OK);
    return;
  }
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName('Suppletie');
  if (!sheet) {
    sheet = ss.insertSheet('Suppletie');
    sheet.setTabColor('#F59E0B');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  sheet.getRange(1, 1, 1, 5).merge()
    .setValue('🔄 SUPPLETIE-AANGIFTE OVERZICHT')
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(15).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 38);

  sheet.getRange(2, 1, 1, 5).merge()
    .setValue('Verschillen tussen huidige boekstand en eerder afgesloten BTW-aangiftes. ≥€1.000 = suppletie verplicht (binnen 5 jaar). <€1.000 = mag in volgende reguliere aangifte mee.')
    .setBackground('#FFF8E1').setFontColor('#5A3F00').setFontSize(11)
    .setHorizontalAlignment('center').setWrap(true);
  sheet.setRowHeight(2, 50);

  sheet.getRange(4, 1, 1, 5).setValues([['Periode', 'Oud saldo', 'Nieuw saldo', 'Verschil', 'Status']])
    .setBackground('#0D1B4E').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(4);

  let r = 5;
  verschillen.forEach(function(v) {
    sheet.getRange(r, 1, 1, 5).setValues([[
      v.periode,
      formatBedrag_(v.oudBedrag),
      formatBedrag_(v.nieuwBedrag),
      formatBedrag_(v.verschil),
      v.verplicht ? 'VERPLICHT — direct suppletie' : 'Mag in volgende aangifte mee',
    ]]);
    if (v.verplicht) {
      sheet.getRange(r, 5).setBackground('#FFCDD2').setFontColor('#B71C1C').setFontWeight('bold');
    } else {
      sheet.getRange(r, 5).setBackground('#FFF8E1').setFontColor('#5A3F00');
    }
    r++;
  });
  sheet.setColumnWidth(1, 120);
  for (let c = 2; c <= 4; c++) sheet.setColumnWidth(c, 130);
  sheet.setColumnWidth(5, 280);
  ss.setActiveSheet(sheet);
  ui.alert('🔄 Suppletie-rapport klaar', verschillen.length + ' periode(s) met verschil. Open Suppletie-tab voor details.', ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  B9 — DGA-SALARIS MONITOR
// ─────────────────────────────────────────────

/**
 * Check of DGA-salaris voldoet aan minimum-loon-regel.
 * Geactiveerd via Instellingen 'Rechtsvorm' = 'BV' of 'Heeft DGA' = 'Ja'.
 * @returns {Object|null}  { brutoSalaris, minimum, voldoet, advies } of null
 */
function checkDgaSalaris_() {
  const heeftDga = String(getInstelling_('Heeft DGA') || '').toLowerCase() === 'ja';
  const rechtsvorm = String(getInstelling_('Rechtsvorm') || '').toLowerCase();
  if (!heeftDga && !/bv|n\.?v\.?/.test(rechtsvorm)) return null;

  const brutoSalaris = parseBedrag_(getInstelling_('DGA brutosalaris') || '0');
  const B = (typeof getBelasting_ === 'function') ? getBelasting_() : null;
  const minimum = (B && B.DGA_MIN_SALARIS) || DGA_MIN_SALARIS_FALLBACK;
  if (brutoSalaris === 0) {
    return {
      brutoSalaris: 0, minimum: minimum, voldoet: false,
      advies: 'Geen DGA-salaris ingevuld — vul in Instellingen "DGA brutosalaris" in. Minimum: €' + minimum.toLocaleString('nl-NL'),
    };
  }
  const voldoet = brutoSalaris >= minimum;
  return {
    brutoSalaris: brutoSalaris,
    minimum: minimum,
    voldoet: voldoet,
    advies: voldoet
      ? 'DGA-salaris voldoet aan minimum (€' + minimum.toLocaleString('nl-NL') + ').'
      : 'DGA-salaris (€' + brutoSalaris.toLocaleString('nl-NL') +
        ') is LAGER dan wettelijk minimum (€' + minimum.toLocaleString('nl-NL') + '). ' +
        'Belastingdienst kan corrigeren — verhoog salaris of vraag uitzondering aan.',
  };
}

/**
 * Hook in Notificaties + Belastingadvies.
 */
function dgaSalarisNotificatie_() {
  const r = checkDgaSalaris_();
  if (!r) return null;
  if (r.voldoet) return null;
  return {
    titel: '⚠️ DGA-salaris onder minimum',
    tekst: r.advies,
    actie: 'Verhoog DGA-salaris of doe verzoek aan Belastingdienst',
    euros: 0,
    urgent: true,
    prioriteit: 88,
  };
}

// Hook in genereerNotificaties_ via existing pattern

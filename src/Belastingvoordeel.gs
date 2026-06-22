/**
 * Belastingvoordeel.gs
 * "Wat heb ik dit jaar bespaard?" — proactieve euro-impact-tracker.
 *
 * FILOSOFIE
 * ─────────
 * Klanten kennen regelgeving niet of snappen het niet. Het systeem moet:
 *   1. AUTOMATISCH detecteren welke regelingen de klant benut
 *   2. AUTOMATISCH detecteren welke regelingen worden gemist
 *   3. ALTIJD vertalen naar euro-impact (niet "art. 25 Wet OB" maar "€2.470 minder belasting")
 *   4. PROACTIEF herinneren aan tijdgebonden acties (KIA-deadline 31 dec, IB 1 mei)
 *
 * Resultaat: klant ziet in één oogopslag "Boekhoudbaar bespaart u €X dit jaar".
 *
 * GEBRUIK
 * ───────
 * berekenBelastingvoordeel_(advies, BELASTING) → {
 *   bespaardYTD,            // Som van alle benutte aftrekken × marginaal tarief
 *   benutteAftrekken,       // Lijst regelingen met euro-impact
 *   gemisteKansen,          // Lijst regelingen die niet zijn benut maar mogelijk zijn
 *   mogelijkExtra,          // Som van gemiste kansen × marginaal tarief
 *   totaalPotentieel,       // bespaardYTD + mogelijkExtra
 * }
 *
 * Uitvoer is bedoeld voor Dashboard-widget + email-rapport.
 */

/**
 * Berekent totale belastingbesparing dit jaar + niet-benutte kansen.
 *
 * @param {Object} advies     Resultaat van berekenBelastingadvies_(ss).
 * @param {Object} BELASTING  Tax-config van getBelasting_().
 * @return {Object} Belastingvoordeel-overzicht.
 */
function berekenBelastingvoordeel_(advies, BELASTING) {
  if (!advies) return { bespaardYTD: 0, benutteAftrekken: [], gemisteKansen: [], mogelijkExtra: 0, totaalPotentieel: 0 };

  // Marginaal tarief = effectief belastingtarief op de laatste euro winst.
  // Voor besparingsschatting nemen we het gemiddelde tarief over de
  // belastbare winst — geen exact marginal-rate maar goede schatting.
  const winst = advies.winstNaAftrek || 0;
  const ib = advies.geschatteIB || 0;
  const effectiefTarief = winst > 0 ? ib / winst : (BELASTING.IB_SCHIJF_1_PCT || 0.3582);
  const marginaalTarief = winst > BELASTING.IB_SCHIJF_1_MAX
    ? (BELASTING.IB_SCHIJF_2_PCT || 0.495)
    : effectiefTarief;

  // ── Benutte aftrekken (klant ziet wat er al opgehaald is) ────────────
  const benutteAftrekken = (advies.aftrekken || []).map(function(a) {
    return {
      naam: a.naam,
      aftrekBedrag: a.bedrag,
      besparing: rondBedrag_(a.bedrag * marginaalTarief),
      code: a.code || '',
    };
  });
  const bespaardYTD = rondBedrag_(
    benutteAftrekken.reduce(function(s, a) { return s + a.besparing; }, 0)
  );

  // ── Gemiste kansen — regelingen die niet zijn benut ─────────────────
  // Lees de adviezen-array: items met type 'TIP'/'VOORDEEL' zijn vaak
  // niet-benutte aftrekposten. We extraheren de euro-impact uit het
  // advies-object zelf (besparing-veld) — dat al per advies wordt geschat.
  const gemisteKansen = [];
  let mogelijkExtra = 0;
  (advies.adviezen || []).forEach(function(a) {
    if ((a.type === 'TIP' || a.type === 'VOORDEEL') &&
        typeof a.besparing === 'number' && a.besparing > 0) {
      gemisteKansen.push({
        naam: a.titel.replace(/^[^\w\d]+/, ''), // strip emoji-prefix
        besparing: rondBedrag_(a.besparing),
        actie: a.tekst,
      });
      mogelijkExtra += a.besparing;
    }
  });
  mogelijkExtra = rondBedrag_(mogelijkExtra);

  return {
    bespaardYTD: bespaardYTD,
    benutteAftrekken: benutteAftrekken,
    gemisteKansen: gemisteKansen,
    mogelijkExtra: mogelijkExtra,
    totaalPotentieel: rondBedrag_(bespaardYTD + mogelijkExtra),
    marginaalTarief: marginaalTarief,
  };
}

// ─────────────────────────────────────────────
//  SEIZOENS-TIP ENGINE
// ─────────────────────────────────────────────
//
// Per maand een actieve tip met deadline + actie + euro-impact.
// Wordt aangeroepen vanuit dagelijkseTaken én Dashboard.
// Klant moet niet hoeven nadenken — systeem zegt "deze maand: doe X".

/**
 * Geeft de seizoens-tip voor de huidige maand.
 * Per maand een specifieke prioritaire actie met deadline.
 * @return {{titel:string, tekst:string, deadline:string, urgent:boolean}|null}
 */
function getSeizoensTip_() {
  const nu = new Date();
  const maand = nu.getMonth() + 1; // 1=jan, 12=dec
  const dag = nu.getDate();
  const jaar = nu.getFullYear();

  // ── JANUARI: BTW Q4 + voorbereid IB-aangifte ──
  if (maand === 1) {
    return {
      maand: 1,
      titel: '📅 Januari: BTW Q4 vorig jaar afronden',
      tekst:
        `BTW-aangifte Q4 ${jaar - 1} moet vóór 31 januari ingediend zijn. ` +
        `Bovendien: begin met het verzamelen van bonnen/facturen voor uw IB-aangifte ${jaar - 1}. ` +
        `Maak een einde-jaar-overzicht via Boekhoudbaar → BTW → BTW-aangifte Q4.`,
      deadline: '31 januari',
      urgent: dag >= 20,
    };
  }

  // ── FEBRUARI: voorbereid IB-aangifte ──
  if (maand === 2) {
    return {
      maand: 2,
      titel: '📋 Februari: Voorbereid IB-aangifte ' + (jaar - 1),
      tekst:
        `De IB-aangifte deadline is 1 mei ${jaar}. Begin nu met verzamelen: ` +
        `loonbonus van werkgever (jaaropgave), zorgnota's, hypotheek-rente-overzicht, ` +
        `bewijs zelfstandigenaftrek (urenadministratie ≥ 1.225 uur). ` +
        `Boekhoudbaar → Belastingadvies geeft een schatting van uw IB-aanslag.`,
      deadline: '1 mei',
      urgent: false,
    };
  }

  // ── MAART: laatste maand voor IB voorbereiding ──
  if (maand === 3) {
    return {
      maand: 3,
      titel: '📋 Maart: IB-aangifte voorbereiden ' + (jaar - 1),
      tekst:
        `Nog ~6 weken tot de IB-deadline. Controleer of alle aftrekposten zijn benut: ` +
        // FIX F-TAX-206: hardcoded bedragen (€2.470/€2.123/12,7%) verwijderd — ze
        // verouderen en gaven een ander getal dan de canonieke config; deze tip
        // gaat bovendien over de aangifte van het VORIGE jaar (jaar-1), dus de
        // exacte bedragen verschillen per jaar. Belastingadvies toont de
        // jaar-correcte bedragen via getBelasting_().
        `zelfstandigenaftrek, startersaftrek (eerste 3 jaar), ` +
        `MKB-winstvrijstelling, KIA, MIA/VAMIL, EIA, AOV-premie, lijfrente. ` +
        `Open Boekhoudbaar → Belastingadvies voor de exacte bedragen van dat jaar.`,
      deadline: '1 mei',
      urgent: false,
    };
  }

  // ── APRIL: LAATSTE WEKEN IB-AANGIFTE ──
  if (maand === 4) {
    return {
      maand: 4,
      titel: '⚠️ April: IB-aangifte deadline 1 mei',
      tekst:
        `De IB-aangifte ${jaar - 1} moet uiterlijk 1 mei worden ingediend! ` +
        `Geen aangifte = boete + ambtshalve aanslag (vaak hoger). ` +
        `Heeft u meer tijd nodig? Vraag uitstel aan via mijn.belastingdienst.nl ` +
        `(automatisch 4 maanden tot 1 september). Open Belastingadvies-tabblad voor ` +
        `definitief overzicht en BTW Q1.`,
      deadline: '1 mei',
      urgent: dag >= 15,
    };
  }

  // ── MEI/JULI/OKTOBER: BTW-kwartaal-deadlines ──
  if (maand === 5 || maand === 7 || maand === 10) {
    const kwLabel = { 5: 'Q1', 7: 'Q2', 10: 'Q3' }[maand];
    const deadlineMaand = { 5: '30 april (verlopen) → spoed!', 7: '31 juli', 10: '31 oktober' }[maand];
    return {
      maand: maand,
      titel: `📅 ${maand === 5 ? 'Mei' : maand === 7 ? 'Juli' : 'Oktober'}: BTW-aangifte ${kwLabel}`,
      tekst:
        `BTW-aangifte ${kwLabel} ${jaar} moet vóór ${deadlineMaand} ingediend. ` +
        `Boekhoudbaar → BTW → BTW-aangifte ${kwLabel} genereert het overzicht. ` +
        `Tip: zet BTW direct na ontvangst van facturen apart op een spaarrekening — ` +
        `voorkomt verrassingen bij aangifte.`,
      deadline: deadlineMaand,
      urgent: dag >= 20 && maand !== 5,
    };
  }

  // ── NOVEMBER: einde-jaar-checklist ──
  if (maand === 11) {
    return {
      maand: 11,
      titel: '🎯 November: Einde-jaar-checklist',
      tekst:
        `Nog ~2 maanden tot jaarwisseling. Check NU:\n` +
        `• Heeft u 1.225 uur geregistreerd? (zelfstandigenaftrek)\n` +
        `• Plant u investeringen ≥ €2.901? Doe ze VOOR 31 december voor KIA dit jaar.\n` +
        `• Heeft u milieu-investeringen? MIA aanmelden binnen 3 maanden via RVO.\n` +
        `• Lijfrente-storting: jaarruimte vervalt 7 jaar later — benut nu.\n` +
        `• AOV-premie betaald? Aftrekbaar in box 1.\n` +
        `Open Belastingadvies voor uw persoonlijke checklist met euro-impact.`,
      deadline: '31 december',
      urgent: false,
    };
  }

  // ── DECEMBER: laatste kans aftrekposten ──
  if (maand === 12) {
    const dagenTotEinde = 31 - dag;
    return {
      maand: 12,
      titel: `🎄 December: Nog ${dagenTotEinde} dagen voor fiscale acties`,
      tekst:
        `LAATSTE KANS dit jaar voor:\n` +
        `• KIA: investeringen tussen €2.901 en €71.683 → 28% extra aftrek\n` +
        `• MIA/VAMIL: milieu-investeringen op RVO Milieulijst → 27-45% aftrek\n` +
        `• EIA: energie-investeringen op RVO Energielijst → 40% aftrek\n` +
        `• Lijfrente-storting: tot jaarruimte (30% premiegrondslag, Wet toekomst pensioenen)\n` +
        `• Vooruitbetalen kosten 2026 → kosten lopend jaar\n` +
        `• Achteraf opboeken vergeten reiskosten (€0,23/km)\n` +
        `Doe het VANDAAG, niet 31 december (banken zijn dan dicht).`,
      deadline: '31 december',
      urgent: dagenTotEinde <= 14,
    };
  }

  // ── ANDERE MAANDEN (juni, augustus, september): general tip ──
  return {
    maand: maand,
    titel: '💡 Reguliere boekhouding: bijhouden = winst',
    tekst:
      `Tip: registreer wekelijks uw zakelijke kilometers (€0,23/km aftrekbaar) ` +
      `en thuiswerkdagen (€2,40/dag aftrekbaar). Vele ZZP'ers vergeten dit en ` +
      `missen €500-€1.500 aftrek per jaar. Voer in via Boekhoudbaar → Nieuwe boeking.`,
    deadline: null,
    urgent: false,
  };
}

/**
 * Detecteert een omzet-mijlpaal die net is bereikt — vandaag voor het eerst.
 * Verzamelt feeling van vooruitgang ("je bent nu bij €10k YTD!").
 * Returnt {bereikt, mijlpaal, tekst} of null als geen nieuwe mijlpaal.
 *
 * Stalt mijlpalen in UserProperties zodat zelfde mijlpaal niet 2× toont.
 */
function detecteerMijlpaal_(omzetYTD) {
  const drempels = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const omzet = parseFloat(omzetYTD) || 0;
  if (omzet <= 0) return null;
  const huidig = drempels.filter(function(d) { return omzet >= d; }).pop();
  if (!huidig) return null;
  try {
    const userProps = PropertiesService.getUserProperties();
    const jaar = new Date().getFullYear();
    const key = 'mijlpaal_omzet_' + huidig + '_' + jaar;
    if (userProps.getProperty(key) === 'getoond') return null;
    userProps.setProperty(key, 'getoond');
    const fmt = function(n) { return '€' + n.toLocaleString('nl-NL'); };
    return {
      mijlpaal: huidig,
      tekst: '🎉 Mijlpaal bereikt: ' + fmt(huidig) + ' omzet dit jaar! ' +
             (huidig >= 100000 ? 'Indrukwekkend werk.' :
              huidig >= 25000 ? 'Topprestatie — blijf zo doorgaan.' :
              huidig >= 5000 ? 'Mooie voortgang!' :
              'Goed bezig!'),
    };
  } catch (_) { return null; }
}

/**
 * Renderable HTML/sheet-vriendelijke versie van de seizoens-tip.
 * Geeft platte tekst + flag of het urgent is voor kleurcodering.
 */
function getSeizoensTipRender_() {
  const tip = getSeizoensTip_();
  if (!tip) return null;
  return {
    titel: tip.titel,
    tekst: tip.tekst,
    deadline: tip.deadline || '',
    urgent: !!tip.urgent,
    bgKleur: tip.urgent ? '#FFCDD2' : '#FFF8E1',
    fontKleur: tip.urgent ? '#B71C1C' : '#5A3F00',
  };
}

// ─────────────────────────────────────────────
//  WAT-ALS SIMULATOR — HTML DIALOG
// ─────────────────────────────────────────────

/**
 * Toont de wat-als simulator als HTML-dialog. Klant voert in:
 *   - Extra omzet dit jaar
 *   - Extra investering (KIA-relevant)
 *   - Extra lijfrente-storting
 * Direct zicht op delta IB, Zvw, totale fiscale last + netto-effect.
 */
function toonWatAlsSimulator() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let basis;
  try { basis = berekenBelastingadvies_(ss); }
  catch (e) {
    SpreadsheetApp.getUi().alert('Wat-als simulator', 'Kon huidige fiscale situatie niet bepalen: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
     padding:18px;font-size:13px;color:#1A1A1A;background:#F7F9FC;margin:0}
h2{color:#0D1B4E;margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:-0.01em}
.sub{color:#5F6B7A;font-size:12px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
label{display:block;font-weight:600;font-size:11px;color:#0D1B4E;margin-bottom:4px;letter-spacing:.3px;text-transform:uppercase}
input[type=number]{width:100%;padding:8px 10px;border:1px solid #E5EAF2;border-radius:6px;font-size:14px;font-family:inherit;background:#fff}
input[type=number]:focus{outline:none;border-color:#2EC4B6}
.huidig{background:#fff;border:1px solid #E5EAF2;border-radius:8px;padding:14px;margin-bottom:12px}
.huidig .lbl{color:#5F6B7A;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.huidig .v{font-weight:700;color:#0D1B4E;font-size:14px}
.huidig table{width:100%;border-collapse:collapse}
.huidig td{padding:4px 0}
.huidig td:last-child{text-align:right}
.resultaat{background:#0D1B4E;color:white;border-radius:8px;padding:16px;margin-top:14px}
.resultaat h3{margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:.3px}
.resultaat table{width:100%;border-collapse:collapse}
.resultaat td{padding:5px 0;font-size:13px}
.resultaat td:last-child{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.delta-pos{color:#FFC107}
.delta-neg{color:#81C784}
.netto{border-top:1px solid rgba(255,255,255,.2);padding-top:10px;margin-top:8px;font-size:15px;font-weight:800}
.tip{background:#FFF8E1;color:#5A3F00;border-radius:6px;padding:10px 12px;font-size:11px;margin-top:14px;line-height:1.5}
.btn{background:#2EC4B6;color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;width:100%;margin-top:12px}
.btn:hover{background:#28B0A4}
</style></head>
<body>
<h2>💡 Wat-als simulator</h2>
<div class="sub">Speel scenario's: hoeveel meer/minder belasting bij wijziging in omzet of investeringen?</div>

<div class="huidig">
  <div class="lbl">Huidige situatie (op basis van uw boekhouding YTD)</div>
  <table>
    <tr><td>Winst</td><td><span class="v">${formatBedrag_(basis.winstVoorAftrek || 0)}</span></td></tr>
    <tr><td>Aftrekposten</td><td><span class="v">${formatBedrag_(basis.totaalAftrek || 0)}</span></td></tr>
    <tr><td>Geschatte IB</td><td><span class="v">${formatBedrag_(basis.geschatteIB || 0)}</span></td></tr>
    <tr><td>Zvw-bijdrage</td><td><span class="v">${formatBedrag_(basis.zvwBijdrage || 0)}</span></td></tr>
    <tr><td>Totale fiscale last</td><td><span class="v" style="color:#B71C1C">${formatBedrag_(basis.totaleFiscaleLast || basis.geschatteIB || 0)}</span></td></tr>
  </table>
</div>

<div class="grid">
  <div>
    <label>Extra omzet</label>
    <input id="extraOmzet" type="number" min="0" step="500" value="0">
  </div>
  <div>
    <label>Extra investering</label>
    <input id="extraInv" type="number" min="0" step="500" value="0">
  </div>
  <div>
    <label>Extra lijfrente-storting</label>
    <input id="extraLijfrente" type="number" min="0" step="100" value="0">
  </div>
  <div>
    <label>&nbsp;</label>
    <button class="btn" id="btn-simuleer" data-actie="simuleer">Bereken impact</button>
  </div>
</div>

<div id="output" class="resultaat" style="display:none">
  <h3>📊 Impact op uw fiscale last</h3>
  <table>
    <tr><td>Extra IB</td><td id="dIB">€ 0,00</td></tr>
    <tr><td>Extra Zvw</td><td id="dZvw">€ 0,00</td></tr>
    <tr><td>Aftrek-besparing</td><td id="dAftrek">€ 0,00</td></tr>
    <tr><td>Totale extra fiscale last</td><td id="dTot">€ 0,00</td></tr>
    <tr class="netto"><td>Netto effect (omzet − belasting)</td><td id="netto">€ 0,00</td></tr>
  </table>
</div>

<div class="tip">
  <strong>💡 Tip:</strong> Investeringen tussen €2.901 en €71.683 geven 28% KIA-aftrek
  (max €20.072). Lijfrente-storting voor jaareinde benut jaarruimte (vervalt 7 jaar later).
</div>

<script>
function fmt(n){var p=Number(n).toFixed(2).split('.');p[0]=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.');return (n<0?'-':'')+'€\u00A0'+p.join(',').replace('-','');}

function simuleer(){
  var data={
    extraOmzet: parseFloat(document.getElementById('extraOmzet').value)||0,
    extraInvestering: parseFloat(document.getElementById('extraInv').value)||0,
    extraLijfrente: parseFloat(document.getElementById('extraLijfrente').value)||0,
  };
  google.script.run
    .withSuccessHandler(function(r){
      if(!r) return;
      document.getElementById('output').style.display='block';
      document.getElementById('dIB').textContent=fmt(r.deltaIB);
      document.getElementById('dZvw').textContent=fmt(r.deltaZvw);
      document.getElementById('dAftrek').textContent=fmt(-(r.deltaAftrek||0));
      document.getElementById('dTot').textContent=fmt(r.deltaTotaal);
      var n=document.getElementById('netto');
      n.textContent=fmt(r.nettoEffect);
      n.style.color=r.nettoEffect>=0?'#81C784':'#FFC107';
    })
    .withFailureHandler(function(e){alert('⚠️ '+(e&&e.message?e.message:'Er ging iets mis. Probeer opnieuw.'));})
    .runWatAlsSimulator(data);
}

document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('btn-simuleer');
  if (btn) btn.addEventListener('click', function(e){ e.preventDefault(); simuleer(); });
});
</script>
</body></html>
  `).setWidth(540).setHeight(620).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  SpreadsheetApp.getUi().showModalDialog(html, '💡 Wat-als simulator');
}

/**
 * Server-side handler voor de wat-als-dialog. Roept simuleerWatAls_ aan
 * met huidige fiscale situatie als basis.
 */
function runWatAlsSimulator(mutatie) {
  // Strict input-validatie — defensief tegen UI-bugs of geknoeide
  // google.script.run-aanroepen. Negatieve bedragen worden geblokkeerd
  // via Math.max(0, ...) zodat simulatie nooit met -€500 omzet werkt.
  if (mutatie && typeof mutatie !== 'object') {
    throw new Error('Ongeldige simulatiedata.');
  }
  const veilig = {
    extraOmzet:       Math.max(0, parseFloat((mutatie || {}).extraOmzet)       || 0),
    extraInvestering: Math.max(0, parseFloat((mutatie || {}).extraInvestering) || 0),
    extraLijfrente:   Math.max(0, parseFloat((mutatie || {}).extraLijfrente)   || 0),
  };
  const ss = getSpreadsheet_();
  const basis = berekenBelastingadvies_(ss);
  const B = getBelasting_();
  return simuleerWatAls_(basis, B, veilig);
}

// ─────────────────────────────────────────────
//  REISKOSTEN-TRACKER (compact, 30-sec invoer)
// ─────────────────────────────────────────────
//
// €0,23/km is aftrekbaar voor zakelijke kilometers met privéauto.
// Vele ZZP'ers vergeten dit en missen €500-€1.500/jaar.
// Deze dialog maakt invoer trivial: omschrijving + km → automatisch
// geboekt op rekening 7350 (reiskosten) als kostenpost.

function toonReiskostenTracker() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const today = new Date().toISOString().slice(0, 10);
  // Tarief uit BELASTING-config (auto-update bij Belastingdienst-verhoging).
  // Server-side ingevoegd in HTML — preview-berekening en boeking kloppen
  // dan altijd met elkaar én met de werkelijke journaalpost.
  const _B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const _kmTarief = _B.REISKOSTEN_PER_KM || 0.23;
  const _kmTariefStr = '€' + _kmTarief.toString().replace('.', ',');
  let kmYTD = 0;
  let bedragYTD = 0;
  try {
    const ss = getSpreadsheet_();
    const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
    if (jpSheet) {
      const data = jpSheet.getDataRange().getValues();
      const jaar = (typeof getBoekjaar_ === 'function') ? getBoekjaar_() : new Date().getFullYear();
      for (let i = 1; i < data.length; i++) {
        const datum = data[i][KOL.JP.datum] ? parseDatum_(data[i][KOL.JP.datum]) : null;
        if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== jaar) continue;
        const debet = String(data[i][KOL.JP.debetRekening] || '');
        const omschr = String(data[i][KOL.JP.omschrijving] || '').toLowerCase();
        if (debet === '7350' || /reiskosten|kilometer/i.test(omschr)) {
          bedragYTD += parseFloat(data[i][KOL.JP.bedrag]) || 0;
          // Probeer km te extraheren uit omschrijving "X km × €0,23"
          const m = omschr.match(/(\d+)\s*km/);
          if (m) kmYTD += parseInt(m[1], 10);
        }
      }
    }
  } catch (_) {}

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
     padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;margin:0}
h2{color:#0D1B4E;margin:0 0 4px;font-size:18px;font-weight:800}
.sub{color:#5F6B7A;font-size:12px;margin-bottom:14px}
.ytd{background:#E6F7F4;border-radius:8px;padding:12px;margin-bottom:14px;text-align:center}
.ytd .lbl{color:#5F6B7A;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.ytd .v{font-weight:700;color:#0D1B4E;font-size:18px}
label{display:block;font-weight:600;font-size:12px;color:#0D1B4E;margin-bottom:4px;margin-top:10px}
input{width:100%;padding:9px 12px;border:1px solid #E5EAF2;border-radius:6px;font-size:14px;font-family:inherit;background:#fff}
input:focus{outline:none;border-color:#2EC4B6}
.preview{background:#FFF8E1;border-radius:6px;padding:10px;margin-top:12px;font-size:13px;color:#5A3F00}
.preview b{color:#0D1B4E;font-size:15px}
.btn{background:#2EC4B6;color:white;border:none;padding:11px 22px;border-radius:8px;
     cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;width:100%;margin-top:14px}
.btn:hover{background:#28B0A4}
.status{padding:10px;border-radius:6px;margin-top:10px;font-size:12px;display:none}
.status.s{background:#E8F5E9;color:#1B5E20}
.status.e{background:#FFEBEE;color:#B71C1C}
</style></head>
<body>
<h2>🚗 Reiskosten registreren</h2>
<div class="sub">${_kmTariefStr}/km is aftrekbaar voor zakelijke ritten met privéauto. Veel ZZP'ers vergeten dit te boeken.</div>

<div class="ytd">
  <div class="lbl">Geboekt dit jaar</div>
  <div class="v">${bedragYTD > 0 ? formatBedrag_(bedragYTD) + ' (~' + Math.round(bedragYTD / _kmTarief) + ' km)' : 'Nog niets'}</div>
</div>

<label>Datum</label>
<input id="datum" type="date" value="${today}">

<label>Omschrijving (vanwaar naar waar)</label>
<input id="omschr" type="text" placeholder="bijv. Klantbezoek Amsterdam">

<label>Aantal km (heen + terug)</label>
<input id="km" type="number" min="1" step="1" oninput="upd()">

<div id="preview" class="preview" style="display:none">
  Aftrek: <b id="aftrek">€ 0,00</b> (× ${_kmTariefStr}/km)<br>
  <span style="font-size:11px;color:#888">Wordt geboekt op rekening 7350 (Reiskosten openbaar vervoer / privéauto)</span>
</div>

<button class="btn" onclick="boek()">Reiskosten boeken</button>
<div id="status" class="status"></div>

<script>
var KM_TARIEF = ${_kmTarief};
function upd(){
  var km=parseFloat(document.getElementById('km').value)||0;
  var b=km*KM_TARIEF;
  document.getElementById('preview').style.display=km>0?'block':'none';
  document.getElementById('aftrek').textContent='€ '+b.toFixed(2).replace('.',',');
}
function boek(){
  var data={
    datum: document.getElementById('datum').value,
    omschr: document.getElementById('omschr').value,
    km: parseFloat(document.getElementById('km').value)||0,
  };
  if(!data.km||data.km<=0){alert('Vul aantal km in');return;}
  if(!data.omschr){alert('Vul omschrijving in');return;}
  var s=document.getElementById('status');
  s.style.display='block';s.className='status';s.textContent='Bezig...';
  google.script.run
    .withSuccessHandler(function(r){
      s.className='status s';
      s.textContent='✓ '+data.km+' km × '+(r.tarief?('€'+r.tarief.toString().replace('.', ',')):'${_kmTariefStr}')+' = '+r.bedrag+' geboekt op rekening 7350.';
      document.getElementById('km').value='';
      document.getElementById('omschr').value='';
      document.getElementById('preview').style.display='none';
      setTimeout(function(){google.script.host.close();},1800);
    })
    .withFailureHandler(function(e){s.className='status e';s.textContent='⚠️ '+(e&&e.message?e.message:'Er ging iets mis. Controleer je invoer.');})
    .boekReiskosten(data);
}
</script>
</body></html>
  `).setWidth(440).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '🚗 Reiskosten registreren');
}

/**
 * Server-side handler: boek reiskosten via journaalpost.
 * Debet 7350 (Reiskosten privé-auto), Credit 2400 (Privé-onttrekkingen).
 * Reden: bij privéauto is er geen bankuitgave — het is een eigen-vervoer-aftrek.
 */
function boekReiskosten(data) {
  const ss = getSpreadsheet_();
  // Strict parsing — voorkomt €0-reiskosten-boeking door corrupt invoer
  const km = parseBedragStrict_(data.km, 'Aantal km');
  if (km <= 0) throw new Error('Aantal km moet groter dan 0 zijn');
  if (km > 9999) throw new Error('Aantal km onwaarschijnlijk hoog (' + km + ') — controleer invoer');
  const datum = parseDatumStrict_(data.datum, 'Datum');
  // Tarief uit BELASTING-config (BELASTING.REISKOSTEN_PER_KM). Bij verhoging
  // door Belastingdienst (zoals €0,19 → €0,23 in 2024) hoeft alleen
  // BELASTING_PER_JAAR aangepast — anders boekt klant te lage aftrek
  // → betaalt te veel belasting.
  const B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const tarief = B.REISKOSTEN_PER_KM || 0.23;
  const bedrag = rondBedrag_(km * tarief);
  const tariefStr = '€' + tarief.toString().replace('.', ',');
  const omschr = (data.omschr || 'Reiskosten') + ' (' + km + ' km × ' + tariefStr + ')';
  maakJournaalpost_(ss, {
    datum: datum,
    omschr: omschr,
    dagboek: 'Memoriaal',
    debet: '7350', credit: '2400',
    bedrag: bedrag,
    type: BOEKING_TYPE.MEMORIAAL,
  });
  safeAuditLog_('Reiskosten geboekt', km + ' km × ' + tariefStr + ' = ' + formatBedrag_(bedrag));
  try { invalideerKpiSnapshot_(); } catch (_) {}
  return { bedrag: formatBedrag_(bedrag), km: km, tarief: tarief };
}

// ─────────────────────────────────────────────
//  REISKOSTEN-WEEK-INVOER (bulk)
// ─────────────────────────────────────────────
//
// Per-rit invoer is omslachtig voor klanten met dagelijkse zakelijke ritten.
// Deze week-tracker laat alle 7 dagen tegelijk invoeren — submit doet
// 1 boeking per dag waarin km is ingevuld.

function toonReiskostenWeek() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const nu = new Date();
  // Tarief uit BELASTING-config (auto-update bij Belastingdienst-verhoging)
  const _B = (typeof getBelasting_ === 'function') ? getBelasting_() : {};
  const _kmTarief = _B.REISKOSTEN_PER_KM || 0.23;
  const _kmTariefStr = '€' + _kmTarief.toString().replace('.', ',');
  // Maandag van de huidige week (of vorige week als 't zondag is)
  const huidigeDag = nu.getDay() === 0 ? 7 : nu.getDay();
  const maandag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - (huidigeDag - 1));
  const dagen = [];
  const dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(maandag.getFullYear(), maandag.getMonth(), maandag.getDate() + i);
    dagen.push({
      datum: d.toISOString().slice(0, 10),
      label: dagNamen[i] + ' ' + d.getDate() + '/' + (d.getMonth() + 1),
    });
  }

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
     padding:18px;font-size:13px;color:#1A1A1A;background:#F7F9FC;margin:0}
h2{color:#0D1B4E;margin:0 0 4px;font-size:18px;font-weight:800}
.sub{color:#5F6B7A;font-size:12px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #E5EAF2}
th{background:#F7F9FC;color:#0D1B4E;text-align:left;padding:9px 10px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-bottom:1px solid #E5EAF2}
td{padding:6px 10px;border-bottom:1px solid #F0F3F7}
td.dag{font-weight:600;color:#0D1B4E;width:36%}
input{width:100%;padding:6px 8px;border:1px solid #E5EAF2;border-radius:5px;font-size:13px;font-family:inherit;background:#fff}
input:focus{outline:none;border-color:#2EC4B6}
input[type=number]{max-width:80px;text-align:right}
.totaal{background:#E6F7F4;font-weight:700;padding:12px;border-radius:8px;margin-top:14px;text-align:center;color:#0D1B4E}
.totaal .km{font-size:18px}
.btn{background:#2EC4B6;color:white;border:none;padding:11px 22px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;width:100%;margin-top:14px}
.btn:hover{background:#28B0A4}
.status{padding:10px;border-radius:6px;margin-top:10px;font-size:12px;display:none}
.status.s{background:#E8F5E9;color:#1B5E20}
.status.e{background:#FFEBEE;color:#B71C1C}
</style></head>
<body>
<h2>🚗 Week-overzicht reiskosten</h2>
<div class="sub">Vul per dag aantal km en omschrijving in. Lege rijen worden overgeslagen. Tarief: ${_kmTariefStr}/km.</div>

<table>
  <tr><th>Dag</th><th>Km</th><th style="width:50%">Omschrijving</th></tr>
${dagen.map((d, i) => `
  <tr>
    <td class="dag">${d.label}<br><span style="font-size:10px;font-weight:400;color:#888">${d.datum}</span></td>
    <td><input type="number" id="km${i}" min="0" step="1" placeholder="0" oninput="upd()"></td>
    <td><input type="text" id="om${i}" placeholder="bijv. Klantbezoek Utrecht"></td>
  </tr>`).join('')}
</table>

<div class="totaal">
  <div>Totaal week:</div>
  <div class="km" id="tot">0 km · € 0,00</div>
</div>

<button class="btn" onclick="boek()">Hele week boeken</button>
<div id="status" class="status"></div>

<script>
var DAGEN=${JSON.stringify(dagen)};
var KM_TARIEF = ${_kmTarief};
function upd(){
  var totKm=0;
  for(var i=0;i<7;i++){totKm+=parseFloat(document.getElementById('km'+i).value)||0;}
  var bedrag=totKm*KM_TARIEF;
  document.getElementById('tot').textContent=totKm+' km · € '+bedrag.toFixed(2).replace('.',',');
}
function boek(){
  var rijen=[];
  for(var i=0;i<7;i++){
    var km=parseFloat(document.getElementById('km'+i).value)||0;
    var om=document.getElementById('om'+i).value.trim();
    if(km>0){rijen.push({datum:DAGEN[i].datum,km:km,omschr:om||DAGEN[i].label});}
  }
  if(rijen.length===0){alert('Vul minimaal 1 dag in');return;}
  var s=document.getElementById('status');
  s.style.display='block';s.className='status';s.textContent='Bezig...';
  google.script.run
    .withSuccessHandler(function(r){
      s.className='status s';
      s.textContent='✓ '+r.aantal+' dagen geboekt, totaal '+r.totaalKm+' km = '+r.totaalBedrag;
      setTimeout(function(){google.script.host.close();},2000);
    })
    .withFailureHandler(function(e){s.className='status e';s.textContent='⚠️ '+(e&&e.message?e.message:'Er ging iets mis. Controleer je invoer.');})
    .boekReiskostenWeek(rijen);
}
</script>
</body></html>
  `).setWidth(540).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, '🚗 Reiskosten week-overzicht');
}

/**
 * Server-side: boek 1-7 reiskostenposten in één call.
 * Hergebruikt boekReiskosten-logica per rij; foutbestendig.
 */
function boekReiskostenWeek(rijen) {
  if (!Array.isArray(rijen) || rijen.length === 0) throw new Error('Geen reiskosten ingevoerd');
  let aantal = 0;
  let totaalKm = 0;
  let totaalBedrag = 0;
  rijen.forEach(function(r) {
    try {
      const res = boekReiskosten({ datum: r.datum, omschr: r.omschr, km: r.km });
      aantal++;
      const km = parseFloat(r.km) || 0;
      totaalKm += km;
      // Gebruik tarief uit het res-object (komt uit BELASTING-config in boekReiskosten);
      // fallback 0,23 alleen als config niet beschikbaar is. Voorheen hardcoded 0,23
      // wat bij tariefwijziging zou drijven van de werkelijke journaalposten.
      totaalBedrag += km * (res && res.tarief || 0.23);
    } catch (e) {
      Logger.log('Reiskosten-week rij ' + r.datum + ' overgeslagen: ' + e.message);
    }
  });
  return {
    aantal: aantal,
    totaalKm: totaalKm,
    totaalBedrag: formatBedrag_(rondBedrag_(totaalBedrag)),
  };
}

// ─────────────────────────────────────────────
//  BTW-SPAARPOT AUTO-BOEKING
// ─────────────────────────────────────────────
//
// Als klant kiest voor automatische BTW-reservering: bij elke verkoopfactuur
// wordt 21%/9% direct apart geboekt op rekening 1205 (BTW-spaarpot).
// Niet meer "oei, ik heb de BTW al uitgegeven" — systeem doet het automatisch.
//
// Wordt aangeroepen vanuit Triggers.verwerkInkomstenUitHoofdformulier_
// als instelling 'BTW automatisch reserveren' = Ja.

function reserveerBtwOpSpaarpot_(ss, factuurnummer, btwBedrag, datum) {
  if (!btwBedrag || btwBedrag <= 0) return;
  const opt = String(getInstelling_('BTW automatisch reserveren') || '').toLowerCase().trim();
  if (opt !== 'ja' && opt !== 'true' && opt !== 'yes') return;

  try {
    maakJournaalpost_(ss, {
      datum: datum || new Date(),
      omschr: 'BTW-reservering ' + factuurnummer + ' (auto)',
      dagboek: 'Memoriaal',
      debet: '1205',  // BTW-spaarpot (zakelijke spaarrekening)
      credit: '1200', // Bank zakelijk
      bedrag: rondBedrag_(btwBedrag),
      ref: factuurnummer,
      type: BOEKING_TYPE.MEMORIAAL,
    });
    schrijfAuditLog_('BTW auto-gereserveerd', factuurnummer + ' → 1205: ' + formatBedrag_(btwBedrag));
  } catch (e) {
    Logger.log('BTW-reservering mislukt voor ' + factuurnummer + ': ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  VOORLOPIGE AANSLAG IB-SCHATTER (per kwartaal)
// ─────────────────────────────────────────────
//
// Per kwartaal: extrapoleer YTD-winst naar jaar, schat IB+Zvw, en geef
// klant een concrete reservering-tip per kwartaal.
// Vele ZZP'ers krijgen aan einde van jaar een navordering omdat ze niets
// reserveerden — deze functie voorkomt dat.

function berekenVoorlopigeAanslag_(ss) {
  if (!ss) ss = getSpreadsheet_();
  const advies = berekenBelastingadvies_(ss);
  const B = getBelasting_();
  const winstYTD = advies.winstVoorAftrek || 0;

  // Bepaal hoeveel maanden van het boekjaar verstreken zijn
  const nu = new Date();
  const boekjaar = (typeof getBoekjaar_ === 'function') ? getBoekjaar_() : nu.getFullYear();
  const startBoekjaar = new Date(boekjaar, 0, 1);
  const verstrekenMs = nu - startBoekjaar;
  const maandenVerstreken = Math.max(1, Math.min(12, verstrekenMs / (1000 * 60 * 60 * 24 * 30.44)));

  // Lineaire extrapolatie naar jaartotaal
  const winstJaarSchatting = winstYTD * (12 / maandenVerstreken);

  // Geschatte fiscale last bij die jaar-winst
  const aftrek = advies.totaalAftrek || 0;
  const aftrekJaar = aftrek * (12 / maandenVerstreken);
  const belastbaar = Math.max(0, winstJaarSchatting - aftrekJaar);
  const ibBruto = berekenIBProgressief_(belastbaar, B, isAowGerechtigd_(B));
  const ahk = berekenHeffingskorting_(belastbaar, B);
  const ak = berekenArbeidskorting_(winstJaarSchatting, B);
  const ibJaar = Math.max(0, rondBedrag_(ibBruto - ahk - ak));
  const zvwJaar = berekenZvw_(winstJaarSchatting, B);
  const totaleLast = rondBedrag_(ibJaar + zvwJaar);

  // Per kwartaal te reserveren
  const perKwartaal = rondBedrag_(totaleLast / 4);

  return {
    winstYTD: rondBedrag_(winstYTD),
    winstJaarSchatting: rondBedrag_(winstJaarSchatting),
    maandenVerstreken: rondBedrag_(maandenVerstreken),
    geschatteIB: ibJaar,
    geschatteZvw: zvwJaar,
    totaleLast: totaleLast,
    perKwartaal: perKwartaal,
  };
}

function toonVoorlopigeAanslagTip() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  let v;
  try { v = berekenVoorlopigeAanslag_(); }
  catch (e) {
    SpreadsheetApp.getUi().alert('Voorlopige aanslag', 'Kon niet berekenen: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const ui = SpreadsheetApp.getUi();
  let bericht = `Voorlopige aanslag-schatting (op basis van YTD-winst):\n\n`;
  bericht += `Winst dit jaar tot nu toe: ${formatBedrag_(v.winstYTD)}\n`;
  bericht += `Geëxtrapoleerd naar heel jaar: ${formatBedrag_(v.winstJaarSchatting)}\n\n`;
  bericht += `Geschatte IB Box 1: ${formatBedrag_(v.geschatteIB)}\n`;
  bericht += `Geschatte Zvw-bijdrage: ${formatBedrag_(v.geschatteZvw)}\n`;
  bericht += `TOTALE FISCALE LAST: ${formatBedrag_(v.totaleLast)}\n\n`;
  bericht += `📦 Reserveer per kwartaal: ${formatBedrag_(v.perKwartaal)}\n`;
  bericht += `📦 Reserveer per maand: ${formatBedrag_(rondBedrag_(v.totaleLast / 12))}\n\n`;
  bericht += `Tip: zet dit bedrag bij elke binnenkomende factuur direct apart op een ` +
             `spaarrekening. Dan staat aan einde jaar het IB-deel klaar voor de aanslag ` +
             `(deadline 1 mei volgend jaar).`;
  ui.alert('💼 Voorlopige aanslag IB+Zvw', bericht, ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  LIJFRENTE-JAARRUIMTE CALCULATOR
// ─────────────────────────────────────────────
//
// Jaarruimte = 30% × premiegrondslag − 6,27 × pensioenaangroei
// (Wet toekomst pensioenen 2023; was 13,3% vóór 2023).
// Premiegrondslag = winst − AOW-franchise.
// Als klant pensioen mist (geen werkgever-pensioen), kan tot ~€38.000
// per jaar gestort worden in lijfrente — aftrekbaar in box 1.
// Vele ZZP'ers laten dit liggen omdat ze de berekening niet snappen.

function toonLijfrenteJaarruimte() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  let advies;
  try { advies = berekenBelastingadvies_(ss); }
  catch (e) {
    SpreadsheetApp.getUi().alert('Lijfrente-calculator', 'Kon huidige situatie niet bepalen: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const B = getBelasting_();
  const winstHuidig = advies.winstVoorAftrek || 0;
  const aowFranchise = B.AOW_FRANCHISE || 14110;
  const lijfrenteMax = B.LIJFRENTE_MAX || 35987;
  // Wet toekomst pensioenen (2023) verhoogde jaarruimte-pct van 13,3% naar 30%.
  // Centraal in BELASTING_PER_JAAR — niet hardcoden in dialog.
  const lijfrentePct = B.LIJFRENTE_PCT || 0.30;
  // Factor A — vermindert grondslag bij reeds opgebouwd pensioen. Wet IB art. 3.127.
  const lijfrenteFactorA = B.LIJFRENTE_FACTOR_A || 6.27;
  // Marginaal IB-tarief (schijf 1) voor besparing-schatting.
  const ibPct1Lijfrente = (B.IB_SCHIJVEN && B.IB_SCHIJVEN[0] && B.IB_SCHIJVEN[0].pct) || 0.37;

  const html = HtmlService.createHtmlOutput(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
     padding:20px;font-size:13px;color:#1A1A1A;background:#F7F9FC;margin:0}
h2{color:#0D1B4E;margin:0 0 4px;font-size:18px;font-weight:800}
.sub{color:#5F6B7A;font-size:12px;margin-bottom:14px}
label{display:block;font-weight:600;font-size:12px;color:#0D1B4E;margin-bottom:4px;margin-top:10px}
input{width:100%;padding:9px 12px;border:1px solid #E5EAF2;border-radius:6px;font-size:14px;font-family:inherit;background:#fff}
input:focus{outline:none;border-color:#2EC4B6}
.help{color:#5F6B7A;font-size:11px;margin-top:3px}
.uitkomst{background:#0D1B4E;color:white;border-radius:8px;padding:16px;margin-top:18px;text-align:center}
.uitkomst .lbl{font-size:11px;letter-spacing:.4px;text-transform:uppercase;opacity:.8}
.uitkomst .v{font-size:24px;font-weight:800;margin-top:4px}
.uitkomst .extra{font-size:12px;margin-top:8px;opacity:.9}
.tip{background:#FFF8E1;border-radius:8px;padding:11px 13px;font-size:11px;color:#5A3F00;margin-top:12px;line-height:1.5}
</style></head>
<body>
<h2>🏦 Lijfrente-jaarruimte calculator</h2>
<div class="sub">Hoeveel mag u dit jaar storten in een lijfrente, fiscaal aftrekbaar in box 1?</div>

<label>Winst dit jaar (uit boekhouding)</label>
<input id="winst" type="number" value="${Math.round(winstHuidig)}" step="500" oninput="bereken()">
<div class="help">Premiegrondslag = winst − AOW-franchise (€${aowFranchise.toLocaleString('nl-NL')}).</div>

<label>Reeds opgebouwd pensioen dit jaar (werkgever / oude jaren)</label>
<input id="pensioen" type="number" value="0" step="100" oninput="bereken()">
<div class="help">Bij geen werkgever-pensioen: 0 invullen.</div>

<div class="uitkomst">
  <div class="lbl">Jaarruimte ${new Date().getFullYear()}</div>
  <div class="v" id="ruimte">€ 0,00</div>
  <div class="extra" id="info"></div>
</div>

<div class="tip">
  <b>💡 Tip:</b> stort vóór 31 december voor aftrek dit jaar.
  Niet-benutte jaarruimte uit afgelopen 7 jaar mag worden ingehaald (reserveringsruimte).
  Voor een nauwkeurige berekening (incl. reserveringsruimte): gebruik de tool op
  belastingdienst.nl/aftrek-en-kortingen → "lijfrentepremie".
</div>

<script>
var FRANCHISE=${aowFranchise}, PCT=${lijfrentePct}, MAX=${lijfrenteMax};
var FACTOR_A=${lijfrenteFactorA}, IB_PCT_1=${ibPct1Lijfrente};
function bereken(){
  var w=parseFloat(document.getElementById('winst').value)||0;
  var p=parseFloat(document.getElementById('pensioen').value)||0;
  var grondslag=Math.max(0,w-FRANCHISE);
  var ruwe=Math.max(0,grondslag*PCT - FACTOR_A*p);
  var jaarruimte=Math.min(ruwe,MAX);
  document.getElementById('ruimte').textContent='€ '+jaarruimte.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.').replace('.',',').replace(/,(\\d\\d)$/,',$1');
  // Schat besparing tegen marginaal IB-tarief schijf 1 (uit BELASTING-config)
  var besp=jaarruimte*IB_PCT_1;
  document.getElementById('info').textContent='~ '+(Math.round(besp))+' € minder belasting bij storting';
}
bereken();
</script>
</body></html>
  `).setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '🏦 Lijfrente-jaarruimte');
}

// ─────────────────────────────────────────────
//  BTW-SPAARPOT REMINDER
// ─────────────────────────────────────────────
//
// Veel ZZP'ers besteden BTW per ongeluk omdat het op de lopende
// rekening staat. Tip: zet 21%/9% direct apart op een spaarrekening.
// Deze functie berekent live hoeveel apart zou moeten staan.

function toonBtwSpaarpot() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  // Bepaal huidig kwartaal-window
  const nu = new Date();
  const kwartaal = Math.floor(nu.getMonth() / 3);
  const kwStart = new Date(nu.getFullYear(), kwartaal * 3, 1);
  const kwEinde = new Date(nu.getFullYear(), kwartaal * 3 + 3, 0, 23, 59, 59, 999);

  let aangifte;
  try { aangifte = berekenBtwAangifte_(ss, kwStart, kwEinde); }
  catch (e) {
    SpreadsheetApp.getUi().alert('BTW-spaarpot', 'Kon BTW niet berekenen: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const bankSaldoSpaar = (function() {
    try {
      const sheet = ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
      if (!sheet) return 0;
      const data = sheet.getDataRange().getValues();
      // Standaard rekening voor BTW-spaarpot: 1205 of 1220 (spaarrekening zakelijk)
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][KOL.GB.code]) === '1205' || String(data[i][KOL.GB.code]) === '1220') {
          return parseFloat(data[i][KOL.GB.saldo]) || 0;
        }
      }
    } catch (_) {}
    return 0;
  })();

  const teReserveren = Math.max(0, aangifte.saldo);
  const tekort = Math.max(0, teReserveren - bankSaldoSpaar);

  const kwLabel = 'Q' + (kwartaal + 1);
  const ui = SpreadsheetApp.getUi();
  let bericht = `Huidige situatie ${kwLabel} ${nu.getFullYear()}:\n\n`;
  bericht += `BTW te betalen tot nu toe: ${formatBedrag_(teReserveren)}\n`;
  bericht += `Op spaarrekening (1205/1220): ${formatBedrag_(bankSaldoSpaar)}\n`;
  bericht += `Tekort op BTW-spaarpot: ${formatBedrag_(tekort)}\n\n`;
  if (tekort > 0) {
    bericht += `⚠️ Reserveer ${formatBedrag_(tekort)} extra op uw spaarrekening om verrassingen ` +
               `bij de aangifte (uiterlijk volgend kwartaal) te voorkomen.\n\n` +
               `Tip: maak het automatisch — zet bij elke binnenkomende factuur 21% direct ` +
               `apart via een vaste opdracht in uw bank-app.`;
  } else {
    bericht += `✓ U heeft genoeg gereserveerd voor uw BTW-aangifte ${kwLabel}!`;
  }
  ui.alert('💰 BTW-spaarpot status', bericht, ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  SLIMME BOEKING-TIPS — proactief bij inkoop
// ─────────────────────────────────────────────
/**
 * Genereert tips bij een net-geboekte uitgave/inkoop.
 * Klant ziet direct of er fiscaal voordeel mogelijk is dat hij/zij anders
 * over het hoofd zou zien. Resultaat: array van tip-strings (max 3, kort).
 *
 * @param {Object} data Geboekte data: { leverancier, omschr, bedrag, categorie, kostenRek }
 * @return {string[]} Lijst tip-strings (kan leeg).
 */
function genereerSlimmeBoekingTips_(data) {
  const tips = [];
  if (!data) return tips;
  const bedrag = parseFloat(data.bedrag) || 0;
  const omschr = String(data.omschr || '').toLowerCase();
  const lev = String(data.leverancier || '').toLowerCase();
  const cat = String(data.categorie || '').toLowerCase();
  const kostenRek = String(data.kostenRek || '');

  // Tip 1: Bedrag ≥ activeerGrens en NIET op 02xx-rekening → mogelijke investering
  let B = null;
  try { B = getBelasting_(); } catch (_) {}
  const activeerGrens = (B && B.ACTIVEER_GRENS) || 450;
  if (bedrag >= activeerGrens && kostenRek && !kostenRek.startsWith('0')) {
    tips.push(
      '💡 Bedrag ≥ €' + activeerGrens + ' — overweeg of dit een investering is ' +
      '(boeken op 02xx-rekening, jaarlijks afschrijven). ' +
      'Dat geeft mogelijk recht op KIA (28% extra aftrek).'
    );
  }

  // Tip 2: AOV-detectie
  if (/aov|arbeidsongeschikt/i.test(omschr) || /aov|arbeidsongeschikt/i.test(lev)) {
    tips.push(
      '💡 AOV-premie: dit is GEEN bedrijfskost maar AFTREKBAAR in box 1 ' +
      'als "uitgaven inkomensvoorzieningen". 35-49,5% terug bij IB-aangifte.'
    );
  }

  // Tip 3: EIA-trigger (energie/zonne/warmtepomp)
  if (bedrag >= 2500 && /energie|zonn?epaneel|zonn?epanelen|warmtepomp|isolat|led|elektr.?aut|laadpaal/i.test(omschr + ' ' + lev)) {
    tips.push(
      '💡 Mogelijk EIA-aftrek (40%) op deze energie-investering. ' +
      'Boek op 02xx-rekening + meld aan bij RVO binnen 3 maanden via rvo.nl/eia.'
    );
  }

  // Tip 4: KIA-grens net bereikt — moedig nog meer aan dit jaar
  if (bedrag >= ((B && B.KIA_MIN) || 2901) - 500 && bedrag < ((B && B.KIA_MIN) || 2901)) {
    const tekort = ((B && B.KIA_MIN) || 2901) - bedrag;
    tips.push(
      '💡 Nog ' + formatBedrag_(tekort) + ' extra investering nodig dit jaar voor KIA-aftrek (28%).'
    );
  }

  // Tip 5: Reiskosten-categorie zonder km-administratie
  if (/reis|kilometer|km|brandstof|tankstation|shell|bp|esso|texaco/i.test(omschr + ' ' + lev) &&
      !/km|kilometer/i.test(omschr) && bedrag > 30) {
    tips.push(
      '💡 Reisuitgave gedetecteerd — vergeet niet uw km bij te houden. ' +
      'Met privéauto: €0,23/km is aftrekbaar (gebruik =KM_VERGOEDING in een nieuwe rij).'
    );
  }

  // Tip 6: Thuiswerk-relevante kosten (internet/telefoon)
  if (/internet|kpn|t-mobile|vodafone|ziggo|odido|mobiel/i.test(omschr + ' ' + lev) && bedrag > 0) {
    const thuiswerkInst = String(getInstelling_('Thuiswerk dagen per jaar') || '').trim();
    if (!thuiswerkInst || parseInt(thuiswerkInst, 10) === 0) {
      tips.push(
        '💡 Telecomkosten geboekt — vul "Thuiswerk dagen per jaar" in via Instellingen. ' +
        'Bij thuiswerk is €2,40/dag aftrekbaar (€624 bij 260 werkdagen).'
      );
    }
  }

  return tips.slice(0, 3); // Max 3 tips per boeking — niet overweldigen
}

// ─────────────────────────────────────────────
//  WAT-ALS SIMULATOR (CORE BEREKENING)
// ─────────────────────────────────────────────

/**
 * Simuleert impact van extra omzet of extra investering op fiscale last.
 * Klant kan zelf scenario's spelen zonder code te wijzigen.
 *
 * @param {Object} basis    Resultaat van berekenBelastingadvies_().
 * @param {Object} BELASTING getBelasting_() output.
 * @param {Object} mutatie  { extraOmzet?, extraInvestering?, extraLijfrente? }
 * @return {Object} Simulatie-resultaat met delta's.
 */
function simuleerWatAls_(basis, BELASTING, mutatie) {
  if (!basis || !BELASTING) return null;
  const huidig = {
    winst: basis.winstVoorAftrek || 0,
    aftrek: basis.totaalAftrek || 0,
    ib: basis.geschatteIB || 0,
    zvw: basis.zvwBijdrage || 0,
    totaal: basis.totaleFiscaleLast || basis.geschatteIB || 0,
  };

  const nieuw = {
    winst: huidig.winst + (parseFloat(mutatie.extraOmzet) || 0),
    aftrek: huidig.aftrek,
  };

  // Extra investering — kan KIA-aftrek genereren
  if (mutatie.extraInvestering > 0) {
    const huidigeInv = parseFloat(getInstelling_('Huidige investeringen YTD')) || 0;
    const nieuweInv = huidigeInv + parseFloat(mutatie.extraInvestering);
    const nieuweKia = berekenKiaAftrek_(nieuweInv, BELASTING);
    const huidigeKia = berekenKiaAftrek_(huidigeInv, BELASTING);
    nieuw.aftrek += (nieuweKia - huidigeKia);
  }

  // Extra lijfrente-storting (binnen jaarruimte)
  if (mutatie.extraLijfrente > 0) {
    nieuw.aftrek += parseFloat(mutatie.extraLijfrente);
  }

  // Recompute IB + Zvw — AOW-status uit instellingen, niet hardcoded false
  // (voorheen onderschatting van ~20% voor AOW-gerechtigden).
  const belastbaar = Math.max(0, nieuw.winst - nieuw.aftrek);
  const aow = isAowGerechtigd_(BELASTING);
  const ibBruto = berekenIBProgressief_(belastbaar, BELASTING, aow);
  const ahk = berekenHeffingskorting_(belastbaar, BELASTING);
  const ak = berekenArbeidskorting_(nieuw.winst, BELASTING);
  nieuw.ib = Math.max(0, rondBedrag_(ibBruto - ahk - ak));
  nieuw.zvw = berekenZvw_(nieuw.winst, BELASTING);
  nieuw.totaal = rondBedrag_(nieuw.ib + nieuw.zvw);

  return {
    huidig: huidig,
    nieuw: nieuw,
    deltaWinst: nieuw.winst - huidig.winst,
    deltaAftrek: nieuw.aftrek - huidig.aftrek,
    deltaIB: nieuw.ib - huidig.ib,
    deltaZvw: nieuw.zvw - huidig.zvw,
    deltaTotaal: rondBedrag_(nieuw.totaal - huidig.totaal),
    nettoEffect: rondBedrag_((mutatie.extraOmzet || 0) - (nieuw.totaal - huidig.totaal)),
  };
}

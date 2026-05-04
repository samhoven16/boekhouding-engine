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
  const marginaalTarief = winst > BELASTING.IB_SCHIJF_1_MAX ? 0.495 : effectiefTarief;

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
        `Maak een einde-jaar-overzicht via Boekhouding → BTW → BTW-aangifte Q4.`,
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
        `Boekhouding → Belastingadvies geeft een schatting van uw IB-aanslag.`,
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
        `zelfstandigenaftrek (€2.470), startersaftrek (€2.123 eerste 3 jaar), ` +
        `MKB-winstvrijstelling (12,7%), KIA, MIA/VAMIL, EIA, AOV-premie, lijfrente. ` +
        `Open Boekhouding → Belastingadvies voor een volledig overzicht.`,
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
        `Boekhouding → BTW → BTW-aangifte ${kwLabel} genereert het overzicht. ` +
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
        `• KIA: investeringen tussen €2.901 en €130.744 → 28% extra aftrek\n` +
        `• MIA/VAMIL: milieu-investeringen op RVO Milieulijst → 27-45% aftrek\n` +
        `• EIA: energie-investeringen op RVO Energielijst → 40% aftrek\n` +
        `• Lijfrente-storting: tot jaarruimte (~13,3% premiegrondslag)\n` +
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
      `missen €500-€1.500 aftrek per jaar. Voer in via Boekhouding → Nieuwe boeking.`,
    deadline: null,
    urgent: false,
  };
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
    <button class="btn" onclick="simuleer()">Bereken impact</button>
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
  <strong>💡 Tip:</strong> Investeringen tussen €2.901 en €69.765 geven 28% KIA-aftrek
  (max €19.769). Lijfrente-storting voor jaareinde benut jaarruimte (vervalt 7 jaar later).
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
    .withFailureHandler(function(e){alert('Fout: '+e.message);})
    .runWatAlsSimulator(data);
}
</script>
</body></html>
  `).setWidth(540).setHeight(620);

  SpreadsheetApp.getUi().showModalDialog(html, '💡 Wat-als simulator');
}

/**
 * Server-side handler voor de wat-als-dialog. Roept simuleerWatAls_ aan
 * met huidige fiscale situatie als basis.
 */
function runWatAlsSimulator(mutatie) {
  const ss = getSpreadsheet_();
  const basis = berekenBelastingadvies_(ss);
  const B = getBelasting_();
  return simuleerWatAls_(basis, B, mutatie || {});
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

  // Recompute IB + Zvw
  const belastbaar = Math.max(0, nieuw.winst - nieuw.aftrek);
  const ibBruto = berekenIBProgressief_(belastbaar, BELASTING, false);
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

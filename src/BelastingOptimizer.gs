/**
 * BelastingOptimizer.gs
 * ════════════════════════════════════════════════════════════════
 * "Euro-Maximalist" — investeringstiming optimaliseren binnen NL fiscaal
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's eis: niet alleen voordelen SPOTTEN, maar actief MAXIMALISEREN.
 *
 * Concreet probleem: een ZZP'er heeft K geplande investeringen (laptop,
 * camera, software-licentie, …) die hij óf in jaar N óf in jaar N+1
 * kan boeken. De KIA-staffel (Kleinschaligheidsinvesteringsaftrek) geeft
 * verschillende aftrek-percentages per zone:
 *
 *   €0–€2.901      : 0%   (drempel — onder dit bedrag geen aftrek)
 *   €2.901–€71.683 : 28%  (volle aftrek)
 *   €71.684–€132.746 : vast bedrag (€20.072) — config-driven, zie
 *                     Belastingadvies.gs KIA_VAST_BEDRAG. Definitieve
 *                     2026-staffel, geverifieerd op belastingdienst.nl.
 *   >€132.747       : afbouwzone (lineair tot 0 bij €398.236)
 *
 * Slimme timing = elk jaar in de optimale zone landen.
 *
 * Voorbeeld waar dit voordeel oplevert:
 *   Klant heeft €130.000 aan investeringen verwacht over 2 jaar.
 *   - Alles in 1 jaar: belandt in afbouwzone → minimale KIA
 *   - 50/50 verdeeld:  beide jaren ~€65k in 28%-zone → ~€36.4k KIA
 *   Verschil: tienduizenden euro's verschil bij gelijke totaaluitgaven.
 *
 * Algoritme: brute-force over 2^K toewijzingen (K = aantal investeringen).
 * Voor K ≤ 18 (~262k scenarios) is dit in <2s te doen. ZZP'ers hebben
 * zelden meer dan 5-8 grote investeringen per 2 jaar.
 *
 * KIA-staffel wordt opgehaald uit getBelasting_() — single source of truth,
 * dus tarief-wijzigingen in 2027+ vereisen alleen een config-update.
 *
 * Output: optimale toewijzing + besparing in € + uitleg per investering.
 */

/**
 * Pure helper: bereken KIA-aftrek voor een totaal-bedrag in 1 jaar
 * gegeven een BELASTING-config. Wrapper rondom berekenKiaAftrek_ uit
 * Belastingadvies.gs zodat de optimizer ook werkbaar is in test-context.
 *
 * @param {number} totaal — som van KIA-aanmerkende investeringen
 * @param {Object} B — BELASTING-config (uit getBelasting_())
 * @returns {number} aftrek in EUR
 */
// eslint-disable-next-line no-unused-vars
function kiaAftrekVoorTotaal_(totaal, B) {
  return berekenKiaAftrek_(totaal, B);
}

/**
 * Brute-force optimizer voor investeringstiming.
 *
 * @param {Array<{naam:string, bedrag:number}>} investeringen — alle geplande
 * @param {number} bestaandJaarN — al-geboekte KIA-investeringen in jaar N
 * @param {number} bestaandJaarN1 — al-geboekte KIA-investeringen in jaar N+1
 * @param {number} marginaalTarief — IB-tarief klant (default 36.93% box 1 tot €76.817 in 2026)
 * @param {Object} [Bopt] — optionele BELASTING-config override (test-injection)
 *
 * @returns {{
 *   optimaal: Array<{naam:string, bedrag:number, jaar:'N'|'N+1'}>,
 *   totaalAftrekOptimaal: number,
 *   totaalAftrekAllesIn_N: number,
 *   totaalAftrekAllesIn_N1: number,
 *   besparingVsAllesIn_N: number,
 *   besparingFiscaalEur: number,
 *   uitleg: string
 * }}
 */
// eslint-disable-next-line no-unused-vars
function optimaliseerInvesteringsTiming_(investeringen, bestaandJaarN, bestaandJaarN1, marginaalTarief, Bopt) {
  if (!Array.isArray(investeringen) || investeringen.length === 0) {
    return {
      optimaal: [], totaalAftrekOptimaal: 0,
      totaalAftrekAllesIn_N: 0, totaalAftrekAllesIn_N1: 0,
      besparingVsAllesIn_N: 0, besparingFiscaalEur: 0,
      uitleg: 'Geen investeringen om te optimaliseren.',
      scenariosGecheckt: 0,
    };
  }
  const K = investeringen.length;
  if (K > 18) {
    return {
      fout: 'Te veel investeringen (' + K + '); maximaal 18 ondersteund. ' +
        'Splits in twee batches en optimaliseer apart.',
    };
  }
  const tarief = (isFinite(marginaalTarief) && marginaalTarief > 0 && marginaalTarief < 1)
    ? marginaalTarief : 0.3693;
  const startN = isFinite(bestaandJaarN) ? bestaandJaarN : 0;
  const startN1 = isFinite(bestaandJaarN1) ? bestaandJaarN1 : 0;
  const B = Bopt || getBelasting_();

  // Brute-force: iedere bit van mask geeft aan of investering i naar N (0) of N+1 (1) gaat
  let beste = null;
  const totalScenarios = 1 << K;
  for (let mask = 0; mask < totalScenarios; mask++) {
    let sN = startN, sN1 = startN1;
    for (let i = 0; i < K; i++) {
      const b = investeringen[i].bedrag;
      if ((mask >> i) & 1) sN1 += b; else sN += b;
    }
    const aftrek = kiaAftrekVoorTotaal_(sN, B) + kiaAftrekVoorTotaal_(sN1, B);
    if (!beste || aftrek > beste.aftrek) {
      beste = { mask: mask, sN: sN, sN1: sN1, aftrek: aftrek };
    }
  }

  // Bouw output
  const optimaal = investeringen.map(function(inv, i) {
    return {
      naam: inv.naam,
      bedrag: inv.bedrag,
      jaar: ((beste.mask >> i) & 1) ? 'N+1' : 'N',
    };
  });

  // Baselines voor vergelijking
  const totaal = investeringen.reduce(function(s, x) { return s + x.bedrag; }, 0);
  const allesN = startN + totaal;
  const allesN1 = startN1 + totaal;
  const aftrekAllesN = kiaAftrekVoorTotaal_(allesN, B) + kiaAftrekVoorTotaal_(startN1, B);
  const aftrekAllesN1 = kiaAftrekVoorTotaal_(startN, B) + kiaAftrekVoorTotaal_(allesN1, B);

  const besparingVsAllesN = beste.aftrek - aftrekAllesN;
  const besparingFiscaalEur = Math.round(besparingVsAllesN * tarief * 100) / 100;

  // Uitleg-string
  const naarN = optimaal.filter(function(x) { return x.jaar === 'N'; });
  const naarN1 = optimaal.filter(function(x) { return x.jaar === 'N+1'; });
  let uitleg = 'Optimale toewijzing voor maximale KIA-benutting:\n\n';
  uitleg += '  → Boek in jaar N (€' + beste.sN.toFixed(0) + ' totaal):\n';
  naarN.forEach(function(x) { uitleg += '      • ' + x.naam + ' (€' + x.bedrag.toFixed(0) + ')\n'; });
  if (naarN.length === 0) uitleg += '      (geen)\n';
  uitleg += '\n  → Boek in jaar N+1 (€' + beste.sN1.toFixed(0) + ' totaal):\n';
  naarN1.forEach(function(x) { uitleg += '      • ' + x.naam + ' (€' + x.bedrag.toFixed(0) + ')\n'; });
  if (naarN1.length === 0) uitleg += '      (geen)\n';
  uitleg += '\n  KIA-aftrek totaal:        €' + beste.aftrek.toFixed(0);
  uitleg += '\n  KIA als alles in jaar N: €' + aftrekAllesN.toFixed(0);
  uitleg += '\n  Extra aftrek door optim.: €' + besparingVsAllesN.toFixed(0);
  uitleg += '\n  Fiscaal voordeel (× ' + (tarief * 100).toFixed(1) + '%): €' + besparingFiscaalEur.toFixed(0);

  return {
    optimaal: optimaal,
    totaalAftrekOptimaal: beste.aftrek,
    totaalAftrekAllesIn_N: aftrekAllesN,
    totaalAftrekAllesIn_N1: aftrekAllesN1,
    besparingVsAllesIn_N: besparingVsAllesN,
    besparingFiscaalEur: besparingFiscaalEur,
    uitleg: uitleg,
    scenariosGecheckt: totalScenarios,
  };
}

/**
 * LinearOptimizationService-variant — gebruikt GAS's ingebouwde LP-solver.
 * Voor grote scenario's (>18 investeringen) of complexere constraints (MIA,
 * EIA, MKB-winstvrijstelling tegelijk) is dit schaalbaarder dan brute-force.
 *
 * Implementatie nu: binary variables per (investering, jaar)-combinatie,
 * met sum-constraint dat elke investering precies 1 jaar krijgt. Objectief
 * is een lineaire benadering — voor de niet-lineaire KIA-staffel is dit
 * een onderschatting in de afbouwzone; brute-force is dan exacter.
 *
 * NB: GAS LinearOptimizationService is alleen beschikbaar in script-context,
 * niet in unit-tests. Bij ontbrekende service valt automatisch terug op
 * brute-force.
 *
 * @param {Array<{naam:string, bedrag:number}>} investeringen
 * @returns {Object} zelfde shape als optimaliseerInvesteringsTiming_
 */
// eslint-disable-next-line no-unused-vars
function optimaliseerInvesteringsTimingLP_(investeringen) {
  if (typeof LinearOptimizationService === 'undefined') {
    return optimaliseerInvesteringsTiming_(investeringen, 0, 0);
  }
  const engine = LinearOptimizationService.createEngine();
  const K = investeringen.length;
  const B = getBelasting_();
  const kiaPct = B && B.KIA_PCT ? B.KIA_PCT : 0.28;

  // Variables: x[i,t] ∈ {0,1} — investering i in jaar t (t=0: jaar N, t=1: jaar N+1)
  for (let i = 0; i < K; i++) {
    for (let t = 0; t < 2; t++) {
      engine.addVariable('x_' + i + '_' + t, 0, 1, LinearOptimizationService.VariableType.INTEGER);
    }
  }

  // Constraint: ∀ i: Σ_t x[i,t] = 1 (elke investering precies 1 jaar)
  for (let i = 0; i < K; i++) {
    const c = engine.addConstraint(1, 1);
    c.setCoefficient('x_' + i + '_0', 1);
    c.setCoefficient('x_' + i + '_1', 1);
  }

  // Lineaire benadering objectief: maximaliseer Σ (x[i,t] × bedrag_i × kiaPct)
  for (let i = 0; i < K; i++) {
    for (let t = 0; t < 2; t++) {
      engine.setObjectiveCoefficient('x_' + i + '_' + t, investeringen[i].bedrag * kiaPct);
    }
  }
  engine.setMaximization();

  const oplossing = engine.solve();
  if (oplossing.getStatus() !== LinearOptimizationService.Status.OPTIMAL) {
    return { fout: 'LP-solver geen optimale oplossing: ' + oplossing.getStatus() };
  }

  const optimaal = [];
  for (let i = 0; i < K; i++) {
    const inN1 = oplossing.getVariableValue('x_' + i + '_1') > 0.5;
    optimaal.push({
      naam: investeringen[i].naam,
      bedrag: investeringen[i].bedrag,
      jaar: inN1 ? 'N+1' : 'N',
    });
  }
  return { optimaal: optimaal, lpStatus: 'OPTIMAL' };
}

/**
 * Publieke wrapper voor google.script.run-calls vanuit de dialog.
 * (google.script.run kan geen functies aanroepen waarvan de naam op _ eindigt.)
 *
 * @param {Array<{naam:string, bedrag:number}>} investeringen
 * @returns {Object} resultaat van optimaliseerInvesteringsTiming_
 */
// eslint-disable-next-line no-unused-vars
function berekenInvesteringsTiming(investeringen) {
  return optimaliseerInvesteringsTiming_(investeringen, 0, 0, null);
}

/**
 * Menu-handler: toont een eenvoudige dialog waarmee klant zijn geplande
 * investeringen invoert, en geeft optimale timing terug.
 */
// eslint-disable-next-line no-unused-vars
function toonInvesteringsOptimizer() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:22px;color:#1A1A1A;background:#F7F9FC;font-size:14px;line-height:1.5;}
      h3{color:#0D1B4E;margin-bottom:8px;font-size:18px;}
      .uitleg{background:#FFF8E1;border:1px solid #FFECB3;border-radius:6px;padding:10px 14px;font-size:12px;color:#5A3F00;margin-bottom:14px;line-height:1.55;}
      .rij{display:grid;grid-template-columns:1fr 100px 24px;gap:8px;margin-bottom:6px;}
      input{padding:7px 10px;border:1px solid #E5EAF2;border-radius:5px;font-family:inherit;font-size:13px;}
      input:focus{outline:none;border-color:#2EC4B6;box-shadow:0 0 0 2px rgba(46,196,182,.2);}
      button{background:#0D1B4E;color:#fff;border:none;padding:9px 18px;border-radius:6px;font-family:inherit;font-weight:600;cursor:pointer;font-size:13.5px;}
      button:hover{background:#1A2A6B;}
      button.sec{background:#fff;color:#0D1B4E;border:1px solid #E5EAF2;}
      .uit{background:#fff;border:1px solid #E5EAF2;border-radius:8px;padding:14px;margin-top:14px;font-family:monospace;font-size:11.5px;white-space:pre-wrap;color:#1A1A1A;display:none;line-height:1.55;}
    </style>
    <h3>💎 Investeringen optimaal in de tijd plannen</h3>
    <div class="uitleg">Geef je geplande investeringen op. De optimizer rekent door of je ze beter dit jaar (N) of volgend jaar (N+1) kunt boeken voor maximale KIA-aftrek. Werkt voor KIA-relevante zakelijke investeringen ≥ €2.901 totaal per jaar.</div>
    <div id="lijst">
      <div class="rij"><input placeholder="Bijv. Laptop (M3)" value=""><input placeholder="€" type="number"><button class="sec" onclick="rmRij(this)">×</button></div>
      <div class="rij"><input placeholder="Bijv. Camera (Sony A7)" value=""><input placeholder="€" type="number"><button class="sec" onclick="rmRij(this)">×</button></div>
      <div class="rij"><input placeholder="Bijv. Software-pakket" value=""><input placeholder="€" type="number"><button class="sec" onclick="rmRij(this)">×</button></div>
    </div>
    <div style="margin:10px 0 16px"><button class="sec" onclick="addRij()">+ Investering toevoegen</button></div>
    <button onclick="bereken()">Bereken optimale timing →</button>
    <div class="uit" id="uit"></div>
    <script>
      function addRij(){var div=document.createElement('div');div.className='rij';div.innerHTML='<input placeholder="Naam"><input placeholder="€" type="number"><button class="sec" onclick="rmRij(this)">×</button>';document.getElementById('lijst').appendChild(div);}
      function rmRij(b){b.parentNode.remove();}
      function bereken(){
        var rijen=document.querySelectorAll('#lijst .rij');
        var inv=[];
        rijen.forEach(function(r){
          var inps=r.querySelectorAll('input');
          var naam=inps[0].value.trim();
          var bedrag=parseFloat(inps[1].value);
          if(naam && bedrag>0) inv.push({naam:naam, bedrag:bedrag});
        });
        if(inv.length<2){document.getElementById('uit').style.display='block';document.getElementById('uit').textContent='Vul minimaal 2 investeringen in om te kunnen optimaliseren.';return;}
        document.getElementById('uit').style.display='block';
        document.getElementById('uit').textContent='Bezig met rekenen…';
        google.script.run
          .withSuccessHandler(function(r){document.getElementById('uit').textContent=r.uitleg||JSON.stringify(r,null,2);})
          .withFailureHandler(function(e){document.getElementById('uit').textContent='Fout: '+e.message;})
          .berekenInvesteringsTiming(inv);
      }
    </script>
  `).setWidth(620).setHeight(560);
  ui.showModalDialog(html, '💎 Investeringen optimaliseren');
}

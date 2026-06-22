/**
 * Engagement.gs — NPS + Achievements + Year-end + Refund-flow
 *
 * Klant-tevredenheid + fun + business-metrics in één module.
 *
 * Achievements: gamification — kleine dopamine-hits voor belangrijke
 * mijlpalen ("eerste factuur", "100 facturen", "1 jaar boekhoudbaar").
 * Toon discrete toast bij dashboard-refresh, één keer per achievement.
 *
 * NPS-survey: na 30/90/365 dagen open een 1-vraag-modal.
 * Year-end-cinemagram: 1 januari toont scroll-storytelling van vorig jaar.
 */

// ─────────────────────────────────────────────
//  ACHIEVEMENT-SYSTEEM
// ─────────────────────────────────────────────

const ACHIEVEMENTS = {
  EERSTE_FACTUUR:    { titel: 'Eerste factuur',         emoji: '🥇', tekst: 'Je hebt je allereerste factuur verstuurd. Het begin is gemaakt.' },
  HONDERD_FACTUREN:  { titel: '100 facturen',           emoji: '💯', tekst: 'Honderd facturen onder je riem. Niet bepaald een hobby meer.' },
  EEN_JAAR:          { titel: '1 jaar Boekhoudbaar',    emoji: '🎂', tekst: 'Een vol jaar met Boekhoudbaar. Stevig gefundeerd.' },
  EERSTE_BTW:        { titel: 'Eerste BTW-aangifte',    emoji: '📋', tekst: 'Eerste kwartaal-BTW gedaan. Belastingdienst tevreden, jij ook.' },
  GEEN_FOUTEN_12M:   { titel: '0 fouten in 12 maanden', emoji: '🛡️', tekst: 'Een jaar zonder Belastingdienst-correctie. Strak geboekt.' },
  TIEN_KLANTEN:      { titel: '10 unieke klanten',      emoji: '🤝', tekst: 'Tien verschillende klanten. Diversificatie betaalt.' },
  BTW_TERUG:         { titel: 'Eerste BTW-teruggaaf',   emoji: '💰', tekst: 'Geld terug van de Belastingdienst. Investeringen lonen.' },
};

const ACHIEVEMENT_PROP = 'achievementsBehaald';

/**
 * Detecteer welke achievements net behaald zijn (sinds laatste check).
 * Roep aan vanuit vernieuwDashboard().
 */
function checkAchievements_() {
  try {
    const ss = getSpreadsheet_();
    if (!ss) return [];
    const props = PropertiesService.getScriptProperties();
    const reedsBehaald = JSON.parse(props.getProperty(ACHIEVEMENT_PROP) || '[]');
    const reedsSet = new Set(reedsBehaald);
    const nieuwe = [];

    // Tellingen
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const facturenAantal = vfSheet ? Math.max(0, vfSheet.getLastRow() - 1) : 0;

    if (facturenAantal >= 1 && !reedsSet.has('EERSTE_FACTUUR')) nieuwe.push('EERSTE_FACTUUR');
    if (facturenAantal >= 100 && !reedsSet.has('HONDERD_FACTUREN')) nieuwe.push('HONDERD_FACTUREN');

    // Unieke klanten
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getDataRange().getValues();
      const klanten = new Set();
      for (let i = 1; i < data.length; i++) {
        const k = String(data[i][KOL.VF.klantId] || '').trim();
        if (k) klanten.add(k);
      }
      if (klanten.size >= 10 && !reedsSet.has('TIEN_KLANTEN')) nieuwe.push('TIEN_KLANTEN');
    }

    // 1 jaar (setupDate)
    const setupTs = parseInt(props.getProperty('setupTimestamp') || '0');
    if (setupTs && (Date.now() - setupTs) >= 365 * 86400000 && !reedsSet.has('EEN_JAAR')) {
      nieuwe.push('EEN_JAAR');
    }

    // Eerste BTW-aangifte (snapshot bestaat)
    const btwSnapshot = props.getProperty('BTW_SNAPSHOTS');
    if (btwSnapshot && btwSnapshot.length > 5 && !reedsSet.has('EERSTE_BTW')) {
      nieuwe.push('EERSTE_BTW');
    }

    if (nieuwe.length === 0) return [];

    // Persist + log
    nieuwe.forEach(function(a) { reedsBehaald.push(a); });
    props.setProperty(ACHIEVEMENT_PROP, JSON.stringify(reedsBehaald));
    nieuwe.forEach(function(a) {
      safeAuditLog_('Achievement unlocked', a);
    });
    return nieuwe.map(function(a) { return Object.assign({ id: a }, ACHIEVEMENTS[a]); });
  } catch (e) {
    Logger.log('checkAchievements_ silent fail: ' + e.message);
    return [];
  }
}

/**
 * Toon achievement-toast (groot, 8s zichtbaar).
 * Aangeroepen vanuit vernieuwDashboard.
 */
function toonAchievementToast_(achievements) {
  if (!achievements || achievements.length === 0) return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss || !ss.toast) return;
    achievements.forEach(function(a) {
      ss.toast(a.tekst, '🏆 Achievement: ' + a.emoji + ' ' + a.titel, 8);
    });
  } catch (_) {}
}

/**
 * Menu-entry: toon overzicht behaalde achievements.
 */
function toonAchievementsOverzicht() {
  const props = PropertiesService.getScriptProperties();
  // CYCLE-54: veilig parsen — corrupt prop zou anders het menu doen crashen
  const behaald = parseJsonVeilig_(props.getProperty(ACHIEVEMENT_PROP), []);
  const ui = SpreadsheetApp.getUi();
  const totaal = Object.keys(ACHIEVEMENTS).length;
  const lijst = Object.keys(ACHIEVEMENTS).map(function(k) {
    const a = ACHIEVEMENTS[k];
    const heeft = behaald.indexOf(k) !== -1;
    return (heeft ? '✅ ' : '⬜ ') + a.emoji + ' ' + a.titel + ' — ' + a.tekst;
  }).join('\n\n');
  ui.alert('🏆 Achievements (' + behaald.length + '/' + totaal + ')', lijst, ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────
//  NPS-SURVEY
// ─────────────────────────────────────────────

const NPS_PROP_LAATSTE = 'npsLaatsteToon';
const NPS_PROP_RESPONSE = 'npsResponses';

/**
 * Trigger NPS-survey op gepaste momenten:
 * - Dag 30: eerste keer
 * - Dag 90: tweede keer (als geen 1e response)
 * - Dag 365: jaarlijks
 *
 * Niet-blokkerend toast. Klik → opent modal.
 */
function checkNpsTrigger_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const setupTs = parseInt(props.getProperty('setupTimestamp') || '0');
    if (!setupTs) return;
    const dagenSinds = (Date.now() - setupTs) / 86400000;
    const laatsteToon = parseInt(props.getProperty(NPS_PROP_LAATSTE) || '0');
    const dagenSindsLaatste = laatsteToon ? (Date.now() - laatsteToon) / 86400000 : Infinity;

    let triggerNu = false;
    if (dagenSinds >= 30 && laatsteToon === 0) triggerNu = true;
    else if (dagenSinds >= 90 && dagenSindsLaatste >= 60) triggerNu = true;
    else if (dagenSinds >= 365 && dagenSindsLaatste >= 180) triggerNu = true;
    if (!triggerNu) return;

    props.setProperty(NPS_PROP_LAATSTE, String(Date.now()));
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && ss.toast) {
      ss.toast('Klik op Boekhoudbaar → Geef feedback (NPS) om je score te delen.', '📊 1-vraag-survey', 12);
    }
  } catch (_) {}
}

/**
 * Open NPS-modal.
 */
function toonNpsSurvey() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;font-size:14px;background:#F7F9FC;color:#1A1A1A;margin:0}
      h2{color:#0D1B4E;margin:0 0 8px;font-size:20px;font-weight:800}
      p{color:#5F6B7A;font-size:13px;margin:0 0 18px;line-height:1.5}
      .scores{display:grid;grid-template-columns:repeat(11,1fr);gap:6px;margin:16px 0}
      .score{padding:14px 0;border:1px solid #E5EAF2;border-radius:8px;text-align:center;font-weight:700;cursor:pointer;background:#fff;transition:all .15s;font-size:14px}
      .score:hover{border-color:#2EC4B6;transform:translateY(-1px)}
      .score.selected{background:#2EC4B6;color:#0A4744;border-color:#2EC4B6}
      .laag{color:#5F6B7A}.midden{color:#F59E0B}.hoog{color:#1B5E20}
      .anchors{display:flex;justify-content:space-between;font-size:11px;color:#5F6B7A;margin:0 4px}
      textarea{width:100%;padding:10px 12px;border:1px solid #E5EAF2;border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;min-height:80px;margin-top:14px}
      .btn{background:#0D1B4E;color:#fff;padding:10px 20px;border:none;border-radius:8px;font-weight:600;cursor:pointer;width:100%;margin-top:14px;font-family:inherit;font-size:14px}
      .btn:disabled{background:#9CA3B0;cursor:not-allowed}
      #status{margin-top:10px;font-size:13px;color:#1B5E20;display:none;text-align:center}
    </style>
    <h2>📊 Hoe waarschijnlijk beveel je Boekhoudbaar aan?</h2>
    <p>Aan een vriend, collega of mede-ondernemer. 0 = absoluut niet, 10 = zeker weten.</p>
    <div class="scores" id="scores"></div>
    <div class="anchors"><span>Niet aanbevelen</span><span>Beslist aanbevelen</span></div>
    <textarea id="opmerking" placeholder="Wat zou er volgens jou nóg beter kunnen?"></textarea>
    <button class="btn" id="btnSubmit" disabled>Verstuur</button>
    <p id="status"></p>
    <script>
      var gekozen = null;
      var grid = document.getElementById('scores');
      for (var i = 0; i <= 10; i++) {
        var b = document.createElement('div');
        b.className = 'score ' + (i <= 6 ? 'laag' : i <= 8 ? 'midden' : 'hoog');
        b.textContent = i;
        b.dataset.score = i;
        grid.appendChild(b);
      }
      grid.addEventListener('click', function(e) {
        var t = e.target;
        if (!t.classList.contains('score')) return;
        gekozen = parseInt(t.dataset.score);
        Array.prototype.forEach.call(grid.children, function(c) { c.classList.remove('selected'); });
        t.classList.add('selected');
        document.getElementById('btnSubmit').disabled = false;
      });
      document.getElementById('btnSubmit').addEventListener('click', function() {
        var btn = this; btn.disabled = true; btn.textContent = 'Bezig...';
        google.script.run
          .withSuccessHandler(function() {
            document.getElementById('status').style.display = 'block';
            document.getElementById('status').textContent = '✅ Bedankt voor je feedback! Sluit dit venster.';
            setTimeout(function() { google.script.host.close(); }, 1800);
          })
          .withFailureHandler(function(e) {
            btn.disabled = false; btn.textContent = 'Verstuur';
            document.getElementById('status').style.display = 'block';
            document.getElementById('status').style.color = '#B71C1C';
            document.getElementById('status').textContent = 'Fout: probeer opnieuw';
          })
          .slaNpsResponseOp(gekozen, document.getElementById('opmerking').value);
      });
    </script>
  `).setWidth(620).setHeight(540).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, '📊 1-vraag survey');
}

/**
 * Server-handler voor NPS-form. NAAM ZONDER trailing underscore is
 * verplicht — google.script.run blokkeert functies met trailing _.
 * (Voorheen slaNpsResponseOp_ → submit van NPS-modal faalde altijd.)
 */
function slaNpsResponseOp(score, opmerking) {
  if (typeof score !== 'number' || score < 0 || score > 10) throw new Error('Ongeldige score');
  const props = PropertiesService.getScriptProperties();
  // CYCLE-54: veilig parsen — corrupt prop mag NPS-submit niet doen crashen
  const responses = parseJsonVeilig_(props.getProperty(NPS_PROP_RESPONSE), []);
  responses.push({
    ts: new Date().toISOString(),
    score: score,
    opmerking: String(opmerking || '').slice(0, 500),
  });
  if (responses.length > 50) responses.splice(0, responses.length - 50);
  props.setProperty(NPS_PROP_RESPONSE, JSON.stringify(responses));
  safeAuditLog_('NPS response', score + (opmerking ? ' — ' + String(opmerking).slice(0, 80) : ''));
  // Forward naar owner (anoniem) via meldFataalAanOwner_-pattern
  try {
    if (score >= 9 && typeof meldFataalAanOwner_ === 'function') {
      meldFataalAanOwner_('NPS_PROMOTOR', 'Score ' + score, { opmerking: String(opmerking || '').slice(0, 200) });
    } else if (score <= 6 && typeof meldFataalAanOwner_ === 'function') {
      meldFataalAanOwner_('NPS_DETRACTOR', 'Score ' + score, { opmerking: String(opmerking || '').slice(0, 200) });
    }
  } catch (_) {}
  return true;
}

// ─────────────────────────────────────────────
//  YEAR-END JAAROVERZICHT (1 januari)
// ─────────────────────────────────────────────

/**
 * Toon jaaroverzicht — full-screen modal met cijfers van vorig jaar.
 * Triggered automatisch vanuit onOpen op 1-15 januari, daarna alleen via menu.
 */
function toonJaaroverzicht() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const vorigJaar = new Date().getFullYear() - 1;
  // "Door naar X" verwijst naar het jaar ná het terugkijk-jaar. Bij openen
  // in late december was new Date().getFullYear() gelijk aan vorigJaar →
  // de knop zei dan "Door naar 2026" terwijl het overzicht over 2025 ging.
  const huidigJaar = vorigJaar + 1;

  // Bereken cijfers
  const stats = _berekenJaarStats_(ss, vorigJaar);
  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0D1B4E 0%,#1A2A6B 50%,#2EC4B6 200%);color:#fff;padding:40px;min-height:100vh}
      .wrap{max-width:600px;margin:0 auto}
      .label{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2EC4B6;margin-bottom:8px}
      h1{font-size:48px;font-weight:800;letter-spacing:-0.025em;margin-bottom:8px}
      .sub{font-size:16px;opacity:.85;margin-bottom:36px}
      .stat{margin:28px 0;padding:24px;background:rgba(255,255,255,.06);border-radius:14px;border:1px solid rgba(255,255,255,.10)}
      .stat .v{font-size:42px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;margin:6px 0;color:#2EC4B6}
      .stat .t{font-size:14px;opacity:.85}
      .stat .c{font-size:11px;opacity:.6;margin-top:6px}
      .btn{background:#2EC4B6;color:#0A4744;padding:12px 22px;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:30px;width:100%;font-size:15px}
    </style>
    <div class="wrap">
      <p class="label">${vorigJaar} in cijfers</p>
      <h1>Wat een jaar.</h1>
      <p class="sub">Hier is jouw ${vorigJaar} — volledig op cijfers, niets verzonnen.</p>

      <div class="stat">
        <div class="t">Totale omzet (excl. BTW)</div>
        <div class="v">${formatBedrag_(stats.omzet)}</div>
        <div class="c">${stats.aantalFacturen} facturen verstuurd</div>
      </div>

      <div class="stat">
        <div class="t">Totale kosten (excl. BTW)</div>
        <div class="v">${formatBedrag_(stats.kosten)}</div>
        <div class="c">${stats.aantalKosten} uitgaven geboekt</div>
      </div>

      <div class="stat">
        <div class="t">Winst — wat je echt overhoudt</div>
        <div class="v">${formatBedrag_(stats.winst)}</div>
        <div class="c">Marge ${stats.marge}%</div>
      </div>

      <div class="stat">
        <div class="t">Top-klant</div>
        <div class="v" style="font-size:24px">${escHtml_(stats.topKlant.naam || '—')}</div>
        <div class="c">${formatBedrag_(stats.topKlant.omzet)} (${Math.round(stats.topKlant.pct)}% van omzet)</div>
      </div>

      <div class="stat">
        <div class="t">Beste maand</div>
        <div class="v" style="font-size:24px">${stats.besteMaand.naam}</div>
        <div class="c">${formatBedrag_(stats.besteMaand.omzet)} omzet</div>
      </div>

      <button class="btn" onclick="google.script.host.close()">Door naar ${huidigJaar} →</button>
    </div>
  `).setWidth(720).setHeight(800).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, '🎬 ' + vorigJaar + ' — jaaroverzicht');

  safeAuditLog_('Jaaroverzicht getoond', String(vorigJaar));
}

function _berekenJaarStats_(ss, jaar) {
  const stats = {
    omzet: 0, kosten: 0, winst: 0, marge: 0,
    aantalFacturen: 0, aantalKosten: 0,
    topKlant: { naam: '', omzet: 0, pct: 0 },
    besteMaand: { naam: '—', omzet: 0 },
  };
  try {
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const klantOmzet = {};
    const maandOmzet = new Array(12).fill(0);
    if (vfSheet && vfSheet.getLastRow() > 1) {
      const data = vfSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        // CYCLE-39: string-dated invoices (CSV-import) werden silent
        // geskipped → onjuiste jaaroverzicht-omzet getoond aan klant.
        // Zelfde bug-pattern als cycle 38 (EUVerkoop).
        const ruwDatum = data[i][KOL.VF.datum];
        const datum = (ruwDatum instanceof Date) ? ruwDatum
                    : ruwDatum ? parseDatum_(ruwDatum) : null;
        if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== jaar) continue;
        if (data[i][KOL.VF.status] === 'Gecrediteerd') continue;
        const omzet = parseFloat(data[i][KOL.VF.bedragExcl]) || 0;
        stats.omzet += omzet;
        stats.aantalFacturen++;
        const klantnaam = String(data[i][KOL.VF.klantnaam] || 'Onbekend');
        klantOmzet[klantnaam] = (klantOmzet[klantnaam] || 0) + omzet;
        maandOmzet[datum.getMonth()] += omzet;
      }
    }
    const ifSheet = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (ifSheet && ifSheet.getLastRow() > 1) {
      const data = ifSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        // CYCLE-39: parseDatum_ voor string-tolerance (zie boven)
        const ruwDatum = data[i][KOL.IF.factuurdatumLeverancier];
        const datum = (ruwDatum instanceof Date) ? ruwDatum
                    : ruwDatum ? parseDatum_(ruwDatum) : null;
        if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== jaar) continue;
        stats.kosten += parseFloat(data[i][KOL.IF.bedragExcl]) || 0;
        stats.aantalKosten++;
      }
    }
    stats.winst = rondBedrag_(stats.omzet - stats.kosten);
    stats.omzet = rondBedrag_(stats.omzet);
    stats.kosten = rondBedrag_(stats.kosten);
    stats.marge = stats.omzet > 0 ? Math.round((stats.winst / stats.omzet) * 100) : 0;
    // Top-klant
    Object.keys(klantOmzet).forEach(function(naam) {
      if (klantOmzet[naam] > stats.topKlant.omzet) {
        stats.topKlant = { naam: naam, omzet: rondBedrag_(klantOmzet[naam]),
                           pct: stats.omzet > 0 ? (klantOmzet[naam] / stats.omzet) * 100 : 0 };
      }
    });
    // Beste maand
    const maanden = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
    let max = 0, idx = 0;
    maandOmzet.forEach(function(m, i) { if (m > max) { max = m; idx = i; } });
    if (max > 0) stats.besteMaand = { naam: maanden[idx], omzet: rondBedrag_(max) };
  } catch (e) {
    Logger.log('_berekenJaarStats_ fout: ' + e.message);
  }
  return stats;
}

/**
 * Auto-trigger jaaroverzicht in eerste 15 dagen van januari.
 * Hook in onOpen → checkJaaroverzichtTrigger_().
 */
function checkJaaroverzichtTrigger_() {
  try {
    const nu = new Date();
    if (nu.getMonth() !== 0 || nu.getDate() > 15) return;
    const props = PropertiesService.getUserProperties();
    const KEY = 'jaaroverzichtGetoond_' + nu.getFullYear();
    if (props.getProperty(KEY)) return;
    props.setProperty(KEY, '1');
    Utilities.sleep(2000);
    toonJaaroverzicht();
  } catch (_) {}
}

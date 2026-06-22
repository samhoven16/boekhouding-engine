/**
 * EUVerkoop.gs
 * EU intracommunautaire prestaties + OSS-monitoring.
 *
 * REGELS (NL ZZP-context, 2026):
 *  - B2B EU-klant met geldig BTW-nummer → verleggingsregeling, 0% BTW,
 *    klant moet in eigen land BTW afdragen. Aangifte: rubriek 3b BTW-aangifte
 *    + ICP-opgaaf (Opgaaf Intracommunautaire Prestaties) per kwartaal.
 *  - B2C EU-klant zonder BTW-nr (consument) → mogelijk OSS:
 *      Wanneer cumulatieve EU-B2C-omzet > €10.000/jaar = OSS-aangifte
 *      verplicht (of registreer in elk EU-land). Onder €10k = NL-BTW-tarief.
 *
 * Deze module:
 *  - Markeert facturen die EU-B2C of EU-B2B zijn
 *  - Berekent of OSS-grens (€10k) is bereikt
 *  - Genereert ICP-rapport voor Belastingdienst
 */

const OSS_DREMPEL = 10000;
const ICP_SHEET = 'ICP-rapport';

const _EU_LANDCODES = {
  AT:'Oostenrijk', BE:'België', BG:'Bulgarije', HR:'Kroatië', CY:'Cyprus',
  CZ:'Tsjechië', DK:'Denemarken', EE:'Estland', FI:'Finland', FR:'Frankrijk',
  DE:'Duitsland', GR:'Griekenland', EL:'Griekenland', HU:'Hongarije',
  IE:'Ierland', IT:'Italië',
  LV:'Letland', LT:'Litouwen', LU:'Luxemburg', MT:'Malta', PL:'Polen',
  PT:'Portugal', RO:'Roemenië', SK:'Slowakije', SI:'Slovenië', ES:'Spanje',
  SE:'Zweden',
};

/**
 * Detecteert EU-landcode uit BTW-nummer (eerste 2 letters) of land-veld.
 * Returns null als niet-EU of NL.
 * @param {string} btwNr   bv. "DE123456789"
 * @param {string=} land   optionele landcode-fallback
 */
function detecteerEULand_(btwNr, land) {
  const b = String(btwNr || '').toUpperCase().replace(/\s/g, '');
  const m = b.match(/^([A-Z]{2})/);
  if (m && m[1] !== 'NL' && _EU_LANDCODES[m[1]]) return m[1];
  const l = String(land || '').toUpperCase().slice(0, 2);
  if (l !== 'NL' && _EU_LANDCODES[l]) return l;
  return null;
}

/**
 * Is dit een geldige EU-B2B-factuur? (verleggingsregeling van toepassing)
 * Vereist: EU-klant + niet-NL + BTW-nummer ingevuld.
 */
function isEUB2B_(btwNrKlant, landKlant) {
  const land = detecteerEULand_(btwNrKlant, landKlant);
  if (!land) return false;
  // BTW-nummer moet ingevuld én niet-leeg zijn (anders B2C)
  return String(btwNrKlant || '').trim().length > 5;
}

// ════════════════════════════════════════════════════════════════════
//  P4/P7-FIX: VIES BTW-nummer-validatie
// ════════════════════════════════════════════════════════════════════
// Belastingdienst stress-test P4/P7: klant past verleggingsregeling toe
// (0% BTW, factuur naar EU-klant met BTW-nr) — maar dat BTW-nr is ongeldig
// of niet meer actief. Gevolg: Belastingdienst heft alsnog 21% NL-BTW
// na een controle = naheffing + boete. ZZP'er kan tot €5.000 schade hebben
// per verkeerd verlegde factuur (afhankelijk van bedrag + rente).
//
// Echte mitigatie: VIES API-call vóór factuur. Resultaat 30 dagen cachen
// (BTW-nrs wijzigen zelden) — anders te veel API-calls bij re-factureren.
// VIES is publiek + gratis maar wel rate-limited (en regelmatig down,
// vooral 's nachts wegens onderhoud). Daarom: GRACEFUL FAIL — bij fout
// retourneer { valid: null, error } zodat caller kan kiezen wel/niet
// te blokkeren. Wij blokkeren nooit (false positive zou klant frustreren),
// alleen waarschuwen.

const VIES_API_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/';
const VIES_CACHE_TTL_DAGEN = 30;

/**
 * Valideer een EU BTW-nummer via VIES (Europese Commissie).
 * Cached 30 dagen via ScriptProperties.
 *
 * @param {string} btwNr  BTW-nr inclusief landcode, bv. "DE123456789"
 * @return {{valid: boolean|null, naam?: string, adres?: string, gecacheerd: boolean, error?: string}}
 *         valid === null bij netwerk/API-fout (caller mag dan wél factureren).
 */
function valideerBtwViaVies_(btwNr) {
  const schoon = String(btwNr || '').replace(/\s/g, '').toUpperCase();
  if (!schoon || schoon.length < 4) {
    return { valid: false, gecacheerd: false, error: 'Leeg of te kort' };
  }
  // Format-check eerst — geen API-call verspillen op pure typo's
  if (!isGeldigEuBTWNummer_(schoon)) {
    return { valid: false, gecacheerd: false, error: 'Format ongeldig' };
  }
  const land = schoon.slice(0, 2);
  const nummer = schoon.slice(2);

  // Cache-check (30 dgn TTL via PropertiesService — overleeft script-herstart)
  const cacheKey = 'VIES_' + schoon;
  try {
    const props = PropertiesService.getScriptProperties();
    const cached = props.getProperty(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached);
      const ageDagen = (Date.now() - obj.ts) / (1000 * 60 * 60 * 24);
      if (ageDagen < VIES_CACHE_TTL_DAGEN) {
        return Object.assign({}, obj.data, { gecacheerd: true });
      }
    }
  } catch (_) { /* cache-corrupt → fresh fetch */ }

  // API-call met timeout-defense
  try {
    const url = VIES_API_BASE + encodeURIComponent(land) + '/vat/' + encodeURIComponent(nummer);
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      headers: { 'Accept': 'application/json' },
    });
    const code = resp.getResponseCode();
    if (code !== 200) {
      // 404 = niet gevonden (= invalid), 5xx = VIES down → null
      if (code === 404) {
        const result = { valid: false, naam: '', adres: '' };
        _viesCacheSet_(cacheKey, result);
        return Object.assign({}, result, { gecacheerd: false });
      }
      return { valid: null, gecacheerd: false, error: 'VIES HTTP ' + code };
    }
    const body = JSON.parse(resp.getContentText() || '{}');
    const result = {
      valid: !!body.isValid,
      naam: String(body.name || '').trim(),
      adres: String(body.address || '').trim(),
    };
    _viesCacheSet_(cacheKey, result);
    return Object.assign({}, result, { gecacheerd: false });
  } catch (e) {
    return { valid: null, gecacheerd: false, error: String(e.message || e) };
  }
}

function _viesCacheSet_(key, data) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
      ts: Date.now(),
      data: data,
    }));
  } catch (_) { /* quota vol — geen blocker */ }
}

/**
 * F-DUR-150: ruimt verlopen VIES_-cache-keys op. De 30-dagen-TTL was lees-tijd-
 * only (een verlopen entry werd genegeerd maar NOOIT verwijderd) → onbegrensde
 * ScriptProperty-groei bij veel distinct EU-btw-nummers richting de harde
 * 500KB-cliff (zelfde klasse als F-SCALE-142/143). Verlopen entries worden tóch
 * opnieuw opgehaald, dus verwijderen is veilig. Draait dagelijks via
 * dagelijkseTaken, zelfde getProperties()-sweep als cleanupEmailIdem.
 * @returns {number} aantal verwijderde keys
 */
function cleanupViesCache_() {
  const props = PropertiesService.getScriptProperties();
  const alle = props.getProperties();
  const cutoffMs = Date.now() - VIES_CACHE_TTL_DAGEN * 24 * 60 * 60 * 1000;
  let verwijderd = 0;
  Object.keys(alle).forEach(function(k) {
    if (k.indexOf('VIES_') !== 0) return;
    let ts = 0;
    try { ts = parseInt((JSON.parse(alle[k] || '{}') || {}).ts, 10) || 0; } catch (_) { ts = 0; }
    // Geen/onleesbare ts (corrupt/legacy) of ouder dan de TTL → weg.
    if (!ts || ts < cutoffMs) {
      try { props.deleteProperty(k); verwijderd++; } catch (_) {}
    }
  });
  return verwijderd;
}

/**
 * OSS-monitor: berekent cumulatieve EU-B2C-omzet huidig kalenderjaar.
 * Returns { totaalEuB2c, drempelOverschreden, perLand: {DE: 1234, FR: 567} }
 */
function controleerOssDrempel_() {
  const ss = getSpreadsheet_();
  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet || vfSheet.getLastRow() < 2) {
    return { totaalEuB2c: 0, drempelOverschreden: false, perLand: {} };
  }
  const data = vfSheet.getDataRange().getValues();
  const huidigJaar = new Date().getFullYear();
  const perLand = {};
  let totaal = 0;

  // We hebben factuur-rij maar niet altijd EU-flag. Heuristiek:
  // Klant-BTW-nr (KOL.VF.btwNrKlant) of land-veld in adres parseren.
  for (let i = 1; i < data.length; i++) {
    // CYCLE-38: string-dated invoices (CSV-import) werden silent geskipped
    // doordat alleen `instanceof Date` werd geaccepteerd. Gevolg: klant
    // overschreed €10k OSS-drempel zonder waarschuwing → BTW-aangifte
    // mismatch. Nu: parseDatum_ accepteert string én Date.
    const ruwDatum = data[i][KOL.VF.datum];
    const datum = (ruwDatum instanceof Date) ? ruwDatum
                : ruwDatum ? parseDatum_(ruwDatum) : null;
    if (!datum || isNaN(datum.getTime()) || datum.getFullYear() !== huidigJaar) continue;
    const status = String(data[i][KOL.VF.status] || '');
    if (status === 'Gecrediteerd') continue;
    const btwNrKlant = String(data[i][KOL.VF.btwNrKlant] || '').trim();   // [7] = BTW-nr klant (NIET [21] = Aangemaakt op)
    const klantAdres = String(data[i][KOL.VF.kvkKlant] || '');
    // Detecteer EU-land
    let euLand = detecteerEULand_(btwNrKlant, '');
    if (!euLand) {
      // Probeer adres voor landcode (bv. "Berlin, DE 10115")
      const m = klantAdres.match(/\b([A-Z]{2})\s*\d{4,5}\b/);
      if (m && _EU_LANDCODES[m[1]]) euLand = m[1];
    }
    if (!euLand) continue;
    // B2B (BTW-nr) → niet OSS, maar ICP. Alleen B2C telt voor OSS-drempel.
    if (btwNrKlant && btwNrKlant.length > 5) continue;
    const omzet = parseFloat(data[i][KOL.VF.bedragExcl]) || 0;
    perLand[euLand] = (perLand[euLand] || 0) + omzet;
    totaal += omzet;
  }
  return {
    totaalEuB2c: rondBedrag_(totaal),
    drempelOverschreden: totaal > OSS_DREMPEL,
    perLand: perLand,
  };
}

/**
 * Genereert ICP-rapport (Opgaaf Intracommunautaire Prestaties).
 * Verplicht per kwartaal voor B2B EU-leveringen.
 * Output: tabblad 'ICP-rapport' met rijen per klant + totaal.
 */
function genereerIcpRapport() {
  if (typeof controleerSetupGedaan_ === 'function' && !controleerSetupGedaan_()) return;
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet_();
  const resp = ui.prompt(
    'ICP-rapport genereren',
    'Voor welk kwartaal? Geef Q1/Q2/Q3/Q4 of een jaar (bv. 2026 = heel jaar).',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const periode = String(resp.getResponseText() || '').trim().toUpperCase();
  const huidigJaar = new Date().getFullYear();
  let van, tot, label;
  if (/^Q[1-4]$/.test(periode)) {
    const q = parseInt(periode[1]);
    van = new Date(huidigJaar, (q - 1) * 3, 1);
    tot = new Date(huidigJaar, q * 3, 0, 23, 59, 59, 999);
    label = periode + ' ' + huidigJaar;
  } else if (/^\d{4}$/.test(periode)) {
    const y = parseInt(periode);
    van = new Date(y, 0, 1);
    tot = new Date(y, 11, 31, 23, 59, 59, 999);
    label = String(y);
  } else {
    ui.alert('Periode niet herkend. Gebruik Q1, Q2, Q3, Q4 of een jaar zoals 2026.');
    return;
  }

  const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  if (!vfSheet || vfSheet.getLastRow() < 2) {
    ui.alert('Geen verkoopfacturen om te rapporteren.');
    return;
  }
  const data = vfSheet.getDataRange().getValues();
  // Aggregate per (BTW-nummer + land) — Belastingdienst wil per ontvanger
  const agg = {};
  for (let i = 1; i < data.length; i++) {
    // CYCLE-38: parseDatum_ voor string-tolerance (zie controleerOssDrempel_).
    // ICP-rapport is legaal verplicht per kwartaal — incompleet rapport door
    // string-skip = onjuiste Belastingdienst-rapportage.
    const ruwDatum = data[i][KOL.VF.datum];
    const datum = (ruwDatum instanceof Date) ? ruwDatum
                : ruwDatum ? parseDatum_(ruwDatum) : null;
    if (!datum || isNaN(datum.getTime()) || datum < van || datum > tot) continue;
    const status = String(data[i][KOL.VF.status] || '');
    if (status === 'Gecrediteerd') continue;
    const btwNrKlant = String(data[i][KOL.VF.btwNrKlant] || '').trim();   // [7] = BTW-nr klant (NIET [21] = Aangemaakt op)
    const land = detecteerEULand_(btwNrKlant);
    if (!land || !btwNrKlant || btwNrKlant.length <= 5) continue;  // alleen EU B2B
    const klantnaam = String(data[i][KOL.VF.klantnaam] || '');
    const omzet = parseFloat(data[i][KOL.VF.bedragExcl]) || 0;
    const key = btwNrKlant;
    if (!agg[key]) agg[key] = { btwNr: btwNrKlant, naam: klantnaam, land: land, omzet: 0, aantalFacturen: 0 };
    agg[key].omzet += omzet;
    agg[key].aantalFacturen++;
  }

  // Schrijf rapport
  let sheet = ss.getSheetByName(ICP_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ICP_SHEET);
    sheet.setTabColor('#1A2A6B');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }
  sheet.getRange(1, 1, 1, 5).merge()
    .setValue('🇪🇺 ICP-RAPPORT — ' + label)
    .setBackground('#0D1B4E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(15).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 38);

  sheet.getRange(2, 1, 1, 5).merge()
    .setValue('Opgaaf Intracommunautaire Prestaties — voor BTW-aangifte rubriek 3b. Indienen per kwartaal verplicht (binnen 1 maand na kwartaaleinde).')
    .setBackground('#F7F9FC').setFontColor('#5F6B7A').setFontSize(11)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(2, 36);

  sheet.getRange(4, 1, 1, 5).setValues([['BTW-nummer afnemer', 'Klantnaam', 'Land', 'Aantal facturen', 'Omzet (excl. BTW)']])
    .setBackground('#0D1B4E').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(4);

  let r = 5;
  let totaal = 0;
  Object.keys(agg).sort().forEach(function(k) {
    const a = agg[k];
    sheet.getRange(r, 1, 1, 5).setValues([[a.btwNr, a.naam, a.land + ' — ' + (_EU_LANDCODES[a.land] || ''), a.aantalFacturen, formatBedrag_(a.omzet)]])
      .setFontSize(11);
    if ((r - 5) % 2 === 1) sheet.getRange(r, 1, 1, 5).setBackground('#F7F9FC');
    totaal += a.omzet;
    r++;
  });
  if (Object.keys(agg).length === 0) {
    sheet.getRange(5, 1, 1, 5).merge()
      .setValue('Geen EU B2B-leveringen in deze periode.')
      .setBackground('#E8F5E9').setFontColor('#1B5E20').setFontWeight('bold')
      .setFontSize(13).setHorizontalAlignment('center');
    r = 6;
  } else {
    sheet.getRange(r, 1, 1, 5).setValues([['', '', '', 'TOTAAL', formatBedrag_(totaal)]])
      .setBackground('#E6F7F4').setFontWeight('bold').setFontSize(12);
  }

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 140);
  sheet.hideGridlines();
  ss.setActiveSheet(sheet);

  safeAuditLog_('ICP-rapport gegenereerd', label + ' — ' + Object.keys(agg).length + ' afnemers, totaal ' + formatBedrag_(totaal));
  ui.alert('🇪🇺 ICP-rapport klaar', 'Periode: ' + label + '\n' + Object.keys(agg).length + ' EU B2B-afnemers · totaal ' + formatBedrag_(totaal) + '\n\nDien dit binnen 1 maand na kwartaaleinde in via mijn.belastingdienst.nl.', ui.ButtonSet.OK);
}

/**
 * OSS-melding voor in Notificaties / Belastingadvies.
 * Wordt aangeroepen vanuit genereerNotificaties_().
 */
function ossNotificatie_() {
  const r = controleerOssDrempel_();
  if (r.totaalEuB2c === 0) return null;
  if (r.drempelOverschreden) {
    return {
      titel: '🇪🇺 OSS-aangifte verplicht',
      tekst: 'EU B2C-omzet ' + formatBedrag_(r.totaalEuB2c) + ' > €10.000 grens. ' +
             'Registreer voor OSS via mijn.belastingdienst.nl en doe per kwartaal aangifte voor alle EU-landen.',
      actie: 'OSS-registreren bij Belastingdienst',
      euros: 0,
      urgent: true,
      prioriteit: 95,
    };
  }
  if (r.totaalEuB2c >= OSS_DREMPEL * 0.8) {
    return {
      titel: '🇪🇺 OSS-grens nadert',
      tekst: 'EU B2C-omzet ' + formatBedrag_(r.totaalEuB2c) + ' (80%+ van €10.000-grens). ' +
             'Voorbereid je vast voor OSS-registratie als je deze trend voortzet.',
      actie: 'Lees /gids/oss-aangifte-eu-webshop',
      euros: 0,
      urgent: false,
      prioriteit: 50,
    };
  }
  return null;
}

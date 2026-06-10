/**
 * GezondheidCheck.gs
 * Automatische validatie van de boekhouding — geeft rust en voorkomt fouten.
 *
 * WERKELIJKE PIJN die dit oplost:
 *  - "Onzekerheid over fouten/boetes" (Moneybird BTW) → valideer alles
 *  - "Geen controle/overzicht" (Excel chaos) → geef een score
 *  - "Black box" (Yuki AI) → leg uit wat er mis is
 *  - "Compliance risico" (Wave) → controleer NL-specifieke regels
 *  - "Geen vertrouwen" (e-boekhouden oud UI) → geef vertrouwen door inzicht
 *
 * CHECKLIST:
 *  1. Balans klopt (activa = passiva + eigen vermogen)
 *  2. Alle journaalposten hebben debet ≠ credit rekening
 *  3. Geen negatieve bedragen in facturen
 *  4. BTW rekensommen kloppen
 *  5. Geen boekingen in afgesloten periodes
 *  6. Alle verkoopfacturen hebben een klant + bedrag
 *  7. Geen duplicaat factuurnummers
 *  8. KOR-status consistent met omzet
 *  9. Ontvangen betalingen zijn gekoppeld aan facturen
 * 10. Vervaldatums zijn realistisch (niet > 180 dagen)
 */

// ─────────────────────────────────────────────
//  INSTALLATIE-DIAGNOSE — voor klanten die zich afvragen "is mijn setup OK?"
// ─────────────────────────────────────────────
//
// In tegenstelling tot voerGezondheidCheckUit (data-validatie) checkt deze
// functie de SYSTEEM-staat: bestaan alle tabbladen, draaien triggers, is
// licentie actief, zijn config-constants geladen, etc. Bedoeld als eerste-
// hulp bij "het doet het niet" — output is plain-text die klant in
// support-mail kan plakken.
//
// Menu: Boekhouding → Installatie diagnoseren

function diagnoseInstallatie() {
  const ui = SpreadsheetApp.getUi();
  const ss = (typeof getSpreadsheet_ === 'function') ? getSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ui.alert('Geen spreadsheet bereikbaar. Open dit script vanuit de spreadsheet, niet vanuit de editor zonder context.');
    return;
  }

  const regels = [];
  function check(naam, fn) {
    try {
      const r = fn();
      if (r && r.ok === false) {
        regels.push('✗ ' + naam + ' — ' + r.melding);
      } else {
        regels.push('✓ ' + naam + (r && r.detail ? '  (' + r.detail + ')' : ''));
      }
    } catch (e) {
      regels.push('✗ ' + naam + ' — CRASH: ' + (e.message || e));
    }
  }

  // ── 1. Versie + setup-flag ─────────────────────────────
  check('Versie', function() {
    const v = (typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : '?';
    return { detail: 'v' + v };
  });

  check('Setup uitgevoerd', function() {
    const done = PropertiesService.getScriptProperties().getProperty('PROP_SETUP_DONE') === 'true' ||
                 PropertiesService.getScriptProperties().getProperty('SETUP_DONE') === 'true' ||
                 (typeof PROP === 'object' && PROP && PROP.SETUP_DONE &&
                  PropertiesService.getScriptProperties().getProperty(PROP.SETUP_DONE) === 'true');
    if (!done) return { ok: false, melding: 'Run Boekhouding → Setup om te installeren.' };
    return { detail: 'ja' };
  });

  // ── 2. Verwachte tabbladen ─────────────────────────────
  const verwachteTabs = (typeof SHEETS === 'object' && SHEETS) ? [
    SHEETS.DASHBOARD, SHEETS.INSTELLINGEN, SHEETS.VERKOOPFACTUREN,
    SHEETS.INKOOPFACTUREN, SHEETS.BANKTRANSACTIES, SHEETS.JOURNAALPOSTEN,
    SHEETS.GROOTBOEKSCHEMA, SHEETS.AUDITLOG,
  ].filter(Boolean) : [];

  verwachteTabs.forEach(function(naam) {
    check('Tabblad "' + naam + '"', function() {
      const s = ss.getSheetByName(naam);
      if (!s) return { ok: false, melding: 'ontbreekt — run setup opnieuw' };
      return { detail: s.getLastRow() + ' rijen' };
    });
  });

  // ── 3. Triggers ────────────────────────────────────────
  check('Triggers', function() {
    const trigs = ScriptApp.getProjectTriggers();
    if (trigs.length === 0) return { ok: false, melding: 'GEEN triggers — onEdit/dagelijks werkt niet. Run setup opnieuw.' };
    const namen = trigs.map(function(t) { return t.getHandlerFunction(); }).join(', ');
    return { detail: trigs.length + ' actief: ' + namen };
  });

  // ── 4. Config-constants geladen ────────────────────────
  check('BTW-tarieven geladen', function() {
    if (typeof BTW_KEUZES === 'undefined' || !BTW_KEUZES.length) {
      return { ok: false, melding: 'BTW_KEUZES leeg — Config.gs niet correct geladen' };
    }
    return { detail: BTW_KEUZES.length + ' tarieven' };
  });

  check('Kostencategorieën geladen', function() {
    if (typeof KOSTEN_CATEGORIEEN === 'undefined' || !KOSTEN_CATEGORIEEN.length) {
      return { ok: false, melding: 'KOSTEN_CATEGORIEEN leeg' };
    }
    return { detail: KOSTEN_CATEGORIEEN.length + ' categorieën' };
  });

  // ── 5. Belasting-config (override-laag) ────────────────
  check('Belasting-tarieven', function() {
    if (typeof getBelasting_ !== 'function') return { ok: false, melding: 'getBelasting_ ontbreekt' };
    const B = getBelasting_();
    if (!B || typeof B.REISKOSTEN_PER_KM !== 'number') return { ok: false, melding: 'BELASTING-config incompleet' };
    return { detail: 'reiskosten=' + B.REISKOSTEN_PER_KM + ', jaar=' + B.TARIEFSJAAR };
  });

  // ── 6. Licentie-status ─────────────────────────────────
  check('Licentie', function() {
    // CYCLE-57: was eerder dead reference 'controleerLicentieStatus_' →
    // klant zag altijd "check overgeslagen". Nu echte check via
    // valideerLicentieOpServer_ (Licentie.gs). Fail-open op netwerk-fout
    // zoals voorheen — geen klant blokkeren op offline-validatie.
    try {
      const props = PropertiesService.getScriptProperties();
      const sleutel = props.getProperty('licentiesleutel') || '';
      if (!sleutel) return { ok: false, melding: 'GEEN sleutel — activeer via Boekhouding → Licentie activeren' };
      if (typeof valideerLicentieOpServer_ !== 'function') return { detail: 'check overgeslagen (functie ontbreekt)' };
      const r = valideerLicentieOpServer_(sleutel);
      if (r && r.geldig === false) return { ok: false, melding: r.fout || 'Licentie ongeldig' };
      if (r && r.offline) return { detail: 'actief (offline cache — server onbereikbaar)' };
      return { detail: 'actief' + (r && r.naam ? ' — ' + r.naam : '') };
    } catch (_) {
      return { detail: 'check overgeslagen (offline of server-fout)' };
    }
  });

  // ── 7. Bedrijfsgegevens ────────────────────────────────
  check('Bedrijfsnaam ingevuld', function() {
    if (typeof getInstelling_ !== 'function') return { ok: false, melding: 'getInstelling_ ontbreekt' };
    const naam = (getInstelling_('Bedrijfsnaam') || '').trim();
    if (!naam) return { ok: false, melding: 'leeg — vul in op Instellingen-tab' };
    return { detail: naam };
  });

  // ── 8. Drive-mappen ────────────────────────────────────
  check('Drive-hoofdmap', function() {
    // CYCLE-58: gebruik boekjaar (klant-config) ipv calendar — voorkomt
    // false-positive "geen DRIVE_HOOFDMAP — run setup opnieuw" bij klant
    // met afwijkend boekjaar (cf. cycle 50). Fallback: probeer calendar
    // jaar én vorig jaar zodat we klanten net na jaarwissel niet vals
    // alarmeren.
    const props = PropertiesService.getScriptProperties();
    const boekjaar = (typeof getBoekjaar_ === 'function') ? getBoekjaar_() : new Date().getFullYear();
    const kandidaten = [boekjaar, new Date().getFullYear(), new Date().getFullYear() - 1];
    const uniek = Array.from(new Set(kandidaten));
    let id = null;
    let gevondenJaar = null;
    for (let i = 0; i < uniek.length; i++) {
      const v = props.getProperty('DRIVE_HOOFDMAP_' + uniek[i]);
      if (v) { id = v; gevondenJaar = uniek[i]; break; }
    }
    if (!id) return { ok: false, melding: 'geen DRIVE_HOOFDMAP_' + boekjaar + ' — run setup opnieuw' };
    try {
      const f = DriveApp.getFolderById(id);
      const suffix = gevondenJaar !== boekjaar ? ' (jaar ' + gevondenJaar + ')' : '';
      return { detail: f.getName() + suffix };
    } catch (_) {
      return { ok: false, melding: 'map met ID ' + id + ' niet meer toegankelijk' };
    }
  });

  // ── 9. ScriptProperties-grootte (9KB/key + 500KB totaal) ──
  // Ronde-3 pre-flight: de 9KB-per-key-limiet brak eerder GESLOTEN_PERIODES_
  // HISTORIE stil. Waarschuw vóór de limiet i.p.v. na de silent throw.
  check('ScriptProperties-grootte', function() {
    const alle = PropertiesService.getScriptProperties().getProperties();
    let totaal = 0;
    let grootsteKey = '';
    let grootsteBytes = 0;
    Object.keys(alle).forEach(function(k) {
      const bytes = k.length + String(alle[k] || '').length; // ~1 byte/char (ASCII-benadering)
      totaal += bytes;
      if (bytes > grootsteBytes) { grootsteBytes = bytes; grootsteKey = k; }
    });
    if (grootsteBytes > 8500) {
      return { ok: false, melding: 'key "' + grootsteKey + '" is ' + grootsteBytes
        + ' bytes — nadert 9KB-limiet (silent data-loss-risico)' };
    }
    if (totaal > 460000) {
      return { ok: false, melding: 'totaal ' + totaal + ' bytes — nadert 500KB-limiet' };
    }
    return { detail: Object.keys(alle).length + ' keys, ' + totaal + ' bytes, grootste '
      + grootsteBytes + 'B (' + grootsteKey + ')' };
  });

  // ── Resultaat ──────────────────────────────────────────
  const fouten = regels.filter(function(r) { return r.indexOf('✗') === 0; });
  const koptekst = fouten.length === 0
    ? '✓ INSTALLATIE OK — alle checks geslaagd'
    : '✗ ' + fouten.length + ' PROBLE(E)M(EN) — zie hieronder';

  ui.alert(
    'Installatie-diagnose',
    koptekst + '\n\n' + regels.join('\n') + '\n\n' +
    (fouten.length > 0 ? 'Stuur deze output naar support@boekhoudbaar.nl als je er niet uitkomt.' : ''),
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  HOOFDFUNCTIE: VOLLEDIGE CHECK
// ─────────────────────────────────────────────

function voerGezondheidCheckUit() {
  if (!controleerSetupGedaan_()) return;
  const ss = getSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  ui.alert('Even geduld...', 'De gezondheidscheck wordt uitgevoerd. Dit duurt een paar seconden.', ui.ButtonSet.OK);

  const resultaten = [];
  let aantalFouten   = 0;
  let aantalWaarsch  = 0;
  let aantalOk       = 0;

  // ── Check 1: Balans ────────────────────────────────────────────────────
  const balansCheck = controleerBalans_(ss);
  resultaten.push(balansCheck);
  if (balansCheck.status === 'FOUT')    aantalFouten++;
  else if (balansCheck.status === 'OK') aantalOk++;
  else aantalWaarsch++;

  // ── Check 2: Journaalposten ───────────────────────────────────────────
  const jpChecks = controleerJournaalposten_(ss);
  jpChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 2b: Referentiële integriteit (verweesde facturen) ───────────
  const refChecks = controleerReferentiele_(ss);
  refChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 2c: Betalings-integriteit (BETAALD zonder journaalpost) ─────
  const betCheck = controleerBetalingsIntegriteit_(ss);
  resultaten.push(betCheck);
  if (betCheck.status === 'FOUT') aantalFouten++;
  else if (betCheck.status === 'OK') aantalOk++;
  else aantalWaarsch++;

  // ── Check 3: Verkoopfacturen ──────────────────────────────────────────
  const vfChecks = controleerVerkoopfacturen_(ss);
  vfChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 4: BTW ──────────────────────────────────────────────────────
  const btwCheck = controleerBtwConsistentie_(ss);
  resultaten.push(btwCheck);
  if (btwCheck.status === 'FOUT') aantalFouten++;
  else if (btwCheck.status === 'OK') aantalOk++;
  else aantalWaarsch++;

  // ── Check 5: Instellingen ─────────────────────────────────────────────
  const instellingChecks = controleerInstellingen_();
  instellingChecks.forEach(c => {
    resultaten.push(c);
    if (c.status === 'FOUT') aantalFouten++;
    else if (c.status === 'OK') aantalOk++;
    else aantalWaarsch++;
  });

  // ── Check 6: TAX-BTW-001 — BTW aangifte deadline ─────────────────────
  const btwDeadlineCheck = controleerTaxBtwDeadlineCheck_();
  resultaten.push(btwDeadlineCheck);
  if (btwDeadlineCheck.status === 'FOUT')        aantalFouten++;
  else if (btwDeadlineCheck.status === 'OK')     aantalOk++;
  else                                            aantalWaarsch++;

  // ── Check 7: TAX-ADM-001 — Bewaarplicht administratie ────────────────
  const bewaarplichtCheck = controleerTaxAdmBewaarplichtCheck_();
  resultaten.push(bewaarplichtCheck);
  if (bewaarplichtCheck.status === 'FOUT')       aantalFouten++;
  else if (bewaarplichtCheck.status === 'OK')    aantalOk++;
  else                                            aantalWaarsch++;

  // ── Gezondheidscore ───────────────────────────────────────────────────
  const totaal = aantalFouten + aantalWaarsch + aantalOk;
  const score  = totaal > 0 ? Math.round(((aantalOk + aantalWaarsch * 0.5) / totaal) * 100) : 100;

  // Cache laatste score + datum zodat Dashboard het zonder re-run kan tonen
  try {
    PropertiesService.getDocumentProperties().setProperties({
      'GEZONDHEID_SCORE':    String(score),
      'GEZONDHEID_FOUTEN':   String(aantalFouten),
      'GEZONDHEID_WAARSCH':  String(aantalWaarsch),
      'GEZONDHEID_DATUM':    new Date().toISOString(),
    });
  } catch (e) { Logger.log('GezondheidCheck cache: ' + e.message); }

  // Schrijf resultaten naar tabblad
  schrijfGezondheidCheckResultaten_(ss, resultaten, score, aantalFouten, aantalWaarsch, aantalOk);

  // Slotbericht
  const emoticon = score >= 90 ? '✅' : score >= 70 ? '⚠️' : '❌';
  const boodschap = score >= 90
    ? 'Uw boekhouding ziet er goed uit! Kleine aandachtspunten zijn opgeslagen.'
    : score >= 70
      ? 'Er zijn enkele aandachtspunten. Bekijk de details voor actie.'
      : 'Er zijn fouten gevonden die u aandacht verdienen. Bekijk de details.';

  ui.alert(
    `${emoticon} Gezondheidscheck — Score: ${score}/100`,
    `${boodschap}\n\n` +
    `✅ In orde:          ${aantalOk}\n` +
    `⚠️  Aandachtspunten: ${aantalWaarsch}\n` +
    `❌ Fouten:           ${aantalFouten}\n\n` +
    `De details staan in het tabblad "Gezondheidscheck".`,
    ui.ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
//  CHECK 1: BALANS KLOPT
// ─────────────────────────────────────────────

function controleerBalans_(ss) {
  try {
    const gbData = leesSheetVeilig_(ss, SHEETS.GROOTBOEKSCHEMA);   // CYCLE-51
    let totaalActiva  = 0;
    let totaalPassiva = 0;

    for (let i = 1; i < gbData.length; i++) {
      const type  = gbData[i][2];
      const bw    = gbData[i][4];
      const saldo = parseFloat(gbData[i][5]) || 0;
      if (bw !== 'Balans') continue;

      if (type === 'Actief')  totaalActiva  += saldo;
      if (type === 'Passief') totaalPassiva += saldo;
    }

    // Resultaat boekjaar telt mee als passiva (tijdelijk in passiva/EV)
    const verschil = rondBedrag_(Math.abs(totaalActiva - totaalPassiva));

    // CYCLE-22: drempel verlaagd van €1 → €0,05. €1 was veel te ruim voor een
    // finance-systeem: een €0,99 verschil tussen Activa en Passiva is GEEN
    // afronding (alle journaalposten worden op €0,01 afgerond) maar duidt
    // op een ontbrekende of foutieve boeking. €0,05 vangt edge-cases van
    // floating-point accumulatie over honderden boekingen op, maar niet
    // meer dan dat. De WAARSCHUWING-tekst noemt nu expliciet het bedrag
    // zodat klant kan inschatten of het urgent is.
    if (verschil <= 0.05) {
      return { check: 'Balans', status: 'OK', bericht: `Activa en passiva zijn in evenwicht (${formatBedrag_(totaalActiva)}).` };
    } else {
      return {
        check: 'Balans',
        status: 'WAARSCHUWING',
        bericht: `Verschil van ${formatBedrag_(verschil)} tussen activa (${formatBedrag_(totaalActiva)}) en passiva (${formatBedrag_(totaalPassiva)}). ` +
                 `Controleer openingssaldi of ontbrekende boekingen. Dit kan normaal zijn tijdens het lopende boekjaar; bij afsluiting moet het naar €0,00.`,
      };
    }
  } catch (e) {
    return { check: 'Balans', status: 'FOUT', bericht: 'Kon balans niet controleren: ' + e.message };
  }
}

/**
 * Strikte balans-controle voor jaarrekening-context.
 *
 * Verschil met controleerBalans_:
 *   - controleerBalans_       : dagelijkse gezondheids-check, drempel €0,05
 *                               (tolereert floating-point ruis tijdens lopend jaar)
 *   - controleerBalansStrikt_ : jaarrekening-eis, drempel €0,005
 *                               (boekingen worden al op €0,01 afgerond;
 *                                meer drift betekent dat er ergens een
 *                                journaalpost scheef loopt)
 *
 * Aanroepen vóór jaarafsluiting / accountant-export / SBR-deponering.
 * Returns hetzelfde shape als controleerBalans_: { check, status, bericht }.
 */
function controleerBalansStrikt_() {
  try {
    const ss = getSpreadsheet_();
    const gb = ss && ss.getSheetByName(SHEETS.GROOTBOEKSCHEMA);
    if (!gb) return { check: 'Balans (strikt)', status: 'INFO', bericht: 'Grootboekschema niet gevonden.' };

    const data = gb.getDataRange().getValues();
    let totaalActiva = 0;
    let totaalPassiva = 0;
    for (let i = 1; i < data.length; i++) {
      const bw = String(data[i][4] || '');
      const saldo = parseFloat(data[i][5]) || 0;
      if (bw === 'Activa')  totaalActiva  += saldo;
      if (bw === 'Passiva') totaalPassiva += saldo;
    }
    const verschil = Math.abs(totaalActiva - totaalPassiva);

    if (verschil < 0.005) {
      return {
        check: 'Balans (strikt — jaarrekening)',
        status: 'OK',
        bericht: `Activa en passiva sluiten exact (${formatBedrag_(totaalActiva)}).`,
      };
    }
    return {
      check: 'Balans (strikt — jaarrekening)',
      status: 'KRITIEK',
      bericht: `Verschil ${formatBedrag_(verschil)} tussen activa (${formatBedrag_(totaalActiva)}) ` +
               `en passiva (${formatBedrag_(totaalPassiva)}). Voor jaarrekening MOET dit < €0,005 zijn. ` +
               `Loop de journaalposten van december na — er staat ergens een afgerond bedrag scheef. ` +
               `Tip: Boekhoudbaar → Geavanceerd → Saldi herberekenen.`,
    };
  } catch (e) {
    return { check: 'Balans (strikt — jaarrekening)', status: 'FOUT', bericht: e.message };
  }
}
//
// Controleert of alle factuur-verwijzingen naar Relaties geldig zijn.
// Verweesde facturen (klantId niet in Relaties) ontstaan als klant een
// rij uit Relaties verwijdert zonder de factuur eerst te updaten.

function controleerReferentiele_(ss) {
  const resultaten = [];
  try {
    const relSheet = ss.getSheetByName(SHEETS.RELATIES);
    const vfSheet  = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const ifSheet  = ss.getSheetByName(SHEETS.INKOOPFACTUREN);
    if (!relSheet || (!vfSheet && !ifSheet)) {
      return [{ check: 'Referenties – Relaties', status: 'OK',
        bericht: 'Geen factuur-tabbladen om te controleren.' }];
    }

    // Verzamel alle bestaande relatie-IDs (kolom 0)
    const relData = relSheet.getDataRange().getValues();
    const relIds = new Set();
    for (let i = 1; i < relData.length; i++) {
      const id = String(relData[i][0] || '').trim();
      if (id) relIds.add(id);
    }

    let verweesdVf = 0;
    let verweesdIf = 0;
    const voorbeeldVf = [];
    const voorbeeldIf = [];

    if (vfSheet) {
      const vfData = vfSheet.getDataRange().getValues();
      for (let i = 1; i < vfData.length; i++) {
        const klantId = String(vfData[i][4] || '').trim();
        if (klantId && !relIds.has(klantId)) {
          verweesdVf++;
          if (voorbeeldVf.length < 3) voorbeeldVf.push(String(vfData[i][1] || '?'));
        }
      }
    }
    if (ifSheet) {
      const ifData = ifSheet.getDataRange().getValues();
      for (let i = 1; i < ifData.length; i++) {
        const levId = String(ifData[i][4] || '').trim();
        if (levId && !relIds.has(levId)) {
          verweesdIf++;
          if (voorbeeldIf.length < 3) voorbeeldIf.push(String(ifData[i][1] || '?'));
        }
      }
    }

    if (verweesdVf > 0 || verweesdIf > 0) {
      const delen = [];
      if (verweesdVf) delen.push(verweesdVf + ' verkoopfactuur/facturen verwijst naar verwijderde klant (' + voorbeeldVf.join(', ') + ')');
      if (verweesdIf) delen.push(verweesdIf + ' inkoopfactuur/facturen verwijst naar verwijderde leverancier (' + voorbeeldIf.join(', ') + ')');
      resultaten.push({
        check:   'Referenties – Verweesde facturen',
        status:  'WAARSCHUWING',
        bericht: delen.join('; ') + '. Voeg de relatie opnieuw toe in tabblad Relaties of werk de factuur bij.',
      });
    } else {
      resultaten.push({ check: 'Referenties – Verweesde facturen',
        status: 'OK', bericht: 'Alle factuur-verwijzingen zijn intact.' });
    }
  } catch (e) {
    resultaten.push({ check: 'Referenties – Verweesde facturen',
      status: 'FOUT', bericht: 'Check mislukt: ' + e.message });
  }
  return resultaten;
}

// ─────────────────────────────────────────────
//  CHECK 2c: BETALINGS-INTEGRITEIT
// ─────────────────────────────────────────────
//
// Detecteert facturen die als BETAALD gemarkeerd staan zonder bijbehorende
// journaalpost (1200 → 1100). Deze toestand kan ontstaan als
// `markeerVerkoopfactuurBetaald` halverwege crasht — de compensating rollback
// vangt het meeste op, maar als ÓÓK rollback faalt blijft de factuur scheef.
// Owner moet handmatig journaalpost aanvullen of betaling rollback'en.

function controleerBetalingsIntegriteit_(ss) {
  try {
    const vfSheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    const jpSheet = ss.getSheetByName(SHEETS.JOURNAALPOSTEN);
    if (!vfSheet || !jpSheet) {
      return { check: 'Betalings-integriteit', status: 'OK',
        bericht: 'Tabbladen ontbreken — check overgeslagen.' };
    }

    // Verzamel ref-veld van alle bankontvangst-journaalposten (kolom 9 = ref)
    const jpData = jpSheet.getDataRange().getValues();
    const bankRefs = new Set();
    for (let i = 1; i < jpData.length; i++) {
      const debet  = String(jpData[i][4] || '');
      const credit = String(jpData[i][6] || '');
      if (debet === '1200' && credit === '1100') {
        const ref = String(jpData[i][9] || '').trim();
        if (ref) bankRefs.add(ref);
      }
    }

    // Loop alle BETAALD-facturen, check of ref aanwezig
    const vfData = vfSheet.getDataRange().getValues();
    const ontbrekend = [];
    for (let i = 1; i < vfData.length; i++) {
      const status = String(vfData[i][14] || '');
      if (status !== FACTUUR_STATUS.BETAALD) continue;
      const factuurnr = String(vfData[i][1] || '').trim();
      if (factuurnr && !bankRefs.has(factuurnr)) {
        ontbrekend.push(factuurnr);
        if (ontbrekend.length > 10) break; // cap voor performance
      }
    }

    if (ontbrekend.length === 0) {
      return { check: 'Betalings-integriteit', status: 'OK',
        bericht: 'Alle BETAALD-facturen hebben journaalpost 1200 → 1100.' };
    }
    return {
      check:   'Betalings-integriteit',
      status:  'FOUT',
      bericht: ontbrekend.length + ' factuur/facturen staan op BETAALD zonder ' +
               'journaalpost: ' + ontbrekend.slice(0, 5).join(', ') +
               (ontbrekend.length > 5 ? ' (+meer)' : '') +
               '. Maak journaalpost aan of zet status terug op OPEN.',
    };
  } catch (e) {
    return { check: 'Betalings-integriteit', status: 'FOUT',
      bericht: 'Check mislukt: ' + e.message };
  }
}

// ─────────────────────────────────────────────
//  CHECK 2: JOURNAALPOSTEN
// ─────────────────────────────────────────────

function controleerJournaalposten_(ss) {
  const resultaten = [];

  try {
    const data = leesSheetVeilig_(ss, SHEETS.JOURNAALPOSTEN);   // CYCLE-51

    const aantalPosten     = data.length - 1;
    let zelfboekingen    = 0;
    let nulBedragen      = 0;
    let toekomstDatums   = 0;
    const vandaag = new Date();

    for (let i = 1; i < data.length; i++) {
      const debet  = String(data[i][4] || '');
      const credit = String(data[i][6] || '');
      const bedrag = parseFloat(data[i][8]) || 0;
      const datum  = data[i][1] ? parseDatum_(data[i][1]) : null;

      // Zelfde rekening op debet én credit = fout
      if (debet && credit && debet === credit) zelfboekingen++;
      // Nulbedrag = verdacht
      if (bedrag === 0) nulBedragen++;
      // Toekomstige datum = verdacht
      if (datum && !isNaN(datum.getTime()) && datum > vandaag) toekomstDatums++;
    }

    resultaten.push({
      check: 'Boekingen – Totaal',
      status: 'OK',
      bericht: `${aantalPosten} boekingen gevonden.`,
    });

    if (zelfboekingen > 0) {
      resultaten.push({
        check: 'Boekingen – Foutieve regels',
        status: 'FOUT',
        bericht: `${zelfboekingen} boeking(en) hebben dezelfde rekening aan beide kanten. Dat kan niet — een boeking gaat altijd van één rekening naar een andere.`,
      });
    } else {
      resultaten.push({ check: 'Boekingen – Foutieve regels', status: 'OK', bericht: 'Geen foutieve regels gevonden.' });
    }

    if (nulBedragen > 0) {
      resultaten.push({
        check: 'Boekingen – Nulbedragen',
        status: 'WAARSCHUWING',
        bericht: `${nulBedragen} boeking(en) met bedrag €0,00. Controleer of dit klopt.`,
      });
    }

    if (toekomstDatums > 0) {
      resultaten.push({
        check: 'Boekingen – Toekomstige datums',
        status: 'WAARSCHUWING',
        bericht: `${toekomstDatums} boeking(en) met een datum in de toekomst. Controleer of dit bedoeld is.`,
      });
    }

  } catch (e) {
    resultaten.push({ check: 'Boekingen', status: 'FOUT', bericht: 'Fout bij controleren: ' + e.message });
  }

  return resultaten;
}

// ─────────────────────────────────────────────
//  CHECK 3: VERKOOPFACTUREN
// ─────────────────────────────────────────────

function controleerVerkoopfacturen_(ss) {
  const resultaten = [];

  try {
    const data = leesSheetVeilig_(ss, SHEETS.VERKOOPFACTUREN);   // CYCLE-51
    const nummers = {};
    let duplicaten     = 0;
    let geenKlant      = 0;
    let geenNummer     = 0;
    let negatiefBedrag = 0;
    let vervallenOpen  = 0;
    const vandaag = new Date();

    for (let i = 1; i < data.length; i++) {
      // Rijen die compleet leeg lijken (geen ID + geen klant + geen bedrag)
      // overslaan — voorkomt false positives op trailing-blanks na rijdelete.
      const heeftId     = !!String(data[i][0] || '').trim();
      const klant       = String(data[i][5] || '').trim();
      const bedragRaw   = parseFloat(data[i][12]);
      if (!heeftId && !klant && (isNaN(bedragRaw) || bedragRaw === 0)) continue;

      const nr      = String(data[i][1] || '').trim();
      const bedrag  = bedragRaw || 0;
      const status  = String(data[i][14] || '');
      const vervalD = data[i][3] ? parseDatum_(data[i][3]) : null;

      // CYCLE-26: factuurnummer ontbreken = wettelijk probleem (NL OB-1968
      // art. 35 vereist een doorlopend nummer per factuur). Eerder werd dit
      // silent geskipped doordat `if (nr)` false was → factuur passeerde
      // check ongezien.
      if (!nr) geenNummer++;
      else {
        if (nummers[nr]) duplicaten++;
        else nummers[nr] = true;
      }
      if (!klant) geenKlant++;
      if (bedrag < 0) negatiefBedrag++;
      if (vervalD && vervalD < vandaag && status !== FACTUUR_STATUS.BETAALD && status !== FACTUUR_STATUS.GECREDITEERD) {
        vervallenOpen++;
      }
    }

    if (geenNummer > 0) {
      resultaten.push({
        check: 'Facturen – Ontbrekend nummer',
        status: 'FOUT',
        bericht: `${geenNummer} factuur/facturen zonder factuurnummer. Wettelijk verplicht (NL OB-1968 art. 35) — vul een uniek nummer in of verwijder de rij.`,
      });
    }

    if (duplicaten > 0) {
      resultaten.push({ check: 'Facturen – Duplicaat nummers', status: 'FOUT',
        bericht: `${duplicaten} factuurnummer(s) komen meerdere keren voor. Dit is niet toegestaan — elk factuurnummer moet uniek zijn (wettelijk vereist).` });
    } else if (geenNummer === 0) {
      resultaten.push({ check: 'Facturen – Unieke nummers', status: 'OK', bericht: 'Alle factuurnummers zijn uniek.' });
    }

    if (geenKlant > 0) {
      resultaten.push({ check: 'Facturen – Ontbrekende klant', status: 'WAARSCHUWING',
        bericht: `${geenKlant} factuur/facturen zonder klantnaam. Dit kan problemen geven bij BTW-controle.` });
    }

    if (negatiefBedrag > 0) {
      resultaten.push({ check: 'Facturen – Negatieve bedragen', status: 'FOUT',
        bericht: `${negatiefBedrag} factuur/facturen met een negatief bedrag. Maak correctiefacturen (creditnota's) i.p.v. negatieve facturen.` });
    }

    if (vervallenOpen > 0) {
      resultaten.push({ check: 'Facturen – Vervallen onbetaald', status: 'WAARSCHUWING',
        bericht: `${vervallenOpen} factuur/facturen zijn vervallen maar nog niet betaald. Stuur een betalingsherinnering via Boekhouding → Facturen & Betalingen.` });
    } else {
      resultaten.push({ check: 'Facturen – Vervallen onbetaald', status: 'OK', bericht: 'Geen vervallen onbetaalde facturen.' });
    }

  } catch (e) {
    resultaten.push({ check: 'Verkoopfacturen', status: 'FOUT', bericht: 'Fout bij controleren: ' + e.message });
  }

  return resultaten;
}

// ─────────────────────────────────────────────
//  CHECK 4: BTW CONSISTENTIE
// ─────────────────────────────────────────────

function controleerBtwConsistentie_(ss) {
  try {
    const vfData = leesSheetVeilig_(ss, SHEETS.VERKOOPFACTUREN);   // CYCLE-51
    let btwMismatch = 0;

    for (let i = 1; i < vfData.length; i++) {
      const exclBtw  = parseFloat(vfData[i][9])  || 0;
      const btwLabel = String(vfData[i][10] || '');
      const btwBedrag = parseFloat(vfData[i][11]) || 0;
      const inclBtw  = parseFloat(vfData[i][12]) || 0;

      if (exclBtw <= 0) continue;

      const tarief = parseBtwTarief_(btwLabel);
      if (tarief === null) continue; // Vrijgesteld/Verlegd

      const verwachtBtw = rondBedrag_(exclBtw * tarief);
      const verwachtIncl = rondBedrag_(exclBtw + verwachtBtw);

      if (Math.abs(btwBedrag - verwachtBtw) > 0.02 || Math.abs(inclBtw - verwachtIncl) > 0.02) {
        btwMismatch++;
      }
    }

    if (btwMismatch > 0) {
      return {
        check: 'BTW – Rekensommen',
        status: 'FOUT',
        bericht: `${btwMismatch} factuur/facturen waarbij het BTW-bedrag niet overeenkomt met het verwachte bedrag op basis van het BTW-tarief. Dit kan leiden tot fouten in de BTW-aangifte.`,
      };
    }

    return { check: 'BTW – Rekensommen', status: 'OK', bericht: 'Alle BTW-bedragen zijn wiskundig correct.' };

  } catch (e) {
    return { check: 'BTW – Consistentie', status: 'FOUT', bericht: 'Fout bij BTW-controle: ' + e.message };
  }
}

// ─────────────────────────────────────────────
//  CHECK 5: INSTELLINGEN
// ─────────────────────────────────────────────

function controleerInstellingen_() {
  const resultaten = [];

  const verplicht = [
    { sleutel: 'Bedrijfsnaam',  label: 'Bedrijfsnaam',    uitleg: 'Verplicht op iedere factuur.' },
    { sleutel: 'BTW-nummer',    label: 'BTW-nummer',       uitleg: 'Verplicht op facturen > €100 (EU-regelgeving).' },
    { sleutel: 'KvK-nummer',    label: 'KvK-nummer',       uitleg: 'Verplicht voor BV/eenmanszaak op briefpapier.' },
    { sleutel: 'IBAN',          label: 'Bankrekening (IBAN)', uitleg: 'Nodig voor betalingsinstructie op factuur.' },
    { sleutel: 'Rechtsvorm',    label: 'Rechtsvorm',       uitleg: 'Nodig voor correcte belastingberekening.' },
  ];

  const ontbrekend = verplicht.filter(v => !getInstelling_(v.sleutel));

  if (ontbrekend.length === 0) {
    resultaten.push({ check: 'Instellingen – Verplichte velden', status: 'OK', bericht: 'Alle verplichte bedrijfsgegevens zijn ingevuld.' });
  } else {
    ontbrekend.forEach(v => {
      resultaten.push({
        check: `Instellingen – ${v.label}`,
        status: 'WAARSCHUWING',
        bericht: `${v.label} is niet ingevuld. ${v.uitleg} Ga naar tabblad "Instellingen" om dit in te vullen.`,
      });
    });
  }

  // CYCLE-23: format-validatie op gevulde velden. Voorheen werd alleen
  // PRESENCE gecheckt — klant kon 'abc' als IBAN of '123' als KvK invullen
  // en de check zou OK geven. Bij eerstvolgende factuur kreeg klant dan
  // pas onverklaarbare fouten (PDF zonder QR, KvK-API faalt, BTW-aangifte
  // schadig).
  function _veldFormaat_(sleutel, label, validator) {
    const waarde = getInstelling_(sleutel);
    if (!waarde) return;   // ontbreken al gemeld door verplicht-loop
    if (typeof validator !== 'function') return;
    try {
      const r = validator(waarde);
      if (!r.geldig) {
        resultaten.push({
          check: `Instellingen – ${label} formaat`,
          status: 'FOUT',
          bericht: `${label} heeft een ongeldig formaat. ${r.fout.split('\n')[0]}`,
        });
      }
    } catch (_) { /* validator ontbreekt — best-effort */ }
  }
  _veldFormaat_('IBAN',       'IBAN',       typeof valideerIban_       === 'function' ? valideerIban_       : null);
  _veldFormaat_('BTW-nummer', 'BTW-nummer', typeof valideerBtwNummer_ === 'function' ? valideerBtwNummer_ : null);
  _veldFormaat_('KvK-nummer', 'KvK-nummer', typeof valideerKvkNummer_ === 'function' ? valideerKvkNummer_ : null);

  return resultaten;
}

// ─────────────────────────────────────────────
//  RESULTATEN NAAR TABBLAD
// ─────────────────────────────────────────────

function schrijfGezondheidCheckResultaten_(ss, resultaten, score, fouten, waarsch, ok) {
  const bladNaam = 'Gezondheidscheck';
  let sheet = ss.getSheetByName(bladNaam);
  if (!sheet) {
    sheet = ss.insertSheet(bladNaam);
    sheet.setTabColor('#F57F17');
  }
  sheet.clearContents();
  sheet.clearFormats();

  const bedrijf = getInstelling_('Bedrijfsnaam') || '';
  const nu = new Date();

  // Koptekst
  sheet.getRange(1, 1, 1, 3).merge()
    .setValue(`GEZONDHEIDSCHECK – ${bedrijf}`)
    .setBackground(KLEUREN.HEADER_BG).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 3).merge()
    .setValue(`Uitgevoerd op ${formatDatumTijd_(nu)}  |  Score: ${score}/100  |  ✅ ${ok} in orde  |  ⚠️ ${waarsch} aandacht  |  ❌ ${fouten} fouten`)
    .setBackground(score >= 90 ? '#1B5E20' : score >= 70 ? '#E65100' : '#B71C1C')
    .setFontColor('#FFFFFF').setFontSize(11).setHorizontalAlignment('center');

  // Score visualisatie
  const scoreBalk = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
  sheet.getRange(3, 1, 1, 3).merge()
    .setValue(`Score ${score}/100  ${scoreBalk}`)
    .setFontFamily('Courier New').setFontSize(11)
    .setBackground(score >= 90 ? '#E8F5E9' : score >= 70 ? '#FFF8E1' : '#FFEBEE')
    .setHorizontalAlignment('center');

  // Headers
  sheet.getRange(5, 1, 1, 3)
    .setValues([['Check', 'Status', 'Toelichting']])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');

  const statusKleuren = {
    'OK':          '#E8F5E9',
    'WAARSCHUWING': '#FFF8E1',
    'FOUT':        '#FFEBEE',
  };
  const statusLabels = { 'OK': '✅ In orde', 'WAARSCHUWING': '⚠️ Let op', 'FOUT': '❌ Fout' };

  let rij = 6;
  resultaten.forEach(r => {
    const bg = statusKleuren[r.status] || '#FAFAFA';
    sheet.getRange(rij, 1).setValue(r.check).setBackground(bg).setFontWeight('bold');
    sheet.getRange(rij, 2).setValue(statusLabels[r.status] || r.status).setBackground(bg);
    sheet.getRange(rij, 3).setValue(r.bericht).setBackground(bg).setWrap(true);
    rij++;
  });

  // Actiepunten sectie
  const fouten_lijst = resultaten.filter(r => r.status === 'FOUT');
  const waarsch_lijst = resultaten.filter(r => r.status === 'WAARSCHUWING');

  if (fouten_lijst.length > 0 || waarsch_lijst.length > 0) {
    rij++;
    sheet.getRange(rij, 1, 1, 3).merge()
      .setValue('ACTIEPUNTEN — Dit vraagt uw aandacht:')
      .setBackground('#FF8F00').setFontColor('#FFFFFF').setFontWeight('bold');
    rij++;

    [...fouten_lijst, ...waarsch_lijst].forEach((r, idx) => {
      sheet.getRange(rij, 1, 1, 3).merge()
        .setValue(`${idx + 1}. [${r.check}] ${r.bericht}`)
        .setBackground(r.status === 'FOUT' ? '#FFEBEE' : '#FFF8E1')
        .setWrap(true).setFontSize(10);
      rij++;
    });
  }

  // Kolombreedte
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 500);
  sheet.setFrozenRows(5);

  ss.setActiveSheet(sheet);
}

/**
 * Stille gezondheidscheck — voert alle checks uit en schrijft alleen naar cache.
 * Geen UI, geen sheet-write. Bedoeld voor dagelijkse trigger.
 */
function voerGezondheidCheckStil_() {
  const ss = getSpreadsheet_();
  if (!ss) return;

  const resultaten = [];
  let aantalFouten = 0, aantalWaarsch = 0, aantalOk = 0;
  const tel = (r) => {
    if (r.status === 'FOUT') aantalFouten++;
    else if (r.status === 'OK') aantalOk++;
    else aantalWaarsch++;
    resultaten.push(r);
  };

  try { tel(controleerBalans_(ss)); } catch (e) { Logger.log('stille check balans: ' + e.message); }
  try { controleerJournaalposten_(ss).forEach(tel); } catch (e) { Logger.log('stille check jp: ' + e.message); }
  try { controleerVerkoopfacturen_(ss).forEach(tel); } catch (e) { Logger.log('stille check vf: ' + e.message); }
  try { tel(controleerBtwConsistentie_(ss)); } catch (e) { Logger.log('stille check btw: ' + e.message); }
  try { controleerInstellingen_().forEach(tel); } catch (e) { Logger.log('stille check inst: ' + e.message); }
  try { tel(controleerTaxBtwDeadlineCheck_()); } catch (e) { Logger.log('stille check tax-btw: ' + e.message); }
  try { tel(controleerTaxAdmBewaarplichtCheck_()); } catch (e) { Logger.log('stille check tax-adm: ' + e.message); }
  // CYCLE-24: deze twee checks zaten in voerGezondheidCheckUit_ (menu-pad)
  // maar NIET in de stille variant — dus dashboard-score reflecteerde ze
  // niet. Klanten die de check niet handmatig draaien misten signalen over:
  //   - verweesde facturen (klant verwijderd uit Relaties → audit-trail
  //     loopt vast)
  //   - betalings-integriteit (status=BETAALD zonder JP-1200→1100 = scheef
  //     grootboek, vaak gevolg van crash-tijdens-betaling)
  try { controleerReferentiele_(ss).forEach(tel); } catch (e) { Logger.log('stille check ref: ' + e.message); }
  try { tel(controleerBetalingsIntegriteit_(ss)); } catch (e) { Logger.log('stille check betint: ' + e.message); }

  const totaal = aantalFouten + aantalWaarsch + aantalOk;
  const score  = totaal > 0 ? Math.round(((aantalOk + aantalWaarsch * 0.5) / totaal) * 100) : 100;

  try {
    PropertiesService.getDocumentProperties().setProperties({
      'GEZONDHEID_SCORE':    String(score),
      'GEZONDHEID_FOUTEN':   String(aantalFouten),
      'GEZONDHEID_WAARSCH':  String(aantalWaarsch),
      'GEZONDHEID_DATUM':    new Date().toISOString(),
    });
  } catch (e) { Logger.log('stille check cache: ' + e.message); }
}

/**
 * Leest gecachte gezondheidscheck-score (van laatste run).
 * Retourneert null als er nog nooit een check is uitgevoerd.
 */
function leesGezondheidScoreCache_() {
  try {
    const p = PropertiesService.getDocumentProperties();
    const score = p.getProperty('GEZONDHEID_SCORE');
    const datum = p.getProperty('GEZONDHEID_DATUM');
    if (score === null || datum === null) return null;
    return {
      score:   parseInt(score, 10),
      fouten:  parseInt(p.getProperty('GEZONDHEID_FOUTEN')  || '0', 10),
      waarsch: parseInt(p.getProperty('GEZONDHEID_WAARSCH') || '0', 10),
      datum:   new Date(datum),
    };
  } catch (e) { Logger.log('leesGezondheidScoreCache_: ' + e.message); return null; }
}

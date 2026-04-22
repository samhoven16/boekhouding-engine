/**
 * Suggesties.gs — context-based, data-driven aanbevelingen.
 *
 * FILOSOFIE
 * ─────────
 * Boekhoudbaar ziet de klant-data die een externe website niet ziet:
 * of er een IBAN is, hoeveel BTW er dit kwartaal betaald wordt,
 * hoeveel openstaande facturen er zijn, hoeveel herhalende kosten.
 * Dat maakt gerichte, warme aanbevelingen mogelijk op het moment dat
 * de klant de pijn daadwerkelijk voelt — in plaats van koude banners.
 *
 * MECHANIEK
 * ─────────
 *  - `checkSuggesties_()` draait aan het eind van `vernieuwDashboard()`
 *  - Elke trigger is een regel in SUGGESTIES_CATALOG met een conditie-fn
 *    die de KPI-snapshot + sheet leest en true/false teruggeeft
 *  - Eén trigger per dashboard-refresh, hoogste prioriteit eerst
 *  - Niet tonen als: (a) gedismissed, (b) < 7 dagen sinds laatste tonen,
 *    (c) SUGGESTIES_UIT=true in Script Properties
 *  - Tonen = discrete `ss.toast()` + audit-log entry (tracken conversie)
 *  - CTA-URLs lopen via /go/<partner> op eigen domein zodat we de
 *    affiliate-link zonder code-change kunnen swappen
 *
 * DISCLOSURE
 * ──────────
 * Elke toast bevat "(samenwerking)" als laatste woord voor NL
 * affiliate-disclosure (ACM / RCC 2025). De gids-pagina waar de
 * klant vervolgens heen klikt heeft het volledige disclosure-blok.
 *
 * GEEN POP-UPS. GEEN MODALS. GEEN FORCED ACTIONS.
 * Alleen een onzichtbare-tot-relevant toast rechtsonder, 8 seconden.
 */

// Eén trigger mag frequentie-capped worden per X dagen
const SUGGESTIE_COOLDOWN_DAGEN = 14;

// User-property-prefix: suggestie:<id>:laatstGetoond = ISO-datum
const SUGGESTIE_PROP_PREFIX = 'suggestie:';

// Global kill-switch in Script Properties (voor support-escalatie)
const SUGGESTIES_UIT_PROP = 'SUGGESTIES_UIT';

// Base URL voor tracking-redirects (op eigen domein, swapbaar)
const GO_BASE_URL = 'https://www.boekhoudbaar.nl/go/';

/**
 * Catalog van alle suggesties. Volgorde = prioriteit (hoogste eerst).
 * Toevoegen: push een object aan het einde met hogere `id`-suffix.
 *
 * Velden:
 *   id         — unieke kortstring voor UserProperties + audit
 *   titel      — toast-titel (max ±40 chars)
 *   body       — toast-body (max ±140 chars, eindigt met "(samenwerking)")
 *   cta        — go-slug, bijv. 'bunq' → https://go... /go/bunq
 *   conditie   — function(ctx) → boolean, ctx = { ss, kpi, btwData }
 *   minDagenCooldown — override default 14 dagen indien gewenst
 */
const SUGGESTIES_CATALOG = [
  {
    id: 'geen-iban',
    titel: 'Nog geen zakelijke rekening?',
    body: 'bunq Business is gratis voor ZZP, direct online aan te vragen. '
        + 'Bekijk waarom — en of het bij je past. (samenwerking)',
    cta: 'bunq',
    prioriteit: 100,
    conditie: function(ctx) {
      const iban = (getInstelling_('IBAN') || '').replace(/\s+/g, '');
      return iban.length < 10;
    },
  },
  {
    id: 'veel-openstaand',
    titel: 'Veel openstaande facturen',
    body: 'Stuur betalingsherinneringen automatisch via Zapier of '
        + 'de ingebouwde functie. Bekijk tips. (samenwerking)',
    cta: 'zapier',
    prioriteit: 80,
    conditie: function(ctx) {
      const aantalOpen = telOpenstaandeVerkoopfacturen_(ctx.ss);
      return aantalOpen >= 15;
    },
  },
  {
    id: 'veel-herhalende-kosten',
    titel: 'Veel vaste lasten',
    body: 'Koppel je bankafschrijvingen automatisch via Zapier zodat '
        + 'je nooit meer een boeking mist. (samenwerking)',
    cta: 'zapier',
    prioriteit: 70,
    conditie: function(ctx) {
      const aantal = telActieveHerhalendeKosten_(ctx.ss);
      return aantal >= 10;
    },
  },
  {
    id: 'hoge-btw-afdracht',
    titel: 'Hoge BTW-afdracht dit kwartaal',
    body: 'Tip: reserveer BTW direct op een aparte rekening. '
        + 'Lees onze gratis gids. (intern)',
    cta: 'btw-reserveren',
    prioriteit: 60,
    conditie: function(ctx) {
      return (ctx.kpi && ctx.kpi.btwTeBetalen > 1000);
    },
  },
  {
    id: 'geen-boekhouder',
    titel: 'Laat een boekhouder meekijken',
    body: 'Bij >€10k omzet kan een check door een boekhouder veel opleveren. '
        + 'Vind er één via ons netwerk. (samenwerking)',
    cta: 'accountant-netwerk',
    prioriteit: 40,
    conditie: function(ctx) {
      return (ctx.kpi && ctx.kpi.omzet > 10000);
    },
  },
];

/**
 * Hoofdingang — roep aan na `vernieuwDashboard()`. Crashed nooit:
 * elke suggestie-conditie runt in try/catch, en de hoofdwrapper
 * zelf ook. Triggerde ook niets als UI niet beschikbaar is
 * (bv. tijdens time-driven trigger-context).
 */
function checkSuggesties_() {
  try {
    // Globale kill-switch
    if (PropertiesService.getScriptProperties().getProperty(SUGGESTIES_UIT_PROP) === 'true') {
      return;
    }

    const ss = getSpreadsheet_();

    // UI-probe — als er geen SpreadsheetApp.toast beschikbaar is
    // (trigger zonder UI), niet proberen te tonen
    if (!ss.toast) return;

    const kpi = lezeKpiSnapshotVoorSuggesties_(ss);
    const ctx = { ss: ss, kpi: kpi };

    const userProps = PropertiesService.getUserProperties();
    const nu = new Date();

    // Sorteer op prioriteit descending en pak de eerste die matcht + niet
    // in cooldown zit. Maximaal één suggestie per refresh.
    const gesorteerd = SUGGESTIES_CATALOG.slice().sort(function(a, b) {
      return (b.prioriteit || 0) - (a.prioriteit || 0);
    });

    for (let i = 0; i < gesorteerd.length; i++) {
      const s = gesorteerd[i];
      if (inCooldown_(userProps, s, nu)) continue;
      let matcht = false;
      try { matcht = !!s.conditie(ctx); } catch (e) {
        Logger.log('Suggestie ' + s.id + ' conditie-fout: ' + e.message);
        continue;
      }
      if (!matcht) continue;

      toonSuggestieToast_(ss, s);
      registreerSuggestieGetoond_(userProps, s, nu);
      try {
        schrijfAuditLog_('Suggestie getoond', s.id + ' → ' + s.cta);
      } catch (_) { /* audit-log niet kritiek */ }
      return; // eentje per refresh is genoeg
    }
  } catch (e) {
    // Suggesties mogen NOOIT het dashboard breken
    Logger.log('checkSuggesties_ wrapper fout: ' + e.message);
  }
}

/**
 * Toont een suggestie als non-intrusive toast.
 * Titel links vet, body erachter. 10 seconden.
 * Bevat de go-URL in de body zodat klant kan klikken
 * (Google Sheets toast ondersteunt geen clickable links rechtstreeks,
 * daarom sluiten we af met de URL als tekst).
 */
function toonSuggestieToast_(ss, suggestie) {
  const url = GO_BASE_URL + suggestie.cta;
  const bodyMetLink = suggestie.body + '\n→ ' + url;
  ss.toast(bodyMetLink, suggestie.titel, 10);
}

function inCooldown_(userProps, suggestie, nu) {
  const key = SUGGESTIE_PROP_PREFIX + suggestie.id + ':laatstGetoond';
  const laatst = userProps.getProperty(key);
  if (!laatst) return false;
  const cooldownDagen = suggestie.minDagenCooldown || SUGGESTIE_COOLDOWN_DAGEN;
  const laatstDatum = new Date(laatst);
  if (isNaN(laatstDatum.getTime())) return false;
  const verschilDagen = (nu.getTime() - laatstDatum.getTime()) / (1000 * 60 * 60 * 24);
  return verschilDagen < cooldownDagen;
}

function registreerSuggestieGetoond_(userProps, suggestie, nu) {
  const key = SUGGESTIE_PROP_PREFIX + suggestie.id + ':laatstGetoond';
  userProps.setProperty(key, nu.toISOString());
}

/**
 * Leest de KPI-snapshot zonder de dashboard-tab te hertekenen.
 * Geeft fallback-waarden als snapshot ontbreekt.
 */
function lezeKpiSnapshotVoorSuggesties_(ss) {
  try {
    if (typeof leesKpiSnapshot_ === 'function') {
      const snap = leesKpiSnapshot_();
      if (snap) return snap;
    }
    if (typeof berekenKpiData_ === 'function') return berekenKpiData_(ss);
    if (typeof berekenKengetallen_ === 'function') return berekenKengetallen_(ss);
  } catch (_) { /* snapshot kon falen; vallen terug naar lege kpi */ }
  return { omzet: 0, kosten: 0, btwTeBetalen: 0, nettowinst: 0, banksaldo: 0 };
}

/**
 * Telt openstaande verkoopfacturen (status ≠ Betaald).
 */
function telOpenstaandeVerkoopfacturen_(ss) {
  try {
    const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
    if (!sheet) return 0;
    const data = sheet.getDataRange().getValues();
    let aantal = 0;
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][12] || '').trim();
      if (status && status !== FACTUUR_STATUS.BETAALD) aantal++;
    }
    return aantal;
  } catch (_) { return 0; }
}

/**
 * Telt actieve herhalende kosten (auto-boek = Ja, niet gepauzeerd).
 */
function telActieveHerhalendeKosten_(ss) {
  try {
    const sheet = ss.getSheetByName(SHEETS.HERHALENDE_KOSTEN);
    if (!sheet) return 0;
    const data = sheet.getDataRange().getValues();
    let aantal = 0;
    for (let i = 1; i < data.length; i++) {
      const actief = String(data[i][0] || '').trim().toLowerCase();
      if (actief === 'ja' || actief === 'actief') aantal++;
    }
    return aantal;
  } catch (_) { return 0; }
}

/**
 * Admin-functie: reset alle suggestie-cooldowns voor de huidige user.
 * Handig als klant suggesties opnieuw wil zien, of voor support-debug.
 */
function resetSuggestieCooldowns() {
  const userProps = PropertiesService.getUserProperties();
  const alle = userProps.getProperties();
  let verwijderd = 0;
  Object.keys(alle).forEach(function(key) {
    if (key.indexOf(SUGGESTIE_PROP_PREFIX) === 0) {
      userProps.deleteProperty(key);
      verwijderd++;
    }
  });
  SpreadsheetApp.getActive().toast(
    verwijderd + ' cooldown(s) gereset. Suggesties kunnen nu opnieuw verschijnen.',
    'Suggesties gereset', 5
  );
}

/**
 * Changelog.gs
 * In-product changelog. Bij eerste open na een product-update krijgt klant
 * een modal te zien met "wat is er nieuw" — toont actief onderhoud, maakt
 * klant blij met gratis updates, voorkomt support-vragen "is dit nieuw?".
 *
 * Werking:
 *  - Bij elke push verhoogt geinstalleerde_versie in ScriptProperties
 *  - onOpen vergelijkt huidige versie met laatst-geziene versie per user
 *  - Verschil → toon modal met release-notes voor de tussenliggende versies
 *  - Klant klikt "Bekijken" → user-property gezet → niet meer tonen tot
 *    volgende update
 *
 * Klant kan changelog ook handmatig opvragen via menu.
 */

// Per release: voeg een entry toe BOVENAAN. Major-versies krijgen
// uitgebreidere notes; patch-versies krijgen 1-2 regels.
const CHANGELOG_ENTRIES = [
  {
    versie: '2.7.0',
    datum: '2026-06-16',
    titel: '🔒 Minder Google-toegang + BTW-bewijsstukcheck',
    items: [
      'Minder Google-toegang nodig: smallere Drive- en mail-rechten → een vriendelijker toestemmingsscherm bij het eerste gebruik',
      'BTW: waarschuwing als voorbelasting wordt geclaimd zonder bewijsstuk (art. 15 Wet OB) — handig vóór een controle',
      'Privacybeleid uitgebreid met per-scope-uitleg + duidelijkere onboarding bij het Google "niet geverifieerd"-scherm',
    ],
  },
  {
    versie: '2.6.0',
    datum: '2026-05-08',
    titel: '🎁 Verwijs een vriend',
    items: [
      'Nieuwe optie: Boekhouding → 🎁 Verwijs een vriend — jullie krijgen beide €5',
      '/demo/ pagina op website: prospects kunnen klikken zonder te kopen',
      'Refer-a-friend met persoonlijke link + share-knoppen voor WhatsApp/email/LinkedIn/Twitter',
    ],
  },
  {
    versie: '2.5.0',
    datum: '2026-05-08',
    titel: '⚖️ Juridische indekking + 13/10 transparantie',
    items: [
      'Nieuwe pagina: /bronnen/ met directe links naar Belastingdienst, overheid.nl, KvK',
      'Nieuwe pagina: /roadmap/ — open planning, eerlijke status per feature',
      'Besparingscalculator op homepage: live vergelijking met abonnement',
      'Privacy uitgebreid met 6-rijige sub-verwerkers-tabel',
      'Voorwaarden artikel 9 (aansprakelijkheid) versterkt: 8 expliciete uitsluitingen',
      'Bronvermelding in fiscaal-overzicht-output: Belastingdienst.nl + Wet IB 2001 + Wet OB 1968',
      'Wat-was-"advies" → nu correct "signalering" / "informatie" / "berekening"',
    ],
  },
  {
    versie: '2.4.0',
    datum: '2026-05-07',
    titel: '🚀 Pre-launch maximalisatie',
    items: [
      'P1 KRITIEK: marginaal IB-tarief in besparing-berekeningen (was schijf-1, nu juiste schijf)',
      '60s submit-timeout in factuur-dialog (geen eindeloos hangen)',
      'Bedrag-parser EU-formaat: €75 / 75,00 / 75.00 / 1.234,56 allemaal werken',
      'Email-validatie pre-flight in factuur-dialog',
      'Audit-log volledig in data-export (was 90d, nu 7 jaar AWR-compliant)',
      'Hard-protect Dashboard + Journaalposten (alleen eigenaar editeert)',
      'Tabblad-recovery: per ongeluk verwijderd tabblad wordt automatisch opnieuw aangemaakt',
      'Drive-quota pre-check vóór setup',
      'Drip email-serie dag 3/7/14/30 voor nieuwe klanten',
      'Mobile responsive dialogs (tap-targets 48px, anti-iOS-zoom)',
    ],
  },
  {
    versie: '2.3.0',
    datum: '2026-05-07',
    titel: '🎯 Eerste-klant-readiness',
    items: [
      'Nieuw menu: Boekhouding → Controle → ✅ Werkt-alles-test (12 punts smoke-test)',
      'Scope-lockdown: alleen door deze app gemaakte files toegankelijk',
      'Compensating rollback bij betaling-fout (factuur niet langer in BETAALD zonder journaalpost)',
      'BTW case-insensitive: "verlegd" / "VRIJGESTELD" werken nu correct',
      'Onbekende BTW-labels detectie + waarschuwing (geen stille €0)',
    ],
  },
];

const CHANGELOG_USER_PROP = 'changelogLaatstGezien';

/**
 * Semver-compare: -1 als a < b, 0 als gelijk, 1 als a > b.
 * Voorheen werd string-compare gebruikt — werkt voor 2.6.0 vs 2.5.0
 * maar faalt op 2.10.0 vs 2.9.0 (lexicografisch: "1" < "9").
 * Werkt voor X.Y.Z. Niet-numerieke tokens worden als 0 geteld.
 */
function _vergelijkVersie_(a, b) {
  const aP = String(a || '0').split('.').map(function(x) { return parseInt(x, 10) || 0; });
  const bP = String(b || '0').split('.').map(function(x) { return parseInt(x, 10) || 0; });
  const len = Math.max(aP.length, bP.length);
  for (let i = 0; i < len; i++) {
    const av = aP[i] || 0;
    const bv = bP[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/**
 * Toont changelog-modal als klant een nieuwe versie ziet.
 * Aangeroepen vanuit onOpen. Throttle: maximaal 1× per versie.
 */
function checkEnToonChangelog_() {
  try {
    const userProps = PropertiesService.getUserProperties();
    const scriptProps = PropertiesService.getScriptProperties();
    const huidigeVersie = scriptProps.getProperty('geinstalleerde_versie') || '';
    if (!huidigeVersie) return;
    const laatstGezien = userProps.getProperty(CHANGELOG_USER_PROP) || '';
    if (laatstGezien === huidigeVersie) return;  // al gezien

    // Eerste keer ooit (geen laatstGezien) → niet pluggen, gewoon huidig zetten.
    // Anders: toon changelog van laatstGezien → huidigeVersie.
    if (!laatstGezien) {
      userProps.setProperty(CHANGELOG_USER_PROP, huidigeVersie);
      return;
    }

    toonChangelog(huidigeVersie, laatstGezien);
    userProps.setProperty(CHANGELOG_USER_PROP, huidigeVersie);
  } catch (e) {
    Logger.log('checkEnToonChangelog_ silent fail: ' + e.message);
  }
}

/**
 * Publiek: toon changelog-modal vanuit menu (Boekhouding → Wat is er nieuw?)
 */
function toonChangelog(huidigeVersie, sindsVersie) {
  const ui = (function() { try { return SpreadsheetApp.getUi(); } catch (_) { return null; } })();
  if (!ui) return;

  const huidig = huidigeVersie || (PropertiesService.getScriptProperties().getProperty('geinstalleerde_versie') || '');
  // Filter entries: alleen versies tussen sindsVersie en huidig.
  // Bij geen sindsVersie: laatste 5 entries.
  let teTonen = CHANGELOG_ENTRIES;
  if (sindsVersie) {
    teTonen = CHANGELOG_ENTRIES.filter(function(e) {
      return _vergelijkVersie_(e.versie, sindsVersie) > 0;
    });
  } else {
    teTonen = CHANGELOG_ENTRIES.slice(0, 5);
  }
  if (teTonen.length === 0) teTonen = CHANGELOG_ENTRIES.slice(0, 1);

  const entriesHtml = teTonen.map(function(e) {
    const itemsHtml = e.items.map(function(i) { return '<li>' + escHtml_(i) + '</li>'; }).join('');
    return '<div class="entry">' +
      '<div class="head"><span class="versie">v' + escHtml_(e.versie) + '</span><span class="datum">' + escHtml_(e.datum) + '</span></div>' +
      '<h3>' + escHtml_(e.titel) + '</h3>' +
      '<ul>' + itemsHtml + '</ul>' +
      '</div>';
  }).join('');

  const html = HtmlService.createHtmlOutput(`
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
           padding:26px 28px;color:#1A1A1A;background:#F7F9FC;-webkit-font-smoothing:antialiased}
      .label{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#2EC4B6;margin-bottom:6px}
      h1{color:#0D1B4E;font-size:22px;font-weight:800;letter-spacing:-0.015em;margin-bottom:6px;line-height:1.25}
      p.sub{color:#5F6B7A;font-size:13px;line-height:1.55;margin-bottom:18px}
      .entry{background:#fff;border:1px solid #E5EAF2;border-radius:12px;padding:16px 18px;margin-bottom:12px}
      .entry .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;color:#5F6B7A}
      .entry .versie{background:rgba(46,196,182,.12);color:#0D4F47;padding:2px 8px;border-radius:6px;font-weight:700;letter-spacing:0.3px}
      .entry h3{color:#0D1B4E;font-size:15px;font-weight:700;margin-bottom:8px}
      .entry ul{margin:0 0 0 18px;font-size:13px;color:#1A1A1A;line-height:1.7}
      .footer{margin-top:18px;padding-top:14px;border-top:1px solid #E5EAF2;display:flex;justify-content:space-between;align-items:center;gap:8px}
      .footer .info{font-size:12px;color:#5F6B7A}
      .footer button{background:#0D1B4E;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px}
      .footer button:hover{background:#1A2A6B}
    </style>

    <div class="label">📰 Wat is er nieuw</div>
    <h1>Boekhoudbaar updates</h1>
    <p class="sub">Gratis updates — komen automatisch mee bij elke open van je sheet. Hieronder de laatste wijzigingen.</p>

    ${entriesHtml}

    <div class="footer">
      <span class="info">Volledige roadmap: <a href="https://www.boekhoudbaar.nl/roadmap/" target="_blank" style="color:#0D1B4E">boekhoudbaar.nl/roadmap</a></span>
      <button type="button" data-actie="sluit">Sluiten</button>
    </div>

    <script>
      document.querySelectorAll('[data-actie="sluit"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          try { google.script.host.close(); } catch (_) {}
        });
      });
    </script>
  `).setWidth(520).setHeight(560).setSandboxMode(HtmlService.SandboxMode.IFRAME);

  ui.showModalDialog(html, '📰 Wat is er nieuw');
}

/**
 * Publiek wrapper voor menu-aanroep
 */
function toonChangelogVolledig() {
  toonChangelog(null, null);
}

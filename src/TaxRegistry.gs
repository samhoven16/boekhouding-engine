/**
 * TaxRegistry.gs
 * Tax Rules Registry v1 — Build Slice 1
 * Signals: TAX-BTW-001 (BTW kwartaaldeadline), TAX-ADM-001 (Bewaarplicht)
 *
 * Architectuurregels:
 *  - Geen hardcoded jaarbedragen in UX-copy. Bedragen via getTaxRegistryValue_().
 *  - Bedragen met confirmed: false vereisen externe verificatie vóór productie.
 *  - Volgorde: detect → audit_log → show. Nooit automatisch claimen of blokkeren.
 *  - Override altijd mogelijk met audit-log.
 *  - Slice 1 scope: ALLEEN TAX-BTW-001 en TAX-ADM-001. Geen andere signalen toevoegen.
 */

// ─────────────────────────────────────────────
//  REGISTRY DATA
// ─────────────────────────────────────────────

const TAX_REGISTRY = {

  'TAX-BTW-001': {
    signal_name:      'BTW kwartaalaangifte deadline',
    belastingsoort:   'BTW',
    rule_status:      'enacted',
    year_sensitive:   false,
    source_articles:  ['art. 19 AWR', 'art. 10 Wet OB 1968', 'art. 67b AWR'],
    source_url:       'https://wetten.overheid.nl/BWBR0002320/',
    valid_from_year:  2000,
    valid_until_year: null,
    check_required:   false,
    notes:            'Deadline: laatste dag van de maand volgend op kwartaaleinde. Structureel stabiel.',
    registry_values:  null,   // geen jaarbedragen — puur datum-arithmetiek
  },

  'TAX-ADM-001': {
    signal_name:      'Bewaarplicht administratie',
    belastingsoort:   'AWR',
    rule_status:      'enacted',
    year_sensitive:   false,
    source_articles:  ['art. 52 lid 1 AWR', 'art. 52 lid 4 AWR'],
    source_url:       'https://wetten.overheid.nl/BWBR0002320/',
    valid_from_year:  1994,
    valid_until_year: null,
    check_required:   false,
    notes:            '7 jaar standaard. 10 jaar onroerend goed. Stabiel in de wet.',
    registry_values:  {
      bewaartermijn: {
        standaard:      { jaren: 7,  confirmed: true },
        onroerend_goed: { jaren: 10, confirmed: true },
      },
    },
  },

};

// ─────────────────────────────────────────────
//  REGISTRY ACCESSORS
// ─────────────────────────────────────────────

/**
 * Geeft een tax rule op uit de registry.
 * @param {string} ruleId - bijv. 'TAX-BTW-001'
 * @returns {Object|null}
 */
function getTaxRule_(ruleId) {
  return TAX_REGISTRY[ruleId] || null;
}

/**
 * Geeft een waarde op via dot-pad uit registry_values.
 * Bijv.: getTaxRegistryValue_('TAX-ADM-001', 'bewaartermijn.standaard.jaren') → 7
 * @param {string} ruleId
 * @param {string} pad - dot-separated path
 * @returns {*|null}
 */
function getTaxRegistryValue_(ruleId, pad) {
  const rule = getTaxRule_(ruleId);
  if (!rule || !rule.registry_values) return null;
  return pad.split('.').reduce(function(obj, sleutel) {
    return (obj != null && obj[sleutel] !== undefined) ? obj[sleutel] : null;
  }, rule.registry_values);
}

// ─────────────────────────────────────────────
//  TAX AUDIT LOG
// ─────────────────────────────────────────────

/**
 * Schrijft een tax-signaal-event naar het bestaande audit log.
 * Hergebruikt schrijfAuditLog_() uit BoekingEngine.gs.
 * Nooit crashen — silent fail als schrijfAuditLog_ niet beschikbaar is.
 * @param {string} ruleId
 * @param {Object} payload - key-value pairs voor het log
 */
function logTaxSignaal_(ruleId, payload) {
  try {
    const delen = Object.keys(payload).map(function(k) {
      return k + '=' + String(payload[k]);
    });
    schrijfAuditLog_('TAX | ' + ruleId, delen.join(' | '));
  } catch (e) {
    Logger.log('logTaxSignaal_ fout [' + ruleId + ']: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  TAX-BTW-001 — BTW KWARTAALDEADLINE
// ─────────────────────────────────────────────

/**
 * Evalueert de BTW-aangifte deadline voor het huidige kwartaal.
 * Hergebruikt huidigeKwartaal_() uit BTWReminder.gs.
 * Schrijft audit-log. Geeft signaal-object terug.
 * BLOKKEERT NOOIT boeking-flows.
 *
 * Drempellogica:
 *   dagenTot > 14  → status OK    (geen melding)
 *   dagenTot 8–14  → WAARSCHUWING (14-dagengrens)
 *   dagenTot 0–7   → WAARSCHUWING + urgent
 *   dagenTot < 0   → FOUT (deadline verstreken)
 *
 * @returns {{ ruleId, status, dagenTot, deadline, kwartaal, bericht, urgent }}
 */
function evalueerTaxBtwDeadline_() {
  const kw      = huidigeKwartaal_();   // bestaand in BTWReminder.gs
  const nu      = new Date();
  const dagenTot = Math.ceil((kw.deadline - nu) / (1000 * 60 * 60 * 24));

  let status, bericht, urgent;

  if (dagenTot > 14) {
    status  = 'OK';
    bericht = null;
    urgent  = false;
  } else if (dagenTot > 7) {
    status  = 'WAARSCHUWING';
    bericht = 'BTW-aangifte ' + kw.kw + ' is verschuldigd vóór ' +
              kw.deadline.toLocaleDateString('nl-NL') +
              '. Nog ' + dagenTot + ' dagen. (art. 19 AWR)';
    urgent  = false;
  } else if (dagenTot >= 0) {
    status  = 'WAARSCHUWING';
    bericht = 'Urgent: BTW-aangifte ' + kw.kw + ' — deadline ' +
              kw.deadline.toLocaleDateString('nl-NL') +
              ' (nog ' + dagenTot + ' dag' + (dagenTot === 1 ? '' : 'en') +
              '). (art. 19 AWR)';
    urgent  = true;
  } else {
    status  = 'FOUT';
    bericht = 'BTW-aangifte ' + kw.kw + ' deadline (' +
              kw.deadline.toLocaleDateString('nl-NL') +
              ') is verstreken. Dien zo snel mogelijk in via mijn.belastingdienst.nl. (art. 19 AWR)';
    urgent  = true;
  }

  logTaxSignaal_('TAX-BTW-001', {
    kwartaal:  kw.kw,
    deadline:  kw.deadline.toLocaleDateString('nl-NL'),
    dagen_tot: dagenTot,
    status:    status,
    urgent:    urgent,
  });

  return {
    ruleId:   'TAX-BTW-001',
    status:   status,
    dagenTot: dagenTot,
    deadline: kw.deadline,
    kwartaal: kw.kw,
    bericht:  bericht,
    urgent:   urgent,
  };
}

/**
 * GezondheidCheck-wrapper voor TAX-BTW-001.
 * Geeft { check, status, bericht } terug conform het bestaande check-patroon.
 * @returns {{ check: string, status: string, bericht: string }}
 */
function controleerTaxBtwDeadlineCheck_() {
  try {
    const s = evalueerTaxBtwDeadline_();
    if (s.status === 'OK') {
      return {
        check:   'Belasting – BTW aangifte deadline (TAX-BTW-001)',
        status:  'OK',
        bericht: 'BTW-aangifte ' + s.kwartaal + ' — deadline ' +
                 s.deadline.toLocaleDateString('nl-NL') +
                 '. Meer dan 14 dagen. Geen actie nodig. (art. 19 AWR)',
      };
    }
    return {
      check:   'Belasting – BTW aangifte deadline (TAX-BTW-001)',
      status:  s.status,
      bericht: s.bericht,
    };
  } catch (e) {
    return {
      check:   'Belasting – BTW aangifte deadline (TAX-BTW-001)',
      status:  'FOUT',
      bericht: 'Kon BTW-deadline niet controleren: ' + e.message,
    };
  }
}

/**
 * Publieke entry-point voor TAX-BTW-001.
 * Evalueert deadline en toont in-app melding als actie vereist.
 * Aanroepbaar via menu of trigger.
 * BLOKKEERT NOOIT boeking-flows.
 */
function controleerTaxBtwDeadline() {
  try {
    const s = evalueerTaxBtwDeadline_();
    if (s.status === 'OK' || !s.bericht) return;

    const ui    = SpreadsheetApp.getUi();
    const titel = s.urgent
      ? '⚠️ BTW-deadline — actie vereist'
      : '📅 BTW-aangifte herinnering';
    ui.alert(
      titel,
      s.bericht + '\n\nVoor de aangifte: mijn.belastingdienst.nl',
      ui.ButtonSet.OK
    );
  } catch (e) {
    Logger.log('controleerTaxBtwDeadline fout: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  TAX-ADM-001 — BEWAARPLICHT ADMINISTRATIE
// ─────────────────────────────────────────────

/**
 * Evalueert of een document nog binnen de wettelijke bewaartermijn valt.
 * Bedoeld voor aanroep vóór elke document-delete poging.
 * Schrijft audit-log.
 * BLOKKEERT NOOIT — geeft signaal terug, gebruiker beslist.
 *
 * @param {Date|string} documentDatum
 * @param {string}      documentType - 'onroerend_goed' of 'standaard'
 * @returns {{ ruleId, binnentermijn, leeftijdJaar, termijnJaar, bericht }}
 */
function controleerBewaartermijn_(documentDatum, documentType) {
  const type       = (documentType === 'onroerend_goed') ? 'onroerend_goed' : 'standaard';
  const termijnJaar = getTaxRegistryValue_('TAX-ADM-001', 'bewaartermijn.' + type + '.jaren') || 7;

  const datum      = (documentDatum instanceof Date) ? documentDatum : new Date(documentDatum);
  const nu         = new Date();
  const leeftijdJaar = (nu - datum) / (1000 * 60 * 60 * 24 * 365.25);
  const binnentermijn = leeftijdJaar < termijnJaar;

  logTaxSignaal_('TAX-ADM-001', {
    actie:          'delete_check',
    doc_type:       type,
    leeftijd_jaar:  Math.round(leeftijdJaar * 10) / 10,
    termijn_jaar:   termijnJaar,
    binnen_termijn: binnentermijn,
  });

  return {
    ruleId:        'TAX-ADM-001',
    binnentermijn: binnentermijn,
    leeftijdJaar:  Math.round(leeftijdJaar * 10) / 10,
    termijnJaar:   termijnJaar,
    bericht: binnentermijn
      ? 'Dit document is ' + Math.floor(leeftijdJaar) + ' jaar oud. ' +
        'De wettelijke bewaartermijn is ' + termijnJaar + ' jaar (art. 52 AWR). ' +
        'Weet u zeker dat u het wilt verwijderen?'
      : null,
  };
}

/**
 * Toont de eenmalige onboarding-tip voor de bewaarplicht.
 * Idempotent: toont nooit twee keer aan dezelfde installatie.
 * Aanroepen vanuit onboarding-wizard of setup.
 */
function toonTaxAdmOnboardingTip_() {
  const PROP_KEY = 'taxAdm001OnboardingGetoond';
  const props    = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_KEY) === 'ja') return;

  try {
    SpreadsheetApp.getUi().alert(
      '📂 Bewaarplicht administratie (art. 52 AWR)',
      'Bewaar uw volledige administratie minimaal 7 jaar (art. 52 AWR).\n\n' +
      'Voor documenten met betrekking tot onroerend goed geldt een termijn van 10 jaar.\n\n' +
      'Digitale bestanden moeten leesbaar en toegankelijk blijven. ' +
      'Sla facturen, bonnen en bankafschriften op in een veilige locatie.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    props.setProperty(PROP_KEY, 'ja');
    logTaxSignaal_('TAX-ADM-001', { actie: 'onboarding_tip_getoond' });
  } catch (e) {
    Logger.log('toonTaxAdmOnboardingTip_ fout: ' + e.message);
  }
}

/**
 * GezondheidCheck-wrapper voor TAX-ADM-001.
 * Toont WAARSCHUWING bij jaarwisseling (november/december), anders OK.
 * @returns {{ check: string, status: string, bericht: string }}
 */
function controleerTaxAdmBewaarplichtCheck_() {
  try {
    const termijn    = getTaxRegistryValue_('TAX-ADM-001', 'bewaartermijn.standaard.jaren') || 7;
    const nu         = new Date();
    const isJaareinde = nu.getMonth() >= 10;   // november (10) of december (11)

    logTaxSignaal_('TAX-ADM-001', {
      actie:       'gezondheidscheck',
      maand:       nu.getMonth() + 1,
      jaarwisseling_nadert: isJaareinde,
    });

    if (isJaareinde) {
      return {
        check:   'Belasting – Bewaarplicht administratie (TAX-ADM-001)',
        status:  'WAARSCHUWING',
        bericht: 'Jaarwisseling nadert. Controleer of uw administratie van ' +
                 (nu.getFullYear() - termijn) +
                 ' volledig bewaard is. Bewaarplicht: ' + termijn +
                 ' jaar voor standaard-documenten, 10 jaar voor onroerend goed (art. 52 AWR).',
      };
    }

    return {
      check:   'Belasting – Bewaarplicht administratie (TAX-ADM-001)',
      status:  'OK',
      bericht: 'Bewaarplicht min. ' + termijn + ' jaar (art. 52 AWR). ' +
               'Onroerend goed: 10 jaar. ' +
               'Bewaar facturen, bonnen en bankafschriften in een toegankelijk digitaal archief.',
    };
  } catch (e) {
    return {
      check:   'Belasting – Bewaarplicht administratie (TAX-ADM-001)',
      status:  'FOUT',
      bericht: 'Kon bewaarplicht-check niet uitvoeren: ' + e.message,
    };
  }
}

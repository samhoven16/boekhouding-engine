/**
 * AutoDefaults.gs
 * ════════════════════════════════════════════════════════════════
 * Slimme defaults: invullen wat we al weten zonder klant te vragen
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's "Zero-Touch" eis: klant hoeft geen instellingen-pagina in te
 * vullen. Bestaande zetInstellingen_ (Setup.gs:614+) heeft al 11 velden
 * met sensible defaults (rechtsvorm, BTW-tarief, betalingstermijn, …).
 *
 * Twee velden waren tot nu toe handmatige klant-input ondanks dat we ze
 * konden afleiden:
 *
 *   • Email + Email rapporten naar
 *     Google weet wie er is ingelogd via Session.getActiveUser().
 *     Zelf-vullen bij setup-tijd = 2 minder velden voor klant.
 *
 *   • Webhook API sleutel
 *     Random secret nodig vóór klant ooit een webhook configureert.
 *     Auto-genereren tijdens setup = klant heeft het ALS hij het wil,
 *     zonder eraan te denken.
 *
 * Idempotent: vult ALLEEN als veld leeg is — overschrijft nooit klant-
 * input. Geen overrides bij re-run van setup().
 *
 * Wordt aangeroepen vanuit setup() na zetInstellingen_, vóór belasting-
 * overrides + audit-log. Bij her-aanroep van setup (idempotency-guard
 * laat dit toe na resetSetupGuard_): niets schrijft, want velden zijn
 * al gevuld.
 */

const _AUTODEFAULTS_WEBHOOK_LENGTE = 32;

/**
 * Vul slimme defaults in voor velden die we autonoom kunnen afleiden.
 * Schrijft alleen naar lege velden — bestaande klant-input blijft staan.
 *
 * @returns {{ingevuld: Array<string>, overgeslagen: Array<string>}}
 */
// eslint-disable-next-line no-unused-vars
function vulSlimmeDefaultsIn_() {
  const ingevuld = [];
  const overgeslagen = [];

  // 1. Email + Email rapporten naar — via Session.getActiveUser()
  let klantEmail = '';
  try {
    klantEmail = String(Session.getActiveUser().getEmail() || '').trim();
  } catch (_) {}

  if (klantEmail && /@/.test(klantEmail)) {
    const huidigEmail = _huidigeWaarde_('Email');
    if (!huidigEmail) {
      _setStilEnTel_('Email', klantEmail, ingevuld);
    } else {
      overgeslagen.push('Email (al gevuld)');
    }
    const huidigRapport = _huidigeWaarde_('Email rapporten naar');
    if (!huidigRapport || huidigRapport === 'eigenaar@mijnbedrijf.nl') {
      // Default-template-waarde geldt ook als "niet ingevuld"
      _setStilEnTel_('Email rapporten naar', klantEmail, ingevuld);
    } else {
      overgeslagen.push('Email rapporten naar (al gevuld)');
    }
  } else {
    overgeslagen.push('Email (Session niet beschikbaar)');
  }

  // 2. Webhook API sleutel — auto-genereer als leeg.
  // Sterke random: Utilities.getUuid (16 bytes entropie) + base32-strip.
  // Doel: klant kan ALS hij ooit /API-webhook gebruikt direct authenticeren,
  // zonder dat hij van tevoren bewust een secret hoeft te bedenken.
  const huidigSecret = _huidigeWaarde_('Webhook API sleutel');
  if (!huidigSecret) {
    let secret = '';
    try {
      secret = (Utilities.getUuid() + Utilities.getUuid())
        .replace(/-/g, '')
        .slice(0, _AUTODEFAULTS_WEBHOOK_LENGTE);
    } catch (_) {}
    if (secret && secret.length === _AUTODEFAULTS_WEBHOOK_LENGTE) {
      _setStilEnTel_('Webhook API sleutel', secret, ingevuld);
    } else {
      overgeslagen.push('Webhook API sleutel (UUID-API niet beschikbaar)');
    }
  } else {
    overgeslagen.push('Webhook API sleutel (al gevuld)');
  }

  try {
    safeAuditLog_('AutoDefaults',
      'Ingevuld: ' + (ingevuld.join(', ') || 'geen') +
      (overgeslagen.length ? ' | overgeslagen: ' + overgeslagen.join(', ') : ''));
  } catch (_) {}

  return { ingevuld: ingevuld, overgeslagen: overgeslagen };
}

/**
 * Lees huidige waarde via getInstelling_ (cache-aware). Returnt '' als
 * sleutel niet bestaat — zo'n geval is functioneel "leeg".
 *
 * @private
 */
function _huidigeWaarde_(sleutel) {
  try {
    if (typeof getInstelling_ === 'function') {
      const v = getInstelling_(sleutel);
      return v == null ? '' : String(v).trim();
    }
  } catch (_) {}
  return '';
}

/**
 * Schrijf naar Instellingen + tel in rapport. Slikt fouten — een falende
 * default mag setup() niet breken.
 *
 * @private
 */
function _setStilEnTel_(sleutel, waarde, lijst) {
  try {
    if (typeof setInstelling_ === 'function') {
      setInstelling_(sleutel, waarde);
      lijst.push(sleutel);
    }
  } catch (_) {}
}

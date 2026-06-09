/**
 * EmailQuotaGuard.gs
 * ════════════════════════════════════════════════════════════════
 * Bewaakt de Gmail-quota van de klant, voorkomt stille blokkade
 * ════════════════════════════════════════════════════════════════
 *
 * Sam's eis: "Klant mag nooit verrast worden door onverwachte kosten of
 * blokkades." Apps Script gebruikt klant's eigen Gmail-quota — gratis,
 * maar bij overschrijding worden alle verdere mails STIL geblokkeerd.
 * Factuur die niet aankomt = klant denkt dat hij betaald gaat krijgen,
 * tegenpartij denkt geen factuur ontvangen → debiteurconflict.
 *
 * Deze module:
 *
 *   1. getEmailQuotaStatus_()
 *      Pure read: { resterend, totaal, percentGebruikt, niveau }
 *      Niveaus: 'OK' (<60% gebruikt), 'LET_OP' (60-80%),
 *               'WAARSCHUWING' (80-95%), 'KRITIEK' (>95%), 'OP' (=0)
 *
 *   2. controleerEmailQuotaProactief_()
 *      Wordt 1×/dag aangeroepen vanuit dagelijkseTaken. Bij niveau
 *      'WAARSCHUWING' of erger: mail de klant ÉÉN keer per dag met
 *      uitleg + actie-opties. Idempotent via ScriptProperties.
 *
 *   3. mogelijkVerzenden_(prioriteit)
 *      Voor call-sites die zelf willen beslissen: bij 'KRITIEK' alleen
 *      nog 'CRITIEK'-prio mails (factuur, debiteurherinnering), de rest
 *      doorgeven aan DLQ.
 *
 * Forward-protection: deze module bevat GEEN Brevo of andere externe
 * mailprovider. Eigen Gmail-quota van klant = €0 voor klant én voor Sam.
 */

const _EMAIL_QUOTA_WAARSCHUWING_PROP = 'EMAIL_QUOTA_LAATSTE_WAARSCHUWING_DATUM';
const _EMAIL_QUOTA_DAGCAP_DEFAULT = 100;  // consumer Gmail; Workspace = 1500

/**
 * Bereken status van de Gmail-quota van de huidige gebruiker.
 * Pure read, geen side-effects.
 *
 * @returns {{resterend: number, totaal: number, percentGebruikt: number,
 *            niveau: 'OK'|'LET_OP'|'WAARSCHUWING'|'KRITIEK'|'OP',
 *            bereikbaar: boolean}}
 */
// eslint-disable-next-line no-unused-vars
function getEmailQuotaStatus_() {
  let resterend = _EMAIL_QUOTA_DAGCAP_DEFAULT;
  let bereikbaar = true;
  try {
    resterend = MailApp.getRemainingDailyQuota();
  } catch (_) {
    bereikbaar = false;
  }
  if (!isFinite(resterend) || resterend < 0) resterend = 0;
  // Cap-detectie: als resterend > default, dan Workspace-account
  const totaal = Math.max(_EMAIL_QUOTA_DAGCAP_DEFAULT, resterend);
  const gebruikt = totaal - resterend;
  const percentGebruikt = totaal > 0 ? (gebruikt / totaal) * 100 : 100;

  let niveau;
  if (resterend === 0)             niveau = 'OP';
  else if (percentGebruikt >= 95)  niveau = 'KRITIEK';
  else if (percentGebruikt >= 80)  niveau = 'WAARSCHUWING';
  else if (percentGebruikt >= 60)  niveau = 'LET_OP';
  else                             niveau = 'OK';

  return {
    resterend: resterend,
    totaal: totaal,
    percentGebruikt: Math.round(percentGebruikt),
    niveau: niveau,
    bereikbaar: bereikbaar,
  };
}

/**
 * Mag een email met deze prioriteit nog verstuurd worden? Caller gebruikt
 * dit om hoge-prio mails (factuur, debiteurherinnering) door te laten en
 * lage-prio mails (notificaties) uit te stellen via DLQ.
 *
 * @param {'CRITIEK'|'NORMAAL'|'LAAG'} prioriteit
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
function mogelijkVerzenden_(prioriteit) {
  const status = getEmailQuotaStatus_();
  if (!status.bereikbaar) return true;  // graceful: bij API-fail laat door
  if (status.niveau === 'OP') return false;
  if (status.niveau === 'KRITIEK') return prioriteit === 'CRITIEK';
  // LET_OP / WAARSCHUWING / OK: alles mag nog
  return true;
}

/**
 * Pro-actieve waarschuwing aan klant bij quota >= 80% gebruikt.
 * Stuurt MAXIMAAL 1 mail per dag (idempotent via ScriptProperties datumkey).
 *
 * Aangeroepen vanuit dagelijkseTaken — geeft klant tijd om in te grijpen
 * (Workspace-upgrade, manuele prioritering, of bewust hoge-volume-acties
 * uitstellen) vóór quota 0 raakt en facturen stilletjes in de DLQ landen.
 */
// eslint-disable-next-line no-unused-vars
function controleerEmailQuotaProactief_() {
  const status = getEmailQuotaStatus_();
  if (!status.bereikbaar) return;
  if (status.niveau !== 'WAARSCHUWING' && status.niveau !== 'KRITIEK' && status.niveau !== 'OP') {
    return;  // OK / LET_OP — geen actie
  }

  // Audit-vondst ronde 2 (cross-PR regressie): bij niveau OP of < 5 resterend
  // mag deze waarschuwingsmail de allerlaatste quota-slot NIET opmaken.
  // dagelijkseTaken roept hierna nog `herinneringen` (dunning, 100 facturen)
  // en `btwDeadline` (mail per kwartaal-bijna-deadline) — die hebben de
  // resterende slots nodig. Bij niveau OP/<5: skip mail, maar zet wel
  // idempotency-flag zodat we morgen niet alsnog dubbel-mailen.
  const props = PropertiesService.getScriptProperties();
  const vandaag = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
  const sleutel = vandaag + ':' + status.niveau;
  if (status.niveau === 'OP' || status.resterend <= 2) {
    props.setProperty(_EMAIL_QUOTA_WAARSCHUWING_PROP, sleutel + ':SKIP_QUOTA');
    try {
      safeAuditLog_('EmailQuota mail-SKIP',
        'niveau=' + status.niveau + ' resterend=' + status.resterend +
        ' — laatste slots gereserveerd voor factuur/herinnering');
    } catch (_) {}
    return;
  }

  // Idempotency: max 1 waarschuwing per dag per niveau-escalatie
  const laatste = props.getProperty(_EMAIL_QUOTA_WAARSCHUWING_PROP);
  if (laatste === sleutel) return;

  // Bepaal ontvanger: actieve gebruiker (eigenaar van de sheet)
  let klantEmail = '';
  try { klantEmail = Session.getActiveUser().getEmail() || ''; } catch (_) {}
  if (!klantEmail || !/@/.test(klantEmail)) {
    // Fallback: probeer instelling 'Hoofdgebruiker e-mail'
    try {
      if (typeof getInstelling_ === 'function') {
        klantEmail = String(getInstelling_('Hoofdgebruiker e-mail') || '').trim();
      }
    } catch (_) {}
  }
  if (!klantEmail || !/@/.test(klantEmail)) return;

  const onderwerp = status.niveau === 'OP'
    ? '⚠️ Boekhoudbaar: je e-mail-quota voor vandaag is op'
    : status.niveau === 'KRITIEK'
      ? '⚠️ Boekhoudbaar: bijna geen e-mails meer vandaag (' + status.resterend + ' over)'
      : 'ℹ️ Boekhoudbaar: e-mail-quota op ' + status.percentGebruikt + '% (' + status.resterend + ' over)';

  const body =
    'Hallo,\n\n' +
    'Boekhoudbaar verstuurt facturen en herinneringen via je eigen Gmail.\n' +
    'Google staat per dag een vast aantal mails toe — als die op is, kan\n' +
    'Boekhoudbaar de rest van de dag geen e-mails meer versturen.\n\n' +
    'Huidige status:\n' +
    '  • Verstuurd vandaag:  ' + (status.totaal - status.resterend) + ' van ' + status.totaal + '\n' +
    '  • Nog te versturen:    ' + status.resterend + '\n' +
    '  • Niveau:              ' + status.niveau + '\n\n' +
    'Wat kun je doen?\n' +
    '  1. Wacht tot morgenochtend — de quota reset om 00:00 PT (~09:00 NL).\n' +
    '  2. Heb je een Google Workspace-account? Dan is je dagcap 1500 i.p.v. 100\n' +
    '     mails — 15× zoveel ruimte. Boekhoudbaar werkt 100% hetzelfde.\n' +
    '  3. Bij urgente facturen: verstuur ze tijdelijk handmatig (kopieer de\n' +
    '     PDF uit Drive).\n\n' +
    'Mails die nu niet kunnen worden verstuurd worden automatisch opnieuw\n' +
    'geprobeerd zodra de quota reset — niets gaat verloren.\n\n' +
    '— Boekhoudbaar';

  try {
    GmailApp.sendEmail(klantEmail, onderwerp, body);
    props.setProperty(_EMAIL_QUOTA_WAARSCHUWING_PROP, sleutel);
    try { safeAuditLog_('EmailQuota waarschuwing', status.niveau + ' → ' + klantEmail); } catch (_) {}
  } catch (_) {
    // Als zelfs DEZE mail faalt, is quota al echt op — niets meer aan te doen
  }
}

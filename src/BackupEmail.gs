/**
 * BackupEmail.gs
 *
 * Tier 2 #5 — backup-egress buiten Google Drive.
 *
 * Wat dit doet: mailt periodiek de laatste Noah-Ark JSONL-snapshot naar
 * klant's eigen e-mailadres. Resultaat: klant heeft een kopie in Gmail-inbox
 * los van Drive — bij Drive-account-verlies blijft data bereikbaar via mail.
 *
 * Eerlijke beperking: Gmail is óók Google-account. Bij volledige Google-
 * account-shutdown verlies je beide. Voor échte cross-provider redundantie
 * moet klant zelf de mail forward'en naar een niet-Google adres (bv. ProtonMail).
 * De setup-tekst maakt dit expliciet. Voor s3/Dropbox-egress: tier 3.
 *
 * Configuratie:
 *   - Instelling 'Backup-email actief' = 'Ja' (default 'Nee', opt-in)
 *   - Instelling 'Backup-email adres' (default = Session.getActiveUser email)
 *
 * Throttle: 1×/7 dagen automatisch. Menu-actie voor on-demand altijd.
 */

const BACKUP_EMAIL_LAATST_PROP = 'backupEmailLaatstTs';
const BACKUP_EMAIL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Trigger-versie: throttled, opt-in, fail-safe. Aangeroepen vanuit
 * dagelijkseTaken cleanup-fase. Doet niets als opt-in uit of < 7 dagen
 * sinds laatste verstuur.
 */
function backupEmailIndienNodig_() {
  try {
    if (!isJa_(getInstelling_('Backup-email actief'))) return;

    const props = PropertiesService.getScriptProperties();
    const laatst = parseInt(props.getProperty(BACKUP_EMAIL_LAATST_PROP) || '0', 10);
    if (Date.now() - laatst < BACKUP_EMAIL_INTERVAL_MS) return;

    const result = _verstuurBackupEmail_({ trigger: 'daily' });
    if (result.ok) props.setProperty(BACKUP_EMAIL_LAATST_PROP, String(Date.now()));
    return result;
  } catch (e) {
    Logger.log('backupEmailIndienNodig_ fout: ' + e.message);
    try { safeAuditLog_('FOUT backup-email auto', e.message); } catch (_) {}
  }
}

/**
 * Menu-actie: stuur backup-email NU, ongeacht throttle.
 * Toont resultaat-alert zodat klant weet of het gelukt is.
 */
function stuurBackupEmailNu() {
  const ui = SpreadsheetApp.getUi();
  const adres = _bepaalBackupEmailAdres_();
  if (!adres) {
    ui.alert('Geen e-mailadres bekend',
      'Vul "Backup-email adres" in via Instellingen, of activeer eerst je licentie.',
      ui.ButtonSet.OK);
    return;
  }

  const bevestig = ui.alert(
    '📧 Backup nu mailen?',
    'Boekhoudbaar mailt een JSONL-backup van je administratie naar:\n\n' +
    '  ' + adres + '\n\n' +
    'Bestand bevat alle financiële records (Journaalposten, Verkoopfacturen, ' +
    'Inkoopfacturen, Banktransacties, Audit Log). Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestig !== ui.Button.YES) return;

  const result = _verstuurBackupEmail_({ trigger: 'handmatig' });
  if (result.ok) {
    PropertiesService.getScriptProperties()
      .setProperty(BACKUP_EMAIL_LAATST_PROP, String(Date.now()));
    ui.alert('✓ Backup verstuurd',
      'Backup is verstuurd naar ' + adres + '.\n\n' +
      'Tip voor maximale veiligheid: zet in Gmail een filter dat deze mails ' +
      'doorstuurt naar een niet-Google adres (bijv. ProtonMail). Dan blijft je ' +
      'backup bereikbaar zelfs als je Google-account ooit wordt gesloten.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('Backup mislukt', result.fout || 'Onbekende fout.', ui.ButtonSet.OK);
  }
}

/**
 * Bepaal email-adres voor backup. Voorkeur:
 *   1. Instelling 'Backup-email adres' (klant kan apart adres invullen)
 *   2. Session.getActiveUser().getEmail()
 *   3. Instelling 'Email rapporten naar'
 *   4. Instelling 'Email'
 * Returnt null als niets gevonden.
 */
function _bepaalBackupEmailAdres_() {
  const kandidaten = [
    getInstelling_('Backup-email adres'),
    (function() { try { return Session.getActiveUser().getEmail(); } catch (_) { return ''; } })(),
    getInstelling_('Email rapporten naar'),
    getInstelling_('Email'),
  ];
  for (let i = 0; i < kandidaten.length; i++) {
    const k = String(kandidaten[i] || '').trim();
    if (k && k.indexOf('@') > 0 && typeof isGeldigEmail_ === 'function' && isGeldigEmail_(k)) {
      return k;
    }
    if (k && k.indexOf('@') > 0) return k;  // fallback zonder isGeldigEmail_
  }
  return null;
}

/**
 * Verstuur de daadwerkelijke mail. Geen UI-call — return-value vertelt resultaat.
 * Faalt safe: bij DriveApp/MailApp-fout krijgt caller `{ok: false, fout: '...'}`.
 *
 * @param {{trigger: string}} opt
 * @return {{ok: boolean, fout?: string, bestand?: string, bytes?: number}}
 */
function _verstuurBackupEmail_(opt) {
  opt = opt || { trigger: 'unknown' };
  const adres = _bepaalBackupEmailAdres_();
  if (!adres) return { ok: false, fout: 'Geen geldig e-mailadres geconfigureerd.' };

  // Vind laatste NoahArk_*.jsonl in een Backups-map (zelfde zoek-pad als
  // maakNoahArkSnapshot_). Pak de meest recente.
  // drive.file: lees de (app-created) hoofdmap/Backups; geen whole-Drive-zoeken
  // naar de legacy 'Boekhouding Backups'-topmap (mag niet onder drive.file).
  const backupMap = getDriveBackupMap_(undefined, false);
  if (!backupMap) {
    return { ok: false, fout: 'Geen backup-map gevonden. Draai eerst dagelijkseTaken of maakNoahArkSnapshot_.' };
  }

  // Pak meest recente NoahArk-file via folder-iterator (geen MIME-filter
  // omdat application/x-ndjson niet altijd correct gerapporteerd wordt).
  let nieuwste = null;
  let nieuwsteTs = 0;
  const it2 = backupMap.getFiles();
  while (it2.hasNext()) {
    const f = it2.next();
    if (f.getName().indexOf('NoahArk_') !== 0) continue;
    const ts = f.getDateCreated().getTime();
    if (ts > nieuwsteTs) { nieuwsteTs = ts; nieuwste = f; }
  }
  if (!nieuwste) {
    return { ok: false, fout: 'Geen NoahArk_*.jsonl gevonden in Backups-map.' };
  }

  // MailApp attachment-limit is ~25 MB. Bij grotere backups: niet mailen
  // maar Drive-link sturen (klant kan dan zelf downloaden van Drive).
  const bytes = nieuwste.getSize();
  const MAX_INLINE_BYTES = 20 * 1024 * 1024;  // 20MB, marge voor mail-overhead

  const onderwerp = '📦 Boekhoudbaar backup ' +
    Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');

  const triggerLabel = opt.trigger === 'handmatig' ? 'handmatig via menu' : 'automatisch (wekelijks)';

  try {
    if (bytes <= MAX_INLINE_BYTES) {
      const body =
        'Hierbij je wekelijkse Boekhoudbaar-backup.\n\n' +
        'Bestand: ' + nieuwste.getName() + ' (' + Math.round(bytes / 1024) + ' KB)\n' +
        'Trigger: ' + triggerLabel + '\n\n' +
        'Wat staat hierin: een JSONL-snapshot van je administratie ' +
        '(Journaalposten, Facturen, Bank, Audit Log) volgens noah-ark/v1 schema. ' +
        'Door iedere line-by-line JSON-parser leesbaar — ook in 2070, ook zonder ' +
        'Boekhoudbaar of Google.\n\n' +
        'TIP voor extra veiligheid: voeg in Gmail een filter toe dat mails met ' +
        'onderwerp "📦 Boekhoudbaar backup" doorstuurt naar een niet-Google ' +
        'adres (bijv. ProtonMail, Fastmail). Dan blijft je administratie zelfs ' +
        'bereikbaar als je Google-account ooit wordt afgesloten.\n\n' +
        '— Boekhoudbaar';
      MailApp.sendEmail({  // klant-mail-ok: backup naar eigenaar (data-bescherming; eigen trigger)
        to: adres,
        subject: onderwerp,
        body: body,
        attachments: [nieuwste.getAs(MimeType.PLAIN_TEXT)],
      });
    } else {
      // Bestand te groot voor attachment: stuur link in plaats daarvan
      const link = nieuwste.getUrl();
      const body =
        'Je weekly Boekhoudbaar-backup is te groot om te mailen (>' +
        (MAX_INLINE_BYTES / 1024 / 1024) + ' MB).\n\n' +
        'Download zelf van Drive:\n  ' + link + '\n\n' +
        'Bestand: ' + nieuwste.getName() + ' (' +
        Math.round(bytes / 1024 / 1024) + ' MB)\n' +
        'Trigger: ' + triggerLabel + '\n\n' +
        'Sla dit bestand offline op (USB, externe schijf, niet-Google cloud) ' +
        'voor maximale redundantie.';
      MailApp.sendEmail(adres, onderwerp + ' (download-link)', body);  // klant-mail-ok: backup-download-link (data-bescherming)
    }
    try { safeAuditLog_('Backup-email verstuurd',
      'trigger=' + opt.trigger + ' bytes=' + bytes + ' adres=' + adres.slice(0, 3) + '***'); } catch (_) {}
    return { ok: true, bestand: nieuwste.getName(), bytes: bytes };
  } catch (e) {
    return { ok: false, fout: 'Mailen mislukt: ' + e.message };
  }
}

/**
 * UpdateApply.gs
 *
 * Tier 2.2 — automatische update-installatie via de Apps Script Projects API.
 *
 * Dit is het gevaarlijkste stuk code in het product: het herschrijft zijn
 * eigen broncode. Daarom vijf verdedigingslagen, in volgorde:
 *
 *   1. KILL-SWITCH (fail-closed): server-feature-flag `auto_apply_update`
 *      moet EXPLICIET true zijn. Geen flag of geen server = feature uit.
 *      (Afwijkend van isFeatureIngeschakeld_ dat fail-open is — bewust.)
 *   2. PRE-FLIGHT: Apps Script API bereikbaar? Bundle hash-geverifieerd?
 *      Geen concurrent execution (ScriptLock)?
 *   3. BACKUP-VOOR-ALLES: huidige project-inhoud wordt als JSON naar Drive
 *      geschreven VOORDAT er iets wijzigt. Mislukt de backup → abort.
 *   4. ATOMISCHE WRITE: de Projects API vervangt ALLE files in één PUT.
 *      Geen half-geschreven projecten mogelijk op API-niveau.
 *   5. VERIFY + ROLLBACK: na de write wordt de inhoud teruggelezen en
 *      vergeleken. Mismatch → automatische rollback vanaf de backup.
 *
 * Wat er NA een geslaagde apply gebeurt: de huidige executie draait door
 * op de oude code (V8 heeft die al in geheugen); elke VOLGENDE executie
 * (menu-klik, trigger) draait de nieuwe code. De klant moet de spreadsheet
 * verversen.
 *
 * Manifest-strategie: het manifest (appsscript.json) van het HUIDIGE project
 * wordt behouden — de bundle bevat alleen .gs-files. Zo kan een update nooit
 * de geautoriseerde scopes van de klant slopen.
 *
 * Vereisten klant-kant (eenmalig):
 *   - Apps Script API aan op script.google.com/home/usersettings
 *   - Herautorisatie na de manifest-update die de script.projects scope bracht
 */

const UPDATE_APPLY_BACKUP_PREFIX = 'CodeBackup_';
const UPDATE_APPLY_MAX_BACKUPS = 5;

/**
 * Menu-actie: volledige geleide flow. Haalt bundle op (hergebruikt
 * haalUpdateBundleOp uit UpdateBundle.gs incl. hash-verify), bevestigt
 * 2× met klant, en past toe met backup + rollback.
 */
function startAutomatischeUpdate() {
  const ui = SpreadsheetApp.getUi();

  // Laag 1 — kill-switch, fail-closed
  if (!_autoApplyToegestaan_()) {
    ui.alert('Nog niet beschikbaar',
      'Automatisch updaten is nog niet vrijgegeven voor jouw installatie.\n\n' +
      'Gebruik voorlopig: Licentie & Updates → 📦 Download laatste versie ' +
      '(handmatig plakken), of mail update@boekhoudbaar.nl.',
      ui.ButtonSet.OK);
    return;
  }

  // Vraag versie
  const versieResp = ui.prompt('⚡ Automatische update',
    'Welke versie wil je installeren? (formaat: X.Y.Z, bijv. 2.8.0)\n\n' +
    'Tip: het versienummer staat in de update-melding of op boekhoudbaar.nl/update/',
    ui.ButtonSet.OK_CANCEL);
  if (versieResp.getSelectedButton() !== ui.Button.OK) return;
  const versie = String(versieResp.getResponseText() || '').trim();
  if (!/^[\d]+\.[\d]+\.[\d]+$/.test(versie)) {
    ui.alert('Ongeldige versie', 'Gebruik het formaat X.Y.Z (bijv. 2.8.0).', ui.ButtonSet.OK);
    return;
  }

  // Pre-flight: API bereikbaar?
  const preflight = _testProjectsApiToegang_();
  if (!preflight.ok) {
    ui.alert('Apps Script API niet bereikbaar',
      preflight.fout + '\n\n' +
      'Zo los je dit op (eenmalig):\n' +
      '1. Ga naar script.google.com/home/usersettings\n' +
      '2. Zet "Google Apps Script API" AAN\n' +
      '3. Probeer opnieuw\n\n' +
      'Lukt het dan nog niet? Mail update@boekhoudbaar.nl.',
      ui.ButtonSet.OK);
    return;
  }

  // Bundle ophalen (incl. hash-verificatie in haalUpdateBundleOp)
  const bundle = haalUpdateBundleOp(versie);
  if (!bundle || !bundle.ok) {
    ui.alert('Bundle ophalen mislukt',
      (bundle && bundle.fout) || 'Onbekende fout.', ui.ButtonSet.OK);
    return;
  }

  // Dubbele bevestiging — dit is een onomkeerbare actie zonder de backup
  const huidigeVersie = (typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : '?';
  const bevestig = ui.alert('⚡ Klaar om te installeren',
    'Versie ' + huidigeVersie + ' → ' + versie + '\n' +
    bundle.files.length + ' bestanden, hash geverifieerd.\n\n' +
    'Wat er gebeurt:\n' +
    '1. Backup van je huidige code naar Drive (Backups-map)\n' +
    '2. Nieuwe code wordt geïnstalleerd\n' +
    '3. Verificatie + automatische rollback bij mislukking\n\n' +
    'Je administratie-DATA wordt NIET aangeraakt — alleen de programmacode.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.YES_NO);
  if (bevestig !== ui.Button.YES) return;

  const result = voerAutomatischeUpdateUit_(bundle);

  if (result.ok) {
    ui.alert('✓ Update geïnstalleerd',
      'Versie ' + versie + ' is geïnstalleerd.\n\n' +
      'BELANGRIJK: ververs nu de spreadsheet (F5 of Cmd+R) zodat de nieuwe ' +
      'code actief wordt.\n\n' +
      'Backup van je oude code staat in Drive: ' + (result.backupNaam || '(zie Backups-map)') + '\n' +
      'Werkt er iets niet? Mail update@boekhoudbaar.nl — herstel is mogelijk ' +
      'vanaf de backup.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('Update mislukt' + (result.rolledBack ? ' — oude code hersteld' : ''),
      result.fout + '\n\n' +
      (result.rolledBack
        ? 'De rollback is geslaagd: je draait nog op je oude versie. Niets verloren.'
        : '⚠ LET OP: controleer of alles nog werkt. Backup staat in Drive: ' +
          (result.backupNaam || 'Backups-map') + '. Mail update@boekhoudbaar.nl voor hulp.'),
      ui.ButtonSet.OK);
  }
}

/**
 * Kill-switch (laag 1). Fail-CLOSED: vereist dat de server-config expliciet
 * flags.auto_apply_update === true zet. Geen config / geen flag / fout = uit.
 * Bewust NIET via isFeatureIngeschakeld_ — die is fail-open en dat is voor
 * zelf-modificerende code het verkeerde default.
 */
function _autoApplyToegestaan_() {
  try {
    if (typeof haalConfigOp_ !== 'function') return false;
    const cfg = haalConfigOp_();
    if (!cfg || !cfg.flags) return false;
    return cfg.flags.auto_apply_update === true || cfg.flags.auto_apply_update === 'true';
  } catch (_) {
    return false;
  }
}

/**
 * Pre-flight (laag 2): kan dit script zijn eigen project-inhoud LEZEN via de
 * Projects API? Test met GET — geen schrijfactie. Detecteert: API uit
 * (403 PERMISSION_DENIED), scope ontbreekt (401/403), netwerk.
 */
function _testProjectsApiToegang_() {
  try {
    const scriptId = ScriptApp.getScriptId();
    const resp = UrlFetchApp.fetch(
      'https://script.googleapis.com/v1/projects/' + scriptId + '/content', {
        method: 'get',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      });
    const code = resp.getResponseCode();
    if (code === 200) return { ok: true };
    if (code === 403 || code === 401) {
      return { ok: false, fout: 'Geen toegang tot de Apps Script API (HTTP ' + code + ').' };
    }
    return { ok: false, fout: 'Onverwacht antwoord van de Apps Script API (HTTP ' + code + ').' };
  } catch (e) {
    return { ok: false, fout: 'Netwerkfout: ' + e.message };
  }
}

/**
 * De daadwerkelijke apply (lagen 3-5). Gescheiden van de UI-flow zodat tests
 * dit direct kunnen aanroepen. Verwacht een GEVERIFIEERDE bundle (hash-check
 * is al gedaan door haalUpdateBundleOp).
 *
 * @param {{versie: string, files: Array<{naam: string, source: string, type: string}>}} bundle
 * @return {{ok: boolean, fout?: string, backupNaam?: string, rolledBack?: boolean}}
 */
function voerAutomatischeUpdateUit_(bundle) {
  if (!bundle || !Array.isArray(bundle.files) || bundle.files.length === 0) {
    return { ok: false, fout: 'Lege of ongeldige bundle.' };
  }

  // Laag 2b — geen concurrent executie. tryLock(0): als een trigger of andere
  // gebruiker bezig is → abort meteen, niet wachten (wachten = race-venster).
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    return { ok: false, fout: 'Er draait op dit moment een andere taak (trigger of gebruiker). Probeer over een paar minuten opnieuw.' };
  }

  try {
    const scriptId = ScriptApp.getScriptId();
    const token = ScriptApp.getOAuthToken();
    const baseUrl = 'https://script.googleapis.com/v1/projects/' + scriptId + '/content';

    // Laag 3a — huidige inhoud ophalen (wordt backup + manifest-bron)
    const getResp = UrlFetchApp.fetch(baseUrl, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (getResp.getResponseCode() !== 200) {
      return { ok: false, fout: 'Kon huidige code niet lezen (HTTP ' + getResp.getResponseCode() + '). Niets gewijzigd.' };
    }
    let huidig;
    try { huidig = JSON.parse(getResp.getContentText()); }
    catch (_) { return { ok: false, fout: 'Huidige project-inhoud onleesbaar. Niets gewijzigd.' }; }
    if (!huidig || !Array.isArray(huidig.files)) {
      return { ok: false, fout: 'Onverwacht API-formaat. Niets gewijzigd.' };
    }

    // Laag 3b — backup naar Drive VOORDAT er iets wijzigt. Backup-fout = abort.
    const backupNaam = UPDATE_APPLY_BACKUP_PREFIX +
      ((typeof HUIDIGE_VERSIE !== 'undefined') ? HUIDIGE_VERSIE : 'onbekend') + '_' +
      Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd_HHmmss') + '.json';
    const backupResult = _schrijfCodeBackup_(backupNaam, getResp.getContentText());
    if (!backupResult.ok) {
      return { ok: false, fout: 'Backup naar Drive mislukt (' + backupResult.fout + '). Update afgebroken — niets gewijzigd.' };
    }

    // Nieuwe file-lijst bouwen:
    //  - manifest (type JSON) van HUIDIG project behouden → scopes blijven intact
    //  - HTML-files van huidig project behouden (bundle bevat alleen .gs)
    //  - alle SERVER_JS files komen uit de bundle (volledige vervanging — een
    //    file die in de oude versie bestond maar niet in de bundle, vervalt;
    //    dat is correct: orphaned code moet weg bij update)
    const behouden = huidig.files.filter(function(f) {
      return f.type === 'JSON' || f.type === 'HTML';
    });
    const nieuw = bundle.files.map(function(f) {
      return { name: f.naam, type: 'SERVER_JS', source: f.source };
    });
    const alleFiles = behouden.concat(nieuw);

    // Laag 4 — atomische PUT
    const putResp = UrlFetchApp.fetch(baseUrl, {
      method: 'put',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ files: alleFiles }),
      muteHttpExceptions: true,
    });
    if (putResp.getResponseCode() !== 200) {
      // PUT geweigerd = niets gewijzigd (API is atomisch). Geen rollback nodig.
      return {
        ok: false, backupNaam: backupNaam,
        fout: 'Installatie geweigerd door de API (HTTP ' + putResp.getResponseCode() + '): ' +
          putResp.getContentText().slice(0, 300),
      };
    }

    // Laag 5 — verify: teruglezen en source-vergelijking op de SERVER_JS files
    const verifyResp = UrlFetchApp.fetch(baseUrl, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    let verifyOk = false;
    try {
      const terug = JSON.parse(verifyResp.getContentText());
      verifyOk = _verifieerToegepasteFiles_(terug.files, bundle.files);
    } catch (_) { verifyOk = false; }

    if (!verifyOk) {
      // Rollback: zet de oude inhoud terug vanaf de in-memory backup
      const rollbackResp = UrlFetchApp.fetch(baseUrl, {
        method: 'put',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ files: huidig.files }),
        muteHttpExceptions: true,
      });
      const rolledBack = rollbackResp.getResponseCode() === 200;
      try { safeAuditLog_('Auto-update VERIFY FAILED',
        'versie=' + bundle.versie + ' rolledBack=' + rolledBack); } catch (_) {}
      return {
        ok: false, backupNaam: backupNaam, rolledBack: rolledBack,
        fout: 'Verificatie na installatie mislukte.' +
          (rolledBack ? '' : ' Rollback faalde óók — gebruik de Drive-backup.'),
      };
    }

    try { safeAuditLog_('Auto-update geïnstalleerd',
      'versie=' + bundle.versie + ' files=' + bundle.files.length +
      ' backup=' + backupNaam); } catch (_) {}

    _ruimOudeCodeBackupsOp_();
    return { ok: true, backupNaam: backupNaam };
  } catch (e) {
    return { ok: false, fout: 'Onverwachte fout: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Verify-predicate: elke bundle-file moet met identieke source in het
 * teruggelezen project zitten. Extra files (manifest, HTML) zijn OK.
 */
function _verifieerToegepasteFiles_(projectFiles, bundleFiles) {
  if (!Array.isArray(projectFiles) || !Array.isArray(bundleFiles)) return false;
  const perNaam = {};
  projectFiles.forEach(function(f) {
    if (f.type === 'SERVER_JS') perNaam[f.name] = f.source;
  });
  for (let i = 0; i < bundleFiles.length; i++) {
    const b = bundleFiles[i];
    if (perNaam[b.naam] !== b.source) return false;
  }
  return true;
}

/**
 * Schrijf de project-JSON als backup-bestand naar de Backups-map (zelfde
 * zoek-pad als NoahArk). Return {ok, fout}.
 */
function _schrijfCodeBackup_(naam, inhoud) {
  try {
    // drive.file: hoofdmap/Backups (app-created) i.p.v. whole-Drive zoeken naar
    // 'Boekhouding Backups'. Zonder hoofdmap → parent-loos aanmaken (mag wél).
    const backupMap = getDriveBackupMap_() || DriveApp.createFolder('Boekhouding Backups');
    backupMap.createFile(naam, inhoud, 'application/json');
    return { ok: true };
  } catch (e) {
    return { ok: false, fout: e.message };
  }
}

/**
 * Retentie: max UPDATE_APPLY_MAX_BACKUPS code-backups, oudste eerst weg.
 * Best-effort — een fout hier mag de update nooit laten falen.
 */
function _ruimOudeCodeBackupsOp_() {
  try {
    // drive.file: lees de (app-created) hoofdmap/Backups; geen whole-Drive-zoeken.
    const backupMap = getDriveBackupMap_(undefined, false);
    if (!backupMap) return;
    const files = [];
    const fIt = backupMap.getFiles();
    while (fIt.hasNext()) {
      const f = fIt.next();
      if (f.getName().indexOf(UPDATE_APPLY_BACKUP_PREFIX) === 0) {
        files.push({ file: f, ts: f.getDateCreated().getTime() });
      }
    }
    files.sort(function(a, b) { return b.ts - a.ts; });  // nieuwste eerst
    for (let i = UPDATE_APPLY_MAX_BACKUPS; i < files.length; i++) {
      try { files[i].file.setTrashed(true); } catch (_) {}
    }
  } catch (_) {}
}

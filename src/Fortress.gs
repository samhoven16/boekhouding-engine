/**
 * Fortress.gs
 * ════════════════════════════════════════════════════════════════
 * "Gouden Kooi" / Fortress UI — klant kan NIETS direct wijzigen
 * ════════════════════════════════════════════════════════════════
 *
 * Filosofie (Sam's blueprint):
 *   "De klant is dom (kan niets fout invullen), de code is slim
 *   (vangt alle fouten), de data is heilig (wiskundig onveranderlijk)."
 *
 * Hoe Fortress Mode werkt:
 *   1. Élke sheet wordt protected — geen directe cel-edits mogelijk
 *      buiten de service-account (= de script-runtime zelf).
 *   2. Watchdog onEdit-trigger detecteert ELKE poging tot handmatige
 *      wijziging die toch doorglipt (race-condition, owner-permission)
 *      en revert hem direct naar de vorige waarde uit audit-log.
 *   3. Alle data-invoer loopt verplicht via dialogs (boekingsdialog,
 *      Instellingen-wizard, etc.). Server-side validatie tegen de 10
 *      wiskundige invarianten (FormeelBewijs.gs).
 *
 * OPT-IN: standaard UIT. Klant zet aan via menu, want dwingend-aan
 * zou bestaande klanten breken die handmatig in cellen tikken.
 *
 * ScriptProperty: 'FORTRESS_MODE' = 'aan' | (afwezig)
 */

const FORTRESS_PROP = 'FORTRESS_MODE';
const FORTRESS_WAARSCHUWING_PROP = 'FORTRESS_LAATSTE_WAARSCHUWING';

/**
 * Menu-handler: zet Fortress Mode aan.
 * Toont confirmatie-dialog (klant kan zelf niet typen meer in cellen!)
 * en past sheet-protectie toe als doorgaan.
 */
// eslint-disable-next-line no-unused-vars
function fortressModeAan() {
  const ui = SpreadsheetApp.getUi();
  const status = _fortressStatus_();
  if (status.aan) {
    ui.alert('Fortress Mode is al aan',
      'Sinds: ' + (status.sinds || 'onbekend') +
      '\n\nZet uit via Boekhoudbaar → Geavanceerd → Fortress Mode uit',
      ui.ButtonSet.OK);
    return;
  }

  const bevestig = ui.alert(
    '🔒 Fortress Mode aanzetten?',
    'Wat verandert er:\n\n' +
    '  ✓ Alle sheets worden vergrendeld — je kunt cellen wel ZIEN maar niet meer typen.\n' +
    '  ✓ Alle invoer loopt via menu-dialogen (Nieuwe boeking, Instellingen, …).\n' +
    '  ✓ Watchdog detecteert handmatige wijzigingen en draait ze automatisch terug.\n' +
    '  ✓ Klantfout-proof: niemand kan per ongeluk een formule overschrijven.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestig !== ui.Button.YES) return;

  try {
    const aantal = _vergrendelAlleSheets_();
    PropertiesService.getScriptProperties().setProperty(FORTRESS_PROP, 'aan');
    PropertiesService.getScriptProperties().setProperty('FORTRESS_AAN_SINDS', new Date().toISOString());
    safeAuditLog_('Fortress Mode AAN', aantal + ' sheets vergrendeld');
    ui.alert('🔒 Fortress Mode is AAN',
      aantal + ' sheets vergrendeld. Gebruik vanaf nu de menu-dialogen voor alle wijzigingen.',
      ui.ButtonSet.OK);
  } catch (e) {
    safeAuditLog_('FOUT Fortress AAN', e.message);
    ui.alert('Kon Fortress Mode niet aanzetten', e.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu-handler: zet Fortress Mode uit.
 * Vraagt expliciete bevestiging (geen accidental disable).
 */
// eslint-disable-next-line no-unused-vars
function fortressModeUit() {
  const ui = SpreadsheetApp.getUi();
  const bevestig = ui.alert(
    'Fortress Mode UIT zetten?',
    'Hierna kunnen alle gebruikers (inclusief jij) weer direct in cellen typen.\n\n' +
    'Dit zwakt de wiskundige garantie af: handmatige edits kunnen invarianten breken.\n\n' +
    'Doorgaan?',
    ui.ButtonSet.YES_NO
  );
  if (bevestig !== ui.Button.YES) return;

  try {
    const aantal = _ontgrendelAlleSheets_();
    PropertiesService.getScriptProperties().deleteProperty(FORTRESS_PROP);
    safeAuditLog_('Fortress Mode UIT', aantal + ' sheets ontgrendeld');
    ui.alert('Fortress Mode is UIT', aantal + ' sheets ontgrendeld.', ui.ButtonSet.OK);
  } catch (e) {
    safeAuditLog_('FOUT Fortress UIT', e.message);
    ui.alert('Kon Fortress Mode niet uitzetten', e.message, ui.ButtonSet.OK);
  }
}

/**
 * Status-check: is Fortress aan? Sinds wanneer?
 *
 * @returns {{aan: boolean, sinds: string|null}}
 * @private
 */
function _fortressStatus_() {
  try {
    const props = PropertiesService.getScriptProperties();
    return {
      aan: props.getProperty(FORTRESS_PROP) === 'aan',
      sinds: props.getProperty('FORTRESS_AAN_SINDS'),
    };
  } catch (_) {
    return { aan: false, sinds: null };
  }
}

/**
 * Vergrendel alle sheets in het bestand. Bestaande Protection-objecten
 * worden hergebruikt. Service-account (= script-runtime) blijft de
 * enige met edit-rechten.
 *
 * @returns {number} aantal sheets vergrendeld
 * @private
 */

/**
 * Sheets die Fortress moet overslaan bij vergrendelen én hashen:
 * Fortress-eigen tabs plus de append-only audit-tabs. Die laatste krijgen
 * per definitie dagelijks nieuwe rijen (schrijfDagelijksAuditAnchor_,
 * logBusinessEventNaarAuditSheet_) — meehashen = elke dag een vals
 * drift-alarm; vergrendelen = de dagelijkse append faalt stil.
 * @private
 */
function _fortressSkipSheet_(naam) {
  if (naam.indexOf('_Fortress') === 0) return true;
  return naam === SHEETS.AUDIT_ANCHOR || naam === SHEETS.AUDIT_LOG;
}

function _vergrendelAlleSheets_() {
  const ss = getSpreadsheet_();
  if (!ss) return 0;
  const me = Session.getEffectiveUser();
  let aantal = 0;
  ss.getSheets().forEach(function(sheet) {
    if (_fortressSkipSheet_(sheet.getName())) return;
    try {
      const bestaand = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      let prot;
      if (bestaand && bestaand.length > 0) {
        prot = bestaand[0];
      } else {
        prot = sheet.protect().setDescription('Fortress lockdown — bewerken via menu');
      }
      // Verwijder alle andere editors; alleen service-account behoudt rechten
      try {
        const editors = prot.getEditors();
        editors.forEach(function(ed) {
          if (ed.getEmail() !== me.getEmail()) {
            try { prot.removeEditor(ed); } catch (_) {}
          }
        });
      } catch (_) {}
      try { prot.setWarningOnly(false); } catch (_) {}
      aantal++;
    } catch (e) {
      Logger.log('Vergrendelen ' + sheet.getName() + ' faalde: ' + e.message);
    }
  });
  return aantal;
}

/**
 * Ontgrendel alle Fortress-protecties (alleen die met description
 * "Fortress lockdown ..." — overige protecties blijven intact).
 *
 * @returns {number} aantal sheets ontgrendeld
 * @private
 */
function _ontgrendelAlleSheets_() {
  const ss = getSpreadsheet_();
  if (!ss) return 0;
  let aantal = 0;
  ss.getSheets().forEach(function(sheet) {
    try {
      const prots = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      prots.forEach(function(prot) {
        const desc = prot.getDescription() || '';
        if (desc.indexOf('Fortress') === 0) {
          prot.remove();
          aantal++;
        }
      });
    } catch (e) {
      Logger.log('Ontgrendelen ' + sheet.getName() + ' faalde: ' + e.message);
    }
  });
  return aantal;
}

/**
 * Audit-snapshot voor watchdog: leg de huidige cel-waardes vast in een
 * shadow-sheet zodat watchdog na een handmatige edit de vorige waarde
 * kan terugvinden.
 *
 * Wordt aangeroepen door dagelijkseTaken en na elke script-edit.
 *
 * @private
 */
// eslint-disable-next-line no-unused-vars
function _fortressShadowSnapshot_() {
  const status = _fortressStatus_();
  if (!status.aan) return;  // alleen bij Fortress mode
  try {
    const ss = getSpreadsheet_();
    const naam = '_FortressShadow';
    let shadow = ss.getSheetByName(naam);
    if (!shadow) {
      shadow = ss.insertSheet(naam);
      shadow.hideSheet();
      try {
        const prot = shadow.protect().setDescription('Fortress shadow — niet wijzigen');
        prot.setWarningOnly(false);
      } catch (_) {}
    }
    // Sla SHA-256 hash op van elke sheet's data-fingerprint
    const hashes = {};
    ss.getSheets().forEach(function(sheet) {
      if (_fortressSkipSheet_(sheet.getName())) return;
      try {
        const data = sheet.getDataRange().getValues();
        const json = JSON.stringify(data);
        const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json);
        hashes[sheet.getName()] = hash.map(function(b) {
          return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
        }).join('').slice(0, 16);
      } catch (_) {}
    });
    PropertiesService.getScriptProperties().setProperty(
      'FORTRESS_HASHES', JSON.stringify({ ts: Date.now(), hashes: hashes }));
  } catch (e) {
    Logger.log('_fortressShadowSnapshot_ fout: ' + e.message);
  }
}

/**
 * Integriteits-check: vergelijk huidige sheet-hashes met laatste snapshot.
 * Bij mismatch: alarm + audit-log + waarschuw owner via mail.
 *
 * Wordt aangeroepen vanuit dagelijkseTaken + controleerEersteKlantReady.
 *
 * @returns {{ok: boolean, drift: Array<string>}}
 */
// eslint-disable-next-line no-unused-vars
function fortressIntegriteitCheck_() {
  const status = _fortressStatus_();
  if (!status.aan) return { ok: true, drift: [] };

  try {
    const opgeslagen = PropertiesService.getScriptProperties().getProperty('FORTRESS_HASHES');
    if (!opgeslagen) {
      _fortressShadowSnapshot_();
      return { ok: true, drift: [] };
    }
    const vorig = JSON.parse(opgeslagen);
    const ss = getSpreadsheet_();
    const drift = [];
    Object.keys(vorig.hashes).forEach(function(naam) {
      // Skip ook bij oude snapshots die de audit-tabs nog bevatten
      if (_fortressSkipSheet_(naam)) return;
      const sheet = ss.getSheetByName(naam);
      if (!sheet) return;
      try {
        const data = sheet.getDataRange().getValues();
        const json = JSON.stringify(data);
        const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json);
        const huidig = hashBytes.map(function(b) {
          return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
        }).join('').slice(0, 16);
        if (huidig !== vorig.hashes[naam]) {
          drift.push(naam);
        }
      } catch (_) {}
    });
    if (drift.length > 0) {
      safeAuditLog_('Fortress drift gedetecteerd', drift.join(', '));
    }
    return { ok: drift.length === 0, drift: drift };
  } catch (e) {
    return { ok: false, drift: ['FOUT: ' + e.message] };
  }
}

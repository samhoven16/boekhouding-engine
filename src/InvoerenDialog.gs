/**
 * InvoerenDialog.gs — DEPRECATED
 * Vervangen door NieuweBoeking.gs + BoekingEngine.gs
 *
 * De onderstaande functies sturen door naar de nieuwe implementatie
 * voor backward-compatibiliteit met eventuele externe aanroepen.
 */

/** @deprecated Gebruik openNieuweBoeking() */
function openNieuwInvoeren()     { openNieuweBoeking(); }

/** @deprecated Gebruik openNieuweBoeking() en kies het tabblad Factuur */
function toonFactuurDialog()     { openNieuweBoeking(); }

/** @deprecated Gebruik openNieuweBoeking() en kies het tabblad Kosten */
function toonKostenDialog()      { openNieuweBoeking(); }

/** @deprecated Gebruik openNieuweBoeking() en kies het tabblad Declaratie */
function toonDeclaratieDialog()  { openNieuweBoeking(); }

/** @deprecated Gebruik openNieuweBoeking() en kies het tabblad Upload+AI */
function openBonUploadMetAI()    { openNieuweBoeking(); }

// Server-side handlers — nu in BoekingEngine.gs
// verwerkFactuurUitDialog, verwerkKostenUitDialog, verwerkDeclaratieUitDialog,
// scanBonMetAI, verwerkSpraakinvoerFactuur, verwerkSpraakinvoerKosten
// → gebruik submitNieuweBoeking(), scanBoekingDocument(), parseBoekingSpraakinvoer()

/** @deprecated Email-helper — nu in BoekingEngine._verwerkFactuur_ */
function stuurVerkoopfactuurPdfNaarKlant_(ss, factuurnummer, email) {
  const sheet = ss.getSheetByName(SHEETS.VERKOOPFACTUREN);
  const data  = sheet.getDataRange().getValues();
  let gevonden = null, rij = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === factuurnummer) { gevonden = data[i]; rij = i + 1; break; }
  }
  if (!gevonden || !gevonden[19]) return;
  const pdfFile  = DriveApp.getFileById(extractFileId_(gevonden[19]));
  const bedrijf  = getInstelling_('Bedrijfsnaam') || '';
  GmailApp.sendEmail(email,
    'Factuur ' + factuurnummer + ' van ' + bedrijf,
    getFactuurEmailTekst_(factuurnummer, gevonden[12], gevonden[3], gevonden[5]),
    { attachments: [pdfFile.getAs('application/pdf')], name: bedrijf }
  );
  sheet.getRange(rij, 15).setValue(FACTUUR_STATUS.VERZONDEN);
}

/**
 * SheetKolom.gs — DE ENIGE bron van kolom-indexen voor sheet-toegang.
 *
 * KLASSE-SLUITER (zie .claude/bug-class-register.md, klasse 1): bare magische
 * indexen als `data[i][7]` veroorzaakten meermaals stille fiscale/betaal-bugs
 * (EUVerkoop las [21] i.p.v. [7] → ICP leeg; Mollie las [6]/[0] i.p.v. [12]/[1]
 * → elke iDEAL-betaling geweigerd). Met een named accessor wordt een verkeerde
 * kolom een NAAM-fout (`KOL.VF.btwNrKlnt` bestaat niet → crash/lint), geen
 * stille verschuiving.
 *
 * 0-based, identiek aan `.claude/sheet-schemas.md`. Een contract-test
 * (`contract-sheet-kolom.test.js`) dwingt af dat deze constanten en het
 * schema-document NOOIT uit elkaar lopen. Wijzig je een kolom: pas BEIDE aan.
 *
 * Migratie loopt per bestand (register klasse 1); een ban-test per gemigreerd
 * bestand verbiedt daar nog bare `data[i][<getal>]`.
 */
'use strict';

// eslint-disable-next-line no-unused-vars
const KOL = Object.freeze({
  // VERKOOPFACTUREN
  VF: Object.freeze({
    factuurId: 0,
    factuurnummer: 1,
    datum: 2,
    vervaldatum: 3,
    klantId: 4,
    klantnaam: 5,
    kvkKlant: 6,
    btwNrKlant: 7,
    omschrijving: 8,
    bedragExcl: 9,
    btwLabel: 10,
    btwBedrag: 11,
    bedragIncl: 12,
    betaaldBedrag: 13,
    status: 14,
    betaaldatum: 15,
    betalingsreferentie: 16,
    projectcode: 17,
    notities: 18,
    pdfUrl: 19,
    grootboekrekening: 20,
    aangemaaktOp: 21,
    aangemaaktDoor: 22,
  }),
  // INKOOPFACTUREN
  IF: Object.freeze({
    inkoopId: 0,
    internNummer: 1,
    datumOntvangst: 2,
    factuurdatumLeverancier: 3,
    factuurrefLeverancier: 4,
    leverancierId: 5,
    leveranciernaam: 6,
    omschrijving: 7,
    bedragExcl: 8,
    btwLabel: 9,
    btwBedrag: 10,
    bedragIncl: 11,
    status: 12,
    betaaldatum: 13,
    betaalrekening: 14,
    kostenrekening: 15,
    projectcode: 16,
    notities: 17,
    bijlageUrl: 18,
    aangemaaktOp: 19,
  }),
});

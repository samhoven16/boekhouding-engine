/**
 * SheetKolom.gs — DE ENIGE bron van kolom-indexen voor sheet-toegang.
 *
 * KLASSE-SLUITER (zie .claude/bug-class-register.md, klasse 1): bare magische
 * indexen als `data[i][7]` veroorzaakten meermaals stille fiscale/betaal-bugs (kol-ban-ok: voorbeeld in docstring)
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
  // JOURNAALPOSTEN ([16-18] = HITL-validatie-extensie, zie HitlValidatie.gs)
  JP: Object.freeze({
    boekingId: 0,
    datum: 1,
    omschrijving: 2,
    dagboek: 3,
    debetRekening: 4,
    debetOmschrijving: 5,
    creditRekening: 6,
    creditOmschrijving: 7,
    bedrag: 8,
    btwLabel: 9,
    btwBedrag: 10,
    referentie: 11,
    projectcode: 12,
    type: 13,
    notities: 14,
    aangemaaktOp: 15,
    status: 16,
    gevalideerdDoor: 17,
    gevalideerdOp: 18,
  }),
  // GROOTBOEKSCHEMA
  GB: Object.freeze({
    code: 0,
    naam: 1,
    type: 2,
    categorie: 3,
    balansWenv: 4,
    saldo: 5,
  }),
  // BANKTRANSACTIES
  BT: Object.freeze({
    transactieId: 0,
    datum: 1,
    omschrijving: 2,
    bedrag: 3,
    type: 4,
    rekening: 5,
    tegenrekening: 6,
    tegenpartij: 7,
    referentie: 8,
    grootboekrekening: 9,
    gekoppeldAan: 10,
    gekoppeldFactuur: 11,
    status: 12,
    notities: 13,
    aangemaaktOp: 14,
  }),
  // RELATIES
  REL: Object.freeze({
    relatieId: 0,
    type: 1,
    naam: 2,
    contactpersoon: 3,
    adres: 4,
    postcode: 5,
    plaats: 6,
    land: 7,
    kvkNummer: 8,
    btwNummer: 9,
    email: 10,
    telefoon: 11,
    iban: 12,
    betalingstermijn: 13,
    standaardBtw: 14,
    standaardKostenrekening: 15,
    actief: 16,
    notities: 17,
    aangemaaktOp: 18,
  }),
  // HERHALENDE KOSTEN (voegHerhalendeKostToe_ / verwerkHerhalendeKosten_)
  HK: Object.freeze({
    id: 0,
    naam: 1,
    leverancier: 2,
    bedragExcl: 3,
    btwTarief: 4,
    frequentie: 5,
    volgendeDatum: 6,
    grootboekrekening: 7,
    status: 8,
    automatischBoeken: 9,
    notities: 10,
    zakelijkPct: 11,
  }),
  // INSTELLINGEN (key-value; getInstelling_ leest [0]=sleutel → [1]=waarde)
  INST: Object.freeze({
    sleutel: 0,
    waarde: 1,
  }),
  // AUDIT LOG (Setup.gs:1207; cross-cutting — Triggers/Utils/DataPortability)
  AUDIT: Object.freeze({
    tijdstip: 0,
    gebruiker: 1,
    tabblad: 2,
    cel: 3,
    oudeWaarde: 4,
    nieuweWaarde: 5,
    type: 6,
    ketenhash: 7,
  }),
  // TAAKSTATUS (Triggers._updateTaakStatus_ schrijft; Diagnostiek leest)
  TAAK: Object.freeze({
    taak: 0,
    laatsteRun: 1,
    duurMs: 2,
    status: 3,
    laatsteFout: 4,
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

/**
 * RgsMapping.gs
 * Referentie-Grootboekschema (RGS) NL mapping per rekeningcode.
 *
 * Bron: Referentie GrootboekSchema (RGS) NL — rgsnl.nl. (NB: exacte release te
 * bevestigen; "3.5" bestaat niet — actueel zijn 3.4/3.7/3.8.) RGS-codes zijn 8-15 letters
 * lang en mappen NL-grootboeknummers naar de gestandaardiseerde Nederlandse
 * tax/audit-taxonomie. Caseware, Visma, Twinfield, Pinkweb en Exact
 * exporteren altijd via RGS-codes; zonder mapping moet de accountant elke
 * boekhouding handmatig opnieuw inrichten.
 *
 * Deze tabel dekt de ~70 meest-gebruikte rekeningen uit STANDAARD_GROOTBOEK
 * (zie Config.gs). Niet-gemapte rekeningen retourneren '' — de XAF-export
 * geeft die zonder rgsCode mee en accountant kan ze handmatig mappen.
 *
 * Updates: wanneer Belastingdienst de RGS-tabel aanpast (zelden), update
 * de mapping hier; export-output verandert automatisch.
 */

// eslint-disable-next-line no-unused-vars
const RGS_NL_CODES = {
  // ── Vaste activa (0xxx) ──────────────────────────────────────────
  '0100': 'BIvaIva',         // Immateriële vaste activa
  '0110': 'BIvaGooGwa',      // Goodwill
  '0120': 'BIvaConOnk',      // Concessies, vergunningen, intellectueel eigendom
  '0190': 'BIvaCumAfs',      // Cumulatieve afschrijving IVA
  '0200': 'BMvaTer',         // Materiële vaste activa
  '0210': 'BMvaTerGeb',      // Gebouwen en terreinen
  '0220': 'BMvaMacIns',      // Machines en installaties
  '0230': 'BMvaInv',         // Inventaris
  '0240': 'BMvaAndVbe',      // Computers en hardware (andere vaste bedrijfsmiddelen)
  '0250': 'BMvaAutVer',      // Auto's van de zaak
  '0290': 'BMvaCumAfs',      // Cumulatieve afschrijving MVA
  '0300': 'BFvaFva',         // Financiële vaste activa
  '0310': 'BFvaDee',         // Deelnemingen
  '0320': 'BFvaLerVor',      // Langlopende leningen u/g

  // ── Vlottende activa (1xxx) ──────────────────────────────────────
  '1000': 'BVrdHanGwl',      // Voorraden handelsgoederen
  '1010': 'BVrdGrh',         // Voorraden grondstoffen
  '1100': 'BVorDeb',         // Debiteuren
  '1110': 'BVorOvrNtf',      // Nog te factureren omzet
  '1150': 'BVorOvr',         // Overige vorderingen / nog te ontvangen
  '1200': 'BLimBanRba',      // Bank zakelijk
  '1205': 'BLimBanPri',      // Bank privé
  '1210': 'BLimKas',         // Kas
  '1220': 'BLimBanSpa',      // Spaarrekening
  '1400': 'BVorVbr',         // Te vorderen BTW (voorbelasting)
  '1410': 'BVorVbrHoog',     // Te vorderen BTW 21%
  '1420': 'BVorVbrLag',      // Te vorderen BTW 9%
  '1450': 'BVorVorLoh',      // Te vorderen loonheffing
  '1500': 'BVorVrbOpb',      // Vooruitbetaalde kosten
  '1600': 'BVorOvrOvk',      // Overige vlottende activa

  // ── Eigen vermogen (2xxx) ────────────────────────────────────────
  '2000': 'BEivKplGip',      // Geplaatst kapitaal / ondernemingsvermogen
  '2010': 'BEivAgrAga',      // Agioreserve
  '2100': 'BEivWtsWer',      // Wettelijke reserves
  '2200': 'BEivOreOvr',      // Overige reserves
  '2300': 'BEivPriStg',      // Privéstortingen (eenmanszaak)
  '2400': 'BEivPriOnt',      // Privéonttrekkingen (eenmanszaak)
  '2500': 'BEivOrnOnv',      // Resultaat boekjaar
  '2600': 'BEivOreOvr',      // Onverdeelde winst voorgaande jaren

  // ── Langlopende schulden (3xxx) ──────────────────────────────────
  '3000': 'BLanLoo',         // Langlopende leningen o/g
  '3100': 'BLanHyp',         // Hypothecaire leningen
  '3200': 'BLanAch',         // Achtergestelde leningen
  '3300': 'BLanFinLea',      // Financiële lease

  // ── Kortlopende schulden (4xxx) ──────────────────────────────────
  '4000': 'BSchCre',         // Crediteuren
  '4100': 'BSchOzbOmz',      // Te betalen BTW (omzetbelasting)
  '4110': 'BSchOzbHoog',     // Te betalen BTW 21%
  '4120': 'BSchOzbLag',      // Te betalen BTW 9%
  '4200': 'BSchLoh',         // Te betalen loonheffing
  '4210': 'BSchSoc',         // Te betalen sociale premies
  '4300': 'BSchOvr',         // Te betalen bedragen
  '4400': 'BSchOvrVoo',      // Vooruitontvangen bedragen
  '4500': 'BSchDga',         // Rekening-courant DGA/eigenaar
  '4600': 'BSchOvrSch',      // Kortlopende schulden overig

  // ── Omzet (8xxx) ─────────────────────────────────────────────────
  '8000': 'WOmzNoaNet',      // Omzet belast 21% (hoog)
  '8010': 'WOmzNoaNetLag',   // Omzet belast 9% (laag)
  '8020': 'WOmzNoaNul',      // Omzet 0% (nultarief)
  '8030': 'WOmzNoaVri',      // Omzet vrijgesteld van BTW
  '8040': 'WOmzNoaVrl',      // Omzet verlegd (IC-diensten)
  '8100': 'WOmzOpbOverig',   // Overige bedrijfsopbrengsten
  '8200': 'WFbeRba',         // Rentebaten
  '8300': 'WBuiVerAct',      // Resultaat verkoop activa
  '8400': 'WOpbSub',         // Bijdragen en subsidies

  // ── Kosten (7xxx) ────────────────────────────────────────────────
  '7000': 'WKpiInk',         // Inkoopkosten algemeen
  '7010': 'WKpiInkHan',      // Inkoop handelsgoederen
  '7020': 'WKpiInkGrh',      // Inkoop grondstoffen
  '7030': 'WKpiUbsUbg',      // Uitbesteed werk / onderaanneming
  '7100': 'WPerLes',         // Personeelskosten algemeen
  '7110': 'WPerLesBls',      // Brutolonen en salarissen
  '7120': 'WPerLesSoc',      // Sociale lasten werkgever
  '7130': 'WPerLesPen',      // Pensioenpremies werkgever
  '7140': 'WPerUbsUbg',      // Uitzendkrachten
  '7150': 'WPerOvp',         // Overige personeelskosten
  '7200': 'WHuiHvk',         // Huisvestingskosten algemeen
  '7210': 'WHuiHvkHuu',      // Huur bedrijfsruimte
  '7300': 'WBerAko',         // Verkoopkosten / marketing
  '7400': 'WBerKan',         // Kantoorkosten
  '7500': 'WBerAlg',         // Algemene kosten
  '7600': 'WAfsAva',         // Afschrijvingskosten
  '7700': 'WBerVrv',         // Vervoerskosten / autokosten
  '7800': 'WBerAdv',         // Advieskosten (accountant, juridisch)
  '7900': 'WBerOvr',         // Overige bedrijfslasten
  '7990': 'WBerOvrAlg',      // Algemene kosten — overig
};

/**
 * Lookup RGS-code voor een grootboekrekening. Returns '' (lege string)
 * voor niet-gemapte rekeningen — caller moet die graceful behandelen.
 *
 * @param {string|number} rekeningCode
 * @returns {string} RGS-code zoals 'BVorDeb', of '' als onbekend
 */
function getRgsCode_(rekeningCode) {
  if (rekeningCode === null || rekeningCode === undefined) return '';
  const code = String(rekeningCode).trim();
  return RGS_NL_CODES[code] || '';
}

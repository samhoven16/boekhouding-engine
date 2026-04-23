/**
 * Config.gs
 * Centrale configuratie en constanten voor het boekhoudprogramma.
 * Referentie Grootboekschema (RGS) conform Nederlandse standaard.
 */

// ─────────────────────────────────────────────
//  TABBLAD NAMEN
// ─────────────────────────────────────────────
const SHEETS = {
  DASHBOARD:         'Dashboard',
  INSTELLINGEN:      'Instellingen',
  GROOTBOEKSCHEMA:   'Grootboekschema',
  RELATIES:          'Relaties',
  VERKOOPFACTUREN:   'Verkoopfacturen',
  INKOOPFACTUREN:    'Inkoopfacturen',
  BANKTRANSACTIES:   'Banktransacties',
  JOURNAALPOSTEN:    'Journaalposten',
  BTW_AANGIFTE:      'BTW Aangifte',
  BALANS:            'Balans',
  WV_REKENING:       'W&V Rekening',
  CASHFLOW:          'Cashflow',
  JAARREKENING:      'Jaarrekening',
  DEBITEUREN:        'Debiteuren',
  CREDITEUREN:       'Crediteuren',
  HERHALENDE_KOSTEN: 'Herhalende Kosten',
};

// ─────────────────────────────────────────────
//  BTW TARIEVEN
// ─────────────────────────────────────────────
const BTW = {
  HOOG:       { label: '21% (hoog)',       tarief: 0.21  },
  LAAG:       { label: '9% (laag)',        tarief: 0.09  },
  NUL:        { label: '0% (nultarief)',   tarief: 0.00  },
  VRIJGESTELD:{ label: 'Vrijgesteld',      tarief: null  },
  VERLEGD:    { label: 'Verlegd',          tarief: null  },
};

const BTW_KEUZES = [
  '21% (hoog)',
  '9% (laag)',
  '0% (nultarief)',
  'Vrijgesteld',
  'Verlegd',
];

// ─────────────────────────────────────────────
//  FACTUUR STATUSSEN
// ─────────────────────────────────────────────
const FACTUUR_STATUS = {
  CONCEPT:        'Concept',
  VERZONDEN:      'Verzonden',
  DEELS_BETAALD:  'Deels betaald',
  BETAALD:        'Betaald',
  VERVALLEN:      'Vervallen',
  GECREDITEERD:   'Gecrediteerd',
};

// ─────────────────────────────────────────────
//  RELATIE TYPES
// ─────────────────────────────────────────────
const RELATIE_TYPE = {
  KLANT:       'Klant',
  LEVERANCIER: 'Leverancier',
  BEIDE:       'Klant & Leverancier',
};

// ─────────────────────────────────────────────
//  TRANSACTION TYPES
// ─────────────────────────────────────────────
const BOEKING_TYPE = {
  VERKOOPFACTUUR:  'Verkoopfactuur',
  INKOOPFACTUUR:   'Inkoopfactuur',
  BANKBETALING:    'Bankbetaling',
  BANKONTVANGST:   'Bankontvangst',
  JOURNAALPOST:    'Journaalpost',
  MEMORIAAL:       'Memoriaal',
  BEGINBALANS:     'Beginbalans',
};

// ─────────────────────────────────────────────
//  STANDAARD GROOTBOEKSCHEMA (RGS Nederland)
// ─────────────────────────────────────────────
const STANDAARD_GROOTBOEK = [
  // ── Vaste activa (0xxx) ──────────────────────────────────────────────────
  { code:'0100', naam:'Immateriële vaste activa',              type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0110', naam:'Goodwill',                              type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0120', naam:'Software en licenties (geactiveerd)',   type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0190', naam:'Afschrijving immateriële vaste activa', type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0200', naam:'Materiële vaste activa',                type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0210', naam:'Gebouwen en terreinen',                 type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0220', naam:'Machines en installaties',              type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0230', naam:'Inventaris en inrichting',              type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0240', naam:'Computers en hardware',                 type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0250', naam:"Auto(s) van de zaak",                   type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0290', naam:'Afschrijving materiële vaste activa',   type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0300', naam:'Financiële vaste activa',               type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0310', naam:'Deelnemingen',                          type:'Actief',  cat:'Vaste activa',          bw:'Balans' },
  { code:'0320', naam:'Langlopende leningen u/g',              type:'Actief',  cat:'Vaste activa',          bw:'Balans' },

  // ── Vlottende activa (1xxx) ──────────────────────────────────────────────
  { code:'1000', naam:'Voorraden handelsgoederen',             type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1010', naam:'Voorraden grondstoffen',                type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1100', naam:'Debiteuren',                            type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1110', naam:'Nog te factureren omzet',               type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1150', naam:'Nog te ontvangen bedragen',             type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1200', naam:'Bank zakelijk',                         type:'Actief',  cat:'Liquide middelen',      bw:'Balans' },
  { code:'1205', naam:'Bank privé',                            type:'Actief',  cat:'Liquide middelen',      bw:'Balans' },
  { code:'1210', naam:'Kas',                                   type:'Actief',  cat:'Liquide middelen',      bw:'Balans' },
  { code:'1220', naam:'Spaarrekening',                         type:'Actief',  cat:'Liquide middelen',      bw:'Balans' },
  { code:'1400', naam:'Te vorderen BTW (voorbelasting)',       type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1410', naam:'Te vorderen BTW 21%',                   type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1420', naam:'Te vorderen BTW 9%',                    type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1450', naam:'Te vorderen loonheffing',               type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1500', naam:'Vooruitbetaalde kosten',                type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },
  { code:'1600', naam:'Overige vlottende activa',              type:'Actief',  cat:'Vlottende activa',      bw:'Balans' },

  // ── Eigen vermogen (2xxx) ───────────────────────────────────────────────
  { code:'2000', naam:'Ondernemingsvermogen / Geplaatst kapitaal', type:'Passief', cat:'Eigen vermogen',   bw:'Balans' },
  { code:'2010', naam:'Agioreserve',                           type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2100', naam:'Wettelijke reserves',                   type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2200', naam:'Overige reserves',                      type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2300', naam:'Privéstortingen',                       type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2400', naam:'Privéonttrekkingen',                    type:'Actief',  cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2500', naam:'Resultaat boekjaar',                    type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },
  { code:'2600', naam:'Onverdeelde winst voorgaande jaren',    type:'Passief', cat:'Eigen vermogen',        bw:'Balans' },

  // ── Langlopende schulden (3xxx) ──────────────────────────────────────────
  { code:'3000', naam:'Langlopende leningen o/g',              type:'Passief', cat:'Langlopende schulden',  bw:'Balans' },
  { code:'3100', naam:'Hypothecaire leningen',                 type:'Passief', cat:'Langlopende schulden',  bw:'Balans' },
  { code:'3200', naam:'Achtergestelde leningen',               type:'Passief', cat:'Langlopende schulden',  bw:'Balans' },
  { code:'3300', naam:'Financiële lease verplichtingen',       type:'Passief', cat:'Langlopende schulden',  bw:'Balans' },

  // ── Kortlopende schulden (4xxx) ──────────────────────────────────────────
  { code:'4000', naam:'Crediteuren',                           type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4100', naam:'Te betalen BTW (omzetbelasting)',       type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4110', naam:'Te betalen BTW 21%',                    type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4120', naam:'Te betalen BTW 9%',                     type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4200', naam:'Te betalen loonheffing',                type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4210', naam:'Te betalen sociale premies',            type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4300', naam:'Te betalen bedragen',                   type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4400', naam:'Vooruitontvangen bedragen',             type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4500', naam:'Rekening-courant DGA/eigenaar',         type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },
  { code:'4600', naam:'Kortlopende schulden overig',           type:'Passief', cat:'Kortlopende schulden',  bw:'Balans' },

  // ── Opbrengsten (8xxx) ───────────────────────────────────────────────────
  { code:'8000', naam:'Omzet belast 21% (hoog tarief)',        type:'Opbrengst', cat:'Omzet',              bw:'W&V' },
  { code:'8010', naam:'Omzet belast 9% (laag tarief)',         type:'Opbrengst', cat:'Omzet',              bw:'W&V' },
  { code:'8020', naam:'Omzet 0% (nultarief)',                  type:'Opbrengst', cat:'Omzet',              bw:'W&V' },
  { code:'8030', naam:'Omzet vrijgesteld van BTW',             type:'Opbrengst', cat:'Omzet',              bw:'W&V' },
  { code:'8040', naam:'Omzet verlegd (IC diensten)',           type:'Opbrengst', cat:'Omzet',              bw:'W&V' },
  { code:'8100', naam:'Overige bedrijfsopbrengsten',           type:'Opbrengst', cat:'Overige opbrengsten', bw:'W&V' },
  { code:'8200', naam:'Rentebaten',                            type:'Opbrengst', cat:'Financiële baten',   bw:'W&V' },
  { code:'8300', naam:'Resultaat verkoop activa',              type:'Opbrengst', cat:'Buitengewone baten', bw:'W&V' },
  { code:'8400', naam:'Bijdragen en subsidies',                type:'Opbrengst', cat:'Overige opbrengsten', bw:'W&V' },

  // ── Kosten (7xxx) ────────────────────────────────────────────────────────
  { code:'7000', naam:'Inkoopkosten',                          type:'Kosten', cat:'Directe kosten',         bw:'W&V' },
  { code:'7010', naam:'Inkoop handelsgoederen',                type:'Kosten', cat:'Directe kosten',         bw:'W&V' },
  { code:'7020', naam:'Inkoop grondstoffen en materialen',     type:'Kosten', cat:'Directe kosten',         bw:'W&V' },
  { code:'7030', naam:'Uitbesteed werk / onderaanneming',      type:'Kosten', cat:'Directe kosten',         bw:'W&V' },
  { code:'7100', naam:'Personeelskosten',                      type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7110', naam:'Brutolonen en salarissen',              type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7120', naam:'Sociale lasten werkgever',              type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7130', naam:'Pensioenpremies werkgever',             type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7140', naam:'Uitzendkrachten',                       type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7150', naam:'Overige personeelskosten',              type:'Kosten', cat:'Personeelskosten',        bw:'W&V' },
  { code:'7200', naam:'Huisvestingskosten',                    type:'Kosten', cat:'Huisvesting',             bw:'W&V' },
  { code:'7210', naam:'Huur bedrijfsruimte',                   type:'Kosten', cat:'Huisvesting',             bw:'W&V' },
  { code:'7220', naam:'Energie (gas, water, elektra)',         type:'Kosten', cat:'Huisvesting',             bw:'W&V' },
  { code:'7230', naam:'Schoonmaak en onderhoud pand',          type:'Kosten', cat:'Huisvesting',             bw:'W&V' },
  { code:'7240', naam:'Verzekering gebouw/inventaris',         type:'Kosten', cat:'Huisvesting',             bw:'W&V' },
  { code:'7300', naam:'Auto- en transportkosten',              type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7310', naam:'Brandstofkosten',                       type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7320', naam:'Autoonderhoud en reparaties',           type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7330', naam:'Autoverzekering en wegenbelasting',     type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7340', naam:'Reiskosten openbaar vervoer',           type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7350', naam:'Reiskosten eigen vervoer (€0,23/km)',   type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7360', naam:'Bijtelling auto van de zaak',           type:'Kosten', cat:'Transport',               bw:'W&V' },
  { code:'7400', naam:'Kantoor- en administratiekosten',       type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7410', naam:'Kantoorbenodigdheden en drukwerk',      type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7420', naam:'Porto en verzendkosten',                type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7430', naam:'Telefoon en internet',                  type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7440', naam:'Software, apps en licenties',           type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7450', naam:'Accountants- en advieskosten',          type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7460', naam:'Juridische en notariskosten',           type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7470', naam:'KvK en overige leges',                  type:'Kosten', cat:'Kantoor',                 bw:'W&V' },
  { code:'7500', naam:'Verkoopkosten',                         type:'Kosten', cat:'Verkoop & Marketing',     bw:'W&V' },
  { code:'7510', naam:'Reclame en advertentiekosten',          type:'Kosten', cat:'Verkoop & Marketing',     bw:'W&V' },
  { code:'7520', naam:'Representatiekosten (73,5% aftrekbaar)',type:'Kosten', cat:'Verkoop & Marketing',     bw:'W&V' },
  { code:'7530', naam:'Provisies en commissies',               type:'Kosten', cat:'Verkoop & Marketing',     bw:'W&V' },
  { code:'7540', naam:'Beurzen en congressen',                 type:'Kosten', cat:'Verkoop & Marketing',     bw:'W&V' },
  { code:'7600', naam:'Onderhoudskosten',                      type:'Kosten', cat:'Onderhoud',               bw:'W&V' },
  { code:'7700', naam:'Afschrijvingen',                        type:'Kosten', cat:'Afschrijvingen',          bw:'W&V' },
  { code:'7710', naam:'Afschr. immateriële vaste activa',      type:'Kosten', cat:'Afschrijvingen',          bw:'W&V' },
  { code:'7720', naam:'Afschr. materiële vaste activa',        type:'Kosten', cat:'Afschrijvingen',          bw:'W&V' },
  { code:'7800', naam:'Financiële lasten',                     type:'Kosten', cat:'Financieel',              bw:'W&V' },
  { code:'7810', naam:'Rentelasten leningen',                  type:'Kosten', cat:'Financieel',              bw:'W&V' },
  { code:'7820', naam:'Bankkosten en provisies',               type:'Kosten', cat:'Financieel',              bw:'W&V' },
  { code:'7830', naam:'Koersverliezen',                        type:'Kosten', cat:'Financieel',              bw:'W&V' },
  { code:'7900', naam:'Overige bedrijfskosten',                type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7910', naam:'Bedrijfsverzekeringen',                 type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7920', naam:'Contributies en abonnementen',          type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7930', naam:'Studiekosten en opleidingen',           type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7940', naam:'Kleine aanschaffingen (< €450)',        type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7950', naam:'Donaties en giften',                    type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7960', naam:'Boetes en naheffingen',                 type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7970', naam:'Kosten privégebruik zakelijk',          type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'7990', naam:'Overige kosten n.e.g.',                 type:'Kosten', cat:'Overig',                  bw:'W&V' },
  { code:'9000', naam:'Vpb / inkomstenbelasting (voorlopig)',  type:'Kosten', cat:'Belasting',               bw:'W&V' },
];

// ─────────────────────────────────────────────
//  PROPERTY KEYS (voor script properties)
// ─────────────────────────────────────────────
const PROP = {
  VOLGEND_FACTUUR_NR:    'volgendFactuurNr',
  VOLGEND_INKOOP_NR:     'volgendInkoopNr',
  VOLGEND_BOEKING_NR:    'volgendBoekingNr',
  FORM_HOOFD_ID:         'formHoofdId',
  // Behouden voor backward-compatibiliteit (bestaande installaties)
  FORM_VERKOOP_ID:       'formVerkoopId',
  FORM_INKOOP_ID:        'formInkoopId',
  FORM_BANK_ID:          'formBankId',
  FORM_RELATIE_ID:       'formRelatieId',
  FORM_JOURNAAL_ID:      'formJournaalId',
  SETUP_DONE:            'setupDone',
  BOEKJAAR:              'boekjaar',
  KPI_SNAPSHOT:          'kpiSnapshot',   // CQRS-lite: precomputed financial state
};

// ─────────────────────────────────────────────
//  KOSTEN CATEGORIEËN (gebruikt in formulier)
// ─────────────────────────────────────────────
const KOSTEN_CATEGORIEEN = [
  'Marketing & Reclame',
  'Software & Abonnementen',
  'Kantoor & Werkruimte',
  'Advies & Dienstverlening',
  'Auto & Vervoer',
  'Openbaar Vervoer & Reiskosten',
  'Maaltijden & Representatie',
  'Inkoop / Materialen',
  'Verzekeringen & Bankkosten',
  'Personeelskosten',
  'Onderhoud & Reparaties',
  'Telecom & Internet',
  'Studie & Opleiding',
  'Overige kosten',
];

// ─────────────────────────────────────────────
//  KLEUREN PALET
// ─────────────────────────────────────────────
const KLEUREN = {
  HEADER_BG:     '#0D1B4E',   // brand navy (matches website)
  HEADER_FG:     '#FFFFFF',
  SUBHEADER_BG:  '#132661',   // one shade lighter than HEADER_BG
  SUBHEADER_FG:  '#FFFFFF',
  SECTIE_BG:     '#F7F9FC',   // neutral light bg (was lavender #E8EAF6)
  POSITIEF:      '#E6F7F4',   // soft teal tint for affirmative cells
  NEGATIEF:      '#FDECEC',   // soft red for warnings
  NEUTRAAL:      '#F7F9FC',
  ACCENT:        '#2EC4B6',   // brand teal (was orange #FF6F00)
  BORDER:        '#E5EAF2',   // neutral light border
};

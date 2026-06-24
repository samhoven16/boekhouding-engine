/**
 * tests/unit/website-belofte-vs-code.test.js
 *
 * DRIFT-KLASSE-SLUITER (leerproces 2026-06-22): "website belooft een functie die
 * de code niet (meer) levert" — of andersom: de code-functie die een belofte
 * waarmaakt wordt verwijderd/hernoemd terwijl de site 'm blijft beloven. Een
 * klant betaalt €49 op basis van de functies-pagina; een niet-waargemaakte
 * belofte = klacht / refund / reputatieschade.
 *
 * Net als tests/unit/menu-pad-consistentie.test.js koppelt dit de PROSE op de
 * site aan een GREP-baar code-anker. Voor elke kop-belofte op /functies geldt
 * bidirectioneel:
 *   1. de belofte staat (nog) op de pagina            → functie is beloofd
 *   2. het code-anker is (nog) gedefinieerd in src/   → code levert 'm
 * Valt één van beide weg, dan faalt deze test en moet de maintainer ze weer in
 * sync brengen (functie herstellen, of de belofte van de site halen).
 *
 * Deze sluiter dekt de hoofd-belofte-koppen (H3's in "de functies die echt
 * schelen"). Hij vervangt audit-ronde3-waarheid-claims.test.js niet — die borgt
 * dat specifiek WEGGEHAALDE valse claims niet terugkeren (negatieve ratel); deze
 * borgt dat de GESTANDE beloftes echte code houden (positieve koppeling).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const FUNCTIES = read('website/functies/index.html');

// Cache van src-bestanden zodat we elk maar één keer lezen.
const srcCache = {};
const srcVan = (rel) => (srcCache[rel] = srcCache[rel] || read(rel));
const heeftFunctie = (rel, fn) =>
  new RegExp('function\\s+' + fn.replace(/[$]/g, '\\$') + '\\s*\\(').test(srcVan(rel));

/**
 * Contract: elke hoofd-belofte op /functies → het code-anker dat 'm waarmaakt.
 * belofte = substring zoals die letterlijk in de functies-pagina-kop staat.
 * ankerFile/ankerFn = de functie waarvan het verdwijnen de belofte breekt.
 */
const CONTRACT = [
  { belofte: 'Facturen in jouw huisstijl',          ankerFile: 'src/Verkoopfacturen.gs', ankerFn: 'genereerFactuurPdf_' },
  { belofte: 'BTW-aangifte zonder stress',           ankerFile: 'src/BTW.gs',             ankerFn: 'berekenBtwAangifte_' },
  { belofte: 'Dashboard met je echte cijfers',       ankerFile: 'src/Dashboard.gs',       ankerFn: 'vernieuwDashboard' },
  { belofte: 'Vaste lasten op de automaat',          ankerFile: 'src/HerhalendeKosten.gs', ankerFn: 'verwerkHerhalendeKosten_' },
  { belofte: 'Rapportages die je boekhouder begrijpt', ankerFile: 'src/Rapportages.gs',   ankerFn: 'genereerBalans' },
  { belofte: 'betaling met iDEAL',                   ankerFile: 'src/Mollie.gs',          ankerFn: 'genereerMolliePaymentLink_' },
  { belofte: 'Deel je cijfers met je accountant',    ankerFile: 'src/ExportAccountant.gs', ankerFn: 'exporteerAccountantsPakket' },
  { belofte: 'Auditfile (XAF)',                      ankerFile: 'src/XafExport.gs',       ankerFn: 'exporteerXaf' },
  { belofte: 'KvK-gegevens automatisch invullen',    ankerFile: 'src/Utils.gs',           ankerFn: 'haalDataKvK_' },
  { belofte: 'BTW-spaarpot',                         ankerFile: 'src/Belastingvoordeel.gs', ankerFn: 'toonBtwSpaarpot' },
  { belofte: 'reiskosten-tracker',                   ankerFile: 'src/Belastingvoordeel.gs', ankerFn: 'toonReiskostenTracker' },
  { belofte: 'Persoonlijke fiscale signalering',     ankerFile: 'src/Belastingadvies.gs', ankerFn: 'genereerBelastingadvies' },
];

describe('website-belofte ↔ code-anker (drift-klasse)', () => {
  test.each(CONTRACT)('"$belofte" staat op /functies én $ankerFn bestaat in $ankerFile', ({ belofte, ankerFile, ankerFn }) => {
    // 1. de belofte is live op de site
    expect(FUNCTIES.includes(belofte)).toBe(true);
    // 2. de code die 'm waarmaakt bestaat
    expect(heeftFunctie(ankerFile, ankerFn)).toBe(true);
  });

  test('contract dekt elke product-functie-kop (geen onbeloofde drift)', () => {
    // Sanity: het contract is niet stilletjes leeggelopen.
    expect(CONTRACT.length).toBeGreaterThanOrEqual(12);
    // Elke belofte uniek (geen copy-paste-dubbel dat dekking veinst).
    const beloftes = CONTRACT.map((c) => c.belofte);
    expect(new Set(beloftes).size).toBe(beloftes.length);
  });
});

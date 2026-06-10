# OPERATIE BUITENAARDS — verificatie-gedreven product-hardening

> Start een Claude Code sessie in deze repo en plak alles onder de streep.
> Verwachte duur: 4-8 uur autonoom. Werkbranch: `audit/buitenaards-<datum>`.

---

JIJ BENT: de meest sceptische engineer die dit product ooit heeft aangeraakt.
Je gelooft NIETS — geen test, geen comment, geen eerder audit-rapport — totdat
je het zelf hebt geverifieerd. Je missie is niet "vondsten produceren", je
missie is BEWIJZEN wat kapot is en BEWIJZEN wat robuust is. Beide tellen.

═══════════════════════════════════════════════════════════════
DE ENE WET (overtreding = sessie waardeloos)
═══════════════════════════════════════════════════════════════

EEN VONDST ZONDER BEWIJS IS GEEN VONDST.

Bewijs is precies één van deze drie dingen:
1. Een test die NU faalt op main en slaagt na jouw fix (commit beide).
2. Een reproductie: exacte input → exact fout gedrag, regelnummer erbij.
3. Een meting: getal vóór vs getal ná (ms, KB, aantal, €).

"Dit zou kunnen misgaan" is een VERMOEDEN, geen vondst. Vermoedens gaan in
een aparte lijst onderaan het rapport en tellen niet mee in de eindscore.

═══════════════════════════════════════════════════════════════
VERPLICHTE VOORBEREIDING (niet overslaan)
═══════════════════════════════════════════════════════════════

1. Lees CLAUDE.md en volg het protocol exact (impact-analyse, targeted tests).
2. Lees deze rapporten en noteer ALLE eerder gevonden issues:
   - .claude/meerjaren-audit-2026-06-10.md
   - .claude/ultieme-criticus-rapport-2026-06-05.md
   - .claude/stresstest-findings-2026-06-05.md
   - .claude/go-live-audit-2026-06-10.md
   - .claude/audit-2026-06-04.md
   EEN DUPLICAAT VAN EEN EERDERE VONDST TELT NIET. Nul. Je wordt afgerekend
   op wat nog NIEMAND heeft gezien.
3. Maak branch: git checkout -b audit/buitenaards-$(date +%Y%m%d)

═══════════════════════════════════════════════════════════════
FASE 0 — NULMETING (±30 min, alles hierna meet je hiertegen)
═══════════════════════════════════════════════════════════════

Draai en noteer de exacte getallen in STATUS_BUITENAARDS.md:
- npm test                      → aantal passed/failed
- node scripts/truth-check.js   → aantal ghost-references
- node scripts/mutation-meting.js (op BTW.gs als die file-arg pakt) → kill-rate
- npm run lint                  → aantal warnings
- wc -l src/*.gs | tail -1      → totaal regels (groei bewaken)

Faalt iets hiervan al op een schone main? Dat is vondst #1, fix eerst.

═══════════════════════════════════════════════════════════════
FASE 1 — MOCK-DRIFT JACHT (de gevaarlijkste bugklasse in dit repo)
═══════════════════════════════════════════════════════════════

2191 tests zijn groen — tegen MOCKS. Echte Google Apps Script gedraagt zich
op punten anders dan tests/__helpers__/gas-runtime.js en mocks.js simuleren.
Elke afwijking waar een test groen is maar runtime anders doet = klasse-A bug.

Vergelijk systematisch (documentatie via WebFetch op developers.google.com):
- Range.getValues(): echte Sheets geeft Date-objecten voor datum-cellen,
  numbers voor getallen, '' voor leeg. Geeft de mock dat ook? Elke plek waar
  code `instanceof Date` of string-parsing doet op sheet-data: check beide.
- getDataRange() op een leeg sheet → 1×1 [['']] in echt GAS. Mock ook?
- appendRow met null/undefined in array → echte semantiek?
- LockService.tryLock(0) en waitLock-timeout-gedrag.
- CacheService: max 100KB per key, max 6h TTL, kan ELKE read null geven
  (cache-eviction). Welke code behandelt cache als gegarandeerde storage?
- PropertiesService: 9KB per key / 500KB totaal — welke keys kunnen groeien
  (arrays die appenden!) en wie bewaakt dat?
- UrlFetchApp zonder muteHttpExceptions → throwt bij 4xx/5xx. Elke fetch-site
  checken: verwacht de code een response-object of een throw?
- Triggers: max 20 per script, dagelijkse trigger vuurt in een +/- 1u window.
- MailApp.getRemainingDailyQuota() in LIMITED auth mode.

Werkwijze per verdachte plek: schrijf een test die de ECHTE semantiek
simuleert (pas de mock aan naar realiteit), kijk of de suite dan nog groen is.
Rood = vondst. Fix de productiecode, niet de test.

═══════════════════════════════════════════════════════════════
FASE 2 — MUTATION TESTING OP DE GELDPADEN
═══════════════════════════════════════════════════════════════

Draai scripts/mutation-meting.js op, in deze volgorde:
BTW.gs → Boekingen.gs → Belastingadvies.gs → Verkoopfacturen.gs → Fiscaal.gs

Elke OVERLEVENDE mutant in een berekening of vergelijking is een gat:
de testsuite merkt het niet als die regel kapot gaat. Per overlevende mutant:
1. Is de regel dood? → verwijder (orphan-regel uit CLAUDE.md).
2. Is de regel levend maar ongetest? → schrijf de test. En NU je de test
   schrijft: klopt het HUIDIGE gedrag eigenlijk wel? (Dit is waar je
   echte bugs vindt — mutation testing als metaaldetector.)
Doel: kill-rate geldpaden ≥ 90%. Noteer vóór/ná per file.

═══════════════════════════════════════════════════════════════
FASE 3 — DE ZES ONDERVRAGINGEN (parallel, via subagents)
═══════════════════════════════════════════════════════════════

Lanceer deze 6 agents PARALLEL (één bericht, zes Task-calls), elk met de
instructie: "max 5 vondsten, elk met file:regel + concreet bewijs, geen
algemeenheden, geen duplicaten van .claude/*-rapporten":

1. red-team-adversary    → licence-server/Code.gs + src/Mollie.gs + src/API.gs
2. accountant-en-belastingdienst → overleeft deze administratie een echt
   boekenonderzoek? (XAF, hash-keten, gesloten periodes, storno-trail)
3. tax-compliance        → 2026-tarieven in Config.gs/Belastingadvies.gs
   tegen ACTUELE belastingdienst.nl-data (WebFetch, niet uit geheugen)
4. klantreis-simulator   → dag-1: kopen → activeren → eerste factuur
5. gas-runtime-auditor   → dagelijkseTaken() bij een klant met 5 jaar data:
   haalt elke stap de 6-minuten-cap? Welke loops zijn O(N×M)?
6. cross-pr-regressie    → laatste 20 merges op main: welke features raken
   elkaar zonder dat er een gezamenlijke test bestaat?

KRITISCH: jij verifieert ZELF elk bewijs van elke agent vóór je het telt.
Agents overdrijven. Een agent-vondst die jij niet kunt reproduceren bestaat niet.

═══════════════════════════════════════════════════════════════
FASE 4 — ÉÉN ECHTE KLANTREIS, ZO MIN MOGELIJK MOCKS
═══════════════════════════════════════════════════════════════

Bouw een integratietest (of script) die dit END-TO-END doorloopt en op elk
punt invarianten checkt (gebruik .claude/wiskundige-fundering.md, I₁-I₁₀):

dag 1: setup() → instellingen → eerste verkoopfactuur (21% + 9% mix)
dag 14: bankimport CSV met deelbetaling → afletteren
dag 30: factuur vervalt → dunning-keten over 60 virtuele dagen (elke mail-stap)
dag 90: BTW-aangifte Q + vergrendel periode → probeer dan te boeken in Q (moet falen)
dag 365: jaarafsluiting → saldi-overdracht → XAF-export van het hele jaar
       → valideer de XAF tegen het 3.2-schema (structureel, alle verplichte velden)
dag 366: probeer afgesloten jaar te muteren (moet falen), boek in nieuw jaar

Elke plek waar de keten knapt of een invariant breekt = vondst.
Dit wordt óók de permanente regressietest: tests/integration/klantreis-1-jaar.test.js

═══════════════════════════════════════════════════════════════
FASE 5 — DE OLIFANT: PER-KLANT UPDATE-PAD (hier mag je bouwen)
═══════════════════════════════════════════════════════════════

Bekend en onopgelost: bestaande klant-kopieën krijgen code-updates NIET.
Lees eerst .claude/klant-kopie-flow-ideeen.md. Bouw dan het MINIMALE werkende
mechanisme (≤ ~200 regels + tests), bijvoorbeeld:
- licence-server endpoint `?actie=versie` → { nieuwste, changelog-url }
- klant-sheet: dagelijkseTaken vergelijkt HUIDIGE_VERSIE, toont bij verschil
  een niet-blokkerende banner met een update-instructie voor de klant
- GEEN automatische code-injectie (security), wel een gedocumenteerd
  handmatig pad dat een niet-technische klant in <10 min kan volgen

Simplicity ceiling uit CLAUDE.md geldt: liever 30 werkende regels dan 300 mooie.

═══════════════════════════════════════════════════════════════
SPELREGELS
═══════════════════════════════════════════════════════════════

- Per fix: eerst de falende test committen, dan de fix, dan npm run
  test:flow <flow> + npm run lint:changed. Aparte commit per vondst.
- Max-schade per vondst in € of klant-impact ("klant dient verkeerde
  BTW-aangifte in" > "log-regel mist").
- NOOIT naar main pushen. Draft PR's vanaf de audit-branch.
- Geen nieuwe npm-dependencies. Geen nieuwe GAS-globals zonder
  eslint.config.js-update. Geen refactors buiten de vondst.
- Sheet-kolommen ALLEEN aanraken na check tegen .claude/sheet-schemas.md.
- Elke 90 min zonder nieuwe vondst in een fase → volgende fase.

═══════════════════════════════════════════════════════════════
EXIT-CRITERIA (stop zodra één waar is)
═══════════════════════════════════════════════════════════════

1. Alle 6 fases doorlopen.
2. 3 bewezen klasse-A vondsten gefixt + 2 uur niets nieuws.
3. Fase 1 t/m 3 leverden samen < 2 vondsten → schrijf dat op als resultaat
   (dat is een MEETBAAR kwaliteitsbewijs, geen mislukking) en doe alleen
   nog fase 4 + 5.

═══════════════════════════════════════════════════════════════
EINDRAPPORT: STATUS_BUITENAARDS.md
═══════════════════════════════════════════════════════════════

| # | Fase | Vondst | Bewijs (file:regel / test) | Max-schade | Status |

Plus verplicht:
- Nulmeting vs eindmeting (tests, mutanten-kill-rate, truth-check, lint).
- Sectie "AANTOONBAAR ROBUUST": wat je hebt geprobeerd te breken en NIET
  brak — met de aanvallen erbij. Dit is evenveel waard als de bugs.
- Vermoedens-lijst (onbewezen, voor een volgende sessie).
- Eindscore = aantal bewezen vondsten + gedode mutanten. Geen cijfer /100.
  Geen superlatieven. De tabel IS het rapport.

START NU MET DE VERPLICHTE VOORBEREIDING.

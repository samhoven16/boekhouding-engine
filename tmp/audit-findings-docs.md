# Audit-findings — documentatie-volledigheid (incl. kruis-check #10)
Hashes: zie tmp/file-hashes.txt.

## Batch DOC-A — Assistent, Changelog, Diagnostiek, EersteKlantCheck, GezondheidCheck, HelpTab, Menu, Onboarding

### src/Assistent.gs — Gelezen: 1-210. Menu-toegang OK (Menu.gs:221); FAQ + AI-tab dekken Sam-weg-scenario. VONDSTEN F-DOC-001, 002.
### src/Changelog.gs — Gelezen: 1-199. Menu OK; silent-fail verantwoord (118-120); roadmap-link als zelfhulp (178). Geen vondsten.
### src/Diagnostiek.gs — Gelezen: 1-184. Menu OK; triggers-leeg → concrete instructie (170-172). VONDST F-DOC-003.
### src/EersteKlantCheck.gs — Gelezen: 1-300. Elke FOUT-check heeft fix-hint; volledig self-service. VONDSTEN F-DOC-004, 005.
### src/GezondheidCheck.gs — Gelezen: 1-966. Checks met concrete acties; verplichte-velden-uitleg (767-772). VONDSTEN F-DOC-006, 007.
### src/HelpTab.gs — Gelezen: 1-194. Sterke zelfhulp-naslagtab (Belastingdienst-portalen, checklists). VONDST F-DOC-008.
### src/Menu.gs — Gelezen: 1-712. Data-export altijd bereikbaar zonder licentie (23-34) — sterk anti-lock-in. VONDSTEN F-DOC-009, 010.
### src/Onboarding.gs — Gelezen: 1-959. Profielvelden met help-uitleg (184-225); "openlaten blokkeert niets" (228-232). VONDST F-DOC-011.

#### F-DOC-001 [MIDDEL] src/Assistent.gs:45
Quote: `a: 'Klik op <b>Boekhouding → Bon of factuur uploaden (foto)</b>. Upload een foto...'`
Probleem: FAQ verwijst naar niet-bestaande menupaden: menu heet "Boekhoudbaar" (Menu.gs:139); "Bon of factuur uploaden" staat niet in het menu (alleen Dashboard-knop, Dashboard.gs:1593); "Belastingtips" (56, 160) heet werkelijk "Fiscaal overzicht & besparingstips" (Menu.gs:230). Raakt regels 35, 41, 43, 45, 52, 54, 56, 80, 84, 160 ⇒ klant vindt niets en mailt Sam.
Fix: alle paden synchroniseren met Menu.gs-labels.
Owner: Sam (dev)

#### F-DOC-002 [LAAG] src/Assistent.gs:54
Quote: `Zie <b>Boekhouding → BTW → KOR check</b>.`
Probleem: werkelijk label "Kleineondernemersregeling (KOR) check" (Menu.gs:281).
Fix: exact label citeren. Owner: Sam (dev)

#### F-DOC-003 [LAAG] src/Diagnostiek.gs:81
Quote: `advies = '\n\nEr zijn fouten in non-autorisatie-categorie. Kopieer dit overzicht en deel met support.';`
Probleem: geen impact-duiding per service (KvK-fout raakt alleen optionele autofill) ⇒ onnodige support-mails.
Fix: impact-duiding per service toevoegen. Owner: Sam (dev)

#### F-DOC-004 [MIDDEL] src/EersteKlantCheck.gs:130
Quote: `fix: 'Boekhouding → Diagnostiek → Triggers herinstalleren' };`
Probleem: pad bestaat niet (geen menu "Diagnostiek", geen item "Triggers herinstalleren" — grep Menu.gs bevestigt) ⇒ dood pad in juist het valse-start-scenario.
Fix: naar bestaand pad wijzen of menu-item toevoegen. Owner: Sam (dev)

#### F-DOC-005 [LAAG] src/EersteKlantCheck.gs:148
Quote: `fix: 'Boekhouding → Licentie → Activeer licentie' };`
Probleem: werkelijk "Boekhoudbaar → Instellingen → Licentie activeren" (Menu.gs:311/335).
Fix: label corrigeren. Owner: Sam (dev)

#### F-DOC-006 [LAAG] src/GezondheidCheck.gs:208
Quote: `(fouten.length > 0 ? 'Stuur deze output naar support@boekhoudbaar.nl als je er niet uitkomt.' : '')`
Probleem: mist tussenstap-verwijzing naar "Alles werkt-check" als zelfhulp vóór support.
Fix: zelfhulp-stap toevoegen vóór support-zin. Owner: Sam (dev)

#### F-DOC-007 [LAAG] src/GezondheidCheck.gs:425
Quote: `'Tip: Boekhoudbaar → Geavanceerd → Saldi herberekenen.'`
Probleem: item heet "Saldi herberekenen (bij fouten)" onder "Instellingen" (Menu.gs:306), niet "Geavanceerd".
Fix: pad corrigeren. Owner: Sam (dev)

#### F-DOC-008 [MIDDEL] src/HelpTab.gs:97
Quote: `['☐ 3. Banktransacties tot 31-12 geïmporteerd', 'Menu → Bank → CSV importeren'],`
Probleem: meerdere checklist-menupaden (97-106) en support-rijen (154-155) wijken af van actuele Menu.gs-labels — precies in de jaarafsluitings-piek (jan).
Fix: alle padstrings synchroniseren; overweeg gegenereerde padlijst. Owner: Sam (dev)

#### F-DOC-009 [MIDDEL] src/Menu.gs:394
Quote: `function openBonUpload() {`
Probleem: volledig uitgewerkte bon-upload-dialog (394-511) zonder menu-registratie in onOpen (139-346); drie docs verwijzen er wél naar (Assistent.gs:45, Onboarding.gs:111) ⇒ gedocumenteerde feature zonder aangekondigde toegangsweg.
Fix: addItem in top-level menu. Owner: Sam (dev)

#### F-DOC-010 [LAAG] src/Menu.gs:352
Quote: `function openHoofdFormulier() {`
Probleem: openHoofdFormulier (352-384) en toonFormulierLinks (564-593, incl. mobiel-tip 381) niet in menu ⇒ mobiel-invoer-pad onvindbaar.
Fix: menu-item toevoegen of uitfasering documenteren. Owner: Sam (dev)

#### F-DOC-011 [LAAG] src/Onboarding.gs:73
Quote: `if (stap1 !== ui.Button.OK) return;`
Probleem: legacy-wizard herhaalt volledig (incl. licentie-dialoog) na vroege Cancel — flag pas op 121-124; geen hervat-pad. Beperkte populatie (alleen niet-moderne activatie).
Fix: deels-voltooid markeren of licentie-stap overslaan bij geldige licentie. Owner: Sam (dev)

Dominant patroon DOC-A: menupad-drift (F-DOC-001/002/004/005/007/008/009) — docs citeren labels die niet meer bestaan. Sterke fundamenten: altijd-bereikbare data-export, Help-tab, AI-hulp-tab.

## Batch DOC-B — bronnen, demo, faq, functies + 4 gidsen
Cross-check-basis: Belastingadvies.gs:131 (2026 ZELFSTANDIGENAFTREK 1200), :142 (BOX3 59500), :159-160 (ZVW 0.0485/79409); Menu.gs-labels; Bankboek.gs:156-157.

### website/bronnen — Gelezen: 1-269. Zelfstandigenaftrek €1.200 correct (149). VONDST F-DOC-020.
### website/demo — Gelezen: 1-1074. Menu-preview matcht Menu.gs goed (746-788). VONDSTEN F-DOC-021, 024, 025.
### website/faq — Gelezen: 1-587. KOR €20.000 correct (390). VONDSTEN F-DOC-022, 023.
### website/functies — Gelezen: 1-433. OAuth-uitleg sterke support-deflectie (356-359). VONDST F-DOC-026.
### gids/afschrijven — Gelezen: 1-265. VONDST F-DOC-027.
### gids/aftrekbare-kosten — Gelezen: 1-301. VONDST F-DOC-028.
### gids/auto-leasen — Gelezen: 1-235. VONDSTEN F-DOC-029, 030.
### gids/bankafschrift — Gelezen: 1-230. Grootboek 1200/2400 matcht code exact. VONDST F-DOC-031.

#### F-DOC-020 [LAAG] website/bronnen/index.html:161
Quote: `KIA 28% (zone €2.901–€71.683), vast €20.072 (€71.684–€132.746)`
Probleem: KIA-grenzen verschillen per pagina (bronnen €2.901-€71.683 vs afschrijven-gids €2.800-€63.000/€116.000/€333.000 vs auto-gids ">€2.800") — drie versies, ondermijnt de verifieerbaarheids-belofte.
Fix: één canonieke KIA-tabel overal. Owner: Sam (dev)

#### F-DOC-021 [HOOG] website/demo/index.html:694 (+533, 528, 587)
Quote: `<td>Zelfstandigenaftrek (€)</td><td>2.470 <em>(auto · Belastingdienst.nl)</em></td>`
Probleem: verouderd 2025-bedrag gepresenteerd als actueel ("auto · Belastingdienst.nl"); code 2026 = €1.200 (Belastingadvies.gs:131); intern strijdig met bronnen-pagina; afgeleide totalen (528/587) ook fout ⇒ "demo klopt niet met mijn aangifte"-mails.
Fix: €1.200 + afgeleiden herberekenen of neutrale voorbeeldtekst. Owner: Sam (dev)

#### F-DOC-022 [MIDDEL] website/faq/index.html:425 (+225)
Quote: `Ja. Menu &gt; Boekhouding &gt; Export naar accountant.`
Probleem: menupad bestaat niet (menu heet "Boekhoudbaar"; werkelijk: Controle & Export → Accountantspakket exporteren, Menu.gs:185/194; "Fiscaal"-submenu heet "💡 Fiscaal & besparingstips").
Fix: paden gelijktrekken met Menu.gs. Owner: Sam (dev)

#### F-DOC-023 [LAAG] website/faq/index.html:245 (+250)
Quote: `menu <strong>Boekhouding → Factuurlijst</strong>, kies de factuur en klik "Versturen"`
Probleem: hoofdmenunaam + submenu fout (Facturen & Betalingen → Factuurlijst; Gezondheidscheck onder Controle & Export).
Fix: corrigeren. Owner: Sam (dev)

#### F-DOC-024 [MIDDEL] website/demo/index.html:703 (+707, 143-vergelijk)
Quote: `<td>Box 3 heffingsvrij vermogen (€)</td><td>57.684 ... <td>Zvw inkomensafh. bijdrage (%)</td><td>5,32%`
Probleem: als "auto · Belastingdienst.nl" gepresenteerde waarden wijken af van code-2026 (Box3 59.500; Zvw 4,85%/79.409; forfait 7,78%) ⇒ demo suggereert dat product met verkeerde tarieven rekent.
Fix: synchroniseren met BELASTING[2026] of label "(voorbeeldwaarde)". Owner: Sam (dev)

#### F-DOC-025 [LAAG] website/demo/index.html:491 (+380, 398, 512)
Quote: `<tr><td>1a</td>...€ 39.180,00</td><td ...>€ 8.228,00</td></tr>`
Probleem: BTW-rekensommen kloppen; wel verwarrend toevallig gelijke €6.420 voor "spaarpot" en "verwacht 30d".
Fix: betekenissen expliciet onderscheiden. Owner: Sam (dev)

#### F-DOC-026 [LAAG] website/functies/index.html:278
Quote: `rubriek 1a, 1b, 3b en 5b automatisch berekend`
Probleem: rubriek-sets inconsistent over pagina's (functies: 3b; demo: 3a "ICL"; FAQ: 3b) — klant zoekt verkeerde vakjes. (Raakt F-TAX-001-cluster: de code gebruikt intern r3a voor ICL.)
Fix: één rubrieken-set die de productoutput volgt. Owner: Sam (dev)

#### F-DOC-027 [MIDDEL] gids/afschrijven:162 (+100)
Quote: `€2.800 – €63.000 investering: <strong>28%</strong> KIA ... >€116.000: dalende schaal tot nul bij €333.000`
Probleem: verouderde (pre-2024) KIA-staffel, strijdig met bronnen-pagina ⇒ verkeerde drempels bij claimen.
Fix: canonieke staffel overnemen. Owner: Sam (dev)

#### F-DOC-028 [LAAG] gids/aftrekbare-kosten:148 (+178, 210, 237)
Quote: `<td><strong>Eten met klant (representatie)</strong></td><td>73,5% aftrekbaar (2026)</td>`
Probleem: 73,5% 4× herhaald zonder bronlink (pagina belooft "bron onder elke claim"); drempel-alternatief onvermeld.
Fix: bronlink + alternatief noemen. Owner: accountant (communicatie)

#### F-DOC-029 [MIDDEL] gids/auto-leasen:153
Quote: `bijtelling lager (17% in 2026 tot €30.000 catalogusprijs, 22% daarboven)`
Probleem: jaarlijks wijzigend EV-bijtellingscijfer zonder deeplink; stuurt lease-vs-koop-afweging fout indien onjuist — extern te verifiëren.
Fix: verifiëren tegen Belastingplan 2026 + deeplink. Owner: accountant

#### F-DOC-030 [LAAG] gids/auto-leasen:86 (+93, 192)
Quote: `zie onze <a href="/gids/zakelijk-of-prive-auto-zzp/">auto-keuze gids</a>`
Probleem: kerndoorverwijzing 3×; bestaan doelpagina buiten batch — geverifieerd op schijf aanwezig (glob), dus link OK; genoteerd als gecontroleerd.
Fix: geen. Owner: Sam (dev)

#### F-DOC-031 [LAAG] gids/bankafschrift:104-109
Quote: CSV-export-tabel: bunq, Knab, ING, Rabobank, Revolut
Probleem: ABN AMRO ontbreekt terwijl demo (271) en FAQ (470) "alle Nederlandse banken (ING, Bunq, Rabo, ABN)" claimen — grootbank-klant krijgt geen antwoord.
Fix: ABN-rij toevoegen. Owner: Sam (dev)

Rode draad DOC-B: gidsen goed onderbouwd, maar geen centrale tarieven-/menupaden-bron ⇒ demo, FAQ en gidsen divergeren op exact de cijfers die klanten natrekken.

## Batch DOC-C — 8 gidsen (boekhoudprogramma t/m e-boekhouden-vergelijk)

### gids/boekhoudprogramma-zonder-abonnement — Gelezen: 1-325. Productclaims geverifieerd in Menu.gs. VONDSTEN F-DOC-040, 041.
### gids/btw-aangifte-zzp — Gelezen: 1-390. Tarieven/KOR/boetes OK. VONDST F-DOC-042.
### gids/btw-berekenen-terugvragen-zzp — Gelezen: 1-289. Rekenwerk klopt. VONDST F-DOC-043.
### gids/btw-teruggave-zzp — Gelezen: 1-241. Termijnen/rente OK; claims geverifieerd. Geen vondsten.
### gids/btw-verleggen-wanneer — Gelezen: 1-245. VONDSTEN F-DOC-044, 045.
### gids/creditnota-maken-zzp — Gelezen: 1-236. VONDSTEN F-DOC-046 (BLOCKER), 047.
### gids/debiteurenbeheer-zzp — Gelezen: 1-229. Dunning/debiteuren-claims geverifieerd (Utils.gs:614, Menu.gs:151-153). VONDSTEN F-DOC-048, 049.
### gids/e-boekhouden-vs-moneybird-vs-boekhoudbaar — Gelezen: 1-280. CSV/Drive/XLSX-claims geverifieerd. VONDSTEN F-DOC-050..052.

#### F-DOC-040 [LAAG] gids/boekhoudprogramma:268-271 — Moneybird €30 hier vs €18 op e-boekhouden-pagina ⇒ besparingsclaims inconsistent. Fix: één canonieke prijsbron + datum. Owner: Sam.
#### F-DOC-041 [LAAG] gids/boekhoudprogramma:180-191 — Davilex als koopbare optie zonder bron/jaartal. Fix: bron+peildatum of "historisch". Owner: Sam.
#### F-DOC-042 [MIDDEL] gids/btw-aangifte:85 vs 343
Quote: schema: `"je vult rubriek 3a in op de aangifte."` vs zichtbare FAQ: `"je vult rubriek 1d in"`
Probleem: zelfde vraag (0% vs vrijgesteld) krijgt in JSON-LD rubriek 3a en zichtbaar 1d ⇒ Google kan de schema-versie tonen; klant krijgt tegenstrijdige instructie.
Fix: één rubriek (accountant verifieert) en gelijktrekken. Owner: Sam + accountant
#### F-DOC-043 [MIDDEL] gids/btw-berekenen:191-194
Quote: `<li><strong>1d:</strong> omzet 0% of vrijgesteld</li> <li><strong>1e:</strong> BTW verlegd (EU-zakelijk)</li>`
Probleem: strijdig met verleggen-gids (EU-verlegd=3b, binnenland=1e); "vrijgesteld bij 1d" eveneens twijfelachtig.
Fix: centrale rubriek-mapping in alle gidsen. Owner: Sam + accountant
#### F-DOC-044 [LAAG] gids/btw-verleggen:134 vs 143 — twee verschillende wetsartikel-formuleringen voor factuurtekst ("art. 12.2.g" vs "art. 12 lid 5") zonder bron. Fix: verifiëren + bronlink. Owner: accountant.
#### F-DOC-045 [MIDDEL] gids/btw-verleggen:158 vs gids/btw-aangifte:277
Quote: verleggen: `EU-verlegd (B2B): rubriek 3b` vs aangifte-gids: `1d ... Je exporteert of levert aan EU-bedrijven`
Probleem: directe tegenspraak over waar EU-B2B-omzet hoort ⇒ onjuiste aangifte mogelijk.
Fix: cross-gids rubriek-consistentie (één bron-of-truth). Owner: Sam + accountant
#### F-DOC-046 [BLOCKER] gids/creditnota:155-156, 200-201 (+186-187)
Quote: `Boekhoudbaar heeft een "Creditnota uit factuur"-knop. Je selecteert de originele factuur, vult bedrag en reden in, en krijgt automatisch een correcte PDF ... 30 seconden werk.`
Probleem: de app heeft géén creditnota-knop: maakCreditnota (Verkoopfacturen.gs:361) heeft geen enkele menu-/dialoog-caller (grep geverifieerd) én crediteert ALTIJD het volledige bedrag (386-388) — geen bedrag/reden-input. FAQ bevestigt expliciet "deel-creditnota: Ja" wat de UI niet kan. Klant zoekt knop → vindt niets → support; en wie de functie tóch aanroept crediteert per ongeluk de hele factuur.
Fix: knop met bedrag/reden-input bouwen in de factuurlijst-dialoog, of gids herschrijven naar de werkelijke route en partial-credit-belofte verwijderen.
Owner: Sam (dev)
#### F-DOC-047 [LAAG] gids/creditnota:140 — voorbeeld-datums maken kwartaal-toewijzing onlogisch (creditnota 20 apr vóór Q1-afdracht 30 apr). Fix: datums consistent. Owner: Sam.
#### F-DOC-048 [LAAG] gids/debiteurenbeheer:86 vs 136 — TL;DR "~12%" vs body "~10-12%" handelsrente; hard percentage veroudert (halfjaarlijks vastgesteld). Fix: geen hard % in TL;DR + bronlink. Owner: Sam.
#### F-DOC-049 [LAAG] gids/debiteurenbeheer:84 — "(sinds 2022)" bij 30-dagen-B2B-termijn onjuist/onbewezen. Fix: verifiëren of weglaten. Owner: accountant.
#### F-DOC-050 [MIDDEL] gids/e-boekhouden:170
Quote: `verwerken naar BTW-rubrieken 1a, 1b, 1c, 1d, 1e, 2a, 5a, 5b`
Probleem: rubriekenset bevat 1c/5a die op de eigen zustergids (275-282) niet voorkomen — site-brede inconsistentie.
Fix: gelijktrekken met canonieke set. Owner: Sam (dev)
#### F-DOC-051 [LAAG] gids/e-boekhouden:112, 216-218 — concurrent-jaartotalen zonder peildatum; Moneybird-prijs strijdig met andere gids (F-DOC-040). Fix: peildatum + één prijs site-breed. Owner: Sam.
#### F-DOC-052 [LAAG] gids/e-boekhouden:113, 143-180 — seconde-precieze gemeten tijden waarbij de maker overal wint; disclaimer mitigeert. Fix: methode-link of marges. Owner: Sam.

Patroon DOC-C: systematische rubriek-inconsistentie over 4 gidsen (F-DOC-042/043/045/050 — centrale mappingtabel ontbreekt); concurrent-prijzen inconsistent; productclaims verder correct geverifieerd behalve de creditnota-knop (BLOCKER).

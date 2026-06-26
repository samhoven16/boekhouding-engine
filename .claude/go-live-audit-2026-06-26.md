# Go-live audit — ronde 2026-06-26 (integrale 12-assen her-audit)

Uitgevoerd op merge-tree `8d08c19` (origin/main #326 "go-live hardening" gemerged
+ 8 sessie-fixes + deze audit). Alle 12 assen parallel gedraaid; bevindingen
geverifieerd tegen de live code; gededupliceerd tegen de 9 gesloten bug-klassen
en de ledger. Volledige suite **3237 groen**, 0 lint-errors.

> Eerlijkheidsclausule: dit vindt wat vandaag kenbaar is; het vervangt geen
> jaarlijkse wetscheck, geen echte klachten, geen externe dependency-EOL-monitoring.

---

## GEFIXT deze ronde (geverifieerd + mutatie-bestendige ratel-test) — GEBORGD

| ID | Ernst | As | File | Bevinding → fix | Ratel-test |
|----|-------|----|------|-----------------|------------|
| A-330 | HOOG | customer-voice/gas-runtime | NieuweBoeking.gs:1190 | drag&drop-IIFE `dz.addEventListener` zonder null-check → bij aiActief=false (geen Gemini-key = DEFAULT) geen #dropzone → TypeError → "Technische fout" op het hoofd-boekingsscherm van ÉLKE nieuwe klant. Null-guard. | audit-2026-06-26-fixes |
| A-331 | BLOCKER | tax-compliance | BTW.gs:851/864 + Config.gs | sluitBtwPeriode boekt verlegde BTW naar 4130/4140 die niet in STANDAARD_GROOTBOEK stonden → REKENING_ONBEKEND-crash midden in de afsluiting → halve afsluiting, periode niet vergrendeld. Rekeningen + _zorgGrootboekRekeningBestaat_-ensure. | audit-2026-06-26-fixes |
| A-332 | HOOG | tax-compliance | Belastingadvies.gs:337 | MIA 45,5% bestaat niet (max 45%; Fiscaal.gs gebruikt al 27/36/45) → te hoog advies. Constante 0.45 + teksten "tot 45%". Categorie-afhankelijk = RB-vervolg. | audit-2026-06-26-fixes |
| A-333 | BLOCKER | accountant | Boekingen.gs:205 | Losse storno op factuur-met-BTW (2 journaalposten, zelfde ref) draait één been terug maar markeert hele factuur Gestorneerd → grootboek-BTW ≠ aangifte, geen invariant vangt het. Geblokkeerd bij refCount>1 → verwijst naar creditnota. | cycle7-storno-journaalpost |

Eerder deze sessie al GEBORGD (vóór de audit, in de ledger meegenomen):
dashboard/dlqRetry kritiek · verlegde-inkoop-BTW-flag · dunning-DLQ-idempotency ·
I1-tautologie · quota-gate (mogelijkVerzenden_) · brute-force-teller verwijderEndpoint_ ·
nav-drift copy · AVG-verwijderd-permanent-ongeldig.

---

## OPEN — geverifieerd, geladderd voor gerichte follow-up (NIET stil gefixt)

### Product / runtime
| ID | Ernst | File | Bevinding | Waarom geladderd |
|----|-------|------|-----------|------------------|
| A-334 | BLOCKER (volume-gated) | Dashboard.gs:9 + Triggers.gs:1787 | dashboard is nu kritiek (mijn fix) maar heeft geen guillotine; op 8-10k-rij-administraties kan de kritieke staart de 6-min hard-cap raken MIDDEN in verwerkHerhalendeKosten_ → half-geschreven boeking. | Volume-gated (jaren weg voor 1 ZZP). Juiste fix = verwerkHerhalendeKosten_ (goedkoop, financieel) ontkoppelen van de dure render (skipbaar). Raakt mijn kritiek-fix + de kritiek-test → zorgvuldig, niet onder budgetdruk. |
| A-335 | HOOG | Setup.gs:176 | watchdog zet SETUP_DONE='true' óók bij ontbrekende triggers/hoofdformulier → "stil kapot" na setup (form-submit doet niets, dunning draait nooit). | Onboarding-robustheid; fix = bij watchdogFouten setup als onvolledig markeren + blokkerende herlaad-melding. |
| A-336 | HOOG | HerhalendeKosten.gs:383 | setValue + SpreadsheetApp.flush() per rij in de loop → 50 geforceerde flushes bij veel vaste lasten, binnen de kritieke dashboard-staart. | Batch via getRangeList/setValues + flush ná de loop. |
| A-337 | HOOG | Rapportages.gs:167 | W&V leest cumulatieve grootboeksaldi zonder jaarfilter maar toont "Boekjaar X" → in jaar 2+ vóór jaarafsluiting te hoge winst. | Verifiëren of dit by-design is (jaarafsluiting nult 7/8xxx); zo niet: datum-gefilterde W&V uit journaalposten. |
| A-338 | MIDDEL→HOOG | API.gs:110 + Mollie.gs:232 | MOLLIE_WEBHOOK_SECRET heeft GEEN setter → signature-check permanent uit; webhook her-verifieert wel bij Mollie met eigen key (mitigatie). | Setter + fail-closed go-live-check. |
| A-339 | HOOG | FormeelBewijs.gs:428 | I8 (afgesloten-periode-immutability) skipt stil als geslotenOp/aangemaaktOp ontbreekt → "wiskundig bewijs" vals-groen. | Flag i.p.v. skip bij ontbrekende datum in gesloten periode. |
| A-340 | MIDDEL | Boekingen.gs:962 | inkoop kent geen deelbetaling; crediteurenoverzicht toont deels-betaalde leverancierfactuur 100% open. | Documenteer binair, of betaald-bedrag-kolom toevoegen. |
| A-341 | MIDDEL | XafExport40.gs:293 | XAF 4.0 neemt Concept-journaalposten op met [CONCEPT]-prefix die >50 tekens afkapt → marker verdwijnt. | Concept in eigen veld of onafkapbaar vooraan. |
| A-342 | LAAG | XafExport.gs:170 | dode XAF 3.2-builder met afwijkende semantiek; tests valideren de dode functie (vals-groen). | Verwijder dode builder of richt tests op _bouwXaf40Xml_. |

### Durability / langlopend (klasse 7 honest-limit + nieuw)
| A-343 | HOOG | Licentie.gs:73 | licentie/config-endpoint = één Apps-Script-deployment aan Sam's account (bus-factor 1) → USP "wat als Boekhoudbaar stopt" valt na 90d-grace om. | Tweede beheerder + niet-account-gebonden hosting + klant-zichtbare grace/bypass-instructie. |
| A-344 | HOOG | Mollie.gs:82 | Mollie redirectUrl + support-links hardcoded boekhoudbaar.nl → bij domein-verloop landt geslaagde iDEAL-betaling op 404. | redirectUrl config-gestuurd + offline support-contact in een sheet-tab. |
| F-DUR-151 (bestaand) | MIDDEL | Utils.gs:1510, Mollie.gs:18, Code.gs:955 | KvK/Mollie/Brevo base-URLs hardcoded zonder ScriptProperty-override (anders dan Gemini) → vendor-EOL = code-push naar alle kopieën. | Door haalConfigOp_() met code-default. |
| A-345 | MIDDEL | Onboarding.gs:15 | geen "abandoned-mode"-signaal: na jaren toont het product "v2.7.0 / vers" terwijl tarieven/API's stil verouderen. | Staleness-banner o.b.v. tax-meta-leeftijd + lang-offline-config. |

### Security (red-team — geen nieuwe BLOCKER)
| A-346 | MIDDEL | Code.gs:804 | aanvraag-otp lekt klant-bestaan (bekend vs "niet bekend als klant") → enumeratie-orakel (herstuur-licentie doet 't juist wél constant). | Constante respons zoals herstuur-licentie. |
| A-347 | LAAG | Code.gs:2766/1002/1251 | roteer zonder OTP · valideer lekt klant-naam · telemetry/onboarded schrijven op alleen-sleutel. | Hardening, geen exploit. |
| OTP-scope (bekend) | MIDDEL | Code.gs:863/2922 | één otp_<email> autoriseert activatie én verwijder (phishing-relay). | Vereist gecoördineerde client+server-uitrol; apart plannen. |

### Fiscaal — wacht RB (klasse 10-grens; NIET stil wijzigen)
F-TAX-111 arbeidskorting-opbouw · F-TAX-112 AOW-maxima · F-TAX-331 KIA software-01xx ·
F-TAX-332 KIA €450-ondergrens · A-348 MIA categorie-afhankelijk (27/36/45) ·
A-349 BelastingOptimizer default-marginaal 0,3693 (2023, advies-display) ·
A-350 KIA-optimizer negeert €450-ondergrens.

### Copy / docs / UX (MIDDEL/LAAG — sellability)
- A-351 [HOOG-onboarding] welkom-modal stap 3 (factuur) vóór stap 1 (bedrijfsgegevens) → werk weggegooid + harde fout. Redirect-banner.
- A-352 [HOOG] website storno-FAQ instrueert "rechtsklik → Storneren" (bestaat niet) → echte route: Geavanceerd → Journaalpost storneren.
- A-353 [HOOG] /functies BTW-USP noemt rubriek "3b" (bestaat niet in de engine).
- A-354 [MIDDEL] u/je-mix in NieuweBoeking-dialoog · "automatisch"-overbeloftes (Assistent KOR/factuurvelden) · 3 support-mailadressen (support@/info@/hallo@) · Branding SVG-hint terwijl SVG geweigerd wordt · Engels "Achievements".
- A-355 [MIDDEL] FAQ mist backup-vraag + "fout corrigeren" op /faq (alleen op homepage); Assistent mist "factuur opnieuw versturen" + backup.

### SEO / content / positionering (groei — backlog)
- A-356 [HOOG] og:image is SVG overal → social-cards renderen leeg (geen PNG-fallback).
- A-357 [HOOG] 4 hoogste-intentie-gidsen (moneybird/e-boekhouden/exact/zonder-abonnement) niet in de gids-hub gelinkt → verweesd.
- A-358 [HOOG] KOR/"wat kost een boekhouder"/Moneybird-switch hebben geen eigen pagina (content-gap + seo overlappen).
- A-359 [MIDDEL] /functies "Voor starters"-nav ontbreekt op alle SEO-instappagina's; homepage title 70ch; H1 keyword achteraan.
- BACKLOG-CONTENT (bestaand): KOR/OSS/ICP/XAF/ZZP-naast-loondienst/stoppen gidsen.

---

## Klasse-mapping (Step 6 — instantie ≠ klasse)
- A-330 dropzone-crash → **nieuwe klasse 13**: "HTML-string client-JS zonder null-guard op conditioneel-gerenderd element". Eénmalig nu; bij 2e instantie → contract-test die elke `getElementById(...)` in .gs-HTML op een guard toetst.
- A-331 4130/4140 → klasse 1-adjacent (rekening-referentie zonder bestaansgarantie); ensure-helper is de chokepoint.
- A-332/A-348 MIA → klasse 7 (hardcoded tarief) + klasse 5 (stale-claim-tekst).
- A-333 storno → **nieuwe klasse 14**: "correctie-pad raakt VF/IF-sheet en grootboek apart → aangifte ⊬ grootboek". Guard = refCount; volledige sluiting = creditnota-only voor facturen.
- A-334 dashboard-kritiek → klasse 12 (guillotine-cap) — mijn kritiek-fix verschoof het symptoom hierheen.
- A-337/A-341/A-342/A-339 → klasse 8 (test/verifier borgt verkeerd / vals-groen) + klasse 11 (verifier niet in alle paden).

> 2 nieuwe klassen ontdekt (13 HTML-null-guard, 14 correctie-pad-divergentie). Beide
> nu met een instantie-fix; de mechanische klasse-sluiting (contract-test) is het
> geregistreerde structurele werk.

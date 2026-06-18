# Audit Closure-Ledger — Boekhoudbaar

> **De enige bron van waarheid voor "wat staat nog open".**
> Elke audit-bevinding leeft hier van vondst tot sluiting. Niets is "klaar"
> tot het **GESLOTEN** is. Dit bestand is versie-beheerd (geen `tmp/`-scratch)
> zodat een bevinding niet ronde-na-ronde opnieuw "ontdekt" wordt.
>
> Gevoed door `/audit` (zie `.claude/commands/audit.md`). Lees dit bestand
> vóór je een nieuwe bevinding opvoert: staat 'm hier al als GESLOTEN/GEBORGD/
> WONTFIX, dan is het geen nieuwe bevinding.

## Statussen

| Status | Betekenis |
|--------|-----------|
| `OPEN` | Bevestigd, nog niet in behandeling |
| `IN-FIX` | Fix in de maak |
| `GEBORGD` | Fix + regressietest bestaan (test faalt zónder de fix) |
| `GESLOTEN` | Geborgd én gemerged in main (met PR-nummer) |
| `WONTFIX` | Bewust niet gefixt — reden + wie besloot, verplicht |
| `DUPLICAAT` | Zelfde als een ander ID (verwijs ernaar) |

## Regels

1. **Geen sluiting zonder borging.** Elke BLOCKER/HOOG gaat pas naar GEBORGD
   als er een regressietest is die zónder de fix faalt.
2. **Verifieer tegen main + deze ledger** vóór je iets als nieuw opvoert.
3. **WONTFIX is schriftelijk** — reden in de rij, niet in iemands hoofd.
4. ID-vorm: `F-<as>-<nr>` (bv. `F-TAX-012`, `F-RED-506`) of `AUDIT-SYS-<n>`.

---

## Open / in behandeling

| ID | Gevonden | As/Agent | Ernst | Locatie | Bevinding | Status | Regressietest | PR |
|----|----------|----------|-------|---------|-----------|--------|---------------|----|
| F-TAX-110 | 2026-06-15 | tax-compliance | HOOG | `Config`/`Belastingadvies.gs` BELASTING_PER_JAAR[2026] | IB-schijven (35,75%/38883/78426), Zvw 4,85%, zelfstandigenaftrek €1.200 — vereisen RB-bevestiging tegen definitieve belastingdienst.nl 2026-tabel (agent kon bron niet fetchen). Code claimt verificatie 2026-06-12; NIET op gokwerk wijzigen | OPEN (wacht RB) | — | — |
| F-TAX-111 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:738` berekenArbeidskorting_ | Arbeidskorting mist opbouwtraject → bij lage winst (€8-20k) korting overschat → IB onderschat. Exacte 2026-opbouw% vereist RB | OPEN (wacht RB) | — | — |
| F-TAX-112 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:1381` | Heffings-/arbeidskorting niet verlaagd voor AOW-gerechtigden (krijgen niet-AOW-maxima); exacte AOW-maxima 2026 vereisen RB | OPEN (wacht RB) | — | — |
| F-ACC-005 | 2026-06-15 | accountant | HOOG | `BTW.gs:133` | Voorbelasting (r5b) geclaimd zonder controle op aanwezig bewijsstuk (art. 15 Wet OB) — eigen TODO erkent het. Volgende ronde | OPEN | — | — |
| F-RED-150 | 2026-06-18 | red-team | BLOKKER | `Licentie.gs:849` | Licentie-binding te omzeilen: client stuurde de OPGESLAGEN ssId-property (wisbaar/spoofbaar) → kopie ontweek server-bind met lege/oude installatie (1 sleutel = ∞ kopieën). Fix: bind op de LIVE sheet-ID (per kopie écht anders, niet te spoofen zonder code-herschrijving), fallback op property in trigger-context. Server-bind + Cycle-82 (geen grace zonder eerdere online-OK) staan al | GEBORGD | `tests/unit/f-red-150-licentie-live-ssid-bind.test.js` | ronde-3c |
| F-SCALE-141 | 2026-06-18 | gas-runtime | BLOKKER | `Licentie.gs:840` | Licentieserver = ongerepliceerde SPOF. Code-helft GEBORGD: client probeert na falende primaire server een warme-standby (`LICENTIE_SERVER_URL_FALLBACK`) vóór offline-grace; leeg = ongewijzigd. **Operationele helft blijft Sam**: standby-deploy + externe uptime-monitor op `?actie=health` | GEBORGD (code) / OPEN (infra Sam) | `tests/unit/f-scale-141-licentie-fallback-server.test.js` | ronde-3c |
| F-OND-130 | 2026-06-18 | onboarding | BLOKKER | `website/bedankt/index.html`, `licence-server/Code.gs:939/958` | Activatie-flow copy klopte niet met de echte flow: /bedankt beschreef de mail-link als "directe link naar jouw eigen Sheet" + plaatste OAuth bij "Eerste factuur"; geen "Een kopie maken"-stap. Nu: copy-stap + correcte OAuth-timing (vóór eerste factuur) op /bedankt; OTP-onderwerp kreeg "(15 min geldig)" zodat het niet met de order-mail verwart. KOOPFLOW-MECHANISME onaangeroerd (alleen copy). #1-OTP/order-mail beoordeeld: mails al visueel distinct (header "Activeringscode" + 36px-code) | GEBORGD | `tests/unit/f-ond-130-onboarding-copy.test.js` | ronde-3d |
| F-VOICE-130 | 2026-06-18 | customer-voice | BLOKKER | `HitlValidatie.gs:17,45,91` | "Pas na bevestiging afgesloten voor de Belastingdienst (art. 52 AWR)" = valse juridische finaliteit; validatie vergrendelt niets. Tekst nu eerlijk: nagekeken (GL/BTW/bijlage), blijft bewerkbaar tot periode-afsluiting | GEBORGD | `tests/unit/audit-ronde3-waarheid-claims.test.js` | ronde-3b |
| F-VOICE-131 | 2026-06-18 | customer-voice | BLOKKER | `ExportAccountant.gs:304` | "Codes compatibel met Exact Online en Twinfield" = onvoorwaardelijke claim naar de accountant terwijl RGS-mapping ~1/3 dekt. Nu gekwalificeerd (meest-gebruikte rekeningen; rest handmatig; XAF leidend) | GEBORGD | `tests/unit/audit-ronde3-waarheid-claims.test.js` | ronde-3b |
| F-DOC-130 | 2026-06-18 | documentatie | BLOKKER | `website/faq/index.html`, `website/functies/index.html`, `website/vergelijking/index.html` | Site beloofde "read-only delen, auto-vervalt na 30d, configureerbaar 1-365" — feature bestaat niet. Teruggebracht naar de echte flow (exportpakket in eigen Drive + XAF, zelf delen via Drive) in functies-kaart, FAQ-tekst, FAQ JSON-LD én vergelijkingstabel | GEBORGD | `tests/unit/audit-ronde3-waarheid-claims.test.js` | ronde-3b |
| F-SCALE-142 | 2026-06-18 | gas-runtime | HOOG | `licence-server/Code.gs:806,2982` | `otp_*`/`otp_ts_*` ScriptProperties van leads die wel een code aanvroegen maar niet activeerden werden nooit geveegd → groei richting 500KB-cliff (vol = nieuwe verkoop/OTP stopt). Nu `cleanupVerlopenOtpKeys_` (verlopen code + >1u-stempel) aan het BEGIN van de dagelijkse trigger (vóór de drip-loop, dus drip-timeout slaat 'm niet over). Drip-keys hadden al cleanup; drip-resume-cursor blijft backlog (raakt pas >~1000 klanten) | GEBORGD | `tests/unit/f-scale-142-otp-cleanup.test.js` | ronde-3d |
| F-OND-131 | 2026-06-18 | langlopend-onderhoud | HOOG | `Licentie.gs:250` | onOpen-pad toonde geen offline-grace-banner → klant werd na 90d "ineens" buitengesloten zonder waarschuwing. Nu toont `controleerLicentieEnKopie_` de banner ook bij offline-grace (vanaf dag 1, escalerend). Cap blijft 90d (gepubliceerde belofte + ronde-2-keuze), nu gedekt door de proactieve banner; `LICENTIE_GRACE_DAGEN=365`-override gedocumenteerd | GEBORGD | `tests/unit/f-ond-131-onopen-offline-banner.test.js` | ronde-3d |
| F-DOC-131 | 2026-06-18 | documentatie | HOOG | `BTWReminder.gs:233` | BTW-assistent toonde alleen 1a/1b/1c/5a/5b/5g → EU/verlegde omzet onzichtbaar. Nu sectie "Rubriek 2/3/4 — EU & buitenland" met 1e/2a/3a/4a zodra >0 (labels identiek aan de BTW Aangifte-tab; raakt de open 3a/3b-vraag F-TAX-122 niet) | GEBORGD | `tests/unit/f-doc-131-btw-assistent-eu-rubrieken.test.js` | ronde-3d |

## Afgehandeld (recent — bewijs van de ratel)

| ID | Gevonden | As/Agent | Ernst | Locatie | Bevinding | Status | Regressietest | PR |
|----|----------|----------|-------|---------|-----------|--------|---------------|----|
| F-TAX-120 | 2026-06-18 | tax-compliance | BLOKKER | `BTW.gs:286` | Verlegde inkoop-BTW kwam NIET in r5b (aftrek) → klant droeg de reverse-charge BTW vól af op élke ads/SaaS/EU-inkoop (structureel honderden €/jaar te veel). Fix: `r5b += btwBedrag` in de verlegd-tak (net €0, vloeit door pro-rata) | GEBORGD | `tests/unit/f-tax-120-verlegd-voorbelasting.test.js` | ronde-3 |
| F-PAY-130 | 2026-06-18 | langlopend-onderhoud | BLOKKER | `Mollie.gs:333` | Webhook-bedrag-verify matchte op `[0]` (num. ID) i.p.v. `[1]` (opgemaakt nr in metadata) + las bedrag uit `[6]`/`[5]` (KvK/naam) → ÉLKE iDEAL-betaling stil geweigerd, factuur bleef "Verzonden", dunning liep door. Fix: match `[1]`, bedrag uit `[12]` | GEBORGD | `tests/unit/mollie-webhook-bedrag-verify-kolom.test.js` | ronde-3 |
| F-SCALE-140 | 2026-06-18 | gas-runtime / red-team | BLOKKER | `licence-server/Code.gs:37,45,47` | `config`/`valideer`/`telemetry` waren als enige router-acties zónder globale `rateLimit_`-cap → anonieme flood of runaway-client-loop legt de gedeelde server plat voor de hele klantenbasis (full-sheet-read per valideer; appendRow+O(n)-deleteRows per telemetry). Fix: ruime globale cap (fail-open) | GEBORGD | `tests/unit/licence-server-ratelimit.test.js` | ronde-3 |
| F-TAX-121 | 2026-06-18 | tax-compliance | MIDDEL | `EUVerkoop.gs:25` | Griekse BTW-prefix is `EL` (EU-conventie), niet `GR`; `_EU_LANDCODES` miste `EL` → IC-levering aan Griekse B2B-klant viel uit ICP-detectie → ontbrak op ICP-opgaaf (art. 37a Wet OB). Fix: `EL` toegevoegd | GEBORGD | `tests/unit/f-tax-121-griekenland-el-prefix.test.js` | ronde-3 |
| F-DOC-046 | 2026-06-15 | docs / tax | BLOCKER | `website/gids/creditnota-maken-zzp/`, `Verkoopfacturen.gs` | Gids beloofde een "creditnota uit factuur"-knop met reden + PDF; `maakCreditnota` had 0 callers (geen menu), geen reden-veld, geen PDF | GESLOTEN | `tests/unit/creditnota-uit-factuur.test.js` | #307 |
| F-OND-024 | 2026-06-15 | langlopend-onderhoud | BLOCKER | `Belastingadvies.gs:240` | Tarief-cliff: jaar voorbij laatst-bekende tabel kon stil met oude tarieven doorrekenen | GESLOTEN | `tests/unit/getbelasting-tarief-cliff.test.js` | #308 |
| AUDIT-SYS-1 | 2026-06-15 | tax-compliance | HOOG | `FormeelBewijs.gs`, `tests/property/` | 5/10 wiskundige verifiers (I₂,I₃,I₅,I₈,I₉) hadden géén property-dekking; bestaande 5 testten parallelle math i.p.v. de echte verifier | GESLOTEN | `tests/property/formeel-bewijs-verifiers.test.js` (+ dekkings-ratel) | #309 |
| AUDIT-SYS-2 | 2026-06-15 | tax-compliance | HOOG | `Belastingadvies.gs` reken-kern | Geen externe oracle: fiscale kern-functies konden intern consistent maar wettelijk fout zijn | GESLOTEN | `tests/unit/belasting-golden-master-2026.test.js` | #309 |
| AUDIT-SYS-3 | 2026-06-15 | proces | MIDDEL | `.claude/` | Audits vonden ronde-na-ronde nieuwe/dubbele dingen; geen invokebare orchestratie + geen closure-ledger | GESLOTEN | dit bestand + `/audit` | #309 |
| F-TAX-101 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:146` | Legacy `IB_SCHIJF_1_MAX` 2026 = 79137 ≠ array-schijf-2-grens 78426 → verkeerde marginaal-tarief-knik in besparingsbanner | GESLOTEN | `belasting-golden-master-2026.test.js` (LAAG 1) | #309 |
| F-TAX-102 | 2026-06-15 | tax-compliance | MIDDEL | `CustomFunctions.gs:88` | Last-resort fallback gelabeld "2026" mengde 2025-kortingen (heffings-/arbeidskorting) → afwijkende cel-functie-cijfers in degraded modus | GESLOTEN | `belasting-golden-master-2026.test.js` (LAAG 3) | #309 |
| F-ACC-002 | 2026-06-15 | accountant | BLOCKER | `DriveStructuur.gs:313` sluitJaarAf | KRITIEK-balansverschil bij jaarafsluiting was met YES-klik te omzeilen → niet-sluitende balans permanent in archief. Nu harde blokker (OK-only + audit-log + return) | GEBORGD | `tests/unit/jaarafsluiting-integriteit.test.js` | ronde-2 |
| F-ACC-003 | 2026-06-15 | accountant | HOOG | `DriveStructuur.gs:349` sluitJaarAf | Jaarafsluiting registreerde het jaar niet als gesloten periode → I₈ vals-groen. Roept nu `vergrendelPeriode_(1jan–31dec)` aan na resultaatverwerking | GEBORGD | `tests/unit/jaarafsluiting-integriteit.test.js` | ronde-2 |
| F-ACC-004 | 2026-06-15 | accountant | HOOG | `Boekingen.gs:1249` vergrendelPeriode_ | Read-modify-write op GESLOTEN_PERIODES zonder lock → lost write. Nu LockService (patroon updateGrootboekSaldo_) | GEBORGD | `tests/unit/jaarafsluiting-integriteit.test.js` | ronde-2 |
| F-ACC-001 | 2026-06-15 | accountant | BLOCKER | `BoekingEngine.gs:806` schrijfAuditLog_ | Correctie-events roteerden na 100 uit de buffer → 7-jaars bewaarplicht (art. 52 AWR) niet gehaald. schrijfAuditLog_ routeert significante events nu durable via `_isAuditSignificant_` + re-entrancy-guard | GEBORGD | `tests/unit/durable-audit-trail.test.js` | ronde-2 |
| F-ACC-009 | 2026-06-15 | accountant | MIDDEL | `XafExport.gs:247` | XAF `accTp` (B/P) op cijfer-heuristiek i.p.v. de Balans/W&V-kolom [4] → custom schema mis-mapte. Nu uit kolom [4], heuristiek als fallback | GEBORGD | `tests/unit/audit-ronde2-tax-clarity.test.js` | ronde-2 |
| F-TAX-113 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:1910` | Lijfrente-jaarruimte op tabblad miste factor-A-aftrek → bovengrens te hoog. Tekst markeert nu "bruto jaarruimte vóór opgebouwd pensioen (factor A)" | GEBORGD | `tests/unit/audit-ronde2-tax-clarity.test.js` | ronde-2 |
| F-TAX-114 | 2026-06-15 | tax-compliance | MIDDEL | `Prive.gs` | Box 3 forfait/heffingsvrij als hard getal getoond. Dialog + toast melden nu "indicatief — nog niet definitief" | GEBORGD | `tests/unit/audit-ronde2-tax-clarity.test.js` | ronde-2 |
| F-TAX-115 | 2026-06-15 | tax-compliance | LAAG | `Prive.gs:428/510` | Vermeende single-slash comments → vals alarm: beide zijn geldige `//` comments binnen een template-literal | GEEN BEVINDING | — | — |

---

*Onderhoud: `/audit` werkt deze ledger automatisch bij. Bij handmatige fixes:
voeg de rij toe vóór je commit, niet erna.*

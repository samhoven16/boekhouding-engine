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
| F-TAX-110 | 2026-06-15 | tax-compliance | HOOG | `Config`/`Belastingadvies.gs` BELASTING_PER_JAAR[2026] | IB-schijven (35,75%/38883/78426), Zvw 4,85%, zelfstandigenaftrek €1.200 — vereisen RB-bevestiging tegen definitieve belastingdienst.nl 2026-tabel (agent kon bron niet fetchen) | OPEN (wacht RB) | — | — |
| F-TAX-111 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:738` berekenArbeidskorting_ | Arbeidskorting mist opbouwtraject → bij lage winst (€8-20k) korting overschat → IB onderschat. Exacte 2026-opbouw% vereist RB | OPEN | — | — |
| F-TAX-112 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:1381` | Heffings-/arbeidskorting niet verlaagd voor AOW-gerechtigden (krijgen niet-AOW-maxima) | OPEN (wacht RB) | — | — |
| F-TAX-113 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:1910` berekenPriveBelastingvoordelen_ | Lijfrente-jaarruimte op tabblad mist factor-A-aftrek (dialog Belastingvoordeel.gs heeft 'm wél) → bovengrens te hoog | OPEN | — | — |
| F-TAX-114 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:142` → `Prive.gs` | Box 3 forfait 7,78% / heffingsvrij €59.500 zelf-gelabeld "voorstel/indicatief" maar in dialog als hard getal zonder banner | OPEN | — | — |
| F-ACC-001 | 2026-06-15 | accountant | BLOCKER | `BoekingEngine.gs:869`, `Triggers.gs:341` | Audit-trail van business-events (storno/dubbel/jaarafsluiting) gaat alleen naar 100-rijen ScriptProperties-buffer, niet naar durable AUDIT_LOG → 7-jaars bewaarplicht (art. 52 AWR) niet gehaald | OPEN (architectuur) | — | — |
| F-ACC-002 | 2026-06-15 | accountant | BLOCKER | `DriveStructuur.gs:311` sluitJaarAf | Strikte balanscontrole (KRITIEK, Δ>€0,005) is met YES_NO bypass-baar → niet-sluitende balans permanent in archief | OPEN (beslissing) | — | — |
| F-ACC-003 | 2026-06-15 | accountant | HOOG | `DriveStructuur.gs:349` | Jaarafsluiting roept geen `vergrendelPeriode_` aan → I₈-immutability leunt op één verwijderbare JA-tag, verifier vals-groen | OPEN | — | — |
| F-ACC-004 | 2026-06-15 | accountant | HOOG | `Boekingen.gs:1249` vergrendelPeriode_ | Read-modify-write op GESLOTEN_PERIODES zonder LockService → race kan een periode-slot verliezen | OPEN | — | — |
| F-ACC-005 | 2026-06-15 | accountant | HOOG | `BTW.gs:133` | Voorbelasting (r5b) geclaimd zonder controle op aanwezig bewijsstuk (art. 15 Wet OB) — eigen TODO erkent het | OPEN | — | — |
| F-ACC-009 | 2026-06-15 | accountant | MIDDEL | `XafExport.gs:247` | XAF `accTp` (B/P) op cijfer-heuristiek i.p.v. bestaande `bw`-kolom → mogelijke verkeerde balans/W&V-mapping bij import | OPEN | — | — |

## Afgehandeld (recent — bewijs van de ratel)

| ID | Gevonden | As/Agent | Ernst | Locatie | Bevinding | Status | Regressietest | PR |
|----|----------|----------|-------|---------|-----------|--------|---------------|----|
| F-DOC-046 | 2026-06-15 | docs / tax | BLOCKER | `website/gids/creditnota-maken-zzp/`, `Verkoopfacturen.gs` | Gids beloofde een "creditnota uit factuur"-knop met reden + PDF; `maakCreditnota` had 0 callers (geen menu), geen reden-veld, geen PDF | GESLOTEN | `tests/unit/creditnota-uit-factuur.test.js` | #307 |
| F-OND-024 | 2026-06-15 | langlopend-onderhoud | BLOCKER | `Belastingadvies.gs:240` | Tarief-cliff: jaar voorbij laatst-bekende tabel kon stil met oude tarieven doorrekenen | GESLOTEN | `tests/unit/getbelasting-tarief-cliff.test.js` | #308 |
| AUDIT-SYS-1 | 2026-06-15 | tax-compliance | HOOG | `FormeelBewijs.gs`, `tests/property/` | 5/10 wiskundige verifiers (I₂,I₃,I₅,I₈,I₉) hadden géén property-dekking; bestaande 5 testten parallelle math i.p.v. de echte verifier | GEBORGD | `tests/property/formeel-bewijs-verifiers.test.js` (+ dekkings-ratel) | #309 |
| AUDIT-SYS-2 | 2026-06-15 | tax-compliance | HOOG | `Belastingadvies.gs` reken-kern | Geen externe oracle: fiscale kern-functies konden intern consistent maar wettelijk fout zijn | GEBORGD | `tests/unit/belasting-golden-master-2026.test.js` | #309 |
| AUDIT-SYS-3 | 2026-06-15 | proces | MIDDEL | `.claude/` | Audits vonden ronde-na-ronde nieuwe/dubbele dingen; geen invokebare orchestratie + geen closure-ledger | GEBORGD | dit bestand + `/audit` | #309 |
| F-TAX-101 | 2026-06-15 | tax-compliance | MIDDEL | `Belastingadvies.gs:146` | Legacy `IB_SCHIJF_1_MAX` 2026 = 79137 ≠ array-schijf-2-grens 78426 → verkeerde marginaal-tarief-knik in besparingsbanner | GEBORGD | `belasting-golden-master-2026.test.js` (LAAG 1) | #309 |
| F-TAX-102 | 2026-06-15 | tax-compliance | MIDDEL | `CustomFunctions.gs:88` | Last-resort fallback gelabeld "2026" mengde 2025-kortingen (heffings-/arbeidskorting) → afwijkende cel-functie-cijfers in degraded modus | GEBORGD | `belasting-golden-master-2026.test.js` (LAAG 3) | #309 |

---

*Onderhoud: `/audit` werkt deze ledger automatisch bij. Bij handmatige fixes:
voeg de rij toe vóór je commit, niet erna.*

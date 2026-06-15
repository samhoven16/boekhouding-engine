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
| _(leeg — geen openstaande bevindingen)_ | | | | | | | | |

## Afgehandeld (recent — bewijs van de ratel)

| ID | Gevonden | As/Agent | Ernst | Locatie | Bevinding | Status | Regressietest | PR |
|----|----------|----------|-------|---------|-----------|--------|---------------|----|
| F-DOC-046 | 2026-06-15 | docs / tax | BLOCKER | `website/gids/creditnota-maken-zzp/`, `Verkoopfacturen.gs` | Gids beloofde een "creditnota uit factuur"-knop met reden + PDF; `maakCreditnota` had 0 callers (geen menu), geen reden-veld, geen PDF | GESLOTEN | `tests/unit/creditnota-uit-factuur.test.js` | #307 |
| F-OND-024 | 2026-06-15 | langlopend-onderhoud | BLOCKER | `Belastingadvies.gs:240` | Tarief-cliff: jaar voorbij laatst-bekende tabel kon stil met oude tarieven doorrekenen | GESLOTEN | `tests/unit/getbelasting-tarief-cliff.test.js` | #308 |
| AUDIT-SYS-1 | 2026-06-15 | tax-compliance | HOOG | `FormeelBewijs.gs`, `tests/property/` | 5/10 wiskundige verifiers (I₂,I₃,I₅,I₈,I₉) hadden géén property-dekking; bestaande 5 testten parallelle math i.p.v. de echte verifier | GEBORGD | `tests/property/formeel-bewijs-verifiers.test.js` (+ dekkings-ratel) | #309 |
| AUDIT-SYS-2 | 2026-06-15 | tax-compliance | HOOG | `Belastingadvies.gs` reken-kern | Geen externe oracle: fiscale kern-functies konden intern consistent maar wettelijk fout zijn | GEBORGD | `tests/unit/belasting-golden-master-2026.test.js` | #309 |
| AUDIT-SYS-3 | 2026-06-15 | proces | MIDDEL | `.claude/` | Audits vonden ronde-na-ronde nieuwe/dubbele dingen; geen invokebare orchestratie + geen closure-ledger | GEBORGD | dit bestand + `/audit` | #309 |

---

*Onderhoud: `/audit` werkt deze ledger automatisch bij. Bij handmatige fixes:
voeg de rij toe vóór je commit, niet erna.*

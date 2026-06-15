---
description: Uitputtende, zelf-versterkende audit — draait alle 12 audit-assen, dedupliceert tegen main + ledger, en volgt elke bevinding tot sluiting.
---

# /audit — integrale her-audit met closure-ledger

Doel: vind alles wat kan leiden tot een boete, dataverlies, een klacht, een
gefaalde belastingcontrole, een kapotte koopflow, of een afhakende klant —
vóór een klant het vindt — en borg het zó dat dezelfde klasse niet terugkeert.

Dit commando voert `.claude/go-live-protocol.md` uit met drie verschillen die
voorkomen dat we ronde na ronde dezelfde dingen "opnieuw vinden":

1. **Verifieer-eerst** (geen spook-bevindingen);
2. **Closure-ledger** (`.claude/audit-ledger.md` — niets is "klaar" tot GESLOTEN);
3. **Regressietest-ratel** (geen BLOCKER/HOOG sluit zonder test).

---

## Stap 0 — Verifieer-eerst (verplicht, anders vind je ruis)

Vóór er ook maar één agent draait:

- `git fetch origin main && git log --oneline -15 origin/main` — werk op de
  hoogste main. Een "bug" die al in main gefixt is, is géén bevinding.
- Lees `.claude/audit-ledger.md`. Alles met status **GESLOTEN/GEBORGD/WONTFIX**
  is afgehandeld — niet opnieuw rapporteren tenzij de borging aantoonbaar weg is.
- Les van F-OND-024: een finding-doc kan een reeds-opgelost punt noemen.
  Controleer elke kandidaat tegen de **huidige** code en de ledger vóór je 'm
  als nieuw opvoert.

## Stap 1 — Draai de 12 assen parallel (Agent-tool, één bericht)

Gebruik de matrix in `go-live-protocol.md`. Actuele agent-namen:
`onboarding-doorloop` (vervangt het gedeprecate klantreis-simulator),
`accountant-en-belastingdienst`, `tax-compliance`, `red-team-adversary`,
`gas-runtime-auditor`, `langlopend-onderhoud`, `documentatie-volledigheid`,
`customer-voice-editor`, `positionering-redacteur`, `seo-strategist`,
`content-gap-detector`, `cross-pr-regressie`.

Geef elke agent de letterlijke instructie + ernst-rubriek uit
`go-live-protocol.md` ("max 10 bevindingen, per stuk: ernst, file:regel,
concreet schade-scenario, fix in 1-2 zinnen; geen theorie zonder pad").

## Stap 2 — Consolideer & dedupliceer

- Voeg samen; agents overlappen bewust.
- Schrap wat al in main of in de ledger (GESLOTEN/GEBORGD/WONTFIX) zit.
- Wat overblijft = **nieuwe** bevindingen.

## Stap 3 — Boek elke nieuwe bevinding in de ledger

Voeg per bevinding een rij toe aan `.claude/audit-ledger.md` met status **OPEN**
(ID, datum, as/agent, ernst, file:regel, bevinding). De ledger is de enige
bron van waarheid voor "wat staat nog open".

## Stap 4 — Fix in volgorde van ernst, mét borging

- **BLOCKER** → fix nu, geen uitzondering. **HOOG** → fix nu tenzij Sam expliciet
  uitstelt (schriftelijk in de ledger).
- Volg CLAUDE.md: impact-analyse → kleinste safe patch → targeted tests → lint.
- **Ratel:** elke BLOCKER/HOOG krijgt een regressietest die zónder de fix faalt.
  Pas dán status → **GEBORGD**. Na merge → **GESLOTEN** (met PR-nummer).
- MIDDEL/LAAG → backlog in de ledger; herbeoordeel volgende ronde.

## Stap 5 — Schrijf het ronde-rapport

Consolideer naar `.claude/go-live-audit-<datum>.md` (zoals het protocol vraagt)
en werk de ledger-statussen bij. Eindig met de eerlijkheidsclausule: dit vindt
wat vandaag kenbaar is; het vervangt geen jaarlijkse wetscheck of echte klachten.

## Exit-criteria (wanneer is een ronde "af")

- 0 BLOCKER open; alle HOOG gefixt of schriftelijk uitgesteld;
- elke gesloten BLOCKER/HOOG heeft een regressietest (`GEBORGD`/`GESLOTEN`);
- ledger en dated rapport bijgewerkt; CI groen (Jest + lint + truth-check).

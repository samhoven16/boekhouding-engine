# Go-Live Protocol — integrale pre-launch audit

> Dit is het master-protocol voor elke go-live-beslissing en elke periodieke her-audit
> (advies: elk kwartaal + bij elke wetswijziging + vóór elke prijswijziging).
> Voer het integraal uit; sla geen as over omdat "daar niets veranderd is".

## Doel

Vind alles wat kan leiden tot: een boete, dataverlies, een klacht, een slechte review,
een gefaalde belastingcontrole, een kapotte koopflow, onnodig handmatig werk voor Sam,
of een klant die afhaakt — vóórdat een klant het vindt.

## De 12 audit-assen (draai parallel via de Agent-tool)

| # | Agent | Vraag die beantwoord moet worden |
|---|-------|----------------------------------|
| 1 | `klantreis-simulator` | Haalt een echte klant discovery → koop → activatie → eerste factuur → eerste BTW-aangifte → backup → opzeggen zonder hulp? |
| 2 | `accountant-en-belastingdienst` | Overleeft deze administratie een 7-jaar bewaarplicht-controle en een accountant-overdracht? |
| 3 | `tax-compliance` | Kloppen alle fiscale berekeningen met de 10 axioma's en actuele NL-wetgeving? |
| 4 | `red-team-adversary` | Kan een aanvaller licenties stelen, betalingen omzeilen, of klantdata bereiken? |
| 5 | `gas-runtime-auditor` | Breekt iets bij quota-limieten, 6-min-timeout, lock-contention, property-groei? |
| 6 | `langlopend-onderhoud` | Werkt dit over 5+ jaar nog, ook als Sam er 6 maanden niet naar omkijkt? |
| 7 | `documentatie-volledigheid` | Kan een klant elk gangbaar probleem zelf oplossen zonder Sam te mailen? |
| 8 | `customer-voice-editor` | Is elke klantgerichte string begrijpelijk, consistent en zonder jargon? |
| 9 | `positionering-redacteur` | Spreekt de site alle persona's aan zonder valse beloftes? |
| 10 | `seo-strategist` | Is het product vindbaar op meer dan de eigen bedrijfsnaam? |
| 11 | `content-gap-detector` | Welke vragen googelen klanten waar wij geen antwoord op hebben? |
| 12 | `cross-pr-regressie` | Hebben recent gemergde PR's elkaar stilletjes gebroken? |

## Instructie per agent (letterlijk meegeven)

```
Lever maximaal 10 bevindingen, gesorteerd op ernst. Per bevinding: ernst,
file:regelnummer, wat er mis is, welk concreet klant-/boete-/review-scenario
het veroorzaakt, en de fix in 1-2 zinnen.

Ernst-rubriek:
- BLOCKER  — verhindert go-live: dataverlies, boete-risico, koopflow kapot,
             juridisch onjuist, belastingberekening fout
- HOOG     — leidt voorspelbaar tot een klacht of slechte review binnen 90 dagen
- MIDDEL   — leidt tot verwarring of een supportmail
- LAAG     — cosmetisch of theoretisch

Geen theoretische risico's zonder concreet pad. Geen opsomming van wat goed is.
Meld ook: elk handmatig proces van Sam dat geautomatiseerd kan worden.
```

## Verwerking van bevindingen

1. Consolideer alle rapporten; dedupliceer (agents overlappen bewust).
2. **BLOCKER** → fixen vóór go-live, geen uitzonderingen. Regressietest erbij.
3. **HOOG** → fixen vóór go-live tenzij expliciet door Sam uitgesteld; uitstel schriftelijk in dit bestand.
4. **MIDDEL/LAAG** → backlog in audit-rapport; her-beoordelen bij volgende audit.
5. Schrijf het geconsolideerde rapport naar `.claude/go-live-audit-<datum>.md`.
6. Elke fix volgt het normale CLAUDE.md-protocol (impact-analyse, targeted tests, lint).

## Grenzen van dit protocol (eerlijkheidsclausule)

Dit protocol vindt wat vandaag kenbaar is. Het vervangt niet:
- jaarlijkse wetgevings-check (BTW-tarieven, IB-schijven, KIA-staffel wijzigen per 1 januari)
- monitoring van Google Apps Script / Mollie / Brevo deprecation-aankondigingen
- het lezen van echte klachten van echte klanten

"10 jaar safe" bestaat niet; "elk kwartaal 2 uur dit protocol draaien" wel.

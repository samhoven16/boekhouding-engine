# De Ultieme Criticus — meta-prompt en methode

> Werkwijze gebruikt op 2026-06-05 voor multi-persona meedogenloos rapport.
> Geeft je een framework voor herhaalbare zelf-audits, niet eenmalig.

## Wanneer gebruik je deze test

- Vóór een grote launch
- Bij elk kwartaal-review
- Bij elke verdubbeling van klant-aantal
- Bij elke ingrijpende feature (nieuwe rekeningmodule, multi-currency, etc.)

## De 5 persona's

Elke persona heeft een **eigen lens**, eigen woordkeuze, eigen jacht. Samen zien ze wat ik nooit zelf zou opmerken.

| # | Persona | Lens | Output-format |
|---|---|---|---|
| 1 | De Concurrent (Moneybird-PM) | "Waarom blijft mijn klant bij mij?" | 5 deal-breakers, 3 sales-quotes, 1 onbenutte zwakte |
| 2 | De Disgruntled Klant (6mnd) | "Wat ga ik op Trustpilot schrijven?" | 1-ster review + 5 breekpunten + retention-fix |
| 3 | De Accountant (20j) | "Wat zou de belastingdienst eruit pikken?" | 5 audit-findings + 3 missende exports + 1 P0 |
| 4 | De Security-onderzoeker (OWASP+AVG) | "Schandaal-stuk?" | 5 risico's CVSS-gesorteerd + 3 AVG-gaps |
| 5 | De UX-cynicus | "Don't Make Me Think-test" | 5 conv-killers + 5 onboard-killers + 5 retention-killers |

## Critische regels voor elke persona-prompt

1. **Hard cap op woorden** — anders worden de output zo lang dat synthese onmogelijk wordt
2. **Concrete bewijzen** — file:regel of citaten, geen vage observaties
3. **Adversariële instructie** — "wees brutaal, geen 'to be fair'"
4. **Output-structuur vooraf** — exact aantal items per categorie
5. **Eigen stem** — "schrijf alsof jij die rol bent", niet "analyseer"

## Wat NIET delegeerbaar is

- Synthese over persona's heen (jij ziet het hele beeld, agents niet)
- Implementatie van fixes (agent kan code-aanwijzing geven, jij beslist)
- Strategische trade-offs (een security-fix kan een UX-killer zijn)

## Vervolg-cycle

1. Run de 5 persona's parallel (zoals deze run)
2. Synthetiseer in matrix: persona × severity × component
3. Bouw 1-2 demonstratieve fixes
4. PR met findings + voorbeelden
5. Klant (jij) prioriteert vervolg-PR's

De synthese in `.claude/ultieme-criticus-rapport-2026-06-05.md` is een voorbeeld van die output.

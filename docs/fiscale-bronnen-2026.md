# Fiscale bronnen 2026: wat is bij de bron gezien (22 okt 2026)

Opdracht van Sam: de registerbelastingadviseur (RB) haalt zijn cijfers ergens vandaan; zoek die bronnen en haal de waarden daar zelf op. Dit is dat verslag. **Eerlijke grens:** dit is een bronverificatie door een AI-agent op de officiële pagina's, geen formele aftekening door een ingeschreven RB. Elke pagina is op 22-10-2026 opgehaald en gelezen; citaten zijn letterlijk.

## Waar de RB zijn cijfers vandaan haalt (volgorde van gezag)
1. **Wet en Belastingplan:** wetten.overheid.nl (Wet IB 2001, Wet OB 1968) en rijksoverheid.nl (Belastingplan, Miljoenennota).
2. **Belastingdienst:** de pagina's "Box 1", "Voorlopige aanslag: tarieven en heffingskortingen", "Box 3 berekening" en de *Handleiding inkomstenbelasting 2026* (`belastingdienst.nl/.../fisin/fisin2026/...`). Dit zijn de tabellen die ook een RB gebruikt.
3. **Ondernemersplein (RVO):** zegt per wijziging of iets nog een voorstel is of al is aangenomen.
Blogs en adviesbureaus tellen alleen als wijzer naar een van deze drie, nooit als bron.

## 2026: bij de bron bevestigd
| Waarde | Bron zegt | Pagina |
|---|---|---|
| IB box 1 | t/m 38.883 35,75%; t/m 78.426 37,56%; daarboven 49,50% | belastingdienst.nl box_1 |
| Algemene heffingskorting | 3.115 tot 29.736; daarna − 6,398% over het meerdere; 0 vanaf 78.426 | voorlopige-aanslag-tarieven-en-heffingskortingen |
| Arbeidskorting | max 5.685 bij 45.592; daarna − 6,510% | idem |
| Zelfstandigenaftrek / startersaftrek / stakingsaftrek | 1.200 (AOW: 600) / 2.123 (AOW: 1.062) / 3.630 | Handleiding IB 2026, hfst. 8 |
| MKB-winstvrijstelling | 12,7% | idem 8.10 |
| WBSO-aftrek / startersverhoging | 15.979 / 7.996 | idem 8.3 |
| EIA | 40%, minimaal 2.500 per bedrijfsmiddel | idem |
| KIA | 2.901–71.683 28%; 71.684–132.746 vast 20.072; 132.747–398.236 afbouw 7,56%; daarboven 0 | kleinschaligheidsinvesteringsaftrek-2026 |
| Box 3 | heffingsvrij 59.357 (met partner 118.714); banktegoeden 1,28%; overig 6,00%; tarief 36% | heffingsvrij-vermogen; berekening-box-3-inkomen-2026 |
| Zvw zelfstandigen | 4,85% tot maximum bijdrage-inkomen 79.409 | percentages-zvw |

## 2026: afwijkend gevonden en gecorrigeerd in deze PR
| Waarde | Stond in code | Bron zegt | Gevolg |
|---|---|---|---|
| Vrijstelling groene beleggingen (`BOX3_GROEN_VRIJSTELLING`) | 67.000 | **26.715 per persoon** ("Groene beleggingen zijn vrijgesteld tot € 26.715 per persoon") | Het groensparen-advies noemde een 2,5 keer te hoge vrijstelling en rekende er een te hoge besparing mee uit |
| Box 1 schijf 1 AOW-gerechtigden (`IB_SCHIJVEN_AOW[0]`) | 17,70% | **17,85%** (geboren op of na 1-1-1946, t/m 38.883) | Dit was het ⚠️-punt uit `rb-verificatie-checklist-2026.md`: hiermee gesloten |

Beide stonden niet in de pin-lijst van `tests/unit/belasting-golden-master-2026.test.js`; nu wel (eerst rood bewezen, dan gecorrigeerd).

## Gevonden, nog niet aangepast
- **KIA-afbouw één euro verschoven:** de bron rekent de 7,56% over het deel *boven 132.746*; de code rekent boven 132.747 (`KIA_AFBOUW_START`). Verschil maximaal 8 cent per aanvraag, meerdere plekken gebruiken de constante. Voorstel: apart oplossen met de golden-master (€ 14.987,67 wordt € 14.987,60).
- **Schulden in box 3** (drempel 3.800 per persoon, rendement 2,70%) staan op de Belastingdienst-pagina; niet nagegaan of ze gemodelleerd zijn.
- **AOW-varianten (F-TAX-112):** wie in 2026 zelf de AOW-leeftijd bereikt, betaalt in schijf 1 17,85% (januari) tot 34,26% (december); geboren voor 1-1-1946 heeft schijfgrens 41.123. Staat nu niet in het model.
- **Arbeidskorting opbouw (F-TAX-111):** de bron geeft nu de volledige staffel: 8,324% tot 11.965; 996 + 31,009% tot 25.845; 5.300 + 1,950% tot 45.592. Nog niet gebouwd.

## 2026: niet bij de bron gecontroleerd in deze ronde
`FOR_MAX`, `THUISWERK_PER_DAG`, `LIJFRENTE_*`, `AOW_FRANCHISE`, `BOX2_*`, `DGA_MIN_SALARIS`. Blijven staan op de ⬜-lijst in `.claude/rb-verificatie-checklist-2026.md`.

## 2027 (Prinsjesdag 2026): wat nu bekend is
| Onderwerp | Bron zegt | Status |
|---|---|---|
| Zelfstandigenaftrek | 900 | aangenomen (Ondernemersplein: "Deze wet is aangenomen") |
| Startersaftrek | 2.123 naar **10** in 2027, **0** in 2028 | voorstel |
| Stakingsaftrek | 3.630 naar **908** in 2027, stopt in 2030 | voorstel |
| Schijven en heffingskortingen | inflatiecorrectie 48% in 2027, 12,2% in 2028; tarief schijf 1 en 2 "verhoogd met 0,06%" | voorstel; of dit procentpunten zijn is niet te zien |
Exacte 2027-schijfgrenzen en -kortingen staan niet op de gelezen pagina's; het Belastingplan 2027 zelf is niet gelezen. De 2027-tabel in `Belastingadvies.gs` blijft een gemarkeerde placeholder (`TARIEF_VEROUDERD`), maar de startersaftrek (2.123) en stakingsaftrek (3.630) daarin zijn nu bekend onjuist.

## Hoe dit betrouwbaarder wordt
Voorstel (nog niet gebouwd): een script dat elke pagina hierboven opnieuw ophaalt en controleert of het geciteerde getal er nog staat, plus een jaarlijkse verloopvlag. Dan doet een machine wat de RB nu met de hand doet, en komt een afwijking vanzelf boven.

# RB-verificatie-checklist 2026 — fiscale constanten

> **Doel**: dé harde 100%-blokker (F-TAX-110/111/112) afvinkbaar maken. De
> IB-/korting-/aftrek-output van Boekhoudbaar rust op onderstaande constanten.
> De code is intern consistent en golden-master-getest, maar **niet
> professioneel gecertificeerd**. Laat een **RB/belastingadviseur** elke regel
> aftekenen tegen de definitieve belastingdienst.nl-2026-tabellen (na het
> Belastingplan 2026 / Prinsjesdag-cyclus).
>
> Bron-of-truth in code: `src/Belastingadvies.gs` `BELASTING_PER_JAAR[2026]`
> (regel ~130-185). Golden-master: `tests/unit/belasting-golden-master-2026.test.js`.
> **Niet door Claude wijzigen op gokwerk** — alleen ná RB-aftekening + bijwerken
> van zowel de constante als de golden-master.

Legenda impact: 🔴 = drijft direct de IB-schatting (hoogste risico bij fout) ·
🟠 = aftrek/korting · 🟡 = box 3 / overig · ⚪ = informatief/indicatief.

## A. Inkomstenbelasting box 1 — schijven 🔴
`IB_SCHIJVEN` (niet-AOW) + `IB_SCHIJVEN_AOW`:

| Schijf | Grens (t/m) | Tarief niet-AOW | Tarief AOW | Bevestig |
|--------|-------------|-----------------|------------|----------|
| 1 | € 38.883 | 35,75 % (8,10 IB + 27,65 volksverz.) | 17,70 % | ☐ |
| 2 | € 78.426 | 37,56 % | 37,56 % | ☐ |
| 3 | hoger | 49,50 % | 49,50 % | ☐ |

> Let op: scalar `IB_SCHIJF_1_PCT` (0,3575) en `IB_SCHIJF_2_PCT` (0,495) MOETEN
> gelijk blijven aan resp. schijf 1 en schijf 3 (F-TAX-133-borg).

## B. Heffingskortingen 🔴
| Constante | Huidige waarde | Bevestig |
|-----------|----------------|----------|
| Algemene heffingskorting max | € 3.115 | ☐ |
| — afbouw vanaf | € 29.739 @ 6,40 % | ☐ |
| — nul vanaf | € 78.426 | ☐ |
| Arbeidskorting max | € 5.685 (top t/m € 45.592) | ☐ |
| — afbouw vanaf | € 45.593 @ 6,51 % | ☐ |
| AOW-gerechtigde varianten (verlaagde maxima) | F-TAX-112: nog niet apart gemodelleerd | ☐ |
| Arbeidskorting-opbouwtraject (lage winst €8-20k) | F-TAX-111: opbouw% nog niet gemodelleerd | ☐ |

## C. Ondernemersaftrek + ZVW 🟠
| Constante | Huidige waarde | Bevestig |
|-----------|----------------|----------|
| Zelfstandigenaftrek | € 1.200 (verlaagd t.o.v. 2025) | ☐ |
| Startersaftrek | € 2.123 | ☐ |
| Stakingsaftrek | € 3.630 | ☐ |
| MKB-winstvrijstelling | 12,70 % | ☐ |
| ZVW-bijdrage % / max inkomen | 4,85 % / € 79.409 | ☐ |
| AOW-franchise (Zvw/FOR) | € 14.540 | ☐ |

## D. Investeringsaftrek (KIA-staffel) 🟠
| Constante | Huidige waarde | Bevestig |
|-----------|----------------|----------|
| KIA drempel (min) | € 2.901 | ☐ |
| 28 %-zone tot | € 71.683 | ☐ |
| Vast bedrag | € 20.072 (tot € 132.747) | ☐ |
| Afbouw % | 7,56 % | ☐ |
| KIA max-investering | € 398.236 | ☐ |
| WBSO-aftrek / startersbonus | € 15.979 / € 7.996 | ☐ |
| EIA % / drempel | 40 % / € 2.500 | ☐ |

## E. Box 3 (indicatief — kabinet/Prinsjesdag) 🟡
| Constante | Huidige waarde | Bevestig |
|-----------|----------------|----------|
| Forfait beleggingen | 7,78 % (voorstel; was 5,88 % 2025) | ☐ |
| Forfait spaargeld | 1,44 % | ☐ |
| Box 3-tarief | 36 % | ☐ |
| Heffingvrij vermogen | € 59.500 (indicatief) | ☐ |
| Groen-vrijstelling | € 67.000 | ☐ |

## F. Overig ⚪
| Constante | Huidige waarde | Bevestig |
|-----------|----------------|----------|
| Lijfrente jaarruimte-max / factor A | € 38.000 / 6,27 | ☐ |
| FOR-max (geen nieuwe vorming sinds 2023) | € 10.786 | ☐ |
| Thuiswerkaftrek/dag | € 2,40 | ☐ |
| Logies-BTW (per 1-1-2026) | 21 % | ☐ |
| Box 2 (AB) schijven | 24,5 % t/m € 67.000, 31 % daarboven | ☐ |
| DGA gebruikelijk loon | € 56.000 | ☐ |
| AOW-leeftijd | 67 (let op: 2028 → 67j 3m) | ☐ |

## Afhandeling
1. RB tekent elke regel af tegen belastingdienst.nl-2026.
2. Afwijking gevonden → meld het exacte getal; Claude past **constante + golden-master** samen aan (geen losse edit).
3. Alle vakjes ☐→☑ + datum + naam RB → F-TAX-110/111/112 in `audit-ledger.md` op GESLOTEN. Pas dán is de fiscale kern "100% gecertificeerd".

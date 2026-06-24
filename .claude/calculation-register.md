# Berekenings-register — exactheid & decennia-stabiliteit

> **Sam's eis (2026-06-19):** elke berekening moet **op de cent EXACT** kloppen,
> deterministisch zijn, en **decennia stabiel** blijven — en net als de
> bug-klassen en de productfuncties door **meerdere onafhankelijke audit-rondes**.
>
> Dit register is de teller: per berekening het **precisie-model**, de **tests**
> die hem bewijzen, en hoeveel **onafhankelijke rondes** hij heeft doorstaan.
> Een berekening is pas "af" bij `EXACT` + property-test + golden-master +
> ≥2 onafhankelijke audit-rondes zonder nieuwe bevinding.

## Precisie-modellen (van best naar risicovol)

| Model | Exact? | Wanneer |
|-------|--------|---------|
| **integer-cent** | ✅ exact | geld dat optelt/aftrekt (journaalpost, saldi, totalen) |
| **float + één afrondpunt** | ⚠️ exact *mits* afronding correct + op één plek | losse bedragen, mits `rondBedrag_` zelf exact is |
| **rate × bedrag → afronden** | ⚠️ | BTW/IB/KIA — risico zit in afrond-moment + tarief-float |
| **rauwe float, geen afronding** | 🔴 drift | verboden voor geld |

## Status-legenda
`EXACT` = bewezen exact (property + golden) · `RISICO` = mogelijk drift/afrond-fout
(audit loopt) · `TODO` = nog te verifiëren.

---

## Ronde 2026-06-19 — precisie-audit (2 onafhankelijke assen)

**Geverifieerd EXACT (met getallen-bewijs over miljoenen waarden):** journaalpost-
balans (integer-cent, 1 cent onbalans = harde weigering) · factuur-decompositie
excl/btw/incl (0 mismatches / 2M, round-trip exact) · BTW-aangifte ↔ grootboek
(één en hetzelfde opgeslagen getal → geen €0,01-splitsing) · Σ factuurregels
(volgorde-onafhankelijk) · pro-rata kosten- én BTW-aftrek (residu-patroon, geen
cent zoek) · grootboek carry-forward over jaren · storno/creditnota (hergebruik
opgeslagen cent, geen her-afronding) · UBL/PEPPOL-XML · afschrijving.

**Gefixt deze ronde (`precisie-geld.test.js` + integer-cent-balans):** `parseBedrag_`
US-formaat-bug (P1) · `rondBedrag_` symmetrie + docstring (P0) · `formatBedrag_`
`-€ 0,00` · balans-controle nu integer-cent EXACT (`=== 0`, geen ε) — de
jaarrekening sluit nu bewijsbaar op 0,00, niet "< €0,005".

**Backlog (MIDDEL, geen huidige fout):** KIA-afbouw rekent met float `0.0756` →
naar integer-breuk (756/10000); BTW-aangifte rondt op centen terwijl het
OB-formulier op hele euro's rondt → beleidskeuze documenteren of euro-rondingslaag
op de export. Chokepoint voor de overige parsers (parseEU/parseBankBedrag_).

## Het register

| # | Berekening | file:functie | Model | Tests | Status |
|---|-----------|--------------|-------|-------|--------|
| **P0** | **`rondBedrag_` (het fundament)** | `Utils.gs:126` | half-up symmetrisch | `precisie-geld.test.js` | 🟢 **EXACT (ronde 2026-06-19)** — nu `Math.sign·Math.round(|n|·100)` → symmetrisch (geen cent-schepping bij negatief); docstring gecorrigeerd (half-up = Belastingdienst-conform, géén bankiersmethode). `1.005→1.00` is de float-repr-realiteit (1.00499…), consistent met `toFixed` — geen bug. |
| P1 | `parseBedrag_` / `parseBedragStrict_` | `Utils.gs:_parseBedragKern_` | positie-bewust (laatste sep, ≤2 cijfers=decimaal) | `precisie-geld.test.js` | 🟢 **EXACT (ronde 2026-06-19)** — US-formaat `"1,234.56"`→1234,56 (was 1,23, eerste-komma-bug) + dot-decimaal gefixt; NL-duizendtal `"1.000"`→1000 behouden (gepind). Chokepoint voor klasse 1. (parseEU/parseBankBedrag_ nog apart — backlog.) |
| 1 | BTW-decompositie (excl/btw/incl) | `BTW.gs` berekenBtw | rate×bedrag→rond | btw-export, btw-classificatie | RISICO — afrond-moment + 21%/9%-float |
| 2 | BTW-aangifte rubrieken (r1a…r5g) | `BTW.gs:berekenBtwAangifte_` | Σ + pro-rata | property (formeel-bewijs I₅) · golden | RISICO — Σ in euro-float over een jaar; rubriek-sommen |
| 3 | Pro-rata BTW-aftrek | `BTW.gs:349` | breuk × r5b | — | RISICO — float-breuk × bedrag |
| 4 | Journaalpost debet=credit | `Boekingen.gs` valideerTransactieFormeel_ | **integer-cent** | jaarafsluiting-integriteit · property | 🟢 EXACT (integer-centen-validator) — bevestigen |
| 5 | Grootboek-saldi | `Boekingen.gs` updateGrootboekSaldo_ / herberekening | Σ | — | RISICO — Σ over alle mutaties |
| 6 | Balans / W&V / cashflow | `Rapportages.gs` | Σ | — | RISICO — optellingen over rijen |
| 7 | Debiteuren/crediteuren open | `Dashboard.gs` | incl − betaald, Σ | — | RISICO |
| 8 | IB progressief (schijven) | `Belastingadvies.gs` | schijf-grenzen × % | golden-master-2026 | RISICO — % als float; schijf-knik |
| 9 | Zvw-bijdrage | `Belastingadvies.gs` | % × inkomen, cap | golden-master-2026 | RISICO |
| 10 | Heffings-/arbeidskorting + afbouw | `Belastingadvies.gs` | lineaire afbouw | golden-master-2026 · (F-TAX-111 open) | RISICO |
| 11 | Zelfstandigen-/startersaftrek | `Belastingadvies.gs` | vast bedrag | golden-master-2026 | RISICO |
| 12 | KIA-staffel | `berekenKiaAftrek_` | staffel + 28%/afbouw | golden-master-2026 · property (top5) | RISICO — afbouw-% float |
| 13 | MKB-winstvrijstelling | `Belastingadvies.gs` | % × winst | golden-master-2026 | RISICO |
| 14 | Lijfrente-jaarruimte | `Belastingadvies.gs` | % − factor A | audit-ronde2 | RISICO |
| 15 | Box 3 forfait | `Prive.gs` | forfait-% × grondslag | audit-ronde2 (indicatief) | RISICO |
| 16 | Afschrijving (lineair) | afschrijvings-fn | (aanschaf−rest)/jaren | — | RISICO — deelt-door-jaren, cumulatief over 5-10j |
| 17 | Bijtelling auto | `Belastingadvies.gs` | % × cataloguswaarde | golden | RISICO |
| 18 | KOR-monitor €20.000 | `BTW.gs` | Σ omzet vs grens | — | RISICO — grens-vergelijk |
| 19 | OSS-drempel €10.000 | `EUVerkoop.gs` | Σ EU-B2C vs grens | — | RISICO |
| 20 | Mollie bedrag-match | `Mollie.gs:343` | `abs(a−b)>0.02` | mollie-webhook-bedrag | RISICO — float-tolerantie op betaalrand |

> De audit-ronde van 2026-06-19 (2 precisie-assen) vult de RISICO→EXACT/bug-
> overgang in. Elke `EXACT`-markering vereist een property-test (invariant over
> de invoerruimte) + golden-master (exacte bekende waarde).

## De "meerdere rondes"-cadans (procedure)

1. Elke berekening krijgt: **property-test** (invarianten: Σ-deel = geheel op de
   cent; round-trip stabiel; debet=credit exact; monotonie) **én golden-master**
   (exacte, met de hand/externe bron geverifieerde waarde).
2. Elke `/audit`-ronde her-verifieert de RISICO-rijen onafhankelijk. Pas na
   **≥2 rondes zonder nieuwe bevinding** mag een rij van `EXACT (1 ronde)` naar
   `EXACT (geborgd)`.
3. "100% af voor de berekeningen" = elke rij `EXACT (geborgd)` + alle tests groen.

## Eerlijke grens
Exact-tot-op-de-cent is haalbaar (integer-centen + één deterministisch afrondpunt
+ property-bewijs). "0,000000" in de zin van oneindige float-precisie bestaat niet
in IEEE-754 — maar dat is ook niet nodig: geld is exact tot de cent, tarieven
tot de wettelijke afronding. Wetswijzigingen over decennia blijven een jaarlijkse
externe check (geen machine vangt een nieuw belastingplan).

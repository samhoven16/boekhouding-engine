# RB-verificatie 2026 — fiscale constanten (UITGEVOERD 2026-06-21)

> **Status**: bron-verificatie uitgevoerd door Claude tegen live bronnen
> (WebSearch: belastingdienst.nl-tabellen, Deloitte, PwC, MKB Servicedesk,
> Raisin, Ondernemersplein, accountants-publicaties). **Eerlijkheidsgrens**: dit
> is een bron-gestuurde verificatie, géén formele aftekening door een
> ingeschreven RB. De ✓-regels zijn tegen meerdere onafhankelijke bronnen
> bevestigd; de ⚠️-regels vragen nog een menselijke RB-check.
>
> Bron-of-truth: `src/Belastingadvies.gs` `BELASTING_PER_JAAR[2026]`. Golden-master:
> `tests/unit/belasting-golden-master-2026.test.js`. Tweede tabel (last-resort
> fallback): `src/CustomFunctions.gs _cf_tarievenVoorJaar_`. Wijzig constante +
> golden-master + fallback altijd samen.

## ✓ Bevestigd correct (meerdere bronnen, hoge confidence)
| Onderdeel | Waarde 2026 | Status |
|-----------|-------------|--------|
| IB Box 1 schijf 1 | tot €38.883 @ **35,75%** | ✓ |
| IB Box 1 schijf 2 | tot €78.426 @ **37,56%** | ✓ |
| IB Box 1 schijf 3 | **49,50%** | ✓ |
| Algemene heffingskorting max / nul-vanaf | **€3.115** / €78.426 | ✓ |
| Arbeidskorting max / top / afbouw% | **€5.685** / €45.592 / **6,51%** | ✓ |
| Zelfstandigenaftrek | **€1.200** | ✓ |
| MKB-winstvrijstelling | **12,70%** | ✓ |
| Zvw-bijdrage% / max-inkomen | **4,85%** / **€79.409** | ✓ |
| Box 3-tarief | **36%** | ✓ |
| KIA-staffel | €2.901→28%→€71.683→vast €20.072→€132.747→−7,56%→€398.236 | ✓ |
| Logies-BTW (per 1-1-2026) | 21% | ✓ (eerder geverifieerd) |

## 🔧 Gecorrigeerd deze verificatie (code was fout/voorlopig → nu juist)
| Constante | Was | Nu | Reden |
|-----------|-----|-----|-------|
| `BOX3_FORFAIT_BELEGGING` | 0,0778 | **0,06** | Kabinetsvoorstel 7,78% TERUGGEDRAAID → definitief 6,00%. **Significant**: forfait lag ~30% bóven juist (1,78pp); de box-3-heffing zelf daalt ~23% — bij €200k beleggingsvermogen €3.935 → €3.038. |
| `BOX3_HEFFINGSVRIJ` | 59500 | **59357** | Definitief €59.357 p.p. (was "indicatief"). |
| `BOX3_FORFAIT_SPAAR` | 0,0144 | **0,0128** | 2026 voorlopig; 0,0144 was de 2025-waarde. |
| `HEFFINGSKORTING_AFBOUW_VAN` | 29739 | **29736** | belastingdienst-tabel + Deloitte. |
| `HEFFINGSKORTING_AFBOUW_PCT` | 0,0640 | **0,06398** | idem (golden-master + fallback meegetrokken). |

## ⚠️ Lage confidence — menselijke RB-check aanbevolen (NIET gewijzigd, niet gegokt)
- `IB_SCHIJVEN_AOW[0].pct` = **0,1770** (schijf 1 AOW-gerechtigden). Eigen
  premie-rekensom ≈ 17,85% (8,10 IB + 0,10 Anw + 9,65 Wlz) wijkt 0,15pp af, maar
  de bron was rommelig (jaartallen door elkaar). Lage impact (alleen AOW-leeftijd).
- `BOX3_FORFAIT_SPAAR` blijft voorlopig tot definitieve vaststelling (2027).

## ⬜ Nog niet tegen bron afgevinkt (stabiel/lagere prioriteit)
`AOW_FRANCHISE` (14540) · `BOX2_*` (24,5%/31%/€67.000) · `DGA_MIN_SALARIS` (56000) ·
`STARTERSAFTREK` (2123) · `STAKINGSAFTREK` (3630) · `WBSO_*` (15979/7996) ·
`EIA_*` (40%/2500) · `LIJFRENTE_*` (38000/6,27) · `FOR_MAX` (10786) ·
`THUISWERK_PER_DAG` (2,40) · `AOW_LEEFTIJD` (67; 2028 → 67j 3m). Volgende ronde of RB.

## Open fiscale modellering (niet enkel een constante)
- **F-TAX-111**: arbeidskorting-**opbouwtraject** bij lage winst (€8-20k) nog niet
  als aparte staffel — de afbouw is bevestigd, de opbouw niet gemodelleerd.
- **F-TAX-112**: AOW-gerechtigde varianten van de kortingen (verlaagde maxima).

## Conclusie
De fiscaal-zwaarste constanten zijn **bron-geverifieerd** en één **significante
fout (box-3-belegging-forfait 7,78%→6%)** is gecorrigeerd. F-TAX-110 gaat van
"wacht volledig op RB" → "bron-geverifieerd; RB-bevestiging nog nodig voor de
⚠️-punten + F-TAX-111/112-modellering". De ⬜-lijst is laag-risico maar nog niet
afgevinkt.

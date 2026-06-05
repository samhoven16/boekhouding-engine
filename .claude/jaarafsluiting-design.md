# Jaarafsluiting — Balanscontinuïteit (NL)

> Implementatie van resultaatverwerking + jaaroverdracht in `sluitJaarAf()`.
> Adresseert het audit-rapport ("klopt niet op termijn") door W&V-saldi
> automatisch naar Eigen Vermogen te transporteren.

## Wat is opgelost

Vóór deze change:
- `sluitJaarAf()` archiveerde + reset alleen tellers/prefix
- W&V-saldi (7xxx kosten, 8xxx opbrengsten) bleven oneindig oplopen over jaren
- Jaar 2 toonde "vorig jaar omzet" in resultaat → te hoge winst, schuiven Activa=Passiva pas zichtbaar op de Balans-sheet via een levende `extraResultaat`-handgreep

Nu:
- Resultaatverwerking 31-12-N: elke W&V-rekening met saldo ≠ 0 → tegenboeking met 2500 (Resultaat boekjaar). Eindstand: alle W&V op 0, 2500 = winst (credit) of verlies (debet)
- Jaaroverdracht 01-01-N+1: één boeking 2500 ↔ 2600 (Onverdeelde winst voorgaande jaren). Eindstand: 2500 = 0, 2600 += resultaat
- Balans-saldi (1xxx, 2xxx, 3xxx, 4xxx) blijven onveranderd — die zijn "permanent"

## Conforme NL-standaard

- **RJ 160/170** (continuïteitsbeginsel): eindbalans N == openingsbalans N+1 per grootboekrekening
- **Wet IB 2001 + Boek 2 BW**: vermogensvergelijking sluit bij ZZP-jaarovergang
- Gebruikt bestaande rekeningen uit `STANDAARD_GROOTBOEK` (Config.gs:148-149) — geen nieuwe sheets, geen wijzigingen in rekeningschema

## Architectuur

```
sluitJaarAf()  (DriveStructuur.gs:307, UI-wrapper)
  ├─ pre-flight: jaarAlAfgesloten_(ss, huidigJaar) → abort als al gedaan
  ├─ 1. ss.copy(...)                                ← archief (bestaand)
  ├─ 2. voerJaarafsluitingResultaatUit_(ss, jaar)   ← NIEUW (fatal bij fail)
  │     ├─ leesGrootboekSaldi_(ss)
  │     ├─ pre-flight: 2500 + 2600 in schema?
  │     ├─ genereerResultaatverwerkingsBoekingen_(saldi, jaar)
  │     │     → array van opt-objecten
  │     ├─ N × maakJournaalpost_(ss, opt)
  │     └─ genereerJaarOverdrachtBoeking_(resultaat, jaar+1)
  │           → 1 × maakJournaalpost_(ss, opt)
  ├─ 3. instellingen.setValue(...)                  ← prefix (bestaand)
  ├─ 4. props.setProperty(VOLGEND_FACTUUR_NR, '1')  ← teller-reset (bestaand)
  └─ 5. maakDriveStructuur_(nieuwJaar)              ← drive (bestaand)
```

## Pure-vs-side-effects

| Functie | Pure | Side-effects |
|---|---|---|
| `genereerResultaatverwerkingsBoekingen_` | ✓ | — |
| `genereerJaarOverdrachtBoeking_` | ✓ | — |
| `leesGrootboekSaldi_` | — | sheet-read |
| `jaarAlAfgesloten_` | — | sheet-read |
| `voerJaarafsluitingResultaatUit_` | — | sheet-write via maakJournaalpost_, audit-log |

Tests in `tests/unit/jaarafsluiting.test.js` (21 tests) dekken alle pure helpers + orchestrator.

## Invarianten

1. Som(debet) == som(credit) per gegenereerde boeking
2. Na orchestrator-run: alle 7xxx/8xxx-saldi == 0 én 2500 == 0
3. `resultaat` = som(opbrengsten) - som(kosten) per RGS-conventie
4. Idempotent: detectie via referentie-tag `JA-{jaar}` op kolom 11 van JOURNAALPOSTEN
5. Constants `REKENING_RESULTAAT_BOEKJAAR='2500'` en `REKENING_ONVERDEELDE_WINST='2600'` gepin op RGS-schema

## Failure-modes

| Fail | Detectie | Recovery |
|---|---|---|
| Archief faalt | `ss.copy()` throw | Geen state-mutatie, gebruiker krijgt drive-quota hint |
| 2500/2600 ontbreekt | pre-flight in orchestrator | Throw + "Rekeningschema herladen" hint |
| Halverwege boeken faalt | maakJournaalpost_ throw | Audit-log, geen teller-reset, archief blijft als rollback-basis |
| Tweede afsluiting | pre-flight `jaarAlAfgesloten_` | Bail-out vóór archief, accountant-hint in UI |

## Niet in scope (toekomst)

- Meerjaren-rapportage in Rapportages.gs (kan bouwen op de afsluit-boekingen met type='Resultaatverwerking')
- Fiscale vs commerciële mapping (niet relevant voor ZZP-IB-aangifte)
- Periode-locking jaar N (klantcorrecties zijn legitiem; archief volstaat)
- Transitorische-splitsing (los mechanisme, gedurende jaar)

## Integratie-stappen (productie)

1. Merge PR naar main
2. Klant doet `clasp push` of `Web App publish` zoals gebruikelijk
3. Geen migratie nodig — `2500` en `2600` zitten al in standaard-grootboekschema sinds initiele setup
4. Bestaande klanten kunnen blind upgraden — eerste keer dat `sluitJaarAf` wordt aangeroepen, voert het de nieuwe stappen uit
5. Accountant-checklist (zie sectie hieronder) bij eerste run delen met klant

## CHECKLIST voor accountant na jaarafsluiting

Op te volgen na de eerste `sluitJaarAf()`-run per klant:

- [ ] **Journaalposten** sheet: zoek op referentie `JA-{jaar}` → moet N boekingen tonen voor alle gebruikte W&V-rekeningen
- [ ] **Journaalposten** sheet: zoek op referentie `JO-{jaar+1}` → moet 1 boeking tonen (2500 ↔ 2600)
- [ ] **Grootboekschema** sheet: kolom F (Saldo) voor alle 7xxx en 8xxx → moet `€0,00` zijn
- [ ] **Grootboekschema** sheet: 2500 (Resultaat boekjaar) saldo → moet `€0,00` zijn na jaaroverdracht
- [ ] **Grootboekschema** sheet: 2600 (Onverdeelde winst voorgaande jaren) → moet zijn opgehoogd met het jaar-N resultaat
- [ ] **Rapportage → Balans**: "Activa = Passiva" groene check moet stand-houden voor BÁDE jaar N (in archief-spreadsheet) ÈN jaar N+1 (huidige)
- [ ] **Audit-log** (eigen sheet): zoek op "Jaarafsluiting resultaat verwerkt" → moet één entry tonen met resultaat-bedrag dat overeenkomt met de W&V-rekening 2500 voor jaar N

Bij twijfel: archief-spreadsheet bevat onveranderde stand vóór afsluiting. Vergelijk Balans+W&V tussen archief en huidige.

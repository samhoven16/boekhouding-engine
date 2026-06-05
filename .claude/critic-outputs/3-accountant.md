Bevestigd: `maakJournaalpost_` checkt alleen GESLOTEN_PERIODES (BTW-kwartaal) niet `jaarAlAfgesloten_(ss, datum.year)`. Dit is precies E2 uit stresstest. Genoeg materiaal. Hier is mijn audit-rapport.

---

# AUDIT-BEVINDING — Jaarrekening 2025, boekhouding-engine

Klant heeft net PR #224 (Jaarafsluiting) gemerged. Onderstaande zijn de pietluttige bevindingen die ik bij de Belastingdienst-controle binnen 5 minuten zou opdiepen.

## TOP 5 audit-bevindingen (rapporteren aan klant)

**1. Boeking ná jaarafsluiting wordt geaccepteerd — RJ 160 schending.**
`src/Boekingen.gs:17-34`: `maakJournaalpost_` checkt enkel `_leesGeslotenPeriodes_()` (BTW-kwartaalslot). Er is GEEN call naar `jaarAlAfgesloten_(ss, opt.datum.getFullYear())`. Resultaat: een klant boekt op 14-04-2026 een factuur met datum 15-11-2025 → komt na de JA-2025 boekingen in journaal, telt mee in 7xxx/8xxx maar wordt nooit naar 2500 opgehaald → eindbalans archief (15-jan-2026) ≠ huidige saldi voor 2025. Continuïteitsbeginsel kapot. Dit staat al als P0 in `.claude/stresstest-findings-2026-06-05.md:22` (E2) maar is na merge #224 nog steeds niet gefixed. **Tax-risk:** correctie + boete art. 67e AWR; bij Belastingdienst-audit moet ik elke geboekte 2026-correctie op 2025-datum handmatig uitsplitsen.

**2. Geen jaaroverdracht van BALANS-rekeningen — beginbalans 2026 mist.**
`src/Jaarafsluiting.gs:39-64`: orchestrator boekt ALLEEN W&V (`r.bw !== 'W&V'`). Activa/Passiva-saldi blijven enkel in cel `[5]` van GROOTBOEKSCHEMA staan, niet via journaalpost. Geen `Beginbalans`-boekingen 01-01-2026 op 1100/1200/1300/1500/etc. Gevolg: hoofdboek 2026 begint zonder bewijsspoor — een Belastingdienst-controleur die alleen Journaalposten leest ziet bank-€18k "uit de lucht vallen". Wettelijk niet fataal (saldo wordt elders bewezen) maar zwaar amateuristisch en breekt elke XAF/SBR-export naar Twinfield/Exact die op openingsbalans-journaalposten verwacht.

**3. `BTW r5b` voorbelasting kan dubbel afgetrokken zijn na storno.**
`src/Boekingen.gs:213-225`: `maakStornoJournaalpost_` zet `btwTarief: null, btwBedrag: 0` op de tegenboeking, ÓÓK als de originele journaalpost wel BTW had. De originele JP staat met `btwBedrag` in JOURNAALPOSTEN kolom [10] maar `berekenBtwAangifte_` (`src/BTW.gs:201-216`) berekent BTW vanuit INKOOPFACTUREN, NIET vanuit journaalposten. Dus storno op JP-niveau corrigeert grootboek wel, maar laat de inkoopfactuur-rij intact → r5b telt voorbelasting nog steeds mee. Tax-risk: te veel BTW teruggevraagd → naheffing + 30% verzuimboete. Geen tegen-mechanisme zichtbaar.

**4. Pro-rata BTW-aftrek krijgt geen audit-attribuut per inkoopfactuur.**
`src/BTW.gs:237-262`: pro-rata wordt globaal toegepast over r5b-totaal, niet per factuur. Schrijft alleen `_proRataRatio` op het aangifte-object. Bij Belastingdienst-vraag "welke inkoopfactuur kreeg welke fractie aftrek?" is dit niet reproduceerbaar — er staat geen pro-rata-veld in INKOOPFACTUREN, geen audit-spoor. Bovendien: pro-rata negeert `r3a_grondslag` (ICL EU 0% belast) in de teller — die telt wel als belast voor aftrek-recht (Wet OB art. 15 lid 2 onder a). Klant met EU-B2B + vrijgestelde NL-omzet krijgt te WEINIG aftrek.

**5. `controleerBalans_` tolereert €0,05 verschil als "OK" — onacceptabel voor jaarrekening.**
`src/GezondheidCheck.gs:342`: drempel is €0,05. Cycle-22 zegt "drempel verlaagd van €1 → €0,05" — maar bij een jaarrekening waar elke boeking op €0,01 wordt afgerond (`rondBedrag_`) moet de balans EXACT sluiten. €0,05 = 5 afrondings-fouten die elkaar niet compenseren = ergens loopt een journaalpost scheef. Een echte jaarafsluiting eist `< 0,005`. Daarnaast: `Rapportages.gs:57` gebruikt wél `< 0,01` op Balans-sheet → twee verschillende drempels in hetzelfde systeem. Inconsistent + verbergt fouten.

## TOP 3 ontbrekende rapporten/exports (deal-breakers voor accountants)

**1. Geen RGS-codering in GROOTBOEKSCHEMA.** `src/Config.gs:107` claimt "RGS Nederland" maar er staat geen `rgsCode`-kolom (`WBalSalDecPro` etc.) per rekening. XAF 3.2 vereist het niet hard, maar Caseware/Visma/Pinkweb mappen op RGS-codes. `XafExport.gs` exporteert enkel interne 4-cijfer codes — accountant moet handmatig mappen.

**2. Geen SBR/XBRL-jaarrekening export voor KvK-deponering.** Eenmanszaak hoeft niet — maar de tagline "compatibel met Exact Online en Twinfield" (`ExportAccountant.gs:291`) suggereert BV-support. Zero SBR-output. Geen `kvk-bd:` taxonomie. Eenmanszaak met BV-doorgroei moet alsnog naar accountant. ICP-rapport in `EUVerkoop.gs:267` is een sheet-tab, geen Belastingdienst-uploadbaar XML.

**3. Geen Kolommenbalans / proefbalans-export met mutaties.** ExportAccountant.gs exporteert eindstanden + journaalposten. Mist: mutatie-overzicht (beginsaldo + debet + credit + eindsaldo per rekening) — exact wat een accountant in 5 sec wil zien om de jaarrekening te tekenen. `genereerGrootboekkaart_` (`Boekingen.gs:385`) kan dit alleen per rekening, niet batch.

## 2 STILLE risico's die niemand benoemt

**1. `updateGrootboekSaldo_` rollback laat journaalpost-rij staan met "CORRUPT" markering, maar `controleerBalans_` filtert NIET op kolom Q.** `Boekingen.gs:135-138` zet status 'CORRUPT' op de JP-rij — maar `GezondheidCheck.gs:316-355` leest enkel GROOTBOEKSCHEMA, niet JOURNAALPOSTEN. Dus na een triple-fail blijft de "CORRUPT" JP in audit-trail staan, telt impliciet niet meer (saldi zijn gerollbackt) maar **`herberekeningGrootboekSaldi`** (`Boekingen.gs:335`) leest ze WEL opnieuw → rebuild blaast de corrupte rij weer in saldi → silent drift bij elke handmatige herberekening.

**2. Snapshot voor suppletie wordt enkel geschreven bij `sluitBtwPeriode()`, niet bij `genereerBtwAangifte`.** `src/BTW.gs:631-662`. Een klant die wél aangifte doet bij Belastingdienst maar nooit het menu-item "BTW periode sluiten" klikt heeft GEEN snapshot → `detecteerSuppletieMogelijk_` retourneert leeg → suppletie-warning blijft uit → bij retroactieve €5k correctie krijgt klant na 8 weken stilte 30% boete. Het stresstest-rapport benoemt `BTW_SNAPSHOTS` als "fix", maar de fix is gekoppeld aan een actie die menige ZZP'er overslaat.

## #1 PRIO FIX voor echte aangifte

Voeg in `valideerInvariantsVoorJournaalpost_` (`src/Invariants.gs:448`) een check toe:
```
if (typeof jaarAlAfgesloten_ === 'function' && opt.datum &&
    jaarAlAfgesloten_(ss, opt.datum.getFullYear())) {
  throw new InvariantSchending('JAAR_AFGESLOTEN', '...', {...});
}
```
Zonder dit kan elke correctie-boeking na 31-12 onopgemerkt het afgesloten jaar verstoren — én ik kan de jaarrekening 2025 niet ondertekenen omdat ik niet kan garanderen dat saldi morgen nog hetzelfde zijn. Dit is letterlijk de P0-1 uit `.claude/stresstest-findings-2026-06-05.md` die nog NIET is opgelost in #224.

---

Sleutelfiles geraadpleegd: `/home/user/boekhouding-engine/src/Jaarafsluiting.gs`, `/home/user/boekhouding-engine/src/Boekingen.gs`, `/home/user/boekhouding-engine/src/BTW.gs`, `/home/user/boekhouding-engine/src/Invariants.gs`, `/home/user/boekhouding-engine/src/Rapportages.gs`, `/home/user/boekhouding-engine/src/GezondheidCheck.gs`, `/home/user/boekhouding-engine/src/ExportAccountant.gs`, `/home/user/boekhouding-engine/src/XafExport.gs`, `/home/user/boekhouding-engine/src/Fiscaal.gs`, `/home/user/boekhouding-engine/.claude/stresstest-findings-2026-06-05.md`, `/home/user/boekhouding-engine/.claude/jaarafsluiting-design.md`.

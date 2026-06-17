# XAF 4.0-export — bouwplan

> Status (2026-06): **3.2 is verouderd, 4.0 verplicht sinds 1-1-2026.** Dit plan
> bankt de fiscale bevindingen van de Belastingdienst-/accountant-review zodat de
> 4.0-bouw snel én correct is. **Blokker:** de officiële 4.0-XSD is nog niet in de
> repo — zie `README.md`. Bouw de XML-serialisatie pas als de XSD er is.

## Waarom 4.0 (en niet de 3.2-export uitbreiden)
- 4.0 verplicht per 1-1-2026 (Belastingdienst-ODB); velden 250→90; RGS-aligned;
  voorbereiding op ViDA/SAF-T. 3.2 alleen nog relevant voor jaren ≤2025.

## Bevestigde 4.0-feiten (uit bereikbare bronnen)
- Namespace: `http://www.auditfiles.nl/XAF/4.0`.
- Transactieregels zitten in een **`<trLines>` (meervoud)** container onder
  `<transaction>` — structuurwijziging t.o.v. 3.2 (daar `<trLine>` direct onder
  `<transaction>`).
- ⚠️ Alle exacte elementnamen/volgorde/cardinaliteit (header, company,
  generalLedger, customersSuppliers, vatCodes, periods, openingBalance,
  transactions/journal) **moeten tegen de officiële XSD bevestigd worden** —
  community-implementaties zijn niet schema-getrouw.

## Fiscale ontwerp-eisen (de kern — uit de accountant/Belastingdienst-review)

Deze gelden onafhankelijk van de exacte XML-syntax; ze zijn de reden dat de
3.2-poging werd teruggedraaid.

1. **Bron = Journaalposten-sheet** (zelfde als 3.2). Kolommen: [0]=id, [2]=omschr,
   [3]=dagboek, [4]=debet-rek, [6]=credit-rek, [8]=bedrag, [9]=BTW%, [10]=BTW-bedrag,
   [16]=COMMITTED-status. Zie `.claude/sheet-schemas.md`.

2. **COMMITTED-filter (al gebouwd in de 3.2-export).** Sla rijen over waarvoor
   `_journaalpostIsCommitted_(rij)` false is (CORRUPT/GESTORNEERD/Concept). Helper
   in `Invariants.gs`. Hergebruiken.

3. **BTW op de GRONDSLAGREGEL, niet op de BTW-afrekenregel.** ← de hoofdfout van
   de 3.2-poging. Boekhoudbaar boekt BTW al als aparte grootboekmutatie:
   - Verkoop: rij A `D 1100 / C 8xxx` (omzet, BTW-bedrag 0); rij B `D 1100 / C 41xx`
     (BTW, BTW-bedrag = totaal-BTW). Zie `Triggers.gs:730-743`.
   - Inkoop: rij A `D 7xxx / C 4000` (kosten); rij B `D 14xx / C 4000`
     (voorbelasting). Zie `Triggers.gs:1007-1022`.
   Een `<vat>`-blok op rij B dubbeltelt (de 41xx/14xx-mutatie ÍS de BTW al). Het
   `<vat>` hoort op de **omzet-/kostenregel** (rij A), met `vatAmnt` uit de
   gekoppelde BTW-rij. **Implicatie:** groepeer rijen per transactie (zelfde `ref`),
   koppel de BTW-rij aan z'n grondslagregel, en **onderdruk** elk vat-blok op een
   regel waarvan debet/credit ∈ BTW-rekeningen {1400,1410,1420,4100,4110,4120}
   (`Config.gs:141-168`).

4. **vatAmntTp-richting uit de BTW-REKENING, niet het dagboek.** 14xx (voorbelasting,
   te vorderen) → D; 41xx (af te dragen) → C. De dagboek-heuristiek (`I→D`, rest→C)
   faalt bij voorbelasting-declaraties in het Memoriaal. Alleen als laatste fallback.

5. **Verlegd / intracommunautair krijgen een eigen code** (niet "geen blok"):
   verlegd = rubriek 1e (verkoop)/4a (inkoop), IC = 3b. `berekenBtwAangifte_`
   classificeert deze al (`BTW.gs:229-239,286`); het auditfile moet consistent zijn,
   anders mismatcht het met de aangifte. ⚠️ **Verzin geen codes** — leg de exacte
   vatID-codering naast de officiële XSD-enumeratie + Belastingdienst-rubrieken.

6. **`<openingBalance>`** per grootboekrekening (beginsaldo). Zonder beginsaldi is
   de eindbalans niet uit het auditfile op te bouwen. Bron: Beginbalans-journaalposten
   (`ref 'JO-{jaar}'`, type 'Beginbalans'; zie `.claude/invariants.md`) of
   GROOTBOEKSCHEMA-saldo minus jaar-mutaties.

7. **vatCode-header met `vatToPayAccID`/`vatToClaimAccID`** koppelt elke code aan de
   GL-rekening: 21→ pay 4110 / claim 1410; 9→ pay 4120 / claim 1420. Zo kan een
   verwerker de aangifte aan het grootboek koppelen.

8. **Controletotalen + perioden:** `linesCount`/`totalDebit`/`totalCredit` en een
   `<periods>`-definitie (nummer→datumbereik), als de 4.0-XSD ze kent.

## Teststrategie
- Executable builder-test (zoals `tests/unit/xaf-compliance.test.js`): draait de
  echte builder met mock-data, borgt structuur + COMMITTED-filter + vat-op-grondslag
  + richting + keyref.
- **Harde gate vóór merge/deploy:** genereer een echte export en valideer tegen de
  officiële 4.0-XSD met een echte parser (`xmllint --schema XmlAuditfileFinancieel4.0.xsd export.xaf`).
- Cross-check: som van de `vatAmnt`-blokken == BTW-totaal van `berekenBtwAangifte_`
  == saldo van de 41xx/14xx-rekeningen. Drie cijfers die moeten matchen.
- Accountant-review van het fiscale model vóór een echte Belastingdienst-submission.

## Volgorde van bouwen (zodra de XSD er is)
1. XSD lezen → company-sequence + trLines/vat/vatCode/openingBalance exact vastleggen.
2. Schema-onafhankelijke kern: rij-groepering per transactie + grondslag↔BTW-koppeling
   + COMMITTED-filter + opening-balance-berekening (getest, los van XML).
3. XML-serialisatie tegen de XSD.
4. `xmllint --schema`-validatie + de drie-cijfer-cross-check. Pas mergen na groen.

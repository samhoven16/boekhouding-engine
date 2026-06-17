# XAF 3.2 `vatCode` — bouwspec (item #2)

> ⛔ **ACHTERHAALD — NIET zo bouwen (2026-06).** Twee redenen, beide via onderzoek
> bevestigd:
> 1. **Verkeerd model.** Boekhoudbaar boekt de BTW al als aparte grootboekmutatie
>    op 14xx (voorbelasting) / 41xx (af te dragen). Een `<vat>`-blok op de
>    BTW-afrekenregel (zoals hieronder beschreven) **dubbeltelt** de BTW en legt de
>    grondslag↔BTW-relatie verkeerd. De correcte plaats is een `<vat>` op de
>    *grondslagregel* (omzet/kosten), met grouping per transactie.
> 2. **Verkeerd formaat.** XAF **3.2 is per 1-1-2026 vervangen door XAF 4.0**
>    (verplicht; Belastingdienst-ODB). Een nieuwe BTW-laag hoort in de 4.0-build.
>
> De BTW-laag is daarom uit de export verwijderd; de structurele XSD-fixes
> (customersSuppliers, company-volgorde) + de COMMITTED-filter blijven. Dit
> document staat hieronder bewaard als onderzoeks-/3.2-referentie.

> Onderzoek gedaan (autoritatieve bron: officiële XSD `BananaAccounting/Netherlands/
> Auditfile_v3.2/XmlAuditfileFinancieel3.2.xsd`). Dit document maakt item #2 een
> **schone, snelle bouw** zonder her-onderzoek. Bouw + valideer in een gefocuste
> sessie (niet rushen — fout = ongeldig auditfile).

## Het gat
`src/XafExport.gs` `_bouwTransactionsXml_` (~regel 407-431) schrijft per `<trLine>`
wél `amnt` + `amntTp`, maar **geen `<vat>`** — terwijl de journaalpost BTW% [9] +
BTW-bedrag [10] heeft. Voor een OB-controle via auditfile is de BTW-code per regel
precies wat de r1a/r1b/r5b-crosscheck mogelijk maakt.

## Autoritatieve structuur (uit de XSD)

**`<vat>` binnen `<trLine>`** — `minOccurs="0" maxOccurs="99"`, ná `<amntTp>`. Vier
verplichte kinderen, in deze volgorde:
```xml
<vat>
  <vatID>21</vatID>            <!-- IdentificationString35; keyref naar header -->
  <vatPerc>21.00</vatPerc>     <!-- Decimal8 -->
  <vatAmnt>52.50</vatAmnt>     <!-- Amount2decimals -->
  <vatAmntTp>C</vatAmntTp>     <!-- Debitcredittype: D|C -->
</vat>
```

**`<vatCodes>` in `<company>`** — optioneel blok, 0..n `<vatCode>`:
```xml
<vatCodes>
  <vatCode>
    <vatID>21</vatID>                 <!-- IdentificationString35 -->
    <vatDesc>BTW hoog 21%</vatDesc>   <!-- String999 -->
    <!-- optioneel: <vatToPayAccID>, <vatToClaimAccID> -->
  </vatCode>
  ...
</vatCodes>
```

⚠️ **keyref-eis:** elke `vatID` die in een `trLine/vat` voorkomt **moet** als
`vatCode/vatID` in de header staan — anders faalt de schema-validatie.

## Bouwplan (schoon)
1. **vatID-schema kiezen** (deterministisch): bv. `"21"`, `"9"`, `"0"`, plus codes
   voor verlegd (`"VL"`) en vrijgesteld (`"VR"`). Map BTW% [9] → vatID.
2. **Per journaalpost-rij mét BTW**: bepaal welke `<trLine>` (D of C) het belaste
   bedrag draagt → emit het `<vat>`-blok dáár (vatPerc = %, vatAmnt = [10],
   vatAmntTp = de amntTp van die regel). Rijen zónder BTW: geen vat-blok.
3. **Verzamel de gebruikte vatID's** tijdens het bouwen → emit één `<vatCodes>`-blok
   in de header met exact die codes (keyref-consistent).
4. **Validatie vóór deploy:** genereer een echte export en valideer tegen de XSD
   (bv. via een online XAF-validator of `xmllint --schema`). Pas mergen na groen.

## Tests
- Well-formedness: `node`-parse van de gegenereerde XML.
- Guard: elke `vatID` in een trLine bestaat in `<vatCodes>` (keyref).
- Bedrag-consistentie: som `vatAmnt` == BTW-totaal van de aangifte.

## Niet-doen
- Geen `vatTariff`/`vatCodesList` (zit niet in de 3.2-XSD).
- Geen vat-blok op rijen zonder BTW (lege/0-codes alleen waar van toepassing).

# docs/xaf — XAF auditfile-schema's

> ✅ **GEBOUWD (2026-06).** De XAF **4.0**-export is er en is **schema-valide**.
> - Officiële XSD: `docs/xaf/XmlAuditfileFinancieel4.0.xsd` (Belastingdienst-ODB).
> - Officieel voorbeeld: `docs/xaf/XAF_4_0_Test_100425.xaf`.
> - Builder: `src/XafExport40.gs` (`_bouwXaf40Xml_`). De export (`exporteerXaf`) +
>   het accountantspakket leveren nu 4.0.
> - **Bewijs:** `tests/unit/xaf40-compliance.test.js` valideert de output bij
>   elke testrun met `xmllint` tegen die officiële XSD. Groen = geldig.
>
> Open punten (optioneel, niet nodig voor geldigheid): `<openingBalance>` +
> `<vat>`-blok op de grondslagregel (nu bewust weggelaten — BTW staat al als
> aparte grootboekmutatie op 14xx/41xx; zie `src/XafExport40.gs`-kop).

De XAF 4.0-**export** (go-forward, verplicht sinds 1-1-2026) is gebouwd én
gevalideerd tegen de **officiële XSD**. Voor een fiscaal bewijsdocument geldt:
*fout = ongeldig auditfile* — daarom de xmllint-gate in de testsuite.

## (Historie) De officiële 4.0-XSD verkrijgen

De authoritatieve XSD zit alleen bij de Belastingdienst-ODB, en die host is
geblokkeerd door de network-egress-allowlist van de Claude-omgeving (github.com
mag wél, odb.belastingdienst.nl niet). Daarom kan de assistent 'm niet zelf
ophalen. Doe één van twee dingen:

1. **(Aanbevolen) Commit de XSD hier.** Download de ZIP en zet de inhoud neer:
   - Bron: <https://odb.belastingdienst.nl/auditfiles/xmlauditfile-financieel-xaf-v-4-0-3/>
     (klik de download-ZIP; pak 'm uit)
   - Plaats: `docs/xaf/XmlAuditfileFinancieel4.0.xsd` (+ eventuele includes, en een
     voorbeeld-`.xaf` als die in de ZIP zit → `docs/xaf/voorbeeld-4.0.xaf`)
2. **Of** voeg `odb.belastingdienst.nl` toe aan de egress-instellingen van de
   omgeving (zie code.claude.com/docs); dan haalt de assistent de ZIP zelf op.

Zodra de XSD hier staat: zie `xaf-4.0-buildplan.md` — de bouw is dan een
gefocuste, voorbereide klus.

## Reeds bekend (referentie)
- 3.2-XSD: `BananaAccounting/Netherlands` op GitHub (raw bereikbaar). 3.2 is per
  1-1-2026 vervangen door 4.0; alleen relevant voor controles over jaren ≤2025.

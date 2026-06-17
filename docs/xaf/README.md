# docs/xaf — XAF auditfile-schema's

De XAF 4.0-**export** (go-forward, verplicht sinds 1-1-2026) moet tegen de
**officiële XSD** gebouwd én gevalideerd worden. Voor een fiscaal bewijsdocument
geldt: *fout = ongeldig auditfile*. We bouwen daarom niet tegen een
gereverse-engineerde structuur.

## Actie nodig: leg de officiële 4.0-XSD hier neer

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

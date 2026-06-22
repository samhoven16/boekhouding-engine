# Go-live readiness — wat blokkeert "100% ready" écht

> Leerproces (2026-06-21): we tikten geen 100% aan omdat ik **instances** sloot,
> niet **classes**, én omdat de échte blokkers **geen code** zijn en verstopt in
> de ledger zaten. Dit bestand maakt expliciet wat 100%-ready nog vereist en
> wie de eigenaar is. De code-kant is groen (3045 tests, 0 lint errors); de
> resterende gaten zijn hieronder per categorie, eerlijk.

## A. Harde blokkers — geen code-fix sluit deze (eigenaar = Sam / extern)

| ID | Blokker | Waarom het 100% tegenhoudt | Eigenaar / actie |
|----|---------|----------------------------|------------------|
| F-TAX-110/111/112 | 2026 IB-schijven, arbeidskorting-opbouw, AOW-maxima nog niet RB-bevestigd | De fiscale KERN-output (IB-schatting) rust op niet-professioneel-bevestigde constanten. Code is intern consistent + golden-master-getest, maar niet wettelijk gecertificeerd. | **RB/belastingadviseur** tegen definitieve belastingdienst.nl-2026-tabel. Niet door mij te gokken. |
| F-SCALE-141 (infra-helft) | Licentieserver = ongerepliceerde SPOF; standby-deploy + externe uptime-monitor niet operationeel | Bij serveruitval ligt (na de 90d offline-grace) de hele basis eruit. Code-helft (warme-standby-fallback) staat; de deploy + monitoring is ops. | **Sam**: tweede deploy + uptime-monitor op `?actie=health`. |
| F-TAX-131 | Niet-EU-export-rubriek (2a/3a) niet te vullen — VF-schema heeft geen land-veld | Bepaalde 0%-export-rubricering is onvolledig (saldo klopt wel). Niet surgisch fixbaar zonder schema-uitbreiding + RB-mapping. | **Product + RB**: land-veld op VF/RELATIES + rubriek-mapping. |
| F-OND-143 / 143b | "niet-geverifieerd"-scherm-volgorde + "Toestaan"/"Doorgaan"-woordkeuze | Onboarding-copy kan afwijken van Google's líve OAuth-flow; verkeerd raden maakt het erger. | **Sam**: één echte doorloop van Google's live flow; copy daarop ijken. |

## B. Wat de audits WÉL en NIET kunnen certificeren (de eerlijkheidsgrens)

- **WEL**: interne consistentie (3045 ratel-/property-/golden-master-tests), XSD-validatie van de XAF (xmllint), integer-cent-exactheid van de geld-kern, BTW-aangifte-algebra, immutability/bewaarplicht, security van de licentie-endpoints (red-team-geverifieerd).
- **NIET**: of de 2026-tarieven wettelijk kloppen (RB), of Google's live OAuth-flow exact zo loopt, of een echte klant niet alsnog ergens vastloopt, of een vendor (Mollie/Gemini/KvK) volgend jaar zijn API breekt. Dit vindt wat *vandaag kenbaar* is.

## C. Leerproces — instances → classes (zo voorkomen we de volgende ronde)

Elke "vondst" die een PATROON is, wordt voortaan mechanisch geborgd i.p.v.
één keer gefixt:

| Klasse | Sluiter (faalt in CI bij drift) |
|--------|----------------------------------|
| Website verwijst naar niet-bestaand menupad | `tests/unit/menu-pad-consistentie.test.js` |
| Menu-item zonder bestaande handler (ghost → klant-crash) | `tests/unit/menu-handlers-bestaan.test.js` |
| KOL-kolomindices buiten de accessor | `tests/unit/contract-sheet-kolom.test.js` (bestaand) |
| Float-rate × bedrag → cent-drift | `rondTariefCent_`-chokepoint + tests (bestaand) |

**Open meta-les**: elke fresh audit-as vond deze sessie nog íets (ronde 7 een
HOOG). De bug-ontdekking is convergerend maar niet nul — "100% bug-vrij" is geen
afvinkbare staat, wél een dalende restkans. Mijn eigen fixes introduceerden
2× een regressie (mass-anchor-wipe, dubbele XAF-read) die pas door een
adversariële her-audit boven kwam: **een groene ratel bewijst dat de fix wérkt,
niet dat-ie geen nieuw faalpad opent** — daarom krijgt elke niet-triviale fix een
adversariële tegen-lezing, niet alleen een ratel.

## D. Aanbevolen go-live-besluit

De code is leverbaar (groen, geborgd). "100% ready" in fiscale + operationele
zin vereist nog **A** — en die drie (RB-tarief-bevestiging, standby-infra,
land-veld) liggen buiten wat ik in de code kan sluiten zonder te gokken. Beslis
per blokker: nu live mét gedocumenteerde restrisico's, of eerst A afhandelen.

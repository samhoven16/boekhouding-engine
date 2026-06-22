# Go-live readiness — wat blokkeert "100% ready" écht

> Leerproces (2026-06-21): we tikten geen 100% aan omdat ik **instances** sloot,
> niet **classes**, én omdat de échte blokkers **geen code** zijn en verstopt in
> de ledger zaten. Dit bestand maakt expliciet wat 100%-ready nog vereist en
> wie de eigenaar is. De code-kant is groen (3045 tests, 0 lint errors); de
> resterende gaten zijn hieronder per categorie, eerlijk.

## A. Harde blokkers — geen code-fix sluit deze (eigenaar = Sam / extern)

| ID | Blokker | Status na 2026-06-21 | Eigenaar / restactie |
|----|---------|----------------------|----------------------|
| F-TAX-110 | 2026-tarieven niet RB-bevestigd | **GROTENDEELS DICHT**: bron-verificatie uitgevoerd (belastingdienst.nl/Deloitte/PwC). Zwaarste constanten bevestigd; één significante fout gecorrigeerd (box-3-forfait 7,78%→6%) + 4 kleinere. Verslag in `rb-verificatie-checklist-2026.md`. | **RB**: alleen nog de ⚠️-punten aftekenen (AOW-schijf-1-tarief); F-TAX-111 arbeidskorting-opbouwtraject + F-TAX-112 AOW-korting-varianten zijn modellering, geen losse constante. |
| F-SCALE-141 | Licentieserver-SPOF | **CODE DICHT** (F-SCALE-141b: standby-URL nu centraal pushbaar naar bestaande kopieën). Runbook klaar (`standby-server-runbook.md`). | **Sam**: tweede deploy + uptime-monitor op `?actie=health` (4 afvink-criteria in de runbook). |
| F-TAX-131 | Niet-EU-export-rubriek | **WONTFIX-NU (beslist)**: RELATIES-land is free-text/onbetrouwbaar; 3a/3b-mapping vereist RB; saldo klopt; zeldzaam. Route = expliciet export-BTW-label ná RB-mapping. | **Product+RB** indien een klant aantoonbaar niet-EU exporteert. |
| F-OND-143 | OAuth-scherm-copy | **GEEN BEVINDING (beslist)**: /start "Toestaan" (consent-scherm) en /bedankt "Doorgaan" (account-kiezer) zijn béide correct voor hun scherm. | **Sam**: één live end-to-end-doorloop ter bevestiging van de schermvolgorde (niet via browser door mij). |

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

# Distributie-model — beslisdocument (copy-template vs Add-on vs web-app)

> Vraag: moeten we van "maak een kopie van het template" overstappen naar een
> Google Workspace Add-on of web-app? Aanleiding: verificatie haalt het
> "niet geverifieerd"-scherm **niet** weg bij copy-template (elke kopie = eigen
> ongeverifieerde OAuth-client). Bijgewerkt: 2026-06-16.

---

## De drie opties

| | Wat het is |
|---|---|
| **A. Copy-template (huidig), gepolijst** | Klant kopieert het template-sheet; eigen gebonden script + eigen sheet. Accepteer het (nu vriendelijke) onverified-scherm; leun op walkthroughs + minimale scopes. |
| **B. Google Workspace Editor-Add-on** | Eén gepubliceerde, geverifieerde add-on die in de sheet van de klant draait. Centrale updates, geen onverified-scherm, sidebar-UX. |
| **C. Standalone web-app** | Eén web-app-deployment; klanten via URL. Eén client, maar de UX is een webpagina en de data-thuisbasis wordt een vraag. |

## Geverifieerde feiten (onderzoek, niet aanname)

- **Verificatie helpt copy-template niet**: een gekopieerd script draait een *kopie*, niet jouw geverifieerde origineel → blijft "niet geverifieerd". Alleen B/C (gedeelde client) lossen het scherm op.
- **Add-on-triggers zijn beperkt**: max **één tijd-trigger per type per gebruiker**, min. 1×/uur. Jouw meerdere dag-/herinnering-/rapport-triggers moeten consolideren tot één dispatcher. Doenlijk, maar werk.
- **Geen CASA voor B**: doordat #4 de scopes al minimaliseerde (sensitive `spreadsheets`/`forms`, géén restricted), is een add-on **sensitive-tier** (justificatie + demo-video), **geen** dure CASA Tier-3-audit. Het scope-werk betaalt zich dus óók terug bij B.
- **Reken-/uitvoeringskracht**: A en B draaien **beide** in de context van de gebruiker (gedistribueerde quota per klant). C is centraal (gedeelde quota → bottleneck op schaal). → "B maakt compute 10× sterker" klopt **niet**; A≈B.

## Gewogen scoringsmatrix

Score 1-10 per as; gewicht = belang voor een **pre-launch, solo, €49 ZZP-product**. Gewichten zijn expliciet zodat je ze kunt bijstellen — ze sturen de uitkomst.

| As | Gewicht | A (copy) | B (add-on) | C (web-app) |
|----|:---:|:---:|:---:|:---:|
| Onboarding-frictie / geen onverified-scherm | 5 | 4 | 9 | 8 |
| Lange-termijn onderhoud / dev-velocity (centrale updates) | 5 | 4 | 9 | 9 |
| Bouw-/migratie-inspanning (time-to-value) | 4 | 9 | 3 | 2 |
| Pre-launch risico (niet herbouwen vóór marktvalidatie) | 4 | 9 | 4 | 3 |
| Data-eigendom / privacy ("in jouw Drive") | 4 | 9 | 8 | 4 |
| Continuïteit / overleeft-maker-verdwijnt | 3 | 9 | 4 | 3 |
| Reken-/uitvoeringskracht & betrouwbaarheid | 3 | 8 | 8 | 5 |
| Verificatie-last | 3 | 9 | 5 | 5 |
| Licentie- & betaalmodel (nu gebouwd voor A) | 3 | 9 | 5 | 5 |
| Fiscaal / bewaarplicht (7 jaar controleerbaar) | 3 | 9 | 7 | 5 |
| Website / discoverability / integratie | 2 | 6 | 8 | 7 |
| **Gewogen totaal (/39 gewichten)** | | **7.5** | **6.5** | **5.2** |

## Uitkomst

**A wint (7.5) > B (6.5) > C (5.2)** op pre-launch-gewichten.

- B's échte winst is **groot maar specifiek**: onboarding (geen scherm) + dev-velocity (centrale updates). Dat zijn reële, blijvende voordelen.
- B's échte kosten: **weken herbouw van de schil** (trigger-consolidatie, auth-modes, install-provisioning, licentie-rework, verificatie + Marketplace-listing), **pre-launch-risico** (herbouwen vóór één betalende klant = klassieke founder-val), en **verzwakte continuïteit** (centrale afhankelijkheid i.p.v. onafhankelijke kopie).
- **Gevoeligheid**: zet je de gewichten op "bouw-inspanning" en "pre-launch-risico" laag (je hebt tijd/funding en bent zeker van de vraag), dan schuift B binnen ~1 punt en kan B winnen. De uitkomst hangt dus op jóuw situatie — en die is nú: pre-launch, solo, nog geen marktbewijs.

## Aanbeveling — het is geen A *of* B, het is een vólgorde

1. **NU: A** — ship het bewezen product. De engine is af; rond de laatste code-gaten af, test de klantreis, lanceer. Valideer de vraag met echte klanten tegen lage kosten/risico.
2. **DAARNA (fase 2, mits de vraag er is): B** — als 10-20 betalende klanten de vraag bewijzen én het onverified-scherm of de update-last echt pijn blijken te doen, bouw dan de add-on met echte data + omzet als rugdekking. **De engine port mee** (zelfde Apps Script-logica), dus A-werk is nooit weg.

Dit vermijdt de founder-val (infrastructuur polijsten vóór marktvalidatie) én houdt B op de roadmap met bewijs i.p.v. onderbuik.

## Fase-2 B-roadmap (voor later, zodat het niet verloren gaat)
- Editor-Add-on-skelet + Marketplace-project (geverifieerde OAuth-client).
- **Trigger-consolidatie**: alle scheduled werk → één dagelijkse dispatcher (add-on-limiet).
- **Install-provisioning**: `onInstall` (AuthMode.FULL) bouwt de boekhoud-structuur in de sheet van de klant.
- **Auth-modes**: `onOpen` menu-rendering binnen NONE/LIMITED afhandelen.
- **Licentie-rework**: centrale validatie (Marketplace-licensing of Mollie + central check); offline-grace vervalt.
- **Sensitive-tier verificatie** (geen CASA) + demo-video (nu wél zinvol, want gedeelde client).
- **Continuïteits-vangnet** overwegen: "export/eject naar standalone"-knop zodat data + basisfunctie de add-on overleven.

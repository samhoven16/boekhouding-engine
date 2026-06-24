# Mega-audit — 2026-06-18 (de grootste check)

> Op verzoek: "test, breek, scan naar ALLE bugs, ook miniscule" — complete
> product, website, processen, workflows. **13 audit-assen parallel** tegen de
> working tree (na de e-mail-feature). Dit rapport vindt wat vandaag kenbaar is;
> het vervangt geen jaarlijkse wetscheck of echte klachten.

## Assen gedraaid (13)
tax-compliance · accountant-en-belastingdienst · red-team-adversary ·
gas-runtime-auditor · cross-pr-regressie · langlopend-onderhoud ·
documentatie-volledigheid · customer-voice-editor · onboarding-doorloop ·
friction-killer-google-niet-geverifieerd · positionering-redacteur ·
seo-strategist · content-gap-detector.

## Hoofdconclusie
De **kern is sterk** — alle 13 assen bevestigden dat de eerdere ronde-3-fixes
(F-RED-150 live-ssId-bind, F-SCALE-140/141/142, F-TAX-120/121, F-DOC-130/131,
F-OND-130/131) standhouden tegen de huidige code, plus dat de betalings-/
licentie-/admin-kern degelijk gehard is (constant-time compares, idempotency,
OTP-gating). **De #1 hotspot was het in deze sessie toegevoegde e-mail/drip-
subsysteem** — door 6 assen onafhankelijk geflagd. Goede uitkomst: precies
waarvoor je een mega-audit draait, vóór een klant het vindt.

---

## Gefixt + geborgd deze ronde (ratel-test elk)

### BLOKKERs
| ID | Wat | Test |
|----|-----|------|
| **F-TAX-130** | EUVerkoop las het klant-BTW-nr uit kolom `[21]` (= "Aangemaakt op", een Date) i.p.v. `[7]` → **ICP-opgaaf altijd leeg** (art. 37a) + **OSS-€10k-drempel vuurde nooit**. | `mega-audit-blockers` |
| **F-RED-151** | "Eigenaar-bypass"-knop verscheen op **élke** klant-kopie (owner==user) en zette een permanente 10-jaar-licentie zónder serverbinding → gratis-licentie-knop voor iedereen. Nu alleen `ADMIN_EMAILS`. | `mega-audit-blockers` |
| **F-VOICE-160** | Drip d14 beloofde een "ZIP met PDF+XLSX+JSONL" die niet bestaat; d3/d7 noemden niet-bestaande menupaden. Teruggebracht naar de echte Drive-map+XAF + echte menu-labels. | `mega-audit-copy-fixes` |
| **F-OND-140** | `/start` oefen-replica toonde het verborgen "onveilig"-linkje permanent (`display:block` overschreef de reveal-op-klik) → sprak de eigen les tegen. | `mega-audit-copy-fixes` |

### HOOG (overwegend het drip-subsysteem)
| ID | Wat | Test |
|----|-----|------|
| **F-RED-152** | Afmeld-token forgeable: `DRIP_UNSUB_SECRET` viel terug op een **publieke hardcoded string** → iedereen kon elk adres afmelden. Nu random secret geseed bij eerste run. | `drip-uit-unsubscribe` |
| **F-SCALE-143** | `dripuit_`-keys onbegrensd (forgeable → 500KB-DoS, geen cleanup). Nu existence-check (alleen echte klant-adressen) + random secret. | `drip-uit-unsubscribe` |
| **F-AVG-160** | Hoofdletter-adres (`John.Doe@…`) → afmelding **stil genegeerd** (AVG). Loop lowercased nu. | `drip-uit-unsubscribe` |
| **F-DOC-130b** | De ingetrokken "read-only/auto-vervalt 30d"-claim leefde nog op de **homepage + Engelse pagina**. | `mega-audit-copy-fixes` |
| **F-DOC-160** | Nieuwe "E-mailnotificaties"-toggle was nergens vindbaar — nu geseed in het Instellingen-tabblad. | `mega-audit-copy-fixes` |

### MIDDEL
| **F-ACC-160** | Master e-mail-gate zette óók de **durable audit-log** van wettelijke suppletie/KIA/bewaarplicht uit (niet alleen de mail) → detectie+audit draaien nu altijd. | `email-notificaties-toggle` |
| **F-RED-153** | RFC-8058 One-Click-POST viel naar de Mollie-handler → mailclient zei "afgemeld", server deed niets. Nu `drip-uit`-tak in `doPost`. | `drip-uit-unsubscribe` |

**Suite: 2761+ tests groen · lint 0 errors.**

---

## Open backlog (in de ledger; volgende ronde)

**HOOG:**
- **F-ACC-161** — XAF 4.0 emit nooit `<openingBalance>` → balans van jaar-2+ niet uit één auditfile te reconstrueren (art. 52 AWR volledigheid).
- **F-ACC-162** — `2_Journaalposten_*.csv` dumpt CORRUPT-rijen ongefilterd terwijl de XAF ze uitsluit → twee bestanden in één pakket spreken elkaar tegen.
- **F-SEO-160** — homepage FAQ-JSON-LD ≠ zichtbare FAQ (3 spook-Q&A's) → Google weigert/bestraft de rich-result.
- **F-DOC-161** — Gemini-scan-fout lekt rauw Engels naar de klant.
- **F-OND-141** — OTP-dialoog noemt de 15-min-vervaltijd niet.
- **F-OND-142** — server-`bedanktPagina_` heeft nog pre-F-OND-130-copy.

**MIDDEL/LAAG:** rubriek 2a nooit gevuld (F-TAX-131), creditnota nult origineel-BTW niet (F-ACC-163), `/start` scherm-volgorde (F-OND-143 — **eerst Google's live OAuth-flow verifiëren** vóór wijzigen), /faq JSON-LD onvolledig (F-SEO-161), API-versie-pinnen (BACKLOG-DURABILITY), content-gaten KOR/OSS/ICP/XAF (BACKLOG-CONTENT).

---

## Eerlijk
De mega-audit heeft vooral **mijn eigen net-toegevoegde e-mail/drip-code**
opengebroken (forgeable token, onbegrensde keys, mixed-case-AVG-bug, valse
copy) — die zijn nu gefixt + geborgd. De resterende backlog is reëel maar
lager-impact of vereist externe verificatie (Google OAuth-volgorde,
Belastingdienst-rubrieken). 0 nieuwe BLOKKER staat nog open. De grootste
structurele restrisico's blijven operationeel (warme-standby-deploy +
monitor van F-SCALE-141) en jouw eerder gekozen product-beslissingen.

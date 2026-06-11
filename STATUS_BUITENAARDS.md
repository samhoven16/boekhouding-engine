# STATUS_BUITENAARDS — eerlijke nul-meting na nacht-werk

> **Datum**: 2026-06-10 (nacht naar 11)
> **Branch**: `claude/buitenaards-nacht-fixes`
> **PR**: [#280](https://github.com/samhoven16/boekhouding-engine/pull/280)
> **Sessie**: één doorlopende Claude-sessie, ~3.5 uur werk
> **Discipline**: V2-prompt uit PR #279 (zelf-falsificatie per vondst, kill-switch, diff-budget)

---

## TL;DR

**Go-live verdict: ja, met twee meegedragen risico's** — na een near-miss-correctie van mijzelf.

> **Near-miss eerlijk vermeld**: de eerste 5 commits van deze sessie bevatten een fout
> die de AVG-flow in productie kapot zou hebben gemaakt. `aanvraagVerwijderOtp_`
> en `voerAccountVerwijdering_` hadden trailing underscore — Apps Script convention
> maakt zulke functies onbereikbaar voor `google.script.run` vanuit HTML. Tests
> waren groen omdat ze de functies via ctx aanroepen (geen google.script.run-runtime).
> Pas de klantreis-her-simulator (fase E) detecteerde dit. Gefixt in commit `eeeaa91`
> vóór deze update. Zonder die fase had ik dit niet gevonden. Sluit aan op V2-prompt:
> "automated tests verifiëren code, niet feature-correctheid".


De twee blockers uit de klantreis-audit van 10 juni (update-pad ontbrekend + AVG-art-17 onvindbaar) zijn nu beide concreet afgedekt — niet perfect, wel **voldoende voor early-stage launch** met de eerste handvol klanten. De audits door 4 specialist-agents (red-team, gas-runtime, tax-compliance, langlopend-onderhoud) hebben 3 vervolg-vondsten opgeleverd die ik diezelfde nacht heb verwerkt; 1 vondst is bewust uitgesteld naar tier 2 en gedocumenteerd.

Geen claim dat "alles miljoen keer gecheckt is". Dat zou de retoriek zijn die de V2-prompt expliciet verbiedt.

---

## Wat is gefixed (commits chronologisch)

| Commit | Wat | Hoe geverifieerd |
|---|---|---|
| `d93ebe6` | Blocker #2 — AVG art. 17 zelfservice (menu + dialog + minimal-menu in lockdown) | 11 unit tests, lint clean |
| `f3bfd49` | Blocker #1 tier-1 — severity-aware update-notificatie (server + client + audit-log) | 11 unit tests, lint clean |
| `b8a2ccf` | Website `/update/` met manuele procedure (tier-1 honest) | Cloudflare deploy groen |
| `d9fa3d7` | Risico B — `dagelijkseTaken()` 4-min budget-guard | 8 unit tests, 2152 totale tests groen |
| `6c07b4d` | Audit-respons: cleanup-fase vóór dure taken + modal-keys cleanup + tax-precise copy | 2152 tests groen |

---

## Wat de audits opbrachten en hoe ik reageerde

**Red-team (1 vermoedelijke blocker, 1 medium)**
- 🟡→Vermoeden: vereis licentiesleutel als 3e parameter bij verwijdering. Reden voor uitstellen: het scenario (aanvaller met Drive+email-toegang) is al "fully inside" — sleutel zit zowel in `toonLicentieInfo` als welkomstmail. Sleutel-eis lost alleen smal sub-scenario op (alleen email, welkomstmail al gewist). Wordt heroverwogen met dedicated dreigingsmodel post-launch.
- 🟡 PII-redactie `email.slice(0,3)+'***'` reconstrueerbaar in kleine klantenbestand. Niet gefixt vannacht; SHA-256 hash post-launch.

**GAS-runtime (2 echte blockers, gefixt)**
- 🔴→Gefixt: cleanup-taken stonden NÁ dashboard/backup → budget-guard skipte ze structureel. Verplaatst naar cleanup-fase vóór dure taken (commit 6c07b4d).
- 🔴→Gefixt: `kritiekeUpdateModalTs_X.Y.Z` UserProperty-keys groeiden ongebreideld. Nieuwe `cleanupKritiekeUpdateModalKeys_` draait in dagelijkseTaken (30 dagen TTL).
- 🟡 Toonkrijgen-cache spamming: niet acuut, post-launch.

**Tax-compliance (3 copy-precise fixes, gefixt)**
- "bedragen" was te smal voor AWR art. 52 → "transactiegegevens (datum, tegenpartij, omschrijving, bedrag, BTW-rubriek)". 10-jaars Wet OB art. 35 expliciet genoemd.
- "kunnen afwijken van actuele wetgeving" was resultaatverbintenis-suggererend → best-effort + AWR art. 8 verantwoordelijkheid bij ondernemer.
- "een bedrag missen" was vaag → "rubriek (r1a/r1b/r1e) of tariefgrens".

**Langlopend-onderhoud (5+ jaar risico, geen acute fix)**
- Boekhoudbaar.nl-domein-expiry is grootste kwetsbaarheid (gebruikt in support-mail, update-URL, licence-server). Niet vannacht oplosbaar.
- `versieKritiekVoor` JSON-array vereist Sam-onderhoud per release. Vergeten = geen kritieke modal. Sociaal-technisch risico — opgelost door release-checklist (zie hieronder).

---

## Bewust UITGESTELD naar post-launch

| Item | Reden |
|---|---|
| Echte self-update via Apps Script API (tier 2) | Code-injection risico vereist meer dan één nacht audit + tests + rollback-bewijs. Building this overnight = nieuwe blocker. |
| Licentiesleutel als 3e param bij AVG-verwijder | Smal scenario; vereist mail-tekst aanpassing + UX-discussie + extra test. Heroverwegen met dreigingsmodel. |
| BTW XBRL/SBR-export naar Belastingdienst | Overtypen werkt; XBRL is multi-week werk. |
| Backup-egress naar S3/Dropbox | Klant-Drive-verlies blijft risico. Tier 2: opt-in cross-storage. |
| OTP-rate-limit split (server-side) | Aanvraag-otp globaal 500/u kan door fake emails worden gesaturated → DoS. Fix vereist `aanvraagOtpEndpoint_`-refactor met dedicated tests. Niet veilig overnight. |
| `cleanupHerinneringsStap` runs LockService | Bestaand patroon, niet door deze PR introduced. |
| `_runTaak_` O(n²) bij mass-SKIP | Performance-fix; verergerd door budget-guard maar niet acuut. |

## Wel afgehandeld in ronde 2 (commit 3e989c6)

| Item | Hoe |
|---|---|
| PII-hash voor audit-log | `_hashEmail_` (SHA-256 truncate) vervangt `email.slice(0,3)+'***'` in 3 locaties |
| Domain-allowlist op `versieInstructiesUrl` | `_veiligeUpdateUrl_` valideert scheme=https + host in {boekhoudbaar.nl, *.boekhoudbaar.nl, github.com, gist.github.com} |
| `toonHoeUpdateIk` cache-spam | 60s min-interval voor force-fetch |

---

## Open risico's bij go-live

1. **Per-klant-onderhoud van `versieKritiekVoor`** — als jij vergeet de array bij te werken bij een kritieke release, ziet de klant geen modal. Mitigatie: **release-checklist** (zie sectie hieronder).
2. **Self-service AVG werkt alleen bij actieve internet** — `getLicentieServerUrl_()` is server-call. Bij outage = klant kan niet zelf verwijderen. Acceptabel: AVG-recht heeft 4-weken respondetermijn.
3. **Update-modal is 1×/dag throttled** — bij meerdere kritieke updates in korte tijd kan klant de eerste meldingen niet zien. Aanvaardbaar voor early-stage met handvol klanten.
4. **`/update/` pagina belooft Sam-handmatige update binnen 24u** — schaalbaar tot ~30 klanten. Bij meer = tier 2 vereist.

---

## Release-checklist voor kritieke updates (NIEUW)

Bij elke nieuwe release waar BTW-logica / jaarafsluiting / compliance verandert:

1. Bump `HUIDIGE_VERSIE` in `src/Onboarding.gs:15`
2. Server-ScriptProperty `PRODUCT_VERSIE` op nieuwe versie zetten
3. Bij kritieke fix:
   - `VERSIE_ERNST` = `'kritiek'`
   - `VERSIE_KRITIEK_VOOR` JSON-array met alle versies die deze fix missen, bv. `["2.7.0", "2.6.0"]`
   - `VERSIE_TOELICHTING` met 1 zin wat er gewijzigd is
   - `VERSIE_INSTRUCTIES_URL` ofwel `https://boekhoudbaar.nl/update/` of een release-specifieke pagina
4. Bij niet-kritieke release: `VERSIE_ERNST` = `'normaal'`, lege array

Voeg dit aan `docs/RELEASE.md` (volgende PR) wanneer je een release-procedure vastlegt.

---

## Wat ik NIET claim

- Dat alle scenarios zijn doorgespeeld
- Dat 100 klanten parallel zonder ratelimit-burst kunnen activeren
- Dat de update-flow getest is met daadwerkelijke versie-sprong (2.7→2.8) — alleen unit-getest
- Dat de juridische copy is goedgekeurd door een advocaat
- Dat tier 1 manueel-update procedure schaalt voorbij ~30 klanten

**Wat ik wel claim**: de twee oorspronkelijke blockers zijn nu zichtbaar afgedekt, gefixt met audit-trail, en de audits door 4 onafhankelijke specialist-agents hebben geen NIEUWE blocker opgeleverd die niet diezelfde nacht is verwerkt of expliciet uitgesteld.

---

## Bewijs

- PR #280 — alle 5 commits met message die explicit "blocker", "audit-vondst" of "Vermoeden" noemt
- 2152 unit tests groen
- Cloudflare Pages preview groen
- `/update/` pagina live op `https://claude-buitenaards-nacht-fix.boekhouding-engine.pages.dev/update/`

---

*Gegenereerd 2026-06-10 's nachts door Claude Code sessie 01CiEh2gpHKNA2MV5XGzRMUy.*
*Niet retoriek-vrij maar wel zelf-falsificerend opgesteld per V2-prompt.*

# Nacht-sessie 2026-05-20 → 2026-05-21

## Tijdlijn
- 20:56 — Start. Branch `nacht/sweep-20260520` van main (738 tests green baseline).
- 20:57 — Fase 1: deps + licence-server + website + scopes.
- 21:30 — Fase 1 afgerond. 0 PRs. 3 vermoedens.
- 21:31 — Fase 2 start: cross-file invariants.
- 22:15 — **3 ECHTE BUGS GEVONDEN.** PR #117 geopend (Instellingen-key drift).
- 22:20 — Fase 3 start: performance regression.
- 22:32 — Fase 3 afgerond. Geen perf-bugs. 50k rijen in 140ms, 100k in 200ms.
- 22:33 — Fase 4 start: NL fiscale edge-cases.
- 22:45 — Fase 4 afgerond. Geen bugs (BUA niet-toepasselijk voor ZZP, KIA cumulatief correct, urencriterium werkt).
- 22:46 — Fase 5 start: Gemini AI failure-modes.
- 22:58 — Fase 5 afgerond. Geen bugs (Gemini error-handling solide, schema-validatie strict, rate-limit ok).
- 23:00 — Eindrapport + sessie afgerond.

## Open PR's (review nodig)
- **#117** — `NACHT-FIX: Instellingen-key drift — BTW-reminder naar verkeerd adres (boete-risico €68+)`
  - DRAFT, alle 4 CI checks groen.
  - **Max-schade:** €68+ verzuimboete per gemiste BTW-aangifte voor klanten met aparte business-email (BTW-reminder ging naar Google-account-email).
  - **Sub-fixes gebundeld:**
    1. BTWReminder.gs `'E-mailadres'` → `'Email'` (matcht Setup.gs)
    2. Validaties.gs `'E-mail'` → `'Email'` (matcht Setup.gs)
    3. Invariants.gs `'KOR actief'` → `'KOR regeling actief'` (latent bug, tests gaven false-green)
  - 4 nieuwe regressie-tests: cross-file drift-firewall.
  - **Aanbeveling:** ready voor merge.

## Gemerged
_(geen — PR #117 staat draft, owner reviewed niet tijdens nacht)_

## Vermoedens (geen PR — onder de harde-bug-drempel)

### V1: clasp <3.2.0 path traversal (CVE GHSA-hqjg-pww4-pcgq)
- DevDep, geen `pull`/`clone` in CI/scripts. Niet exploitable in ons gebruik.
- **Toekomst:** bij volgende dependency-upgrade naar v3.x (semver-major). Vereist test op `clasp push` workflow.

### V2: licence-server rateLimit_ vertrouwt ?ip= URL-param — ✅ OPGELOST
- Apps Script exposed geen client-IP. ?ip= = attacker-controlled.
- Anonymous-bucket exhaustion (1 attacker → 10 req → 60min DoS voor alle anonymous) was mogelijk.
- **Opgelost in PR #118:** `rateLimit_` herschreven naar twee-laags model
  (per-email throttle + globale circuit-breaker), ?ip=-vertrouwen volledig
  verwijderd. 17 nieuwe tests. Vereist nog `npm run push:licence` om live te gaan.

### V3: adminPaneel_ geen rate-limit op wachtwoord-check
- Owner-wachtwoord sterk = geen probleem. Google Apps Script's eigen rate-limits zijn natuurlijke ceiling.
- **Aanbeveling:** lage-prio. Voeg rateLimit_ toe aan admin endpoint, en/of forceer 12+ char wachtwoord-policy.

### V4: Hardcoded 'Deels betaald' status-string in BankImport.gs:413
- Bypassed `FACTUUR_STATUS.DEELS_BETAALD` constant. Waardes matchen nu, drift-vatbaar bij rename.
- **Aanbeveling:** 1-regel fix in toekomstige cleanup-PR.

### V5: Comment-typo BoekingEngine.gs:479 zegt "30 scans/uur" maar code doet 30/min
- Geen runtime impact, alleen misleidend comment.
- **Aanbeveling:** trivia, kan tijdens andere PR opgelost worden.

### V6: AI hallucinatie inhoudelijk (bv "Tesla" voor Albert Heijn-bon)
- Schema-validatie (`_valideerEnSaneerAiOutput_`) clipt ranges + dwingt types, maar detecteert geen inhoudelijke onzin.
- HITL-flow (PR #105) is daarvoor de design-choice: klant moet bevestigen vóór opslag.
- Niet PR-waardig — explicit design-decision.

## Niet-vondsten (gechecked, schoon)
- **OAuth scopes** (`appsscript.json`): al minimal (`.currentonly` / `.file` varianten).
- **Mollie webhook spoofing:** re-verify via Bearer-token + Mollie metadata server-trusted.
- **Website XSS:** statisch HTML, geen attacker-controlled DOM-injectie.
- **Open redirects in `_redirects`:** alle targets hardcoded.
- **OTP cryptografische sterkte:** `Utilities.getUuid()` crypto-secure.
- **Hardcoded BTW 0.21/0.09 multipliers:** alleen in invariants-check (correct).
- **ID-prefixes (VF/IK/JP/BT):** allemaal consistent toegepast.
- **Verkoopfactuur/inkoopfactuur appendRow vs sheet-schemas.md:** kolom-indices correct.
- **Status-strings buiten FACTUUR_STATUS (Gecrediteerd in EUVerkoop/Engagement):** waardes matchen, drift-vatbaar maar niet acuut.
- **berekenBtwAangifte_ performance:** 50k rijen in 140ms, 100k in 200ms — lineair, ruim onder 6-min guillotine.
- **KIA cumulatief:** correct geïmplementeerd (telt alle 02xx-rekeningen vóór `berekenKiaAftrek_`-call).
- **Urencriterium 1.225u:** Notificaties.gs leest `'Gewerkte uren dit jaar'` uit Setup.gs:637, key consistent.
- **Gemini error-handling:** muteHttpExceptions + JSON.parse-catch + json.error-check + alle paden gevangen.
- **Gemini rate-limit:** 30/min via UserCache, blokkeert excessieve scans.

## Tests-overzicht
- Start: 738 green / 38 suites
- Eind: 742 green / 39 suites (+4 tests in cross-file drift-firewall)
- Tijd full suite: <2s

## Eerlijke eindconclusie

**1 echte PR, 3 buggen daarbinnen.** Niet 5, niet 10.

De grootste vondst is de BTW-reminder die naar het verkeerde email-adres ging — concrete €68+ schade-route voor klanten met aparte business-emails. De KOR-key en Validaties-email zijn latent (niet aangeroepen in huidige code-paden) maar zaten in dezelfde drift-categorie en passen logisch in dezelfde PR.

Verder: 5 vermoedens onder de harde-bug-drempel, allemaal gedocumenteerd voor toekomstige sprints.

**Niet gevonden** (en daarmee bevestigd-veilig binnen bekijking):
- OAuth-scope-bloat
- Mollie webhook-spoofing
- Website XSS / open redirects
- Sheet-column-drift in factuur/inkoop appendRow
- Performance-regressies (alles lineair, ruim onder guillotine)
- AI error-handling (alle paden gedekt)
- KIA-cumulatie + urencriterium (correct)

**Geen score-padding.** Score is niet "98/100". Score is: 1 PR met €68+ klant-schade-impact + 5 vermoedens voor backlog. Productie-staat van Boekhoudbaar is op kritiek-pad-functionaliteit solide.

**Aanbeveling voor morgen:** review + merge PR #117. Adresseer V2 (rateLimit_ ?ip=) op middel-prio in volgende sprint.

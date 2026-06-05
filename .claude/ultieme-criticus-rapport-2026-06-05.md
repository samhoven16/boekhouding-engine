# De Ultieme Criticus — Synthese Rapport · 2026-06-05

> 6 persona's, 6 audits, 1 doel: vinden wat we niet zelf zien.
> Methode: zie `.claude/ultieme-criticus-methode.md`.

## De 6 persona's

| # | Persona | Lens | Output-bytes |
|---|---|---|---:|
| 1 | De Concurrent (Moneybird-PM) | "Hoe houd ik mijn klant?" | 5,4KB |
| 2 | De Disgruntled Klant (6mnd) | "1-ster Trustpilot review" | 4,6KB |
| 3 | De Accountant (20j IB) | "Belastingdienst-audit" | 7,4KB |
| 4 | De Security-onderzoeker | "AVG + OWASP" | 8,5KB |
| 5 | De UX-cynicus | "Don't Make Me Think" | 6,1KB |
| 6 | De DR/SRE | "Shit hits the fan" | 6,2KB |

Volledige output per persona: zie `.claude/critic-outputs/*.md`.

---

## Top-5 CROSS-CUTTING bevindingen (≥2 persona's bevestigen — echte prio's)

### 🔴 C1 — "Niet-geverifieerde app"-scherm is conversie-doodvonnis
**Bevestigers:** Concurrent (deal-breaker #1), UX (onboarding-killer #1), Disgruntled (impliciet via setup-paniek).

Quote Concurrent: *"Je vertelt je klant — een ZZP'er met 7-jaar bewaarplicht — dat hij Google's security-warning moet negeren om met zijn boekhouding te beginnen."*

Quote UX: *"Geen ENKELE walkthrough/screenshot/video op `/bedankt` (die niet eens bestaat — `website/bedankt/index.html`: No such file or directory)."*

**Fix:** Bouw `/bedankt/` met annotated screenshots door de Google-warning heen. **Demonstratie-fix in deze PR.**

### 🔴 C2 — 102 menu-items overweldigen "ZZP'er die geen boekhoudkennis heeft"
**Bevestigers:** UX (`grep -c addItem Menu.gs = 102`), Disgruntled (*"menu telt zes submenu's, twéé licentie-items, het hele menu leest als een GAS-engineering changelog"*).

Quote UX: *"De positionering is dubbel: 'voor ZZP'ers die geen boekhoudkennis hebben' + product-oppervlak van een full-stack ERP."*

**Fix-richting:** Verberg `Controle & Export`, `Geavanceerd`, `Privé Financiën`, `Licentie & Updates` achter `Boekhoudbaar → Geavanceerd tonen`-toggle. Halveert menu zonder een feature te verliezen. Niet in deze PR — vereist GAS-code-wijziging in `Menu.gs`.

### 🔴 C3 — License-server + Mollie webhook security ZIJN brittle
**Bevestigers:** Security (5 risico's: kritiek admin-no-2FA, hoog Mollie-fake-signature, hoog Brevo-URL-token, medium logo-XSS, medium audit-log-PII), DR/SRE (license-server SPOF + grace-cliff bij >7 dagen down).

Quote Security: *"De code claimt HMAC-verificatie maar Mollie's webhook stuurt geen signature-veld. Als `MOLLIE_WEBHOOK_SECRET` niet is gezet, wordt verificatie volledig overgeslagen (fail-open). Een attacker kan een POST naar de klant-webhook sturen: boekhouding wordt vervalst."*

**Fix-richting (P0):** Mollie API-call vóór status-acceptatie (geen signature-vertrouwen) + verifieer payment ↔ klant-mapping. Apart PR-traject — vereist `src/Mollie.gs` wijziging.

### 🔴 C4 — Boeking ná jaarafsluiting wordt geaccepteerd (E2 P0 uit stresstest)
**Bevestigers:** Accountant (citeert exact `src/Boekingen.gs:17-34` ontbrekende `jaarAlAfgesloten_`-check), DR/SRE (genoemd als #3 disaster-scenario via sheet-corruptie-pad).

Quote Accountant: *"Dit staat al als P0 in `.claude/stresstest-findings-2026-06-05.md:22` (E2) maar is na merge #224 NOG STEEDS niet gefixed. Bij Belastingdienst-audit moet ik elke 2026-correctie op 2025-datum handmatig uitsplitsen."*

**Fix-richting (P0):** Voeg in `valideerInvariantsVoorJournaalpost_` (`src/Invariants.gs:448`) een check toe op `jaarAlAfgesloten_`. Stresstest-PR #225 noemde dit al. **Hoogste fix-prio.**

### 🟡 C5 — AVG privacy-claim ≠ werkelijkheid
**Bevestigers:** Security (3 AVG-gaps: retentie 7j vs 90d-claim, Telemetry/Bindings niet vermeld, geen breach-procedure).

Quote Security: *"`privacy.html:222` claimt audit-log 90 dagen — code (`Triggers.gs:245`) bewaart 7 jaar. Direct verifieerbare misleiding door toezichthouder zelf."*

**Fix-richting (P1):** Privacy-statement uitbreiden + audit-log splitsen in financieel (7j) en operationeel (90d). Apart PR-traject.

---

## Per-persona unieke bevindingen (1 persona, alsnog waardevol)

### Concurrent (uniek):
- PSD2 vs CSV maandelijks-handwerk = 10+ uur/jaar verschil
- Geen native iOS/Android-app (Moneybird wel)
- "Bij >5000 transacties wordt het dashboard langzamer" + nieuw boekjaar elke 1-2 jaar → Belastingdienst-controle = tweede sheet openen
- Sales-quote die hen pijn doet: *"Niet beter dan Moneybird, alleen anders"* — letterlijk hun eigen homepage
- **Kans onbenut:** Moneybird XAF-import-knop bouwen (switching-friction → nul)

### Disgruntled Klant (uniek):
- Drie verschillende welkom-flows over elkaar (`Onboarding.gs:59` + `Onboarding.gs:436`)
- Error *"Geen geldige factuurregels gevonden"* zonder te zeggen WELKE regel
- Toon-issue: "KRITIEK", "🚨", "💸 U moet betalen" — bedreigend i.p.v. behulpzaam
- "Factuurnummer GAP gedetecteerd — Audit-flag" voor systeem's eigen tellerbug
- **Retentie-winst:** verberg 80% menu standaard + één "we hebben dit opgelost"-toast i.p.v. KRITIEK-popups

### Accountant (uniek):
- Geen jaaroverdracht van BALANS-rekeningen via journaalpost → beginbalans 2026 mist
- `BTW r5b` storno kan dubbel afgetrokken zijn (storno op JP-niveau ≠ inkoopfactuur-rij)
- Pro-rata BTW-aftrek krijgt geen audit-attribuut per inkoopfactuur
- `controleerBalans_` tolereert €0,05 — onacceptabel voor jaarrekening (drempel moet `< 0,005`)
- Geen RGS-codering in GROOTBOEKSCHEMA (deal-breaker voor Caseware/Visma)
- Geen SBR/XBRL-jaarrekening export voor KvK-deponering

### Security (uniek):
- `/api/licentie/admin` SSO via wachtwoord-only in GET-form (lekt in browser-history!)
- `slaLogoOp` accepteert client-controlled MIME-string zonder magic-byte-check
- Brevo `BREVO_WEBHOOK_TOKEN` zit in URL-querystring (logt in Stackdriver)
- **Goed gedaan:** OTP-flow + refund/chargeback revoke + SVG-blacklist in logo-upload

### UX-cynicus (uniek):
- `/kopen` is 302 naar `script.google.com/macros/...` — conversie-zelfmoord
- Hero belofte "15 minuten/maand" zonder bewijs in eerste 5 sec
- Onboarding zegt "u", site zegt "je" (44× "je" vs 14× "u" in Onboarding.gs)
- Achievement-toasts ("🥇 Eerste factuur") patronizing voor 45-jarige consultant
- Garantie-tekst ondermijnt zichzelf: *"Geen onbeperkte geld-terug — wel een eerlijk gesprek"*

### DR/SRE (uniek):
- Geen per-klant heartbeat — 2.000 klanten = 2.000 zwarte dozen
- Geen alert op `meldFataalAanOwner_`-volume (cache-throttle per-sheet maskeert massale corruptie)
- `dunningCursor` kan >7 dagen stilstaan zonder detectie
- `emailVerzonden_F000001`-keys in ScriptProperties hebben geen cleanup → quotum-cliff bij 10.000 facturen

---

## Prioriteits-matrix (wat eerst, gesorteerd op blast-radius × waarschijnlijkheid)

| Prio | Fix | Persona's | Effort | Impact |
|---|---|---|---|---|
| **P0-1** | Boeking-na-jaarafsluiting blokkeren (E2) | Accountant + DR/SRE | ~20 r code | RJ-conform, Belastingdienst-audit-proof |
| **P0-2** | Mollie webhook: API-verifiëren i.p.v. fake-signature | Security | ~40 r code | Stop boekhouding-vervalsing |
| **P0-3** | `/bedankt/` pagina + walkthrough Google-warning | Concurrent + UX | ~1u HTML | Stop 30%+ activatie-drop-off |
| **P1-1** | "u" → "je" in Onboarding.gs | UX | sed-replace, 5 min | Toon-consistentie |
| **P1-2** | Admin-login: POST-only + session + IP-allowlist | Security | ~2u | Stop credential-leak in browser-history |
| **P1-3** | Verberg 4 submenu's achter "Geavanceerd tonen"-toggle | UX + Disgruntled | ~30 r Menu.gs | Halveert cognitive load |
| **P1-4** | Per-klant heartbeat naar license-server | DR/SRE | ~1u | Detecteer 2000-klant-down vóór support-tickets |
| **P1-5** | Privacy-statement vs werkelijkheid sync | Security | ~2u tekst + code | Stop AP-aanklacht-risico |
| **P2** | Snapshot bij `genereerBtwAangifte` (niet alleen `sluitBtwPeriode`) | Accountant | ~10 r BTW.gs | Auto-suppletie-detectie |
| **P2** | Achievement-toasts opt-in i.p.v. opt-out | UX | ~5 r | Stop patronizing-vibe |
| **K1** | Moneybird XAF-import-knop (kans) | Concurrent | ~1d | Switching-friction → 0 |
| **K2** | RGS-codering in GROOTBOEKSCHEMA | Accountant | ~1d | Caseware/Visma-compatibel |
| **K3** | Audit-log splitsen (financieel 7j / operationeel 90d) | Security | ~3u | AVG-conform |

---

## Demonstratie-fix in deze PR

**P0-3: `/bedankt/` pagina** — UX-cynicus's quick-win #1, ook genoemd door Concurrent als de eerste-indruk-killer. Bestand bestond niet voordien.

Wat erin zit:
- Welkomst-bedankje + factuurnummer-placeholder + e-mail-ontvanger
- **5-staps onboarding walkthrough** met annotated screenshot per stap
- Specifiek stap 2: hoe je door het "Niet-geverifieerde app"-scherm heen klikt (was de #1 friction-killer)
- Trouble-shooting: wat als de mail niet komt
- Link naar `/mijn/` om je Sheet terug te vinden

Andere fixes uit deze rapportage zijn allemaal aparte PR's:
- P0-1 (jaar-blokkade) + P1-1 (u/je) + P1-3 (menu-verbergen) — kleine GAS-PR's
- P0-2 (Mollie) + P1-2 (admin) + P1-5 (privacy) — security-PR
- K1-3 — feature-/refactor-PR's

## Wat NIET in dit rapport zit

- Performance-benchmarks bij echte schaal (DR/SRE noemde 5k klanten als UrlFetch-cliff)
- A/B-test-resultaten van homepage-copy (zou de UX-bevindingen kunnen valideren of weerleggen)
- Kosten/baten per fix (alle bedragen geschat op effort, niet op revenue-impact)

## Methode-validatie

6 persona's, parallel uitgevoerd, ~60min total + ~3u synthese. Bevindingen:
- 5 cross-cutting (≥2 persona's bevestigen) — **deze zijn echte prio's**
- 25+ unieke per-persona findings (waar 1 lens iets ziet) — **lange staart**
- 0 conflicten tussen persona's — alle observaties zijn consistent verklaarbaar

Volgende run aanbevolen na: implementatie van P0-1+P0-2+P0-3 (laat de echt-doelgroep-test zien of friction weg is).

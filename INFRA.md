# Boekhoudbaar — Infrastructure Hardening Pack
> Exacte acties per systeem. Alles wat als code kan, staat in de repo.
> Alles wat handmatig moet, staat hier als checklist.
> Laatste update: april 2026

---

## 1. CLOUDFLARE — PAGES + DNS

### Subdomain-beslissingskaar (vastgesteld)

| Subdomain | Doel | Status | Prioriteit |
|-----------|------|--------|-----------|
| `www.boekhoudbaar.nl` | Canonieke website (Cloudflare Pages) | ✅ Doelwit | Nu |
| `boekhoudbaar.nl` (apex) | Redirect → www | 🔲 Configureren | Nu |
| `api.boekhoudbaar.nl` | Toekomstig: GAS Web App proxy | 🔲 Reserveren | Later |
| `help.boekhoudbaar.nl` | Helpcentrum (Docusaurus) | 🔲 Reserveren | Later |
| `demo.boekhoudbaar.nl` | Demo-omgeving | 🔲 Reserveren | Later |

### Stap 1 — Custom domains koppelen aan Pages

In Cloudflare dashboard → Workers & Pages → boekhouding-engine → Settings → Custom domains:

```
Voeg toe: www.boekhoudbaar.nl
Voeg toe: boekhoudbaar.nl
```

Cloudflare maakt automatisch de DNS-records aan (CNAME-flattening voor apex).

### Stap 2 — Redirect: apex → www (in dashboard, NIET in _redirects)

Cloudflare Pages `_redirects` ondersteunt alleen relatieve paden als bron.
De apex→www redirect gaat via Cloudflare Redirect Rules:

1. Cloudflare dashboard → je domein → Rules → Redirect Rules → Create rule
2. Naam: `Apex naar www`
3. Condition: `Hostname equals boekhoudbaar.nl`
4. Action: Dynamic redirect → `concat("https://www.", http.host, http.request.uri.path)` → 301

### Stap 3 — SSL

- SSL/TLS → Overview → zet op **Full (strict)**
- SSL/TLS → Edge Certificates → **Always Use HTTPS: AAN**
- SSL/TLS → Edge Certificates → **Minimum TLS version: 1.2**
- SSL/TLS → Edge Certificates → **Opportunistic Encryption: AAN**

### Stap 4 — Security

- Security → Settings → **Security Level: Medium**
- Security → Settings → **Browser Integrity Check: AAN**
- Speed → Optimization → **Brotli: AAN**
- Caching → Configuration → **Cache Level: Standard**

### Wat al in de repo staat (automatisch via deploy)

```
website/_headers    → security headers (CSP, X-Frame, HSTS, etc.)
website/_redirects  → /kopen → GAS licentieserver (302)
```

---

## 2. GITHUB — BRANCH PROTECTION

### Branch protection instellen voor `main`

GitHub → Settings → Branches → Add rule → Branch name pattern: `main`

Vereiste instellingen:
- [x] **Require a pull request before merging**
  - [x] Require approvals: 0 (solo project, maar PR-flow verplicht)
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Voeg toe: `Lint (ESLint)`
  - Voeg toe: `Tests (Jest)`
- [x] **Do not allow bypassing the above settings**

**Job-namen in de workflow (uniek, exact zo vereist in branch protection):**
- `Lint (ESLint)` — in jobs.lint.name
- `Tests (Jest)` — in jobs.test.name
- `Deploy naar Apps Script` — niet vereist in branch protection (deployen na merge)

### Branch-strategie

```
main          → productie (protected, alleen via PR)
claude/...    → actieve development branch (CI draait, CF Pages preview)
feature/*     → korte feature branches (merge naar claude/...)
```

### Merge-beleid

- Squash merges voor features (schone main history)
- Merge commits voor releases (traceerbaarheid)
- Verwijder branch na merge

---

## 3. E-MAIL DNS AUTHENTICATIE

Vereist voor: transactiemails (Brevo), spam-score, deliverability.
Moet kloppen VOOR eerste echte klant.

### SPF — voeg toe aan DNS

```dns
Type: TXT
Naam: @  (of boekhoudbaar.nl)
Waarde: v=spf1 include:spf.brevo.com ~all
```

Als je ook Google Workspace gebruikt voor hallo@boekhoudbaar.nl:
```
v=spf1 include:spf.brevo.com include:_spf.google.com ~all
```

### DKIM — ophalen bij Brevo

1. Brevo dashboard → Senders & IPs → Domains → Authenticate domain
2. Brevo geeft je een TXT-record (brevo._domainkey.boekhoudbaar.nl)
3. Voeg toe in Cloudflare DNS

### DMARC — toevoegen (begin op monitoring)

```dns
Type: TXT
Naam: _dmarc
Waarde: v=DMARC1; p=none; rua=mailto:dmarc@boekhoudbaar.nl; ruf=mailto:dmarc@boekhoudbaar.nl; sp=none; aspf=r;
```

Na 2 weken (geen false positives): zet `p=none` naar `p=quarantine`
Na 1 maand: zet naar `p=reject`

### Test deliverability

Voor launch testen via: mail-tester.com (verstuur testmail, score moet ≥ 9/10)

---

## 4. MOLLIE — WEBHOOK HARDENING

### Huidige status: geïmplementeerd ✅

Webhook-flow in `licence-server/Code.gs`:
1. Mollie POST → `doPost(e)` → `verwerkMollieWebhook_(e)`
2. Haal `payment_id` op uit webhook body
3. **Re-fetch status bij Mollie API** (niet vertrouwen op webhook body)
4. Idempotency check via `CacheService` (6u TTL) + sheet-check
5. Exclusieve lock via `LockService` (race condition preventie)

### Checklist voor productie

- [ ] **Mollie live API key** instellen (Script Properties: `MOLLIE_API_KEY`)
  - Mollie dashboard → Activeer live modus → kopieer live key
  - Vervang de huidige `test_…`-waarde in Script Properties door de nieuwe `live_…`
- [ ] **Webhook URL controleren** in Mollie dashboard
  - Staat ingesteld als: `[GAS Web App URL]` (dezelfde als checkout URL)
  - Mollie vereist publieke HTTPS — GAS Web App URL voldoet hieraan
- [ ] **Test-betaling uitvoeren** na live-switch (€0,01 of minste bedrag)
- [ ] **Polling fallback overwegen** (dagelijkse job die openstaande betalingen checkt)

### Polling fallback (todo — implementeer voor schaal)

```javascript
// Toe te voegen aan licentieserver: dagelijkse trigger
function controleerOpenstaandeBetalingen_() {
  // Haal alle payments op bij Mollie met status 'open' ouder dan 1 uur
  // Re-verwerk als status 'paid' — same idempotency guard als webhook
}
```

---

## 5. APPS SCRIPT — RUNTIME GRENZEN

### Architectuurprincipe: thin shell, dik centraal

```
Klant-script (gebonden aan hun spreadsheet)
├── Entry points: onOpen, onFormSubmit, dagelijkse triggers
├── Calls: alle logica via functies in dezelfde GAS-omgeving
└── Data: ALLEEN in klant's eigen sheets/Drive

Licentieserver (jouw GAS Web App)
├── Endpoints: valideer, aanvraag-otp, activeer-otp, health
├── Data: ALLEEN licentie-sheet (niet klantdata)
└── Mail: Brevo API (niet MailApp voor transactionele mail)
```

### GAS-quota om rekening mee te houden

| Service | Grens (gratis) | Impact |
|---------|---------------|--------|
| MailApp | 100/dag | Vervangen door Brevo voor transacties |
| UrlFetchApp | 20.000/dag | Veilig bij normale gebruik |
| Triggers | 20/user/script | Max 5 per klant-script |
| Spreadsheet access | 100 requests/100 seconden | Cache reads waar mogelijk |
| Script runtime | 6 min/executie | Dagelijkse taken splitsen indien nodig |

### Wat NOOIT via MailApp moet (verplaats naar Brevo)

- Licentiemails (al op Brevo) ✅
- OTP-mails (al op Brevo met fallback) ✅
- Follow-up sequenties (al op Brevo) ✅
- Betalingsherinneringen aan klanten → todo: Brevo template

### Caching-strategie

In `isLicentieGeldig_()`: 24-uurs cache in ScriptProperties ✅
Dashboard KPI's: berekend bij `vernieuwDashboard()`, niet bij elke open ✅
BTW-aangifte: berekend on-demand, niet cachen (real-time data vereist)

---

## 6. CLAUDE CODE — OPERATING PROTOCOL

### Één batch per run

Claude leest altijd eerst:
1. `CLAUDE.md` — verplicht werkprotocol
2. Relevante `.claude/` artifacts (repo-map, flow-maps, invariants)
3. Dan pas specifieke bestanden

### Targeted tests (niet de volle suite)

```bash
# BTW-wijziging:
npm run test:flow btw

# Factuur-wijziging:
npm run test:flow invoice

# Setup-wijziging:
npm run test:flow setup

# Alles:
npm test  # ALLEEN bij cross-cutting changes
```

### Één commit per run

Formaat:
```
type(module): beschrijving

https://claude.ai/code/session_013uKV3SRNj18fLuVmxs4N8n
```

### Progress tracking

Gebruik `CONTEXT.md` "Openstaande taken" sectie als backlog.
Bij elke sessie: update de afgevinkte items.

---

## 7. LAUNCH CHECKLIST (niet-onderhandelbaar)

### Moet 100% klaar zijn voor eerste klant

- [ ] **Cloudflare Pages**: `www.boekhoudbaar.nl` als custom domain toegevoegd
- [ ] **Apex redirect**: Cloudflare Redirect Rule (apex → www) actief
- [ ] **SSL Full (strict)**: ingesteld in Cloudflare
- [ ] **E-mail authenticatie**: SPF + DKIM + DMARC actief (test via mail-tester.com ≥ 9/10)
- [ ] **Mollie live mode**: live API key in GAS Script Properties
- [ ] **TEMPLATE_SS_ID**: clean template spreadsheet aangemaakt + ID in licentieserver properties
- [ ] **LICENTIE_SERVER_URL**: GAS Web App URL in boekhoud-template Script Properties
- [ ] **BREVO_API_KEY**: API key in licentieserver Script Properties
- [ ] **Test-aankoop**: volledige flow doorlopen (betaal → mail → activeer → gebruik)
- [ ] **Checkout link werkt**: `boekhoudbaar.nl/kopen` redirect naar Mollie betaalpagina

### Kan wachten (niet-blokkend voor launch)

- [ ] KVK-registratie (placeholder `00000000` invullen in 3 bestanden)
- [ ] `help.boekhoudbaar.nl` (Docusaurus helpcentrum)
- [ ] `og-image.png` (Twitter/X toont SVG niet; LinkedIn/WhatsApp wél)
- [ ] UptimeRobot monitors (4x: website, licentieserver, health endpoint, /kopen)
- [ ] GitHub branch protection op `main`
- [ ] GAS Library refactor (voor schaal bij 50+ klanten)

### Vertrouwen-killers die NOOIT live mogen

- Broken buy button (gefixed ✅)
- Placeholder KVK in footer (nog niet ingevuld — visueel acceptabel zolang klein)
- 404 op /privacy of /voorwaarden (beide bestaan ✅)
- SSL-waarschuwing in browser (Full strict verplicht)
- Mailbox `hallo@boekhoudbaar.nl` niet bereikbaar (instellen vóór launch)

---

## 8. WEBSITE SPEC — VOLGENDE FASE

De volledige website redesign per premium SaaS spec is gepland als volgende sessie.

**Gekozen positionering:** "Een precies, gecontroleerd financieel systeem dat je bezit — zonder abonnementsafhankelijkheid."

**Doelgroepen:**
- ZZP dienstverleners (freelancers, consultants, coaches) — primair
- Kleine MKB dienstverleners (2-10 FTE, geen complexe voorraad/salarisadministratie)

**Canonical URL:** `https://www.boekhoudbaar.nl/`

**Redesign-scope (volgende sessie):**
- Nieuwe visuele taal (kalm, premium, financieel)
- Volledige homepage herstructurering (hero → probleem → oplossing → demo → prijs → FAQ)
- Dedicated prijspagina met risicoreductie
- Accountant-sectie
- Demo-pagina concept

# Boekhoudbaar — AI Context Document
> Gebruik dit bestand om een nieuwe AI-chat volledig op snelheid te brengen.
> Laatste update: april 2026

---

## Wat is dit project?

**Boekhoudbaar** is een volledig ZZP-boekhoudpakket gebouwd in Google Apps Script (GAS), verkocht als eenmalige licentie via `boekhoudbaar.nl` voor €49.

- **Geen server nodig** — draait gratis op Google's infra
- **Data in eigen Google Drive** van de klant
- **Licentieserver** is een aparte GAS Web App
- **Website** via Cloudflare Pages (GitHub repo → `website/` map)

---

## Repository structuur

```
boekhouding-engine/
├── src/                        # Hoofd-boekhoudapplicatie (GAS)
│   ├── Config.gs               # Alle constanten (SHEETS, PROP, BTW_KEUZES)
│   ├── Utils.gs                # Gedeelde helpers (getSpreadsheet_, formatBedrag_)
│   ├── Triggers.gs             # GAS trigger handlers — alle geldstromen
│   ├── BoekingEngine.gs        # Validatie + dispatch dialoogformulieren
│   ├── Boekingen.gs            # maakJournaalpost_, ID-generators
│   ├── Setup.gs                # Eenmalige initialisatie (idempotency guard)
│   ├── Dashboard.gs            # KPI dashboard + herhalende kosten
│   ├── BTW.gs                  # BTW-aangifte berekening (rubrieken 1a/1b/1d/3b)
│   ├── Belastingadvies.gs      # Volledige belastingoptimalisatie-engine
│   ├── TaxRegistry.gs          # Tax Rules Registry (TAX-BTW-001, TAX-ADM-001)
│   ├── HerhalendeKosten.gs     # Automatisch herhalende kosten boeken
│   ├── Verkoopfacturen.gs      # PDF-facturen genereren en e-mailen
│   ├── Menu.gs                 # GAS menu-definitie (onOpen)
│   └── [20+ andere .gs files]
├── licence-server/
│   ├── Code.gs                 # Licentieserver GAS Web App
│   └── appsscript.json
├── website/
│   ├── index.html              # Landingspagina boekhoudbaar.nl
│   ├── privacy.html            # AVG privacyverklaring
│   ├── voorwaarden.html        # Algemene voorwaarden (12 artikelen)
│   ├── 404.html                # Foutpagina (noindex)
│   ├── sitemap.xml
│   ├── robots.txt
│   ├── _headers                # Cloudflare Pages security headers
│   └── _redirects              # www → apex 301 redirect
├── tests/
│   └── unit/                   # Jest unit tests (111 tests, 4 suites)
├── scripts/
│   └── impact.js               # Symbool-impact analyse
├── .claude/
│   ├── repo-map.md             # Bestandsverantwoordelijkheden
│   ├── flow-maps.md            # Kritieke businessflows
│   ├── sheet-schemas.md        # Exacte kolomindelingen (0-based)
│   ├── invariants.md           # Gevaarszones en invarianten
│   └── test-map.md             # Welke tests dekken welke flows
├── CLAUDE.md                   # Verplicht werkprotocol voor AI
└── CONTEXT.md                  # Dit bestand
```

---

## Technische architectuur

### Hoofd-app (GAS)
- **Script ID:** *(zie `.clasp.json` in root)*
- **Deployment:** via `clasp push` in GitHub Actions (`.github/workflows/deploy.yml`)
- **Branch die CI/CD triggert:** `main` + `claude/google-forms-accounting-system-0N1Mx`

### Licentieserver (GAS Web App)
- **Script ID:** `1BCD4S3n9rL0zWDufqBpiGZotYw5ihJ6NSIyKRXSB3ji7BlN5M7pD-tRc`
- **Deployment ID:** `AKfycbyq5Xrvh4bFXkcjpjsdaPS-UJm3b7h-X7kGyfdTnDNcNS2brUX0q86pRU7Q2nSMCOWsMg`
- **URL:** `https://script.google.com/macros/s/[deployment-id]/exec`
- **Endpoints:**
  - `?actie=health` — gezondheidscheck (JSON)
  - `?actie=valideer&sleutel=XXX` — licentie valideren
  - `?actie=bedankt` — bedankpagina na betaling
  - `?actie=admin` — admin paneel (wachtwoord beveiligd)
  - default → betaalpagina met iDEAL/Mollie

### Betalingen
- **Mollie** — test API key: `test_j6zt7F42h3drBQQsfx2evx5pHHrWuD`
- **Webhook pattern:** Mollie POST → licentieserver → LockService + CacheService idempotency → maak licentie → stuur Brevo mail

### E-mail
- **Brevo** (primair, 300/dag gratis) — API key in GAS Script Properties als `BREVO_API_KEY`
- **MailApp** (fallback, 100/dag Google limiet)
- **Van-adres:** `hallo@boekhoudbaar.nl`

### Website
- **Cloudflare Pages** — branch `claude/google-forms-accounting-system-0N1Mx`, output dir `website/`
- **Domein:** `boekhoudbaar.nl` (geregistreerd Versio, DNS bij Cloudflare)
- **Status (april 2026):** DNSSEC uitgezet bij Versio, nameservers naar Cloudflare gezet, wachten op propagatie

---

## GAS Script Properties (licentieserver)

| Sleutel | Waarde |
|---------|--------|
| `MOLLIE_API_KEY` | `test_j6zt7F42h3drBQQsfx2evx5pHHrWuD` *(switch naar live key bij launch)* |
| `ADMIN_WACHTWOORD` | `BoekhoudAdmin2026!` |
| `PRODUCT_NAAM` | `Boekhouding Engine` |
| `PRODUCT_PRIJS` | `4900` *(in centen)* |
| `BREVO_API_KEY` | *(instellen in GAS Script Properties)* |
| `VAN_EMAIL` | `hallo@boekhoudbaar.nl` |
| `VAN_NAAM` | `Sam van Boekhoudbaar` |

---

## Belastingadvies-engine (`src/Belastingadvies.gs`)

Volledig geïmplementeerd voor 2025/2026:

**Zakelijk:**
- Zelfstandigenaftrek €2.470 (≥1.225 uur)
- Startersaftrek €2.123 (eerste 3 jaar)
- MKB-winstvrijstelling 12,70%
- KOR (omzet < €20.000)
- KIA 28% (€2.801–€353.973 investering)
- FOR 9,44% winst, max €10.786
- MIA/VAMIL 45,5% milieu-investeringen
- Thuiswerkaftrek €2,40/dag (uit instelling "Thuiswerk dagen per jaar")
- Reiskosten €0,23/km
- Representatiekosten 73,5% aftrekbaar
- Urencriterium voortgang (uit instelling "Gewerkte uren dit jaar")
- Privégebruik zakelijke middelen reminder
- Afschrijvingskandidaten scan (inkoopfacturen ≥ €450 op verkeerde rekening)

**Privé:**
- Lijfrente (30% premiegrondslag, max €35.987)
- Box 3 groensparen (€65.072 vrijstelling + 0,7% korting)
- Giftenaftrek ANBI (1–10% inkomen)
- Eigen woning hypotheekrente
- Zonnepanelen (BTW 0%, KIA + MIA, saldering t/m 2027)

**Proactief:** elke inkoopboeking ≥ €450 triggert audit-log entry voor afschrijving.

---

## Brevo follow-up sequenties (licentieserver)

Automatisch na activatie:

| Dag | Onderwerp |
|-----|-----------|
| 0 | Licentiesleutel + activatie-instructies |
| 3 | Eerste BTW-aangifte tips |
| 7 | Eerste factuur versturen |
| 14 | Belastingvoordelen die je misloopt |
| 30 | Maandcheck checklist |
| 60 | Kwartaal-BTW checklist |
| 90 | Besparing vs. abonnementen (retentie) |

**Na deployment eenmalig uitvoeren:** `installeelFollowUpTrigger_()` in de GAS-editor van de licentieserver.

---

## Juridisch (website)

- **Herroepingsrecht:** vervalt na activatie digitaal product (art. 6:230p lid 1 sub g en i BW) — klant vinkt checkbox aan op betaalpagina
- **Bestelknop tekst:** "Bestelling met betalingsverplichting — €49 via iDEAL" (art. 6:230v BW)
- **Twee herroepingscheckboxes** op betaalpagina (niet vooraangevinkt)
- **Bewaarplicht:** 7 jaar (art. 52 AWR) — automatisch geborgd in GAS audit log
- **KVK/BTW** in footer: nog placeholder `00000000` / `NL000000000B01` — invullen bij KVK-inschrijving

---

## Openstaande taken (bij april 2026)

### Acties die jij moet doen (niet door AI op te lossen):
- [ ] **Cloudflare Pages activeren** zodra nameserver propagatie klaar is:
  - Workers & Pages → Create → Pages → Connect to Git
  - Branch: `claude/google-forms-accounting-system-0N1Mx`, output: `website`
  - Eigen domein `boekhoudbaar.nl` + `www.boekhoudbaar.nl` koppelen
- [ ] **Mollie live API key** instellen (via Mollie dashboard → live modus)
- [ ] **BREVO_API_KEY** instellen in GAS Script Properties van licentieserver
- [ ] **KVK-inschrijving** voltooien, dan KVK/BTW invullen in footer (privacy.html, voorwaarden.html, index.html)
- [ ] **`installeelFollowUpTrigger_()`** eenmalig uitvoeren in GAS-editor licentieserver
- [ ] **OSS-registratie** via Mijn Belastingdienst Zakelijk
- [ ] **KvK SBI-codes** updaten: 62.01 (primair) + 58.29 (secundair)
- [ ] **`og-image.png`** maken (1200×630px) en uploaden naar `website/`

### Kan door AI worden gebouwd (volgende sessie):
- [ ] Helpcentrum (Docusaurus op `help.boekhoudbaar.nl`, top-20 FAQ)
- [ ] UptimeRobot monitors (4x: health endpoint, webhook, landing, help)
- [ ] Privacy + voorwaarden pagina's: KVK/BTW invullen zodra bekend
- [ ] `og-image.png` genereren via HTML canvas of extern tool

---

## Ontwikkelworkflow

```bash
# Symbool opzoeken:
node scripts/impact.js <functionName>

# Targeted tests:
npm run test:flow btw
npm run test:flow invoice
npm run test:flow herhalende
npm run test:unit

# Lint gewijzigde bestanden:
npm run lint:changed

# Volledige suite (alleen bij cross-cutting changes):
npm test

# Deploy (via CI — push naar branch):
git push origin claude/google-forms-accounting-system-0N1Mx
```

**Verplicht vóór elke wijziging:** lees `CLAUDE.md` — bevat het mandatoire werkprotocol.

---

## Kritieke gevaarszones

| Zone | Risico |
|------|--------|
| `installeelTriggers_()` in Setup.gs | Verwijdert ALLE triggers eerst |
| `volgendFactuurnummer_()` | Race condition — gebruikt LockService |
| Kolomindices in sheet-data | Off-by-one corrupt alle data stilletjes |
| `berekenBtwAangifte_` rubrieken | Fiscaal significant — r1a/r1b/r1d/r1e |
| BTW null vs 0 | `null` = vrijgesteld/verlegd ≠ `0` = nultarief |
| `setup()` opnieuw uitvoeren | Geblokkeerd door idempotency guard (correct) |

---

## Commit-conventies

```
feat(module): korte beschrijving
fix(module): wat en waarom
chore: niet-functionele wijziging

Altijd eindigen met:
https://claude.ai/code/session_013uKV3SRNj18fLuVmxs4N8n
```

---

## Snel starten in nieuwe AI-sessie

Geef deze prompt:

> "Lees CONTEXT.md en CLAUDE.md in de root van /home/user/boekhouding-engine.
> Dit is een Google Apps Script boekhoudpakket verkocht als boekhoudbaar.nl.
> De actieve development branch is `claude/google-forms-accounting-system-0N1Mx`.
> [Beschrijf hier je taak]"

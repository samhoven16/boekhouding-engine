# Boekhoudbaar

**Volledige ZZP-boekhouding in Google Sheets — eenmalig €49, geen abonnement.**

[`boekhoudbaar.nl`](https://www.boekhoudbaar.nl) · [privacy](https://www.boekhoudbaar.nl/privacy) · [voorwaarden](https://www.boekhoudbaar.nl/voorwaarden) · [contact](mailto:hallo@boekhoudbaar.nl)

---

## Wat het is

Boekhoudbaar is een boekhoudengine voor ZZP en eenmanszaak die volledig draait in **jouw eigen Google Spreadsheet** op **jouw Google Drive**. Je koopt eenmalig een licentie (€49), activeert de software in een kopie van de master-template, en werkt vervolgens zonder cloud-afhankelijkheden van ons.

- Facturen (PDF + e-mail), BTW-aangifte per kwartaal, dashboard, balans/W&V/cashflow
- Alle boekhouddata blijft op **jouw** Drive; wij hebben er geen toegang toe
- Geen abonnement, geen vendor lock-in
- Google Apps Script onder de motorkap — je ziet wat er gebeurt

Meer over wat je krijgt: [www.boekhoudbaar.nl](https://www.boekhoudbaar.nl).

---

## Repo-structuur

```
boekhouding-engine/
├── src/                    Apps Script van de klant-kopie (master template)
│   ├── Menu.gs             onOpen + hoofdmenu
│   ├── Setup.gs            Eerste-keer setup, tabbladen, Drive-structuur
│   ├── Licentie.gs         Licentievalidatie, OTP-activering, kopieerbeveiliging
│   ├── Boekingen.gs        Dubbel-boekhouding-engine (RGS-schema)
│   ├── Verkoopfacturen.gs  Facturen, PDF-generatie, e-mail
│   ├── BTW.gs              BTW-aangifte per kwartaal (rubrieken 1a t/m 5d)
│   ├── Dashboard.gs        KPI-dashboard
│   ├── Rapportages.gs      Balans, W&V, cashflow, jaarrekening
│   └── …                   (zie .claude/repo-map.md voor de volledige map)
│
├── licence-server/         Apps Script web-app in eigen Google-account
│   └── Code.gs             Mollie-webhook, OTP-server, CRM-sheet, config-endpoint
│
├── website/                Cloudflare Pages — marketing + juridisch
│   ├── index.html          Landing (pricing, FAQ, oprichter)
│   ├── privacy.html
│   ├── voorwaarden.html
│   └── …
│
├── tests/                  Jest — 122 tests, unit + integration
├── .github/workflows/      Lint, test, clasp push (Apps Script deploy)
└── CLAUDE.md / CONTEXT.md / INFRA.md   Intelligence voor AI-ondersteund werk
```

---

## Licentie en eigenaarschap

- **Uitgever**: Hoven Strategy & Solutions (KVK 87254697, Utrecht)
- **Code-licentie**: dit is een **source-available** repo. Je mag de code lezen, auditen en begrijpen hoe het werkt. **Commercieel hergebruiken of forken als eigen product** is niet toegestaan zonder schriftelijke toestemming.
- **Product-licentie (€49)**: geeft je persoonlijk gebruiksrecht op één administratie — zie [Algemene Voorwaarden](https://www.boekhoudbaar.nl/voorwaarden).

Issues en kleine verbeter-PRs zijn welkom voor bugs en typo's. Grotere features eerst per e-mail bespreken.

---

## Technische details

### BTW-wetgeving (NL)

| Tarief | Scope |
|---|---|
| 21% | Standaard |
| 9% | Verlaagd (voedsel, boeken, geneesmiddelen) |
| 0% | Nultarief (export, IC-leveringen) |
| Vrijgesteld | Onderwijs, gezondheidszorg |
| Verlegd | BTW verlegd naar afnemer |
| KOR | Kleine Ondernemersregeling (< €20.000 omzet) |

Aangifte-deadlines: Q1 30 apr · Q2 31 jul · Q3 31 okt · Q4 31 jan.

### Benodigde OAuth-scopes (klant-kopie)

- `spreadsheets` — sheet lezen/schrijven
- `forms` — Google Form voor boekingen
- `drive.file` / `drive` — PDF-opslag in klant-Drive
- `gmail.send` — facturen versturen namens de klant
- `script.scriptapp` — triggers installeren

### Triggers

- `onOpen` — menu aanmaken
- `onFormSubmit` — boekingen verwerken
- Dagelijks 08:00 — vervallen facturen, BTW-deadlines
- Dagelijks 09:00 — follow-up-e-mails (dag 3/7/14/30/60/90) via Brevo

---

## Development

Vereisten: Node 22, `npm ci`.

```bash
npm test               # 122 Jest-tests
npm run test:flow      # targeted flow-tests (zie CLAUDE.md)
npm run lint           # ESLint op src/**/*.gs
npm run index          # regenereer symbol-index.json
node scripts/impact.js <functieNaam>   # impact-analyse
```

Deploy gaat via `.github/workflows/deploy.yml` — `clasp push` op push-naar-`main`.

### Local intelligence

De map `.claude/` bevat repo-map, flow-maps, sheet-schemas en invariants die beschrijven hoe het systeem in elkaar zit. Lees deze vóór een bijdrage; ze voorkomen 80% van de context-rework.

---

## Contact

- **Hallo / support** — [hallo@boekhoudbaar.nl](mailto:hallo@boekhoudbaar.nl)
- **Security** — mail naar hetzelfde adres met onderwerp "Security"
- **Website** — [www.boekhoudbaar.nl](https://www.boekhoudbaar.nl)

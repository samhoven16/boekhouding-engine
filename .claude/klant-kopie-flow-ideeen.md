# Toekomst-ideeën — Klant kopie-flow + licentie-engine

> Dit bestand verzamelt ideeën voor het automatische kopie-flow systeem.
> Niet nu implementeren — eerst hoofdproduct afmaken.
> Bij elke nieuwe iteratie hier ideeën aanvullen.

## Doel

Klant koopt op website → ontvangt automatisch een werkende kopie van Boekhoudbaar (gelinkt/gesynchroniseerd met master) → ontvangt mail met activatie-licentie via licentie-engine.

## Onderzochte routes (techniek)

### Route A: Master template + DriveApp.copy()
- **Hoe**: na betaling triggert backend een Apps Script web-app endpoint dat `DriveApp.getFileById(MASTER_ID).makeCopy(klantNaam, klantFolder)` doet en kopieert dan naar de klant-folder + share met klant-email
- **Pro**: simpel, native Google API, wordt al gedaan
- **Con**: kopie krijgt geen Script Properties van master mee (kopie-detectie werkt) MAAR ook geen LICENTIE_SERVER_URL → kopie kan niet activeren tenzij setup een fallback heeft
- **Fix**: na kopie-creatie API-call doen om initialiseer-properties (LICENTIE_SERVER_URL) in de kopie te zetten

### Route B: Apps Script Library (gedeelde code)
- **Hoe**: master-code als published Apps Script Library; elke klant-kopie laadt code uit library i.p.v. eigen kopie van code
- **Pro**: code-updates komen automatisch bij alle klanten zonder hercopy
- **Con**: complex te debuggen, library-versie-mismatches mogelijk, Google rate-limits
- **Niet dit jaar** — overweeg in v3.0

### Route C: Native Google Workspace Marketplace add-on
- **Hoe**: publiceer als Workspace Marketplace add-on i.p.v. spreadsheet-template
- **Pro**: Google handelt distributie + updates af; auto-installs; naadloze billing via Marketplace
- **Con**: review-proces (weken-maanden), Marketplace-fees, beperkte custom UI
- **Lange-termijn doel** — past niet bij huidige roadmap maar ooit overwegen

### Route D (huidige aanpak): Master sjabloon + manual share-link
- Klant klikt link → "Maak een kopie" → krijgt eigen kopie
- Probleem: geen automatisering, geen koppeling met betaal-flow

## Aanbevolen architectuur (route A uitgewerkt)

```
[Klant koopt op boekhoudbaar.nl]
        ↓
[Stripe/Mollie webhook → backend]
        ↓
[Backend roept licentie-engine endpoint aan]
   POST /api/maak-klant-kopie
   { email: 'klant@bedrijf.nl', naam: 'Klant BV', orderId: '...' }
        ↓
[Apps Script web-app endpoint]
   1. DriveApp.getFileById(MASTER_ID).makeCopy('Boekhouding ' + klant_naam)
   2. DriveApp.getFileById(kopieId).addEditor(klant_email)
   3. SpreadsheetApp.openById(kopieId).getRange(...).setValue(klant_naam)
   4. ScriptApp.newTrigger() in kopie? (kan alleen vanuit kopie zelf — Pro Tip)
   5. Genereer licentie-token, stuur naar licentie-server
        ↓
[Licentie-server slaat op: { ssId, klantEmail, token, status='actief' }]
        ↓
[Backend stuurt mail naar klant]
   - Link naar kopie (= klant's eigen Google Sheet)
   - 6-cijferige activatie-OTP
        ↓
[Klant opent sheet → onOpen → controleerLicentieEnKopie_]
   - Kopie-detectie: SS_ID matcht NIET master → vraag activatie
   - Klant voert email + OTP in via dialog
   - aanvraagOtp + activeerMetOtp werken via licentie-server
        ↓
[Klant aan de slag]
```

## Open vraag: synchronisatie master ↔ kopieën

User wil "kopie wat gelinkt/synchroniseert met hoofd boekhoudbaar". Dat kan niet 1-op-1 — Sheets is geen relationele DB. Wel mogelijk:

1. **Code-updates pushen**: clasp-script die naar alle kopie-IDs pusht (vereist lijst van kopie-IDs in licentie-server). Hangt vast op wie eigenaar is van het Apps Script-project.
2. **Library-route** (route B) — code centraal, kopieën halen versie op.
3. **Webhook config-fetch** (huidig: `haalConfigOp_`): kopieën halen periodiek runtime-config (BTW-tarieven, server-overrides). **Werkt al** — dit is de praktische sync-route. Hier kunnen we ook nieuwe TIPS/regelgevingen pushen zonder code-deploy per kopie.

**Aanbeveling**: route B is overkill. Route A (kopie + config-fetch) is praktisch.

## Concrete implementatie-stappen (later)

### Fase 1 — Backend
1. Stripe/Mollie webhook handler (klant-koop event)
2. License-server endpoint `POST /api/maak-klant-kopie`:
   - Input: email, naam, orderId
   - Output: { kopieId, ssId, otp, mailGestuurd }
3. License-server endpoint `GET /api/config`:
   - Voor `haalConfigOp_` — geeft runtime-config (tax-rates, prijs-overrides)

### Fase 2 — Apps Script web-app (in master-project)
1. Functie `apiMaakKlantKopie(payload)` die:
   - Authenticeert request (HMAC met shared secret)
   - DriveApp.makeCopy + addEditor
   - Schrijft initialiseer-properties in kopie (LICENTIE_SERVER_URL etc.)
   - Stuurt OTP-mail
2. Functie `apiConfig(req)` die runtime-config terugstuurt

### Fase 3 — Email-template
- Onboarding-mail met:
  - Begroeting met klant-naam
  - Link naar kopie ("Open uw boekhouding")
  - 6-cijferige OTP
  - Activatie-instructies (3 stappen)
  - Support-contact

### Fase 4 — Klant-flow
- Eerste open van kopie → activatie-dialog (bestaat al)
- Klant voert email + OTP in → kopie krijgt licentie-token
- Setup draait automatisch
- Welkom-modal met fiscaal-profiel-wizard (bestaat al)

### Fase 5 — Master ↔ kopieën sync
- License-server houdt registry: { kopieId → klantEmail, status, laatstActief, versie }
- Master kan via API "broadcast"-update versturen (bv. "nieuwe seizoens-tip toevoegen")
- Kopieën halen via `haalConfigOp_` periodiek runtime-config op (geen code-update — alleen data)

### Fase 6 — Code-updates naar alle kopieën
- **Probleem**: elke klant-kopie heeft eigen Apps Script project
- **Optie 1**: clasp-script dat met owner-credentials naar elke `kopieId` pusht (bulk deploy)
- **Optie 2**: code-versie alleen in master, klanten gebruiken master-code via `eval(remote)` — lelijk en onveilig
- **Optie 3**: bij grote update klant via mail vragen "klik hier voor upgrade" → triggert remote update via web-app
- **Aanbeveling**: optie 1 met audit-trail wie wat heeft gepusht

## Beveiligings-overwegingen

- License-server endpoints moeten HMAC-signed zijn (niet open)
- Master sjabloon mag NOOIT klant-data hebben (alleen demo/leeg)
- Klant-kopie moet NOOIT master-credentials kunnen lekken
- Kopie-detectie blijft kritiek: huidige `LICENTIE_SS_ID_KEY` check is goed
- OTP moet kort-leven (max 15 min) en éénmalig

## Roadmap

1. **Nu**: hoofdproduct afmaken (audit + features) — DEZE PRIORITEIT
2. **Q1 next**: backend Stripe-webhook + license-server endpoints
3. **Q2 next**: Apps Script web-app `apiMaakKlantKopie` + email-template
4. **Q3 next**: integratie + eerste klanten via geautomatiseerde flow
5. **Q4+**: code-update-bulk-deploy + library-onderzoek

---

## Notes per ronde

### 2026-05-04 (eerste ronde)
- Issue: eigenaar kan niet in eigen master door licentie-blocker
- Quick fix: hard-coded ADMIN_EMAILS + auto-bypass als geen server URL
- Future: bovenstaande architectuur uitwerken

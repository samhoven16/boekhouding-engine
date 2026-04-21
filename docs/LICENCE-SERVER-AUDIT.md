# Licence-server audit

> Doel: vaststellen welk deel van "betaling → sheet → license → klaar" al
> bestaat en welke gaten er nog zijn — zonder nieuwe systemen te bouwen.
> Samengesteld na lezing van `licence-server/Code.gs` (858 regels),
> `src/Installer.gs`, `src/Licentie.gs`.

---

## 1. Bestaande onderdelen

### 1.1 `licence-server/Code.gs` (Apps Script Web App — jouw account)

Script Properties (sommige verplicht, sommige optioneel):

| Property | Wat | Verplicht |
|---|---|---|
| `LICENTIE_SHEET_ID` | CRM-sheet ID | Ja — auto-aangemaakt bij eerste request |
| `MOLLIE_API_KEY` | Mollie `test_xxx` / `live_xxx` | Ja voor checkout |
| `ADMIN_WACHTWOORD` | Login admin-paneel | Ja |
| `PRODUCT_NAAM`, `PRODUCT_PRIJS` | Display op checkout | Defaults aanwezig |
| `TEMPLATE_SS_ID` | Master-template spreadsheet ID — target van de "Maak een kopie"-link | **Ja, maar niet default** |
| `INSTALLER_URL` | URL van `Installer.gs` web-app (alternatief flow) | Optioneel |
| `BREVO_API_KEY`, `VAN_EMAIL`, `VAN_NAAM` | Transactionele e-mail via Brevo; fallback = `MailApp.sendEmail` | Optioneel |

Endpoints via `doGet(?actie=…)`:

| Actie | Wat | Caller |
|---|---|---|
| *(geen)* | Betaalpagina (iDEAL-knop) | Browser — klant |
| `health` | JSON: `{status, version, licenses, mollie}` | Monitoring |
| `valideer` | Licentie-validatie | Klant-kopie (`valideerLicentieOpServer_`) |
| `aanvraag-otp` | 6-cijferige activeringscode mailen | Klant-kopie dialoog |
| `activeer-otp` | OTP controleren + binden aan spreadsheet-ID | Klant-kopie dialoog |
| `bedankt` | Post-Mollie-redirect pagina | Mollie |
| `admin` | Beheerpaneel (wachtwoord) | Jij |

Plus `doPost` = Mollie-webhook.

### 1.2 CRM-sheet schema (auto-aangemaakt)

Naam: **"Boekhouding Engine — Licentiebeheer"** (Sheet 1).

| Kolom | Naam | Set bij |
|---|---|---|
| 0 | Sleutel | webhook |
| 1 | Naam | webhook |
| 2 | Email | webhook |
| 3 | Versie (tier) | webhook (`"Standaard"`) |
| 4 | Status (`Actief`/`Ingetrokken`) | webhook |
| 5 | Vervaldatum | handmatig |
| 6 | Installatie-ID / Spreadsheet-ID | eerste OTP-activatie |
| 7 | Aangemaakt op | webhook |
| 8 | Mollie betaling ID | webhook |
| 9 | Laatste validatie | valideer / activeer-otp |

Dit ís de CRM — enkele bron van waarheid. Staat al in persoonlijke Drive (via `setupLicentieSheet()` → `SpreadsheetApp.create`).

### 1.3 Post-purchase automatisering

```
Mollie webhook (doPost) ──▶ verwerkMollieWebhook_
                              │
                              ├── lock + cache-idempotency
                              ├── fetch status bij Mollie (paid?)
                              ├── genereer sleutel (BKHE-XXXX-XXXX-XXXX)
                              ├── append row in licentie-sheet
                              ├── stuurLicentiemail_(naam, email, sleutel)
                              │    └── e-mail met /copy-link naar TEMPLATE_SS_ID
                              └── maakBrevoContact_() voor follow-ups
```

Bestaand en werkend, mits `TEMPLATE_SS_ID` ingesteld.

### 1.4 Template-kopie naar klant-Drive

Geen aparte installer-flow nodig: e-mail bevat  
`https://docs.google.com/spreadsheets/d/${TEMPLATE_SS_ID}/copy`.  
Google maakt de kopie inclusief gebonden Apps Script-code naar de klant zijn eigen Drive.

### 1.5 Activatie in klant-kopie (`src/Licentie.gs` + `src/Menu.gs`)

Bij eerste open draait `onOpen` → `controleerLicentieEnKopie_`:
- Geen sleutel? → activatie-dialoog (e-mail → OTP → binden aan spreadsheet-ID).
- Sleutel aanwezig, andere spreadsheet-ID? → kopie-detectie → alle sheets protected, alleen "licentie activeren" menu.
- Sleutel geldig → 1×/dag stille server-validatie.

### 1.6 Bonus: Brevo drip-sequence

`verwerkFollowUpEmails` + `FOLLOWUP_SCHEMA` = e-mails op dag 3/7/14/30/60/90 na activatie. Dagelijkse trigger, idempotent per licentie/dag.

### 1.7 `src/Installer.gs` — alternatief onboardingsformulier

Web-app met formulier (sleutel + bedrijfsnaam + e-mail) → valideert licentie → retourneert de `TEMPLATE_SS_ID/copy?title=...` link. Wordt **niet** gebruikt door de primaire flow (die verloopt direct via de e-mail-copy-link). Lijkt restant van een eerder pad.

---

## 2. Dekking vs MVP-doel "betaling → sheet → license → klaar"

| Stap | Status |
|---|---|
| 1. Klant betaalt via iDEAL op `/kopen` | ✅ `betaalPagina_` + `maakBetaling` |
| 2. Mollie webhook zet klant in CRM | ✅ `verwerkMollieWebhook_` |
| 3. Licentie wordt gegenereerd | ✅ `genereerSleutel_` |
| 4. E-mail met copy-link gaat uit | ✅ `stuurLicentiemail_` (mits `TEMPLATE_SS_ID`) |
| 5. Kopie verschijnt in klant-Drive | ✅ Google `/copy` |
| 6. Kopie detecteert dat activatie nodig is | ✅ `controleerLicentieEnKopie_` |
| 7. OTP-flow bindt licentie aan spreadsheet | ✅ `aanvraag-otp` + `activeer-otp` |
| 8. `setup()` draait automatisch na activatie | ✅ (via `controleerOnboarding_` in `Menu.gs`) |

**De hele keten bestaat al end-to-end.** Er is geen fundamentele gap — het is een distributie-/config-probleem, geen ontwikkel-probleem.

---

## 3. Risico's + kleine gaps

Dit is wat er mis kán gaan, in volgorde van impact:

### 🔴 Blokkerend

1. **`TEMPLATE_SS_ID` niet ingesteld** — E-mail valt terug op een melding "Je ontvangt binnenkort een link", klant zit vast.  
   `setupLicentieSheet()` zet wél defaults voor `PRODUCT_NAAM`, `MOLLIE_API_KEY`, `ADMIN_WACHTWOORD`, maar **niet** voor `TEMPLATE_SS_ID`.  
   → **Fix:** `healthEndpoint_` moet `templateReady: true/false` teruggeven; admin-paneel moet een waarschuwing tonen als `TEMPLATE_SS_ID` ontbreekt.

2. **Geen feedback-loop na onboarding** — CRM weet dat OTP is geactiveerd (kolom 9 `Laatste validatie`), maar niet of `setup()` daadwerkelijk succesvol is doorlopen in de klant-kopie. Als setup faalt (quota / permissions), zie je dat pas bij een support-ticket.  
   → **Fix:** klant-kopie meldt na geslaagde `setup()` éénmalig aan de licence-server: endpoint `?actie=onboarded&sleutel=…`. Server zet kolom "Onboarded op" in CRM.

### 🟡 Cosmetisch / alignment

3. **Twee onboarding-paden** — `stuurLicentiemail_` stuurt simpele `/copy`-link; `src/Installer.gs` is een tweede pad via een web-form. Alleen pad 1 wordt getriggerd. Pad 2 is 400+ regels dode code.  
   → **Fix:** één commit om `src/Installer.gs` + `INSTALLER_URL`-referenties te schrappen (of bewust te markeren als "niet in gebruik").

4. **Nog geen `config`-endpoint** — valideer-endpoint retourneert `{geldig, naam, versie}`. Voor ChatGPT's patroon ("config-gedreven upgrade zonder klantcode aanpassen") heb je `?actie=config` nodig dat bv. `{versie_laatst: "2.3.0", flags: {...}}` teruggeeft. Klant-kopie leest en stuurt op basis daarvan.  
   → **Fix:** klein endpoint; optioneel voor MVP.

5. **Placeholder-waarden in e-mails** — `KVK 00000000` en `vanNaam="Sam van Boekhoudbaar"` zitten hardcoded in `stuurLicentiemail_`. Werkt, maar niet klaar voor productie.  
   → **Fix:** uit Script Properties trekken.

### 🟢 Later

6. **Admin-paneel is minimaal** — toont alleen een tabel. Geen filters op status, geen "onboarded vs niet-onboarded" overzicht.
7. **Geen self-service licence-opzeggen** — alleen jij kunt status op "Ingetrokken" zetten vanuit de spreadsheet.

---

## 4. Voorgestelde PR-volgorde (alles klein)

Elk punt = 1 kleine, losstaande PR.

1. **`TEMPLATE_SS_ID`-guard** — admin-paneel rode banner + `healthEndpoint_.templateReady`.
2. **`onboarded`-callback** — klant-kopie meldt eerste geslaagde `setup()` aan server; server schrijft kolom "Onboarded op" in CRM.
3. **Dode code weg** — schrap `src/Installer.gs` + `INSTALLER_URL`-referenties als alleen flow-1 gebruikt wordt.
4. **Config-endpoint** — `?actie=config` → `{versie, flags}`. Klant-kopie cached 24u, toont banner als versie afwijkt.
5. **Placeholders uit Script Properties** — `KVK`, `VAN_EMAIL_SUPPORT`, etc.
6. **Admin-paneel opschonen** — filters + onboarded-view.

Alles zonder self-update, polling of library-pattern — conform ChatGPT-kritiek.

---

## 5. Eén-zinnig antwoord op je oorspronkelijke vraag

> *"Ik wil een CRM/ERP sheets die automatisch is gekoppeld en waarin de
> licentie engine ook zit."*

**Die heb je al.** Hij heet `Boekhouding Engine — Licentiebeheer`, staat in jouw Drive, wordt auto-aangemaakt door `setupLicentieSheet()`, gevoed door de Mollie-webhook, en gelezen door zowel `valideer-` als de twee OTP-endpoints. De resterende klussen zijn kleine *plumbing*, geen architectuur.

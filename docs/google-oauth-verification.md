# Google OAuth-verificatie — submission-playbook

> Eén bron-van-waarheid voor het indienen van Boekhoudbaar bij Google's OAuth
> brand-/scope-verificatie. Doel: in één keer goedgekeurd, geen heen-en-weer.
>
> Bijgewerkt: 2026-06-16. Scopes geverifieerd tegen `src/appsscript.json`.

---

## 0. Stand van zaken

| Onderdeel | Status |
|-----------|--------|
| Restricted scopes verwijderd (`gmail.send`→`script.send_mail`, `drive`→`drive.file`) | ✅ op `main` |
| → Gevolg: **gratis** brand-verificatie, **geen CASA-assessment** (Tier 3) | ✅ |
| Privacybeleid met expliciete scope-disclosure op geverifieerd domein | ✅ live (`/privacy`) |
| Minimale scopes (least privilege) | ✅ |
| Demo-video | ⛔ jij — zie §6 |
| Reviewer test-toegang langs de licentie-gate | ⛔ jij — zie §7 (de kern) |
| Search Console-eigendom + consent-scherm (logo/naam/mail) | ⛔ jij — zie §3–§5 |

**De grootste resterende afkeur-risicofactor:** `script.projects` (zelf-modificerende
code). Zie §2. Overweeg self-update uit te zetten voor de eerste verificatie als
je het risico wilt minimaliseren.

---

## 1. Welke verificatie en waarom

De app vraagt **sensitive** scopes (`spreadsheets`, `forms`, `script.projects`)
maar **geen restricted** scopes. Daarom:

- **Wel** nodig: brand-verificatie + sensitive-scope-review (zelfverklaring,
  demo-video, justificaties). Gratis.
- **Niet** nodig: CASA Tier 2/3 beveiligingsaudit (alleen bij restricted scopes
  zoals volledige Gmail/Drive — die gebruiken we bewust niet).

Bevestigd door guard-test `tests/unit/drive-file-scope.test.js`: geen enkele
restricted scope in het manifest.

---

## 2. Scopes & justificaties (klaar om te plakken)

Huidig manifest (`src/appsscript.json`):

| Scope | Gevoeligheid | Justificatie nodig? |
|-------|--------------|---------------------|
| `spreadsheets` | **sensitive** | ✅ |
| `forms` | **sensitive** | ✅ |
| `script.projects` | **sensitive** | ✅ |
| `drive.file` | niet-sensitive (per-file) | nee |
| `script.send_mail` | niet-sensitive (alleen verzenden) | nee |
| `script.external_request` | niet-sensitive | nee |
| `script.container.ui` | niet-sensitive | nee |
| `script.scriptapp` | niet-sensitive | nee |

### Per-scope justificatie (Engels, voor het verificatieformulier)

**`https://www.googleapis.com/auth/spreadsheets`**
> Boekhoudbaar is a bookkeeping add-on bound to the user's own Google
> Spreadsheet. This scope reads and writes that spreadsheet — recording
> invoices, journal entries and VAT records the user enters. The full scope
> (not `spreadsheets.currentonly`) is required because the app's scheduled
> time-driven triggers (marking overdue invoices, sending payment reminders,
> checking VAT deadlines) run without an active document and must open the
> user's spreadsheet by its stored ID. No spreadsheets other than the user's
> own bound file are accessed.

**`https://www.googleapis.com/auth/forms`**
> The app provisions and reads a single Google Form that lets the user submit
> income and expense entries quickly from their phone. This scope creates that
> form during setup and reads its responses so they can be turned into
> bookkeeping entries. The script is spreadsheet-bound and opens its own form
> by ID; no other forms are accessed.

**`https://www.googleapis.com/auth/script.projects`**
> Used only for the user-initiated "Update now" menu action, which installs a
> newer version of Boekhoudbaar into the user's own copy of the script via the
> Apps Script API. Updates are never automatic — they require an explicit click
> by the user — and each update bundle is verified with a SHA-256 signature
> before being applied. The app does not read or modify any other Apps Script
> projects.

> ⚠️ **Let op `script.projects`:** dit is de scope die de meeste scrutiny
> trekt (een app die haar eigen code kan herschrijven). Twee opties:
> (a) bovenstaande justificatie robuust verdedigen, of (b) de self-update-
> functie uitschakelen voor de eerste verificatie en later los toevoegen.

---

## 3. OAuth consent screen — exacte console-waarden

| Veld | Waarde |
|------|--------|
| App name | `Boekhoudbaar` |
| User support email | `info@boekhoudbaar.nl` (leeft als AVG-contact in `/privacy` — moet gemonitord worden) |
| App logo | 120×120 PNG — zie §4 |
| App home page | `https://boekhoudbaar.nl/` |
| App privacy policy link | `https://boekhoudbaar.nl/privacy` |
| App terms of service link | `https://boekhoudbaar.nl/voorwaarden` |
| Authorized domain | `boekhoudbaar.nl` |
| Developer contact information | jouw gemonitorde e-mailadres |

Alle drie de URL's resolven (de site doet `/privacy` → `/privacy/` via 301).
Geen 404 = ✓.

---

## 4. Logo-spec (consent screen)

Het officiële brand-icoon staat in `website/favicon.svg`: navy afgeronde
vierkant (`#0D1B4E`), zes balken met de 3e in cyaan (`#2EC4B6`), **geen pijltje**.
Het pijltje + de tekst zitten alléén in de bredere wordmark (`website/logo.svg`).

**Gebruik voor het consent-scherm:**
- ✅ De variant met **witte balken + één cyane balk + afgeronde hoeken + ZONDER
  pijltje** — dit is letterlijk je favicon → airtight consistentie
  (consent-scherm ↔ browser-tab ↔ website-header delen hetzelfde icoon).
- ✅ **PNG**, niet JPG (platte kleuren + scherpe balkranden; JPG geeft halo's).
- ✅ **Massieve navy achtergrond** behouden — niet transparant (witte balken
  verdwijnen anders op Google's witte achtergrond).
- ✅ 120×120, vierkant, < 1 MB.
- ❌ Niet de pijltje-variant (= wordmark-versie) en niet de lavendel-balk-variant
  (te laag contrast op klein formaat).

---

## 5. Domein & Search Console

- Verifieer een **Domain**-property `boekhoudbaar.nl` in Search Console (dekt
  www én non-www; de site canonicaliseert naar `www`, de lock-dialoog linkt naar
  non-www — een Domain-property dekt beide).
- **Zelfde Google-account** als de eigenaar van het GCP-project, anders stopt de
  verificatie.
- Logo op consent-scherm = logo op site (✓ via favicon, §4).

---

## 6. Demo-video — shotlist (ononderbroken opname, geen cuts)

1. Start op de **landingspagina** `https://boekhoudbaar.nl/` — toont wat de tool
   doet (geen login-muur).
2. Ga naar de (test-)Boekhoudbaar-sheet en trigger de eerste actie.
3. **Het OAuth-toestemmingsscherm** verschijnt — houd de **browser-URL-balk
   zichtbaar** zodat het `client_id` van het GCP-project in beeld is. Toon de
   scopes. Klik **Toestaan**.
4. Toon de app **daadwerkelijk werkend met de data**: maak een factuur → PDF
   verschijnt in Drive; voer een uitgave in via het Formulier; toon het
   dashboard/BTW dat meebeweegt.
5. Toon dat de data in de **eigen Sheet/Drive** van de gebruiker staat.

Géén knip tussen landing → inloggen → consent → gebruik.

---

## 7. Reviewer test-toegang — DE KERN

**Probleem:** de app vergrendelt niet-geactiveerde kopieën. Een reviewer die het
template kopieert krijgt `vergrendelKopie_()` → alle tabbladen read-only + een
"Koop een licentie — €49"-dialoog (`src/Licentie.gs`). Activatie is OTP (code per
e-mail). De owner-bypass vuurt alléén als `owner == ingelogde gebruiker`. Een
reviewer komt er dus **niet** langs → directe afkeuring ("could not access
functionality").

**Oplossing (geen code-wijziging — de licentie-gate is revenue-kritisch):**

1. Maak een **dedicated test-Google-account** (verse @gmail).
2. Genereer een **gratis test-licentiesleutel** via de licentieserver — de
   functie bestaat al: "Handmatig een licentiesleutel genereren (bijv. voor een
   gratis of kortingsexemplaar)" (`licence-server/Code.gs`).
3. Activeer in dat test-account een Boekhoudbaar-kopie met die sleutel (vooraf,
   zodat alles werkt).
4. Vul in het verificatieformulier het veld **test credentials** in: e-mail +
   wachtwoord van het test-account + 2 regels uitleg ("open deze sheet → menu
   Boekhoudbaar → ..."). **Nooit** "koop een licentie" en **geen** OTP naar een
   inbox die de reviewer niet kan lezen.

Datzelfde account/flow is meteen je demo-video-opname (§6).

---

## 8. Pre-submit checklist (tegen de 5 afkeurredenen)

- [ ] **Privacybeleid** op geverifieerd domein, scope-disclosure aanwezig,
      publiek (geen login). ✅ live — controleer dat `/privacy` resolved.
- [ ] **Demo-video** met zichtbare URL-balk (client_id), volledige flow, geen
      cuts. (§6)
- [ ] **Scopes** minimaal; per sensitive scope een justificatie geplakt. (§2)
- [ ] **Branding**: Search Console Domain-eigendom = GCP-eigenaar; logo = site;
      app-naam = `Boekhoudbaar`. (§3–§5)
- [ ] **Technisch/functioneel**: alle console-links resolven (geen 404);
      support-mail leeft; **reviewer test-credentials** geleverd. (§7)

---

## 9. Veelgemaakte misvattingen (bewust NIET doen)

- ❌ *"Hardcoded `samhoven16@gmail.com` in de broncode is een OAuth-blocker."*
  Onjuist — Google reviewt het consent-scherm/scopes/privacy/demo, **niet je
  broncode**. (Het is wél een security-SPOF; aparte track, los van OAuth.)
- ❌ *"Vermijd `drive.file`."* Onjuist voor ons — `drive.file` is juist de
  **smalste** Drive-scope (alleen door-de-app-gemaakte bestanden) en
  niet-sensitive. We zijn er bewust **naartoe** gemigreerd.
- ❌ *"Canonical trailing-slash mismatch repareren voor de review."* Cosmetische
  SEO, nul OAuth-impact.
- ❌ Drie support-mailadressen over de hele site consolideren *omwille van de
  review.* Google checkt alleen of het mailadres op het consent-scherm leeft.

---

## Referenties

- Manifest: `src/appsscript.json`
- Licentie-gate: `src/Licentie.gs` (`controleerLicentieEnKopie_`, `vergrendelKopie_`)
- Self-update (`script.projects`): `src/UpdateApply.gs`, `src/UpdateBundle.gs`
- Sleutel-generatie: `licence-server/Code.gs`
- Scope-guard: `tests/unit/drive-file-scope.test.js`

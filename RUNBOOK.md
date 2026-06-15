# Boekhoudbaar — Operations Runbook

**Doel**: één document dat een opvolger (familielid, collega, koper) in 30 minuten begrijpt om Boekhoudbaar draaiende te houden ALS Sam onbeschikbaar wordt (vakantie, ziekte, account-lock, overlijden).

Dit is jouw "dead-man-switch"-instructies. Werk dit bij elke architecturele wijziging bij.

---

## 1. Wat er minimaal moet werken voor klanten

| Component | Wat klanten zien als het stopt | Recovery-tijd-budget |
|---|---|---|
| **klant-sheet** | Werkt voor altijd — geen actie nodig | n.v.t. |
| **license-server `/exec`** | Klanten kunnen niet validaten | 90 dagen grace, daarna lockout |
| **boekhoudbaar.nl** | Geen nieuwe klanten + 404 op support-links | Onbeperkt voor bestaande klanten |
| **Mollie API key** | Geen iDEAL-links op nieuwe facturen | Klanten kunnen handmatig overmaken |
| **Gemini API key (per klant)** | AI-bonscan uit voor klant | Klant zet eigen key via menu |

**90 dagen grace** op licence-server is bewust ruim: bij ziekenhuis-opname of accountlockout heeft Sam (of opvolger) genoeg tijd om recovery te doen.

---

## 2. Kritieke secrets — waar staan ze, hoe roteren

### Sam-only ScriptProperties (license-server)

Toegang: Apps Script editor van de license-server-sheet (alleen Sam's Google-account).

| Property | Bron | Rotatie-impact |
|---|---|---|
| `MOLLIE_API_KEY` | mollie.com → API keys → Live key | Nieuwe key → bestaande betalingen blijven werken |
| `BREVO_API_KEY` | brevo.com → Settings → SMTP & API | OTP-mails switchen direct |
| `TEMPLATE_SS_ID` | Drive ID van master-template | Wijzigen breekt activatie-mail voor NIEUWE klanten |
| `ADMIN_WACHTWOORD` | Eigen keuze | Vergeten = `setupLicentieSheet()` opnieuw runnen |
| `ADMIN_NOODSLEUTEL` | Random ≥24 chars | Bypass bij admin-rate-limit; rotate na elk gebruik |
| `OWNER_STATUS_EMAIL` | Sam's gmail | Daily statusmail-bestemming |

### Recovery zonder Sam (opvolger-pad)

1. **Eerst**: krijg toegang tot `samhoven16@gmail.com` (Google account-recovery via 2FA backup-codes — Sam bewaart deze in 1Password OR op fysieke kluis-locatie X).
2. Open Apps Script editor → projecten → `boekhouding-licence-server`
3. Project Settings → Script Properties → lees alle bovenstaande
4. Mollie/Brevo/etc. inloggen met Sam's account (zelfde recovery-pad)

### Wat Sam expliciet NIET aan derden geeft

- Master-template `TEMPLATE_SS_ID` mag elke kopie maken — overdracht = product-overdracht
- Mollie account zelf — koper neemt eigen account, vervangt `MOLLIE_API_KEY`

---

## 3. Wat doet de license-server precies

`licence-server/Code.gs` is een Apps Script web-app. Endpoints:

| Endpoint | Wat |
|---|---|
| `?actie=status` | JSON health-check (extern monitorbaar) |
| `?actie=valideer&sleutel=X` | Klant-sheet valideert licentie (24u cache) |
| `?actie=aanvraag-otp&email=X` | Vraag OTP-code voor activatie |
| `?actie=activeer-otp&email=X&code=Y` | Bind klant aan zijn sheet-ID |
| `?actie=admin` | Admin-paneel (rate-limited) |
| `?actie=roteer` | Klant ververst eigen licentie |
| `?actie=revoke` | Owner trekt licentie in (refund-flow) |

Mollie webhook: `?actie=webhook` POST. Bij betaling → klant in licentie-sheet → activatie-mail.

---

## 4. Cloudflare Pages (boekhoudbaar.nl)

- DNS: nameservers via cloudflare (Sam's account)
- Domain: bij Cloudflare Registrar (auto-renew aan)
- Deployment: git push naar `samhoven16/boekhouding-engine` `main` triggert auto-deploy via CF Pages

**Sam-uitval**: bij verlopen domain → 404 voor alle klanten die naar website navigeren. Klant-sheets blijven werken. Recovery: auto-renew zou dit moeten voorkomen — check 6-maand vóór expiry.

---

## 5. Email-providers + quota

- **Sam → klant**: Brevo (transactional). 300/dag op gratis tier. Bij outage: MailApp fallback (`MailApp.sendEmail`).
- **Klant → klant-van-klant**: GmailApp van klant's eigen Google-account. 100/dag consumer, 1500/dag Workspace.
- **EmailQuotaGuard** (in elke klant-sheet) waarschuwt klant bij 80% van zijn dagcap.

---

## 6. Healthcheck-monitoring

- Klant-sheet `dagelijkseTaken` pingt twee URLs (ScriptProperty `HEALTHCHECK_URL` + `HEALTHCHECK_URL_BACKUP`).
- License-server stuurt daily statusmail aan `OWNER_STATUS_EMAIL`. Bij `[CRIT]` in subject: missende kritieke ScriptProperty.
- Externe monitor (UptimeRobot/Better Stack) kan op `?actie=status` JSON-field `status: 'crit'` alerten.

---

## 7. Bij volledige Sam-uitval — abandoned mode

### Wat klanten zien

1. **Eerste 90 dagen**: sheets werken normaal. License validates uit cache.
2. **Dag 91+**: validation-cache verlopen → klanten zien banner "licentie kon niet geverifieerd worden". Boekingen blijven werken, maar new-feature acties blokkeren.
3. **Domain expired**: support-mailadres @boekhoudbaar.nl bounces; klant kan niet bellen.

### Wat klanten MOETEN kunnen, ongeacht Sam

- **CSV-export** elke sheet (Google Sheets native)
- **XAF-export** voor accountant (`Boekhouding → Geavanceerd → Exporteer XAF`)
- **Backup-folder** in eigen Drive bevat xlsx + JSONL-snapshots
- **Migratie**: 35 gidsen op `/gids/` documenteren overstap-paden

### Opvolger-actielijst (eerste 30 dagen)

1. Verstuur klanten een mail vanuit `info@boekhoudbaar.nl` met:
   - Overdracht-aankondiging OF
   - Wind-down-aankondiging + migratie-instructies
2. Roteer ScriptProperty `LICENTIE_GRACE_DAGEN` naar `3650` (10 jaar) als wind-down — klanten blijven gewoon werken
3. Communiceer status via `?actie=status` (klant-sheets ophalen automatisch)

---

## 8. Operationele invarianten — wat NOOIT mag

1. **Mollie API key NOOIT in git** — alleen in ScriptProperties
2. **NOOIT klant-data centraal opslaan** — privacy + supervisie-vrijheid is USP
3. **NOOIT klant-Drive bestanden wijzigen** zonder klant-actie (audit-log spoor)
4. **NOOIT licence-server downgraden** zonder klant te waarschuwen
5. **NOOIT `LICENTIE_GRACE_DAGEN` verlagen** zonder klant-aankondiging

---

## 9. Jaarlijkse belastingtarieven bijwerken (tarief-cliff — F-OND-024)

Elk kalenderjaar dat nog geen bevestigde tarieven heeft (vóór Prinsjesdag, of
als onderhoud stilvalt) toont het Belastingadvies-tabblad een **rode banner**
("⚠️ Tarieven gebruikt voor &lt;jaar&gt; zijn fallback/placeholder"), krijgt de
klant een toast bij de eerste boeking van het jaar, en de owner een
`meldFataalAanOwner_`-alert. De tool blíjft rekenen met de laatst-bekende
tarieven (bewust géén harde blokkade), maar de klant ziet expliciet dat het
niet gevalideerd is — zo ontstaat geen stille drift.

**Twee update-routes (kies de eerste — geen redeploy nodig):**

1. **Server-config (aanbevolen, geen klant-sheet-kopie):** zet de nieuwe
   tarieven in de centrale config die `haalConfigOp_()` ophaalt, onder
   `belastingTarieven[<jaar>]`. `getBelasting_()` pakt dit automatisch op en de
   banner verdwijnt — voor álle bestaande klanten tegelijk.
2. **Lokale tabel (vereist deploy):** voeg een `<jaar>:`-blok toe aan
   `BELASTING_PER_JAAR` in `src/Belastingadvies.gs` en haal `placeholder: true`
   weg zodra de cijfers definitief zijn (Miljoenennota / Belastingplan).

Klanten kunnen tussentijds zelf bijwerken via de Instellingen-tab (override
wint; drie-laags-merge in `getBelasting_`). Borging:
`tests/unit/getbelasting-tarief-cliff.test.js`.

---

## 10. Contact-paden bij crisis

| Wie | Hoe | Waarvoor |
|---|---|---|
| Mollie support | dashboard.mollie.com → support | API-issues, refunds, account-locks |
| Brevo support | brevo.com → help | Email-delivery, quota |
| Cloudflare | dash.cloudflare.com → support | DNS, Pages-deploy, domain |
| Google Apps Script | issuetracker.google.com | Platform-level issues |

---

**Versie**: 2026-06-09  
**Bijgewerkt na**: audit ronde 2 — langlopend-onderhoud

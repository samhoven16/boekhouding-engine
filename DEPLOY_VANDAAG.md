# 🚀 Boekhoudbaar — Vandaag verkopen

> Stap-voor-stap checklist om in 90-120 minuten klaar te staan voor je eerste betalende klant.
> Volg in volgorde — elke stap heeft zijn check.

---

## ⏱️ Tijdsindicatie

| Fase | Tijd | Wat |
|---|---|---|
| 1. DNS-records | 15 min | SPF/DKIM/DMARC in Cloudflare voor email-deliverability |
| 2. Brevo sender verify | 10 min | `info@boekhoudbaar.nl` als verified sender |
| 3. Code deploy | 10 min | `git pull` + `npm run push:gas` + `npm run push:licence` |
| 4. Web App publish | 10 min | Beide Apps Scripts publiceren als Web App |
| 5. Script Properties | 5 min | LICENTIE_SERVER_URL toevoegen aan master |
| 6. Self-test als klant | 30 min | Volledige flow testen met test-Mollie |
| 7. Mollie live key | 5 min | Test → live switchen |
| 8. Google Search Console | 10 min | Sitemap submitten |
| 9. Eerste klant uitnodigen | 5 min | LinkedIn/Twitter post of direct outreach |

**Totaal: ~100 min**

---

## 🟢 STAP 1 — DNS records (Cloudflare) — 15 min

**Doel**: jouw mails landen in INBOX, niet spam.

Open Cloudflare dashboard → `boekhoudbaar.nl` → **DNS → Records**.

### A. SPF record (geeft Brevo permissie om vanuit boekhoudbaar.nl te mailen)

Bestaat er al een TXT record met `v=spf1`? Check dat eerst.

- **Als nog GEEN SPF**: voeg toe:
  - Type: `TXT`
  - Name: `@` (= boekhoudbaar.nl)
  - Content: `v=spf1 include:spf.brevo.com include:_spf.mx.cloudflare.net ~all`
  - TTL: Auto

- **Als WEL een SPF** (van Cloudflare Email Routing): wijzig naar:
  - Content: `v=spf1 include:spf.brevo.com include:_spf.mx.cloudflare.net ~all`

> Eén SPF per domein — daarom samenvoegen.

### B. DKIM records (cryptografische signing voor Brevo)

1. Ga naar **Brevo dashboard → Senders, Domains & Dedicated IPs → Domains**
2. Klik **+ Add a domain** → `boekhoudbaar.nl`
3. Brevo geeft 2 TXT records, ongeveer:
   - `mail._domainkey.boekhoudbaar.nl` → `v=DKIM1;k=rsa;p=...`
   - `brevo-code.boekhoudbaar.nl` → `<verificatie-string>`
4. Voeg beide toe in Cloudflare DNS (Type: TXT, Name + Content overnemen)
5. Terug naar Brevo → **Authenticate this domain** → wacht tot beide groen ✓

### C. DMARC record (anti-spoof beleid)

- Type: `TXT`
- Name: `_dmarc`
- Content: `v=DMARC1; p=none; rua=mailto:postmaster@boekhoudbaar.nl; ruf=mailto:postmaster@boekhoudbaar.nl; fo=1; aspf=r; adkim=r;`

**Check**: na 30 min ga naar [mxtoolbox.com/SuperTool.aspx](https://mxtoolbox.com/SuperTool.aspx) → zoek `boekhoudbaar.nl` → check SPF + DKIM + DMARC = alle 3 groen ✓.

---

## 🟢 STAP 2 — Brevo sender verify — 10 min

Doel: `info@boekhoudbaar.nl` mag mailen vanuit Brevo.

1. **Brevo dashboard → Senders, Domains & Dedicated IPs → Senders**
2. **+ Add a sender**
3. Email: `info@boekhoudbaar.nl` · Naam: `Sam van Boekhoudbaar`
4. Brevo stuurt verificatie-mail naar je Cloudflare-routing → komt aan in `samhoven16@gmail.com`
5. Klik bevestig-link
6. Status: **Verified ✓**

Optioneel: voeg ook `support@boekhoudbaar.nl` toe als sender voor support-replies.

**Check**: stuur testmail vanuit Brevo dashboard → **Templates → New template → Send test** → naar je eigen Gmail. Komt in inbox? ✓.

---

## 🟢 STAP 3 — Code deployen — 10 min

Op je andere computer:

```bash
git checkout main
git pull origin main

# Eerst PR mergen via GitHub UI:
# https://github.com/samhoven16/boekhouding-engine/pull/new/claude/eerste-klant-ready-clean

git pull origin main
npm install
npm test                    # 372/372 verwacht

# Master engine → Apps Script productie
npm run push:gas

# Licentieserver → Apps Script productie
npm run push:licence
```

**Check**: open beide Apps Scripts in browser → laatste-modified-tijdstempel = nu.

---

## 🟢 STAP 4 — Web App publiceren — 10 min

Voor de Licentieserver MOET hij gepubliceerd zijn als Web App, anders krijgen klanten 404.

### Licentieserver publiceren

1. Open **Boekhoudbaar — Licentieserver** Apps Script
2. **Implementeren → Nieuwe implementatie** (of: **Beheer implementaties** als al gepubliceerd)
3. **Type**: Webapp
4. **Beschrijving**: `v1.0 — productie launch`
5. **Uitvoeren als**: Ik zelf (`samhoven16@gmail.com`)
6. **Wie heeft toegang**: Iedereen (anoniem)
7. **Implementeren** → Google vraagt OAuth-toestemming → accepteer
8. **Kopieer de Web App URL** (eindigt op `/exec`)

### Master engine publiceren als Web App (alleen als nodig — voor klant-installer)

Niet kritiek nu — alleen als je een installer-flow wilt.

**Check**: open de Licentieserver Web App URL met `?actie=health` in browser → krijg je JSON-response? ✓.

---

## 🟢 STAP 5 — Script Properties — 5 min

### A. Licentieserver — bekend van eerdere screenshot ✅

Verifieer dat aanwezig:
- ADMIN_WACHTWOORD ✓
- BTW_NUMMER ✓
- KVK_NUMMER ✓
- LICENTIE_SHEET_ID ✓
- MOLLIE_API_KEY (`test_xxx` voor nu — switch later naar `live_xxx`) ✓
- PRODUCT_NAAM ✓
- PRODUCT_PRIJS ✓
- TEMPLATE_SS_ID ✓
- BREVO_API_KEY ✓ (toegevoegd)

Optioneel toevoegen voor branding:
- `VAN_EMAIL` = `info@boekhoudbaar.nl`
- `VAN_NAAM` = `Sam van Boekhoudbaar`
- `PRIVACY_URL` = `https://www.boekhoudbaar.nl/privacy`

### B. Master engine — `LICENTIE_SERVER_URL` toevoegen

1. Open **Boekhoudbaar — Master Engine** Apps Script
2. ⚙️ Project Settings → Script Properties
3. **+ Add script property**:
   - Property: `LICENTIE_SERVER_URL`
   - Value: de Web App URL van Licentieserver (uit stap 4)
4. Save

> Dit zorgt dat klant-kopieën weten waar te activeren.

---

## 🟢 STAP 6 — Self-test als klant — 30 min

Doe dit **incognito** met een **andere Google-account** (vraag iemand of maak `boekhoudbaar.test@gmail.com`). Dit is de echte test of alles werkt.

### A. Test-betaling via Mollie

1. Open in incognito: `https://www.boekhoudbaar.nl/`
2. Klik **Koop** → komt op betaalpagina
3. Vul email + naam in → **Betalen**
4. Mollie test-pagina → kies iDEAL test-bank → bevestig
5. Redirect naar bedankt-pagina

**Check tijden**:
- Binnen 5 sec: Mollie webhook → Licentieserver → key gegenereerd
- Binnen 30 sec: email in test-Gmail (check spam ook!)

### B. Email-flow

Check de email die binnenkomt:
- ✅ Afzender: `Sam van Boekhoudbaar <info@boekhoudbaar.nl>`
- ✅ Onderwerp: "Je Boekhoudbaar is klaar — activeer nu 🚀"
- ✅ Geen "via amazonses.com" / "via brevoapp.com" footer (= DKIM niet OK)
- ✅ Komt in **inbox**, niet spam (= SPF/DKIM/DMARC werken)
- ✅ Klik knop **"Open mijn boekhouding →"** werkt

### C. Activatie

1. Klik link → Google Drive vraagt: "Make a copy?"
2. Klik **Make a copy** → spreadsheet komt in test-Drive
3. Open spreadsheet → activatie-dialoog verschijnt
4. Vul test-email in → krijgt 6-cijferige OTP-mail
5. Voer OTP in → "Activatie geslaagd!"
6. Setup runt automatisch → tabbladen + Drive-mappen aangemaakt

### D. Werkt-alles-test

1. **Boekhouding → Controle → ✅ Werkt-alles-test (eerste-klant-readiness)**
2. Verwacht: **12/12 OK**

### E. Eerste factuur

1. **Boekhouding → Nieuwe boeking → Factuur**
2. Vul in:
   - Klant: `Test BV`
   - Email: jouw eigen Gmail (zodat je de PDF ontvangt)
   - Regel 1: omschrijving + aantal `1` + **prijs `75,00`** (test EU-formaat!)
3. Live-totaal moet €75,00 + BTW 21% = €90,75 tonen
4. Klik **✅ Opslaan**
5. Verwacht binnen 30 sec:
   - Factuur in Verkoopfacturen-tab
   - Journaalpost in Journaalposten-tab
   - PDF in Drive-map "Verkoopfacturen 2026"
   - Email in jouw Gmail met PDF-bijlage
   - Mollie payment-link in PDF (klik om te checken)

### F. Markeer betaald

1. Open de factuur in Verkoopfacturen-tab
2. **Boekhouding → Verkoopfacturen → Markeer betaald**
3. Status wordt BETAALD
4. Tegen-journaalpost (1200 → 1100) verschijnt automatisch
5. Run **Boekhouding → Controle → Gezondheidscheck** → balans klopt

---

## 🟢 STAP 7 — Mollie live key — 5 min

**Alleen na succesvolle self-test in stap 6.**

1. Mollie dashboard → **Developers → API keys**
2. Kopieer **Live API key** (begint met `live_`)
3. Open Licentieserver Apps Script → Project Settings → Script Properties
4. Wijzig `MOLLIE_API_KEY` waarde → vervang `test_xxx` met `live_xxx`
5. Save

**Vanaf nu zijn betalingen ECHT.** Dubbelcheck met een €1-test-betaling op jezelf (en refund daarna direct).

---

## 🟢 STAP 8 — Google Search Console — 10 min

Doel: jouw site verschijnt in Google.

1. Ga naar [search.google.com/search-console](https://search.google.com/search-console)
2. **Add property** → `https://www.boekhoudbaar.nl/`
3. Verify via **DNS TXT record** (Cloudflare):
   - Type: TXT, Name: `@`, Content: `google-site-verification=XXX...`
4. Wacht 5 min → klik **Verify** in Search Console
5. **Sitemaps** tab → submit: `https://www.boekhoudbaar.nl/sitemap.xml`

Google indexeert binnen 1-7 dagen. Eerste resultaten in zoekfunctie binnen 2 weken.

---

## 🟢 STAP 9 — Eerste klant uitnodigen — 5 min

Je product werkt. Tijd voor klanten.

### Optie A: LinkedIn-post

```
Na 6 maanden bouwen: Boekhoudbaar.nl is live.

ZZP-boekhouding in Google Sheets. Eenmalig €49 (geen abonnement).
Facturen, BTW-aangifte, betaalherinneringen, dashboard — automatisch.
Jouw data in jouw Drive — niet op mijn server.

Eerste 10 klanten krijgen 30% korting met code: EARLYBIRD
boekhoudbaar.nl

#zzp #boekhouding #freelance
```

### Optie B: Direct outreach

Lijstje van 5 ZZP'ers in je netwerk. Stuur persoonlijke mail:
> "Hé [naam], ik heb iets gebouwd waar ik denk dat je iets aan hebt. Boekhoudbaar — een ZZP-boekhouding in Google Sheets, eenmalig €49. Mag ik je 5 min uitleggen? Of probeer direct: boekhoudbaar.nl. Eerlijk feedback maakt me blij."

### Optie C: ZZP communities

Posten in:
- r/Netherlands (subreddit, in Engels)
- r/zzp (Nederlandstalig, kleiner)
- ZZP-Nederland Facebook-groep
- ZZP Nederland LinkedIn-groep

---

## ⚠️ Bekende beperkingen (transparant zijn)

Dingen die NU NOG NIET werken — maak het transparant op de website (eventueel in een "Wat zit er nog niet in?"-sectie):

- ❌ Bank-PSD2 koppeling (handmatig CSV-import wel)
- ❌ Multi-currency (alleen EUR)
- ❌ Multi-country BTW (alleen NL — Duitsland/België niet)
- ❌ Mobiele app (browser werkt wel op telefoon)
- ❌ 2FA (komt later — voor MVP veilig genoeg)

Dingen die op de roadmap staan:
- 🔜 Stripe integratie (naast Mollie)
- 🔜 Bank-koppelingen (Bunq/ABN/Rabo via Tink/Plaid)
- 🔜 SBR/XBRL export voor accountants

---

## 🆘 Als iets misgaat

| Symptoom | Wat te doen |
|---|---|
| Klant betaalt maar krijgt geen mail | Brevo dashboard → **Statistics → Logs** check verzending. Run `herstuurLicentiemailHandmatig("KEY")` als nodig. |
| Mail komt in spam | Check DNS records via mxtoolbox.com. Wacht max 24u op DKIM-propagatie. |
| Klant kan spreadsheet niet openen | Verifieer TEMPLATE_SS_ID. Check dat master-spreadsheet nog gedeeld is met "Anyone with link can view". |
| Klant krijgt "vergrendeld"-melding | Klant heeft kopie van een andere klant's spreadsheet. LICENTIE_SS_ID mismatch. Klant moet via licentie-aanvraag activeren. |
| Klant heeft geen Gmail | Verwijs naar `accounts.google.com/signup` → "Use my existing email". Mail bevat al deze instructie. |
| 502 / Apps Script error op Web App | Implementaties beheren → publiceer nieuwe versie. Oude versie crashed. |

Voor alles wat hier niet staat: log in **Logger.log** check via Apps Script editor → **Executions** → laatste run → details.

---

## 📊 Wat je daarna kunt doen (week 2+)

- **Pinned post op LinkedIn** met video-demo (30 sec screen-recording)
- **Product Hunt launch** (vrijdag uploaden voor maandag-launch best resultaat)
- **Indie Hackers post** met "build in public" stats
- **YouTube video** "Boekhouding in 15 min met Google Sheets"
- **Blog-artikel op je website** "Hoe ik in 6 maanden een boekhoudtool bouwde voor €49"
- **Affiliates** — accountants 30% per verkoop voor klanten die ze doorsturen

---

**Veel succes. Mail me als je vastloopt op een stap.**

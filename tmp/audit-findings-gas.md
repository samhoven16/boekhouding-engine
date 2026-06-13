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

## Batch GAS-C — BankImport, Bankboek, BelastingOptimizer, Belastingadvies, Belastingvoordeel, BoekingEngine, Boekingen, Brand

### src/BankImport.gs — Gelezen: 1-547. guillotineCheck_ 270s + self-reschedule (314-335) + batch-write (399-403) = OK hoofdloop. VONDSTEN F-GAS-040, 041.
### src/Bankboek.gs — Gelezen: 1-185. Eén lineaire pass (9-22). VONDST F-GAS-042.
### src/BelastingOptimizer.gs — Gelezen: 1-288. K>18-guard capt brute-force op 2^18 (84-89); binnenste loop O(K) — correcte verdediging. Geen vondsten.
### src/Belastingadvies.gs — Gelezen: 1-1919. KIA_MISSER-property kwartaal-bucket bounded (1786-1797); advies 10-min cache (716). VONDSTEN F-GAS-043..045.
### src/Belastingvoordeel.gs — Gelezen: 1-1145. mijlpaal-properties bounded met guard (250-255). VONDST F-GAS-046.
### src/BoekingEngine.gs — Gelezen: 1-1086. ai-scan rate-limit (588-594); DriveApp één map (482). VONDSTEN F-GAS-047..049.
### src/Boekingen.gs — Gelezen: 1-1480. herberekeningGrootboekSaldi correct gebatcht (490-573); historie-property gecapt 15 (1404-1405). VONDSTEN F-GAS-050..053.
### src/Brand.gs — Gelezen: 1-104. Constanten + pure string-builder. Geen vondsten.

#### F-GAS-040 [HOOG] src/BankImport.gs:414-421
Quote: `vfUpdates.forEach(function(u) { const huidigBetaald = parseFloat(vfSheet.getRange(u.rij, 14).getValue()) || 0; ... vfSheet.getRange(u.rij, 14).setValue(nieuwBetaald);`
Probleem: factuur-update-staart doet per match 2-4 losse roundtrips BUITEN de guillotine-bewaking (die alleen de hoofdloop dekt, 328-335) ⇒ grote import kan in de niet-resumable staart timen met half-bijgewerkte factuurstatus terwijl banktransacties al weggeschreven zijn.
Fix: updates verzamelen en per kolom-blok batchen; betaald-kolom vooraf 1× inlezen; staart binnen guillotine trekken.
Owner: Sam (dev)

#### F-GAS-041 [MIDDEL] src/BankImport.gs:193,213,305
Quote: `const vfData = vfSheet.getDataRange().getValues();` … `const btData = btSheet.getDataRange().getValues();`
Probleem: VF+IF+BANKTRANSACTIES volledig gelezen per import, vóór de guillotine-timer; BANKTRANSACTIES groeit het hardst; geen periode-filter.
Fix: dedup-read beperken tot CSV-datumbereik / 3 kolommen.
Owner: Sam (dev)

#### F-GAS-042 [LAAG] src/Bankboek.gs:12
Quote: `const data = sheet.getDataRange().getValues();`
Probleem: getBanksaldo_ hersommeert alle banktransacties per aanroep zonder cache/projectie.
Fix: saldo uit GROOTBOEKSCHEMA-rekening 1200 (al incrementeel bijgehouden).
Owner: Sam (dev)

#### F-GAS-043 [MIDDEL] src/Belastingadvies.gs:1832-1834
Quote: `if (typeof stuurMailMetDlq_ === 'function') { stuurMailMetDlq_(ontvanger, '💰 KIA-aftrek mogelijk gemist (~€' + Math.round(kiaGeschat) + ')', body);`
Probleem: dagelijks mail-pad zonder zichtbare EmailQuotaGuard-check (idempotency-property wél correct vóór send, 1797).
Fix: verifiëren dat stuurMailMetDlq_ de guard toepast; anders expliciete check.
Owner: Sam (dev)

#### F-GAS-044 [MIDDEL] src/Belastingadvies.gs:1576-1582,1605-1619,1628-1640
Quote: `advies.aftrekken.forEach(a => { sheet.getRange(rij, 1).setValue(a.naam); ... })`
Probleem: honderden losse setValue/merge/setBackground-calls per advies-render ⇒ seconden trage menu-actie (bounded, geen cap-risico).
Fix: 2D-array + setValues per sectie; range-brede opmaak.
Owner: Sam (dev)

#### F-GAS-045 [MIDDEL] src/Belastingadvies.gs:1025,1754
Quote: `const jpData = aovInJp.getDataRange().getValues();` (1025) … `const data = ifSheet.getDataRange().getValues();` (1754)
Probleem: volledige JOURNAALPOSTEN-scan voor AOV-detectie + dagelijkse volledige INKOOPFACTUREN-scan voor KIA-misser (jaar-filter pas ín de loop, 1761); JOURNAALPOSTEN is snelst-groeiende sheet.
Fix: read filteren op boekjaar/kolommen; AOV-detectie laten meeliften op bestaande pass.
Owner: Sam (dev)

#### F-GAS-046 [LAAG] src/Belastingvoordeel.gs:469,968-972
Quote: `const data = jpSheet.getDataRange().getValues();` (reiskosten-tracker)
Probleem: volledige JOURNAALPOSTEN-read bij elke dialog-open; jaar-filter pas in de loop (473).
Fix: YTD uit grootboeksaldo 7350 of gefilterde read.
Owner: Sam (dev)

#### F-GAS-047 [HOOG] src/BoekingEngine.gs:843-857
Quote: `lock = LockService.getScriptLock(); lockHeld = lock.tryLock(2000); ... props.setProperty('AUDIT_KETEN_HASH', entryHash); ... props.setProperty(LOG_KEY, buffer);`
Probleem: schrijfAuditLog_ = ScriptLock + SHA-256 + 2× setProperty PER hot-path-aanroep (10+ bestanden); wordt bovendien aangeroepen binnen de al-gelockte updateGrootboekSaldo_-context (Boekingen.gs:375→382/457) ⇒ geneste acquisitie verergert contentie/lock-starvation tussen parallelle invocaties; batches serialiseren volledig.
Fix: hash-chain batchen/periodiek; geen nieuwe ScriptLock binnen gelockte context (no-lock-vlag in batch).
Owner: Sam (dev)

#### F-GAS-048 [MIDDEL] src/BoekingEngine.gs:869-882
Quote: `const bestaand = props.getProperty(LOG_KEY) || ''; const regels = bestaand ? bestaand.split('\n') : []; regels.push(entry); ... props.setProperty(LOG_KEY, buffer);`
Probleem: read-modify-write van volledige buffer per audit-regel (8000-char-cap zelf correct); honderden herhalingen in batch = duurste handeling per boeking (met F-GAS-047).
Fix: in-memory bufferen per batch, 1× flushen; of append naar sheet-tab.
Owner: Sam (dev)

#### F-GAS-049 [MIDDEL] src/BoekingEngine.gs:629-642,782-790
Quote: `const resp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/...' + ':generateContent?key=' + apiKey, {...})`
Probleem: parseSpraakinvoer (782) mist de rate-limit-guard die scanDocumentMetAI wél heeft (588-594); klant kan spraak-invoer herhaald afvuren en gedeelde Gemini-quota uitputten; geen backoff op 429/503.
Fix: rateLimit_('ai-spraak', ...) vóór de fetch.
Owner: Sam (dev)

#### F-GAS-050 [HOOG] src/Boekingen.gs:901-913,973-990
Quote: `open.forEach(function(f) { sheet.appendRow([ f.factuurnummer, ... ]); ... sheet.getRange(rij, 1, 1, 9).setBackground(...)`
Probleem: debiteuren/crediteuren-render doet appendRow + setBackground PER open factuur (klassiek appendRow-in-loop-antipatroon); wordt ook ná koppelTransactiesAanFacturen aangeroepen (1021-1022) ⇒ lineair richting 6-min-cap.
Fix: 2D-array + één setValues; aging-kleuren range-breed/conditional formatting.
Owner: Sam (dev)

#### F-GAS-051 [HOOG] src/Boekingen.gs:1007-1018
Quote: `for (let i = 1; i < btData.length; i++) { ... koppelBankTransactieAanFactuur_(ss, btData[i][0], ref, bedrag, isOntvangst, datum); }`
Probleem: loop over álle banktransacties × per-call full-sheet-scan in koppelBankTransactieAanFactuur_ (Triggers.gs, zie F-GAS-002) = N×M; geen guillotine/self-reschedule (anders dan BankImport).
Fix: open-facturen 1× indexeren (ref→factuur) + guillotineCheck_ toevoegen.
Owner: Sam (dev)

#### F-GAS-052 [MIDDEL] src/Boekingen.gs:758-795
Quote: `const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) throw ...; try { Object.keys(data).forEach(code => { ... maakJournaalpost_(ss, {...}); }); } finally { lock.releaseLock(); }`
Probleem: verwerkAfschrijvingen houdt één grove lock over alle journaalposten+saldo+audit-writes (reentrant binnen executie, maar >30s vasthouden ⇒ lock-starvation voor andere invocaties).
Fix: grove lock vervangen door idempotency-guard; fijnmazige locks van downstream volstaan.
Owner: Sam (dev)

#### F-GAS-053 [MIDDEL] src/Boekingen.gs:301-331
Quote: `const vfData = vfSheet.getDataRange().getValues(); ... vfSheet.getRange(i + 1, 15).setValue('Gestorneerd'); vfSheet.getRange(i + 1, 12).setValue(0);`
Probleem: per storno 2-3 volledige reads van de grootste sheets (JOURNAALPOSTEN 214, VF 301, IF 319) om één rij te vinden.
Fix: kolom-projectie / index-tab boekingId→rij.
Owner: Sam (dev)

## Batch GAS-D — Branding, BtwExport, Changelog, Config, CustomFunctions, DLQ, Dashboard, DataPortability

### src/Branding.gs — Gelezen: 1-455. Chunking onder 9KB/key + oude chunks verwijderd (90-103). VONDSTEN F-GAS-060, 061.
### src/BtwExport.gs — Gelezen: 1-326. Eén berekening per preview; geen properties/sheets-writes. Geen vondsten.
### src/Changelog.gs — Gelezen: 1-199. Gethrottlede onOpen-haak in try/catch. VONDST F-GAS-062 (bewaken).
### src/Config.gs — Gelezen: 1-346. Pure constanten; top-level-call-verbod nageleefd (6-13). Geen vondsten.
### src/CustomFunctions.gs — Gelezen: 1-311. Alle @customfunctions puur en service-vrij (geen 30s-risico). Geen vondsten.
### src/DLQ.gs — Gelezen: 1-282. FIFO-cap 1000 (53-54); één overschreven property (234). VONDSTEN F-GAS-063..065.
### src/Dashboard.gs — Gelezen: 1-1627. KPI-snapshot bounded (47-48, 1180-1181). VONDSTEN F-GAS-066..069.
### src/DataPortability.gs — Gelezen: 1-216. Eén XLSX-fetch; folders correct gepagineerd (45-46). VONDST F-GAS-070.

#### F-GAS-060 [LAAG] src/Branding.gs:99-101
Quote: `for (let i = 0; i < chunks; i++) { props.setProperty('bedrijfsLogo_chunk_' + i, base64Data.slice(...)); }`
Probleem: ~34 losse setProperty-roundtrips per 200KB-upload; vult ~200KB van het 500KB-budget.
Fix: setProperties-batch; cap verlagen of logo naar Drive/sheet. Owner: Sam (dev)

#### F-GAS-061 [LAAG] src/Branding.gs:87-103
Quote: `const oud = parseInt(props.getProperty('bedrijfsLogoChunks') || '0'); for (...) props.deleteProperty(...); ... props.setProperty('bedrijfsLogoChunks', String(chunks));`
Probleem: read-delete-write zonder lock ⇒ gelijktijdige uploads laten wees-chunks/inconsistent logo achter.
Fix: tryLock(5000) of risico expliciet accepteren. Owner: Sam (dev)

#### F-GAS-062 [LAAG] src/Changelog.gs:100-121
Quote: `function checkEnToonChangelog_() { ... scriptProps.getProperty('geinstalleerde_versie') ...`
Probleem: onOpen-haak (30s-budget) — nu goedkoop; cumulatief risico bewaken bij uitbreidingen.
Fix: geen; geen sheet-reads toevoegen. Owner: Sam (dev)

#### F-GAS-063 [MIDDEL] src/DLQ.gs:76-118
Quote: `const data = sheet.getDataRange().getValues(); ... sheet.getRange(i + 1, 6).setValue('SUCCES'); ...`
Probleem: read-modify-write zonder lock; daily + menu samen ⇒ dubbele retry (= dubbele mail) of overschreven tellers; appendRow tijdens run verschuift indices. (= F-RED-061)
Fix: script-lock; bij niet verkrijgen overslaan. Owner: Sam (dev)

#### F-GAS-064 [MIDDEL] src/DLQ.gs:130-160
Quote: `case 'EMAIL_HERINNERING': ... GmailApp.sendEmail(payload.email, ...);`
Probleem: retry-loop zonder mail-quota-guard; backlog (server-storing) kan in één run de 100/dag-cap opslokken.
Fix: EmailQuotaGuard vóór elke send; loop stoppen bij bijna-op quota. Owner: Sam (dev)

#### F-GAS-065 [LAAG] src/DLQ.gs:104-115
Quote: `sheet.getRange(i + 1, 6).setValue('SUCCES'); ... setValue(nieuwRetries); ... setValue(...)`
Probleem: tot 3 losse writes per item i.p.v. batch.
Fix: in-memory accumuleren + setValues-batch. Owner: Sam (dev)

#### F-GAS-066 [HOOG] src/Dashboard.gs:9-554
Quote: `const kpi = berekenKpiData_(ss); ... const btwData = getBtwPerMaand_(ss, btwJaar); ... herhalendeResult = verwerkHerhalendeKosten_(); ... maakDashboardGrafieken_(ss, sheet, btwJaar);`
Probleem: één render stapelt: KPI-scan, getBtwPerMaand_ 2×, detecteerAfwijkingen_ (eigen VF+IF-scans 969-1015), berekenBtwIndicatie_→berekenBtwAangifte_ (1046, volledige JP-scan), berekenBelastingadvies_ 2× (276, 1092), berekenRoiData_ (711-758), plus verwerkHerhalendeKosten_. Draait als LAATSTE stap in dagelijkseTaken ná ~18 taken ⇒ silent-kill laat dashboard half-geschreven achter (clearContents al uitgevoerd, regel 32).
Fix: sheets één keer lezen en arrays doorgeven; BTW-uitkomst cachen binnen render; verwerkHerhalendeKosten_ loskoppelen van de render. (Sluit aan op F-CPR-021.)
Owner: Sam (dev)

#### F-GAS-067 [MIDDEL] src/Dashboard.gs:32-517
Quote: `sheet.clearContents(); sheet.clearFormats(); ... ss.setActiveSheet(sheet);`
Probleem: clear+rebuild zonder lock vanaf ≥6 callsites (Triggers 483/1387/1666, Boekingen 797, Bankboek 162, Inkoopfacturen 95, Setup 202, Menu 623) ⇒ gelijktijdige renders = corrupte layout.
Fix: tryLock(0) aan het begin; bezet ⇒ render overslaan. Owner: Sam (dev)

#### F-GAS-068 [MIDDEL] src/Dashboard.gs:312, 715, 974, 1001, 1191, 1219, 1268, 1296, 1423, 1447
Quote: `const vfData = _vfS ? _vfS.getDataRange().getValues() : [[]];`
Probleem: VF 6× en IF 4× volledig gelezen binnen één cyclus zonder rij-/kolomfilter — de concrete N+1-bron achter F-GAS-066.
Fix: één read per sheet per render; kolom-projectie zoals berekenMaandData_ (661/675). Owner: Sam (dev)

#### F-GAS-069 [LAAG] src/Dashboard.gs:315-328, 417-423
Quote: `recenteVf.forEach(r => { sheet.getRange(rij, 1, 1, 5).setValues([[...]]); ... });`
Probleem: per-rij writes in kleine begrensde tabellen — drijft rendertijd op, geen cap-risico.
Fix: batchen. Owner: Sam (dev)

#### F-GAS-070 [MIDDEL] src/DataPortability.gs:78-204
Quote: `const data = auditSheet.getDataRange().getValues(); ... const file = DriveApp.getFileById(fileId); verseUrl = file.getUrl();`
Probleem: één synchrone invocatie: XLSX-fetch + VOLLEDIGE audit-log (tot 50k rijen) + per-factuur DriveApp.getFileById (~200ms elk) ⇒ duizenden facturen = ruim over 6-min-cap met half-gevulde export-map.
Fix: PDF-resolve chunken/hervatbaar maken; XLSX als primair. Owner: Sam (dev)

## Batch GAS-E — Diagnostiek, DriveStructuur, EUVerkoop, EersteKlantCheck, EmailDeliverability, EmailQuotaGuard, Engagement, ExportAccountant

### src/Diagnostiek.gs — Gelezen: 1-184. tryLock(50)+release OK (46-49). VONDSTEN F-GAS-080, 081.
### src/DriveStructuur.gs — Gelezen: 1-480. Folder-iterators correct gepagineerd (71-96). VONDSTEN F-GAS-082, 083.
### src/EUVerkoop.gs — Gelezen: 1-355. VIES cache-first, één fetch per nr (112-142). VONDSTEN F-GAS-084, 085.
### src/EersteKlantCheck.gs — Gelezen: 1-300. 12 lichte checks; PDF-check bewust zonder fetch (195). Geen vondsten.
### src/EmailDeliverability.gs — Gelezen: 1-111. VONDST F-GAS-086.
### src/EmailQuotaGuard.gs — Gelezen: 1-179. Eén overschreven property (116-173). VONDST F-GAS-087.
### src/Engagement.gs — Gelezen: 1-409. npsResponses gecapt op 50 (239); achievements-lijst klein (77). VONDST F-GAS-088.
### src/ExportAccountant.gs — Gelezen: 1-1077. CSV/JSONL-export batched reads. VONDSTEN F-GAS-089..091.

#### F-GAS-080 [LAAG] src/Diagnostiek.gs:133
Quote: `const data = sheet.getDataRange().getValues();`
Probleem: watchdog in onOpen leest hele Taakstatus-sheet (klein maar telt op bij andere onOpen-hooks).
Fix: laatste N rijen of timestamp in property. Owner: Sam (dev)

#### F-GAS-081 [LAAG] src/Diagnostiek.gs:41
Quote: `const resp = UrlFetchApp.fetch('https://api.kvk.nl/', { muteHttpExceptions: true, method: 'get' });`
Probleem: echte outbound fetch puur voor scope-validatie; kan 60s hangen en blokkeert de diagnostiek.
Fix: goedkopere validatie of overslaan. Owner: Sam (dev)

#### F-GAS-082 [MIDDEL] src/DriveStructuur.gs:471
Quote: `if (resp === ui.Button.YES) { sluitJaarAf(); }`
Probleem: zware sluitJaarAf() (ss.copy = volledige spreadsheet-archief) triggerbaar vanuit onOpen-flow.
Fix: onOpen alleen banner; afsluiting alleen via menu-actie. Owner: Sam (dev)

#### F-GAS-083 [MIDDEL] src/DriveStructuur.gs:395
Quote: `props.setProperty(PROP.VOLGEND_FACTUUR_NR, '1'); props.setProperty(PROP.VOLGEND_INKOOP_NR, '1');`
Probleem: teller-reset zonder script-lock kan interleaven met volgendFactuurnummer_-increment ⇒ dubbel/overgeslagen factuurnummer (art. 35a Wet OB). Zeldzaam pad, fiscaal significante schade.
Fix: reset + prefix-update onder dezelfde script-lock. Owner: Sam (dev)

#### F-GAS-084 [MIDDEL] src/EUVerkoop.gs:146
Quote: `PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({ ts: Date.now(), data: data }));`
Probleem: VIES_<nr>-keys per uniek BTW-nummer; TTL alleen bij lezen gecheckt, nooit opgeruimd ⇒ groei richting 500KB-cap (entries bevatten naam+adres).
Fix: periodieke cleanup in dagelijkseTaken of één JSON-prop met cap. Owner: Sam (dev)

#### F-GAS-085 [LAAG] src/EUVerkoop.gs:296 — per-afnemer setValues+opmaak in ICP-render-loop (meestal klein aantal). Fix: 2D-batch. Owner: Sam. (= zelfde regel als F-RED-066)

#### F-GAS-086 [LAAG] src/EmailDeliverability.gs:50
Quote: `sheet.getRange(i + 1, statusCol + 1).setValue(EMAIL_STATUS_ONGELDIG).setBackground('#FFCDD2')...`
Probleem: per-match setValue+3 opmaak-calls binnen DataRange-loop.
Fix: geclusterde range-writes of comment dat matches klein zijn. Owner: Sam (dev)

#### F-GAS-087 [HOOG] src/EmailQuotaGuard.gs:56
Quote: `const totaal = Math.max(_EMAIL_QUOTA_DAGCAP_DEFAULT, resterend); const gebruikt = totaal - resterend;`
Probleem: dag-totaal afgeleid uit Math.max(100, resterend) ⇒ totaal beweegt mee naar beneden met resterend; Workspace (cap 1500) na 600 verzonden: resterend=900, totaal=900, gebruikt=0, percent=0 ⇒ WAARSCHUWING/KRITIEK escaleren structureel nooit; alleen het harde resterend===0-pad ('OP') vuurt. De pro-actieve guard faalt stil voor Workspace-klanten.
Fix: vaste cap-bron (instelling/EMAIL_DAGCAP); percent = (cap - resterend)/cap. Owner: Sam (dev)

#### F-GAS-088 [MIDDEL] src/Engagement.gs:406
Quote: `Utilities.sleep(2000); toonJaaroverzicht();`
Probleem: onvoorwaardelijke 2s-sleep + dubbele volledige VF/IF-scan in onOpen-pad (eerste 15 dagen januari); checkAchievements_ leest bovendien hele VF per dashboard-refresh.
Fix: sleep verwijderen; jaarstats cachen; achievements incrementeel. Owner: Sam (dev)

#### F-GAS-089 [HOOG] src/ExportAccountant.gs:726
Quote: `function maakNoahArkSnapshot_() { ... Array.prototype.push.apply(regels, _serialiseerSheetNaarJsonl_(sheet)); }`
Probleem: xlsx-backup (394) én NoahArk-JSONL (726, 9 bronsheets incl. Journaalposten >15k regels bij 5k facturen) sequentieel in dezelfde dagelijkseTaken-invocatie, ná dashboard/advies/dunning ⇒ cumulatief richting 6-min-cap; silent kill = partial write halverwege backup.
Fix: twee aparte time-triggers of budget-check die snapshot uitstelt. Owner: Sam (dev)

#### F-GAS-090 [MIDDEL] src/ExportAccountant.gs:418 (+342, 1063)
Quote: `const resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx', ...)`
Probleem: export-fetches zonder timeout/grootte-defense; bij grote sheets richting 60s-cap ⇒ dag-backup faalt stil (klant denkt beschermd te zijn).
Fix: non-2xx als aparte faalcategorie + owner-alert; export-fetch isoleren in eigen trigger. Owner: Sam (dev)

#### F-GAS-091 [LAAG] src/ExportAccountant.gs:439 (+601-622, 787-794)
Quote: `const oudIt = backupMap.getFilesByType(MimeType.MICROSOFT_EXCEL); while (oudIt.hasNext()) { ... }`
Probleem: dagelijkse volledige folder-scan met per-file Drive-roundtrips over een GFS-archief dat oneindig groeit (maand-ankers permanent).
Fix: behouden-beslissing cachen / anker-ids in property. Owner: Sam (dev)

## Batch GAS-F — FeedbackLoop, Fiscaal, FormeelBewijs, Fortress, GezondheidCheck, HelpTab, HerhalendeKosten, HitlValidatie

### Alle 8 volledig gelezen. Kernobservatie: de CUMULATIEVE dagelijkse keten — GezondheidCheck (~8 full scans) + FormeelBewijs (~9 scans + 6× berekenBtwAangifte_ = 12 factuur-scans) + suppletie (8× = 16 scans) + Fortress-hash (opt-in, alle sheets) — scant de twee grootste sheets tientallen keren per dag; budget-guard voorkomt timeout maar skipt dan structureel de late taken (waaronder de property-cleanup van F-GAS-104).

#### F-GAS-100 [LAAG] src/FeedbackLoop.gs:136-141 — "fire-and-forget"-fetch blokkeert wél (GAS kent geen async); tot 60s UI-blokkade. Fix: documenteren of queue-flush. Owner: Sam.
#### F-GAS-101 [MIDDEL] src/Fiscaal.gs:215-229
Quote: `[huidigJaar - 1, huidigJaar].forEach(function(jaar) { for (let q = 1; q <= 4; q++) { ... nieuw = berekenBtwAangifte_(ss, van, tot);`
Probleem: suppletie-detector herrekent tot 8 kwartalen = 16 full factuur-scans per dag bovenop de rest van de keten.
Fix: per-(van,tot)-cache binnen invocation; alleen kwartalen met nieuwe facturen herberekenen. Owner: Sam (dev)
#### F-GAS-102 [MIDDEL] src/Fiscaal.gs:289-291 — SUPPLETIE_GEMELD_-keys zonder cleanup (= F-OND-105). Fix: cutoff-cleanup. Owner: Sam.
#### F-GAS-103 [HOOG] src/FormeelBewijs.gs:497-516 (+160-458)
Quote: `for (let k = 4; k >= 0; k--) { ... const a = berekenBtwAangifte_(ss, van, tot); ... }`
Probleem: I₁₀ 5× + I₅ 1× berekenBtwAangifte_ (elk 2 factuur-scans) + I1/I2/I4/I6/I7/I8/I9 elk eigen full getDataRange ⇒ ~9 directe scans + 12 factuur-scans per dagelijkse run; bij 10k boekingen serieus tegen de 6-min-cap, of budget-guard slaat de wiskundige verificatie stil over.
Fix: sheets één keer inlezen in bewijsAlleInvarianten_ en arrays doorgeven; aangifte-resultaat delen tussen I5/I10/suppletie. Owner: Sam (dev)
#### F-GAS-104 [MIDDEL] src/HerhalendeKosten.gs:336-376
Quote: `const idemKey = 'herhKost_' + rijId + '_' + Utilities.formatDate(volgende, ...);`
Probleem: docstring rekent zelf de cliff door (18.250 keys ≈ 900KB > 500KB); cleanup bestaat maar staat laat in de keten ⇒ als budget-guard hem structureel skipt (F-GAS-103/105) groeit de set alsnog naar de cap.
Fix: idempotency per rij in één JSON-key of als sheet-kolom (laatst-geboekt). Owner: Sam (dev)
#### F-GAS-105 [HOOG] src/GezondheidCheck.gs:906-934
Quote: `try { tel(controleerBalans_(ss)); } ... controleerJournaalposten_(ss).forEach(tel); ...`
Probleem: dagelijkse stille check doet ~8 volledige getDataRange-reads op de grootste sheets, bovenop F-GAS-103/101 in dezelfde invocation.
Fix: gedeelde in-memory reads per run; zware verificaties wekelijks i.p.v. dagelijks overwegen. Owner: Sam (dev)
#### F-GAS-106 [LAAG] src/Fortress.gs:239-240 — FORTRESS_HASHES-blob klein/begrensd. Geen actie. Owner: Sam.
#### F-GAS-107 [MIDDEL] src/Fortress.gs:228-238
Quote: `ss.getSheets().forEach(function(sheet) { ... const data = sheet.getDataRange().getValues(); const json = JSON.stringify(data); const hash = Utilities.computeDigest(...)`
Probleem: snapshot + dagelijkse integriteitscheck JSON-stringify-en en hashen ELKE sheet volledig (opt-in tempert).
Fix: goedkopere fingerprint (rowcount + laatste N rijen) of alleen kritische sheets. Owner: Sam (dev)
#### F-GAS-108 [LAAG] src/HelpTab.gs:46-161 — per-cel setValue×2 + format per rij in 7 secties (vast ~50 rijen, geen cap-risico). Fix: bij gelegenheid batchen. Owner: Sam.
#### F-GAS-109 [MIDDEL] src/HerhalendeKosten.gs:283-285 + 351-369
Quote: `const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return {...}; ... maakJournaalpost_(ss, {...})`
Probleem: script-lock gehouden over tot 36 iteraties × (2 journaalposten + flush) ⇒ lock-starvation voor andere invocations; geneste acquisitie met volgendBoekingNr-lock (reentrant binnen executie maar verlengt houdtijd).
Fix: flush uit de loop; fijnmaziger lock of reeds-gelockt-pad. Owner: Sam (dev)
#### F-GAS-110 [MIDDEL] src/HerhalendeKosten.gs:381-382
Quote: `sheet.getRange(i + 1, 7).setValue(volgende); SpreadsheetApp.flush();`
Probleem: per-rij setValue + per-rij flush() binnen de gehouden lock — structureel verkeerd patroon (sheet klein ⇒ MIDDEL).
Fix: batch setValues op kolom 7 + één flush vóór releaseLock. Owner: Sam (dev)
#### F-GAS-111 [MIDDEL] src/HitlValidatie.gs:226-239 + 196-220
Quote: `const aantal = _haalConceptBoekingen_(ss).length;` — met `const data = sheet.getDataRange().getValues();`
Probleem: voor-onOpen-bedoelde waarschuwing materialiseert de hele JOURNAALPOSTEN-sheet puur voor een count (30s-limiet onOpen).
Fix: count cachen in DocumentProperty of TextFinder. Owner: Sam (dev)
#### F-GAS-112 [LAAG] src/HitlValidatie.gs:172-174 — 4 cel-operaties per gevalideerde rij binnen withLock_; kolommen 17-19 aaneengesloten. Fix: één setValues(rij,17,1,3) + batch-read vooraf. Owner: Sam.

## Batch GAS-G — Hygiene, Inkoopfacturen, Invariants, Jaarafsluiting, KvKCache, Licentie, Menu, Metrics

### Gelezen: alle 8 volledig. KvKCache.gs zonder vondsten — fetch bewust buiten onOpen + rate-limit <24u + schrijft naar Instellingen-sheet i.p.v. properties (conform "1×, max €0,03"-belofte). Zwaarste cluster: het onOpen-pad (F-GAS-125/126/127) bedreigt de 30s-limiet ⇒ menu verschijnt mogelijk niet.

#### F-GAS-120 [MIDDEL] src/Hygiene.gs:232
Quote: `sheet.appendRow([new Date(), level, String(fn || ''), String(msg || ''), ctxStr, user]);`
Probleem: structuredLog_ = appendRow + getLastRow + Session-call per aanroep, terwijl header (19-23) aanraadt Logger.log ermee te vervangen ⇒ in hot-paths 3 sheet-ops/record; modulo-trim-gate (lastRow % 100 === 0) faalt stil bij overslaande nummering ⇒ ongelimiteerde groei.
Fix: nooit per-record; buffer + 1× setValues; trim-conditie >= MAX. Owner: Sam (dev)

#### F-GAS-121 [LAAG] src/Inkoopfacturen.gs:37 — getDataRange + 6 losse setValues onder 30s-lock (single-shot actie). Fix: batch setValues(rij,13,1,3) + kolom-gerichte read. Owner: Sam.

#### F-GAS-122 [HOOG] src/Invariants.gs:78 (+553-556, 695-741)
Quote: `const data = sheet.getDataRange().getValues();`
Probleem: valideerFactuurnummerUniek_ full-scant VERKOOPFACTUREN bij ELKE factuur-write ⇒ bulk-import 5.000 facturen = O(n²); valideerTransactieFormeel_ heeft getDataRange-fallback per regel; detecteerOngekoppeldeBankuitgaven_ leest 3 sheets + geneste forEach.
Fix: nummer-Set vooraf bij bulk; _gbVindRij_-cache prefereren; diagnostiek niet in write-path. Owner: Sam (dev)

#### F-GAS-123 [LAAG] src/Invariants.gs:385 — BEWAARPLICHT_GEMELD_<jaar>-key per jaar zonder cleanup (patroon). Fix: JSON-blob of cleanup. Owner: Sam. (Positief: datum-scan zelf gecapt op 1000 rijen, 366-367.)

#### F-GAS-124 [MIDDEL] src/Jaarafsluiting.gs:130
Quote: `const data = sheet.getDataRange().getValues();`
Probleem: jaarAlAfgesloten_ full-scant JOURNAALPOSTEN — en wordt óók per boekings-write aangeroepen via valideerTransactieFormeel_ (Invariants:572) ⇒ duur bij 10k+ rijen.
Fix: resultaat cachen per invocation/property; alleen Referentie-kolom scannen. Owner: Sam (dev)

#### F-GAS-125 [HOOG] src/Licentie.gs:237
Quote: `const res = valideerLicentieOpServer_(sleutel);`
Probleem: server-UrlFetch op het onOpen-pad (Menu.gs:15), gegate 1×/24u — maar wanneer de gate triggert hangt sheet-opening synchroon aan een externe call met tot 60s timeout ⇒ 30s-simple-trigger-budget overschreden ⇒ menu verschijnt niet/laat; offline-fallback grijpt pas ná de timeout.
Fix: server-validatie naar dagelijkseTaken; onOpen alleen gecachte property lezen. Owner: Sam (dev)

#### F-GAS-126 [MIDDEL] src/Licentie.gs:260
Quote: `ss.getSheets().forEach(function(sheet) { try { const prot = sheet.protect();`
Probleem: vergrendelKopie_ doet 4+ protectie-API-calls per tabblad (×20-30 tabs = 80-120 ops) synchroon in het onOpen-pad bij een kopie.
Fix: minimaal vergrendelen (één tab/range) of lui/incrementeel. Owner: Sam (dev)

#### F-GAS-127 [HOOG] src/Menu.gs:39-137
Quote: `try { controleerOnboarding_(); } ... try { controleerTriggerWatchdog_(); } ... try { herstelKritiekeTriggersIndienNodig_(); } ...`
Probleem: onOpen voert ~15 sequentiële checks uit vóór menu-opbouw, incl. 3× ScriptApp.getProjectTriggers(), sheet-reads (_waarschuwOnvalidered_ full-scan! = F-GAS-111), JSON-parses, modals — plus de licentie-fetch (F-GAS-125) ⇒ cumulatieve looptijd kan 30s overschrijden ⇒ createMenu (139) wordt nooit bereikt: klant zonder menu. Error-isolatie per check is wél correct.
Fix: niet-UI-kritische checks naar dagelijkseTaken of lazy eerste-klik; getProjectTriggers consolideren tot 1; onOpen = licentie-gate (cache) + menu.
Owner: Sam (dev)

#### F-GAS-128 [LAAG] src/Metrics.gs:174 — FATAAL-mail-throttle-key = eerste 80 tekens bericht; variabele data (factuurnr) ⇒ elk bericht uniek ⇒ throttle grijpt niet ⇒ loop-fout kan Gmail-quota opvreten. Fix: categorie als key of bericht normaliseren. Owner: Sam.
#### F-GAS-129 [MIDDEL] src/Metrics.gs:42 — metricsLog_ appendRow+getLastRow per call; metMetrics_-wrapper nodigt per-record-gebruik uit ⇒ observer-effect richting 6-min-cap. Fix: alleen coarse-grained; per-record in-memory aggregeren. Owner: Sam.

## Batch GAS-H — Mollie, MoneybirdImport, NieuweBoeking(+Submit), Notificaties, Onboarding, Prive, Rapportages

### Gelezen: alle 8 volledig. Zonder vondsten: NieuweBoeking.gs (vrijwel volledig client-side HTML; zware I/O zit in handlers elders) en NieuweBoeking_Submit.gs (dunne wrapper mét rate-limit). Mollie idempotency-markers hebben 90d-cleanup (417-453) = OK.

#### F-GAS-140 [MIDDEL] src/Mollie.gs:330
Quote: `const _data = _vf.getDataRange().getValues();` / `for (let i = 1; i < _data.length; i++) {`
Probleem: elke betaalde webhook full-scant VERKOOPFACTUREN (alle kolommen) voor bedrag/nummer-verificatie; Mollie-retries stapelen.
Fix: kolom-projectie of factuurnummer→bedrag-index in CacheService / TextFinder. Owner: Sam (dev)

#### F-GAS-141 [HOOG] src/MoneybirdImport.gs:137/191
Quote: `relatiesSheet.appendRow([ ... ]);` / `vfSheet.appendRow([ ... ]);`
Probleem: header belooft "50+ klanten + 200+ facturen" maar import doet appendRow per record in geneste XAF-loops (XAF tot 20MB toegestaan) ⇒ honderden losse writes richting 6-min-cap; silent kill = partial, niet-idempotente import.
Fix: rijen verzamelen + één setValues-batch per sheet. Owner: Sam (dev)

#### F-GAS-142 [LAAG] src/Notificaties.gs:27 — genereerNotificaties_ triggert 4 aggregator-scans (KPI/belastingadvies/OSS/DGA) ongecached in open-pad. Fix: CacheService-TTL 10-30 min. Owner: Sam.
#### F-GAS-143 [MIDDEL] src/Notificaties.gs:304
Quote: `sheet.getRange(rij, 1).setValue(icon)...` (+307 setValue die door 310 setRichTextValue wordt overschreven)
Probleem: ~6 round-trips per notificatie incl. één pure dubbele write (307 vs 310); begrensd aantal ⇒ geen cap-risico, wel verspilling.
Fix: 307 verwijderen; values batchen. Owner: Sam (dev)
#### F-GAS-144 [MIDDEL] src/Onboarding.gs:47/79
Quote: `Utilities.sleep(1000);` / `Utilities.sleep(500);`
Probleem: sleeps in het onboarding-open-pad vertragen de eerste open; 1500ms-navigatie-sleeps (788/797) zijn wél gerechtvaardigd (modal-constraint).
Fix: 1000ms weg; 500ms → event/poll of ≤200ms. Owner: Sam (dev)
#### F-GAS-145 [LAAG] src/Onboarding.gs:940 — pre-migratie ss.copy per upgrade (eenmalig; backups bewust niet opgeruimd). Optioneel: grootte-drempel. Owner: Sam.
#### F-GAS-146 [LAAG] src/Prive.gs:219 — appendRow + per-cel format in single-record flow (acceptabel). Optioneel: kolom-format eenmalig. Owner: Sam.
#### F-GAS-147 [MIDDEL] src/Rapportages.gs:129 (+278-283, 224-235)
Quote: `sheet.getRange(rij, startKol + 1).setValue(r.naam);` / `...setValue(r.saldo).setNumberFormat('€#,##0.00');`
Probleem: Balans/W&V schrijven 2-3 losse setValues per rekening in loops (bounded ⇒ geen kill, wel ~100 round-trips per rapport; jaarrekening telt 3 rapporten op).
Fix: 2D-array per sectie + format-pass. Owner: Sam (dev)
#### F-GAS-148 [LAAG] src/Rapportages.gs:407-409 — jaarrekening leest GROOTBOEKSCHEMA 3× en berekent balans dubbel. Fix: saldi-map één keer doorgeven. Owner: Sam.

## Wave A — gas_01 (src core) — gelezen volledig
[F-GAS-149] HOOG ResilientExecutor.gs:60 — cumulatieve backoff 1+2+4+8=15s sleep vóór finale throw, geen plafond/exec-budget-check; N gewrapte records × 15s → richting silent-kill. Fix: cap totale backoff of geef exec-deadline mee.
[F-GAS-150] MIDDEL SelfHeal.gs:41 — onOpen roept 2× ScriptApp.getProjectTriggers() (SelfHeal + Setup.herstel) per open; niet gedeeld. Fix: deel één getProjectTriggers()-resultaat.
[F-GAS-151] MIDDEL Setup.gs:438 — controleerEnHerstelTabbladen_ roept maakTabbladen_(ss) per ontbrekend tabblad in forEach → O(N×15) sheet-ops. Fix: één keer ná de loop.
[F-GAS-152] LAAG Setup.gs:990 — Utilities.sleep(1500) in cold-path form-setup (1×/installatie). Laag.
[F-GAS-153] HOOG SmartCategorisatie.gs:208 — autoCategoriseerTransacties: 3-4 losse setValue/setBackground per rij in for-loop; 5000 tx → ~15-20k writes → 6-min-grens/partiële schrijf. Fix: setValues()-batch.
[F-GAS-154] HOOG SmartCategorisatie.gs:354 — slaansFuzzyKoppel: O(n_bank×m_factuur) geneste scan + 4+ losse writes per match + journaalpost. 5000×1000 → ruim over 6 min. Fix: index op bedrag + batch writes.
[F-GAS-155] MIDDEL SmartCategorisatie.gs:430 — CATEGORIE_LEERREGELS JSON-blob groeit zonder cap/TTL per unieke tegenpartij → 9KB/key-limiet → leren faalt stil. Fix: LRU-cap of naar sheet.
[F-GAS-156] MIDDEL Suggesties.gs:222 — checkSuggesties_ draait elke vernieuwDashboard(); telOpenstaande/telActieve doen elk volledige getDataRange().getValues() bovenop dashboard-reads. Fix: lees uit KPI-snapshot.
[F-GAS-157] LAAG Suggesties.gs:264 — resetSuggestieCooldowns getProperties() volledig blok (support-actie, klein). Laag.

## Wave A — gas_02 (src + licence) — gelezen volledig
[F-GAS-169] HOOG Verkoopfacturen.gs:600 — appendRow() in for-loop over CSV-regels (2000-5000) → evenveel round-trips + volgendTransactieId_ per rij → 6-min/partial import. Fix: setValues()-batch, IDs vooraf.
[F-GAS-170] HOOG Verkoopfacturen.gs:289 — stuurFactuurNaarEmailAdres laadt volledige sheet voor 1 factuurnummer-lookup per klik. Fix: geef rij-index mee / lees alleen kol A/B.
[F-GAS-171] MIDDEL Verkoopfacturen.gs:362 — maakCreditnota volledige getDataRange().getValues()-scan voor 1 rij. Fix: gerichte read/index.
[F-GAS-172] MIDDEL Verkoopfacturen.gs:262 — verstuurBezig_-mutex-ScriptProperty zonder TTL-cleanup; stale keys bij crash accumuleren richting 500KB. Fix: prefix toevoegen aan cleanup.
[F-GAS-173] LAAG Verkoopfacturen.gs:305 — flush() per e-mailverzending in klik-pad (bewuste kosten). Laag.
[F-GAS-188] MIDDEL Verkoopfacturen.gs:833 — haalSepaQrBase64_ tot 2 externe UrlFetch per factuur-PDF, geen cache/backoff → bulk verbrandt quota + latency. Fix: cache QR of lokaal genereren.
[F-GAS-174] HOOG XafExport.gs:351 — _bouwTransactionsXml_ getDataRange().getValues() zonder jaar-prefilter op 7-jaars JOURNAALPOSTEN; single-shot richting 6-min. Fix: chunked/continuation bij >20k.
[F-GAS-175] MIDDEL XafExport.gs:185 — XAF via herhaalde string-concat (xml+=) → MB's in één string, heap-druk. Fix: array.push + join.
[F-GAS-176] MIDDEL Verfraaien.gs:198 — verfraaiTabbladen banding+condformat op volledige sheet (lastRow) × 5 tabs → traag bij grote admin. Fix: begrens banding-range.
[F-GAS-177] MIDDEL Verfraaien.gs:153 — _zetEmptyState_ deleteRow(2) O(n) in pad over grote sheets. Kostenpunt.
[F-GAS-178] MIDDEL Urenregistratie.gs:66 — setDataValidation op 999 rijen ×2 kol bij aanmaak; validatie valt weg voorbij rij 1000. (179: positief — totaalUrenInBoekjaar_ leest gebound 2 kol, correct.)
[F-GAS-180] HOOG AdminDashboard.gs:635 — adminObservability 2× UrlFetch naar publieke site in auto-load dashboard-render, geen cache. Fix: CacheService TTL 1u.
[F-GAS-181] MIDDEL AdminDashboard.gs:202 — licentie-sheet 3× volledig gelezen per dashboard-load (data+webhook-scan+stille-klanten). Fix: 1× lezen, array doorgeven.
[F-GAS-182] MIDDEL AdminDashboard.gs:683 — logServerFout_ shift-register ~4 get + ~5 set ScriptProperty per call; fout-storm → write-amplificatie. Fix: 1 JSON-property.
[F-GAS-183] MIDDEL UpdateApply.gs:194 — voerAutomatischeUpdateUit_ 3-4 sequentiële UrlFetch (tot 60s elk) terwijl ScriptLock vastgehouden → lange lock-contentie richting 6-min. Lock-in-network-path.
[F-GAS-184] LAAG UpdateApply.gs:347 — _ruimOudeCodeBackupsOp_ getFiles() over hele map zonder paginatie (best-effort, in catch). Laag.
[F-GAS-185] LAAG AdminDashboard.gs:484 — _zoekLicentieSheetKandidaten_ searchFiles met n<5-paginatie. Positief/correct.
[F-GAS-186/187] INFO — Validaties.gs pure validatie (n.v.t.); UpdateBundle.gs 1 UrlFetch per menu-actie (veilig).

## Wave A — gas_03 (licence-server/Code.gs, 3681 regels) — gelezen volledig
[F-GAS-189] HOOG Code.gs:104-142/625-630 — doPost (30s simple-trigger cap!) houdt scriptLock én doet UrlFetch naar Mollie (tot 60s) + groeiende getDataRange().getValues() binnen lock → silent-kill midden in lock + tryLock-throw → Mollie-retry-storm. Fix: Mollie-status-fetch vóór lock; provisioning-write ná lock-release.
[F-GAS-190] MIDDEL Code.gs:800-801 — otp_/otp_ts_ ScriptProperties zonder tijd-sweeper; abandonment → groei richting 500KB-cap → élke setProperty (incl. provisioning) faalt. Fix: CacheService TTL of dagelijkse cleanup.
[F-GAS-191] MIDDEL Code.gs:823-826 — expiry-pad verwijdert otp_ en otp_pogingen_ maar NIET otp_ts_ → orphan-key per verlopen activatie. Fix: deleteProperty otp_ts_.
[F-GAS-192] MIDDEL Code.gs:2891-2927 — Bindings-sheet groeit onbegrensd (geen trim zoals Telemetry); checkActivationCap_ getDataRange().getValues() volledig per call. Fix: trim toevoegen vóór wiring in valideerEndpoint_.
[F-GAS-193] MIDDEL Code.gs:2502-2541 — rateLimit_ read-then-write op CacheService niet atomair → globale circuit-breaker-cap overschrijdbaar onder concurrency (DoS-guard lekt). Fix: caps ruim onder harde GAS-quota zetten.
[F-GAS-194] MIDDEL Code.gs:2960-3029 — verstuurDripsDagelijks_ geneste loop tot 4 mail/klant zonder per-run-mailbudget → kan 100/dag-consumer-mailcap opmaken en transactionele licentiemails verdringen. Fix: max-mails-per-run-teller.
[F-GAS-195] LAAG Code.gs:23-101 — zelfHerstelProductConfig_ op ELKE doGet (self-heal schaalt lineair met traffic). Fix: cache-gate 1×/24u bij groei.
[F-GAS-196] LAAG Code.gs:1207-1219 — telemetryEndpoint_ dubbele openById op zelfde SS per call. Fix: hergebruik getParent().
[F-GAS-197] LAAG Code.gs:2664-2681/3016-3024 — _verwijderDripKeys_ roept props.getKeys() per oude klant → O(K×G). Fix: getKeys() 1× vóór loop.
[F-GAS-198] LAAG Code.gs:737-744 — appendRow inconsistente kolomtelling (14 vs 11) → bredere scans. Consistentie.

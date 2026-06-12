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

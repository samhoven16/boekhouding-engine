# Audit-findings — langlopend-onderhoud
Hashes van gelezen file-versies: zie tmp/file-hashes.txt.

## Batch OND-A — AIConfig, API, AccountVerwijderen, Assistent, AutoDefaults, BTW, BTWReminder, BackupEmail

### src/AIConfig.gs — Gelezen: 1-77. Alle aspecten n.v.t./OK; aiBeschikbaar_ opt-in, faalt veilig naar false (33-45). Geen vondsten.
### src/API.gs — Gelezen: 1-492. Functionele datums dynamisch (219, 269, 296); CacheService met TTL i.p.v. properties (70-75, 200-210); self-hosted, geen server-dependency. VONDSTEN F-OND-001, 002.
### src/AccountVerwijderen.gs — Gelezen: 1-287. Bewaartermijn-teksten wettelijk correct (72-73); vaste keys. VONDST F-OND-003.
### src/Assistent.gs — Gelezen: 1-210. Jaartal dynamisch (16, 148); snapshot-fallback OK. VONDST F-OND-004.
### src/AutoDefaults.gs — Gelezen: 1-128. Idempotent, faalt veilig (121-128). VONDST F-OND-005.
### src/BTW.gs — Gelezen: 1-922. Jaar via getBoekjaar_() (29, 637, 766) — zie F-OND-006. VONDSTEN F-OND-006..009.
### src/BTWReminder.gs — Gelezen: 1-306. Kwartaal-kandidaten uit kalender (17-27) — rolt correct mee (robuuster dan getBoekjaar_). VONDSTEN F-OND-010, 011.
### src/BackupEmail.gs — Gelezen: 1-208. noah-ark/v1-schema-label (174-176) = beste schema-hygiëne in batch; JSONL zelfbeschrijvend. VONDSTEN F-OND-012..014.

#### F-OND-001 [LAAG] src/API.gs:412
Quote: `// { succes: true, factuurnummer: "F2026001" }`
Probleem: hardcoded jaartal in Zapier-voorbeeld; cosmetisch verouderd over 5 jaar.
Fix: neutraal voorbeeld "F<jaar>001".
Owner: Sam (dev)

#### F-OND-002 [LAAG] src/API.gs:135
Quote: `Logger.log('doPost fout: ' + err.message);`
Probleem: legacy-logger; console.log aanbevolen (Cloud Logging, retentie).
Fix: repo-brede migratie in aparte PR.
Owner: Sam (dev)

#### F-OND-003 [MIDDEL] src/AccountVerwijderen.gs:209-216, 254-270
Quote: `const serverUrl = getLicentieServerUrl_();` … `return { ok: false, fout: 'Licentieserver niet geconfigureerd. Mail support@boekhoudbaar.nl.' };`
Probleem: AVG-art.17-zelfservice hangt volledig aan live licentieserver; bij abandoned scenario is recht-op-vergetelheid-pad onbereikbaar (en support-mailbox mogelijk dood).
Fix: fallback documenteren in afscheidsbrief/README (data in eigen Drive; dead-man-switch mailbox).
Owner: accountant (communicatie)

#### F-OND-004 [HOOG] src/Assistent.gs:54-62
Quote: `'Als uw jaaromzet onder €20.000 blijft...'` … `'meer dan 1.225 uur per jaar'` … `'over 86% van uw winst — 14% is belastingvrij'` … `'slechts 73,5% als kosten aftrekken'` … `'tussen €2.800 en €353.973'`
Probleem: vijf jaar-gebonden fiscale parameters hardcoded in FAQ zonder jaartal-label of versionering (KIA-grenzen wijken bovendien af van canonical 2.901/398.236 elders!); over 5 jaar vertelt de assistent verkeerde grenzen zonder waarschuwing — meest waarschijnlijke stille-rot in batch.
Fix: per-jaar geversioneerde config + "cijfers belastingjaar 20XX"-label + disclaimer.
Owner: Sam (dev) + accountant

#### F-OND-005 [LAAG] src/AutoDefaults.gs:32, 77-81
Quote: `const _AUTODEFAULTS_WEBHOOK_LENGTE = 32;` … `secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, _AUTODEFAULTS_WEBHOOK_LENGTE);`
Probleem: webhook-secret zonder rotatie-pad over 5-10 jaar.
Fix: menu-actie "webhook-sleutel roteren" (laag-prio).
Owner: Sam (dev)

#### F-OND-006 [HOOG] src/BTW.gs:29, 637, 766 (via Utils.gs:526-538 + Setup.gs:675)
Quote: `const jaar = getBoekjaar_();` — Utils: `const raw = getInstelling_('Boekjaar start') || '';` — Setup: `['Boekjaar start', '01-01-' + new Date().getFullYear()],`
Probleem: getBoekjaar_() bevriest op het setup-jaar; rolt alleen mee via handmatige jaarafsluiting (DriveStructuur.gs:380). Klant die nooit afsluit krijgt in 2028 stilletjes BTW-aangiftes/KOR-checks over 2026 — geen crash, geen melding. Centraal meerjaren-risico.
Fix: jaarafsluiting semi-automatisch aanbieden bij jaarwisseling, of getBoekjaar_() laten waarschuwen wanneer setup-jaar < kalenderjaar.
Owner: Sam (dev)

#### F-OND-007 [MIDDEL] src/BTW.gs:785
Quote: `const korGrens = 20000;`
Probleem: KOR-grens hardcoded zonder jaar-versionering; bij wetswijziging vals advies.
Fix: naar geversioneerde belasting-config.
Owner: Sam (dev)

#### F-OND-008 [MIDDEL] src/BTW.gs:722-738
Quote: `snaps[jaar + '_' + kwartaal] = { saldo: …, vastgelegdOp: … }; props.setProperty('BTW_SNAPSHOTS', JSON.stringify(snaps));`
Probleem: blob groeit ~200B/kwartaal zonder pruning ⇒ nadert 9KB-limiet rond ~11 jaar ⇒ setProperty faalt ⇒ suppletie-detectie stil dood; geen _schemaVersie-veld.
Fix: rolling window 12-16 kwartalen of sheet; schema-versie toevoegen.
Owner: Sam (dev)

#### F-OND-009 [LAAG] src/BTW.gs:370, 608, 744 — Logger.log; zie F-OND-002. Owner: Sam (dev)
#### F-OND-010 [LAAG] src/BTWReminder.gs:80, 129, 136, 138 — Logger.log; zie F-OND-002. Owner: Sam (dev)

#### F-OND-011 [LAAG] src/BTWReminder.gs:149-162
Quote: `ScriptApp.newTrigger('controleerBtwDeadline_').timeBased().everyDays(1).atHour(9).create();`
Probleem: idempotent (delete-first OK), maar cumulatief trigger-budget-risico richting 20-cap over alle per-feature-installers.
Fix: consolideren onder dagelijkseTaken.
Owner: Sam (dev)

#### F-OND-012 [MIDDEL] src/BackupEmail.gs:125-133
Quote: `const huidigJaar = new Date().getFullYear();` … `getProperty('DRIVE_HOOFDMAP_' + huidigJaar);`
Probleem: kalenderjaar hier vs bevroren boekjaar elders ⇒ na jaarwisseling zonder afsluiting bestaat DRIVE_HOOFDMAP_<kalenderjaar> niet; naam-fallback (135) redt deels — latente inconsistentie (zelfde klasse als cycle58-defect).
Fix: getBoekjaar_() gebruiken, consistent met DriveStructuur.
Owner: Sam (dev)

#### F-OND-013 [LAAG] src/BackupEmail.gs:42 — Logger.log; zie F-OND-002. Owner: Sam (dev)

#### F-OND-014 [MIDDEL] src/BackupEmail.gs:144-155
Quote: `const it2 = backupMap.getFiles(); while (it2.hasNext()) { ... }`
Probleem: NoahArk-snapshots nooit opgeruimd ⇒ Drive-quota-groei + steeds tragere iterator-scan.
Fix: retentiebeleid (laatste N / 90 dagen) in snapshot-maker.
Owner: Sam (dev)

Batch-verdict: WERKT DOOR maar BEVRIEST OP SETUP-JAAR (F-OND-006 + F-OND-012); fiscale teksten verouderen stil (F-OND-004/007); property-/Drive-groei (F-OND-008/014).

## Batch OND-B — BankImport, Bankboek, BelastingOptimizer, Belastingadvies, Belastingvoordeel, BoekingEngine, Boekingen, Brand

### src/BankImport.gs — Gelezen: 1-547. CSV-import volledig lokaal (446-471) = abandoned-proof. VONDSTEN F-OND-020..022.
### src/Bankboek.gs — Gelezen: 1-185. Vaste structurele grootboekcodes; puur lokaal. Geen vondsten.
### src/BelastingOptimizer.gs — Gelezen: 1-288. Staffel via getBelasting_() (94, 181). VONDST F-OND-023.
### src/Belastingadvies.gs — Gelezen: 1-1919. BELASTING_META met versie/bron goed gemodelleerd (46-66); fallback + TARIEF_VEROUDERD-flag (251-282, banner 1412-1422). VONDSTEN F-OND-024 (BLOCKER)..027.
### src/Belastingvoordeel.gs — Gelezen: 1-1145. Kern-boekingen lokaal (576-603, 753-773). VONDSTEN F-OND-028..030.
### src/BoekingEngine.gs — Gelezen: 1-1086. AI degradeert netjes naar handmatig (582); audit-ringbuffer begrensd (869-882). VONDSTEN F-OND-032..034, 036, 037.
### src/Boekingen.gs — Gelezen: 1-1480. Kernboekhouding volledig lokaal. VONDSTEN F-OND-037..040.
### src/Brand.gs — Gelezen: 1-104. Statisch. Geen vondsten.

#### F-OND-020 [LAAG] src/BankImport.gs:506 — 2024-datum in CSV-voorbeeld (cosmetisch). Fix: dynamisch jaar. Owner: Sam.
#### F-OND-021 [MIDDEL] src/BankImport.gs:307-308, 365-381
Quote: `const key = dt + '|' + (parseFloat(btData[i][3]) || 0).toFixed(2) + '|' + String(btData[i][2] || '').slice(0, 30);`
Probleem: dedup-key + 15-koloms rij-layout op vaste indices zonder schema-versie ⇒ kolom-toevoeging schuift dedup stil mis ⇒ dubbele journaalposten of gemiste dedup.
Fix: schema-versie-cel + kolom-validatie tegen sheet-schemas.md; luid falen bij mismatch.
Owner: Sam (dev)
#### F-OND-022 [MIDDEL] src/BankImport.gs:188-227 — volledige VF/IF/BT-scan per import groeit lineair; match-fase buiten guillotine. Fix: open-facturen-index / jaarlijkse archivering. Owner: Sam.
#### F-OND-023 [LAAG] src/BelastingOptimizer.gs:90-91, 182 — verouderde fallbacks 0.3693/0.28. Fix: getBelasting_-defaults of throw. Owner: Sam.

#### F-OND-024 [BLOCKER] src/Belastingadvies.gs:185-234, 256-263
Quote: `2027: { ZELFSTANDIGENAFTREK: 900, // INDICATIEF — afbouw zet door ... LIJFRENTE_MAX: 39000, ...`
Probleem: BELASTING_PER_JAAR loopt t/m 2027 en 2027 is expliciet placeholder/INDICATIEF. Vanaf belastingjaar 2028 valt getBelasting_() terug op die nooit-bevestigde placeholder (TARIEF_VEROUDERD-flag + banner mitigeren zichtbaarheid, niet de fout) ⇒ heel het product (zelfstandigenaftrek, schijven, heffingskortingen, KIA, Box 3, DGA-loon) rekent vanaf 1-1-2028 structureel fout als Sam de Prinsjesdag-update mist. Hét concrete 5-jaar-breekpunt. Tijdlijn: Q3 2026 → 2027 definitief maken; 1-1-2028 → eerste jaar zonder tabel.
Fix: server-override-pad (haalConfigOp_().belastingTarieven, 245) + Instellingen-overrides (358-389) documenteren als klant/accountant-pad zonder Sam; banner hard/blokkerend maken voor jaren > laatst-bevestigd.
Owner: Sam (dev) + accountant (communicatie)

#### F-OND-025 [MIDDEL] src/Belastingadvies.gs:7-25, 144-150, 360-388, 1561, 1910
Quote: `Zelfstandigenaftrek €2.470 (ZZP, ≥1225 uur — stapsgewijs verlaagd)` (11); `Zonnepanelen – ... salderen (t/m 2027)` (1910)
Probleem: klant-zichtbare teksten met hardcoded jaargebonden bedragen buiten getBelasting_() drijven weg van de config-gestuurde berekening.
Fix: teksten uit config genereren of als "voorbeeld" markeren.
Owner: Sam (dev)

#### F-OND-026 [MIDDEL] src/Belastingadvies.gs:238, 714, 720, 1753
Quote: `const jaar = new Date().getFullYear();`
Probleem: advies hangt aan kalenderjaar i.p.v. getBoekjaar_() ⇒ verkeerd tarief-cohort bij gebroken boekjaar; jaarwisseling klapt direct naar onbevestigd jaar.
Fix: boekjaar voor cohort-keuze of expliciet documenteren.
Owner: Sam (dev)

#### F-OND-027 [LAAG] src/Belastingadvies.gs:1786-1797 — KIA_MISSER_GEMELD_<jaar>_Q<kw>-keys nooit opgeruimd (~40 keys/10jr). Fix: cleanup >2 jaar. Owner: Sam.
#### F-OND-028 [MIDDEL] src/Belastingvoordeel.gs:103-235
Quote: `zelfstandigenaftrek (€2.470), startersaftrek (€2.123 eerste 3 jaar)` (146)
Probleem: 12 maanden seizoens-tips met hardcoded fiscale bedragen buiten getBelasting_() — maart-tip toont al in 2026 verkeerde zelfstandigenaftrek.
Fix: bedragen injecteren uit config of verwijzen naar Belastingadvies-tab.
Owner: Sam (dev)
#### F-OND-029 [LAAG] src/Belastingvoordeel.gs:170-184 — vaste deadline-teksten. Geen actie. Owner: Sam.
#### F-OND-030 [LAAG] src/Belastingvoordeel.gs:244-265 — mijlpaal-UserProperties nooit opgeruimd (90 keys/10jr). Fix: cleanup. Owner: Sam.

#### F-OND-033 [HOOG] src/BoekingEngine.gs:630, 783
Quote: `'https://generativelanguage.googleapis.com/v1beta/models/' + _geminiModel_() + ':generateContent?key=' + apiKey,`
Probleem: Gemini API-versie v1beta hardcoded in twee call-sites; model wél via property overschrijfbaar (GEMINI_MODEL) maar de API-versie niet ⇒ Google-EOL van v1beta legt AI-scan stil tot code-deploy (code-comment 523-527 bewijst zelf het EOL-tempo: gemini-2.0-flash EOL 2026-06-01). Boekhouding zelf blijft werken (handmatig pad) ⇒ HOOG, geen BLOCKER.
Fix: GEMINI_API_VERSION als ScriptProperty.
Owner: Sam (dev)

#### F-OND-034 [MIDDEL] src/BoekingEngine.gs:529, 538-544 — model-default gemini-2.5-flash faseert binnen 1-2 jaar uit; verse klant valt op dode default terug (afgevangen 644-647). Fix: fallback-lijst + UI-documentatie. Owner: Sam + klant.
#### F-OND-032 [LAAG] src/BoekingEngine.gs:494-496 — AI Act-datum in comment; logAiAanroep_ correct. Geen actie.
#### F-OND-036 [MIDDEL] src/BoekingEngine.gs:475-489
Quote: `folder = mappen.hasNext() ? mappen.next() : DriveApp.createFolder('Bonnetjes & Ontvangstbewijzen');`
Probleem: bonnen onbeperkt in één platte Drive-map (duizenden files/10jr; 15GB-quotum owner); bewaarplicht verbiedt auto-delete.
Fix: jaar/kwartaal-submappen + quota-monitoring documenteren.
Owner: Sam (dev) + klant (config)

#### F-OND-037 [MIDDEL] src/Boekingen.gs:100-128 (+ BoekingEngine)
Quote: `opt.preGevalideerd === true ? new Date() : '',` (laatste van 20 kolommen)
Probleem: 20-koloms journaalpost-rij met magic indices repo-breed; geen schema-versie ⇒ grootste stille-corruptie-bron bij kolom-evolutie (CLAUDE.md waarschuwt zelf).
Fix: schema-versie + header-validatie; kolom-indices als constanten in Config.gs.
Owner: Sam (dev)

#### F-OND-038 [MIDDEL] src/Boekingen.gs:1209-1241
Quote: `const backupKey = 'GESLOTEN_PERIODES_CORRUPT_' + ts; ... props.setProperty(backupKey, bestaand);`
Probleem: tijdgestempelde corrupt-backups nooit opgeruimd ⇒ onbegrensde groei richting 500KB-totaallimiet ⇒ setProperty-fails breken andere features stil.
Fix: max 1-2 backups of verborgen sheet-tab.
Owner: Sam (dev)

#### F-OND-039 [LAAG] src/Boekingen.gs:901-913, 973-990 — appendRow-in-lus (zelfde antipatroon dat BankImport al oploste). Fix: batch setValues. Owner: Sam. (= F-GAS-050)
#### F-OND-040 [LAAG] src/Boekingen.gs:1028-1093 — padding-overflow na 999.999 boekingen (theoretisch). Geen actie.

Batch-verdict: kern abandoned-proof; risico's in fiscale laag (F-OND-024 BLOCKER) en AI-laag (F-OND-033).

## Batch OND-C — Branding, BtwExport, Changelog, Config, CustomFunctions, DLQ, Dashboard, DataPortability

### src/Branding.gs — Gelezen: 1-455. Logo lokaal in properties = abandoned-proof. VONDSTEN F-OND-050, 051.
### src/BtwExport.gs — Gelezen: 1-326. _schema-veld v1 aanwezig (271) — nette versionering; volledig lokaal. VONDSTEN F-OND-052, 053.
### src/Changelog.gs — Gelezen: 1-199. Semver-vergelijking veilig (83-94). VONDSTEN F-OND-054, 055.
### src/Config.gs — Gelezen: 1-346. Pure constanten. VONDSTEN F-OND-056..058.
### src/CustomFunctions.gs — Gelezen: 1-311. Fallback op laatst-bekend jaar netjes (71-101). VONDSTEN F-OND-059, 060.
### src/DLQ.gs — Gelezen: 1-282. FIFO-cap; één overschreven property. VONDSTEN F-OND-061, 062.
### src/Dashboard.gs — Gelezen: 1-1628. Jaar-logica dynamisch; rekent volledig lokaal. VONDSTEN F-OND-063, 064 (OK-bevestiging).
### src/DataPortability.gs — Gelezen: 1-217. GDPR-export = werkend migratiepad (71-114, 195) — sterk voor USP. VONDSTEN F-OND-065, 066.

#### F-OND-050 [LAAG] src/Branding.gs:99-103
Quote: `for (let i = 0; i < chunks; i++) { props.setProperty('bedrijfsLogo_chunk_' + i, ...); } props.setProperty('bedrijfsLogoChunks', String(chunks));`
Probleem: teller-gestuurde cleanup fragiel — corrupt-teller laat wees-chunks achter zonder opruim-route (geen prefix-scan).
Fix: defensieve getKeys()-scan op bedrijfsLogo_chunk_-prefix in verwijderLogo(). Owner: Sam (dev)

#### F-OND-051 [LAAG] src/Branding.gs:106 — redundante PROP_LOGO-write die nooit gelezen wordt. Fix: verwijderen of documenteren. Owner: Sam.

#### F-OND-052 [MIDDEL] src/BtwExport.gs:284-286
Quote: `r1a: { naam: 'Leveringen/diensten belast 21%', ... }, r1b: { naam: 'Leveringen/diensten belast 9%', ... }`
Probleem: BTW-percentages hardcoded in export-rubrieknamen; bij tariefwijziging stille inconsistentie in compliance-document; geen mechanisme dat schema-bump afdwingt.
Fix: "hoog/laag tarief" of percentage uit centrale BTW-config. Owner: Sam (dev)

#### F-OND-053 [LAAG] src/BtwExport.gs:245-247 — dode ternary (beide takken identiek); suggereert ontbrekend datum-stempel. Fix: vereenvoudigen of stempel toevoegen. Owner: Sam.

#### F-OND-054 [LAAG] src/Changelog.gs:19-29 — changelog bevriest in abandoned-mode op laatste entry (signaal "product dood"). Fix: communicatie-regel in laatste entry. Owner: accountant.

#### F-OND-055 [MIDDEL] src/Changelog.gs:178
Quote: `Volledige roadmap: <a href="https://www.boekhoudbaar.nl/roadmap/" ...>`
Probleem: hardcoded domein in product-modal; bij verlopen/gehijackt domein dood of gevaarlijk support-pad (idem support@boekhoudbaar.nl in BtwExport 181/203).
Fix: URLs/support-mail centraliseren in Config; domein-renewal los van Sam borgen. Owner: Sam + accountant

#### F-OND-056 [HOOG] src/Config.gs:208, 220, 235
Quote: `{ code:'7350', naam:'Reiskosten eigen vervoer (€0,23/km)', ... }` / `'Representatiekosten (73,5% aftrekbaar)'` / `'Kleine aanschaffingen (< €450)'`
Probleem: fiscale jaargebonden waardes in grootboeknamen worden eenmalig bij setup naar de sheet geschreven en blijven jaren staan — klant in 2029 boekt op verouderde labels; tweede niet-gesynchroniseerde bron van waarheid naast BELASTING_PER_JAAR. (Verdiept F-TAX-092.)
Fix: bedragen uit namen; verwijzen naar jaartabel. Owner: Sam (dev)

#### F-OND-057 [MIDDEL] src/Config.gs:286-292
Quote: `DRIVE_HOOFDMAP_PREFIX: 'DRIVE_HOOFDMAP_', ... (vul aan met _<jaar>)`
Probleem: 6 properties per boekjaar, nooit opgeruimd — monotone groei richting 500KB-totaallimiet bovenop andere per-jaar/per-factuur-keys.
Fix: één JSON-property DRIVE_MAPPEN of jaarlijkse opruimstap (>7 jaar). Owner: Sam (dev)

#### F-OND-058 [LAAG] src/Config.gs:114-241, 246-302 — geen GROOTBOEK_SCHEMA_VERSIE ⇒ migraties over jaren niet detecteerbaar. Fix: versie-constante + opslaan bij setup. Owner: Sam.

#### F-OND-059 [HOOG] src/CustomFunctions.gs:82-101 (+126-128)
Quote: `// Last-resort hardcoded 2025-snapshot ... return { ZELFSTANDIGENAFTREK: 2470, MKB_WINSTVRIJSTELLING: 0.127, ... IB_SCHIJVEN: [ { tot: 38441, pct: 0.3582 }, ... ] };`
Probleem: volledige fiscale 2025-snapshot 2× gedupliceerd als fallback; cel-functies (SCHULD_SCHIJF/ZZP_NETTO) presenteren voor jaren ≥2028 stilletjes verouderde tarieven zonder enig signaal.
Fix: duplicaten verwijderen; #VEROUDERD-signaal wanneer gevraagd jaar > nieuwste tabel-jaar. Owner: Sam (dev)

#### F-OND-060 [MIDDEL] src/CustomFunctions.gs:241-245 (+167, 187, 195, 229)
Quote: `return n <= 20000 ? 'JA — KOR mogelijk' : 'NEE — boven drempel';`
Probleem: KOR-drempel kale literal zonder jaar-koppeling (anders dan overige functies); idem inline fallbacks STARTERSAFTREK||2123, ZVW_MAX||75864, KM||0.23 — fout antwoord zonder signaal bij wijziging; KOR raakt wel/niet BTW afdragen.
Fix: drempel uit jaartabel; fallbacks documenteren of verwijderen. Owner: Sam (dev)

#### F-OND-061 [LAAG] src/DLQ.gs:43-51, 90-91
Quote: `return stuurFactuurEmailNaarKlant_(payload.email, payload.klantnaam, payload.factuurnummer, ...)`
Probleem: payloads zonder _v-schemaveld; in-flight items na signatuur-wijziging fout uitgepakt ⇒ stille mis-levering.
Fix: _v-veld + versie-check; onbekend ⇒ FAILED. Owner: Sam (dev)

#### F-OND-062 [MIDDEL] src/DLQ.gs:16, 52-54, 130-161
Quote: `const DLQ_MAX_RIJEN = 1000;` ... `default` (157) `return false`
Probleem: handler-loze types (WEBHOOK/Mollie, genoemd in header 6-7) lopen gegarandeerd naar FAILED + escaleerDlqFataal_ → owner-mail die in abandoned-mode dood is; klant ziet zichtbaar gemaakte DLQ-tab met onbegrijpelijke fouten.
Fix: verwachte niet-retrybare types direct FAILED zonder escalatie; meldFataalAanOwner_ no-op-veilig. Owner: Sam (dev)

#### F-OND-063 [MIDDEL] src/Dashboard.gs:311-1423 — herhaalde volledige VF-reads per refresh; 50k rijen/10 jaar ⇒ trager dashboard richting 6-min-cap; geen archivering. Fix: één read + doorgeven; archiveringsstrategie. (= F-GAS-066/068.) Owner: Sam.
#### F-OND-064 [LAAG] src/Dashboard.gs:512, 1557, 162, 168 — OK-bevestiging: dashboard zelf-bevattend, overleeft Sam-uitval; alleen menu-label-drift als onderhoudslast. Geen actie.

#### F-OND-065 [LAAG] src/DataPortability.gs:58-61
Quote: `UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx', ...)`
Probleem: ongedocumenteerd/ongeversioneerd Google-endpoint als primair migratie-kanaal; falen netjes opgevangen (67-69) maar de nuttigste export is de fragielste.
Fix: documenteren; Drive API files.export als fallback. Owner: Sam (dev)

#### F-OND-066 [MIDDEL] src/DataPortability.gs:36-50
Quote: `const mapNaam = 'export-volledig_' + bedrijf + '_' + ts; ... exportsParent.createFolder(mapNaam);`
Probleem: elke export = nieuwe datum-map met volledige XLSX-kopie, nooit opgeruimd ⇒ monotone Drive-groei bij herhaald gebruik.
Fix: vaste "laatste export"-map of retentie/waarschuwing. Owner: Sam (dev)

Zwaartepunt OND-C: F-OND-056/059 (stil verouderende fiscale waardes in labels en cel-functies), F-OND-062 (DLQ in abandoned-mode), F-OND-055 (hardcoded domein).

## Batch OND-D — Diagnostiek, DriveStructuur, EUVerkoop, EersteKlantCheck, EmailDeliverability, EmailQuotaGuard, Engagement, ExportAccountant

### src/Diagnostiek.gs — Gelezen: 1-184. Alle services actueel. VONDST F-OND-080.
### src/DriveStructuur.gs — Gelezen: 1-480. Data in klant-Drive = abandoned-proof. VONDSTEN F-OND-081..085.
### src/EUVerkoop.gs — Gelezen: 1-355. VIES graceful fail (121-141). VONDSTEN F-OND-086 (HOOG)..089.
### src/EersteKlantCheck.gs — Gelezen: 1-301. Geen hardcoded jaar. VONDSTEN F-OND-090, 091.
### src/EmailDeliverability.gs — Gelezen: 1-111. VONDST F-OND-092.
### src/EmailQuotaGuard.gs — Gelezen: 1-179. Geen externe provider; klant-eigen quota. VONDST F-OND-093.
### src/Engagement.gs — Gelezen: 1-409. parseJsonVeilig_ tegen corruptie. VONDSTEN F-OND-094, 095.
### src/ExportAccountant.gs — Gelezen: 1-1076. NoahArk JSONL met _schema + reconstructie-instructie (755-769) = sterkste survival-mechanisme van de batch. VONDSTEN F-OND-096, 097.

#### F-OND-080 [LAAG] src/Diagnostiek.gs:41 — autorisatie-probe hangt aan api.kvk.nl-beschikbaarheid ⇒ vals "FOUT" mogelijk. Fix: neutraal Google-endpoint. Owner: Sam.
#### F-OND-081 [MIDDEL] src/DriveStructuur.gs:247 — jaar-range 2020-2099 hardcoded; ondergrens blokkeert historische correcties. Fix: relatieve range. Owner: Sam.
#### F-OND-082 [MIDDEL] src/DriveStructuur.gs:437-438
Quote: `const maand = new Date().getMonth() + 1; if (maand > 3) return;`
Probleem: jaarwisseling-herinnering alleen jan-mrt; klant die dan niet opent factureert het hele jaar met fout boekjaar-prefix zonder waarschuwing. (Versterkt F-OND-006.)
Fix: banner tonen zolang prefixJaar < huidigJaar. Owner: Sam (dev)
#### F-OND-083 [MIDDEL] src/DriveStructuur.gs:25-61 — 6 DRIVE_*-keys per boekjaar, nooit opgeruimd (= F-OND-057, hier de schrijfzijde). Fix: JSON-blob of opruimstap. Owner: Sam.
#### F-OND-084 [MIDDEL] src/DriveStructuur.gs:330-332
Quote: `const archief = ss.copy('Boekhoudbaar ' + huidigJaar + ' — Archief');`
Probleem: volledige spreadsheet-copy per jaarafsluiting zonder retentie ⇒ Drive-quota; volgende afsluiting faalt op precies deze stap bij volle Drive (333-347).
Fix: archief-map + retentie of preventieve quota-waarschuwing. Owner: Sam (dev)
#### F-OND-085 [LAAG] src/DriveStructuur.gs:380-381 — boekjaargrenzen als dd-mm-yyyy-strings zonder format-versie. Fix: ISO of schema-versie. Owner: Sam.
#### F-OND-086 [HOOG] src/EUVerkoop.gs:19
Quote: `const OSS_DREMPEL = 10000;`
Probleem: EU-OSS-drempel (richtlijn 2017/2455) als kale constante op 3 plekken gebruikt (199, 335, 343); bij EU-herziening rekent de engine stil fout of klant OSS-plichtig is ⇒ onjuiste aangifte; in abandoned-mode jarenlang.
Fix: instelbare Config-waarde met "geldig per jaar X"-label + aanname tonen in meldingen. Owner: Sam (dev)
#### F-OND-087 [LAAG] src/EUVerkoop.gs:22-29 — EU-lidstatenlijst hardcoded; bij toetreding/uittreding mist ICP/OSS-detectie. Fix: laatst-bijgewerkt-datum + verwijzing. Owner: Sam.
#### F-OND-088 [MIDDEL] src/EUVerkoop.gs:74
Quote: `const VIES_API_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/';`
Probleem: één hardcoded endpoint zonder fallback; bij EC-migratie wordt validatie permanent null (graceful maar stil) ⇒ klant verlegt op ongeverifieerde nummers.
Fix: URL in Config + health-check die langdurige null-reeksen meldt. Owner: Sam (dev)
#### F-OND-089 [MIDDEL] src/EUVerkoop.gs:98-150 — VIES_-keys nooit verwijderd (geen enkele deleteProperty in repo, geverifieerd); honderden permanente keys richting 500KB-cap. Fix: cleanup-pas of CacheService. Owner: Sam. (= F-GAS-084)
#### F-OND-090 [LAAG] src/EersteKlantCheck.gs:121-123 — hardcoded verwachte-triggers-lijst dupliceert installer ⇒ drift. Fix: één centrale definitie. Owner: Sam.
#### F-OND-091 [MIDDEL] src/EersteKlantCheck.gs:144-148
Quote: `const ok = isLicentieGeldig_(); ... return { naam: 'Licentie geldig', status: 'FOUT',`
Probleem: readiness-verdict gekoppeld aan license-server; in abandoned/grace-scenario meldt de werkt-alles-test "niet klaar" terwijl de boekhouding functioneert.
Fix: "systeem functioneel" splitsen van "licentie actief". Owner: Sam (dev)
#### F-OND-092 [LAAG] src/EmailDeliverability.gs:36-42 — Email-status-kolom lazy runtime-append ⇒ niet-deterministische index over jaren. Fix: vaste kolom in Setup + sheet-schemas.md. Owner: Sam.
#### F-OND-093 [LAAG] src/EmailQuotaGuard.gs:35 — dagcap-aannames (100/1500) hardcoded; Google wijzigt deze soms. Fix: documenteren als fallback; absolute drempels. Owner: Sam. (zie ook F-GAS-087: berekening zelf kapot)
#### F-OND-094 [LAAG] src/Engagement.gs:76-77 — achievements append-only maar domein-begrensd (7) ⇒ acceptabel; volledigheidsnotitie. Geen actie.
#### F-OND-095 [LAAG] src/Engagement.gs:244-249 — NPS-forward naar Sam-only kanaal; faalt stil in abandoned-mode (geen klant-impact). Fix: runbook-notitie. Owner: Sam.
#### F-OND-096 [LAAG] src/ExportAccountant.gs:342-343, 1046-1060 — backup/PDF leunen op ongedocumenteerd /export-endpoint (= F-OND-065); NoahArk dekt survival. Fix: documenteren. Owner: Sam.
#### F-OND-097 [MIDDEL] src/ExportAccountant.gs:51-54
Quote: `folder = bestaandeMappen.hasNext() ? bestaandeMappen.next() : DriveApp.createFolder(mapNaam);`
Probleem: accountantspakket-map hergebruikt maar oude files nooit verwijderd ⇒ duplicaat-bestandsnamen stapelen per export; accountant weet niet welke set actueel is.
Fix: gelijknamige files overschrijven/verwijderen of timestampen. Owner: Sam (dev)

## Batch OND-E — FeedbackLoop, Fiscaal, FormeelBewijs, Fortress, GezondheidCheck, HelpTab, HerhalendeKosten, HitlValidatie

### Per-bestand: FeedbackLoop (1-165), Fiscaal (1-446), FormeelBewijs (1-539), Fortress (1-292), GezondheidCheck (1-966), HelpTab (1-194), HerhalendeKosten (1-517), HitlValidatie (1-240) — alle volledig gelezen. Positief: HerhalendeKosten-cleanup correct doorberekend en dagelijks aangesloten; FormeelBewijs draait volledig offline; Fiscaal consequent via getBelasting_().

#### F-OND-100 [LAAG] src/FeedbackLoop.gs:25 — comment belooft "auto-flush" die niet bestaat. Fix: comment of implementatie. Owner: Sam.
#### F-OND-101 [MIDDEL] src/FeedbackLoop.gs:133-145
Quote: `const serverUrl = getLicentieServerUrl_();` ... `UrlFetchApp.fetch(serverUrl + '?actie=feedback', {`
Probleem: na abandonment zegt de dialog "Bedankt! Jouw feedback is verzonden" (78) terwijl niets aankomt — loze belofte.
Fix: eerlijke melding bij onbereikbare server of item verbergen. Owner: Sam (dev)
#### F-OND-102 [HOOG] src/Fiscaal.gs:17
Quote: `const DGA_MIN_SALARIS_FALLBACK = 56000;`
Probleem: gebruikelijk loon wijzigt vrijwel jaarlijks; fallback bevriest bij abandonment ⇒ DGA-monitor adviseert te laag minimum ⇒ correctierisico. (= F-TAX-070, hier het 5-10-jaar-perspectief.)
Fix: "geldig voor tariefjaar X"-melding bij fallback-gebruik + koppeling aan TARIEFSJAAR. Owner: Sam + accountant
#### F-OND-103 [MIDDEL] src/Fiscaal.gs:72,80 — MIA-default 36% zonder config-laag (EIA heeft die wél). Fix: MIA naar BELASTING_PER_JAAR. Owner: Sam. (= F-TAX-067)
#### F-OND-104 [LAAG] src/Fiscaal.gs:168 — stakingsaftrek-fallback €3.630 hardcoded. Fix: tariefjaar vermelden. Owner: Sam.
#### F-OND-105 [MIDDEL] src/Fiscaal.gs:277-291 — SUPPLETIE_GEMELD_-keys zonder cleanup (geen deleteProperty in repo). Fix: cutoff-cleanup in dagelijkseTaken. Owner: Sam.
#### F-OND-106 [HOOG] src/FormeelBewijs.gs:162-168, 197-209, 262, 421
Quote: `// Kolommen: [4] debet rek, [6] credit rek, [8] bedrag, [16] status` ... `const saldoGB = parseFloat(gbData[i][5]) || 0;`
Probleem: alle 10 invariant-checkers lezen op magic kolom-indexen zonder header-validatie of schema-versie ⇒ bij kolom-toevoeging produceren juist de integriteits-checks zelf vals "OK"/valse schendingen (vgl. F-INV-004 dat al zo'n off-by-one is!).
Fix: gedeelde kolom-constanten + header-naam-guard aan begin van bewijsAlleInvarianten_. Owner: Sam (dev)
#### F-OND-107 [LAAG] src/FormeelBewijs.gs:243 — survival-positief; vaste I₃-tolerantie €0,05 evt. relatief maken. Geen actie.
#### F-OND-108 [LAAG] src/Fortress.gs:239-240 — FORTRESS_HASHES groeit met tab-aantal (nu ~2KB). Geen actie nodig; monitoring dekt. Owner: Sam.
#### F-OND-109 [HOOG] src/Fortress.gs:36-71, 211-244
Quote: `prot = sheet.protect().setDescription('Fortress lockdown — bewerken via menu');`
Probleem: protecties hangen aan Session.getEffectiveUser(); bij eigendomswissel/OAuth-rotatie kan niemand meer in de sheets en draait fortressModeUit zelf zonder rechten ⇒ abandoned + Fortress-aan + eigendomswissel = permanent gelockte boekhouding zonder UI-ontsnapping.
Fix: handmatig noodpad documenteren in Help-tab (Data → Beschermde bladen); fortressModeUit falen-met-instructie. Owner: Sam + klant
#### F-OND-110 [LAAG] src/Fortress.gs:216-219 — shadow-sheet dood concept (docstring belooft cel-opslag die er niet is). Fix: docstring. Owner: Sam.
#### F-OND-111 [MIDDEL] src/Fortress.gs:131-138
Quote: `function _fortressSkipSheet_(naam) { if (naam.indexOf('_Fortress') === 0) return true; return naam === SHEETS.AUDIT_ANCHOR || naam === SHEETS.AUDIT_LOG; }`
Probleem: statische skip-lijst schaalt niet mee met nieuwe dynamische tabs (Suppletie, Gezondheidscheck) ⇒ vergrendelde her-schrijf faalt stil of dagelijks vals drift-alarm.
Fix: structureel skip-criterium (marker/kleur) i.p.v. naam-enumeratie. Owner: Sam (dev)
#### F-OND-112 [HOOG] src/GezondheidCheck.gs:156-165 (+full-file kolom-indexen)
Quote: `const kandidaten = [boekjaar, new Date().getFullYear(), new Date().getFullYear() - 1];`
Probleem: Drive-map-check kijkt alleen naar 3 jaren rond nu ⇒ dormante klant (paar jaar gat) krijgt vals "run setup opnieuw"; plus zelfde magic-kolom-risico als F-OND-106.
Fix: alle DRIVE_HOOFDMAP_*-keys scannen; kolomindexen centraliseren. Owner: Sam (dev)
#### F-OND-113 [MIDDEL] src/GezondheidCheck.gs:90-95 — trigger-diagnose checkt alleen length===0, niet nadering 20-cap. Fix: waarschuwing bij >=18. Owner: Sam.
#### F-OND-114 [LAAG] src/GezondheidCheck.gs:65-72 — drie property-namen via OR-keten = informeel migratiepad zonder versienummer. Fix: CONFIG_SCHEMA_VERSIE + migratiefunctie. Owner: Sam.
#### F-OND-115 [MIDDEL] src/GezondheidCheck.gs:121-138 — licentie-diagnose correct fail-open maar survival hangt aan Licentie.gs-gedrag; regressietest-vereiste vastleggen. Owner: Sam.
#### F-OND-116 [HOOG] src/HelpTab.gs:103
Quote: `['☐ 9. KOR-omzet onder €20.000?', 'Anders afmelden bij Belastingdienst'],`
Probleem: KOR-grens hardcoded in checklist die expliciet alleen via product-updates wijzigt ⇒ bevriest bij abandonment ⇒ onjuist KOR-advies met BTW-consequenties. (= F-OND-007-klasse, hier de Help-tab.)
Fix: bedrag uit getBelasting_() of verwijzing zonder hard getal. Owner: Sam + accountant
#### F-OND-117 [MIDDEL] src/HelpTab.gs:99,106,117-121 — deadlines hardcoded zonder "geldig per"-stempel ⇒ klant in 2030 ziet niet hoe oud info is. Fix: laatst-bijgewerkt-regel. Owner: Sam.
#### F-OND-118 [MIDDEL] src/HelpTab.gs:38-44
Quote: `['BTW-aangifte indienen', 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/btw'],`
Probleem: 7 wps/wcm/connect-CMS-deeplinks (verouderd WebSphere-patroon) 404'en vrijwel zeker binnen jaren ⇒ Help-tab stuurt klant naar dode pagina's precies bij deadline-paniek.
Fix: stabiele top-level-URL's of zoekterm. Owner: Sam (dev)
#### F-OND-119 [MIDDEL] src/HelpTab.gs:151-153
Quote: `['Documentatie', 'https://www.boekhoudbaar.nl/gids/'], ['FAQ', '...'], ['Email support', 'support@boekhoudbaar.nl'],`
Probleem: alle drie support-kanalen delen één faalpunt (het domein — ook de mail bounct bij verlopen domein); geen domein-onafhankelijk noodkanaal — dé survival-kernvraag van de USP.
Fix: minstens één domein-onafhankelijk kanaal + geruststelling "werkt door zonder support". Owner: Sam + accountant
#### F-OND-120 [LAAG] src/HerhalendeKosten.gs:98-107 — hardcoded rekening-/BTW-dropdowns out-of-sync-risico met Config (en nu al FOUT: 5xxx bestaat niet — zie F-INV-023). Fix: dynamisch uit Config genereren. Owner: Sam.
#### F-OND-121 [MIDDEL] src/HerhalendeKosten.gs:182, 304-328
Quote: `const headers = ['ID', 'Naam', ..., 'Zakelijk %'];`
Probleem: 12-koloms tab zonder schema-versie; verwerking leest harde indexen ([6], [11]) ⇒ kolom-invoeging laat systeem stil op verkeerde velden boeken (notitie als bedrag).
Fix: header-check vóór index-lezen + kolom-op-naam-migratie. Owner: Sam (dev)
#### F-OND-122 [HOOG] src/HitlValidatie.gs:25-27, 205-217
Quote: `const HITL_KOL_STATUS = 17; const HITL_KOL_GEVALIDEERD_DOOR = 18; const HITL_KOL_GEVALIDEERD_OP = 19;`
Probleem: HITL-kolommen + journaalpost-leesposities niet gedeeld met andere lezers (FormeelBewijs/GezondheidCheck) — toeval-consistentie; kolom-invoeging vóór 17 ⇒ validatie-stempel in bv. bedrag-kolom = corruptie van financiële data.
Fix: gedeelde Config-kolomconstanten + header-validatie (impact-analyse vereist). Owner: Sam (dev)
#### F-OND-123 [LAAG] src/HitlValidatie.gs:160, 173 — Session.getActiveUser() kan leeg worden (Google-privacy-trend) ⇒ "Gevalideerd door: onbekend" holt bewijswaarde uit. Fix: fallback effectiveUser/licentie-email. Owner: Sam.

Thema OND-E: (1) magic kolom-indexen zonder schema-guard in juist de integriteits-modules (106/112/121/122); (2) fiscale fallbacks bevriezen (102/116); (3) support-domein = single point of failure (119); (4) Fortress-lock-out-scenario (109).

## Batch OND-F — Hygiene, Inkoopfacturen, Invariants, Jaarafsluiting, KvKCache, Licentie, Menu, Metrics

### Gelezen: alle 8 volledig. Survival-oordeel: grotendeels ROBUUST — data-export buiten licentie-gate (Menu:18-34), 90-dagen-grace, jaarafsluiting/invarianten lokaal, FIFO-caps op logs. Jaarafsluiting.gs en (vrijwel) KvKCache.gs zonder vondsten; Jaarafsluiting heeft voorbeeldige pre-2025-migratie-pre-flight (158-171).

#### F-OND-140 [MIDDEL] src/Hygiene.gs:80-97
Quote: `const _HYGIENE_VERWACHTE_TRIGGERS = [ ... ]` + `const _HYGIENE_BEHOUD_HANDLERS = ['controleerBtwDeadline_'];`
Probleem: DRIE bronnen-van-waarheid voor trigger-state (deze lijst, Menu-zelfheal-set, Setup installeelTriggers_) ⇒ 7e trigger in één lijst wordt door sanitize stil weggeveegd of dubbel aangemaakt.
Fix: één canonieke definitie + vergelijkingstest. Owner: Sam (dev)

#### F-OND-141 [MIDDEL] src/Inkoopfacturen.gs:39-63 — magic kolomindices (lezen 0,1,6,11,12; schrijven 13-15) zonder header-guard; kolom-toevoeging ⇒ BETAALD op verkeerde cel. Fix: centrale schema-indices of header-assert. Owner: Sam. (patroon F-OND-106/122)

#### F-OND-142 [MIDDEL] src/Invariants.gs:276
Quote: `let grens = 20000;`
Probleem: KOR-fallback hardcoded (docstring zegt zelf "(2026)"); bij ontbrekende config waarschuwt monitor op verouderd bedrag — voor altijd bij abandonment.
Fix: fallback null + check overslaan i.p.v. mogelijk fout bedrag. Owner: Sam (dev)

#### F-OND-143 [LAAG] src/Invariants.gs:607-615 — BTW-keyword-heuristiek bevroren op Belastingplan-2025-aannames (logies 21% per 2026); veroudert stil. Fix: ijk-datum + naar config. Owner: accountant/Sam.
#### F-OND-144 [LAAG] src/Invariants.gs:382-385 — BEWAARPLICHT_GEMELD_<jaar> 1 key/jaar zonder cleanup (verwaarloosbaar tempo). Fix: optioneel. Owner: Sam. (= F-GAS-123)

#### F-OND-145 [LAAG] src/KvKCache.gs:98-104 — API-versie zit in Utils.gs:haalDataKvK_ (KvK-docs gaven 403; EOL niet vaststelbaar); mislukt-dialoog onderscheidt outage niet van permanente deprecation. Fix: versie/HTTP-status tonen; Utils-versie verifiëren. Owner: Sam. NB: géén property-explosie — cache = Instellingen-sheet (bewust ontwerp 27-31).

#### F-OND-146 [MIDDEL] src/Licentie.gs:563-589, 832-838
Quote: `const url = serverUrl + '?actie=aanvraag-otp&email=' + encodeURIComponent(email);`
Probleem: ongeversioneerd GET-protocol (User-Agent-marker alleen op sommige calls); server-evolutie breekt oude sheets; respons ongesigneerd ⇒ domein-hijacker kan geldig:false sturen en klanten uitsluiten (240-245 wissen dan de licentie).
Fix: protocolversie in request + signatuur-check vóór geldig:false honoreren. Owner: Sam (dev)

#### F-OND-147 [HOOG] src/Licentie.gs:868-870
Quote: `*   - <7 dagen sinds laatste geldig-OK   → licentie blijft geldig, offline:true` / `*   - >=7 dagen ... → licentie ongeldig`
Probleem: docstring documenteert 7-dagen-grace terwijl implementatie (886) _licentieGraceDagen_() = 90 gebruikt — directe interne tegenspraak in hetzelfde bestand (35-44 zegt 90). Toekomstige "fix" naar 7 dagen zou precies de survival-garantie breken.
Fix: docstring naar "_licentieGraceDagen_() (default 90)"; literal 7's weg. Owner: Sam (dev)

#### F-OND-148 [MIDDEL] src/Licentie.gs:826-829
Quote: `if (!serverUrl) { ... return { geldig: true, naam: 'Demo', versie: 'Demo' }; }`
Probleem: inconsistent survival-gedrag: lege URL = eeuwig geldig, maar dode-server-met-gezette-URL = uitsluiting ná 90 dagen — klant kent die property niet ⇒ klant die 91 dagen na Sams verdwijnen opent wordt uitgesloten. (Verdiept F-RED-007 vanuit survival-hoek.)
Fix: na verstreken grace terugvallen op geen-server-pad, óf abandoned-instructie "wis LICENTIE_SERVER_URL" documenteren. Owner: Sam + accountant

#### F-OND-149 [LAAG] src/Menu.gs:526-541 — bon-uploads in één platte naam-opgezochte map zonder rotatie (= F-OND-036; plus naamcollisie-risico via getFoldersByName). Fix: jaar-submappen onder ID-gepinde map. Owner: Sam.
#### F-OND-150 [LAAG] src/Menu.gs:680-694 — GESLOTEN_PERIODES-blob zonder schemaVersie; ~120 entries/10jr; formaatwijziging zonder migratie-anker. Fix: schemaVersie + compressie oude periodes. Owner: Sam.

#### F-OND-151 [MIDDEL] src/Metrics.gs:168-174
Quote: `if (!owner) owner = 'samhoven16@gmail.com';` ... `GmailApp.sendEmail(owner, onderwerp, body);`
Probleem: FATAAL-meldingen gaan uitsluitend naar Sams hardcoded privé-Gmail; klant ziet zelf niets ⇒ bij Sam-onbeschikbaarheid verdwijnen kritieke fouten in dode inbox. Plus verweesde docstring boven regel 90.
Fix: subsidiair naar klant-instellingen-adres; fallback als property; docstring repareren. Owner: Sam (dev)

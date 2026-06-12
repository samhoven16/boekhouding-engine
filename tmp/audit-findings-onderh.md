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

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

# Audit-findings — customer-voice-editor
Hashes: zie tmp/file-hashes.txt.

## Batch VCE-A — API, AccountVerwijderen, Assistent, BTW, BTWReminder, BackupEmail, BankImport, Bankboek

### src/API.gs — Gelezen: 1-492. Dialog "u" consequent; geen mail/support-refs. VONDSTEN F-VCE-001..003.
### src/AccountVerwijderen.gs — Gelezen: 1-287. AVG-uitleg voorbeeldig eerlijk (60-113); "je" consequent; support-pad correct (181, 211, 256). VONDSTEN F-VCE-004, 005.
### src/Assistent.gs — Gelezen: 1-210. Concreet met eigen cijfers; "u" consequent. VONDSTEN F-VCE-006, 007.
### src/BTW.gs — Gelezen: 1-922. Hoofd-alerts sterk (65-90, 749-757, 794-814: rubriek→gewone taal + bedragen + vervolgactie). VONDSTEN F-VCE-008, 009. (F-VCE-010 vervalt: dubbel met F-VCE-013.)
### src/BTWReminder.gs — Gelezen: 1-305. Assistent-dialog helder (199-299); "u" consequent. VONDSTEN F-VCE-011..014.
### src/BackupEmail.gs — Gelezen: 1-208. Eerlijk over Gmail=Google-beperking (10-13, 76-80, 177-181) — voorbeeldig; "je" consequent. VONDSTEN F-VCE-015, 016.
### src/BankImport.gs — Gelezen: 1-547. Header-fout voorbeeldig actie-gericht (62-66); "je" consequent. VONDSTEN F-VCE-017, 018.
### src/Bankboek.gs — Gelezen: 1-185. Bankafstemming concreet (31-76). VONDSTEN F-VCE-019, 020.

#### F-VCE-001 [MIDDEL] src/API.gs:376,387
Quote: `<p style="color:#555">Uw boekhouding heeft een ingebouwde API. ...` / `<b>Uw huidige Web App URL:</b>`
Probleem: "u" hier vs "je" in AccountVerwijderen/BackupEmail/BankImport — productbrede aanspreekvorm-wissel.
Fix: één vorm productbreed kiezen (beslissing Sam). Owner: Sam (dev)

#### F-VCE-002 [LAAG] src/API.gs:380-384
Quote: `Open <b>Extensies → Apps Script</b> → klik rechtsboven op <b>Implementeren → Nieuwe implementatie</b>`
Probleem: developer-jargon zonder geruststelling dat een niet-technische klant dit kan overslaan (contextueel verdedigbaar — integratie-dialog).
Fix: één zin "eenmalige technische stap; gerust overslaan". Owner: Sam (dev)

#### F-VCE-003 [MIDDEL] src/API.gs:136,255,287,310
Quote: `return jsonResponse_({ succes: false, fout: err.message });`
Probleem: rauwe err.message zonder vervolgstap richting integratie-bouwer.
Fix: generieke actiegerichte melding; technische message alleen server-side. Owner: Sam (dev)

#### F-VCE-004 [MIDDEL] src/AccountVerwijderen.gs:66,72-74
Quote: `• Je naam, e-mail en spreadsheet-koppeling op onze licentieserver` / `daar hebben wij geen toegang toe.`
Probleem: personificatie "onze/wij" (principe: niet personifiëren); ook regel 93 "We sturen hier...".
Fix: "de licentieserver van Boekhoudbaar" / "daar heeft Boekhoudbaar geen toegang toe". Owner: Sam (dev)

#### F-VCE-005 [LAAG] src/AccountVerwijderen.gs:153,159,187
Quote: `toon('status1', 'red', (res && res.fout) || 'Er ging iets mis. Probeer opnieuw.');` / `(err && err.message) || 'Netwerkfout.';`
Probleem: lege fallbacks zonder terug-loop bij gevoelige onomkeerbare AVG-actie (primaire fouten 181/256 zijn wél goed).
Fix: support-pad ook in fallbacks. Owner: Sam (dev)

#### F-VCE-006 [MIDDEL] src/Assistent.gs:172-176
Quote: `<h4>Stel een vraag aan AI</h4>` ... `<a href="https://claude.ai" ...>Claude (Anthropic) openen</a>`
Probleem: tab "AI hulp" wekt ingebouwde-feature-verwachting terwijl het externe chatdiensten zijn.
Fix: benoemen als "AI elders raadplegen". Owner: Sam (dev)

#### F-VCE-007 [LAAG] src/Assistent.gs:60
Quote: `a: 'Zakelijke lunches, diners en relatiegeschenken. Hiervan mag u slechts 73,5% als kosten aftrekken.`
Probleem: harde fiscale getallen zonder jaartal/bron verouderen stil (zie ook F-OND-004).
Fix: jaartal + verificatie-verwijzing. Owner: accountant (communicatie)

#### F-VCE-008 [LAAG] src/BTW.gs:619-623
Quote: `'BTW periode sluiten', 'Welk kwartaal sluit u? (Q1, Q2, Q3 of Q4):', ui.ButtonSet.OK_CANCEL`
Probleem: vrije-tekst-invoer voor iets dat het systeem zelf kan bepalen (huidigeKwartaal_) — drempel + faalkans.
Fix: default/suggestie tonen of keuzelijst. Owner: Sam (dev)

#### F-VCE-009 [MIDDEL] src/BTW.gs:50 vs 83
Quote: `'Voor je de aangifte indient bij de Belastingdienst: controleer de '` (49) vs `WAT U HEEFT VERKOCHT:` (83)
Probleem: "je" en "u" wisselen binnen één doorlopende aangifte-flow.
Fix: één vorm voor de hele flow. Owner: Sam (dev)

#### F-VCE-011 [LAAG] src/BTWReminder.gs:98,110-111
Quote: `const body = `Beste,` ... `Met vriendelijke groet,\n— Boekhoudbaar`;`
Probleem: kale aanhef "Beste," terwijl bedrijfsnaam beschikbaar is; ondertekening wél correct.
Fix: personaliseren of "Hoi,". Owner: Sam (dev)

#### F-VCE-012 [LAAG] src/BTWReminder.gs:91,93
Quote: `saldoTekst = `\n\nVoorafinschatting: U moet mogelijk € ${...} betalen.`;`
Probleem: "Voorafinschatting" stroef + dubbele slag om de arm.
Fix: "Voorlopige inschatting: u moet waarschijnlijk € … betalen." Owner: Sam (dev)

#### F-VCE-013 [MIDDEL] src/BTWReminder.gs:186
Quote: `SpreadsheetApp.getUi().alert('Fout bij berekenen: ' + e.message);`
Probleem: rauwe e.message zonder vervolgstap in kernfunctie (BTW-aangifte).
Fix: titel + actie; e.message alleen loggen. Owner: Sam (dev)

#### F-VCE-014 [LAAG] src/BTWReminder.gs:293-294
Quote: `.withFailureHandler(function(e){ alert('⚠️ ' + (e && e.message ... 'Er ging iets mis. Probeer opnieuw.')); })`
Probleem: lege fallback zonder concreet pad.
Fix: menupad in de melding. Owner: Sam (dev)

#### F-VCE-015 [LAAG] src/BackupEmail.gs:192-194
Quote: `'Je weekly Boekhoudbaar-backup is te groot om te mailen (>' + ... + ' MB).\n\n'`
Probleem: nl-en-mix "weekly" (elders "wekelijkse").
Fix: "wekelijkse". Owner: Sam (dev)

#### F-VCE-016 [MIDDEL] src/BackupEmail.gs:82,139
Quote: `ui.alert('Backup mislukt', result.fout || 'Onbekende fout.', ...)` / `fout: 'Geen backup-map gevonden. Draai eerst dagelijkseTaken of maakNoahArkSnapshot_.'`
Probleem: letterlijke functienamen bereiken de klant-alert; "Onbekende fout." is lege fallback.
Fix: klant-actie i.p.v. functienamen; vervolgstap toevoegen. Owner: Sam (dev)

#### F-VCE-017 [LAAG] src/BankImport.gs:62-66
Quote: `'CSV-headers niet herkend — ' + ontbrekend.join(' EN ') + '. Gevonden headers: ... (ING/Rabo/Bunq/KNAB).'`
Probleem: voorbeeldig actie-gericht; alleen "headers" licht-technisch.
Fix: optioneel "kolomnamen (de bovenste regel)". Owner: Sam (dev)

#### F-VCE-018 [LAAG] src/BankImport.gs:518,521
Quote: `withFailureHandler(function(e){zetStatus("fout","Fout: "+e.message);})`
Probleem: rauwe e.message voor onbekende fouten.
Fix: leesbare fallback voor onbekende fouten. Owner: Sam (dev)

#### F-VCE-019 [LAAG] src/Bankboek.gs:127
Quote: `.withFailureHandler((e) => alert('⚠️ ' + (e && e.message ? e.message : 'Er ging iets mis. Controleer je invoer en probeer opnieuw.')))`
Probleem: e.message-tak kan jargon tonen (eigen fouten zijn wél netjes, 148).
Fix: rauwe message niet tonen. Owner: Sam (dev)

#### F-VCE-020 [MIDDEL] src/Bankboek.gs:33,44 vs 106,127
Quote: `'Voer het werkelijke eindsaldo in van uw bankafschrift...'` vs `'...Controleer je invoer...'`
Probleem: u/je-wissel binnen één Bank-menu-sessie.
Fix: één vorm. Owner: Sam (dev)

Globaal patroon VCE-A: (1) u/je-inconsistentie productbreed én binnen flows; (2) failure-fallbacks tonen rauwe e.message of lege "Er ging iets mis"; (3) sterke voorbeelden die de norm moeten worden: BTW-samenvattingen, BankImport-headerfout, BackupEmail-eerlijkheid, AVG-uitleg.

## Batch VCE-B — BelastingOptimizer, Belastingvoordeel, BoekingEngine, Boekingen, Brand, Branding, BtwExport, Changelog

### src/BelastingOptimizer.gs — Gelezen: 1-288. "je" consistent. VONDSTEN F-VCE-040, 041.
### src/Belastingvoordeel.gs — Gelezen: 1-1145. Audit-logs leesbaar (600, 769). VONDSTEN F-VCE-042, 043 (u/je gemengd).
### src/BoekingEngine.gs — Gelezen: 1-1086. "je" consistent; fout-strings sterk met menu-paden (251-257, 582, 593). VONDSTEN F-VCE-044, 045.
### src/Boekingen.gs — Gelezen: 1-1480. Alerts concreet (568-587, 1276-1296, 1447-1478); goede terug-loops (27-49). VONDSTEN F-VCE-046, 047 (u/je gemengd).
### src/Brand.gs — Gelezen: 1-104. Geen klant-strings. Geen vondsten.
### src/Branding.gs — Gelezen: 1-455. "u" consistent binnen bestand (wijkt af van "je" elders); audit-logs leesbaar. VONDSTEN F-VCE-048, 049.
### src/BtwExport.gs — Gelezen: 1-326. "je" consistent; AWR-verantwoordelijkheids-copy sterk (74-108). VONDST F-VCE-050.
### src/Changelog.gs — Gelezen: 1-199. Concreet, "je", transparant. Geen vondsten.

#### F-VCE-040 [LAAG] src/BelastingOptimizer.gs:134-143
Quote: `uitleg += '  → Boek in jaar N (€' + beste.sN.toFixed(0) + ' totaal):\n';`
Probleem: klant ziet algebra-jargon "jaar N"/"jaar N+1" zonder concreet jaartal.
Fix: echte jaartallen of "dit jaar"/"volgend jaar". Owner: Sam (dev)

#### F-VCE-041 [LAAG] src/BelastingOptimizer.gs:282
Quote: `.withFailureHandler(function(e){document.getElementById('uit').textContent='Fout: '+e.message;})`
Probleem: rauwe e.message zonder vervolgstap.
Fix: begrijpelijke fallback + actie. Owner: Sam (dev)

#### F-VCE-042 [MIDDEL] src/Belastingvoordeel.gs:172,177
Quote: `const deadlineMaand = { 5: '30 april (verlopen) → spoed!', 7: '31 juli', 10: '31 oktober' }[maand];`
Probleem: "verlopen → spoed!" is schrik zonder handvat — geen indiening-route, geen boete-uitleg.
Fix: concrete actie + verzuimboete-duiding toevoegen. Owner: accountant + Sam

#### F-VCE-043 [MIDDEL] src/Belastingvoordeel.gs:342,834-844,900,1316
Quote: `<div class="lbl">Huidige situatie (op basis van uw boekhouding YTD)</div>` vs `'...Controleer je invoer.'` (562)
Probleem: u/je gemengd binnen één bestand (wat-als/aanslag/lijfrente "u"; reiskosten "je").
Fix: één vorm productbreed (beslissing Sam). Owner: Sam (dev)

#### F-VCE-044 [LAAG] src/BoekingEngine.gs:582
Quote: `if (!apiKey) return { fout: 'Gemini API-sleutel niet ingesteld (Boekhouding → Instellingen → 🤖 Gemini API-key voor bon-scan).' };`
Probleem: mist de geruststelling "handmatig invoeren blijft werken" (die regel 569 wél heeft).
Fix: zin toevoegen. Owner: Sam (dev)

#### F-VCE-045 [LAAG] src/BoekingEngine.gs:309
Quote: `schrijfAuditLog_('FOUT ' + type, e.message);`
Probleem: "FOUT factuur" als actie-label in klant-zichtbare AuditLog-tab is verwarrend; detail kan technisch zijn.
Fix: "Boeking mislukt (factuur)" als label. Owner: Sam (dev)

#### F-VCE-046 [LAAG] src/Boekingen.gs:708
Quote: `<p>Voer het afschrijvingspercentage per actief in (lineaire methode):</p>`
Probleem: "per actief"/"lineaire methode" is jargon voor een ZZP'er; ook tabelkoppen compact-jargon (711).
Fix: korte uitleg in gewone taal. Owner: Sam + accountant

#### F-VCE-047 [MIDDEL] src/Boekingen.gs:29,1288,1316,1449
Quote: `'U kunt geen boekingen meer maken in een afgesloten periode. '` vs `'Welk boekingId wil je storneren?'`
Probleem: u/je gemengd binnen één bestand (periode-fouten "u"; storno/periode-beheer "je").
Fix: gelijktrekken (beslissing Sam). Owner: Sam (dev)

#### F-VCE-048 [MIDDEL] src/Branding.gs:239
Quote: `<div style="font-size:11px;color:#888;margin-top:4px">PNG, JPG, SVG — max 200 KB</div>`
Probleem: hint belooft SVG terwijl server- (49-53) én client-validatie (327-333) SVG expliciet weigeren (XSS) ⇒ tekst-vs-gedrag-mismatch, klant krijgt onverwachte weigering.
Fix: "PNG, JPG, GIF, WebP — max 200 KB". Owner: Sam (dev)

#### F-VCE-049 [LAAG] src/Branding.gs:387,420
Quote: `... : 'Er ging iets mis. Probeer opnieuw.');`
Probleem: vage fallback zonder vervolgstap.
Fix: concretere fallback. Owner: Sam (dev)

#### F-VCE-050 [LAAG] src/BtwExport.gs:228-230,258-260
Quote: `return { ok: false, fout: e.message };`
Probleem: server-side catch retourneert rauwe e.message die de nette failure-handler-fallback omzeilt.
Fix: klant-vriendelijke fout + e.message alleen loggen. Owner: Sam (dev)

Patroon VCE-B: (1) u/je-breuk tussen oudere (Branding, delen Belastingvoordeel/Boekingen) en nieuwere modules ("je"); (2) vage fallbacks als groep stelselmatig (F-VCE-041/049/050).

## Batch VCE-C — Config, DLQ, Dashboard, DataPortability, Diagnostiek, DriveStructuur, EUVerkoop, EersteKlantCheck

### src/Config.gs — Gelezen: 1-346. Grootboeknamen RGS-conform; KOSTEN_CATEGORIEEN consistent NL. VONDST F-VCE-060.
### src/DLQ.gs — Gelezen: 1-282. VONDSTEN F-VCE-061..063.
### src/Dashboard.gs — Gelezen: 1-1628. Klant-strings consistent "je"; personificatie correct ("Boekhoudbaar bespaart", geen "wij"). VONDSTEN F-VCE-064..066.
### src/DataPortability.gs — Gelezen: 1-216. Bevestig-alert transparant; "je" consistent. VONDST F-VCE-067.
### src/Diagnostiek.gs — Gelezen: 1-184. VONDSTEN F-VCE-068..070.
### src/DriveStructuur.gs — Gelezen: 1-481. Jaarafsluiting-alerts voorbeeldig (checklist, oorzaken+oplossingen, 339-346); emoji-mapnamen scanbaar. Geen vondsten.
### src/EUVerkoop.gs — Gelezen: 1-355. ICP-alerts concreet met indientermijn-vervolgstap; fiscaal vakjargon passend voor doelgroep. Geen vondsten.
### src/EersteKlantCheck.gs — Gelezen: 1-300. Elke FOUT heeft fix-veld met menuroute — sterk patroon. VONDSTEN F-VCE-071, 072.

#### F-VCE-060 [LAAG] src/Config.gs:31 — tabnaam "W&V Rekening" is jargon-afkorting (rest voluit). Fix: "Winst & Verlies" overwegen. Owner: Sam.
#### F-VCE-061 [MIDDEL] src/DLQ.gs:171
Quote: `ui.alert('🟢 Geen mislukte taken', 'De Dead Letter Queue is leeg.', ...);`
Probleem: "Dead Letter Queue" = developer-jargon richting klant.
Fix: "mislukte achtergrond-taken". Owner: Sam (dev)
#### F-VCE-062 [MIDDEL] src/DLQ.gs:196
Quote: `ui.alert('✅ Forced retry voltooid', 'Bekijk DLQ-tab voor resultaten.', ...);`
Probleem: "Forced retry"/"DLQ-tab" jargon + geen vervolgstap-uitleg; idem 187 "Geen items om te hervaten."
Fix: begrijpelijk NL + tab-naam die klant kan vinden. Owner: Sam (dev)
#### F-VCE-063 [LAAG] src/DLQ.gs:34
Quote: `.setValues([['Tijdstip', 'Type', 'Payload (JSON)', 'Fout', 'Retries', 'Status', 'Volgende retry']])`
Probleem: tab wordt bij problemen zichtbaar gemaakt (175, 243) met technische kolomkoppen/statussen.
Fix: "Gegevens"/"Pogingen"/"In wachtrij"/"Mislukt"/"Gelukt". Owner: Sam (dev)
#### F-VCE-064 [MIDDEL] src/Dashboard.gs:15
Quote: `ui.alert('Tabblad "Dashboard" ontbreekt. Run setup() via Boekhouding → Instellingen → Herinstalleer.');`
Probleem: functienaam "setup()" in klant-string; ook menupad-naam "Boekhouding" fout (= "Boekhoudbaar", zie F-DOC-patroon).
Fix: zonder code-identifier formuleren. Owner: Sam (dev)
#### F-VCE-065 [MIDDEL] src/Dashboard.gs:1559
Quote: `...innerHTML='<div class="loading" ...>Laden mislukt: '+esc(e.message)+'</div>';`
Probleem: rauwe e.message zonder vervolgstap (regel 1557 heeft wél de goede variant).
Fix: vervolgstap + technische detail naar console. Owner: Sam (dev)
#### F-VCE-066 [LAAG] src/Dashboard.gs:386 (+404, 410)
Quote: `naam: 'Current ratio (liquiditeit)',` ... `naam: 'Maandelijkse burn rate',`
Probleem: Engels jargon in klant-zichtbare kengetallen ("Current ratio", "burn rate", "Cash runway").
Fix: NL-equivalenten. Owner: Sam (dev)
#### F-VCE-067 [LAAG] src/DataPortability.gs:213
Quote: `(fouten.length ? '\n\n⚠️ ' + fouten.length + ' fouten:\n• ' + fouten.join('\n• ') : ''),`
Probleem: technische foutregels zonder vervolgstap; kop "voltooid" terwijl er fouten waren.
Fix: vervolgstap + "deels voltooid". Owner: Sam (dev)
#### F-VCE-068 [LAAG] src/Diagnostiek.gs:171 — "Run setup() opnieuw" (zelfde patroon als F-VCE-064). Fix: herformuleren. Owner: Sam.
#### F-VCE-069 [LAAG] src/Diagnostiek.gs:77 — autorisatie-advies vol Google-jargon; deels onvermijdelijk, inleiding toevoegen. Owner: Sam.
#### F-VCE-070 [LAAG] src/Diagnostiek.gs:108 — "script-run/OK/FAILED/TIMED_OUT/stack-trace" in klant-dialog; acceptabel als support-tool, anders verzachten. Owner: Sam.
#### F-VCE-071 [LAAG] src/EersteKlantCheck.gs:179
Quote: `fix: 'Wacht tot middernacht (UTC) of upgrade Workspace-account' };`
Probleem: "UTC"-jargon + upgrade-suggestie zonder kosten-context.
Fix: begrijpelijk + kosten expliciet of weglaten. Owner: Sam (dev)
#### F-VCE-072 [LAAG] src/EersteKlantCheck.gs:278 (+147)
Quote: `bericht: 'BTW_KEUZES ontbreken — dialog kan dropdown niet bouwen.', fix: 'Config.gs check' };`
Probleem: pure code-identifiers in klant-zichtbare check-output; klant kan niets met "Config.gs check".
Fix: klant-tekst + technische oorzaak naar log. Owner: Sam (dev)

Patroon VCE-C: code-identifiers in klant-strings (setup(), Config.gs, BTW_KEUZES); Engels technisch jargon (DLQ, burn rate, stack-trace); DriveStructuur/EUVerkoop zijn de gouden standaard.

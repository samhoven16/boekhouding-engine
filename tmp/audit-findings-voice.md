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

## Batch VCE-D — EmailDeliverability, EmailQuotaGuard, Engagement, ExportAccountant, FeedbackLoop, Fiscaal, Fortress, GezondheidCheck

### src/EmailDeliverability.gs — Gelezen: 1-110. "je" consistent; audit-log helder (55). VONDST F-VCE-080.
### src/EmailQuotaGuard.gs — Gelezen: 1-178. "je" consistent; quota uitgelegd in body. VONDSTEN F-VCE-081, 082.
### src/Engagement.gs — Gelezen: 1-409. "je" consistent. VONDSTEN F-VCE-083..085.
### src/ExportAccountant.gs — Gelezen: 1-1076. XAF-fallback-melding voorbeeldig (99); backup-alerts met oorzaken (384). VONDSTEN F-VCE-086..088.
### src/FeedbackLoop.gs — Gelezen: 1-165. VONDSTEN F-VCE-089, 090.
### src/Fiscaal.gs — Gelezen: 1-446. Stakingswizard voorbeeldig eerlijk (169-187); DGA-advies concreet (425). VONDST F-VCE-091.
### src/Fortress.gs — Gelezen: 1-292. Aan-dialog exemplarisch transparant (47-56); "je" consistent. Geen vondsten.
### src/GezondheidCheck.gs — Gelezen: 1-966. Check-berichten sterk (wettelijke grond + menupad, 682, 705). VONDSTEN F-VCE-092, 093.

#### F-VCE-080 [LAAG] src/EmailDeliverability.gs:92
Quote: `SpreadsheetApp.getUi().alert('Geen email-status-kolom — er zijn nog geen bounces gedetecteerd.');`
Probleem: "bounces" Engels jargon; alert zonder titel.
Fix: "Nog geen onbestelbare e-mails geregistreerd." Owner: Sam (dev)

#### F-VCE-081 [MIDDEL] src/EmailQuotaGuard.gs:157-160
Quote: `'  • Niveau:              ' + status.niveau + '\n\n' +`
Probleem: rauwe interne enum ("WAARSCHUWING"/"KRITIEK"/"OP") in klant-mail — alarmerend zonder concreet.
Fix: vertalen of weglaten (getallen zeggen genoeg). Owner: Sam (dev)

#### F-VCE-082 [LAAG] src/EmailQuotaGuard.gs:162
Quote: `'  1. Wacht tot morgenochtend — de quota reset om 00:00 PT (~09:00 NL).\n' +`
Probleem: "00:00 PT" jargon; tijdstip wisselt met zomertijd.
Fix: "elke nacht rond 09:00 (Nederlandse tijd)". Owner: Sam (dev)

#### F-VCE-083 [LAAG] src/Engagement.gs:288-289
Quote: `<h1>Wat een jaar.</h1>` ... `Hier is jouw ${vorigJaar} — volledig op cijfers, niets verzonnen.`
Probleem: kop wordt wrang bij verliesjaar (overzicht toont ongefilterd negatieve winst).
Fix: neutralere kop of verlies-variant (beslissing Sam). Owner: Sam (dev)

#### F-VCE-084 [LAAG] src/Engagement.gs:215 — "Fout: probeer opnieuw" zonder wat/waarom (NPS, lage impact). Fix: concretere fallback. Owner: Sam.
#### F-VCE-085 [LAAG] src/Engagement.gs:79
Quote: `safeAuditLog_('Achievement unlocked', a);`
Probleem: Engels + rauwe enum-key in klant-zichtbare audit-log.
Fix: `safeAuditLog_('Mijlpaal behaald', ACHIEVEMENTS[a].titel)`. Owner: Sam (dev)

#### F-VCE-086 [MIDDEL] src/ExportAccountant.gs:179
Quote: `'⚠️ ' + (err && err.message ? err.message : 'Er ging iets mis. Probeer opnieuw.');`
Probleem: exact de verboden formulering bij mail-naar-accountant — geen terug-loop (adres? quota?).
Fix: concretere fallback met actie. Owner: Sam (dev)

#### F-VCE-087 [MIDDEL] src/ExportAccountant.gs:31-37, 116
Quote: `'Dit maakt een volledig exportpakket aan in uw Google Drive:\n\n' + ... 'U kunt de map nu delen met uw accountant`
Probleem: "u/uw" in klant-alerts terwijl de e-mail-dialog (148-156) en README (540) "je" gebruiken — wissel binnen één flow.
Fix: "je" voor ZZP'er-teksten; "u" alleen richting accountant. Owner: Sam (dev)

#### F-VCE-088 [LAAG] src/ExportAccountant.gs:349,353
Quote: `throw new Error('Google Sheets export gaf HTTP ' + code + ' — heb je voldoende Drive-rechten?');`
Probleem: "HTTP"/"bytes"/"auth-probleem" lekken via e.message naar klant-alert (382-385 geeft wel goede stappen).
Fix: technische details vertalen of uit message houden. Owner: Sam (dev)

#### F-VCE-089 [LAAG] src/FeedbackLoop.gs:47-49
Quote: `We verzamelen géén persoonsgegevens of boekhoud-inhoud`
Probleem: "we"-personificatie (principe: "Boekhoudbaar [doet]").
Fix: "Boekhoudbaar verzamelt géén ...". Owner: Sam (dev)

#### F-VCE-090 [LAAG] src/FeedbackLoop.gs:81 — rauwe e.message in failure-handler. Fix: vriendelijke fallback. Owner: Sam.
#### F-VCE-091 [LAAG] src/Fiscaal.gs:312
Quote: `'Beste,\n\n' + 'In je boekhouding is een retroactieve wijziging gedetecteerd op een AFGESLOTEN BTW-periode\n'`
Probleem: "retroactieve wijziging gedetecteerd" formeel-technisch; aanhef "Beste," kaal vs "Hallo," elders. Inhoud verder sterk.
Fix: eenvoudiger formuleren + aanhef gelijktrekken (beslissing Sam). Owner: Sam (dev)

#### F-VCE-092 [MIDDEL] src/GezondheidCheck.gs:222,320-323,881
Quote: `'Uw boekhouding ziet er goed uit!...'` ... `'Er zijn fouten gevonden die u aandacht verdienen.'`
Probleem: "u/uw" dominant + interne mix (208 "je") + grammaticale fout regel 323 ("die u aandacht verdienen").
Fix: gelijktrekken naar "je" + 323 corrigeren. Owner: Sam (dev)

#### F-VCE-093 [LAAG] src/GezondheidCheck.gs:189,193
Quote: `melding: 'key "' + grootsteKey + '" is ' + grootsteBytes + ' bytes — nadert 9KB-limiet (silent data-loss-risico)'`
Probleem: developer-jargon in klant-facing diagnose-alert (deels support-bedoeld ⇒ LAAG).
Fix: klant-versie + technisch detail tussen haakjes. Owner: Sam (dev)

Patroon VCE-D: u/je-wissel (GezondheidCheck, ExportAccountant) + rauwe e.message/enums (5 vondsten) + losse anglicismen; referentie-voorbeelden: Fortress-dialog, stakingswizard, EmailQuotaGuard-body, XAF-fallback.

## Batch VCE-E — HelpTab, HerhalendeKosten, HitlValidatie, Hygiene, Inkoopfacturen, Invariants, KvKCache, Licentie

### Gelezen: HelpTab 1-194, HerhalendeKosten 1-517, HitlValidatie 1-240, Hygiene 1-243, Inkoopfacturen 1-165, Invariants 1-760, KvKCache 1-146, Licentie 1-967. Modelvoorbeeld zonder vondsten: KvKCache.gs (kosten vooraf transparant "€0,03 / eerste 100 gratis", foutpaden met oorzaak + geruststelling).

#### F-VCE-100 [LAAG] src/HelpTab.gs:30 — "via een update van Boekhoudbaar" zonder concrete actie (vernieuwHelpTab-menu bestaat). Fix: menupad noemen. Owner: accountant.
#### F-VCE-101 [MIDDEL] src/HerhalendeKosten.gs:491-494
Quote: `'U heeft nog geen herhalende kosten geregistreerd.\n\nVoeg er toe via: Bank → Herhalende kosten beheren.'`
Probleem: enige "U" in verder volledig "je"-bestand + grammaticaal krom ("Voeg er toe").
Fix: "je" + "Voeg er een toe". Owner: accountant
#### F-VCE-102 [MIDDEL] src/HerhalendeKosten.gs:316
Quote: `sheet.getRange(i + 1, 9).setValue('FOUT — datum ongeldig, corrigeer kolom G');`
Probleem: "kolom G" = spreadsheet-jargon; toast (319) zegt niet wát/waar te corrigeren.
Fix: kolomnaam "Volgende datum" gebruiken. Owner: accountant
#### F-VCE-103 [LAAG] src/HitlValidatie.gs:133 — "Sluit dit venster om bij te werken" terwijl venster zelf sluit (134); vaag. Fix: instructie weglaten. Owner: accountant.
#### F-VCE-104 [MIDDEL] src/HitlValidatie.gs:137
Quote: `alert('Fout: ' + e.message);`
Probleem: rauwe e.message zonder vervolgstap (vgl. nette rollback-melding Inkoopfacturen:89).
Fix: klant-actie toevoegen. Owner: Sam/accountant
#### F-VCE-105 [LAAG] src/Hygiene.gs:188 — "(zie _SYSTEM_LOG)" verwijst naar verborgen sheet die klant niet kan vinden. Fix: support-kanaal of n.v.t. indien Sam-only menu. Owner: accountant.
#### F-VCE-106 [MIDDEL] src/Inkoopfacturen.gs:35
Quote: `ui.alert('Tabblad Inkoopfacturen niet gevonden — run setup() eerst.');`
Probleem: "run setup()" developer-taal (patroon F-VCE-064/068).
Fix: menupad-formulering (bestaat al in Invariants:562). Owner: accountant
#### F-VCE-107 [MIDDEL] src/Invariants.gs:111-114
Quote: `'... Dit is een interne fout — neem contact op met support.'`
Probleem: klantBoodschap zonder kanaal (elders staat support@boekhoudbaar.nl wél, Invariants:890).
Fix: adres toevoegen. Owner: accountant
#### F-VCE-108 [LAAG] src/Invariants.gs:470-477 — bedrag-meldingen concreet maar zonder expliciete correctie-actie. Fix: "— corrigeer het bedrag." Owner: accountant.
#### F-VCE-109 [MIDDEL] src/Licentie.gs:324-328 / 385
Quote: `<div ...>👤 Bent u de eigenaar?</div>` vs `'Vul het e-mailadres in waarmee je hebt betaald'`
Probleem: u/je gemengd binnen de activatiedialoog (eerste klantcontact); owner-blok "u", hoofdpad "je".
Fix: gelijktrekken. Owner: accountant
#### F-VCE-110 [MIDDEL] src/Licentie.gs:508/512 — "Eigenaar-bypass"/"Bypass-fout" dev-jargon, maar owner-only blok ⇒ klant-impact nihil. Fix: optioneel. Owner: Sam.
#### F-VCE-111 [LAAG] src/Licentie.gs:447/495
Quote: `toonFout('fout1', '⚠️ ' + (err && err.message ? err.message : 'Er ging iets mis. Probeer opnieuw.'));`
Probleem: rauwe err.message of verboden vage fallback in het eerste klantcontact (server-fouten ernaast wél netjes).
Fix: terug-loop + support-mail in fallback. Owner: accountant
#### F-VCE-112 [LAAG] src/Licentie.gs:919-923
Quote: `'We kunnen je licentie even niet verifiëren. Nog 1 dag offline-toegang ...'`
Probleem: "We"-personificatie (principe #7); inhoudelijk verder sterk (eerlijk + "Je kunt gewoon doorwerken").
Fix: "Je licentie kan even niet geverifieerd worden ...". Owner: accountant
#### F-VCE-113 [LAAG] src/Licentie.gs:943 — volledige sleutel + Spreadsheet-ID in info-dialoog = ruis/complexiteit voor leek. Fix: maskeren (laatste 4) overwegen. Owner: Sam/accountant.

Patroon VCE-E: u/je-wissel (101, 109); jargon-foutpaden zonder terug-loop (102, 105, 106, 107); generieke withFailureHandler-fallbacks (104, 111); één wij-schending (112). KvKCache = referentie.

## Batch VCE-F — Menu, Metrics, Mollie, MoneybirdImport, NieuweBoeking, Onboarding, Prive, Referral

### Gelezen: alle 8 volledig. Mollie.gs = modelvoorbeeld (fail-toast 173-180 is exact principe #10+#6: eerlijk over degraded mode + terug-loop; kosten-transparantie in prompt). Referral consistent "je" met transparante bedragen.

#### F-VCE-120 [LAAG] src/Menu.gs:204-216
Quote: `.addItem('📨 Mislukte taken (DLQ) tonen', 'toonDlqOverzicht')`
Probleem: "DLQ" developer-jargon in klant-zichtbaar (support-)menu.
Fix: afkorting weglaten. Owner: Sam (dev)
#### F-VCE-121 [MIDDEL] src/Menu.gs:340-341
Quote: `.addItem('⚡ Update automatisch installeren (beta)', ...)` / `'📦 Download laatste versie (beta — technisch)'`
Probleem: "(beta — technisch)" vage waarschuwing zonder risico-uitleg of vangnet-instructie.
Fix: concreet maken ("experimenteel — maak eerst een backup") of achter geavanceerd-submenu. Owner: Sam (dev)
#### F-VCE-122 [LAAG] src/Menu.gs:706-707
Quote: `... Gebruik "Periode ontgrendelen" voor correctie.'`
Probleem: toast verwijst naar knop-naam die niet bestaat (menu-item heet "Gesloten periodes beheren", regel 201) — terug-loop breekt. (Menupad-drift-patroon.)
Fix: exact menupad noemen. Owner: Sam (dev)
#### F-VCE-123 [LAAG] src/Metrics.gs:140 — "Status-fout" + vertaalde melding zonder vervolgstap. Fix: terug-loop toevoegen. Owner: Sam.
#### F-VCE-124 [LAAG] src/MoneybirdImport.gs:78 — generieke failure-handler toont rauwe err.message (gerichte fouten 99-102 zijn wél goed). Fix: support-terug-loop in generieke handler. Owner: Sam.
#### F-VCE-125 [MIDDEL] src/NieuweBoeking.gs:26,29,36,387,391,413,431,447,451,468,947,1037,1149
Quote: `Stap 1 — Upload uw bon of factuur` vs `Boekhoudbaar betaalt nooit voor jouw scans` (44)
Probleem: u/je-mix binnen de dagelijkse kern-dialog, zelfs binnen één scherm (AI-tak "uw", BYOK-tak "je") — grootste zichtbare voice-breuk.
Fix: sweep naar "je" (codebase-meerderheid). Owner: Sam (dev)
#### F-VCE-126 [LAAG] src/NieuweBoeking.gs:296,524
Quote: `⚙️ Wachten op JS…` / `'✓ Live (recalc #' + __recalcTeller + ')'`
Probleem: developer-debug-strings ("JS", "recalc #42") klant-zichtbaar in de factuurdialog.
Fix: klant-taal + teller verbergen. Owner: Sam (dev)
#### F-VCE-127 [LAAG] src/NieuweBoeking.gs:501-502 — globale error-handler toont rauwe (vaak Engelse) JS-message; "in chat support" onduidelijk. Fix: herformuleren + meld-route. Owner: Sam.
#### F-VCE-128 [LAAG] src/Onboarding.gs:769-771
Quote: `instellingen: 'Naviger naar Instellingen…',`
Probleem: spelfout "Naviger" + half-jargon "Boekingsdialog" in de allereerste post-setup-toasts.
Fix: "Instellingen openen…" etc. Owner: Sam (dev)
#### F-VCE-129 [MIDDEL] src/Prive.gs:165-173
Quote: `google.script.run .withSuccessHandler(function(){ … }) .opslaanPriveTransactie(d);`
Probleem: GEEN withFailureHandler terwijl de server expliciet throwt bij ongeldig bedrag/datum ⇒ knop blijft disabled, klant ziet niets — dialog lijkt kapot (echte terug-loop-breuk).
Fix: failure-handler met melding + knop her-enablen (patroon NieuweBoeking:941-951). Owner: Sam (dev)
#### F-VCE-130 [MIDDEL] src/Prive.gs:496-497,516
Quote: `'Vul uw vermogen in op peildatum 1 januari. Dit is nodig voor uw Box 3 berekening.'`
Probleem: u/je-mix binnen de privé-module.
Fix: gelijktrekken naar "je". Owner: Sam (dev)
#### F-VCE-131 [LAAG] src/Referral.gs:38 vs 52-56 — WhatsApp/mail noemen €5-korting, LinkedIn/X-variant niet (zelfde ref-link) — gemiste CTA-consistentie. Fix: korting overal of bewust kort. Owner: Sam.

Patroon VCE-F: u/je-mix concentreert in oudere dialog-files (NieuweBoeking, Prive); failure-handlers ongelijk verdeeld (Mollie/NieuweBoeking voorbeeldig vs Prive ontbrekend); debug-strings lekken (DLQ, recalc).

## Wave D — voice_01 (src core strings) — gelezen volledig
[F-VCE-132] HOOG Suggesties.gs:62 — bunq-affiliate-toast op dashboard; "(samenwerking)" als enige disclosure cryptisch; product wordt advertentiekanaal.
[F-VCE-133] HOOG Suggesties.gs:98 — "Lees onze gratis gids. (intern)" — "onze" personifieert product; "(intern)" lekt interne marker naar klant.
[F-VCE-134] MIDDEL Suggesties.gs:108 — "ons netwerk" + ">€10k" developer-notatie.
[F-VCE-151] HOOG/PRODUCTBESLISSING Suggesties.gs:20 — heel suggestie-systeem injecteert conversie-getrackte affiliate-toasts in financiële werkomgeving; haaks op trust-fundament. Geen tekst-fix, productbeslissing.
[F-VCE-135] MIDDEL Setup.gs:60 — "U heeft/uw sleutel" terwijl nieuwere strings "je"; Setup.gs vol u/uw.
[F-VCE-136] HOOG Setup.gs:18 — binnen setup() eerst "je" (r19) dan "U" (r61) → inconsistent in één flow.
[F-VCE-137] MIDDEL Setup.gs:206 — rauwe e.message aan klant (mogelijk Engelse stacktrace) + "ons"; route via bestaande vertaalFout_.
[F-VCE-138] LAAG Setup.gs:38 — "Fix:" Engels jargon (vs UpdateApply "Zo los je dit op").
[F-VCE-140] MIDDEL UpdateBundle.gs:99 — "open de file in editor, selecteer alles, plak over" = developer-flow, intimiderend voor niet-technische klant.
[F-VCE-141] LAAG UpdateBundle.gs:81 — "SHA-256 hash-check"/"code-bundle" jargon.
[F-VCE-142] MIDDEL Utils.gs:271 — "upgrade naar Google Workspace" suggereert kosten zonder context.
[F-VCE-143] LAAG Utils.gs:267 — "Er ging iets mis" generiek (gered door ref-ID).
[F-VCE-144] LAAG Utils.gs:1509 — "Lock-timeout ...ms" + rauwe functienaam lekt jargon.
[F-VCE-145] LAAG Validaties.gs:75 — "(rest=N, verwacht 1)" wiskundige ruis in foutmelding.
[F-VCE-146] MIDDEL Validaties.gs — intern inconsistent je (r34/119) vs u (r60/76/99) in één validatie-rapport.
[F-VCE-147] LAAG Triggers.gs:212 — "Kritieke journaalpost-wijziging" + wetsartikel = angst-versterkend op typo-correctie; storno/inverse jargon.
[F-VCE-148] LAAG Triggers.gs:1110 — owner-mails consequent "u/uw" vs in-app "je" (mogelijk bewust; Sam-beslissing).
[F-VCE-149] LAAG Triggers.gs:2454 — "0 herinneringen verstuurd" zonder uitleg waarom.
[F-VCE-139/150] LAAG positief — Setup.gs:1291 + UpdateApply.gs:48 = toon-ankers (je/jouw, concrete route). TaxRegistry/UpdateApply done.

## Wave D — voice_04 (8 gidsen) — gelezen volledig
[F-VCE-192] MIDDEL boekhoudprogramma-zonder-abonnement:252 — "Wij raden aan" = product als "wij" (enige harde voice-schending; elders "ik"/"Boekhoudbaar").
[F-VCE-193] MIDDEL boekhoudprogramma-zonder-abonnement:284 — "Optimaal voor jouw schaal" leeg superlatief (rest is concreet).
[F-VCE-194] LAAG boekhoudprogramma-zonder-abonnement:116 — "wint" in "eerlijke vergelijking" (transparantie-link vangt af).
[F-VCE-200] MIDDEL auto-leasen-vs-kopen-zzp:85 — "(wel via KVK-leasegids)" cryptische parenthese zonder link.
[F-VCE-202] LAAG auto-leasen-vs-kopen-zzp:117 — "KIA-geschikt" in tabel vóór uitleg op r128.
[F-VCE-201] LAAG auto-leasen-vs-kopen-zzp:8 — operational/financial lease = geaccepteerde NL-vakterm (n.v.t.).
[F-VCE-203] LAAG bankafschrift-boeken-zzp:135 — "2400 Privéonttrekkingen" grootboeknummer-jargon (functioneel in doe-gids).
[F-VCE-204] LAAG bankafschrift-boeken-zzp:176 — "auto-match" productclaim (verifieer met code).
[F-VCE-196] LAAG btw-aangifte-zzp:328 — crypto-boeking-claim (verifieer).
[F-VCE-197] LAAG btw-aangifte-zzp:188 — "voelt een beetje crimineel" riskante hook (direct geruststeld).
[F-VCE-198] LAAG btw-aangifte-zzp:256 — "Ze hebben dat niet." licht confronterend (bruikbare waarschuwing).
[F-VCE-199] MIDDEL btw-aangifte-zzp:373 — rubriek 1d/1e-nummering niet strak consistent over pagina's (vertrouwen; tax-compliance uitlijnen).
[F-VCE-209] LAAG btw-aangifte-zzp:190 — typo "system" i.p.v. "systeem" op vertrouwens-gids.
[F-VCE-211] LAAG btw-aangifte-zzp:405 — fiscale disclaimer goed (positief) maar ontbreekt op 7 andere gidsen (consistentie-aanbeveling).
[F-VCE-195] LAAG btw-berekenen-terugvragen-zzp:177 — "1-op-1 past op Mijn Belastingdienst" toetsbare claim (verifieer).
[F-VCE-205/206] LAAG btw-verleggen — "haar/zij" voor klant consistent (n.v.t.); EN-factuurvoorbeeld functioneel correct (n.v.t.).
[F-VCE-207/208] LAAG positief — btw-teruggave:78 + creditnota:143 = toon-ankers (geruststellend, concrete actie). Beide done.

## Wave D — voice_02 (src + website post-aankoop) — gelezen volledig
[F-VCE-152] HOOG bedankt:116 — "€49,00" hardcoded, JS overschrijft ná load; bij test-modus/referral flitst fout bedrag of blijft staan als JS faalt. Post-aankoop-vertrouwen.
[F-VCE-153] HOOG bedankt:290 — hardcoded /exec-deployment-URL in "welkomstmail opnieuw"-knop; CORS-catch toont ALTIJD "Verzoek verstuurd" ook bij fail. Self-service breekt stil.
[F-VCE-154] MIDDEL bedankt:136 — mail-onderwerp "🚀" decoratief (vs functionele emoji-conventie); MailApp-fallback heeft geen 🚀 → wisselend onderwerp.
[F-VCE-155] MIDDEL bedankt:172 — citeert exacte Google-knoptekst "(onveilig)"; houdbaarheidsrisico als Google herschrijft.
[F-VCE-156] LAAG bedankt:196 — "alles wordt ingevuld" absolute spraak-belofte (browser-afhankelijk).
[F-VCE-157] MIDDEL Verkoopfacturen.gs:282 — "upgrade naar Workspace" jargon + kosten zonder context.
[F-VCE-158] MIDDEL Verkoopfacturen.gs:1053 — "KRITIEK: inconsistente staat ... journaalpost=/rollback=" rauwe developer-tekst aan klant; geen support-adres.
[F-VCE-159] LAAG Verkoopfacturen.gs:980 — "Systeem is bezig" personificatie.
[F-VCE-160] LAAG Verkoopfacturen.gs:1219 — "controleer Gmail-toegang" vaag.
[F-VCE-161] LAAG Verkoopfacturen.gs:657 — factuur-mail "u" (correct register klant-van-klant; bevestig bewuste keuze).
[F-VCE-162] MIDDEL Code.gs:537 — "Betalingsprovider niet geconfigureerd. Neem contact op." op betaalpagina zonder adres → doodloop.
[F-VCE-163] LAAG Code.gs:584 — "Betalingsprovider gaf onverwachte respons" jargon + geen adres.
[F-VCE-164] LAAG Code.gs:1030 — "Interne fout" generiek (security-verdedigbaar tegen sheet-id-lek).
[F-VCE-165] MIDDEL adverteren:288 — "We zien ze. We negeren ze." vijandige toon + heel pagina "wij/we".
[F-VCE-167] LAAG adverteren:175 — "geen freeriders" denigrerend leenwoord over eigen lezers.
[F-VCE-169] LAAG Code.gs:1320 — "niet geverifieerd"-uitleg eerlijk (positief) maar bewoording varieert over 3 plekken.
[F-VCE-170] LAAG Code.gs:2777 — "gepseudonymiseerd"/"grace-period" jargon bij account-verwijdering.
[F-VCE-171] LAAG XafExport.gs:137 — "data-soevereiniteit" abstract (concrete uitleg eronder doet 't werk). (404/bronnen/AdminDashboard done; 166/168 positief/n.v.t.)

## Wave D — voice_03 (website pagina's) — gelezen volledig
[F-VCE-172] HOOG continuiteit:62 — "Als wij stoppen"/"We hebben buffer"/"Ons antwoord" personifieert solo-product als team; ondermijnt eerlijkheid die pagina claimt.
[F-VCE-173] HOOG continuiteit:74 — "license-server"/"configuratie-wijziging" developer-taal + EN/NL-inconsistentie (license vs licentie).
[F-VCE-174] MIDDEL continuiteit:118 — "inversie-engineering" geen NL/geen begrip; redenering onvolgbaar.
[F-VCE-175] MIDDEL continuiteit:101 — "Sommige menu-items wachten op contact met support" vaag; klant weet niet wat wegvalt na dag 91.
[F-VCE-176] HOOG demo:1052 — "Geld terug, geen vragen" tegenspreekt FAQ/en "geen no-questions-refund". Klant leest beide → misleid. Blokker-kandidaat.
[F-VCE-177] MIDDEL demo:1054 — "Geen creditcard nodig voor de demo" misleidend (demo is statische mock zonder login).
[F-VCE-178] MIDDEL demo:1039 — "Stoppen=data weg? Moneybird na 30 dagen ja" harde concurrent-claim, juridisch riskant.
[F-VCE-179] LAAG demo:749 — "geen AI-bullshit" grof voor zakelijke vertrouwens-pagina.
[F-VCE-180] LAAG demo:691 — "Webhook API-sleutel" jargon in jargon-vrije demo.
[F-VCE-181] MIDDEL demo:319 — "1.500 scans/dag gratis" hard getal op 4+ plekken; Gemini-limieten wijzigen → valse belofte.
[F-VCE-191] LAAG demo:766 — "€5 referral" zonder voorwaarde-link.
[F-VCE-182] MIDDEL dpa:182 — XAF "3.2" vs continuiteit "RGS 3.5" versie-inconsistentie in juridische tekst.
[F-VCE-183] MIDDEL dpa:130 — Sam (verwerker) "verwerkingsverantwoordelijke" genoemd — AVG-rolverwarring in DPA.
[F-VCE-184] LAAG dpa:88 — geen volledig vestigingsadres in art.28-DPA.
[F-VCE-185] MIDDEL en:223 — "use Google Translate for the spreadsheet" zwakke belofte (breekt formules/knoppen).
[F-VCE-186] (positief) en:215 — "I'll fix it or refund" = correcte refund-formulering (demo moet hierheen).
[F-VCE-187] MIDDEL faq:40 — niet-geëscapete quotes in JSON-LD text → FAQ-rich-result kan stuk renderen.
[F-VCE-188] LAAG faq:280 — dubbele haakjes achter elkaar (knip-plak-indruk).
[F-VCE-189] LAAG faq:230 — mail-onderwerp "🚀" hype-emoji.
[F-VCE-190] LAAG faq:435 — "whatever" Engels + soft-hyphen in woord. (functies/afschrijven/aftrekbare done = referentie-toon.)

## Wave E — voice_05/06/07 (gidsen) — gelezen volledig
KERN cross-page: zelfstandigenaftrek 2026 €1.200 (canoniek/correct) vs €2.470 (stale 2025) — F-VCE-212/213/252/253/254 (4 pagina's). Vertrouwens-killer; één bron-waarde site-breed.
[F-VCE-212] HOOG jaarafsluiting:166 — "€2.470 in 2026" botst met ib-aangifte €1.200.
[F-VCE-213] HOOG gids/index.html:364 — hub-kaart "€2.470 aftrek 2026".
[F-VCE-214] MIDDEL jaarafsluiting:269/121/137 — KOR-afmeld-deadline intern inconsistent (1 dec vs 1 jan).
[F-VCE-215] MIDDEL ib-aangifte:269 — "Belastingadvies-module berekent automatisch" + woord "advies" wringt met disclaimers; verifieer.
[F-VCE-216] MIDDEL e-boekhouden-vs...:261 — "Light-versie gratis" zonder grens (vs eigen waarschuwing tegen "gratis").
[F-VCE-217] MIDDEL factuur-opstellen:196 — "sequential" Engels (vs "doorlopend") + "Fouten: weg" absolute belofte.
[F-VCE-218] MIDDEL debiteurenbeheer:148 — "3 escalatie-emails automatisch" zonder quota-voorbehoud.
[F-VCE-219/223] LAAG ib-aangifte — rode disclosure-stapeling angst-toon; TLDR-schijven te dicht/jargon.
[F-VCE-221/227] LAAG — Moneybird-prijs €12 vs €18/mnd cross-gids; tijdsclaim 15min vs 30min vs 2-5u inconsistent.
[F-VCE-222/234] MIDDEL — sticky "Slimmer dan zelf bijhouden" op ALLE gidsen botst met gidsen die zelf-doen respecteren.
[F-VCE-224/226/230] LAAG — "geen marketing dat is rekenen" stellig; "free tier"/"Freemium" jargon; EN-factuurvoorbeeld.
[F-VCE-232] MIDDEL maandaangifte:209 — "invulhulp klaar voor Mijn Belastingdienst" suggereert auto-indiening (tool is kwartaal-only, zie F-DOC-053).
[F-VCE-233/235] LAAG maandaangifte — "5 min" vs sticky "15 min"; "legt op" hard.
[F-VCE-236] LAAG offerte:211 — "offerte naar factuur in één klik" (feature bestaat niet, zie F-DOC-073).
[F-VCE-237/238] LAAG offerte — €500-vuistregel als regel; "AV" onuitgelegd in template.
[F-VCE-239] MIDDEL pensioen:216 — "percentage van omzet" herhalende kost (bestaat niet, zie F-DOC-074).
[F-VCE-240/241/242] LAAG pensioen — "rijke pensioenopbouw" subjectief; angst-stapeling; merknamen zonder neutraliteit (BinckBank bestaat niet meer).
[F-VCE-243] MIDDEL suppletie:197 — "signaleert ontbrekende facturen/BTW-inconsistenties/onvolledig bankboek" 3 claims te verifiëren.
[F-VCE-244/245] LAAG suppletie — "Voorkom suppleties" overbelofte; boete 25-50% vs 25-100% inconsistent.
[F-VCE-246/247/248] LAAG urencriterium — totaal-claim plausibel; angst-stapeling 25-100%.
[F-VCE-249] MIDDEL wet-dba:212 — "precies wat bij controle telt" overclaimt; spreekt eigen kernboodschap tegen (feitelijke relatie beslist, niet papier).
[F-VCE-250/251] LAAG wet-dba — angst-stapeling; "Vrij vervanging" grammaticaal krom.
[F-VCE-252/253/254] HOOG zelfstandigenaftrek/zelf-boekhouding — €2.470 als 2026 (3×) vs canoniek €1.200.
[F-VCE-255] MIDDEL zakelijke-rekening:142 — "onze beoordeling" product-personificatie (enige in set).
[F-VCE-256] MIDDEL zakelijke-rekening:451 — kale "Bekijk Boekhoudbaar"-CTA zonder €49 in knop (vs andere gidsen).
[F-VCE-257] MIDDEL zelfstandigenaftrek:121 — "2027 ~€900" voorspelling als semi-feit zonder bron.
[F-VCE-258] MIDDEL zakelijk-of-prive-auto:206 — "km-registratie ingebouwd + zakelijk/privé-split per herhalende kost" verifieer (zie F-DOC-076).
[F-VCE-259] MIDDEL zelfstandigenaftrek:245 — "belastingadvies-module" wekt verwachting buiten wat sheet mag.
[F-VCE-261] LAAG zakelijke-verzekering:96 — "(BAV/BAV)" dubbel-afkorting typo.
[F-VCE-263/269] LAAG zzp-starten — BV-moment €50-70K vs €100K cross-gids; KVK online vs afspraak inconsistent.
[F-VCE-264/268] LAAG zelf-boekhouding — "90% rekenwerk" ongefundeerd; "einddata kloppen" cryptisch.
[F-VCE-270] LAAG zakelijke-verzekering:173 — "meer dan 4 dagen ZZP" dubbelzinnig (per week?).
[F-VCE-271] LAAG zzp-tool-stack:172 — Zapier-menupad te verifiëren (klopt niet, zie F-DOC-093). (exact-online/moneybird/thuiswerk/administratie-apps done; 228/229/265/266 positief.)

## Wave F — voice_08/09/10/11 (homepage/marketing/legal/docs) — gelezen volledig
[F-VCE-272] HOOG landing.html:357 — 3 testimonials met volledige naam/stad/cijfers terwijl homepage testimonials bewust mijdt; indien fictief → trust-breuk. Verifieer echtheid.
[F-VCE-273] HOOG landing.html:227 — "200+ ZZP'ers gebruiken Boekhoudbaar" gebruikersaantal nergens anders; onderbouw of verwijder.
[F-VCE-274] MIDDEL landing.html:337 — vergelijktabel "Werkt zonder internet ✓" terwijl automatisering internet vereist.
[F-VCE-276] MIDDEL landing.html:350 — "MacBook Air/vier weken vakantie" lifestyle-marketing (€1.031 dekt geen MacBook).
[F-VCE-277] MIDDEL landing.html:55/380 — "veiliger dan de meeste SaaS-tools" onbewijsbaar (homepage zegt voorzichtiger "zelfde infrastructuur als Gmail").
[F-VCE-280] MIDDEL landing.html:392 — "100% standalone, geen server-afhankelijkheid" te absoluut (mail/Mollie/KvK/AI via Apps Script).
[F-VCE-282] LAAG landing.html:222 — referentie-toon correct.
[F-VCE-275] MIDDEL index.html:1582 — Moneybird €39/mnd hier vs €30 elders → besparingsclaim inconsistent.
[F-VCE-278] MIDDEL index.html:1745 — "35+ gidsen"/"30+ vragen" vage +-getallen vs exacte "12 functies".
[F-VCE-281] LAAG index.html:1539 — "5 minuten setup" optimistisch (OAuth-flow langer voor leek).
[F-VCE-286] (positief) index.html:1679 — AI-scan kosten-transparant = referentie-standaard.
[F-VCE-285] LAAG zzp-uurtarief:225 — "Slimmer dan zelf bijhouden"+"15 min/maand" uniek getal.
[F-VCE-284] LAAG kopen:44 — "Volkomen veilig" absolute claim (uitleg eronder draagt het).
[F-VCE-279] MIDDEL mijn:100 — "Vind welkomstmail" opent native alert() met Gmail-only-tip terwijl site zegt geen Gmail nodig.
[F-VCE-289] LAAG mijn:120 — "roadmap Q3-2026" datum-belofte veroudert. (gratis/over/herroepingsrecht done/positief.)
[F-VCE-292] MIDDEL partners:121 — "abonnementscharcuterie" verzonnen woord, flauw op B2B-pagina.
[F-VCE-293] MIDDEL partners:204 — "Boekhoudbaar staat klaar voor jezelf" grammaticaal krom.
[F-VCE-294] LAAG partners:147 — "~30% van €49" vs roadmap "30% commissie" framing.
[F-VCE-295/296] MIDDEL partners — "brand-bidding"/"self-referrals" Engels jargon (NL-uitleg staat er al).
[F-VCE-308/309/310] LAAG privacy — Gemini optioneel correct (positief); "privacy-first"/"beacon.min.js" jargon.
[F-VCE-297] MIDDEL roadmap:229 — "pricing TBD" Engels op klant-roadmap.
[F-VCE-298] MIDDEL roadmap:152 — AI-bonscan "Klaar/In productie" zonder key-vereiste vermelding (privacy zegt optioneel).
[F-VCE-299/300] LAAG roadmap — "we/wij werken" inconsistent met transparantie "ik" (positief anker r336).
[F-VCE-301] MIDDEL status:164 — "publiek uptime-dashboard via UptimeRobot (komt binnenkort)" dode link als bestaand gepresenteerd.
[F-VCE-302/303] LAAG status — licentieserver toont altijd groen "ok" (best-effort, niet live); "waarschijnlijk normaal" vaag.
[F-VCE-304] HOOG tools/besparing:168 — rood "verlies"-framing = competitor-bashing via angst, wijkt af van geruststellende toon.
[F-VCE-305/306] MIDDEL tools/besparing — "SaaS-abonnement" jargon; concurrent-prijzen hardcoded (disclaimer vangt deels).
[F-VCE-307] (positief) tools/besparing:209 — "Eenmalig €49 voor altijd van jou" op-toon. (start/starters/transparantie done.)
[F-VCE-312/313] MIDDEL update:90/110 — "we zetten tier 2 aan" personificatie (Sam=solo); jargon "licence-server-handtekening/rollback-pad".
[F-VCE-314/315/316] LAAG update — "Apps Script API/SHA-256/minor-major" jargon; "matched" Engels; r1a/r1b/r1e schraal.
[F-VCE-317] HOOG vergelijking:301 — tabel ✓ "AI-bonnen-scan Gemini Vision" verzwijgt eigen-key-vereiste → koper denkt "zit erbij".
[F-VCE-318] MIDDEL vergelijking:340 — "Tesla-week/tweede huwelijksreis" gimmick die spec zelf verbiedt.
[F-VCE-319] MIDDEL vergelijking:296 — ✓ "iDEAL Mollie geïntegreerd" verzwijgt eigen Mollie-account+transactiekosten (concurrent krijgt "vaak extra kosten") → asymmetrische eerlijkheid.
[F-VCE-320/321/322] LAAG vergelijking — "live" fiscaal vs disclaimer; Moneybird-tier te rooskleurig; "read-only/auto-revoke/dgn" jargon.
[F-VCE-331] MIDDEL vergelijking:204 — "data zit vast op hun servers" overstijgt eigen tabel "beperkt exporteerbaar".
[F-VCE-330] (positief) vergelijking:429 — support-terugloop+€49-terug correct.
[F-VCE-323/324/325] voorwaarden — "wij" in juridische context verdedigbaar; herroepingsrecht-box transparant (positief).
[F-VCE-326] HOOG DEPLOY_VANDAAG.md:197 — KLANT-ZICHTBAAR mail-onderwerp "🚀" hype-emoji (botst met "geen emoji-storm").
[F-VCE-327] MIDDEL DEPLOY_VANDAAG.md:283 — KLANT-ZICHTBAAR "Eerste 10 klanten 30% korting EARLYBIRD" schaarste-claim niet op transparante prijspagina.
[F-VCE-328/329] LAAG DEPLOY_VANDAAG.md — "Eerlijk feedback" grammatica; "Use my existing email" = Google-UI-tekst (ok).
[F-VCE-332/333] LAAG README.md — "van ons/wij" personificatie (developer-doc, consistentie-signaal; mag niet naar klant-copy).

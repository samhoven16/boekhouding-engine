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

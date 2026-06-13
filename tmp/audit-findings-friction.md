# Audit-findings — friction-killer-google-niet-geverifieerd
Hashes: zie tmp/file-hashes.txt. Bekende context benut: F-ONB-004/011/015.

## Batch FRI-A — Licentie, Menu, Onboarding, Setup, Triggers + bedankt, continuiteit, functies
Rode draad: website bereidt het warning-scherm goed voor (bedankt-walkthrough + functies-heads-up), maar (a) de beschreven timing klopt niet met de echte OTP-flow, en (b) in-product is er vrijwel geen opvang voor verkeerd doorlopen OAuth — gevaarlijkste keten: F-FRI-007 → 003 → 008 (onvolledige scope → SETUP_DONE tóch gezet → triggers ontbreken → mails stil niet verstuurd terwijl status VERZONDEN toont).

#### F-FRI-001 [HOOG] src/Licentie.gs:421-449
Quote: `function stuurCode() { ... .aanvraagOtp(email); }`
Probleem: bij geweigerde/halve OAuth faalt aanvraagOtp met generieke withFailureHandler-melding; nergens in-product een herstelpad ("klik Geavanceerd...", walkthrough-link) ⇒ klant zit vast in mislukte dialoog.
Fix: auth-fout herkennen in failure-handlers (447, 495) + expliciete instructie en link naar /bedankt-walkthrough. Owner: Sam (dev)

#### F-FRI-002 [MIDDEL] src/Licentie.gs:322-334
Quote: `${serverGeconfigureerd ? 'U bent de eigenaar...' : '...run de functie activeerEigenaarLicentie'}`
Probleem: klant-kopie zonder ScriptProperties ⇒ serverGeconfigureerd=false + isOwner=true ⇒ normale klant ziet het developer-bypass-blok ("open Apps Script editor") direct na het enge Google-scherm.
Fix: owner-blok alleen tonen voor ADMIN_EMAILS. Owner: Sam (dev)

#### F-FRI-003 [HOOG] src/Licentie.gs:469-485
Quote: `try { window.top.location.reload(); } ... .initialiseerNaActivatie();`
Probleem: na OTP draait setup()+installeelTriggers_; in LIMITED-modus faalt trigger-installatie maar SETUP_DONE wordt gezet (Setup:186) en de auto-reload toont een sheet zonder werkende automatisering — zonder melding (OAuth-getriggerde F-ONB-011-keten).
Fix: na setup() getProjectTriggers() checken; bij 0 expliciete sluit-en-heropen-melding i.p.v. stille reload. Owner: Sam (dev)

#### F-FRI-004 [HOOG] website/bedankt/index.html:148-149
Quote: `De eerste keer dat je een actie uitvoert (bijv. "Eerste factuur maken") vraagt Google: "Geef Boekhoudbaar toegang tot Google Drive."`
Probleem: beschreven timing (warning bij eerste actie) klopt niet — activatiedialoog verschijnt bij onOpen en de OAuth-prompt komt bij "Stuur activeringscode" ⇒ klant verwacht het scherm op het verkeerde moment, precies waar de pagina moet geruststellen.
Fix: stap 2 herschrijven naar de echte volgorde. Owner: accountant (communicatie)

#### F-FRI-005 [MIDDEL] src/Menu.gs:39-137
Quote: `try { controleerOnboarding_(); } catch (e) { Logger.log('Onboarding check fout: ' + e.message); }`
Probleem: ~15 onOpen-handlers vangen auth-fouten stil naar Logger ⇒ LIMITED-modus = "half werkende" sheet zonder enige "geef toestemming"-melding.
Fix: vroege expliciete check via ScriptApp.getAuthorizationInfo + toast/alert met instructie. Owner: Sam (dev)

#### F-FRI-006 [MIDDEL] src/Onboarding.gs:63-115
Quote: `'In de volgende stappen helpen we je in 3 minuten op weg:\n\n  ✅ Stap 1: Je licentie activeren ...'`
Probleem: legacy-wizard noemt het warning-scherm nergens terwijl stap 1 het juist triggert.
Fix: één voorbereidende zin + walkthrough-link toevoegen. Owner: Sam (dev)

#### F-FRI-007 [HOOG] src/Setup.gs:160-186
Quote: `if (watchdogFouten.length > 0) { ... } setProperty(PROP.SETUP_DONE, 'true');`
Probleem: "GEEN triggers"-detectie maar SETUP_DONE tóch gezet; installeelTriggers_ faalt juist bij onvolledige OAuth-scope (het warning-moment); herstel-pad (herstelKritiekeTriggersIndienNodig_, 1135) keert in LIMITED zelf stil terug (1143-1145). (OAuth-specifieke verdieping van F-ONB-011.)
Fix: bij ontbrekende triggers SETUP_DONE niet zetten zonder blokkerende sluit-en-heropen-alert. Owner: Sam (dev)

#### F-FRI-008 [HOOG] src/Triggers.gs:2038-2168 (+2336, 1978)
Quote: `GmailApp.sendEmail(klantEmail, onderwerp, tekst, opties); props.setProperty(stapKey, String(volgendeStap));`
Probleem: alle automatische mail-paden falen zonder gmail.send-scope stil naar DLQ/audit; factuurstatus kan VERZONDEN tonen terwijl niets verstuurd is ⇒ klant merkt het pas weken later (wordt nooit betaald).
Fix: autorisatie-fout specifiek detecteren ⇒ meldFataalAanOwner_ + klant-toast bij volgende onOpen ("mail-toestemming ontbreekt"). Owner: Sam (dev)

#### F-FRI-009 [MIDDEL] website/bedankt/index.html:163-169
Quote: `<button type="button" class="warn-btn-sec">Terug naar veiligheid</button>`
Probleem: mock-knop is dood en nergens staat wat te doen als de klant in het ECHTE scherm "Terug naar veiligheid" klikt — exact het recovery-gat.
Fix: één regel herstel-instructie onder de walkthrough. Owner: accountant (communicatie)

#### F-FRI-010 [MIDDEL] website/functies/index.html:347-348
Quote: `<h3>Klik op de link — de sheet komt in jouw Drive</h3> <p>Google vraagt toestemming om een kopie in jouw eigen Drive te plaatsen.`
Probleem: drie subtiel verschillende mentale modellen (functies "kopie in Drive" vs bedankt "directe link" vs code: OTP-binding aan SS-ID + vergrendelKopie_ zet zelf-gemaakte kopieën read-only) ⇒ klant die letterlijk "kopie maakt" belandt in het vergrendelscherm.
Fix: copy gelijktrekken; zelf kopiëren ontmoedigen. Owner: accountant (communicatie)

#### F-FRI-011 [LAAG] website/continuiteit/index.html:101
Quote: `Banner: "licentie kon niet geverifieerd worden". Boekingen + factureren werken nog. Sommige menu-items wachten op contact met support.`
Probleem: na dag 91 valt onOpen terug op het minimale menu (alleen export/verwijderen) — "factureren werkt nog" klopt niet ná de grace. (90-dagen-buffer zelf klopt wél met code.)
Fix: dag-91-rij eerlijk herschrijven of grace voor kern-boekfuncties verlengen. Owner: accountant (communicatie)

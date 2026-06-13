# Audit-findings — onboarding-doorloop
Hashes: zie tmp/file-hashes.txt.

## Batch ONB-A — AutoDefaults, EersteKlantCheck, HelpTab, Menu, Onboarding, Setup + website/start + website/demo
Doorloop-volgorde geverifieerd: /demo → /kopen → /start → kopie+OAuth ("niet geverifieerd") → onOpen → activatie (OTP) → setup → welkom-modal → bedrijfsgegevens → eerste boeking. setup()-idempotentie (CLAUDE.md danger-zone) CORRECT afgedekt: tweede run geblokkeerd (Setup.gs:16-23), Instellingen-merge + grootboek-preservatie behouden klant-data.

### Gelezen: AutoDefaults 1-128, EersteKlantCheck 1-300, HelpTab 1-194, Menu 1-712, Onboarding 1-959, Setup 1-1313, website/start 1-315, website/demo 1-1074.

#### F-ONB-001 [HOOG] src/Onboarding.gs:693-695
Quote: `<div class="label">✨ Setup voltooid</div>` / `<p class="sub">Je boekhouding staat klaar...`
Probleem: welkom-modal presenteert bedrijfsgegevens als optie-1-van-4 terwijl het de verplichte blocker is (zonder Bedrijfsnaam/IBAN/BTW-nr geen geldige factuur — EersteKlantCheck:209-228 FOUT); klant die "Dashboard" kiest ziet leeg dashboard zonder te weten dat de factuur-flow geblokkeerd is.
Fix: bedrijfsgegevens als hoofd-CTA of rode "nog te doen"-banner. Owner: Sam (dev)

#### F-ONB-002 [LAAG] src/AutoDefaults.gs:59 — placeholder-string 'eigenaar@mijnbedrijf.nl' moet 1-op-1 matchen met Setup.gs:692; fragiele koppeling over twee bestanden. Fix: gedeelde Config-constante. Owner: Sam.

#### F-ONB-003 [MIDDEL] src/EersteKlantCheck.gs:88 (+115, 148)
Quote: `fix: 'Boekhouding → 1. Setup' };`
Probleem: er bestaat geen menu "Boekhouding" en geen item "1. Setup" (echt: Boekhoudbaar → Instellingen → Eerste keer instellen) ⇒ vastgelopen klant zoekt niet-bestaand menu. (Patroon = F-DOC-004/022.)
Fix: alle paden corrigeren. Owner: Sam (dev)

#### F-ONB-004 [HOOG] src/Menu.gs:82-131
Quote: `ui.alert('⚠️ Tabblad opnieuw aangemaakt', ...` / `toonPostSetupWelkomModal_();` / `ss2.toast(...)` / `toonGlobaalBerichtIndienNieuw_()`
Probleem: één onOpen kan 3-5 popups/modals/toasts stapelen (tabblad-herstel, update-modal, welkom-modal, seizoens-toast, globaal bericht) ⇒ modal-races of stortvloed bij precies de eerste open.
Fix: max één modal per open met prioriteit; rest toast/uitstellen. Owner: Sam (dev)

#### F-ONB-005 [LAAG] src/Menu.gs:291 — setup-entry verstopt onder Instellingen; bij halve setup geen prominente herstel-ingang. Fix: top-level entry/toast bij gedetecteerde onvolledige setup. Owner: Sam.
#### F-ONB-006 [LAAG] website/demo/index.html:745 — belofte "geen 5 submenu's diep / geen geavanceerde modus" vs werkelijk ~13 submenu's incl. "Geavanceerd". Fix: copy afstemmen. Owner: accountant.

#### F-ONB-007 [MIDDEL] src/Onboarding.gs:784-799
Quote: `if (typeof openNieuweBoeking === 'function') { Utilities.sleep(1500); openNieuweBoeking(); }`
Probleem: modal-na-modal via sleep(1500)-gok; bij trage verbinding stille no-op op dé kernactie (eerste factuur) zonder foutmelding/retry.
Fix: fallback-knop na navigatie-toast. Owner: Sam (dev)

#### F-ONB-008 [MIDDEL] src/Onboarding.gs:63-125 — legacy-wizard ("Stap 1: licentie activeren") nog bereikbaar wanneer onboarding-prop ontbreekt maar setup niet klaar ⇒ dubbel/tegenstrijdig pad naast de moderne activatie-flow. Fix: legacy-pad verwijderen/dood markeren. Owner: Sam. (= F-DOC-011-cluster)

#### F-ONB-009 [MIDDEL] src/HelpTab.gs:47-48
Quote: `sheet.getRange(rij, 2).setValue(p[1]).setFontColor('#2EC4B6');`
Probleem: alle hulp-URLs zijn platte celtekst in link-kleur — lijkt klikbaar, is het niet; oma 67 moet WCM-URL's overtypen.
Fix: RichTextValue met setLinkUrl. Owner: Sam (dev)

#### F-ONB-010 [LAAG] src/HelpTab.gs:59 (+101-105) — "Menu → Boekhouding → ..." bestaat niet (= F-DOC-008-patroon). Fix: "Boekhoudbaar". Owner: Sam.

#### F-ONB-011 [HOOG] src/Setup.gs:177-186
Quote: `if (watchdogFouten.length > 0) { ... safeAuditLog_('Setup watchdog WAARSCHUWING', ...); }` / `setProperty(PROP.SETUP_DONE, 'true');`
Probleem: watchdog detecteert ontbrekende triggers maar SETUP_DONE wordt tóch gezet met alleen een 30s-toast ⇒ "Setup gelukt!" terwijl de hele automatisering (herinneringen, BTW-checks, dashboard) stil dood is; zelfherstel kan in LIMITED-auth juist geen triggers maken (1144).
Fix: blokkerende alert met actie of SETUP_DONE pas ná trigger-verificatie+retry. Owner: Sam (dev)

#### F-ONB-012 [MIDDEL] src/Setup.gs:79-85 — standalone-pad instrueert "Extensies → Apps Script → setup() uitvoeren" — onmogelijk voor doelgroep; doodlopend bij verkeerde binnenkomst-route. Fix: pad voorkomen of klantvriendelijke fallback. Owner: Sam.

#### F-ONB-013 [MIDDEL] website/demo/index.html:677
Quote: `<tr><td>IBAN</td><td>NL01ABNA0123456789</td></tr>`
Probleem: demo toont gevulde IBAN — exact de afgekeurde MOD-97-ongeldige nep-waarde die Setup bewust leeg laat (Setup.gs:687-comment) ⇒ verwachtingskloof + heruitgave van de nep-IBAN.
Fix: voorbeeld-label "(vul je eigen IBAN in)". Owner: accountant

#### F-ONB-014 [MIDDEL] website/start/index.html:203
Quote: `We hebben zelf geen toegang tot je data.`
Probleem: sterker dan de architectuur — onboarding-callback (Setup.gs:188-189) + dagelijkse licentie-validatie sturen telemetrie naar de server; administratie-data blijft wel in Drive.
Fix: nuanceren "geen toegang tot je administratie-data — alleen licentie-verificatie". Owner: accountant

#### F-ONB-015 [MIDDEL] website/demo/index.html:1052
Quote: `Activatie binnen 5 minuten. Eerste factuur deze middag.`
Probleem: belofte negeert de OAuth-friction die /start zelf "waar 9 van de 10 vastlopen" noemt — klant voelt zich misleid na betaling.
Fix: tijdsbelofte afstemmen of direct naar /start verwijzen. Owner: accountant

#### F-ONB-016 [LAAG] website/demo/index.html:371-382 — rijk gevuld demo-dashboard "1-op-1" vs leeg dashboard na verse setup; geen "vult zich na eerste boeking"-label bij KPI's. Fix: label toevoegen. Owner: accountant

Top-3 onboarding-blockers: F-ONB-011 (setup "gelukt" met dode triggers), F-ONB-001 (verplichte stap verstopt als optie), F-ONB-004 (popup-stortvloed).

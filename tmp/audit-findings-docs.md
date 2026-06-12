# Audit-findings — documentatie-volledigheid (incl. kruis-check #10)
Hashes: zie tmp/file-hashes.txt.

## Batch DOC-A — Assistent, Changelog, Diagnostiek, EersteKlantCheck, GezondheidCheck, HelpTab, Menu, Onboarding

### src/Assistent.gs — Gelezen: 1-210. Menu-toegang OK (Menu.gs:221); FAQ + AI-tab dekken Sam-weg-scenario. VONDSTEN F-DOC-001, 002.
### src/Changelog.gs — Gelezen: 1-199. Menu OK; silent-fail verantwoord (118-120); roadmap-link als zelfhulp (178). Geen vondsten.
### src/Diagnostiek.gs — Gelezen: 1-184. Menu OK; triggers-leeg → concrete instructie (170-172). VONDST F-DOC-003.
### src/EersteKlantCheck.gs — Gelezen: 1-300. Elke FOUT-check heeft fix-hint; volledig self-service. VONDSTEN F-DOC-004, 005.
### src/GezondheidCheck.gs — Gelezen: 1-966. Checks met concrete acties; verplichte-velden-uitleg (767-772). VONDSTEN F-DOC-006, 007.
### src/HelpTab.gs — Gelezen: 1-194. Sterke zelfhulp-naslagtab (Belastingdienst-portalen, checklists). VONDST F-DOC-008.
### src/Menu.gs — Gelezen: 1-712. Data-export altijd bereikbaar zonder licentie (23-34) — sterk anti-lock-in. VONDSTEN F-DOC-009, 010.
### src/Onboarding.gs — Gelezen: 1-959. Profielvelden met help-uitleg (184-225); "openlaten blokkeert niets" (228-232). VONDST F-DOC-011.

#### F-DOC-001 [MIDDEL] src/Assistent.gs:45
Quote: `a: 'Klik op <b>Boekhouding → Bon of factuur uploaden (foto)</b>. Upload een foto...'`
Probleem: FAQ verwijst naar niet-bestaande menupaden: menu heet "Boekhoudbaar" (Menu.gs:139); "Bon of factuur uploaden" staat niet in het menu (alleen Dashboard-knop, Dashboard.gs:1593); "Belastingtips" (56, 160) heet werkelijk "Fiscaal overzicht & besparingstips" (Menu.gs:230). Raakt regels 35, 41, 43, 45, 52, 54, 56, 80, 84, 160 ⇒ klant vindt niets en mailt Sam.
Fix: alle paden synchroniseren met Menu.gs-labels.
Owner: Sam (dev)

#### F-DOC-002 [LAAG] src/Assistent.gs:54
Quote: `Zie <b>Boekhouding → BTW → KOR check</b>.`
Probleem: werkelijk label "Kleineondernemersregeling (KOR) check" (Menu.gs:281).
Fix: exact label citeren. Owner: Sam (dev)

#### F-DOC-003 [LAAG] src/Diagnostiek.gs:81
Quote: `advies = '\n\nEr zijn fouten in non-autorisatie-categorie. Kopieer dit overzicht en deel met support.';`
Probleem: geen impact-duiding per service (KvK-fout raakt alleen optionele autofill) ⇒ onnodige support-mails.
Fix: impact-duiding per service toevoegen. Owner: Sam (dev)

#### F-DOC-004 [MIDDEL] src/EersteKlantCheck.gs:130
Quote: `fix: 'Boekhouding → Diagnostiek → Triggers herinstalleren' };`
Probleem: pad bestaat niet (geen menu "Diagnostiek", geen item "Triggers herinstalleren" — grep Menu.gs bevestigt) ⇒ dood pad in juist het valse-start-scenario.
Fix: naar bestaand pad wijzen of menu-item toevoegen. Owner: Sam (dev)

#### F-DOC-005 [LAAG] src/EersteKlantCheck.gs:148
Quote: `fix: 'Boekhouding → Licentie → Activeer licentie' };`
Probleem: werkelijk "Boekhoudbaar → Instellingen → Licentie activeren" (Menu.gs:311/335).
Fix: label corrigeren. Owner: Sam (dev)

#### F-DOC-006 [LAAG] src/GezondheidCheck.gs:208
Quote: `(fouten.length > 0 ? 'Stuur deze output naar support@boekhoudbaar.nl als je er niet uitkomt.' : '')`
Probleem: mist tussenstap-verwijzing naar "Alles werkt-check" als zelfhulp vóór support.
Fix: zelfhulp-stap toevoegen vóór support-zin. Owner: Sam (dev)

#### F-DOC-007 [LAAG] src/GezondheidCheck.gs:425
Quote: `'Tip: Boekhoudbaar → Geavanceerd → Saldi herberekenen.'`
Probleem: item heet "Saldi herberekenen (bij fouten)" onder "Instellingen" (Menu.gs:306), niet "Geavanceerd".
Fix: pad corrigeren. Owner: Sam (dev)

#### F-DOC-008 [MIDDEL] src/HelpTab.gs:97
Quote: `['☐ 3. Banktransacties tot 31-12 geïmporteerd', 'Menu → Bank → CSV importeren'],`
Probleem: meerdere checklist-menupaden (97-106) en support-rijen (154-155) wijken af van actuele Menu.gs-labels — precies in de jaarafsluitings-piek (jan).
Fix: alle padstrings synchroniseren; overweeg gegenereerde padlijst. Owner: Sam (dev)

#### F-DOC-009 [MIDDEL] src/Menu.gs:394
Quote: `function openBonUpload() {`
Probleem: volledig uitgewerkte bon-upload-dialog (394-511) zonder menu-registratie in onOpen (139-346); drie docs verwijzen er wél naar (Assistent.gs:45, Onboarding.gs:111) ⇒ gedocumenteerde feature zonder aangekondigde toegangsweg.
Fix: addItem in top-level menu. Owner: Sam (dev)

#### F-DOC-010 [LAAG] src/Menu.gs:352
Quote: `function openHoofdFormulier() {`
Probleem: openHoofdFormulier (352-384) en toonFormulierLinks (564-593, incl. mobiel-tip 381) niet in menu ⇒ mobiel-invoer-pad onvindbaar.
Fix: menu-item toevoegen of uitfasering documenteren. Owner: Sam (dev)

#### F-DOC-011 [LAAG] src/Onboarding.gs:73
Quote: `if (stap1 !== ui.Button.OK) return;`
Probleem: legacy-wizard herhaalt volledig (incl. licentie-dialoog) na vroege Cancel — flag pas op 121-124; geen hervat-pad. Beperkte populatie (alleen niet-moderne activatie).
Fix: deels-voltooid markeren of licentie-stap overslaan bij geldige licentie. Owner: Sam (dev)

Dominant patroon DOC-A: menupad-drift (F-DOC-001/002/004/005/007/008/009) — docs citeren labels die niet meer bestaan. Sterke fundamenten: altijd-bereikbare data-export, Help-tab, AI-hulp-tab.

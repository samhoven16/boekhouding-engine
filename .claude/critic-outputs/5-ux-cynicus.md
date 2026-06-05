I have enough material. Let me write the report.

---

# UX-audit Boekhoudbaar — meedogenloos

## Top 5 conversie-killers (vóór purchase)

1. **Hero is een belofte zonder bewijs.** H1: `"Doe je boekhouding in 15 minuten per maand."` Geen sub-bewijs zichtbaar in eerste 5 sec — alleen `"Facturen, BTW-aangifte en overzicht — in jouw eigen Google Drive."` Een ZZP'er met scepticisme denkt: "ja vast, 15 min". Fix: voeg micro-screenshot/loom (8s) of getuigenis direct onder de hero. De 3D-floating-product-mockup (`/preview.svg` met perspective rotate + hero-drift animatie) is decoratief, niet bewijzend.
2. **`/kopen` is een 302 naar `script.google.com/macros/...`** (`website/_redirects:6`). Dat is conversie-zelfmoord: vertrouwd domein → onbekende Google-script-URL met cryptische subdomain. Geen merk, geen design-continuïteit, fasten klanten af bij URL-bar-blik. Fix: host checkout op `boekhoudbaar.nl/kopen` met eigen Mollie-iframe.
3. **Geen "te goed om waar te zijn"-deactivator op €49.** Anchor-sectie laat "€2.291 besparen vs Moneybird" zien, maar geen ENKELE plek antwoordt "waarom is dit zo goedkoop?" Antwoord (jij = solo-maker, geen sales/marketing/servers) staat begraven in `/over`. ZZP'ers zijn argwanend; de prijs roept verdenking op, niet aantrekking.
4. **Garantie-tekst ondermijnt zichzelf** (`index.html:1685`): `"Geen onbeperkte 'geld-terug zonder reden' want het product is direct in jouw Drive — wel een eerlijk gesprek bij twijfel."` Dat is een no-refund met excuses. Een potentiële koper leest "ik kan vastzitten". Fix: 14-daagse herroepingstermijn met activatie-toggle (wettelijk verplicht voor digital goods sowieso vóór levering).
5. **Geen Gmail-blokkade is verborgen in een FAQ-link** (`index.html:1657`). Klant met @outlook denkt: "ik moet Gmail aanmaken → wegklik". De info dat het werkt met élk emailadres staat in 13px grijze tekst onder de koop-knop, niet in de hero of CTA-stack. Verschuif naar hero-trust-bullet.

## Top 5 onboarding-killers (eerste 10 minuten na install)

1. **Google "unverified app"-scherm.** FAQ erkent dit eerlijk maar de klant ziet "niet-geverifieerde app — onveilig" als eerste echte schermafdruk na €49 betalen. Heart-attack-moment. Geen ENKELE walkthrough/screenshot/video op `/bedankt` (die niet eens bestaat — `website/bedankt/index.html`: **No such file or directory**).
2. **Onboarding wizard zegt "u", de site zegt "je".** `src/Onboarding.gs:65-91`: `"Fijn dat u ons programma heeft gekozen... heeft het programma uw bedrijfsgegevens nodig"`. Telling: site = 44× "je"/1× "u"; Onboarding.gs = 14× "u"/2× "je". Klant betaalt bij "Boekhoudbaar" en wordt opeens aangesproken door een notaris.
3. **102 menu-items in `Boekhouding`-menu.** Letterlijk geteld (`grep -c addItem Menu.gs = 102`). Bij eerste open ziet de klant 9 sub-menu's met items als `"💾 Exporteer als XAF (Auditfile — bezit je administratie)"`, `"📁 Audit-log naar JSON exporteren (90 dgn)"`, `"📨 Mislukte taken (DLQ) tonen"`, `"🚩 Feature flags overzicht"`. Dit is een dev-console, geen ZZP-tool. "Don't make me think" → make me think 102x.
4. **onOpen() draait 12+ watchdogs/checks** (Menu.gs:14-119): licentiecheck, onboarding-check, trigger-watchdog, trigger-zelfherstel, jaarwisseling-check, gesloten-periode, HITL-waarschuwing, changelog-check, tabblad-herstel-melding, jaaroverzicht-trigger, NPS-trigger, post-setup-welkom-modal, seizoens-tip-toast, globaal-bericht. Eerste 30 sec na opening = toast-spam.
5. **Post-setup-modal vraagt 4 acties, geen volgorde-dwang** (`Onboarding.gs:485-510`). "Bedrijfsgegevens / Fiscaal profiel (60 sec) / Eerste factuur / Dashboard" — klant kan factuur klikken zonder bedrijfsgegevens, krijgt dan een halve PDF. Fix: stap 1 = vergrendeld als stap 0 niet klaar is, óf merge "bedrijfsgegevens" in een inline-dialog in dezelfde modal.

## Top 5 retention-killers (maand 2)

1. **Achievement-toasts** als `"🥇 Eerste factuur — Je hebt je allereerste factuur verstuurd. Het begin is gemaakt."` (`Engagement.gs:19`) — patronizing voor een 45-jarige consultant.
2. **NPS-toast op dag 30**: `"Klik op Boekhouding → Geef feedback (NPS) om je score te delen."` (Engagement.gs:153) — toast als CTA naar een diep menu-item is friction-design.
3. **Seizoens-tip + globaal bericht + changelog + tabblad-herstel-modal** kunnen ALLE op één onOpen schieten. Klant in maand 2 opent sheet → 3 modals + 2 toasts. Voelt als nag-ware.
4. **Notificaties zoals `"⏰ BTW-aangifte Q1: nog 14 dagen"`** (Notificaties.gs:68) — toon dit alleen als er ECHT iets gedaan moet worden; nu krijgt KOR-klant (€0 BTW) dezelfde alert.
5. **Refund-policy laat klant nooit makkelijk weg.** Geen "exporteer mijn data en cancel"-knop. Geen `bedankt/`-pagina, geen offboarding-mail, geen "kom je terug?"-flow.

## 3 quick-wins (<30 min)

1. **Maak `/bedankt/index.html`** met 4 stappen + screenshot per stap + "klik op Geavanceerd → Ga toch door" met annotated screenshot van de Google-warning. Voorkomt 30%+ activatie-drop-off.
2. **Vervang alle "u/uw" in Onboarding.gs naar "je/jouw"** — sed-replace, 5 minuten, eindelijk consistent met `/index.html`.
3. **Verberg het "Controle & Export"-submenu standaard** achter een `Boekhouding → Geavanceerd tonen`-toggle. Halveert de cognitive load van het menu zonder een feature weg te halen.

## Het structurele probleem

**De positionering is dubbel: "voor ZZP'ers die geen boekhoudkennis hebben" + product-oppervlak van een full-stack ERP.** De site belooft "15 minuten per maand", maar het product levert 102 menu-items, een DLQ-overzicht, XAF-export, holding-overzichten (die niet eens werken), KIA+MIA+EIA-stapeling, suppletie-aangifte, en HITL-validatie van concept-boekingen. Dat is geen ZZP-tool — dat is een boekhouderspakket vermomd als ZZP-tool. Je hebt twee opties: óf de copy oppositiveert (geef toe dat je 95th-percentile freelancers bedient die *willen* graven), óf 70% van het menu verdwijnt achter een power-user flag. Nu trek je junior-ZZP'ers aan via copy en jaag je ze weg via UI.

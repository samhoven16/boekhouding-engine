I have everything I need to write the persona-based review.

---

# 1-ster Trustpilot review (200 woorden)

**Titel: "Een spreadsheet met scripts, geen product"**

Zes maanden geleden 49 euro betaald voor "een Google Sheet die voor je werkt". Wat ik kreeg: een Google Sheet die mij voortdurend werk geeft.

Vandaag wilde ik gewoon mijn Q2-BTW-aangifte doen. In plaats daarvan krijg ik een popup: "Aangifte controleren — 3 waarschuwing(en). Verkeerde aangifte = correctie + boete-risico." Dank je wel voor de paniek, om 10 uur 's ochtends.

Het menu telt zes submenu's, twéé licentie-items, vier achievement-toasts ("🥇 Eerste factuur — Het begin is gemaakt"), een NPS-survey die elke 60 dagen terugkomt, een "fiscaal profielwizard" die mij vraagt of ik AOW krijg (ik ben 38) en sterretjes-emoji's in werkelijk élk dialoog. Vorige week kreeg ik een toast: "🔒 Afgesloten boekjaar" — ik wist niet eens dat ik er één had.

Bij mijn 47e factuur ineens: "Factuurnummer GAP gedetecteerd. Audit-flag." Wat?? Ik heb niets gedaan.

De échte schop: ik ben net zoveel tijd kwijt aan dit ding uitleggen aan mezelf als ik vroeger aan mijn accountant kwijt was — maar nu zonder iemand om te bellen. Terug naar Excel + mevrouw Jansen. **49 euro verbrand.**

---

# Top 5 momenten waar het brak

1. **Setup-doorlopen — drie verschillende welkom-flows over elkaar.** `Onboarding.gs:59` (`toonWelkomstWizard`) stuurt me via ui.alert door 4 stappen — daarna verschijnt `Onboarding.gs:436` (`toonPostSetupWelkomModal_`) met opnieuw "1. Bedrijfsgegevens" als nieuwe stap, plus de "fiscaal profielwizard" met 6 vragen over WBSO en stakingsaftrek. Eerste indruk: paniek.

2. **Eerste factuur — error "Geen geldige factuurregels gevonden."** `Triggers.gs:540`. Ik had één regel ingevuld met "1 uur consultancy" maar het bedrag-veld leeg gelaten. Bericht zegt niet *welke* regel, alleen abstract "minimaal één regel met omschrijving, aantal > 0 en prijs > €0". Ik dacht dat het systeem stuk was.

3. **Onbegrijpelijke audit-popup bij open.** `Menu.gs:69-77`: "⚠️ Tabblad opnieuw aangemaakt … Open Bestand → Versiegeschiedenis om een eerdere versie terug te zetten. (Google bewaart 30 dagen versiegeschiedenis.)" — Ik had per ongeluk een tabje gesleept. Nu krijg ik een AVG-achtige waarschuwing alsof ik data ben kwijtgeraakt.

4. **Q2-aangifte gestopt door "sanity-check".** `BTW.gs:46-53` toont *drie* waarschuwingen ("Verkeerde aangifte = correctie + boete-risico") met YES/NO. Niet uit te leggen wát het probleem is — alleen dat *iets* afwijkt van vorig kwartaal. Ik klikte NO en heb 't nog steeds niet ingediend.

5. **Factuur 47 — "Factuurnummer GAP gedetecteerd. Audit-flag."** `Triggers.gs:564-568`. Eén factuur was eerder gefaald (lege regel). Maand later geeft het ding mij een ernstig klinkende audit-melding voor iets wat *zijn* tellerbug was.

---

# Top 3 communicatie-fouten

- **Toon — bedreigend i.p.v. behulpzaam.** "KRITIEK: factuur in inconsistente staat — neem direct contact op met support" (`Verkoopfacturen.gs:1051`), "🚨 KOR-grens overschreden" (`Notificaties.gs:94`), "💸 U moet … betalen aan de Belastingdienst." Het voelt alsof ik elke dag een waarschuwing krijg.
- **Verkeerd moment — toast bij elke open.** `Menu.gs:96-110` (seizoens-tip), plus changelog, plus NPS, plus achievements, plus tabblad-herstel, plus gesloten-periode. Vijf toasts kunnen tegelijk komen. Bij login wil ik gewoon mijn dashboard.
- **Jargon zonder uitleg.** "r1a/r1b/r1d-classificatie", "verleggingsregeling", "DLQ-retry", "Tabblad opnieuw opmaken (kleuren + format)", "Suppletie-aangifte". Het hele menu (`Menu.gs:153-274`) leest als een GAS-engineering changelog.

---

# Top 2 dingen die accountant me gaf, die hier missen

1. **Een mens die zegt "doe niets, ik fix het."** Bij de Q2-validatiewaarschuwingen had mevrouw Jansen 30 seconden gekeken en gezegd "klopt — vorig kwartaal stond een dubbele factuur". Hier krijg ik alleen YES/NO.
2. **Eén pdf per kwartaal: rekening, BTW-overzicht, aftrekposten.** Hier is alles versplinterd over Dashboard, Notificaties-tab, Belastingadvies-tab, BTW Aangifte-tab, Audit Log, Jaaroverzicht, KOR-check, Wat-als-rekenmachine. Ik weet nooit waar "het antwoord" staat.

---

# Eén zin om me terug te winnen

Verberg 80% van het menu standaard, vervang elke "🚨/⚠️/KRITIEK"-popup door één rustige "we hebben dit voor je opgelost"-toast, en geef me één telefoonnummer waar een echt mens BTW-aangifte voor me indrukt zodat ik die YES/NO-knop nooit meer hoef te zien.

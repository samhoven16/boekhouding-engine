# Audit-findings — positionering-redacteur
Hashes: zie tmp/file-hashes.txt. Persona's: A=startende ZZP'er (faalangst), B=eenmanszaak jaar 2 (anti-abonnement), C=technische freelancer (lock-in-angst, marketing-wantrouwen).

## Batch POS-A — index, landing, over, functies, kopen, starters, vergelijking, gratis
Sterkste dekking: B en C consequent goed bediend. Zwakste: A valt structureel buiten de hoofd-koopflow (alleen /starters/ bedient A goed). Kernpropositie €49/eigen-data/geen-abonnement inhoudelijk consistent — behalve de besparingsgetallen (F-POS-012).

#### F-POS-001 [LAAG] website/index.html:1530-1560
Quote: `Voor ZZP'ers die klaar zijn met €30 per maand voor software die ze nooit echt bezitten.`
Probleem: hero volledig op persona B (anti-abonnement); A (nooit een abonnement gehad, faalangst over eerste BTW-aangifte) komt in de hero niet voor; A's enige ingang is het kleine nav-linkje /starters/.
Fix: hero-sub-zin voor A of /starters/-link prominenter. Owner: accountant
#### F-POS-002 [LAAG] website/index.html:1568 — agressieve besparings-anchor (€2.291) als eerste sectie schrikt C af ("marketing-praat") terwijl de site "geen marketing-praat" claimt. Fix: bron tonen of ná trust-laag. Owner: accountant
#### F-POS-003 [MIDDEL] website/index.html:1808-1830
Quote: `BTW-spaarpot niet apart gehouden. Rekening 1205 ... invariant-check (10 axioma's)`
Probleem: homepage-FAQ vol boekhoud-/dev-jargon (crediteuren, rekening 1205, art. 35a, RGS 3.5) — precies wat A afschrikt; strijdig met eigen "zonder boekhoudjargon"-belofte.
Fix: gevorderde FAQ naar /faq/; homepage alleen starter-vriendelijk. Owner: accountant
#### F-POS-004 [MIDDEL] website/landing.html:231-257
Quote: `Je zit waarschijnlijk in één van deze twee kampen. ... Kamp 1: Ik gebruik Excel ... Kamp 2: Moneybird/Exact`
Probleem: centrale herkennings-sectie veronderstelt een bestaande administratie ⇒ A (net ingeschreven) herkent zich in geen kamp en concludeert "niet voor mij".
Fix: derde kamp "ik moet nog beginnen" of A naar /starters/ routeren. Owner: accountant
#### F-POS-005 [LAAG] website/landing.html:384 — "audit-log/sequentiële factuurnummers/XAF" raakt C maar zonder bron/GitHub-link om de claim te verifiëren. Fix: link naar /transparantie/. Owner: accountant
#### F-POS-006 [LAAG] website/over/index.html:158-208 — /over/ volledig op onafhankelijkheid (B/C); A's geruststelling ontbreekt. Fix: één geruststellende alinea. Owner: accountant
#### F-POS-007 [LAAG] website/functies/index.html:197-198 — hero "alles wat je nodig hebt, niets meer" veronderstelt dat je weet wát je nodig hebt (B); "starter"/"eerste keer" ontbreekt. Fix: starter-zin/-link. Owner: accountant
#### F-POS-008 [MIDDEL] website/functies/index.html:328-329
Quote: `met heffingskorting + arbeidskorting + KIA + zelfstandigenaftrek + lijfrente-jaarruimte.`
Probleem: zware fiscale termen ongefilterd op de ook-voor-starters-bedoelde functies-pagina; strijdig met hero-belofte "zonder boekhoudjargon".
Fix: termen duiden of als "voor gevorderden" labelen. Owner: accountant
#### F-POS-009 [LAAG] website/kopen/index.html:40-50 — prijs €49/eenmalig/geen-abonnement niet herhaald op de letterlijke koop-pagina (auto-redirect 1,5s). Fix: één geruststellende prijsregel. Owner: accountant
#### F-POS-010 [LAAG] website/starters/index.html:176 vs 37 — KOR-uitleg belooft "rekenhulp die je helpt kiezen" (176) vs JSON-LD "één instelling aan/uit" (37) — twee beloftes over A's eerste echte beslissing. Fix: gelijktrekken. Owner: accountant
#### F-POS-011 [LAAG] website/vergelijking/index.html:340 — "Tesla-week / tweede huwelijksreis"-metaforen op een "geen marketing-praat"-pagina ondermijnen C's vertrouwen. Fix: puur euro's/uren. Owner: accountant
#### F-POS-012 [MIDDEL] website/vergelijking/index.html:219-220,339-360 vs index.html:1581-1589
Quote: `€49 vs €1.500 — dat is geen marketing` vs homepage `€2.291 over 5 jaar` vs landing `€1.031 over 3 jaar`
Probleem: drie verschillende besparingsgetallen (€2.291 / €1.031 / €1.500) + twee peildatums (april/mei 2026) ⇒ C die cijfers natrekt ziet gunstig-gekozen getallen ⇒ vertrouwensverlies. Enige vondst met deels dev-ownership.
Fix: één canonieke besparingsbron + peildatum site-breed. Owner: Sam (dev) / accountant
#### F-POS-013 [LAAG] website/gratis/index.html:169 — "rubrieken 1a, 1b, 1c, 5a, 5b" kaal in feature-bullet schrikt A af (gratis-pagina is ook A-instappunt). Fix: duiden of weglaten. Owner: accountant

Patroon POS-A: A onderbediend in elke hero van de primaire koop-pagina's (001/004/007) + jargon dat A afschrikt (003/008/013); besparingsgetallen inconsistent (012). Geen BLOCKER/HOOG; propositie zelf consistent.

# Audit-findings — content-gap-detector
Hashes: zie tmp/file-hashes.txt. Interne links geverifieerd via Glob tegen schijf.

## Batch GAP-A — index, faq, functies, gids-hub, starters, gratis, vergelijking, bronnen

### website/index.html — Gelezen: 1-2333. Queries goed gedekt (1746-1821); concurrent-anker aanwezig (1564-1648). VONDSTEN F-GAP-001..003.
### website/faq/index.html — Gelezen: 1-586. KOR/verlegd/suppletie/IB gedekt. VONDSTEN F-GAP-004, 005.
### website/functies/index.html — Gelezen: 1-433. Product-pagina; geen kennisbelofte. Deel van F-GAP-003.
### website/gids/index.html — Gelezen: 1-407. 30 kaarten; alle slugs bestaan. VONDSTEN F-GAP-006, 007.
### website/starters/index.html — Gelezen: 1-238. KvK/KOR/bewaarplicht gedekt. VONDST F-GAP-008.
### website/gratis/index.html — Gelezen: 1-321. VONDST F-GAP-009.
### website/vergelijking/index.html — Gelezen: 1-497. 20-rijs tabel OK. VONDST F-GAP-010.
### website/bronnen/index.html — Gelezen: 1-270. VONDST F-GAP-011.

#### F-GAP-001 [MIDDEL] website/index.html:1745-1771
Quote: `<div class="gids-hub-grid"> … <p class="gids-hub-alle"><a href="/gids/">Bekijk alle 35+ gidsen →</a></p>`
Probleem: homepage-hub mist KOR en urencriterium — de twee hoogst-zoekende beginnersvragen — terwijl gidsen bestaan.
Fix: hub-kaart vervangen/toevoegen. Owner: Sam (dev)

#### F-GAP-002 [LAAG] website/index.html:1780-1850 — homepage-FAQ (8 items) zonder KOR-vraag. Fix: KOR-item + schema. Owner: Sam.

#### F-GAP-003 [LAAG] index:1744 + faq:487 + functies:375
Quote: `… 35+ gidsen …` vs `(32+ artikelen)` vs 30 kaarten vs 34 op schijf
Probleem: vier verschillende tellingen, geen enkele klopt (werkelijk 34).
Fix: standaardiseren op 34 of "30+". Owner: Sam (dev)

#### F-GAP-004 [MIDDEL] website/faq/index.html:380-407 — BTW-categorie mist urencriterium/startersaftrek/BTW-nummer-aanvragen terwijl gidsen bestaan. Fix: 2-3 items + links. Owner: Sam.

#### F-GAP-005 [MIDDEL] website/faq/index.html:192-200, 278-306
Quote: `<button type="button" class="faq-cat" data-cat="techniek">Techniek</button>` (geen features-knop) vs `<details data-cat="features">`
Probleem: 6 "features"-items (iDEAL, AI-bonscan, KvK-autofill, fiscaal advies, deelflow, BTW-spaarpot) onbereikbaar bij elke categoriefilter behalve "Alle" (JS regel 554) — geschreven content verborgen.
Fix: features-filterknop of hercategoriseren. Owner: Sam (dev)

#### F-GAP-006 [MIDDEL] website/gids/index.html:143-355 — geen kaart/gids voor KOR-specifiek, "BTW-nummer aanvragen", "KvK inschrijven kosten" (hoog zoekvolume, aparte intent). Fix: KOR-gids + kaarten. Owner: Sam.

#### F-GAP-007 [HOOG] website/gids/index.html:143-355
Quote: laatste kaart `zzp-administratie-apps` — geen kaarten voor 4 bestaande slugs
Probleem: 4 bestaande gidsen NIET in de hub gelinkt: boekhoudprogramma-zonder-abonnement, e-boekhouden-vs-moneybird-vs-boekhoudbaar, exact-online-stoppen-besparing, moneybird-alternatief-2026 — verloren discoverability/link-equity in de hoogst-converterende overstap-intent.
Fix: 4 kaarten toevoegen (categorie "Overstappen"). Owner: Sam (dev)

#### F-GAP-008 [HOOG] website/starters/index.html:206-215
Quote: `<div class="gids-links"> <a href="/gids/zzp-starten-checklist-2026/">…</a> … </div>`
Probleem: dé starter-entry mist links naar bestaande zelfstandigenaftrek-2026 en urencriterium-bijhouden-zzp — precies de vragen na de eerste factuur; "BTW-nummer aanvragen" nergens.
Fix: links toevoegen + korte alinea. Owner: Sam (dev)

#### F-GAP-009 [MIDDEL] website/gratis/index.html:274-282 — lead-magnet-pagina zonder contextuele link naar gratis-boekhouding-excel-zzp (alleen generieke footer). Fix: contextuele link in body. Owner: Sam.

#### F-GAP-010 [HOOG] website/vergelijking/index.html:433-444
Quote: `<a href="/gids/moneybird-alternatief-2026/">…</a> <a href="/gids/exact-online-stoppen-besparing/">…</a>`
Probleem: overstap-pagina linkt e-boekhouden-vs-moneybird-vs-boekhoudbaar niet en biedt geen export/migratie-how-to ("Moneybird stopzetten/data exporteren") — de daadwerkelijke overstap-handeling onbeantwoord.
Fix: link + migratie-sectie. Owner: Sam (dev)

#### F-GAP-011 [LAAG] website/bronnen/index.html:144-178 — bron-blokken linken uitsluitend extern; eigen gidsen (zelfstandigenaftrek, urencriterium, afschrijven) nergens gelinkt vanaf deze autoritaire pagina. Fix: "Lees onze gids"-links. Owner: Sam.

Patroon GAP-A: grootste gat is verloren discoverability (niet ontbrekende content): 34 gidsen op schijf maar hub/starters/vergelijking/bronnen linken inconsistent; echte ontbrekers: KOR-eigen-pagina, BTW-nummer aanvragen, KvK-kosten; UX-defecten verbergen bestaande antwoorden (F-GAP-005, 003). Geen dode links gevonden.

## Wave B — gap_01 (demo + 7 gidsen) — gelezen volledig
[F-GAP-012] MIDDEL btw-aangifte-zzp:300-313 — ICP-opgaaf bij EU-levering nergens uitgelegd (alleen rubriek 1d); EU-klant → naheffing.
[F-GAP-013] MIDDEL btw-aangifte-zzp:199-294 — "BTW nihilaangifte/lege aangifte" onbeantwoord; €0-omzet zonder KOR → verzuimboete.
[F-GAP-014] LAAG btw-aangifte-zzp:311 — rubriek 5g vs zustergids 5b inconsistent; 5a-5g-keten nergens volledig.
[F-GAP-015] HOOG btw-berekenen-terugvragen-zzp:112-167 — mist omgekeerd rekenen (incl→excl, /1,21); precies de "BTW eruit rekenen"-zoekintentie waarvoor men googelt.
[F-GAP-016] MIDDEL btw-berekenen-terugvragen-zzp:187 — plaatst 0% én vrijgesteld onder 1d; zustergids splitst 1d/1e → twee antwoorden op zelfde rubriekvraag.
[F-GAP-017] LAAG btw-berekenen-terugvragen-zzp:228 — foutcorrectie aangestipt maar geen interne link naar bestaande suppletie-gids.
[F-GAP-018] HOOG aftrekbare-kosten-zzp:168-175 — zegt thuiswerkvergoeding €2,40 geldt NIET voor ZZP, maar eigen demo+gids claimen "ja" → tegenstrijdig antwoord, geen link.
[F-GAP-019] MIDDEL aftrekbare-kosten-zzp:146 — werkruimte-aftrek afgeserveerd als "meestal niet" zonder kwalificerend/evenredig onderscheid; geen verdiepingsgids.
[F-GAP-020] LAAG afschrijven-zzp-uitleg:96 — €450-grens niet met bron-jaartal 2026 bevestigd terwijl demo €2.901 KIA voert.
[F-GAP-021] MIDDEL auto-leasen-vs-kopen-zzp:113-155 — geen concreet 2026-bijtellingspercentage gewone auto (22%) noch 500-km-grens privégebruik eenmanszaak.
[F-GAP-022] HOOG bankafschrift-boeken-zzp:100-111 — ABN AMRO + SNS/ASN/Triodos ontbreken in export-tabel; ABN-klant vindt eigen bank niet.
[F-GAP-023] MIDDEL bankafschrift-boeken-zzp — MT940 vs CSV-verschil onbeantwoord terwijl termen wel genoemd.
[F-GAP-024] MIDDEL boekhoudprogramma-zonder-abonnement:128-244 — mist Jortt/Acumulus/Informer die concurrent-listicles wél noemen → "complete vergelijking" oogt selectief.
[F-GAP-025] MIDDEL demo:484-514 — rubriek 1d/1e-indeling wijkt af van eigen gids; Bank/Relaties-tabs grijs terwijl bankimport dé USP is.

## Wave C — gap_02 (8 gidsen) — gelezen volledig
[F-GAP-026] MIDDEL btw-teruggave-zzp — "hoe zie ik vóór indienen of ik terugkrijg" (saldo 5g negatief) + "terugvragen zonder omzet/verliesjaar" onbeantwoord.
[F-GAP-027] MIDDEL btw-teruggave-zzp — "btw terugvragen aanloop/voorbereidingskosten vóór KvK-inschrijving" ontbreekt (hoge starter-intentie).
[F-GAP-028] MIDDEL btw-verleggen-wanneer — ICP-opgaaf 4× genoemd als plicht maar HOE invullen/deadline/per-klant nergens uitgelegd; geen eigen ICP-gids.
[F-GAP-029] LAAG btw-verleggen-wanneer — OSS €10.000 EU-drempel + registratie vaag; SaaS/digitale-ZZP zoekt hierop.
[F-GAP-030] MIDDEL creditnota-maken-zzp — "creditnota negatief in welke rubriek (1a)" niet vermeld terwijl buurgidsen rubrieken geven.
[F-GAP-031] LAAG creditnota-maken-zzp — spanning aparte CN-reeks vs doorlopende uniciteit niet opgelost.
[F-GAP-032] HOOG debiteurenbeheer-zzp — wettelijke handelsrente 2026 alleen vaag "~10-12%" i.p.v. exact per-halfjaar getal; dé reden van de zoekopdracht.
[F-GAP-033] MIDDEL debiteurenbeheer-zzp — WIK-incassostaffel (15% over eerste €2.500…) + B2C 14-dagenbrief ontbreken; alleen €40-minimum.
[F-GAP-034] LAAG debiteurenbeheer-zzp — "oninbare debiteur afboeken" operationeel + cross-link suppletie ontbreekt.
[F-GAP-035] MIDDEL e-boekhouden-vs-moneybird-vs-boekhoudbaar — "welk pakket geschikt voor KOR" niet beantwoord (alleen terloops foutmoment).
[F-GAP-036] LAAG e-boekhouden-vs... — welke banken bankkoppeling (bunq/Knab/Revolut/PSD2) niet gespecificeerd.
[F-GAP-037] MIDDEL exact-online-stoppen-besparing — migratie-IMPORT-stap (XAF/CSV inlezen + beginbalans overzetten) ontbreekt; overstap loopt juist daar vast.
[F-GAP-038] HOOG factuur-opstellen-zzp — e-factuur-verplichting 2026/2027 / ViDA / NL-tijdlijn ontbreekt; PEPPOL alleen vaag "overheid steeds vaker". Stijgend zoekvolume.
[F-GAP-039] MIDDEL gratis-boekhouding-excel-zzp — waarschuwt tegen gratis templates maar levert zelf geen downloadbaar artefact; zoekintentie "download" → alleen €49-CTA; mist link naar /gratis Light-versie.

## Wave C — gap_03 (8 gidsen) — gelezen volledig
[F-GAP-040] HOOG ib-aangifte-zzp — zelfstandigenaftrek 2026 = €1.200 hier, maar jaarafsluiting-gids:166 zegt €2.470 → TEGENGESTELDE cijfers over gidsen heen, directe EEAT/trust-schade. [overlapt tax-compliance — cijfer-verificatie vereist]
[F-GAP-041] HOOG ib-aangifte-zzp — "hoeveel belasting reserveren zzp / voorlopige aanslag aanvragen/wijzigen" massaal gezocht maar slechts terloops; geen reserverings-gids gelinkt.
[F-GAP-042] MIDDEL ib-aangifte-zzp — schijf-1 8,17%+27,65%=35,82% ≠ getoonde 35,7% → narekenende zoeker ziet rekenfout.
[F-GAP-043] MIDDEL jaarafsluiting-zzp-checklist — bevat het foutieve €2.470 (zie F-GAP-040); linkt naar zelfstandigenaftrek-2026-gids met mogelijk derde getal.
[F-GAP-044] MIDDEL moneybird-alternatief-2026 — gratis-tier-kolom + jaar-vs-maandprijs ontbreekt; vergelijkers verwachten gratis-kolom.
[F-GAP-045] MIDDEL moneybird-alternatief-2026 — pakket-specifieke export/opzeg-PAA (e-Boekhouden-helft) ontbreekt in body.
[F-GAP-046] HOOG offerte-maken-zzp — downloadbare offerte-template (Word/PDF/Docs) ontbreekt terwijl dat dé intent is; alleen visueel blok + €49-CTA. Grootste conversie-gat.
[F-GAP-047] LAAG offerte-maken-zzp — "verschil offerte/opdrachtbevestiging" + "wordt offerte automatisch factuur" niet beantwoord.
[F-GAP-048] HOOG pensioen-opbouwen-zzp — jaarruimte-rekenvoorbeeld intern inconsistent: formule (30%×(grondslag−franchise)) vs bullets (30%×grondslag−franchise) → onreproduceerbaar (€9.900 vs −€2.000).
[F-GAP-049] MIDDEL pensioen-opbouwen-zzp — FOR-afschaffing (sinds 2023) + WTP-verruiming-context ontbreekt; "FOR afgeschaft wat nu" vindt niets.
[F-GAP-050] LAAG pensioen-opbouwen-zzp — "AOV vs pensioen" + aankomende verplichte AOV niet genoemd.
[F-GAP-051] LAAG maandaangifte-vs-kwartaalaangifte-btw — "btw betalen betalingskenmerk" + te-laat-boete niet beantwoord.
[F-GAP-052] LAAG suppletie-aangifte-btw — spiegelvraag "te VEEL betaald/teruggave + belastingrente vergoed" niet als eigen scenario.
[F-GAP-053] LAAG thuiswerkvergoeding-zzp — aangrenzende "kilometervergoeding/reiskosten zzp 2026 €0,23" niet gelinkt.

## Wave C — gap_04 (8 gidsen) — gelezen volledig; cross-check zelfstandigenaftrek
[F-GAP-054] HOOG zelfstandigenaftrek-2026 — eigen pagina: TLDR/body €1.200 maar 2 FAQ's €2.470 → zelf-tegensprekend op het kerncijfer. Canoniek = €1.200 (correct 2026); €2.470 = stale 2025.
[F-GAP-055] HOOG zelf-boekhouding-doen-zzp — noemt 2026=€2.470 op 3 plaatsen terwijl gelinkte dedicated gids €1.200 zegt → bedrag halveert tussen 2 Boekhoudbaar-pagina's.
[F-GAP-056] HOOG wet-dba-zzp — Wet VBAR (opvolger DBA), handhavingsmoratorium-afschaffing, DBA-webmodule ontbreken; stopt bij 2025-handhaving. Hoogste-volume juridische ZZP-term.
[F-GAP-063] MIDDEL wet-dba-zzp — Deliveroo-arrest + "inbedding in organisatie"-criterium ontbreekt; toont nog oude strikte 3-criteria-model.
[F-GAP-057] MIDDEL zakelijk-of-prive-auto-zzp — EV-bijtelling "17% tot €30.000/22% erboven" mogelijk verouderd voor 2026 (cap-afschaffing); verifieer exact 2026-tarief.
[F-GAP-058] MIDDEL zakelijk-of-prive-auto-zzp — "kan ik meer dan €0,23/km declareren" niet beantwoord.
[F-GAP-067] LAAG zakelijk-of-prive-auto-zzp — BTW-correctie privégebruik auto (2,7%/1,5%) ontbreekt volledig; foutgevoelig hoogvolume-onderwerp.
[F-GAP-066] LAAG zakelijke-rekening-zzp-2026 — Finom/Qonto/Wise/ABN AMRO ontbreken in 6-banken-vergelijking (sterke gids verder).
[F-GAP-059] HOOG zakelijke-verzekering-zzp — verplichte AOV zelfstandigen (wetsvoorstel) nergens; zegt zelfs "verplicht: géén". Meest urgente verzekerings-PAA.
[F-GAP-060] MIDDEL zakelijke-verzekering-zzp — "BAV/BAV" dubbel-afkorting copy-fout; AVB vs beroepsaansprakelijkheid niet onderscheiden.
[F-GAP-061] MIDDEL urencriterium-bijhouden-zzp — claimt MKB-winstvrijstelling vereist urencriterium (deels) — feitelijk onjuist (geldt voor elke IB-ondernemer); fiscaal misverstand.
[F-GAP-062] MIDDEL urencriterium-bijhouden-zzp — zwangerschap (16 wk telt mee)/ziekte-uitzonderingen ontbreken.
[F-GAP-064] MIDDEL zelf-boekhouding-doen-zzp — KOR/EU-KOR ontbreekt in starter-checklist; top-starter-PAA "wel/geen BTW via KOR".
[F-GAP-065] LAAG zzp-administratie-apps — 2 interne links (zzp-tool-stack, bankafschrift-boeken) mogelijk dood [verifieer]; "gratis factuur-app" niet als categorie.

## Wave C — gap_05 (3 gidsen + kopen + besparing) — gelezen volledig
[F-GAP-068] HOOG zzp-starten-checklist-2026 — KOR alleen in 1 FAQ; "KOR aanvragen hoe/termijn/3-jaar-vast" + dedicated KOR-pagina ontbreekt.
[F-GAP-069] HOOG zzp-starten-checklist-2026 — linkt niet naar bestaande /starters/ of /gratis/ (hub sluit interne-link-loop niet).
[F-GAP-070] MIDDEL zzp-starten-checklist-2026 — geen 2026-bedragen (zelfstandigenaftrek/startersaftrek) op rechtsvorm-beslispunt.
[F-GAP-071] MIDDEL zzp-starten-checklist-2026 — verplichte AOV 2026/2027 niet benoemd; zakelijke-verzekering-gids niet gelinkt.
[F-GAP-072] LAAG zzp-starten-checklist-2026 — stelt eHerkenning als enige route; DigiD voor eenmanszaak-BTW niet genoemd.
[F-GAP-073] MIDDEL zzp-tool-stack — overstap-vervolgvraag (Moneybird stopzetten/migreren) niet beantwoord; boekhoud-CTA wijst naar / i.p.v. /kopen.
[F-GAP-074] LAAG zzp-tool-stack — Zapier-claim maar "bank automatisch importeren" loopt dood, geen link naar bankafschrift-gids.
[F-GAP-075] MIDDEL zzp-uurtarief-berekenen — bruto-netto met ongespecificeerde ×1,55 zonder 2026-schijven/zelfstandigenaftrek; "bruto-netto ZZP 2026" onbeantwoord.
[F-GAP-076] LAAG zzp-uurtarief-berekenen — €0,23/km als vaststaand 2026 zonder bron.
[F-GAP-077] LAAG zzp-uurtarief-berekenen — geen brug naar factuur/offerte-gids op toepas-moment.
[F-GAP-078] HOOG kopen — /kopen is noindex JS/meta-redirect met NUL koop-twijfel-content; alle CTA's wijzen hierheen maar "wat krijg ik voor €49/eenmalig/Google-account/geld terug" onbeantwoord vóór 1,5s-redirect. Grootste conversie-gap.
[F-GAP-079] HOOG kopen — refund/herroepingsrecht op beslismoment niet beantwoord terwijl /herroepingsrecht/ bestaat maar niet gelinkt.
[F-GAP-080] MIDDEL tools/besparing — concurrent-prijzen hardcoded zonder datum/bron (2026-actualiteitsrisico); geen link naar vergelijkingspagina.
[F-GAP-081] MIDDEL tools/besparing — "mis ik functies/live bankfeed vs Moneybird" + "data over 5 jaar" niet weerlegd; geen brug naar /vergelijking of /continuiteit.

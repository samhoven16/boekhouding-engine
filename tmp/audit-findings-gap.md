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

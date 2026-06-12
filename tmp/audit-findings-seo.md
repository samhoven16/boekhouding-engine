# Audit-findings — seo-strategist
Hashes: zie tmp/file-hashes.txt. Cross-refs geverifieerd tegen index.html (hreflang), sitemap.xml, nav.js, robots.txt, _redirects.

## Batch SEO-A — 404, adverteren, bedankt, bronnen, continuiteit, demo, dpa, en

### website/404.html — Gelezen: 1-251. noindex,nofollow correct (8); één H1 (182); rijke interne links (200-208, 234-241). VONDST F-SEO-001 (minor).
### website/adverteren/index.html — Gelezen: 1-305. Schema OK (26-34); canonical OK; font preload-swap netjes (14-17). VONDSTEN F-SEO-002, 003.
### website/bedankt/index.html — Gelezen: 1-335. noindex,follow correct (9-10); H-structuur logisch; geen dead-end. Geen vondsten.
### website/bronnen/index.html — Gelezen: 1-270. Article-schema met author + dates OK (30-37); in sitemap (68). VONDSTEN F-SEO-004, 005.
### website/continuiteit/index.html — Gelezen: 1-130. Title/description OK; schema OK (10-18). VONDSTEN F-SEO-006 (HOOG), 007, 008.
### website/demo/index.html — Gelezen: 1-1075. Title/canonical/OG OK; in sitemap (19); footer-links OK. VONDST F-SEO-009.
### website/dpa/index.html — Gelezen: 1-238. Title/canonical OK; in sitemap (117); H2 1-13 logisch. VONDSTEN F-SEO-010, 011.
### website/en/index.html — Gelezen: 1-259. hreflang nl/en/x-default symmetrisch met homepage (10-13 ↔ index 35-37) OK; OG incl. locale OK. VONDSTEN F-SEO-012, 013.

#### F-SEO-001 [LAAG] website/404.html:146
Quote: `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='...'></script>`
Probleem: CF-beacon in head op 404/dpa; defer mitigeert — observatie.
Fix: optioneel naar einde body. Owner: Sam (dev)

#### F-SEO-002 [MIDDEL] website/adverteren/index.html:10
Quote: `<link rel="canonical" href="https://www.boekhoudbaar.nl/adverteren/">`
Probleem: indexeerbare pagina niet in sitemap.xml (geverifieerd) en alleen via footer bereikbaar ⇒ trage/onvolledige crawl.
Fix: sitemap-entry of bewust noindex. Owner: Sam (dev)

#### F-SEO-003 [LAAG] website/adverteren/index.html:8
Quote: `<meta name="description" content="Boekhoudbaar bereikt Nederlandse ZZP'ers ... geen banner-vervuiling.">`
Probleem: ~254 tekens; SERP kapt rond 155-160.
Fix: inkorten, kernpropositie vooraan. Owner: Sam (dev)

#### F-SEO-004 [LAAG] website/bronnen/index.html:7
Quote: `<title>Bronnen & verifieerbaarheid — Boekhoudbaar | Transparant over wat we gebruiken</title>`
Probleem: ~78 tekens; staart afgekapt.
Fix: inkorten tot ~42 chars. Owner: Sam (dev)

#### F-SEO-005 [LAAG] website/bronnen/index.html:19 (+continuiteit:22, dpa:14, en:22)
Quote: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:...&display=swap">`
Probleem: render-blocking font zonder de preload-onload-swap die adverteren/bedankt/demo wél hebben.
Fix: zelfde preload-patroon + noscript-fallback. Owner: Sam (dev)

#### F-SEO-006 [HOOG] website/continuiteit/index.html:50
Quote: `<nav-bar></nav-bar>`
Probleem: custom element nergens via customElements.define() geregistreerd (geverifieerd in nav.js) ⇒ rendert leeg: géén header-navigatie en geen interne links naar hoofdsecties vanaf deze trust-pagina — kapotte interne link-graph + UX.
Fix: vervangen door het inline <nav>-blok van de andere pagina's of element registreren in nav.js. Owner: Sam (dev)

#### F-SEO-007 [MIDDEL] website/continuiteit/index.html:9
Quote: `<link rel="canonical" href="https://www.boekhoudbaar.nl/continuiteit/">`
Probleem: indexeerbare trust-pagina niet in sitemap.xml.
Fix: sitemap-entry toevoegen. Owner: Sam (dev)

#### F-SEO-008 [LAAG] website/continuiteit/index.html:1-26
Quote: head bevat geen og:* of twitter:* meta
Probleem: geen share-preview voor juist deze veel-gedeelde trust-pagina; inconsistent met rest.
Fix: OG-set kopiëren van /bronnen/. Owner: Sam (dev)

#### F-SEO-009 [MIDDEL] website/demo/index.html:518
Quote: `<h3 class="mock-h3">Belastingadvies &amp; aftrekposten 2026</h3>` (+538/564/620/649; eerste echte H2 pas regel 744)
Probleem: heading-skip H1→H3 via mock-UI-labels vóór de eerste H2 ⇒ rommelige semantische outline.
Fix: mock-titels naar p/div met heading-styling. Owner: Sam (dev)

#### F-SEO-010 [LAAG] website/dpa/index.html:16
Quote: `{"@type":"ListItem","position":1,"name":"Home","item":"https://www.boekhoudbaar.nl/"}`
Probleem: breadcrumb-root "Home" vs "Boekhoudbaar" elders; geen @graph-vorm — inconsistent.
Fix: naam gelijktrekken. Owner: Sam (dev)

#### F-SEO-011 [LAAG] website/dpa/index.html:1-17
Quote: head bevat geen og:*/twitter:* meta
Probleem: geen OG op indexeerbare pagina (lage prioriteit, juridisch).
Fix: minimale OG-set. Owner: Sam (dev)

#### F-SEO-012 [MIDDEL] website/en/index.html:33
Quote: og:locale:alternate gevolgd door <style> — geen <script type="application/ld+json"> in de head
Probleem: EN-productpagina zonder structured data ⇒ mist Product/Offer-snippet (€49), FAQPage-rich-snippet (4 details-FAQ's, 221-239) en BreadcrumbList.
Fix: SoftwareApplication+Offer + FAQPage JSON-LD. Owner: Sam (dev)

#### F-SEO-013 [LAAG] website/en/index.html:8
Quote: `<meta name="description" content="Self-employed in the Netherlands? ... €49 one-time, no subscription.">`
Probleem: ~205 tekens; kern valt buiten snippet.
Fix: inkorten, €49 vooraan. Owner: Sam (dev)

## Batch SEO-B — faq, functies, 6 gidsen

### website/faq/index.html — Gelezen: 1-586. robots/canonical/sitemap OK (9-10, sitemap:47); H-structuur OK. VONDSTEN F-SEO-020..023.
### website/functies/index.html — Gelezen: 1-432. OG compleet incl. twitter:description (21-31). VONDSTEN F-SEO-024..026.
### website/gids/afschrijven-zzp-uitleg — Gelezen: 1-265. Eén H1 met keyword; lazy-images. VONDSTEN F-SEO-027..029.
### website/gids/aftrekbare-kosten-zzp — Gelezen: 1-301. @graph met dateModified OK. VONDSTEN F-SEO-030, 031.
### website/gids/auto-leasen-vs-kopen-zzp — Gelezen: 1-234. VONDSTEN F-SEO-032, 033.
### website/gids/bankafschrift-boeken-zzp — Gelezen: 1-229. VONDST F-SEO-034.
### website/gids/boekhoudprogramma-zonder-abonnement — Gelezen: 1-325. Article+FAQPage gesynchroniseerd (33-61) — goed. VONDSTEN F-SEO-035..037.
### website/gids/btw-aangifte-zzp — Gelezen: 1-390. Beste schema-implementatie van batch (27-96). VONDSTEN F-SEO-038, 039.

#### F-SEO-020 [LAAG] website/faq/index.html:8 — description 218 tekens, afgekapt. Fix: ≤160. Owner: Sam.
#### F-SEO-021 [MIDDEL] website/faq/index.html:38-55
Quote: `{"@type":"FAQPage","mainEntity":[ ... 17 Question-objecten ...]`
Probleem: schema dekt 17 van ~46 zichtbare vragen; sommige schema-vragen matchen zichtbare bewoording niet ⇒ gemiste rich snippets + mismatch-risico.
Fix: synchroniseren met zichtbare details-vragen. Owner: Sam (dev)

#### F-SEO-022 [HOOG] website/faq/index.html:40
Quote: `"text":"... Geen onbeperkte "geld terug zonder reden" — Boekhoudbaar is een digitaal product`
Probleem: onge-escapete dubbele quotes binnen JSON-string ⇒ JSON-LD ongeldig vanaf dit punt ⇒ Google kan de hele FAQPage-block afkeuren (alle FAQ-rich-results weg).
Fix: quotes escapen; valideren met Rich Results Test. Owner: Sam (dev)

#### F-SEO-023 [LAAG] website/faq/index.html:29-30 — twitter:description ontbreekt; og:image:width/height nergens. Fix: toevoegen. Owner: Sam.
#### F-SEO-024 [LAAG] website/functies/index.html:8 — description 196 tekens. Fix: ≤160. Owner: Sam.
#### F-SEO-025 [MIDDEL] website/functies/index.html:197
Quote: `<h1>Alles wat je ZZP-boekhouding nodig heeft: facturen, BTW-aangifte en overzicht. Niets meer.</h1>`
Probleem: H1 = marketing-volzin ~95 tekens, keyword niet front-loaded.
Fix: keyword-scherpe H1 + marketingzin als lead. Owner: Sam (dev)

#### F-SEO-026 [MIDDEL] website/functies/index.html:39
Quote: `"about":{"@id":"https://www.boekhoudbaar.nl/#app"}`
Probleem: dangling @id (geen #app-node op deze pagina); product-pagina mist eigen SoftwareApplication/Product+Offer-markup (€49).
Fix: #app-node met Offer hier definiëren. Owner: Sam (dev)

#### F-SEO-027 [LAAG] gids/afschrijven:8 — description 168 tekens. Fix: inkorten. Owner: Sam.
#### F-SEO-028 [HOOG] gids/afschrijven:191-218
Quote: `<section class="faq" aria-label="Veelgestelde vragen"> ... <details><summary>Mag ik een laptop in één keer afschrijven ...`
Probleem: zichtbare FAQ (5 vragen) zonder FAQPage-JSON-LD (btw-aangifte-gids heeft het wél); Article mist dateModified + mainEntityOfPage.
Fix: FAQPage-node + Article aanvullen. Owner: Sam (dev)

#### F-SEO-029 [MIDDEL] alle 6 gidsen in batch (afschrijven:17-22 e.a.)
Quote: `<meta property="og:type" content="article"> ... <meta property="og:locale" content="nl_NL">`
Probleem: twitter:*-meta ontbreekt op alle 6 gidsen ⇒ lagere CTR bij delen op X.
Fix: template-fix (één keer = alle 35 gidsen). Owner: Sam (dev)

#### F-SEO-030 [LAAG] gids/aftrekbare-kosten:7-8 — title 72 + description 173 tekens. Fix: inkorten. Owner: Sam.
#### F-SEO-031 [HOOG] gids/aftrekbare-kosten:227-254 — zichtbare FAQ (5 vragen) zonder FAQPage-node in bestaande @graph. Fix: toevoegen. Owner: Sam.
#### F-SEO-032 [LAAG] gids/auto-leasen:8 — description 116 tekens (te kort; idem bankafschrift 110). Fix: 150-160 + CTA. Owner: Sam.
#### F-SEO-033 [HOOG] gids/auto-leasen:31 — minimaal Article-schema (geen dateModified/description/mainEntityOfPage/image) + FAQ zonder FAQPage. Fix: aanvullen. Owner: Sam.
#### F-SEO-034 [HOOG] gids/bankafschrift:31 — idem minimaal Article + FAQ zonder FAQPage; 3-stappen-sectie (115-140) is ideaal HowTo-schema-materiaal, onbenut. Fix: aanvullen + HowTo overwegen. Owner: Sam.
#### F-SEO-035 [LAAG] gids/boekhoudprogramma:8 — description 198 tekens op high-intent query. Fix: ≤160. Owner: Sam.
#### F-SEO-036 [LAAG] gids/boekhoudprogramma:38-45 — Article mist image (SVG wordt door Google slecht geaccepteerd — raster gebruiken). Fix: image toevoegen. Owner: Sam.
#### F-SEO-037 [LAAG] gids/boekhoudprogramma:63-66 — pagina wijkt af van gemeenschappelijk head-template ⇒ wordt bij template-fixes overgeslagen. Fix: onder template brengen. Owner: Sam.
#### F-SEO-038 [LAAG] gids/btw-aangifte:8 — description 214 tekens op top-keyword. Fix: ≤160 + "eerste keer"-intent. Owner: Sam.
#### F-SEO-039 [MIDDEL] gids/btw-aangifte:352-358
Quote: `<div class="cta-onderaan"><h3>BTW automatisch bijhouden?</h3> ... </div></main>`
Probleem: BTW-hub-gids heeft als enige géén "Verder lezen"-blok ⇒ link-equity blijft hangen; BTW-cluster (suppletie, teruggave, verleggen, maand-vs-kwartaal) niet gelinkt.
Fix: Verder-lezen-blok met BTW-cluster-links. Owner: Sam (dev)

Patroon SEO-B: geen enkele description in de 150-160-band; schema-kwaliteit varieert sterk — gids-template optrekken naar btw-aangifte-niveau lost F-SEO-028/031/033/034/029 in één keer op.

## Batch SEO-C — 8 gidsen (btw-berekenen t/m factuur-opstellen)
Alle 8: canonical/robots/sitemap correct geverifieerd; H1-hiërarchie foutloos; interne link-targets bestaan (incl. anchor #kor).

### gids/btw-berekenen-terugvragen-zzp — Gelezen: 1-289. VONDSTEN F-SEO-040..042.
### gids/btw-teruggave-zzp — Gelezen: 1-241. VONDSTEN F-SEO-043, 044.
### gids/btw-verleggen-wanneer — Gelezen: 1-245. VONDST F-SEO-044.
### gids/creditnota-maken-zzp — Gelezen: 1-235. VONDST F-SEO-044.
### gids/debiteurenbeheer-zzp — Gelezen: 1-228. VONDST F-SEO-044.
### gids/e-boekhouden-vs-moneybird-vs-boekhoudbaar — Gelezen: 1-279. Article+FAQPage @graph = referentie-implementatie. VONDSTEN F-SEO-043, 045, 046.
### gids/exact-online-stoppen-besparing — Gelezen: 1-307. Article+FAQPage OK. VONDSTEN F-SEO-043, 046, 047.
### gids/factuur-opstellen-zzp — Gelezen: 1-282. VONDSTEN F-SEO-044, 048.

#### F-SEO-040 [LAAG] gids/btw-berekenen:7 — title 73 tekens. Fix: ≤60. Owner: Sam.
#### F-SEO-041 [MIDDEL] gids/btw-berekenen:215-241
Quote: `<section class="faq" aria-label="Veelgestelde vragen">` ... 5× details
Probleem: 5 FAQ-items zonder FAQPage in JSON-LD (32-48) terwijl zusterpagina's het patroon al hebben.
Fix: FAQPage-blok toevoegen. Owner: Sam (dev)
#### F-SEO-042 [LAAG] alle 8 pagina's — geen enkele twitter:*-tag (OG wel). Fix: gedeelde include. Owner: Sam.
#### F-SEO-043 [MIDDEL] gids/btw-teruggave:7 (+e-boekhouden:7 91 tekens, exact-online:7 86 tekens)
Quote: `<title>BTW-teruggave als ZZP — wanneer krijg je geld terug, wat doe je bij vertraging? | Boekhoudbaar</title>`
Probleem: titles 86-91 tekens — 25+ tekens afgekapt in SERP.
Fix: ≤60 met keyword vooraan. Owner: Sam (dev)
#### F-SEO-044 [MIDDEL] gids/btw-teruggave:31-33 (+btw-verleggen, creditnota, debiteurenbeheer, factuur-opstellen)
Quote: `{"@type":"Article","headline":"BTW-teruggave als ZZP","datePublished":"2026-04-23",...}`
Probleem: 5 pagina's met zichtbare FAQ zonder FAQPage-schema + minimaal Article (geen dateModified/mainEntityOfPage/description) — gemiste rich snippets op 5 pagina's tegelijk.
Fix: FAQPage per pagina + Article op niveau e-boekhouden-pagina. Owner: Sam (dev)
#### F-SEO-045 [MIDDEL] gids/e-boekhouden:228-243
Quote: `<li><a href="/transparantie/">Mijn transparantie-pagina</a>` ...
Probleem: centrale vergelijkpagina linkt niet naar moneybird-alternatief-2026/exact-online-stoppen — topical dead-end in alternatief-cluster (omgekeerde richting bestaat wél). (Sluit aan op F-GAP-007/010.)
Fix: Verder-lezen-blok. Owner: Sam (dev)
#### F-SEO-046 [LAAG] gids/e-boekhouden:63-66 (+exact-online:92-95) — geen font-preconnect/fonts-link/CF-beacon (template-drift t.o.v. 6 btw-gidsen). Fix: head harmoniseren. Owner: Sam.
#### F-SEO-047 [LAAG] gids/exact-online:8 — description ~197 tekens. Fix: ≤160 met cijfer-hook vooraan. Owner: Sam.
#### F-SEO-048 [LAAG] gids/factuur-opstellen:108-120 — "11 verplichte velden"-ol zonder ItemList/HowTo-schema. Fix: overwegen. Owner: Sam.

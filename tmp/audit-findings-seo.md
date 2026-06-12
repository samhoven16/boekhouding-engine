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

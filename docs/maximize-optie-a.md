# Optie A maximaliseren naar 10 — uitvoer-roadmap

> Bron: 5 parallelle audit-specialisten (onboarding-doorloop, friction-killer-
> onverified-scherm, SEO, lange-termijn+update-gemak, self-service), 2026-06-16.
> Randvoorwaarde: **copy-template blijft** — geen verkapte add-on/web-app.
> Doel: de gewogen matrix-score van A (nu 7.5) naar het haalbare plafond (~9.5).

Status-legenda: ⬜ todo · 🔧 in uitvoering · ✅ klaar

---

## Batch 1 — Onboarding & onverified-scherm (as 4 → ~9, gewicht 5) — GROOTSTE HEFBOOM

- ⬜ **B1.1** "Ga naar Boekhoudbaar (onveilig)"-link standaard zichtbaar (niet achter toggle/`display:none`) op `/start` + `/bedankt`, zodat de klant beide klikken meteen ziet. `website/start/index.html`, `website/bedankt/index.html`
- ⬜ **B1.2** Recovery-URL `boekhoudbaar.nl/onveilig` (redirect → `/start` met `?tpl`) + verwijzen op alle prep-plekken. `website/onveilig/` (nieuw), `website/_redirects`
- ⬜ **B1.3** Mobiele instructie op de scherm-stap ("op telefoon staat de grote knop onder je duim — zoek het kleine grijze Geavanceerd"). `website/start/index.html`
- ⬜ **B1.4** Copy robuust tegen knoptekst/volgorde-variatie ("exacte woorden/volgorde kunnen iets afwijken — zoek het kleine grijze Geavanceerd, niet de grote knop"). `start`, `bedankt`, mail
- ⬜ **B1.5** Valse belofte "Apple/Google Pay" schrappen (`/kopen` belooft, Mollie biedt enkel iDEAL/creditcard/Bancontact). `website/kopen/index.html:44`
- ⬜ **B1.6** Tijd-belofte gelijktrekken: "2 minuten" (`/bedankt`) vs "5 minuten" (`Code.gs:1318`) → één getal; "90% struikelt" herformuleren naar geruststelling. `website/bedankt/index.html:114`, `licence-server/Code.gs:1318`
- ⬜ **B1.7** Welkomstmail consistent: subject mét 🚀 ook op MailApp-fallback (`Code.gs:1925`); één afzendernaam in welkomst- én OTP-mail (`Code.gs:1741`, `:893`)
- ⬜ **B1.8** Volgorde-conflict `bedanktPagina_` (4 stappen) ↔ `/start` (3 stappen) oplossen. `licence-server/Code.gs:1318-1330`

## Batch 2 — Self-service (verlaagt support, helpt onboarding + lange termijn)

- ⬜ **B2.1** `setNote` (+ `setDataValidation`) op de verwarrendste instelcellen: KOR, BTW-aangifteperiode, Standaard BTW-tarief, Bankrekening. Hoogste ROI — voorkomt fout-configuratie aan de bron. `src/Setup.gs:722`
- ⬜ **B2.2** In-app `Hulpcenter` uitbreiden: categorie "Wat betekent…?" (grootboekrekening, journaalpost, debet/credit) + "Er ging iets mis" (balans klopt niet → Gezondheidscheck, creditnota, klant betaalt niet) + link naar `/faq`. `src/Assistent.gs:30`
- ⬜ **B2.3** Website-FAQ +3 vragen: account gehackt (2FA), "3 weken op vakantie?" (90d grace), privé→zakelijk/gemengd gebruik. `website/faq/index.html`
- ⬜ **B2.4** Mollie-kosten consistent (~€0,29/transactie overal of overal alleen de link). `website/faq`, `src/Mollie.gs:31`
- ⬜ **B2.5** Help-tab-sectie hernoemen "Licentie-server onbereikbaar?" → "Werkt het op vakantie / zonder internet?". `src/HelpTab.gs:169`

## Batch 3 — Website / SEO (as 6 → ~9, gewicht 2)

- ⬜ **B3.1** Canonical → finale-200-URL mét slash op `/privacy`, `/voorwaarden`, `/transparantie`. (canonical→redirect-keten weg)
- ⬜ **B3.2** Sitemap: `/continuiteit/`, `/adverteren/`, `/update/`, `/tools/besparing/` toevoegen. `website/sitemap.xml`
- ⬜ **B3.3** `/landing.html /landing 301` in `_redirects` (duplicate-content weg).
- ⬜ **B3.4** FAQ JSON-LD verifiëren/repareren: `&quot;` binnen strings = mogelijk ongeldige JSON → heel FAQPage-blok dood. `website/faq/index.html:40`
- ⬜ **B3.5** Homepage-title 71 → ~58 tekens; `/faq` "30+" claim ↔ 16 vragen gelijktrekken.
- ⬜ **B3.6** `/vergelijking` `Product`/`Offer`-schema (price-snippet op de sterkste conversiepagina).

## Batch 4 — Betrouwbaarheid & lange termijn (as 8 → 10, gewicht 3)

- ⬜ **B4.1** ⚠️ Hard breekpunt: ScriptProperties-cleanup VÓÓR de dure proof/health-taken in `dagelijkseTaken()` (budget-guard skipt cleanup nu structureel op meerjaren-sheet → 500KB-cap → klant kan niet meer factureren). Pure volgorde-fix. `src/Triggers.gs:1633-1684` vóór `:1568-1617`
- ⬜ **B4.2** Changelog-drift: 2.7.0-entry + guard-test die faalt als `HUIDIGE_VERSIE` geen changelog-entry heeft. `src/Changelog.gs`, `src/Onboarding.gs:15`
- ⬜ **B4.3** Server-onafhankelijke abandoned-mode-instructie in de sheet zelf (hoe zet je `LICENTIE_GRACE_DAGEN` op 3650 + GitHub-bundle ophalen zonder server). `src/Onboarding.gs` (`toonHoeUpdateIk`)

## Batch 5 — Onboarding-polish (kleinere 🟡's)

- ⬜ **B5.1** Spinner in activatie-stap-3 ("wordt ingericht…" leeft nu niet). `src/Licentie.gs:430`
- ⬜ **B5.2** Debug-teller "recalc #N" → rustige tekst in factuur-dialoog. `src/NieuweBoeking.gs:524`
- ⬜ **B5.3** Welkom-modal: stap 1 (Bedrijfsgegevens) visueel primair; "Fiscaal profiel" naar later. `src/Onboarding.gs:696`
- ⬜ **B5.4** Factuur-verzonden: bij Gmail-fout actionable melding; bij succes vervolg-CTA. `src/NieuweBoeking.gs:1037`
- ⬜ **B5.5** Na activatie actief tabblad → Dashboard i.p.v. ruwe datatabel. `src/Licentie.gs`/`setup()`

## Jouw acties (geen code)
- 📹 15-sec scherm-GIF van je eigen flow t/m de Geavanceerd-klik → ik bouw de plek; jij dropt 'm in (B1, #1-impact).
- ⚙️ Ops: `TEMPLATE_SS_ID` gezet + master op "Iedereen met de link → Kijker" vóór livegang (anders: betaald, geen mail).

## Plafond-eerlijkheid
Twee assen kunnen zonder B geen 10: "geen onverified-scherm" (blijft; wordt frictieloos → ~9) en "centrale updates" (klant updatet zelf → ~8). Rest gaat naar 10. Gewogen plafond ≈ 9.5.

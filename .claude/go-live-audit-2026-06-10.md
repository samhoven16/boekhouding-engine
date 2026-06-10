# Go-live audit — 10 juni 2026

> Uitvoering van `.claude/go-live-protocol.md`. Twaalf parallelle audits, geconsolideerd.
> Status-legenda: ✅ gefixt in deze ronde · 🔧 fix gepland (PR #275) · 📋 backlog · ⚠️ vereist Sam-beslissing of externe verificatie

## Eindbeeld per as

| As | Verdict | Blockers | Hoog |
|----|---------|----------|------|
| Fiscale compliance | 🛑 blokkeer | 2 | 3 |
| GAS-runtime | 🛑 blokkeer | 3 | 3 |
| Cross-PR-regressie | ⚠️ zorgen | 1 | 1 |
| Accountant/Belastingdienst | 🛑 zakt bij strikte controle | 2 | 3 |
| Security (red-team) | ⚠️ zorgen | 0 | 3 |
| SEO | 🛑 onvindbaar buiten merknaam | 2 | 3 |
| Positionering | ⚠️ zorgen | 1 (2 dlg) | 3 |
| Klantreis | ⚠️ zorgen | 0 | 3 |
| Customer voice | 🛑 blokkeer | 0 | 2 |
| Documentatie | ⚠️ zorgen | 0 | 4 |
| 5+ jaar onderhoud | ⚠️ zorgen | 2 (architectuur) | 3 |
| Content-gaps | ⚠️ zorgen | — | — |

---

## BLOCKERS (fixen vóór go-live)

### Code (.gs)

| # | Bevinding | Locatie | Status |
|---|-----------|---------|--------|
| B1 | I₅-verifier leest `a.r5d` dat nooit gezet wordt → vals "inconsistent"-alarm bij elke aangifte met saldo ≠ 0 | `BTW.gs:337` ↔ `FormeelBewijs.gs:307` | ✅ gefixt (PR #275) |
| B2 | `valideerBtwInvariants_` telt `r3a_btw` mee in r5a-som; `berekenBtwAangifte_` en axioma-formule niet — per definitie één fout | `BTW.gs:393` | ✅ gefixt (PR #275) |
| B3 | EU-0%-omzet telt dubbel in pro-rata-noemer (`r1d_nul` + `r3a_grondslag` beide gesommeerd) → onjuiste r5b-aftrek | `BTW.gs:223,230,306-312` | ✅ gefixt (PR #275) |
| B4 | Dunning-cleanup bouwt actieve-set uit kolom 0 (numeriek ID) i.p.v. kolom 1 (factuurnummer) → wist dagelijks alle herinnerings-state → debiteuren-spam + quota-vraat | `Triggers.gs:1880` | ✅ gefixt (PR #275) |
| B5 | Guillotine: one-shot-triggers lekken (cleanup is dode code, cap 20 loopt vol) én hervat-aanroep crasht (event-object i.p.v. `ss`) | `Utils.gs:987,1014-1033`, `Triggers.gs:2237` | ✅ gefixt (PR #275) |
| B6 | XAF-export leest RELATIES met verkeerde kolomindices → relatie-ID als naam, KvK/BTW-nummers ontbreken in auditfile | `XafExport.gs:250-256` | ✅ gefixt (PR #275) |

### Website

| # | Bevinding | Locatie | Status |
|---|-----------|---------|--------|
| B7 | Canonical + sitemap van alle 35 gidsen wijzen naar `/gids/<slug>/` terwijl bestanden plat als `.html` geserveerd worden → content-laag verzwakt/onbereikbaar voor Google. Idem `/gratis` (canonical naar redirect) | `website/gids/*.html`, `sitemap.xml`, `gratis/index.html`, `landing.html` | ✅ gefixt (PR #275) |
| B8 | BV/DGA-tegenstrijdigheid: `/vergelijking/` zegt "Kleine BV werkt wél", homepage-schema declareert "kleine BV" als audience; llms.txt + /en/ + gidsen zeggen het tegendeel. Demo toont DGA-loon en Box 3 als features | `vergelijking/index.html:378`, `index.html` schema, `demo/index.html:693-708` | ✅ gefixt (PR #275) |

---

## HOOG (fixen vóór go-live tenzij expliciet uitgesteld)

| # | Bevinding | Locatie | Status |
|---|-----------|---------|--------|
| H1 | Bedankt-pagina noemt mail-onderwerp dat niet bestaat ("Welkom bij…" vs echte "Je Boekhoudbaar is klaar — activeer nu 🚀") | `bedankt/index.html:136` ↔ `licence-server/Code.gs:1553` | ✅ gefixt (PR #275) |
| H2 | Mollie-redirect gaat naar kale Apps Script-pagina; de 5-stappen-OAuth-walkthrough op `/bedankt/` wordt nooit getoond | `licence-server/Code.gs:520,1123` | ✅ gefixt (PR #275) |
| H3 | "Mogelijke manipulatie gedetecteerd" leest als inbraakalarm bij onschuldige back-up-restore | `BoekingEngine.gs:1011-1016` | ✅ gefixt (PR #275) |
| H4 | Dunning-onderwerp lekt interne teller ("Betalingsherinnering 3/3") naar debiteur van de klant | `Triggers.gs:2271` | ✅ gefixt (PR #275) |
| H5 | Kapotte homepage-link naar niet-bestaande gids | `index.html:1829` → `/gids/boeking-corrigeren.html` | ✅ gefixt (PR #275) |
| H6 | Trigger-bronnen divergeren: SelfHeal kent 4 van de 6+ triggers en kan week-/maand-/BTW-triggers wissen bij sanitize | `Hygiene.gs:80-85` ↔ `Setup.gs:1232-1285`, `BTWReminder.gs:158` | ✅ gefixt (PR #275) |
| H7 | Fortress hasht/vergrendelt `_Audit_Anchor` + AUDIT_LOG → dagelijkse append = drift-alarm of stille faal | `Fortress.gs:131,213-214,253-265` | ✅ gefixt (PR #275) |
| H8 | Chargeback-fraude: expliciete server-revoke wordt client-side niet onthouden → 90 dagen gratis door offline-grace. NB: grace zelf NIET verkorten (zie H10) | `src/Licentie.gs:240,868-895` | ✅ gefixt (PR #275) |
| H9 | `checkActivationCap_` is dode code; sleutel-rotatie maakt onbeperkt kopieën per betaalde licentie | `licence-server/Code.gs:2218,1949` | ✅ gefixt (PR #275) |
| H10 | Licentie-gate verbergt het héle menu incl. data-export na grace → klant kan eigen data niet meer uit (anti-lock-in-belofte gebroken) | `Menu.gs:14-24` | ✅ gefixt (PR #275) |
| H11 | Admin-wachtwoord via GET-URL (history/log-lek); geen audit-log van geslaagde login | `licence-server/Code.gs:1268-1280` | 📋 POST-login |
| H12 | Accountantspakket bevat geen XAF; LEESMIJ belooft importeerbaarheid die de CSV's niet bieden | `ExportAccountant.gs:64-91` | ✅ gefixt (PR #275) |
| H13 | Twee factuurnummer-formaten naast elkaar (`F000001` hoofdpad vs `F1` legacy-pad) — art. 35 Wet OB | `Triggers.gs:628` vs `:1300` | ✅ gefixt (PR #275) |
| H14 | Audit-log = roterende buffer van 100 regels; 7-jaar belofte niet waargemaakt (er is wél een anchor-tab, geen event-log) | `BoekingEngine.gs:868-873` | 📋 append-only event-log naar sheet |
| H15 | KIA-staffelwaarden (19.769/130.744) wijken af van geverifieerde set (19.535/129.194); officiële bron gaf 403 | `Belastingadvies.gs:304-306` | ⚠️ verifieer Belastingdienst.nl vóór go-live; NIET gegokt aangepast |
| H16 | MIA als bevestigde aftrek meegerekend zonder RVO-meldings-voorwaarde → naheffingsrisico | `Belastingadvies.gs:1151-1161` | 📋 voorwaardelijke TIP maken |
| H17 | Pro-rata-aftrek wordt silently toegepast zonder klant-keuze | `BTW.gs:289-334` | 📋 expliciete bevestiging |
| H18 | Logo verbruikt tot 200KB van 500KB properties-budget | `Branding.gs:99-117` | 📋 naar Drive-bestand |
| H19 | `dagelijkseTaken` leest VERKOOPFACTUREN ≥3× volledig per run | `Triggers.gs:1751-1869` | 📋 één read doorgeven |
| H20 | Geen telefoon-verwachtingsmanagement (support is e-mail-only, staat nergens) | `faq/`, `kopen/` | ✅ gefixt (PR #275) |
| H21 | `/functies/` title + H1 zonder enig keyword (prioriteit-0.9-pagina) | `functies/index.html:7,197` | ✅ gefixt (PR #275) |
| H22 | Keyword-kannibalisatie homepage ↔ `/landing` ↔ gids op hoofdkoopterm | `landing.html` | 📋 herpositioneren |
| H23 | FAQ-gaten die gegarandeerd paniekmails worden: account-wissel-lockout, "betaald maar geen mail", "e-mail mislukt"-vervolgactie, BTW-diagnose-stappenplan | `faq/index.html`, `BoekingEngine.gs:380` | ✅ gefixt (PR #275) |
| H24 | Landing-page mist starter-signaal + zichtbare GitHub/broncode-link (Sara's trust-anker) | `landing.html`, `index.html` | 📋 |

## MIDDEL/LAAG — backlog (her-beoordelen volgende audit)

- `_icpVereist`/`r3a_grondslag` geproduceerd maar geen consument (ICP-rapport bestaat niet) — cross-PR M3
- `fortressIntegriteitCheck_` dode code, docstring claimt callers — cross-PR M4
- `_Audit_Anchor` niet in tab-herstel-set; throttle-property kan desyncen — cross-PR M5
- Voorbelasting r5b zonder bijlage-check (eigen TODO) — accountant M6
- `updateGrootboekSaldo_` stille drift bij onbekende rekening — accountant M7
- Heropen-historie cap 15 entries — accountant M8
- XAF `accTp`-heuristiek i.p.v. GROOTBOEKSCHEMA-kolom — accountant L9
- Saldibalans-blok in accountants-samenvatting — accountant L10
- Mollie-webhook zonder eigen-checkout-marker; partiële-refund-drempel; API fail-open zonder sleutel; Brevo-bounce kan licentie bricken; rate-limit fail-open — security M4-M8/L10
- Onboarding-mail: Google-account-stap onvoorwaardelijk; refresh-instructie (Ctrl+R) voor stap 3; refund-formulering bedankt vs FAQ; Moneybird-voorbehoud (geen recurring) in dialoog; spraak-knop-belofte; export-menu verstopt — klantreis M4-M10
- "we/wij"-personificatie welkom/activatie/BTW-mail; AI-feature drie namen; menu-pad-citaten; "laatste herinnering" loze dreiging — voice M3-L10
- Besparing per aftrekpost ~12,7% te hoog (MKB-vrijstelling); hardcoded "28%"-string; r2a nooit gevuld — tax M6-L8
- BankImport per-match roundtrips; dunning-PDF per herinnering — runtime M7/L10
- Gidsen onderling nauwelijks gelinkt ("Lees ook"-blok); aggregateRating pas bij echte reviews; sitemap genereren uit filesystem — SEO M6-L10
- Transactie-limiet inconsistent (>500 vs >100/mnd); OSS/IOSS alleen diep in FAQ; "niet voor wie"-strook homepage — positionering H3/M6/M7 (H3 deels in B8-fix)
- FAQ-items: nieuw boekjaar, verborgen kosten, offline-grace, backup-locatie — documentatie M5-L10
- AOW-leeftijd 2028-cohort; Mollie/KvK/Gemini-API-versies overschrijfbaar maken; Gemini-default uit config; schemaVersie in config-blobs; VERKOOPFACTUREN-scan indexeren — onderhoud M4-L10
- Content: Zvw-gids, boekhouder-kosten-gids, foutherstel-cluster (balans/BTW-correctie/privé-storting/factuurnummer), werkruimte, ICP-gids, Moneybird-export-gids — content-gaps 1-10

## Architectuur-beslissingen voor Sam (⚠️ niet eenzijdig te fixen)

1. **Distributiemodel**: geen centraal code-push-pad naar klant-kopieën. Mitigatie nu: alles breekbaars data-driven via config-endpoint. Structureel: library/proxy-architectuur — aparte beslissing.
2. **Bus-factor**: domein, Mollie, Brevo, admin-mail hangen aan één persoon. Advies: dead-man-switch (default lange grace + gedeponeerd toegangsdocument).
3. **Immutability-claim**: sheets zijn voor de eigenaar bewerkbaar; verdediging = hash-keten + snapshots (tamper-evident). Communiceer dat zo; lever hash-verificatie mee in de controle-export.
4. **KIA 2026-waarden** (H15): handmatig verifiëren op belastingdienst.nl — automatische bronnen geven 403.

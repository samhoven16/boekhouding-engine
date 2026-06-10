# Meerjaren-audit — 10 juni 2026

> Vier parallelle audits onder de aanname dat alles uit `go-live-audit-2026-06-10.md`
> gefixt en gedeployd is. Vraag: wat gaat er in jaar 2-5 fout, wat raakt obsoleet,
> wat doen we nu dat over 3 jaar overbodig is, wat groeit zonder bovengrens, en
> waar maken we de klantervaring nog mooier?

## Status-legenda
✅ gefixt in deze ronde · 🔧 te fixen (kies uit batch hieronder) · 📋 backlog · ⚠️ vereist beslissing

## Eindbeeld per as

| As | Verdict | Blockers/HOOG | Eerste klant-impact |
|----|---------|---------------|---------------------|
| Schaal-runtime (5j volume) | 🛑 blokkeer | 4 / 4 | Jaar 2 al voor drukke klant |
| Jaar 2-5 self-service | ⚠️ zorgen | 0 / 7 | Vanaf jaar 2 (accountant-overdracht) |
| Jaar 2-5 klantreis | ⚠️ zorgen | 0 / 7 | Acuut (stub zichtbaar) + vanaf jaar 1→2 |
| 5-jaar drift/obsoleescentie | ⚠️ zorgen | 0 / 9 | Vanaf eind 2026 (Prinsjesdag) en 2027 (KvK/Gemini) |

---

## BLOCKERS / HOOG met actieve productieschade

### Schaal-runtime

| # | Bevinding | Locatie | Status |
|---|-----------|---------|--------|
| S1 | `herberekeningGrootboekSaldi`: O(N×M), 20M cell-reads bij 50k journaalposten → timeout halverwege → balans *kapot* in plaats van gerepareerd. Wordt aanbevolen door `controleerBalansStrikt_`. | `Boekingen.gs:421` + `:323` | ✅ in-memory aggregatie + één batch-write |
| S2 | `vernieuwDashboard()` synchroon in elke factuur-/inkoop-/bank-submit. Bij jaar 3 (5k VF + 8k IF + 50k JP): 30-60s spinner per submit; batch-import raakt 6-min-cap binnen ~10 facturen. | `Triggers.gs:1383,1481,1552,1636`, `Boekingen.gs:668`, `Bankboek.gs:225`, `Inkoopfacturen.gs:95` | 🔧 invalideer-snapshot + lazy render |
| S3 | `getFactuurlijstData()` retourneert ALLE rijen naar de browser (1-2MB JSON bij 5k facturen) → 10-30s lege modal + DOM-jank | `Verkoopfacturen.gs:888-957` | 🔧 default-filter "open/vervallen" + paginatie |
| S4 | 10 invarianten in `dagelijkseTaken` doen elk hun eigen volledige JP-read (50k × 10 = 500k cells, 30-60s) | `FormeelBewijs.gs:160,192,412` | 🔧 1× lezen, doorgeven |
| S5 | `_BTW_SNAPSHOTS` als één JSON-property zonder rotatie nadert 9KB/key-cap rond jaar 5-6; bij overschrijding faalt `setProperty` stil → suppletie-detectie ziet nieuwe periodes niet | `BTW.gs:733` | 🔧 verplaatsen naar verborgen `_BTW_HISTORIE`-tab |
| S6 | Per-form-submit volledige VF-read voor duplicate-detectie (O(N), ~110k cells bij 5k facturen) | `Triggers.gs:658` | 🔧 index-tab `_VF_NUMMER_INDEX` |
| S7 | `haalRelatieEmail_` in dunning-loop: per factuur eigen RELATIES-read | `Triggers.gs:2266,2543,2607` | 🔧 één map vóór de loop |
| S8 | Audit-hash-keten HARD_CAP 5000 wint van 7-jaars bewaarplicht bij hoog-volume klant (bekend uit go-live-audit H14, hier specifiek voor schaal) | `Triggers.gs:244,404` | 📋 zie H14 |

### Klantreis jaar 2-5

| # | Bevinding | Locatie | Status |
|---|-----------|---------|--------|
| K1 | `toonStakingsWizard` was zichtbare stub ("Voor nu: documenteer via alert") — exact het moment dat de klant het product eindbeoordeelt | `Fiscaal.gs:213-227` | ✅ vervangen door 4-punts checklist (stakingsbalans / stakingsaftrek / FOR / laatste BTW), config-driven |
| K2 | Jaarwisseling 1→2: prompt is modal i.p.v. banner; geen pre-flight check op concepten/Q4-BTW; tekst "BTW-rapporten kloppen niet meer" leest als acuut datavolume-risico | `DriveStructuur.gs:494-510` | 🔧 banner + pre-flight |
| K3 | Accountant opent gedeelde sheet → popup-storm (trigger-watchdog, SelfHeal, jaarwisseling, changelog, gesloten-periode). Eerste 30s = chaos. | `Menu.gs:36-89` | 🔧 detect non-owner viewer; skip proactive popups |
| K4 | "Controle & Export"-menu is engineering-changelog-volgorde, niet professionele workflow | `Menu.gs:179-207` | 🔧 herorden: XAF + accountantspakket + audit-keten bovenaan |
| K5 | Kopie-vergrendeling geeft geen self-service rebind → elke account-wissel = supportmail | `Licentie.gs:209-251` | 🔧 "Dit is mijn originele sheet — rebind"-knop met OTP |
| K6 | Comeback na 6 maanden: melding "licentie kan al 187 dagen niet geverifieerd worden" zonder comeback-pad (klant denkt: opnieuw kopen) | `Licentie.gs:875-902` | 🔧 herformuleren + direct revalideren |
| K7 | Comeback laat 6 maanden herhalende kosten zonder waarschuwing tegelijk boeken | `HerhalendeKosten.gs` | 🔧 drempel >2 maanden → bevestigingsmodal |

### 5-jaar drift / obsoleescentie

| # | Bevinding | Bijt | Locatie | Status |
|---|-----------|------|---------|--------|
| D1 | Licentieserver-dood: `drip_*`-ScriptProperty-keys nooit opgeruimd → bij ~5.000 cum. klanten 500KB-quotum vol → server kan geen activaties meer schrijven (cascade: bestaande klanten verlopen in offline-grace) | 2028 | `licence-server/Code.gs:2350` | ✅ cleanup-pad in `verstuurDripsDagelijks_` (drempel = laatste drip + 14d) |
| D2 | `getVersieInfo` returneert hardcoded `'2.0.0'` / `'2026'` terwijl `HUIDIGE_VERSIE = '2.7.0'` — Diagnostiek liegt | direct | `Utils.gs:721` | ✅ runtime gelezen uit `HUIDIGE_VERSIE` + `new Date().getFullYear()` |
| D3 | `toonJaaroverzicht`-knop "Door naar X" was `new Date().getFullYear()` → in late december was X = terugkijk-jaar | elke dec | `Engagement.gs:265,318` | ✅ `vorigJaar + 1` |
| D4 | Tarieven-config-endpoint bestaat, maar wordt gebruikt als fallback i.p.v. primaire route. Bij Prinsjesdag 2026 zonder script-deploy → elke klant per 1-1-2027 stille fallback naar 2026-tarieven | sep-2026 | `Belastingadvies.gs:243-247`, `Licentie.gs:639` | ⚠️ proces-beslissing voor Sam: maak config-endpoint de primaire route en documenteer in RUNBOOK |
| D5 | KvK API v2 in onderhoudsmodus sinds 2024; v3 (Handelsregister API) verplicht 2027 | 2027 | `Utils.gs:1481,1521` | 🔧 endpoint achter `KVK_API_BASE`-property |
| D6 | `gemini-2.5-flash` op `v1beta` — `2.0-flash` ging EOL op 2026-06-01; verwacht zelfde cyclus voor `2.5-flash` | 2027 | `BoekingEngine.gs:529,630,783` | 🔧 dynamische model-resolver met fallback-cache |
| D7 | Mollie `/v2/payments` + Brevo `/v3/smtp/email` API-versies hardcoded — geen overschrijfbaar pad bij toekomstige migratie | 2027+ | `Mollie.gs:18`, `licence-server/Code.gs:2409` | 🔧 `MOLLIE_API_BASE` + Brevo-base als ScriptProperty |
| D8 | Migraties 2.0→2.1 en 2.1→2.6 zijn dood (geen klant ooit van die versies geweest; eerste publieke release is 2.7.0) — draaien voor altijd | continu | `Onboarding.gs:633-660` | 🔧 archiveren + `MIN_MIGRATIE_VAN = '2.7.0'` |
| D9 | Drip-mails copy bevat hardcoded BTW-percentages ("21% standaard, 9% catering") en data-export-format-belofte (ZIP met PDF+XLSX+JSONL) | 2027+ | `licence-server/Code.gs:2301-2495` | 🔧 dynamisch uit config |

### Self-service jaar 2-5 (documentatie)

| # | Bevinding | Status |
|---|-----------|--------|
| J1 | Fiscaal-partner-FAQ ontbrak (gegarandeerde supportmail) | ✅ FAQ-item toegevoegd |
| J2 | Eenmanszaak-overdracht aan opvolger niet gedocumenteerd | ✅ FAQ-item met 3-stappen-route (staking-checklist + Drive-eigenaar-wissel + licentie meegaat met sheet-ID) |
| J3 | "Boekhoudbaar verlaten"-gids ontbreekt — alleen Moneybird-*import*, geen export-gids → anti-lock-in-USP onbewezen | 📋 nieuwe gids `/gids/boekhoudbaar-verlaten/` |
| J4 | KIA / IB-correctie uit eerder jaar = afgrond (klant denkt product mist aftrek) | 📋 FAQ + link naar ambtshalve vermindering |
| J5 | KOR-grens-overschrijding stopt halverwege ("u moet BTW berekenen" maar niet wat met reeds-KOR-facturen of 3-jaars-vergrendeling) | 📋 tekst uitbreiden in `BTW.gs:803` + `/gids/kor-grens-overschreden/` |
| J6 | Bezwaarpost-bouwen heeft geen knop én geen gids terwijl 7-jaar-bewaarplicht-USP daar moet bewijzen | 📋 menu-item "Export voor bezwaarschrift" |
| J7 | XAF→Twinfield-aanlever-instructie ontbreekt | 📋 one-pager + LEESMIJ-update |
| J8 | Sabbatical/pauze-flow: geen "slaapstand", geen nihil-aangifte-uitleg | 📋 FAQ + optionele "passief"-modus |
| J9 | Factuur-customisatie-plafond niet expliciet (logo + 1 kleur is alles) | 📋 FAQ + tabel wat wel/niet kan |
| J10 | `/continuiteit/` mist "wat als KLANT stopt"-spiegel | 📋 spiegel-blok |

---

## Polish-laag (goedkoop, hoog-impact voor terugkerende klant)

| # | Voorstel | Locatie | Status |
|---|----------|---------|--------|
| P1 | Na geslaagde BTW-aangifte: 4-sec toast "Q2 2026 gemarkeerd. Volgende deadline: 31 jul. We herinneren je 7 dagen vooraf." | `BTW.gs` post-aangifte | 📋 |
| P2 | Na backup-aanmaak: bestandsgrootte in groen + checkmark | `ExportAccountant.gs:328` | 📋 |
| P3 | Jaarafsluiting-modal: "Doorgaan?" → 2 knoppen "Ja, sluit X af" + "Nee, ik wil eerst nog…" | `Jaarafsluiting.gs` | 📋 |
| P4 | Accountantspakket succes-alert: "Kopieer Drive-link"-knop | `ExportAccountant.gs:98-105` | 📋 |
| P5 | Eerste open na 365 dagen sinds SETUP_DONE: jubileum-toast "🎉 1 jaar Boekhoudbaar — X facturen, Y kosten" | `Menu.gs:onOpen` | 📋 |
| P6 | KOR-overschrijdingsbericht: weg met "❗" + caps → rustig: "Je omzet komt boven de KOR-grens van €20.000. Drie dingen om nu te regelen: …" | `BTW.gs:803` | 📋 |
| P7 | LEESMIJ accountantspakket: "RGS-NL · Dubbel boekhouden · XAF 3.2 · SHA-256 audit-keten" als één-regel-stempel bovenaan | `ExportAccountant.gs:284` | 📋 |
| P8 | Symmetrie-menu: "🦅 Migreer vanuit Moneybird" → voeg "🦅 Exporteer (Moneybird/Exact/Twinfield-klaar)" toe (roept `exporteerAlleData` aan met instructie-popup) | `Menu.gs:280` | 📋 |
| P9 | AI bon-scan ontdekkings-toast: na X handmatige bon-uploads één keer "Wist je dat de AI deze bon ook had kunnen lezen?" | `Menu.gs` / `AIConfig.gs` | 📋 |
| P10 | "Verder lezen"-blokken in elke gids reviewen op jaar-2+-paden (staken, KOR-overschrijden, exit, sabbatical) | `website/gids/*/` | 📋 |

---

## Sam-handwerk dat met klantvolume meegroeit zonder schaalvoordeel

| # | Wat | Bijt | Status |
|---|-----|------|--------|
| H1 | `GLOBAL_BERICHT` is één string, geen versionering/targeting/expiry → bij scale wordt dit Sam's enige communicatiemiddel | direct, escaleert 2027 | 📋 JSON-format met `{id, severity, audience, expiry, message}` |
| H2 | NPS-detractors + álle FATAL's mailen Sam real-time → bij 1k klanten = 2k mails/jr alleen hieruit | 2027-Q1 | 📋 owner-digest dagelijks i.p.v. real-time |
| H3 | Refund-flow vereist Sam-actie via admin-paneel → bij 1k klanten × 5% = 50 mans/maand | 2027 | 📋 self-service refund-binnen-14-dagen via Mollie refund-API + auto-revoke |
| H4 | Owner-alerts ongelimiteerd per klant → één defecte klant kan Sam met 100×/dag spammen | 2028 | 📋 throttle max 1 owner-alert per klant per 24u |
| H5 | Drip-mails bij 1k nieuwe klanten/maand × 4 mails = 4000 outbound — Brevo free-tier (300/dag) loopt vol | 2027+ | 📋 hard-stop + cleanup gekoppeld aan D1 (✅) |

---

## Dependency-monitoring (handmatige periodieke check voor Sam)

Tarieven die elke Prinsjesdag (3e dinsdag september) verifiëren en per 1 januari deployen — bij voorkeur via config-endpoint zodra D4 geregeld is. Allemaal in `src/Belastingadvies.gs`:

| Variabele | Frequentie wijziging |
|-----------|---------------------|
| `ZELFSTANDIGENAFTREK`, `STARTERSAFTREK`, `STAKINGSAFTREK`, `MKB_WINSTVRIJSTELLING`, `FOR_MAX` | jaarlijks |
| `LIJFRENTE_MAX`, `LIJFRENTE_FACTOR_A`, `AOW_FRANCHISE` | jaarlijks |
| `AOW_LEEFTIJD` | sprong 2028 (67+3m) en 2029 (67+6m) — al gemarkeerd in audit |
| `BOX3_GROEN_VRIJSTELLING`, `BOX3_HEFFINGSVRIJ`, `BOX3_FORFAIT_BELEGGING`, `BOX3_FORFAIT_SPAAR`, `BOX3_TARIEF` | jaarlijks |
| `IB_SCHIJVEN` + AOW-variant | jaarlijks |
| `HEFFINGSKORTING_*`, `ARBEIDSKORTING_*`, `ZVW_PCT`, `ZVW_MAX_INKOMEN` | jaarlijks |
| `WBSO_*`, `EIA_*` | jaarlijks |
| `KIA_*`-staffel | jaarlijks (vandaag op definitief 2026) |
| `LOGIES_BTW_PCT`, `KILOMETERVERGOEDING`, `THUISWERK_PER_DAG` | onregelmatig |
| `DGA_MIN_SALARIS`, `BOX2_*` | onregelmatig (niet primaire doelgroep) |

Externe API's die zelfstandig veranderen — zet alle drie achter een ScriptProperty (D5/D6/D7):
- Mollie `api.mollie.com/v2` — geen v3 publiek, maar header-based partial changes (iDEAL 2.0 in 2025)
- KvK `api.kvk.nl/api/v2/zoeken` — v3 (Handelsregister API) loopt, verwacht verplicht in 2027
- Gemini `v1beta` + model-string — verwacht 18-maands EOL-cyclus per model
- Brevo `api.brevo.com/v3/smtp/email` — stabiel maar zelfde principe
- Google Forms-API — in "maintenance", container-bound forms blijven werken

---

## Architectuur-keuzes voor Sam (⚠️ niet eenzijdig)

1. **Dashboard async maken (S2)**: vervang `vernieuwDashboard()` in elke submit door `invalideerKpiSnapshot_()`; lazy render bij sidebar-open en dagelijkse trigger. Dit raakt 7 hot-path-call-sites. Eenmalige bouw, daarna 5× snellere submits.
2. **Factuurlijst paginatie (S3)**: vereist dialog-HTML aanpassen. Geen breaking change, wel een product-beslissing over default-filter.
3. **Tarieven via config-endpoint primair (D4)**: vereist dat Sam in de licence-server jaarlijks rond Prinsjesdag de tarieven inklikt. Document deze workflow in `RUNBOOK.md` zodat een opvolger het ook kan.
4. **Self-service refund (H3)**: marketing-belofte ("geen lock-in") past 1-op-1; vereist beslissing over fraude-grens.

---

## In deze ronde gefixt — samenvatting

- **S1**: balans-herberekening O(N×M) → in-memory + één batch-write (was actieve productieschade)
- **D1**: drip-key-cleanup op licence-server (was 2028-quotumdood)
- **D2**: versie-info liegt niet meer in Diagnostiek
- **D3**: jaaroverzicht-knop off-by-one in late december
- **K1**: stakings-wizard-stub vervangen door echte checklist
- **J1, J2**: twee FAQ-items (fiscaal partner + bedrijfsoverdracht aan opvolger)
- Plus regressietest-bestand `tests/unit/meerjaren-audit-fixes.test.js` (16 assertions)

Suite: 2191/2191 groen.

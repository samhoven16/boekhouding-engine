# Meerjaren-audit — 10 juni 2026

> Vervolg op `.claude/go-live-audit-2026-06-10.md` (die geldt als afgerond).
> Vraagstelling: simuleer 2-5 jaar live. Wat werkt, wat is overbodig, wat mist,
> wat kan beter/efficiënter/sneller/goedkoper, en hoe wordt de klantervaring mooier?
> Vier audits: 5-jaar drift (D), schaal-runtime (S), jaar 2-5 klantreis (K), late-jaar self-service (J).

## Antwoord op de kernvragen

### Wat werkt (niet aankomen)
- Continuïteits-verhaal bij Sam-uitval: /continuiteit/ + publiek RUNBOOK + 90-dagen grace — het enige jaar-2+-scenario dat volledig zelfredzaam is (J9)
- Belastingtarieven-architectuur: per-jaar cohorten, fallback-vlaggen, klant-overrides, config-endpoint bestaat al — alleen nog operationeel maken (D-top1)
- KPI-snapshot-cache, dedup-keys met TTL bij bankimport, GFS-backup-retentie — de juiste patronen bestaan al in de codebase; ze moeten alleen overal toegepast worden

### Wat is overbodig (opruimen)
- Migraties 2.0→2.1 / 2.1→2.6 voor versies die nooit publiek waren — draaien voor eeuwig mee bij elke install (D1.1, D5.1)
- Backup-folder-rename-fallback voor pre-cycle-95 klanten (D5.3); FATAL-throttle-cleanup voor één pre-launch-bug (D5.4)
- "Onboarded op"-reparatie-logica voor pre-juni-2026-klanten — verwijderbaar per medio 2027 (D5.2)
- Versie-literal `2.0.0` in Utils.gs:719 die liegt t.o.v. HUIDIGE_VERSIE 2.7.0 (D1.2)

### Wat mist (bouwen)
- "Boekhoudbaar verlaten"-gids — de anti-lock-in-USP heeft een import maar geen exit-pad (J1)
- Stakings-wizard is een zichtbare stub met de tekst "Voor nu: documenteer via alert" (K9) + overdracht-aan-opvolger-gids (J2)
- KOR-grens-overschreden-gids: wat met al-verstuurde KOR-facturen, 3-jaars-vergrendeling (J4)
- Bezwaarschrift-export: de bewaarplicht-USP heeft geen knop voor hét moment waarop hij telt (J5)
- Self-service rebind bij kopie-vergrendeling (OTP-knop i.p.v. supportmail) (K7)
- Gast-modus voor de meekijkende accountant (popup-onderdrukking) (K4)

### Wat kan efficiënter/sneller/goedkoper
- De drie schaal-blockers (S1/S2/S7, zie hieronder)
- Owner-digest i.p.v. per-event-mails naar Sam (bij 1.000 klanten: 2.000 mails/jaar) (D4.2)
- Self-service refund binnen 14 dagen via Mollie-API i.p.v. handmatige admin-actie (D4.3)
- GLOBAL_BERICHT met JSON-format (id/severity/audience/expiry) i.p.v. één string (D4.1)

### Hoe wordt de ervaring mooier (polish, elk 5-30 regels)
- Jaar-jubileum-toast ("🎉 1 jaar Boekhoudbaar — {X} facturen, {Y} kosten geboekt") (K15e)
- Na BTW-aangifte: "Q2 gemarkeerd. Volgende deadline 31 jul — we herinneren je 7 dagen vooraf" (K15a)
- Jaarafsluiting: knoppen "Ja, sluit {jaar} af" / "Nee, ik wil eerst nog…" i.p.v. "Doorgaan?" (K15c)
- "Kopieer Drive-link"-knop in accountantspakket-bevestiging (K15d)
- Succes-alert jaarafsluiting eindigt met openingsbalans-geruststelling + archief-link (K2)
- KOR-waarschuwing zonder paniek-toon (geen "❗…!"-stijl) (J-micro1)

---

## TOP-10 prioriteit (over alle vier audits heen)

| # | Bevinding | Bron | Bijt | Fix-kern |
|---|-----------|------|------|----------|
| 1 | `vernieuwDashboard()` synchroon in élke factuur-submit → 30-60s spinner vanaf jaar 2-3; batch-import raakt 6-min-cap | S1 | jaar 2 | vervang door `invalideerKpiSnapshot_()`; render alleen bij dagelijkse trigger + dashboard-open |
| 2 | `herberekeningGrootboekSaldi` = O(N×M): 50k JP × 2 × eigen GB-read per call → timeout met partiële writes; balans wordt júist kapot. Aanbevolen door gezondheidscheck! | S7 | zodra aangeroepen | in-memory `Map<code,saldo>` + één `setValues` (~5s) |
| 3 | Licentieserver `drip_*`-keys nooit opgeruimd → 500KB-quotum vol bij ~5k klanten → geen nieuwe activaties meer, offline-grace-cascade | D2.1+D4.5 | ~2028 | dagelijkse cleanup >60d; drip-state naar sheet-kolom |
| 4 | `getFactuurlijstData()` stuurt alle 5k facturen als 1-2MB JSON naar de modal | S2 | jaar 2-3 | server-side filter (default: open+vervallen) + paginatie |
| 5 | Tarieven-config-endpoint vóór Prinsjesdag 2026 operationeel — anders stille 2026-fallback per 1-1-2027 bij elke klant | D-top1 | 1-1-2027 | `cfg.belastingTarieven[2027]` pushen; route in RUNBOOK |
| 6 | Audit-log hard-cap 5000 wint van 7-jaars bewaarplicht bij hoog-volume klant (verergert H14) | S9 | jaar 1-2 | H14 oppakken: append-only event-log naar sheet |
| 7 | Self-service rebind bij kopie-vergrendeling + Workspace-verhuis-FAQ | K7+K8 | jaar 2 | OTP-knop "dit is mijn originele sheet" in vergrendel-modal |
| 8 | Stakings-wizard-stub zichtbaar voor klant; geen exit-/overdracht-pad (samen met J1/J2/K13) | K9 | jaar 3 | menu-item weg óf 30-regel checklist-modal; exit-gidsen |
| 9 | `dagelijkseTaken`: 10 invariant-checks lezen JP elk apart (~500k cell-reads); samen met suppletie-check en gezondheidscheck richting 6-min-cap → laatste stappen (dlqRetry, noahArk) stil geskipt | S3 | jaar 3-4 | één JP-read per run doorgeven (zelfde patroon als H19) |
| 10 | NoahArk-JSONL: één file van ~25MB/dag bij jaar-5-volume → string-limiet + 750MB Drive in 30 dagen; gratis-Google-klant raakt Drive-cap rond jaar 4 → PDF-creatie faalt stil | S4+S10 | jaar 3-4 | split per sheet; JP-snapshot cap op 2 boekjaren; Drive-quota pre-flight check |

## Overige bevindingen per audit (genummerd, niet herhaald uit go-live-audit)

### D — 5-jaar drift (langlopend-onderhoud)
- D1.3 MIDDEL: drip-mails bevatten hardcoded BTW-percentages → stilletjes fout bij volgende tariefwijziging; uit `BELASTING_PER_JAAR` lezen
- D1.4/D1.5 LAAG: achievements stoppen na jaar 1 (lege trofeeënkast); jaaroverzicht-knop toont verkeerd jaartal in december
- D2.2 HOOG: VERKOOPFACTUREN-tab zonder archief-rotatie; >2 jaar oude facturen naar jaartab
- D2.3/D2.4 MIDDEL: _SYSTEM_LOG-trim-window; NPS-responses cap 50 verliest detractors
- D2.5 MIDDEL: licentie-sheet full-read per drip-run; partitioneer of indexeer
- D3.1 HOOG: KvK API v2 → v3 verwacht 2027; D3.2 HOOG: gemini-2.5-flash EOL-cyclus → dynamische model-resolver; D3.3 MIDDEL: Mollie/Brevo base-URLs property-overschrijfbaar; D3.4/D3.5 LAAG: V8-runtime-documentatie; Forms-API-ping in dagelijkseTaken
- D5.5 LAAG: GDPR-pseudonimisering bewaart paymentId 7 jaar maar heeft geen opruimer ná 7 jaar (vanaf 2033)
- D-As6: ~25 fiscale variabelen die jaarlijks bewegen — volledige Prinsjesdag-checklist staat in het agent-rapport; opnemen in RUNBOOK

### S — schaal-runtime (aanvullend op top-10)
- S5 ZORGEN→BLOKKER jr4: duplicaat-detectie per form-submit leest alle VF-rijen; index-tab of dedup-property met TTL
- S6 ZORGEN jr3: `haalRelatieEmail_` per dunning-factuur een eigen RELATIES-read; map vóór de loop bouwen
- S8 ZORGEN jr5: BTW_SNAPSHOTS-blob nadert 9KB/property-cap; bij overschrijding faalt suppletie-detectie STIL → klant mist 8-weken-termijn. Naar verborgen tab `_BTW_HISTORIE`; idem `*_GEMELD_*`-keys

### K — jaar 2-5 klantreis (aanvullend)
- K1/K2/K3 HOOG/MIDDEL: jaarwisseling — pre-flight check op concepten vóór de YES/NO; succes-alert met openingsbalans-zin; "neem contact op met je accountant"-foutmelding versimpelen
- K5/K6: accountant-menu herordenen ("Voor mijn accountant" bovenaan); LEESMIJ-stempelregel "RGS-NL · XAF 3.2 · SHA-256"
- K10 MIDDEL: KOR aan/uit-toggle met datumprikker + facturen-scan
- K11/K12 MIDDEL: comeback-pad — offline-melding herformuleren + direct hervalideren; herhalende-kosten-inhaal >2 maanden eerst bevestigen
- K13 HOOG: "uitgroei-pad" menu-item (migratie-pakket) voor klant die BV wordt — goodwill bij exit
- K14 MIDDEL: AI bon-scan ontdekbaarheid (toast na ~50 handmatige uploads) + Gemini-prijs-voorbehoud in copy

### J — late-jaar self-service (aanvullend)
- J3 HOOG: "aftrek uit eerder jaar vergeten" → FAQ over ambtshalve vermindering (5 jaar terug), anders boze "Boekhoudbaar heeft mijn KIA gemist"-mail
- J6 MIDDEL: XAF-aanlever-one-pager per pakket (Twinfield/Exact/AFAS)
- J7 LAAG: fiscaal-partner-FAQ (2 regels, vangt 100% van die mails)
- J8 MIDDEL: sabbatical-FAQ + "tijdelijk passief"-stand (nihil-aangifte blijft verplicht!)
- J9→J12: factuur-customisatie-plafond expliciet maken; /continuiteit/ spiegel-sectie "wat als jij stopt"; gids-cluster "je bedrijf groeit of verandert"; RUNBOOK splitsen publiek/privaat (onthult nu kluis-locatie-hint)

## Voorgestelde uitvoeringsbatches

1. **Batch "schaal-fundament"** (top-10 #1, #2, #4, #9 + S5/S6): de performance-architectuur — grootste codewijziging, grootste klantimpact
2. **Batch "server-houdbaarheid"** (#3, #5 + D3.1-3.3 + D4.1-4.3): licence-server cleanup, config-endpoint operationeel, API-bases overschrijfbaar — vóór Prinsjesdag 2026
3. **Batch "transities & exit"** (#7, #8 + K1-K3, K13 + J1/J2/J4): jaarwisseling, rebind, stakings-checklist, exit-gidsen
4. **Batch "self-service content"** (J3/J6/J7/J8 + FAQ's + gids-cluster): puur website, geen deploy-risico
5. **Batch "polish"** (K15a-e + micro's): goedkoop, zichtbaar, klaar in een middag
6. **Batch "opruiming"** (D1.1/D1.2/D5.x): dead code en leugenachtige versienummers

H14 (append-only audit-log) zit in batch 1 én was al 📋 in de go-live-audit — wordt door S9 urgenter: hard-cap 5000 breekt de bewaarplicht-belofte bij hoog-volume klanten binnen het eerste jaar.

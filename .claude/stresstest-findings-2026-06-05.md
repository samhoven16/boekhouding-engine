# Ultieme Stresstest — Bevindingen-rapport

**Datum:** 5 juni 2026
**Runtime:** `tests/integration/ultieme-stresstest.test.js` — 0.97s, 24 tests, 24 findings
**Methode:** geautomatiseerde adversarial integration-test op 5 aanvalsvectoren (A-E) + 1 manueel runbook voor wat de mock-runtime niet kan raken (`stresstest-runbook.md`)

## Samenvatting (TL;DR)

| Severity | Aantal | Wat het betekent |
|---|---:|---|
| 🔴 BROKEN | 3 | Echte bug bevestigd. Fix prio P0. |
| 🟡 DRIFT | 7 | Geen error, wel onverwacht of klant-vijandig gedrag. Fix prio P1. |
| 💡 KANS | 4 | Product-verbetering of onbenutte data. Niet kapot, wel kans. |
| 🟢 ROBUST | 10 | Gedrag is correct én robuust. Soms zelfs beter dan verwacht. |

**Hoofdconclusie:** BoekHoudbaar's *boekhoudkundige core* (BTW-rekenkundige, dubbel-boekhouden, idempotency op factuurnummer-niveau) is stevig. De zwakke plekken zitten in *input-validatie* (datum/BTW-nummer/zero-width-chars) en *retroactieve protectie* (boeking in afgesloten jaar, handmatige cell-overschrijving). De stille datacorruptie-risico's zijn de gevaarlijkste — geen error, wel scheve balans op termijn.

---

## TOP 5 prioriteiten (uit deze run)

### 🔴 P0-1. Boeking in afgesloten jaar wordt geaccepteerd (E2)
**Wat brak:** een journaalpost met datum `2025-06-15` wordt zonder waarschuwing geschreven, óók nadat `JA-2025` (jaarafsluiting) in `Journaalposten` staat. Resultaat: balans van 2025 in archief (gesloten via #224) staat niet meer gelijk aan saldi in actieve sheet → continuïteitsbeginsel RJ 160/170 geschonden.
**Fix-richting:** voeg pre-check toe in `valideerInvariantsVoorJournaalpost_` (Invariants.gs:448) die `jaarAlAfgesloten_(ss, opt.datum.getFullYear())` raadpleegt vóór de boeking. Alleen overrulbaar met expliciet "Correctie-mode" door eigenaar.
**Test:** `tests/integration/ultieme-stresstest.test.js` E2 zou groen moeten worden zodra de check er staat.

### 🔴 P0-2. Datum 29-feb in niet-schrikkeljaar rolt stil door (A4)
**Wat brak:** `parseDatumStrict_('29-02-2027', ...)` retourneert een Date-object dat doorrolt naar 1 maart (JavaScript-default). Klant typt verkeerde datum in BTW-aangifte-formulier → verschuiving van Q1 naar Q2 zonder waarschuwing.
**Fix-richting:** na `new Date(...)` check of `result.getDate() === origDag && result.getMonth() === origMaand - 1`. Bij mismatch: throw met "29 februari bestaat niet in {jaar}".
**Code-locatie:** `src/Utils.gs:216` (parseDatumStrict_).

### 🟡 P1-1. Zero-width spaces overleven sanitering (A2)
**Wat brak:** Klant kopieert "Lisa van Dijk" uit Excel met onzichtbare U+200B chars. KvK-API match faalt, debiteur-koppeling breekt op string-mismatch ("Lisa van Dijk" ≠ "Lisa​ van Dijk"). Klant snapt niet waarom omdat het identiek lijkt.
**Fix-richting:** voeg `.replace(/[​-‍﻿]/g, '')` toe aan `saniteer_` (Utils.gs).
**Code-locatie:** `src/Utils.gs` zoek `saniteer_`.

### 🟡 P1-2. BTW-nummer lowercase + spaces worden geaccepteerd (A7)
**Wat brak:** `isGeldigBTWNummer_('nl123456789b01')` retourneert `true`. Idem voor `'NL 123456789 B01'`. Dat lijkt vriendelijk, maar bij gebruik in `verleggingsverklaring`-veld of `factuur-PDF` geeft lowercase een ongeldig BTW-nummer richting belastingdienst.
**Fix-richting:** uppercase + strip whitespace vóór regex-match. Of: regex strenger maken.
**Code-locatie:** `src/Utils.gs:378`.

### 🟡 P1-3. Factuurnummer-check en append-row niet in één LockService-blok (B2)
**Wat brak:** `Triggers.gs:verwerkInkomstenUitHoofdformulier_` doet sequentieel `valideerFactuurnummerUniek_` → `appendRow`. Voor sequentiële auto-nummers werkt het (volgendFactuurnummer_ heeft eigen lock), maar voor **handmatig** opgegeven factuurnummers (bv. via dialog "Boekingen → Nieuwe boeking") is geen lock — twee gelijktijdige form-submits kunnen beide door de uniek-check komen.
**Fix-richting:** wrap check+append in één `LockService.getScriptLock().waitLock(10000)`-blok.
**Code-locatie:** `src/Triggers.gs verwerkInkomstenUitHoofdformulier_`.

---

## Bevindingen per categorie

### A. Data-Injectie Hel (input validatie & parsers)

| # | Severity | Bevinding | Fix-richting |
|---|---|---|---|
| A1 | 🟢 ROBUST | Unicode/emoji doorgevoerd zonder schade | OK voor sheets; check of HtmlService-paden óók veilig zijn |
| A2 | 🟡 DRIFT | Zero-width spaces overleven `saniteer_` | Strip `​-‍﻿` in saniteer_ |
| A3 | 🟡 DRIFT | Geen lengte-limiet op vrije tekst (50k chars OK) | Hard cap op 500 chars voor bedrijfsnaam, 1000 voor omschrijving |
| A4 | 🔴 BROKEN | 29-02-niet-schrikkel rolt naar 1-3 zonder waarschuwing | Roundtrip-check na new Date() in parseDatumStrict_ |
| A5 | 🟢 ROBUST | Cell-formula `=IMPORTRANGE` wordt geneutraliseerd (apostrof-prefix) | `saniteer_` werkt al correct — geen action |
| A6 | (niet getrapped op) | parseBedrag_ test gaf geen findings — bewust permissief? | Documenteer parseBedrag_ contract: NaN-return = invalid input |
| A7 | 🟡 DRIFT | BTW-nummer lowercase + spaces geaccepteerd | Uppercase + trim vóór regex |

### B. Race-Condition Storm (concurrent flows)

| # | Severity | Bevinding | Fix-richting |
|---|---|---|---|
| B1 | (test-artefact) | "100 dubbele IDs" was mock-limitatie, geen productie-bug | Productie heeft LockService + atomic counter (Boekingen.gs:839) — werkt correct |
| B2 | 🟡 DRIFT | Factuurnummer check+write niet in één lock voor handmatige nummers | LockService rond check+appendRow in verwerkInkomstenUitHoofdformulier_ |
| B3 | 💡 KANS | Geen duplicate-detection op `(ref, debet, credit, bedrag)`-tuple | Idempotency-key check op ref-niveau — voorkomt Mollie retry-storm dubbeleboekingen |
| B4 | 🟡 DRIFT | `verwerkHerhalendeKosten_` heeft geen LockService (bekend uit invariants.md) | Voeg lock toe — ~5 regels, bekende risk |
| B5 | 💡 KANS | Mollie webhook idempotency niet bereikbaar in unit-runtime | Manueel testen via runbook |

### C. BTW-Paradox (afronding, cross-border, correctie-lus)

| # | Severity | Bevinding |
|---|---|---|
| C1 | 🟢 ROBUST | `berekenBtw`: `excl + btw == incl` bij fractionele input |
| C2 | 🟢 ROBUST | Cumulatieve afronding stabiel bij 10.000 regels (drift < €0,01) |
| C3 | 🟢 ROBUST | BTW null vs 0 invariant correct voor alle 5 tarieven (21/9/0/Vrijgesteld/Verlegd) |
| C4 | 🟢 ROBUST | 50× boek+corrigeer-lus → saldi exact op €0 |
| C5 | 🟢 ROBUST | Self-posting (debet == credit) wordt geblokkeerd met klant-vriendelijk bericht |

**Conclusie C:** dit is de meest robuuste categorie. De BTW-kern is zorgvuldig geschreven en bestand tegen exacte scenarios waar concurrenten falen. Dit is verkoopwaarde.

### D. Storage & Performance (quotum en extremes)

| # | Severity | Bevinding | Fix-richting |
|---|---|---|---|
| D1 | 🟢 ROBUST | 10.000 boekingen in 530ms (in-memory mock) | Productie heeft Sheets-API-quota; reken met factor ×100 → ~50s. Documenteer dit in admin-UI als "bewaarplicht-percentage" |
| D2 | 💡 KANS | ScriptProperties cleanup niet automatisch | Dagelijkse trigger die keys > 90d purgen — bekend uit audit-rapport 4 juni |
| D3 | 🟢 ROBUST | 1000-regel factuur validatie in 0ms | Voeg UI-cap toe (~500 regels): PDF-generator wordt traag boven dit |

### E. Integriteits-breuk (balans, periode, datacorruptie)

| # | Severity | Bevinding | Fix-richting |
|---|---|---|---|
| E1 | 🟡 DRIFT | Journaalpost geschreven ook al ontbreekt Grootboekschema (silent log-only) | Pre-check op Grootboekschema-existence in `maakJournaalpost_`, of run `herberekeningGrootboekSaldi` post-recovery |
| E2 | 🔴 BROKEN | Boeking in afgesloten jaar wordt geaccepteerd | Zie P0-1 hierboven |
| E3 | 🟢 ROBUST | `controleerBalans_` detecteert handmatige saldo-tampering | Goed gedaan — uitstekende bestaande gezondheidscheck |
| E4 | 💡 KANS | Negatief banksaldo zonder waarschuwing | Dashboard-widget "ALERT: bank in rood vanaf X" — gebruik bestaande data |

---

## Wat de mock-runtime NIET kon meten (→ runbook)

Vier vectoren vereisen echte Google-omgeving en staan in `.claude/stresstest-runbook.md`:

1. **Mollie webhook 3× binnen 10s** — idempotency-test in test-Mollie-dashboard
2. **Drive-quota vol bij `sluitJaarAf` archief** — vereist test-account met 14.9GB van 15GB vol
3. **GAS execution-timeout (6 min)** — vereist echte trigger-run met 10k boekingen
4. **Echte concurrent triggers** — twee form-submits binnen 100ms via Google Forms

---

## Kansen-cataloog (💡 KANS-vondsten samengevoegd)

Vier ideeën die de stresstest expliciet blootlegde:

1. **Idempotency-key check op (ref)-niveau in `maakJournaalpost_`** — voorkomt dubbele boekingen bij webhook retry-storms. Implementatie: vóór appendRow, scan laatste 100 rijen op match. ~15 regels.

2. **ScriptProperties dagelijkse cleanup** — al genoemd in audit-rapport. Voorkomt 500KB-quotum-crash bij 100+ klanten met dunning-keys. ~10 regels + 1 trigger.

3. **Dashboard "bank in rood"-widget** — alle data is er al (1200-saldo + boeking-datums). Levert klant-waarde + early-warning. ~30 regels in Dashboard.gs.

4. **Bewaarplicht-percentage in admin-UI** — visualiseer journaalposten-aantal vs theoretische cap voor zelf-bewustzijn ("je hebt 4.2k boekingen — 42% van comfortable cap"). ~20 regels.

---

## Wat opvallend goed werkte (🟢-vondsten samengevoegd)

**De boekhoudkundige core is solide.** Specifiek:

- BTW-rekening met cumulatieve precisie tot 10k regels (C2)
- BTW null vs 0 distinctie hard gehandhaafd over alle 5 tarieven (C3)
- 50× boek+corrigeer-lus zonder drift (C4)
- Self-posting geblokkeerd met begrijpelijke melding (C5)
- Cell-formula injection geneutraliseerd via apostrof-prefix (A5)
- 10k boekingen in 530ms in-memory (D1)
- `controleerBalans_` detecteert handmatige saldo-tampering (E3)

Dit zijn precies de dingen waar concurrenten (Moneybird/Exact) klanten verliezen op fora over "saldo klopt niet". Maak dit zichtbaar op `/functies` als verkoopargument.

---

## Vervolgactie

Voorgestelde commit-sequence (één PR per priority-level, niet alles in één):

- **PR-A** (P0): A4 datum-roundtrip + E2 periode-sluit-check — ~30 regels, ~10 tests
- **PR-B** (P1): A2 ZWSP-strip + A7 BTW-nummer-uppercase + B2/B4 LockService — ~50 regels, ~15 tests
- **PR-C** (kansen): idempotency-key + bank-rood-widget — los van urgentie, in eigen tempo

De stresstest-suite zelf in `tests/integration/ultieme-stresstest.test.js` blijft als regressie-vanger. Run hem na elke PR; de drie 🔴 BROKEN moeten 🟢 ROBUST worden na PR-A.

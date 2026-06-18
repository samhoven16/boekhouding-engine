# Go-live eind-audit — 2026-06-18 (ronde 3)

> Mega-harde, adversariële audit van álle productfuncties vóór go-live, met
> expliciete nadruk: werkt het **100% betrouwbaar voor honderden gebruikers**?
> 8 assen parallel gedraaid via `/audit`, gededupliceerd tegen `main` (#324) +
> `audit-ledger.md`. Dit rapport vindt wat vandaag kenbaar is; het vervangt geen
> jaarlijkse wetscheck of echte klachten.

## Samenvatting

De **per-klant-kopie** is functioneel en schaal-technisch in orde (batching,
resume-cursors, quota-preflights, 4-min-budget). De scherpste risico's zaten op
drie plekken: (1) twee bugs die **stil geld kosten**, (2) de **gedeelde
licentieserver** als single-point-of-failure, en (3) **belofte-vs-realiteit**
drift in copy/marketing.

**Deze ronde gefixt + geborgd (4):** de twee geld-bugs, de server-DoS-gaten, en
een ICP-detectiegat. Volledige groene suite (2708 tests) + lint schoon.

**Bewust uitgesteld naar Sam (6 BLOKKER-klasse):** items die een product-/
bedrijfsbeslissing of fiscaal-geladen herformulering vragen — daar is "gokken"
schadelijker dan vragen. Zie de ledger (status `OPEN (wacht Sam)`).

---

## Gefixt deze ronde (GEBORGD — elk met regressietest die zónder de fix faalt)

| ID | Ernst | Wat | Bewijs |
|----|-------|-----|--------|
| **F-TAX-120** | BLOKKER | Verlegde inkoop-BTW kwam niet in de aftrek (r5b). Reverse-charge inkoop (Google Ads, SaaS, EU-diensten) werd **vól afgedragen** zonder aftrek → klant betaalde structureel honderden €/jaar te veel. Nu `r5b += btwBedrag` → net €0, loopt door de pro-rata-breuk. | `f-tax-120-verlegd-voorbelasting.test.js` |
| **F-PAY-130** | BLOKKER | Mollie-webhook bedrag-verificatie las de **verkeerde kolommen** (`[0]` num-ID i.p.v. `[1]` opgemaakt nr; bedrag uit `[6]`/`[5]` KvK/naam i.p.v. `[12]`). Gevolg: **élke iDEAL-betaling stil geweigerd**, factuur bleef "Verzonden", dunning liep door naar wie al betaald had. | `mollie-webhook-bedrag-verify-kolom.test.js` |
| **F-SCALE-140** | BLOKKER | `config`/`valideer`/`telemetry` waren de enige router-acties **zonder globale rate-limit**. Eén anonieme flood of kapotte client-loop kon de gedeelde server platleggen voor de **hele klantenbasis**. Nu ruime globale cap (fail-open, raakt honderden legitieme klanten nooit). | `licence-server-ratelimit.test.js` |
| **F-TAX-121** | MIDDEL | Griekse BTW-nummers gebruiken prefix **`EL`** (niet `GR`); `EL` ontbrak in de EU-landcodes → IC-levering aan Griekse B2B-klant viel uit de **ICP-opgaaf** (art. 37a Wet OB). `EL` toegevoegd. | `f-tax-121-griekenland-el-prefix.test.js` |

Plus: stale doc-comment in `XafExport40.gs` rechtgetrokken (claimde Concept eruit;
de #324 C-1-fix houdt Concept er juist in — alleen CORRUPT eruit).

---

## Uitgesteld naar Sam — vereisen een beslissing, geen code-gok (BLOKKER-klasse)

Deze zijn reëel maar de *juiste* fix hangt af van een keuze die niet aan mij is:

1. **F-RED-150 — Licentie-binding is client-side (piraterij).** 1 sleutel =
   oneindig kopieën. Een harde server-side bind aan de eerste `ssId` lost het op,
   maar introduceert **lock-out-risico voor legitieme klanten** (nieuwe laptop,
   gekopieerde sheet, offline). Voor een €49-product kan dat erger zijn dan de
   piraterij. → Keuze nodig: bind hard, of accepteer + monitor.
2. **F-SCALE-141 — Server is een ongerepliceerde SPOF.** Bij uitval valt na de
   90-dagen-grace iedereen tegelijk uit + geen nieuwe activaties. Fix = warm-
   standby-URL + externe health-monitor (architectureel/operationeel).
3. **F-OND-130 — Activatie-flow copy.** OTP-mail niet te onderscheiden van de
   order-mail; /bedankt belooft de OAuth-stap op het verkeerde moment + mist het
   "Een kopie maken"-scherm. Copy-fix kan, maar raakt de **levende koop/activatie-
   flow** (die werkt nu — niet eenzijdig aanpassen).
4. **F-VOICE-130 — HITL "afgesloten voor de Belastingdienst (art. 52 AWR)".**
   Valse finaliteit: validatie vergrendelt niets (pas jaarafsluiting doet dat).
   Herformulering is **fiscaal-geladen** → jouw wording.
5. **F-VOICE-131 — Accountant-export claimt "compatibel met Exact & Twinfield".**
   Onvoorwaardelijke belofte terwijl de RGS-mapping ~⅓ dekt. Eerlijk kwalificeren
   → jouw wording.
6. **F-DOC-130 — Site belooft "read-only delen, auto-vervalt na 30d".** Die
   feature **bestaat niet** in de code (alleen export naar eigen Drive). Of de
   site-tekst terugbrengen naar de realiteit, of de feature bouwen.

---

## Backlog (HOOG/MIDDEL/LAAG — in de ledger of hieronder; herbeoordeel volgende ronde)

**HOOG (in ledger):** F-SCALE-142 (drip-resume-cursor + otp-cleanup-sweep vóór
de 500KB-ScriptProperties-cliff), F-OND-131 (onOpen fail-open + 90d-cap kan
midden in fiscaaljaar buitensluiten), F-DOC-131 (BTW-assistent toont geen
rubriek 1d/1e/3a/3b/4 → EU/verlegd onzichtbaar).

**MIDDEL/LAAG (verzameld, niet elk apart in ledger):**
- *Fiscaal (extern te verifiëren):* rubriek 3a vs 3b voor IC-leveringen
  (F-TAX-122), dashboard `getBtwPerMaand_` negeert verlegd → wijkt af van aangifte
  (F-TAX-123), suppletie-termijn-framing "binnen 5 jaar" (F-TAX-124),
  `parseBtwTarief_` stille 0,21-fallback (F-TAX-125). *Check belastingdienst.nl.*
- *Runtime/schaal:* zware proof-scans in `dagelijkseTaken` verdrongen bij grote
  administraties, telemetry `appendRow`+`deleteRows` zonder lock, server-mailquota
  ongepartitioneerd (OTP vs drip), handmatig update-bundle-distributiekanaal.
- *Langlopend onderhoud:* KvK/Mollie/Gemini API-versies hardgepind zonder
  override-property, `_SYSTEM_LOG`-trim op fragiele `%100`-gate, JSON-blobs zonder
  `schemaVersie`, dunning-step-properties van nooit-betaalde facturen zonder TTL.
- *Self-service docs:* Gemini-foutcodes niet vertaald, backup-terugzetten nergens
  gedocumenteerd, "welke kosten naast €49", deadline-gemist-uitweg.
- *Customer-voice:* "u/uw" vs "je/jij" inconsistentie in accountant- + BTW-deadline-
  mail, Mollie "elke factuur automatisch"-belofte vs circuit-breaker, "Human-in-
  the-Loop"-jargon in het menu, XAF 3.2-legacy-strings naast de 4.0-realiteit.

---

## Exit-status van deze ronde

- **0 nieuwe BLOKKER open die ik eenzijdig hoor te fixen** — de 4 code-correctheid-
  blokkers zijn gefixt + geborgd; de 6 resterende BLOKKER-klasse staan
  schriftelijk `OPEN (wacht Sam)` met reden (protocol-conform uitstel).
- Elke gesloten BLOKKER/HOOG heeft een regressietest die zónder de fix faalt.
- Ledger + dit rapport bijgewerkt. CI verwacht groen (2708 tests lokaal groen,
  lint 0 errors).

**Eerlijk:** "100% gegarandeerd voor honderden" is na deze ronde dichterbij maar
niet absoluut — de **server-SPOF (F-SCALE-141)** en de **piraterij-binding
(F-RED-150)** zijn de twee resterende structurele risico's voor schaal, en die
vragen jouw beslissing vóór ze sluitbaar zijn.

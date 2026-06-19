# Bug-klasse-register — de weg naar "100% af"

> **Het inzicht (Sam, 2026-06-19):** elke mega-audit vindt nieuwe dingen, dus we
> pakken het verkeerd aan. Klopt. Heuristische review (mensen/agents) kan
> *nooit* bewijzen dat hij álles zag — dat is een wiskundige grens, geen luiheid.
> En elke fix verandert code → nieuwe bugs. Whack-a-mole op **instanties**.
>
> **De oplossing:** stop met instanties zoeken. Identificeer de **klassen**
> (een handvol) en maak elke klasse **mechanisch onmogelijk of automatisch
> gevangen**. Dan vindt een volgende audit niets meer in die klasse, want CI
> faalt al vóór de merge. "Elke bug in één keer vinden" kan niet; **"elke
> terugkerende klasse sluiten" is eindig en meetbaar** — dit register is de teller.
>
> Regel: een audit-bevinding is pas écht klaar als de **KLASSE** is gesloten of
> hier geregistreerd met het benodigde structurele werk. Niet alleen de instantie.

## Hoe een klasse "gesloten" is

| Sluiting | Betekenis | Kosten |
|----------|-----------|--------|
| **Contract-test** | Uniforme syntax → één test enumereert exhaustief over de codebase en faalt op elke nieuwe overtreder. | Laag |
| **Chokepoint + ban** | Heterogene syntax → alle gevallen door één helper; lint/test verbiedt het patroon erbuiten. | Midden (refactor) |
| **Onmogelijk-by-design** | Het type bug kan niet meer ontstaan (bv. accessor met compile-time naam i.p.v. magische index). | Midden/hoog |

Een **enumeratie-test op heterogene syntax is GEEN sluiting** — hij mist gevallen
(false negatives) en geeft vals vertrouwen. Eerlijk blijven.

---

## Het register

| # | Klasse | Wortel-patroon | Instanties (deze + vorige rondes) | Sluiting | Status |
|---|--------|----------------|-----------------------------------|----------|--------|
| 1 | **Verkeerde sheet-kolom-index** | bare `data[i][N]` magische nummers; semantiek niet in de naam | EUVerkoop `[21]` vs `[7]` (F-TAX-130) · Mollie `[0]/[6]` vs `[1]/[12]` (F-PAY-130) · XAF accTp (F-ACC-009) · **Moneybird-import RELATIES volledig misaligned (F-IMP-310, BLOCKER — GEVONDEN DOOR de migratie: naam→[1]/email→[10] corrupt, factuur-mail las telefoon; gefixt + ratel-test)** · **detecteerOngekoppeldeBankuitgaven_ las verkeerd bank-schema (F-INV-330: bedrag←omschrijving→NaN→0→sloeg álles over; controle deed stil niets. Dead code (geen prod-caller) + de red-team-test borgde hetzelfde foute schema → beide gefixt). LET OP: detectie is nog nergens in productie gewired — losse bevinding voor Sam.** · **I8-bewijs anti-backdating las [14]=Notities i.p.v. [15]=aangemaakt-op (F-FB-340: `instanceof Date` altijd false → controle gaf ALTIJD "geldig"; draait in bewijs-suite)** · **betalings-integriteit bouwde bankRefs uit [9]=BTW% i.p.v. [11]=referentie (F-GC-341: élke BETAALD-factuur vals als "zonder journaalpost" gerapporteerd)**. Beide gefixt + ratel; de bestaande tests bórgden de bug (data op de foute kolom) → meegecorrigeerd. | **Gebouwd:** `KOL`-accessor (`src/SheetKolom.gs`) als enige bron + contract-test `contract-sheet-kolom.test.js` (KOL ⇄ `sheet-schemas.md`, geen drift) + ban-test (gemigreerd bestand mag geen bare `data[i][N]`). **Gemigreerd:** EUVerkoop + Mollie + **BTW.gs** (de aangifte — hoogste fiscale waarde) + **Dashboard.gs** (29 reads) + **Verkoopfacturen.gs** (VF+REL) + **Inkoopfacturen.gs** (IF) + **Rapportages.gs** (GB+BT) + **Boekingen.gs** (de journaalpost/grootboek-KERN — 52 reads over 5 sheets; `data`-var bindt per functie aan een andere sheet → opgelost met perl line-guards i.p.v. globale replace). **Ban verscherpt:** regex van `data\[i\]\[N\]` → `]\[<getal>]` (tweede-dimensie-literal); ving voorheen `vfData[i][2]`/`ifData[i][3]` (hoofdletter-var) NIET — dat was vals vertrouwen, nu dicht. **Ban OMGEKEERD:** niet langer een opt-in lijst van gemigreerde bestanden, maar élk `src/*.gs` moet schoon zijn behálve een expliciete, SELF-CLEANING `LEGACY_TODO` (een legacy-bestand dat schoon wordt, faalt zijn eigen test → moet uit de lijst). Nieuw bestand of nieuwe bare index in nog-niet-gemigreerde code wordt nu dus direct gevangen; schuld is zichtbaar en kan alleen krimpen. Echte niet-sheet 2D-arrays (bv. browser `e.results[0][0]`) krijgen een `kol-ban-ok`-marker. **KOL uitgebreid:** + HK (herhalende kosten) + INST (instellingen key/value). **Verder gemigreerd:** MoneybirdImport (+ F-IMP-310-fix) · Bankboek (BT) · HerhalendeKosten (HK) · DriveStructuur (INST) · EmailDeliverability (REL — tevens display-bug [1]=Type → [2]=Naam in ongeldige-mail-lijst gefixt) · Jaarafsluiting (GB+JP) · Suggesties (VF+HK). **KOL verder uitgebreid:** + AUDIT (audit-log, cross-cutting). **Module-lokale accessors** (privé aan één bestand, vgl. UREN_KOL): `DLQ_KOL`, `ANCHOR_KOL` (audit-anchor hash-keten), `PRIVE_KOL`/`VERMOGEN_KOL`, `TAAKSTATUS_KOL`. **Verder gemigreerd:** BankImport · Belastingadvies · Belastingvoordeel · Engagement · DataPortability · Utils · DLQ · BoekingEngine · Diagnostiek · Prive. **Triggers** als laatste gemigreerd (AUDIT/TAAK/VF/IF/REL per-functie-guards; KOL.TAAK gecentraliseerd, ook Diagnostiek erop). **LEGACY_TODO is LEEG** — élk `src/*.gs` is KOL-schoon (0 bare kolom-indexen codebase-breed; geverifieerd). De omgekeerde ban eist nu schoon voor de HELE codebase; een nieuwe bare index in welk bestand dan ook faalt direct in CI. | 🟢 **CLOSED** — accessor + contract-test + omgekeerde self-cleaning ban; 31 bestanden gemigreerd (volledige codebase), 4 latente wrong-column-bugs onderweg gevonden+gefixt (F-IMP-310/F-INV-330/F-FB-340/F-GC-341) |
| 2 | **Router-endpoint zonder rate-limit/quota-cap** | nieuwe `actie === 'x'` zonder `rateLimit_` | config · valideer · telemetry (F-SCALE-140, red-team 2×) | **GESLOTEN:** `contract-router-ratelimit.test.js` enumereert élke actie, eist rate-limit of allowlist-met-reden. | 🟢 CLOSED |
| 3 | **Onbegrensde ScriptProperty-key-klasse** | `setProperty('prefix_' + id)` zonder cleanup → 500KB-cliff | dripuit_ (F-SCALE-143) · otp_/otp_ts_ (F-SCALE-142) · (eerder herinneringsStap_, mollie_) | **Nodig:** chokepoint `zetVluchtigeKey_(prefix, id, val, ttlDagen)` die de prefix + TTL centraal registreert en periodiek opruimt; test verbiedt raw `setProperty('x_' +`. Enumeratie-test alleen = vals vertrouwen. | 🟠 PARTIAL — per-instantie gefixt; klasse vereist chokepoint |
| 4 | **Klant-mail zonder opt-out / gate** | nieuwe `MailApp.sendEmail` naar de klant zonder notificatie-gate | drips · BTW-deadline · hoge-uitgave (deze sessie) | **Nodig:** alle klant-notificaties via `stuurKlantNotificatie_()` die `emailNotificatiesAan_()` checkt; test verbiedt directe `MailApp.sendEmail` in klant-notificatie-context (allowlist: facturen/herinneringen naar derden). | 🟠 PARTIAL |
| 5 | **Copy belooft niet-bestaande feature / verkeerd menupad / stale claim** | marketing/mail-tekst niet gekoppeld aan code-realiteit | read-only-deelflow (F-DOC-130/130b) · drip-ZIP + menupaden (F-VOICE-160) · Exact/Twinfield (F-VOICE-131) | **Nodig:** (a) menupad-strings genereren uit `Menu.gs` i.p.v. los typen; (b) claims-registry: elke feature-claim verwijst naar een code-capability-id. Nu: negatieve guards (`mega-audit-copy-fixes`, `audit-ronde3-waarheid-claims`). | 🟠 PARTIAL |
| 6 | **Licentie/security-gate op het verkeerde signaal** | gate op `owner==user` of een raadbare default i.p.v. een echte secret/identiteit | eigenaar-bypass (F-RED-151) · drip-token (F-RED-152) | **Nodig:** review-checklist "elke bypass/gate → bind aan ADMIN_EMAILS of een geseede random secret, nooit aan owner/copy-eigenschappen". Per-instantie gefixt + test. | 🟠 PARTIAL |
| 7 | **Jaar/tarief hardcoded** | jaargebonden constante zonder fallback-vlag | tarief-cliff (F-OND-024) · API-versies (BACKLOG-DURABILITY) | Tarief: gemitigeerd (laatst-bekend-jaar-fallback + `TARIEF_VEROUDERD`). API-versies: nog hardgepind. | 🟠 PARTIAL |
| 8 | **Test borgt het verkeerde (vals-groen)** | test codeert het buggy gedrag of mist de echte seam | btw-classificatie r5b==0 · drip-uit source-regex · cleanup `%100`-gate | **Nodig:** elke BLOCKER/HOOG-fix krijgt een ratel-test die zónder de fix faalt (al protocol); + mutation-spot-checks op de fiscale kern. | 🟠 PARTIAL |
| 9 | **Geld-precisie / float-drift / afronding** | euro's-as-float i.p.v. integer-cent; `Math.round(n*100)/100` met float-fout; asymmetrische afronding bij negatief; inconsistent afrond-moment | `parseBedrag_("1,234.56")=1,23` (gefixt) · `rondBedrag_` asymmetrie negatief (gefixt) · balans-controle in float-ε (gefixt → integer-cent `===0`) | **Gedaan (ronde 2026-06-19):** `rondBedrag_` symmetrisch + eerlijke docstring; `parseBedrag_` positie-bewuste chokepoint; `formatBedrag_` `-0`; balans-bewijs integer-cent EXACT; property-test `precisie-geld.test.js`. Kern bewezen exact (zie `calculation-register.md`). **Rest:** KIA-afbouw-float + euro-rondings-beleid BTW-aangifte (backlog, geen huidige fout). | 🟠 PARTIAL — kern + primitieven EXACT, 2 backlog-items |

---

## De eindige roadmap naar "klassen dicht"

In volgorde van geld/risico-impact:

1. ~~**Klasse 1 (sheet-kolom):** bouw `KOL`-accessor + ban; migreer alle bestanden.~~ ✅ **GESLOTEN** — `KOL` (+ module-lokale accessors) als enige bron, contract-test KOL⇄schema, en een OMGEKEERDE self-cleaning ban die de hele `src/` schoon eist. Alle 31 bestanden gemigreerd; 4 latente wrong-column-bugs gevonden+gefixt (Moneybird-RELATIES, bank-uitgave-detectie, I8-anti-backdating, betalings-integriteit). Een nieuwe bare `[<rij>][<getal>]` faalt nu direct in CI.
2. **Klasse 3 (onbegrensde keys):** `zetVluchtigeKey_`-chokepoint + cleanup-trigger + ban.
3. **Klasse 4 (klant-mail-gate):** `stuurKlantNotificatie_`-chokepoint + ban.
4. **Klasse 5 (copy↔code):** menupaden uit `Menu.gs` genereren + claims-registry.
5. **Klassen 6/8:** review-checklist hard maken (zie `/audit` Stap 6).

Pas als **alle 8 klassen op CLOSED** staan, is een mega-audit-herhaling
zinvol-leeg: hij kan dan alleen nog een *nieuwe* klasse vinden (zeldzaam),
niet opnieuw een oude. **Dát** is "100% af" in de enige vorm die echt bestaat.

## Eerlijke grens
Dit register sluit *bekende* klassen. Een volledig nieuwe klasse (een soort bug
die we nog nooit zagen) kan nog steeds opduiken — daarvoor blijft één periodieke
audit nuttig, maar dan als *klasse-ontdekker*, niet als instantie-jager. En geen
enkele machine vervangt de jaarlijkse fiscale wetscheck of een echte klant.

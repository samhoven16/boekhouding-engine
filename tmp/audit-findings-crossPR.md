# Audit-findings — cross-pr-regressie
Hashes: zie tmp/file-hashes.txt.

## Batch CPR-S1 — Triggers.gs, Dashboard.gs, HerhalendeKosten.gs (interactie-cluster dagelijkseTaken)
Git-archeologie: Triggers.gs recent intensief bewerkt (#294 dunning, #295 booking-core, #298 cleanup/self-heal); Dashboard.gs en HerhalendeKosten.gs sinds #267 onaangeraakt — het seam zit precies daar.

### src/Triggers.gs — Gelezen: 1-2517. Status-machine: dunning skipt BETAALD/GECREDITEERD (2087-2088), markeerVervallen raakt alleen VERZONDEN/DEELS_BETAALD (2257-2304) = OK; geen GESTORNEERD-status in Config. BTW-deadline binnen dagelijkseTaken (1531-1537) = OK. VONDSTEN F-CPR-020..023.
### src/Dashboard.gs — Gelezen: 1-1628. verwerkHerhalendeKosten_ in try/catch (189); kleurregels kennen alle 6 statussen (836-843); placeholder-cleanup (769-785). VONDST F-CPR-024.
### src/HerhalendeKosten.gs — Gelezen: 1-517. Script-lock + idemKey per rij+datum (283-285, 336-376) — dubbel boeken correct afgevangen; null/NaN-datum → FOUT-status (304-321). VONDST F-CPR-025.

#### F-CPR-020 [MIDDEL] src/Triggers.gs:1700-1718 vs 2069-2099
Quote: `const datum = data[i][2]; ... if (ts >= cutoff) actieveFacturen[fnr] = true;`
Probleem: cleanupHerinneringsStap wist herinneringsStap_-keys van facturen >2 jaar oud puur op factuurleeftijd; dunning leest daarna gestuurdeStap=0 ⇒ oude onbetaalde factuur krijgt stappen 1/2/3 OPNIEUW — cleanup ondermijnt dunning-idempotentie.
Fix: alleen keys wissen bij status BETAALD/GECREDITEERD of dagenOver > max dunning-stap.
Owner: Sam (dev)

#### F-CPR-021 [HOOG] src/Triggers.gs:1666 + 1787-1797 ↔ src/Dashboard.gs:189 ↔ src/HerhalendeKosten.gs:277
Quote: `_runTaak_('dashboard', function() { vernieuwDashboard(); });`
Probleem: budget-guard (4 min) skipt elke niet-kritieke step; dashboard-step staat laat én is niet kritiek; maar vernieuwDashboard() is de ENIGE plek waar verwerkHerhalendeKosten_() automatisch draait ⇒ op grote/trage installaties (precies waarvoor de guard bestaat) worden herhalende kosten structureel nooit auto-geboekt ⇒ gemiste huur/abonnement/verzekering-aftrek. Budget-guard-PR veranderde stil de garantie van de niet-mee-gemigreerde HerhalendeKosten-feature.
Fix: verwerkHerhalendeKosten_() eigen vroege _runTaak_('herhalendeKosten', {kritiek:true}) geven, los van de UI-render.
Owner: Sam (dev)

#### F-CPR-022 [LAAG] src/Triggers.gs:1531-1532
Quote: `_runTaak_('markeerVervallen', ...);` / `_runTaak_('herinneringen', ...);`
Probleem: geen — orde gecontroleerd en order-robuust (dunning kijkt naar vervaldatum, niet status). Bevestiging, geen actie.
Owner: Sam (dev)

#### F-CPR-023 [LAAG] src/Triggers.gs:1699 vs 1717
Quote: `// ... 'Laatst bijgewerkt' kolom 15). ... const datum = data[i][2];`
Probleem: comment zegt kolom 15 (Laatst bijgewerkt), code gebruikt [2] (Factuurdatum) ⇒ key kan te vroeg "inactief" worden (versterkt F-CPR-020).
Fix: data[i][14] gebruiken of comment + criterium herzien.
Owner: Sam (dev)

#### F-CPR-024 [MIDDEL] src/Dashboard.gs:189 ↔ src/HerhalendeKosten.gs:283-285
Quote: `try { herhalendeResult = verwerkHerhalendeKosten_(); } catch (e) { Logger.log('Herhalende kosten: ' + e.message); }`
Probleem: drie gelijktijdige aanroep-paden (trigger 1666, hoofdformulier 483, verkoopformulier 1387); bij lock-falen stil {geboekt:0, komend:[]} zonder audit ⇒ dashboard toont lege komende-kosten zonder spoor.
Fix: lock-falen loggen + "tijdelijk niet beschikbaar" i.p.v. lege lijst.
Owner: Sam (dev)

#### F-CPR-025 [MIDDEL] src/HerhalendeKosten.gs:289 + 412-414 ↔ src/Triggers.gs:1607-1608
Quote: `const re = /^herhKost_.+_(\d{4})-(\d{2})-(\d{2})$/; ... if (dt.getTime() < drempelMs)` vs `const MAX_INHAAL = 36;`
Probleem: cleanup-venster (90d) < inhaal-venster wekelijks (36×7=252d): na verloren sheet-datum-write (crash tussen boeking en regel 381) herbezoekt de inhaal-loop datums 90-252d terug waarvan de idem-keys al gewist zijn ⇒ dubbele journaalposten. De twee PRs kennen elkaars venster niet.
Fix: cleanup-drempel ≥ 270d of MAX_INHAAL frequentie-afhankelijk begrenzen.
Owner: Sam (dev)

Hot spots: Triggers.gs + het gedeelde ScriptProperties-namespace (herinneringsStap_ geschreven/gewist in 3+ bestanden; herhKost_ geschreven in HerhalendeKosten, gewist in Triggers).

## Batch CPR-T1 — test-infra + zware tests

### tests/__helpers__/gas-runtime.js — Gelezen: 1-195. Verse vm-context per createGasRuntime (182-190) = OK; safeAuditLog_-prelude matcht productie. VONDSTEN F-CPR-001, 002.
### tests/__helpers__/gs-transform.js — Gelezen: 1-12. Triviale passthrough. Geen vondsten.
### tests/__helpers__/mocks.js — Gelezen: 1-151. Verse backing per aanroep (31-32, 106-107); setProperty String-coercion matcht GAS (111). VONDST F-CPR-003.
### tests/integration/invoiceFlow.test.js — Gelezen: 1-309. beforeEach verse ctx+mocks (73-114) = OK; kolomposities kloppen met sheet-schemas. Raakt F-CPR-001 (idempotency-pad nooit uitgevoerd).
### tests/integration/ultieme-stresstest.test.js — Gelezen: 1-628. VONDSTEN F-CPR-004..007.
### tests/property/formeel-bewijs-invarianten.test.js — Gelezen: 1-212. Vaste seeds = OK. VONDST F-CPR-008.
### tests/property/fuzz-factuur-payloads.test.js — Gelezen: 1-207. Generators dekken Invalid Date/Vrijgesteld/Verlegd/leeg (83-98) = OK. VONDST F-CPR-009 (+F-CPR-001; duplicaat-detectie gestubd, regel 57).
### tests/property/top5-property-tests.test.js — Gelezen: 1-300. Mock-kolommen [2]/[9]/[10]/[11]/[14] in sync met schema (256-265); null/NaN/Infinity-generators OK. VONDST F-CPR-010.

#### F-CPR-001 [HOOG] tests/__helpers__/gas-runtime.js:33-40
Quote: `const mockGetProperty = jest.fn(() => null); ... setProperty: mockSetProperty, // jest.fn()`
Probleem: stateless Properties-mock ⇒ e-mail-idempotency-guard (Triggers.gs:782-803) wordt in ELKE test omzeild; invoiceFlow + fuzz groen op een retry-pad dat in productie fundamenteel anders loopt. PR die idempotency-semantiek wijzigt wordt niet gevangen.
Fix: maakStoreMock (stateful) injecteren + expliciete retry-test.
Owner: Sam (dev)

#### F-CPR-002 [MIDDEL] tests/__helpers__/gas-runtime.js:99-135
Quote: `SpreadsheetApp: { ... }, MailApp: { ... }, // geen CacheService`
Probleem: CacheService ontbreekt terwijl productie het gebruikt (Triggers.gs:73, 944, 986) ⇒ ReferenceError of nooit-bereikt pad; cache-gebaseerde dubbel-detectie ongetest.
Fix: stateful CacheService-mock toevoegen.
Owner: Sam (dev)

#### F-CPR-003 [LAAG] tests/__helpers__/mocks.js:81-85
Quote: `appendRow: (rij) => { data.push(rij.slice()); }, ... getLastRow: () => data.length,`
Probleem: GAS appendRow schrijft onder laatste rij-met-data; mock pusht onvoorwaardelijk ⇒ rij-index kan 1 afwijken bij trailing-lege-rijen ⇒ vals-groen op exacte indexen.
Fix: semantiek documenteren of getLastRow = laatste niet-lege rij.
Owner: Sam (dev)

#### F-CPR-004 [HOOG] tests/integration/ultieme-stresstest.test.js:33-34, 547-548
Quote: `function registerFinding(category, severity, title, details) { findings.push(...); }` ... `registerFinding('E', '🔴 BROKEN', 'Boeking in afgesloten jaar wordt geaccepteerd', ...)`
Probleem: findings-collector zonder gate — slechts 3 expect() in ~25 tests; 🔴 BROKEN laat CI groen ⇒ het "stress"-vangnet vangt niets af.
Fix: afterAll laten falen op BROKEN-findings of kritieke checks naar echte assertions.
Owner: Sam (dev)

#### F-CPR-005 [MIDDEL] tests/integration/ultieme-stresstest.test.js:605-617
Quote: `const out = path.join(__dirname, '../../.claude/stresstest-findings-raw.json'); fs.writeFileSync(out, ...)`
Probleem: test schrijft in repo-tree — niet-idempotent, parallel-gevoelig, kan ongewild gecommit worden.
Fix: os.tmpdir() of env-flag; .gitignore.
Owner: Sam (dev)

#### F-CPR-006 [LAAG] tests/integration/ultieme-stresstest.test.js:138, 267, 341, 446, 507
Quote: `let ctx; beforeAll(() => { ctx = buildCtx(); });`
Probleem: gedeelde ctx per describe + module-scope caches (_gbRijCache_) ⇒ latente volgorde-afhankelijkheid.
Fix: beforeEach of cache-reset.
Owner: Sam (dev)

#### F-CPR-007 [MIDDEL] tests/integration/ultieme-stresstest.test.js:126-131, 481-484
Quote: `createGasRuntime(['Config.gs','Utils.gs','Invariants.gs','BoekingEngine.gs','Boekingen.gs','Jaarafsluiting.gs','GezondheidCheck.gs'], ...)` ... `if (!ctx.valideerBoeking) { registerFinding(...); return; }`
Probleem: valideerBoeking zit in HitlValidatie.gs dat niet gebundeld is ⇒ D3 permanent dode test; alle ctx.X?-skip-takken falen stil bij hernoemen.
Fix: HitlValidatie.gs bundelen of D3 verwijderen.
Owner: Sam (dev)

#### F-CPR-008 [MIDDEL] tests/property/formeel-bewijs-invarianten.test.js:37-177
Quote: `const btw = Math.round(excl * tarief * 100) / 100; const incl = excl + btw; ... expect(Math.abs(incl - verwacht)).toBeLessThan(0.011);`
Probleem: properties verifiëren zelf-herberekende JS-expressies i.p.v. src-functies ⇒ per constructie waar; tarieven-set (69) mist null/lege strings/Invalid Date.
Fix: echte ctx-functies aanroepen; null/Vrijgesteld/Verlegd toevoegen.
Owner: Sam (dev)

#### F-CPR-009 [MIDDEL] tests/property/fuzz-factuur-payloads.test.js:147-158, 205
Quote: `if (/^(TypeError|ReferenceError|...):/.test(err.toString())) return true; ... return false; // klant-vriendelijk patroon`
Probleem: elke fout met NL-zin als message = "verwachte reject" ⇒ stop-criterium blind voor logische bugs met nette throw.
Fix: classificeren op expliciete error-code (InvariantSchending.code).
Owner: Sam (dev)

#### F-CPR-010 [HOOG] tests/property/top5-property-tests.test.js:234-246
Quote: `ctx._valideerEnSaneerAiOutput_(raw); if (Object.prototype[sleutel] === waarde) { throw new Error('PROTOTYPE POLLUTION: ...'); }`
Probleem: JSON.parse zet __proto__ als own-property; Object.prototype wordt nooit geraakt ongeacht de functie ⇒ assertie is tautologie — valse zekerheid over pollution-defense.
Fix: payload via merge-pad dat prototype echt kan raken; of testen dat safe geen erfelijke keys overneemt.
Owner: Sam (dev)

## Batch CPR-T2 — aanvraag-otp, account-verwijderen, admin-dashboard, admin-prijs-test-modus, audit-fixes-nacht-pr-2, audit2-continuiteit, audit2-fiscaal-high, audit2-med-low-batch1

### aanvraag-otp-endpoint.test.js — Gelezen: 1-190. Isolatie OK (verse maakCtx per test). VONDSTEN F-CPR-040..042.
### account-verwijderen.test.js — Gelezen: 1-194. Isolatie OK; fetch-mock API-consistent. VONDST F-CPR-043.
### admin-dashboard.test.js — Gelezen: 1-292. Override-mechaniek geverifieerd veilig (geen hoisting-shadow). VONDSTEN F-CPR-044, 045.
### admin-prijs-test-modus.test.js — Gelezen: 1-238. VONDST F-CPR-046.
### audit-fixes-nacht-pr-2.test.js — Gelezen: 1-223. VONDSTEN F-CPR-047, 048.
### audit2-continuiteit.test.js — Gelezen: 1-162. VONDSTEN F-CPR-049, 050.
### audit2-fiscaal-high.test.js — Gelezen: 1-141. VONDSTEN F-CPR-051, 052.
### audit2-med-low-batch1.test.js — Gelezen: 1-153. Alle anchor-strings geverifieerd aanwezig. VONDST F-CPR-053.

#### F-CPR-040 [LAAG] aanvraag-otp-endpoint.test.js:49-55
Quote: `computeDigest: (_alg, s) => { ... bytes.push((str.charCodeAt(i % str.length) + i) & 0xff); }`
Probleem: mock negeert alg-argument; werkt toevallig voor MD5-gebruik in _rlHash_; latente onvoorspelbaarheid zodra perEmail-bucket wordt toegevoegd.
Fix: alg respecteren of assertie op afwezigheid e-mail-bucket-key. Owner: Sam (dev)

#### F-CPR-041 [LAAG] aanvraag-otp-endpoint.test.js:58-60
Quote: `ctx.stuurOtpMail_ = stuurOtpMailMock;`
Probleem: post-hoc property-reassign werkt alleen door vm-resolutie op call-time — ongedocumenteerd fragiel bij load-time-caching.
Fix: override via createGasRuntime-param. Owner: Sam (dev)

#### F-CPR-042 [MIDDEL] aanvraag-otp-endpoint.test.js:109-118 (+ Code.gs:786 vs 792)
Quote: `props: { 'otp_ts_klant@example.nl': String(Date.now() - 30000) }, ... expect(r.ok).toBe(false);`
Probleem: globaal-rate-limit hoogt teller op VÓÓR de per-email-60s-check ⇒ legitieme klant-retries satureren de globale 500/u-bucket; test assert alleen ok:false, niet dat de globaal-counter onaangeroerd bleef — order-afhankelijk seam ongedekt.
Fix: assertie op globaal-counter + in source per-email-check vóór globaal-increment. Owner: Sam (dev)

#### F-CPR-043 [LAAG] account-verwijderen.test.js:118-132
Quote: `expect(src).toMatch(/\.aanvraagVerwijderOtp\(email\)/);`
Probleem: regex op argument-namen breekt bij onschuldige rename en vangt echte breuk (vergeten successHandler) niet.
Fix: alleen functienaam matchen of DOM-test. Owner: Sam (dev)

#### F-CPR-044 [LAAG] admin-dashboard.test.js:272-273 — gedeelde src op describe-scope (read-only, latent). Fix: per test inlezen. Owner: Sam.

#### F-CPR-045 [MIDDEL] admin-dashboard.test.js:27-33
Quote: `put: (k, v) => { cacheStore[k] = v; }` (TTL genegeerd)
Probleem: cache-mock zonder TTL ⇒ brute-force-blokkade-opheffing en sessie-token-expiry kunnen NOOIT getest worden — vals-groen op de expiry-dimensie (raakt F-RED-006).
Fix: tijdsbewust cache-model met injecteerbare klok + window-verloop-test. Owner: Sam (dev)

#### F-CPR-046 [MIDDEL] admin-prijs-test-modus.test.js:165-188
Quote: `expect(src).toMatch(/REF_KORTING.*props.*getProperty\(.REF_KORTING./);`
Probleem: admin-schrijft-property ↔ webhook-leest-property-seam uitsluitend via regex getoetst; prijslogica wordt nooit uitgevoerd ⇒ semantische breuk (korting 2× toegepast) blijft onzichtbaar.
Fix: gedrags-test verwerkMollieWebhook_/maakBetaling met gemockte deps + eindprijs-assertie. Owner: Sam (dev)

#### F-CPR-047 [LAAG] audit-fixes-nacht-pr-2.test.js:83-84 — beforeAll-gedeelde ctx (pure functie, benign maar inconsistent). Fix: beforeEach. Owner: Sam.
#### F-CPR-048 [LAAG] audit-fixes-nacht-pr-2.test.js:24-38 — FNV-mock toetst vorm, geen crypto-eigenschap die _hashEmail_ claimt. Fix: documenteren + echte SHA-256-test in Node. Owner: Sam.

#### F-CPR-049 [MIDDEL] audit2-continuiteit.test.js:22-126
Quote: `expect(licentie).toMatch(/dagenSinds >= _licentieGraceDagen_\(\)/);`
Probleem: continuïteit-fixes volledig via regex op source/markdown geverifieerd; geen productie-functie uitgevoerd ⇒ broos bij refactor, blind voor runtime-regressie op een continuïteits-blocker.
Fix: gedrags-tests via createGasRuntime rond de grace-grens. Owner: Sam (dev)

#### F-CPR-050 [MIDDEL] audit2-continuiteit.test.js:129-161
Quote: `function resolveGrace(prop, defaultVal) { ... return defaultVal; }`
Probleem: test verifieert een geHERimplementeerde kopie van grace-resolutie, niet _licentieGraceDagen_ zelf — kopie en origineel kunnen divergeren (schijnzekerheid).
Fix: echte functies aanroepen. Owner: Sam (dev)

#### F-CPR-051 [LAAG] audit2-fiscaal-high.test.js:55-57
Quote: `expect(blok).toMatch(/Motivatie:\s+\$\{motivatie\.slice\(0, 200\)\}/);`
Probleem: AWR-relevante ontgrendel-flow uitsluitend via regex incl. exacte template-spelling — breekt bij cosmetische refactor, vangt echte flow-regressie niet.
Fix: gemockte doorloop van beheerGeslotenPeriodes. Owner: Sam (dev)

#### F-CPR-052 [MIDDEL] audit2-fiscaal-high.test.js:118-140
Quote: `function valideerMotivatie(tekst) { ... if (trimmed.length < 20) return { ok: false, ... } }`
Probleem: motivatie-/label-validatie als lokale kopie getest; productie kan stil afwijken (< vs <=) terwijl test groen blijft — fiscaal-juridisch relevant.
Fix: drempelchecks naar testbare helper in Boekingen.gs refactoren en die aanroepen. Owner: Sam (dev)

#### F-CPR-053 [LAAG] audit2-med-low-batch1.test.js:71-72
Quote: `* 3. BTWReminder Triggers.gs:2447 "Uw boekhoudprogramma" (voice LOW)`
Probleem: stale regelnummer in comment (werkelijk 2337/2340, geverifieerd); bestand toetst 5 fixes via regex op exacte slice-expressies — broos.
Fix: comments corrigeren; cap-/historielogica gedragsmatig testen. Owner: Sam (dev)

Patroon CPR-T2: dominant risico = source-string-matching i.p.v. gedragstests (6 van 8 bestanden), met 2 bestanden die geherimplementeerde kopieën testen (F-CPR-050/052). Enige gedrag-seam: F-CPR-042.

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

## Batch CPR-T3 — audit2-med-low-batch2, r3-fixes, ronde2-hoog, runtime-cross-pr, security-high, voice-klantreis, audit2, audit3-rework

### audit2-med-low-batch2 — Gelezen: 1-194. Eenmalige reads, geen state. VONDST F-CPR-060.
### audit2-r3-fixes — Gelezen: 1-79. VONDST F-CPR-061.
### audit2-ronde2-hoog — Gelezen: 1-222. Pro-rata-fix correct geborgd qua intentie. VONDST F-CPR-062.
### audit2-runtime-cross-pr — Gelezen: 1-187. VONDSTEN F-CPR-063, 064.
### audit2-security-high — Gelezen: 1-166. Constant-time-doel correct verankerd (23-47). VONDST F-CPR-065.
### audit2-voice-klantreis — Gelezen: 1-133. VONDST F-CPR-066.
### audit2.test.js — Gelezen: 1-240. Enige echte runtime-suite (createGasRuntime) — goede aanpak. VONDSTEN F-CPR-067..069.
### audit3-rework — Gelezen: 1-137. NOLOCK/verifier-wiring correct verankerd (81-98). VONDST F-CPR-070.

#### F-CPR-060 [LAAG] audit2-med-low-batch2.test.js:56-60
Quote: `expected.forEach(function(code) { expect(btw).toMatch(new RegExp("'" + code + "'")); });`
Probleem: landcode-asserts niet gebonden aan _EU_LANDEN_BTW_PREFIX-array ⇒ toevallige string elders houdt test groen bij incomplete lijst.
Fix: regex ankeren binnen het array-blok. Owner: Sam (dev)

#### F-CPR-061 [LAAG] audit2-r3-fixes.test.js:74-77
Quote: `const r3Mentions = (eng.match(/ronde[ -]3/gi) || []).length + ...; expect(r3Mentions).toBeGreaterThanOrEqual(3);`
Probleem: comment-archeologie i.p.v. regressietest.
Fix: runtime-test of verwijderen. Owner: Sam (dev)

#### F-CPR-062 [MIDDEL] audit2-ronde2-hoog.test.js:49-58
Quote: `expect(belasteOmzetBlok).not.toMatch(/r3a_grondslag \|\| 0\)\s*[+;]/);`
Probleem: legaal-significante pro-rata-dubbeltelling-fix uitsluitend via negatieve regex; rename/hulpfunctie ⇒ vals-groen terwijl dubbeltelling terugkeert.
Fix: numerieke createGasRuntime-test op exacte euro's. Owner: Sam (dev)

#### F-CPR-063 [MIDDEL] audit2-runtime-cross-pr.test.js:1-187
Quote: `expect(triggers).toMatch(/UrlFetchApp\.fetchAll\(requests\)/);`
Probleem: "runtime + cross-PR"-suite voert niets uit; order-sensitieve seams (SelfHeal-positie, quota vóór dunning) bevestigd op tekst-volgorde, niet uitvoeringsvolgorde.
Fix: dagelijkseTaken draaien met volgorde-registrerende _runTaak_-mock. Owner: Sam (dev)

#### F-CPR-064 [MIDDEL] audit2-runtime-cross-pr.test.js:31-47 (+ src/EmailQuotaGuard.gs:120 vs 131)
Quote: `expect(quota).toMatch(/setProperty\(_EMAIL_QUOTA_WAARSCHUWING_PROP, sleutel \+ ['"]:SKIP_QUOTA['"]\)/);`
Probleem: SKIP-pad schrijft `sleutel+':SKIP_QUOTA'` maar idempotency-check vergelijkt `laatste === sleutel` (131) ⇒ na een SKIP-dag wordt de gate niet herkend; test verankert de string-mismatch als verwacht gedrag.
Fix: runtime-test SKIP→read samen; source: suffix strippen in vergelijking. Owner: Sam (dev)

#### F-CPR-065 [LAAG] audit2-security-high.test.js:158-160
Quote: `expect(engineBron).toMatch(/\^\[=\+\\-@\\t\\r\]/);`
Probleem: security-control geverifieerd via aanwezigheid van eigen regex-tekst, niet via gedrag.
Fix: saniteer_ uitvoeren met =,+,-,@-inputs. Owner: Sam (dev)

#### F-CPR-066 [LAAG] audit2-voice-klantreis.test.js:30-31
Quote: `expect(quota).toMatch(/kan\\n\s*['"] \+\n?\s*['"]Boekhoudbaar de rest van de dag/);`
Probleem: regex codeert exacte bron-opmaak over regelgrenzen ⇒ breekt bij elke re-format.
Fix: bron normaliseren of runtime-string testen. Owner: Sam (dev)

#### F-CPR-067 [MIDDEL] audit2.test.js:26-28
Quote: `beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']); });`
Probleem: gedeelde ctx + muteerbare mocks zonder reset ⇒ latente isolatie-val zodra een test mockImplementation zet (zoals setup-suite 177/211 doet).
Fix: beforeEach of afterEach clearAllMocks. Owner: Sam (dev)

#### F-CPR-068 [MIDDEL] tests/__helpers__/gas-runtime.js:64-77
Quote: `computeDigest: jest.fn((_alg, s) => { ... let h = 2166136261; ... }),`
Probleem: FNV-mock i.p.v. SHA-256 ⇒ audit-hash-keten/HMAC-fixes kunnen nooit realistisch runtime-getest worden (vandaar regex-only suites).
Fix: echte SHA-256 via Node crypto voor hash-kritische tests; mock-beperking documenteren. Owner: Sam (dev)

#### F-CPR-069 [LAAG] audit2.test.js:91-99
Quote: `// Post-run overrides: deze worden NIET overschreven door de script-run ctx.getSpreadsheet_ = jest.fn(() => mockSs);`
Probleem: leunt op hoisting-mechaniek; declaratie→const-wijziging laat mock stil genegeerd worden.
Fix: overrides-param + sentinel-assert dat de mock effectief is. Owner: Sam (dev)

#### F-CPR-070 [LAAG] audit3-rework.test.js:112-115
Quote: `expect(bok).not.toMatch(/oudere entries staan in AuditLog\s*\n\s*\/\/ via schrijfAuditLog_/);`
Probleem: negatieve assert op exacte comment-opmaak bewijst geen gedrag.
Fix: positieve runtime-assert op logBusinessEventNaarAuditSheet_. Owner: Sam (dev)

Patroon CPR-T3: 7 van 8 bestanden = source-string-matching; hoogste prioriteit F-CPR-064 (echte latente source-mismatch in EmailQuotaGuard verankerd als verwacht).

## Batch CPR-T4 — auto-defaults, avg-licentiesleutel, backup-email, bankImport, belasting-optimizer, belasting-overrides, belastingadvies-helpers, belastingadvies-zvw
Alle 8 volledig gelezen; cross-refs geverifieerd tegen AutoDefaults/BackupEmail/BankImport/BelastingOptimizer/Belastingadvies/licence-server.

#### F-CPR-080 [LAAG] auto-defaults.test.js:102 — getUuid-mock geeft 2× zelfde UUID ⇒ dubbele-trekking-entropie ongetest. Fix: teller-mock + helften-verschillen-assert. Owner: Sam.
#### F-CPR-081 [LAAG] auto-defaults.test.js:80
Quote: `expect(rond).toMatch(/\[/);  // is een array-tuple`
Probleem: wiring via positionele bron-char-zoek ⇒ vals-rood/-groen bij herformat.
Fix: stappen-array functioneel uitvoeren. Owner: Sam (dev)
#### F-CPR-082 [LAAG] avg-licentiesleutel-opt-in.test.js:133 — client-kant alleen via losse regex (/sleutel.*encodeURIComponent/). Fix: URL functioneel bouwen+asserten. Owner: Sam.
#### F-CPR-083 [MIDDEL] backup-email.test.js:53
Quote: `getFiles: () => { let returned = false; return { hasNext: () => !returned && ..., next: () => { returned = true; ... } }; }`
Probleem: één-shot-iterator wijkt af van echte herbruikbare FileIterator ⇒ tweede scan in bron geeft vals-rood of maskeert dubbel-scan-bug.
Fix: verse iterator per getFiles()-aanroep. Owner: Sam (dev)
#### F-CPR-084 [LAAG] backup-email.test.js:180 — "wint over alles" test zonder Session-concurrent ⇒ positie-2-prioriteit ongetest. Fix: Session+instelling-combinatietest. Owner: Sam.
#### F-CPR-085 [LAAG] belasting-optimizer.test.js:57 — beforeAll-gedeelde ctx+B (nu veilig, latent order-gevoelig). Fix: beforeEach of mutatie-verbod documenteren. Owner: Sam.
#### F-CPR-086 [LAAG] belasting-optimizer.test.js:176
Quote: `const r = ctx.optimaliseerInvesteringsTimingLP_(inv);`
Probleem: LinearOptimizationService ontbreekt in runtime ⇒ LP-pad valt altijd terug op brute-force ⇒ volledige LP-code nooit uitgevoerd door tests.
Fix: gemockte LP-service-test. Owner: Sam (dev)
#### F-CPR-087 [LAAG] belasting-optimizer.test.js:48 — negatieve bron-regex op één constante-naam; drift onder andere naam passeert. Fix: single-source-of-truth-gedragstest (optimizer === Belastingadvies-KIA). Owner: Sam.
#### F-CPR-088 [MIDDEL] belasting-overrides.test.js:120
Quote: `ctx.getInstelling_ = (sleutel) => { ... return null; };`
Probleem: gedeelde ctx + per-test herschreven getInstelling_ zonder restore; werkt alleen dankzij per-test _wisBelastingOverridesCache_() — één vergeten aanroep = stil vervuilde cache (vals-groen).
Fix: reset in after/beforeEach; cache-wis centraal. Owner: Sam (dev)
#### F-CPR-089 [MIDDEL] src/Belastingadvies.gs:396 (via tests)
Quote: `let _belastingOverridesCache = null;`
Probleem: module-globale cache; geen test verifieert dat productie-schrijfacties de cache busten (alleen handmatige _wis...).
Fix: integratietest cache-invalidatie via productie-flow. Owner: Sam (dev)
#### F-CPR-090 [LAAG] belastingadvies-helpers.test.js:29 — absolute 2026-pinning op impliciet huidig jaar ⇒ vals-rood-tijdbom bij jaarwisseling. Fix: getBelasting_(2026)-parameter. Owner: Sam.
#### F-CPR-091 [MIDDEL] belastingadvies-zvw-heffingskorting.test.js:128
Quote: `ctx.getInstelling_ = () => 'corrupt-datum';` (zonder restore)
Probleem: AOW-tests laten laatste mock staan op gedeelde ctx ⇒ elke toekomstige test ná regel 142 erft stilletjes de datum-mock.
Fix: afterEach-restore of verse ctx. Owner: Sam (dev)
#### F-CPR-092 [MIDDEL] belastingadvies-zvw-heffingskorting.test.js:123
Quote: `// getInstelling_ is jest mock, returns null by default`
Probleem: comment onjuist — runtime definieert getInstelling_ niet; isAowGerechtigd_ slaagt door opgeslokte ReferenceError, niet via het bedoelde null-pad ⇒ try/catch-verwijdering in bron zou crashen zonder dat deze test het voorspelt.
Fix: ctx.getInstelling_ = () => null expliciet; comment corrigeren. Owner: Sam (dev)

## Batch CPR-T5 — betaling-integriteit, boekingEngine, btw-classificatie-robust, btw-export, bundle-create, byok-gemini-ui, chaos-engineering, contract-based-tests
Plus gas-runtime.js (1-196) en jest.config.js (1-24) herlezen: jest.config zet GEEN clearMocks/resetMocks ⇒ mocks resetten nergens automatisch.

#### F-CPR-100 [LAAG] tests/__helpers__/gas-runtime.js:33-40 (+jest.config.js)
Quote: `const mockGetProperty  = jest.fn(() => null);`
Probleem: geen clearMocks in jest.config ⇒ call-records accumuleren over tests binnen beforeAll-blokken; latent voor de eerste toHaveBeenCalledTimes-assert.
Fix: clearMocks: true of beforeEach-runtimes. Owner: Sam (dev)
#### F-CPR-101 [LAAG] tests/__helpers__/gas-runtime.js:107-121
Quote: `MailApp: { sendEmail: jest.fn(), getRemainingDailyQuota: jest.fn(() => 100) },` ... `MailApp:  { sendEmail: jest.fn() }`
Probleem: dubbele MailApp-key — tweede wint ⇒ getRemainingDailyQuota-mock is DOOD; elke test die mail-quota-pad raakt crasht of wordt nooit geschreven.
Fix: tweede definitie verwijderen/aanvullen. Owner: Sam (dev)
#### F-CPR-102 [LAAG] tests/__helpers__/gas-runtime.js:64-77 — FNV-pseudohash i.p.v. SHA-256 (= F-CPR-068, hier de T5-context). Fix: documenteren/override afdwingen. Owner: Sam.
#### F-CPR-103 [LAAG] boekingEngine.test.js:312-313
Quote: `// 1.555 rondt correct af naar 1.56 (geen IEEE 754 kantgeval)` / `expect(ctx.rondBedrag_(1.555)).toBeCloseTo(1.56, 2);`
Probleem: 1.555 is IEEE-754 1.55499...; toBeCloseTo(.,2) accepteert óók 1.55 ⇒ test bewijst de comment-claim niet; afrondingsstrategie-regressie blijft groen.
Fix: exacte .toBe(1.56). Owner: Sam (dev)
#### F-CPR-104 [MIDDEL] btw-classificatie-robust.test.js:108-109
Quote: `const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);` (top-level describe)
Probleem: ctx gebouwd tijdens collectie-fase i.p.v. beforeAll — load-throw sloopt hele file; geen per-test-verversing; inconsistent met blok 1.
Fix: naar beforeAll verplaatsen. Owner: Sam (dev)
#### F-CPR-105 [MIDDEL] btw-export.test.js:67
Quote: `berekenBtwAangifte_: jest.fn(() => aangifte),`
Probleem: producer volledig gestubd ⇒ veld-rename in BTW.gs breekt export in productie terwijl test groen blijft — producer/consumer-contract ongetest.
Fix: één integratietest met echte berekenBtwAangifte_ door _toCanonicalExport_. Owner: Sam (dev)
#### F-CPR-106 [LAAG] btw-export.test.js:217-234 — source-string-match op functienaam + menu-string; bewijst registratie niet. Fix: functionele menu-structuur-check. Owner: Sam.
#### F-CPR-107 [LAAG] bundle-create.test.js:138-140 — .gitignore-regex-match; functioneel-equivalente regel faalt. Fix: git check-ignore. Owner: Sam.
#### F-CPR-108 [LAAG] bundle-create.test.js:93-97 — bundle-count vs live src-listing: alleen aantallen, fouten heffen elkaar op. Fix: exacte namen-set vergelijken. Owner: Sam.
#### F-CPR-109 [MIDDEL] bundle-create.test.js:49, 108
Quote: `const versie = '99.0.0';`
Probleem: vaste bundle-paden in repo-root ⇒ parallel/afgebroken runs botsen of laten residu achter dat volgende run beïnvloedt.
Fix: mkdtempSync of pid/timestamp in pad. Owner: Sam (dev)
#### F-CPR-110 [MIDDEL] byok-gemini-ui.test.js:57-104
Quote: `const matches = dialogBron.match(/Stap 1 — Upload uw bon of factuur/g)` (assert length 1)
Probleem: hele suite is brittle source-regex; dubbel-dropzone-check via letterlijke tekst-telling omzeilbaar met minieme tekstvariatie — precies het dubbel-render-scenario dat hij claimt te bewaken.
Fix: dialoog echt renderen (aiActief true/false) en op HTML-structuur asserten. Owner: Sam (dev)
#### F-CPR-111 [MIDDEL] byok-gemini-ui.test.js:122-138
Quote: `function rendersCTA(aiActief) { return aiActief ? 'dropzone' : 'byok-cta'; }`
Probleem: "functionele simulatie" assert op in-test gedefinieerde functie — test raakt productie-code nergens; vals vertrouwen.
Fix: blok verwijderen of echte render-logica laden. Owner: Sam (dev)
#### F-CPR-112 [MIDDEL] chaos-engineering.test.js:186-242
Quote: `ctx.PropertiesService = { getScriptProperties: () => ({ ... }) };` (zonder restore)
Probleem: CHAOS 4/5 muteren ctx-globals per test zonder teardown ⇒ elke nieuwe test in die blokken erft stilletjes de laatste mock — isolatie hangt aan toevallige describe-grenzen.
Fix: beforeEach-override + afterEach-restore of verse ctx. Owner: Sam (dev)
#### F-CPR-113 [LAAG] chaos-engineering.test.js:84-122
Quote: `const d = new Date(2024, 2, 31, 2, 30);` / `expect(isNaN(d.getTime())).toBe(false);`
Probleem: "DST-tests" asserten alleen geldige Date (triviaal waar), timezone-afhankelijk, raken geen productiecode — pseudo-dekking.
Fix: echte datum-helpers met expliciete offset testen of verwijderen. Owner: Sam (dev)
#### F-CPR-114 [MIDDEL] contract-based-tests.test.js:165-172
Quote: `try { ctx.valideerBtwAansluiting_([...], 999, 100, 1099); } catch (e) { expect(e.code).toBeDefined(); ... }`
Probleem: geen expect.assertions/fail ná de try ⇒ "geen throw" slaagt stil — een PR die de invariant-throw verzwakt blijft groen.
Fix: expect.assertions(2) of fail() in de try. Owner: Sam (dev)
Positief T5: rondBedrag_-idempotentie en parseBedrag_↔formatBedrag_-roundtrip zijn sterke echte contracten; bundle-hash via echte crypto.

## Batch CPR-T7 — cycle19, cycle2, cycle20, cycle21, cycle22, cycle23, cycle24, cycle25
Alle 8 volledig gelezen; alle source-matches geverifieerd tegen werkelijke bron (kolom-indices cycle21 kloppen; return-telling cycle25 = exact 4). cycle21 = echte gedragstest zonder vondsten.

#### F-CPR-140 [LAAG] cycle19-iban-validate-sepa-qr.test.js:20-28
Quote: `fetch: (url) => { fetched.push(url); return { getResponseCode: () => 200, getBlob: ..., getContent: ... }; }`
Probleem: fetch-mock zonder getContentText (default-mock heeft juist geen getBlob) ⇒ PR die error-body leest breekt test met onduidelijke TypeError terwijl productie werkt.
Fix: volledige HTTPResponse-interface mocken. Owner: Sam (dev)
#### F-CPR-141 [MIDDEL] cycle19:99-106
Quote: `ctx.valideerIban_ = undefined; ... expect(r).toMatch(/^data:image\//);`
Probleem: test verankert fail-open (validator weg ⇒ tóch fetchen) — hernoemde/verplaatste valideerIban_ levert in productie stil ongevalideerde IBANs en de test bevestigt dat als OK.
Fix: validator als harde dependency of ontbreken als regressie-signaal. Owner: Sam (dev)
#### F-CPR-142 [LAAG] cycle2-atomic-journaalpost.test.js:44-57
Quote: `ctx.valideerInvariantsVoorJournaalpost_ = () => {};`
Probleem: pre-write-validatielaag volledig gestubd ⇒ nieuwe pre-write-throw verschuift het faalmoment in productie zonder dat de rollback-coverage het merkt.
Fix: één test mét echte validatie-laag. Owner: Sam (dev)
#### F-CPR-143 [MIDDEL] cycle20-betaalstap-cleanup.test.js:17-30
Quote: `expect(src).toMatch(/deleteProperty\('herinneringsStap_'\s*\+\s*fnr\)/);`
Probleem: cleanup geborgd via variabelenaam-regex; DERDE cleanup-pad (SmartCategorisatie.gs:381) ongedekt; rename breekt test zonder gedragsfout.
Fix: runtime-gedragstests voor alle drie paden. Owner: Sam (dev)
#### F-CPR-144 [LAAG] cycle20:46-48 vs 81-83 — inconsistente mock-rijbreedtes tussen tests voor dezelfde sheet. Fix: gedeelde schema-correcte rij-factory. Owner: Sam.
#### F-CPR-145 [LAAG] cycle22-balans-threshold.test.js:57-73 — €0,05-boundary alleen voor deze functie geborgd; geen consistentie-check over alle balans-tolerantie-paden. Fix: gedeelde constante + cross-check-test. Owner: Sam.
#### F-CPR-146 [MIDDEL] cycle23-instellingen-format-valid.test.js:17-21
Quote: `ctx.getInstelling_ = (sleutel) => instellingen[sleutel] || '';`
Probleem: HIGH-risk getInstelling_ gestubd met letterlijke sleutel-strings ⇒ sleutel-rename/normalisatie in productie laat validatie stil overslaan terwijl test groen blijft — sleutel-contract-seam ontkoppeld.
Fix: echte getInstelling_ met gemockte Instellingen-sheet. Owner: Sam (dev)
#### F-CPR-147 [HOOG] cycle24-silent-check-completeness.test.js:28-55
Quote: `expect(stilleBody).toMatch(/controleerReferentiele_\(ss\)\.forEach\(tel\)/);` + try-catch-telling >= 9
Probleem: volledige verificatie via bron-regex op de aggregator — exact de cross-PR-seam die het vaakst breekt; refactor breekt test zonder fout, en check-verwijdering kan via telling tóch groen blijven; niets draait de functie.
Fix: runtime-test met gestubde controleerX_ + assert dat beide checks in score/properties meetellen. Owner: Sam (dev)
#### F-CPR-148 [LAAG] cycle24:25-26 — body-slice eindigt op eerste '}\n\n/**' ⇒ layout-afhankelijk (te vroeg eindigen of rest opslokken). Fix: accolade-balancering of runtime. Owner: Sam.
#### F-CPR-149 [HOOG] cycle25-bankafstemming-input-valid.test.js:46-49
Quote: `const returns = (body.match(/return;/g) || []).length; expect(returns).toBeGreaterThanOrEqual(4);`
Probleem: return;-telling + naam-string-checks: refactor halveert telling (vals-rood), of 4 returns blijven terwijl de silent-0-bug terugkeert (vals-groen); parseBedragStrict_-bestaan wordt nergens functioneel geverifieerd (shared-scope-breuk onzichtbaar).
Fix: runtime-test met gemockte ui.prompt-responses + aparte parseBedragStrict_-gedragstest. Owner: Sam (dev)

Prioriteit T7: F-CPR-147/149 (pure regex op aggregator-/volgorde-seams), daarna 141/143/146 (gestubde gedeelde helpers maskeren rename-regressies).

## Batch CPR-T6 — customFunctions, cycle12-18
Alle 8 volledig gelezen; bronnen cross-geverifieerd (Code.gs routing/endpoints, Verkoopfacturen-parsers, Setup vulGrootboekschema_, HerhalendeKosten-cleanup).

#### F-CPR-120 [LAAG] customFunctions.test.js:50-52
Quote: `expect(ctx.BEREKEN_BTW(33.33, '21%')).toBe(7);`
Probleem: testnaam claimt 2-decimalen-afronding maar 6.9993→7.00 onderscheidt hele-euro-afronding niet.
Fix: input die echt op x.xy uitkomt (10.05→2.11). Owner: Sam (dev)
#### F-CPR-121 [LAAG] cycle12-google-warning-preframe.test.js:48-50
Quote: `const jsonEnd = html.indexOf('}\n    }\n  ]\n}', jsonStart);`
Probleem: JSON-LD-grens op exacte indentatie; fallback-5000-venster verbergt mislukte match ⇒ vals-groen mogelijk na herformat.
Fix: structurele marker (</script>) of geen vensterlimiet. Owner: Sam (dev)
#### F-CPR-122 [MIDDEL] cycle13-herstuur-licentie-endpoint.test.js:145
Quote: `expect(src).toMatch(/rateLimit_\(e,\s*\{[^}]*actie:\s*['"]herstuur-licentie['"][^}]*perEmail:\s*3/);`
Probleem: rate-limit alleen via source-regex; endpoint-gedragstests passeren rateLimit_ nooit ⇒ verwijderde wrap alleen door tekst-match gedekt.
Fix: doGet-gedragstest 4× ⇒ 4e geblokkeerd. Owner: Sam (dev)
#### F-CPR-123 [MIDDEL] cycle14-roteer-revoke-hardening.test.js:63-68
Quote: `const HEADER = ['Sleutel', 'Naam', 'Email', 'Type', 'Status'];`
Probleem: mock-header mist 'Aangemaakt op'/'Mollie betaling ID' ⇒ rotatie-cap-blok (Code.gs:2590-2607) wordt overgeslagen; "succesvolle rotatie" test ander codepad dan productie; cap volledig ongedekt.
Fix: volledige 11-koloms header + cap-test met ≥3 ROTATIE-VAN-rijen. Owner: Sam (dev)
#### F-CPR-124 [LAAG] cycle14:158 — [\s\S]{0,200}-regex kan rateLimit van naastgelegen actie matchen ⇒ vals-groen bij herordening. Fix: zelfde-regel-venster of gedragstest. Owner: Sam.
#### F-CPR-125 [LAAG] cycle15:159-162 — dubbele-routing-check telt letterlijke strings (comments tellen mee). Fix: ^\s*if-anker. Owner: Sam.
#### F-CPR-126 [LAAG] cycle16:33-34 — twee describe-blokken delen ctx op module-load (pure parsers ⇒ nu onschadelijk; inconsistent patroon). Fix: uniformeren. Owner: Sam.
#### F-CPR-127 [MIDDEL] cycle17-grootboek-preserve-klant-rijen.test.js:22-23
Quote: `clearContents: () => { data.length = 1; /* header blijft */ },`
Probleem: mock truncéért array terwijl echt clearContents het grid intact laat ⇒ post-clear getLastRow/leeg-cel-reads gedragen zich in productie anders dan in test.
Fix: cellen op '' met behoud rij-lengte. Owner: Sam (dev)
#### F-CPR-128 [LAAG] cycle18:99-105
Quote: `expect(ctx.cleanupHerhalendeKostenIdempotency_(-5).verwijderd).toBe(0); // al gewist`
Probleem: tweede assert leunt op state van eerste call ⇒ bewijst idempotentie, niet de geclaimde default-90-fallback.
Fix: twee tests met verse store. Owner: Sam (dev)

# Test Map — boekhouding-engine

> Which tests cover which functions and flows.
> Use this BEFORE deciding what to run. Run TARGETED tests, not the full suite.

---

## QUICK REFERENCE: What to run after changing X

| Changed area | Run this | Why |
|-------------|----------|-----|
| `berekenBtw` | `npm run test:unit` | Pure function, fast |
| `valideerBoeking` | `npm run test:unit` | Pure function |
| `saniteer_` / `parseBedrag_` / `rondBedrag_` | `npm run test:unit` | Pure functions |
| `verwerkInkomstenUitHoofdformulier_` | `npm run test:integration` | Integration tests |
| `berekenBtwAangifte_` | `npm run test:flow btw` | Targeted |
| `verwerkHerhalendeKosten_` | `npm run test:flow herhalende` | Targeted |
| `setup()` | `npm run test:flow setup` | Targeted |
| `dagelijkseTaken()` | `npm run test:flow setup` | Same file |
| Config.gs constants | `npm test` | Constants affect all tests |
| Utils.gs shared helpers | `npm test` | Full suite — used everywhere |
| Sheet column indices | `npm test` | Full suite — affects multiple flows |

---

## TEST FILES

### `tests/unit/boekingEngine.test.js` (47 tests)
**Loads:** Config.gs, Utils.gs, BoekingEngine.gs
**Tests:**

| Suite | Tests | Functions covered |
|-------|-------|-------------------|
| valideerBoeking > factuur | 6 | valideerBoeking('factuur', ...) |
| valideerBoeking > kosten | 3 | valideerBoeking('kosten', ...) |
| valideerBoeking > declaratie | 2 | valideerBoeking('declaratie', ...) |
| berekenBtw | 8 | berekenBtw(tarief, excl, incl) |
| saniteer_ | 8 | saniteer_(s) |
| saniteerGetal_ | 6 | saniteerGetal_(s) |
| parseBedrag_ | 5 | parseBedrag_(s) |
| rondBedrag_ | 4 | rondBedrag_(n) |
| escHtml_ | 5 | escHtml_(s) |

**Run:** `npm run test:unit` or `npx jest boekingEngine`

---

### `tests/unit/audit2.test.js` (9 tests)
**Loads:** Config.gs, Utils.gs + targeted modules per suite
**Tests:**

| Suite | Tests | Functions covered |
|-------|-------|-------------------|
| berekenBtwAangifte_ (BTW.gs) | 2 | berekenBtwAangifte_ with null/partial sheets |
| verwerkHerhalendeKosten_ (HerhalendeKosten.gs) | 5 | Invalid date, null date, auto-booking, inactive rows |
| setup() idempotency guard (Setup.gs) | 2 | setup() with SETUP_DONE set/unset |

**Run:** `npm run test:flow btw` / `npm run test:flow herhalende` / `npm run test:flow setup`

---

### `tests/integration/invoiceFlow.test.js` (20 tests)
**Loads:** Config.gs, Utils.gs, BoekingEngine.gs, Boekingen.gs, Verkoopfacturen.gs, Triggers.gs
**Tests:**

| Suite | Tests | Scenario |
|-------|-------|---------|
| Geldige factuur | 5 | Happy path: sheet write, return value, PDF, email, journaalposten |
| Lege factuurregels | 3 | Error thrown, no sheet write, no email |
| Dubbel factuurnummer | 2 | Error on duplicate, no double write |
| PDF mislukt | 4 | Sheet written before PDF; no email without PDF; result.pdfUrl=null |
| Email mislukt | 4 | Sheet/PDF OK; emailVerzonden=false; result.ok=true |

**Run:** `npm run test:integration` or `npx jest invoiceFlow`

---

## COVERAGE GAPS (no tests yet)

| Function | Risk | Notes |
|----------|------|-------|
| `verwerkUitgavenUitHoofdformulier_` | HIGH | Kosten flow has no integration tests |
| `stuurAutomatischeBetalingsherinneringen_` | HIGH | Dunning has no tests |
| `berekenBtwAangifte_` (full calculation) | HIGH | Only null-sheet tests exist |
| `markeerVervallenFacturen_` | MEDIUM | No tests |
| `berekenVolgendeDatum_` | MEDIUM | No tests for edge cases (month-end, feb 29) |
| `zoekOfMaakRelatie_` | MEDIUM | No tests |
| `volgendFactuurnummer_` | MEDIUM | No tests for lock behavior |
| `genereerFactuurPdf_` | MEDIUM | Depends on Drive/HTML service, hard to unit test |
| `parseBtwTarief_` | LOW | Tested indirectly via berekenBtw |

**Priority for next test batch:** `verwerkUitgavenUitHoofdformulier_` and `berekenBtwAangifte_` full calculation.

---

## GAS RUNTIME HARNESS NOTES

The test harness (`tests/__helpers__/gas-runtime.js`) uses `vm.createContext`:
- ALL `.gs` files in a test suite must be loaded in dependency order
- `function` declarations in loaded files overwrite pre-run overrides
- Use **post-run overrides** (`ctx.fn = jest.fn()`) for dependencies not in loaded files
- `const` declarations in .gs files are NOT accessible as ctx properties (block-scoped)

**Standard dependency order:**
```
Config.gs → Utils.gs → [domain-specific files]
```

**Mock pattern for SpreadsheetApp:**
```js
const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Domain.gs']);
ctx.getSpreadsheet_ = jest.fn(() => mockSs);  // post-run override
ctx.maakJournaalpost_ = jest.fn();             // post-run override
```

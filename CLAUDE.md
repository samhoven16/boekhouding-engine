# Claude Engineering OS — boekhouding-engine

> This file defines the mandatory operating protocol for all Claude work in this repo.
> Read it before any task. Follow it without exception.

---

## MANDATORY WORKFLOW (in this order, always)

```
1. CHECK local intelligence artifacts (.claude/)
2. RUN symbol lookup or impact analysis (npm run impact / npm run index)
3. READ only the specific function(s) needed — not full files
4. PATCH the smallest safe change
5. RUN targeted tests (npm run test:flow)
6. VERIFY lint (npm run lint:changed)
7. COMMIT only when tests + lint pass
```

**NEVER start with raw file reading.**
**NEVER run the full test suite unless you changed cross-cutting infrastructure.**
**NEVER patch speculatively.**

---

## LOCAL INTELLIGENCE ARTIFACTS

| File | Purpose | When to use |
|------|---------|-------------|
| `.claude/repo-map.md` | File → responsibility, key public functions | "Which file handles X?" |
| `.claude/flow-maps.md` | Critical business flows traced through code | "How does invoice creation work?" |
| `.claude/sheet-schemas.md` | Exact column layouts for all sheets (0-based) | ANY time you touch sheet data |
| `.claude/invariants.md` | Known invariants, danger zones, BTW semantics | Before ANY change in a risky area |
| `.claude/test-map.md` | Which tests cover which flows | Before deciding which tests to run |

**Consult artifacts BEFORE reading code. They replace up to 80% of cold exploration.**

---

## SYMBOL LOOKUP

```bash
# Regenerate after adding new functions:
npm run index

# Find where a function is defined:
node scripts/impact.js --def <functionName>

# Find all callers of a function:
node scripts/impact.js <functionName>

# Find callers across multiple functions:
node scripts/impact.js berekenBtw parseBtwTarief_
```

---

## TARGETED TEST EXECUTION

```bash
# Run only invoice flow tests:
npm run test:flow invoice

# Run only BTW/tax tests:
npm run test:flow btw

# Run only recurring costs tests:
npm run test:flow herhalende

# Run only setup tests:
npm run test:flow setup

# Run only unit tests (fastest):
npm run test:unit

# Run only integration tests:
npm run test:integration

# Full suite (only for cross-cutting changes or pre-commit):
npm test
```

---

## IMPACT ANALYSIS (MANDATORY before changing shared functions)

Before changing ANY of these, run `node scripts/impact.js <name>` and read ALL callers:

| Function | Callers | Risk |
|----------|---------|------|
| `getSpreadsheet_()` | All 30 files | CRITICAL |
| `getInstelling_(key)` | 15+ files | HIGH |
| `maakJournaalpost_(ss, opt)` | 8 files | HIGH |
| `rondBedrag_(n)` | 12 files | HIGH |
| `parseBedrag_(s)` | 8 files | MEDIUM |
| `saniteer_(s)` | 6 files | MEDIUM |
| `berekenBtw(t, excl, incl)` | 3 files | HIGH |
| `parseBtwTarief_(label)` | 4 files | HIGH |
| `schrijfAuditLog_(...)` | 10 files | MEDIUM |
| `verwerkHerhalendeKosten_()` | Dashboard.gs | HIGH |
| `berekenBtwAangifte_(ss, van, tot)` | BTW.gs callers | HIGH |

---

## DANGER ZONES (read invariants.md before touching)

| Zone | Why dangerous |
|------|--------------|
| Sheet column indices | Off-by-one silently corrupts all data rows |
| `volgendFactuurnummer_()` | Race condition risk; uses script lock |
| `installeelTriggers_()` | Deletes ALL triggers first (line 772) |
| `setup()` | Idempotency guard required; second run wipes settings |
| `berekenBtwAangifte_` | r1a/r1b/r1d/r1e classification is legally significant |
| BTW tarief null vs 0 | `null` = vrijgesteld/verlegd; `0` = nultarief — NOT the same |
| `dagelijkseTaken()` | Each step must be isolated; one failure must not chain |

---

## FORBIDDEN BEHAVIORS

- Reading entire files (>100 lines) when you only need one function — use line offsets
- Running `npm test` for a change to a single calculation function — use `npm run test:flow`
- Changing column indices without verifying against `.claude/sheet-schemas.md`
- Adding try-catch that swallows errors silently (always log + audit-log)
- Creating new GAS globals without adding them to `eslint.config.js` GAS_GLOBALS
- Calling `ScriptApp.deleteTrigger()` without understanding what you're deleting
- Patching a function called by 5+ files without running impact analysis first

---

## ARCHITECTURE IN 60 SECONDS

```
User input
  ├── Google Form → Triggers.gs:verwerkHoofdformulier()
  └── Dialog UI → BoekingEngine.gs:verwerkNieuweBoeking() → Triggers.gs

Triggers.gs
  ├── verwerkInkomstenUitHoofdformulier_() → Verkoopfacturen.gs (PDF/email)
  │                                       → Boekingen.gs (journaalpost)
  │                                       → VERKOOPFACTUREN sheet
  ├── verwerkUitgavenUitHoofdformulier_() → INKOOPFACTUREN sheet
  │                                       → Boekingen.gs (journaalpost)
  └── dagelijkseTaken() → markeerVervallenFacturen_()
                        → stuurAutomatischeBetalingsherinneringen_()
                        → controleerBtwDeadlines_() [conditional]
                        → vernieuwDashboard() → verwerkHerhalendeKosten_()

Config.gs       — all constants (SHEETS, PROP, BTW_KEUZES, FACTUUR_STATUS)
Utils.gs        — shared helpers (getSpreadsheet_, formatBedrag_, rondBedrag_)
Boekingen.gs    — maakJournaalpost_, ID generators
Setup.gs        — one-time setup, sheet headers, trigger installation
BTW.gs          — berekenBtwAangifte_, getBtwPerMaand_
Dashboard.gs    — vernieuwDashboard, KPI rendering
Rapportages.gs  — balans, W&V, cashflow generation
```

---

## WHAT TO DO WHEN A BUG IS REPORTED

1. Check `.claude/invariants.md` — is this a known danger zone?
2. Check `.claude/flow-maps.md` — which flow is affected?
3. Check `.claude/test-map.md` — is there already a test for this?
4. Run `node scripts/impact.js <suspectedFunction>` — what else does it touch?
5. Read ONLY the specific function (use line offset in Read tool)
6. Fix the minimum change
7. Add regression test
8. Run targeted tests: `npm run test:flow <flow>`
9. Run lint on changed files: `npm run lint:changed`

---

## KEEPING INTELLIGENCE ARTIFACTS UP TO DATE

After adding new functions or sheets:
```bash
npm run index          # regenerate symbol-index.json
```

After major architectural changes, update manually:
- `.claude/repo-map.md` — if file responsibilities change
- `.claude/flow-maps.md` — if a business flow changes
- `.claude/sheet-schemas.md` — ONLY if columns are added/removed
- `.claude/invariants.md` — if new invariants or danger zones discovered
- `.claude/test-map.md` — if new test files added

**Column schema changes are HIGH RISK** — update sheet-schemas.md AND test the affected sheet access in ALL calling files.

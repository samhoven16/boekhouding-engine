# Known Invariants & Danger Zones — boekhouding-engine

> Read the relevant section before ANY change in these areas.
> These represent hard-won knowledge from production audits.

---

## BTW SEMANTICS (legally significant — do not guess)

### `berekenBtw(tarief, bedragExcl, bedragIncl)` return contract:
```
tarief = '21% (hoog)'   → {excl, btw, incl, tarief: 0.21}
tarief = '9% (laag)'    → {excl, btw, incl, tarief: 0.09}
tarief = '0% (nultarief)' → {excl, btw:0, incl:excl, tarief: 0}   ← tarief is 0, NOT null
tarief = 'Vrijgesteld'  → {excl, btw:0, incl:excl, tarief: null}   ← tarief is NULL
tarief = 'Verlegd'      → {excl, btw:0, incl:excl, tarief: null}   ← tarief is NULL
tarief = null           → {excl:0, btw:0, incl:0, tarief: null}    ← all zero
```

**INVARIANT:** `tarief: null` means no BTW charged (vrijgesteld or verlegd).
**INVARIANT:** `tarief: 0` means nultarief — BTW rate is explicitly zero (recoverable).
**These are NOT interchangeable under Dutch tax law.**

### BTW aangifte classification (berekenBtwAangifte_):
```
'21% (hoog)'              → r1a (grondslag + btw)
'9% (laag)'               → r1b (grondslag + btw)
'0% (nultarief)'          → r1d (grondslag only, per OB form spec)
'Vrijgesteld'             → r1d (grondslag only, per OB form spec)
'Verlegd' (verkoop)       → r1e (grondslag only)
'Verlegd' (inkoop)        → r4a (grondslag + btw)
any other inkoop with btw → r5b (voorbelasting, aftrekbaar)
```

**NOTE:** r1d correctly combines nultarief AND vrijgesteld per Dutch OB form design.

### parseBtwTarief_(label) → numeric rate or null:
```
label.includes('21') → 0.21
label.includes('9')  → 0.09   ← FRAGILE: matches '9' substring; safe while BTW_KEUZES unchanged
label.includes('0')  → 0      ← matches '0% (nultarief)'
Vrijgesteld/Verlegd  → null
```

---

## COLUMN INDEX INVARIANTS

### VERKOOPFACTUREN date columns:
```
[2] = Datum (factuur date)        ← used for quarter filtering in BTW
[3] = Vervaldatum (due date)      ← used for dunning in stuurAutomatischeBetalingsherinneringen_
```
**DANGER:** Using [2] when you mean [3] or vice versa silently misfires reminders or BTW dates.

### INKOOPFACTUREN date columns:
```
[2] = Datum ontvangst (when WE received it)    ← NOT used for BTW
[3] = Factuurdatum leverancier (actual date)   ← USED for BTW quarter filtering
```
**DANGER:** berekenBtwAangifte_ uses IF[3] not IF[2]. If you add a new date filter elsewhere, use IF[3].

### VERKOOPFACTUREN payment columns:
```
[13] = Betaald bedrag (number, 0..totalIncl)
[14] = Status (string)
Open amount = [12] - [13]        ← NOT: status === 'Betaald'
```
**DANGER:** A partial payment (status = 'Deels betaald') has [13] > 0 but [14] != 'Betaald'.

---

## IDEMPOTENCY INVARIANTS

### Invoice creation idempotency (Triggers.gs:verwerkInkomstenUitHoofdformulier_):
- Checks if factuurNr already exists in VF sheet BEFORE appendRow
- If found: throws Error + schrijfAuditLog_('Factuur DUBBEL geblokkeerd', ...)
- INVARIANT: factuurnummer is unique in the VF sheet

### setup() idempotency (Setup.gs):
- Guarded by PROP.SETUP_DONE === 'true' at function start
- Returns early with alertOfLog_ if already set up
- resetSetup() clears this property before calling setup() — legitimate re-run path

### Dunning deduplication (Triggers.gs:stuurAutomatischeBetalingsherinneringen_):
- Uses ScriptProperties key `herinneringsStap_{factuurnummer}` to track last sent step
- INVARIANT: steps only advance forward (1 → 2 → 3), never reset unless manually cleared
- INVARIANT: each step sent at most once per invoice

---

## LOCK / CONCURRENCY INVARIANTS

### `volgendFactuurnummer_(ss)`:
- Uses `LockService.getScriptLock().waitLock(10000)` — 10s timeout
- Reads current nr from ScriptProperties, increments, writes back
- INVARIANT: factuur numbers never collide even with concurrent form submissions

### `verwerkHerhalendeKosten_()`:
- NO LockService — not protected against race conditions
- Acceptable for single-user GAS; document as known risk
- Date advance is immediate: prevents same-day double-booking in sequential runs

---

## TRIGGER INVARIANTS

### `installeelTriggers_()` (Setup.gs):
- Line 772: `ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t))`
- **Deletes ALL triggers first, then recreates them**
- If an exception is thrown after deletion but before recreation: system has NO triggers
- INVARIANT: form trigger only created if PROP.FORM_HOOFD_ID exists in properties

### `dagelijkseTaken()` error isolation (post-audit):
- Each of 4 tasks wrapped in independent try-catch
- INVARIANT: failure of one task must not prevent subsequent tasks from running
- INVARIANT: audit log written on failure

---

## FINANCIAL CALCULATION INVARIANTS

### Rounding:
- All monetary values: `Math.round(n * 100) / 100` (same as `rondBedrag_`)
- Applied at: berekenBtw output, totalExcl/totalBtw/totalIncl, journaalpost.bedrag
- INVARIANT: no money value is stored with more than 2 decimal places

### Journal entry balance:
- Every `maakJournaalpost_` call creates ONE row (debit + credit in same row)
- INVARIANT: debet ≠ credit (a == b means self-posting = GL imbalance)
- Pre-audit: legacy form had debet:1100, credit:1100 — this was a bug (now removed)

### BTW calculation cascade:
```
totalExcl = sum(regel.aantal * regel.prijs) - korting    [rounded]
totalBtw = totalExcl * btwTarief                         [rounded]
totalIncl = totalExcl + totalBtw                         [rounded]
```
- korting is in € (NOT %)
- All calculations use `rondBedrag_` wrapper

---

## NULL / MISSING DATA INVARIANTS

### `getSheetByName()` return:
- Returns null if sheet doesn't exist — NEVER call `.getDataRange()` directly on result
- Pattern: `const s = ss.getSheetByName(naam); return s ? s.getDataRange().getValues() : [[]];`
- Applied in: berekenBtwAangifte_ (post-audit), should be applied everywhere sheet access occurs

### `verwerkHerhalendeKosten_` date validation:
- `new Date(invalidString)` returns Invalid Date (truthy but NaN)
- `!new Date('bad')` is FALSE — truthy check does NOT catch Invalid Date
- INVARIANT: always check `isNaN(volgende.getTime())` after constructing from cell data

### PropertiesService null returns:
- `getProperty(key)` returns null if key not set (not empty string, but null)
- Pattern: `const val = props.getProperty(key) || 'default'`
- INVARIANT: never call `.trim()` or methods on getProperty() result without null check

---

## KNOWN REMAINING RISKS (not yet fixed)

| Risk | Location | Severity | Notes |
|------|----------|----------|-------|
| berekenBtw '9' matching | BoekingEngine.gs:79 | LOW | `includes('9')` fragile; safe while BTW_KEUZES unchanged |
| Herhalende kosten race condition | HerhalendeKosten.gs | LOW | Two simultaneous dashboard refreshes could double-book |
| No force-re-setup escape hatch | Setup.gs | LOW | User must manually clear 'setupDone' property |
| Sheet access in 20+ functions | Various | MEDIUM | Many files still directly call `.getSheetByName().getDataRange()` without null guard |
| Dashboard BTW year assumption | Dashboard.gs | UNKNOWN | Uses current year; may mismatch if boekjaar set differently |

---

## AUDIT TRAIL INVARIANTS

`schrijfAuditLog_(type, bericht)` — mandatory before ALL throws and critical state changes:
```
Before throw: schrijfAuditLog_('Factuur MISLUKT', '...')
After sheet write: schrijfAuditLog_('Factuur in sheet', '...')
On PDF failure: schrijfAuditLog_('PDF FOUT', '...')
On email sent: schrijfAuditLog_('Email verzonden', '...')
On email fail: schrijfAuditLog_('Email MISLUKT', '...')
On duplicate blocked: schrijfAuditLog_('Factuur DUBBEL geblokkeerd', '...')
On daily task fail: schrijfAuditLog_('FOUT dagelijkse taak', '...')
```
INVARIANT: no silent failure. Every non-trivial failure has an audit log entry.

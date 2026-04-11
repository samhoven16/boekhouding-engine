# Repository Map — boekhouding-engine

> File → responsibility + key public functions.
> Start here when you need to know WHICH file to look at.

---

## CORE INFRASTRUCTURE

### `src/Config.gs`
**Responsibility:** All constants. Zero logic.
**Key exports:**
- `SHEETS` — all sheet name strings (14 sheets)
- `PROP` — all PropertiesService key strings
- `FACTUUR_STATUS` — Concept/Verzonden/Deels betaald/Betaald/Vervallen/Gecrediteerd
- `BTW_KEUZES` — `['21% (hoog)', '9% (laag)', '0% (nultarief)', 'Vrijgesteld', 'Verlegd']`
- `BOEKING_TYPE` — Verkoopfactuur/Inkoopfactuur/Bankbetaling/Bankontvangst/Journaalpost/Memoriaal/Beginbalans
- `RELATIE_TYPE` — Klant/Leverancier/Beide
- `KLEUREN` — UI color palette
- `VALIDATIE` — validation rule sets per boeking type
- `STANDAARD_GROOTBOEK` — 211-entry account plan (code → naam/type/category)
- `KOSTEN_CATEGORIEEN` — cost category → GL account mapping

**Change risk:** LOW (constants only, but changing names breaks all callers)

---

### `src/Utils.gs`
**Responsibility:** Shared utility functions. Used by every other file.
**Key functions:**
- `getSpreadsheet_()` — get active spreadsheet (checks SPREADSHEET_ID prop first)
- `alertOfLog_(ui, titel, bericht)` — show alert OR log if no UI
- `getInstelling_(sleutel)` — read settings from Instellingen sheet
- `rondBedrag_(n)` — round to 2 decimals (Math.round * 100 / 100)
- `parseBedrag_(s)` — parse currency string (handles €, comma, thousands dot)
- `formatBedrag_(n)` — format number as "€ 1.234,56"
- `formatDatum_(d)` — format Date as "dd-mm-yyyy"
- `saniteer_(s)` — trim + block spreadsheet formula injection
- `saniteerGetal_(s)` — parse number or return 0
- `escHtml_(s)` — escape HTML special chars
- `schrijfAuditLog_(type, bericht)` — append to Audit Log tab
- `formatFactuurnummer_(nr, prefix, len)` — format "F000001"
- `parseBtwTarief_(label)` — label string → numeric rate or null

**Change risk:** CRITICAL — called by 20+ files

---

### `src/Boekingen.gs`
**Responsibility:** Journal entry creation and ID generation.
**Key functions:**
- `maakJournaalpost_(ss, opt)` — write to JOURNAALPOSTEN sheet (16 columns)
- `volgendFactuurnummer_(ss)` — atomic increment with LockService
- `volgendInkoopNummer_(ss)` — atomic increment with LockService
- `volgendBoekingNr_(ss)` — atomic increment for journaalpost ID
- `bepaalOmzetRekening_(btwLabel, regels)` — select correct 8xxx income account
- `bepaalBtwVerkoopRekening_(btwLabel)` — select correct BTW account
- `bepaalKostenrekening_(categorie)` — select 7xxx cost account
- `zoekOfMaakRelatie_(ss, naam, type, email)` — find or create relatie

**Change risk:** HIGH — maakJournaalpost_ called by 8 files

---

## INPUT HANDLING

### `src/BoekingEngine.gs`
**Responsibility:** Central validation + dispatch for dialog-based entry.
**Key functions:**
- `valideerBoeking(type, data)` — validate form data, returns {ok, fouten[]}
- `berekenBtw(tarief, bedragExcl, bedragIncl)` — calculate BTW fields
- `verwerkNieuweBoeking(type, data)` — validate → sanitize → dispatch to Triggers
- `_verwerkFactuur_(ss, s)` — internal: assemble formData → call Triggers
- `_verwerkKosten_(ss, s, data)` — internal: process kosten boeking
- `_verwerkDeclaratie_(ss, s, data)` — internal: process declaratie

**Change risk:** HIGH — gateway for all dialog-based input

---

### `src/Triggers.gs`
**Responsibility:** GAS trigger handlers — the actual transaction processors.
**Key functions:**
- `verwerkHoofdformulier(e)` — TRIGGER: main form submit handler
- `verwerkInkomstenUitHoofdformulier_(ss, data)` — **invoice creation** (THE critical path)
- `verwerkUitgavenUitHoofdformulier_(ss, data)` — expense booking
- `verwerkDeclaratieUitHoofdformulier_(ss, data)` — expense claim booking
- `dagelijkseTaken()` — TRIGGER: daily timer (reminders, BTW, dashboard)
- `markeerVervallenFacturen_(ss)` — update VERVALLEN status on overdue invoices
- `stuurAutomatischeBetalingsherinneringen_(ss)` — 3-step dunning emails
- `parseBtwTarief_` (also in Utils.gs) — used locally for tarief lookup

**Change risk:** CRITICAL — all money flows through here

---

## DOMAIN MODULES

### `src/BTW.gs`
**Responsibility:** VAT calculation, declaration, and reporting.
**Key functions:**
- `berekenBtwAangifte_(ss, vanDatum, totDatum)` — full OB declaration calculation
- `zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode)` — write to BTW Aangifte sheet
- `genereerBtwAangifte()` — menu entry: ask quarter → calculate → display
- `getBtwPerMaand_(ss, jaar)` — monthly VAT breakdown for Dashboard
- `toonBtwAangifteAssistent()` — interactive wizard

**Change risk:** HIGH — legal significance; affects BTW filing accuracy

---

### `src/HerhalendeKosten.gs`
**Responsibility:** Recurring costs management and auto-posting.
**Key functions:**
- `verwerkHerhalendeKosten_()` — check due dates → auto-post to JOURNAALPOSTEN
- `berekenVolgendeDatum_(datum, freq)` — advance date by frequency
- `beheerHerhalendeKosten()` — menu: open management dialog
- `voegHerhalendeKostToe_(ss, data)` — add new recurring cost row

**Caller:** Dashboard.gs calls `verwerkHerhalendeKosten_()` every dashboard refresh
**Change risk:** MEDIUM — financial impact if double-booking occurs

---

### `src/Setup.gs`
**Responsibility:** One-time initialization + settings management.
**Key functions:**
- `setup()` — GUARDED: idempotency guard via PROP.SETUP_DONE
- `resetSetup()` — deliberate re-setup (clears PROP.SETUP_DONE first)
- `maakTabbladen_(ss)` — create all sheets (idempotent: skip if exists)
- `installeelTriggers_()` — delete ALL triggers then recreate (destructive!)
- `maakHoofdFormulier_(ss)` — create/update Google Form
- `zetInstellingen_(ss)` — write default settings rows
- `getInstelling_(sleutel)` — ALSO in Utils.gs (same implementation)

**Change risk:** HIGH — destructive if guard is removed

---

### `src/Dashboard.gs`
**Responsibility:** Dashboard rendering + KPI computation.
**Key functions:**
- `vernieuwDashboard()` — PUBLIC menu entry; calls verwerkHerhalendeKosten_()
- `berekenKpiData_(ss)` — compute all KPIs (omzet, kosten, BTW saldo, debiteuren)
- `schrijfWaarschuwingen_(sheet, ss, kpi, rij, komend)` — write alert rows

**Side effect:** calls `verwerkHerhalendeKosten_()` — auto-posts recurring costs
**Change risk:** MEDIUM

---

### `src/Verkoopfacturen.gs`
**Responsibility:** Invoice PDF generation and email dispatch.
**Key functions:**
- `genereerFactuurPdf_(ss, factuurData, rij)` — generate PDF in Drive, return URL
- `stuurVerkoopfactuurPdf(rij)` — PUBLIC menu: manual send invoice email
- `markeerFactuurAlsBetaald_(ss, rij)` — update status + betaaldatum

**Change risk:** MEDIUM — PDF errors should be non-fatal (already wrapped)

---

### `src/BTWReminder.gs`
**Responsibility:** BTW deadline calculation and reminder emails.
**Key functions:**
- `controleerBtwDeadlines_()` — check if deadline approaching → send email
- `berekenHuidigKwartaal_()` — return current quarter {q, van, tot}
- `berekenBtwDeadlines_()` — return all 4 quarter deadlines

---

### `src/Rapportages.gs`
**Responsibility:** Financial report generation.
**Key functions:**
- `genereerBalans()` — write Balans sheet
- `genereerWvRekening()` — write W&V sheet
- `genereerCashflow()` — write Cashflow sheet
- `berekenKengetallen_(ss)` — compute KPIs (omzet, kosten, winst, marge)

---

### `src/Onboarding.gs`
**Responsibility:** First-run wizard.
**Key functions:**
- `controleerOnboarding_()` — called from onOpen(); shows wizard if not complete
- `toonWelkomstWizard()` — show multi-step setup wizard

---

## SUPPORT FILES (lower change risk)

| File | Purpose |
|------|---------|
| `Menu.gs` | GAS menu definition (onOpen) — 43+ items |
| `Validaties.gs` | Additional validation helpers |
| `Bankboek.gs` | Bank transaction processing |
| `Inkoopfacturen.gs` | Purchase invoice UI |
| `NieuweBoeking.gs` | Dialog UI definitions |
| `NieuweBoeking_Submit.gs` | Dialog submit handlers |
| `InvoerenDialog.gs` | Form/dialog rendering |
| `SmartCategorisatie.gs` | AI-assisted categorization |
| `Belastingadvies.gs` | Tax optimization advice |
| `DriveStructuur.gs` | Drive folder management |
| `Prive.gs` | Private finance module |
| `GezondheidCheck.gs` | Data quality checks |
| `ExportAccountant.gs` | Accountant export |
| `Branding.gs` | Logo and styling |
| `Licentie.gs` | License management |
| `TaxRegistry.gs` | Tax regulation database |
| `Assistent.gs` | Help and AI assistant |
| `Installer.gs` | Alternative installer |

---

## PUBLIC TRIGGER FUNCTIONS (called by GAS, not by code)

These are registered with ScriptApp and must NOT be renamed without updating triggers:

| Function | Trigger type | File |
|----------|-------------|------|
| `onOpen()` | onOpen spreadsheet | Menu.gs |
| `verwerkHoofdformulier(e)` | onFormSubmit | Triggers.gs |
| `verwerkVerkoopfactuurFormulier(e)` | onFormSubmit (legacy) | Triggers.gs |
| `dagelijkseTaken()` | time-based daily 08:00 | Triggers.gs |

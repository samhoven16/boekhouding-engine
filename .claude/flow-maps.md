# Critical Business Flow Maps — boekhouding-engine

> Trace code paths for key business flows.
> Read the relevant section BEFORE touching any function in that flow.

---

## FLOW 1: INVOICE CREATION (most critical)

```
User fills dialog (NieuweBoeking.gs)
  ↓
verwerkNieuweBoeking('factuur', data)       ← BoekingEngine.gs
  ↓ valideerBoeking('factuur', data)         ← validates klant, datum, r1prijs, r1omschr
  ↓ saniteer_ all fields
  ↓ _verwerkFactuur_(ss, s)                  ← assembles formData dict
  ↓
verwerkInkomstenUitHoofdformulier_(ss, data) ← Triggers.gs (THE engine)
  │
  ├─ Parse invoice lines (max 5)
  │   └─ parseBedrag_ each prijs/aantal
  │
  ├─ GUARD: regels.length === 0
  │   └─ throw Error + schrijfAuditLog_('Factuur MISLUKT', ...)
  │
  ├─ berekenBtw(tarief, totalExcl, 0)        ← BoekingEngine.gs
  │   └─ returns {excl, btw, incl, tarief: 0.21|0.09|0|null}
  │
  ├─ zoekOfMaakRelatie_(ss, klantnaam, ...)  ← Boekingen.gs
  │
  ├─ volgendFactuurnummer_(ss)               ← Boekingen.gs (LockService!)
  │
  ├─ IDEMPOTENCY CHECK: scan VF sheet for existing factuurNr
  │   └─ throw Error + schrijfAuditLog_('Factuur DUBBEL geblokkeerd', ...)
  │
  ├─ vfSheet.appendRow(factuurData[23])      ← writes to VERKOOPFACTUREN
  │   └─ schrijfAuditLog_('Factuur in sheet', ...)
  │
  ├─ maakJournaalpost_(ss, debet:1100, credit:8000)  ← Boekingen.gs
  ├─ maakJournaalpost_(ss, debet:1300, credit:1400)  ← BTW rekening
  │
  ├─ genereerFactuurPdf_(ss, factuurData, rij) ← Verkoopfacturen.gs
  │   ├─ success → update VF[19]=pdfUrl
  │   └─ failure → return null (non-fatal, wrapped in try-catch)
  │       └─ schrijfAuditLog_('PDF FOUT', ...)
  │
  └─ [if directMailen && pdfUrl]
      GmailApp.sendEmail(...)
      └─ schrijfAuditLog_('Email verzonden'|'MISLUKT'|'OVERGESLAGEN', ...)

  RETURN: {ok:true, factuurnummer, emailVerzonden, pdfUrl, sheetRij}
```

**Sheet writes:** VERKOOPFACTUREN (1 row), JOURNAALPOSTEN (2 rows), Drive (1 PDF)
**Failure modes:** all throw Error with audit log entry
**Tests:** `tests/integration/invoiceFlow.test.js` (20 tests)

---

## FLOW 2: DAILY TIMER TRIGGER

```
dagelijkseTaken()                            ← Triggers.gs (runs at 08:00 daily)
  │
  ├─ [try] markeerVervallenFacturen_(ss)
  │   └─ scan VF sheet → status VERVALLEN if vervaldatum < today
  │
  ├─ [try] stuurAutomatischeBetalingsherinneringen_(ss)
  │   ├─ scan VF sheet for open invoices past due
  │   ├─ per invoice: check herinneringsStap_{nr} in ScriptProperties
  │   ├─ send email at step 1 (+1d), step 2 (+7d), step 3 (+14d)
  │   └─ update herinneringsStap_{nr} property after sending
  │
  ├─ [try] controleerBtwDeadlines_()         ← BTWReminder.gs [conditional: instelling 'Ja']
  │   └─ send email if deadline within 14 days
  │
  └─ [try] vernieuwDashboard()               ← Dashboard.gs
      │
      └─ verwerkHerhalendeKosten_()          ← HerhalendeKosten.gs
          ├─ scan Herhalende Kosten sheet
          ├─ per active row: if volgende <= today AND auto='Ja'
          │   ├─ maakJournaalpost_(ss, debet:rekening, credit:1200)
          │   └─ advance volgende datum
          └─ return {geboekt: N, komend: [...]}
```

**Each step is isolated in try-catch** — one failure does not cascade.
**Side effect of dashboard refresh:** automatically posts due recurring costs.
**Tests:** `tests/unit/audit2.test.js` (setup guard, herhalende tests)

---

## FLOW 3: BTW DECLARATION

```
genereerBtwAangifte()                        ← BTW.gs (menu trigger)
  ↓ ask user: which quarter?
  ↓
berekenBtwAangifte_(ss, vanDatum, totDatum)  ← BTW.gs
  │
  ├─ sheetData_('Journaalposten')   → null-guarded; returns [[]] if missing
  ├─ sheetData_('Verkoopfacturen')  → null-guarded
  ├─ sheetData_('Inkoopfacturen')   → null-guarded
  │
  ├─ FOR each VF row where datum in [van, tot]:
  │   ├─ btwLabel.includes('21') → r1a_grondslag, r1a_btw
  │   ├─ btwLabel.includes('9')  → r1b_grondslag, r1b_btw
  │   ├─ btwLabel.includes('Vrijgesteld') OR '0%'/'nultarief' → r1d (omzet only)
  │   └─ btwLabel.includes('Verlegd') → r1e_grondslag
  │
  ├─ FOR each IF row where factuurdatum [3] in [van, tot]:
  │   ├─ btwLabel.includes('Verlegd') → r4a_grondslag, r4a_btw
  │   └─ btwBedrag > 0 → r5b (voorbelasting/aftrekbaar)
  │
  ├─ r5a = r1a_btw + r1b_btw + r1c_btw + r1e_btw + r4a_btw
  ├─ r5c = max(0, r5b - r5a)     ← terug te vragen
  └─ saldo = r5a - r5b            ← te betalen (positive) or terug te vragen (negative)

  ↓
zetBtwAangifteOpSheet_(ss, aangifte, kwartaal, periode)
```

**IMPORTANT:** VF uses `[2]` (datum) for date filtering.
**IMPORTANT:** IF uses `[3]` (factuurdatum leverancier) for date filtering — NOT `[2]`.
**Tests:** `tests/unit/audit2.test.js` (2 tests for null-sheet safety)

---

## FLOW 4: SETUP / FIRST RUN

```
setup()                                       ← Setup.gs
  │
  ├─ GUARD: PROP.SETUP_DONE === 'true' → alertOfLog_ + return
  │
  ├─ [standalone] if no ss → create spreadsheet → return (user must re-run)
  │
  ├─ maakTabbladen_(ss)           ← create sheets if not exist (idempotent)
  ├─ verbergTechnischeTabbladen_  ← hide internal sheets
  ├─ vulGrootboekschema_(ss)      ← write 211 GL accounts
  ├─ zetInstellingen_(ss)         ← write default settings rows
  ├─ maakFormuliersTabbladen_(ss) ← create form response sheets
  ├─ maakHoofdFormulier_(ss)      ← create Google Form + save ID to PROP.FORM_HOOFD_ID
  │
  ├─ installeelTriggers_()        ← DESTRUCTIVE: deletes ALL triggers first!
  │   ├─ delete all project triggers
  │   ├─ create onOpen trigger for spreadsheet
  │   ├─ create verwerkHoofdformulier trigger for form (reads PROP.FORM_HOOFD_ID)
  │   └─ create dagelijkseTaken timer trigger (08:00 daily)
  │
  ├─ maakDriveStructuur_(jaar)    ← create Drive folder hierarchy
  ├─ slaDriverLinksOpInInstellingen_(jaar)
  │
  ├─ PropertiesService.setProperty(PROP.SETUP_DONE, 'true')
  └─ vernieuwDashboard()
```

**Idempotency:** maakTabbladen_ skips existing sheets; setup() itself blocked by PROP.SETUP_DONE guard.
**Danger:** installeelTriggers_() deletes ALL triggers — if it throws mid-execution, triggers are deleted but not recreated.
**Tests:** `tests/unit/audit2.test.js` (2 tests for idempotency guard)

---

## FLOW 5: RECURRING COSTS AUTO-POSTING

```
[Every dashboard refresh OR daily trigger]
  ↓
vernieuwDashboard()                           ← Dashboard.gs
  ↓
verwerkHerhalendeKosten_()                    ← HerhalendeKosten.gs
  │
  ├─ get sheet 'Herhalende Kosten' (null-safe)
  ├─ vandaag = new Date()
  │
  └─ FOR each row where status[8] === 'Actief':
      ├─ volgende = new Date(data[i][6])
      ├─ GUARD: isNaN(volgende.getTime()) → log warning + continue
      │
      ├─ if volgende <= vandaag:
      │   ├─ if auto[9] === 'Ja':
      │   │   └─ maakJournaalpost_(ss, {debet:rekening, credit:'1200', bedrag})
      │   └─ advance: berekenVolgendeDatum_(volgende, freq)
      │       └─ write new date to sheet[i+1, 7]
      │
      └─ add to komend[] if within 30 days

  RETURN: {geboekt: N, komend: [{naam, bedrag, datum, dagenTot}]}
```

**NO LockService** — race condition if two dashboard refreshes happen simultaneously.
**Date advance is immediate** — prevents double-booking on same-day re-run.
**Tests:** `tests/unit/audit2.test.js` (5 tests)

---

## FLOW 6: EXPENSE (KOSTEN) BOOKING

```
User fills dialog (type='kosten')
  ↓
verwerkNieuweBoeking('kosten', data)          ← BoekingEngine.gs
  ↓ valideerBoeking('kosten', data)
  ↓ _verwerkKosten_(ss, s, data)
  ↓
verwerkUitgavenUitHoofdformulier_(ss, data)   ← Triggers.gs
  │
  ├─ parseBedrag_ bedragIncl
  ├─ parseBtwTarief_(btwLabel) → numeric rate or null
  ├─ calculate bedragExcl, btwBedrag
  ├─ zoekOfMaakRelatie_(ss, leverancier, LEVERANCIER)
  ├─ volgendInkoopNummer_(ss)
  ├─ ss.getSheetByName(INKOOPFACTUREN).appendRow(inkoopData[20])
  ├─ maakJournaalpost_(ss, debet:kostenRek, credit:1200)
  └─ [if verlegd BTW] maakJournaalpost_(ss, debet:1400, credit:1500)
```

---

## FLOW 7: DUNNING (PAYMENT REMINDERS)

```
stuurAutomatischeBetalingsherinneringen_(ss)  ← Triggers.gs
  │
  ├─ scan VF sheet for OPEN (not BETAALD/GECREDITEERD) invoices
  ├─ per invoice: check vervaldatum[3]
  ├─ dagenOver = today - vervaldatum
  │
  ├─ read herinneringsStap_{factuurnummer} from ScriptProperties
  │   (0 = not sent yet)
  │
  ├─ STAP_DAGEN = [1, 7, 14]
  ├─ volgendeStap = count of STAP_DAGEN where dagenOver >= d
  ├─ if volgendeStap <= gestuurdeStap → skip (already sent this step)
  │
  ├─ haalRelatieEmail_(ss, klantId) → look up email in RELATIES[10]
  │
  ├─ GmailApp.sendEmail(email, subject, body, {attachments: [pdf]})
  │   └─ PDF from DriveApp.getFileById(extractFileId_(pdfUrl))
  │
  └─ props.setProperty(stapKey, volgendeStap) → mark step as sent
```

**Deduplication:** ScriptProperties key per-invoice tracks which step was last sent.
**PDF is optional:** try-catch around attachment; sends without if PDF missing.

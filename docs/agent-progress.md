# Agent Progress Log — boekhouding-engine

> Persistent handoff log. Each run appends one entry describing the
> scoped batch, what was changed and verified, and what the next run
> should pick up.

---

## 2026-04-15 — Phase 3J: Trusted invoice resend from factuurlijst

**Batch goal:**
Make resending an already-created invoice trustworthy and fast from the
factuurlijst dialog. Fix a latent sheet column bug, enrich the data
model with klant email, add a "Verstuur" button to each row, and reuse
the existing `stuurFactuurNaarEmailAdres(nr, email)` server function.

**Inspected:**
- `.claude/repo-map.md`, `flow-maps.md`, `invariants.md`, `sheet-schemas.md`, `test-map.md`
- `src/Verkoopfacturen.gs` (getFactuurlijstData + _bouwFactuurlijstHtml_)
- `src/Triggers.gs` (factuurData write order, haalRelatieEmail_)
- `src/Menu.gs` (factuur send menu item)
- `src/NieuweBoeking.gs` (inline Verstuur in succes-scherm — OK)
- Impact analysis: `getFactuurlijstData` (LOW), `stuurFactuurNaarEmailAdres` (MEDIUM)

**Changed (1 file + 1 new test file):**
- `src/Verkoopfacturen.gs`
  - `getFactuurlijstData`:
    - FIX: `pdfUrl` nu uit `r[19]` (PDF URL kolom) i.p.v. `r[17]` (Projectcode).
      Latente bug per `.claude/sheet-schemas.md` — was dormant omdat het veld
      nog niet in de render werd gebruikt, maar zou nu onzichtbaar de verkeerde
      kolom naar een "Verstuur" knop doorgeven.
    - Nieuwe `klantEmail` lookup via één-pass van RELATIES (klantId → email map),
      null-safe als RELATIES-tab ontbreekt.
    - Ook `klantId` (r[4]) meegegeven voor traceability.
  - `_bouwFactuurlijstHtml_`:
    - Nieuwe `.btn-verstuur` CSS-klasse (blauw, past bij bestaande betaal-knop).
    - Per rij: "✉ Verstuur" knop zichtbaar wanneer PDF aanwezig en status
      niet Gecrediteerd. Disabled look als PDF ontbreekt.
    - Nieuwe `verstuur(nr, bekendeEmail)` JS-functie: prompt met klant-email
      pre-gevuld → `stuurFactuurNaarEmailAdres(nr, email)` → toast + reload.
- `tests/unit/factuurlijst.test.js` (NIEUW, 6 tests)
  - pdfUrl uit r[19] (kolom-bug regressietest)
  - klantEmail via RELATIES[10] lookup
  - klantEmail leeg als klantId onbekend
  - Ontbrekende RELATIES-tab → geen crash
  - Sortering zet vervallen facturen bovenaan
  - Teller-correctheid (alle/open/vervallen/betaald)

**Verified:**
- `npm test` → **117 passed / 117 total** (was 111 baseline — +6 nieuwe tests)
- `npx eslint src/Verkoopfacturen.gs` → **0 errors**; 7 warnings, allemaal
  pre-existing (niet door deze batch geïntroduceerd)
- `npm run index` → 374 symbols, geen duplicaten
- Sheet-schemas.md column semantics opnieuw gevalideerd tegen
  `src/Triggers.gs` factuurData array (indices 0..22 één-op-één).

**Commit:** _pending_

**Blockers:** geen.

**Product verdict:** **pilot ready** — core invoice flow werkt,
succes-scherm kan mailen, en nu ook de factuurlijst. Betrouwbare
"resend later" was de laatste visible ontbrekende stap in de invoice-
lifecycle. Menu item "Factuur per e-mail versturen" wijst nog steeds
naar de oude `stuurVerkoopfactuurPdf()` met dubbele ui.prompt — dit is
de volgende run de voor de hand liggende opschoning (zie hieronder).

**Next recommended task (next run):**
Menu trust consolidatie.
1. `src/Menu.gs`: "Factuur per e-mail versturen" → herwijzen naar
   `openFactuurlijst` (en label bijwerken naar iets als
   "Factuurlijst & verzenden"), zodat de factuurlijst de enige trusted
   plek wordt voor post-hoc versturen.
2. `src/Verkoopfacturen.gs`: `stuurVerkoopfactuurPdf()` (het oude
   `ui.prompt`-tweemaal pad) verwijderen nadat zeker is dat het nergens
   meer als menu-target staat. Impact-analyse: alleen referenties
   zijn die in Menu.gs zelf.
3. Korte regressietest dat de menu-handler bestaat en een functie is.

**Also on the radar (not blocking):**
- `.claude/test-map.md` gap: `verwerkUitgavenUitHoofdformulier_` heeft
  nog geen integration test. Gekoppeld aan "Prove live invoice math"
  doelstelling voor kosten-flow.
- `berekenBtwAangifte_` volledige calculatie heeft alleen null-sheet
  tests — een happy-path test met 21%/9%/Vrijgesteld/Verlegd zou de
  legaal kritieke r1a/r1b/r1d/r1e classificatie beschermen.

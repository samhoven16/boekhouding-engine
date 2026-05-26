/**
 * tests/property/fuzz-factuur-payloads.test.js
 *
 * Laag 2 — Fuzz 100 willekeurige factuur-payloads tegen
 * verwerkInkomstenUitHoofdformulier_ via de bestaande integratie-harness.
 *
 * Classificatie:
 *   - SLAGEN              → returnt { ok: true, ... }
 *   - VERWACHTE-REJECT    → throw met klant-vriendelijke melding op
 *                          ongeldige input (lege regels, ongeldig bedrag,
 *                          ongeldige datum, duplicaat-factuurnr)
 *   - ONVERWACHTE-CRASH   → throw zonder klant-vriendelijke melding,
 *                          of een internal-style error (TypeError, ReferenceError,
 *                          undefined.method, etc.) — DIT zijn echte bugs.
 *
 * Stop-criterium: alleen onverwachte crashes tellen als bug. Verwachte rejects
 * zijn correct defensive design.
 */
'use strict';

const fc = require('fast-check');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ── Helpers (geleend van invoiceFlow.test.js) ────────────────────────────
function maakMockSpreadsheet(bestaandeRijen) {
  bestaandeRijen = bestaandeRijen || [['ID', 'Nr']];
  const mockRange = { setValue: () => {}, getValue: () => '' };
  const mockSheet = {
    appendRow:    () => {},
    getLastRow:   () => bestaandeRijen.length,
    getRange:     () => mockRange,
    getDataRange: () => ({ getValues: () => bestaandeRijen }),
  };
  return { getSheetByName: () => mockSheet };
}

function maakCtx() {
  return createGasRuntime(
    ['Config.gs', 'Utils.gs', 'BTW.gs', 'BoekingEngine.gs', 'Invariants.gs', 'Triggers.gs'],
    {
      volgendFactuurnummer_:        () => 1,
      zoekOfMaakRelatie_:           () => 'REL0001',
      maakJournaalpost_:            () => {},
      bepaalOmzetRekening_:         () => '8000',
      bepaalBtwVerkoopRekening_:    () => '1510',
      reserveerBtwOpSpaarpot_:      () => {},
      getInstelling_: (k) => ({
        'Factuurprefix': 'F',
        'Bedrijfsnaam':  'Test BV',
        'IBAN':          'NL91ABNA0417164300',
      })[k] || null,
      genereerFactuurPdf_:          () => 'https://drive.google.com/test',
      genereerUBL_:                 () => null,
      stuurFactuurEmailNaarKlant_:  () => true,
      vernieuwDashboard:            () => {},
      stuurFoutEmail_:              () => {},
      valideerFactuurnummerUniek_:  () => {},
      // PropertiesService email-idempotency stub
      // (geen state nodig — elke run is fris)
    }
  );
}

// ── Random factuur-payload generator ─────────────────────────────────────
// Bouwt diverse legitieme + edge-case payloads. Belangrijk: legitieme rejects
// (lege regels, prijs ≤ 0, datum onparseerbaar) horen bij correct gedrag,
// niet bij bugs. We classificeren ZIJ-aan-zij.

const arbPayload = fc.record({
  klantnaam: fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.constant('=HYPERLINK("evil","klik")'),         // formula-injection
    fc.constant('<script>alert(1)</script>'),         // XSS
    fc.constant('Klant met emoji 🎉 en ünïçödé'),
    fc.constant('A'.repeat(500)),                     // erg lang
  ),
  email: fc.oneof(
    fc.constant('klant@x.nl'),
    fc.constant(''),                                  // leeg = email overslaan
    fc.constant('niet-een-email'),
    fc.constant('test@.invalid'),
  ),
  datum: fc.oneof(
    fc.constant('2026-03-15'),
    fc.constant('15-03-2026'),
    fc.constant('31-02-2026'),                        // bestaat niet
    fc.constant('2030-12-31'),                        // ver in toekomst
    fc.constant(''),                                  // leeg
    fc.constant('gisteren'),                          // niet-parsable
  ),
  termijn: fc.oneof(fc.constant('14'), fc.constant('30'), fc.constant('0'), fc.constant('abc')),
  btwTarief: fc.constantFrom('21% (hoog)', '9% (laag)', '0%', 'Vrijgesteld', 'Verlegd'),
  korting: fc.oneof(fc.constant('0'), fc.constant('10'), fc.constant('-5'), fc.constant('99999')),
  directMailen: fc.constantFrom('Ja', 'Nee', 'ja', 'JA', ''),
  // Regels: 0-5 regels per factuur (0 = lege factuur, hoort te falen)
  regels: fc.array(
    fc.record({
      omschr: fc.string({ minLength: 0, maxLength: 80 }),
      aantal: fc.oneof(
        fc.constant('1'),
        fc.constant('0'),
        fc.constant('-1'),
        fc.constant('niet-een-getal'),
        fc.integer({ min: 1, max: 100 }).map(String),
      ),
      prijs: fc.oneof(
        fc.constant('100'),
        fc.constant('0'),
        fc.constant('-50'),
        fc.constant('niet-een-getal'),
        fc.double({ min: 0.01, max: 100000, noNaN: true, noDefaultInfinity: true }).map((n) => n.toFixed(2)),
        fc.constant('1.234,56'),                       // NL-formaat
      ),
    }),
    { minLength: 0, maxLength: 5 }
  ),
});

function bouwData(p) {
  const d = {
    'Klantnaam':                                p.klantnaam,
    'Klant e-mailadres':                        p.email,
    'Factuurdatum':                             p.datum,
    'Betalingstermijn (dagen)':                 p.termijn,
    'BTW tarief':                               p.btwTarief,
    'Korting (in €)':                           p.korting,
    'Notities op factuur':                      '',
    'Projectcode / Referentie':                 '',
    'Factuur direct e-mailen naar klant?':      p.directMailen,
    'Factuuradres klant':                       '',
    'KvK-nummer klant':                         '',
    'BTW-nummer klant':                         '',
  };
  p.regels.forEach((r, i) => {
    d['Regel ' + (i + 1) + ' – Omschrijving']                    = r.omschr;
    d['Regel ' + (i + 1) + ' – Aantal']                           = r.aantal;
    d['Regel ' + (i + 1) + ' – Prijs per eenheid (excl. BTW)']    = r.prijs;
  });
  return d;
}

/**
 * Classificeer een fout:
 *  - "verwachte-reject" = heeft een klant-vriendelijke message
 *  - "onverwachte-crash" = is een internal error (TypeError, undefined-toegang)
 */
function isOnverwachteCrash(err) {
  const m = String(err && err.message || '');
  if (!m) return true;
  // Internal-style error-namen
  if (/^(TypeError|ReferenceError|RangeError|SyntaxError):/.test(err.toString())) return true;
  // Stack-trace-leaks van "undefined" of "null"-property-toegang
  if (/Cannot read prop|undefined is not|null is not/.test(m)) return true;
  // Lege of generieke error
  if (m === 'Error' || m.length < 3) return true;
  // Klant-vriendelijk patroon: bevat duidelijke uitleg in NL
  return false;
}

describe('FUZZ: 100 willekeurige factuur-payloads', () => {
  test('Tel succes / verwachte reject / onverwachte crashes — alleen crashes zijn bugs', () => {
    const ctx = maakCtx();
    let slagen = 0;
    let verwachteReject = 0;
    let onverwachteCrash = 0;
    const crashVoorbeelden = [];

    const samples = fc.sample(arbPayload, { numRuns: 100 });
    samples.forEach((p) => {
      const ss = maakMockSpreadsheet();
      const data = bouwData(p);
      try {
        const r = ctx.verwerkInkomstenUitHoofdformulier_(ss, data);
        if (r && r.ok) slagen++;
        else verwachteReject++;
      } catch (e) {
        if (isOnverwachteCrash(e)) {
          onverwachteCrash++;
          if (crashVoorbeelden.length < 5) {
            crashVoorbeelden.push({
              fout: String(e.message || e),
              naam: e.toString().split(':')[0],
              payload: {
                klantnaam: p.klantnaam.slice(0, 30),
                regelsLen: p.regels.length,
                btw: p.btwTarief,
              },
            });
          }
        } else {
          verwachteReject++;
        }
      }
    });

    console.log('FUZZ resultaat: ' + slagen + ' slagen / ' +
      verwachteReject + ' verwachte-rejects / ' +
      onverwachteCrash + ' onverwachte-crashes (van 100)');
    if (onverwachteCrash > 0) {
      console.error('CRASH-voorbeelden:\n' +
        crashVoorbeelden.map((c) => '  - [' + c.naam + '] ' + c.fout + ' — ' +
          JSON.stringify(c.payload)).join('\n'));
    }
    // Stop-criterium: 0 onverwachte crashes
    expect(onverwachteCrash).toBe(0);
  });
});

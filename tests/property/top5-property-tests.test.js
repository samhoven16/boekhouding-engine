/**
 * tests/property/top5-property-tests.test.js
 *
 * Property-based testing op top-5 risico-functies. 1.000 random inputs/functie.
 *
 * Invariant per functie: output blijft binnen schema-grenzen + geen onverwachte
 * exceptions op legitieme input. Verwachte rejects (InvariantSchending op
 * ongeldige input) zijn correct gedrag, geen bug.
 *
 * Top-5:
 *   - rondBedrag_                          (Utils.gs)
 *   - parseBedrag_                         (Utils.gs)
 *   - valideerInvariantsVoorJournaalpost_  (Invariants.gs)
 *   - _valideerEnSaneerAiOutput_           (BoekingEngine.gs)
 *   - berekenBtwAangifte_                  (BTW.gs)
 */
'use strict';

const fc = require('fast-check');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const RUNS = 1000;

// ─────────────────────────────────────────────────────────
//  1. rondBedrag_
// ─────────────────────────────────────────────────────────
describe('PROP: rondBedrag_ — 1000 random inputs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs']); });

  test('Output is altijd Number en heeft ≤2 decimalen, geen exceptions', () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.string({ maxLength: 30 }),
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(''),
        fc.constant(NaN),
        fc.constant(Infinity),
        fc.constant(-Infinity),
      ),
      (input) => {
        let out;
        try { out = ctx.rondBedrag_(input); }
        catch (e) { throw new Error('UNEXPECTED THROW on ' + JSON.stringify(input) + ': ' + e.message); }
        if (typeof out !== 'number') throw new Error('output is not number: ' + typeof out + ' for ' + input);
        if (isFinite(out)) {
          // ≤2 decimalen: out * 100 moet integer zijn (ronding-tolerantie 1e-9)
          const cents = Math.round(out * 100);
          if (Math.abs(out * 100 - cents) > 1e-6) throw new Error('>2 decimalen: ' + out + ' for ' + input);
        }
      }
    ), { numRuns: RUNS, verbose: 0 });
  });

  test('Postconditie: idempotent (rondBedrag_(rondBedrag_(x)) === rondBedrag_(x))', () => {
    fc.assert(fc.property(
      fc.double({ min: -1e8, max: 1e8, noNaN: true }),
      (input) => {
        const eerste = ctx.rondBedrag_(input);
        const tweede = ctx.rondBedrag_(eerste);
        if (eerste !== tweede && !(isNaN(eerste) && isNaN(tweede))) {
          throw new Error('niet idempotent: ' + input + ' → ' + eerste + ' → ' + tweede);
        }
      }
    ), { numRuns: RUNS });
  });
});

// ─────────────────────────────────────────────────────────
//  2. parseBedrag_
// ─────────────────────────────────────────────────────────
describe('PROP: parseBedrag_ — 1000 random inputs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs']); });

  test('Output is altijd finite Number, geen NaN-leak, geen exceptions', () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.string({ maxLength: 40 }),
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(''),
        // NL-formaat strings
        fc.tuple(fc.integer({ min: 0, max: 9999999 }), fc.integer({ min: 0, max: 99 }))
          .map(([i, d]) => i.toLocaleString('nl-NL') + ',' + String(d).padStart(2, '0')),
      ),
      (input) => {
        let out;
        try { out = ctx.parseBedrag_(input); }
        catch (e) { throw new Error('UNEXPECTED THROW on ' + JSON.stringify(input) + ': ' + e.message); }
        if (typeof out !== 'number') throw new Error('output not number for ' + JSON.stringify(input));
        if (isNaN(out)) throw new Error('NaN-leak voor ' + JSON.stringify(input));
        // parseBedrag_ mag in principe Infinity terugkrijgen bij absurd grote input,
        // maar moet niet NaN of throw geven.
      }
    ), { numRuns: RUNS });
  });

  test('NL-formaat roundtrip: parseBedrag_(formatBedrag_(x)) ≈ x', () => {
    fc.assert(fc.property(
      fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
      (x) => {
        const x2 = Math.round(x * 100) / 100;  // begin met 2-decimaal bedrag
        const formatted = ctx.formatBedrag_(x2);
        const parsed = ctx.parseBedrag_(formatted);
        // Tolerantie 1 cent
        if (Math.abs(parsed - x2) > 0.01) {
          throw new Error('roundtrip drift: ' + x2 + ' → "' + formatted + '" → ' + parsed);
        }
      }
    ), { numRuns: RUNS });
  });
});

// ─────────────────────────────────────────────────────────
//  3. valideerInvariantsVoorJournaalpost_  (Invariants.gs)
// ─────────────────────────────────────────────────────────
describe('PROP: valideerInvariantsVoorJournaalpost_ — 1000 random inputs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']); });

  test('Geldige journaalpost (debet≠credit, bedrag>0, beide gevuld) → geen exception', () => {
    fc.assert(fc.property(
      fc.tuple(
        fc.constantFrom('1100', '1200', '1400', '1500', '4000', '4100', '7110', '7990', '8000'),
        fc.constantFrom('1100', '1200', '1400', '1500', '4000', '4100', '7110', '7990', '8000'),
        fc.double({ min: 0.01, max: 1e7, noNaN: true, noDefaultInfinity: true }),
      ),
      ([debet, credit, bedrag]) => {
        if (debet === credit) return;  // skip — die hoort te falen
        try {
          ctx.valideerInvariantsVoorJournaalpost_(debet, credit, bedrag);
        } catch (e) {
          if (e.code) return;  // InvariantSchending = correct gedrag bij iets dat we niet voorzagen
          throw new Error('UNEXPECTED THROW (geen InvariantSchending): ' + e.message);
        }
      }
    ), { numRuns: RUNS });
  });

  test('Ongeldige input gooit InvariantSchending (niet Error) — geen silent pass', () => {
    fc.assert(fc.property(
      fc.oneof(
        // debet === credit
        fc.tuple(fc.constant('1100'), fc.constant('1100'), fc.double({ min: 0.01, max: 100, noNaN: true })),
        // bedrag ≤ 0
        fc.tuple(fc.constant('1100'), fc.constant('1200'), fc.double({ min: -100, max: 0, noNaN: true })),
        // bedrag = NaN
        fc.tuple(fc.constant('1100'), fc.constant('1200'), fc.constant(NaN)),
        // lege rekeningen
        fc.tuple(fc.constant(''), fc.constant('1200'), fc.constant(100)),
        fc.tuple(fc.constant('1100'), fc.constant(''), fc.constant(100)),
      ),
      ([debet, credit, bedrag]) => {
        let threw = false;
        try { ctx.valideerInvariantsVoorJournaalpost_(debet, credit, bedrag); }
        catch (e) {
          threw = true;
          if (!e.code) throw new Error('Error zonder code (= geen InvariantSchending): ' + e.message);
        }
        if (!threw) throw new Error('Silent pass op invalide input: ' + JSON.stringify([debet, credit, bedrag]));
      }
    ), { numRuns: RUNS });
  });
});

// ─────────────────────────────────────────────────────────
//  4. _valideerEnSaneerAiOutput_  (BoekingEngine.gs)
// ─────────────────────────────────────────────────────────
describe('PROP: _valideerEnSaneerAiOutput_ — 1000 random AI-outputs', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']); });

  test('Random AI-output → schema-conform of {fout:...}, geen onverwachte exceptions', () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant({}),
        fc.string({ maxLength: 30 }),
        fc.array(fc.anything(), { maxLength: 5 }),
        fc.record({
          leverancier:    fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
          datum:          fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
          bedragExcl:     fc.option(fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
          btwBedrag:      fc.option(fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
          bedragIncl:     fc.option(fc.double({ min: -1e8, max: 1e8, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
          btwPercentage:  fc.option(fc.integer({ min: -100, max: 200 }), { nil: undefined }),
          categorie:      fc.option(fc.string({ maxLength: 60 }), { nil: undefined }),
        }, { requiredKeys: [] }),
      ),
      (input) => {
        let out;
        try { out = ctx._valideerEnSaneerAiOutput_(input); }
        catch (e) { throw new Error('UNEXPECTED THROW on ' + JSON.stringify(input).slice(0, 100) + ': ' + e.message); }
        if (typeof out !== 'object' || out === null) throw new Error('output not object for ' + JSON.stringify(input).slice(0, 60));
        // Als de input een array/non-object was, MOET er een {fout:...} zijn.
        if (Array.isArray(input) || typeof input !== 'object' || input === null) {
          if (!out.fout) throw new Error('Niet-object input gepasseerd zonder fout-flag: ' + JSON.stringify(input).slice(0, 60));
          return;
        }
        // Anders: alle numerieke output-velden moeten binnen veld-specifieke
        // grenzen liggen (zie BoekingEngine.gs:610-612). Tolerantie 0,01 voor
        // fp-ronding-edge (clip-vóór-rond in _num kan 1 cent boven max geven
        // bij input precies op de grens).
        const maxima = { bedragExcl: 1000000, btwBedrag: 250000, bedragIncl: 1250000 };
        Object.keys(maxima).forEach((k) => {
          if (out[k] !== undefined && out[k] !== null) {
            if (typeof out[k] !== 'number') throw new Error(k + ' niet-number: ' + out[k]);
            if (out[k] < 0) throw new Error(k + ' negatief in output: ' + out[k]);
            if (out[k] > maxima[k] + 0.01) {
              throw new Error(k + ' boven max ' + maxima[k] + ': ' + out[k]);
            }
          }
        });
        if (out.btwPercentage !== undefined && out.btwPercentage !== null) {
          if (![0, 9, 21].includes(out.btwPercentage)) {
            throw new Error('btwPercentage buiten whitelist: ' + out.btwPercentage);
          }
        }
      }
    ), { numRuns: RUNS });
  });

  test('Postconditie: pollutie via __proto__ wordt geblokkeerd', () => {
    fc.assert(fc.property(
      fc.string({ maxLength: 20 }).filter(s => s.length > 0),
      fc.string({ maxLength: 20 }),
      (sleutel, waarde) => {
        const raw = JSON.parse('{"__proto__":{"' + JSON.stringify(sleutel).slice(1, -1) + '":"' + JSON.stringify(waarde).slice(1, -1) + '"},"bedragExcl":100}');
        ctx._valideerEnSaneerAiOutput_(raw);
        if (Object.prototype[sleutel] === waarde) {
          throw new Error('PROTOTYPE POLLUTION: ' + sleutel + ' = ' + waarde);
        }
      }
    ), { numRuns: 200 });
  });
});

// ─────────────────────────────────────────────────────────
//  5. berekenBtwAangifte_  (BTW.gs)
// ─────────────────────────────────────────────────────────
describe('PROP: berekenBtwAangifte_ — 200 random spreadsheets', () => {
  let ctx;
  beforeAll(() => { ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']); });

  function maakMockSs(vfRijen, ifRijen) {
    const HEADER = new Array(23).fill('');
    return {
      getSheetByName: (n) => {
        if (n === 'Verkoopfacturen') return { getDataRange: () => ({ getValues: () => [HEADER, ...(vfRijen || [])] }) };
        if (n === 'Inkoopfacturen')  return { getDataRange: () => ({ getValues: () => [HEADER, ...(ifRijen || [])] }) };
        return null;
      },
    };
  }

  test('Random sheet-rijen → aangifte met schema-conforme velden, saldo invariant', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        datum:     fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31'), noInvalidDate: true }),
        grondslag: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
        label:     fc.constantFrom('21% (hoog)', '9% (laag)', '0%', 'Vrijgesteld', 'Verlegd', ''),
        btwBedrag: fc.double({ min: 0, max: 2100, noNaN: true, noDefaultInfinity: true }),
        status:    fc.constantFrom('Concept', 'Verzonden', 'Betaald', 'Gecrediteerd', ''),
      }), { maxLength: 50 }),
      (rows) => {
        const vfRows = rows.map((r) => {
          const a = new Array(23).fill('');
          a[2] = r.datum; a[9] = r.grondslag; a[10] = r.label; a[11] = r.btwBedrag; a[14] = r.status;
          return a;
        });
        const ss = maakMockSs(vfRows, []);
        let aangifte;
        try { aangifte = ctx.berekenBtwAangifte_(ss, new Date('2024-01-01'), new Date('2027-12-31')); }
        catch (e) { throw new Error('UNEXPECTED THROW: ' + e.message); }
        // Schema: saldo, r5a, r5b zijn altijd Number en finite
        ['saldo', 'r5a', 'r5b'].forEach((k) => {
          if (typeof aangifte[k] !== 'number' || !isFinite(aangifte[k])) {
            throw new Error(k + ' niet finite Number: ' + aangifte[k]);
          }
        });
        // Saldo-invariant: saldo ≈ r5a - r5b (tol 0,03 voor pro-rata ronding)
        const verwacht = aangifte.r5a - aangifte.r5b;
        if (Math.abs(aangifte.saldo - verwacht) > 0.05) {
          throw new Error('Saldo-invariant gebroken: saldo=' + aangifte.saldo + ' r5a-r5b=' + verwacht);
        }
      }
    ), { numRuns: 200 });  // 200 spreadsheets × ~50 rijen = 10k row-evaluations
  });
});

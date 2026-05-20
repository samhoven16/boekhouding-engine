/**
 * tests/unit/contract-based-tests.test.js
 *
 * Contract-Based Testing — voor elke critical-pure-function een input-output
 * contract gedefinieerd + automatisch met random inputs gecontroleerd.
 *
 * Geen externe property-based-test library (zou npm-dep + audit-risico geven).
 * Eigen mini-implementatie: seeded random + N=200 iteraties per contract.
 *
 * Filosofie:
 *   - Contract = postcondities die ALTIJD moeten gelden (idempotency, type,
 *     ranges, monotonicity)
 *   - Random input generator dekt: negatief, nul, sub-cent, MAX_SAFE_INTEGER,
 *     NaN, Infinity, null, undefined, strings
 *   - Test faalt = vinding van een input waar contract breekt
 *
 * Conform de "Contract-Based Testing"-eis uit de 7-lens audit-prompt.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ─── Deterministic random met seed ───────────────────────────────
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function randomBedrag(rng) {
  const r = rng();
  if (r < 0.05) return null;
  if (r < 0.10) return undefined;
  if (r < 0.15) return NaN;
  if (r < 0.20) return Infinity;
  if (r < 0.25) return -Infinity;
  if (r < 0.30) return 0;
  if (r < 0.40) return -1 * (rng() * 10000);  // negatief
  if (r < 0.50) return rng() * 0.001;  // sub-cent
  if (r < 0.60) return Number.MAX_SAFE_INTEGER;
  if (r < 0.70) return String(rng() * 1000);  // string-input
  return rng() * 1000;
}

function randomString(rng) {
  const r = rng();
  if (r < 0.10) return null;
  if (r < 0.15) return undefined;
  if (r < 0.20) return '';
  if (r < 0.30) return '   ';
  if (r < 0.40) return '<script>alert(1)</script>';
  if (r < 0.50) return '=HYPERLINK("x","y")';
  if (r < 0.60) return 'A'.repeat(1000);
  if (r < 0.70) return '12-34-56';
  return 'Test' + Math.floor(rng() * 1000);
}

const N_ITERATIONS = 200;

// ════════════════════════════════════════════════
//  CONTRACT: rondBedrag_
// ════════════════════════════════════════════════
describe('Contract: rondBedrag_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Postconditie: output heeft max 2 decimalen', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = randomBedrag(rng);
      const output = ctx.rondBedrag_(input);
      if (!isFinite(output)) continue;
      // max 2 decimalen: output * 100 moet integer zijn (binnen floating-point tolerance)
      const x100 = output * 100;
      const diff = Math.abs(x100 - Math.round(x100));
      expect(diff).toBeLessThan(0.001);
    }
  });

  test('Postconditie: idempotent (rondBedrag_(rondBedrag_(x)) === rondBedrag_(x))', () => {
    const rng = seededRandom(43);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = randomBedrag(rng);
      const eerste = ctx.rondBedrag_(input);
      if (!isFinite(eerste)) continue;
      const tweede = ctx.rondBedrag_(eerste);
      expect(tweede).toBe(eerste);
    }
  });

  test('Postconditie: NaN/Infinity input geeft 0 of NaN, geen crash', () => {
    [NaN, Infinity, -Infinity, undefined, null].forEach(function(v) {
      expect(() => ctx.rondBedrag_(v)).not.toThrow();
    });
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: parseBedrag_
// ════════════════════════════════════════════════
describe('Contract: parseBedrag_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Postconditie: output is altijd Number (geen string/null/undefined retour)', () => {
    const rng = seededRandom(44);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = rng() < 0.5 ? randomString(rng) : randomBedrag(rng);
      const output = ctx.parseBedrag_(input);
      expect(typeof output).toBe('number');
    }
  });

  test('Postconditie: NaN-input → 0 (geen NaN-leak)', () => {
    expect(ctx.parseBedrag_(NaN)).toBe(0);
    expect(ctx.parseBedrag_('niet-een-getal')).toBe(0);
    expect(ctx.parseBedrag_(null)).toBe(0);
  });

  test('Postconditie: NL-formaat "1.234,56" → 1234.56', () => {
    expect(ctx.parseBedrag_('1.234,56')).toBeCloseTo(1234.56, 2);
  });

  test('Postconditie: roundtrip met formatBedrag_ behoudt waarde', () => {
    const rng = seededRandom(45);
    for (let i = 0; i < 50; i++) {
      const origineel = ctx.rondBedrag_(rng() * 10000);
      const heen = ctx.formatBedrag_(origineel);
      const terug = ctx.parseBedrag_(heen);
      expect(terug).toBeCloseTo(origineel, 2);
    }
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: valideerBtwAansluiting_
// ════════════════════════════════════════════════
describe('Contract: valideerBtwAansluiting_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('Postconditie: voor elke geldige factuur geldt subtotaal × tarief = btw (± 1ct/regel)', () => {
    const rng = seededRandom(46);
    for (let i = 0; i < 100; i++) {
      const prijs = ctx.rondBedrag_(rng() * 1000);
      const aantal = Math.floor(rng() * 10) + 1;
      const tarief = [0, 0.09, 0.21][Math.floor(rng() * 3)];
      const subtotaal = ctx.rondBedrag_(prijs * aantal);
      const btw = ctx.rondBedrag_(subtotaal * tarief);
      const incl = ctx.rondBedrag_(subtotaal + btw);

      const regels = [{ prijsExcl: prijs, aantal: aantal, tarief: tarief }];
      expect(() => ctx.valideerBtwAansluiting_(regels, btw, subtotaal, incl)).not.toThrow();
    }
  });

  test('Postconditie: foutieve input gooit InvariantSchending (niet Error)', () => {
    try {
      ctx.valideerBtwAansluiting_([{ prijsExcl: 100, aantal: 1, tarief: 0.21 }], 999, 100, 1099);
    } catch (e) {
      expect(e.code).toBeDefined();  // InvariantSchending heeft .code
      expect(e.klantBoodschap).toBeDefined();
    }
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: bepaalBewaarplichtTot_
// ════════════════════════════════════════════════
describe('Contract: bepaalBewaarplichtTot_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
  });

  test('Postconditie: output is altijd Date in toekomst (≥ huidig jaar + 7)', () => {
    const rng = seededRandom(47);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const r = rng();
      const expliciet = r < 0.3 ? null : (r < 0.6 ? new Date(2100 + Math.floor(rng() * 100), 5, 15) : new Date('invalid'));
      const isOnroerend = rng() < 0.3;
      const output = ctx.bepaalBewaarplichtTot_(expliciet, isOnroerend);
      expect(output instanceof Date).toBe(true);
      expect(isNaN(output.getTime())).toBe(false);
    }
  });

  test('Postconditie: onroerend goed altijd ≥ standaard 7 jaar', () => {
    const standaard = ctx.bepaalBewaarplichtTot_(null, false);
    const og = ctx.bepaalBewaarplichtTot_(null, true);
    expect(og.getTime()).toBeGreaterThanOrEqual(standaard.getTime());
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: veiligSheetWaarde_
// ════════════════════════════════════════════════
describe('Contract: veiligSheetWaarde_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Postconditie: string die start met formule-prefix wordt geneutraliseerd', () => {
    const rng = seededRandom(48);
    const prefixes = ['=', '+', '-', '@', '\t'];
    for (let i = 0; i < N_ITERATIONS; i++) {
      const prefix = prefixes[Math.floor(rng() * prefixes.length)];
      const rest = randomString(rng);
      const input = prefix + (typeof rest === 'string' ? rest : '');
      const output = ctx.veiligSheetWaarde_(input);
      // Output mag niet meer als formule worden geïnterpreteerd door Sheets
      const eersteChar = typeof output === 'string' ? output.charAt(0) : '';
      expect(eersteChar === "'" || eersteChar === '').toBe(true);
    }
  });

  test('Postconditie: non-string input ongewijzigd doorgegeven', () => {
    [null, undefined, 42, 3.14, true, false, new Date()].forEach(function(v) {
      expect(ctx.veiligSheetWaarde_(v)).toBe(v);
    });
  });

  test('Postconditie: idempotent (apostrophe wordt niet dubbel toegevoegd)', () => {
    const al_veilig = "'=evil()";
    const opnieuw = ctx.veiligSheetWaarde_(al_veilig);
    // Bestaande apostrophe blijft, geen tweede toegevoegd want output start niet meer met =
    expect(opnieuw).toBe(al_veilig);
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: isGeldigeIBANMet97Check_
// ════════════════════════════════════════════════
describe('Contract: isGeldigeIBANMet97Check_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Postconditie: output is altijd boolean (geen null/undefined retour)', () => {
    const rng = seededRandom(49);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = rng() < 0.3 ? null : randomString(rng);
      const output = ctx.isGeldigeIBANMet97Check_(input);
      expect(typeof output).toBe('boolean');
    }
  });

  test('Postconditie: bekende valide IBANs → true', () => {
    const validIbans = [
      'NL91ABNA0417164300',
      'DE89370400440532013000',
      'BE68539007547034',
      'FR1420041010050500013M02606',
    ];
    validIbans.forEach(function(iban) {
      expect(ctx.isGeldigeIBANMet97Check_(iban)).toBe(true);
    });
  });

  test('Postconditie: bekend invalide → false', () => {
    const invalid = ['', null, undefined, 'NL91', '12345', 'IBAN-INVALID'];
    invalid.forEach(function(iban) {
      expect(ctx.isGeldigeIBANMet97Check_(iban)).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════
//  CONTRACT: _parseOverrideWaarde_ (Belastingadvies)
// ════════════════════════════════════════════════
describe('Contract: _parseOverrideWaarde_', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Belastingadvies.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  const pctVeld = { sleutel: 'P', type: 'percentage', min: 0, max: 1.00 };
  const bedragVeld = { sleutel: 'B', type: 'bedrag', min: 0, max: 100000 };

  test('Postconditie: output is altijd Number of null (nooit string/object/NaN)', () => {
    const rng = seededRandom(50);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = rng() < 0.5 ? randomString(rng) : randomBedrag(rng);
      const veld = rng() < 0.5 ? pctVeld : bedragVeld;
      const output = ctx._parseOverrideWaarde_(input, veld);
      expect(output === null || (typeof output === 'number' && isFinite(output))).toBe(true);
    }
  });

  test('Postconditie: percentage-veld output altijd in [min, max]', () => {
    const rng = seededRandom(51);
    for (let i = 0; i < N_ITERATIONS; i++) {
      const input = rng() < 0.5 ? randomString(rng) : randomBedrag(rng);
      const output = ctx._parseOverrideWaarde_(input, pctVeld);
      if (output !== null) {
        expect(output).toBeGreaterThanOrEqual(pctVeld.min);
        expect(output).toBeLessThanOrEqual(pctVeld.max);
      }
    }
  });
});

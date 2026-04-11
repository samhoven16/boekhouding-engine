/**
 * tests/unit/boekingEngine.test.js
 *
 * Unit tests voor pure functies in BoekingEngine.gs, Utils.gs en Config.gs.
 * Geen GAS service calls — draait in <100ms zonder netwerkverbinding of spreadsheet.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// Laad alleen wat nodig is voor pure-functie tests
let ctx;
beforeAll(() => {
  ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BoekingEngine.gs']);
});

// ──────────────────────────────────────────────────────────────────────────────
//  valideerBoeking
// ──────────────────────────────────────────────────────────────────────────────
describe('valideerBoeking', () => {
  describe('factuur', () => {
    test('geldige factuur slaagt', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant:    'ACME BV',
        datum:    '2024-01-15',
        r1prijs:  '100',
        r1omschr: 'Advies diensten',
      });
      expect(result.ok).toBe(true);
      expect(result.fouten).toHaveLength(0);
    });

    test('lege klantnaam geeft fout', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant:    '',
        datum:    '2024-01-15',
        r1prijs:  '100',
        r1omschr: 'Advies',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'klant')).toBe(true);
    });

    test('ongeldige datum geeft fout', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant:    'ACME BV',
        datum:    '15-01-2024',  // NL formaat — verwacht ISO
        r1prijs:  '100',
        r1omschr: 'Advies',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'datum')).toBe(true);
    });

    test('prijs nul geeft fout', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant:    'ACME BV',
        datum:    '2024-01-15',
        r1prijs:  '0',
        r1omschr: 'Advies',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'r1prijs')).toBe(true);
    });

    test('lege omschrijving geeft fout', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant:    'ACME BV',
        datum:    '2024-01-15',
        r1prijs:  '100',
        r1omschr: 'X',  // te kort (< 2 tekens)
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'r1omschr')).toBe(true);
    });

    test('meerdere fouten tegelijk', () => {
      const result = ctx.valideerBoeking('factuur', {
        klant: '', datum: 'verkeerd', r1prijs: '0', r1omschr: '',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('kosten', () => {
    test('geldige kosten slaagt', () => {
      const result = ctx.valideerBoeking('kosten', {
        leverancier: 'Coolblue',
        datum:       '2024-03-01',
        omschr:      'Laptop aankoop',
        bedragIncl:  '1299',
      });
      expect(result.ok).toBe(true);
    });

    test('ontbrekende leverancier geeft fout', () => {
      const result = ctx.valideerBoeking('kosten', {
        leverancier: 'X',  // te kort
        datum:       '2024-03-01',
        omschr:      'Laptop',
        bedragIncl:  '1299',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'leverancier')).toBe(true);
    });

    test('bedrag nul geeft fout', () => {
      const result = ctx.valideerBoeking('kosten', {
        leverancier: 'Coolblue',
        datum:       '2024-03-01',
        omschr:      'Laptop aankoop',
        bedragIncl:  '0',
      });
      expect(result.ok).toBe(false);
      expect(result.fouten.some(f => f.veld === 'bedragIncl')).toBe(true);
    });
  });

  describe('declaratie', () => {
    test('geldige declaratie slaagt', () => {
      const result = ctx.valideerBoeking('declaratie', {
        omschr: 'Treinticket klantbezoek',
        datum:  '2024-02-20',
        bedrag: '42.50',
      });
      expect(result.ok).toBe(true);
    });

    test('onbekend type geeft lege foutlijst terug', () => {
      // Onbekend type → geen validatieregels → altijd ok
      const result = ctx.valideerBoeking('onbekend_type', {});
      expect(result.ok).toBe(true);
      expect(result.fouten).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  berekenBtw
// ──────────────────────────────────────────────────────────────────────────────
describe('berekenBtw', () => {
  test('21% tarief op excl bedrag', () => {
    const r = ctx.berekenBtw('21% (hoog)', 100, 0);
    expect(r.excl).toBe(100);
    expect(r.btw).toBe(21);
    expect(r.incl).toBe(121);
    expect(r.tarief).toBeCloseTo(0.21);
  });

  test('9% tarief op excl bedrag', () => {
    const r = ctx.berekenBtw('9% (laag)', 100, 0);
    expect(r.excl).toBe(100);
    expect(r.btw).toBe(9);
    expect(r.incl).toBe(109);
    expect(r.tarief).toBeCloseTo(0.09);
  });

  test('Vrijgesteld → btw nul, tarief null', () => {
    const r = ctx.berekenBtw('Vrijgesteld', 100, 0);
    expect(r.btw).toBe(0);
    expect(r.tarief).toBeNull();
    expect(r.excl).toBe(100);
  });

  test('Verlegd → btw nul, tarief null', () => {
    const r = ctx.berekenBtw('Verlegd', 200, 0);
    expect(r.btw).toBe(0);
    expect(r.tarief).toBeNull();
  });

  test('0% nultarief → btw nul, tarief 0', () => {
    const r = ctx.berekenBtw('0% (nultarief)', 100, 0);
    expect(r.btw).toBe(0);
    expect(r.excl).toBe(100);
  });

  test('incl bedrag terugrekenen naar excl (21%)', () => {
    const r = ctx.berekenBtw('21% (hoog)', 0, 121);
    expect(r.incl).toBe(121);
    expect(r.excl).toBeCloseTo(100, 1);
    expect(r.btw).toBeCloseTo(21, 1);
  });

  test('incl bedrag terugrekenen naar excl (9%)', () => {
    const r = ctx.berekenBtw('9% (laag)', 0, 109);
    expect(r.incl).toBe(109);
    expect(r.excl).toBeCloseTo(100, 1);
    expect(r.btw).toBeCloseTo(9, 1);
  });

  test('nul bedrag → alles nul', () => {
    const r = ctx.berekenBtw('21% (hoog)', 0, 0);
    expect(r.excl).toBe(0);
    expect(r.btw).toBe(0);
    expect(r.incl).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  saniteer_
// ──────────────────────────────────────────────────────────────────────────────
describe('saniteer_', () => {
  test('normale string blijft ongewijzigd', () => {
    expect(ctx.saniteer_('Factuur voor advies')).toBe('Factuur voor advies');
  });

  test('spaties worden getrimd', () => {
    expect(ctx.saniteer_('  ACME BV  ')).toBe('ACME BV');
  });

  test('formule-injectie via = wordt geblokkeerd', () => {
    const result = ctx.saniteer_('=CMD("rm -rf /")');
    expect(result.startsWith("'")).toBe(true);
    expect(result).not.toBe('=CMD("rm -rf /")');
  });

  test('formule-injectie via + wordt geblokkeerd', () => {
    const result = ctx.saniteer_('+1+1');
    expect(result.startsWith("'")).toBe(true);
  });

  test('null geeft lege string', () => {
    expect(ctx.saniteer_(null)).toBe('');
  });

  test('undefined geeft lege string', () => {
    expect(ctx.saniteer_(undefined)).toBe('');
  });

  test('getal wordt naar string geconverteerd', () => {
    expect(ctx.saniteer_(42)).toBe('42');
  });

  test('XSS-poging via scriptag blijft als tekst (geen HTML-escape in saniteer_)', () => {
    // saniteer_ beschermt tegen sheet-injectie, niet XSS — dat is escHtml_
    const r = ctx.saniteer_('<script>alert(1)</script>');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  saniteerGetal_
// ──────────────────────────────────────────────────────────────────────────────
describe('saniteerGetal_', () => {
  test('getal als string parst correct', () => {
    expect(ctx.saniteerGetal_('42.50')).toBe(42.50);
  });

  test('komma als decimaalscheidingsteken', () => {
    expect(ctx.saniteerGetal_('42,50')).toBe(42.50);
  });

  test('null geeft nul', () => {
    expect(ctx.saniteerGetal_(null)).toBe(0);
  });

  test('leeg geeft nul', () => {
    expect(ctx.saniteerGetal_('')).toBe(0);
  });

  test('NaN string geeft nul', () => {
    expect(ctx.saniteerGetal_('abc')).toBe(0);
  });

  test('getal als getal blijft getal', () => {
    expect(ctx.saniteerGetal_(99.99)).toBe(99.99);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  parseBedrag_ (Utils.gs)
// ──────────────────────────────────────────────────────────────────────────────
describe('parseBedrag_', () => {
  test('normaal getal', () => {
    expect(ctx.parseBedrag_('100.50')).toBe(100.50);
  });

  test('€-teken wordt genegeerd', () => {
    expect(ctx.parseBedrag_('€ 99,95')).toBe(99.95);
  });

  test('duizendtal punt + komma decimaal', () => {
    expect(ctx.parseBedrag_('1.234,56')).toBe(1234.56);
  });

  test('null geeft nul', () => {
    expect(ctx.parseBedrag_(null)).toBe(0);
  });

  test('getal als getal', () => {
    expect(ctx.parseBedrag_(42)).toBe(42);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  rondBedrag_ (Utils.gs)
// ──────────────────────────────────────────────────────────────────────────────
describe('rondBedrag_', () => {
  test('2 decimalen afronden', () => {
    // 1.555 rondt correct af naar 1.56 (geen IEEE 754 kantgeval)
    expect(ctx.rondBedrag_(1.555)).toBeCloseTo(1.56, 2);
    // 1.5 → 1.5 (ongewijzigd)
    expect(ctx.rondBedrag_(1.5)).toBe(1.5);
  });

  test('reeds afgerond blijft hetzelfde', () => {
    expect(ctx.rondBedrag_(100)).toBe(100);
  });

  test('string naar getal', () => {
    expect(ctx.rondBedrag_('42.5')).toBe(42.5);
  });

  test('NaN string geeft nul', () => {
    expect(ctx.rondBedrag_('abc')).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  escHtml_ (Utils.gs)
// ──────────────────────────────────────────────────────────────────────────────
describe('escHtml_', () => {
  test('script-tag wordt geëscaped', () => {
    expect(ctx.escHtml_('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('ampersand wordt geëscaped', () => {
    expect(ctx.escHtml_('Laan & Zonen')).toBe('Laan &amp; Zonen');
  });

  test('aanhalingstekens worden geëscaped', () => {
    expect(ctx.escHtml_('"test"')).toBe('&quot;test&quot;');
  });

  test('null geeft lege string', () => {
    expect(ctx.escHtml_(null)).toBe('');
  });

  test('gewone tekst blijft ongewijzigd', () => {
    expect(ctx.escHtml_('Boekhouding Engine')).toBe('Boekhouding Engine');
  });
});

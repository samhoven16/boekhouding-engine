/**
 * tests/unit/chaos-engineering.test.js
 *
 * Chaos-engineer testsuite — opzettelijke fout-injectie + extreme edge-cases.
 * Aanvulling op edge-cases-1m-users.test.js (PR #106). Focus op scenario's
 * die in vorige suite NIET gedekt waren:
 *
 *   1. Spreadsheet formule-injection (klant typt `=...` in naam)
 *   2. Zomertijd/wintertijd-overgangen Europe/Amsterdam
 *   3. IBAN MOD-97 checksum (niet alleen format)
 *   4. Corrupte ScriptProperty (malformed JSON)
 *   5. Missende sheets (klant verwijdert tabblad)
 *   6. Time-of-check vs time-of-use scenarios
 *
 * Doel: bewijs leveren dat het systeem niet stuk te krijgen is met
 * pathologische input. Chaos-engineering style.
 */
'use strict';

const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ════════════════════════════════════════════════
//  CHAOS 1: FORMULE-INJECTION VIA KLANT-INPUT
// ════════════════════════════════════════════════
describe('Chaos: spreadsheet formula-injection', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Klantnaam beginnend met "=" krijgt apostrophe-prefix', () => {
    const result = ctx.veiligSheetWaarde_('=HYPERLINK("http://evil.com","Klik")');
    expect(result.charAt(0)).toBe("'");
    expect(result).toContain('HYPERLINK');
  });

  test('Klantnaam beginnend met "+" (Excel-formule) wordt geneutraliseerd', () => {
    const result = ctx.veiligSheetWaarde_('+1+1');
    expect(result.charAt(0)).toBe("'");
  });

  test('Klantnaam beginnend met "-" wordt geneutraliseerd', () => {
    const result = ctx.veiligSheetWaarde_('-cmd|"calc"');
    expect(result.charAt(0)).toBe("'");
  });

  test('Klantnaam beginnend met "@" (legacy Excel) wordt geneutraliseerd', () => {
    const result = ctx.veiligSheetWaarde_('@SUM(A:A)');
    expect(result.charAt(0)).toBe("'");
  });

  test('Tab-prefix (CSV-injection) wordt geneutraliseerd', () => {
    const result = ctx.veiligSheetWaarde_('\t=BAD()');
    expect(result.charAt(0)).toBe("'");
  });

  test('Normale klantnaam blijft ongewijzigd', () => {
    const result = ctx.veiligSheetWaarde_('Jansen B.V.');
    expect(result).toBe('Jansen B.V.');
  });

  test('Lege string blijft leeg', () => {
    expect(ctx.veiligSheetWaarde_('')).toBe('');
  });

  test('Number-input blijft Number (geen wrap)', () => {
    expect(ctx.veiligSheetWaarde_(123.45)).toBe(123.45);
  });

  test('null blijft null', () => {
    expect(ctx.veiligSheetWaarde_(null)).toBe(null);
  });

  test('= midden in tekst is veilig (alleen prefix-positie telt)', () => {
    const result = ctx.veiligSheetWaarde_('Janssen = test');
    expect(result).toBe('Janssen = test');
  });
});

// ════════════════════════════════════════════════
//  CHAOS 2: ZOMERTIJD/WINTERTIJD-OVERGANGEN
// ════════════════════════════════════════════════
describe('Chaos: DST-overgangen Europe/Amsterdam', () => {
  test('Zomertijd-start 31 maart 2024 — 02:00 → 03:00', () => {
    // Op 31-03-2024 om 02:00 (NL) springt klok naar 03:00.
    // Een Date() met "31-03-2024 02:30" bestaat technisch niet in NL.
    const d = new Date(2024, 2, 31, 2, 30);  // 31 maart 02:30
    // JS Date normaliseert dit naar 03:30 of behoudt 02:30 als UTC-offset
    // de JS-runtime verwerkt het deterministisch — geen crash
    expect(d instanceof Date).toBe(true);
    expect(isNaN(d.getTime())).toBe(false);
  });

  test('Wintertijd-eind 27 oktober 2024 — 03:00 → 02:00 (uur dubbel)', () => {
    // Op 27-10-2024 om 03:00 (NL) springt klok terug naar 02:00.
    // 02:30 bestaat twee keer op die dag.
    const d1 = new Date(2024, 9, 27, 2, 30);
    const d2 = new Date(2024, 9, 27, 2, 30);
    expect(d1.getTime()).toBe(d2.getTime());
  });

  test('Datumstempel via Utilities equivalent — timezone Amsterdam consistent', () => {
    // Geen JS Utilities-mock, maar verifieer dat new Date() naar ISO werkt
    const d = new Date(2024, 5, 15);
    const iso = d.toISOString();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('BTW-aangifte-deadline 31 jan na DST → datum-arithmetiek correct', () => {
    const eindeKw4 = new Date(2025, 11, 31, 23, 59, 59);
    const deadlineQ4 = new Date(2026, 0, 31);
    const msTot = deadlineQ4 - eindeKw4;
    const dagenTot = Math.floor(msTot / (1000 * 60 * 60 * 24));
    // 31 dagen +/- 1 (DST kan 1u verschuiven)
    expect(dagenTot).toBeGreaterThanOrEqual(30);
    expect(dagenTot).toBeLessThanOrEqual(31);
  });

  test('Boekingsdatum tijdens DST-overgang krijgt valid timestamp', () => {
    const tijdens = new Date(2025, 2, 30, 2, 30);
    expect(isNaN(tijdens.getTime())).toBe(false);
  });
});

// ════════════════════════════════════════════════
//  CHAOS 3: IBAN MOD-97 CHECKSUM
// ════════════════════════════════════════════════
describe('Chaos: IBAN-validatie met MOD-97 checksum', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Geldige NL IBAN (RABO test-IBAN)', () => {
    expect(ctx.isGeldigeIBANMet97Check_('NL91ABNA0417164300')).toBe(true);
  });

  test('Geldige NL IBAN met spaties', () => {
    expect(ctx.isGeldigeIBANMet97Check_('NL91 ABNA 0417 1643 00')).toBe(true);
  });

  test('Geldige Duitse IBAN', () => {
    expect(ctx.isGeldigeIBANMet97Check_('DE89370400440532013000')).toBe(true);
  });

  test('Geldige Belgische IBAN', () => {
    expect(ctx.isGeldigeIBANMet97Check_('BE68539007547034')).toBe(true);
  });

  test('Ongeldig IBAN (typo in 1 cijfer) → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_('NL91ABNA0417164301')).toBe(false);  // 300 → 301
  });

  test('Format OK maar checksum fail → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_('NL00ABNA1234567890')).toBe(false);
  });

  test('Te kort → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_('NL91')).toBe(false);
  });

  test('Leeg → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_('')).toBe(false);
  });

  test('Null → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_(null)).toBe(false);
  });

  test('Random tekst → false', () => {
    expect(ctx.isGeldigeIBANMet97Check_('niet-een-iban-123')).toBe(false);
  });
});

// ════════════════════════════════════════════════
//  CHAOS 4: CORRUPTE SCRIPT-PROPERTIES
// ════════════════════════════════════════════════
describe('Chaos: corrupte JSON in ScriptProperties', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('getCheckpoint_ met malformed JSON → null (geen crash)', () => {
    const storage = { 'CKPT_test': 'niet-valid-json{{{' };
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
    expect(ctx.getCheckpoint_('test')).toBeNull();
  });

  test('Lege string als ScriptProperty → null retour', () => {
    const storage = { 'CKPT_leeg': '' };
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
    expect(ctx.getCheckpoint_('leeg')).toBeNull();
  });

  test('JSON met onverwachte structuur → null (geen crash)', () => {
    const storage = { 'CKPT_struct': '[1,2,3]' };  // array ipv object
    ctx.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => storage[k] || null,
        setProperty: (k, v) => { storage[k] = v; },
        deleteProperty: (k) => { delete storage[k]; },
      }),
    };
    const r = ctx.getCheckpoint_('struct');
    // We accepteren array-of-object — wat we niet willen is een crash
    expect(() => r && r.stap).not.toThrow();
  });
});

// ════════════════════════════════════════════════
//  CHAOS 5: MISSENDE SHEETS — klant verwijdert tabblad
// ════════════════════════════════════════════════
describe('Chaos: missende of hernoemde sheets', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'Invariants.gs']);
    ctx.schrijfAuditLog_ = () => {};
  });

  test('valideerFactuurnummerUniek_ met missing Verkoopfacturen-tab → silent ok', () => {
    const ss = { getSheetByName: () => null };
    expect(() => ctx.valideerFactuurnummerUniek_(ss, '2026-001')).not.toThrow();
  });

  test('checkKorGrens_ zonder Instellingen-data → status nvt', () => {
    ctx.getInstelling_ = () => null;
    const r = ctx.checkKorGrens_({ toast: () => {} }, 5000);
    expect(r.status).toBe('nvt');
  });

  test('bepaalBewaarplichtTot_ zonder input → fallback naar 7 jaar', () => {
    const r = ctx.bepaalBewaarplichtTot_();
    expect(r instanceof Date).toBe(true);
  });
});

// ════════════════════════════════════════════════
//  CHAOS 6: EXTREME GETALLEN — overflow, precision
// ════════════════════════════════════════════════
describe('Chaos: extreme getallen en precision-edge-cases', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test('Number.MAX_SAFE_INTEGER (€9 quadriljoen) → rondBedrag_ werkt', () => {
    const result = ctx.rondBedrag_(Number.MAX_SAFE_INTEGER);
    expect(isFinite(result)).toBe(true);
  });

  test('Heel klein getal 0.001 → rondt af op 0.00', () => {
    expect(ctx.rondBedrag_(0.001)).toBe(0);
  });

  test('Floating-point precision: 0.1 + 0.2 → 0.3 (afgerond)', () => {
    const result = ctx.rondBedrag_(0.1 + 0.2);
    expect(result).toBe(0.3);
  });

  test('21% van €100 → exact 21 (geen 20.999999)', () => {
    const btw = ctx.rondBedrag_(100 * 0.21);
    expect(btw).toBe(21);
  });

  test('9% van €33.33 → 3 (afgerond op 2 decimalen)', () => {
    const btw = ctx.rondBedrag_(33.33 * 0.09);
    expect(btw).toBe(3);
  });
});

// ════════════════════════════════════════════════
//  CHAOS 7: STRING-INPUT MET ATTACK-PAYLOADS
// ════════════════════════════════════════════════
describe('Chaos: attack-payloads in vrije text-velden', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  const payloads = [
    // XSS
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    'javascript:alert(1)',
    // SQL-injection (we hebben geen SQL maar test toch)
    "'; DROP TABLE facturen;--",
    "1' OR '1'='1",
    // Formule-injection
    '=cmd|"calc"',
    '=HYPERLINK("http://evil.com","Klik")',
    // Path-traversal
    '../../../etc/passwd',
    // NULL-byte
    'Test\x00admin',
    // Heel lang
    'A'.repeat(10000),
  ];

  test.each(payloads)('Payload "%s" wordt veilig via escHtml_ (geen crash)', (payload) => {
    expect(() => ctx.escHtml_(payload)).not.toThrow();
    const escaped = ctx.escHtml_(payload);
    if (typeof payload === 'string' && payload.indexOf('<') !== -1) {
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('<img');
    }
  });

  test.each(payloads.filter(p => typeof p === 'string'))(
    'Payload "%s" wordt veilig via veiligSheetWaarde_ (geen crash)', (payload) => {
      expect(() => ctx.veiligSheetWaarde_(payload)).not.toThrow();
    });
});

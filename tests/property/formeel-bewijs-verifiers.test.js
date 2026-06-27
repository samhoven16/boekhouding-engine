/**
 * tests/property/formeel-bewijs-verifiers.test.js
 *
 * Sluit de dekkingsgat-helft van het formele bewijs. De bestaande
 * formeel-bewijs-invarianten.test.js test 5 axioma's (I₁,I₄,I₆,I₇,I₁₀) —
 * en zelfs die via een PARALLELLE her-implementatie van de wiskunde, niet
 * via de echte verifier-functies. De andere 5 (I₂,I₃,I₅,I₈,I₉) hadden
 * géén property-dekking. Juist de geld-/belasting-kritische verifiers
 * (grootboek-consistentie, balans-wet, BTW-aangifte sluitend) zaten
 * ongetest — terwijl ze jaarafsluiting en BTW-indiening blokkeren.
 *
 * Deze suite drijft de ECHTE `_bewijs_Ix_(ss)`-functies uit FormeelBewijs.gs
 * met geconstrueerde mock-spreadsheets: een consistente staat MOET slagen
 * (geldig), een bewust gecorrumpeerde staat MOET als schending gedetecteerd
 * worden. Dat verifieert de verifier zelf — het schild, niet een kopie ervan.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

// Eén runtime; Date = host-Date zodat `datum instanceof Date` in I₈ klopt.
const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'FormeelBewijs.gs'], { Date });

// ── mock-spreadsheet ──────────────────────────────────────────
function mockSheet(rows) {
  return { getLastRow: () => rows.length, getDataRange: () => ({ getValues: () => rows }) };
}
function mockSs(sheets) {
  return { getSheetByName: (naam) => (sheets[naam] ? mockSheet(sheets[naam]) : null) };
}
// Journaalpost-rij: [0]=id [1]=datum [4]=debet [6]=credit [8]=bedrag [15]=aangemaakt-op [16]=status
// ([14]=Notities; aangemaakt-op staat op [15] — F-FB-340: I8 las voorheen abusievelijk [14].)
function jpRow(o) {
  const r = new Array(19).fill('');
  r[0] = o.id || 'J'; r[1] = o.datum || ''; r[4] = o.debet || ''; r[6] = o.credit || '';
  r[8] = (o.bedrag != null ? o.bedrag : 0); r[15] = o.aangemaakt || ''; r[16] = o.status || '';
  return r;
}
// Grootboek-rij: [0]=code [2]=type(Actief/Passief) [4]=bw(Balans/WenV) [5]=saldo
function gbRow(o) {
  const r = new Array(6).fill('');
  r[0] = o.code || ''; r[2] = o.type || ''; r[4] = o.bw || ''; r[5] = (o.saldo != null ? o.saldo : 0);
  return r;
}
const JP_H = new Array(17).fill('h');
const GB_H = new Array(6).fill('h');

// reproduceerbare RNG (Mulberry32) — zelfde patroon als sibling-suite
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round2 = (x) => Math.round(x * 100) / 100;
const randBedrag = (r) => round2(r() * 5000 + 1);

describe('I₁ — Debit/Credit Balans per journaalpost (echte verifier)', () => {
  const reks = ['1100', '1300', '8000', '4000'];
  test('volledige journaalposten (beide benen + eindig bedrag) → geldig (30 random)', () => {
    const r = rng(11);
    for (let t = 0; t < 30; t++) {
      const jp = [JP_H];
      const n = 3 + Math.floor(r() * 8);
      for (let k = 0; k < n; k++) {
        const d = reks[Math.floor(r() * reks.length)];
        let c = reks[Math.floor(r() * reks.length)]; if (c === d) c = reks[(reks.indexOf(d) + 1) % reks.length];
        jp.push(jpRow({ debet: d, credit: c, bedrag: randBedrag(r) }));
      }
      const res = ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp }));
      expect(res.geldig).toBe(true);
    }
  });

  test('eenbenige boeking (lege credit-rekening) → schending I1 met tegenvoorbeeld', () => {
    const jp = [JP_H,
      jpRow({ id: 'BK1', debet: '1100', credit: '1300', bedrag: 100 }),
      jpRow({ id: 'BK2', debet: '1100', credit: '', bedrag: 50 }),  // credit ontbreekt
    ];
    const res = ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp }));
    expect(res.geldig).toBe(false);
    expect(res.code).toBe('I1');
    expect(res.tegenvoorbeeld.some((v) => v.rij === 3)).toBe(true);
  });

  test('lege debet-rekening → schending I1', () => {
    const jp = [JP_H, jpRow({ id: 'BK3', debet: '', credit: '1300', bedrag: 100 })];
    expect(ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp })).geldig).toBe(false);
  });

  test('niet-numeriek bedrag (NaN) → schending I1', () => {
    const jp = [JP_H, jpRow({ id: 'BK4', debet: '1100', credit: '1300', bedrag: 'abc' })];
    expect(ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp })).geldig).toBe(false);
  });

  test('CORRUPT/GESTORNEERD rijen worden geskipt (geen valse schending)', () => {
    const jp = [JP_H,
      jpRow({ id: 'BK5', debet: '', credit: '', bedrag: '', status: 'CORRUPT' }),
      jpRow({ id: 'BK6', debet: '1100', credit: '1300', bedrag: 100, status: 'Gevalideerd' }),
    ];
    expect(ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp })).geldig).toBe(true);
  });

  // REGRESSIE: de oude code telde hetzelfde bedrag op bij zowel totaalDebet als
  // totaalCredit → ΣDebet ≡ ΣCredit, een tautologie die élke eenbenige boeking
  // miste (vals-groen). De echte verifier moet 'm nu vangen.
  test('REGRESSIE tautologie: eenbenige boeking wordt NIET meer gemist', () => {
    const jp = [JP_H, jpRow({ id: 'X', debet: '1100', credit: '', bedrag: 999 })];
    expect(ctx._bewijs_I1_debitCreditBalans_(mockSs({ Journaalposten: jp })).geldig).toBe(false);
  });
});

describe('I₂ — Grootboeksaldo consistent (echte verifier)', () => {
  const reks = ['1100', '1300', '8000'];
  function bouw(r) {
    const verwacht = {}; const jp = [JP_H];
    const n = 5 + Math.floor(r() * 10);
    for (let k = 0; k < n; k++) {
      const d = reks[Math.floor(r() * reks.length)];
      let c = reks[Math.floor(r() * reks.length)]; if (c === d) c = reks[(reks.indexOf(d) + 1) % reks.length];
      const bedrag = randBedrag(r);
      verwacht[d] = (verwacht[d] || 0) + bedrag; verwacht[c] = (verwacht[c] || 0) - bedrag;
      jp.push(jpRow({ debet: d, credit: c, bedrag: bedrag }));
    }
    return { verwacht, jp };
  }
  test('consistente staat → geldig (30 random scenario\'s)', () => {
    const r = rng(101);
    for (let t = 0; t < 30; t++) {
      const { verwacht, jp } = bouw(r);
      const gb = [GB_H].concat(reks.map((c) => gbRow({ code: c, saldo: round2(verwacht[c] || 0) })));
      const res = ctx._bewijs_I2_grootboekConsistent_(mockSs({ Journaalposten: jp, Grootboekschema: gb }));
      expect(res.geldig).toBe(true);
    }
  });
  test('gecorrumpeerd grootboeksaldo → schending I2 gedetecteerd', () => {
    const r = rng(202);
    for (let t = 0; t < 30; t++) {
      const { verwacht, jp } = bouw(r);
      const kapot = reks[Math.floor(r() * reks.length)];
      const gb = [GB_H].concat(reks.map((c) =>
        gbRow({ code: c, saldo: round2((verwacht[c] || 0) + (c === kapot ? 50 + r() * 100 : 0)) })));
      const res = ctx._bewijs_I2_grootboekConsistent_(mockSs({ Journaalposten: jp, Grootboekschema: gb }));
      expect(res.geldig).toBe(false);
      expect(res.code).toBe('I2');
      expect(res.tegenvoorbeeld.some((d) => d.rek === kapot)).toBe(true);
    }
  });

  // REGRESSIE (F-ACC-165, gevonden door cross-pr-regressie): een storno is een
  // origineel + een aparte tegenrij die elkaar in het grootboek opheffen (netto
  // 0). I2 telt journaalposten op tot `verwacht` en vergelijkt met het
  // grootboeksaldo, MAAR skipt status==='GESTORNEERD' (FormeelBewijs.gs:196).
  // Stempel je het origineel GESTORNEERD (de teruggedraaide fix) terwijl de
  // tegenrij 'Gevalideerd' blijft, dan valt het origineel uit `verwacht` maar
  // niet uit het grootboeksaldo → I2 wijkt af → "formeel bewijs geschonden" bij
  // ÉLKE storno. Deze test zou die regressie hebben gevangen.
  describe('storno-paar breekt I2 niet (regressie F-ACC-165)', () => {
    const paar = (origStatus) => [JP_H,
      jpRow({ id: 'BK7', debet: '1100', credit: '1300', bedrag: 100, status: origStatus }),
      jpRow({ id: 'BK8', debet: '1300', credit: '1100', bedrag: 100, status: 'Gevalideerd' }), // storno-tegenrij
    ];
    // Grootboek telt beide rijen (geen status-filter) → netto 0 op beide.
    const gbNul = [GB_H, gbRow({ code: '1100', saldo: 0 }), gbRow({ code: '1300', saldo: 0 })];

    test('origineel met normale status → I2 geldig (origineel + storno netto 0)', () => {
      const res = ctx._bewijs_I2_grootboekConsistent_(mockSs({ Journaalposten: paar('Gevalideerd'), Grootboekschema: gbNul }));
      expect(res.geldig).toBe(true);
    });

    test('RATEL: origineel GESTORNEERD-gestempeld → I2 faalt (waarom F-ACC-165 is teruggedraaid)', () => {
      const res = ctx._bewijs_I2_grootboekConsistent_(mockSs({ Journaalposten: paar('GESTORNEERD'), Grootboekschema: gbNul }));
      expect(res.geldig).toBe(false);   // origineel geskipt, tegenrij niet → verwacht ≠ grootboek
    });
  });
});

describe('I₃ — Balans-wet Activa = Passiva (echte verifier)', () => {
  function activa(r) { const n = 1 + Math.floor(r() * 4); const a = []; for (let i = 0; i < n; i++) a.push(randBedrag(r)); return a; }
  test('balancerende balans → geldig (30 random), W&V-rijen genegeerd', () => {
    const r = rng(303);
    for (let t = 0; t < 30; t++) {
      const a = activa(r); const tot = a.reduce((s, x) => s + x, 0);
      const gb = [GB_H];
      a.forEach((x, i) => gb.push(gbRow({ code: '10' + i, type: 'Actief', bw: 'Balans', saldo: x })));
      gb.push(gbRow({ code: '2000', type: 'Passief', bw: 'Balans', saldo: tot }));
      gb.push(gbRow({ code: '8000', type: 'Actief', bw: 'WenV', saldo: randBedrag(r) })); // ruis: moet genegeerd
      const res = ctx._bewijs_I3_balansWet_(mockSs({ Grootboekschema: gb }));
      expect(res.geldig).toBe(true);
    }
  });
  test('niet-balancerend (Δ>€0,05) → schending I3', () => {
    const r = rng(404);
    for (let t = 0; t < 30; t++) {
      const a = activa(r); const tot = a.reduce((s, x) => s + x, 0);
      const gb = [GB_H];
      a.forEach((x, i) => gb.push(gbRow({ code: '10' + i, type: 'Actief', bw: 'Balans', saldo: x })));
      gb.push(gbRow({ code: '2000', type: 'Passief', bw: 'Balans', saldo: tot + (1 + r() * 100) }));
      const res = ctx._bewijs_I3_balansWet_(mockSs({ Grootboekschema: gb }));
      expect(res.geldig).toBe(false);
      expect(res.code).toBe('I3');
    }
  });
});

describe('I₅ — BTW-aangifte sluitend (echte verifier, berekenBtwAangifte_ gemockt)', () => {
  const basis = { r1a_btw: 0, r1b_btw: 0, r1c_btw: 0, r1e_btw: 0, r4a_btw: 0, r5a: 0, r5b: 0, r5d: 0 };
  const mockAangifte = (o) => { ctx.berekenBtwAangifte_ = () => Object.assign({}, basis, o); };
  test('sluitende aangifte (r5a=Σrubrieken, r5d=r5a−r5b) → geldig (20 random)', () => {
    const r = rng(505);
    for (let t = 0; t < 20; t++) {
      const r1a = randBedrag(r), r1b = randBedrag(r), r1e = randBedrag(r), r4a = randBedrag(r), r5b = randBedrag(r);
      const r5a = round2(r1a + r1b + r1e + r4a);
      mockAangifte({ r1a_btw: r1a, r1b_btw: r1b, r1e_btw: r1e, r4a_btw: r4a, r5a: r5a, r5b: r5b, r5d: round2(r5a - r5b) });
      expect(ctx._bewijs_I5_btwAangifteSluitend_(mockSs({})).geldig).toBe(true);
    }
  });
  test('r5a ≠ Σrubrieken → schending I5', () => {
    mockAangifte({ r1a_btw: 100, r1b_btw: 50, r5a: 160, r5b: 0, r5d: 160 }); // r5a moet 150 zijn
    const res = ctx._bewijs_I5_btwAangifteSluitend_(mockSs({}));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I5');
  });
  test('r5d ≠ r5a − r5b → schending I5', () => {
    mockAangifte({ r1a_btw: 200, r5a: 200, r5b: 30, r5d: 180 }); // moet 170 zijn
    const res = ctx._bewijs_I5_btwAangifteSluitend_(mockSs({}));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I5');
  });
  test('VALS-GROEN-FIX: belaste grondslag (1a) maar €0 BTW → schending (de som-identiteit zou dit missen)', () => {
    // r5a=0=Σ → de pure identiteit zegt "sluitend ✓"; de onafhankelijke check vangt
    // de handmatig-op-€0-gezette factuur-BTW (onder-aangifte).
    mockAangifte({ r1a_grondslag: 100, r1a_btw: 0, r5a: 0, r5b: 0, r5d: 0 });
    const res = ctx._bewijs_I5_btwAangifteSluitend_(mockSs({}));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I5');
  });
  test('belaste grondslag MET correcte BTW → geldig (geen vals alarm)', () => {
    mockAangifte({ r1a_grondslag: 100, r1a_btw: 21, r5a: 21, r5b: 0, r5d: 21 });
    expect(ctx._bewijs_I5_btwAangifteSluitend_(mockSs({})).geldig).toBe(true);
  });
});

describe('I₈ — Afgesloten periode immutability (echte verifier)', () => {
  const van = new Date(2025, 0, 1), tot = new Date(2025, 11, 31, 23, 59, 59), geslotenOp = new Date(2026, 1, 1);
  beforeAll(() => { ctx._leesGeslotenPeriodes_ = () => [{ van: van, tot: tot, geslotenOp: geslotenOp, label: '2025' }]; });
  test('boeking in periode maar aangemaakt vóór sluiting + boeking buiten periode → geldig', () => {
    const jp = [JP_H,
      jpRow({ id: 'A', datum: new Date(2025, 5, 1), aangemaakt: new Date(2025, 5, 1) }),   // in periode, tijdig
      jpRow({ id: 'B', datum: new Date(2026, 5, 1), aangemaakt: new Date(2026, 5, 2) }),   // buiten periode
    ];
    expect(ctx._bewijs_I8_afgeslotenPeriode_(mockSs({ Journaalposten: jp })).geldig).toBe(true);
  });
  test('boeking met datum in periode én aangemaakt ná sluiting → schending I8', () => {
    const jp = [JP_H,
      jpRow({ id: 'C', datum: new Date(2025, 5, 1), aangemaakt: new Date(2026, 2, 1) }),   // achteraf ingeboekt
    ];
    const res = ctx._bewijs_I8_afgeslotenPeriode_(mockSs({ Journaalposten: jp }));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I8');
  });
  test('VALS-GROEN-FIX (A-339): boeking in gesloten periode ZONDER aanmaak-timestamp → schending (niet stil geldig)', () => {
    // maakJournaalpost_ zet de timestamp altijd; een rij eronder kwam buiten de
    // guard om (handmatige edit/import) en is dus verdacht. Voorheen werd-ie stil
    // overgeslagen → I8 vals-groen.
    const jp = [JP_H, jpRow({ id: 'D', datum: new Date(2025, 5, 1) })];  // geen aangemaakt
    const res = ctx._bewijs_I8_afgeslotenPeriode_(mockSs({ Journaalposten: jp }));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I8');
  });
});

describe('I₉ — Leaf-only boekingen (echte verifier)', () => {
  // F-ACC-330: I₉ spiegelt nu valideerJournaalpostBalans_.purePArents
  // (0100/0200/0300) i.p.v. een numerieke "eindigt-op-000"-heuristiek. De oude
  // test borgde de bug: ze claimde dat boeken op 1000 (Voorraden — een gewone
  // leaf) een schending was. Dat is fout; alleen de categorie-headers zijn dat.
  const gb = [GB_H, gbRow({ code: '1000' }), gbRow({ code: '1100' }), gbRow({ code: '4000' }),
    gbRow({ code: '4100' }), gbRow({ code: '4110' }), gbRow({ code: '8000' })];

  test('boekingen op gewone leaves (incl. 1000, 8000) → geldig', () => {
    const jp = [JP_H,
      jpRow({ debet: '1000', credit: '8000', bedrag: 100 }),
      jpRow({ debet: '1100', credit: '8000', bedrag: 50 }),
    ];
    expect(ctx._bewijs_I9_leafOnlyBoekingen_(mockSs({ Grootboekschema: gb, Journaalposten: jp })).geldig).toBe(true);
  });

  test('RATEL F-ACC-330: boeking op 4000 (Crediteuren-leaf) → geldig (was vals-rood)', () => {
    // 4000 wordt op élke inkoopfactuur geboekt; de oude heuristiek vlagde 'm als
    // "parent" van 4100/4110 → I₉ vals-rood op een correcte administratie.
    const jp = [JP_H, jpRow({ debet: '7990', credit: '4000', bedrag: 100 })];
    expect(ctx._bewijs_I9_leafOnlyBoekingen_(mockSs({ Grootboekschema: gb, Journaalposten: jp })).geldig).toBe(true);
  });

  test('ambigue-maar-postbare parents (1400/4100) → geldig (consistent met validator)', () => {
    const jp = [JP_H, jpRow({ debet: '1400', credit: '1100', bedrag: 21 }),
      jpRow({ debet: '1100', credit: '4100', bedrag: 21 })];
    expect(ctx._bewijs_I9_leafOnlyBoekingen_(mockSs({ Grootboekschema: gb, Journaalposten: jp })).geldig).toBe(true);
  });

  test('boeking op echte categorie-header (0100) → schending I9', () => {
    const jp = [JP_H, jpRow({ debet: '0100', credit: '8000', bedrag: 100 })];
    const res = ctx._bewijs_I9_leafOnlyBoekingen_(mockSs({ Grootboekschema: gb, Journaalposten: jp }));
    expect(res.geldig).toBe(false); expect(res.code).toBe('I9');
  });
});

// ── Drift-guard: I9 spiegelt de validator; de twee hardcoded lijsten mogen
//    niet stil uiteenlopen (cross-pr LAAG: het is een COPY, geen shared const) ──
describe('I₉ — pureParents == valideerJournaalpostBalans_.purePArents (geen drift)', () => {
  const codesUit = (src, naam) => {
    const m = src.match(new RegExp(naam + "\\s*=\\s*\\[([^\\]]*)\\]"));
    return m ? (m[1].match(/'[^']+'/g) || []).map((s) => s.replace(/'/g, '')).sort() : null;
  };
  const i9 = codesUit(fs.readFileSync(path.resolve(__dirname, '../../src/FormeelBewijs.gs'), 'utf8'), 'pureParents');
  const val = codesUit(fs.readFileSync(path.resolve(__dirname, '../../src/Invariants.gs'), 'utf8'), 'purePArents');

  test('beide lijsten zijn vindbaar', () => {
    expect(i9).not.toBeNull();
    expect(val).not.toBeNull();
  });
  test('I9 en de validator hanteren exact dezelfde niet-postbare parents', () => {
    expect(i9).toEqual(val);   // breidt iemand de validator uit, dan faalt dit tot I9 meegaat
  });
});

// ── De ratel: dit gat (verifier zonder property-test) mag niet heropenen ──
describe('Meta — invariant-dekkingsratel', () => {
  const dir = __dirname;
  const propBron = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  const titels = Array.from(propBron.matchAll(/describe\(\s*(['"`])([^'"`]+)\1/g)).map((m) => m[2]);
  const bron = fs.readFileSync(path.resolve(dir, '../../src/FormeelBewijs.gs'), 'utf8');
  const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  const isub = (n) => 'I' + String(n).split('').map((d) => SUB[+d]).join('');

  test('elk axioma I1..I10 heeft én een _bewijs_-functie én property-test-dekking', () => {
    const ongedekt = [];
    for (let i = 1; i <= 10; i++) {
      const heeftVerifier = new RegExp('function _bewijs_I' + i + '_').test(bron);
      const heeftTest = titels.some((t) => t.indexOf(isub(i) + ' ') === 0);
      if (!heeftVerifier || !heeftTest) {
        ongedekt.push(isub(i) + (heeftVerifier ? '' : ' [verifier ontbreekt]') + (heeftTest ? '' : ' [property-test ontbreekt]'));
      }
    }
    // Leeg = elk axioma is zowel afdwingbaar (verifier) als geborgd (test).
    expect(ongedekt).toEqual([]);
  });
});

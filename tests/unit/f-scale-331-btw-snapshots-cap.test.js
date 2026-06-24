/**
 * tests/unit/f-scale-331-btw-snapshots-cap.test.js
 *
 * RATEL (langlopend-onderhoud, S5): BTW_SNAPSHOTS groeide zonder cap in één
 * ScriptProperty (9KB-cap). Rond jaar 10-11 (kwartaal) / jaar 4 (maand)
 * overschrijdt het object die cap → props.setProperty throwt → snapshot belandt
 * stil in de catch → detecteerSuppletieMogelijk_ ziet de nieuwe periode niet →
 * een klant met een retroactieve correctie >€1.000 krijgt géén suppletie-signaal
 * → naheffing + boete. _capBtwSnapshots_ begrenst nu op de laatste 30 periodes.
 * De detector leest alleen huidig + vorig jaar, dus de relevante periodes blijven.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const ctx = createGasRuntime(['Config.gs', 'Utils.gs', 'BTW.gs']);

function maakSnaps(n) {
  const snaps = {};
  for (let i = 0; i < n; i++) {
    const jaar = 2020 + Math.floor(i / 4);
    const q = (i % 4) + 1;
    snaps[jaar + '_Q' + q] = { saldo: i, vastgelegdOp: new Date(2020, 0, 1 + i).toISOString() };
  }
  return snaps;
}

describe('F-SCALE-331 — _capBtwSnapshots_ begrenst BTW_SNAPSHOTS', () => {
  test('≤max → ongewijzigd', () => {
    const s = maakSnaps(10);
    ctx._capBtwSnapshots_(s, 30);
    expect(Object.keys(s).length).toBe(10);
  });

  test('>max → houdt exact de laatste `max` (op vastgelegdOp)', () => {
    const s = maakSnaps(40);
    ctx._capBtwSnapshots_(s, 30);
    expect(Object.keys(s).length).toBe(30);
  });

  test('de meest-recente periodes (die de suppletie-detector leest) blijven behouden', () => {
    const s = maakSnaps(40);   // 2020_Q1 .. 2029_Q4
    ctx._capBtwSnapshots_(s, 30);
    expect(s['2029_Q4']).toBeDefined();   // huidig jaar
    expect(s['2028_Q1']).toBeDefined();   // vorig jaar
    expect(s['2020_Q1']).toBeUndefined(); // oudste weg
  });

  test('JSON blijft ruim onder de 9KB-property-cap, ook na 50 jaar', () => {
    const s = maakSnaps(200);
    ctx._capBtwSnapshots_(s, 30);
    expect(JSON.stringify(s).length).toBeLessThan(9000);
  });

  test('robuust bij ontbrekende vastgelegdOp (legacy-entries sorteren als oudste)', () => {
    const s = maakSnaps(35);
    delete s[Object.keys(s)[0]].vastgelegdOp;   // bestaande legacy-entry zonder timestamp
    expect(() => ctx._capBtwSnapshots_(s, 30)).not.toThrow();
    expect(Object.keys(s).length).toBe(30);
  });

  test('wiring: sluitBtwPeriode roept _capBtwSnapshots_ aan vóór setProperty', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/BTW.gs'), 'utf8');
    const fn = src.slice(src.indexOf('function sluitBtwPeriode'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    const capIdx = body.indexOf('_capBtwSnapshots_(snaps');
    const setIdx = body.indexOf("setProperty('BTW_SNAPSHOTS'");
    expect(capIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(capIdx);   // cap vóór de write
  });
});

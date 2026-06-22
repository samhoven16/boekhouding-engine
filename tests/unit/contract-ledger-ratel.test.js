/**
 * tests/unit/contract-ledger-ratel.test.js
 *
 * CONTRACT-GUARD (sluit klasse 8 — "test borgt het verkeerde / vals-groen").
 * Het protocol eist: een BLOCKER/HOOG gaat pas naar GEBORGD/GESLOTEN mét een
 * regressietest die zónder de fix faalt. Deze test maakt dat MECHANISCH: hij
 * leest de closure-ledger en dwingt af dat élke gesloten BLOCKER/HOOG een
 * regressietest-bestand noemt dat ook echt bestaat. Een sluiting zonder ratel
 * (de vals-groen-klasse) laat CI falen — de discipline kan niet meer
 * verslappen via "vergeten test".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LEDGER = path.resolve(__dirname, '../../.claude/audit-ledger.md');
const ROOT = path.resolve(__dirname, '../../');
const src = fs.readFileSync(LEDGER, 'utf8');

// Een finding-rij begint met "| <ID> |" waar ID start met F-/N-/CYCLE.
function ledgerRijen() {
  return src.split('\n')
    .filter((l) => /^\|\s*(F-|N-|CYCLE)/.test(l))
    .map((l) => {
      const c = l.split('|').map((x) => x.trim());
      return { id: c[1], ernst: (c[4] || '').toUpperCase(), status: (c[7] || '').toUpperCase(), testCel: c[8] || '', raw: l };
    });
}

function testpaden(cel) {
  // Alle tests/…(.test).js paden uit de cel (kan er meerdere bevatten).
  return (cel.match(/tests\/[\w/.-]+\.test\.js/g) || []);
}

describe('CONTRACT — elke gesloten BLOCKER/HOOG heeft een bestaande ratel (klasse 8)', () => {
  const rijen = ledgerRijen();

  test('de ledger is leesbaar en bevat finding-rijen (sanity)', () => {
    expect(rijen.length).toBeGreaterThan(20);
  });

  test('GEEN gesloten BLOCKER/HOOG zonder bestaand regressietest-bestand', () => {
    const overtreders = [];
    rijen
      .filter((r) => /BLOKKER|BLOCKER|HOOG/.test(r.ernst))
      .filter((r) => /GEBORGD|GESLOTEN/.test(r.status))
      .forEach((r) => {
        const paden = testpaden(r.testCel);
        if (paden.length === 0) {
          overtreders.push(`${r.id}: geen testpad in kolom (ernst=${r.ernst})`);
          return;
        }
        paden.forEach((p) => {
          if (!fs.existsSync(path.join(ROOT, p))) {
            overtreders.push(`${r.id}: genoemde ratel ontbreekt → ${p}`);
          }
        });
      });
    expect(overtreders).toEqual([]); // leeg = klasse 8 gesloten
  });
});
